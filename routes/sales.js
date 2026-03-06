var express = require('express');
var router = express.Router();
var pool = require('./pool');
require('dotenv').config();
const util = require('util');
const queryAsync = util.promisify(pool.query).bind(pool);
const getConnAsync = util.promisify(pool.getConnection).bind(pool);

const dataService = require('./verify'); // you already use this for getCurrentDate()

// ---------------------------
// Helpers
// ---------------------------
const STAGES = [
  { key: "new", label: "New" },
  { key: "followup", label: "Follow-up" },
  { key: "interested", label: "More Interested" },
];

const STAGE_SET = new Set(STAGES.map(s => s.key));

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

function isValidMonth(s) {
  return !!(s && /^\d{4}-\d{2}$/.test(s));
}

function monthRange(selectedMonth) {
  const start = `${selectedMonth}-01`;
  const [y, m] = selectedMonth.split("-").map(Number);
  const endDate = new Date(y, m, 1); // next month first day
  const end = endDate.toISOString().slice(0, 10);
  return { start, end };
}

function asMoney(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v < 0) return null;
  return v;
}

// ---------------------------
// Auth placeholders (map to your auth system)
// ---------------------------
// Expect: req.user = { id, name, role }  OR req.session.user = { ... }
function getUser(req) {
  return req.user || req.session?.user || null;
}

function requireLogin(req, res, next) {
  const u = getUser(req);
  if (!u) return res.redirect('/auth/login');
  req._user = u;
  next();
}


function requireAdmin(req, res, next) {
  const u = req._user || getUser(req);
  if (!u) return res.status(401).send("Unauthorized");
  if (u.role !== 'admin') return res.status(403).send("Forbidden");
  next();
}

// ---------------------------
// Landing
// ---------------------------
router.get('/', requireLogin, async (req, res) => {
  const u = req._user;
  if (u.role === 'admin') return res.redirect('/sales/admin');
  return res.redirect('/sales/my');
});

// ---------------------------
// Admin Assignments Dashboard (ALL employees + filters)
// GET /sales/admin?month=YYYY-MM&stage=...&status=...&agent=...&q=...
// ---------------------------
router.get('/admin', requireLogin, requireAdmin, async (req, res) => {
  try {
    const selectedMonth = isValidMonth(req.query.month) ? req.query.month : ymNow();
    const { start, end } = monthRange(selectedMonth);

    const stage = (req.query.stage && STAGE_SET.has(req.query.stage)) ? req.query.stage : '';
    const status = (req.query.status && ['open','rejected','closed'].includes(req.query.status)) ? req.query.status : 'open';
    const agent = req.query.agent ? Number(req.query.agent) : 0;
    const q = (req.query.q || '').toString().trim();

    // ✅ ALWAYS ensure assignments exist for this month
    // If agent filter is selected, we can create only for that agent to reduce insert size
    await ensureAssignmentsForMonth(start, end, agent && Number.isFinite(agent) ? agent : 0);

    // ✅ only agents list
    const agents = await queryAsync(
      `SELECT id, name
       FROM crm_users
       WHERE is_active=1 AND role='agent'
       ORDER BY name ASC`
    );

    const where = [];
    const params = [];

    where.push(`l.detected_at_utc >= ? AND l.detected_at_utc < ?`);
    params.push(start, end);

    // global lead must be open (your requirement)
    where.push(`l.crm_status = 'open'`);

    // assignment filters
    where.push(`la.status = ?`);
    params.push(status);

    if (stage) {
      where.push(`la.stage = ?`);
      params.push(stage);
    }

    if (agent && Number.isFinite(agent)) {
      where.push(`la.user_id = ?`);
      params.push(agent);
    }

    if (q) {
      where.push(`(l.name LIKE ? OR l.phone LIKE ? OR l.enquiry_title LIKE ? OR l.tempid LIKE ?)`);
      const like = `%${q}%`;
      params.push(like, like, like, like);
    }

    const rows = await queryAsync(`
      SELECT
        la.id AS assignment_id,
        la.stage AS assignment_stage,
        la.status AS assignment_status,
        la.reject_reason AS assignment_reject_reason,
        la.updated_at AS assignment_updated_at,

        u.id AS user_id,
        u.name AS user_name,

        l.id AS lead_id,
        l.tempid,
        l.name,
        l.phone,
        l.enquiry_title,
        l.enquiry_description,
        l.detected_at_utc,
        l.crm_status AS lead_status,

        lg.day_label AS last_day_label,
        lg.note AS last_note,
        lg.next_followup_date AS last_next_followup_date,
        lg.created_at AS last_call_at

      FROM lead_assignments la
      JOIN rockerstop_leads l ON l.id = la.lead_id
      JOIN crm_users u ON u.id = la.user_id

      LEFT JOIN lead_assignment_logs lg
        ON lg.id = (
          SELECT x.id FROM lead_assignment_logs x
          WHERE x.assignment_id = la.id
          ORDER BY x.created_at DESC
          LIMIT 1
        )

      WHERE ${where.join(' AND ')}
      ORDER BY la.updated_at DESC
      LIMIT 4000
    `, params);

    return res.render('freelancing/sales/assignments', {
      pageTitle: 'Admin • Sales Assignments',
      mode: 'admin',
      user: req._user,
      stages: STAGES,
      rows,
      agents,
      active: 'assignments', 
      filters: { selectedMonth, monthOptions: monthsList(12), stage, status, agent, q}
    });

  } catch (e) {
    console.error("Admin dashboard error:", e);
    return res.status(500).send("Failed to load admin dashboard.");
  }
});
// ---------------------------
// Agent Dashboard (ONLY their assignments)
// GET /sales/my?month=YYYY-MM&stage=...&status=...&q=...
// ---------------------------
router.get('/my', requireLogin, async (req, res) => {
  try {
    const u = req._user;

    const selectedMonth = isValidMonth(req.query.month) ? req.query.month : ymNow();
    const { start, end } = monthRange(selectedMonth);

    const stage = (req.query.stage && STAGE_SET.has(req.query.stage)) ? req.query.stage : '';
    const status = (req.query.status && ['open','rejected','closed'].includes(req.query.status)) ? req.query.status : 'open';
    const q = (req.query.q || '').toString().trim();

    // ✅ Ensure assignments exist for this agent for the selected month
    // await ensureAssignmentsForMonth(start, end, u.id);

await cleanupOldAssignmentsForAgent(u.id);

    const where = [];
    const params = [];

    where.push(`l.detected_at_utc >= ? AND l.detected_at_utc < ?`);
    params.push(start, end);

    where.push(`l.crm_status = 'open'`);

    where.push(`la.user_id = ?`);
    params.push(u.id);

    where.push(`la.status = ?`);
    params.push(status);

    if (stage) {
      where.push(`la.stage = ?`);
      params.push(stage);
    }

    if (q) {
      where.push(`(l.name LIKE ? OR l.phone LIKE ? OR l.enquiry_title LIKE ? OR l.tempid LIKE ?)`);
      const like = `%${q}%`;
      params.push(like, like, like, like);
    }

    const rows = await queryAsync(`
      SELECT
        la.id AS assignment_id,
        la.stage AS assignment_stage,
        la.status AS assignment_status,
        la.reject_reason AS assignment_reject_reason,
        la.updated_at AS assignment_updated_at,

        u.id AS user_id,
        u.name AS user_name,

        l.id AS lead_id,
        l.tempid,
        l.name,
        l.phone,
        l.enquiry_title,
        l.enquiry_description,
        l.detected_at_utc,
        l.crm_status AS lead_status,

        lg.day_label AS last_day_label,
        lg.note AS last_note,
        lg.next_followup_date AS last_next_followup_date,
        lg.created_at AS last_call_at

      FROM lead_assignments la
      JOIN rockerstop_leads l ON l.id = la.lead_id
      JOIN crm_users u ON u.id = la.user_id

      LEFT JOIN lead_assignment_logs lg
        ON lg.id = (
          SELECT x.id FROM lead_assignment_logs x
          WHERE x.assignment_id = la.id
          ORDER BY x.created_at DESC  
          LIMIT 1
        )

      WHERE ${where.join(' AND ')}
      ORDER BY l.tempid DESC
      LIMIT 3000
    `, params);

    return res.render('freelancing/sales/assignments', {
      pageTitle: 'My Leads • Sales Dashboard',
      mode: 'agent',
      user: u,
      stages: STAGES,
      rows,
      agents: [],
      active: 'assignments',
      filters: { selectedMonth, monthOptions: monthsList(12), stage, status, agent: 0, q}
    });

  } catch (e) {
    console.error("Agent dashboard error:", e);
    return res.status(500).send("Failed to load dashboard.");
  }
});


