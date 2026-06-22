var express = require('express');
var router = express.Router();
var pool = require('./pool');
require('dotenv').config();
const util = require('util');
const queryAsync = util.promisify(pool.query).bind(pool);
const getConnAsync = util.promisify(pool.getConnection).bind(pool);

const dataService = require('./verify'); // you already use this for getCurrentDate()
const { createSocketAuthToken } = require('../utils/socketAuth');
const {
  buildSessionUser,
  validateSessionUser,
  invalidateUserSessions,
  destroySession,
  sessionInvalidResponse,
  SESSION_INVALID_MESSAGES
} = require('../utils/crmSession');
const {
  parseScmFilters,
  fetchScmDashboard,
  fetchSourceCodeScreenshotList
} = require('../utils/scmHelpers');
const {
  parsePrmFilters,
  fetchPrmDashboard
} = require('../utils/prmHelpers');

// ---------------------------
// Helpers
// ---------------------------
const STAGES = [
  { key: "new", label: "New Inquiry", short: "New", color: "#6366f1", icon: "bi-inbox" },
  { key: "followup", label: "In Follow-up", short: "Follow-up", color: "#0ea5e9", icon: "bi-telephone-outbound" },
  { key: "interested", label: "High Intent", short: "Hot Lead", color: "#f59e0b", icon: "bi-fire" },
];

const STAGE_SET = new Set(STAGES.map(s => s.key));

/** Agent incentive = 5% of closed-won deal value (lead_price / revenue). */
const AGENT_COMMISSION_RATE = 0.05;

function commissionFromRevenue(revenue) {
  const n = Number(revenue) || 0;
  return Math.round(n * AGENT_COMMISSION_RATE * 100) / 100;
}

function withCommissionTotals(totals) {
  const t = totals || {};
  return { ...t, total_agent_price: commissionFromRevenue(t.total_revenue) };
}

function withCommissionAgentRow(row) {
  const rev = Number(row.total_revenue ?? row.revenue ?? 0);
  const commission = commissionFromRevenue(rev);
  return { ...row, total_agent_price: commission, commission };
}

function withCommissionDealRows(rows) {
  return (rows || []).map((r) => ({ ...r, agent_price: commissionFromRevenue(r.lead_price) }));
}

/** Total UI screenshots — SQL COUNT on gallery; legacy cover only when table is empty */
async function fetchAgentAnalytics(userName, start, end) {
  const [dailySales, revenueAgg] = await Promise.all([
    queryAsync(
      `SELECT DATE(created_at) AS day, COUNT(*) AS deals, COALESCE(SUM(lead_price),0) AS revenue
       FROM leads
       WHERE sales_person_assign = ? AND created_at >= ? AND created_at < ?
       GROUP BY DATE(created_at)
       ORDER BY day ASC`,
      [userName, start + ' 00:00:00', end + ' 00:00:00']
    ),
    queryAsync(
      `SELECT COALESCE(SUM(lead_price),0) AS total_revenue,
              COALESCE(SUM(advance_amount),0) AS total_advance
       FROM leads
       WHERE sales_person_assign = ? AND created_at >= ? AND created_at < ?`,
      [userName, start + ' 00:00:00', end + ' 00:00:00']
    )
  ]);
  const rev = revenueAgg?.[0]?.total_revenue || 0;
  return {
    dailySales: dailySales || [],
    advanceTotal: revenueAgg?.[0]?.total_advance || 0,
    agentTotal: commissionFromRevenue(rev)
  };
}

async function fetchAgentPipelineRows(userId, start, end) {
  return queryAsync(`
    SELECT
      la.id AS assignment_id,
      la.stage AS assignment_stage,
      la.status AS assignment_status,
      la.reject_reason AS assignment_reject_reason,
      la.updated_at AS assignment_updated_at,
      l.id AS lead_id,
      l.tempid,
      l.name,
      l.phone,
      l.enquiry_title,
      l.enquiry_description,
      l.detected_at_utc,
      l.crm_status AS lead_status,
      lg.next_followup_date AS last_next_followup_date,
      lg.note AS last_note,
      lg.created_at AS last_call_at
    FROM lead_assignments la
    JOIN rockerstop_leads l ON l.id = la.lead_id
    LEFT JOIN lead_assignment_logs lg
      ON lg.id = (
        SELECT x.id FROM lead_assignment_logs x
        WHERE x.assignment_id = la.id
        ORDER BY x.created_at DESC LIMIT 1
      )
    WHERE l.detected_at_utc >= ? AND l.detected_at_utc < ?
      AND l.crm_status = 'open'
      AND la.user_id = ?
      AND la.status = 'open'
    ORDER BY la.updated_at DESC
    LIMIT 500
  `, [start, end, userId]);
}

function groupPipelineByStage(rows) {
  const board = { new: [], followup: [], interested: [] };
  for (const r of rows || []) {
    const k = r.assignment_stage;
    if (board[k]) board[k].push(r);
  }
  return board;
}

