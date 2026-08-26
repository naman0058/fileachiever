/**
 * Central router - mounts all application routes
 * Enterprise structure: single entry point for routing
 * Order: specific routes first, core (/) last
 */
const express = require('express');
const router = express.Router();

// Legacy URLs: app moved from /shopkeeper to /mern-training-program. Keep /shopkeeper/wp-content/* + files for public assets.
router.use((req, res, next) => {
  if (req.path === '/shopkeeper' || req.path === '/shopkeeper/') {
    const q = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : '';
    return res.redirect(301, '/mern-training-program' + q);
  }
  if (!req.path.startsWith('/shopkeeper/')) return next();
  if (req.path.startsWith('/shopkeeper/wp-content')) return next();
  if (req.path === '/shopkeeper/animation1.json') return next();
  const q = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : '';
  return res.redirect(301, '/mern-training-program' + req.path.slice('/shopkeeper'.length) + q);
});

// ========== Auth ==========
router.use('/auth', require('./auth'));

// ========== Legacy homepage URLs → canonical `/` ==========
router.get(['/index1', '/index1/', '/index2', '/index2/'], (req, res) => {
  res.redirect(301, '/');
});

// ========== Backoffice (admin) - /admin redirects for legacy bookmarks ==========
router.get(/^\/admin\/?(.*)$/, (req, res) => res.redirect('/backoffice' + (req.params[0] ? '/' + req.params[0] : '')));
router.use('/backoffice', require('./admin'));

// ========== Project / Source Code ==========
router.use('/programming_language', require('./programming_language'));
router.use('/project', require('./project'));
router.use('/preview', require('./preview'));
router.use('/readymade-project-file', require('./allprojects'));
router.use('/customization', require('./customization'));
router.use('/user-verification', require('./user-verification'));
router.use('/make-your-own-project', require('./ownproject'));
router.use('/user-project', require('./user_project'));

// ========== SEO / Static ==========
router.use('/.htaccess', require('./htaccess'));
router.use('/robots.txt', require('./robot'));
router.use('/sitemap.xml', require('./sitemap'));
router.use('/ads.txt', require('./ads'));

// ========== Content ==========
router.use('/ieee-standard-project-report', require('./ieee/ieeeproject'));
router.use('/class-12-physics-notes-download', require('./notes'));

// ========== Daily attendance (team email link, no affiliate login) ==========
router.use('/', require('./dailyAttendanceTask'));

// ========== Affiliate / Blog ==========
router.use('/affiliate/config', require('./Affiliation/config'));
router.use('/affiliateblog', require('./Affiliation/blog'));
router.use('/affiliate', require('./Affiliation/index'));

// ========== Analytics ==========
router.use('/analytics', require('./analytics'));

// ========== CRM ==========
router.use('/freelancing', require('./Freelancing/index'));
router.use('/mern-training-program', require('./Shopkeeper/index'));

// ========== Blog Module ==========
router.use('/blog-admin', require('./blog/admin'));
router.use('/blog-writer', require('./blog/writer'));

// ========== Degree Reports ==========


// ========== Source Code ==========
router.use('/final-year-projects-source-code', require('./source_code'));

// ========== API ==========
router.use('/api', require('./api'));

// ========== Report Sales (Team + Admin) — separate from Freelancing Sales / PRM / PRC ==========
router.use('/report-sales', require('./report-sales'));
router.use('/report-sales-admin', require('./report-sales-admin'));

// ========== Setup Support Portal (dedicated login + panel) ==========
router.use('/setup-support', require('./setup-support'));

// ========== Source Code Manager Portal (screenshot + demo management) ==========
router.use('/source-code-manager', require('./source-code-manager'));

// ========== Project Report Manager Portal (headings/subheadings/body per source code) ==========
router.use('/project-report-manager', require('./project-report-manager'));

// ========== MERN Training Program Manager (onboarding tools + affiliate task routes) ==========
router.use('/mern-training-manager', require('./mern-training-manager'));

// ========== Project Report Creator Portal (create & download customized reports) ==========
router.use('/project-report-creator', require('./project-report-creator'));

// ========== Sales ==========
router.use('/oldsales', require('./Freelancing/sales'));
router.use('/sales', require('./sales'));

// ========== Main / Core (home, blog, project pages) - MOUNT LAST ==========
router.use('/', require('./core'));

module.exports = router;
