
var express = require('express');
var router = express.Router();
var upload = require('../multer');
var pool = require('../pool');
require('dotenv').config()
var folder = 'freelancing'
var table = 'freelancing'
var table1 = 'source_code'
var dataService = require('../dataService');
const { syncLeads } = require("./sheetSyncLeads");


router.use(dataService.freelanceAuthenticationToken);

// import {v2 as cloudinary} from 'cloudinary';
const cloudinary = require('cloudinary').v2

const util = require('util');
const queryAsync = util.promisify(pool.query).bind(pool);
          
cloudinary.config({ 
  cloud_name: 'dggf8vl9p', 
  api_key: '689413729986639', 
  api_secret: 'hL5COn6ja_-lCqIK021H1YpVyoo' 
});



router.get('/', (req, res) => {
    res.render(`Freelancing/login`,{msg : ''});
    
})


router.get("/sync-leads", async (req, res) => {
  try {
    const mode = String(req.query.mode || "daily").toLowerCase();
    if (!["daily", "backfill"].includes(mode)) {
      return res.status(400).json({ ok: false, message: "mode must be daily or backfill" });
    }

    const result = await syncLeads({ mode });
    // return res.json({ ok: true, mode, ...result });
    res.redirect('/freelancing/dashboard')
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});


router.post('/login', (req, res) => {
  const { email, password } = req.body;

  console.log("Login Attempt:", email); // Avoid logging passwords

  const query = `SELECT id FROM ${table} WHERE email = ? AND password = ?`;

  pool.query(query, [email, password], (err, result) => {
      if (err) {
          console.error("Database Error:", err);
          return res.status(500).send("Internal Server Error");
      }

      if (result.length > 0) {
          req.session.freelancing = result[0].id;
          return res.redirect('/freelancing/dashboard');
      } 

      res.render(`${folder}/login`, { msg: 'Incorrect Credentials' });
  });
});



 
// router.get('/dashboard', (req, res) => {
 
 
//   let today = new Date().toISOString().split("T")[0]; // Get today's date in YYYY-MM-DD format
//     let tomorrow = new Date();
//     tomorrow.setDate(tomorrow.getDate() + 1);
//     let dayAfterTomorrow = new Date();
//     dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2);


//   let query = `
//       SELECT 
//           COUNT(CASE WHEN status = 'in_progress' THEN 1 END) AS in_progress_leads,
//           COUNT(CASE WHEN status = 'assign' THEN 1 END) AS assigned_leads,
//           COUNT(CASE WHEN status = 'completed' THEN 1 END) AS completed_leads,
//           COUNT(CASE WHEN status = 'hold' THEN 1 END) AS hold_leads,
//           COUNT(CASE WHEN status = 'pending' THEN 1 END) AS pending_leads,
//           COUNT(CASE WHEN status = 'in_progress' THEN 1 END) AS in_progress_projects,
//           COUNT(CASE WHEN status = 'client_review' THEN 1 END) AS client_review_projects,
//           COUNT(CASE WHEN status = 'in_changes' THEN 1 END) AS in_changes_projects,


//           -- Project Report Overview
//           COUNT(CASE WHEN is_project_done = FALSE AND deadline < CURDATE() THEN 1 END) AS overdue_projects,
//           COUNT(CASE WHEN is_project_done = FALSE AND deadline = CURDATE() THEN 1 END) AS today_delivered_project,
//           COUNT(CASE WHEN is_project_done = FALSE AND deadline BETWEEN CURDATE() + INTERVAL 1 DAY AND CURDATE() + INTERVAL 2 DAY THEN 1 END) AS upcoming_project_delieverd,
//           COUNT(CASE WHEN is_payment_received = FALSE and is_project_done = TRUE THEN 1 END) AS client_payment_pending,
//           COUNT(CASE WHEN is_agent_payment_done = FALSE and is_payment_received = TRUE THEN 1 END) AS agent_payment_pending,
//           COUNT(CASE WHEN assign IS NULL THEN 1 END) AS not_assigned_projects,
//           COUNT(CASE WHEN status = 'hold' THEN 1 END) AS hold_projects,
//           COUNT(CASE WHEN status = 'completed' THEN 1 END) AS completed_projects,
//           COUNT(CASE WHEN deadline > CURDATE() and is_project_done = FALSE THEN 1 END) AS total_undelivered_projects
//       FROM leads;
//   `;
//   let query1 = `
//   SELECT 
//   enquiry,  
//   name, 
//     number, 
//     deadline, 
//     status, 
//     remarks,
//     assign AS agent_name
// FROM leads
// WHERE 
//     (is_project_done = False AND deadline = CURDATE()) -- Today Delivered Projects
//     OR 
//     (is_project_done = FALSE AND deadline < CURDATE()) -- Overdue Projects
//     OR 
//     (is_project_done = FALSE AND deadline BETWEEN CURDATE() + INTERVAL 1 DAY AND CURDATE() + INTERVAL 2 DAY) -- Upcoming Deliveries
// ORDER BY deadline ASC;

// `;


// let query2 = `SELECT assign, COUNT(*) AS project_count 
//       FROM leads 
//       WHERE is_agent_payment_done = FALSE  
//       GROUP BY assign 
//       ORDER BY project_count DESC;`


//       let query3 = `SELECT assign, COUNT(*) AS project_count 
//       FROM leads 
//       WHERE is_project_done = FALSE 
//       GROUP BY assign 
//       ORDER BY project_count DESC;`  
      
      
//       let query4 = `SELECT 
//     SUM(lead_price) - SUM(advance_amount) AS total_pending_amount
// FROM leads 
// WHERE YEAR(created_at) = YEAR(CURDATE());
// `


//   pool.query(query+query1+query2+query3+query4, (err, result) => {
//       if (err) throw err;
//       res.render(`${folder}/dashboard`, { result:result });
//       // res.json(result)
//   });
// });

 function toYMD(d) {
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString().split('T')[0];
}

function safeInt(v, def = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

//   router.get('/dashboard', (req, res) => {
//     // -------- Filters (big-brand style) ----------
//     // defaults: current month window
//     const now = new Date();
//     const fromDefault = new Date(now.getFullYear(), now.getMonth(), 1);
//     const toDefault = new Date(now.getFullYear(), now.getMonth() + 1, 0);

//     const from = toYMD(req.query.from || toYMD(fromDefault));
//     const to = toYMD(req.query.to || toYMD(toDefault));

//     // Optional filters
//     const agent = (req.query.agent || '').trim();     // exact agent name
//     const q = (req.query.q || '').trim();             // search string
//     const quick = (req.query.quick || '').trim();     // overdue|today|next48|undelivered|pay_pending|agent_pay_pending

//     // validate dates
//     if (!from || !to) {
//       return res.status(400).send('Invalid date range');
//     }

//     // Build WHERE safely
//     // NOTE: We apply filters for KPI + tables using created_at window (sales analytics) AND deadline window (delivery).
//     // For operational queues, deadline filters matter more, for sales charts created_at matters.
//     const whereBase = `1=1`;
//     const whereSearch = q
//       ? ` AND (enquiry LIKE ? OR name LIKE ? OR number LIKE ?)`
//       : '';
//     const whereAgent = agent
//       ? ` AND assign = ?`
//       : '';

//     // Quick filters mostly affect priority table, not KPIs.
//     let whereQuickPriority = '';
//     if (quick === 'overdue') whereQuickPriority = ` AND is_project_done = FALSE AND deadline < CURDATE()`;
//     else if (quick === 'today') whereQuickPriority = ` AND is_project_done = FALSE AND deadline = CURDATE()`;
//     else if (quick === 'next48') whereQuickPriority = ` AND is_project_done = FALSE AND deadline BETWEEN CURDATE() + INTERVAL 1 DAY AND CURDATE() + INTERVAL 2 DAY`;
//     else if (quick === 'undelivered') whereQuickPriority = ` AND is_project_done = FALSE`;
//     else if (quick === 'pay_pending') whereQuickPriority = ` AND is_project_done = TRUE AND is_payment_received = FALSE`;
//     else if (quick === 'agent_pay_pending') whereQuickPriority = ` AND is_payment_received = TRUE AND is_agent_payment_done = FALSE`;

//     // Params
//     const searchParams = q ? [`%${q}%`, `%${q}%`, `%${q}%`] : [];
//     const agentParams = agent ? [agent] : [];

//     // -------- Queries ----------
//     // 1) KPI + Finance (date-range based for sales, operational based on deadline)
//     const queryKpis = `
//       SELECT
//         COUNT(CASE WHEN is_project_done = FALSE AND deadline < CURDATE() THEN 1 END) AS overdue,
//         COUNT(CASE WHEN is_project_done = FALSE AND deadline = CURDATE() THEN 1 END) AS today_deliveries,
//         COUNT(CASE WHEN is_project_done = FALSE AND deadline BETWEEN CURDATE() + INTERVAL 1 DAY AND CURDATE() + INTERVAL 2 DAY THEN 1 END) AS upcoming_48h,
//         COUNT(CASE WHEN is_project_done = FALSE THEN 1 END) AS undelivered_total,

//         COUNT(CASE WHEN status = 'in_progress' THEN 1 END) AS in_progress,
//         COUNT(CASE WHEN status = 'client_review' THEN 1 END) AS client_review,
//         COUNT(CASE WHEN status = 'in_changes' THEN 1 END) AS in_changes,
//         COUNT(CASE WHEN status = 'hold' THEN 1 END) AS hold,
//         COUNT(CASE WHEN assign IS NULL OR TRIM(assign) = '' THEN 1 END) AS not_assigned,

//         COUNT(CASE WHEN is_project_done = TRUE AND is_payment_received = FALSE THEN 1 END) AS client_payment_pending,
//         COUNT(CASE WHEN is_payment_received = TRUE AND is_agent_payment_done = FALSE THEN 1 END) AS agent_payment_pending
//       FROM leads
//       WHERE ${whereBase}
//       ${whereSearch}
//       ${whereAgent};
//     `;

//     const queryMonthlyPerformance = `
//   SELECT
//     m.month AS month,
//     COALESCE(x.leads_count, 0) AS leads_count,
//     COALESCE(x.revenue, 0) AS revenue,
//     COALESCE(x.profit, 0) AS profit
//   FROM (
//     SELECT 1 AS month UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4
//     UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8
//     UNION ALL SELECT 9 UNION ALL SELECT 10 UNION ALL SELECT 11 UNION ALL SELECT 12
//   ) m
//   LEFT JOIN (
//     SELECT
//       MONTH(created_at) AS month,
//       COUNT(*) AS leads_count,
//       COALESCE(SUM(lead_price), 0) AS revenue,
//       COALESCE(SUM(lead_price - agent_price), 0) AS profit
//     FROM leads
//     WHERE YEAR(created_at) = YEAR(CURDATE())
//     GROUP BY MONTH(created_at)
//   ) x ON x.month = m.month
//   ORDER BY m.month ASC;
// `;

//     // Finance: date-range (created_at)
//     const queryFinance = `
//       SELECT
//         COALESCE(SUM(CASE WHEN DATE(created_at) BETWEEN ? AND ? THEN lead_price ELSE 0 END), 0) AS revenue,
//         COALESCE(SUM(CASE WHEN DATE(created_at) BETWEEN ? AND ? THEN agent_price ELSE 0 END), 0) AS agent_cost,
//         COALESCE(SUM(CASE WHEN DATE(created_at) BETWEEN ? AND ? THEN (lead_price - agent_price) ELSE 0 END), 0) AS profit,
//         COALESCE(SUM(CASE WHEN DATE(created_at) BETWEEN ? AND ? THEN (lead_price - advance_amount) ELSE 0 END), 0) AS pending_amount
//       FROM leads
//       WHERE ${whereBase}
//       ${whereSearch}
//       ${whereAgent};
//     `;

//     // 2) Priority queue table (operational view)
//     const queryPriority = `
//       SELECT
//         id,
//         enquiry,
//         name,
//         number,
//         DATE_FORMAT(deadline, '%Y-%m-%d') AS deadline,
//         remarks,
//         assign AS agent_name,
//         status,
//         is_project_done,
//         is_payment_received,
//         is_agent_payment_done,
//         CASE
//           WHEN is_project_done = FALSE AND deadline = CURDATE() THEN 'TODAY'
//           WHEN is_project_done = FALSE AND deadline < CURDATE() THEN 'OVERDUE'
//           WHEN is_project_done = FALSE AND deadline BETWEEN CURDATE() + INTERVAL 1 DAY AND CURDATE() + INTERVAL 2 DAY THEN 'UPCOMING'
//           WHEN is_project_done = TRUE AND is_payment_received = FALSE THEN 'PAYMENT_PENDING'
//           WHEN is_payment_received = TRUE AND is_agent_payment_done = FALSE THEN 'AGENT_PAY_PENDING'
//           WHEN status = 'client_review' THEN 'CLIENT_REVIEW'
//           WHEN status = 'in_changes' THEN 'REVISION'
//           WHEN status = 'hold' THEN 'HOLD'
//           ELSE 'OTHER'
//         END AS queue_status
//       FROM leads
//       WHERE ${whereBase}
//       ${whereSearch}
//       ${whereAgent}
//       ${whereQuickPriority}
//       AND (
//         (is_project_done = FALSE AND deadline <= CURDATE() + INTERVAL 2 DAY)
//         OR (is_project_done = TRUE AND is_payment_received = FALSE)
//         OR (is_payment_received = TRUE AND is_agent_payment_done = FALSE)
//         OR status IN ('client_review','in_changes','hold')
//       )
//       ORDER BY
//         CASE
//           WHEN is_project_done = FALSE AND deadline < CURDATE() THEN 1
//           WHEN is_project_done = FALSE AND deadline = CURDATE() THEN 2
//           WHEN is_project_done = FALSE AND deadline BETWEEN CURDATE() + INTERVAL 1 DAY AND CURDATE() + INTERVAL 2 DAY THEN 3
//           WHEN is_project_done = TRUE AND is_payment_received = FALSE THEN 4
//           WHEN is_payment_received = TRUE AND is_agent_payment_done = FALSE THEN 5
//           ELSE 6
//         END,
//         deadline ASC
//       LIMIT 200;
//     `;

//     // 3) Workload by agent (FIXED)
//     // - exclude completed
//     // - exclude null/blank assign by mapping to 'Unassigned'
//     // - optional: exclude hold if you want "active work" only (recommended)
//     const queryWorkload = `
//       SELECT
//         IF(assign IS NULL OR TRIM(assign) = '', 'Unassigned', assign) AS assign,
//         COUNT(*) AS project_count,
//         COUNT(CASE WHEN deadline < CURDATE() AND is_project_done = FALSE THEN 1 END) AS overdue_count,
//         COUNT(CASE WHEN deadline = CURDATE() AND is_project_done = FALSE THEN 1 END) AS due_today_count
//       FROM leads
//       WHERE is_project_done = FALSE
//         AND status <> 'hold'
//         ${whereSearch}
//         ${whereAgent}
//       GROUP BY IF(assign IS NULL OR TRIM(assign) = '', 'Unassigned', assign)
//       ORDER BY project_count DESC
//       LIMIT 30;
//     `;

//     // 4) Agent payment pending (group)
//     const queryAgentPayPending = `
//       SELECT
//         IF(assign IS NULL OR TRIM(assign) = '', 'Unassigned', assign) AS assign,
//         COUNT(*) AS project_count
//       FROM leads
//       WHERE is_agent_payment_done = FALSE AND is_payment_received = TRUE
//         ${whereSearch}
//         ${whereAgent}
//       GROUP BY IF(assign IS NULL OR TRIM(assign) = '', 'Unassigned', assign)
//       ORDER BY project_count DESC
//       LIMIT 30;
//     `;

//     // 5) Status distribution (for donut chart)
//     const queryStatusDist = `
//       SELECT status, COUNT(*) AS c
//       FROM leads
//       WHERE DATE(created_at) BETWEEN ? AND ?
//         ${whereSearch}
//         ${whereAgent}
//       GROUP BY status;
//     `;

//     // 6) Delivery trend (bar chart) - last 14 days deliveries due
//     const queryDeliveryTrend = `
//       SELECT
//         DATE(deadline) AS day,
//         COUNT(CASE WHEN is_project_done = FALSE THEN 1 END) AS due_total,
//         COUNT(CASE WHEN is_project_done = FALSE AND deadline < CURDATE() THEN 1 END) AS overdue,
//         COUNT(CASE WHEN is_project_done = TRUE THEN 1 END) AS done
//       FROM leads
//       WHERE deadline BETWEEN (CURDATE() - INTERVAL 13 DAY) AND (CURDATE() + INTERVAL 1 DAY)
//         ${whereSearch}
//         ${whereAgent}
//       GROUP BY DATE(deadline)
//       ORDER BY day ASC;
//     `;

//     // 7) Agents list for filter dropdown
//     const queryAgentsList = `
//       SELECT DISTINCT assign
//       FROM leads
//       WHERE assign IS NOT NULL AND TRIM(assign) <> ''
//       ORDER BY assign ASC;
//     `;

//     // ---------- Execute (single multiStatement) ----------
//     const multi = `
//       ${queryKpis}
//       ${queryFinance}
//       ${queryPriority}
//       ${queryWorkload}
//       ${queryAgentPayPending}
//       ${queryStatusDist}
//       ${queryDeliveryTrend}
//       ${queryMonthlyPerformance}
//       ${queryAgentsList}
//     `;

//     // Build parameter list in exact order of placeholders
//     const params = [];

//     // queryKpis placeholders: search + agent
//     params.push(...searchParams, ...agentParams);

//     // queryFinance: 8 placeholders for range repeated, then search + agent
//     params.push(from, to, from, to, from, to, from, to);
//     params.push(...searchParams, ...agentParams);

//     // queryPriority: search + agent (no dates)
//     params.push(...searchParams, ...agentParams);

//     // queryWorkload: search + agent
//     params.push(...searchParams, ...agentParams);

//     // queryAgentPayPending: search + agent
//     params.push(...searchParams, ...agentParams);

//     // queryStatusDist: from/to + search + agent
//     params.push(from, to, ...searchParams, ...agentParams);

//     // queryDeliveryTrend: search + agent
//     params.push(...searchParams, ...agentParams);

//     // queryAgentsList: none

//     pool.query(multi, params, (err, rs) => {
//       if (err) {
//         console.error('dashboard error:', err);
//         return res.status(500).send('Dashboard error');
//       }

//       const kpis = rs?.[0]?.[0] || {};
//       const finance = rs?.[1]?.[0] || {};
//       const priorityQueue = rs?.[2] || [];
//       const workload = rs?.[3] || [];
//       const agentPaymentPending = rs?.[4] || [];
//       const statusDist = rs?.[5] || [];
//       const deliveryTrend = rs?.[6] || [];
//       const monthlyPerformance = rs?.[7] || [];
// const agentsList = (rs?.[8] || []).map(x => x.assign);


//       const dashboard = {
//         meta: {
//           today: new Date().toISOString().split('T')[0],
//           filters: { from, to, agent, q, quick }
//         },
//         kpis: {
//           overdue: safeInt(kpis.overdue),
//           today_deliveries: safeInt(kpis.today_deliveries),
//           upcoming_48h: safeInt(kpis.upcoming_48h),
//           undelivered_total: safeInt(kpis.undelivered_total),

//           in_progress: safeInt(kpis.in_progress),
//           client_review: safeInt(kpis.client_review),
//           in_changes: safeInt(kpis.in_changes),
//           hold: safeInt(kpis.hold),
//           not_assigned: safeInt(kpis.not_assigned),

//           client_payment_pending: safeInt(kpis.client_payment_pending),
//           agent_payment_pending: safeInt(kpis.agent_payment_pending),
//         },
//         finance: {
//           revenue: safeInt(finance.revenue),
//           agent_cost: safeInt(finance.agent_cost),
//           profit: safeInt(finance.profit),
//           pending_amount: safeInt(finance.pending_amount),
//         },
//         priorityQueue,
//         workload,
//         agentPaymentPending,
//         analytics: {
//           statusDist,
//           deliveryTrend
//         },
//         monthlyPerformance,
//         agentsList
//       };

//       return res.render(`${folder}/dashboard`, { dashboard });
//     });
//   });

 router.get('/dashboard', (req, res) => {
  // -------- Filters (big-brand style) ----------
  // defaults: current month window
  const now = new Date();
  const fromDefault = new Date(now.getFullYear(), now.getMonth(), 1);
  const toDefault = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  const from = toYMD(req.query.from || toYMD(fromDefault));
  const to = toYMD(req.query.to || toYMD(toDefault));

  // Optional filters
  const agent = (req.query.agent || '').trim(); // exact agent name
  const q = (req.query.q || '').trim(); // search string
  const quick = (req.query.quick || '').trim(); // overdue|today|next48|undelivered|pay_pending|agent_pay_pending

  // validate dates
  if (!from || !to) return res.status(400).send('Invalid date range');

  // Build WHERE safely
  const whereBase = `1=1`;
  const whereSearch = q ? ` AND (enquiry LIKE ? OR name LIKE ? OR number LIKE ?)` : '';
  const whereAgent = agent ? ` AND assign = ?` : '';

  // Quick filters mostly affect priority table, not KPIs.
  let whereQuickPriority = '';
  if (quick === 'overdue') whereQuickPriority = ` AND is_project_done = FALSE AND deadline < CURDATE()`;
  else if (quick === 'today') whereQuickPriority = ` AND is_project_done = FALSE AND deadline = CURDATE()`;
  else if (quick === 'next48')
    whereQuickPriority = ` AND is_project_done = FALSE AND deadline BETWEEN CURDATE() + INTERVAL 1 DAY AND CURDATE() + INTERVAL 2 DAY`;
  else if (quick === 'undelivered') whereQuickPriority = ` AND is_project_done = FALSE`;
  else if (quick === 'pay_pending') whereQuickPriority = ` AND is_project_done = TRUE AND is_payment_received = FALSE`;
  else if (quick === 'agent_pay_pending') whereQuickPriority = ` AND is_payment_received = TRUE AND is_agent_payment_done = FALSE`;

  // Params
  const searchParams = q ? [`%${q}%`, `%${q}%`, `%${q}%`] : [];
  const agentParams = agent ? [agent] : [];

  // -------- Queries ----------
  // 1) KPI + Finance (date-range based for sales, operational based on deadline)
  const queryKpis = `
    SELECT
      COUNT(CASE WHEN is_project_done = FALSE AND deadline < CURDATE() THEN 1 END) AS overdue,
      COUNT(CASE WHEN is_project_done = FALSE AND deadline = CURDATE() THEN 1 END) AS today_deliveries,
      COUNT(CASE WHEN is_project_done = FALSE AND deadline BETWEEN CURDATE() + INTERVAL 1 DAY AND CURDATE() + INTERVAL 2 DAY THEN 1 END) AS upcoming_48h,
      COUNT(CASE WHEN is_project_done = FALSE THEN 1 END) AS undelivered_total,

      COUNT(CASE WHEN status = 'in_progress' THEN 1 END) AS in_progress,
      COUNT(CASE WHEN status = 'client_review' THEN 1 END) AS client_review,
      COUNT(CASE WHEN status = 'in_changes' THEN 1 END) AS in_changes,
      COUNT(CASE WHEN status = 'hold' THEN 1 END) AS hold,
      COUNT(CASE WHEN assign IS NULL OR TRIM(assign) = '' THEN 1 END) AS not_assigned,

      COUNT(CASE WHEN is_project_done = TRUE AND is_payment_received = FALSE THEN 1 END) AS client_payment_pending,
      COUNT(CASE WHEN is_payment_received = TRUE AND is_agent_payment_done = FALSE THEN 1 END) AS agent_payment_pending
    FROM leads
    WHERE ${whereBase}
    ${whereSearch}
    ${whereAgent};
  `;

  // Finance: date-range (created_at)
  const queryFinance = `
    SELECT
      COALESCE(SUM(CASE WHEN DATE(created_at) BETWEEN ? AND ? THEN lead_price ELSE 0 END), 0) AS revenue,
      COALESCE(SUM(CASE WHEN DATE(created_at) BETWEEN ? AND ? THEN agent_price ELSE 0 END), 0) AS agent_cost,
      COALESCE(SUM(CASE WHEN DATE(created_at) BETWEEN ? AND ? THEN (lead_price - agent_price) ELSE 0 END), 0) AS profit,
      COALESCE(SUM(CASE WHEN DATE(created_at) BETWEEN ? AND ? THEN (lead_price - advance_amount) ELSE 0 END), 0) AS pending_amount
    FROM leads
    WHERE ${whereBase}
    ${whereSearch}
    ${whereAgent};
  `;

  // 2) Priority queue table (operational view)
  const queryPriority = `
    SELECT
      id,
      enquiry,
      name,
      number,
      DATE_FORMAT(deadline, '%Y-%m-%d') AS deadline,
      remarks,
      assign AS agent_name,
      status,
      is_project_done,
      is_payment_received,
      is_agent_payment_done,
      CASE
        WHEN is_project_done = FALSE AND deadline = CURDATE() THEN 'TODAY'
        WHEN is_project_done = FALSE AND deadline < CURDATE() THEN 'OVERDUE'
        WHEN is_project_done = FALSE AND deadline BETWEEN CURDATE() + INTERVAL 1 DAY AND CURDATE() + INTERVAL 2 DAY THEN 'UPCOMING'
        WHEN is_project_done = TRUE AND is_payment_received = FALSE THEN 'PAYMENT_PENDING'
        WHEN is_payment_received = TRUE AND is_agent_payment_done = FALSE THEN 'AGENT_PAY_PENDING'
        WHEN status = 'client_review' THEN 'CLIENT_REVIEW'
        WHEN status = 'in_changes' THEN 'REVISION'
        WHEN status = 'hold' THEN 'HOLD'
        ELSE 'OTHER'
      END AS queue_status
    FROM leads
    WHERE ${whereBase}
    ${whereSearch}
    ${whereAgent}
    ${whereQuickPriority}
    AND (
      (is_project_done = FALSE AND deadline <= CURDATE() + INTERVAL 2 DAY)
      OR (is_project_done = TRUE AND is_payment_received = FALSE)
      OR (is_payment_received = TRUE AND is_agent_payment_done = FALSE)
      OR status IN ('client_review','in_changes','hold')
    )
    ORDER BY
      CASE
        WHEN is_project_done = FALSE AND deadline < CURDATE() THEN 1
        WHEN is_project_done = FALSE AND deadline = CURDATE() THEN 2
        WHEN is_project_done = FALSE AND deadline BETWEEN CURDATE() + INTERVAL 1 DAY AND CURDATE() + INTERVAL 2 DAY THEN 3
        WHEN is_project_done = TRUE AND is_payment_received = FALSE THEN 4
        WHEN is_payment_received = TRUE AND is_agent_payment_done = FALSE THEN 5
        ELSE 6
      END,
      deadline ASC
    LIMIT 200;
  `;

  // 3) Workload by agent
  const queryWorkload = `
    SELECT
      IF(assign IS NULL OR TRIM(assign) = '', 'Unassigned', assign) AS assign,
      COUNT(*) AS project_count,
      COUNT(CASE WHEN deadline < CURDATE() AND is_project_done = FALSE THEN 1 END) AS overdue_count,
      COUNT(CASE WHEN deadline = CURDATE() AND is_project_done = FALSE THEN 1 END) AS due_today_count
    FROM leads
    WHERE is_project_done = FALSE
      AND status <> 'hold'
      ${whereSearch}
      ${whereAgent}
    GROUP BY IF(assign IS NULL OR TRIM(assign) = '', 'Unassigned', assign)
    ORDER BY project_count DESC
    LIMIT 30;
  `;

  // 4) Agent payment pending (group)
  const queryAgentPayPending = `
    SELECT
      IF(assign IS NULL OR TRIM(assign) = '', 'Unassigned', assign) AS assign,
      COUNT(*) AS project_count
    FROM leads
    WHERE is_agent_payment_done = FALSE AND is_payment_received = TRUE
      ${whereSearch}
      ${whereAgent}
    GROUP BY IF(assign IS NULL OR TRIM(assign) = '', 'Unassigned', assign)
    ORDER BY project_count DESC
    LIMIT 30;
  `;

  // 5) Status distribution (for donut chart) in selected range
  const queryStatusDist = `
    SELECT status, COUNT(*) AS c
    FROM leads
    WHERE DATE(created_at) BETWEEN ? AND ?
      ${whereSearch}
      ${whereAgent}
    GROUP BY status;
  `;

  // 6) Delivery trend (bar chart) - last 14 days deliveries due
  const queryDeliveryTrend = `
    SELECT
      DATE(deadline) AS day,
      COUNT(CASE WHEN is_project_done = FALSE THEN 1 END) AS due_total,
      COUNT(CASE WHEN is_project_done = FALSE AND deadline < CURDATE() THEN 1 END) AS overdue,
      COUNT(CASE WHEN is_project_done = TRUE THEN 1 END) AS done
    FROM leads
    WHERE deadline BETWEEN (CURDATE() - INTERVAL 13 DAY) AND (CURDATE() + INTERVAL 1 DAY)
      ${whereSearch}
      ${whereAgent}
    GROUP BY DATE(deadline)
    ORDER BY day ASC;
  `;

  // 7) Monthly performance (existing)
  const queryMonthlyPerformance = `
    SELECT
      m.month AS month,
      COALESCE(x.leads_count, 0) AS leads_count,
      COALESCE(x.revenue, 0) AS revenue,
      COALESCE(x.profit, 0) AS profit
    FROM (
      SELECT 1 AS month UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4
      UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8
      UNION ALL SELECT 9 UNION ALL SELECT 10 UNION ALL SELECT 11 UNION ALL SELECT 12
    ) m
    LEFT JOIN (
      SELECT
        MONTH(created_at) AS month,
        COUNT(*) AS leads_count,
        COALESCE(SUM(lead_price), 0) AS revenue,
        COALESCE(SUM(lead_price - agent_price), 0) AS profit
      FROM leads
      WHERE YEAR(created_at) = YEAR(CURDATE())
      GROUP BY MONTH(created_at)
    ) x ON x.month = m.month
    ORDER BY m.month ASC;
  `;

  // 8) NEW: Monthly status counters (pending/done + all key statuses)
  // Notes:
  // - Uses YEAR(created_at)=current year (same as your monthly performance)
  // - Applies q/agent filters (optional)
  // - Adds done/pending and operational flags as separate counters
  const queryMonthlyStatusCounters = `
    SELECT
      m.month AS month,

      -- core delivery state
      COALESCE(x.pending_work, 0) AS pending_work,
      COALESCE(x.done_work, 0) AS done_work,

      -- status buckets
      COALESCE(x.in_progress, 0) AS in_progress,
      COALESCE(x.client_review, 0) AS client_review,
      COALESCE(x.in_changes, 0) AS in_changes,
      COALESCE(x.hold, 0) AS hold,
      COALESCE(x.other_status, 0) AS other_status,

      -- operational/finance buckets (optional but usually useful)
      COALESCE(x.not_assigned, 0) AS not_assigned,
      COALESCE(x.client_payment_pending, 0) AS client_payment_pending,
      COALESCE(x.agent_payment_pending, 0) AS agent_payment_pending
    FROM (
      SELECT 1 AS month UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4
      UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8
      UNION ALL SELECT 9 UNION ALL SELECT 10 UNION ALL SELECT 11 UNION ALL SELECT 12
    ) m
    LEFT JOIN (
      SELECT
        MONTH(created_at) AS month,

        COUNT(CASE WHEN is_project_done = FALSE THEN 1 END) AS pending_work,
        COUNT(CASE WHEN is_project_done = TRUE THEN 1 END) AS done_work,

        COUNT(CASE WHEN status = 'in_progress' THEN 1 END) AS in_progress,
        COUNT(CASE WHEN status = 'client_review' THEN 1 END) AS client_review,
        COUNT(CASE WHEN status = 'in_changes' THEN 1 END) AS in_changes,
        COUNT(CASE WHEN status = 'hold' THEN 1 END) AS hold,
        COUNT(CASE WHEN status NOT IN ('in_progress','client_review','in_changes','hold') OR status IS NULL OR TRIM(status) = '' THEN 1 END) AS other_status,

        COUNT(CASE WHEN assign IS NULL OR TRIM(assign) = '' THEN 1 END) AS not_assigned,
        COUNT(CASE WHEN is_project_done = TRUE AND is_payment_received = FALSE THEN 1 END) AS client_payment_pending,
        COUNT(CASE WHEN is_payment_received = TRUE AND is_agent_payment_done = FALSE THEN 1 END) AS agent_payment_pending
      FROM leads
      WHERE YEAR(created_at) = YEAR(CURDATE())
        ${whereSearch}
        ${whereAgent}
      GROUP BY MONTH(created_at)
    ) x ON x.month = m.month
    ORDER BY m.month ASC;
  `;

  // 9) Agents list for filter dropdown
  const queryAgentsList = `
    SELECT DISTINCT assign
    FROM leads
    WHERE assign IS NOT NULL AND TRIM(assign) <> ''
    ORDER BY assign ASC;
  `;

  // ---------- Execute (single multiStatement) ----------
  const multi = `
    ${queryKpis}
    ${queryFinance}
    ${queryPriority}
    ${queryWorkload}
    ${queryAgentPayPending}
    ${queryStatusDist}
    ${queryDeliveryTrend}
    ${queryMonthlyPerformance}
    ${queryMonthlyStatusCounters}
    ${queryAgentsList}
  `;

  // Build parameter list in exact order of placeholders
  const params = [];

  // queryKpis placeholders: search + agent
  params.push(...searchParams, ...agentParams);

  // queryFinance: 8 placeholders for range repeated, then search + agent
  params.push(from, to, from, to, from, to, from, to);
  params.push(...searchParams, ...agentParams);

  // queryPriority: search + agent
  params.push(...searchParams, ...agentParams);

  // queryWorkload: search + agent
  params.push(...searchParams, ...agentParams);

  // queryAgentPayPending: search + agent
  params.push(...searchParams, ...agentParams);

  // queryStatusDist: from/to + search + agent
  params.push(from, to, ...searchParams, ...agentParams);

  // queryDeliveryTrend: search + agent
  params.push(...searchParams, ...agentParams);

  // queryMonthlyPerformance: none (as written)

  // queryMonthlyStatusCounters: search + agent (because it includes whereSearch/whereAgent)
  params.push(...searchParams, ...agentParams);

  // queryAgentsList: none

  pool.query(multi, params, (err, rs) => {
    if (err) {
      console.error('dashboard error:', err);
      return res.status(500).send('Dashboard error');
    }

    const kpis = rs?.[0]?.[0] || {};
    const finance = rs?.[1]?.[0] || {};
    const priorityQueue = rs?.[2] || [];
    const workload = rs?.[3] || [];
    const agentPaymentPending = rs?.[4] || [];
    const statusDist = rs?.[5] || [];
    const deliveryTrend = rs?.[6] || [];
    const monthlyPerformance = rs?.[7] || [];
    const monthlyStatusCounters = rs?.[8] || [];
    const agentsList = (rs?.[9] || []).map((x) => x.assign);

    const dashboard = {
      meta: {
        today: new Date().toISOString().split('T')[0],
        filters: { from, to, agent, q, quick },
      },
      kpis: {
        overdue: safeInt(kpis.overdue),
        today_deliveries: safeInt(kpis.today_deliveries),
        upcoming_48h: safeInt(kpis.upcoming_48h),
        undelivered_total: safeInt(kpis.undelivered_total),

        in_progress: safeInt(kpis.in_progress),
        client_review: safeInt(kpis.client_review),
        in_changes: safeInt(kpis.in_changes),
        hold: safeInt(kpis.hold),
        not_assigned: safeInt(kpis.not_assigned),

        client_payment_pending: safeInt(kpis.client_payment_pending),
        agent_payment_pending: safeInt(kpis.agent_payment_pending),
      },
      finance: {
        revenue: safeInt(finance.revenue),
        agent_cost: safeInt(finance.agent_cost),
        profit: safeInt(finance.profit),
        pending_amount: safeInt(finance.pending_amount),
      },
      priorityQueue,
      workload,
      agentPaymentPending,
      analytics: {
        statusDist,
        deliveryTrend,
      },
      monthlyPerformance,

      // NEW: month-wise counters (pending/done + all status buckets)
      monthlyStatusCounters,

      agentsList,
    };

    return res.render(`${folder}/dashboard`, { dashboard });
  });
});




router.get('/convertedleads/:month', (req, res) => {
  const month = parseInt(req.params.month, 10);

  // month 1..12
  if (isNaN(month) || month < 1 || month > 12) {
    return res.status(400).json({ error: 'Invalid month parameter. Use a number between 1 and 12.' });
  }

  // Year support (default current year)
  const now = new Date();
  const year = parseInt(req.query.year, 10) || now.getFullYear();

  // Basic validation: you can widen this if needed
  if (isNaN(year) || year < 2000 || year > (now.getFullYear() + 1)) {
    return res.status(400).json({ error: 'Invalid year parameter. Use a valid year like 2024.' });
  }

  // Pagination
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 500, 1), 200);
  const offset = (page - 1) * limit;

  // Optional filters
  const statusFilter = (req.query.status || '').trim();   // e.g. pending, completed
  const q = (req.query.q || '').trim();                   // search text
  const sort = (req.query.sort || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  const monthName = monthNames[month - 1];

  // Build a proper date range: [start, end)
  // Using date range allows index usage and year filtering.
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const endMonth = month === 12 ? 1 : month + 1;
  const endYear = month === 12 ? year + 1 : year;
  const endDate = `${endYear}-${String(endMonth).padStart(2, '0')}-01`;

  // WHERE conditions (dynamic)
  const where = [];
  const params = [];

  where.push(`created_at >= ? AND created_at < ?`);
  params.push(startDate, endDate);

  if (statusFilter) {
    where.push(`status = ?`);
    params.push(statusFilter);
  }

  if (q) {
    // Search in common fields (add/remove as needed)
    where.push(`(
      name LIKE ? OR
      number LIKE ? OR
      enquiry LIKE ? OR
      assign LIKE ?
    )`);
    const like = `%${q}%`;
    params.push(like, like, like, like);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  // Count query for pagination meta
  const countSql = `SELECT COUNT(*) AS total FROM leads ${whereSql}`;

  // Data query
  const dataSql = `
    SELECT *
    FROM leads
    ${whereSql}
    ORDER BY id ${sort}
    LIMIT ?
    OFFSET ?
  `;

  pool.query(countSql, params, (countErr, countRows) => {
    if (countErr) {
      return res.status(500).json({ error: 'Database count query error', details: countErr });
    }

    const total = countRows?.[0]?.total || 0;

    pool.query(dataSql, [...params, limit, offset], (err, results) => {
      if (err) {
        return res.status(500).json({ error: 'Database query error', details: err });
      }

      // Today in local timezone (format YYYY-MM-DD)
      const today = new Date();
      const todayStr = new Date(today.getFullYear(), today.getMonth(), today.getDate())
        .toISOString()
        .slice(0, 10);

      const mapped = results.map((lead) => {
        // Normalize deadline date
        let deadlineStr = null;
        if (lead.deadline) {
          const d = new Date(lead.deadline);
          deadlineStr = new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString().slice(0, 10);
        }

        // Labels priority logic (clean + correct)
        // 1) If project NOT done -> evaluate deadline urgency
        if (Number(lead.is_project_done) === 0) {
          if (deadlineStr === todayStr) {
            lead.status_label = { class: "bg-success", text: "Today Deliveries" };
          } else if (deadlineStr && new Date(deadlineStr) < new Date(todayStr)) {
            lead.status_label = { class: "bg-danger", text: "Overdue" };
          } else {
            lead.status_label = { class: "bg-warning", text: "Upcoming" };
          }
          return lead;
        }

        // 2) Project done but payment pending
        if (Number(lead.is_payment_received) === 0) {
          lead.status_label = { class: "bg-danger", text: "Client Payment Pending" };
          return lead;
        }

        // 3) Client paid but agent payment pending
        if (Number(lead.is_payment_received) === 1 && Number(lead.is_agent_payment_done) === 0) {
          lead.status_label = { class: "bg-orange", text: "Agent Payment Pending" };
          return lead;
        }

        // 4) Status-based badges
        if (lead.status === 'client_review') {
          lead.status_label = { class: "bg-info", text: "Client Review" };
        } else if (lead.status === 'in_changes') {
          lead.status_label = { class: "bg-purple", text: "Under Revision" };
        } else if (lead.status === 'hold') {
          lead.status_label = { class: "bg-dark", text: "Hold" };
        } else if (lead.status === 'in_progress' || lead.status === 'assign') {
          lead.status_label = { class: "bg-warning", text: "In Progress" };
        } else if (lead.status === 'pending') {
          lead.status_label = { class: "bg-orange", text: "Not Assigned" };
        } else {
          lead.status_label = { class: "bg-secondary", text: "Completed" };
        }

        return lead;
      });

      // Render with paging meta to show in UI
      res.render(`${folder}/convertedLeads`, {
        result: mapped,
        month: monthName,
        year,
        paging: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
          hasPrev: page > 1,
          hasNext: page * limit < total
        },
        filters: { status: statusFilter, q, sort }
      });
    });
  });
});






// router.get('/leads/:status', (req, res) => {
//   const statusType = req.params.status;
//   const today = new Date();
//   const todayDate = today.toISOString().split("T")[0];

//   // Define the date conditions
//   const nextTwoDays = new Date();
//   nextTwoDays.setDate(today.getDate() + 2);
//   const nextTwoDaysDate = nextTwoDays.toISOString().split("T")[0];

//   let query = "";
//   let queryParams = [];

//   switch (statusType) {
//       case "today_deliveries":
//           query = `SELECT * FROM leads WHERE deadline = ? AND is_project_done = 0 ORDER BY id DESC`;
//           queryParams = [todayDate];
//           break;

//       case "upcoming":
//           query = `SELECT * FROM leads WHERE deadline > ? AND is_project_done = 0 ORDER BY id DESC`;
//           queryParams = [todayDate];
//           break;

//       case "next_two_days":
//           query = `SELECT * FROM leads WHERE deadline BETWEEN ? AND ? AND is_project_done = 0 ORDER BY id DESC`;
//           queryParams = [todayDate, nextTwoDaysDate];
//           break;

//       case "overdue":
//           query = `SELECT * FROM leads WHERE deadline < ? AND is_project_done = 0 ORDER BY id DESC`;
//           queryParams = [todayDate];
//           break;

//       case "client_review":
//           query = `SELECT * FROM leads WHERE status = 'client_review' ORDER BY id DESC`;
//           break;

//       case "in_changes":
//           query = `SELECT * FROM leads WHERE status = 'in_changes' ORDER BY id DESC`;
//           break;

//       case "hold":
//           query = `SELECT * FROM leads WHERE status = 'hold' ORDER BY id DESC`;
//           break;

//       case "pending":
//           query = `SELECT * FROM leads WHERE status = 'pending' ORDER BY id DESC`;
//           break;

//       case "in_progress":
//           query = `SELECT * FROM leads WHERE status IN ('in_progress', 'assign') ORDER BY id DESC`;
//           break;

//       case "client_payment_pending":
//           query = `SELECT * FROM leads WHERE is_payment_received = 0 and is_project_done = 1 ORDER BY id DESC`;
//           break;

//       case "agent_payment_pending":
//             query = `SELECT * FROM leads WHERE is_agent_payment_done = 0 and is_payment_received = 1 ORDER BY id DESC`;
//             break;    

//       default:
//           return res.status(400).json({ error: "Invalid status parameter." });
//   }

//   pool.query(query, queryParams, (err, results) => {
//       if (err) {
//           return res.status(500).json({ error: "Database query error", details: err });
//       }

//       results = results.map(lead => {
//           const deadline = lead.deadline ? new Date(lead.deadline).toISOString().split("T")[0] : null;

//           if (lead.is_project_done == 0) {
//               if (deadline === todayDate) {
//                   lead.status_label = { class: "bg-success", text: "Today Deliveries" }; // Green
//               } else if (deadline && new Date(deadline) < new Date(todayDate)) {
//                   lead.status_label = { class: "bg-danger", text: "Overdue" }; // Red
//               } else {
//                   lead.status_label = { class: "bg-warning", text: "Upcoming" }; // Yellow
//               }
//           } 
//           else if (lead.is_payment_received == 0) {
//               lead.status_label = { class: "bg-danger", text: "Client Payment Pending" }; // Red
//           } 
//           else if (lead.is_agent_payment_done == 0) {
//               lead.status_label = { class: "bg-orange", text: "Agent Payment Pending" }; // Orange
//           } 
//           else if (lead.status == 'client_review') {
//               lead.status_label = { class: "bg-info", text: "Client Review" }; // Blue
//           } 
//           else if (lead.status == 'in_changes') {
//               lead.status_label = { class: "bg-purple", text: "Under Revision" }; // Purple
//           } 
//           else if (lead.status == 'hold') {
//               lead.status_label = { class: "bg-dark", text: "Hold" }; // Black
//           } 
//           else if (lead.status == 'in_progress' || lead.status == 'assign') {
//               lead.status_label = { class: "bg-warning", text: "In Progress" }; // Yellow
//           } 
//           else if (lead.status == 'pending') {
//               lead.status_label = { class: "bg-orange", text: "Not Assigned" }; // Orange
//           } 
//           else {
//               lead.status_label = { class: "bg-secondary", text: "Completed" }; // Gray
//           }

//           return lead;
//       });

//       res.render(`${folder}/convertedLeads`, { result: results, month: statusType });
//   });
// });



router.get('/leads/:status', (req, res) => {
  const statusType = req.params.status;

  // Year filter (default = current year)
  const year = parseInt(req.query.year) || new Date().getFullYear();

  const today = new Date();
  const todayDate = today.toISOString().split("T")[0];

  const nextTwoDays = new Date();
  nextTwoDays.setDate(today.getDate() + 2);
  const nextTwoDaysDate = nextTwoDays.toISOString().split("T")[0];

  let query = "";
  let queryParams = [];

  switch (statusType) {
    case "today_deliveries":
      query = `
        SELECT * FROM leads 
        WHERE deadline = ?
          AND is_project_done = 0
          AND YEAR(created_at) = ?
        ORDER BY id DESC
      `;
      queryParams = [todayDate, year];
      break;

    case "upcoming":
      query = `
        SELECT * FROM leads 
        WHERE deadline > ?
          AND is_project_done = 0
          AND YEAR(created_at) = ?
        ORDER BY id DESC
      `;
      queryParams = [todayDate, year];
      break;

    case "next_two_days":
      query = `
        SELECT * FROM leads 
        WHERE deadline BETWEEN ? AND ?
          AND is_project_done = 0
          AND YEAR(created_at) = ?
        ORDER BY id DESC
      `;
      queryParams = [todayDate, nextTwoDaysDate, year];
      break;

    case "overdue":
      query = `
        SELECT * FROM leads 
        WHERE deadline < ?
          AND is_project_done = 0
          AND YEAR(created_at) = ?
        ORDER BY id DESC
      `;
      queryParams = [todayDate, year];
      break;

    case "client_review":
      query = `
        SELECT * FROM leads 
        WHERE status = 'client_review'
          AND YEAR(created_at) = ?
        ORDER BY id DESC
      `;
      queryParams = [year];
      break;

    case "in_changes":
      query = `
        SELECT * FROM leads 
        WHERE status = 'in_changes'
          AND YEAR(created_at) = ?
        ORDER BY id DESC
      `;
      queryParams = [year];
      break;

    case "hold":
      query = `
        SELECT * FROM leads 
        WHERE status = 'hold'
          AND YEAR(created_at) = ?
        ORDER BY id DESC
      `;
      queryParams = [year];
      break;

    case "pending":
      query = `
        SELECT * FROM leads 
        WHERE status = 'pending'
          AND YEAR(created_at) = ?
        ORDER BY id DESC
      `;
      queryParams = [year];
      break;

    case "in_progress":
      query = `
        SELECT * FROM leads 
        WHERE status IN ('in_progress', 'assign')
          AND YEAR(created_at) = ?
        ORDER BY id DESC
      `;
      queryParams = [year];
      break;

    case "client_payment_pending":
      query = `
        SELECT * FROM leads 
        WHERE is_payment_received = 0
          AND is_project_done = 1
          AND YEAR(created_at) = ?
        ORDER BY id DESC
      `;
      queryParams = [year];
      break;

    case "agent_payment_pending":
      query = `
        SELECT * FROM leads 
        WHERE is_agent_payment_done = 0
          AND is_payment_received = 1
          AND YEAR(created_at) = ?
        ORDER BY id DESC
      `;
      queryParams = [year];
      break;

    default:
      return res.status(400).json({ error: "Invalid status parameter." });
  }

  pool.query(query, queryParams, (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: "Database query error" });
    }

    // Status badge logic (unchanged, just cleaned)
    results = results.map(lead => {
      const deadline = lead.deadline
        ? new Date(lead.deadline).toISOString().split("T")[0]
        : null;

      if (lead.is_project_done == 0) {
        if (deadline === todayDate) {
          lead.status_label = { class: "bg-success", text: "Today Deliveries" };
        } else if (deadline && deadline < todayDate) {
          lead.status_label = { class: "bg-danger", text: "Overdue" };
        } else {
          lead.status_label = { class: "bg-warning", text: "Upcoming" };
        }
      } else if (lead.is_payment_received == 0) {
        lead.status_label = { class: "bg-danger", text: "Client Payment Pending" };
      } else if (lead.is_agent_payment_done == 0) {
        lead.status_label = { class: "bg-orange", text: "Agent Payment Pending" };
      } else if (lead.status === 'client_review') {
        lead.status_label = { class: "bg-info", text: "Client Review" };
      } else if (lead.status === 'in_changes') {
        lead.status_label = { class: "bg-purple", text: "Under Revision" };
      } else if (lead.status === 'hold') {
        lead.status_label = { class: "bg-dark", text: "Hold" };
      } else if (lead.status === 'in_progress' || lead.status === 'assign') {
        lead.status_label = { class: "bg-warning", text: "In Progress" };
      } else if (lead.status === 'pending') {
        lead.status_label = { class: "bg-orange", text: "Not Assigned" };
      } else {
        lead.status_label = { class: "bg-secondary", text: "Completed" };
      }

      return lead;
    });

    // ✅ IMPORTANT: year is now passed
    res.render(`${folder}/convertedLeads`, {
      result: results,
      month: statusType,
      year: year
    });
  });
});






