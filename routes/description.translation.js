'use strict';

const lib = require('../lib/description');
const common = require('../lib/suggested-edits-common');
const router = require('../lib/util').router();

let app;

router.get('/from/:source/to/:target', (req, res) => {
    common.checkRequestDomains(app.conf.description_allowed_domains, req.params.domain);
    return lib.generateResults(app, req, lib.isValidResultForTranslation)
        .then(response => res.status(200).send(response));
});

module.exports = function (appObj) {

    app = appObj;

    return {
        path: '/description/translation',
        api_version: 1,
        router
    };

};
