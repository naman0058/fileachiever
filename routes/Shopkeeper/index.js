
var express = require('express');
var router = express.Router();
var upload = require('../multer');
var pool = require('../pool');
require('dotenv').config()
var folder = 'Shopkeeper'
var table = 'shopkeeper'
var table1 = 'source_code'
var dataService = require('../dataService');
var onPageSeo = require('../onPageSeo');


const emailTemplates = require('../utility/emailTemplates');
const verify = require('../verify');


const nodeCCAvenue = require('node-ccavenue');
const ccave = new nodeCCAvenue.Configure({
  merchant_id: '1760015',
  working_key: '3F831E8FD26B47BBFDBCDB8E021635F2'
});


// router.use(dataService.adminAuthenticationToken);

// import {v2 as cloudinary} from 'cloudinary';
const cloudinary = require('cloudinary').v2

const util = require('util');
const queryAsync = util.promisify(pool.query).bind(pool);
          
cloudinary.config({ 
  cloud_name: 'dggf8vl9p', 
  api_key: '689413729986639', 
  api_secret: 'hL5COn6ja_-lCqIK021H1YpVyoo' 
});


const { nanoid } = require('nanoid');



router.get('/generateLink', verify.shopAuthenticationToken, async (req, res) => {
  const promoterId = req.session.shopkeeper;

  const links = await queryAsync(`
    SELECT 
      l.id,
      l.original_url, 
      l.short_code,
      -- Unique clicks from 'clicks' table
      (SELECT COUNT(DISTINCT cookie_id) FROM clicks WHERE link_id = l.id) AS unique_clicks,
      -- Total watch time from 'video_watch_logs' where watched_seconds > 60
      (SELECT COALESCE(SUM(watched_seconds), 0) 
       FROM video_watch_logs 
       WHERE link_id = l.id AND watched_seconds > 60) AS total_watch_time,
      -- Total views (rows) where watched_seconds > 60
      (SELECT COUNT(*) 
       FROM video_watch_logs 
       WHERE link_id = l.id AND watched_seconds > 60) AS total_views
    FROM links l
    WHERE l.promoter_id = ?
    ORDER BY l.id DESC
  `, [promoterId]);

  res.render('Shopkeeper/generateLink', {
    promoterId,
    shortUrl: req.query.shortUrl || null,
    links: links || []
  });
});

router.post('/generate-link',verify.shopAuthenticationToken, async (req, res) => {
  const { originalUrl } = req.body;
  const promoterId = req.session.shopkeeper
  
  const shortCode = nanoid(6);
  await queryAsync('INSERT INTO links (promoter_id, original_url, short_code, created_at) VALUES (?, ?, ?,NOW())', [promoterId, originalUrl, shortCode]);
  // res.json({ shortUrl: `https://filemakr.com/video/${shortCode}` });
res.redirect('/shopkeeper/generateLink')
});





router.get('/stats/:promoterId',verify.shopAuthenticationToken, async (req, res) => {
  const { promoterId } = req.params;
  const [results] = await queryAsync(`
    SELECT l.short_code, l.original_url, COUNT(DISTINCT c.cookie_id) AS unique_clicks
    FROM links l
    LEFT JOIN clicks c ON l.id = c.link_id
    WHERE l.promoter_id = ?
    GROUP BY l.id`, [promoterId]);
  res.json(results);
});

router.get('/', (req, res) => {
    res.render(`${folder}/login`,{msg : ''});
    
})


// router.post('/login',(req,res)=>{
//     let body = req.body;
//     console.log("body",body)
   
//  pool.query(`select * from ${table} where number ='${body.number}' and password = '${body.password}'`,(err,result)=>{
    
//      if(err) throw err;
//      else if(result[0]) {
//          req.session.shopkeeper = result[0].id
//          res.redirect('/shopkeeper/dashboard')
//         }
//      else res.render(`${folder}/login`,{msg : 'Enter Wrong Creaditionals'})
//  })
   
// })


router.post('/login', (req, res) => {
  const body = req.body;
  console.log("body", body);

  pool.query(`SELECT * FROM ${table} WHERE number = ? AND password = ?`, [body.number, body.password], (err, result) => {
    if (err) throw err;

    if (result.length > 0) {
      const user = result[0];
      req.session.shopkeeper = user.id;

      const createdAt = new Date(user.created_at);
      const thresholdDate = new Date('2025-07-17');

      if (createdAt > thresholdDate) {
        res.redirect('/shopkeeper/new-dashboard');
      } else {
        res.redirect('/shopkeeper/dashboard');
      }

    } else {
      res.render(`${folder}/login`, { msg: 'Enter Wrong Credentials' });
    }
  });
});



