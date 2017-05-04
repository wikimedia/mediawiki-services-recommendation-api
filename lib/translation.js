'use strict';

const aUtils = require('./api-util');
const Template = require('swagger-router').Template;


function getArticlesByPageviews(app, source) {
    const date = new Date();
    date.setDate(date.getDate() - app.conf.queries.most_popular.days);
    const year = date.getFullYear();
    const month = `0${date.getMonth() + 1}`.slice(-2);
    const day = `0${date.getDate()}`.slice(-2);
    const path = new Template(app.conf.queries.most_popular.path).expand({
        source,
        year,
        month,
        day
    });
    return aUtils.restApiGet(app, app.conf.queries.most_popular.domain, path)
        .then((response) => {
            return response.body.items[0].articles.map((item) => {
                return {
                    title: item.article,
                    pageviews: item.views
                };
            });
        });
}

function getArticlesBySeed(app, source, seed) {
    const apiQuery = {
        format: 'json',
        action: 'query',
        prop: 'pageviews',
        pvipdays: 15,
        generator: 'search',
        gsrlimit: 500,
        gsrsearch: `morelike:${seed}`,
        gsrprop: ''
    };
    return aUtils.mwApiGet(app, `${source}.wikipedia.org`, apiQuery)
        .then((response) => {
            return Object.values(response.body.query.pages).map((item) => {
                return {
                    title: item.title,
                    pageviews: Object.values(item.pageviews || {}).reduce((a, b) => a + b, 0)
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
    return candidates;
}

module.exports = {
    recommend
};