router.post('/api/assignment/stage', requireLogin, async (req, res) => {
  try{
    const u = req._user;
    const assignment_id = Number(req.body.assignment_id);
    const stage = (req.body.stage || '').toString();

    const allowed = new Set(['new','followup','interested']);
    if(!Number.isFinite(assignment_id)) return res.json({ ok:false, message:'Invalid assignment_id' });
    if(!allowed.has(stage)) return res.json({ ok:false, message:'Invalid stage' });

    // agent can update only their rows; admin can update all
    const whereUser = (u.role === 'admin') ? '' : ' AND user_id=? ';
    const params = (u.role === 'admin') ? [stage, assignment_id] : [stage, assignment_id, u.id];

    const r = await queryAsync(`
      UPDATE lead_assignments
      SET stage=?, updated_at=NOW()
      WHERE id=? ${whereUser}
      LIMIT 1
    `, params);

    if(r.affectedRows === 0) return res.json({ ok:false, message:'Not found / not allowed' });
    return res.json({ ok:true });
  }catch(e){
    console.error('assignment stage error:', e);
    return res.json({ ok:false, message:'Server error' });
  }
});

router.get('/api/assignment/logs/:assignmentId', requireLogin, async (req,res)=>{
  const assignmentId = Number(req.params.assignmentId);
  if(!assignmentId) return res.json({ ok:false, message:'Invalid assignment id' });

  // Agent should only see own assignment; admin can see all
  const u = req._user;

  const rows = await queryAsync(`
    SELECT id, assignment_id, day_label, note, next_followup_date, created_at
    FROM lead_assignment_logs
    WHERE assignment_id=?
    ORDER BY created_at DESC
    LIMIT 200
  `, [assignmentId]);

  // Optional access control (recommended)
  if(u.role !== 'admin'){
    const check = await queryAsync(
      `SELECT 1 FROM lead_assignments WHERE id=? AND user_id=? LIMIT 1`,
      [assignmentId, u.id]
    );
    if(!check.length) return res.json({ ok:false, message:'Unauthorized' });
  }

  return res.json({ ok:true, rows });
});


router.post('/api/assignment/logs', requireLogin, async (req, res) => {
  try {
    const u = req._user;

    const assignment_id = Number(req.body.assignment_id);
    const note = (req.body.note || '').toString().trim();
    const next_followup_date = req.body.next_followup_date
      ? String(req.body.next_followup_date)
      : null;

    if (!assignment_id || !Number.isFinite(assignment_id)) {
      return res.json({ ok: false, message: 'Invalid assignment_id' });
    }
    if (!note) {
      return res.json({ ok: false, message: 'Note is required' });
    }

    // IMPORTANT: queryAsync returns "rows array"
    const rows = await queryAsync(
      `SELECT id, user_id FROM lead_assignments WHERE id=? LIMIT 1`,
      [assignment_id]
    );

    if (!rows || rows.length === 0) {
      return res.json({ ok: false, message: 'Assignment not found' });
    }

    const ass = rows[0];

    // Security: agent can only write to their own assignment; admin can write to any
    if (u.role !== 'admin' && Number(ass.user_id) !== Number(u.id)) {
      return res.json({ ok: false, message: 'Not allowed' });
    }

    // Auto-generate day_no
    await queryAsync(
      `
      INSERT INTO lead_assignment_logs
        (assignment_id, day_no, day_label, note, next_followup_date, created_at)
      SELECT
        ?, COALESCE(MAX(day_no),0) + 1, 'Call', ?, ?, NOW()
      FROM lead_assignment_logs
      WHERE assignment_id = ?
      `,
      [assignment_id, note, next_followup_date, assignment_id]
    );

    // Touch assignment updated time
    await queryAsync(
      `UPDATE lead_assignments SET updated_at=NOW() WHERE id=?`,
      [assignment_id]
    );

    return res.json({ ok: true });
  } catch (e) {
    console.error('Add log error:', e);
    return res.json({ ok: false, message: 'Failed to add log' });
  }
});


