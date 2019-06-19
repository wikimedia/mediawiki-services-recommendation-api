'use strict';

const api = require('./api-util');

let variantToWikiLangCache = {};

/**
 * Fetch configured language variants from the MW API.
 * This response is identical across WMF production wikis.
 * @param {!Object} app the application object
 * @return {!Promise} promise resolving to the query response
 */
function getLanguageVariantsFromSiteInfo(app) {
    return api.mwApiGet(app, 'meta.wikimedia.org', {
        action: 'query',
        meta: 'siteinfo',
        siprop: 'languagevariants'
    });
}

/**
 * Gets the wiki language subdomain for the provided language code. Translates language variant
 * codes to wiki language codes.
 * @param {!Object} app the application object
 * @param {?string} code wiki language code
 * @return {!Promise} promise resolving to the corresponding wiki language code, if a language
 * variant code is provided; else, the input is returned
 */
function getWikiLangForLangCode(app, code) {
    return !Object.keys(variantToWikiLangCache).length ? getLanguageVariantsFromSiteInfo(app)
        .then((rsp) => {
            const languageVariants = rsp.body.query && rsp.body.query.languagevariants;
            variantToWikiLangCache = Object.keys(languageVariants).reduce((acc, cur) => {
                Object.keys(languageVariants[cur]).forEach((variant) => {
                    if (cur !== variant) {
                        acc[variant] = cur;
                    }
                });
                return acc;
            }, {});
            return variantToWikiLangCache[code] || code;
        }) : Promise.resolve(variantToWikiLangCache[code] || code);
}

module.exports = {
    getWikiLangForLangCode
};
