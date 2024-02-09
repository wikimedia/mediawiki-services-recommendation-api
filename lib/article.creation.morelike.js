/* global setTimeout */

'use strict';

const BBPromise = require('bluebird');
const aUtils = require('./api-util');

/**
 * Return article's Wikidata ID from MW API
 *
 * @param {Object} app
 * @param {string} domain
 * @param {string} articleTitle
 * @return {Promise} promise that resolves with article's Wikidata ID or `null`
 */
function getWikidataId(app, domain, articleTitle) {
    const parameters = {
        format: 'json',
        formatversion: 2,
        action: 'query',
        prop: 'pageprops',
        ppprop: 'wikibase_item',
        titles: articleTitle
    };

    app.logger.log('debug/article.creation.morelike', {
        msg: 'Getting article\'s Wikidata ID from MW API.',
        articleTitle
    });

    return aUtils.mwApiGet(app, domain, parameters).then(
        (response) => {
            if (!response.body || !response.body.query ||
                !response.body.query.pages ||
                !response.body.query.pages[0].pageprops ||
                !response.body.query.pages[0].pageprops.wikibase_item) {
                app.logger.log('debug/article.creation.morelike', {
                    msg: 'No article Wikidta ID retrieved.'
                });
                return null;
            }

            const id = response.body.query.pages[0].pageprops.wikibase_item;

            app.logger.log('debug/article.creation.morelike', {
                msg: 'Article Wikidata ID retrieved.',
                id
            });
            return id;
        }
    );
}

/**
 * For a Wikidata item return article names from Wikidata's MW API in
 * given languages.
 *
 * @param {Object} app
 * @param {string} wikidataId
 * @param {string[]} languages
 * @return {Promise} promise that resolves with article's names or `null`
 */
function getArticleNames(app, wikidataId, languages) {
    const domain = app.conf.wikidata_domain;
    const parameters = {
        format: 'json',
        formatversion: 2,
        action: 'wbgetentities',
        ids: wikidataId,
        props: 'sitelinks',
        sitefilter: languages.map(x => `${ x }wiki`).join('|')
    };

    app.logger.log('debug/article.creation.morelike', {
        msg: 'Getting article titles from the MW API.',
        wikidataId,
        languages
    });

    return aUtils.mwApiGet(app, domain, parameters).then(
        (response) => {
            if (!response.body || !response.body.entities ||
                !response.body.entities[wikidataId] ||
                !response.body.entities[wikidataId].sitelinks) {
                app.logger.log('debug/article.creation.morelike', {
                    msg: 'No article names from Wikidta retrieved.',
                    wikidataId,
                    languages
                });
                return null;
            }

            const sitelinks = response.body.entities[wikidataId].sitelinks;
            const articleNames = {};

            languages.forEach((lang) => {
                const wiki = sitelinks[`${ lang }wiki`];
                if (wiki && wiki.title) {
                    if (lang in articleNames) {
                        articleNames[lang].push(wiki.title);
                    } else {
                        articleNames[lang] = [wiki.title];
                    }
                }
            });

            app.logger.log('debug/article.creation.morelike', {
                msg: 'Article names from Wikidata retrieved.',
                articleNames
            });

            return articleNames;
        }
    );
}

/**
 * Get similar articles to articleNames using MediaWiki morelike API
 *
 * @param {Object} app
 * @param {string} language Wiki language
 * @param {string} projectDomain
 * @param {string} wikidataId
 * @param {string[]} articleNames
 * @return {Promise} promise that resolves with the list of wikidata IDs
 */
function getMorelike(app, language, projectDomain, wikidataId, articleNames) {
    const domain = `${ language }.${ projectDomain }`;
    const seedQuery = app.queryTemplates.seed.expand({
        params: {
            seed: articleNames.join('|')
        }
    });

    return aUtils.mwApiGet(app, domain, seedQuery.parameters).then(
        (response) => {
            if (!response.body || !response.body.query ||
                !response.body.query.pages) {
                app.logger.log('debug/article.creation.morelike', {
                    msg: 'No article Wikidta ID retrieved.'
                });
                return [];
            }

            const pages = response.body.query.pages;
            const similarIds = [];
            for (const id in pages) {
                if (id) {
                    const pageprops = pages[id].pageprops;
                    if (pageprops && pageprops.wikibase_item) {
                        similarIds.push(pageprops.wikibase_item);
                    }
                }
            }
            return similarIds;
        });
}

/**
 * Get Wikidata item IDs similar to wikidataId using morelike API for languages
 *
 * @param {Object} app
 * @param {string} projectDomain
 * @param {string} wikidataId
 * @param {string[]} languages
 * @return {Promise} promise that resolves with the list of similar Wikidata IDs
 */
function getSimilarArticles(app, projectDomain, wikidataId, languages) {
    return getArticleNames(app, wikidataId, languages)
        .then((articleNames) => {
            const requests = [];
            for (const language in articleNames) {
                if (language) {
                    requests.push(getMorelike(
                        app, language, projectDomain, wikidataId,
                        articleNames[language]));
                }
            }

            return Promise.all(requests)
                .then((morelikeItems) => {
                    const wikidataIds = [];
                    morelikeItems.forEach((item) => {
                        wikidataIds.push(...item);
                    });
                    return Array.from(new Set(wikidataIds));
                });
        });
}

