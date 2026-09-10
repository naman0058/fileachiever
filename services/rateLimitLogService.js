'use strict';

const util = require('util');
const pool = require('../routes/pool');
const queryAsync = util.promisify(pool.query).bind(pool);

let ensurePromise = null;
const burstLogMem = new Map();
const BURST_LOG_INTERVAL_MS = 45_000;

async function ensureTables() {
  if (ensurePromise) return ensurePromise;
  ensurePromise = (async () => {
    await queryAsync(`
      CREATE TABLE IF NOT EXISTS rate_limit_429_log (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        route VARCHAR(255) NOT NULL,
        method VARCHAR(8) NOT NULL,
        ip_address VARCHAR(64) NULL,
        session_key VARCHAR(128) NULL,
        user_agent VARCHAR(512) NULL,
        is_bot TINYINT(1) NOT NULL DEFAULT 0,
        bot_name VARCHAR(64) NULL,
        bot_verified TINYINT(1) NOT NULL DEFAULT 0,
        limit_key VARCHAR(255) NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_rl429_created (created_at),
        KEY idx_rl429_ip (ip_address),
        KEY idx_rl429_route (route, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await queryAsync(`
      CREATE TABLE IF NOT EXISTS funnel_burst_suppression_log (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        funnel_id VARCHAR(64) NOT NULL,
        ip_address VARCHAR(64) NULL,
        session_key VARCHAR(128) NULL,
        reason VARCHAR(32) NOT NULL DEFAULT 'funnel_burst',
        suppressed_event_count INT UNSIGNED NOT NULL DEFAULT 1,
        first_seen DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_seen DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        user_agent VARCHAR(512) NULL,
        PRIMARY KEY (id),
        KEY idx_fbsl_funnel (funnel_id, first_seen),
        KEY idx_fbsl_session (session_key, first_seen)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  })().catch((err) => {
    ensurePromise = null;
    throw err;
  });
  return ensurePromise;
}

async function log429(entry) {
  try {
    await ensureTables();
    await queryAsync('INSERT INTO rate_limit_429_log SET ?', [{
      route: String(entry.route || '').slice(0, 255),
      method: String(entry.method || 'GET').slice(0, 8),
      ip_address: entry.ip_address ? String(entry.ip_address).slice(0, 64) : null,
      session_key: entry.session_key ? String(entry.session_key).slice(0, 128) : null,
      user_agent: entry.user_agent ? String(entry.user_agent).slice(0, 512) : null,
      is_bot: entry.is_bot ? 1 : 0,
      bot_name: entry.bot_name ? String(entry.bot_name).slice(0, 64) : null,
      bot_verified: entry.bot_verified ? 1 : 0,
      limit_key: entry.limit_key ? String(entry.limit_key).slice(0, 255) : null
    }]);
  } catch (err) {
    console.error('[rate-limit-429]', err.message);
  }
}

/**
 * One summary row per funnel+session per ~45s (not per suppressed request).
 */
async function logBurstSuppression(entry) {
  try {
    await ensureTables();
    const funnelId = String(entry.funnel_id || '').slice(0, 64);
    const sessionKey = String(entry.session_key || 'anon').slice(0, 128);
    const memKey = `${funnelId}:${sessionKey}`;
    const now = Date.now();
    const pending = Number(entry.suppressed_count) || 1;

    let mem = burstLogMem.get(memKey);
    if (!mem) {
      mem = { rowId: null, lastDbWrite: 0, pending: 0 };
      burstLogMem.set(memKey, mem);
    }
    mem.pending += pending;

    if (mem.rowId && now - mem.lastDbWrite < BURST_LOG_INTERVAL_MS) {
      return;
    }

    if (mem.rowId && now - mem.lastDbWrite >= BURST_LOG_INTERVAL_MS) {
      const add = mem.pending;
      mem.pending = 0;
      mem.lastDbWrite = now;
      await queryAsync(
        `UPDATE funnel_burst_suppression_log
         SET suppressed_event_count = suppressed_event_count + ?,
             last_seen = NOW()
         WHERE id = ?`,
        [add, mem.rowId]
      );
      return;
    }

    const add = mem.pending;
    mem.pending = 0;
    mem.lastDbWrite = now;
    const result = await queryAsync('INSERT INTO funnel_burst_suppression_log SET ?', [{
      funnel_id: funnelId,
      ip_address: entry.ip_address ? String(entry.ip_address).slice(0, 64) : null,
      session_key: sessionKey,
      reason: String(entry.reason || 'funnel_burst').slice(0, 32),
      suppressed_event_count: add,
      user_agent: entry.user_agent ? String(entry.user_agent).slice(0, 512) : null
    }]);
    mem.rowId = result && result.insertId ? result.insertId : mem.rowId;
  } catch (err) {
    console.error('[burst-suppression-log]', err.message);
  }
}

module.exports = { ensureTables, log429, logBurstSuppression };
