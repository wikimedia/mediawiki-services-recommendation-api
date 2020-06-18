'use strict';

const lib = require('../lib/description');
const common = require('../lib/suggested-edits-common');
const router = require('../lib/util').router();

let app;

router.get('/:target', (req, res) => {
    common.checkRequestDomains(app.conf.description_allowed_domains, req.params.domain);
    return lib.generateResults(app, req, lib.isValidResultForAddition)
        .then(response => res.status(200).send(response));
});

module.exports = function (appObj) {

    app = appObj;

    return {
        path: '/description/addition',
        api_version: 1,
        router
    };

};