// router.get('/assign/:assign', (req, res) => {
//   const assign = req.params.assign;

//   // Query to fetch leads based on agent assignment ordered by ID DESC
//   pool.query(
//       `SELECT * FROM leads 
// WHERE assign = ? and is_agent_payment_done = FALSE 
// ORDER BY id DESC;
// `,
//       [assign],
//       (err, results) => {
//           if (err) {
//               return res.status(500).json({ error: 'Database query error', details: err });
//           }

//           const today = new Date().toISOString().split("T")[0];

//           results = results.map(lead => {
//               const deadline = lead.deadline ? new Date(lead.deadline).toISOString().split("T")[0] : null;

//               if (lead.is_project_done == 0) {
//                   if (deadline === today) {
//                       lead.status_label = { class: "bg-success", text: "Today Deliveries" }; // Green
//                   } else if (deadline && new Date(deadline) < new Date(today)) {
//                       lead.status_label = { class: "bg-danger", text: "Overdue" }; // Red
//                   } else {
//                       lead.status_label = { class: "bg-warning", text: "Upcoming" }; // Yellow
//                   }
//               } 
//               else if (lead.is_payment_received == 0) {
//                   lead.status_label = { class: "bg-danger", text: "Client Payment Pending" }; // Red
//               } 
//               else if (lead.is_agent_payment_done == 0) {
//                   lead.status_label = { class: "bg-orange", text: "Agent Payment Pending" }; // Orange
//               } 
//               else if (lead.status == 'client_review') {
//                   lead.status_label = { class: "bg-info", text: "Client Review" }; // Blue
//               } 
//               else if (lead.status == 'in_changes') {
//                   lead.status_label = { class: "bg-purple", text: "Under Revision" }; // Purple
//               } 
//               else if (lead.status == 'hold') {
//                   lead.status_label = { class: "bg-dark", text: "Hold" }; // Black
//               } 
//               else if (lead.status == 'in_progress' || lead.status == 'assign') {
//                   lead.status_label = { class: "bg-warning", text: "In Progress" }; // Yellow
//               } 
//               else if (lead.status == 'pending') {
//                   lead.status_label = { class: "bg-orange", text: "Not Assigned" }; // Orange
//               } 
//               else {
//                   lead.status_label = { class: "bg-secondary", text: "Completed" }; // Gray
//               }

