var express = require('express');
var router = express.Router();
const { getAdsenseConfig } = require('../utils/adsenseConfig');

router.get('/', (req, res) => {
  const cfg = getAdsenseConfig();
  res.type('text/plain; charset=utf-8');
  res.set('Cache-Control', 'public, max-age=86400');
  res.send(`${cfg.adsTxtLine}\n`);
});

module.exports = router;


