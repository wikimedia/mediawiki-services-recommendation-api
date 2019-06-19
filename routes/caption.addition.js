'use strict';

const lib = require('../lib/caption');
const router = require('../lib/util').router();

let app;

router.get('/:target', (req, res) => {
    return lib.buildResponse(app, req, lib.Tasks.CAPTION_ADDITION,
        lib.isValidImageForAddition).then(response => res.status(200).send(response));
});

module.exports = function (appObj) {

    app = appObj;

    return {
        path: '/caption/addition',
        api_version: 1,
        router
    };

};
