'use strict';

const aUtils = require('./api-util');
const sUtil = require('./util');
const Template = require('swagger-router').Template;


function setupTemplates(app) {
    app.conf.queries.seed_tpl = new Template(app.conf.queries.seed);
    app.conf.queries.pageviews_tpl = new Template(app.conf.queries.pageviews);
}


function getArticles(app, domain, params) {
    return aUtils.mwApiGet(app, domain, params)
        .then((response) => {
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
            throw new sUtil.HTTPError({
                status: 500,
                type: 'api_error',
                title: 'error parsing MW API response',
                detail: e.message
            });
        });
}


function getArticlesBySeed(app, source, seed) {
    const seedQuery = app.conf.queries.seed_tpl.expand({
        params: {
            source,
            seed
        },
    });
    return getArticles(app, seedQuery.domain, seedQuery.parameters);
}


function getArticlesByPageviews(app, source) {
    const pageviewsQuery = app.conf.queries.pageviews_tpl.expand({
        params: {
            source
        }
    });
    return getArticles(app, pageviewsQuery.domain, pageviewsQuery.parameters);
}


function filter(app, source, target, candidates) {
    const items = Object.keys(candidates).map((item) => {
        return `wd:${item}`;
    }).join(' ');

    const query = `SELECT ?item WHERE {
                     VALUES ?item { ${items} }
                     FILTER NOT EXISTS {
                       ?article schema:about ?item .
                       ?article schema:isPartOf <https://${target}.wikipedia.org/> .
                     }
                   }`;

    return aUtils.wdqsApiGet(query)
        .then((response) => {
            return response.body.results.bindings.map((item) => {
                return {
                    wikidata_id: item.item.value.split('/').pop(),
                    title: candidates[item.item.value.split('/').pop()]
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
 * @return {{source: *, target: *, seed: *, candidates: *}}
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
            return filter(app, source, target, candidates);
        });
}

module.exports = {
    recommend,
    setupTemplates
};
