'use strict';

const P = require('bluebird');
const api = require('./api-util');
const common = require('./suggested-edits-common');

const CANDIDATE_QUERY_BASE = {
    action: 'query',
    generator: 'random',
    redirects: 1,
    grnnamespace: 0,
    grnlimit: 50,
    prop: 'pageprops|description'
};

const Tasks = {
    DESCRIPTION_ADDITION: 'missingdescriptions',
    DESCRIPTION_TRANSLATION: 'descriptiontranslations'
};

/**
 * Filter non-image files from an imageinfo query pages result map
 * @param {?Object} pages imageinfo query result page map
 * @return {!Object} pages with non-images filtered, or an empty object if pages is falsy
 */
function filterPages(pages) {
    return pages.filter(page => page.pageprops && !page.pageprops.disambiguation &&
        page.pageprops.wikibase_item && !page.description);
}

/**
 * Get unstructured image info and global usage data from the action API
 * @param {!Object} app the application object
 * @param {!Object} targetWikiLang target wiki language code
 * @return {!Promise}
 */
function getCandidates(app, targetWikiLang) {
    return api.mwApiGet(app, `${targetWikiLang}.wikipedia.org`, CANDIDATE_QUERY_BASE)
        .then(rsp => filterPages(rsp.body.query.pages));
}

/**
 * Request entity data from the MW API
 * @param {!Object} app the application object
 * @param {!Object} req the request object
 * @param {!Array} pages candidate page object map from MW API
 * @param {!string} targetWikiLang target wiki language code
 * @param {?string} sourceWikiLang target wiki language code
 * @return {!Promise} Promise resolving to the wbgetentities response
 */
function getEntityData(app, req, pages, targetWikiLang, sourceWikiLang = undefined) {
    let languages = req.params.target;
    let sitefilter = `${targetWikiLang}wiki`;
    if (req.params.source) {
        languages += `|${req.params.source}`;
    }
    if (sourceWikiLang) {
        sitefilter += `|${sourceWikiLang}wiki`;
    }
    return api.mwApiGet(app, req.params.domain, {
        action: 'wbgetentities',
        props: 'descriptions|labels|sitelinks',
        languages,
        sitefilter,
        ids: pages.map(p => p.pageprops.wikibase_item).join('|')
    });
}

/**
 * Builds the endpoint response
 * @param {!Object} app the application object
 * @param {!Object} req the request object
 * @param {!string} taskName task name to pass as the 'wetstask' parameter to the
 * wikimediaeditortaskssuggestions API module
 * @param {!Function} cond function to call to determine if a result should be included
 * @return {!Promise} promise resolving to the suggestions response
 */
function buildResponse(app, req, taskName, cond) {
    return P.join(
        common.getWikiLangForLangCode(app, req.params.target),
        common.getWikiLangForLangCode(app, req.params.source),
        (targetWikiLang, sourceWikiLang) => getCandidates(app, targetWikiLang)
        .then((pages) => getEntityData(app, req, pages, targetWikiLang, sourceWikiLang)
            .then((entityRsp) => {
                const entities = entityRsp.body.entities;
                pages.forEach((page) => {
                    // Object.assign(page, entities[page.pageprops.wikibase_item]);
                    page.wikibase_item = entities[page.pageprops.wikibase_item];
                    delete page.pageprops;
                });
                return pages.filter(page => !page.wikibase_item.descriptions[req.params.target] &&
                    page.wikibase_item.sitelinks[`${req.params.target}wiki`] &&
                    page.wikibase_item.labels[req.params.target] &&
                    (!req.params.source || (
                        page.wikibase_item.descriptions[req.params.source] &&
                        page.wikibase_item.sitelinks[`${req.params.source}wiki`] &&
                        page.wikibase_item.labels[req.params.source]
                    )));
            })));
}

module.exports = {
    Tasks,
    buildResponse
};
