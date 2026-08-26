var express = require('express');
var router = express.Router();
var fs = require('fs');
var path = require('path');

var ROBOTS_PATH = path.join(__dirname, '..', 'public', 'robots.txt');

router.get('/', (req, res) => {
  res.type('text/plain; charset=utf-8');
  res.set('Cache-Control', 'public, max-age=86400');
  fs.readFile(ROBOTS_PATH, 'utf8', (err, body) => {
    if (err) {
      return res.status(200).send(
        'User-agent: *\nAllow: /\n\nSitemap: https://www.filemakr.com/sitemap.xml\n'
      );
    }
    res.send(body);
  });
});

module.exports = router;