//               return lead;
//           });

//           res.render(`${folder}/convertedLeads`, { result: results, month :assign });
//       }
//   );
// });




// router.get('/workload/:assign', (req, res) => {
//   const assign = req.params.assign;

//   // Query to fetch leads based on agent assignment ordered by ID DESC
//   pool.query(
//       `SELECT * FROM leads 
// WHERE assign = ? 
// AND  is_project_done = FALSE
// ORDER BY id DESC;
// `,
//       [assign],
//       (err, results) => {
//           if (err) {
//               return res.status(500).json({ error: 'Database query error', details: err });
//           }

//           const today = new Date().toISOString().split("T")[0];

//           results = results.map(lead => {
//               const deadline = lead.deadline ? new Date(lead.deadline).toISOString().split("T")[0] : null;

//               if (lead.is_project_done == 0) {
//                   if (deadline === today) {
//                       lead.status_label = { class: "bg-success", text: "Today Deliveries" }; // Green
//                   } else if (deadline && new Date(deadline) < new Date(today)) {
//                       lead.status_label = { class: "bg-danger", text: "Overdue" }; // Red
//                   } else {
//                       lead.status_label = { class: "bg-warning", text: "Upcoming" }; // Yellow
//                   }
//               } 
//               else if (lead.is_payment_received == 0) {
//                   lead.status_label = { class: "bg-danger", text: "Client Payment Pending" }; // Red
//               } 
//               else if (lead.is_agent_payment_done == 0) {
//                   lead.status_label = { class: "bg-orange", text: "Agent Payment Pending" }; // Orange
//               } 
//               else if (lead.status == 'client_review') {
//                   lead.status_label = { class: "bg-info", text: "Client Review" }; // Blue
//               } 
//               else if (lead.status == 'in_changes') {
//                   lead.status_label = { class: "bg-purple", text: "Under Revision" }; // Purple
//               } 
//               else if (lead.status == 'hold') {
//                   lead.status_label = { class: "bg-dark", text: "Hold" }; // Black
//               } 
//               else if (lead.status == 'in_progress' || lead.status == 'assign') {
//                   lead.status_label = { class: "bg-warning", text: "In Progress" }; // Yellow
//               } 
//               else if (lead.status == 'pending') {
//                   lead.status_label = { class: "bg-orange", text: "Not Assigned" }; // Orange
//               } 
//               else {
//                   lead.status_label = { class: "bg-secondary", text: "Completed" }; // Gray
//               }

