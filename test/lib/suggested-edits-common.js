'use strict';

const api = require('../../lib/api-util');
const lib = require('../../lib/suggested-edits-common');
const assert = require('../utils/assert');
const HTTPError = require('../../lib/util').HTTPError;

const app = {
    conf: {
        mwapi_req: {
            method: 'post',
            uri: 'https://{{domain}}/w/api.php',
            headers: { 'user-agent': '{{user-agent}}' },
            body: '{{ default(request.query, {}) }}'
        }
    }
};

const req = { params: { domain: 'test.wikipedia.org' } };

describe('lib:suggested-edits-common', () => {

    before(() => api.setupApiTemplates(app));

    describe('checkRequestDomain', () => {
        const allowedDomains = ['foo.bar'];

        it('allows allowed domains', () => {
            try {
                lib.checkRequestDomains(allowedDomains, 'foo.bar');
            } catch (e) {
                assert.fail('should not throw for allowed domain');
            }
        });

        it('disallows disallowed domains', () => {
            try {
                lib.checkRequestDomains(allowedDomains, 'google.com');
                assert.fail('should throw for unsupported domain');
            } catch (e) {
                assert.ok(e instanceof HTTPError);
                assert.deepEqual(e.type, 'unsupported_domain');
            }
        });

        it('handles undefined', () => {
            try {
                lib.checkRequestDomains(allowedDomains, undefined);
                assert.fail('should throw for unsupported domain');
            } catch (e) {
                assert.ok(e instanceof HTTPError);
                assert.deepEqual(e.type, 'unsupported_domain');
            }
        });

    });

    describe('getWikiLangForLangCode', () => {

        it('translates language variants to base wiki language codes', () => {
            return lib.getWikiLangForLangCode(app, req, 'zh-hans').then((res) => {
                assert.deepEqual(res, 'zh');
            });
        });

        it('passed through other inputs', () => {
            return lib.getWikiLangForLangCode(app, req, 'foo').then((res) => {
                assert.deepEqual(res, 'foo');
            });
        });

        it('handles undefined', () => {
            return lib.getWikiLangForLangCode(app, req, undefined).then((res) => {
                assert.deepEqual(res, undefined);
            });
        });

    });

});
