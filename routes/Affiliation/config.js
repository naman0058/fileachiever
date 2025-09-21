
var express = require('express');
var router = express.Router();
var upload = require('../multer');
var pool = require('../pool');
require('dotenv').config()
var folder = process.env.affilation_folder
var table = process.env.affiliation_table
var table1 = 'source_code'
var dataService = require('../dataService');


router.get('/', (req, res) => {
    pool.query(`SELECT * FROM config LIMIT 1`, (err, result) => {
        if (err) throw err;
        res.render(`${folder}/config`, { config: result[0] });
    });
});


router.post('/update-token', (req, res) => {
  const { instagramAccessToken, youtubeApiKey } = req.body;

  pool.query(
    `UPDATE config SET instagramAccessToken = ?, youtubeApiKey = ? WHERE id = 1`,
    [instagramAccessToken, youtubeApiKey],
    (err, result) => {
      if (err) throw err;
      res.redirect('back');
    }
  );
});


module.exports = router;