function parseChartDay(day) {
  if (!day) return null;
  if (day instanceof Date && !Number.isNaN(day.getTime())) return day;
  const s = String(day).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = new Date(`${s.slice(0, 10)}T12:00:00`);
    if (!Number.isNaN(d.getTime())) return d;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatChartDayLabel(day, style = 'short') {
  const d = parseChartDay(day);
  if (!d) return String(day || '').slice(0, 10);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  if (style === 'iso') {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  }
  if (style === 'long') {
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
  }
  return `${d.getDate()} ${months[d.getMonth()]}`;
}

function buildDailyChartSeries(dailySales) {
  const rows = (dailySales || [])
    .map((r) => ({
      iso: formatChartDayLabel(r.day, 'iso'),
      label: formatChartDayLabel(r.day, 'short'),
      deals: Number(r.deals) || 0,
      revenue: Number(r.revenue) || 0
    }))
    .filter((r) => r.iso);

  return {
    dailyLabels: rows.map((r) => r.label),
    dailyLabelsFull: rows.map((r) => r.label),
    dailyLabelsIso: rows.map((r) => r.iso),
    dailyDeals: rows.map((r) => r.deals),
    dailyRevenue: rows.map((r) => r.revenue)
  };
}

async function fetchDailySalesForLeads(where, params) {
  return queryAsync(
    `SELECT DATE(created_at) AS day, COUNT(*) AS deals, COALESCE(SUM(lead_price),0) AS revenue
     FROM leads WHERE ${where.join(' AND ')}
     GROUP BY DATE(created_at) ORDER BY day ASC`,
    params
  );
}

async function fetchAdminAnalytics(start, end) {
  const startDt = `${start} 00:00:00`;
  const endDt = `${end} 00:00:00`;

  const [dailySales, agentPerformance, dealTotals, activeAgents] = await Promise.all([
    queryAsync(
      `SELECT DATE(created_at) AS day, COUNT(*) AS deals, COALESCE(SUM(lead_price),0) AS revenue
       FROM leads WHERE created_at >= ? AND created_at < ?
       GROUP BY DATE(created_at) ORDER BY day ASC`,
      [startDt, endDt]
    ),
    queryAsync(
      `SELECT COALESCE(NULLIF(TRIM(sales_person_assign), ''), 'Unassigned') AS agent_name,
              COUNT(*) AS deals,
              COALESCE(SUM(lead_price),0) AS revenue,
              COALESCE(SUM(advance_amount),0) AS advance,
              COALESCE(SUM(agent_price),0) AS commission
       FROM leads WHERE created_at >= ? AND created_at < ?
       GROUP BY COALESCE(NULLIF(TRIM(sales_person_assign), ''), 'Unassigned')
       ORDER BY revenue DESC, deals DESC LIMIT 25`,
      [startDt, endDt]
    ),
    queryAsync(
      `SELECT COUNT(*) AS deals, COALESCE(SUM(lead_price),0) AS revenue,
              COALESCE(SUM(advance_amount),0) AS advance,
              COALESCE(SUM(agent_price),0) AS commission
       FROM leads WHERE created_at >= ? AND created_at < ?`,
      [startDt, endDt]
    ),
    queryAsync(
      `SELECT COUNT(*) AS c FROM crm_users WHERE is_active=1 AND role='agent'`
    )
  ]);

  const totalsRaw = dealTotals?.[0] || {};
  const agentPerformanceMapped = (agentPerformance || []).map((r) => ({
    ...r,
    commission: commissionFromRevenue(r.revenue)
  }));

  return {
    dailySales: dailySales || [],
    agentPerformance: agentPerformanceMapped,
    totals: {
      ...totalsRaw,
      commission: commissionFromRevenue(totalsRaw.revenue)
    },
    activeAgents: activeAgents?.[0]?.c || 0
  };
}

async function fetchAdminPipelineRows(start, end, agentId = 0) {
  const params = [start, end];
  let agentSql = '';
  if (agentId && Number.isFinite(agentId)) {
    agentSql = ' AND la.user_id = ? ';
    params.push(agentId);
  }
  return queryAsync(`
    SELECT la.id AS assignment_id, la.stage AS assignment_stage, la.status AS assignment_status,
           la.updated_at AS assignment_updated_at, u.id AS user_id, u.name AS user_name,
           l.id AS lead_id, l.tempid, l.name, l.phone, l.enquiry_title, l.enquiry_description,
           lg.next_followup_date AS last_next_followup_date, lg.note AS last_note
    FROM lead_assignments la
    JOIN rockerstop_leads l ON l.id = la.lead_id
    JOIN crm_users u ON u.id = la.user_id
    LEFT JOIN lead_assignment_logs lg ON lg.id = (
      SELECT x.id FROM lead_assignment_logs x WHERE x.assignment_id = la.id
      ORDER BY x.created_at DESC LIMIT 1
    )
    WHERE l.detected_at_utc >= ? AND l.detected_at_utc < ?
      AND l.crm_status = 'open' AND la.status = 'open' ${agentSql}
    ORDER BY la.updated_at DESC LIMIT 800
  `, params);
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
function getBackofficeUser(req) {
  if (req.session?.adminid) {
    return { id: req.session.adminid, name: 'Admin', role: 'admin' };
  }
  return null;
}

function getUser(req) {
  const backoffice = getBackofficeUser(req);
  if (backoffice) return backoffice;
  if (req.user) return req.user;
  if (req.session?.user) return req.session.user;
  return null;
}

async function requireLogin(req, res, next) {
  const backoffice = getBackofficeUser(req);
  if (backoffice) {
    req._user = backoffice;
    res.locals.socketAuthToken = createSocketAuthToken(backoffice);
    return next();
  }

  const u = getUser(req);
  if (!u || u.id == null) return res.redirect('/auth/login');

  try {
    const v = await validateSessionUser(u);
    if (!v.ok) {
      return sessionInvalidResponse(req, res, '/auth/login', v.reason);
    }
    req._user = v.user;
    req.session.user = v.user;
    res.locals.socketAuthToken = createSocketAuthToken(v.user);
    return next();
  } catch (e) {
    console.error('requireLogin session error:', e);
    destroySession(req);
    return res.redirect('/auth/login');
  }
}

router.use((req, res, next) => {
  const u = getUser(req);
  if (u) res.locals.socketAuthToken = createSocketAuthToken(u);
  next();
});


const ADMIN_ROLES = new Set(['admin', 'administrator', 'superadmin']);
function requireAdmin(req, res, next) {
  const u = req._user || getUser(req);
  if (!u) return res.redirect('/auth/login');
  const role = String(u.role || '').trim().toLowerCase();
  if (!ADMIN_ROLES.has(role)) return res.redirect('/auth/login?msg=Admin%20access%20required.%20Please%20log%20in%20with%20an%20admin%20account.');
  next();
}

// ---------------------------
// Landing
// ---------------------------
router.get('/', async (req, res) => {
  const backoffice = getBackofficeUser(req);
  if (backoffice) {
    return res.redirect('/sales/admin/overview');
  }

  const u = getUser(req);
  if (!u) {
    return res.render('freelancing/sales/login', { error: '' });
  }

  try {
    const v = await validateSessionUser(u);
    if (!v.ok) {
      destroySession(req);
      const msg = SESSION_INVALID_MESSAGES[v.reason] || SESSION_INVALID_MESSAGES.missing;
      return res.render('freelancing/sales/login', { error: msg });
    }
    req.session.user = v.user;
    const role = String(v.user.role || '').trim().toLowerCase();
    if (['admin', 'administrator', 'superadmin'].includes(role)) return res.redirect('/sales/admin/overview');
    if (role === 'setup_support') return res.redirect('/setup-support');
    if (role === 'source_code_manager') return res.redirect('/source-code-manager');
    if (role === 'project_report_manager') return res.redirect('/project-report-manager');
    if (role === 'project_report_creator') return res.redirect('/project-report-creator');
    return res.redirect('/sales/my');
  } catch (e) {
    console.error('Sales landing session error:', e);
    destroySession(req);
    return res.render('freelancing/sales/login', { error: 'Server error.' });
  }
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

    return res.render('freelancing/sales/assignments-admin', {
      pageTitle: 'Team Lead Assignments',
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

    const stageRows = await queryAsync(
      `SELECT la.stage, la.status, COUNT(*) AS c
       FROM lead_assignments la
       JOIN rockerstop_leads l ON l.id = la.lead_id
       WHERE l.detected_at_utc >= ? AND l.detected_at_utc < ?
         AND l.crm_status = 'open'
         AND la.user_id = ?
       GROUP BY la.stage, la.status`,
      [start, end, u.id]
    );

    const stageCounts = {};
    for (const r of stageRows) stageCounts[`${r.stage}:${r.status}`] = Number(r.c);

    const [salesMonth] = await queryAsync(
      `SELECT COUNT(*) AS total_sales, COALESCE(SUM(lead_price),0) AS total_revenue
       FROM leads
       WHERE sales_person_assign = ? AND created_at >= ? AND created_at < ?`,
      [u.name, start + ' 00:00:00', end + ' 00:00:00']
    );

    return res.render('freelancing/sales/assignments-agent', {
      pageTitle: 'Lead Directory',
      mode: 'agent',
      user: u,
      stages: STAGES,
      rows,
      agents: [],
      active: 'assignments',
      stats: {
        total: rows.length,
        newOpen: stageCounts['new:open'] || 0,
        followupOpen: stageCounts['followup:open'] || 0,
        interestedOpen: stageCounts['interested:open'] || 0,
        rejected: (stageCounts['new:rejected'] || 0) + (stageCounts['followup:rejected'] || 0) + (stageCounts['interested:rejected'] || 0),
        closed: (stageCounts['new:closed'] || 0) + (stageCounts['followup:closed'] || 0) + (stageCounts['interested:closed'] || 0),
        salesCount: salesMonth?.total_sales || 0,
        revenue: salesMonth?.total_revenue || 0
      },
      filters: { selectedMonth, monthOptions: monthsList(12), stage, status, agent: 0, q}
    });

  } catch (e) {
    console.error("Agent dashboard error:", e);
    return res.status(500).send("Failed to load dashboard.");
  }
});


// ---------------------------
// Agent Pipeline Board (Kanban)
// GET /sales/my/pipeline?month=YYYY-MM
// ---------------------------
router.get('/my/pipeline', requireLogin, async (req, res) => {
  try {
    const u = req._user;
    const selectedMonth = isValidMonth(req.query.month) ? req.query.month : ymNow();
    const { start, end } = monthRange(selectedMonth);

    await cleanupOldAssignmentsForAgent(u.id);

    const rows = await fetchAgentPipelineRows(u.id, start, end);
    const pipelineBoard = groupPipelineByStage(rows);

    const stageRows = await queryAsync(
      `SELECT la.stage, la.status, COUNT(*) AS c
       FROM lead_assignments la
       JOIN rockerstop_leads l ON l.id = la.lead_id
       WHERE l.detected_at_utc >= ? AND l.detected_at_utc < ?
         AND l.crm_status = 'open' AND la.user_id = ?
       GROUP BY la.stage, la.status`,
      [start, end, u.id]
    );
    const stageCounts = {};
    for (const r of stageRows) stageCounts[`${r.stage}:${r.status}`] = Number(r.c);

    return res.render('freelancing/sales/agent-pipeline', {
      pageTitle: 'Sales Pipeline',
      active: 'pipeline',
      user: u,
      stages: STAGES,
      pipelineBoard,
      rows,
      filters: { selectedMonth, monthOptions: monthsList(12) },
      stats: {
        newOpen: stageCounts['new:open'] || 0,
        followupOpen: stageCounts['followup:open'] || 0,
        interestedOpen: stageCounts['interested:open'] || 0,
        totalOpen: rows.length
      }
    });
  } catch (e) {
    console.error('Agent pipeline error:', e);
    return res.status(500).send('Failed to load pipeline.');
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

    const byAgentMapped = byAgent.map(withCommissionAgentRow);

    const totals = byAgentMapped.reduce(
      (acc, r) => {
        acc.total_sales += Number(r.total_sales || 0);
        acc.total_revenue += Number(r.total_revenue || 0);
        acc.total_advance += Number(r.total_advance || 0);
        return acc;
      },
      { total_sales: 0, total_revenue: 0, total_advance: 0, total_agent_price: 0 }
    );
    totals.total_agent_price = commissionFromRevenue(totals.total_revenue);

    // Drill-down: list rows (when agent selected OR search used)
    let rows = [];
    if (agentNameFilter || q) {
      rows = await queryAsync(
        `
        SELECT id, name, number, enquiry, lead_price, advance_amount, agent_price, status, assign, created_at, sales_person_assign
        FROM leads
        WHERE ${where.join(' AND ')}
        ORDER BY created_at DESC
        LIMIT 2000
        `,
        params
      );
    }

    const dailySalesRows = (agentNameFilter || q)
      ? await fetchDailySalesForLeads(where, params)
      : (await fetchAdminAnalytics(start, end)).dailySales;
    const dailyChart = buildDailyChartSeries(dailySalesRows);

    if (!agentNameFilter && !q) {
      rows = await queryAsync(
        `SELECT id, name, number, enquiry, lead_price, advance_amount, agent_price, status, sales_person_assign, created_at
         FROM leads WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT 100`,
        params
      );
    }

    rows = withCommissionDealRows(rows);

    return res.render('freelancing/sales/admin-analytics', {
      pageTitle: 'Agent Performance Analytics',
      active: 'salesReport',
      user: req._user,
      mode: 'admin',
      filters: { selectedMonth, monthOptions: monthsList(12), agent: agentRaw, q },
      agents,
      totals,
      byAgent: byAgentMapped,
      rows,
      commissionRate: AGENT_COMMISSION_RATE,
      selectedAgentName: agentNameFilter || '',
      chartData: {
        ...dailyChart,
        agentNames: byAgentMapped.map((a) => a.agent_name),
        agentRevenue: byAgentMapped.map((a) => Number(a.total_revenue)),
        agentDeals: byAgentMapped.map((a) => Number(a.total_sales)),
        agentCommission: byAgentMapped.map((a) => Number(a.total_agent_price))
      }
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
      pageTitle: 'Team Activity Logs',
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
      stageCounts[key] = Number(r.c);
    }

    const analytics = await fetchAdminAnalytics(start, end);

    const rejectedTotal =
      (stageCounts['new:rejected'] || 0) +
      (stageCounts['followup:rejected'] || 0) +
      (stageCounts['interested:rejected'] || 0);

    const openAssignments = stageRows.reduce((a, r) => a + (r.status === 'open' ? Number(r.c) : 0), 0);
    const totalLeads = Number(k1?.c || 0);
    const totalSales = Number(salesAgg?.total_sales || 0);
    const conversionRate = totalLeads > 0 ? Math.round((totalSales / totalLeads) * 100) : 0;

    const funnel = {
      newInquiry: stageCounts['new:open'] || 0,
      inFollowup: stageCounts['followup:open'] || 0,
      highIntent: stageCounts['interested:open'] || 0,
      closedWon: totalSales,
      disqualified: rejectedTotal
    };

    const dailyChart = buildDailyChartSeries(analytics.dailySales);
    const agentNames = analytics.agentPerformance.map((a) => a.agent_name);
    const agentRevenue = analytics.agentPerformance.map((a) => Number(a.revenue));
    const agentDeals = analytics.agentPerformance.map((a) => Number(a.deals));

    return res.render('freelancing/sales/admin-dashboard', {
      pageTitle: 'Command Center',
      active: 'overview',
      user: req._user,
      mode: 'admin',
      stages: STAGES,
      filters: { selectedMonth, monthOptions: monthsList(12) },
      kpis: {
        totalLeads,
        totalSales,
        totalRevenue: salesAgg?.total_revenue || 0,
        openAssignments,
        rejectedTotal,
        conversionRate,
        activeAgents: analytics.activeAgents,
        advanceTotal: analytics.totals.advance || 0,
        commissionTotal: analytics.totals.commission || 0,
        commissionRate: AGENT_COMMISSION_RATE
      },
      stageCounts,
      funnel,
      agentPerformance: analytics.agentPerformance,
      due,
      chartData: {
        ...dailyChart,
        agentNames,
        agentRevenue,
        agentDeals,
        funnelLabels: ['New Inquiry', 'In Follow-up', 'High Intent', 'Closed Won', 'Disqualified'],
        funnelValues: [funnel.newInquiry, funnel.inFollowup, funnel.highIntent, funnel.closedWon, funnel.disqualified],
        stageLabels: ['New Inquiry', 'In Follow-up', 'High Intent'],
        stageOpen: [funnel.newInquiry, funnel.inFollowup, funnel.highIntent]
      }
    });
  } catch (e) {
    console.error('Admin overview error:', e);
    res.status(500).send('Failed to load overview.');
  }
});


router.get('/admin/pipeline', requireLogin, requireAdmin, async (req, res) => {
  try {
    const selectedMonth = isValidMonth(req.query.month) ? req.query.month : ymNow();
    const { start, end } = monthRange(selectedMonth);
    const agent = req.query.agent ? Number(req.query.agent) : 0;

    await ensureAssignmentsForMonth(start, end, agent && Number.isFinite(agent) ? agent : 0);

    const agents = await queryAsync(
      `SELECT id, name FROM crm_users WHERE is_active=1 AND role='agent' ORDER BY name ASC`
    );

    const rows = await fetchAdminPipelineRows(start, end, agent);
    const pipelineBoard = groupPipelineByStage(rows);

    const stageRows = await queryAsync(
      `SELECT la.stage, la.status, COUNT(*) AS c
       FROM lead_assignments la JOIN rockerstop_leads l ON l.id=la.lead_id
       WHERE l.detected_at_utc >= ? AND l.detected_at_utc < ? AND l.crm_status='open'
       ${agent && Number.isFinite(agent) ? 'AND la.user_id=?' : ''}
       GROUP BY la.stage, la.status`,
      agent && Number.isFinite(agent) ? [start, end, agent] : [start, end]
    );
    const stageCounts = {};
    for (const r of stageRows) stageCounts[`${r.stage}:${r.status}`] = Number(r.c);

    return res.render('freelancing/sales/admin-pipeline', {
      pageTitle: 'Team Pipeline Board',
      active: 'pipeline',
      user: req._user,
      stages: STAGES,
      agents,
      pipelineBoard,
      rows,
      filters: { selectedMonth, monthOptions: monthsList(12), agent },
      stats: {
        newOpen: stageCounts['new:open'] || 0,
        followupOpen: stageCounts['followup:open'] || 0,
        interestedOpen: stageCounts['interested:open'] || 0,
        totalOpen: rows.length
      }
    });
  } catch (e) {
    console.error('Admin pipeline error:', e);
    return res.status(500).send('Failed to load pipeline.');
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

    const rejectedTotal =
      (stageCounts['new:rejected'] || 0) +
      (stageCounts['followup:rejected'] || 0) +
      (stageCounts['interested:rejected'] || 0);

    const closedTotal =
      (stageCounts['new:closed'] || 0) +
      (stageCounts['followup:closed'] || 0) +
      (stageCounts['interested:closed'] || 0);

    const totalAssigned = openAssignments + rejectedTotal + closedTotal;
    const conversionRate = totalAssigned > 0
      ? Math.round((Number(salesAgg?.total_sales || 0) / totalAssigned) * 100)
      : 0;

    const analytics = await fetchAgentAnalytics(u.name, start, end);
    const pipelineRows = await fetchAgentPipelineRows(u.id, start, end);
    const pipelineBoard = groupPipelineByStage(pipelineRows);

    const funnel = {
      newInquiry: stageCounts['new:open'] || 0,
      inFollowup: stageCounts['followup:open'] || 0,
      highIntent: stageCounts['interested:open'] || 0,
      closedWon: salesAgg?.total_sales || 0,
      disqualified: rejectedTotal
    };

    return res.render('freelancing/sales/agent-dashboard', {
      pageTitle: 'Sales Dashboard',
      active: 'overview',
      user: u,
      mode: 'agent',
      stages: STAGES,
      filters: { selectedMonth, monthOptions: monthsList(12) },
      kpis: {
        totalLeads: openAssignments,
        totalSales: salesAgg?.total_sales || 0,
        totalRevenue: salesAgg?.total_revenue || 0,
        openAssignments,
        rejectedTotal,
        closedTotal,
        conversionRate,
        advanceTotal: analytics.advanceTotal,
        agentIncentive: analytics.agentTotal,
        commissionRate: AGENT_COMMISSION_RATE
      },
      stageCounts,
      funnel,
      pipelineBoard,
      due,
      chartData: {
        ...buildDailyChartSeries(analytics.dailySales),
        funnelLabels: ['New Inquiry', 'In Follow-up', 'High Intent', 'Closed Won', 'Disqualified'],
        funnelValues: [funnel.newInquiry, funnel.inFollowup, funnel.highIntent, funnel.closedWon, funnel.disqualified],
        stageLabels: ['New Inquiry', 'In Follow-up', 'High Intent'],
        stageOpen: [funnel.newInquiry, funnel.inFollowup, funnel.highIntent]
      }
    });
  } catch (e) {
    console.error('Agent overview error:', e);
    res.status(500).send('Failed to load overview.');
  }
});


router.get('/admin/new-sale', requireLogin, requireAdmin, async (req, res) => {
  try {
    const [agents, setupSupportEmployees] = await Promise.all([
      queryAsync(`SELECT id, name FROM crm_users WHERE is_active=1 AND role='agent' ORDER BY name ASC`),
      queryAsync(`SELECT id, name FROM crm_users WHERE is_active=1 AND role='setup_support' ORDER BY name ASC`)
    ]);
    res.render('freelancing/sales/new-sale', {
      pageTitle: 'Record Direct Sale',
      active: 'newSale',
      user: req._user,
      agents,
      setupSupportEmployees: setupSupportEmployees || [],
      error: '',
      form: { name:'', number:'', enquiry:'', lead_price:'', assign:'', remarks:'', deadline:'', advance_amount:'', pakistani_price:'', sheet_uid:'', setup_support:'', project_report:'', ppt:'', assign_setup_support:'' }
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

    const setup_support = !!(req.body.setup_support === '1' || req.body.setup_support === 'on');
    const project_report = !!(req.body.project_report === '1' || req.body.project_report === 'on');
    const ppt = !!(req.body.ppt === '1' || req.body.ppt === 'on');
    const assign_setup_support = (req.body.assign_setup_support && parseInt(req.body.assign_setup_support, 10)) || null;

    if (!name || !number || !enquiry || lead_price === null) {
      const [agents, setupSupportEmployees] = await Promise.all([
        queryAsync(`SELECT id, name FROM crm_users WHERE is_active=1 AND role='agent' ORDER BY name ASC`),
        queryAsync(`SELECT id, name FROM crm_users WHERE is_active=1 AND role='setup_support' ORDER BY name ASC`)
      ]);
      return res.render('freelancing/sales/new-sale', {
        pageTitle: 'Record Direct Sale',
        active: 'newSale',
        user: req._user,
        agents,
        setupSupportEmployees: setupSupportEmployees || [],
        error: 'Name, Number, Enquiry, Lead Price are mandatory.',
        form: { name, number: (req.body.number||''), enquiry, lead_price: (req.body.lead_price||''), assign: assign||'', remarks: remarks||'', deadline: deadline||'', advance_amount: req.body.advance_amount||'', pakistani_price: req.body.pakistani_price||'', sheet_uid: sheet_uid||'', setup_support, project_report, ppt, assign_setup_support: assign_setup_support||'' }
      });
    }

    // Optional values — commission is always 5% of deal value
    const agent_price = commissionFromRevenue(lead_price);

    const result = await queryAsync(`
      INSERT INTO leads
        (name, number, deadline, enquiry, status, assign, lead_price, agent_price,
         is_project_done, is_payment_received, is_agent_payment_done,
         advance_amount, remarks, pakistani_price, sheet_uid,
         need_setup_support, need_project_report, need_ppt, created_at)
      VALUES
        (?, ?, ?, ?, 'pending', ?, ?, ?,
         0, 0, 0,
         ?, ?, ?, ?,
         ?, ?, ?, NOW())
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
      sheet_uid,
      setup_support ? 1 : 0,
      project_report ? 1 : 0,
      ppt ? 1 : 0
    ]);

    const leadId = result && result.insertId;

    if (setup_support && leadId) {
      await queryAsync(`
        INSERT INTO setup_support
          (lead_id, customer_name, customer_number, enquiry, assigned_to, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'pending', NOW(), NOW())
      `, [leadId, name, number, enquiry, assign_setup_support]);
    }

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

    const [totals] = await queryAsync(
      `SELECT COUNT(*) AS total_sales, COALESCE(SUM(lead_price),0) AS total_revenue,
              COALESCE(SUM(advance_amount),0) AS total_advance, COALESCE(SUM(agent_price),0) AS total_agent_price
       FROM leads WHERE ${where.join(' AND ')}`,
      params
    );

    return res.render('freelancing/sales/admin-deals', {
      pageTitle: 'All Closed Won Deals',
      active: 'sales',
      user: req._user,
      mode: 'admin',
      totals: withCommissionTotals(totals || {}),
      filters: { selectedMonth, monthOptions: monthsList(12), q },
      rows: withCommissionDealRows(rows),
      commissionRate: AGENT_COMMISSION_RATE
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

    const [totals] = await queryAsync(
      `SELECT COUNT(*) AS total_sales,
              COALESCE(SUM(lead_price),0) AS total_revenue,
              COALESCE(SUM(advance_amount),0) AS total_advance,
              COALESCE(SUM(agent_price),0) AS total_agent_price
       FROM leads
       WHERE created_at >= ? AND created_at < ? AND sales_person_assign = ?`,
      [start + ' 00:00:00', end + ' 00:00:00', u.name]
    );

    return res.render('freelancing/sales/agent-deals', {
      pageTitle: 'Closed Won Deals',
      active: 'sales',
      user: u,
      mode: 'agent',
      totals: withCommissionTotals(totals || {}),
      filters: { selectedMonth, monthOptions: monthsList(12), q },
      rows: withCommissionDealRows(rows),
      commissionRate: AGENT_COMMISSION_RATE
    });
  } catch (e) {
    console.error('Agent sales list error:', e);
    res.status(500).send('Failed to load sales list.');
  }
});


// ---------------------------
// Agent Sales Report
// GET /sales/my/report?month=YYYY-MM&q=...
// ---------------------------
router.get('/my/report', requireLogin, async (req, res) => {
  try {
    const u = req._user;
    if (String(u.role || '').trim().toLowerCase() === 'admin') {
      return res.redirect('/sales/admin/sales-report');
    }

    const selectedMonth = isValidMonth(req.query.month) ? req.query.month : ymNow();
    const { start, end } = monthRange(selectedMonth);
    const q = (req.query.q || '').toString().trim();

    const where = [`created_at >= ? AND created_at < ?`, `sales_person_assign = ?`];
    const params = [start + ' 00:00:00', end + ' 00:00:00', u.name];

    if (q) {
      where.push(`(name LIKE ? OR number LIKE ? OR enquiry LIKE ? OR assign LIKE ?)`);
      const like = `%${q}%`;
      params.push(like, like, like, like);
    }

    const [totals] = await queryAsync(
      `SELECT COUNT(*) AS total_sales,
              COALESCE(SUM(lead_price),0) AS total_revenue,
              COALESCE(SUM(advance_amount),0) AS total_advance,
              COALESCE(SUM(agent_price),0) AS total_agent_price
       FROM leads WHERE ${where.join(' AND ')}`,
      params
    );

    const byStatus = await queryAsync(
      `SELECT COALESCE(NULLIF(TRIM(status), ''), 'unknown') AS status_label,
              COUNT(*) AS total_sales,
              COALESCE(SUM(lead_price),0) AS total_revenue
       FROM leads WHERE ${where.join(' AND ')}
       GROUP BY COALESCE(NULLIF(TRIM(status), ''), 'unknown')
       ORDER BY total_revenue DESC`,
      params
    );

    const rows = withCommissionDealRows(await queryAsync(
      `SELECT id, name, number, enquiry, lead_price, advance_amount, agent_price, status, assign, created_at
       FROM leads WHERE ${where.join(' AND ')}
       ORDER BY created_at DESC LIMIT 2000`,
      params
    ));

    const analytics = await fetchAgentAnalytics(u.name, start, end);

    return res.render('freelancing/sales/agent-analytics', {
      pageTitle: 'Performance Analytics',
      active: 'agentReport',
      user: u,
      mode: 'agent',
      filters: { selectedMonth, monthOptions: monthsList(12), q },
      totals: withCommissionTotals(totals || {}),
      byStatus: byStatus || [],
      rows,
      commissionRate: AGENT_COMMISSION_RATE,
      chartData: {
        ...buildDailyChartSeries(analytics.dailySales),
        statusLabels: (byStatus || []).map(s => s.status_label),
        statusRevenue: (byStatus || []).map(s => Number(s.total_revenue))
      }
    });
  } catch (e) {
    console.error('Agent sales report error:', e);
    return res.status(500).send('Failed to load report.');
  }
});


// ---------------------------
// Agent Rejected Leads (assignment-level)
// GET /sales/my/rejected-leads?month=YYYY-MM
// ---------------------------
router.get('/my/rejected-leads', requireLogin, async (req, res) => {
  try {
    const u = req._user;
    const selectedMonth = isValidMonth(req.query.month) ? req.query.month : ymNow();
    const { start, end } = monthRange(selectedMonth);

    const rows = await queryAsync(`
      SELECT
        la.id AS assignment_id,
        la.reject_reason,
        la.updated_at AS rejected_at,
        la.stage AS assignment_stage,
        l.id AS lead_id,
        l.tempid,
        l.name,
        l.phone,
        l.enquiry_title,
        l.enquiry_description,
        l.detected_at_utc
      FROM lead_assignments la
      JOIN rockerstop_leads l ON l.id = la.lead_id
      WHERE la.user_id = ?
        AND la.status = 'rejected'
        AND l.detected_at_utc >= ? AND l.detected_at_utc < ?
      ORDER BY la.updated_at DESC
      LIMIT 2000
    `, [u.id, start, end]);

    return res.render('freelancing/sales/agent-disqualified', {
      pageTitle: 'Disqualified Leads',
      active: 'rejectedLeads',
      user: u,
      mode: 'agent',
      rows,
      filters: { selectedMonth, monthOptions: monthsList(12) }
    });
  } catch (e) {
    console.error('Agent rejected leads error:', e);
    return res.status(500).send('Failed to load rejected leads.');
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

    return res.render('freelancing/sales/admin-disqualified', {
      pageTitle: 'Disqualified Leads',
      active: 'rejectedLeads',
      user: req._user,
      mode: 'admin',
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
    if (lead_price === null) return res.status(400).json({ ok: false, message: "lead_price required (>=0)" });
    const agent_price = commissionFromRevenue(lead_price);

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

// ---------------------------
// Setup Support Module
// ---------------------------

// Admin: Setup Support Overview - all requests, filters, assign
router.get('/admin/setup-support', requireLogin, requireAdmin, async (req, res) => {
  try {
    const tab = (req.query.tab === 'done' || req.query.tab === 'pending') ? req.query.tab : 'all';
    const empFilter = req.query.employee ? parseInt(req.query.employee, 10) : 0;

    let where = ['1=1'];
    const params = [];
    if (tab === 'pending') {
      where.push(`ss.status IN ('pending','in_progress')`);
    } else if (tab === 'done') {
      where.push(`ss.status = 'done'`);
    }
    if (empFilter && Number.isFinite(empFilter)) {
      where.push(`ss.assigned_to = ?`);
      params.push(empFilter);
    }

    const rows = await queryAsync(`
      SELECT ss.*, u.name AS assigned_name
      FROM setup_support ss
      LEFT JOIN crm_users u ON u.id = ss.assigned_to
      WHERE ${where.join(' AND ')}
      ORDER BY ss.created_at DESC
      LIMIT 500
    `, params);

    const employees = await queryAsync(
      `SELECT id, name FROM crm_users WHERE is_active=1 AND role='setup_support' ORDER BY name`
    );

    const [pendingCount] = await queryAsync(`SELECT COUNT(*) AS c FROM setup_support WHERE status IN ('pending','in_progress')`);
    const [doneCount] = await queryAsync(`SELECT COUNT(*) AS c FROM setup_support WHERE status = 'done'`);

    return res.render('freelancing/sales/setup-support-admin', {
      pageTitle: 'Setup Support',
      active: 'setupSupportOverview',
      user: req._user,
      rows,
      employees,
      filters: { tab, employee: empFilter },
      pendingCount: pendingCount?.c || 0,
      doneCount: doneCount?.c || 0
    });
  } catch (e) {
    console.error('Setup support admin error:', e);
    res.status(500).send('Failed to load setup support.');
  }
});

// Admin: Setup Support Employees - list + add
router.get('/admin/setup-support/employees', requireLogin, requireAdmin, async (req, res) => {
  try {
    const employees = await queryAsync(`
      SELECT id, name, email, is_active, created_at
      FROM crm_users
      WHERE role = 'setup_support'
      ORDER BY name
    `);
    return res.render('freelancing/sales/setup-support-employees', {
      pageTitle: 'Setup Support Team',
      active: 'setupSupportEmployees',
      user: req._user,
      employees,
      error: req.query.error || '',
      success: req.query.success || ''
    });
  } catch (e) {
    console.error('Setup support employees error:', e);
    res.status(500).send('Failed to load employees.');
  }
});

router.post('/admin/setup-support/employees', requireLogin, requireAdmin, async (req, res) => {
  try {
    const name = (req.body.name || '').toString().trim();
    const email = (req.body.email || '').toString().trim();
    const password = (req.body.password || '').toString().trim();

    if (!name || !email || !password) {
      return res.redirect('/sales/admin/setup-support/employees?error=Name, email and password are required.');
    }

    const existing = await queryAsync(`SELECT id FROM crm_users WHERE email=? LIMIT 1`, [email]);
    if (existing.length) {
      return res.redirect('/sales/admin/setup-support/employees?error=Email already in use.');
    }

    await queryAsync(`
      INSERT INTO crm_users (name, email, password, role, is_active, created_at)
      VALUES (?, ?, ?, 'setup_support', 1, NOW())
    `, [name, email, password]);

    return res.redirect('/sales/admin/setup-support/employees?success=Employee added.');
  } catch (e) {
    console.error('Add setup support employee error:', e);
    return res.redirect('/sales/admin/setup-support/employees?error=Failed to add employee.');
  }
});

// API: Admin assign setup support to employee
router.post('/api/admin/setup-support/:id/assign', requireLogin, requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const assignedTo = (req.body.assigned_to && parseInt(req.body.assigned_to, 10)) || null;
    if (!Number.isFinite(id)) return res.status(400).json({ ok: false, message: 'Invalid id' });

    await queryAsync(`UPDATE setup_support SET assigned_to = ?, updated_at = NOW() WHERE id = ?`, [assignedTo, id]);
    return res.json({ ok: true });
  } catch (e) {
    console.error('Assign setup support error:', e);
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
});

// API: Admin update setup support status (and optionally notes)
router.post('/api/admin/setup-support/:id/status', requireLogin, requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const status = (req.body.status || '').toString();
    const notes = (req.body.notes || '').toString().trim() || null;
    if (!Number.isFinite(id)) return res.status(400).json({ ok: false, message: 'Invalid id' });
    if (!['pending', 'in_progress', 'done', 'cancelled'].includes(status)) {
      return res.status(400).json({ ok: false, message: 'Invalid status' });
    }
    const rows = await queryAsync(`SELECT id FROM setup_support WHERE id = ? LIMIT 1`, [id]);
    if (!rows.length) return res.status(404).json({ ok: false, message: 'Not found' });
    if (status === 'done') {
      await queryAsync(`UPDATE setup_support SET status = ?, notes = COALESCE(?, notes), completed_at = NOW(), updated_at = NOW() WHERE id = ?`, [status, notes, id]);
    } else {
      await queryAsync(`UPDATE setup_support SET status = ?, notes = COALESCE(?, notes), updated_at = NOW() WHERE id = ?`, [status, notes, id]);
    }
    return res.json({ ok: true });
  } catch (e) {
    console.error('Admin update setup support status error:', e);
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
});

// ---------------------------
// Source Code Manager Admin (employees + overview)
// ---------------------------
router.get('/admin/source-code-manager', requireLogin, requireAdmin, async (req, res) => {
  try {
    const filters = parseScmFilters(req.query);
    const dashboard = await fetchScmDashboard(queryAsync, filters);

    return res.render('freelancing/sales/scm-overview', {
      pageTitle: 'Source Code Manager',
      active: 'sourceCodeManagerOverview',
      user: req._user,
      rows: dashboard.rows,
      stats: dashboard.stats,
      chartData: dashboard.chartData,
      categoryList: dashboard.categoryList,
      filters: dashboard.filters,
      buildQuery: dashboard.buildQuery,
      error: req.query.error || '',
      success: req.query.success || ''
    });
  } catch (e) {
    console.error('SCM overview error:', e);
    res.status(500).send('Failed to load.');
  }
});

router.get('/admin/source-code-manager/employees', requireLogin, requireAdmin, async (req, res) => {
  try {
    const employees = await queryAsync(`
      SELECT id, name, email, is_active, created_at
      FROM crm_users
      WHERE role = 'source_code_manager'
      ORDER BY name
    `);
    return res.render('freelancing/sales/scm-employees', {
      pageTitle: 'SCM Team',
      active: 'sourceCodeManagerEmployees',
      user: req._user,
      employees,
      error: req.query.error || '',
      success: req.query.success || ''
    });
  } catch (e) {
    console.error('SCM employees error:', e);
    res.status(500).send('Failed to load.');
  }
});

router.post('/admin/source-code-manager/employees', requireLogin, requireAdmin, async (req, res) => {
  try {
    const name = (req.body.name || '').toString().trim();
    const email = (req.body.email || '').toString().trim();
    const password = (req.body.password || '').toString().trim();
    if (!name || !email || !password) {
      return res.redirect('/sales/admin/source-code-manager/employees?error=Name, email and password are required.');
    }
    const existing = await queryAsync(`SELECT id FROM crm_users WHERE email=? LIMIT 1`, [email]);
    if (existing.length) {
      return res.redirect('/sales/admin/source-code-manager/employees?error=Email already in use.');
    }
    await queryAsync(`
      INSERT INTO crm_users (name, email, password, role, is_active, created_at)
      VALUES (?, ?, ?, 'source_code_manager', 1, NOW())
    `, [name, email, password]);
    return res.redirect('/sales/admin/source-code-manager/employees?success=Employee added.');
  } catch (e) {
    console.error('Add SCM employee error:', e);
    return res.redirect('/sales/admin/source-code-manager/employees?error=Failed to add.');
  }
});

// API: List all screenshots for a source code (avoids GROUP_CONCAT truncation in list view)
router.get('/api/admin/source-code-manager/:id/screenshots', requireLogin, requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ ok: false, message: 'Invalid id' });

    const rows = await queryAsync(`SELECT id, name, image FROM source_code WHERE id = ? LIMIT 1`, [id]);
    if (!rows.length) return res.status(404).json({ ok: false, message: 'Not found' });

    const screenshots = await fetchSourceCodeScreenshotList(queryAsync, id, rows[0].image);
    return res.json({ ok: true, screenshots, count: screenshots.length });
  } catch (e) {
    console.error('SCM list screenshots error:', e);
    return res.status(500).json({ ok: false, message: 'Failed to load screenshots' });
  }
});

// API: Admin verify source code (screenshot, demo, or all)
router.post('/api/admin/source-code-manager/:id/verify', requireLogin, requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const field = (req.body.field || '').toString();
    if (!Number.isFinite(id)) return res.status(400).json({ ok: false, message: 'Invalid id' });
    if (!['screenshot', 'demo', 'all'].includes(field)) return res.status(400).json({ ok: false, message: 'Invalid field' });
    const adminId = req._user?.id || req.session?.adminid;
    if (field === 'all') {
      await queryAsync(`UPDATE source_code SET scm_screenshot_verified = 1, scm_demo_verified = 1, scm_verified_by = ?, scm_verified_at = NOW() WHERE id = ?`, [adminId, id]);
    } else if (field === 'screenshot') {
      await queryAsync(`UPDATE source_code SET scm_screenshot_verified = 1, scm_verified_by = ?, scm_verified_at = NOW() WHERE id = ?`, [adminId, id]);
    } else {
      await queryAsync(`UPDATE source_code SET scm_demo_verified = 1, scm_verified_by = ?, scm_verified_at = NOW() WHERE id = ?`, [adminId, id]);
    }
    return res.json({ ok: true });
  } catch (e) {
    console.error('Verify SCM error:', e);
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
});

// ---------------------------
// Project Report Manager Admin (employees + overview)
// ---------------------------
router.get('/admin/project-report-manager', requireLogin, requireAdmin, async (req, res) => {
  try {
    const filters = parsePrmFilters(req.query);
    const dashboard = await fetchPrmDashboard(queryAsync, filters);

    return res.render('freelancing/sales/prm-overview', {
      pageTitle: 'Project Report Manager',
      active: 'projectReportManagerOverview',
      user: req._user,
      rows: dashboard.rows,
      stats: dashboard.stats,
      chartData: dashboard.chartData,
      categoryList: dashboard.categoryList,
      filters: dashboard.filters,
      buildQuery: dashboard.buildQuery,
      minHeadings: dashboard.minHeadings,
      error: req.query.error || '',
      success: req.query.success || ''
    });
  } catch (e) {
    console.error('PRM overview error:', e);
    res.status(500).send('Failed to load.');
  }
});

router.get('/admin/project-report-manager/employees', requireLogin, requireAdmin, async (req, res) => {
  try {
    const employees = await queryAsync(`
      SELECT id, name, email, is_active, created_at
      FROM crm_users
      WHERE role = 'project_report_manager'
      ORDER BY name
    `);
    return res.render('freelancing/sales/prm-employees', {
      pageTitle: 'PRM Team',
      active: 'projectReportManagerEmployees',
      user: req._user,
      employees,
      error: req.query.error || '',
      success: req.query.success || ''
    });
  } catch (e) {
    console.error('PRM employees error:', e);
    res.status(500).send('Failed to load.');
  }
});

router.post('/admin/project-report-manager/employees', requireLogin, requireAdmin, async (req, res) => {
  try {
    const name = (req.body.name || '').toString().trim();
    const email = (req.body.email || '').toString().trim();
    const password = (req.body.password || '').toString().trim();
    if (!name || !email || !password) {
      return res.redirect('/sales/admin/project-report-manager/employees?error=Name, email and password are required.');
    }
    const existing = await queryAsync(`SELECT id FROM crm_users WHERE email=? LIMIT 1`, [email]);
    if (existing.length) {
      return res.redirect('/sales/admin/project-report-manager/employees?error=Email already in use.');
    }
    await queryAsync(`
      INSERT INTO crm_users (name, email, password, role, is_active, created_at)
      VALUES (?, ?, ?, 'project_report_manager', 1, NOW())
    `, [name, email, password]);
    return res.redirect('/sales/admin/project-report-manager/employees?success=Employee added.');
  } catch (e) {
    console.error('Add PRM employee error:', e);
    return res.redirect('/sales/admin/project-report-manager/employees?error=Failed to add.');
  }
});

router.post('/api/admin/project-report-manager/:id/verify', requireLogin, requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ ok: false, message: 'Invalid id' });
    const adminId = req._user?.id || req.session?.adminid;
    await queryAsync(`UPDATE source_code SET prm_report_verified = 1, prm_verified_by = ?, prm_verified_at = NOW() WHERE id = ?`, [adminId, id]);
    return res.json({ ok: true });
  } catch (e) {
    console.error('Verify PRM error:', e);
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
});

// ---------------------------
// Project Report Creator Admin (employees + overview)
// ---------------------------
router.get('/admin/project-report-creator', requireLogin, requireAdmin, async (req, res) => {
  try {
    const q = (req.query.q || '').toString().trim();
    let where = ['1=1'];
    const params = [];
    if (q) {
      where.push(`(sc.name LIKE ? OR sc.seo_name LIKE ? OR sc.description LIKE ?)`);
      const like = `%${q.replace(/%/g, '\\%')}%`;
      params.push(like, like, like);
    }
    const rows = await queryAsync(`
      SELECT sc.id, sc.name, sc.seo_name, sc.category,
        (SELECT COUNT(*) FROM source_code_report_sections WHERE source_code_id = sc.id) AS section_count,
        (SELECT COUNT(*) FROM source_code_database_screenshots WHERE source_code_id = sc.id) AS db_screenshot_count,
        (SELECT COUNT(*) FROM screenshots WHERE source_code_id = sc.id) AS screenshot_count
      FROM source_code sc
      WHERE ${where.join(' AND ')}
      ORDER BY sc.id DESC
      LIMIT 500
    `, params);
    return res.render('freelancing/sales/prc-overview', {
      pageTitle: 'Project Report Creator',
      active: 'projectReportCreatorOverview',
      user: req._user,
      rows: rows || [],
      filters: { q }
    });
  } catch (e) {
    console.error('PRC overview error:', e);
    return res.status(500).send('Failed to load.');
  }
});

router.get('/admin/project-report-creator/employees', requireLogin, requireAdmin, async (req, res) => {
  try {
    const employees = await queryAsync(`
      SELECT id, name, email, is_active, created_at
      FROM crm_users
      WHERE role = 'project_report_creator'
      ORDER BY name
    `);
    return res.render('freelancing/sales/prc-employees', {
      pageTitle: 'Report Creator Team',
      active: 'projectReportCreatorEmployees',
      user: req._user,
      employees,
      error: req.query.error || '',
      success: req.query.success || ''
    });
  } catch (e) {
    console.error('PRC employees error:', e);
    res.status(500).send('Failed to load.');
  }
});

router.post('/admin/project-report-creator/employees', requireLogin, requireAdmin, async (req, res) => {
  try {
    const name = (req.body.name || '').toString().trim();
    const email = (req.body.email || '').toString().trim();
    const password = (req.body.password || '').toString().trim();
    if (!name || !email || !password) {
      return res.redirect('/sales/admin/project-report-creator/employees?error=Name, email and password are required.');
    }
    const existing = await queryAsync(`SELECT id FROM crm_users WHERE email=? LIMIT 1`, [email]);
    if (existing.length) {
      return res.redirect('/sales/admin/project-report-creator/employees?error=Email already in use.');
    }
    await queryAsync(`
      INSERT INTO crm_users (name, email, password, role, is_active, created_at)
      VALUES (?, ?, ?, 'project_report_creator', 1, NOW())
    `, [name, email, password]);
    return res.redirect('/sales/admin/project-report-creator/employees?success=Employee added.');
  } catch (e) {
    console.error('Add PRC employee error:', e);
    return res.redirect('/sales/admin/project-report-creator/employees?error=Failed to add.');
  }
});

// ---------------------------
// Live Demo Admin (CRUD)
// ---------------------------
function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

router.get('/admin/live-demo', requireLogin, requireAdmin, async (req, res) => {
  try {
    const rows = await queryAsync(`
      SELECT id, title, seo_slug, demo_link, tech_stack, is_active, created_at, updated_at
      FROM live_demo
      ORDER BY created_at DESC
    `);
    return res.render('freelancing/sales/live-demo-list', {
      pageTitle: 'Live Demo Manager',
      active: 'liveDemo',
      user: req._user,
      rows,
      error: req.query.error || '',
      success: req.query.success || ''
    });
  } catch (e) {
    console.error('Live demo list error:', e);
    return res.status(500).send('Failed to load live demos.');
  }
});

router.get('/admin/live-demo/add', requireLogin, requireAdmin, async (req, res) => {
  return res.render('freelancing/sales/live-demo-form', {
    pageTitle: 'Add Live Demo',
    active: 'liveDemo',
    user: req._user,
    demo: null,
    isEdit: false,
    error: req.query.error || '',
    success: req.query.success || ''
  });
});

router.post('/admin/live-demo/add', requireLogin, requireAdmin, async (req, res) => {
  try {
    const body = req.body;
    const title = (body.title || '').toString().trim();
    const description = (body.description || '').toString().trim();
    const techStack = (body.tech_stack || '').toString().trim();
    const demoLink = (body.demo_link || '').toString().trim();
    const projectDetails = (body.project_details || '').toString().trim();
    const adminFeatures = (body.admin_features || '').toString().trim();
    const userFeatures = (body.user_features || '').toString().trim();
    const seoSlug = (body.seo_slug || '').toString().trim() || slugify(title);
    const metaTitle = (body.meta_title || '').toString().trim() || title;
    const metaDescription = (body.meta_description || '').toString().trim();
    const metaKeywords = (body.meta_keywords || '').toString().trim();
    const metaTags = (body.meta_tags || '').toString().trim();
    const schemaJson = (body.schema || '').toString().trim() || null;
    const ogImage = (body.og_image || '').toString().trim() || null;

    if (!title || !demoLink) {
      return res.redirect('/sales/admin/live-demo/add?error=Title and Demo Link are required.');
    }

    const existing = await queryAsync(`SELECT id FROM live_demo WHERE seo_slug = ? LIMIT 1`, [seoSlug]);
    if (existing.length) {
      return res.redirect('/sales/admin/live-demo/add?error=SEO slug already exists. Use a unique slug.');
    }

    await queryAsync(`
      INSERT INTO live_demo (title, description, tech_stack, demo_link, project_details, admin_features, user_features,
        seo_slug, meta_title, meta_description, meta_keywords, meta_tags, schema_json, og_image)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [title, description, techStack, demoLink, projectDetails, adminFeatures, userFeatures,
      seoSlug, metaTitle, metaDescription, metaKeywords, metaTags, schemaJson, ogImage]);

    return res.redirect('/sales/admin/live-demo?success=Live demo added.');
  } catch (e) {
    console.error('Add live demo error:', e);
    return res.redirect('/sales/admin/live-demo/add?error=Failed to add live demo.');
  }
});

router.get('/admin/live-demo/edit/:id', requireLogin, requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.redirect('/sales/admin/live-demo?error=Invalid id');
    const rows = await queryAsync(`SELECT * FROM live_demo WHERE id = ? LIMIT 1`, [id]);
    if (!rows.length) return res.redirect('/sales/admin/live-demo?error=Live demo not found.');
    return res.render('freelancing/sales/live-demo-form', {
      pageTitle: 'Edit Live Demo',
      active: 'liveDemo',
      user: req._user,
      demo: rows[0],
      isEdit: true,
      error: req.query.error || '',
      success: req.query.success || ''
    });
  } catch (e) {
    console.error('Edit live demo error:', e);
    return res.redirect('/sales/admin/live-demo?error=Failed to load.');
  }
});

router.post('/admin/live-demo/edit/:id', requireLogin, requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.redirect('/sales/admin/live-demo?error=Invalid id');
    const body = req.body;
    const title = (body.title || '').toString().trim();
    const description = (body.description || '').toString().trim();
    const techStack = (body.tech_stack || '').toString().trim();
    const demoLink = (body.demo_link || '').toString().trim();
    const projectDetails = (body.project_details || '').toString().trim();
    const adminFeatures = (body.admin_features || '').toString().trim();
    const userFeatures = (body.user_features || '').toString().trim();
    const seoSlug = (body.seo_slug || '').toString().trim() || slugify(title);
    const metaTitle = (body.meta_title || '').toString().trim() || title;
    const metaDescription = (body.meta_description || '').toString().trim();
    const metaKeywords = (body.meta_keywords || '').toString().trim();
    const metaTags = (body.meta_tags || '').toString().trim();
    const schemaJson = (body.schema || '').toString().trim() || null;
    const ogImage = (body.og_image || '').toString().trim() || null;
    const isActive = (body.is_active || '').toString() === '1' ? 1 : 0;

    if (!title || !demoLink) {
      return res.redirect(`/sales/admin/live-demo/edit/${id}?error=Title and Demo Link are required.`);
    }

    const existing = await queryAsync(`SELECT id FROM live_demo WHERE seo_slug = ? AND id != ? LIMIT 1`, [seoSlug, id]);
    if (existing.length) {
      return res.redirect(`/sales/admin/live-demo/edit/${id}?error=SEO slug already exists. Use a unique slug.`);
    }

    await queryAsync(`
      UPDATE live_demo SET
        title=?, description=?, tech_stack=?, demo_link=?, project_details=?,
        admin_features=?, user_features=?, seo_slug=?, meta_title=?, meta_description=?,
        meta_keywords=?, meta_tags=?, schema_json=?, og_image=?, is_active=?, updated_at=NOW()
      WHERE id=?
    `, [title, description, techStack, demoLink, projectDetails, adminFeatures, userFeatures,
      seoSlug, metaTitle, metaDescription, metaKeywords, metaTags, schemaJson, ogImage, isActive, id]);

    return res.redirect('/sales/admin/live-demo?success=Live demo updated.');
  } catch (e) {
    console.error('Update live demo error:', e);
    return res.redirect(`/sales/admin/live-demo/edit/${id}?error=Failed to update.`);
  }
});

router.post('/admin/live-demo/delete/:id', requireLogin, requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.redirect('/sales/admin/live-demo?error=Invalid id');
    await queryAsync(`DELETE FROM live_demo WHERE id = ?`, [id]);
    return res.redirect('/sales/admin/live-demo?success=Live demo deleted.');
  } catch (e) {
    console.error('Delete live demo error:', e);
    return res.redirect('/sales/admin/live-demo?error=Failed to delete.');
  }
});

