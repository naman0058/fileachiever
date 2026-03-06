var express = require('express');
var router = express.Router();
var pool = require('../pool');
require('dotenv').config();
const util = require('util');
const queryAsync = util.promisify(pool.query).bind(pool);
const getConnAsync = util.promisify(pool.getConnection).bind(pool);
const dataService = require('../verify')



// ---------------------------
// Helpers
// ---------------------------
const STAGES = [
  { key: "new", label: "New" },
  { key: "followup", label: "Follow-up" },
   { key: 'interested', label: 'More Interested' },
];

function isValidStage(s) {
  return STAGES.some(x => x.key === s);
}

function asMoney(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v < 0) return null;
  return v;
}

function ymNow() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function monthsList(limit = 12) {
  const arr = [];
  const d = new Date();
  d.setDate(1);
  for (let i = 0; i < limit; i++) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    arr.push(`${y}-${m}`);
    d.setMonth(d.getMonth() - 1);
  }
  return arr;
}

// ---------------------------
// Dashboard (Kanban) with Month filter
// GET /sales?month=YYYY-MM
// ---------------------------
// router.get('/', async function(req, res) {
//   try {
//     const selectedMonth = (req.query.month && /^\d{4}-\d{2}$/.test(req.query.month))
//       ? req.query.month
//       : ymNow();

//     const start = `${selectedMonth}-01`;
//     const [y, m] = selectedMonth.split("-").map(Number);
//     const endDate = new Date(y, m, 1); // next month first day
//     const end = endDate.toISOString().slice(0, 10);

//     // NOTE: latest call log is joined for quick UI preview
//     const rows = await queryAsync(`
//       SELECT 
//         l.id, l.tempid, l.name, l.phone, l.enquiry_title, l.enquiry_description,
//         l.detected_at_utc, l.crm_stage, l.crm_status, l.crm_assign, l.crm_updated_at,

//         cl.day_label AS last_day_label,
//         cl.note AS last_note,
//         cl.next_followup_date AS last_next_followup_date,
//         cl.created_at AS last_call_at

//       FROM rockerstop_leads l
//       LEFT JOIN lead_call_logs cl
//         ON cl.id = (
//           SELECT x.id FROM lead_call_logs x
//           WHERE x.rockerstop_lead_id = l.id
//           ORDER BY x.created_at DESC
//           LIMIT 1
//         )

//       WHERE l.detected_at_utc >= ? AND l.detected_at_utc < ?
//         AND l.crm_status = 'open'
//       ORDER BY l.detected_at_utc DESC
//       LIMIT 2000
//     `, [start, end]);

//     const byStage = { new: [], followup: [] };
//     for (const r of rows) {
//       const stage = (r.crm_stage && byStage[r.crm_stage]) ? r.crm_stage : "new";
//       byStage[stage].push(r);
//     }

//     res.render('freelancing/sales-dashboard', {
//       stages: STAGES,
//       byStage,
//       selectedMonth,
//       monthOptions: monthsList(12)
//     });
//   } catch (e) {
//     console.error("Sales dashboard error:", e);
//     res.status(500).send("Failed to load sales dashboard.");
//   }
// });


router.get('/', async (req, res) => {
  try {
    const selectedMonth = (req.query.month && /^\d{4}-\d{2}$/.test(req.query.month))
      ? req.query.month
      : ymNow();

    const start = `${selectedMonth}-01`;
    const [y, m] = selectedMonth.split("-").map(Number);
    const endDate = new Date(y, m, 1);
    const end = endDate.toISOString().slice(0, 10);

    const rows = await queryAsync(`
      SELECT 
        l.id, l.tempid, l.name, l.phone, l.enquiry_title, l.enquiry_description,
        l.detected_at_utc, l.crm_stage, l.crm_status, l.crm_assign, l.crm_updated_at,

        cl.day_label AS last_day_label,
        cl.note AS last_note,
        cl.next_followup_date AS last_next_followup_date,
        cl.created_at AS last_call_at

      FROM rockerstop_leads l
      LEFT JOIN lead_call_logs cl
        ON cl.id = (
          SELECT x.id FROM lead_call_logs x
          WHERE x.rockerstop_lead_id = l.id
          ORDER BY x.created_at DESC
          LIMIT 1
        )

      WHERE l.detected_at_utc >= ? AND l.detected_at_utc < ?
        AND l.crm_status = 'open'
      ORDER BY l.detected_at_utc DESC
      LIMIT 2000
    `, [start, end]);

    const byStage = { new: [], followup: [], interested: [] };
    for (const r of rows) {
      const stage = (r.crm_stage && Object.prototype.hasOwnProperty.call(byStage, r.crm_stage))
        ? r.crm_stage
        : 'new';
      byStage[stage].push(r);
    }

    res.render('freelancing/sales-dashboard', {
      stages: STAGES,
      byStage,
      selectedMonth,
      monthOptions: monthsList(12)
    });
  } catch (e) {
    console.error("Sales dashboard error:", e);
    res.status(500).send("Failed to load sales dashboard.");
  }
});

