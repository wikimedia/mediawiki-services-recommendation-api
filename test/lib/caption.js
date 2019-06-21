'use strict';

const rewire = require('rewire');
const lib = rewire('../../lib/caption');
const assert = require('../utils/assert');

describe('lib:caption', () => {

    describe('convertGlobalUsagePageIdsToInts', () => {
        const convertGlobalUsagePageIdsToInts = lib.__get__('convertGlobalUsagePageIdsToInts');

        it('converts page ID string to int', () => {
            const image = {
                pageid: 1,
                ns: 6,
                title: 'File:Foo.jpg',
                mime: 'image/jpeg',
                structured: { captions: {} },
                globalusage: [{
                    title: 'Foo',
                    wiki: 'en.wikipedia.org',
                    pageid: '5'
                }]
            };
            convertGlobalUsagePageIdsToInts(image);
            assert.deepEqual(image.globalusage[0].pageid, 5);
        });
    });

    describe('consolidateImageData', () => {
        const consolidateImageData = lib.__get__('consolidateImageData');

        it('consolidates entity data to expected items', () => {
            const images = { 1: {}, 2: {}, 3: {} };
            const entities = {
                M1: { labels: { en: { value: 'en' } } },
                M2: { labels: { es: { value: 'es' } } },
                M3: { labels: { de: { value: 'de' } } }
            };
            consolidateImageData(images, entities);
            assert.deepEqual(images['1'].structured.captions.en, 'en');
            assert.deepEqual(images['2'].structured.captions.es, 'es');
            assert.deepEqual(images['3'].structured.captions.de, 'de');
        });

        it('handles undefined entities object', () => {
            assert.doesNotThrow(consolidateImageData, {}, undefined);
        });

    });

    describe('filterNonImageFiles', () => {
        const filterNonImageFiles = lib.__get__('filterNonImageFiles');

        it('filters non-image MIME types', () => {
            const pages = {
                1: { imageinfo: [ { mime: 'audio/ogg' } ] },
                2: { imageinfo: [ { mime: 'image/jpeg' } ] },
                3: { imageinfo: [ { mime: 'text/html' } ] }
            };
            const result = filterNonImageFiles(pages);
            assert.deepEqual(Object.keys(result).length, 1);
            assert.ok(result['2']);
        });

        it('handles undefined pages object', () => {
            assert.doesNotThrow(filterNonImageFiles, undefined);
        });

    });

    describe('makeResult', () => {

        const image = {
            pageid: 1,
            ns: 6,
            title: 'File:Foo',
            structured: {
                captions: {
                    en: 'Foo',
                    pt: 'Bar'
                }
            },
            imageinfo: [{
                mime: 'image/jpeg'
            }],
            globalusage: [{
                title: 'Bar',
                wiki: 'pt.wikipedia.org',
                pageid: 3
            }]
        };

        const expected = {
            pageid: 1,
            ns: 6,
            title: 'File:Foo',
            mime: 'image/jpeg',
            structured: {
                captions: {
                    en: 'Foo',
                    pt: 'Bar'
                }
            },
            globalusage: {
                pt: [{
                    title: 'Bar',
                    wiki: 'pt.wikipedia.org',
                    pageid: 3
                }]
            }
        };

        const makeResult = lib.__get__('makeResult');

        it('result is structured as expected', () => {
            assert.deepEqual(makeResult(image, 'pt', 'en'), expected);
        });

    });

    describe('makeResults', () => {

        const images = {
            1: {
                pageid: 1,
                ns: 6,
                title: 'File:Foo',
                imageinfo: [{
                    mime: 'image/jpeg'
                }],
                globalusage: [{
                    title: 'Bar',
                    wiki: 'pt.wikipedia.org',
                    pageid: 3
                }]
            },
            2: {
                pageid: 2,
                ns: 6,
                title: 'File:Bar',
                imageinfo: [{
                    mime: 'image/jpeg'
                }],
                globalusage: [{
                    title: 'Foo',
                    wiki: 'pt.wikipedia.org',
                    pageid: 4
                }]
            },
            3: {
                pageid: 3,
                ns: 6,
                title: 'File:Baz',
                imageinfo: [{
                    mime: 'image/jpeg'
                }],
                globalusage: [{
                    title: 'Baz',
                    wiki: 'pt.wikipedia.org',
                    pageid: 5
                }]
            }
        };

        const entities = {
            M1: {
                labels: {
                    en: {
                        value: 'Foo'
                    },
                    pt: {
                        value: 'Bar'
                    }
                }
            },
            M2: {
                labels: {}
            },
            M3: {
                labels: {
                    en: {
                        value: 'Baz'
                    }
                }
            }
        };

        const cond = (image, targetLang, sourceLang) => {
            return image.structured.captions[sourceLang] && !image.structured.captions[targetLang];
        };

        const makeResults = lib.__get__('makeResults');

        it('makes results as expected', () => {
            const result = makeResults(images, entities, cond, 'pt', 'en');
            const expected = [{
                pageid: 3,
                ns: 6,
                title: 'File:Baz',
                mime: 'image/jpeg',
                structured: {
                    captions: {
                        en: 'Baz'
                    }
                },
                globalusage: {
                    pt: [{
                        title: 'Baz',
                        wiki: 'pt.wikipedia.org',
                        pageid: 5
                    }]
                }
            }];
            assert.deepEqual(result, expected);
        });
    });

});