router.get('/admin/sales-report',requireLogin, requireAdmin, salesAdminSalesReport);

async function salesAdminSalesReport(req, res) {
  try {
  

    const selectedMonth = isValidMonth(req.query.month) ? req.query.month : ymNow();
    const { start, end } = monthRange(selectedMonth);

    // agent filter can be agent id OR agent name
    const agentRaw = (req.query.agent || '').toString().trim();
    const q = (req.query.q || '').toString().trim();

    // Agents list
    const agents = await queryAsync(
      `SELECT id, name FROM crm_users WHERE role IN ('agent','admin') ORDER BY name`
    );

    // Convert agent id -> agent name (if numeric id passed)
    let agentNameFilter = '';
    if (agentRaw) {
      if (/^\d+$/.test(agentRaw)) {
        const found = agents.find(a => Number(a.id) === Number(agentRaw));
        agentNameFilter = found ? found.name : agentRaw; // fallback
      } else {
        agentNameFilter = agentRaw;
      }
    }

    // WHERE for aggregation
    const where = [`created_at >= ? AND created_at < ?`];
    const params = [start + ' 00:00:00', end + ' 00:00:00'];

    if (agentNameFilter) {
      where.push(`sales_person_assign = ?`);
      params.push(agentNameFilter);
    }

    if (q) {
      where.push(`(name LIKE ? OR number LIKE ? OR enquiry LIKE ? OR sales_person_assign LIKE ?)`);
      const like = `%${q}%`;
      params.push(like, like, like, like);
    }

    // Per-agent aggregation (for incentives)
    const byAgent = await queryAsync(
      `
      SELECT
        COALESCE(NULLIF(TRIM(sales_person_assign), ''), 'Unassigned') AS agent_name,
        COUNT(*) AS total_sales,
        SUM(COALESCE(lead_price,0)) AS total_revenue,
        SUM(COALESCE(advance_amount,0)) AS total_advance,
        SUM(COALESCE(agent_price,0)) AS total_agent_price
      FROM leads
      WHERE ${where.join(' AND ')}
      GROUP BY COALESCE(NULLIF(TRIM(sales_person_assign), ''), 'Unassigned')
      ORDER BY total_revenue DESC, total_sales DESC
      `,
      params
    );

    const totals = byAgent.reduce(
      (acc, r) => {
        acc.total_sales += Number(r.total_sales || 0);
        acc.total_revenue += Number(r.total_revenue || 0);
        acc.total_advance += Number(r.total_advance || 0);
        acc.total_agent_price += Number(r.total_agent_price || 0);
        return acc;
      },
      { total_sales: 0, total_revenue: 0, total_advance: 0, total_agent_price: 0 }
    );

    // Drill-down: list rows (when agent selected OR search used)
    let rows = [];
    if (agentNameFilter || q) {
      rows = await queryAsync(
        `
        SELECT id, name, number, enquiry, lead_price, advance_amount, agent_price, status, assign, created_at
        FROM leads
        WHERE ${where.join(' AND ')}
        ORDER BY created_at DESC
        LIMIT 2000
        `,
        params
      );
    }

    return res.render('freelancing/sales/admin_sales_report', {
      pageTitle: 'Admin • Sales Report',
      active: 'salesReport',
      user: req._user,
      mode: 'admin',
      filters: { selectedMonth, monthOptions: monthsList(12), agent: agentRaw, q },
      agents,
      totals,
      byAgent,
      rows
    });
  } catch (e) {
    console.error('Admin sales report error:', e);
    return res.status(500).send('Failed to load admin sales report.');
  }
}

router.get('/logs', requireLogin, requireAdmin, async (req, res) => {
  try {
    const selectedMonth = isValidMonth(req.query.month) ? req.query.month : ymNow();
    const { start, end } = monthRange(selectedMonth);

    const agent = req.query.agent ? Number(req.query.agent) : 0;
    const q = (req.query.q || '').toString().trim();

    // agents list for filter
    const agents = await queryAsync(
      `SELECT id, name FROM crm_users WHERE is_active=1 ORDER BY name ASC`
    );

    const where = [];
    const params = [];

    // Filter logs by log creation date (not lead date)
    where.push(`lg.created_at >= ? AND lg.created_at < ?`);
    params.push(start, end);

    if (agent && Number.isFinite(agent)) {
      where.push(`la.user_id = ?`);
      params.push(agent);
    }

    if (q) {
      where.push(`(
        l.name LIKE ? OR l.phone LIKE ? OR l.enquiry_title LIKE ? OR l.tempid LIKE ? OR lg.note LIKE ?
      )`);
      const like = `%${q}%`;
      params.push(like, like, like, like, like);
    }

    const rows = await queryAsync(`
      SELECT
        lg.id AS log_id,
        lg.day_label,
        lg.note,
        lg.next_followup_date,
        lg.created_at AS log_created_at,

        la.id AS assignment_id,
        la.stage AS assignment_stage,
        la.status AS assignment_status,

        u.id AS user_id,
        u.name AS user_name,

        l.id AS lead_id,
        l.tempid,
        l.name AS lead_name,
        l.phone,
        l.enquiry_title,
        l.enquiry_description

      FROM lead_assignment_logs lg
      JOIN lead_assignments la ON la.id = lg.assignment_id
      JOIN crm_users u ON u.id = la.user_id
      JOIN rockerstop_leads l ON l.id = la.lead_id

      WHERE ${where.join(' AND ')}

      ORDER BY lg.created_at DESC
      LIMIT 5000
    `, params);

    return res.render('freelancing/sales/logs', {
      pageTitle: 'Team Logs',
      mode: 'admin',
      user: req._user,
      active: 'logs',
      rows,
      agents,
      filters: {
        selectedMonth,
        monthOptions: monthsList(12),
        agent,
        q
      }
    });
  } catch (e) {
    console.error('Team Logs error:', e);
    return res.status(500).send('Failed to load Team Logs.');
  }
});


