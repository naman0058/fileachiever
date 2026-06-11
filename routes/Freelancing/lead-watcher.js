// lead-watcher.js
// npm i axios cheerio node-notifier mysql2

const path = require("path");
const fs = require("fs");
const axios = require("axios");
const cheerio = require("cheerio");
const notifier = require("node-notifier");
const mysql = require("mysql2/promise");
const { spawn } = require("child_process");

// ===================== CONFIG =====================
const CHECK_INTERVAL_MS = 60_000;
const ROCKERSTOP_BASE = "https://www.rockerstop.com";
const PRESENCE_TEXT = "you've got this number from Rockerstop.com";

const LOCK_PATH = path.join(__dirname, "lead_processor.lock");
const LEAD_JS = path.join(__dirname, "lead.js");

// MySQL env
const DB_HOST = process.env.DB_HOST || "localhost";
const DB_PORT = Number(process.env.DB_PORT || 3306);
const DB_USER = process.env.DB_USER || "root";
const DB_PASS = process.env.DB_PASSWORD || "";
const DB_NAME = process.env.DB_NAME || "rockerstop";

// ===================== MYSQL =====================
let dbPool = null;
async function getDb() {
  if (dbPool) return dbPool;
  dbPool = mysql.createPool({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASS,
    database: DB_NAME,
    waitForConnections: true,
    connectionLimit: 5
  });
  const c = await dbPool.getConnection();
  await c.ping();
  c.release();
  return dbPool;
}

async function getSettings() {
  const pool = await getDb();
  const [rows] = await pool.query(
    "SELECT phpsessid, current_tempid FROM app_settings WHERE id=1 LIMIT 1"
  );
  if (!rows.length) throw new Error("app_settings row (id=1) not found.");
  return { phpsessid: rows[0].phpsessid, tempid: Number(rows[0].current_tempid) };
}

// ===================== LOCK HELPERS =====================
function isProcessRunning(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}
function getExistingLockPid() {
  try {
    const pid = Number(fs.readFileSync(LOCK_PATH, "utf8").trim());
    return Number.isFinite(pid) ? pid : null;
  } catch { return null; }
}
function acquireLockFor(pid) {
  try { fs.writeFileSync(LOCK_PATH, String(pid), "utf8"); return true; } catch { return false; }
}
function releaseLockIfOwnedBy(pid) {
  try {
    const cur = getExistingLockPid();
    if (cur === pid && fs.existsSync(LOCK_PATH)) fs.unlinkSync(LOCK_PATH);
  } catch {}
}
function lockIsFreeOrStale() {
  const pid = getExistingLockPid();
  if (!pid) return true;
  return !isProcessRunning(pid);
}

// ===================== WATCH LOOP =====================
async function checkLead() {
  try {
    const settings = await getSettings();
    const tempid = settings.tempid;

    const headers = { Cookie: `PHPSESSID=${settings.phpsessid};` };
    const url = `${ROCKERSTOP_BASE}/admin_needDetail.php?tempid=${tempid}`;

    const res = await axios.get(url, { headers, timeout: 60_000 });
    const $ = cheerio.load(res.data);
    const pageHasLead = $("body").text().toLowerCase().includes(PRESENCE_TEXT.toLowerCase());

    if (!pageHasLead) {
      console.log(`⏳ No lead at tempid=${tempid}, retrying...`);
      return;
    }

    notifier.notify({
      title: "New Lead on Rockerstop",
      message: `Lead detected at tempid=${tempid}. Starting processor...`,
      sound: true
    });

    if (!lockIsFreeOrStale()) {
      console.log("⛔ lead.js already running (lock exists).");
      return;
    }

    const child = spawn(process.execPath, [LEAD_JS, "--single"], {
      cwd: __dirname,
      stdio: "inherit",
      env: process.env
    });

    acquireLockFor(child.pid);

    child.on("close", (code) => {
      releaseLockIfOwnedBy(child.pid);
      if (code !== 0) console.warn(`lead.js exited with code ${code}`);
    });

    child.on("error", (err) => {
      releaseLockIfOwnedBy(child.pid);
      console.error("❌ Failed to spawn lead.js:", err.message);
    });

  } catch (err) {
    console.error("❌ Watcher failed:", err.message);
  } finally {
    setTimeout(checkLead, CHECK_INTERVAL_MS);
  }
}

function startLeadWatcher() {
  console.log('[lead-watcher] Starting Rockerstop lead watcher…');
  getDb()
    .then(() => checkLead())
    .catch((err) => console.error('[lead-watcher] Failed to start:', err.message));
}

module.exports = { startLeadWatcher };