// ---------------------------
// CRM Users — full CRUD + session invalidation
// ---------------------------
const CRM_USER_ROLE_OPTIONS = [
  { value: 'admin', label: 'Sales Admin' },
  { value: 'agent', label: 'Sales Agent' },
  { value: 'setup_support', label: 'Setup Support' },
  { value: 'source_code_manager', label: 'Source Code Manager' },
  { value: 'project_report_manager', label: 'Project Report Manager' },
  { value: 'project_report_creator', label: 'Project Report Creator' },
  { value: 'mern_training_manager', label: 'MERN Training Manager' }
];
const CRM_USER_ROLE_SET = new Set(CRM_USER_ROLE_OPTIONS.map(r => r.value));

function crmUserRoleLabel(role) {
  const key = String(role || '').trim().toLowerCase();
  const found = CRM_USER_ROLE_OPTIONS.find(r => r.value === key);
  return found ? found.label : role;
}

function isCrmAdminRole(role) {
  const r = String(role || '').trim().toLowerCase();
  return r === 'admin' || r === 'administrator' || r === 'superadmin';
}

async function countActiveAdmins(excludeId) {
  let sql = `
    SELECT COUNT(*) AS c FROM crm_users
    WHERE is_active = 1 AND LOWER(role) IN ('admin','administrator','superadmin')
  `;
  const params = [];
  if (excludeId) {
    sql += ' AND id != ?';
    params.push(excludeId);
  }
  const [row] = await queryAsync(sql, params);
  return Number(row.c) || 0;
}