router.post('/api/assignment/status', requireLogin, async (req, res) => {
  try{
    const u = req._user;
    const assignment_id = Number(req.body.assignment_id);
    const status = (req.body.status || '').toString();
    const reason = (req.body.reason || '').toString().trim();

    const allowed = new Set(['open','rejected','closed']);
    if(!Number.isFinite(assignment_id)) return res.json({ ok:false, message:'Invalid assignment_id' });
    if(!allowed.has(status)) return res.json({ ok:false, message:'Invalid status' });

    const whereUser = (u.role === 'admin') ? '' : ' AND user_id=? ';
    const params = (u.role === 'admin')
      ? [status, status === 'rejected' ? (reason || null) : null, assignment_id]
      : [status, status === 'rejected' ? (reason || null) : null, assignment_id, u.id];

    const r = await queryAsync(`
      UPDATE lead_assignments
      SET status=?, reject_reason=?, updated_at=NOW()
      WHERE id=? ${whereUser}
      LIMIT 1
    `, params);

    if(r.affectedRows === 0) return res.json({ ok:false, message:'Not found / not allowed' });
    return res.json({ ok:true });
  }catch(e){
    console.error('assignment status error:', e);
    return res.json({ ok:false, message:'Server error' });
  }
});


async function ensureAssignmentsForMonth(start, end, onlyUserId = 0) {
  // Creates missing assignment rows for all active agents for all open leads in the month
  // If onlyUserId is provided, it creates only for that agent (used by /my for speed)

  const params = [start, end];
  let userFilterSql = '';
  if (onlyUserId && Number.isFinite(onlyUserId)) {
    userFilterSql = ' AND u.id = ? ';
    params.push(onlyUserId);
  }

  await queryAsync(`
    INSERT IGNORE INTO lead_assignments (lead_id, user_id, stage, status)
    SELECT l.id, u.id, 'new', 'open'
    FROM rockerstop_leads l
    JOIN crm_users u
      ON u.is_active = 1 AND u.role = 'agent'
    WHERE l.detected_at_utc >= ? AND l.detected_at_utc < ?
      AND l.crm_status = 'open'
      ${userFilterSql}
  `, params);
}


async function cleanupOldAssignmentsForAgent(onlyUserId) {
  const uid = Number(onlyUserId);
  console.log('userid',uid)
  if (!(uid > 0 && Number.isFinite(uid))) return;

  // This requires multipleStatements: true in your MySQL connection config
  await queryAsync(`
    SET @agent_id := ?;
    DELETE la
    FROM lead_assignments la
    JOIN crm_users u ON u.id = la.user_id
    JOIN rockerstop_leads l ON l.id = la.lead_id
    WHERE la.user_id = @agent_id
      AND l.detected_at_utc < (
        TIMESTAMP(DATE_SUB(DATE(u.created_at), INTERVAL 1 DAY), '00:00:00')
        - INTERVAL 330 MINUTE
      );
  `, [uid]);
}


function asMoneyReq(n){
  const v = Number(n);
  if (!Number.isFinite(v) || v < 0) return null;
  return v;
}

function cleanPhone(p){
  const s = (p || '').toString().replace(/\D/g,'');
  return s.length ? s : null;
}


router.get('/admin/overview', requireLogin, requireAdmin, async (req, res) => {
  try {
    const selectedMonth = isValidMonth(req.query.month) ? req.query.month : ymNow();
    const { start, end } = monthRange(selectedMonth);

    const [k1] = await queryAsync(
      `SELECT COUNT(*) AS c
       FROM rockerstop_leads
       WHERE detected_at_utc >= ? AND detected_at_utc < ?
         AND crm_status='open'`,
      [start, end]
    );

    const stageRows = await queryAsync(
      `SELECT la.stage, la.status, COUNT(*) AS c
       FROM lead_assignments la
       JOIN rockerstop_leads l ON l.id=la.lead_id
       WHERE l.detected_at_utc >= ? AND l.detected_at_utc < ?
         AND l.crm_status='open'
       GROUP BY la.stage, la.status`,
      [start, end]
    );

    const [salesAgg] = await queryAsync(
      `SELECT
         COUNT(*) AS total_sales,
         COALESCE(SUM(lead_price),0) AS total_revenue
       FROM leads
       WHERE created_at >= ? AND created_at < ?`,
      [start + ' 00:00:00', end + ' 00:00:00']
    );

    // follow-ups due: latest next_followup_date <= today
    const due = await queryAsync(`
      SELECT
        la.id AS assignment_id,
        u.name AS user_name,
        l.id AS lead_id,
        l.name,
        l.phone,
        l.enquiry_title,
        lg.next_followup_date,
        lg.note,
        lg.created_at
      FROM lead_assignments la
      JOIN rockerstop_leads l ON l.id=la.lead_id
      JOIN crm_users u ON u.id=la.user_id
      JOIN lead_assignment_logs lg
        ON lg.id = (
          SELECT x.id
          FROM lead_assignment_logs x
          WHERE x.assignment_id = la.id
          ORDER BY x.created_at DESC
          LIMIT 1
        )
      WHERE l.detected_at_utc >= ? AND l.detected_at_utc < ?
        AND l.crm_status='open'
        AND la.status='open'
        AND lg.next_followup_date IS NOT NULL
        AND lg.next_followup_date <= CURDATE()
      ORDER BY lg.next_followup_date ASC
      LIMIT 200
    `, [start, end]);

    // Normalize counts for UI
    const stageCounts = {};
    for (const r of stageRows) {
      const key = `${r.stage}:${r.status}`;
      stageCounts[key] = r.c;
    }

    return res.render('freelancing/sales/overview', {
      pageTitle: 'Admin • Overview',
      active: 'overview',
      user: req._user,
      mode: 'admin',
      filters: { selectedMonth, monthOptions: monthsList(12) },
      kpis: {
        totalLeads: k1?.c || 0,
        totalSales: salesAgg?.total_sales || 0,
        totalRevenue: salesAgg?.total_revenue || 0,
        openAssignments: stageRows.reduce((a, r) => a + (r.status === 'open' ? Number(r.c) : 0), 0)
      },
      stageCounts,
      due
    });
  } catch (e) {
    console.error('Admin overview error:', e);
    res.status(500).send('Failed to load overview.');
  }
});




