// services/analyticsService.js
const pool = require('../routes/pool');
const util = require('util');

const queryAsync = util.promisify(pool.query).bind(pool);



// Helper to run SQL
async function q(sql, params = []) {
  const rows = await queryAsync(sql, params);
  return rows;
}

// Date helpers for filters (optional; can filter on UI too)
function dateRangeWhere(startDate, endDate, column = 'timestamp') {
  const where = [];
  const vals = [];
  if (startDate) { where.push(`${column} >= ?`); vals.push(startDate + ' 00:00:00'); }
  if (endDate)   { where.push(`${column} <= ?`); vals.push(endDate + ' 23:59:59'); }
  return { where: where.length ? `AND ${where.join(' AND ')}` : '', vals };
}

/** 
 * WATCH TIME & VIEWS (ONLY watched_seconds > 60) 
 * Grouping: daily or monthly
 * Scope: overall, by original_url, by promoter
 */

async function getOverallWatchTimeDaily(startDate, endDate) {
  const { where, vals } = dateRangeWhere(startDate, endDate, 'v.timestamp');
  const sql = `
    SELECT DATE(v.timestamp) AS day,
           SUM(v.watched_seconds) AS watch_seconds,
           COUNT(*) AS views,
           COUNT(DISTINCT v.cookie_id) AS unique_viewers,
           AVG(v.watched_seconds) AS avg_watch_seconds
    FROM video_watch_logs v
    WHERE v.watched_seconds > 60 ${where}
    GROUP BY day
    ORDER BY day;
  `;
  return q(sql, vals);
}

async function getOverallWatchTimeMonthly(startDate, endDate) {
  const { where, vals } = dateRangeWhere(startDate, endDate, 'v.timestamp');
  const sql = `
    SELECT DATE_FORMAT(v.timestamp, '%Y-%m') AS month,
           SUM(v.watched_seconds) AS watch_seconds,
           COUNT(*) AS views,
           COUNT(DISTINCT v.cookie_id) AS unique_viewers,
           AVG(v.watched_seconds) AS avg_watch_seconds
    FROM video_watch_logs v
    WHERE v.watched_seconds > 60 ${where}
    GROUP BY month
    ORDER BY month;
  `;
  return q(sql, vals);
}

async function getUrlWatchTimeDaily(startDate, endDate) {
  const { where, vals } = dateRangeWhere(startDate, endDate, 'v.timestamp');
  const sql = `
    SELECT l.original_url,
           l.short_code,
           DATE(v.timestamp) AS day,
           SUM(v.watched_seconds) AS watch_seconds,
           COUNT(*) AS views,
           COUNT(DISTINCT v.cookie_id) AS unique_viewers,
           AVG(v.watched_seconds) AS avg_watch_seconds
    FROM video_watch_logs v
    JOIN links l ON v.link_id = l.id
    WHERE v.watched_seconds > 60 ${where}
    GROUP BY l.id, day
    ORDER BY l.original_url, day;
  `;
  return q(sql, vals);
}

async function getUrlWatchTimeMonthly(startDate, endDate) {
  const { where, vals } = dateRangeWhere(startDate, endDate, 'v.timestamp');
  const sql = `
    SELECT l.original_url,
           l.short_code,
           DATE_FORMAT(v.timestamp, '%Y-%m') AS month,
           SUM(v.watched_seconds) AS watch_seconds,
           COUNT(*) AS views,
           COUNT(DISTINCT v.cookie_id) AS unique_viewers,
           AVG(v.watched_seconds) AS avg_watch_seconds
    FROM video_watch_logs v
    JOIN links l ON v.link_id = l.id
    WHERE v.watched_seconds > 60 ${where}
    GROUP BY l.id, month
    ORDER BY l.original_url, month;
  `;
  return q(sql, vals);
}

async function getPromoterWatchTimeDaily(startDate, endDate) {
  const { where, vals } = dateRangeWhere(startDate, endDate, 'v.timestamp');
  const sql = `
    SELECT s.id AS promoter_id,
           s.name AS promoter_name,
           DATE(v.timestamp) AS day,
           SUM(v.watched_seconds) AS watch_seconds,
           COUNT(*) AS views,
           COUNT(DISTINCT v.cookie_id) AS unique_viewers,
           AVG(v.watched_seconds) AS avg_watch_seconds
    FROM video_watch_logs v
    JOIN links l ON v.link_id = l.id
    JOIN shopkeeper s ON l.promoter_id = s.id
    WHERE v.watched_seconds > 60 ${where}
    GROUP BY promoter_id, day
    ORDER BY promoter_name, day;
  `;
  return q(sql, vals);
}

async function getPromoterWatchTimeMonthly(startDate, endDate) {
  const { where, vals } = dateRangeWhere(startDate, endDate, 'v.timestamp');
  const sql = `
    SELECT s.id AS promoter_id,
           s.name AS promoter_name,
           DATE_FORMAT(v.timestamp, '%Y-%m') AS month,
           SUM(v.watched_seconds) AS watch_seconds,
           COUNT(*) AS views,
           COUNT(DISTINCT v.cookie_id) AS unique_viewers,
           AVG(v.watched_seconds) AS avg_watch_seconds
    FROM video_watch_logs v
    JOIN links l ON v.link_id = l.id
    JOIN shopkeeper s ON l.promoter_id = s.id
    WHERE v.watched_seconds > 60 ${where}
    GROUP BY promoter_id, month
    ORDER BY promoter_name, month;
  `;
  return q(sql, vals);
}

/** Summary tiles (YouTube-style) */
async function getSummaryTiles(startDate, endDate) {
  const { where, vals } = dateRangeWhere(startDate, endDate, 'v.timestamp');
  const totalSql = `
    SELECT 
      SUM(v.watched_seconds) AS total_watch_seconds,
      COUNT(*) AS total_views,
      COUNT(DISTINCT v.cookie_id) AS total_unique_viewers,
      AVG(v.watched_seconds) AS avg_watch_seconds
    FROM video_watch_logs v
    WHERE v.watched_seconds > 60 ${where};
  `;
  const [totals] = await q(totalSql, vals);

  const topVideosSql = `
    SELECT l.original_url, l.short_code,
           SUM(v.watched_seconds) AS watch_seconds,
           COUNT(*) AS views
    FROM video_watch_logs v
    JOIN links l ON v.link_id = l.id
    WHERE v.watched_seconds > 60 ${where}
    GROUP BY l.id
    ORDER BY watch_seconds DESC
    LIMIT 5;
  `;
  const topVideos = await q(topVideosSql, vals);

  const topPromotersSql = `
    SELECT s.name AS promoter_name,
           SUM(v.watched_seconds) AS watch_seconds,
           COUNT(*) AS views
    FROM video_watch_logs v
    JOIN links l ON v.link_id = l.id
    JOIN shopkeeper s ON l.promoter_id = s.id
    WHERE v.watched_seconds > 60 ${where}
    GROUP BY s.id
    ORDER BY watch_seconds DESC
    LIMIT 5;
  `;
  const topPromoters = await q(topPromotersSql, vals);

  return { totals, topVideos, topPromoters };
}

module.exports = {
  getOverallWatchTimeDaily,
  getOverallWatchTimeMonthly,
  getUrlWatchTimeDaily,
  getUrlWatchTimeMonthly,
  getPromoterWatchTimeDaily,
  getPromoterWatchTimeMonthly,
  getSummaryTiles
};