router.get('/dashboard',verify.shopAuthenticationToken,(req,res)=>{
  let getCurrentWeekDates = dataService.getCurrentWeekDates()

  
  
  const query = `SELECT COUNT(id) AS counter FROM customizeOrder WHERE shopkeeperid = '${req.session.shopkeeper}' AND status = 'success';`;
  const query1 = `SELECT COUNT(id) AS counter FROM customizeOrder WHERE shopkeeperid = '${req.session.shopkeeper}' AND status = 'complete';`;
  const query2 = `SELECT COUNT(id) AS counter FROM customizeOrder WHERE shopkeeperid = '${req.session.shopkeeper}'and status != 'cancel';`;
  const query3 = `SELECT COUNT(id) AS counter FROM customizeOrder WHERE shopkeeperid = '${req.session.shopkeeper}' AND status = 'cancel';`;
  const query4 = `SELECT SUM(amount) * 0.2 AS counter FROM customizeOrder WHERE shopkeeperid = '${req.session.shopkeeper}' AND project_type != 'Source Code' AND status != 'cancel' AND status != 'pending';`;
  const query5 = `SELECT SUM(amount) * 0.2 AS counter FROM customizeOrder WHERE shopkeeperid = '${req.session.shopkeeper}' AND project_type = 'source_code' AND status != 'cancel';`;
  


  const query6  = `SELECT 
    shopkeeper.name, 
    COALESCE(SUM(leaderboard.total_points), 0) AS total_points,
    lc.cycle_name,
    lc.total_amount,
    lc.total_winners,
    lc.start_date,
    lc.end_date
FROM shopkeeper
LEFT JOIN leaderboard 
    ON shopkeeper.id = leaderboard.user_id 
    AND leaderboard.cycle_id IN (
        SELECT id FROM leaderboard_cycles 
        WHERE DATE(CONVERT_TZ(NOW(), 'UTC', 'Asia/Kolkata')) BETWEEN start_date AND end_date
    )
JOIN leaderboard_cycles lc 
    ON DATE(CONVERT_TZ(NOW(), 'UTC', 'Asia/Kolkata')) BETWEEN lc.start_date AND lc.end_date
GROUP BY shopkeeper.id, lc.cycle_name, lc.total_amount, lc.total_winners, lc.start_date, lc.end_date
ORDER BY total_points DESC
LIMIT 8;

`
const query7 = `WITH RankedLeaderboard AS (
    SELECT 
        shopkeeper.id AS user_id,
        shopkeeper.name, 
        COALESCE(SUM(leaderboard.total_points), 0) AS total_points,
        RANK() OVER (ORDER BY COALESCE(SUM(leaderboard.total_points), 0) DESC) AS rank_position
    FROM shopkeeper
    LEFT JOIN leaderboard 
        ON shopkeeper.id = leaderboard.user_id 
        AND leaderboard.cycle_id IN (
            SELECT id FROM leaderboard_cycles 
            WHERE DATE(CONVERT_TZ(NOW(), 'UTC', 'Asia/Kolkata')) BETWEEN start_date AND end_date
        )
    GROUP BY shopkeeper.id
)
SELECT user_id, name, total_points, rank_position 
FROM RankedLeaderboard
WHERE user_id = '${req.session.shopkeeper}';
`

var query8 = `select a.* , (select p.activity_name from points_system p where p.id = a.activity_type) as activity from activities a where a.user_id = '${req.session.shopkeeper}' order by id desc limit 21;`
     

const last_incentives  = `SELECT 
    shopkeeper.name, 
    COALESCE(SUM(leaderboard.total_points), 0) AS total_points,
    lc.cycle_name,
    lc.total_amount,
    lc.total_winners,
    lc.start_date,
    lc.end_date
FROM shopkeeper
LEFT JOIN leaderboard 
    ON shopkeeper.id = leaderboard.user_id 
    AND leaderboard.cycle_id = (
        SELECT id FROM leaderboard_cycles 
        WHERE status = 'closed' 
        ORDER BY id DESC 
        LIMIT 1
    )
JOIN leaderboard_cycles lc 
    ON lc.id = (
        SELECT id FROM leaderboard_cycles 
        WHERE status = 'closed' 
        ORDER BY id DESC 
        LIMIT 1
    )
GROUP BY shopkeeper.id, shopkeeper.name, lc.cycle_name, lc.total_amount, lc.total_winners, lc.start_date, lc.end_date
ORDER BY total_points DESC
LIMIT 8;
`
var upcoming_incentives = `select * from leaderboard_cycles where status = 'upcoming' limit 1;`


const yt_query6 = `SELECT 
    shopkeeper.name, 
    COALESCE(SUM(yt_leaderboard.total_points), 0) AS total_points,
    ylc.cycle_name,
    ylc.total_amount,
    ylc.total_winners,
    ylc.start_date,
    ylc.end_date
FROM shopkeeper
LEFT JOIN youtube_leaderboard AS yt_leaderboard
    ON shopkeeper.id = yt_leaderboard.user_id 
    AND yt_leaderboard.cycle_id IN (
        SELECT id FROM youtube_leaderboard_cycle 
        WHERE DATE(CONVERT_TZ(NOW(), 'UTC', 'Asia/Kolkata')) BETWEEN start_date AND end_date
    )
JOIN youtube_leaderboard_cycle ylc 
    ON DATE(CONVERT_TZ(NOW(), 'UTC', 'Asia/Kolkata')) BETWEEN ylc.start_date AND ylc.end_date
GROUP BY shopkeeper.id, ylc.cycle_name, ylc.total_amount, ylc.total_winners, ylc.start_date, ylc.end_date
ORDER BY total_points DESC
LIMIT 8;`;


const yt_query7 = `WITH RankedYouTubeLeaderboard AS (
    SELECT 
        shopkeeper.id AS user_id,
        shopkeeper.name, 
        COALESCE(SUM(yt_leaderboard.total_points), 0) AS total_points,
        RANK() OVER (ORDER BY COALESCE(SUM(yt_leaderboard.total_points), 0) DESC) AS rank_position
    FROM shopkeeper
    LEFT JOIN youtube_leaderboard AS yt_leaderboard
        ON shopkeeper.id = yt_leaderboard.user_id 
        AND yt_leaderboard.cycle_id IN (
            SELECT id FROM youtube_leaderboard_cycle 
            WHERE DATE(CONVERT_TZ(NOW(), 'UTC', 'Asia/Kolkata')) BETWEEN start_date AND end_date
        )
    GROUP BY shopkeeper.id
)
SELECT user_id, name, total_points, rank_position 
FROM RankedYouTubeLeaderboard
WHERE user_id = '${req.session.shopkeeper}';`;


const yt_last_incentives = `SELECT 
    shopkeeper.name, 
    COALESCE(SUM(yt_leaderboard.total_points), 0) AS total_points,
    ylc.cycle_name,
    ylc.total_amount,
    ylc.total_winners,
    ylc.start_date,
    ylc.end_date
FROM shopkeeper
LEFT JOIN youtube_leaderboard AS yt_leaderboard
    ON shopkeeper.id = yt_leaderboard.user_id 
    AND yt_leaderboard.cycle_id = (
        SELECT id FROM youtube_leaderboard_cycle 
        WHERE status = 'closed' 
        ORDER BY id DESC 
        LIMIT 1
    )
JOIN youtube_leaderboard_cycle ylc 
    ON ylc.id = (
        SELECT id FROM youtube_leaderboard_cycle 
        WHERE status = 'closed' 
        ORDER BY id DESC 
        LIMIT 1
    )
GROUP BY shopkeeper.id, shopkeeper.name, ylc.cycle_name, ylc.total_amount, ylc.total_winners, ylc.start_date, ylc.end_date
ORDER BY total_points DESC
LIMIT 8;`;


const yt_upcoming_incentives = `SELECT * FROM youtube_leaderboard_cycle WHERE status = 'upcoming' LIMIT 1;`;



var other_activities = `select a.* , 
(select p.activity_name from points_system p where p.id = a.activity_type) as activity,
(select s.name from shopkeeper s where s.id = a.user_id) as shopkeeper_name 
from activities a where a.user_id != '${req.session.shopkeeper}' order by id desc limit 5;`


var myupdate = `SELECT 
    COUNT(id) AS total_prizes, 
    COALESCE(SUM(amount), 0) AS total_amount 
FROM prize_distribution 
WHERE user_id = '${req.session.shopkeeper}';`



var streak = `SELECT * 
FROM activities 
WHERE user_id = '${req.session.shopkeeper}' 
  AND activity_type = '2'
  AND status = 'accept'
  AND created_at BETWEEN 
      (SELECT start_date FROM leaderboard_cycles WHERE status = 'active') 
      AND 
      (SELECT end_date FROM leaderboard_cycles WHERE status = 'active');`


      const cycleQuery = `SELECT start_date, end_date FROM leaderboard_cycles WHERE status = 'active';`;



      const getMonthlyLeaderboard = `
  SELECT 
      u.id,
      u.name,

      -- Total Points
      IFNULL(lp.total_points, 0) AS total_points,

      -- Followers Gained
      IFNULL(f.count, 0) AS follower_count,

      -- Google Reviews
      IFNULL(g.count, 0) AS google_reviews,

      -- 30-Day Activity
      IFNULL(s.count, 0) AS activity_streak,

      -- Brand Ambassador Referral
      IFNULL(h.count, 0) AS brand_ambassador_referral,

      -- Eligibility
      CASE WHEN IFNULL(lp.total_points, 0) >= 1 THEN '✅' ELSE '❌' END AS eligible_points,
      CASE WHEN IFNULL(f.count, 0) >= 30 THEN '✅' ELSE '❌' END AS eligible_followers,
      CASE WHEN IFNULL(g.count, 0) >= 30 THEN '✅' ELSE '❌' END AS eligible_reviews,
      CASE WHEN IFNULL(s.count, 0) >= 30 THEN '✅' ELSE '❌' END AS eligible_streak,
      CASE WHEN IFNULL(h.count, 0) >= 2 THEN '✅' ELSE '❌' END AS eligible_brand_ambassador_referral

  FROM shopkeeper u

  LEFT JOIN (
      SELECT user_id, SUM(total_points) AS total_points
      FROM leaderboard
      WHERE 
          MONTH(created_at) = MONTH(CURDATE()) AND
          YEAR(created_at) = YEAR(CURDATE())
      GROUP BY user_id
  ) lp ON lp.user_id = u.id

  LEFT JOIN (
      SELECT user_id, COUNT(id) AS count
      FROM activities
      WHERE 
          activity_type = '13' AND
          status = 'accept' AND
          MONTH(created_at) = MONTH(CURDATE()) AND
          YEAR(created_at) = YEAR(CURDATE())
      GROUP BY user_id
  ) f ON f.user_id = u.id

  LEFT JOIN (
      SELECT user_id, COUNT(id) AS count
      FROM activities
      WHERE 
          activity_type = '9' AND
          status = 'accept' AND
          MONTH(created_at) = MONTH(CURDATE()) AND
          YEAR(created_at) = YEAR(CURDATE())
      GROUP BY user_id
  ) g ON g.user_id = u.id

  LEFT JOIN (
      SELECT user_id, COUNT(id) AS count
      FROM activities
      WHERE 
          activity_type = '12' AND
          status = 'accept' AND
          MONTH(created_at) = MONTH(CURDATE()) AND
          YEAR(created_at) = YEAR(CURDATE())
      GROUP BY user_id
  ) h ON h.user_id = u.id

  LEFT JOIN (
      SELECT user_id, COUNT(DISTINCT DATE(created_at)) AS count
      FROM activities
      WHERE 
          activity_type = '2' AND
          status = 'accept' AND
          MONTH(created_at) = MONTH(CURDATE()) AND
          YEAR(created_at) = YEAR(CURDATE())
      GROUP BY user_id
  ) s ON s.user_id = u.id

  WHERE u.id = '${req.session.shopkeeper}'
  
  ORDER BY total_points DESC;
`;

      

const monthlypoints  = `SELECT 
    u.id,
    u.name,
    SUM(l.total_points) AS total_points
FROM leaderboard l
JOIN shopkeeper u ON u.id = l.user_id
WHERE 
    MONTH(l.created_at) = MONTH(CURDATE()) AND
    YEAR(l.created_at) = YEAR(CURDATE())
GROUP BY l.user_id
ORDER BY total_points DESC;
`;
     

const completeprofile = `select * from shopkeeper where id = '${req.session.shopkeeper}';`

const performanceOverview = `WITH performance_data AS (
    SELECT 
        s.id,
        s.name,
        s.address,
        s.last_update,
        s.created_at,
        s.certificate_issued,
        COUNT(pe.post_id) AS total_post,
        COALESCE(SUM(pe.liked), 0) AS total_like,
        COALESCE(SUM(pe.commented), 0) AS total_comment,
        CASE 
            WHEN COUNT(pe.post_id) = 0 THEN 0
            ELSE (COALESCE(SUM(pe.liked), 0) + COALESCE(SUM(pe.commented), 0)) / (COUNT(pe.post_id) * 2.0)
        END AS engagement_ratio
    FROM 
        shopkeeper s
    LEFT JOIN 
        post_engagement pe ON pe.ambassador_id = s.id
        WHERE 
        s.id = '${req.session.shopkeeper}'
    GROUP BY 
        s.id, s.name, s.address
)

SELECT 
    pd.*,
    ROUND(pd.engagement_ratio * 100) AS performance_score,       -- Out of 100
    ROUND(pd.engagement_ratio * 5) AS rating_star                -- Out of 5
FROM 
    performance_data pd
ORDER BY 
    performance_score DESC;`

     pool.query(query+query1+query2+query3+query4+query5+query6+query7+query8+last_incentives+upcoming_incentives+other_activities+myupdate+streak+cycleQuery+getMonthlyLeaderboard+monthlypoints+completeprofile+performanceOverview+yt_query6+yt_query7+yt_last_incentives+yt_upcoming_incentives,(err,result)=>{
      if(err) throw err;
      else{

        console.log('sta',result[14])
        console.log('end',result[14][0].end_date)



        let streak = Array(10).fill(0);
        let loginDates = result[13].map(row => row.created_at);

      
        for (let i = 0; i < 10; i++) {
            let currentDate = new Date(result[14][0].start_date);
            currentDate.setDate(currentDate.getDate() + i);

            let formattedDate = currentDate.toISOString().split("T")[0];
            if (loginDates.includes(formattedDate)) {
                streak[i] = 1;
            }
        }
         res.render(`${folder}/dashboard`,{result,streak});
        // res.json({result: result[21] });


      }
     
      // else res.json(result[9])
     })
    
})



