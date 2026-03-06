var express = require('express');
var dayjs = require('dayjs');
var pool = require('./pool'); // exports the callback-style mysql2 pool

// use mysql2's built-in promise wrapper (no promisify needed)
var db = pool.promise();

var routes = express.Router();

/** ------------------ Helpers ------------------ **/
var VIEW_FILTER = 'vwl.watched_seconds >= 60'; // view = >=60s

// 'YYYY-MM-DD HH:mm:ss'
function fmt(dt) {
  var y = dt.year();
  var m = String(dt.month() + 1).padStart(2, '0');
  var d = String(dt.date()).padStart(2, '0');
  var h = String(dt.hour()).padStart(2, '0');
  var i = String(dt.minute()).padStart(2, '0');
  var s = String(dt.second()).padStart(2, '0');
  return y + '-' + m + '-' + d + ' ' + h + ':' + i + ':' + s;
}

function rangeFromPreset(preset) {
  var end = dayjs().endOf('day');
  var start;
  if (preset === '7d') start = end.subtract(6, 'day').startOf('day');
  else if (preset === '28d') start = end.subtract(27, 'day').startOf('day');
  else if (preset === '90d') start = end.subtract(89, 'day').startOf('day');
  else throw new Error('Unsupported range');
  return { start: fmt(start), end: fmt(end) };
}

function yearMonthBounds(year) {
  var y = Number(year);
  var start = dayjs(y + '-01-01 00:00:00');
  var end   = dayjs(y + '-12-31 23:59:59');
  return { start: fmt(start), end: fmt(end) };
}

/** ------------------ Pages ------------------ **/

routes.get('/', async function (req, res) {
  // Totals (no date filter)
  const [totalsRows] = await db.query(
    `
    SELECT
      SUM(CASE WHEN ${VIEW_FILTER} THEN 1 ELSE 0 END) AS views,
      SUM(CASE WHEN ${VIEW_FILTER} THEN vwl.watched_seconds ELSE 0 END) AS watch_time_seconds
    FROM video_watch_logs vwl
    `
  );
  const totals = totalsRows[0] || { views: 0, watch_time_seconds: 0 };

  const [clicksRows] = await db.query(`SELECT COUNT(*) AS clicks FROM clicks`);
  const clicksTotal = clicksRows[0] || { clicks: 0 };

  res.render('analytics/index', {
    totals: {
      views: Number(totals.views || 0),
      watch_time_seconds: Number(totals.watch_time_seconds || 0),
      clicks: Number(clicksTotal.clicks || 0)
    }
  });
});

routes.get('/views', function (req, res) { res.render('analytics/views'); });
routes.get('/watch-time', function (req, res) { res.render('analytics/watch'); });
routes.get('/promoters', function (req, res) { res.render('analytics/promoters'); });

/** ------------------ APIs ------------------ **/

