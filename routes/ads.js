var express = require('express');
var router = express.Router();
const { getAdsenseConfig } = require('../utils/adsenseConfig');

router.get('/', (req, res) => {
  const cfg = getAdsenseConfig();
  const line =
    cfg.adsTxtLine ||
    'google.com, pub-7230981653683251, DIRECT, f08c47fec0942fa0';
  res.type('text/plain; charset=utf-8');
  res.set('Cache-Control', 'public, max-age=86400');
  res.send(`${line}\n`);
});

module.exports = router;