router.get('/my/overview', requireLogin, async (req, res) => {
  try {
    const u = req._user;

    const selectedMonth = isValidMonth(req.query.month) ? req.query.month : ymNow();
    const { start, end } = monthRange(selectedMonth);

    const stageRows = await queryAsync(
      `SELECT la.stage, la.status, COUNT(*) AS c
       FROM lead_assignments la
       JOIN rockerstop_leads l ON l.id=la.lead_id
       WHERE l.detected_at_utc >= ? AND l.detected_at_utc < ?
         AND l.crm_status='open'
         AND la.user_id=?
       GROUP BY la.stage, la.status`,
      [start, end, u.id]
    );

    const [salesAgg] = await queryAsync(
      `SELECT COUNT(*) AS total_sales, COALESCE(SUM(lead_price),0) AS total_revenue
       FROM leads
       WHERE sales_person_assign = ?
         AND created_at >= ? AND created_at < ?`,
      [u.name, start + ' 00:00:00', end + ' 00:00:00']
    );

    const due = await queryAsync(`
      SELECT
        la.id AS assignment_id,
        l.id AS lead_id,
        l.name,
        l.phone,
        l.enquiry_title,
        lg.next_followup_date,
        lg.note,
        lg.created_at
      FROM lead_assignments la
      JOIN rockerstop_leads l ON l.id=la.lead_id
      JOIN lead_assignment_logs lg
        ON lg.id = (
          SELECT x.id
          FROM lead_assignment_logs x
          WHERE x.assignment_id = la.id
          ORDER BY x.created_at DESC
          LIMIT 1
        )
      WHERE l.detected_at_utc >= ? AND l.detected_at_utc < ?
        AND l.crm_status='open'
        AND la.status='open'
        AND la.user_id=?
        AND lg.next_followup_date IS NOT NULL
        AND lg.next_followup_date <= CURDATE()
      ORDER BY lg.next_followup_date ASC
      LIMIT 200
    `, [start, end, u.id]);

    const stageCounts = {};
    for (const r of stageRows) stageCounts[`${r.stage}:${r.status}`] = r.c;

    const openAssignments = stageRows.reduce((a, r) => a + (r.status === 'open' ? Number(r.c) : 0), 0);

    return res.render('freelancing/sales/overview', {
      pageTitle: 'My • Overview',
      active: 'overview',
      user: u,
      mode: 'agent',
      filters: { selectedMonth, monthOptions: monthsList(12) },
      kpis: {
        totalLeads: openAssignments,
        totalSales: salesAgg?.total_sales || 0,
        totalRevenue: salesAgg?.total_revenue || 0,
        openAssignments
      },
      stageCounts,
      due
    });
  } catch (e) {
    console.error('Agent overview error:', e);
    res.status(500).send('Failed to load overview.');
  }
});


router.get('/admin/new-sale', requireLogin, requireAdmin, async (req, res) => {
  try {
    const agents = await queryAsync(
      `SELECT id, name FROM crm_users WHERE is_active=1 AND role='agent' ORDER BY name ASC`
    );
    res.render('freelancing/sales/new-sale', {
      pageTitle: 'Admin • Direct Sale Entry',
      active: 'newSale',
      user: req._user,
      agents,
      error: '',
      form: { name:'', number:'', enquiry:'', lead_price:'', assign:'', remarks:'', deadline:'', advance_amount:'', pakistani_price:'', sheet_uid:'' }
    });
  } catch (e) {
    console.error('new-sale page error:', e);
    res.status(500).send('Failed to load page.');
  }
});


router.post('/admin/new-sale', requireLogin, requireAdmin, async (req, res) => {
  try {
    const name = (req.body.name || '').toString().trim();
    const number = cleanPhone(req.body.number);
    const enquiry = (req.body.enquiry || '').toString().trim();
    const lead_price = asMoneyReq(req.body.lead_price);

    const deadline = req.body.deadline ? String(req.body.deadline) : null;
    const assign = (req.body.assign || '').toString().trim() || null;
    const remarks = (req.body.remarks || '').toString().trim() || null;

    const advance_amount = (req.body.advance_amount !== '' && req.body.advance_amount != null)
      ? asMoneyReq(req.body.advance_amount)
      : null;

    const pakistani_price = (req.body.pakistani_price !== '' && req.body.pakistani_price != null)
      ? asMoneyReq(req.body.pakistani_price)
      : null;

    const sheet_uid = (req.body.sheet_uid || '').toString().trim() || null;

    if (!name || !number || !enquiry || lead_price === null) {
      const agents = await queryAsync(`SELECT id, name FROM crm_users WHERE is_active=1 AND role='agent' ORDER BY name ASC`);
      return res.render('freelancing/sales/new-sale', {
        pageTitle: 'Admin • Direct Sale Entry',
        active: 'newSale',
        user: req._user,
        agents,
        error: 'Name, Number, Enquiry, Lead Price are mandatory.',
        form: { name, number: (req.body.number||''), enquiry, lead_price: (req.body.lead_price||''), assign: assign||'', remarks: remarks||'', deadline: deadline||'', advance_amount: req.body.advance_amount||'', pakistani_price: req.body.pakistani_price||'', sheet_uid: sheet_uid||'' }
      });
    }

    // Optional values
    const agent_price = (req.body.agent_price !== '' && req.body.agent_price != null)
      ? asMoneyReq(req.body.agent_price)
      : null;

    await queryAsync(`
      INSERT INTO leads
        (name, number, deadline, enquiry, status, assign, lead_price, agent_price,
         is_project_done, is_payment_received, is_agent_payment_done,
         advance_amount, remarks, pakistani_price, sheet_uid, created_at)
      VALUES
        (?, ?, ?, ?, 'pending', ?, ?, ?,
         0, 0, 0,
         ?, ?, ?, ?, NOW())
    `, [
      name,
      number,
      deadline,
      enquiry,
      assign,
      lead_price,
      agent_price,
      advance_amount,
      remarks,
      pakistani_price,
      sheet_uid
    ]);

    return res.redirect('/sales/admin/sales');
  } catch (e) {
    console.error('Direct sale insert error:', e);
    return res.status(500).send('Failed to create sale.');
  }
});