function redirectUsers(msg, type) {
  const key = type === 'success' ? 'success' : 'error';
  return `/sales/admin/users?${key}=${encodeURIComponent(msg)}`;
}

router.get('/admin/users', requireLogin, requireAdmin, async (req, res) => {
  try {
    const q = (req.query.q || '').toString().trim();
    const roleFilter = (req.query.role || '').toString().trim().toLowerCase();
    const statusFilter = (req.query.status || '').toString().trim().toLowerCase();

    let where = ['1=1'];
    const params = [];

    if (q) {
      where.push('(name LIKE ? OR email LIKE ?)');
      const like = `%${q.replace(/%/g, '\\%')}%`;
      params.push(like, like);
    }
    if (roleFilter && CRM_USER_ROLE_SET.has(roleFilter)) {
      where.push('LOWER(role) = ?');
      params.push(roleFilter);
    }
    if (statusFilter === 'active') {
      where.push('is_active = 1');
    } else if (statusFilter === 'inactive') {
      where.push('is_active = 0');
    }

    const users = await queryAsync(`
      SELECT id, name, email, role, is_active, created_at, session_token
      FROM crm_users
      WHERE ${where.join(' AND ')}
      ORDER BY is_active DESC, name ASC
      LIMIT 500
    `, params);

    return res.render('freelancing/sales/admin-crm-users', {
      pageTitle: 'Team Access',
      active: 'crmUsers',
      user: req._user,
      users,
      roleOptions: CRM_USER_ROLE_OPTIONS,
      crmUserRoleLabel,
      filters: { q, role: roleFilter, status: statusFilter },
      error: req.query.error || '',
      success: req.query.success || ''
    });
  } catch (e) {
    console.error('CRM users list error:', e);
    res.status(500).send('Failed to load users.');
  }
});

