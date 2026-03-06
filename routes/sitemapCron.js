// sitemapCron.js
const cron = require('node-cron');
const axios = require('axios');

// Daily at 2:00 AM
cron.schedule('0 2 * * *', async () => {
  try {
    console.log('[Sitemap Cron] Regenerating sitemap and pinging search engines...');

    const sitemapUrl = 'https://www.filemakr.com/sitemap.xml';

    // Ping Google
    await axios.get(`https://www.google.com/ping?sitemap=${sitemapUrl}`);
    console.log('[Google Ping] Success');

    // Ping Bing
    await axios.get(`https://www.bing.com/ping?sitemap=${sitemapUrl}`);
    console.log('[Bing Ping] Success');

    console.log('[Sitemap Cron] Completed');

  } catch (err) {
    console.error('[Sitemap Cron] Error:', err.message);
  }
});

async function pingSearchEngines() {
  try {
    const sitemapUrl = 'https://www.filemakr.com/sitemap.xml';
    console.log('[Sitemap Cron] Pinging search engines...');

    await axios.get('https://www.google.com/ping', {
      params: { sitemap: sitemapUrl },
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' }
    });
    console.log('[Google Ping] Success');

    await axios.get('https://www.bing.com/ping', {
      params: { sitemap: sitemapUrl },
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)' }
    });
    console.log('[Bing Ping] Success');

  } catch (err) {
    console.error('[Sitemap Cron] Error:', err.response?.status || 'Unknown', err.message);
  }
}