//               return lead;
//           });

//           res.render(`${folder}/convertedLeads`, { result: results, month :assign });
//       }
//   );
// });






// router.get('/profit/yearly', (req, res) => {
//   pool.query(
//       `SELECT 
//           MONTH(created_at) AS month, 
//           SUM(lead_price) AS total_lead_price, 
//           SUM(agent_price) AS total_agent_price, 
//           SUM(lead_price - agent_price) AS profit
//       FROM leads 
//       WHERE YEAR(created_at) = YEAR(CURDATE()) 
//       GROUP BY MONTH(created_at) 
//       ORDER BY month;`,
//       (err, results) => {
//           if (err) {
//               return res.status(500).json({ error: 'Database query error', details: err });
//           }
          
//           res.json(results); // Send data in JSON format for frontend to use in graph
//       }
//   );
// });





// router.get('/workload', (req, res) => {
//   // Query to fetch leads grouped by assigned agent and count the projects they handle
//   pool.query(
//       `SELECT assign, COUNT(*) AS project_count 
//       FROM leads 
//       WHERE is_agent_payment_done = FALSE OR is_project_done = FALSE 
//       GROUP BY assign 
//       ORDER BY project_count DESC;`,
//       (err, results) => {
//           if (err) {
//               return res.status(500).json({ error: 'Database query error', details: err });
//           }

