require("dotenv").config();
const { google } = require("googleapis");
const fs = require("fs");

// IMPORTANT: adjust path if this file location differs
const pool = require("../pool");

const util = require('util');
const queryAsync = util.promisify(pool.query).bind(pool);

const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID;
const SA_PATH = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

const MONTH_SHEETS = ["jan","feb","mar","apr","may","jun","jul","aug","sept","oct","nov","dec"];

function normalizeSheetName(s) {
  return String(s || "").trim().toLowerCase();
}

function parseDateFlexible(v) {
  if (!v) return null;
  const s = String(v).trim();
  if (!s) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) {
    const dd = String(m[1]).padStart(2, "0");
    const mm = String(m[2]).padStart(2, "0");
    const yyyy = m[3];
    return `${yyyy}-${mm}-${dd}`;
  }

  return null;
}

function monthIndexFromSheetName(sheetName) {
  const n = normalizeSheetName(sheetName);
  const idx = MONTH_SHEETS.indexOf(n);
  return idx >= 0 ? idx : null;
}

function randomDateInMonth(year, monthIndex0) {
  const start = new Date(Date.UTC(year, monthIndex0, 1));
  const end = new Date(Date.UTC(year, monthIndex0 + 1, 0));
  const diffDays = Math.floor((end - start) / (1000 * 60 * 60 * 24));
  const addDays = Math.floor(Math.random() * (diffDays + 1));
  const d = new Date(start.getTime() + addDays * 86400000);

  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function toNumber(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/,/g, "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function isTruthyPayment(v) {
  if (v === null || v === undefined) return 0;
  const s = String(v).trim().toLowerCase();
  if (!s) return 0;
  if (["yes","y","paid","done","received","ok"].includes(s)) return 1;
  const n = toNumber(s);
  if (n && n > 0) return 1;
  return 0;
}

async function getSheetsClient() {
  if (!fs.existsSync(SA_PATH)) {
    throw new Error(`Service account JSON not found at: ${SA_PATH}`);
  }

  const auth = new google.auth.GoogleAuth({
    keyFile: SA_PATH,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });

  return google.sheets({ version: "v4", auth });
}

async function listSheetTabs(sheets) {
  const meta = await sheets.spreadsheets.get({
    spreadsheetId: SPREADSHEET_ID,
  });
  return meta.data.sheets.map((s) => s.properties.title);
}

function buildRowObjectFromHeaders(headers, row) {
  const obj = {};
  headers.forEach((h, i) => {
    obj[String(h || "").trim()] = row[i] ?? "";
  });
  return obj;
}

async function fetchTabRows(sheets, tabName) {
  const resp = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: tabName,
    valueRenderOption: "UNFORMATTED_VALUE",
  });

  const values = resp.data.values || [];
  if (values.length < 2) return [];

  const headers = values[0].map((h) => String(h || "").trim());
  const rows = values.slice(1);

  return rows
    .filter((r) => (r || []).some((c) => String(c || "").trim() !== ""))
    .map((r) => buildRowObjectFromHeaders(headers, r));
}

/**
 * No crypto/hash.
 * We create a deterministic string and store as sheet_uid.
 * You can add/remove fields if needed.
 */
function computeSheetUid(sheetName, lead) {
  const parts = [
    normalizeSheetName(sheetName),
    String(lead.number || "").trim(),
    String(lead.name || "").trim().toLowerCase(),
    String(lead.deadline || "").trim(),
    String(lead.enquiry || "").trim().toLowerCase(),
  ];

  // Make it safe + stable
  return parts.join("|").replace(/\s+/g, " ").slice(0, 255);
}

function mapSheetRowToDbLead(sheetName, r, mode) {
  // Sheet headers (as you shared)
  const name = String(r["CLIENTS"] || "").trim() || null;
  const number = String(r["NUMBERS"] || "").trim() || null;

  const enquiry = String(r["WORK TYPE"] || r["ENQUIRY"] || "").trim() || null;
  const deadline = parseDateFlexible(r["Deadline"] || r["DEADLINE"]);

  const assign = String(r["ASSIGN"] || "").trim() || null;

  // You said DB has: status, assign. Sheet has AGENT.
  // Storing AGENT into `status` (as your earlier code did).
  const status = String(r["AGENT"] || r["STATUS"] || "").trim() || null;

  const lead_price = toNumber(r["PRICING"]);
  const agent_price = toNumber(r["AGENT CHARGE"]);
  const advance_amount = toNumber(r["ADVANCE AGENT"]);

  const is_payment_received = isTruthyPayment(r["RECEIVED"]);

  // Defaults
  const is_project_done = 0;
  const is_agent_payment_done = 0;
  const remarks = null;
  const pakistani_price = null;

  // created_at
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  const todayStr = `${yyyy}-${mm}-${dd}`;

  let created_at = todayStr;

  if (mode === "backfill") {
    if (deadline) {
      const d = new Date(deadline + "T00:00:00Z");
      created_at = randomDateInMonth(d.getUTCFullYear(), d.getUTCMonth());
    } else {
      const idx = monthIndexFromSheetName(sheetName);
      const yearGuess = yyyy; // change if your backfill is a different year
      created_at = idx !== null ? randomDateInMonth(yearGuess, idx) : todayStr;
    }
  }

  const lead = {
    name,
    number,
    deadline,
    enquiry,
    status,
    assign,
    lead_price,
    agent_price,
    is_project_done,
    is_payment_received,
    is_agent_payment_done,
    advance_amount,
    remarks,
    created_at,
    pakistani_price,
  };

  const sheet_uid = computeSheetUid(sheetName, lead);
  return { ...lead, sheet_uid };
}

async function upsertLead(lead) {
  const sql = `
    INSERT IGNORE INTO leads
      (sheet_uid, name, number, deadline, enquiry, status, assign,
       lead_price, agent_price,
       is_project_done, is_payment_received, is_agent_payment_done,
       advance_amount, remarks, created_at, pakistani_price)
    VALUES
      (?, ?, ?, ?, ?, ?, ?,
       ?, ?,
       ?, ?, ?,
       ?, ?, ?, ?)
    
  `;

  const params = [
    lead.sheet_uid,
    lead.name,
    lead.number,
    lead.deadline,
    lead.enquiry,
    lead.assign,
    lead.status,
    lead.lead_price,
    lead.agent_price,
    lead.is_project_done,
    lead.is_payment_received,
    lead.is_agent_payment_done,
    lead.advance_amount,
    lead.remarks,
    lead.created_at,
    lead.pakistani_price,
  ];

  await queryAsync(sql, params);
}

async function syncLeads({ mode }) {
  const sheets = await getSheetsClient();
  const tabs = await listSheetTabs(sheets);

  const now = new Date();
  const currentMonthTab = MONTH_SHEETS[now.getMonth()];

  const modeTabs =
    mode === "backfill"
      ? tabs.filter((t) => MONTH_SHEETS.includes(normalizeSheetName(t)))
      : tabs.filter((t) => normalizeSheetName(t) === currentMonthTab);

  if (modeTabs.length === 0) {
    console.log(`No matching tabs found for mode=${mode}. Available tabs:`, tabs);
    return { processed: 0, tabs: [] };
  }

  let processed = 0;

  for (const tab of modeTabs) {
    const sheetRows = await fetchTabRows(sheets, tab);

    for (const r of sheetRows) {
      const lead = mapSheetRowToDbLead(tab, r, mode);

      if (!lead.number && !lead.name) continue;

      await upsertLead(lead);
      processed++;
    }
  }

  return { processed, tabs: modeTabs };
}

module.exports = {
  syncLeads,
};