router.get('/admin/sales', requireLogin, requireAdmin, async (req, res) => {
  try {
    const selectedMonth = isValidMonth(req.query.month) ? req.query.month : ymNow();
    const { start, end } = monthRange(selectedMonth);
    const q = (req.query.q || '').toString().trim();

    const where = [`created_at >= ? AND created_at < ?`];
    const params = [start + ' 00:00:00', end + ' 00:00:00'];

    if (q) {
      where.push(`(name LIKE ? OR number LIKE ? OR enquiry LIKE ? OR sales_person_assign LIKE ?)`);
      const like = `%${q}%`;
      params.push(like, like, like, like);
    }

    const rows = await queryAsync(`
      SELECT *
      FROM leads
      WHERE ${where.join(' AND ')}
      ORDER BY created_at DESC
      LIMIT 4000
    `, params);

    return res.render('freelancing/sales/sales-list', {
      pageTitle: 'Admin • Sales',
      active: 'sales',
      user: req._user,
      mode: 'admin',
      filters: { selectedMonth, monthOptions: monthsList(12), q },
      rows
    });
  } catch (e) {
    console.error('Admin sales list error:', e);
    res.status(500).send('Failed to load sales list.');
  }
});


router.get('/my/sales', requireLogin, async (req, res) => {
  try {
    const u = req._user;

    const selectedMonth = isValidMonth(req.query.month) ? req.query.month : ymNow();
    const { start, end } = monthRange(selectedMonth);
    const q = (req.query.q || '').toString().trim();

    const where = [`created_at >= ? AND created_at < ?`, `sales_person_assign = ?`];
    const params = [start + ' 00:00:00', end + ' 00:00:00', u.name];

    if (q) {
      where.push(`(name LIKE ? OR number LIKE ? OR enquiry LIKE ?)`);
      const like = `%${q}%`;
      params.push(like, like, like);
    }

    const rows = await queryAsync(`
      SELECT *
      FROM leads
      WHERE ${where.join(' AND ')}
      ORDER BY created_at DESC
      LIMIT 2000
    `, params);

    return res.render('freelancing/sales/sales-list', {
      pageTitle: 'My • Sales',
      active: 'sales',
      user: u,
      mode: 'agent',
      filters: { selectedMonth, monthOptions: monthsList(12), q },
      rows
    });
  } catch (e) {
    console.error('Agent sales list error:', e);
    res.status(500).send('Failed to load sales list.');
  }
});





// ---------------------------
// Global Rejected Leads (admin only)
// GET /sales/rejected-leads?month=YYYY-MM
// ---------------------------
router.get('/rejected-leads', requireLogin, requireAdmin, async (req, res) => {
  try {
    const selectedMonth = isValidMonth(req.query.month) ? req.query.month : ymNow();
    const { start, end } = monthRange(selectedMonth);

    const rows = await queryAsync(`
      SELECT
        id, tempid, name, phone, enquiry_title, enquiry_description,
        crm_status, crm_reject_reason, crm_updated_at
      FROM rockerstop_leads
      WHERE detected_at_utc >= ? AND detected_at_utc < ?
        AND crm_status = 'rejected'
      ORDER BY crm_updated_at DESC
      LIMIT 5000
    `, [start, end]);

    return res.render('freelancing/sales/rejected-leads', {
      pageTitle: 'Admin • Globally Rejected Leads',
      user: req._user,
      rows,
      filters: { selectedMonth, monthOptions: monthsList(12) }
    });
  } catch (e) {
    console.error("Rejected leads error:", e);
    return res.status(500).send("Failed to load rejected leads.");
  }
});