// Summary for a preset range
routes.get('/api/summary', async function (req, res) {
  try {
    var range = req.query.range || '7d';
    var { start, end } = rangeFromPreset(range);

    const [rows] = await db.query(
      `
      SELECT
        COUNT(*) AS views,
        COALESCE(SUM(vwl.watched_seconds), 0) AS watch_time_seconds
      FROM video_watch_logs vwl
      WHERE ${VIEW_FILTER}
        AND vwl.timestamp BETWEEN ? AND ?
      `,
      [start, end]
    );

    const row = rows[0] || {};
    res.json({
      ok: true,
      range, start, end,
      summary: {
        views: Number(row.views || 0),
        watch_time_seconds: Number(row.watch_time_seconds || 0)
      }
    });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

// Time series (daily or monthly) for views/watch
routes.get('/api/timeseries', async function (req, res) {
  try {
    var metric = req.query.metric || 'views';          // 'views' | 'watch'
    var granularity = req.query.granularity || 'daily';// 'daily' | 'monthly'
    var range = req.query.range;
    var year = req.query.year;

    var start, end;
    if (year) { ({ start, end } = yearMonthBounds(year)); }
    else if (range) { ({ start, end } = rangeFromPreset(range)); }
    else { ({ start, end } = rangeFromPreset('28d')); }

    // string bucket labels (avoid ONLY_FULL_GROUP_BY issues)
    var bucketExpr = (granularity === 'monthly')
      ? "DATE_FORMAT(vwl.timestamp, '%Y-%m')"      // 2025-09
      : "DATE_FORMAT(vwl.timestamp, '%Y-%m-%d')";  // 2025-09-07

    var sql;
    if (metric === 'watch') {
      sql = `
        SELECT t.bucket AS label, SUM(t.watched_seconds) AS value
        FROM (
          SELECT ${bucketExpr} AS bucket, vwl.watched_seconds
          FROM video_watch_logs vwl
          WHERE ${VIEW_FILTER} AND vwl.timestamp BETWEEN ? AND ?
        ) AS t
        GROUP BY t.bucket
        ORDER BY t.bucket ASC
      `;
    } else {
      sql = `
        SELECT t.bucket AS label, COUNT(*) AS value
        FROM (
          SELECT ${bucketExpr} AS bucket
          FROM video_watch_logs vwl
          WHERE ${VIEW_FILTER} AND vwl.timestamp BETWEEN ? AND ?
        ) AS t
        GROUP BY t.bucket
        ORDER BY t.bucket ASC
      `;
    }

    const [rows] = await db.query(sql, [start, end]);
    res.json({ ok: true, start, end, metric, granularity, points: rows });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

// By original URL (daily/monthly)
routes.get('/api/original-url', async function (req, res) {
  try {
    var granularity = req.query.granularity || 'daily';
    var range = req.query.range;
    var year = req.query.year;

    var start, end;
    if (year) { ({ start, end } = yearMonthBounds(year)); }
    else if (range) { ({ start, end } = rangeFromPreset(range)); }
    else { ({ start, end } = rangeFromPreset('28d')); }

    var bucketExpr = (granularity === 'monthly')
      ? "DATE_FORMAT(vwl.timestamp, '%Y-%m')"
      : "DATE_FORMAT(vwl.timestamp, '%Y-%m-%d')";

    const sql = `
      SELECT t.bucket AS bucket, t.original_url, COUNT(*) AS views, SUM(t.watched_seconds) AS watch_time_seconds
      FROM (
        SELECT ${bucketExpr} AS bucket, l.original_url, vwl.watched_seconds
        FROM video_watch_logs vwl
        JOIN links l ON l.id = vwl.link_id
        WHERE ${VIEW_FILTER} AND vwl.timestamp BETWEEN ? AND ?
      ) AS t
      GROUP BY t.bucket, t.original_url
      ORDER BY t.bucket ASC, views DESC
    `;

    const [rows] = await db.query(sql, [start, end]);
    res.json({ ok: true, start, end, granularity, items: rows });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

// Promoters: all promoters day-wise for a month
routes.get('/api/promoters/monthly-grid', async function (req, res) {
  try {
    var month = req.query.month;           // 'YYYY-MM' (required)
    var date  = req.query.date || null;    // 'YYYY-MM-DD' (optional exact day filter)

    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ ok: false, error: 'month=YYYY-MM required' });
    }

    // build range
    var start = fmt(dayjs(month + '-01').startOf('month'));
    var end   = fmt(dayjs(month + '-01').endOf('month'));

    // if date is provided and valid, tighten to that exact day
    var params = [];
    var whereRange = 'vwl.timestamp BETWEEN ? AND ?';
    params.push(start, end);

    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      // replace month-range with single-day range
      var dStart = fmt(dayjs(date + ' 00:00:00'));
      var dEnd   = fmt(dayjs(date + ' 23:59:59'));
      whereRange = 'vwl.timestamp BETWEEN ? AND ?';
      params = [dStart, dEnd];
    }

    const sql = `
      SELECT
        s.id   AS promoter_id,
        s.name AS promoter_name,
        COUNT(*)                       AS views,
        COALESCE(SUM(vwl.watched_seconds), 0) AS watch_time_seconds
      FROM video_watch_logs vwl
      JOIN links l      ON l.id  = vwl.link_id
      JOIN shopkeeper s ON s.id  = l.promoter_id
      WHERE ${VIEW_FILTER}
        AND ${whereRange}
      GROUP BY s.id, s.name
      ORDER BY views DESC, watch_time_seconds DESC
    `;

    const [rows] = await db.query(sql, params);
    res.json({ ok: true, month, date: date || null, rows });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});


// Promoter drill-down: one promoter day-wise for a month
routes.get('/api/promoters/:id/daily', async function (req, res) {
  try {
    var promoterId = Number(req.params.id);
    var month = req.query.month; // 'YYYY-MM'
    if (!promoterId) return res.status(400).json({ ok: false, error: 'Invalid promoter id' });
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ ok: false, error: 'month=YYYY-MM required' });
    }
    var start = fmt(dayjs(month + '-01').startOf('month'));
    var end   = fmt(dayjs(month + '-01').endOf('month'));

    const [promRows] = await db.query(`SELECT id, name, number FROM shopkeeper WHERE id = ?`, [promoterId]);
    const promoter = promRows[0] || null;

    const sql = `
      SELECT
        t.day,
        COUNT(*) AS views,
        SUM(t.watched_seconds) AS watch_time_seconds
      FROM (
        SELECT DATE_FORMAT(vwl.timestamp, '%Y-%m-%d') AS day, vwl.watched_seconds
        FROM video_watch_logs vwl
        JOIN links l ON l.id = vwl.link_id
        WHERE ${VIEW_FILTER}
          AND l.promoter_id = ?
          AND vwl.timestamp BETWEEN ? AND ?
      ) AS t
      GROUP BY t.day
      ORDER BY t.day ASC
    `;

    const [rows] = await db.query(sql, [promoterId, start, end]);

    res.json({ ok: true, promoter, month, rows });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

module.exports = routes;