/**
 * Return filtered Wikidata item IDs that don't have a sitelink to the
 * wiki indicated by language.
 *
 * @param {Object} app
 * @param {string} projectDomain
 * @param {string[]} wikidataIds
 * @param {string} language
 * @return {Promise} promise that resolves with the list of Wikidata IDs
 */
function getMissingArticles(app, projectDomain, wikidataIds, language) {
    const domain = app.conf.wikidata_domain;
    const wiki = `${ language }wiki`;
    // hard-limit set by the API on the number of IDs we can pass to the API
    const idLimit = 50;
    const parameters = {
        format: 'json',
        formatversion: 2,
        action: 'wbgetentities',
        props: 'sitelinks',
        sitefilter: wiki
    };

    app.logger.log('debug/article.creation.morelike', {
        msg: 'Getting article titles from the MW API.',
        wikidataIds,
        language
    });

    // Split Wikidata IDs in to chunks and make separate requests so
    // that we don't hit the API limit.
    const requests = [];
    const requestCount = Math.ceil(wikidataIds.length / idLimit);
    for (let i = 0; i < requestCount; i++) {
        const start = i * idLimit;
        const end = start + idLimit;
        const ids = wikidataIds.slice(start, end);
        parameters.ids = ids.join('|');
        requests.push(
            aUtils.mwApiGet(app, domain, parameters)
        );
    }
    return Promise.all(requests)
        .then((responses) => {
            const results = [];
            responses.forEach((response) => {
                const entities = response.body.entities;
                for (const id in entities) {
                    if (!entities[id].sitelinks ||
                        !entities[id].sitelinks[wiki]) {
                        results.push(id);
                    }
                }
            });
            app.logger.log('debug/article.creation.morelike', {
                msg: 'Retrieved missing articles.',
                results
            });
            return results;
        })
        .catch((error) => {
            app.logger.log('error/article.creation.morelike', {
                msg: 'Could not retrieve missing articles.',
                error
            });
            return null;
        });
}

/**
 * Internal function for getting normalized ranks from MySQL
 *
 * In case of MySQL failure, the function is called recursively until no
 * more retries are left.
 *
 * @param {Object} app
 * @param {string[]} wikidataIds
 * @param {string} targetLanguage language used as the target language
 *   in recommendation predictions
 * @param {number} retry number of times to retry MySQL query in case of failure
 * @param {number} retryDelay delay in ms before retrying MySQL connection
 * @param {Function} reject callback
 * @param {Function} resolve callback
 */
function _getArticleNormalizedRanksFromMySQL(
    app, wikidataIds, targetLanguage, retry, retryDelay, reject, resolve) {
    const langTable = app.conf.mysql_tables.language;
    const normalizedRankTable = app.conf.mysql_tables.normalized_rank;

    app.mysqlPool.query(
        `SELECT max_vals.wikidata_id, rank_table.normalized_rank,
            source.code as source_language from (SELECT wikidata_id, max(normalized_rank) as normalized_rank
            FROM ?? INNER JOIN ?? as target ON ??=target.id
            WHERE wikidata_id in (?)
            AND target.code=? GROUP BY wikidata_id
            ORDER BY max(normalized_rank) DESC) as max_vals
            LEFT JOIN ?? as rank_table
            ON max_vals.wikidata_id=rank_table.wikidata_id AND
            max_vals.normalized_rank=rank_table.normalized_rank
            INNER JOIN ?? as source ON
            rank_table.source_id=source.id LIMIT 10`,
        [normalizedRankTable, langTable,
            `${ normalizedRankTable }.target_id`, wikidataIds,
            targetLanguage, normalizedRankTable, langTable],
        (error, results, _) => {
            if (error) {
                app.logger.log('error/article.creation.morelike', error);
                if (retry > 0) {
                    app.logger.log(
                        'debug/article.creation.morelike',
                        {
                            msg: 'Retrying MySQL query.',
                            retry,
                            retryDelay
                        });
                    setTimeout(_getArticleNormalizedRanksFromMySQL, retryDelay,
                        app, wikidataIds, targetLanguage, --retry,
                        retryDelay, reject, resolve);
                } else {
                    reject(error);
                }
                return;
            }

            if (results && results.length) {
                app.logger.log('debug/article.creation.morelike', {
                    msg: 'Articles retrieved from DB.',
                    count: results.length
                });
            }
            results = results.map((x) => {
                x.wikidata_id = `Q${ x.wikidata_id }`;
                return x;
            });
            resolve(results);
        });
}

/**
 * Get recommendation normalized ranks for Wikidata IDs
 *
 * @param {Object} app
 * @param {string[]} wikidataIds
 * @param {string} targetLanguage language used as the target language
 *   in recommendation predictions
 * @return {Promise} promise that resolves with Wikidata IDs and their
 *   recommendation normalized ranks
 */
function getArticleNormalizedRanksFromDb(app, wikidataIds, targetLanguage) {
    const retry = app.conf.mysql_conn.retry || 2;
    const retryDelay = app.conf.mysql_conn.retry_delay || 1000;

    wikidataIds = wikidataIds.map((x) => {
        return parseInt(x.replace('Q', ''), 10);
    });

    return new BBPromise((resolve, reject) => {
        _getArticleNormalizedRanksFromMySQL(
            app, wikidataIds, targetLanguage, retry, retryDelay,
            reject, resolve);
    });
}

module.exports = {
    getWikidataId,
    getSimilarArticles,
    getMissingArticles,
    getArticleNormalizedRanksFromDb
};
