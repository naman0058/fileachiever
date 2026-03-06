

var express = require('express');
var router = express.Router();
var mysql = require('mysql')
var pool = require('./pool')
const util = require('util');
const queryAsync = util.promisify(pool.query).bind(pool);


const cron = require("node-cron");


cron.schedule("0 0 * * *", async () => {
  console.log('✅ Cron runs at 12:00 AM IST');

  // Get yesterday's date (because today just started)
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const endDate = yesterday.toISOString().split("T")[0]; // format: YYYY-MM-DD

  try {
    // ===================== Leaderboard (Main) =====================
    const [leaderboardRows] = await queryAsync(
      `UPDATE leaderboard SET status = 'closed' WHERE end_date = ? AND status = 'active'`,
      [endDate]
    );

    if (leaderboardRows.affectedRows > 0) {
      console.log(`✅ Closed leaderboard(s) ending on ${endDate}`);

      const [nextLeaderboard] = await queryAsync(
        `SELECT id FROM leaderboard WHERE start_date > ? ORDER BY start_date ASC LIMIT 1`,
        [endDate]
      );

      if (nextLeaderboard.length > 0) {
        const nextId = nextLeaderboard[0].id;
        await queryAsync(`UPDATE leaderboard SET status = 'active' WHERE id = ?`, [nextId]);
        console.log(`🎯 Activated leaderboard ID: ${nextId}`);
      }
    }

    // ===================== YouTube Leaderboard Cycle =====================
    const [ytRows] = await queryAsync(
      `UPDATE youtube_leaderboard_cycle SET status = 'closed' WHERE end_date = ? AND status = 'active'`,
      [endDate]
    );

    if (ytRows.affectedRows > 0) {
      console.log(`✅ Closed YouTube leaderboard(s) ending on ${endDate}`);

      const [nextYt] = await queryAsync(
        `SELECT id FROM youtube_leaderboard_cycle WHERE start_date > ? ORDER BY start_date ASC LIMIT 1`,
        [endDate]
      );

      if (nextYt.length > 0) {
        const nextYtId = nextYt[0].id;
        await queryAsync(`UPDATE youtube_leaderboard_cycle SET status = 'active' WHERE id = ?`, [nextYtId]);
        console.log(`🎯 Activated YouTube leaderboard ID: ${nextYtId}`);
      }
    }

  } catch (err) {
    console.error("❌ Cron Job Error:", err);
  }

}, {
  timezone: "Asia/Kolkata"
});