const moment = require('moment');

router.get('/new-dashboard', verify.shopAuthenticationToken, (req, res) => {
  const userId = req.session.shopkeeper;




  const currentDayQuery = `
    SELECT COUNT(*) AS currentDay 
    FROM internship_day 
    WHERE brand_ambassador_id = ? AND status = 'verified';
  `;

  const taskQuery = `
    SELECT * FROM task 
    WHERE DATE(created_at) = CURDATE();
  `;

       const winnerQuery = `
    SELECT hcc.id, hcc.amount, hcc.created_at,
           s.name AS ambassador_name, s.number
    FROM hustle_challenge_completion hcc
    JOIN shopkeeper s ON hcc.brand_ambassador_id = s.id
    WHERE hcc.status = 'verified'
    ORDER BY hcc.id DESC
    LIMIT 20;
  `;

  const profileQuery = `SELECT * FROM shopkeeper WHERE id = ?;`;

  pool.query(currentDayQuery, [userId], (err, dayResult) => {
    if (err) throw err;
    const currentDay = dayResult[0].currentDay;

    pool.query(taskQuery, (err, tasks) => {
      if (err) throw err;

      const dailyTaskData = tasks.find(task => task.task_type === 'daily');
      const hustleTaskData = tasks.find(task => task.task_type === 'hustle');

      

      // No tasks today
      if (!dailyTaskData && !hustleTaskData) {
        console.log('run without task here')
    pool.query(winnerQuery, (err, results) => {
      if (err) throw err;

      const winners = results.map(row => ({
        ...row,
        formattedDate: moment(row.created_at).format('MMMM D, YYYY')
      }));

      return res.render(`${folder}/newdashboard`, {
        result: [],
        currentDay,
        dailyTask: null,
        hustleTask: null,
        winners: winners,
        userId:userId
      });
    });

    return; // ✅ Prevent falling through
  }



      const dailyTaskId = dailyTaskData?.id;
      const hustleTaskId = hustleTaskData?.id;
      let dailyTask = null; // ✅ Move to outer scope
let hustleTask = null;


      const internshipDayQuery = `
        SELECT * FROM internship_day 
        WHERE brand_ambassador_id = ? 
        AND task_id = ?;
      `;

      const hustleCheckQuery = `
        SELECT * FROM hustle_challenge_completion 
        WHERE task_id = ? AND status !='rejected' LIMIT 1;
      `;

      const hustleSelfProofQuery = `
        SELECT * FROM hustle_challenge_completion 
        WHERE task_id = ? and brand_ambassador_id = ? LIMIT 1;
      `;

 

      pool.query(internshipDayQuery, [userId, dailyTaskId || 0], (err, dailyProofResult) => {
        if (err) throw err;

        const dailyProof = dailyProofResult[0] || {};

          if (dailyTaskData) {
    dailyTask = {
      id: dailyTaskData.id,
      date: moment(dailyTaskData.created_at).format('MMMM D, YYYY'),
      description: dailyTaskData.description,
      proofUploaded: !!dailyProof.id,
      proofLink: dailyProof.proofLink || '',
      proofStatus: dailyProof.status || '',
      reason: dailyProof.reason || ''
    };
  }


       if (!hustleTaskId) {
  // No hustle task today
  return finalizeRender(dailyTask, null);
}

        // Check if hustle challenge is already accepted
        pool.query(hustleCheckQuery, [hustleTaskId], (err, acceptedRow) => {
          if (err) throw err;

          const isHustleClosed = acceptedRow.length > 0;

          // Check if this user already submitted
          pool.query(hustleSelfProofQuery, [hustleTaskId,userId], (err, selfProof) => {
            if (err) throw err;



              const proof = selfProof[0] || {};



  if (hustleTaskData) {
        hustleTask = {
          id: hustleTaskData.id,
          date: moment(hustleTaskData.created_at).format('MMMM D, YYYY'),
          description: hustleTaskData.description,
          isClosed: isHustleClosed,
          proofUploaded: !!proof.id,
          proofLink: proof.proofLink || '',
          proofStatus: proof.status || '',
          reason: proof.reason || ''
        };
      }





            finalizeRender(dailyTask, hustleTask);
            
          });
        });

        function finalizeRender(dailyTask = null, hustleTask = null) {
          console.log('here daily task ni aaya', dailyTask);
          pool.query(profileQuery, [userId], (err, profileResult) => {
            if (err) throw err;

      pool.query(winnerQuery, (err, results) => {
        if (err) throw err;

        const winners = results.map(row => ({
          ...row,
          formattedDate: moment(row.created_at).format('MMMM D, YYYY')
        }));


            res.render(`${folder}/newdashboard`, {
              result: profileResult,
              currentDay,
              dailyTask,
              hustleTask,
              winners,
              userId:userId
            });

            // res.json(dailyTask)
          });
              });
        }
  
    })
    });
  });
});










const isAuthenticated = (req, res, next) => {
  if (req.session.shopkeeper) return next();
  return res.status(401).json({ message: 'Unauthorized' });
};

router.post("/submit-daily-task", isAuthenticated, async (req, res) => {
  try {
    const { taskId, proofUrl } = req.body;
    const userId = req.session.shopkeeper;

    if (!proofUrl || !taskId) {
      return res.status(400).json({ message: "Missing task ID or proof URL" });
    }

    // Insert or update task proof
    const existing = await queryAsync(
      "SELECT id FROM internship_day WHERE task_id = ? AND brand_ambassador_id = ?",
      [taskId, userId]
    );

    if (existing.length > 0) {
      // Update existing proof
      await queryAsync(
        "UPDATE internship_day SET proofLink = ?, status = 'pending', created_at = NOW() WHERE task_id = ? AND brand_ambassador_id = ?",
        [proofUrl, taskId, userId]
      );
    } else {
      // Insert new proof
      await queryAsync(
        "INSERT INTO internship_day (task_id, brand_ambassador_id, proofLink, status, created_at) VALUES (?, ?, ?, 'pending', NOW())",
        [taskId, userId, proofUrl]
      );
    }

    return res.redirect('/shopkeeper/new-dashboard');
  } catch (err) {
    console.error("Error submitting proof:", err);
    return res.status(500).json({ message: "Server error. Please try again later." });
  }
});



