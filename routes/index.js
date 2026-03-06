/**
 * Central router - mounts all application routes
 * Enterprise structure: single entry point for routing
 * Order: specific routes first, core (/) last
 */
const express = require('express');
const router = express.Router();

// ========== Auth ==========
router.use('/auth', require('./auth'));

// ========== Additional core pages (before main core) ==========
router.use('/index1', require('./index1'));
router.use('/index2', require('./index2'));

// ========== Admin ==========
router.use('/admin', require('./admin'));

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

// ========== Affiliate / Blog ==========
router.use('/affiliate/config', require('./Affiliation/config'));
router.use('/affiliateblog', require('./Affiliation/blog'));
router.use('/affiliate', require('./Affiliation/index'));

// ========== Analytics ==========
router.use('/analytics', require('./analytics'));

// ========== CRM ==========
router.use('/freelancing', require('./Freelancing/index'));
router.use('/shopkeeper', require('./Shopkeeper/index'));

// ========== Blog Module ==========
router.use('/blog-admin', require('./blog/admin'));
router.use('/blog-writer', require('./blog/writer'));

// ========== Degree Reports ==========


// ========== Source Code ==========
router.use('/final-year-projects-source-code', require('./source_code'));

// ========== API / Trends ==========
router.use('/api', require('./api'));
router.use('/trending', require('./Trends/index'));

// ========== Sales ==========
router.use('/oldsales', require('./Freelancing/sales'));
router.use('/sales', require('./sales'));

// ========== Main / Core (home, blog, project pages) - MOUNT LAST ==========
router.use('/', require('./core'));

module.exports = router;
