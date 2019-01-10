'use strict';

const preq = require('preq');
const assert = require('../../utils/assert.js');
const server = require('../../utils/server.js');
const sinon = require('sinon');
const stub = sinon.stub(require('mysql'), 'createPool');

stub.returns({
    query: (_, __, callback) => {
        callback(
            null,
            [
                { wikidata_id: 125576, normalized_rank: 0.927625 },
                { wikidata_id: 159964, normalized_rank: 0.912596 },
                { wikidata_id: 127418, normalized_rank: 0.891431 }
            ]
        );
    }
});

if (!server.stopHookAdded) {
    server.stopHookAdded = true;
    after(() => server.stop());
}

before(() => server.start());

describe('article.creation.morelike', function() {
    this.timeout(20000);


    it('should return recommendations for good article title',() => {
        return preq.get(
            `${server.config.uri}uz.wikipedia.org/v1/article/creation/morelike/Palov`
        ).then((res) => {
            assert.status(res, 200);
            assert.contentType(res, 'application/json');
            assert.deepEqual(
                res.body,
                [
                    { wikidata_id: 'Q125576', normalized_rank: 0.927625 },
                    { wikidata_id: 'Q159964', normalized_rank: 0.912596 },
                    { wikidata_id: 'Q127418', normalized_rank: 0.891431 }
                ]
            );
        });
    });
});
