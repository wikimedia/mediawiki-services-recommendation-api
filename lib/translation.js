'use strict';

const aUtils = require('./api-util');
const sUtil = require('./util');
const Template = require('swagger-router').Template;


function setupTemplates(app) {
    app.conf.queries.seed_tpl = new Template(app.conf.queries.seed);
    app.conf.queries.pageviews_tpl = new Template(app.conf.queries.pageviews);
    app.conf.queries.article_tpl = new Template(app.conf.queries.article);
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
                throw new sUtil.HTTPError({
                    status: 404,
                    type: 'not_found',
                    title: 'no results found',
                    detail: JSON.stringify(response.body)
                });
            }
            return Object.values(response.body.query.pages)
                .reduce((accumulator, current) => {
                    if (current.ns !== 0) {
                        return accumulator;
                    }
                    if (!current.pageprops || !current.pageprops.wikibase_item) {
                        return accumulator;
                    }
                    if (current.title.indexOf(':') !== -1 || current.title.indexOf('List') === 0) {
                        return accumulator;
                    }
                    accumulator[current.pageprops.wikibase_item] = current.title;
                    return accumulator;
                }, {});
        })
        .catch((e) => {
            if (e instanceof sUtil.HTTPError) {
                throw e;
            }
            throw new sUtil.HTTPError({
                status: 500,
                type: 'api_error',
                title: 'error parsing MW API response',
                detail: e.message
            });
        });
}

/**
 * Gets articles most closely related to seed
 * @param {Object} app the application object
 * @param {string} source the source language code
 * @param {string} seed the seed to search by
 * @return {Promise.<Object>}
 */
function getArticlesBySeed(app, source, seed) {
    const articleQuery = app.conf.queries.article_tpl.expand({
        params: {
            source,
            seed
        }
    });

    return getArticles(app, articleQuery.domain, articleQuery.parameters)
        .then((result) => {
            const seedWikidataId = Object.keys(result)[0];
            const seedTitle = result[seedWikidataId];
            const seedQuery = app.conf.queries.seed_tpl.expand({
                params: {
                    source,
                    seed: seedTitle
                },
            });
            return getArticles(app, seedQuery.domain, seedQuery.parameters)
                .then((result) => {
                    result[seedWikidataId] = seedTitle;
                    return result;
                });
        });
}

/**
 * Gets the most popular articles in source wikipedia
 * @param {Object} app the application object
 * @param {string} source the source language code
 * @return {Promise.<Object>}
 */
function getArticlesByPageviews(app, source) {
    const pageviewsQuery = app.conf.queries.pageviews_tpl.expand({
        params: {
            source
        }
    });
    return getArticles(app, pageviewsQuery.domain, pageviewsQuery.parameters);
}

/**
 * Filters candidates by removing disambiguation pages and articles that already exist in target
 * @param {Object} app the application object
 * @param {string} source the source language code
 * @param {string} target the target language code
 * @param {Object} candidates object with wikidata ids as keys and article titles as values
 * @return {Promise.<Object[]>}
 */
function filter(app, source, target, candidates) {
    const items = Object.keys(candidates).map((item) => {
        return `wd:${item}`;
    }).join(' ');

    const query = `SELECT ?item (COUNT(?sitelink) as ?count) WHERE {
                     VALUES ?item { ${items} }
                     FILTER NOT EXISTS { ?item wdt:P31 wd:Q4167410 . }
                     OPTIONAL { ?sitelink schema:about ?item }
                     FILTER NOT EXISTS {
                       ?article schema:about ?item .
                       ?article schema:isPartOf <https://${target}.wikipedia.org/> .
                     }
                   } GROUP BY ?item`;

    return aUtils.wdqsApiGet(query)
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
 * @param {string} [seed=null] the seed to search by, if any
 * @return {Promise.<Object[]>}
 */
function recommend(app, source, target, seed) {
    let candidates;
    if (seed !== undefined) {
        candidates = getArticlesBySeed(app, source, seed);
    } else {
        candidates = getArticlesByPageviews(app, source);
    }
    return candidates
        .then((candidates) => {
            return filter(app, source, target, candidates)
                .then((result) => {
                    return result.sort((a, b) => {
                        return b.sitelink_count - a.sitelink_count;
                    });
                });
        });
}

module.exports = {
    recommend,
    setupTemplates
};
