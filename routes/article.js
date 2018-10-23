'use strict';

const BBPromise = require("bluebird");
const mysql = require('mysql');
const util = require('../lib/util');
const aUtil = require('../lib/article');
const sUtil = require('../lib/util');

/**
 * The main router object
 */
const router = util.router();

/**
 * The main application object reported when this module is require()d
 */
let app;

/**
 * GET /article/morelike/translation/{seed}
 * Gets missing articles (from the current wiki) similar to seed.
 *
 * Similar articles are retrieved using a CirrusSearch morelike query.
 * Articles are prioritized using translation recommendations
 * predictions.
 * @see https://github.com/wikimedia/research-translation-recommendation-predictions
 */
router.get('/morelike/translation/:seed', (req, res) => {
    const domain = req.params.domain;
    const domainParts = domain.split('.');
    const language = domainParts[0];  // e.g. en
    const projectDomain = domainParts.splice(1).join('.');

    const sourceLanguages = app.conf.article.translation_models[language] ||
          null;

    if (!sourceLanguages) {
        app.logger.log('error/article',
            `Article translation model for "${language}" doesn't exist.`);
        throw new util.HTTPError({
            status: 400
        });
    }

    return aUtil.getWikidataId(app, domain, req.params.seed).then((id) => {
        return aUtil.getSimilarArticles(app, projectDomain, id, sourceLanguages)
            .then((ids) => {
                const errorObject = new sUtil.HTTPError({ status: 404 });

                if (!ids.length) {
                    return BBPromise.reject(errorObject);
                } else {
                    return aUtil.getArticleScoresFromDb(app, ids, language)
                        .then((results) => {
                            res.json(results);
                        })
                        .catch((error) => {
                            return BBPromise.reject(errorObject);
                        });
                }
            });
    });
});

module.exports = function(appObj) {
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
        path: '/article',
        api_version: 1,
        router
    };
};