//           // res.render(`${folder}/convertedLeads`, { result: results , month : 'Workload'});
//           res.json(results)
//       }
//   );
// });




router.get('/assign/:assign', (req, res) => {
  const assign = req.params.assign;

  // Year filter (default current year)
  const year = parseInt(req.query.year) || new Date().getFullYear();

  pool.query(
    `SELECT * 
     FROM leads 
     WHERE assign = ?
       AND is_agent_payment_done = FALSE
       AND YEAR(created_at) = ?
     ORDER BY id DESC;`,
    [assign, year],
    (err, results) => {
      if (err) {
        return res.status(500).json({ error: 'Database query error', details: err });
      }

      const today = new Date().toISOString().split("T")[0];

      results = results.map(lead => {
        const deadline = lead.deadline ? new Date(lead.deadline).toISOString().split("T")[0] : null;

        if (lead.is_project_done == 0) {
          if (deadline === today) {
            lead.status_label = { class: "bg-success", text: "Today Deliveries" };
          } else if (deadline && deadline < today) {
            lead.status_label = { class: "bg-danger", text: "Overdue" };
          } else {
            lead.status_label = { class: "bg-warning", text: "Upcoming" };
          }
        } else if (lead.is_payment_received == 0) {
          lead.status_label = { class: "bg-danger", text: "Client Payment Pending" };
        } else if (lead.is_agent_payment_done == 0) {
          lead.status_label = { class: "bg-orange", text: "Agent Payment Pending" };
        } else if (lead.status == 'client_review') {
          lead.status_label = { class: "bg-info", text: "Client Review" };
        } else if (lead.status == 'in_changes') {
          lead.status_label = { class: "bg-purple", text: "Under Revision" };
        } else if (lead.status == 'hold') {
          lead.status_label = { class: "bg-dark", text: "Hold" };
        } else if (lead.status == 'in_progress' || lead.status == 'assign') {
          lead.status_label = { class: "bg-warning", text: "In Progress" };
        } else if (lead.status == 'pending') {
          lead.status_label = { class: "bg-orange", text: "Not Assigned" };
        } else {
          lead.status_label = { class: "bg-secondary", text: "Completed" };
        }

        return lead;
      });

      // ✅ pass year to EJS
      res.render(`${folder}/convertedLeads`, { result: results, month: assign, year });
    }
  );
});