// Rejected Leads page
// GET /sales/rejected
router.get('/rejected', async (req, res) => {
  try {
    // Validate month (YYYY-MM) or default to current
    const selectedMonth =
      (req.query.month && /^\d{4}-\d{2}$/.test(req.query.month))
        ? req.query.month
        : ymNow();

    const start = `${selectedMonth}-01`;
    const [y, m] = selectedMonth.split('-').map(Number);
    const endDate = new Date(y, m, 1); // next month (month is 1-based in selectedMonth, Date uses 0-based)
    const end = endDate.toISOString().slice(0, 10);

    // Fetch rejected leads for the selected month
    const rows = await queryAsync(`
      SELECT
        id,
        tempid,
        name,
        phone,
        enquiry_title,
        enquiry_description,
        crm_stage,
        crm_status,
        crm_assign,
        crm_reject_reason AS reject_reason,
        crm_updated_at
      FROM rockerstop_leads
      WHERE detected_at_utc >= ? AND detected_at_utc < ?
        AND crm_status = 'rejected'
      ORDER BY crm_updated_at DESC
      LIMIT 4000
    `, [start, end]);

    // Render rejected page
    return res.render('freelancing/reject-lead', {
      rows,
      selectedMonth,
      monthOptions: monthsList(12)
    });
  } catch (e) {
    console.error('Rejected leads page error:', e);
    return res.status(500).send('Failed to load rejected leads.');
  }
});





// ---------------------------
// Update Stage (drag/drop)
// POST /sales/api/stage
// body: { id, stage }
// ---------------------------
// POST /sales/api/stage

router.post('/api/stage', async (req, res) => {
  try {
    const id = Number(req.body.id);
    const stage = String(req.body.stage || '');

    const allowed = new Set(['new', 'followup', 'interested']);
    if (!id) return res.json({ ok: false, message: 'Invalid id' });
    if (!allowed.has(stage)) return res.json({ ok: false, message: 'Invalid stage' });

    await queryAsync(`
      UPDATE rockerstop_leads
      SET crm_stage=?, crm_updated_at=NOW()
      WHERE id=?
      LIMIT 1
    `, [stage, id]);

    return res.json({ ok: true });
  } catch (e) {
    console.error('Stage API error:', e);
    return res.json({ ok: false, message: 'Server error' });
  }
});


// ---------------------------
// Update Assign
// POST /sales/api/assign
// body: { id, assign }
// ---------------------------
router.post('/api/assign', async function(req, res) {
  try {
    const leadId = Number(req.body.id);
    const assign = (req.body.assign ?? "").toString().trim();

    if (!Number.isFinite(leadId)) return res.status(400).json({ ok: false, message: "Invalid id" });

    await queryAsync(
      `UPDATE rockerstop_leads SET crm_assign=?, crm_updated_at=NOW() WHERE id=? AND crm_status='open'`,
      [assign || null, leadId]
    );

    return res.json({ ok: true });
  } catch (e) {
    console.error("Update assign error:", e);
    res.status(500).json({ ok: false, message: "Server error" });
  }
});

// ---------------------------
// Reject lead (button)
// POST /sales/api/reject
// body: { id, reason }
// ---------------------------
router.post('/api/reject', async (req, res) => {
  try {
    const id = Number(req.body.id);
    const reason = (req.body.reason || '').trim();

    if (!id) return res.json({ ok: false, message: 'Invalid id' });

    await queryAsync(`
      UPDATE rockerstop_leads
      SET crm_status='rejected',
          crm_reject_reason=?,
          crm_updated_at=NOW()
      WHERE id=?
      LIMIT 1
    `, [reason, id]);

    return res.json({ ok: true });
  } catch (e) {
    console.error('Reject API error:', e);
    return res.json({ ok: false, message: 'Server error' });
  }
});


