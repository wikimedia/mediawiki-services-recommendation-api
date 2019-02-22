'use strict';

const preq = require('preq');
const aUtils = require('./api-util');
const util = require('./util');

/**
 * Calls the WDQS API with the supplied query in its body
 * @param {Object} app the application object
 * @param {string} query the sparql query to run
 * @return {Promise} a promise resolving as the response object from the MW API
 */
function wdqsApiGet(app, query) {
    const request = app.wdqsapi_tpl.expand({
        request: {
            headers: { 'user-agent': app.conf.user_agent },
            query
        }
    });

    return preq(request);
}

/**
 * Gets articles from the mw api
 * @param {Object} app the application object
 * @param {string} domain the domain to query
 * @param {Object} params the query parameters
 * @return {Promise.<Object>} the resulting map of wikidata id to article title
 */
function getArticles(app, domain, params) {
    return aUtils.mwApiGet(app, domain, params)
    .then((response) => {
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
            if (current.title.indexOf(':') !== -1 ||
                current.title.indexOf('List') === 0) {
                return accumulator;
            }
            accumulator[current.pageprops.wikibase_item] = current.title;
            return accumulator;
        }, {});
    });
}

/**
 * Gets articles most closely related to seed
 * @param {Object} app the application object
 * @param {string} source the source language code
 * @param {string} projectDomain the project domain
 * @param {string} seed the seed to search by
 * @return {Promise.<Object>}
 */
function getArticlesBySeed(app, source, projectDomain, seed) {
    const domain = `${source}.${projectDomain}`;
    const parameters = {
        format: 'json',
        action: 'query',
        prop: 'pageprops',
        ppprop: 'wikibase_item',
        generator: 'search',
        gsrlimit: 1,
        gsrsearch: seed,
        gsrprop: ''
    };

    // Map the seed to an article, and then use that article as a seed
    // to a morelike search
    return getArticles(app, domain, parameters)
    .then((articleQueryResult) => {
        const seedWikidataId = Object.keys(articleQueryResult)[0];
        const seedTitle = articleQueryResult[seedWikidataId];
        const domain = `${source}.${projectDomain}`;
        const seedQuery = app.queryTemplates.seed.expand({
            params: {
                seed: seedTitle
            }
        });
        return getArticles(app, domain, seedQuery.parameters)
        .then((morelikeResult) => {
            // Add the initial seed article to the morelike results
            morelikeResult[seedWikidataId] = seedTitle;
            return morelikeResult;
        });
    });
}

/**
 * Gets the most popular articles in source wikipedia
 * @param {Object} app the application object
 * @param {string} source the source language code
 * @param {string} projectDomain the project domain
 * @return {Promise.<Object>}
 */
function getArticlesByPageviews(app, source, projectDomain) {
    const domain = `${source}.${projectDomain}`;
    const parameters = {
        format: 'json',
        action: 'query',
        prop: 'pageprops',
        ppprop: 'wikibase_item',
        generator: 'mostviewed',
        gpvimlimit: 500
    };
    return getArticles(app, domain, parameters);
}

/**
 * Filters candidates by removing disambiguation pages and articles that
 * already exist in target
 * @param {Object} app the application object
 * @param {string} source the source language code
 * @param {string} target the target language code
 * @param {string} projectDomain the project domain
 * @param {Object} candidates object with wikidata ids as keys and
 * article titles as values
 * @return {Promise.<Object[]>}
 */
function filter(app, source, target, projectDomain, candidates) {
    const items = Object.keys(candidates).map((item) => {
        return `wd:${item}`;
    }).join(' ');

    const query = `SELECT ?item (COUNT(?sitelink) as ?count) WHERE {
                     VALUES ?item { ${items} }
                     FILTER NOT EXISTS { ?item wdt:P31 wd:Q4167410 . }
                     OPTIONAL { ?sitelink schema:about ?item }
                     FILTER NOT EXISTS {
                       ?article schema:about ?item .
                       ?article schema:isPartOf <https://${target}.${projectDomain}/> .
                     }
                   } GROUP BY ?item`;

    return wdqsApiGet(app, query)
    .then((response) => {
        return response.body.results.bindings.map((item) => {
            const wikidataId = item.item.value.split('/').pop();
            return {
                wikidata_id: wikidataId,
                title: candidates[wikidataId],
                sitelink_count: parseInt(item.count.value, 10)
            };
        });
    });
}

/**
 * Recommends articles in source to translate to target
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
        candidates = getArticlesBySeed(app, source, projectDomain, seed);
    } else {
        candidates = getArticlesByPageviews(app, source, projectDomain);
    }
    return candidates
    .then((candidates) => {
        return filter(app, source, target, projectDomain, candidates)
        .then((result) => {
            return result.sort((a, b) => {
                return b.sitelink_count - a.sitelink_count;
            });
        });
    });
}

module.exports = {
    recommend
};
