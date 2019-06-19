'use strict';

const api = require('../../lib/api-util');
const lib = require('../../lib/suggested-edits-common');
const assert = require('../utils/assert');

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

describe('lib:suggested-edits-common', () => {

    before(() => api.setupApiTemplates(app));

    describe('getWikiLangForLangCode', () => {

        it('translates language variants to base wiki language codes', () => {
            return lib.getWikiLangForLangCode(app, 'zh-hans').then((res) => {
                assert.deepEqual(res, 'zh');
            });
        });

        it('passed through other inputs', () => {
            return lib.getWikiLangForLangCode(app, 'foo').then((res) => {
                assert.deepEqual(res, 'foo');
            });
        });

        it('handles undefined', () => {
            return lib.getWikiLangForLangCode(app, undefined).then((res) => {
                assert.deepEqual(res, undefined);
            });
        });

    });

});