router.get('/workload/:assign', (req, res) => {
  const assign = req.params.assign;

  // Year filter (default current year)
  const year = parseInt(req.query.year) || new Date().getFullYear();

  pool.query(
    `SELECT * 
     FROM leads 
     WHERE assign = ?
       AND is_project_done = FALSE
       AND YEAR(created_at) = ?
     ORDER BY id DESC;`,
    [assign, year],
    (err, results) => {
      if (err) {
        return res.status(500).json({ error: 'Database query error', details: err });
      }

      const today = new Date().toISOString().split("T")[0];

      results = results.map(lead => {
        const deadline = lead.deadline ? new Date(lead.deadline).toISOString().split("T")[0] : null;

        if (lead.is_project_done == 0) {
          if (deadline === today) {
            lead.status_label = { class: "bg-success", text: "Today Deliveries" };
          } else if (deadline && deadline < today) {
            lead.status_label = { class: "bg-danger", text: "Overdue" };
          } else {
            lead.status_label = { class: "bg-warning", text: "Upcoming" };
          }
        } else if (lead.is_payment_received == 0) {
          lead.status_label = { class: "bg-danger", text: "Client Payment Pending" };
        } else if (lead.is_agent_payment_done == 0) {
          lead.status_label = { class: "bg-orange", text: "Agent Payment Pending" };
        } else if (lead.status == 'client_review') {
          lead.status_label = { class: "bg-info", text: "Client Review" };
        } else if (lead.status == 'in_changes') {
          lead.status_label = { class: "bg-purple", text: "Under Revision" };
        } else if (lead.status == 'hold') {
          lead.status_label = { class: "bg-dark", text: "Hold" };
        } else if (lead.status == 'in_progress' || lead.status == 'assign') {
          lead.status_label = { class: "bg-warning", text: "In Progress" };
        } else if (lead.status == 'pending') {
          lead.status_label = { class: "bg-orange", text: "Not Assigned" };
        } else {
          lead.status_label = { class: "bg-secondary", text: "Completed" };
        }

        return lead;
      });

      // ✅ pass year to EJS
      res.render(`${folder}/convertedLeads`, { result: results, month: assign, year });
    }
  );
});



