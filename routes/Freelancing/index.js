
var express = require('express');
var router = express.Router();
var upload = require('../multer');
var pool = require('../pool');
require('dotenv').config()
var folder = 'Freelancing'
var table = 'freelancing'
var table1 = 'source_code'
var dataService = require('../dataService');


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



 
router.get('/dashboard', (req, res) => {
 
 
  let today = new Date().toISOString().split("T")[0]; // Get today's date in YYYY-MM-DD format
    let tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    let dayAfterTomorrow = new Date();
    dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2);


  let query = `
      SELECT 
          COUNT(CASE WHEN status = 'in_progress' THEN 1 END) AS in_progress_leads,
          COUNT(CASE WHEN status = 'assign' THEN 1 END) AS assigned_leads,
          COUNT(CASE WHEN status = 'completed' THEN 1 END) AS completed_leads,
          COUNT(CASE WHEN status = 'hold' THEN 1 END) AS hold_leads,
          COUNT(CASE WHEN status = 'pending' THEN 1 END) AS pending_leads,
          COUNT(CASE WHEN status = 'in_progress' THEN 1 END) AS in_progress_projects,
          COUNT(CASE WHEN status = 'client_review' THEN 1 END) AS client_review_projects,
          COUNT(CASE WHEN status = 'in_changes' THEN 1 END) AS in_changes_projects,


          -- Project Report Overview
          COUNT(CASE WHEN is_project_done = FALSE AND deadline < CURDATE() THEN 1 END) AS overdue_projects,
          COUNT(CASE WHEN is_project_done = FALSE AND deadline = CURDATE() THEN 1 END) AS today_delivered_project,
          COUNT(CASE WHEN is_project_done = FALSE AND deadline BETWEEN CURDATE() + INTERVAL 1 DAY AND CURDATE() + INTERVAL 2 DAY THEN 1 END) AS upcoming_project_delieverd,
          COUNT(CASE WHEN is_payment_received = FALSE and is_project_done = TRUE THEN 1 END) AS client_payment_pending,
          COUNT(CASE WHEN is_agent_payment_done = FALSE and is_payment_received = TRUE THEN 1 END) AS agent_payment_pending,
          COUNT(CASE WHEN assign IS NULL THEN 1 END) AS not_assigned_projects,
          COUNT(CASE WHEN status = 'hold' THEN 1 END) AS hold_projects,
          COUNT(CASE WHEN status = 'completed' THEN 1 END) AS completed_projects,
          COUNT(CASE WHEN deadline > CURDATE() and is_project_done = FALSE THEN 1 END) AS total_undelivered_projects
      FROM leads;
  `;
  let query1 = `
  SELECT 
  enquiry,  
  name, 
    number, 
    deadline, 
    status, 
    remarks,
    assign AS agent_name
FROM leads
WHERE 
    (is_project_done = False AND deadline = CURDATE()) -- Today Delivered Projects
    OR 
    (is_project_done = FALSE AND deadline < CURDATE()) -- Overdue Projects
    OR 
    (is_project_done = FALSE AND deadline BETWEEN CURDATE() + INTERVAL 1 DAY AND CURDATE() + INTERVAL 2 DAY) -- Upcoming Deliveries
ORDER BY deadline ASC;

`;


let query2 = `SELECT assign, COUNT(*) AS project_count 
      FROM leads 
      WHERE is_agent_payment_done = FALSE  
      GROUP BY assign 
      ORDER BY project_count DESC;`


      let query3 = `SELECT assign, COUNT(*) AS project_count 
      FROM leads 
      WHERE is_project_done = FALSE 
      GROUP BY assign 
      ORDER BY project_count DESC;`  
      
      
      let query4 = `SELECT 
    SUM(lead_price) - SUM(advance_amount) AS total_pending_amount
FROM leads 
WHERE YEAR(created_at) = YEAR(CURDATE());
`


  pool.query(query+query1+query2+query3+query4, (err, result) => {
      if (err) throw err;
      res.render(`${folder}/dashboard`, { result:result });
      // res.json(result)
  });
});



