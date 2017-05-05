'use strict';


const sUtil = require('../lib/util');
const tUtil = require('../lib/translation');


/**
 * The main router object
 */
const router = sUtil.router();

/**
 * The main application object reported when this module is require()d
 */
let app;


/**
 * GET /articles/{source}/{target}
 * Gets the articles existing in source but missing in target.
 */
router.get('/articles/:source/:target', (req, res) => {
    return tUtil.recommend(app, req.params.source, req.params.target)
        .then((result) => {
            res.json(result);
        });
});


/**
 * GET /articles/{source}/{target}/{seed}
 * Gets the articles existing in source but missing in target based on seed.
 */
router.get('/articles/:source/:target/:seed', (req, res) => {
    return tUtil.recommend(app, req.params.source, req.params.target, req.params.seed)
        .then((result) => {
            res.json(result);
        });
});


module.exports = function(appObj) {

    app = appObj;

    return {
        path: '/translation',
        skip_domain: true,
        router
    };

};