router.post('/admin/users', requireLogin, requireAdmin, async (req, res) => {
  try {
    const name = (req.body.name || '').toString().trim();
    const email = (req.body.email || '').toString().trim().toLowerCase();
    const password = (req.body.password || '').toString().trim();
    const role = (req.body.role || '').toString().trim().toLowerCase();

    if (!name || !email || !password) {
      return res.redirect(redirectUsers('Name, email and password are required.'));
    }
    if (password.length < 6) {
      return res.redirect(redirectUsers('Password must be at least 6 characters.'));
    }
    if (!CRM_USER_ROLE_SET.has(role)) {
      return res.redirect(redirectUsers('Invalid role selected.'));
    }

    const existing = await queryAsync(`SELECT id FROM crm_users WHERE email = ? LIMIT 1`, [email]);
    if (existing.length) {
      return res.redirect(redirectUsers('Email is already registered.'));
    }

    await queryAsync(`
      INSERT INTO crm_users (name, email, password, role, is_active, session_token, created_at)
      VALUES (?, ?, ?, ?, 1, 1, NOW())
    `, [name, email, password, role]);

    return res.redirect(redirectUsers('User created successfully.', 'success'));
  } catch (e) {
    console.error('Create CRM user error:', e);
    return res.redirect(redirectUsers('Failed to create user.'));
  }
});