router.post('/api/rejected/move-to-interested', async (req, res) => {
  try {
    const id = Number(req.body.id);
    if (!id) return res.json({ ok: false, message: 'Invalid id' });

    await queryAsync(`
      UPDATE rockerstop_leads
      SET crm_status='open',
          crm_stage='interested',
          crm_updated_at=NOW()
      WHERE id=?
      LIMIT 1
    `, [id]);

    return res.json({ ok: true });
  } catch (e) {
    console.error('Move-to-interested API error:', e);
    return res.json({ ok: false, message: 'Server error' });
  }
});

// ---------------------------
// Call logs list (timeline)
// GET /sales/api/calls/:id
// ---------------------------
router.get('/api/calls/:id', async function(req, res) {
  try {
    const leadId = Number(req.params.id);
    if (!Number.isFinite(leadId)) return res.status(400).json({ ok: false, message: "Invalid id" });

    const rows = await queryAsync(
      `SELECT id, day_label, note, next_followup_date, created_at
       FROM lead_call_logs
       WHERE rockerstop_lead_id=?
       ORDER BY created_at ASC`,
      [leadId]
    );

    return res.json({ ok: true, rows });
  } catch (e) {
    console.error("Calls list error:", e);
    res.status(500).json({ ok: false, message: "Server error" });
  }
});

// ---------------------------
// Add call log entry
// POST /sales/api/calls
// body: { id, day_label, note, next_followup_date }
// ---------------------------
router.post('/api/calls', async function(req, res) {
  try {
    const leadId = Number(req.body.id);
    const note = (req.body.note ?? "").toString().trim();
    const next_followup_date = (req.body.next_followup_date ?? "").toString().trim() || null;

    if (!Number.isFinite(leadId)) return res.status(400).json({ ok: false, message: "Invalid id" });
    if (!note) return res.status(400).json({ ok: false, message: "note required" });

    // Auto Day label: Day 1, Day 2, ...
    const cntRows = await queryAsync(
      `SELECT COUNT(*) AS c FROM lead_call_logs WHERE rockerstop_lead_id=?`,
      [leadId]
    );
    const nextDayNumber = Number(cntRows[0]?.c || 0) + 1;
    const day_label = `Day ${nextDayNumber}`;

    await queryAsync(
      `INSERT INTO lead_call_logs (rockerstop_lead_id, day_label, note, next_followup_date)
       VALUES (?, ?, ?, ?)`,
      [leadId, day_label, note, next_followup_date]
    );

    // move to followup
    await queryAsync(
      `UPDATE rockerstop_leads
       SET crm_stage='followup', crm_updated_at=NOW()
       WHERE id=? AND crm_status='open'`,
      [leadId]
    );

    return res.json({ ok: true, day_label });
  } catch (e) {
    console.error("Add call log error:", e);
    res.status(500).json({ ok: false, message: "Server error" });
  }
});


