'use strict';


const sUtil = require('../lib/util');


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
    res.json({
        source: req.params.source,
        target: req.params.target
    });
});


/**
 * GET /articles/{source}/{target}/{seed}
 * Gets the articles existing in source but missing in target based on seed.
 */
router.get('/articles/:source/:target/:seed', (req, res) => {
    res.json({
        source: req.params.source,
        target: req.params.target,
        seed: req.params.seed
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