router.post("/submit-hustle-task", isAuthenticated, async (req, res) => {
  try {
    const { taskId, proofUrl } = req.body;
    const userId = req.session.shopkeeper;

    if (!proofUrl || !taskId) {
      return res.status(400).json({ message: "Missing task ID or proof URL" });
    }

    // Insert or update task proof
    const existing = await queryAsync(
      "SELECT id FROM hustle_challenge_completion WHERE task_id = ? AND brand_ambassador_id = ?",
      [taskId, userId]
    );

    if (existing.length > 0) {
      // Update existing proof
      await queryAsync(
        "UPDATE hustle_challenge_completion SET proofLink = ?, status = 'pending', created_at = NOW() WHERE task_id = ? AND brand_ambassador_id = ?",
        [proofUrl, taskId, userId]
      );
    } else {
      // Insert new proof
      await queryAsync(
        "INSERT INTO hustle_challenge_completion (task_id, brand_ambassador_id, proofLink, status, created_at) VALUES (?, ?, ?, 'pending', NOW())",
        [taskId, userId, proofUrl]
      );
    }

    return res.redirect('/shopkeeper/new-dashboard');
  } catch (err) {
    console.error("Error submitting proof:", err);
    return res.status(500).json({ message: "Server error. Please try again later." });
  }
});



// router.post("/submit-hustle-task", isAuthenticated, async (req, res) => {
//   try {
//     const { taskId, proofUrl } = req.body;
//     const userId = req.session.shopkeeper;

//     if (!proofUrl || !taskId) {
//       return res.status(400).json({ message: "Missing task ID or proof URL" });
//     }

//     // Insert or update task proof
//     const existing = await queryAsync(
//       "SELECT id FROM hustle_task_proofs WHERE task_id = ? AND user_id = ?",
//       [taskId, userId]
//     );

//     if (existing.length > 0) {
//       // Update existing proof
//       await queryAsync(
//         "UPDATE hustle_task_proofs SET proof_url = ?, status = 'pending', updated_at = NOW() WHERE task_id = ? AND user_id = ?",
//         [proofUrl, taskId, userId]
//       );
//     } else {
//       // Insert new proof
//       await queryAsync(
//         "INSERT INTO hustle_task_proofs (task_id, user_id, proof_url, status, submitted_at) VALUES (?, ?, ?, 'pending', NOW())",
//         [taskId, userId, proofUrl]
//       );
//     }

//     return res.json({ message: "Proof submitted successfully." });
//   } catch (err) {
//     console.error("Error submitting proof:", err);
//     return res.status(500).json({ message: "Server error. Please try again later." });
//   }
// });









router.get('/dashboard/performance', async (req, res) => {
  const ambassadorId = req.session.shopkeeper;

  try {
    // Overall performance
    const performanceQuery = `
      WITH performance_data AS (
        SELECT 
            s.id,
            s.name,
            s.address,
            s.last_update,
            s.created_at,
            s.certificate_issued,
            COUNT(pe.post_id) AS total_post,
            COALESCE(SUM(pe.liked), 0) AS total_like,
            COALESCE(SUM(pe.commented), 0) AS total_comment,
            CASE 
                WHEN COUNT(pe.post_id) = 0 THEN 0
                ELSE (COALESCE(SUM(pe.liked), 0) + COALESCE(SUM(pe.commented), 0)) / (COUNT(pe.post_id) * 2.0)
            END AS engagement_ratio
        FROM 
            shopkeeper s
        LEFT JOIN 
            post_engagement pe ON pe.ambassador_id = s.id
        WHERE 
            s.id = ?
        GROUP BY 
            s.id, s.name, s.address
      )
      SELECT 
          pd.*,
          ROUND(pd.engagement_ratio * 100) AS performance_score,
          ROUND(pd.engagement_ratio * 5) AS rating_star
      FROM 
          performance_data pd
      ORDER BY 
          performance_score DESC;
    `;

    // Individual post engagement list
    const engagementListQuery = `
      SELECT 
        pe.post_id,
        pe.liked,
        pe.commented,
        p.platform,
        p.link
      FROM 
        post_engagement pe
      INNER JOIN 
        post p ON p.id = pe.post_id
      WHERE 
        pe.ambassador_id = ?
      ORDER BY p.id DESC;
    `;

    const [performanceResult, engagementList] = await Promise.all([
      queryAsync(performanceQuery, [ambassadorId]),
      queryAsync(engagementListQuery, [ambassadorId])
    ]);

    const performance = performanceResult[0]; // Only one row

    res.render(`${folder}/performance`, {
      performance,
      engagementList
    });
  } catch (err) {
    console.error("Performance Overview Error:", err);
    res.status(500).send("Failed to load performance overview");
  }
});




// router.get('/dashboard/list/:type/:status',(req,res)=>{
//   if(req.params.status == 'all'){
//     pool.query(`select * from ${req.params.type}`,(err,result)=>{
//       if(err) throw err;
//       else res.render(`${folder}/list`,{result,status:req.params.status})
//   })
//   }
//   else{
//     pool.query(`select * from ${req.params.type} where status = '${req.params.status}'`,(err,result)=>{
//       if(err) throw err;
//       else res.render(`${folder}/list`,{result,status:req.params.status})
//   })
//   } 
// })

router.get('/dashboard/list/:type/:status', async (req, res) => {
  try {
    const { type, status } = req.params;
    console.log(req.params)
    let query = `SELECT * FROM ${type}`;
    if (status !== 'all') {
      query = `SELECT * FROM ${type} WHERE status = ?`;
    }
    const result = await queryAsync(query, [status]);
    if(type=='blogs'){
      res.render(`${folder}/bloglist`, { result, status });

    }
    else{
      res.render(`${folder}/list`, { result, status });

    }
  } catch (error) {
    console.error('Error executing query:', error);
    res.status(500).send('Internal Server Error');
  }
 });


router.get('/dashboard/add/source-code',(req,res)=>{
    res.render(`${folder}/add_source_code`,{msg:''})
})


router.get('/dashboard/add/blogs',(req,res)=>{
  res.render(`${folder}/add_blogs`,{msg:''})
})



router.get('/dashboard/update/screenshots',(req,res)=>{
   let id = req.query.id;
   res.render(`${folder}/uploadScreenshot`,{id})
})


router.get('/dashboard/update/image',(req,res)=>{
  let id = req.query.id;
  res.render(`${folder}/image`,{id})
})


router.get('/dashboard/update/blogs/image',(req,res)=>{
  let id = req.query.id;
  res.render(`${folder}/blogimage`,{id})
})


router.get('/dashboard/update/data',(req,res)=>{
  let id = req.query.id;
  pool.query(`select * from source_code where id = ${id}`,(err,result)=>{
    if(err) throw err;
    else res.render(`${folder}/updatedata`,{result})
  })
  
})



router.get('/dashboard/update/blogs/data',(req,res)=>{
  let id = req.query.id;
  pool.query(`select * from blogs where id = ${id}`,(err,result)=>{
    if(err) throw err;
    else res.render(`${folder}/updatedatablogs`,{result})
  })
  
})


// router.post('/dashboard/source_code/add',(req,res)=>{
//   let body = req.body;
//   pool.query(`select id from source_code where seo_name = '${body.seo_name}'`,(err,result)=>{
//     if(err) throw err;
//     else if(result[0]){
//       res.json({msg:'exists'})
//     }
//     else{
//       pool.query(`insert into source_code set ?`,body,(err,result)=>{
//         if(err) throw err;
//         else res.json({msg:'success'})
//       })
//     }
//   })
  
// })


router.post('/dashboard/source_code/add',upload.single('source_code'), async (req, res) => {


  try {
      const { seo_name } = req.body;
      req.body['source_code'] = req.file.filename;

      // Check if seo_name already exists
      const existingRecord = await queryAsync('SELECT id FROM source_code WHERE seo_name = ?', [seo_name]);

      if (existingRecord.length > 0) {
          return res.json({ msg: 'exists' });
      }

      // Insert new record
      const insertResult = await queryAsync('INSERT INTO source_code SET ?', req.body);

      if (insertResult.affectedRows > 0) {
          res.json({ msg: 'success' });
      } else {
          res.json({ msg: 'error' });
      }
  } catch (error) {
      console.error('Error in source_code/add:', error);
      res.status(500).json({ msg: 'error' });
  }
});



