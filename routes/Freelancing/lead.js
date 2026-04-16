// lead.js (STRICT MODE + unlock + ad removal + safe skip)
// npm i puppeteer mysql2 nodemailer node-notifier

require('dotenv').config();
const puppeteer = require("puppeteer");
const notifier = require("node-notifier");
const mysql = require("mysql2/promise");
const nodemailer = require("nodemailer");


// ===================== CONFIG =====================
const CHECK_INTERVAL_MS = 60_000;
const ROCKERSTOP_BASE = "https://www.rockerstop.com";
const PRESENCE_TEXT = "you've got this number from Rockerstop.com";

// Selectors
const NAME_SELECTOR = ".top-details .list-title";
const PHONE_LINK = 'a[href^="tel:"]';
const TITLE_SELECTOR = ".details-left1 .mb-15.hideshow .need-txt";
const DESC_SELECTOR = ".mb-15.hideshow2 .need-txt";

const SINGLE_RUN = process.argv.includes("--single");

// Email recipient
const ALERT_TO_EMAIL = "manishacreation.work@gmail.com";

// MySQL env
const DB_HOST = process.env.DB_HOST || "localhost";
const DB_PORT = Number(process.env.DB_PORT || 3306);
const DB_USER = process.env.DB_USER || "root";
const DB_PASS = process.env.DB_PASSWORD || "";
const DB_NAME = process.env.DB_NAME || "rockerstop";

// SMTP (GoDaddy) - from .env (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS)
const SMTP_HOST = process.env.SMTP_HOST || "smtpout.secureserver.net";
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;

if (!SMTP_USER || !SMTP_PASS) {
  console.warn('[lead.js] SMTP_USER and SMTP_PASS must be set in .env for lead alert emails.');
}

const WEBHOOK_URL = process.env.LEAD_WEBHOOK_URL || "https://www.filemakr.com/salesalert/api/internal/lead-new";
const WEBHOOK_KEY = process.env.LEAD_WEBHOOK_KEY || "dev_key_change_me";




async function notifyServerNewLead(payload) {
 const resp = await fetch(WEBHOOK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-webhook-secret": 'MyStrongSecret123'
    },
    body: JSON.stringify(payload || {})
  });

  const data = await resp.json().catch(() => ({}));

  if (!resp.ok) {
    throw new Error(`Webhook HTTP ${resp.status}: ${data.message || "Unknown"}`);
  }
  if (!data.ok) {
    throw new Error(`Webhook error: ${data.message || "Unknown"}`);
  }
  return data;
}

// Phone stability tuning
const PHONE_WAIT_TOTAL_MS = 15_000; // total wait after unlock
const PHONE_POLL_MS = 700;          // poll interval
const PHONE_RELOAD_RETRY = true;    // do one reload+retry if still invalid
const PHONE_RETRY_TOTAL_MS = 12_000;

// STRICT: retries per tempid
const MAX_PHONE_FAILURES_BEFORE_SKIP = 5;
const MAX_UNLOCK_FAILURES_BEFORE_SKIP = 3;

// In-memory counters (per Node process)
const phoneFailureCounts = new Map();
const unlockFailureCounts = new Map();

// ===================== UTILS =====================
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function nowUTCDateTimeString() {
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}

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
    connectionLimit: 10
  });
  const conn = await dbPool.getConnection();
  await conn.ping();
  conn.release();
  return dbPool;
}

async function getSettings() {
  const pool = await getDb();
  const [rows] = await pool.query(
    "SELECT phpsessid, current_tempid FROM app_settings WHERE id=1 LIMIT 1"
  );
  if (!rows.length) {
    throw new Error("app_settings row (id=1) not found. Seed it first.");
  }
  return {
    phpsessid: rows[0].phpsessid,
    tempid: Number(rows[0].current_tempid)
  };
}

