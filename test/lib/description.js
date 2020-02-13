'use strict';

const rewire = require('rewire');
const lib = rewire('../../lib/description');
const assert = require('../utils/assert');

describe('lib:description', () => {

    describe('wikiLangToDBName', () => {
        const wikiLangToDBName = lib.__get__('wikiLangToDBName');

        it('appends "wiki"', () => {
            assert.deepEqual(wikiLangToDBName('en'), 'enwiki');
        });

        it('converts hyphens to underscores', () => {
            assert.deepEqual(wikiLangToDBName('zh-min-nan'), 'zh_min_nanwiki');
        });

        it('converts be-tarask to be_x_oldwiki', () => {
            assert.deepEqual(wikiLangToDBName('be-tarask'), 'be_x_oldwiki');
        });
    });

});
