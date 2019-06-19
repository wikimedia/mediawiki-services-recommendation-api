'use strict';

const lib = require('../lib/description');
const router = require('../lib/util').router();

let app;

router.get('/:target', (req, res) => {
    return lib.buildResponse(app, req, lib.Tasks.DESCRIPTION_ADDITION,
        lib.isValidItemForAddition).then(response => res.status(200).send(response));
});

module.exports = function (appObj) {

    app = appObj;

    return {
        path: '/description/addition',
        api_version: 1,
        router
    };

};