router.post('/dashboard/blogs/add',upload.single('image'), async (req, res) => {


  try {
      const { seo_name } = req.body;
      req.body['image'] = req.file.filename;

      // Check if seo_name already exists
      const existingRecord = await queryAsync('SELECT id FROM blogs WHERE seo_name = ?', [seo_name]);

      if (existingRecord.length > 0) {
          return res.json({ msg: 'exists' });
      }

      // Insert new record
      const insertResult = await queryAsync('INSERT INTO blogs SET ?', req.body);

      if (insertResult.affectedRows > 0) {
          res.json({ msg: 'success' });
      } else {
          res.json({ msg: 'error' });
      }
  } catch (error) {
      console.error('Error in blogs/add:', error);
      res.status(500).json({ msg: 'error' });
  }
});



router.post('/dashboard/upload/data', (req, res) => {
  console.log('req.body', req.body);
  pool.query('UPDATE source_code SET ? WHERE id = ?', [req.body, req.body.id], (err, result) => {
      if (err) {
          console.error('Error updating data:', err);
          return res.status(500).json({ msg: 'error' });
      }
      res.json({ msg: 'success' });
  });
});


router.post('/dashboard/upload/blogs/data', (req, res) => {
  console.log('req.body', req.body);
  pool.query('UPDATE blogs SET ? WHERE id = ?', [req.body, req.body.id], (err, result) => {
      if (err) {
          console.error('Error updating data:', err);
          return res.status(500).json({ msg: 'error' });
      }
      res.json({ msg: 'success' });
  });
});



// router.post('/dashboard/upload/screenshots', (req, res) => {
//   const { url, source_code_id } = req.body;
//   // Assuming 'screenshots' is the table name
//   const insertQuery = 'INSERT INTO screenshots (url, source_code_id) VALUES ?';
//   // Map the 'url' array to match the structure expected by MySQL
//   const screenshotsValues = url.map((screenshot) => [screenshot.url, source_code_id]);
//   pool.query(insertQuery, [screenshotsValues], (err, result) => {
//     if (err) {
//       console.error('Error inserting data into MySQL:', err);
//       res.status(500).json({ msg: 'error' });
//     } else {
//       console.log('Data inserted successfully into MySQL:', result);
//       console.log(source_code_id)
//       pool.query(`update source_code set status = 'progress' , updated_user_id = '${req.session.affiliation}'  where id = '${source_code_id}' `,(err,result)=>{
//         if(err) throw err;
//         else {
//           console.log('done')
//           res.json({ msg: 'success' });
//         }
//       })
//     }
//   });
//  });


router.post('/dashboard/upload/screenshots', async (req, res) => {
  try {
    const { url, source_code_id } = req.body;
    // Assuming 'screenshots' is the table name
    const insertQuery = 'INSERT INTO screenshots (url, source_code_id) VALUES ?';
    // Map the 'url' array to match the structure expected by MySQL
    const screenshotsValues = url.map((screenshot) => [screenshot.url, source_code_id]);
    // Execute the insert query with parameterized values
    await queryAsync(insertQuery, [screenshotsValues]);
    console.log('Screenshots inserted successfully into MySQL');
    console.log(source_code_id);
    // Update source_code status and updated_user_id
    await queryAsync(`UPDATE source_code SET status = 'progress', updated_user_id = ? WHERE id = ?`, [req.session.affiliation, source_code_id]);
    console.log('Source code updated successfully');
    res.json({ msg: 'success' });
  } catch (error) {
    console.error('Error inserting data into MySQL:', error);
    res.status(500).json({ msg: 'error' });
  }
 });

//  router.post('/dashboard/upload/image', (req, res) => {
//   const { url, source_code_id } = req.body;

//   console.log('url',url[0].url)
//   // Assuming 'screenshots' is the table name
//   const insertQuery = `update source_code set image = '${url[0].url}' where id = '${source_code_id}'`;
//   // Map the 'url' array to match the structure expected by MySQL
//   pool.query(insertQuery, (err, result) => {
//     if (err) {
//       console.error('Error inserting data into MySQL:', err);
//       res.status(500).json({ msg: 'error' });
//     } else {
//       console.log('Data inserted successfully into MySQL:', result);
//       console.log(source_code_id)
//       res.json({ msg: 'success' });
     
//     }
//   });
//  });



router.post('/dashboard/upload/image', async (req, res) => {
  try {
    const { url, source_code_id } = req.body;
    console.log(req.body)
    // Assuming 'screenshots' is the table name
    const insertQuery = `UPDATE source_code SET image = ? WHERE id = ?`;
    // Execute the query with parameters
    await queryAsync(insertQuery, [url[0].url, source_code_id]);
    console.log('Data inserted successfully into MySQL');
    console.log(source_code_id);
    res.json({ msg: 'success' });
  } catch (error) {
    console.error('Error inserting data into MySQL:', error);
    res.status(500).json({ msg: 'error' });
  }
 });




 router.post('/dashboard/upload/blogs/image', async (req, res) => {
  try {
    const { url, source_code_id } = req.body;
    console.log(req.body)
    // Assuming 'screenshots' is the table name
    const insertQuery = `UPDATE blogs SET image = ? WHERE id = ?`;
    // Execute the query with parameters
    await queryAsync(insertQuery, [url[0].url, source_code_id]);
    console.log('Data inserted successfully into MySQL');
    console.log(source_code_id);
    res.json({ msg: 'success' });
  } catch (error) {
    console.error('Error inserting data into MySQL:', error);
    res.status(500).json({ msg: 'error' });
  }
 });




router.get('/dashboard/category/show',(req,res)=>{
  pool.query(`select * from category order by name`,(err,result)=>{
    if(err) throw err;
    else res.json(result)
  })
})
 

router.get('/add-project',(req,res)=>{
    pool.query(`select * from ${table1}`,(err,result)=>{
        if(err) throw err;
        else res.render('AddProject/add-project' , {result})
    })
    
})








router.post('/add-project/insert',upload.single('zip'),(req,res)=> {
                                         let body = req.body;  
                                         var dirt = false
                                         var seo_variable = (body.name.split(' ').join('-')).toLowerCase()
                                         body['source_code'] = req.file.filename
                                         body['seo_name'] = seo_variable 
                                         pool.query(`insert into ${table1} set ?`,body,(err,result)=>err ? console.log(err) : res.json(result))

});




router.get('/project-delete', (req, res) => pool.query(`delete from ${table1} where id = ${req.query.id}`, (err, result) => err ? console.log(err) : res.json(result)))



router.get('/dashboard/delete/blogs', (req, res) => pool.query(`delete from blogs where id = ${req.query.id}`, (err, result) => err ? console.log(err) : res.redirect('/affiliate/dashboard/list/blogs/all')))



router.get('/dashboard/reimbursement/list/:status',(req,res)=>{
    pool.query(`select * from reimbursement where status = '${req.params.status}' and shopkeeperid = '${req.session.shopkeeper}' order by id desc`,(err,result)=>{
      if(err) throw err;
      else res.render(`${folder}/reimbursementReport`,{result,status:req.params.status})
      // else res.json(result)
    })
})


router.get('/dashboard/contact/notinterested',(req,res)=>{
  pool.query(`update contactus set status = 'not_interested' where id = '${req.query.id}'`,(err,result)=>{
    if(err) throw err;
    else res.redirect('/affiliate/dashboard/contact/list/pending')
    // else res.json(result)
  })
})

router.get('/dashboard/contact/interested',(req,res)=>{
  pool.query(`update contactus set status = 'interested' where id = '${req.query.id}'`,(err,result)=>{
    if(err) throw err;
    else res.redirect('/affiliate/dashboard/contact/list/pending')
    // else res.json(result)
  })
})




router.get('/dashboard/demo/request/status/notinterested',(req,res)=>{
  pool.query(`update requestDemo set status = 'not_interested' where id = '${req.query.id}'`,(err,result)=>{
    if(err) throw err;
    else res.redirect('/affiliate/dashboard/demo/request/pending')
    // else res.json(result)
  })
})

router.get('/dashboard/demo/request/status/interested',(req,res)=>{
  pool.query(`update requestDemo set status = 'interested' where id = '${req.query.id}'`,(err,result)=>{
    if(err) throw err;
    else res.redirect('/affiliate/dashboard/demo/request/pending')
    // else res.json(result)
  })
})