router.post('/admin/users/:id/update', requireLogin, requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.redirect(redirectUsers('Invalid user id.'));

    const name = (req.body.name || '').toString().trim();
    const email = (req.body.email || '').toString().trim().toLowerCase();
    const password = (req.body.password || '').toString().trim();
    const role = (req.body.role || '').toString().trim().toLowerCase();
    const isActive = (req.body.is_active || '').toString() === '1' ? 1 : 0;

    if (!name || !email) {
      return res.redirect(redirectUsers('Name and email are required.'));
    }
    if (password && password.length < 6) {
      return res.redirect(redirectUsers('Password must be at least 6 characters.'));
    }
    if (!CRM_USER_ROLE_SET.has(role)) {
      return res.redirect(redirectUsers('Invalid role selected.'));
    }

    const rows = await queryAsync(
      `SELECT id, name, email, role, is_active FROM crm_users WHERE id = ? LIMIT 1`,
      [id]
    );
    if (!rows.length) return res.redirect(redirectUsers('User not found.'));

    const target = rows[0];
    const currentUserId = Number(req._user.id);

    if (id === currentUserId && !isActive) {
      return res.redirect(redirectUsers('You cannot deactivate your own account.'));
    }
    if (id === currentUserId && !isCrmAdminRole(role)) {
      return res.redirect(redirectUsers('You cannot remove your own admin access.'));
    }

    if (isCrmAdminRole(target.role) && !isActive) {
      const adminsLeft = await countActiveAdmins(id);
      if (adminsLeft < 1) {
        return res.redirect(redirectUsers('Cannot deactivate the last active admin.'));
      }
    }
    if (isCrmAdminRole(target.role) && !isCrmAdminRole(role)) {
      const adminsLeft = await countActiveAdmins(id);
      if (adminsLeft < 1) {
        return res.redirect(redirectUsers('Cannot change role of the last active admin.'));
      }
    }

    const emailTaken = await queryAsync(
      `SELECT id FROM crm_users WHERE email = ? AND id != ? LIMIT 1`,
      [email, id]
    );
    if (emailTaken.length) {
      return res.redirect(redirectUsers('Email is already in use by another account.'));
    }

    const roleChanged = String(target.role || '').trim().toLowerCase() !== role;
    const wasActive = !!target.is_active;
    const deactivated = wasActive && !isActive;
    const passwordChanged = !!password;

    if (password) {
      await queryAsync(`
        UPDATE crm_users
        SET name = ?, email = ?, password = ?, role = ?, is_active = ?
        WHERE id = ?
      `, [name, email, password, role, isActive, id]);
    } else {
      await queryAsync(`
        UPDATE crm_users
        SET name = ?, email = ?, role = ?, is_active = ?
        WHERE id = ?
      `, [name, email, role, isActive, id]);
    }

    if (deactivated || passwordChanged || roleChanged) {
      await invalidateUserSessions(id);
    }

    return res.redirect(redirectUsers('User updated successfully.', 'success'));
  } catch (e) {
    console.error('Update CRM user error:', e);
    return res.redirect(redirectUsers('Failed to update user.'));
  }
});

