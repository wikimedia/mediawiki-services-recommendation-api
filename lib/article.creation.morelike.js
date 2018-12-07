'use strict';

const BBPromise = require("bluebird");
const aUtils = require('./api-util');
const Template = require('swagger-router').Template;

/**
 * Return article's Wikidata ID from MW API
 * @param {Object} app
 * @param {string} domain
 * @param {string} articleTitle
 * @return {Promise} promise that resolves with article's Wikidata ID or `null`
 */
function getWikidataId(app, domain, articleTitle) {
    let wikidataTemplate = new Template(app.conf.queries.wikidata);
    wikidataTemplate = wikidataTemplate.expand({
        params: {
            domain,
            title: articleTitle
        }
    });

    app.logger.log('debug/article.creation.morelike', {
        msg: 'Getting article\'s Wikidata ID from MW API.',
        articleTitle
    });

    return aUtils.mwApiGet(app, domain, wikidataTemplate.parameters).then(
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
 * For a Wikidata item return article names from MW API in given languages
 * @param {Object} app
 * @param {string} wikidataId
 * @param {string[]} languages
 * @return {Promise} promise that resolves with article's names or `null`
 */
function getArticleNames(app, wikidataId, languages) {
    let template = new Template(app.conf.queries.article_title);

    template = template.expand({
        params: {
            id: wikidataId,
            sites: languages.map(x => `${x}wiki`).join('|')
        }
    });

    app.logger.log('debug/article.creation.morelike', {
        msg: 'Getting article titles from the MW API.',
        wikidataId,
        languages
    });

    return aUtils.mwApiGet(app, template.domain, template.parameters).then(
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
            app.logger.log('debug/article.creation.morelike', {
                msg: 'Article names from Wikidata retrieved.',
                wikidataId,
                languages
            });


            const sitelinks = response.body.entities[wikidataId].sitelinks;
            const articleNames = {};

            languages.forEach((lang) => {
                const wiki = sitelinks[`${lang}wiki`];
                if (wiki && wiki.title) {
                    if (lang in articleNames) {
                        articleNames[lang].push(wiki.title);
                    } else {
                        articleNames[lang] = [wiki.title];
                    }
                }
            });

            return articleNames;
        }
    );
}

/**
 * Get similar articles to articleNames using MediaWiki morelike API
 * @param {Object} app
 * @param {string} language Wiki language
 * @param {string} projectDomain
 * @param {string} wikidataId
 * @param {string[]} articleNames
 * @return {Promise} promise that resolves with the list of wikidata IDs
 */
function getMorelike(app, language, projectDomain, wikidataId, articleNames) {
    const domain = `${language}.${projectDomain}`;
    const seedQuery = app.conf.queries.seed_tpl.expand({
        params: {
            source: language,
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
 * Get recommendation scores for Wikidata IDs
 * @param {Object} app
 * @param {string[]} wikidataIds
 * @param {string} targetLanguage language used as the target language
 *   in recommendation predictions
 * @return {Promise} promise that resolves with Wikidata IDs and their
 *   recommendation scores
 */
function getArticleScoresFromDb(app, wikidataIds, targetLanguage) {
    const langTable = app.conf.mysql_tables.language;
    const recTable = app.conf.mysql_tables.article_recommendation;

    wikidataIds = wikidataIds.map((x) => {
        return parseInt(x.replace('Q', ''), 10);
    });

    return new BBPromise((resolve, reject) => {
        app.mysqlPool.query(
            `SELECT wikidata_id, score FROM ?? ` +
                `INNER JOIN ?? ON ??=?? ` +
                `WHERE wikidata_id in (?) ` +
                `AND ??=? ORDER BY score DESC LIMIT 10`,
            [recTable, langTable, `${recTable}.target_id`, `${langTable}.id`,
                wikidataIds, `${langTable}.code`, targetLanguage],
            (error, results, _) => {
                if (error) {
                    app.logger.log('error/article.creation.morelike', error);
                    reject(error);
                    return;
                }

                if (results && results.length) {
                    app.logger.log('debug/article.creation.morelike', {
                        msg: 'Articles retrieved from DB.',
                        count: results.length
                    });
                }
                results = results.map((x) => {
                    x.wikidata_id = `Q${x.wikidata_id}`;
                    return x;
                });
                resolve(results);
            });
    });
}

module.exports = {
    getWikidataId,
    getSimilarArticles,
    getArticleScoresFromDb
};