router.post('/dashboard/mergedata',(req,res)=>{
  console.log('req.body',req.body)

  if(req.body.foldername == 'payment_request' || req.body.foldername == 'payment_response' ){
    pool.query(`DELETE t1
      FROM ${req.body.foldername} t1
      JOIN ${req.body.foldername} t2 
      ON t1.billing_email = t2.billing_email 
      AND t1.id < t2.id;`,(err,result)=>{
       if(err) throw err;
       else res.json({msg:'success'})
      })
  }
  else{
    pool.query(`DELETE t1
      FROM ${req.body.foldername} t1
      JOIN ${req.body.foldername} t2 
      ON t1.email = t2.email 
      AND t1.id < t2.id;`,(err,result)=>{
       if(err) throw err;
       else res.json({msg:'success'})
      })
  }


})


router.get('/dashboard/earning/request/:status',(req,res)=>{

    if(req.params.status == 'project_report'){
        pool.query(`select * from customizeOrder where project_type != 'source_code' and shopkeeperid = '${req.session.shopkeeper}' AND status != 'cancel'  order by id desc`,(err,projectDetails)=>{
            if(err) throw err;
            else res.render(`${folder}/earningReport`,{projectDetails,status:req.params.status})
            // else res.json(result)
          })
    }
    else{
        pool.query(`select * from customizeOrder where project_type = '${req.params.status}' and shopkeeperid = '${req.session.shopkeeper}' AND status != 'cancel' order by id desc`,(err,projectDetails)=>{
            if(err) throw err;
            else res.render(`${folder}/earningReport`,{projectDetails,status:req.params.status})
            // else res.json(result)
          })
    }


})



router.get('/dashboard/profile',(req,res)=>{
  pool.query(`select * from shopkeeper where id = '${req.session.shopkeeper}'`,(err,result)=>{
    if(err) throw err;
    else res.render(`${folder}/profile`,{result})
    // else res.json(result)
  })
})



router.get('/dashboard/payment/response/:status',(req,res)=>{

  if(req.params.status == 'success'){
    pool.query(`select 
      prs.*,
      (select prq.billing_name from payment_request prq where prq.order_id = prs.order_id) as name,
      (select prq.billing_email from payment_request prq where prq.order_id = prs.order_id) as email, 
      (select prq.billing_tel from payment_request prq where prq.order_id = prs.order_id) as number,
      (select prq.seo_name from payment_request prq where prq.order_id = prs.order_id) as project_name,
      (select prq.type from payment_request prq where prq.order_id = prs.order_id) as project_type

      from payment_response prs where prs.order_status = '${req.params.status}'  order by prs.id desc`,(err,projectDetails)=>{
      if(err) throw err;
      else res.render(`${folder}/payment_response`,{projectDetails,status:req.params.status})
      // else res.json(result)
    })
  }
 else if(req.params.status == 'pending' || req.params.status == 'not_interested'){
  pool.query(`select 
      prs.*,
      (select prq.billing_name from payment_request prq where prq.order_id = prs.order_id) as name,
      (select prq.billing_email from payment_request prq where prq.order_id = prs.order_id) as email, 
      (select prq.billing_tel from payment_request prq where prq.order_id = prs.order_id) as number,
      (select prq.seo_name from payment_request prq where prq.order_id = prs.order_id) as project_name,
      (select prq.type from payment_request prq where prq.order_id = prs.order_id) as project_type

      from payment_response prs where prs.status = '${req.params.status}' order by prs.id desc`,(err,projectDetails)=>{
    if(err) throw err;
    else res.render(`${folder}/payment_response`,{projectDetails,status:req.params.status})
    // else res.json(result)
  })
 }
  else{
    pool.query(`SELECT 
      prs.*,
      (SELECT prq.billing_name FROM payment_request prq WHERE prq.order_id = prs.order_id) AS name,
      (SELECT prq.billing_email FROM payment_request prq WHERE prq.order_id = prs.order_id) AS email, 
      (SELECT prq.billing_tel FROM payment_request prq WHERE prq.order_id = prs.order_id) AS number,
      (SELECT prq.seo_name FROM payment_request prq WHERE prq.order_id = prs.order_id) AS project_name,
      (SELECT prq.type FROM payment_request prq WHERE prq.order_id = prs.order_id) AS project_type
FROM 
      payment_response prs 
WHERE 
      prs.order_status != 'success' and prs.status is null 
      ORDER BY 
      prs.id DESC;
`,(err,projectDetails)=>{
      if(err) throw err;
       else res.render(`${folder}/payment_response`,{projectDetails,status:req.params.status})
      // else res.json(projectDetails)
    })
  }

  
})


router.get('/dashboard/demo/request/:type',(req,res)=>{
  pool.query(`select r.* ,(select s.name from source_code s where s.id = r.source_code_id) as source_code from requestDemo r where status = '${req.params.type}' order by id desc`,(err,result)=>{
    if(err) throw err;
    else res.render(`${folder}/requestDemo`,{result,type:req.params.type})
    // else res.json(result)
  })
})

router.get('/dashboard/demorequest/update/status',(req,res)=>{
  pool.query(`update requestDemo set status = 'complete' where id = '${req.query.id}'`,(err,result)=>{
    if(err) throw err;
    else res.redirect('/affiliate/dashboard/demo/request/booked')
    // else res.json(result)
  })
})





router.post('/dashboard/sent/mail', async (req, res) => {
  try {
    const { id, date, time } = req.body;

    // Query the database to fetch data and update status
    const query = `SELECT r.*, (SELECT s.name FROM source_code s WHERE s.id = r.source_code_id) AS source_code_name FROM requestDemo r WHERE r.id = '${id}' ORDER BY r.id DESC LIMIT 1`;

    pool.query(query, async (err, result) => {
      if (err) {
        console.error('Error querying the database:', err);
        return res.status(500).json({ success: false, message: 'Failed to query the database.' });
      }

      if (!result || !result.length) {
        return res.status(404).json({ success: false, message: 'Data not found.' });
      }

      // Assuming dataService.sendIndividuallyMail is an asynchronous function
      await dataService.sendInviduallyMail({ result: result, Mydate: date, Mytime: time });

      // Update status and booking date/time
      const updateQuery = `UPDATE requestDemo SET status = 'booked', book_date = '${date}', book_time = '${time}' WHERE id = '${id}'`;

      pool.query(updateQuery, (updateErr, updateResult) => {
        if (updateErr) {
          console.error('Error updating database:', updateErr);
          return res.status(500).json({ success: false, message: 'Failed to update database.' });
        }

        res.json({ msg: 'success' });
      });
    });
  } catch (error) {
    console.error('Error sending business emails:', error);
    res.status(500).json({ success: false, message: 'Failed to send business emails.' });
  }
});




router.get('/sent', async (req, res) => {
  try {
    await sendBusinessEmails('Reminder: Scheduled Demo Session for Full Project Presentation','')
    res.json({ success: true, message: 'Business emails sent successfully.' });
  } catch (error) {
    console.error('Error sending business emails:', error);
    res.status(500).json({ success: false, message: 'Failed to send business emails.' });
  }
});






router.post('/add-project/insert',upload.single('zip'),(req,res)=> {
  let body = req.body;  
  var dirt = false
  var seo_variable = (body.name.split(' ').join('-')).toLowerCase()
  body['source_code'] = req.file.filename
  body['seo_name'] = seo_variable 
  pool.query(`insert into ${table1} set ?`,body,(err,result)=>err ? console.log(err) : res.json(result))

});


// router.get('/update-counter',(req,res)=>{
//   pool.query(`UPDATE source_code
//   SET counter = FLOOR(RAND() * (1000 - 100 + 1)) + 100;`,(err,result)=>{
//     if(err) throw err;
//     else res.json(result)
//    })
// })


// router.get('/dashboard/project/report/:status',(req,res)=>{
//   pool.query(`select name , frontend , backend from btech_project where status = '${req.params.status}' order by id desc limit 10`,(err,result)=>{
//     if(err) throw err;
//     else {
     
// res.json(result)
//       // res.render(`${folder}/projectReport`,{result,status:req.params.status})
//     } 
//   })
// })




