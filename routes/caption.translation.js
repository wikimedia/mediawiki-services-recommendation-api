'use strict';

const lib = require('../lib/caption');
const router = require('../lib/util').router();

let app;

router.get('/from/:source/to/:target', (req, res) => {
    return lib.buildResponse(app, req, lib.Tasks.CAPTION_TRANSLATION,
        lib.isValidImageForTranslation).then(response => res.status(200).send(response));
});

module.exports = function (appObj) {

    app = appObj;

    return {
        path: '/caption/translation',
        api_version: 1,
        router
    };

};