router.post('/admin/users/:id/toggle-active', requireLogin, requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.redirect(redirectUsers('Invalid user id.'));

    if (id === Number(req._user.id)) {
      return res.redirect(redirectUsers('You cannot deactivate your own account.'));
    }

    const rows = await queryAsync(
      `SELECT id, role, is_active FROM crm_users WHERE id = ? LIMIT 1`,
      [id]
    );
    if (!rows.length) return res.redirect(redirectUsers('User not found.'));

    const target = rows[0];
    const nextActive = target.is_active ? 0 : 1;

    if (!nextActive && isCrmAdminRole(target.role)) {
      const adminsLeft = await countActiveAdmins(id);
      if (adminsLeft < 1) {
        return res.redirect(redirectUsers('Cannot deactivate the last active admin.'));
      }
    }

    await queryAsync(`UPDATE crm_users SET is_active = ? WHERE id = ?`, [nextActive, id]);
    if (!nextActive) await invalidateUserSessions(id);

    const msg = nextActive ? 'User activated.' : 'User deactivated — active sessions will be signed out.';
    return res.redirect(redirectUsers(msg, 'success'));
  } catch (e) {
    console.error('Toggle CRM user error:', e);
    return res.redirect(redirectUsers('Failed to update user status.'));
  }
});

router.post('/admin/users/:id/delete', requireLogin, requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.redirect(redirectUsers('Invalid user id.'));

    if (id === Number(req._user.id)) {
      return res.redirect(redirectUsers('You cannot delete your own account.'));
    }

    const rows = await queryAsync(
      `SELECT id, role FROM crm_users WHERE id = ? LIMIT 1`,
      [id]
    );
    if (!rows.length) return res.redirect(redirectUsers('User not found.'));

    if (isCrmAdminRole(rows[0].role)) {
      const adminsLeft = await countActiveAdmins(id);
      if (adminsLeft < 1) {
        return res.redirect(redirectUsers('Cannot delete the last active admin.'));
      }
    }

    await queryAsync(`DELETE FROM crm_users WHERE id = ?`, [id]);
    return res.redirect(redirectUsers('User removed. Any active sessions are now invalid.', 'success'));
  } catch (e) {
    console.error('Delete CRM user error:', e);
    return res.redirect(redirectUsers('Failed to delete user. They may have linked records.'));
  }
});


module.exports = router;