router.get('/dashboard/order/report/:status', async (req, res) => {
  try {
    // Query to get the btech_project with the specified status
    const projectDetails = await queryAsync(`SELECT * FROM customizeOrder WHERE shopkeeperid = '${req.session.shopkeeper}' and status = '${req.params.status}' ORDER BY id DESC`);

   
    res.render(`${folder}/orderReport`,{projectDetails,status:req.params.status});
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
});



router.post('/dashboard/project/report/updateStatus',(req,res)=>{
  pool.query(`update btech_project set status = '${req.body.status}' where id = '${req.body.id}'`,(err,result)=>{
    if(err) throw err;
    else res.json({msg:'success'})
  })
})


router.post('/dashboard/payment/request/updateStatus',(req,res)=>{
  pool.query(`update payment_request set status = '${req.body.status}' where id = '${req.body.id}'`,(err,result)=>{
    if(err) throw err;
    else res.json({msg:'success'})
  })
})


router.post('/dashboard/payment/response/updateStatus',(req,res)=>{
  pool.query(`update payment_response set status = '${req.body.status}' where order_id = '${req.body.id}'`,(err,result)=>{
    if(err) throw err;
    else res.json({msg:'success'})
  })
})



router.get('/dashboard/project/report/send/reminder', async(req,res)=>{
  console.log(req.query)
  const userSubject1 = emailTemplates.beforprojectreport.userSubject.replace('{{Project_Name}}', req.query.project_name);
  const userMessage1 = emailTemplates.beforprojectreport.userMessage(req.query.name,req.query.project_name,req.query.roll_number);
  await verify.sendUserMail(req.query.email,userSubject1,userMessage1);

   await verify.sendWhatsAppMessage(
    +91 + req.query.number,
    'project_report_reminder', // Template name
    'en_US', // Language code
    [req.query.name.toUpperCase(), req.query.project_name], // Body parameters
    [req.query.roll_number] // Button parameters
);


pool.query(`update btech_project set status = 'reminder_sent' where id = '${req.query.id}'`,(err,result)=>{
  if(err) throw err;
  else {
    res.json({msg:'success'})
  }
})


})





router.get('/dashboard/payment/request/send/reminder', async(req,res)=>{
  console.log(req.query)
  const userSubject1 = emailTemplates.beforesourcecode.userSubject.replace('{{Project_Name}}', req.query.project_name);
  const userMessage1 = emailTemplates.beforesourcecode.userMessage(req.query.name,req.query.project_name,req.query.seo_name);
  await verify.sendUserMail(req.query.email,userSubject1,userMessage1);

   await verify.sendWhatsAppMessage(
    +91 + req.query.number,
    'source_code_reminder', // Template name
    'en_US', // Language code
    [req.query.name.toUpperCase(), req.query.project_name], // Body parameters
    [req.query.seo_name+'/source-code'] // Button parameters
);


pool.query(`update payment_request set status = 'reminder_sent' where id = '${req.query.id}'`,(err,result)=>{
  if(err) throw err;
  else {
    res.json({msg:'success'})
  }
})


})



router.get('/dashboard/project/report/send/rating', async(req,res)=>{
  console.log(req.query)
             await verify.sendWhatsAppMessage(
                +91 + req.query.number,
                'reviewtempelate', // Template name
                'en_US', // Language code
                [req.query.name.toUpperCase(),req.query.project_name+' Project Report '] // Body parameters
            );

            pool.query(`update btech_project set israting = 'send' where id = '${req.query.id}'`,(err,result)=>{
              if(err) throw err;
              else {
                res.json({msg:'success'})
              }
            })

  
})



router.get('/dashboard/payment/request/send/rating', async(req,res)=>{
  console.log(req.query)
             await verify.sendWhatsAppMessage(
                +91 + req.query.number,
                'reviewtempelate', // Template name
                'en_US', // Language code
                [req.query.name.toUpperCase(),req.query.project_name+' Source Code '] // Body parameters
            );

            pool.query(`update payment_request set israting = 'send' where id = '${req.query.id}'`,(err,result)=>{
              if(err) throw err;
              else {
                res.json({msg:'success'})
              }
            })

  
})



router.get('/create/order',async(req,res)=>{
    var query = `select * from shopkeeper where unique_code = '${req.query.unique_code}';`
    var query1 = `select name,id,type from programming_language where type = 'backend[]';`
    var query2 = `select name,id,type from programming_language where type = 'frontend[]';`
    pool.query(query+query1+query2,async(err,result)=>{
        if(err) throw err;
        else {


           

            res.render(`${folder}/create_order`,{result,unique_code:req.query.unique_code})


        }
    })
})



router.get('/mastercategory/details',(req,res)=>{
   var query = `select * from masterCategory where name = '${req.query.project_type}' order by id limit 1;`
   var query1 = `select * from includes where masterCategoryid = (select id from masterCategory where name = '${req.query.project_type}' order by id limit 1);`
   pool.query(query+query1,(err,result)=>{
    if(err) throw err;
    else res.json(result)
   })
})

var today = new Date();
var dd = String(today.getDate()).padStart(2, '0');
var mm = String(today.getMonth() + 1).padStart(2, '0'); //January is 0!
var yyyy = today.getFullYear();

today = yyyy + '-' + mm + '-' + dd;


router.post('/technical/order/insert', upload.single('references'), async (req, res) => {
  let body = req.body;

  // Check if a file was uploaded; if not, handle references as blank
  if (req.file) {
      body['references'] = req.file.filename; // Assign the uploaded file's name
  } else {
      body['references'] = ''; // Leave references as blank if no file was uploaded
  }

  // Query to fetch shopkeeper by unique_code
  pool.query(`SELECT * FROM shopkeeper WHERE unique_code = '${req.body.unique_code}'`, (err, result) => {
      if (err) {
          console.error('Database Error:', err);
          return res.status(500).send('An error occurred while processing your request.');
      }

      let shopkeeperid = null;
      if (result.length > 0) {
          shopkeeperid = result[0].id;
      }

      // Add the current date, status, shopkeeperid, and unique_order_no to the body object
      body['created_at'] = new Date(); // Use `new Date()` to get the current date
      body['status'] = 'pending';
      body['shopkeeperid'] = shopkeeperid; // Assign shopkeeperid or null if not found
      body['unique_order_no'] = verify.generateRandomOrderNo();
      req.session.unique_order_no = body.unique_order_no;

      // Insert the data into the database
      pool.query(`INSERT INTO customizeOrder SET ?`, body, async (err, result) => {
          if (err) {
              console.error('Database Error:', err);
              return res.status(500).send('An error occurred while processing your request.');
          }

          res.json({ msg: 'success'});
      });
  });
});



router.get('/make/payment', async(req, res) => {
   let data = await verify.fetchOrderDetails(req.session.unique_order_no,'customizeOrder')
   verify.createPaymentRequest(req, res,data,ccave);
});




router.post('/successful/payment', async (req, res) => {
  try {
    const { encResp } = req.body;

    // Verify payment response
    const result = await verify.handlePaymentResponse(encResp, req.session);

    if (!result.success) {
      return res.status(500).send(`Error: ${result.message}`);
    }

    if (result.orderStatus === 'Success') {
      const { billing_name, billing_tel, billing_email } = result.decryptedResponse;

      // Log the values to ensure they're correct
      console.log('Billing Name:', billing_name);
      console.log('Billing Tel:', billing_tel);
      console.log('Billing Email:', billing_email);

      // Update order status in the database
      const updateQuery = `
               UPDATE customizeOrder 
SET status = 'success' 
WHERE id = (
    SELECT id FROM customizeOrder 
    WHERE name = ? AND number = ? AND email = ? 
    ORDER BY id DESC 
    LIMIT 1
);
      `;
      const updateResult = await queryAsync(updateQuery, [billing_name, billing_tel, billing_email]);
      console.log('Update Result:', updateResult);

      // Check if any rows were updated
      if (updateResult.affectedRows === 0) {
        return res.status(404).send('Order not found or already updated.');
      }

      // Fetch unique order number
      const selectQuery = `
        SELECT unique_order_no 
        FROM customizeOrder 
        WHERE name = ? AND number = ? AND email = ?
      `;
      const rows = await queryAsync(selectQuery, [billing_name, billing_tel, billing_email]);

      console.log('Select Query Result:', rows);

      if (rows.length > 0) {
        req.session.unique_order_no = rows[0].unique_order_no;
        return res.redirect('/shopkeeper/thankyou');
      } else {
        return res.status(404).send('Order not found.');
      }
    } else {
      // Redirect for other order statuses (e.g., Failure or Aborted)
      return res.redirect('/order/now');
    }
  } catch (error) {
    console.error('Error processing payment:', error);
    res.status(500).send('Internal Server Error');
  }
});




const sendEmailsInBackground = async (orderDetails) => {
  try {
    const userSubject = emailTemplates.userorderRecive.userSubject.replace('{{Customer_Name}}', orderDetails.name);
    const userMessage = emailTemplates.userorderRecive.userMessage(
      orderDetails.name,
      orderDetails.project_type,
      orderDetails.topic,
      orderDetails.quantity,
      orderDetails.amount,
      orderDetails.amount
    );

    const shopkeeperSubject = emailTemplates.customizeOrder.userSubject.replace('{{Customer_Name}}', orderDetails.shopkeepername);
    const shopkeeperMessage = emailTemplates.customizeOrder.userMessage(
      orderDetails.name,
      orderDetails.project_type,
      orderDetails.topic,
      orderDetails.quantity,
      orderDetails.amount,
      orderDetails.amount
    );

    const fileMakerSubject = emailTemplates.customizeOrder.userSubject.replace('{{Customer_Name}}', orderDetails.name);

    // Send emails asynchronously
    await Promise.all([
      verify.sendUserMail(orderDetails.email, userSubject, userMessage),
      verify.sendUserMail(orderDetails.shopkeeperemail, shopkeeperSubject, shopkeeperMessage),
      verify.sendUserMail('filemakr@gmail.com', fileMakerSubject, shopkeeperMessage),
    ]);

    console.log('Emails sent successfully');
  } catch (error) {
    console.error('Error sending emails:', error);
  }
};

router.get('/thankyou',dataService.allCategory, async (req, res) => {
  try {
    console.log(req.session)


pool.query(`select unique_order_no from customizeOrder where name = ''`)

    // Update order status and retrieve order details in a single query
    const query = `
      SELECT c.*, 
        s.name AS shopkeepername, 
        s.email AS shopkeeperemail 
      FROM customizeOrder c 
      LEFT JOIN shopkeeper s 
      ON c.shopkeeperid = s.id 
      WHERE c.unique_order_no = ?;
    `;

    pool.query(query, [req.session.unique_order_no], async (err, results) => {
      if (err) throw err;

      const orderDetails = results[0]; // Second query result

      if (!orderDetails) {
        return res.status(404).send('Order not found');
      }

      // Send emails in the background
      sendEmailsInBackground(orderDetails);

      // Render the thank-you page immediately
      // res.render(`${folder}/thankyou`,{orderDetails:orderDetails.reportWay});
  res.render(`${folder}/thankyou`,{Metatags:onPageSeo.contactPage,CommonMetaTags:onPageSeo.commonMetaTags,msg:'',category:req.categories,fullUrl:req.fullUrl,orderDetails:orderDetails.reportWay});

    });
  } catch (error) {
    console.error('Error processing request:', error);
    res.status(500).send('Internal Server Error');
  }
});





router.get('/thankyou1',dataService.allCategory,async(req,res)=>{


})




router.post('/api/updateOrderStatus', (req, res) => {
  let body = req.body;
  pool.query(
    `UPDATE customizeOrder SET status = ?, awb = ? , trackinglink = ? WHERE id = ?`,
    [body.status, body.awb, body.trackinglink, body.id],
    (err, result) => {
      if (err) {
        console.error(err); // Logging the error for debugging
        res.status(500).json({ error: 'Database error' });
      } else {
        res.json({ success: 'success' });
      }
    }
  );
});



router.get('/api/completeOrderStatus', (req, res) => {
  let body = req.query;
  pool.query(
    `UPDATE customizeOrder SET status = 'completed' WHERE id = ?`,
    [body.id],
    (err, result) => {
      if (err) {
        console.error(err); // Logging the error for debugging
        res.status(500).json({ error: 'Database error' });
      } else {
        res.redirect('/affiliate/dashboard/customize/order/Out%20for%20Delivery')
      }
    }
  );
});




router.get("/getActivityTypes", async (req, res) => {
  try {
      const rows = await queryAsync(
          "SELECT * from points_system"
      );
      res.json(rows);
  } catch (error) {
      res.status(500).json({ error: error.message });
  }
});




router.post("/submitClaim", async (req, res) => {
  try {
      // Check if user is logged in
      if (!req.session.shopkeeper) {
          return res.status(401).json({ success: false, message: "Unauthorized" });
      }

      const user_id = req.session.shopkeeper;
      const { activityType } = req.body;
      const proof = req.body.proofUrl
      const created_at = verify.getCurrentDate()

      // Validate required fields
      if (!activityType || !proof) {
          return res.status(400).json({ success: false, message: "All fields are required." });
      }

      // Fetch points from activity_type table
      const activity = await queryAsync("SELECT points FROM points_system WHERE id = ?", [activityType]);

      if (!activity || activity.length === 0) {
          return res.status(404).json({ success: false, message: "Invalid activity type." });
      }

      const points = activity[0].points;

      // Insert data into activities table
      await queryAsync(
          "INSERT INTO activities (user_id, activity_type, points, proof, created_at, status) VALUES (?, ?, ?, ?, ?, 'pending')",
          [user_id, activityType, points, proof, created_at]
      );

      return res.status(200).json({ success: true, message: "Claim submitted successfully." });

  } catch (error) {
      console.error("Error submitting claim:", error);
      return res.status(500).json({ success: false, message: "Internal server error." });
  }
});





router.get("/getPointSystem", async (req, res) => {
  try {
      const rows = await queryAsync(
          "SELECT * from points_system"
      );
      res.json(rows);
  } catch (error) {
      res.status(500).json({ error: error.message });
  }
});



router.post("/dashboard/profile/update", async (req, res) => {
  try {
    const { name, number, password, address, image_url, instagram_id, youtube_id, linkedin_id } = req.body;
    console.log(req.body)
    const id = req.session.shopkeeper;

    // Get existing values
    const [existing] = await queryAsync("SELECT instagram_id, youtube_id, linkedin_id FROM shopkeeper WHERE id = ?", [id]);

    // Build dynamic query
    let query = `UPDATE shopkeeper SET name = ?, number = ?, address = ?, `;
    let params = [name, number, address];

    if (password && password.trim() !== "") {
      query += `password = ?, `;
      params.push(password);
    }

    query += `image_url = ?`;
    params.push(image_url);

    // Conditional updates for social IDs
    if (!existing.instagram_id && instagram_id && instagram_id.trim() !== "") {
      query += `, instagram_id = ?`;
      params.push(instagram_id.trim());
    }

    if (!existing.youtube_id && youtube_id && youtube_id.trim() !== "") {
      query += `, youtube_id = ?`;
      params.push(youtube_id.trim());
    }

    if (!existing.linkedin_id && linkedin_id && linkedin_id.trim() !== "") {
      query += `, linkedin_id = ?`;
      params.push(linkedin_id.trim());
    }

    query += ` WHERE id = ?`;
    params.push(id);

    await queryAsync(query, params);

    return res.json({ status: "success" });
  } catch (err) {
    console.error("Profile update error:", err);
    return res.status(500).json({ status: "error", message: "Update failed" });
  }
});



var pool2 = require('../pool2');

router.get('/blog',(req,res)=>{
  pool2.query(`SELECT * 
FROM automate_blog.blogs 
WHERE meta_title LIKE '%ME Project %'
   OR meta_title LIKE '%BE Project %';`,(err,result)=>{
    if(err) throw err;
    else res.render(`${folder}/bloglist`,{result})
  })
})


router.get('/blog/update/:slug',(req,res)=>{
  pool2.query(`select * from blogs where slug = '${req.params.slug}'`,(err,result)=>{
    if(err) throw err;
    else res.render(`${folder}/blogupdate`,{blog:result})
  })
})



router.post('/dashboard/blogs/update',upload.any(), (req, res) => {
  const {
    title,
    slug,
    content,
    meta_title,
    meta_description,
    category,
    meta_keywords,
    tags,
    meta_abstract,
    thumbnail_url,
  } = req.body;

  console.log('body data',req.body)

  // Optional: Require a unique identifier like blog ID or existing slug
  // For example, updating based on slug:
  const blogSlug = slug; // or req.body.original_slug if you're editing slug

 const updateQuery = `
  UPDATE blogs SET
   
    content = ?
   
  WHERE slug = ?
`;
  const values = [
 
  content,
 

  slug
];


  pool2.query(updateQuery, values, (err, results) => {
    if (err) {
      console.error('Error updating blog:', err);
      return res.json({ msg: 'error', error: err });
    }

    if (results.affectedRows === 0) {
      return res.json({ msg: 'not_found' });
    }

    return res.json({ msg: 'success' });
  });
});
module.exports = router;
