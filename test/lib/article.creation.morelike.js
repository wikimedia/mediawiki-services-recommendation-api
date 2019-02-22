'use strict';

const sinon = require('sinon');

const assert = require('../utils/assert.js');
const aUtils = require('../../lib/api-util');
const util = require('../../lib/article.creation.morelike');

const app = {
    conf: {
        wikidata_domain: 'blah'
    },
    logger: {
        log: () => {}
    }
};
let mwApiGetStub;

function stubApi() {
    mwApiGetStub = sinon.stub(aUtils, 'mwApiGet');
    mwApiGetStub.returns({
        status: 200,
        headers: {},
        body: {
            entities: {
                Q22169: {
                    type: 'item',
                    id: 'Q22169',
                    sitelinks: {}
                },
                Q7075: {
                    type: 'item',
                    id: 'Q7075',
                    sitelinks: {
                        uzwiki: {
                            site: 'uzwiki',
                            title: 'Kutubxona',
                            badges: []
                        }
                    }
                },
                Q102786: {
                    type: 'item',
                    id: 'Q102786',
                    sitelinks: {
                        uzwiki: {
                            site: 'uzwiki',
                            title: 'Abbreviatura',
                            badges: []
                        }
                    }
                },
                Q33251: {
                    type: 'item',
                    id: 'Q33251',
                    sitelinks: {}
                }
            },
            success: 1
        }
    });
}

after(() => mwApiGetStub.restore());

describe('Get missing articles', () => {
    it('correctly filters out existing articles', (done) => {
        // call this here, otherwise it affects tests in other files
        stubApi();
        util.getMissingArticles(
            app, 'blah', ['Q22169', 'Q7075', 'Q102786', 'Q33251'], 'uz'
        ).then((ids) => {
            assert.deepEqual(ids, ['Q22169', 'Q33251']);
            assert.ok(mwApiGetStub.callCount === 1);
            done();
        });
    });
});