async function updateTempid(nextTempid) {
  const pool = await getDb();
  await pool.execute("UPDATE app_settings SET current_tempid=? WHERE id=1", [
    nextTempid
  ]);
}

async function upsertLeadByTempid(lead) {
  const pool = await getDb();

  const [existing] = await pool.execute(
    "SELECT id, email_sent FROM rockerstop_leads WHERE tempid=? LIMIT 1",
    [lead.TempID]
  );

  if (existing.length) {
    return {
      inserted: false,
      leadId: existing[0].id,
      emailSent: !!existing[0].email_sent
    };
  }

  const sql = `
    INSERT INTO rockerstop_leads
      (tempid, name, phone, enquiry_title, enquiry_description, lead_url, detected_at_utc, crm_status)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, 'open')
  `;

  const params = [
    lead.TempID,
    lead.Name || null,
    lead.Phone || null,
    lead.Title || null,
    lead.Description || null,
    lead.LeadURL || null,
    lead.DetectedAtUTC
  ];

  const [result] = await pool.execute(sql, params);
  return { inserted: true, leadId: result.insertId, emailSent: false };
}

async function markEmailStatus(leadId, { sent, error }) {
  const pool = await getDb();
  if (sent) {
    await pool.execute(
      "UPDATE rockerstop_leads SET email_sent=1, email_error=NULL, emailed_at_utc=? WHERE id=?",
      [nowUTCDateTimeString(), leadId]
    );
  } else {
    await pool.execute(
      "UPDATE rockerstop_leads SET email_sent=0, email_error=?, emailed_at_utc=NULL WHERE id=?",
      [error ? String(error).slice(0, 4000) : "Unknown error", leadId]
    );
  }
}




// ===================== EMAIL =====================
let mailer = null;

function getMailer() {
  if (mailer) return mailer;

  mailer = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    requireTLS: SMTP_PORT === 587,
    tls: { minVersion: "TLSv1.2" }
  });

  return mailer;
}

async function sendLeadEmail(lead) {
  const transporter = getMailer();

  const subject = `New Rockerstop Lead (tempid=${lead.TempID})`;
  const text = [
    `New lead saved to MySQL.`,
    ``,
    `TempID: ${lead.TempID}`,
    `Name: ${lead.Name || ""}`,
    `Phone: ${lead.Phone || ""}`,
    `Enquiry: ${lead.Title || ""}`,
    `Description: ${lead.Description || ""}`,
    `URL: ${lead.LeadURL || ""}`,
    `Detected (UTC): ${lead.DetectedAtUTC}`
  ].join("\n");

  await transporter.sendMail({
    from: `"Rockerstop Lead Bot" <${SMTP_USER}>`,
    to: ALERT_TO_EMAIL,
    subject,
    text
  });
}

// ===================== PAGE HELPERS =====================
async function getText(page, selector, timeout = 5000) {
  try {
    await page.waitForSelector(selector, { timeout });
    return await page.$eval(
      selector,
      (el) => (el.value ?? el.textContent ?? "").trim()
    );
  } catch {
    return "";
  }
}

// Remove typical Google ads / overlays that might block clicks
async function removeAds(page) {
  try {
    await page.evaluate(() => {
      const adSelectors = [
        "iframe",
        "ins",
        ".adsbygoogle",
        "[id*='google_ads']",
        "[class*='google_ads']",
        "[id*='adsense']",
        ".ad",
        ".ads",
        ".ad-container",
        ".ad-slot"
      ];

      // Remove ad iframes with Google / ads in src
      document
        .querySelectorAll("iframe")
        .forEach((iframe) => {
          const src = iframe.src || "";
          if (
            /googlesyndication|doubleclick|adservice|googleads|adsystem/i.test(
              src
            )
          ) {
            iframe.remove();
          }
        });

      adSelectors.forEach((sel) => {
        document.querySelectorAll(sel).forEach((el) => {
          // Only remove if it looks like an ad or overlay, not core content
          if (
            el.innerText.toLowerCase().includes("ad") ||
            el.innerHTML.toLowerCase().includes("adsbygoogle") ||
            el.tagName === "IFRAME"
          ) {
            el.remove();
          }
        });
      });
    });
  } catch (e) {
    console.warn("⚠️ removeAds failed:", e.message);
  }
}