router.get('/profit/yearly', (req, res) => {
  const currentYear = new Date().getFullYear();
  const year = Number(req.query.year || currentYear);

  if (!Number.isInteger(year) || year < 2000 || year > currentYear + 1) {
    return res.status(400).json({
      error: 'Invalid year parameter',
      message: 'Use ?year=2025'
    });
  }

  const query = `
    SELECT 
      m.month AS month,
      COALESCE(x.total_lead_price, 0) AS total_lead_price,
      COALESCE(x.total_agent_price, 0) AS total_agent_price,
      COALESCE(x.total_lead_price, 0) - COALESCE(x.total_agent_price, 0) AS profit
    FROM (
      SELECT 1 AS month UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4
      UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8
      UNION ALL SELECT 9 UNION ALL SELECT 10 UNION ALL SELECT 11 UNION ALL SELECT 12
    ) m
    LEFT JOIN (
      SELECT 
        MONTH(created_at) AS month,
        COALESCE(SUM(lead_price), 0) AS total_lead_price,
        COALESCE(SUM(agent_price), 0) AS total_agent_price
      FROM leads
      WHERE YEAR(created_at) = ?
      GROUP BY MONTH(created_at)
    ) x ON x.month = m.month
    ORDER BY m.month;
  `;

  pool.query(query, [year], (err, rows) => {
    if (err) {
      console.error('profit/yearly error:', err);
      return res.status(500).json({ error: 'Database query error' });
    }

    const totals = (rows || []).reduce((acc, r) => {
      acc.total_lead_price += Number(r.total_lead_price || 0);
      acc.total_agent_price += Number(r.total_agent_price || 0);
      acc.profit += Number(r.profit || 0);
      return acc;
    }, { total_lead_price: 0, total_agent_price: 0, profit: 0 });

    return res.json({
      meta: { year, generated_at: new Date().toISOString(), totals },
      data: rows || []
    });
  });
});



