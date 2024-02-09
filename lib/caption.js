'use strict';

const _ = require('lodash');
const api = require('./api-util');
const common = require('./suggested-edits-common');

const CANDIDATE_QUERY_BASE = {
    action: 'query',
    formatversion: 1,
    generator: 'random',
    redirects: '',
    grnnamespace: 6,
    grnlimit: 50,
    prop: 'imageinfo|globalusage|info',
    inprop: 'protection',
    iiprop: 'timestamp|user|url|mime',
    iiurlwidth: 320,
    iilocalonly: '',
    gunamespace: 0,
    guprop: 'pageid'
};

/**
 * Consolidate data from a wbgetentities query into an image page map
 * Note: Presumes that each key of 'entities' exists in 'images'.
 *
 * @param {!Object} images page image response map from MW API
 * @param {?Object} entities wbgetentities response from MW API
 * @return {void}
 */
function consolidateImageData(images, entities) {
    Object.keys(entities || {}).forEach((entityId) => {
        const entity = entities[entityId];
        const pageId = entityId.slice(1);
        const image = images[pageId];
        image.structured = { captions: {} };
        Object.keys(entity.labels || {}).forEach((label) => {
            image.structured.captions[label] =
                entity.labels &&
                entity.labels[label] &&
                entity.labels[label].value;
        });
    });
}

/**
 * Filter non-images and protected pages from a page result map
 *
 * @param {?Object} pages imageinfo query result page map
 * @return {!Object} pages with non-images filtered, or an empty object if pages is falsy
 */
function filterPages(pages) {
    return Object.keys(pages || {}).reduce((acc, cur) => {
        const page = pages[cur];
        if (page.imageinfo &&
            page.imageinfo[0] &&
            page.imageinfo[0].mime &&
            page.imageinfo[0].mime.startsWith('image') &&
            !(page.protection && page.protection.length)) {
            acc[cur] = page;
        }
        return acc;
    }, {});
}

/**
 * Get structured media info from the wbgetentities action API module
 *
 * @param {!Object} app the application object
 * @param {!Object} req the request object
 * @param {!Object} images imageinfo query response map
 * @return {!Promise} promise resolving to wbgetentities action API response
 */
function getStructuredMediaInfo(app, req, images) {
    return api.mwApiGet(app, req.params.domain, {
        action: 'wbgetentities',
        props: 'labels',
        ids: Object.keys(images).map(pageId => `M${ pageId }`).join('|')
    });
}

/**
 * Get unstructured image info and global usage data from the action API
 *
 * @param {!Object} app the application object
 * @param {!Object} req the request object
 * @param {!string} targetWikiLang target wiki language code
 * @return {!Promise}
 */
function getCandidates(app, req, targetWikiLang) {
    return api.mwApiGet(app, req.params.domain, Object.assign(CANDIDATE_QUERY_BASE, {
        gusite: `${ targetWikiLang }wiki`
    }));
}

/**
 * Whether this image should be returned as a caption addition suggestion
 *
 * @param {!Object} image action API image page object
 * @param {!string} targetLang target wiki language code
 * @return {boolean}
 */
function isValidImageForAddition(image, targetLang) {
    return !image.structured.captions[targetLang];
}

/**
 * Whether this image should be returned as a caption translation suggestion
 *
 * @param {!Object} image action API image page object
 * @param {!string} targetLang target wiki language code
 * @param {!string} sourceLang target wiki language code
 * @return {boolean}
 */
function isValidImageForTranslation(image, targetLang, sourceLang) {
    return image.structured.captions[sourceLang] && !image.structured.captions[targetLang];
}

/**
 * GlobalUsage returns numeric page IDs as strings. This converts them to integers for consistency.
 *
 * @param {!Object} image image suggestion object
 */
function convertGlobalUsagePageIdsToInts(image) {
    image.globalusage.forEach((item) => {
        item.pageid = parseInt(item.pageid);
    });
}

/**
 * Build a single suggestion result object
 *
 * @param {!Object} image action API image page object
 * @param {!string} targetLang target wiki language code
 * @param {?string} sourceLang source wiki language code (for translations)
 * @return {!Object}
 */
function makeResult(image, targetLang, sourceLang) {
    convertGlobalUsagePageIdsToInts(image);
    return {
        pageid: image.pageid,
        ns: image.ns,
        title: image.title,
        mime: image.imageinfo[0].mime,
        structured: image.structured,
        globalusage: {
            [targetLang]: image.globalusage
        }
    };
}

/**
 * Build a set of suggestion results
 *
 * @param {!Object} images map of action API image page objects
 * @param {!Object} entities map of action API mediainfo entity objects
 * @param {!Function} isValidResult Function to call to determine if the image should be included
 * @param {!string} targetLang target wiki language code
 * @param {?string} sourceLang source wiki language code (for translations)
 * @return {!Array}
 */
function makeResults(images, entities, isValidResult, targetLang, sourceLang) {
    const results = [];
    consolidateImageData(images, entities);
    _.values(images).forEach((image) => {
        if (isValidResult(image, targetLang, sourceLang)) {
            results.push(makeResult(image, targetLang, sourceLang));
        }
    });
    return results;
}

/**
 * Builds the endpoint response
 *
 * @param {!Object} app the application object
 * @param {!Object} req the request object
 * @param {!Function} isValidResult function to call to determine if a result should be included
 * @return {!Promise} promise resolving to the suggestions response
 */
function buildResponse(app, req, isValidResult) {
    return common.getWikiLangForLangCode(app, req, req.params.target)
    .then(targetWikiLang => getCandidates(app, req, targetWikiLang)
    .then((rsp) => {
        const images = filterPages(rsp.body.query.pages);
        return getStructuredMediaInfo(app, req, images)
        .then((structuredRsp) => makeResults(
            images,
            structuredRsp.body.entities,
            isValidResult,
            req.params.target,
            req.params.source
        ));
    }));
}

module.exports = {
    buildResponse,
    isValidImageForAddition,
    isValidImageForTranslation
};
