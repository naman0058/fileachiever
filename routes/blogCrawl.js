'use strict';

const express = require('express');
const router = express.Router();
const {
  fetchPublicBlogSitemapRows,
  buildBlogSitemapXml,
  buildBlogRssXml,
} = require('../services/blogSitemapService');

router.get('/blog-sitemap.xml', async (req, res) => {
  try {
    const entries = await fetchPublicBlogSitemapRows();
    const xml = buildBlogSitemapXml(entries);
    res.set('Content-Type', 'application/xml; charset=utf-8');
    res.set('Cache-Control', 'public, max-age=3600');
    res.status(200).send(xml);
  } catch (err) {
    console.error('[blog-sitemap]', err);
    res.set('Content-Type', 'application/xml; charset=utf-8');
    res.status(200).send(
      '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>'
    );
  }
});

router.get('/blog/feed.xml', async (req, res) => {
  try {
    const entries = await fetchPublicBlogSitemapRows({ limit: 40 });
    const xml = buildBlogRssXml(entries);
    res.set('Content-Type', 'application/rss+xml; charset=utf-8');
    res.set('Cache-Control', 'public, max-age=1800');
    res.status(200).send(xml);
  } catch (err) {
    console.error('[blog/feed.xml]', err);
    res.status(503).type('text/plain').send('Feed temporarily unavailable.');
  }
});

module.exports = router;