// Strong validation: rejects "1001500" etc.
function normalizeAndValidatePhone(raw) {
  if (!raw) return "";

  let p = String(raw).replace(/\D/g, "");
  p = p.replace(/^0+/, "");

  if (p.length > 10 && p.startsWith("91")) p = p.slice(-10);

  if (p.length !== 10) return "";
  if (!/^[6-9]/.test(p)) return "";
  if (/^(\d)\1{9}$/.test(p)) return "";

  return p;
}

async function getPhoneOnce(page) {
  // tel: link first
  try {
    await page.waitForSelector(PHONE_LINK, { timeout: 2000 });
    const telHref = await page.$eval(PHONE_LINK, (a) => a.getAttribute("href"));
    if (telHref) {
      const digits = telHref.replace(/^tel:/i, "");
      const valid = normalizeAndValidatePhone(digits);
      if (valid) return valid;
    }
  } catch {
    // ignore
  }

  // body scan fallback
  const body = await page.evaluate(() => document.body.innerText || "");
  const m = body.match(/(\+?\d[\d\s\-()]{8,}\d)/);
  if (m) {
    const valid = normalizeAndValidatePhone(m[1]);
    if (valid) return valid;
  }

  return "";
}

async function waitForValidPhone(page, totalMs, pollMs) {
  const start = Date.now();
  while (Date.now() - start < totalMs) {
    const p = await getPhoneOnce(page);
    if (p) return p;
    await sleep(pollMs);
  }
  return "";
}

async function textFallback(page, labelRegex) {
  const content = await page.evaluate(() => document.body.innerText || "");
  const m = content.match(new RegExp(`${labelRegex}\\s*:\\s*(.+)`, "i"));
  return m ? m[1].trim() : "";
}

async function isUnlocked(page) {
  if (await page.$(PHONE_LINK)) return true;

  const txt = await page.evaluate(() => document.body.innerText || "");
  if (/Deducted\s*Coins\s*:\s*\d+/i.test(txt)) return true;

  return false;
}

/**
 * Click the "CONTACT to unlock the lead" button robustly:
 *  - Removes ads
 *  - Tries multiple CSS selectors
 *  - Uses DOM click inside page.evaluate()
 */
async function clickUnlockButton(page, tempid) {
  await removeAds(page);

  const CSS_SELECTORS = [
    'a.need-detail-btn[href*="database_ajax/contacted.php"]',
    "a.need-detail-btn",
    "button.need-detail-btn",
    ".need-detail-btn",
    ".contact-btn",
    "a.contact-btn",
    "button.contact-btn"
  ];

  // Try DOM click via page.evaluate to avoid Puppeteer "not clickable" issues
  const usedSelector = await page.evaluate((selectors) => {
    for (const sel of selectors) {
      const btn = document.querySelector(sel);
      if (!btn) continue;
      try {
        btn.scrollIntoView({ behavior: "smooth", block: "center" });
        (btn).click();
        return sel;
      } catch (e) {
        // continue to next selector
      }
    }
    return "";
  }, CSS_SELECTORS);

  if (usedSelector) {
    console.log(
      `🔍 Unlock button clicked using selector "${usedSelector}" for tempid=${tempid}`
    );
    // Wait a bit for Ajax / DOM changes
    await sleep(2500);

    if (await isUnlocked(page)) {
      console.log(`🔓 Lead unlocked for tempid=${tempid}`);
      return true;
    }

    console.warn(
      `⚠️ Unlock click done but page still appears locked for tempid=${tempid}`
    );
    return false;
  }

  console.error(
    `❌ Could not find unlock button with known selectors for tempid=${tempid}`
  );
  return false;
}