router.get('/convertedleads/:month', (req, res) => {
  const month = parseInt(req.params.month, 10);

  // Validate month input (should be between 1 and 12)
  if (isNaN(month) || month < 1 || month > 12) {
      return res.status(400).json({ error: 'Invalid month parameter. Use a number between 1 and 12.' });
  }

  // Month names array
  const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
  ];
  const monthName = monthNames[month - 1]; // Convert number to month name

  // Query to fetch leads ordered by ID DESC
  pool.query(
      `SELECT * FROM leads WHERE MONTH(created_at) = ? ORDER BY id DESC`,
      [month],
      (err, results) => {
          if (err) {
              return res.status(500).json({ error: 'Database query error', details: err });
          }

          const today = new Date().toISOString().split("T")[0];

          results = results.map(lead => {
              const deadline = lead.deadline ? new Date(lead.deadline).toISOString().split("T")[0] : null;

              if (lead.is_project_done == 0) {
                  if (deadline === today) {
                      lead.status_label = { class: "bg-success", text: "Today Deliveries" }; // Green
                  } else if (deadline && new Date(deadline) < new Date(today)) {
                      lead.status_label = { class: "bg-danger", text: "Overdue" }; // Red
                  } else {
                      lead.status_label = { class: "bg-warning", text: "Upcoming" }; // Yellow
                  }
              } 
              else if (lead.is_payment_received == 0) {
                  lead.status_label = { class: "bg-danger", text: "Client Payment Pending" }; // Red
              } 
              else if (lead.is_agent_payment_done == 0 && lead.is_agent_payment_done == 1) {
                  lead.status_label = { class: "bg-orange", text: "Agent Payment Pending" }; // Orange
              } 
              else if (lead.status == 'client_review') {
                  lead.status_label = { class: "bg-info", text: "Client Review" }; // Blue
              } 
              else if (lead.status == 'in_changes') {
                  lead.status_label = { class: "bg-purple", text: "Under Revision" }; // Purple
              } 
              else if (lead.status == 'hold') {
                  lead.status_label = { class: "bg-dark", text: "Hold" }; // Black
              } 
              else if (lead.status == 'in_progress' || lead.status == 'assign') {
                  lead.status_label = { class: "bg-warning", text: "In Progress" }; // Yellow
              } 
              else if (lead.status == 'pending') {
                  lead.status_label = { class: "bg-orange", text: "Not Assigned" }; // Orange
              } 
              else {
                  lead.status_label = { class: "bg-secondary", text: "Completed" }; // Gray
              }

              return lead;
          });

          res.render(`${folder}/convertedLeads`, { result: results, month: monthName });
      }
  );
});





