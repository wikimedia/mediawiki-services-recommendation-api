'use strict';

const BBPromise = require('bluebird');
const mysql = require('mysql');
const util = require('../lib/util');
const aUtil = require('../lib/article.creation.morelike');

const router = util.router();
let app;

function mwApiFailure(e) {
    app.logger.log('error/article.creation.morelike', { e });
    return BBPromise.reject(new util.HTTPError({
        status: 503,
        healthCheckStatus: 404,  // extra flag to reduce false alarms
        message: 'The MediaWiki API failed. Please try again later.'
    }));
}

/**
 * GET /{seed}
 * Gets missing articles (from the current wiki) similar to seed.
 *
 * Similar articles are retrieved using a CirrusSearch morelike query.
 * Articles are prioritized using translation recommendations
 * predictions.
 */
router.get('/:seed', (req, res) => {
    const domain = req.params.domain;
    const domainParts = domain.split('.');
    const language = domainParts[0];  // e.g. en
    const projectDomain = domainParts.splice(1).join('.');

    let sourceLanguages = [];
    let availableModels = [];

    if (app.conf.article && app.conf.article.translation_models) {
        sourceLanguages = app.conf.article.translation_models[language] || [];
        availableModels = Object.keys(app.conf.article.translation_models);
    }

    if (!sourceLanguages.length) {
        app.logger.log('error/article.creation.morelike',
            `Article translation model for "${ language }" doesn't exist.`);

        const errorObject = new util.HTTPError({
            status: 501,
            message: `'morelike' article recommendations are not enabled on
                this Wikipedia. Currently enabled on:
                ${ availableModels.join(', ') || 'none' }.`
        });
        return BBPromise.reject(errorObject);
    }

    return aUtil.getWikidataId(app, domain, req.params.seed)
        .catch(mwApiFailure)
        .then((id) => {
            if (!id) {
                return BBPromise.reject(new util.HTTPError({
                    status: 404,
                    message: 'No such article found.'
                }));
            }
            return aUtil.getSimilarArticles(app, projectDomain, id, sourceLanguages)
                .catch(mwApiFailure)
                .then((ids) => {
                    if (!ids.length) {
                        return BBPromise.reject(new util.HTTPError({
                            status: 404,
                            message: 'No similar articles to seed found.'
                        }));
                    }
                    return aUtil.getMissingArticles(app, projectDomain, ids, language)
                        .catch(mwApiFailure)
                        .then((ids) => {
                            if (ids === null) {
                                return  mwApiFailure();
                            } else if (!ids.length) {
                                return BBPromise.reject(new util.HTTPError({
                                    status: 404,
                                    message: 'All similar articles have been created.'
                                }));
                            } else {
                                return aUtil.getArticleNormalizedRanksFromDb(
                                    app, ids, language
                                ).then((results) => {
                                    res.json(results);
                                }).catch((error) => {
                                    return BBPromise.reject(new util.HTTPError({
                                        status: 503,
                                        message: 'Cannot retrieve normalized ranks from' +
                                            ' the database. Please try again later.'
                                    }));
                                });
                            }
                        });
                });
        });
});

module.exports = function (appObj) {
    app = appObj;

    const mysqlConf = app.conf.mysql_conn;
    const hostPort = mysqlConf.host.split(':');
    app.mysqlPool = mysql.createPool({
        connectionLimit: mysqlConf.limit,
        host: hostPort[0],
        port: hostPort[1] || 3306,
        user: mysqlConf.user,
        password: mysqlConf.pass,
        database: mysqlConf.name
    });

    return {
        path: '/article/creation/morelike',
        api_version: 1,
        router
    };
};