// ===================== CORE =====================
async function processCurrentTempid(page) {
  const settings = await getSettings();
  const tempid = settings.tempid;

  const url = `${ROCKERSTOP_BASE}/admin_needDetail.php?tempid=${tempid}`;
  console.log(`[${new Date().toLocaleString()}] Checking tempid=${tempid}`);

  // 1) Check page for lead
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });

  const bodyText = await page.evaluate(() => document.body.innerText || "");
  const hasEnquiry = bodyText
    .toLowerCase()
    .includes(PRESENCE_TEXT.toLowerCase());

  if (!hasEnquiry) {
    console.log(`⏳ No lead at tempid=${tempid}.`);
    // you can decide to advance here if you want; currently we keep it.
    return { advanced: false, hasEnquiry: false };
  }

  notifier.notify({
    title: "New Lead on Rockerstop",
    message: `Lead detected at tempid=${tempid}`,
    sound: true
  });

  // 2) Reload to ensure all elements present
  await page.reload({ waitUntil: "domcontentloaded" });

  // If not unlocked, try to unlock
  if (!(await isUnlocked(page))) {
    const unlocked = await clickUnlockButton(page, tempid);
    if (!unlocked) {
      const prev = unlockFailureCounts.get(tempid) || 0;
      const nextCount = prev + 1;
      unlockFailureCounts.set(tempid, nextCount);

      console.error(
        `❌ Failed to unlock lead for tempid=${tempid}. Unlock attempts=${nextCount}/${MAX_UNLOCK_FAILURES_BEFORE_SKIP}.`
      );

      if (nextCount >= MAX_UNLOCK_FAILURES_BEFORE_SKIP) {
        const nextTempid = tempid + 1;
        await updateTempid(nextTempid);
        unlockFailureCounts.delete(tempid);

        console.error(
          `⏭️  Max unlock failures reached for tempid=${tempid}. Skipping to tempid=${nextTempid}.`
        );

        return { advanced: true, hasEnquiry: true, skippedUnlock: true };
      }

      // try again later
      return { advanced: false, hasEnquiry: true };
    }

    // reset unlock failure counter on success
    unlockFailureCounts.delete(tempid);
  }

  // 3) STRICT: wait for a VALID phone.
  let phone = await waitForValidPhone(page, PHONE_WAIT_TOTAL_MS, PHONE_POLL_MS);

  // Optional reload once and retry
  if (!phone && PHONE_RELOAD_RETRY) {
    console.warn(
      `⚠️ Phone not valid yet for tempid=${tempid}. Reloading and retrying...`
    );
    await page.reload({ waitUntil: "domcontentloaded" });

    if (!(await isUnlocked(page))) {
      await clickUnlockButton(page, tempid);
      await sleep(1200);
    }

    phone = await waitForValidPhone(page, PHONE_RETRY_TOTAL_MS, PHONE_POLL_MS);
  }

  // 4) STRICT MODE: still no phone => retry a few loops then skip
  if (!phone) {
    const prev = phoneFailureCounts.get(tempid) || 0;
    const nextCount = prev + 1;
    phoneFailureCounts.set(tempid, nextCount);

    console.error(
      `❌ STRICT MODE: Phone still invalid for tempid=${tempid}. Failure count=${nextCount}/${MAX_PHONE_FAILURES_BEFORE_SKIP}.`
    );

    if (nextCount >= MAX_PHONE_FAILURES_BEFORE_SKIP) {
      const nextTempid = tempid + 1;
      await updateTempid(nextTempid);
      phoneFailureCounts.delete(tempid);

      console.error(
        `⏭️  Max phone failures reached for tempid=${tempid}. Skipping to tempid=${nextTempid}.`
      );

      return { advanced: true, hasEnquiry: true, skippedPhone: true };
    }

    // try this tempid again next loop
    return { advanced: false, hasEnquiry: true };
  }

  // Reset phone failure count on success
  phoneFailureCounts.delete(tempid);

  // 5) Scrape other fields
  const [name, title, description] = await Promise.all([
    getText(page, NAME_SELECTOR),
    getText(page, TITLE_SELECTOR),
    getText(page, DESC_SELECTOR)
  ]);

  const lead = {
    TempID: tempid,
    Name: name || (await textFallback(page, "(Name)")),
    Phone: phone,
    Title: title || (await textFallback(page, "(Title|Enquiry Title|Subject)")),
    Description:
      description ||
      (await textFallback(page, "(Description|Enquiry Description|Message)")),
    LeadURL: url,
    DetectedAtUTC: nowUTCDateTimeString()
  };

  // 6) Insert into DB
  let leadId;
  let emailSentAlready = false;

  try {
    const r = await upsertLeadByTempid(lead);
    leadId = r.leadId;
    emailSentAlready = r.emailSent;

    if (!r.inserted) {
      console.warn(
        `⚠️ Duplicate tempid=${tempid} already exists in DB (id=${leadId}).`
      );
    } else {
        await notifyServerNewLead({
    lead_id: leadId,
    tempid: lead.TempID,
    name: lead.Name,
    phone: lead.Phone,
    enquiry_title: lead.Title,
    created_at: new Date().toISOString()
  });
      console.log(`✅ Inserted into MySQL (id=${leadId}).`);
    }
  } catch (e) {
    console.error("❌ DB insert failed:", e.message);
    // do not advance; retry after DB is fixed
    return { advanced: false, hasEnquiry: true };
  }

  // 7) Advance tempid AFTER successful insert/duplicate
  const nextTempid = tempid + 1;
  await updateTempid(nextTempid);
  console.log(`➡️ Advanced tempid in DB: ${tempid} -> ${nextTempid}`);

  // 8) Send email (non-blocking for tempid progression)
  if (emailSentAlready) {
     await notifyServerNewLead({
    lead_id: leadId,
    tempid: lead.TempID,
    name: lead.Name,
    phone: lead.Phone,
    enquiry_title: lead.Title,
    created_at: new Date().toISOString()
  });
    console.log(
      `📧 Email already sent earlier for tempid=${tempid}. Skipping email.`
    );
    return { advanced: true, hasEnquiry: true };
  }

  try {
    // await sendLeadEmail(lead);
    await markEmailStatus(leadId, { sent: true });
    console.log(`✅ Email sent to ${ALERT_TO_EMAIL}.`);
  } catch (e) {
    await markEmailStatus(leadId, { sent: false, error: e.message });
    console.error(
      "⚠️ Email failed, but tempid already advanced:",
      e.message
    );
  }

  return { advanced: true, hasEnquiry: true };
}

// ===================== MAIN =====================
(async () => {
  await getDb();
  getMailer();

  const settings = await getSettings();

  const browser = await puppeteer.launch({
    headless: "new",
    channel: "chrome",
    defaultViewport: null,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      "--start-maximized"
    ],
    timeout: 0
  });

  const page = await browser.newPage();

  await page.setCookie({
    name: "PHPSESSID",
    value: settings.phpsessid,
    domain: "www.rockerstop.com",
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/"
  });

  if (SINGLE_RUN) {
    await processCurrentTempid(page);
    await browser.close();
    process.exit(0);
  }

  async function loop() {
    try {
      const result = await processCurrentTempid(page);
      if (result?.skippedUnlock) {
        console.log("ℹ️ tempid skipped due to repeated UNLOCK failures.");
      }
      if (result?.skippedPhone) {
        console.log("ℹ️ tempid skipped due to repeated PHONE failures.");
      }
    } catch (e) {
      console.error("❌ Loop error:", e.message);
    } finally {
      setTimeout(loop, CHECK_INTERVAL_MS);
    }
  }

  await loop();
})();
