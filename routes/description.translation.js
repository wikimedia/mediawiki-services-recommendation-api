'use strict';

const lib = require('../lib/description');
const router = require('../lib/util').router();

let app;

router.get('/from/:source/to/:target', (req, res) => {
    return lib.buildResponse(app, req, lib.Tasks.DESCRIPTION_TRANSLATION,
        lib.isValidItemForTranslation).then(response => res.status(200).send(response));
});

module.exports = function (appObj) {

    app = appObj;

    return {
        path: '/description/translation',
        api_version: 1,
        router
    };

};
