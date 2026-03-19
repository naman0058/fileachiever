/**
 * Blog Content Writer - Login, dashboard, write SEO-friendly blogs with internal linking
 */
require('dotenv').config();
const express = require('express');
const router = express.Router();
const pool2 = require('../pool2');
const pool = require('../pool');
const slugify = require('slugify');
const crypto = require('crypto');
const util = require('util');
const queryAsync = util.promisify(pool2.query).bind(pool2);
const queryPool = util.promisify(pool.query).bind(pool);

const SALT = process.env.BLOG_WRITER_SALT || 'filemakr-blog-writer-2024';
const ITERATIONS = 100000;
const KEYLEN = 64;
const DIGEST = 'sha512';
const SITE_BASE = process.env.SITE_BASE_URL || 'https://www.filemakr.com';

function hashPassword(password) {
  return crypto.pbkdf2Sync(password, SALT, ITERATIONS, KEYLEN, DIGEST).toString('hex');
}

function verifyPassword(password, hash) {
  return hash === hashPassword(password);
}

function requireWriter(req, res, next) {
  if (!req.session || !req.session.blogWriter) {
    return res.redirect('/blog-writer/login');
  }
  next();
}

// Root /blog-writer redirects to login or dashboard
router.get('/', (req, res) => {
  if (req.session && req.session.blogWriter) {
    return res.redirect('/blog-writer/dashboard');
  }
  res.redirect('/blog-writer/login');
});

router.get('/login', (req, res) => {
  if (req.session && req.session.blogWriter) {
    return res.redirect('/blog-writer/dashboard');
  }
  res.render('blog/writer/login', { msg: '' });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.render('blog/writer/login', { msg: 'Email and password required.' });
  }
  try {
    const rows = await queryAsync(
      'SELECT id, name, email, password_hash, status FROM blog_writers WHERE email = ? LIMIT 1',
      [email.trim().toLowerCase()]
    );
    if (!rows.length) {
      return res.render('blog/writer/login', { msg: 'Invalid credentials.' });
    }
    if (rows[0].status !== 'active') {
      return res.render('blog/writer/login', { msg: 'Account inactive. Contact admin.' });
    }
    if (!verifyPassword(password, rows[0].password_hash)) {
      return res.render('blog/writer/login', { msg: 'Invalid credentials.' });
    }
    req.session.blogWriter = { id: rows[0].id, name: rows[0].name, email: rows[0].email };
    res.redirect('/blog-writer/dashboard');
  } catch (err) {
    console.error('blog writer login:', err);
    res.render('blog/writer/login', { msg: 'Login failed.' });
  }
});

router.get('/logout', (req, res) => {
  req.session.blogWriter = null;
  res.redirect('/blog-writer/login');
});

router.get('/dashboard', requireWriter, async (req, res) => {
  try {
    const myBlogs = await queryAsync(
      'SELECT id, title, slug, status, created_at FROM blogs WHERE author_id = ? ORDER BY created_at DESC LIMIT 50',
      [req.session.blogWriter.id]
    );
    const total = await queryAsync('SELECT COUNT(*) as c FROM blogs WHERE author_id = ?', [req.session.blogWriter.id]);
    res.render('blog/writer/dashboard', { blogs: myBlogs || [], total: total[0]?.c || 0, user: req.session.blogWriter });
  } catch (err) {
    console.error('blog writer dashboard:', err);
    res.status(500).send('Error loading dashboard.');
  }
});

// Map project assign to URL prefix
function projectUrlPrefix(assign) {
  if (!assign) return 'btech-final-year-project-report';
  const a = String(assign).toLowerCase().replace(/[.\s]/g, '');
  const map = {
    'btech': 'btech-final-year-project-report',
    'mtech': 'mtech-final-year-project-report',
    'bca': 'bca-final-year-project-report',
    'mca': 'mca-final-year-project-report',
    'be': 'be-final-year-project-report',
    'me': 'me-final-year-project-report',
    'ieee': 'ieee-standard-project-report'
  };
  return map[a] || 'btech-final-year-project-report';
}

router.get('/api/internal-links', requireWriter, async (req, res) => {
  try {
    const links = [];

    // 1. Blogs from automate_blog
    const blogRows = await queryAsync(
      'SELECT id, title, slug, meta_title, category FROM blogs WHERE slug IS NOT NULL AND slug != "" ORDER BY created_at DESC LIMIT 500'
    );
    blogRows.forEach(r => {
      links.push({
        id: 'blog-' + r.id,
        title: r.meta_title || r.title,
        slug: r.slug,
        url: `/blog/${r.slug}`,
        fullUrl: `${SITE_BASE}/blog/${r.slug}`,
        category: r.category || 'blog',
        type: 'blog'
      });
    });

    // 2. Source code from fileachiever (source_code table)
    try {
      const scRows = await queryPool(
        'SELECT id, name, seo_name, description, category FROM source_code WHERE seo_name IS NOT NULL AND seo_name != "" ORDER BY id DESC LIMIT 500'
      );
      scRows.forEach(r => {
        links.push({
          id: 'sc-' + r.id,
          title: r.name || r.seo_name,
          slug: r.seo_name,
          url: `/${r.seo_name}/source-code`,
          fullUrl: `${SITE_BASE}/${r.seo_name}/source-code`,
          category: r.category || 'source-code',
          type: 'source code'
        });
      });
    } catch (scErr) {
      console.error('internal-links source_code:', scErr.message);
    }

    // 3. Projects from fileachiever (project table)
    try {
      const projRows = await queryPool(
        'SELECT id, name, seo_name, assign FROM project WHERE seo_name IS NOT NULL AND seo_name != "" ORDER BY id DESC LIMIT 500'
      );
      projRows.forEach(r => {
        const prefix = projectUrlPrefix(r.assign);
        const slug = r.seo_name;
        const url = `/${prefix}-${slug}`;
        links.push({
          id: 'proj-' + r.id,
          title: r.name || r.seo_name,
          slug: slug,
          url: url,
          fullUrl: `${SITE_BASE}${url}`,
          category: r.assign || 'project',
          type: 'report'
        });
      });
    } catch (projErr) {
      console.error('internal-links project:', projErr.message);
    }

    // Sort by title for easier search
    links.sort((a, b) => (a.title || '').localeCompare(b.title || ''));

    res.json({ links });
  } catch (err) {
    console.error('internal-links:', err);
    res.status(500).json({ links: [] });
  }
});

