var express = require('express');
var router = express.Router();
var pool = require('./pool')
var table = 'programming_language'

router.get('/', (req, res) => { pool.query(`select name,seo_name,short_description from project`,
(err,result)=>err ? console.log(err) : res.render('own-project',{result:result}))
})

module.exports = router;