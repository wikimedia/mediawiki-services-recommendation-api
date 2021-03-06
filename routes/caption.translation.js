'use strict';

const lib = require('../lib/caption');
const common = require('../lib/suggested-edits-common');
const router = require('../lib/util').router();

let app;

router.get('/from/:source/to/:target', (req, res) => {
    common.checkRequestDomains(app.conf.caption_allowed_domains, req.params.domain);
    return lib.buildResponse(app, req, lib.isValidImageForTranslation)
        .then(response => res.status(200).send(response));
});

module.exports = function (appObj) {

    app = appObj;

    return {
        path: '/caption/translation',
        api_version: 1,
        router
    };

};