router.get('/write', requireWriter, (req, res) => {
  res.render('blog/writer/write', { blog: null, internalLinks: [], siteBase: SITE_BASE });
});

router.get('/edit/:id', requireWriter, async (req, res) => {
  try {
    const [blog] = await queryAsync('SELECT * FROM blogs WHERE id = ? AND author_id = ?', [req.params.id, req.session.blogWriter.id]);
    if (!blog) {
      return res.redirect('/blog-writer/dashboard');
    }
    res.render('blog/writer/write', { blog, siteBase: SITE_BASE });
  } catch (err) {
    console.error('blog writer edit:', err);
    res.redirect('/blog-writer/dashboard');
  }
});

router.post('/save', requireWriter, async (req, res) => {
  try {
    const {
      id, title, slug, content, meta_title, meta_description,
      focus_keyword, canonical_url, category, meta_keywords, tags, meta_abstract,
      status, schema_markup
    } = req.body;

    const authorId = req.session.blogWriter.id;

    let finalSlug = (slug || '').trim();
    if (!finalSlug && title) {
      finalSlug = slugify(title, { lower: true, strict: true });
    }
    if (!finalSlug) {
      return res.json({ success: false, msg: 'Slug is required.' });
    }

    const expectedCanonical = `${SITE_BASE.replace(/\/$/, '')}/blog/${finalSlug}`;
    let finalCanonical = (canonical_url || '').trim();
    if (!finalCanonical) {
      finalCanonical = expectedCanonical;
    } else {
      const normalized = finalCanonical.replace(/\/$/, '');
      if (normalized !== expectedCanonical.replace(/\/$/, '')) {
        return res.json({ success: false, msg: 'Canonical URL must match slug URL: ' + expectedCanonical });
      }
    }

    let validSchema = null;
    if (schema_markup && String(schema_markup).trim()) {
      try {
        const parsed = JSON.parse(schema_markup.trim());
        if (!parsed['@context'] || !parsed['@type']) {
          return res.json({ success: false, msg: 'Schema markup must include @context and @type for valid JSON-LD.' });
        }
        validSchema = JSON.stringify(parsed);
      } catch (parseErr) {
        return res.json({ success: false, msg: 'Invalid Schema Markup: must be valid JSON.' });
      }
    }

    const linkCount = (content || '').match(/href="[^"]*\/blog\/[^"]+"/gi)?.length || 0;
    const wordCount = (content || '').replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
    const readingTime = Math.max(1, Math.ceil(wordCount / 200));
    const thumb = req.body.thumbnail_url || null;

    if (id) {
      const [existing] = await queryAsync('SELECT id FROM blogs WHERE id = ? AND author_id = ?', [id, authorId]);
      if (!existing) {
        return res.json({ success: false, msg: 'Blog not found.' });
      }
      await queryAsync(
        `UPDATE blogs SET
          title = ?, slug = ?, content = ?, meta_title = ?, meta_description = ?,
          focus_keyword = ?, canonical_url = ?, category = ?, meta_keywords = ?, tags = ?, meta_abstract = ?,
          schema_markup = ?, thumbnail_url = IFNULL(?, thumbnail_url), status = ?, reading_time_minutes = ?, internal_links_count = ?, updated_at = NOW()
        WHERE id = ? AND author_id = ?`,
        [
          title, finalSlug, content, meta_title || title, meta_description,
          focus_keyword || null, finalCanonical, category || 'all',
          meta_keywords || null, tags || null, meta_abstract || null,
          validSchema, thumb || null, status || 'draft', readingTime, linkCount, id, authorId
        ]
      );
      return res.json({ success: true, msg: 'Blog updated.', id });
    }

    const [dup] = await queryAsync('SELECT id FROM blogs WHERE slug = ?', [finalSlug]);
    if (dup) {
      return res.json({ success: false, msg: 'Slug already exists. Choose another.' });
    }

    const [insertResult] = await queryAsync(
      `INSERT INTO blogs (
        title, slug, content, meta_title, meta_description,
        focus_keyword, canonical_url, category, meta_keywords, tags, meta_abstract,
        schema_markup, thumbnail_url, status, author_id, reading_time_minutes, internal_links_count
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        title, finalSlug, content, meta_title || title, meta_description,
        focus_keyword || null, finalCanonical, category || 'all',
        meta_keywords || null, tags || null, meta_abstract || null,
        validSchema, thumb, status || 'draft', authorId, readingTime, linkCount
      ]
    );
    res.json({ success: true, msg: 'Blog saved.', id: insertResult.insertId });
  } catch (err) {
    console.error('blog writer save:', err);
    res.json({ success: false, msg: 'Save failed.' });
  }
});

module.exports = router;
