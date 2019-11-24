var express = require('express');
var router = express.Router();
var pool = require('./pool');
var upload = require('./multer');
var table = 'project';

router.get('/', (req, res) =>  res.render(`sitemap`))

module.exports = router;