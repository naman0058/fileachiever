/**
 * Token-based daily attendance task setup for team members (no /affiliate login).
 * JWT in query/body: DAILY_TASK_LINK_SECRET
 */
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const util = require('util');
const pool = require('./pool');
const queryAsync = util.promisify(pool.query).bind(pool);
const ig = require('./instagramGraphHelpers');

function dailyTeamSecret() {
  return process.env.DAILY_TASK_LINK_SECRET;
}

function verifyDailyTeamToken(req, res, next) {
  const secret = dailyTeamSecret();
  if (!secret) {
    return res.status(503).send('Daily team links are not configured (missing DAILY_TASK_LINK_SECRET).');
  }
  const token = req.query.t || req.body.t;
  if (!token) {
    return res.status(403).send('Invalid or missing link. Use the URL from your morning email.');
  }
  try {
    const payload = jwt.verify(token, secret);
    if (payload.typ !== 'daily_team') {
      return res.status(403).send('Invalid link.');
    }
    req.dailyTeamJwt = token;
    next();
  } catch (e) {
    return res
      .status(403)
      .send(
        'This link has expired or is invalid. Wait for the next morning email or ask an affiliate admin to set the task at /affiliate/create-task.'
      );
  }
}

router.get('/daily-attendance/task', verifyDailyTeamToken, async (req, res) => {
  try {
    const rows = await queryAsync(
      `SELECT id, title, description FROM task 
       WHERE task_type = 'daily' AND DATE(created_at) = CURDATE() 
       ORDER BY id DESC LIMIT 1`
    );
    res.render('dailyAttendance/task', {
      token: req.dailyTeamJwt,
      existingDaily: rows[0] || null,
      msg: req.query.msg || '',
      error: null
    });
  } catch (e) {
    res.status(500).send('Could not load task data.');
  }
});

router.post('/daily-attendance/task', verifyDailyTeamToken, async (req, res) => {
  const token = req.dailyTeamJwt;
  let { title, description, task_template } = req.body;

  try {
    if (task_template === 'instagram') {
      const payload = await ig.getLatestInstagramDailyTaskPayload();
      title = payload.title;
      description = payload.descriptionHtml;
    }

    const rows = await queryAsync(
      `SELECT id FROM task WHERE task_type = 'daily' AND DATE(created_at) = CURDATE() ORDER BY id DESC LIMIT 1`
    );

    if (rows[0]) {
      await queryAsync(`UPDATE task SET title = ?, description = ?, task_type = 'daily' WHERE id = ?`, [
        title,
        description,
        rows[0].id
      ]);
    } else {
      await queryAsync(
        `INSERT INTO task (title, description, task_type, created_at) VALUES (?, ?, 'daily', NOW())`,
        [title, description]
      );
    }

    return res.redirect(`/daily-attendance/task?t=${encodeURIComponent(token)}&msg=saved`);
  } catch (err) {
    console.error('daily-attendance task POST:', err);
    let errorMsg = err.message || 'Something went wrong.';
    if (err.code === 'INSTAGRAM_NOT_CONFIGURED') {
      errorMsg = 'Instagram is not configured in Affiliate → Config.';
    } else if (err.code === 'NO_MEDIA') {
      errorMsg = 'No Instagram media found.';
    } else if (err.response?.data?.error) {
      errorMsg = ig.instagramApiUserFacingMessage(err);
    }

    const rows = await queryAsync(
      `SELECT id, title, description FROM task 
       WHERE task_type = 'daily' AND DATE(created_at) = CURDATE() 
       ORDER BY id DESC LIMIT 1`
    );
    return res.render('dailyAttendance/task', {
      token,
      existingDaily: rows[0] || null,
      msg: '',
      error: errorMsg
    });
  }
});

router.get('/daily-attendance/api/latest-instagram', verifyDailyTeamToken, async (req, res) => {
  try {
    const payload = await ig.getLatestInstagramDailyTaskPayload();
    return res.json(payload);
  } catch (err) {
    if (err.code === 'INSTAGRAM_NOT_CONFIGURED') {
      return res.status(400).json({ error: 'Instagram is not configured in Affiliate → Config.' });
    }
    if (err.code === 'NO_MEDIA') {
      return res.status(404).json({ error: 'No Instagram media found for this account.' });
    }
    return res.status(500).json({ error: ig.instagramApiUserFacingMessage(err) });
  }
});

module.exports = router;