router.get('/leads/:status', (req, res) => {
  const statusType = req.params.status;
  const today = new Date();
  const todayDate = today.toISOString().split("T")[0];

  // Define the date conditions
  const nextTwoDays = new Date();
  nextTwoDays.setDate(today.getDate() + 2);
  const nextTwoDaysDate = nextTwoDays.toISOString().split("T")[0];

  let query = "";
  let queryParams = [];

  switch (statusType) {
      case "today_deliveries":
          query = `SELECT * FROM leads WHERE deadline = ? AND is_project_done = 0 ORDER BY id DESC`;
          queryParams = [todayDate];
          break;

      case "upcoming":
          query = `SELECT * FROM leads WHERE deadline > ? AND is_project_done = 0 ORDER BY id DESC`;
          queryParams = [todayDate];
          break;

      case "next_two_days":
          query = `SELECT * FROM leads WHERE deadline BETWEEN ? AND ? AND is_project_done = 0 ORDER BY id DESC`;
          queryParams = [todayDate, nextTwoDaysDate];
          break;

      case "overdue":
          query = `SELECT * FROM leads WHERE deadline < ? AND is_project_done = 0 ORDER BY id DESC`;
          queryParams = [todayDate];
          break;

      case "client_review":
          query = `SELECT * FROM leads WHERE status = 'client_review' ORDER BY id DESC`;
          break;

      case "in_changes":
          query = `SELECT * FROM leads WHERE status = 'in_changes' ORDER BY id DESC`;
          break;

      case "hold":
          query = `SELECT * FROM leads WHERE status = 'hold' ORDER BY id DESC`;
          break;

      case "pending":
          query = `SELECT * FROM leads WHERE status = 'pending' ORDER BY id DESC`;
          break;

      case "in_progress":
          query = `SELECT * FROM leads WHERE status IN ('in_progress', 'assign') ORDER BY id DESC`;
          break;

      case "client_payment_pending":
          query = `SELECT * FROM leads WHERE is_payment_received = 0 and is_project_done = 1 ORDER BY id DESC`;
          break;

      case "agent_payment_pending":
            query = `SELECT * FROM leads WHERE is_agent_payment_done = 0 and is_payment_received = 1 ORDER BY id DESC`;
            break;    

      default:
          return res.status(400).json({ error: "Invalid status parameter." });
  }

  pool.query(query, queryParams, (err, results) => {
      if (err) {
          return res.status(500).json({ error: "Database query error", details: err });
      }

      results = results.map(lead => {
          const deadline = lead.deadline ? new Date(lead.deadline).toISOString().split("T")[0] : null;

          if (lead.is_project_done == 0) {
              if (deadline === todayDate) {
                  lead.status_label = { class: "bg-success", text: "Today Deliveries" }; // Green
              } else if (deadline && new Date(deadline) < new Date(todayDate)) {
                  lead.status_label = { class: "bg-danger", text: "Overdue" }; // Red
              } else {
                  lead.status_label = { class: "bg-warning", text: "Upcoming" }; // Yellow
              }
          } 
          else if (lead.is_payment_received == 0) {
              lead.status_label = { class: "bg-danger", text: "Client Payment Pending" }; // Red
          } 
          else if (lead.is_agent_payment_done == 0) {
              lead.status_label = { class: "bg-orange", text: "Agent Payment Pending" }; // Orange
          } 
          else if (lead.status == 'client_review') {
              lead.status_label = { class: "bg-info", text: "Client Review" }; // Blue
          } 
          else if (lead.status == 'in_changes') {
              lead.status_label = { class: "bg-purple", text: "Under Revision" }; // Purple
          } 
          else if (lead.status == 'hold') {
              lead.status_label = { class: "bg-dark", text: "Hold" }; // Black
          } 
          else if (lead.status == 'in_progress' || lead.status == 'assign') {
              lead.status_label = { class: "bg-warning", text: "In Progress" }; // Yellow
          } 
          else if (lead.status == 'pending') {
              lead.status_label = { class: "bg-orange", text: "Not Assigned" }; // Orange
          } 
          else {
              lead.status_label = { class: "bg-secondary", text: "Completed" }; // Gray
          }

          return lead;
      });

      res.render(`${folder}/convertedLeads`, { result: results, month: statusType });
  });
});






router.get('/assign/:assign', (req, res) => {
  const assign = req.params.assign;

  // Query to fetch leads based on agent assignment ordered by ID DESC
  pool.query(
      `SELECT * FROM leads 
WHERE assign = ? and is_agent_payment_done = FALSE 
ORDER BY id DESC;
`,
      [assign],
      (err, results) => {
          if (err) {
              return res.status(500).json({ error: 'Database query error', details: err });
          }

          const today = new Date().toISOString().split("T")[0];

          results = results.map(lead => {
              const deadline = lead.deadline ? new Date(lead.deadline).toISOString().split("T")[0] : null;

              if (lead.is_project_done == 0) {
                  if (deadline === today) {
                      lead.status_label = { class: "bg-success", text: "Today Deliveries" }; // Green
                  } else if (deadline && new Date(deadline) < new Date(today)) {
                      lead.status_label = { class: "bg-danger", text: "Overdue" }; // Red
                  } else {
                      lead.status_label = { class: "bg-warning", text: "Upcoming" }; // Yellow
                  }
              } 
              else if (lead.is_payment_received == 0) {
                  lead.status_label = { class: "bg-danger", text: "Client Payment Pending" }; // Red
              } 
              else if (lead.is_agent_payment_done == 0) {
                  lead.status_label = { class: "bg-orange", text: "Agent Payment Pending" }; // Orange
              } 
              else if (lead.status == 'client_review') {
                  lead.status_label = { class: "bg-info", text: "Client Review" }; // Blue
              } 
              else if (lead.status == 'in_changes') {
                  lead.status_label = { class: "bg-purple", text: "Under Revision" }; // Purple
              } 
              else if (lead.status == 'hold') {
                  lead.status_label = { class: "bg-dark", text: "Hold" }; // Black
              } 
              else if (lead.status == 'in_progress' || lead.status == 'assign') {
                  lead.status_label = { class: "bg-warning", text: "In Progress" }; // Yellow
              } 
              else if (lead.status == 'pending') {
                  lead.status_label = { class: "bg-orange", text: "Not Assigned" }; // Orange
              } 
              else {
                  lead.status_label = { class: "bg-secondary", text: "Completed" }; // Gray
              }

              return lead;
          });

          res.render(`${folder}/convertedLeads`, { result: results, month :assign });
      }
  );
});




