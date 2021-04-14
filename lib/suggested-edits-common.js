'use strict';

const api = require('./api-util');
const HTTPError = require('./util').HTTPError;

let variantToWikiLangCache = {};

/**
 * Check that the request domain is allowed for the endpoint.
 *
 * @param {!Array} allowedDomains list of allowed domains
 * @param {?string} reqDomain the request domain
 */
function checkRequestDomains(allowedDomains, reqDomain) {
    if (!allowedDomains.includes(reqDomain)) {
        throw new HTTPError({
            status: 400,
            type: 'unsupported_domain',
            title: 'Unsupported domain',
            detail: `This endpoint is only supported on the following domains: ${allowedDomains.join(', ')}`
        });
    }
}

/**
 * Fetch configured language variants from the MW API.
 * This response is identical across wikis.
 *
 * @param {!Object} app the application object
 * @param {!Object} req the request object
 * @return {!Promise} promise resolving to the query response
 */
function getLanguageVariantsFromSiteInfo(app, req) {
    return api.mwApiGet(app, req.params.domain, {
        action: 'query',
        meta: 'siteinfo',
        siprop: 'languagevariants'
    });
}

/**
 * Gets the wiki language subdomain for the provided language code. Translates language variant
 * codes to wiki language codes.
 *
 * @param {!Object} app the application object
 * @param {!Object} req the request object
 * @param {?string} code wiki language code
 * @return {!Promise} promise resolving to the corresponding wiki language code, if a language
 * variant code is provided; else, the input is returned
 */
function getWikiLangForLangCode(app, req, code) {
    let lang = code;
    // Special case for Norwegian: the code 'nb' is used in some contexts, but the canonical code is
    // 'no'.
    if (lang === 'nb') {
        lang = 'no';
    }
    return !Object.keys(variantToWikiLangCache).length ? getLanguageVariantsFromSiteInfo(app, req)
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
            return variantToWikiLangCache[lang] || lang;
        }) : Promise.resolve(variantToWikiLangCache[lang] || lang);
}

module.exports = {
    checkRequestDomains,
    getWikiLangForLangCode
};