router.post('/update-field', (req, res) => {
  const { id, field, value } = req.body;

  // Ensure only valid fields are updated
  const allowedFields = ['name', 'number', 'enquiry', 'deadline', 'assign', 'lead_price', 'agent_price', 'advance_amount', 'remarks','is_project_done', 'is_payment_received', 'is_agent_payment_done','status','pakistani_price'];
  if (!allowedFields.includes(field)) {
      return res.json({ success: false, message: "Invalid field" });
  }

  pool.query(
      `UPDATE leads SET ?? = ? WHERE id = ?`, 
      [field, value, id], 
      (err, result) => {
          if (err) {
              console.error(err);
              return res.json({ success: false });
          }
          res.json({ success: true });
      }
  );
});




async function getSettings() {
    const rows = await queryAsync("SELECT phpsessid, current_tempid, updated_at FROM app_settings WHERE id=1 LIMIT 1");
  if (!rows.length) throw new Error("app_settings row (id=1) not found. Seed it first.");
  return rows[0];
}

router.get("/settings", async (req, res) => {
  try {
    const settings = await getSettings();
    res.render("freelancing/settings", { settings, message: null, error: null });
  } catch (e) {
    res.status(500).send(e.message);
  }
});

router.post("/settings", async (req, res) => {
  try {
    const { phpsessid, current_tempid } = req.body;

    // Basic validation
    const tempidNum = Number(current_tempid);
    if (!phpsessid || !phpsessid.trim()) {
      const settings = await getSettings();
      return res.render("settings", { settings, message: null, error: "PHPSESSID is required." });
    }
    if (!Number.isFinite(tempidNum) || tempidNum <= 0) {
      const settings = await getSettings();
      return res.render("settings", { settings, message: null, error: "TempID must be a positive number." });
    }

   
    await queryAsync(
      "UPDATE app_settings SET phpsessid=?, current_tempid=? WHERE id=1",
      [phpsessid.trim(), tempidNum]
    );

    const settings = await getSettings();
    res.render("freelancing/settings", { settings, message: "Settings updated successfully.", error: null });
  } catch (e) {
    const settings = await getSettings().catch(() => ({ phpsessid: "", current_tempid: 0, updated_at: null }));
    res.render("freelancing/settings", { settings, message: null, error: e.message });
  }
});

module.exports = router;