// ---------------------------
// API: Assign lead to multiple users (admin)
// POST /sales/api/admin/assign
// body: { lead_id, user_ids: [1,2,3] }
// ---------------------------
router.post('/api/admin/assign', requireLogin, requireAdmin, async (req, res) => {
  try {
    const leadId = Number(req.body.lead_id);
    const userIds = Array.isArray(req.body.user_ids) ? req.body.user_ids.map(Number).filter(Number.isFinite) : [];

    if (!Number.isFinite(leadId)) return res.status(400).json({ ok: false, message: "Invalid lead_id" });
    if (!userIds.length) return res.status(400).json({ ok: false, message: "user_ids required" });

    // lead must be open globally
    const leadRows = await queryAsync(`SELECT id FROM rockerstop_leads WHERE id=? AND crm_status='open' LIMIT 1`, [leadId]);
    if (!leadRows.length) return res.status(404).json({ ok: false, message: "Lead not found or not open" });

    // insert ignore to avoid duplicates
    const values = userIds.map(uid => [leadId, uid]);
    await queryAsync(`INSERT IGNORE INTO lead_assignments (lead_id, user_id) VALUES ?`, [values]);

    return res.json({ ok: true });
  } catch (e) {
    console.error("Assign lead error:", e);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

// ---------------------------
// API: Update assignment stage (agent/admin)
// POST /sales/api/assignment/stage
// body: { assignment_id, stage }
// ---------------------------
router.post('/api/assignment/stage', requireLogin, async (req, res) => {
  try {
    const u = req._user;
    const assignmentId = Number(req.body.assignment_id);
    const stage = String(req.body.stage || '');

    if (!Number.isFinite(assignmentId)) return res.status(400).json({ ok: false, message: "Invalid assignment_id" });
    if (!STAGE_SET.has(stage)) return res.status(400).json({ ok: false, message: "Invalid stage" });

    // only owner agent OR admin
    const rows = await queryAsync(`SELECT user_id FROM lead_assignments WHERE id=? LIMIT 1`, [assignmentId]);
    if (!rows.length) return res.status(404).json({ ok: false, message: "Assignment not found" });
    if (u.role !== 'admin' && rows[0].user_id !== u.id) return res.status(403).json({ ok: false, message: "Forbidden" });

    await queryAsync(`
      UPDATE lead_assignments
      SET stage=?, last_action_at=NOW()
      WHERE id=? AND status='open'
      LIMIT 1
    `, [stage, assignmentId]);

    return res.json({ ok: true });
  } catch (e) {
    console.error("Stage update error:", e);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

// ---------------------------
// API: Reject assignment (agent/admin)
// POST /sales/api/assignment/reject
// body: { assignment_id, reason }
// ---------------------------
router.post('/api/assignment/reject', requireLogin, async (req, res) => {
  try {
    const u = req._user;
    const assignmentId = Number(req.body.assignment_id);
    const reason = (req.body.reason || '').toString().trim();

    if (!Number.isFinite(assignmentId)) return res.status(400).json({ ok: false, message: "Invalid assignment_id" });

    const rows = await queryAsync(`
      SELECT la.user_id, l.crm_status
      FROM lead_assignments la
      JOIN rockerstop_leads l ON l.id=la.lead_id
      WHERE la.id=? LIMIT 1
    `, [assignmentId]);
    if (!rows.length) return res.status(404).json({ ok: false, message: "Assignment not found" });

    if (u.role !== 'admin' && rows[0].user_id !== u.id) return res.status(403).json({ ok: false, message: "Forbidden" });
    if (rows[0].crm_status !== 'open') return res.status(400).json({ ok: false, message: "Lead not open globally" });

    await queryAsync(`
      UPDATE lead_assignments
      SET status='rejected', reject_reason=?, last_action_at=NOW()
      WHERE id=? AND status='open'
      LIMIT 1
    `, [reason || null, assignmentId]);

    return res.json({ ok: true });
  } catch (e) {
    console.error("Reject assignment error:", e);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

// ---------------------------
// API: Add call log entry (agent/admin)
// POST /sales/api/assignment/calls
// body: { assignment_id, note, next_followup_date }
// ---------------------------
router.post('/api/assignment/calls', requireLogin, async (req, res) => {
  try {
    const u = req._user;
    const assignmentId = Number(req.body.assignment_id);
    const note = (req.body.note ?? "").toString().trim();
    const next_followup_date = (req.body.next_followup_date ?? "").toString().trim() || null;

    if (!Number.isFinite(assignmentId)) return res.status(400).json({ ok: false, message: "Invalid assignment_id" });
    if (!note) return res.status(400).json({ ok: false, message: "note required" });

    const rows = await queryAsync(`SELECT id, user_id FROM lead_assignments WHERE id=? LIMIT 1`, [assignmentId]);
    if (!rows.length) return res.status(404).json({ ok: false, message: "Assignment not found" });
    if (u.role !== 'admin' && rows[0].user_id !== u.id) return res.status(403).json({ ok: false, message: "Forbidden" });

    const cnt = await queryAsync(`SELECT COUNT(*) AS c FROM lead_assignment_logs WHERE assignment_id=?`, [assignmentId]);
    const nextDay = Number(cnt[0]?.c || 0) + 1;
    const day_label = `Day ${nextDay}`;

    await queryAsync(`
      INSERT INTO lead_assignment_logs (assignment_id, day_no, day_label, note, next_followup_date, created_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [assignmentId, nextDay, day_label, note, next_followup_date, u.id]);

    // automatically move assignment to followup if still open
    await queryAsync(`
      UPDATE lead_assignments
      SET stage='followup', last_action_at=NOW()
      WHERE id=? AND status='open'
      LIMIT 1
    `, [assignmentId]);

    return res.json({ ok: true, day_label });
  } catch (e) {
    console.error("Add call log error:", e);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

// ---------------------------
// API: List call logs
// GET /sales/api/assignment/calls/:assignment_id
// ---------------------------
router.get('/api/assignment/calls/:assignment_id', requireLogin, async (req, res) => {
  try {
    const u = req._user;
    const assignmentId = Number(req.params.assignment_id);
    if (!Number.isFinite(assignmentId)) return res.status(400).json({ ok: false, message: "Invalid assignment_id" });

    const rows = await queryAsync(`SELECT user_id FROM lead_assignments WHERE id=? LIMIT 1`, [assignmentId]);
    if (!rows.length) return res.status(404).json({ ok: false, message: "Assignment not found" });
    if (u.role !== 'admin' && rows[0].user_id !== u.id) return res.status(403).json({ ok: false, message: "Forbidden" });

    const logs = await queryAsync(`
      SELECT id, day_label, note, next_followup_date, created_at
      FROM lead_assignment_logs
      WHERE assignment_id=?
      ORDER BY created_at ASC
    `, [assignmentId]);

    return res.json({ ok: true, rows: logs });
  } catch (e) {
    console.error("Calls list error:", e);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

// ---------------------------
// API: Convert assignment -> Sales (agent/admin)
// POST /sales/api/assignment/convert
// body: { assignment_id, lead_price, agent_price, deadline, assign, remarks, advance_amount, pakistani_price, sheet_uid }
// ---------------------------
router.post('/api/assignment/convert', requireLogin, async (req, res) => {
  let conn = null;
  try {
    const u = req._user;
    const assignmentId = Number(req.body.assignment_id);
    if (!Number.isFinite(assignmentId)) return res.status(400).json({ ok: false, message: "Invalid assignment_id" });

    const lead_price = asMoney(req.body.lead_price);
    const agent_price = asMoney(req.body.agent_price);
    if (lead_price === null) return res.status(400).json({ ok: false, message: "lead_price required (>=0)" });
    if (agent_price === null) return res.status(400).json({ ok: false, message: "agent_price required (>=0)" });

    const deadline = req.body.deadline ? String(req.body.deadline) : null;
    const assign = req.body.assign ? String(req.body.assign) : null;
    const remarks = req.body.remarks ? String(req.body.remarks) : null;

    const advance_amount = (req.body.advance_amount !== undefined && req.body.advance_amount !== null && req.body.advance_amount !== '')
      ? asMoney(req.body.advance_amount) : null;
    const pakistani_price = (req.body.pakistani_price !== undefined && req.body.pakistani_price !== null && req.body.pakistani_price !== '')
      ? asMoney(req.body.pakistani_price) : null;
    const sheet_uid = req.body.sheet_uid ? String(req.body.sheet_uid) : null;

    if (req.body.advance_amount && advance_amount === null) return res.status(400).json({ ok: false, message: "advance_amount must be >=0" });
    if (req.body.pakistani_price && pakistani_price === null) return res.status(400).json({ ok: false, message: "pakistani_price must be >=0" });

    conn = await getConnAsync();
    const connQuery = util.promisify(conn.query).bind(conn);
    const begin = util.promisify(conn.beginTransaction).bind(conn);
    const commit = util.promisify(conn.commit).bind(conn);
    const rollback = util.promisify(conn.rollback).bind(conn);

    await begin();

    // Read assignment (lock lead row later)
    const arows = await connQuery(`
      SELECT la.id, la.user_id, la.lead_id, la.status AS assignment_status,
             l.crm_status AS lead_status
      FROM lead_assignments la
      JOIN rockerstop_leads l ON l.id=la.lead_id
      WHERE la.id=?
      LIMIT 1
    `, [assignmentId]);

    if (!arows.length) {
      await rollback();
      return res.status(404).json({ ok: false, message: "Assignment not found" });
    }

    const a = arows[0];
    if (u.role !== 'admin' && a.user_id !== u.id) {
      await rollback();
      return res.status(403).json({ ok: false, message: "Forbidden" });
    }
    if (a.assignment_status !== 'open') {
      await rollback();
      return res.status(400).json({ ok: false, message: "Assignment not open" });
    }

    // Lock the lead row: only one conversion globally
    const lrows = await connQuery(`
      SELECT id, name, phone, enquiry_title, crm_assign
      FROM rockerstop_leads
      WHERE id=? AND crm_status='open'
      FOR UPDATE
    `, [a.lead_id]);

    if (!lrows.length) {
      await rollback();
      return res.status(400).json({ ok: false, message: "Lead already converted/rejected globally" });
    }

    const lead = lrows[0];

    // Insert into SALES table (your existing table: leads)
    const ins = await connQuery(`
      INSERT INTO leads
        (name, number, deadline, enquiry, status, sales_person_assign, lead_price, agent_price,
         is_project_done, is_payment_received, is_agent_payment_done,
         advance_amount, remarks, pakistani_price, sheet_uid, created_at)
      VALUES
        (?, ?, ?, ?, 'pending', ?, ?, ?,
         0, 0, 0,
         ?, ?, ?, ?, ?)
    `, [
      lead.name || null,
      lead.phone || null,
      deadline,
      lead.enquiry_title || null,
      assign || lead.crm_assign || u.name || null,
      lead_price,
      agent_price,
      advance_amount,
      remarks,
      pakistani_price,
      sheet_uid,
      dataService.getCurrentDate()
    ]);

    const salesId = ins.insertId;

    // Update lead global status
    await connQuery(`
      UPDATE rockerstop_leads
      SET crm_status='converted', crm_updated_at=NOW(), crm_converted_sales_id=?
      WHERE id=?
      LIMIT 1
    `, [salesId, a.lead_id]);

    // Close ALL assignments for that lead
    await connQuery(`
      UPDATE lead_assignments
      SET status='closed',
          close_reason = CASE WHEN id=? THEN 'converted_by_self' ELSE 'converted_by_other' END,
          closed_at=NOW()
      WHERE lead_id=? AND status<>'closed'
    `, [assignmentId, a.lead_id]);

    // Add a log entry on the converting assignment
    await connQuery(`
      INSERT INTO lead_assignment_logs (assignment_id, day_no, day_label, note, created_by)
      VALUES (?, 9999, 'Converted', ?, ?)
    `, [assignmentId, `Converted to sales_id=${salesId}. lead_price=${lead_price}, agent_price=${agent_price}`, u.id]);

    await commit();

    return res.json({ ok: true, sales_id: salesId });
  } catch (e) {
    try { if (conn) await util.promisify(conn.rollback).bind(conn)(); } catch {}
    console.error("Convert error:", e);
    return res.status(500).json({ ok: false, message: "Server error" });
  } finally {
    try { if (conn) conn.release(); } catch {}
  }
});

// ---------------------------
// Admin: Edit lead (global) - optional
// ---------------------------
router.get('/api/lead/:lead_id', requireLogin, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.lead_id);
    if (!Number.isFinite(id)) return res.status(400).json({ ok: false, message: "Invalid lead_id" });

    const rows = await queryAsync(`
      SELECT id, name, phone, enquiry_title, enquiry_description
      FROM rockerstop_leads
      WHERE id=?
      LIMIT 1
    `, [id]);

    if (!rows.length) return res.status(404).json({ ok: false, message: "Lead not found" });
    return res.json({ ok: true, lead: rows[0] });
  } catch (e) {
    console.error("Get lead error:", e);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

router.post('/api/lead/update', requireLogin, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.body.id);
    if (!Number.isFinite(id)) return res.status(400).json({ ok: false, message: "Invalid lead id" });

    const name = (req.body.name ?? '').toString().trim() || null;
    const phone = (req.body.phone ?? '').toString().trim() || null;
    const enquiry_title = (req.body.enquiry_title ?? '').toString().trim() || null;
    const enquiry_description = (req.body.enquiry_description ?? '').toString().trim() || null;

    if (phone && !/^\d{10,15}$/.test(phone)) {
      return res.status(400).json({ ok: false, message: "Invalid phone format. Use 10–15 digits." });
    }

    const r = await queryAsync(`
      UPDATE rockerstop_leads
      SET name=?, phone=?, enquiry_title=?, enquiry_description=?, crm_updated_at=NOW()
      WHERE id=?
      LIMIT 1
    `, [name, phone, enquiry_title, enquiry_description, id]);

    if (!r.affectedRows) return res.status(404).json({ ok: false, message: "Lead not found" });
    return res.json({ ok: true });
  } catch (e) {
    console.error("Update lead error:", e);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

module.exports = router;
