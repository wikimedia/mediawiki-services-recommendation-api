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

const Tasks = {
    DESCRIPTION_ADDITION: 'missingdescriptions',
    DESCRIPTION_TRANSLATION: 'descriptiontranslations'
};

function isBetaClusterRequest(req) {
    return req.params.domain.endsWith('.beta.wmflabs.org');
}

/**
 * Filter pages based on desired characteristics
 * @param {!Object} pages MW API query result pages
 * @return {!Object} filtered pages
 */
function filterPages(pages) {
    return pages.filter(
        page => page.pageprops &&
        !page.pageprops.disambiguation &&
        page.pageprops.wikibase_item &&
        !page.description &&
        !(page.protection && page.protection.length)
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
        .then(rsp => filterPages(rsp.body.query.pages));
}

/**
 * Convert a wiki language name to a wiki DB name. This is accomplished by replacing any hyphens
 * with underscores and appending 'wiki', except in the case of be-tarask, for which the DB name is
 * 'be_x_oldwiki' for historical reasons.
 * @param {!string} lang wiki language code
 * @return {!string} wiki DB name
 */
function wikiLangToDBName(lang) {
    return lang === 'be-tarask' ? 'be_x_oldwiki' : `${lang.replace(/-/g, '_')}wiki`;
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

function getWikidataPageProtections(app, req, pages) {
    return api.mwApiGet(app, req.params.domain, {
        action: 'query',
        prop: 'info',
        inprop: 'protection',
        titles: pages.map(p => p.pageprops.wikibase_item).join('|')
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
        common.getWikiLangForLangCode(app, req, req.params.target),
        common.getWikiLangForLangCode(app, req, req.params.source),
        (targetWikiLang, sourceWikiLang) => getCandidates(app, req, targetWikiLang)
        .then((pages) => P.join(
            getEntityData(app, req, pages, targetWikiLang, sourceWikiLang),
            getWikidataPageProtections(app, req, pages),
            (entityData, wikidataPageQuery) => {
                const entities = entityData.body.entities;
                const wikidataPages = wikidataPageQuery.body.query.pages;
                pages.forEach((page) => {
                    const wikidataPage = wikidataPages.find(p =>
                        p.title === page.pageprops.wikibase_item);
                    page.wikibase_item = entities[page.pageprops.wikibase_item];
                    page.wikibase_item.protection = wikidataPage.protection;
                    delete page.pageprops;
                });
                return pages.filter((p) => {
                    return !(p.wikibase_item.protection && p.wikibase_item.protection.length) &&
                        !p.wikibase_item.descriptions[req.params.target] &&
                        p.wikibase_item.sitelinks[wikiLangToDBName(targetWikiLang)] &&
                        (!req.params.source || (
                            p.wikibase_item.descriptions[req.params.source] &&
                            p.wikibase_item.sitelinks[wikiLangToDBName(sourceWikiLang)]
                        ));
                });
            })));
}

module.exports = {
    Tasks,
    buildResponse
};