// ---------------------------
// Convert Lead -> Sales (button)
// POST /sales/api/convert
// body: { id, lead_price, agent_price, deadline, assign, remarks, advance_amount, pakistani_price, sheet_uid }
// ---------------------------
router.post('/api/convert', async function(req, res) {
  let conn = null;

  try {
    const leadId = Number(req.body.id);
    if (!Number.isFinite(leadId)) {
      return res.status(400).json({ ok: false, message: "Invalid lead id" });
    }

    const lead_price = asMoney(req.body.lead_price);
    const agent_price = asMoney(req.body.agent_price);

    if (lead_price === null) return res.status(400).json({ ok: false, message: "lead_price required (>=0)" });
    if (agent_price === null) return res.status(400).json({ ok: false, message: "agent_price required (>=0)" });

    const deadline = req.body.deadline ? String(req.body.deadline) : null;
    const assign = req.body.assign ? String(req.body.assign) : null;
    const remarks = req.body.remarks ? String(req.body.remarks) : null;
    const advance_amount = (req.body.advance_amount !== undefined && req.body.advance_amount !== null && req.body.advance_amount !== '')
      ? asMoney(req.body.advance_amount)
      : null;
    const pakistani_price = (req.body.pakistani_price !== undefined && req.body.pakistani_price !== null && req.body.pakistani_price !== '')
      ? asMoney(req.body.pakistani_price)
      : null;
    const sheet_uid = req.body.sheet_uid ? String(req.body.sheet_uid) : null;

    if (req.body.advance_amount && advance_amount === null) {
      return res.status(400).json({ ok: false, message: "advance_amount must be >=0" });
    }
    if (req.body.pakistani_price && pakistani_price === null) {
      return res.status(400).json({ ok: false, message: "pakistani_price must be >=0" });
    }

    // IMPORTANT: transaction must use a dedicated connection
    conn = await getConnAsync();
    const connQuery = util.promisify(conn.query).bind(conn);

    await util.promisify(conn.beginTransaction).bind(conn)();

    // Lock the lead row for safe conversion
    const rrows = await connQuery(
      `SELECT id, name, phone, enquiry_title, enquiry_description, crm_assign
       FROM rockerstop_leads
       WHERE id=? AND crm_status='open'
       FOR UPDATE`,
      [leadId]
    );

    if (!rrows.length) {
      await util.promisify(conn.rollback).bind(conn)();
      return res.status(404).json({ ok: false, message: "Lead not found or not open" });
    }

    const r = rrows[0];
    const enquiryText = r.enquiry_title;

    // Insert into your SALES leads table
    const ins = await connQuery(
      `INSERT INTO leads
        (name, number, deadline, enquiry, status, assign, lead_price, agent_price,
         is_project_done, is_payment_received, is_agent_payment_done,
         advance_amount, remarks, pakistani_price, sheet_uid,created_at)
       VALUES
        (?, ?, ?, ?, ?, ?, ?, ?,
         0, 0, 0,
         ?, ?, ?, ?,?)`,
      [
        r.name || null,
        r.phone || null,
        deadline,
        enquiryText,
        "pending",
        assign || r.crm_assign || null,
        lead_price,
        agent_price,
        advance_amount,
        remarks,
        pakistani_price,
        sheet_uid,
        dataService.getCurrentDate()
      ]
    );

    // Mark as converted so it disappears from Kanban
    await connQuery(
      `UPDATE rockerstop_leads
       SET crm_status='converted', crm_updated_at=NOW()
       WHERE id=?`,
      [leadId]
    );

    // Add a conversion log
    await connQuery(
      `INSERT INTO lead_call_logs (rockerstop_lead_id, day_label, note)
       VALUES (?, 'Converted', ?)`,
      [leadId, `Converted to sales_id=${ins.insertId}. lead_price=${lead_price}, agent_price=${agent_price}`]
    );

    await util.promisify(conn.commit).bind(conn)();

    return res.json({ ok: true, sales_id: ins.insertId });
  } catch (e) {
    try {
      if (conn) await util.promisify(conn.rollback).bind(conn)();
    } catch {}

    console.error("Convert lead error:", e);
    return res.status(500).json({ ok: false, message: "Server error" });
  } finally {
    try { if (conn) conn.release(); } catch {}
  }
});





router.get('/api/lead/:id', async function(req, res){
  try{
    const id = Number(req.params.id);
    if(!Number.isFinite(id)) return res.status(400).json({ ok:false, message:'Invalid id' });

    const rows = await queryAsync(
      `SELECT id, name, phone, enquiry_title, enquiry_description, crm_assign
       FROM rockerstop_leads
       WHERE id=? AND crm_status='open'
       LIMIT 1`,
      [id]
    );

    if(!rows.length) return res.status(404).json({ ok:false, message:'Lead not found' });
    return res.json({ ok:true, lead: rows[0] });
  }catch(e){
    console.error("GET lead error:", e);
    res.status(500).json({ ok:false, message:'Server error' });
  }
});



router.post('/api/lead/update', async function(req, res){
  try{
    const id = Number(req.body.id);
    if(!Number.isFinite(id)) return res.status(400).json({ ok:false, message:'Invalid id' });

    const name = (req.body.name ?? '').toString().trim() || null;
    const phone = (req.body.phone ?? '').toString().trim() || null;
    const enquiry_title = (req.body.enquiry_title ?? '').toString().trim() || null;
    const enquiry_description = (req.body.enquiry_description ?? '').toString().trim() || null;
    const crm_assign = (req.body.crm_assign ?? '').toString().trim() || null;

    // Optional: validate phone
    if(phone && !/^\d{10,15}$/.test(phone)){
      return res.status(400).json({ ok:false, message:'Invalid phone format. Use 10–15 digits.' });
    }

    const r = await queryAsync(
      `UPDATE rockerstop_leads
       SET name=?, phone=?, enquiry_title=?, enquiry_description=?, crm_assign=?,
           crm_updated_at=NOW()
       WHERE id=? AND crm_status='open'`,
      [name, phone, enquiry_title, enquiry_description, crm_assign, id]
    );

    if(r.affectedRows === 0){
      return res.status(404).json({ ok:false, message:'Lead not found / not editable' });
    }

    return res.json({ ok:true });
  }catch(e){
    console.error("Update lead error:", e);
    res.status(500).json({ ok:false, message:'Server error' });
  }
});


module.exports = router;
