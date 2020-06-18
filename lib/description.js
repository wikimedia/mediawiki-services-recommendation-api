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
    prop: 'pageprops|description|info',
    inprop: 'protection'
};

/**
 * Convert a wiki language name to a wiki DB name. This is accomplished by replacing any hyphens
 * with underscores and appending 'wiki', except in the case of be-tarask, for which the DB name is
 * 'be_x_oldwiki' for historical reasons.
 * @param {!string} lang wiki language code
 * @return {!string} wiki DB name
 */
function wikiLangToDBName(lang) {
    switch (lang) {
        case 'be-tarask':
            return 'be_x_oldwiki';
        default:
            return `${lang.replace(/-/g, '_')}wiki`;
    }
}

function isBetaClusterRequest(req) {
    return req.params.domain.endsWith('.beta.wmflabs.org');
}

function hasPageProps(page) {
    return !!page.pageprops;
}

function isDisambiguationPage(page) {
    return !!page.pageprops.disambiguation;
}

function hasWikibaseItem(page) {
    return !!page.pageprops.wikibase_item;
}

function hasDescription(page) {
    return !!page.description;
}

function isPageProtected(page) {
    return !!(page.protection && page.protection.length);
}

function isWikibaseItemPageProtected(page) {
    return !!(page.wikibase_item.protection && page.wikibase_item.protection.length);
}

function wikibaseItemHasDescriptionInLang(page, lang) {
    return !!page.wikibase_item.descriptions[lang];
}

function wikibaseItemHasSiteLink(page, dbName) {
    return !!page.wikibase_item.sitelinks[dbName];
}

/**
 * Filter pages based on desired characteristics
 * @param {!Object} pages MW API query result pages
 * @return {!Object} filtered pages
 */
function filterPages(pages) {
    return pages.filter(page => {
        return hasPageProps(page) &&
            !isDisambiguationPage(page) &&
            hasWikibaseItem(page) &&
            !hasDescription(page) &&
            !isPageProtected(page);
        }
    );
}

/**
 * Get filtered list of suggestion candidates
 * @param {!Object} app the application object
 * @param {!Object} req the request object
 * @param {!Object} targetWikiLang target wiki language code
 * @return {!Promise}
 */
function getCandidates(app, req, targetWikiLang) {
    const domain = isBetaClusterRequest(req) ?
        `${targetWikiLang}.wikipedia.beta.wmflabs.org` :
        `${targetWikiLang}.wikipedia.org`;
    return api.mwApiGet(app, domain, CANDIDATE_QUERY_BASE)
        .then(rsp => filterPages((rsp.body && rsp.body.query && rsp.body.query.pages) || []));
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
function getEntityData(app, req, pages, targetWikiLang, sourceWikiLang) {
    let languages = req.params.target;
    let sitefilter = wikiLangToDBName(targetWikiLang);
    if (req.params.source) {
        languages += `|${req.params.source}`;
    }
    if (sourceWikiLang) {
        sitefilter += `|${wikiLangToDBName(sourceWikiLang)}`;
    }
    return api.mwApiGet(app, req.params.domain, {
        action: 'wbgetentities',
        props: 'descriptions|labels|sitelinks',
        languages,
        sitefilter,
        ids: pages.map(p => p.pageprops.wikibase_item).join('|')
    });
}

function getWikidataPageProtections(app, domain, pages) {
    return api.mwApiGet(app, domain, {
        action: 'query',
        prop: 'info',
        inprop: 'protection',
        titles: pages.map(page => page.pageprops.wikibase_item).join('|')
    }).then(rsp => (rsp.body && rsp.body.query && rsp.body.query.pages) || []);
}

function isValidResultForAddition(page, targetLang, targetWikiLang) {
    return wikibaseItemHasSiteLink(page, wikiLangToDBName(targetWikiLang)) &&
        !wikibaseItemHasDescriptionInLang(page, targetLang);
}

function isValidResultForTranslation(page, targetLang, targetWikiLang, sourceLang, sourceWikiLang) {
    return wikibaseItemHasSiteLink(page, wikiLangToDBName(targetWikiLang)) &&
        wikibaseItemHasSiteLink(page, wikiLangToDBName(sourceWikiLang)) &&
        !wikibaseItemHasDescriptionInLang(page, targetLang) &&
        wikibaseItemHasDescriptionInLang(page, sourceLang);
}

/**
 * Builds the response from API results
 * @param {!Array} wikiPages
 * @param {!Array} entities
 * @param {!Array} wikidataPages
 * @param {!Function} isValidResult
 * @param {!string} targetLang
 * @param {!string} targetWikiLang
 * @param {?string} sourceLang
 * @param {?string} sourceWikiLang
 * @return {!Array}
 */
function buildResponse(
    wikiPages,
    entities,
    wikidataPages,
    isValidResult,
    targetLang,
    targetWikiLang,
    sourceLang,
    sourceWikiLang
) {
    if (!(wikiPages && wikiPages.length &&
        entities && Object.keys(entities).length &&
        wikidataPages && wikidataPages.length)) {
        return [];
    }
    wikiPages.forEach((page) => {
        const wikidataPage = wikidataPages.find(p =>
            p.title === page.pageprops.wikibase_item);
        page.wikibase_item = entities[page.pageprops.wikibase_item];
        page.wikibase_item.protection = wikidataPage.protection;
        delete page.pageprops;
    });
    return wikiPages.filter((page) => {
        return !isWikibaseItemPageProtected(page) &&
            isValidResult(page, targetLang, targetWikiLang, sourceLang, sourceWikiLang);
    });
}

/**
 * Fetches and builds the endpoint response
 * @param {!Object} app the application object
 * @param {!Object} req the request object
 * @param {!Function} isValidResult
 * @return {!Promise} promise resolving to the suggestions response
 */
function generateResults(app, req, isValidResult) {
    return P.join(
        common.getWikiLangForLangCode(app, req, req.params.target),
        common.getWikiLangForLangCode(app, req, req.params.source),
        (targetWikiLang, sourceWikiLang) => getCandidates(app, req, targetWikiLang)
        .then((pages) => P.join(
            getEntityData(app, req, pages, targetWikiLang, sourceWikiLang),
            getWikidataPageProtections(app, req.params.domain, pages),
            (entityData, wikidataPages) => buildResponse(
                pages,
                entityData.body.entities,
                wikidataPages,
                isValidResult,
                req.params.target,
                targetWikiLang,
                req.params.source,
                sourceWikiLang
            )
            )
        )
    );
}

module.exports = {
    generateResults,
    isValidResultForAddition,
    isValidResultForTranslation
};
