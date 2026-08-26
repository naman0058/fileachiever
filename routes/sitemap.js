var express = require('express');
var router = express.Router();
var pool = require('./pool');
var pool2 = require('./pool2');
const {
  projectReportUrl,
  resolveProjectReportSeoSlug,
  REPORT_CATALOG_DEGREES,
} = require('./projectReportShared');

const SITE_BASE = 'https://www.filemakr.com';

const STATIC_PAGES = [
  { loc: `${SITE_BASE}/`, priority: '1.00' },
  { loc: `${SITE_BASE}/source-code`, priority: '0.90' },
  { loc: `${SITE_BASE}/final-year-project-ideas`, priority: '0.90' },
  { loc: `${SITE_BASE}/blog`, priority: '0.90' },
  { loc: `${SITE_BASE}/demo`, priority: '0.80' },
  { loc: `${SITE_BASE}/about-us`, priority: '0.70' },
  { loc: `${SITE_BASE}/contact-us`, priority: '0.70' },
  { loc: `${SITE_BASE}/terms-and-conditions`, priority: '0.50' },
  { loc: `${SITE_BASE}/privacy-policy`, priority: '0.50' },
  { loc: `${SITE_BASE}/refund-policy`, priority: '0.50' },
];

const queryAsync = (query, params) =>
  new Promise((resolve, reject) => {
    pool.query(query, params || [], (err, results) => {
      if (err) reject(err);
      else resolve(results);
    });
  });

const queryAsync2 = (query, params) =>
  new Promise((resolve, reject) => {
    pool2.query(query, params || [], (err, results) => {
      if (err) reject(err);
      else resolve(results);
    });
  });

function minimalSitemapXml(lastupdate) {
  const body = STATIC_PAGES.map(
    (page) =>
      `<url><loc>${page.loc}</loc><lastmod>${lastupdate}</lastmod><priority>${page.priority}</priority></url>`
  ).join('');
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
    body +
    '</urlset>'
  );
}

router.get('/', async (req, res) => {
  const lastupdate = new Date().toISOString().split('T')[0];

  try {
    const categories = await queryAsync(
      "SELECT seo_name FROM category WHERE seo_name IS NOT NULL AND seo_name != '' ORDER BY id ASC"
    ).catch(() => []);

    const sourceCodes = await queryAsync(
      "SELECT seo_name FROM source_code WHERE seo_name IS NOT NULL AND seo_name != '' ORDER BY id DESC LIMIT 5000"
    ).catch(() => []);

    let blogs = [];
    try {
      blogs = await queryAsync2(
        `SELECT slug, COALESCE(updated_at, created_at) AS modified
         FROM blogs
         WHERE slug IS NOT NULL AND slug != ''
         ORDER BY id DESC
         LIMIT 1000`
      );
    } catch (blogErr) {
      console.warn('[Sitemap] blog DB unavailable, skipping blog URLs');
    }

    let liveDemos = [];
    try {
      liveDemos = await queryAsync(
        `SELECT seo_slug, COALESCE(updated_at, created_at) AS modified
         FROM live_demo
         WHERE is_active = 1 AND seo_slug IS NOT NULL AND seo_slug != ''
         ORDER BY id DESC
         LIMIT 500`
      );
    } catch (demoErr) {
      console.warn('[Sitemap] live_demo unavailable, skipping demo URLs');
    }

    const degreeCatalogs = REPORT_CATALOG_DEGREES.map((degree) => ({
      loc: `${SITE_BASE}/${degree}-final-year-project-report`,
      priority: '0.85',
    }));

    // sitemap.ejs: [0]=source-code categories, [1]=project source pages, [2]=reports, [3]=blogs
    const result = [categories || [], sourceCodes || [], sourceCodes || [], blogs || []];

    res.set('Content-Type', 'application/xml; charset=utf-8');
    res.set('Cache-Control', 'public, max-age=3600');
    res.render('sitemap', {
      result,
      lastupdate,
      siteBase: SITE_BASE,
      staticPages: STATIC_PAGES,
      degreeCatalogs,
      reportDegrees: REPORT_CATALOG_DEGREES,
      liveDemos: liveDemos || [],
      projectReportUrl,
      resolveProjectReportSeoSlug,
    });
  } catch (err) {
    console.error('[Sitemap Error]', err);
    res.set('Content-Type', 'application/xml; charset=utf-8');
    res.set('Cache-Control', 'public, max-age=600');
    res.status(200).send(minimalSitemapXml(lastupdate));
  }
});

module.exports = router;
