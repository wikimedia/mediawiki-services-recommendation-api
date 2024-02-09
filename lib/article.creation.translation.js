'use strict';

const aUtils = require('./api-util');
const util = require('./util');

/**
 * Gets articles from the mw api
 *
 * @param {Object} app the application object
 * @param {string} domain the domain to query
 * @param {Object} params the query parameters
 * @return {Promise.<Object>} the resulting map of wikidata id to article title
 */
function getArticles(app, domain, params) {
    return aUtils.mwApiGet(app, domain, params)
    .then((response) => {
        if (Object.prototype.hasOwnProperty.call(response.body, 'error')) {
            throw new util.HTTPError({
                status: 500,
                type: 'internal_server_error',
                title: 'MediaWiki API error',
                detail: JSON.stringify(response.body)
            });
        }
        if (!Object.prototype.hasOwnProperty.call(response.body, 'query')) {
            throw new util.HTTPError({
                status: 404,
                type: 'not_found',
                title: 'no results found',
                detail: JSON.stringify(response.body)
            });
        }
        return Object.keys(response.body.query.pages)
        .reduce((accumulator, currentKey) => {
            const current = response.body.query.pages[currentKey];
            if (current.ns !== 0) {
                return accumulator;
            }
            if (!current.pageprops || !current.pageprops.wikibase_item) {
                return accumulator;
            }
            if (current.title.includes(':') ||
                current.title.includes('List') === 0) {
                return accumulator;
            }
            if ('langlinks' in current || 'disambiguation' in current.pageprops) {
                return accumulator;
            } else {
                accumulator.push({
                    wikidata_id: current.pageprops.wikibase_item,
                    title: current.title,
                    sitelink_count: current.langlinkscount ? current.langlinkscount + 1 : 1
                });
                return accumulator;
            }
        }, []);
    });
}

/**
 * Gets articles most closely related to seed
 *
 * @param {Object} app the application object
 * @param {string} source the source language code
 * @param {string} target the target language code
 * @param {string} projectDomain the project domain
 * @param {string} seed the seed to search by
 * @return {Promise.<Object>}
 */
function getArticlesBySeed(app, source, target, projectDomain, seed) {
    const domain = `${ source }.${ projectDomain }`;
    const parameters = {
        format: 'json',
        action: 'query',
        prop: 'pageprops|langlinks|langlinkscount',
        ppprop: 'wikibase_item|disambiguation',
        lllang: target,
        lllimit: 500,
        generator: 'search',
        gsrlimit: 500,
        gsrsearch: `morelike:${ seed }`
    };

    return getArticles(app, domain, parameters);
}

/**
 * Gets the most popular articles in source wikipedia
 *
 * @param {Object} app the application object
 * @param {string} source the source language code
 * @param {string} target the target language code
 * @param {string} projectDomain the project domain
 * @return {Promise.<Object>}
 */
function getArticlesByPageviews(app, source, target, projectDomain) {
    const domain = `${ source }.${ projectDomain }`;
    const parameters = {
        format: 'json',
        action: 'query',
        prop: 'pageprops|langlinks|langlinkscount',
        ppprop: 'wikibase_item|disambiguation',
        generator: 'mostviewed',
        lllang: target,
        lllimit: 500,
        gpvimlimit: 500
    };
    return getArticles(app, domain, parameters);
}

/**
 * Recommends articles in source to translate to target
 *
 * @param {Object} app the application object
 * @param {string} source the source language code
 * @param {string} target the target language code
 * @param {string} projectDomain the project domain
 * @param {string} [seed=null] the seed to search by, if any
 * @return {Promise.<Object[]>}
 */
function recommend(app, source, target, projectDomain, seed) {
    let candidates;
    if (seed) {
        candidates = getArticlesBySeed(app, source, target, projectDomain, seed);
    } else {
        candidates = getArticlesByPageviews(app, source, target, projectDomain);
    }
    return candidates
    .then((candidates) => {
        return candidates.sort((a, b) => {
            return b.sitelink_count - a.sitelink_count;
        });
    });
}

module.exports = {
    recommend
};