router.get('/workload/:assign', (req, res) => {
  const assign = req.params.assign;

  // Query to fetch leads based on agent assignment ordered by ID DESC
  pool.query(
      `SELECT * FROM leads 
WHERE assign = ? 
AND  is_project_done = FALSE
ORDER BY id DESC;
`,
      [assign],
      (err, results) => {
          if (err) {
              return res.status(500).json({ error: 'Database query error', details: err });
          }

          const today = new Date().toISOString().split("T")[0];

          results = results.map(lead => {
              const deadline = lead.deadline ? new Date(lead.deadline).toISOString().split("T")[0] : null;

              if (lead.is_project_done == 0) {
                  if (deadline === today) {
                      lead.status_label = { class: "bg-success", text: "Today Deliveries" }; // Green
                  } else if (deadline && new Date(deadline) < new Date(today)) {
                      lead.status_label = { class: "bg-danger", text: "Overdue" }; // Red
                  } else {
                      lead.status_label = { class: "bg-warning", text: "Upcoming" }; // Yellow
                  }
              } 
              else if (lead.is_payment_received == 0) {
                  lead.status_label = { class: "bg-danger", text: "Client Payment Pending" }; // Red
              } 
              else if (lead.is_agent_payment_done == 0) {
                  lead.status_label = { class: "bg-orange", text: "Agent Payment Pending" }; // Orange
              } 
              else if (lead.status == 'client_review') {
                  lead.status_label = { class: "bg-info", text: "Client Review" }; // Blue
              } 
              else if (lead.status == 'in_changes') {
                  lead.status_label = { class: "bg-purple", text: "Under Revision" }; // Purple
              } 
              else if (lead.status == 'hold') {
                  lead.status_label = { class: "bg-dark", text: "Hold" }; // Black
              } 
              else if (lead.status == 'in_progress' || lead.status == 'assign') {
                  lead.status_label = { class: "bg-warning", text: "In Progress" }; // Yellow
              } 
              else if (lead.status == 'pending') {
                  lead.status_label = { class: "bg-orange", text: "Not Assigned" }; // Orange
              } 
              else {
                  lead.status_label = { class: "bg-secondary", text: "Completed" }; // Gray
              }

              return lead;
          });

          res.render(`${folder}/convertedLeads`, { result: results, month :assign });
      }
  );
});






router.get('/profit/yearly', (req, res) => {
  pool.query(
      `SELECT 
          MONTH(created_at) AS month, 
          SUM(lead_price) AS total_lead_price, 
          SUM(agent_price) AS total_agent_price, 
          SUM(lead_price - agent_price) AS profit
      FROM leads 
      WHERE YEAR(created_at) = YEAR(CURDATE()) 
      GROUP BY MONTH(created_at) 
      ORDER BY month;`,
      (err, results) => {
          if (err) {
              return res.status(500).json({ error: 'Database query error', details: err });
          }
          
          res.json(results); // Send data in JSON format for frontend to use in graph
      }
  );
});





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



module.exports = router;
