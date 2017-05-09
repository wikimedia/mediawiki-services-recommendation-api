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


function recommend(res, source, target, seed) {
    return tUtil.recommend(app, source, target, seed)
        .then((result) => {
            result = result.slice(0, 24);
            res.json({
                count: result.length,
                articles: result
            });
        });
}


/**
 * GET /articles/{source}/{target}
 * Gets the articles existing in source but missing in target.
 */
router.get('/articles/:source/:target', (req, res) => {
    return recommend(res, req.params.source, req.params.target);
});


/**
 * GET /articles/{source}/{target}/{seed}
 * Gets the articles existing in source but missing in target based on seed.
 */
router.get('/articles/:source/:target/:seed', (req, res) => {
    return recommend(res, req.params.source, req.params.target, req.params.seed);
});


module.exports = function(appObj) {

    app = appObj;

    return {
        path: '/translation',
        skip_domain: true,
        router
    };

};

