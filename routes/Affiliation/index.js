
var express = require('express');
var router = express.Router();
var upload = require('../multer');
var pool = require('../pool');
var pool2 = require('../pool2');

require('dotenv').config()
var folder = process.env.affilation_folder
var table = process.env.affiliation_table
var table1 = 'source_code'
var dataService = require('../dataService');
const path = require('path');
const fs = require('fs');

router.use(dataService.adminAuthenticationToken);

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
    res.render(`${folder}/login`,{msg : ''});
    
})


router.post('/login',(req,res)=>{
    let body = req.body;
    console.log("body",body)
   
 pool.query(`select * from ${table} where email ='${body.email}' and password = '${body.password}'`,(err,result)=>{
    
     if(err) throw err;
     else if(result[0]) {
         req.session.affiliation = result[0].id
         res.redirect('/affiliate/dashboard')
        }
     else res.render(`${folder}/login`,{msg : 'Enter Wrong Creaditionals'})
 })
   
})



router.post('/delete/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await queryAsync('UPDATE shopkeeper SET status = ? WHERE id = ?', ['deactivate', id]);
    res.redirect('/affiliate/dashboard/brand/ambassador');
  } catch (err) {
    console.error("Deactivate Error:", err);
    res.status(500).send("Failed to deactivate ambassador.");
  }
});


router.get('/edit/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const [ambassador] = await queryAsync('SELECT * FROM shopkeeper WHERE id = ?', [id]);
    res.render(`${folder}/editAmbassador`, { ambassador }); // create this EJS page
  } catch (err) {
    console.error("Edit Load Error:", err);
    res.status(500).send("Failed to load edit page.");
  }
});



router.post('/edit/:id', async (req, res) => {
  const { id } = req.params;
  const { name, number, email, instagram_id, linkedin_id, youtube_id, address } = req.body;
  try {
    await queryAsync(
      `UPDATE shopkeeper 
       SET name = ?, number = ?, email = ?, instagram_id = ?, linkedin_id = ?, youtube_id = ?, address = ?
       WHERE id = ?`,
      [name, number, email, instagram_id, linkedin_id, youtube_id, address, id]
    );
    res.redirect('/affiliate/dashboard/brand/ambassador');
  } catch (err) {
    console.error("Edit Save Error:", err);
    res.status(500).send("Failed to update ambassador.");
  }
});





router.get('/dashboard', (req, res) => {
  const { startDate, endDate } = dataService.getCurrentWeekDates();

  // Dashboard Metrics Query
  const metricsQuery = `
    SELECT 
      (SELECT COUNT(id) FROM requestDemo WHERE status = 'pending') AS demopending,
      (SELECT COUNT(id) FROM contactus WHERE date BETWEEN ? AND ?) AS contactus,
      (SELECT COUNT(id) FROM payment_request WHERE date BETWEEN ? AND ?) AS payment_request,
      (SELECT COUNT(id) FROM btech_project WHERE status = 'pending') AS project_pending,

      -- Source Code Overview
      (SELECT COUNT(id) FROM payment_request WHERE status = 'pending' AND type = 'source_code') AS sc_pending,
      (SELECT COUNT(id) FROM payment_request WHERE status = 'interested' AND type = 'source_code') AS sc_interested,
      (SELECT COUNT(id) FROM payment_request WHERE status = 'recall' AND type = 'source_code') AS sc_recall,
      (SELECT COUNT(id) FROM payment_request WHERE status = 'dnp' AND type = 'source_code') AS sc_dnp,
      (SELECT COUNT(id) FROM payment_request WHERE status = 'reminder_sent' AND type = 'source_code') AS sc_reminder,
      (SELECT COUNT(id) FROM payment_request WHERE status = 'success' AND type = 'source_code') AS sc_success,

      -- Project Report Overview
      (SELECT COUNT(id) FROM btech_project WHERE status = 'interested') AS pr_interested,
      (SELECT COUNT(id) FROM btech_project WHERE status = 'recall') AS pr_recall,
      (SELECT COUNT(id) FROM btech_project WHERE status = 'dnp') AS pr_dnp,
      (SELECT COUNT(id) FROM btech_project WHERE status = 'reminder_sent') AS pr_reminder,
      (SELECT COUNT(id) FROM btech_project WHERE status = 'success') AS pr_success;
  `;

  const metricsParams = [startDate, endDate, startDate, endDate];

  // Fixed Incentive Watch Logs Query
const incentiveQuery = `
SELECT 
  a.id,
  a.name,
  a.start_date,
  a.end_date,
  a.total_links,
  IFNULL(b.total_valid_watch_logs, 0) AS watch_logs,
  IFNULL(b.avg_watch_time, 0) AS avg_watch_time
FROM (
  SELECT 
    s.id,
    s.name,
    DATE(MIN(l.created_at)) AS start_date,
    DATE_ADD(DATE(MIN(l.created_at)), INTERVAL 30 DAY) AS end_date,
    COUNT(*) AS total_links
  FROM shopkeeper s
  JOIN links l ON s.id = l.promoter_id
  WHERE s.isFixIncentiveJoin = 1
  GROUP BY s.id
) a
LEFT JOIN (
  SELECT 
    l.promoter_id,
    COUNT(v.id) AS total_valid_watch_logs,
    ROUND(AVG(v.watched_seconds), 1) AS avg_watch_time
  FROM links l
  JOIN video_watch_logs v ON l.id = v.link_id
  WHERE v.watched_seconds > 60
  GROUP BY l.promoter_id
) b ON a.id = b.promoter_id;
`;



  const promterQuery = `SELECT 
  grouped.original_url,
  GROUP_CONCAT(CONCAT(grouped.promoter_name, ' (', grouped.valid_views, ')') ORDER BY grouped.valid_views DESC SEPARATOR ', ') AS promoter_clicks,
  SUM(grouped.valid_views) AS total_valid_views
FROM (
  SELECT 
    l.original_url,
    s.name AS promoter_name,
    s.id AS promoter_id,
    COUNT(DISTINCT CASE WHEN v.watched_seconds > 60 THEN v.id ELSE NULL END) AS valid_views
  FROM links l
  LEFT JOIN shopkeeper s ON l.promoter_id = s.id
  LEFT JOIN video_watch_logs v ON l.id = v.link_id
  WHERE s.isPromoter = 1
    AND l.created_at >= '2025-08-01'
  GROUP BY l.original_url, s.id
) AS grouped
GROUP BY grouped.original_url
ORDER BY grouped.original_url ASC;
`;

  // Run both queries in parallel
  Promise.all([
    new Promise((resolve, reject) => {
      pool.query(metricsQuery, metricsParams, (err, result) => {
        if (err) reject(err);
        else resolve(result[0]);
      });
    }),
    new Promise((resolve, reject) => {
      pool.query(incentiveQuery, (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    }),
    new Promise((resolve, reject) => {
      pool.query(promterQuery, (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    })
  ])
    .then(([dashboardMetrics, incentiveData, promoterData]) => {
      res.render(`${folder}/dashboard`, {
        result: dashboardMetrics,
        incentiveData: incentiveData,
        promoterData:promoterData
      });

    
     
    })
    .catch((error) => {
      console.error('Dashboard query error:', error);
      res.status(500).send('Internal Server Error');
    });
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



router.get('/dashboard/contact/list/:status',(req,res)=>{
    pool.query(`select * from contactus where status = '${req.params.status}' order by id desc`,(err,result)=>{
      if(err) throw err;
      else res.render(`${folder}/contactlist`,{result})
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


router.get('/dashboard/payment/request/:status',(req,res)=>{
  pool.query(`select * from payment_request where status = '${req.params.status}' and type = 'source_code' order by id desc`,(err,projectDetails)=>{
    if(err) throw err;
    else res.render(`${folder}/payment_request`,{projectDetails,status:req.params.status})
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
      
      from payment_response prs where prs.order_status = '${req.params.status}' 
      AND (prs.type IS NULL)
      order by prs.id desc`,(err,projectDetails)=>{
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

      from payment_response prs where prs.status = '${req.params.status}'
      AND (prs.type IS NULL)
      order by prs.id desc`,(err,projectDetails)=>{
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
      prs.order_status != 'success' 
      AND prs.status IS NULL 
      AND (prs.type IS NULL) -- Include rows with NULL type
ORDER BY 
      prs.id DESC;
;
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




router.get('/dashboard/project/report/:status', async (req, res) => {
  try {
    // Query to get the btech_project with the specified status
    const projectDetails = await queryAsync(`SELECT * FROM btech_project WHERE status = '${req.params.status}' ORDER BY id DESC`);

   
    res.render(`${folder}/projectReport`,{projectDetails,status:req.params.status});
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
});




router.get('/dashboard/customize/order/:status', async (req, res) => {
  try {
    // Query to get the btech_project with the specified status
    const projectDetails = await queryAsync(`SELECT c.* , (select s.name from shopkeeper s where s.id = c.shopkeeperid ) as brandAmbassadorname FROM customizeOrder c WHERE c.status = '${req.params.status}' ORDER BY id DESC`);
 res.render(`${folder}/customizeOrderReport`,{projectDetails,status:req.params.status});
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


router.post('/dashboard/customizeOrder/updateStatus',(req,res)=>{
  pool.query(`update customizeOrder set status = '${req.body.status}' where id = '${req.body.id}'`,(err,result)=>{
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


const emailTemplates = require('../utility/emailTemplates');
const verify = require('../verify');

router.get('/dashboard/project/report/send/reminder', async(req,res)=>{
  console.log(req.query)
  const userSubject1 = emailTemplates.beforprojectreport.userSubject.replace('{{Project_Name}}', req.query.project_name);
  const userMessage1 = emailTemplates.beforprojectreport.userMessage(req.query.name,req.query.project_name,req.query.roll_number);
  await verify.sendUserMail(req.query.email,userSubject1,userMessage1);

//    await verify.sendWhatsAppMessage(
//     +91 + req.query.number,
//     'project_report_reminder', // Template name
//     'en_US', // Language code
//     [req.query.name.toUpperCase(), req.query.project_name], // Body parameters
//     [req.query.roll_number] // Button parameters
// );


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

//    await verify.sendWhatsAppMessage(
//     +91 + req.query.number,
//     'source_code_reminder', // Template name
//     'en_US', // Language code
//     [req.query.name.toUpperCase(), req.query.project_name], // Body parameters
//     [req.query.seo_name+'/source-code'] // Button parameters
// );


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



router.post('/dashboard/contact/bulk-update', async (req, res) => {
  const { ids, status } = req.body;

  if (!ids || ids.length === 0) {
      return res.status(400).json({ success: false, message: "No IDs provided." });
  }

  try {
      // Update the database based on selected IDs
      const query = `UPDATE contactus SET status = ? WHERE id IN (?)`;
      await queryAsync(query, [status, ids]);

      res.json({ success: true, message: "Status updated successfully!" });
  } catch (error) {
      console.error("Database Update Error:", error);
      res.status(500).json({ success: false, message: "Database update failed." });
  }
});



router.get('/dashboard/leaderboard/request',(req,res)=>{
  pool.query(`select a.* , 
    (select p.activity_name from points_system p where p.id = a.activity_type) as activity,
    (select s.name from shopkeeper s where s.id = a.user_id) as user_name
     from activities a where a.status = 'pending' order by id desc limit 100 `,(err,result)=>{
    if(err) throw err;
    else {
      res.render(`${folder}/leaderboardRequest`,{result})
    }
  })
})




// router.post("/dashboard/updateActivity", async (req, res) => {
//     try {
//         const { id, user_id, points, action } = req.body;

//         if (!id || !user_id || !action) {
//             return res.status(400).json({ success: false, message: "Invalid request" });
//         }

//         if (action === "reject") {
//             // Reject activity
//             await queryAsync("UPDATE activities SET status = 'reject' WHERE id = ?", [id]);
//             return res.json({ success: true, message: "Activity rejected successfully" });
//         } else if (action === "accept") {
//             // Accept activity and update leaderboard
//             await queryAsync("UPDATE activities SET status = 'accept' WHERE id = ?", [id]);

//             const currentDate = verify.getCurrentDate(); // Get current timestamp

//             await queryAsync(
//                 `INSERT INTO leaderboard (user_id, total_points, created_at,cycle_id) 
//                  VALUES (?, ?, ?,?) 
//                  ON DUPLICATE KEY UPDATE total_points = total_points + ?, created_at = ?`,
//                 [user_id, points, currentDate, '9', points, currentDate]
//             );

//             return res.json({ success: true, message: "Activity accepted and leaderboard updated" });
//         }

//         res.status(400).json({ success: false, message: "Invalid action" });

//     } catch (error) {
//         console.error("Error updating activity:", error);
//         res.status(500).json({ success: false, message: "Internal server error" });
//     }
// });


//perfectly run
router.post("/dashboard/updateActivity", async (req, res) => {
    try {
        const { id, user_id, points, action } = req.body;

        if (!id || !user_id || !action) {
            return res.status(400).json({ success: false, message: "Invalid request" });
        }

        if (action === "reject") {
            await queryAsync("UPDATE activities SET status = 'reject' WHERE id = ?", [id]);
            return res.json({ success: true, message: "Activity rejected successfully" });
        } else if (action === "accept") {
            // Accept activity
            await queryAsync("UPDATE activities SET status = 'accept' WHERE id = ?", [id]);

            // Step 1: Get activity_type from activities
            const activity = await queryAsync("SELECT activity_type FROM activities WHERE id = ?", [id]);
            if (!activity.length) {
                return res.status(400).json({ success: false, message: "Activity not found" });
            }
            const activity_type = activity[0].activity_type;

            // Step 2: Get activity_name from points_system
            const pointSystem = await queryAsync("SELECT activity_name FROM points_system WHERE id = ?", [activity_type]);
            if (!pointSystem.length) {
                return res.status(400).json({ success: false, message: "Point system data not found" });
            }
            const activity_name = pointSystem[0].activity_name.toLowerCase();

            const currentDate = verify.getCurrentDate();

            // Step 3: Check if it's a YouTube activity
            if (activity_name.includes(" Youtube")) {
                // Get active YouTube cycle
                const youtubeCycle = await queryAsync("SELECT id FROM youtube_leaderboard_cycle WHERE status = 'active' LIMIT 1");
                if (!youtubeCycle.length) {
                    return res.status(400).json({ success: false, message: "No active YouTube cycle found" });
                }
                const youtube_cycle_id = youtubeCycle[0].id;

                // Insert or update YouTube leaderboard
                await queryAsync(`
                    INSERT INTO youtube_leaderboard (user_id, total_points, created_at, cycle_id)
                    VALUES (?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE total_points = total_points + ?, created_at = ?`,
                    [user_id, points, currentDate, youtube_cycle_id, points, currentDate]
                );
            } else {
                // Get active standard leaderboard cycle
                const cycle = await queryAsync("SELECT id FROM leaderboard_cycles WHERE status = 'active' LIMIT 1");
                if (!cycle.length) {
                    return res.status(400).json({ success: false, message: "No active leaderboard cycle found" });
                }
                const cycle_id = cycle[0].id;

                // Insert or update main leaderboard
                await queryAsync(`
                    INSERT INTO leaderboard (user_id, total_points, created_at, cycle_id)
                    VALUES (?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE total_points = total_points + ?, created_at = ?`,
                    [user_id, points, currentDate, cycle_id, points, currentDate]
                );
            }

            return res.json({ success: true, message: "Activity accepted and leaderboard updated" });
        }

        res.status(400).json({ success: false, message: "Invalid action" });

    } catch (error) {
        console.error("Error updating activity:", error);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
});



// router.post("/dashboard/bulkUpdate", async (req, res) => {
//   try {
//       const { activities, action } = req.body;
//       if (!Array.isArray(activities) || !action) {
//           return res.status(400).json({ success: false, message: "Invalid request" });
//       }

//       for (const activity of activities) {
//           const { id, user_id, points } = activity;

//           if (action === "reject") {
//               await queryAsync("UPDATE activities SET status = 'reject' WHERE id = ?", [id]);
//           } else if (action === "accept") {
//               await queryAsync("UPDATE activities SET status = 'accept' WHERE id = ?", [id]);
//               const currentDate = verify.getCurrentDate();
//               await queryAsync(
//                   `INSERT INTO leaderboard (user_id, total_points, created_at, cycle_id)
//                    VALUES (?, ?, ?, ?)
//                    ON DUPLICATE KEY UPDATE total_points = total_points + ?, created_at = ?`,
//                   [user_id, points, currentDate, '9', points, currentDate]
//               );
//           }
//       }

//       res.json({ success: true, message: `Bulk ${action} completed successfully.` });
//   } catch (error) {
//       console.error("Bulk update error:", error);
//       res.status(500).json({ success: false, message: "Internal server error" });
//   }
// });




router.post("/dashboard/bulkUpdate", async (req, res) => {
  try {
    const { activities, action } = req.body;

    if (!Array.isArray(activities) || !action) {
      return res.status(400).json({ success: false, message: "Invalid request" });
    }

    for (const activity of activities) {
      const { id, user_id, points } = activity;

      if (!id || !user_id) continue;

      if (action === "reject") {
        await queryAsync("UPDATE activities SET status = 'reject' WHERE id = ?", [id]);
      } else if (action === "accept") {
        // Accept activity
        await queryAsync("UPDATE activities SET status = 'accept' WHERE id = ?", [id]);

        // Step 1: Get activity_type from activities
        const activityResult = await queryAsync("SELECT activity_type FROM activities WHERE id = ?", [id]);
        if (!activityResult.length) continue;
        const activity_type = activityResult[0].activity_type;

        // Step 2: Get activity_name from points_system
        const pointSystem = await queryAsync("SELECT activity_name FROM points_system WHERE id = ?", [activity_type]);
        if (!pointSystem.length) continue;
        const activity_name = pointSystem[0].activity_name.toLowerCase();

        const currentDate = verify.getCurrentDate();

        if (activity_name.includes("youtube")) {
          // Step 3a: Get active YouTube cycle
          const youtubeCycle = await queryAsync("SELECT id FROM youtube_leaderboard_cycle WHERE status = 'active' LIMIT 1");
          if (!youtubeCycle.length) continue;
          const youtube_cycle_id = youtubeCycle[0].id;

          // Step 4a: Update YouTube leaderboard
          await queryAsync(`
            INSERT INTO youtube_leaderboard (user_id, total_points, created_at, cycle_id)
            VALUES (?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE total_points = total_points + ?, created_at = ?`,
            [user_id, points, currentDate, youtube_cycle_id, points, currentDate]
          );
        } else {
          // Step 3b: Get active main leaderboard cycle
          const cycle = await queryAsync("SELECT id FROM leaderboard_cycles WHERE status = 'active' LIMIT 1");
          if (!cycle.length) continue;
          const cycle_id = cycle[0].id;

          // Step 4b: Update main leaderboard
          await queryAsync(`
            INSERT INTO leaderboard (user_id, total_points, created_at, cycle_id)
            VALUES (?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE total_points = total_points + ?, created_at = ?`,
            [user_id, points, currentDate, cycle_id, points, currentDate]
          );
        }
      }
    }

    res.json({ success: true, message: `Bulk ${action} completed successfully.` });
  } catch (error) {
    console.error("Bulk update error:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});



router.get('/dashboard/brand/ambassador',(req,res)=>{
  pool.query(`select * from shopkeeper WHERE status IS NULL OR status = '' OR status = 'active' order by id desc`,(err,result)=>{
    if(err) throw err;
    else res.render(`${folder}/brandAmbassdorList`,{result})
  })
})


const moment = require("moment");

router.get('/dashboard/brand/ambassador/colloboration', (req, res) => {
  const currentMonth = moment().format("MMMM YYYY"); // e.g., "April 2025"

  const query = `
    SELECT 
      c.*, 
      a.instagram_id AS ambassdor_instagram_id,
      a.name AS ambassdor_name,
      a.number AS ambassdor_number
    FROM collaboration c
    JOIN shopkeeper a ON a.id = c.ambassador_id
    WHERE c.month = ?
    ORDER BY c.serial_number ASC, c.id ASC
  `;

  pool.query(query, [currentMonth], (err, result) => {
    if (err) throw err;
    else {
      const alreadyGenerated = result.length > 0;
      res.render(`${folder}/colloborationList`, { result,alreadyGenerated  });
    }
  });
});


router.get('/dashboard/instagram/post/add', async (req, res) => {
  try {
    const posts = await queryAsync('SELECT * FROM post ORDER BY id DESC');
    res.render(`${folder}/addPost`, { posts });
  } catch (err) {
    console.error('Error fetching posts:', err.message);
    res.render(`${folder}/addPost`, { posts: [] });
  }
});



router.post('/dashboard/post/:id/fetch', async (req, res) => {
  const postId = req.params.id;

  try {
    // Get postid from post table
    const [post] = await queryAsync('SELECT postid FROM post WHERE id = ?', [postId]);
    if (!post || !post.postid) {
      return res.status(404).send('Post ID not found.');
    }

    // Get Instagram config
    const [config] = await queryAsync('SELECT instagramAccessToken FROM config LIMIT 1');
    const token = config.instagramAccessToken;

    // Fetch comments using mediaId (postid)
    const commentData = await fetchInstagramComments(post.postid, token);

    const commenters = commentData?.comments?.data || [];

    if (commenters.length === 0) {
      return res.redirect('/affiliate/dashboard/instagram/post/add'); // Nothing to update
    }

    // Get all engagements for this post
    const engagements = await queryAsync(
      'SELECT id, ambassador_id, ambassador_instagram_id FROM post_engagement WHERE post_id = ?',
      [postId]
    );

    // For each commenter, check if username matches brand_ambassador_instagram_id
    for (const comment of commenters) {
      const matching = engagements.find(e => e.ambassador_instagram_id === comment.username);

      if (matching) {
        await queryAsync(
          'UPDATE post_engagement SET liked = 1, commented = 1 WHERE post_id = ? AND ambassador_id = ?',
          [postId, matching.ambassador_id]
        );
      }
    }

    // Update last_update in post table
    await queryAsync('UPDATE post SET last_update = NOW() WHERE id = ?', [postId]);

    res.redirect('/affiliate/dashboard/instagram/post/add');
  } catch (err) {
    console.error('Fetch error:', err.message);
    res.status(500).send('Error fetching Instagram comments');
  }
});





router.post('/dashboard/post/:id/fetch-youtube', async (req, res) => {
  const postId = req.params.id;

  try {
    // 1. Get video ID from post table
    const [post] = await queryAsync('SELECT postid FROM post WHERE id = ?', [postId]);
    if (!post || !post.postid) {
      return res.status(404).send('YouTube post ID not found.');
    }

    const videoId = post.postid;

    // 2. Get YouTube API key from config
    const [config] = await queryAsync('SELECT youtubeApiKey FROM config LIMIT 1');
    const apiKey = config.youtubeApiKey;

    // 3. Fetch comments from YouTube API
    const ytApiUrl = `https://www.googleapis.com/youtube/v3/commentThreads`;
    const ytParams = {
      key: apiKey,
      videoId: videoId,
      part: 'snippet',
      maxResults: 1000
    };

    const response = await axios.get(ytApiUrl, { params: ytParams });
    const comments = response.data.items || [];

    // 4. Extract commenter names

comments.forEach((item, index) => {
  const author = item?.snippet?.topLevelComment?.snippet?.authorDisplayName;
  if (!author) {
    console.log(`Comment #${index + 1} has no authorDisplayName`, item);
  }
});


    const commenterNames = comments.map(item =>
      item.snippet?.topLevelComment?.snippet?.authorDisplayName?.toLowerCase().trim()
    ).filter(Boolean);

    console.log('YouTube Commenters:', commenterNames);

    if (commenterNames.length === 0) {
      return res.redirect('/affiliate/dashboard/instagram/post/add'); // No comments to process
    }

    // 5. Get post engagements
    const engagements = await queryAsync(
      'SELECT id, ambassador_id, ambassador_instagram_id FROM post_engagement WHERE post_id = ?',
      [postId]
    );

    // 6. Match commenter with ambassador and update engagement
    for (const commenter of commenterNames) {
      const match = engagements.find(e =>
        e.ambassador_instagram_id?.toLowerCase().trim() === commenter
      );

      if (match) {
        await queryAsync(
          'UPDATE post_engagement SET liked = 1, commented = 1 WHERE post_id = ? AND ambassador_id = ?',
          [postId, match.ambassador_id]
        );
      }
    }

    // 7. Update post last_update time
    await queryAsync('UPDATE post SET last_update = NOW() WHERE id = ?', [postId]);

    res.redirect('/affiliate/dashboard/instagram/post/add');
  } catch (err) {
    console.error('YouTube Fetch Error:', err.message);
    res.status(500).send('Error fetching YouTube comments');
  }
});




router.get('/dashboard/post/:id/details', async (req, res) => {
  const postId = req.params.id;

  try {
    const [post] = await queryAsync('SELECT * FROM post WHERE id = ?', [postId]);

    const results = await queryAsync(`
      SELECT 
        pe.*, 
        s.name AS ambassador_name,
        s.email AS ambassador_email
      FROM post_engagement pe
      JOIN shopkeeper s ON pe.ambassador_id = s.id
      WHERE pe.post_id = ?
    `, [postId]);

    const engaged = results.filter(r => r.liked === 1 || r.commented === 1);
    const notEngaged = results.filter(r => !r.liked && !r.commented);

    res.render(`${folder}/postDetails`, {
      postId,
      platform: post.platform,
      link: post.link,
      engaged,
      notEngaged
    });

  } catch (err) {
    console.error('Error loading post details:', err.message);
    res.status(500).send('Internal Server Error');
  }
});



const nodemailer = require('nodemailer');

router.post('/dashboard/post/:id/remind', async (req, res) => {
  const { platform, link } = req.body;
  const postId = req.params.id;

  try {
    const notEngaged = await queryAsync(`
      SELECT 
        s.email, 
        s.name 
      FROM post_engagement pe
      JOIN shopkeeper s ON pe.ambassador_id = s.id
      WHERE pe.post_id = ? AND (pe.liked IS NULL OR pe.liked = 0) AND (pe.commented IS NULL OR pe.commented = 0)
    `, [postId]);

    if (notEngaged.length === 0) {
      return res.redirect('back');
    }

    const transporter = nodemailer.createTransport({
      host: 'smtpout.secureserver.net',
      port: 465,
      secure: true,
      auth: {
        user: 'info@filemakr.com',
        pass: 'Np2tr6G84',
      },
    });

    for (const user of notEngaged) {
      const mailOptions = {
        from: `"FILEMAKR Team" <info@filemakr.com>`,
        to: user.email,
        subject: "You didn't follow your roles and responsibility",
        html: `
          <p>Dear ${user.name},</p>
          <p>You were expected to engage with the following post but haven’t done so:</p>
          <p><strong>Platform:</strong> ${platform}</p>
          <p><strong>Link:</strong> <a href="${link}">${link}</a></p>
          <p>Please take action to fulfill your responsibilities.</p>
          <p>Regards,<br/>Team FILEMAKR</p>
        `
      };

      await transporter.sendMail(mailOptions);
    }

    // ✅ Update last_reminder timestamp
    await queryAsync(`UPDATE post SET last_reminder = NOW() WHERE id = ?`, [postId]);

    res.redirect(`/affiliate/dashboard/post/${postId}/details`);
  } catch (err) {
    console.error('Failed to send emails:', err.message);
    res.status(500).send('Failed to send emails');
  }
});



router.get('/dashboard/post/:id/delete', async (req, res) => {
  const { id } = req.params;

  try {
    // First delete from post_engagement
    await queryAsync('DELETE FROM post_engagement WHERE post_id = ?', [id]);

    // Then delete the post itself
    await queryAsync('DELETE FROM post WHERE id = ?', [id]);

    res.redirect('/affiliate/dashboard/instagram/post/add');
  } catch (err) {
    console.error('Error deleting post:', err.message);
    res.status(500).send('Failed to delete post');
  }
});


// router.post('/dashboard/instagram/post/add', async (req, res) => {
//   const {  link, post_date } = req.body;

//   const result = await queryAsync("INSERT INTO post ( link, post_date) VALUES (?, ?)", 
//     [ link, post_date]);
  
//   const postId = result.insertId;
//   const ambassadors = await queryAsync("SELECT id FROM shopkeeper");

//   const engagementData = ambassadors.map(a => [postId, a.id]);
//   await queryAsync("INSERT INTO post_engagement (post_id, ambassador_id) VALUES ?", [engagementData]);

//   res.redirect('/affiliate/dashboard/instagram/post/add');
// });



router.post('/dashboard/instagram/post/add', async (req, res) => {
  const { link, post_date, platform } = req.body;

  let postid = null;
  let mediaUrl = null;

  if (platform === 'instagram') {
    try {
      // Fetch credentials from config table
      const configResult = await queryAsync('SELECT instagramAccessToken, instagramUserId FROM config LIMIT 1');
      const { instagramAccessToken, instagramUserId } = configResult[0];

      // Fetch Instagram media
      const mediaData = await fetchInstagramMedia(instagramUserId, instagramAccessToken);
      postid = mediaData?.data?.[0]?.id || null;
      mediaUrl = mediaData?.data?.[0]?.permalink || null;


    } catch (err) {
      console.error('Error getting Instagram post ID:', err.message);
    }
  }

  if (platform === 'youtube') {
      // Extract YouTube video ID from the link
      const match = link.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|v\/))([^?&]+)/);
      postid = match ? match[1] : null;
      mediaUrl = link;
    }

  // Insert into post table
  const result = await queryAsync(
    "INSERT INTO post (link, post_date, postid, platform) VALUES (?, ?, ?, ?)", 
    [link, post_date, postid, platform]
  );

  const postId = result.insertId;

  // Insert engagement data for all ambassadors
  // const ambassadors = await queryAsync("SELECT id,instagram_id FROM shopkeeper");
  // const engagementData = ambassadors.map(a => [postId, a.id,a.instagram_id]);
  // await queryAsync("INSERT INTO post_engagement (post_id, ambassador_id,ambassador_instagram_id) VALUES ?", [engagementData]);


  let ambassadors = [];
if (platform === 'instagram') {
  ambassadors = await queryAsync("SELECT id, instagram_id AS platform_id FROM shopkeeper WHERE status IS NULL OR status = '' OR status = 'active'");
} else if (platform === 'youtube') {
  ambassadors = await queryAsync("SELECT id, youtube_id AS platform_id FROM shopkeeper WHERE status IS NULL OR status = '' OR status = 'active'");
} else if (platform === 'linkedin') {
  ambassadors = await queryAsync("SELECT id, linkedin_id AS platform_id FROM shopkeeper WHERE status IS NULL OR status = '' OR status = 'active'");
} else {
  ambassadors = []; // fallback or add support for other platforms here
}

// Prepare engagement data
const engagementData = ambassadors.map(a => [postId, a.id, a.platform_id]);

// Insert into post_engagement
await queryAsync(
  "INSERT INTO post_engagement (post_id, ambassador_id, ambassador_instagram_id) VALUES ?",
  [engagementData]
);

  res.redirect('/affiliate/dashboard/instagram/post/add');
});






router.get('/dashboard/instagram/engagement/bulk', async (req, res) => {
  const query = `
    SELECT 
      e.id AS engagement_id,
      a.name, a.instagram_id,
      p.link AS post_url,
      e.post_id as postid,
      e.liked, e.commented
    FROM post_engagement e
    JOIN shopkeeper a ON a.id = e.ambassador_id
    JOIN post p ON p.id = e.post_id
    ORDER BY p.post_date DESC, a.id ASC
  `;

  const result = await queryAsync(query);

  res.render(`${folder}/bulkEngagement`, { result });
});



router.post('/dashboard/engagement/update', async (req, res) => {
  const { likes = [], comments = [] } = req.body;

  // Convert to Sets for fast lookup
  const likedSet = new Set(likes);
  const commentedSet = new Set(comments);

  // Get all engagement IDs involved
  const engagementIds = [...new Set([...likes, ...comments])];

  for (const id of engagementIds) {
    const liked = likedSet.has(id) ? 1 : 0;
    const commented = commentedSet.has(id) ? 1 : 0;

    await queryAsync(
      `UPDATE post_engagement SET liked = ?, commented = ? WHERE id = ?`,
      [liked, commented, id]
    );
  }

  res.redirect('/affiliate/dashboard/instagram/engagement/bulk'); // or wherever your success redirect is
});




router.get('/report/ambassador-engagement', async (req, res) => {
  const query = `
    SELECT 
      a.id AS ambassador_id, a.name, a.instagram_id,
      p.id AS post_id, p.link, p.post_date,
      e.liked, e.commented
    FROM shopkeeper a
    JOIN post_engagement e ON a.id = e.ambassador_id
    JOIN (
      SELECT * FROM post ORDER BY post_date DESC LIMIT 5
    ) p ON p.id = e.post_id
    ORDER BY a.id, p.post_date DESC
  `;

  const results = await queryAsync(query);

  // Group posts (latest 5)
  const postsMap = new Map();
  const ambassadorsMap = new Map();
  const engagementMap = {};

  results.forEach(row => {
    postsMap.set(row.post_id, { id: row.post_id, post_date: row.post_date });

    if (!ambassadorsMap.has(row.ambassador_id)) {
      ambassadorsMap.set(row.ambassador_id, {
        id: row.ambassador_id,
        name: row.name,
        instagram_id: row.instagram_id,
      });
    }

    const key = `${row.ambassador_id}_${row.post_id}`;
    engagementMap[key] = {
      liked: row.liked,
      commented: row.commented
    };
  });

  const posts = Array.from(postsMap.values());
  const ambassadors = Array.from(ambassadorsMap.values());

  res.render(`${folder}/engagementReport`, {
    posts,
    ambassadors,
    engagementMap
  });
});


router.get('/internship', (req, res) => {
  pool.query(`
    SELECT 
      s.id AS brand_ambassador_id,
      s.name,
      s.number,
      s.address,
      s.created_at,
      DATEDIFF(CURDATE() + 1, s.created_at) AS total_days,
      COUNT(idt.id) AS verified_task_count
    FROM 
      shopkeeper s
    LEFT JOIN 
      internship_day idt 
      ON s.id = idt.brand_ambassador_id AND idt.status = 'verified'
    WHERE 
      s.created_at >= '2025-07-18'
    GROUP BY 
      s.id, s.name, s.number, s.address, s.created_at
    ORDER BY 
      s.created_at DESC;
  `, (err, result) => {
    if (err) throw err;
    else res.render(`${folder}/intership`, { result });
  });
});

router.get('/performance',(req,res)=>{
  pool.query(`WITH performance_data AS (
    SELECT 
        s.id,
        s.name,
        s.address,
        s.number,
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
    performance_score DESC;


`,(err,result)=>{
      if(err) throw err;
      else res.render(`${folder}/performance`,{result})
    })
})



router.post('/performance/email/:id', async (req, res) => {
  const ambassadorId = req.params.id;

  try {
    // Fetch ambassador info
    const [ambassador] = await queryAsync(`
      SELECT name, email, address FROM shopkeeper WHERE id = ?`, [ambassadorId]);

    if (!ambassador || !ambassador.email) {
      return res.status(400).send('Ambassador email not found.');
    }

    // Fetch overall performance summary
    const [summary] = await queryAsync(`
      SELECT 
        COUNT(pe.post_id) AS total_post,
        COALESCE(SUM(pe.liked), 0) AS total_like,
        COALESCE(SUM(pe.commented), 0) AS total_comment,
        ROUND(
          CASE 
              WHEN COUNT(pe.post_id) = 0 THEN 0
              ELSE (COALESCE(SUM(pe.liked), 0) + COALESCE(SUM(pe.commented), 0)) / (COUNT(pe.post_id) * 2.0)
          END * 100
        ) AS performance_score,
        ROUND(
          CASE 
              WHEN COUNT(pe.post_id) = 0 THEN 0
              ELSE (COALESCE(SUM(pe.liked), 0) + COALESCE(SUM(pe.commented), 0)) / (COUNT(pe.post_id) * 2.0)
          END * 5
        ) AS rating_star
      FROM post_engagement pe
      WHERE pe.ambassador_id = ?`, [ambassadorId]);

    // Fetch individual post details
    const posts = await queryAsync(`
      SELECT 
        p.link,
        pe.liked,
        pe.commented,
        p.post_date
      FROM post_engagement pe
      JOIN post p ON p.id = pe.post_id
      WHERE pe.ambassador_id = ?`, [ambassadorId]);

    const starHTML = Array.from({ length: 5 }).map((_, i) =>
      i < summary.rating_star
        ? '<span style="color:#fbc02d;">★</span>'
        : '<span style="color:#ccc;">★</span>'
    ).join('');

    const postRows = posts.map(post => `
      <tr>
        <td style="padding:8px;"><a href="${post.link}" target="_blank">${post.link}</a></td>
        <td>${new Date(post.post_date).toLocaleDateString()}</td>
        <td style="color:${post.liked ? 'green' : 'red'}; font-weight:bold;">${post.liked ? '✔️' : '❌'}</td>
        <td style="color:${post.commented ? 'green' : 'red'}; font-weight:bold;">${post.commented ? '✔️' : '❌'}</td>
      </tr>
    `).join('');

    const emailBody = `
      <div style="font-family: 'Times New Roman', serif; color: #333;">
        <h2>Hi ${ambassador.name},</h2>
        <p>Here’s your detailed performance report as a <strong>FileMakr Brand Ambassador</strong>:</p>

        <h3 style="margin-top:30px;">📊 Performance Overview</h3>
        <table style="border-collapse: collapse; width: 100%; margin-bottom: 20px;">
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd;">Total Posts</td>
            <td style="padding: 8px; border: 1px solid #ddd;">${summary.total_post}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd;">Total Likes</td>
            <td style="padding: 8px; border: 1px solid #ddd;">${summary.total_like}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd;">Total Comments</td>
            <td style="padding: 8px; border: 1px solid #ddd;">${summary.total_comment}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd;">Performance Score</td>
            <td style="padding: 8px; border: 1px solid #ddd;">${summary.performance_score} / 100</td>
          </tr>
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd;">Rating</td>
            <td style="padding: 8px; border: 1px solid #ddd;">${starHTML}</td>
          </tr>
        </table>

       <h3 style="margin-top: 40px; font-size: 20px; color: #222;">📌 Post-wise Engagement Details</h3>
<table style="border-collapse: collapse; width: 100%; font-size: 14px; margin-top: 10px; border: 1px solid #e0e0e0;">
  <thead>
    <tr style="background-color: #1976d2; color: #fff; text-align: left;">
      <th style="padding: 12px 15px; border-right: 1px solid #e0e0e0;">#</th>
      <th style="padding: 12px 15px; border-right: 1px solid #e0e0e0;">Post Link</th>
      <th style="padding: 12px 15px; border-right: 1px solid #e0e0e0;">Posted On</th>
      <th style="padding: 12px 15px; border-right: 1px solid #e0e0e0;">Liked</th>
      <th style="padding: 12px 15px;">Commented</th>
    </tr>
  </thead>
  <tbody>
    ${posts.length === 0 ? `
      <tr>
        <td colspan="5" style="text-align:center; padding: 15px; color: #888;">
          No posts available.
        </td>
      </tr>
    ` : posts.map((post, index) => `
      <tr style="background-color: ${index % 2 === 0 ? '#fafafa' : '#ffffff'};">
        <td style="padding: 10px 15px; border-bottom: 1px solid #e0e0e0;">${index + 1}</td>
        <td style="padding: 10px 15px; border-bottom: 1px solid #e0e0e0;">
          <a href="${post.link}" target="_blank" style="color: #1a73e8; text-decoration: none;">View Post</a>
        </td>
        <td style="padding: 10px 15px; border-bottom: 1px solid #e0e0e0;">
          ${new Date(post.post_date).toLocaleDateString()}
        </td>
        <td style="padding: 10px 15px; border-bottom: 1px solid #e0e0e0; color: ${post.liked ? 'green' : 'red'};">
          ${post.liked ? '✔️' : '❌'}
        </td>
        <td style="padding: 10px 15px; border-bottom: 1px solid #e0e0e0; color: ${post.commented ? 'green' : 'red'};">
          ${post.commented ? '✔️' : '❌'}
        </td>
      </tr>
    `).join('')}
  </tbody>
</table>


        <p>— Team FileMakr</p>
      </div>
    `;

    // Send Email
     const transporter = nodemailer.createTransport({
      host: 'smtpout.secureserver.net',
      port: 465,
      secure: true,
      auth: {
        user: 'info@filemakr.com',
        pass: 'Np2tr6G84',
      },
    });
    await transporter.sendMail({
      from: '"FileMakr Team" <info@filemakr.com>',
      to: ambassador.email,                 // Ensure this field exists in DB
      subject: 'Your Performance Summary - FileMakr Brand Ambassador',
      html: emailBody
    });

    await queryAsync(
  `UPDATE shopkeeper SET last_update = NOW() WHERE id = ?`,
  [ambassadorId]
);

    res.redirect('/affiliate/performance');

  } catch (err) {
    console.error('Email sending error:', err);
    res.status(500).send('Failed to send email.');
  }
});




router.post('/performance/certificate/:id', async (req, res) => {
  const ambassadorId = req.params.id;

  try {
    // Fetch ambassador info
    const [ambassador] = await queryAsync(
      "SELECT name, email, address, created_at FROM shopkeeper WHERE id = ?",
      [ambassadorId]
    );
    if (!ambassador) return res.status(404).send("Ambassador not found.");

    // Calculate start and end dates
    const startDate = new Date(ambassador.created_at);
    const endDate = new Date(startDate);
    endDate.setMonth(startDate.getMonth() + 3);

    // Fetch performance data
    const [performance] = await queryAsync(
      `SELECT 
        COUNT(post_id) AS total_posts,
        COALESCE(SUM(liked), 0) AS total_likes,
        COALESCE(SUM(commented), 0) AS total_comments,
        CASE 
          WHEN COUNT(post_id) = 0 THEN 0
          ELSE (COALESCE(SUM(liked), 0) + COALESCE(SUM(commented), 0)) / (COUNT(post_id) * 2.0)
        END AS engagement_ratio
      FROM post_engagement
      WHERE ambassador_id = ?`,
      [ambassadorId]
    );

    const performance_score = Math.round((performance.engagement_ratio || 0) * 100);

    // Generate the certificate PDF
    const pdfBytes = await generateExperienceCertificate({
      student_name: ambassador.name,
      college_name: ambassador.address || "Your College",
      start_date: startDate.toLocaleDateString(),
      end_date: new Date().toLocaleDateString(),
      total_posts: performance.total_posts,
      total_likes: performance.total_likes,
      total_comments: performance.total_comments,
      performance_score: performance_score
    });

    // Save PDF temporarily
    const filePath = path.join(__dirname, `../../public/Experience Certificate/certificate-${ambassador.name}.pdf`);
    fs.writeFileSync(filePath, pdfBytes);
    console.log('filepath',filePath)

    // Email setup
    const transporter = nodemailer.createTransport({
      host: 'smtpout.secureserver.net',
      port: 465,
      secure: true,
      auth: {
        user: 'info@filemakr.com',
        pass: 'Np2tr6G84',
      },
    });

    await transporter.sendMail({
      from: '"FileMakr Team" <info@filemakr.com>',
      to: ambassador.email,
      subject: '🎓 Your Experience Certificate as a FileMakr Campus Brand Ambassador',
      html: `
        <p>Hi ${ambassador.name},</p>
        <p>Congratulations on completing 3 months as a Campus Brand Ambassador at FileMakr!</p>
        <p>Here's a quick overview of your engagement:</p>
        <ul>
          <li><b>Total Posts:</b> ${performance.total_posts}</li>
          <li><b>Total Likes:</b> ${performance.total_likes}</li>
          <li><b>Total Comments:</b> ${performance.total_comments}</li>
          <li><b>Performance Score:</b> ${performance_score}/100</li>
        </ul>
        <p>Attached is your official Experience Certificate. We thank you for your contribution to the FileMakr community and wish you all the best for your future endeavors.</p>
        <p>Warm regards,<br/>Team FileMakr</p>
      `,
      attachments: [{
        filename: 'Experience_Certificate_FileMakr.pdf',
        content: pdfBytes,
      }]
    });

    // Cleanup


    // Mark as issued
    await queryAsync("UPDATE shopkeeper SET certificate_issued = TRUE WHERE id = ?", [ambassadorId]);

    res.redirect('/affiliate/performance');
  } catch (err) {
    console.error('Certificate Issue Error:', err);
    res.status(500).send("Failed to issue certificate.");
  }
});


// router.get('/getMonthlyLeaderboard',(req,res)=>{
//   const sql = `
//   SELECT 
//       u.id,
//       u.name,

//       -- Total Points
//       IFNULL(lp.total_points, 0) AS total_points,

//       -- Followers Gained
//       IFNULL(f.count, 0) AS follower_count,

//       -- Google Reviews
//       IFNULL(g.count, 0) AS google_reviews,

//       -- 30-Day Activity
//       IFNULL(s.count, 0) AS activity_streak,

//       -- Brand Ambassador Referral
//       IFNULL(h.count, 0) AS brand_ambassador_referral,

//       -- Eligibility
//       CASE WHEN IFNULL(lp.total_points, 0) >= 1 THEN '✅' ELSE '❌' END AS eligible_points,
//       CASE WHEN IFNULL(f.count, 0) >= 30 THEN '✅' ELSE '❌' END AS eligible_followers,
//       CASE WHEN IFNULL(g.count, 0) >= 30 THEN '✅' ELSE '❌' END AS eligible_reviews,
//       CASE WHEN IFNULL(s.count, 0) >= 30 THEN '✅' ELSE '❌' END AS eligible_streak,
//       CASE WHEN IFNULL(h.count, 0) >= 2 THEN '✅' ELSE '❌' END AS eligible_brand_ambassador_referral

//   FROM shopkeeper u

//   LEFT JOIN (
//       SELECT user_id, SUM(total_points) AS total_points
//       FROM leaderboard
//       WHERE 
//           MONTH(created_at) = MONTH(CURDATE()) AND
//           YEAR(created_at) = YEAR(CURDATE())
//       GROUP BY user_id
//   ) lp ON lp.user_id = u.id

//   LEFT JOIN (
//       SELECT user_id, COUNT(id) AS count
//       FROM activities
//       WHERE 
//           activity_type = '13' AND
//           status = 'accept' AND
//           MONTH(created_at) = MONTH(CURDATE()) AND
//           YEAR(created_at) = YEAR(CURDATE())
//       GROUP BY user_id
//   ) f ON f.user_id = u.id

//   LEFT JOIN (
//       SELECT user_id, COUNT(id) AS count
//       FROM activities
//       WHERE 
//           activity_type = '9' AND
//           status = 'accept' AND
//           MONTH(created_at) = MONTH(CURDATE()) AND
//           YEAR(created_at) = YEAR(CURDATE())
//       GROUP BY user_id
//   ) g ON g.user_id = u.id

//   LEFT JOIN (
//       SELECT user_id, COUNT(id) AS count
//       FROM activities
//       WHERE 
//           activity_type = '12' AND
//           status = 'accept' AND
//           MONTH(created_at) = MONTH(CURDATE()) AND
//           YEAR(created_at) = YEAR(CURDATE())
//       GROUP BY user_id
//   ) h ON h.user_id = u.id

//   LEFT JOIN (
//       SELECT user_id, COUNT(DISTINCT DATE(created_at)) AS count
//       FROM activities
//       WHERE 
//           activity_type = '2' AND
//           status = 'accept' AND
//           MONTH(created_at) = MONTH(CURDATE()) AND
//           YEAR(created_at) = YEAR(CURDATE())
//       GROUP BY user_id
//   ) s ON s.user_id = u.id

//   WHERE lp.total_points IS NOT NULL 
//      OR f.count IS NOT NULL 
//      OR g.count IS NOT NULL 
//      OR s.count IS NOT NULL 
//      OR h.count IS NOT NULL

//   ORDER BY total_points DESC
// `;



// pool.query(sql, (err, results) => {
//   if (err) {
//     console.error('Error fetching leaderboard:', err);
//     return res.status(500).send('Server error');
//   }

//   res.render(`${folder}/leaderboard`, { leaderboard: results });
//   // res.json(results)
// });
// })


router.get('/getMonthlyLeaderboard', (req, res) => {
  const sql = `
  SELECT * FROM (
    -- Current Month Data
    SELECT 
        u.id,
        u.name,
        'Current' AS month_label,

        IFNULL(lp.total_points, 0) AS total_points,
        IFNULL(f.count, 0) AS follower_count,
        IFNULL(g.count, 0) AS google_reviews,
        IFNULL(s.count, 0) AS activity_streak,
        IFNULL(h.count, 0) AS brand_ambassador_referral,

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
        WHERE activity_type = '13' AND status = 'accept'
            AND MONTH(created_at) = MONTH(CURDATE())
            AND YEAR(created_at) = YEAR(CURDATE())
        GROUP BY user_id
    ) f ON f.user_id = u.id

    LEFT JOIN (
        SELECT user_id, COUNT(id) AS count
        FROM activities
        WHERE activity_type = '9' AND status = 'accept'
            AND MONTH(created_at) = MONTH(CURDATE())
            AND YEAR(created_at) = YEAR(CURDATE())
        GROUP BY user_id
    ) g ON g.user_id = u.id

    LEFT JOIN (
        SELECT user_id, COUNT(id) AS count
        FROM activities
        WHERE activity_type = '12' AND status = 'accept'
            AND MONTH(created_at) = MONTH(CURDATE())
            AND YEAR(created_at) = YEAR(CURDATE())
        GROUP BY user_id
    ) h ON h.user_id = u.id

    LEFT JOIN (
        SELECT user_id, COUNT(DISTINCT DATE(created_at)) AS count
        FROM activities
        WHERE activity_type = '2' AND status = 'accept'
            AND MONTH(created_at) = MONTH(CURDATE())
            AND YEAR(created_at) = YEAR(CURDATE())
        GROUP BY user_id
    ) s ON s.user_id = u.id

    WHERE lp.total_points IS NOT NULL 
        OR f.count IS NOT NULL 
        OR g.count IS NOT NULL 
        OR s.count IS NOT NULL 
        OR h.count IS NOT NULL

    UNION ALL

    -- Last Month Data
    SELECT 
        u.id,
        u.name,
        'Last' AS month_label,

        IFNULL(lp.total_points, 0) AS total_points,
        IFNULL(f.count, 0) AS follower_count,
        IFNULL(g.count, 0) AS google_reviews,
        IFNULL(s.count, 0) AS activity_streak,
        IFNULL(h.count, 0) AS brand_ambassador_referral,

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
            MONTH(created_at) = MONTH(CURDATE() - INTERVAL 1 MONTH) AND
            YEAR(created_at) = YEAR(CURDATE() - INTERVAL 1 MONTH)
        GROUP BY user_id
    ) lp ON lp.user_id = u.id

    LEFT JOIN (
        SELECT user_id, COUNT(id) AS count
        FROM activities
        WHERE activity_type = '13' AND status = 'accept'
            AND MONTH(created_at) = MONTH(CURDATE() - INTERVAL 1 MONTH)
            AND YEAR(created_at) = YEAR(CURDATE() - INTERVAL 1 MONTH)
        GROUP BY user_id
    ) f ON f.user_id = u.id

    LEFT JOIN (
        SELECT user_id, COUNT(id) AS count
        FROM activities
        WHERE activity_type = '9' AND status = 'accept'
            AND MONTH(created_at) = MONTH(CURDATE() - INTERVAL 1 MONTH)
            AND YEAR(created_at) = YEAR(CURDATE() - INTERVAL 1 MONTH)
        GROUP BY user_id
    ) g ON g.user_id = u.id

    LEFT JOIN (
        SELECT user_id, COUNT(id) AS count
        FROM activities
        WHERE activity_type = '12' AND status = 'accept'
            AND MONTH(created_at) = MONTH(CURDATE() - INTERVAL 1 MONTH)
            AND YEAR(created_at) = YEAR(CURDATE() - INTERVAL 1 MONTH)
        GROUP BY user_id
    ) h ON h.user_id = u.id

    LEFT JOIN (
        SELECT user_id, COUNT(DISTINCT DATE(created_at)) AS count
        FROM activities
        WHERE activity_type = '2' AND status = 'accept'
            AND MONTH(created_at) = MONTH(CURDATE() - INTERVAL 1 MONTH)
            AND YEAR(created_at) = YEAR(CURDATE() - INTERVAL 1 MONTH)
        GROUP BY user_id
    ) s ON s.user_id = u.id

    WHERE lp.total_points IS NOT NULL 
        OR f.count IS NOT NULL 
        OR g.count IS NOT NULL 
        OR s.count IS NOT NULL 
        OR h.count IS NOT NULL
  ) AS leaderboard_data

  ORDER BY month_label DESC, total_points DESC
  `;

  pool.query(sql, (err, results) => {
    if (err) {
      console.error('Error fetching leaderboard:', err);
      return res.status(500).send('Server error');
    }

    res.render(`${folder}/leaderboard`, { leaderboard: results });
    // res.json(results)
  });
});



async function createRandomCollaborationGroups() {
  const month = moment().format("MMMM YYYY");

  // Step 1: All ambassadors
  const allAmbassadors = await queryAsync("SELECT id FROM shopkeeper WHERE status IS NULL OR status = '' OR status = 'active'");
  const allIds = allAmbassadors.map(a => a.id);

  // Step 2: Already grouped ambassadors for the month
  const grouped = await queryAsync("SELECT ambassador_id FROM collaboration WHERE month = ?", [month]);
  const groupedIds = grouped.map(g => g.ambassador_id);

  // Step 3: Filter new ambassadors not in previous groups
  const newAmbassadors = allIds.filter(id => !groupedIds.includes(id));

  if (newAmbassadors.length === 0) {
    console.log("No new ambassadors to group.");
    return;
  }

  // Step 4: Shuffle new ambassadors
  for (let i = newAmbassadors.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newAmbassadors[i], newAmbassadors[j]] = [newAmbassadors[j], newAmbassadors[i]];
  }

  // Step 5: Get last serial number used
  const [last] = await queryAsync("SELECT MAX(serial_number) as maxSerial FROM collaboration WHERE month = ?", [month]);
  let serialNumber = last.maxSerial ? last.maxSerial + 1 : 1;

  // Step 6: Prepare insert
  const groupSize = 5;
  const insertData = [];

  for (let i = 0; i < newAmbassadors.length; i += groupSize) {
    const group = newAmbassadors.slice(i, i + groupSize);
    group.forEach(id => {
      insertData.push([id, serialNumber, month]);
    });
    serialNumber++;
  }

  // Step 7: Insert
  const query = "INSERT INTO collaboration (ambassador_id, serial_number, month) VALUES ?";
  await queryAsync(query, [insertData]);

  console.log("New groups created for:", month);
}


router.post('/collaboration/generate', async (req, res) => {
  try {
    await createRandomCollaborationGroups();
    res.redirect('/affiliate/collaboration');
  } catch (err) {
    console.error("Collab Group Generation Error:", err);
    res.status(500).send("Failed to generate groups.");
  }
});


// Run it when needed
// createRandomCollaborationGroups().catch(console.error);


// createRandomCollaborationGroups().catch(console.error);


const generateOfferLetter = require('../../utils/generateOfferLetter');
const generateExperienceCertificate = require('../../utils/generateExperienceCertificate');
const generateLevel1Certificate = require('../../utils/generateLevel1Certificate');
const generateLevel2Certificate = require('../../utils/generateLevel2Certificate');
const LeadershipCertificate = require('../../utils/LeadershipCertificate');
const RelievingLetter = require('../../utils/RelievingLetter');





const sendOfferLetter = require('../../utils/sendEmail');
const { sendCommonBodyLetter } = require('../../utils/sendCommonBody');


router.get('/send-offer', async (req, res) => {
  try {
    const { student_name, college_name, start_date, end_date, email } = req.query;

    const pdfBuffer = await generateOfferLetter({ student_name, college_name, start_date, end_date });
    await sendOfferLetter(email, pdfBuffer, student_name);

    // Update DB: mark offer letter as sent
    await queryAsync(`UPDATE shopkeeper SET is_login_mail_send = 1 WHERE email = ?`, [email]);

    res.redirect('/affiliate/dashboard/brand/ambassador');
  } catch (err) {
    console.error('Offer Letter Error:', err);
    res.status(500).send('Error sending offer letter');
  }
});




// Assuming these are already imported above:
// const { queryAsync } = require('../pool'); // or your db wrapper
// const generateLevel1Certificate = require('...');
// const generateLevel2Certificate = require('...');
// const LeadershipCertificate     = require('...');
// const generateExperienceCertificate = require('...');
// const RelievingLetter           = require('...');
// const sendCommonBodyLetter      = require('...'); // your mail sender

router.get('/send-common-letter', async (req, res) => {
  try {
    const {
      student_name,
      college_name,
      start_date,
      end_date,
      email,
      title,              // "Mr." | "Ms." | "" (gender-neutral)
      docType
    } = req.query;

    // Basic validation
    if (!email || !docType || !student_name) {
      return res.status(400).send('Missing required fields: email, docType, student_name');
    }

    // Normalize docType to uppercase to avoid case sensitivity issues
    const kind = String(docType).toUpperCase();

    // Map docType -> generator function
    const generators = {
      LEVEL_1:   generateLevel1Certificate,
      LEVEL_2:   generateLevel2Certificate,
      LEADERSHIP: LeadershipCertificate,
      EXPERIENCE: generateExperienceCertificate,
      RELIEVING:  RelievingLetter,
    };

    const makePdf = generators[kind];
    if (!makePdf) {
      return res.status(400).send(`Unsupported docType: ${docType}`);
    }

    // Build payload for generators (keep keys consistent across all)
    const payload = {
      student_name,
      college_name,
      start_date,
      end_date,
      title,
      // You can add `today: new Date()` if your generator expects it
    };

    // Generate PDF
    const pdfBuffer = await makePdf(payload);

    // console.log('pdfbuffer',pdfBuffer)
    if (!pdfBuffer) {
      return res.status(500).send('Failed to generate PDF');
    }

     console.log('[mailer keys]', Object.keys(sendCommonBodyLetter));
     console.log('typeof', typeof sendCommonBodyLetter.sendCommonBodyLetter); 
    // Send email
    await sendCommonBodyLetter({
      to: email,
      pdfBuffer,
      docType: kind,         // LEVEL_1 | LEVEL_2 | LEADERSHIP | EXPERIENCE | RELIEVING
      studentName: student_name,
      collegeName: college_name,
      startDate: start_date,
      endDate: end_date,
      title,
    });

    // OPTIONAL: only update a flag that matches what you’re sending.
    // If this route is not only for "login mail", consider a different field/table (e.g., benefit_claims)
    await queryAsync(
      `UPDATE shopkeeper SET is_login_mail_send = 1 WHERE email = ?`,
      [email]
    );

    // Redirect back to admin view
    return res.redirect('/affiliate/dashboard/brand/ambassador');
  } catch (err) {
    console.error('Send Common Letter Error:', err);
    return res.status(500).send('Error sending letter');
  }
});







const axios = require('axios');

const accessToken = 'EAAU06ZC3UpdABOZCAVELBBsr36NZCXRZA9u6uTYI3FZCRtoouQip5aZBErMWCsxKaAVPLYwGpwyYWq1ZCDZB5yVVtNHiQu7d1VNOhMZC6qinTZAZBWs0unSxdXwBLVgnSNZCURAX7ZBmIXMoolTvjDrapQUPbtmgEvy445r69Js5rZB3xjr1Xq44W6oQidGygSKEjtguSKkZBZA0dtP2LlZChoM3E065pVzeGg7hZA4PqT54HSWrnTRc5hlXLS8qVaFQZDZD';
const instagramUserId = '17841423690161816';
const mediaId = '17968829153913605';

async function fetchInstagramMedia(userId, token) {
  const url = `https://graph.facebook.com/v21.0/${userId}/media`;
  const params = {
    fields: 'id,caption,timestamp,media_type,media_url,permalink',
    access_token: token
  };

  try {
    const response = await axios.get(url, { params });
    console.log('Instagram Media:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error fetching Instagram media:', error.response?.data || error.message);
    throw error;
  }
}


async function fetchInstagramComments(mediaId, token) {
  const url = `https://graph.facebook.com/v21.0/${mediaId}`;
  const params = {
    fields: 'comments.limit(100){username}',
    access_token: token
  };

  try {
    const response = await axios.get(url, { params });
    console.log('Instagram Post Details with Comments:', response.data.comments.data);
    return response.data;
  } catch (error) {
    console.error('Error fetching comments:', error.response?.data || error.message);
    throw error;
  }
}

// Usage
// fetchInstagramComments(mediaId, accessToken);

// Usage
// fetchInstagramMedia(instagramUserId, accessToken);


router.get('/credentials/sent', async (req, res) => {
  const { email, number, password ,unique_code } = req.query;

  // Validate input
  if (!email || !number || !password) {
    return res.status(400).send("Missing required parameters.");
  }

  try {
    const transporter = nodemailer.createTransport({
      host: 'smtpout.secureserver.net',
      port: 465,
      secure: true,
      auth: {
        user: 'info@filemakr.com',
        pass: 'Np2tr6G84',
      },
    });

    const mailOptions = {
      from: '"Team FileMakr" <info@filemakr.com>',
      to: email,
      subject: "🔐 Your Brand Ambassador Login Credentials",
      html: `
        <div style="font-family: 'Times New Roman', serif; color: #333; line-height: 1.6;">
          <p>Dear Brand Ambassador,</p>

          <p>Welcome aboard! We're excited to have you join the <strong>FileMakr Campus Brand Ambassador Program</strong>.</p>

          <p><strong>Your login credentials are as follows:</strong></p>
          <ul>
            <li><strong>Mobile Number:</strong> ${number}</li>
            <li><strong>Password:</strong> ${password}</li>
              <li><strong>Unique Code:</strong> ${req.query.unique_code}</li>
          </ul>

          <p>You can now log in to your brand ambassador dashboard to begin your journey:</p>

          <p style="text-align: center; margin: 20px 0;">
            <a href="https://www.filemakr.com/shopkeeper" target="_blank" 
              style="background-color: #007bff; color: white; padding: 10px 20px; border-radius: 5px; text-decoration: none; display: inline-block;">
              🔗 Go to Dashboard
            </a>
          </p>

          <p>If you have any questions or need support, feel free to reach out to us at 
            <a href="mailto:info@filemakr.com">info@filemakr.com</a>.
          </p>

          <p>Wishing you all the best in this exciting role!</p>

          <p>Warm regards,<br><strong>Team FileMakr</strong></p>
        </div>
      `
    };

    // Send mail
    await transporter.sendMail(mailOptions);

    // Update DB flag
    await queryAsync("UPDATE shopkeeper SET is_password_mail_send = 1 WHERE email = ?", [email]);

    res.redirect('/affiliate/dashboard/brand/ambassador');
  } catch (err) {
    console.error("Credential Send Error:", err);
    res.status(500).send("Failed to send credentials.");
  }
});





router.get('/dashboard/performance', async (req, res) => {
  const ambassadorId = req.query.shopkeeper;

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

    res.render(`Shopkeeper/performance`, {
      performance,
      engagementList
    });
  } catch (err) {
    console.error("Performance Overview Error:", err);
    res.status(500).send("Failed to load performance overview");
  }
});




router.post('/update-youtube-id/:id', async (req, res) => {
  const postId = req.params.id;
  const platform = req.query.platform?.toLowerCase();

  let updateQuery;
  if (platform === 'youtube') {
    updateQuery = `
      UPDATE fileachiever.post_engagement AS f
      JOIN fileachiever.shopkeeper AS s ON f.ambassador_id = s.id
      SET f.ambassador_instagram_id = s.youtube_id
      WHERE f.post_id = ?;
    `;
  } else if (platform === 'instagram') {
    updateQuery = `
      UPDATE fileachiever.post_engagement AS f
      JOIN fileachiever.shopkeeper AS s ON f.ambassador_id = s.id
      SET f.ambassador_instagram_id = s.instagram_id
      WHERE f.post_id = ?;
    `;
  } else {
    return res.status(400).json({ error: 'Unsupported platform' });
  }

  try {
    const result = await queryAsync(updateQuery, [postId]);
    // res.json({ message: `Update successful for ${platform}`, affectedRows: result.affectedRows });
    res.redirect(`/affiliate/dashboard/post/${postId}/details`)
  } catch (err) {
    console.error('Update error:', err);
    res.status(500).json({ error: 'Database update failed' });
  }
});






router.get('/dashboard/promoter/all-links', async (req, res) => {
  try {
    const allLinks = await queryAsync(`
SELECT 
  grouped.original_url,
  GROUP_CONCAT(CONCAT(grouped.promoter_name, ' (', grouped.unique_clicks, ')') ORDER BY grouped.unique_clicks DESC SEPARATOR ', ') AS promoter_clicks,
  IFNULL(SUM(grouped.valid_views), 0) AS total_valid_views
FROM (
  SELECT 
    l.original_url,
    s.name AS promoter_name,
    COUNT(DISTINCT c.cookie_id) AS unique_clicks,
    COUNT(DISTINCT IF(v.watched_seconds > 60, v.id, NULL)) AS valid_views
  FROM links l
  LEFT JOIN clicks c ON l.id = c.link_id
  LEFT JOIN shopkeeper s ON l.promoter_id = s.id
  LEFT JOIN video_watch_logs v ON l.id = v.link_id
  WHERE s.isPromoter = 1
    AND l.created_at >= '2025-08-01'
  GROUP BY l.original_url, s.id
) AS grouped
GROUP BY grouped.original_url
ORDER BY grouped.original_url ASC;
    `);

    res.render(`${folder}/all-links`, { links: allLinks });

  } catch (err) {
    console.error(err);
    res.status(500).send('Error fetching grouped links by original URL');
  }
})



router.get('/dashboard/promoter/overview', async (req, res) => {
  try {
    const overviewData = await queryAsync(`
      SELECT 
        l.promoter_id,
        s.name AS promoter_name,
        COUNT(DISTINCT l.id) AS total_links_generated,
        COUNT(DISTINCT c.cookie_id) AS total_unique_clicks
      FROM links l
      LEFT JOIN clicks c ON l.id = c.link_id
      LEFT JOIN shopkeeper s ON l.promoter_id = s.id
      GROUP BY l.promoter_id
      ORDER BY total_unique_clicks DESC
    `);

    res.render(`${folder}/promoter-overview`, { overview: overviewData });

  } catch (err) {
    console.error(err);
    res.status(500).send('Error fetching promoter overview');
  }
});




router.get('/blog/list',(req,res)=>{
  pool2.query(`select * from blogs order by id desc`,(err,result)=>{
    if(err) throw err;
    else res.render(`${folder}/bloglist`,{result})
  })
})



router.get('/blog/update/:id',(req,res)=>{
  pool2.query(`select * from blogs where id = '${req.params.id}'`,(err,result)=>{
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
    title = ?,
    slug = ?,
    content = ?,
    meta_title = ?,
    meta_description = ?,
    category = ?,
    meta_keywords = ?,
    tags = ?,
    meta_abstract = ?,
    thumbnail_url = ?
  WHERE slug = ?
`;
  const values = [
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



router.get('/create-task',(req,res)=>{
  res.render(`${folder}/createTask`,{msg:''})
})


router.post('/create-task', (req, res) => {
  const { title, description, task_type } = req.body;
  const query = `
    INSERT INTO task (title, description, task_type, created_at)
    VALUES (?, ?, ?, NOW())
  `;
  pool.query(query, [title, description, task_type], (err, result) => {
    if (err) throw err;
    res.redirect('/affiliate/create-task?msg=Task created');
  });
});



router.get('/review-tasks', (req, res) => {
  const sql = `
    SELECT idt.id AS internshipTaskId, idt.proofLink, idt.status, idt.created_at,
           t.title, t.task_type, t.description,
           s.name AS ambassador_name
    FROM internship_day idt
    JOIN task t ON idt.task_id = t.id
    JOIN shopkeeper s ON idt.brand_ambassador_id = s.id
    WHERE idt.status = 'pending'
    ORDER BY idt.created_at DESC
  `;

  pool.query(sql, (err, results) => {
    if (err) throw err;
    res.render(`${folder}/review-tasks`, { tasks: results });
  });
});

router.get('/review-hustle-tasks', (req, res) => {
  const sql = `
    SELECT hcc.id AS submissionId, hcc.proofLink, hcc.status, hcc.created_at,
           t.title, t.task_type, t.description,
           s.name AS ambassador_name
    FROM hustle_challenge_completion hcc
    JOIN task t ON hcc.task_id = t.id
    JOIN shopkeeper s ON hcc.brand_ambassador_id = s.id
    WHERE hcc.status = 'pending'
    ORDER BY hcc.created_at DESC
  `;

  pool.query(sql, (err, results) => {
    if (err) throw err;
    res.render(`${folder}/review-hustle-tasks`, { tasks: results });
  });
});




// router.post('/update-task-status', (req, res) => {
  
//   const { taskId, status, reason } = req.body;

//   if (status === 'rejected' && !reason) {
//     return res.status(400).send("Rejection reason is required.");
//   }

//   let updateSql, values;

//   if (status === 'rejected') {
//     updateSql = `UPDATE internship_day SET status = ?, reason = ? WHERE id = ?`;
//     values = [status, reason, taskId];
//   } else {
//     updateSql = `UPDATE internship_day SET status = ?, reason = NULL WHERE id = ?`;
//     values = [status, taskId];
//   }

//   pool.query(updateSql, values, (err, result) => {
//     if (err) throw err;
//     res.redirect('/affiliate/review-tasks');
//   });
// });


router.post('/update-task-status', (req, res) => {
  let { taskIds, status, reason } = req.body;

  console.log('status',status)

  // Normalize taskIds to an array
  if (!Array.isArray(taskIds)) {
    // Single form submits taskIds[] or a single value depending on the form
    if (typeof taskIds === 'string' && taskIds.length > 0) {
      taskIds = [taskIds];
    } else if (req.body.taskId) {
      // Backward compatibility if some forms still send taskId
      taskIds = [req.body.taskId];
    }
  }

  // Validate selection
  if (!taskIds || taskIds.length === 0) {
    return res.status(400).send("No tasks selected.");
  }

  // Validate rejection reason
  if (status === 'rejected' && (!reason || reason.trim() === '')) {
    return res.status(400).send("Rejection reason is required.");
  }

  // Build SQL
  let sql, values;
  if (status === 'rejected') {
    // Apply the SAME reason to all selected tasks
    sql = `UPDATE internship_day SET status = ?, reason = ? WHERE id IN (?)`;
    values = [status, reason.trim(), taskIds];
  } else if (status === 'verified') {
    sql = `UPDATE internship_day SET status = ?, reason = NULL WHERE id IN (?)`;
    values = [status, taskIds];
  } else {
    return res.status(400).send("Invalid status.");
  }

  pool.query(sql, values, (err, result) => {
    if (err) {
      console.error(err);
      return res.status(500).send("Database error.");
    }
    res.redirect('/affiliate/review-tasks');
  });
});




router.post('/update-hustle-task-status', (req, res) => {
  const { taskId, status, reason } = req.body;
  console.log('hustle body',req.body)

  if (status === 'rejected' && !reason) {
    return res.status(400).send("Rejection reason is required.");
  }

  let updateSql, values;

  if (status === 'rejected') {
    updateSql = `UPDATE hustle_challenge_completion SET status = ?, reason = ? WHERE id = ?`;
    values = [status, reason, taskId];
  } else {
    updateSql = `UPDATE hustle_challenge_completion SET status = ?, reason = NULL, amount = '100' WHERE id = ?`;
    values = [status, taskId];
  }

  pool.query(updateSql, values, (err, result) => {
    if (err) throw err;
    res.redirect('/affiliate/review-hustle-tasks');
  });
});



router.get('/hustle-winners', (req, res) => {
  const sql = `
    SELECT hcc.id, hcc.amount, hcc.created_at,
           s.name AS ambassador_name, s.number
    FROM hustle_challenge_completion hcc
    JOIN shopkeeper s ON hcc.brand_ambassador_id = s.id
    WHERE hcc.status = 'verified'
    ORDER BY hcc.id DESC
    LIMIT 20;
  `;

  pool.query(sql, (err, results) => {
    if (err) throw err;

    const formatted = results.map(row => ({
      ...row,
      formattedDate: moment(row.created_at).format('MMMM D, YYYY')
    }));

    res.render(`${folder}/hustle-winners`, { winners: formatted });
  });
});



router.get('/IDCard',(req,res)=>{
res.render(`${folder}/idcard`, {
  name: 'Riya Biswas',
  doj: '31/07/2025',
  college: 'Heritage Law College',
  email: 'riya1992001@gmail.com',
  photoUrl: 'https://res.cloudinary.com/dggf8vl9p/image/upload/v1754212736/jxy7pxyttei1juwuxe0s.avif',
  idCode: 'RIYHER176'
});
})



router.get('/fix-incentive-member-performance',(req,res)=>{
  pool.query(`SELECT 
  a.id,
  a.name,
  a.start_date,
  a.end_date,
  a.total_links,
  IFNULL(b.total_valid_watch_logs, 0) AS watch_logs
FROM (
  SELECT 
    s.id,
    s.name,
    DATE(MIN(l.created_at)) AS start_date,
    DATE_ADD(DATE(MIN(l.created_at)), INTERVAL 30 DAY) AS end_date,
    COUNT(*) AS total_links
  FROM shopkeeper s
  JOIN links l ON s.id = l.promoter_id
  WHERE s.isFixIncentiveJoin = 1
  GROUP BY s.id, DATE(l.created_at)
  HAVING COUNT(*) >= 15
) a
LEFT JOIN (
  SELECT 
    l.promoter_id,
    COUNT(v.id) AS total_valid_watch_logs
  FROM links l
  JOIN video_watch_logs v ON l.id = v.link_id
  WHERE v.watched_seconds > 60
  GROUP BY l.promoter_id
) b ON a.id = b.promoter_id;
`,(err,result)=>{
  if(err) throw err;
  else res.json(result)
})
})













router.get('/benefits/pending', async (req, res, next) => {
  try {
    const { ambassador_id } = req.query; // optional filter
    const params = [];
    const filter = ambassador_id ? ' AND s.id = ? ' : '';
    if (ambassador_id) params.push(ambassador_id);

    const rows = await queryAsync(`
      WITH vd AS (
        SELECT brand_ambassador_id, COUNT(*) AS verified_days
        FROM internship_day
        WHERE status = 'verified'
        GROUP BY brand_ambassador_id
      )
      SELECT
        s.id  AS brand_ambassador_id,
        s.name, s.number, s.address,
        IFNULL(vd.verified_days, 0) AS verified_days,
        b.id  AS benefit_id, b.code, b.title, b.phase, b.day_threshold
      FROM shopkeeper s
      LEFT JOIN vd ON vd.brand_ambassador_id = s.id
      CROSS JOIN benefits b
      LEFT JOIN benefit_claims bc
        ON bc.brand_ambassador_id = s.id
       AND bc.benefit_id = b.id
      WHERE 1=1
        AND s.created_at >= '2025-07-18'
        ${filter}
        AND IFNULL(vd.verified_days, 0) >= b.day_threshold
        AND bc.id IS NULL
      ORDER BY s.name, b.sort_order
    `, params);

    // group rows by ambassador
    const groups = new Map();
    for (const r of rows) {
      const id = r.brand_ambassador_id;
      if (!groups.has(id)) {
        groups.set(id, {
          id,
          name: r.name,
          number: r.number,
          address: r.address,
          verified_days: r.verified_days,
          benefits: []
        });
      }
      groups.get(id).benefits.push(r);
    }
    const groupedList = Array.from(groups.values());

    res.render(`${folder}/admin-benefits-pending`, { groupedList });
  } catch (e) { next(e); }
});

  // Tracker (optionally filter by ambassador)
  router.get('/benefits/tracker', async (req, res, next) => {
    try {
      const { ambassador_id } = req.query;
      const params = [];
      const filter = ambassador_id ? ' AND s.id = ? ' : '';
      if (ambassador_id) params.push(ambassador_id);

      const rows = await queryAsync(`
        WITH vd AS (
          SELECT brand_ambassador_id, COUNT(*) AS verified_days
          FROM internship_day
          WHERE status = 'verified'
          GROUP BY brand_ambassador_id
        )
        SELECT s.id AS brand_ambassador_id, s.name,
               IFNULL(vd.verified_days,0) AS verified_days,
               b.id AS benefit_id, b.code, b.title, b.phase, b.day_threshold,
               CASE WHEN IFNULL(vd.verified_days,0) >= b.day_threshold THEN 1 ELSE 0 END AS is_unlocked,
               bc.status, bc.claimed_at, bc.sent_email_to
        FROM shopkeeper s
        LEFT JOIN vd ON vd.brand_ambassador_id = s.id
        CROSS JOIN benefits b
        LEFT JOIN benefit_claims bc ON bc.brand_ambassador_id = s.id AND bc.benefit_id = b.id
        WHERE s.created_at >= '2025-07-18' ${filter}
        ORDER BY s.name, b.sort_order
      `, params);

      // group rows by ambassador for the EJS
      const byAmb = {};
      for (const r of rows) {
        const k = r.brand_ambassador_id;
        if (!byAmb[k]) byAmb[k] = { 
          ambassador_id: k, 
          name: r.name, 
          verified_days: r.verified_days, 
          benefits: [] 
        };
        byAmb[k].benefits.push(r);
      }
      res.render(`${folder}/admin-benefits-tracker`, { data: Object.values(byAmb) });
      // res.json({data: Object.values(byAmb)})
    } catch (e) { next(e); }
  });



  // Claim endpoint (server-side validation prevents duplicates)
  router.post('/benefits/claim', async (req, res, next) => {
 
    console.log('body',req.body)

  const { brand_ambassador_id, benefit_id } = req.body;
  const admin_user_id = req.user?.id || null;

  try {
    // 1) Check verified days
    const [{ verified_days = 0 } = {}] = await queryAsync(
      `SELECT COUNT(*) AS verified_days
         FROM internship_day
        WHERE brand_ambassador_id = ? AND status = 'verified'`,
      [brand_ambassador_id]
    );


    console.log('verified_days',verified_days)

    // 2) Get the benefit threshold
    const [benefit] = await queryAsync(
      `SELECT id, day_threshold, title FROM benefits WHERE id = ?`,
      [benefit_id]
    );
    if (!benefit) return res.status(404).json({ ok: false, message: 'Benefit not found' });

    if (verified_days < benefit.day_threshold) {
      return res.status(400).json({ ok: false, message: 'Not eligible yet (verified days below threshold).' });
    }

    console.log('benefit',benefit)


    // 3) Ensure not already claimed
    const [exists] = await queryAsync(
      `SELECT id FROM benefit_claims WHERE brand_ambassador_id = ? AND benefit_id = ?`,
      [brand_ambassador_id, benefit_id]
    );
    if (exists) {
      return res.status(409).json({ ok: false, message: 'Already claimed' });
    }


    console.log('exists',exists)


    // 4) Insert claim (no email)
    const ins = await queryAsync(
      `INSERT INTO benefit_claims
         (brand_ambassador_id, benefit_id, status, admin_user_id, claimed_at)
       VALUES (?, ?, 'issued', ?, NOW())`,
      [brand_ambassador_id, benefit_id, admin_user_id]
    );

    console.log('ins',ins)


    return res.json({ ok: true, claim_id: ins.insertId, message: 'Benefit claimed.' });
   } catch (e) {
  console.error('Claim error:', e); // <--- ADD THIS
  if (e && e.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ ok: false, message: 'Already claimed' });
  }
  if (e && e.code === 'ER_BAD_FIELD_ERROR') {
    return res.status(500).json({ ok: false, message: 'Column missing in benefit_claims (check claimed_at, status, etc.)' });
  }
  if (e && e.code === 'ER_BAD_ENUM_VALUE') {
    return res.status(400).json({ ok: false, message: 'Invalid status value for benefit_claims.status' });
  }
  next(e);
}
});


const ejs  = require('ejs');

router.get('/benefits/preview', async (req, res, next) => {
  try {
    const { ambassador_id, benefit_id } = req.query;

    const [amb] = await queryAsync(
      `SELECT id, name, number, email, address, image_url, created_at
       FROM shopkeeper WHERE id = ?`,
      [ambassador_id]
    );

    console.log('amb',amb)


    const [benefit] = await queryAsync(
      `SELECT id, code, title, day_threshold, template_path, subject_template, filename_template
       FROM benefits WHERE id = ?`,
      [benefit_id]
    );

    console.log('benefit',benefit)

    if (!amb || !benefit || !benefit.template_path) {
      return res.status(404).send('Template or data not found');
    }

    // Common template data
    const data = {
      ...amb,
      benefit,
      today: new Date(),
      slug: (amb.name || 'user').toLowerCase().replace(/\s+/g,'_'),
      org: {
        name: 'FileMakr',
        logo: 'https://res.cloudinary.com/dggf8vl9p/image/upload/v1718627756/filemakr-project-file-creator-favicon_1_dqogst.avif',
        website: 'https://filemakr.com',
        supportEmail: 'info@filemakr.com'
      },
      // QR payload example (string you might convert to a QR image client-side)
      qrPayload: JSON.stringify({ id: amb.id, code: benefit.code, ts: Date.now() })
    };

    const filePath = path.join('views', benefit.template_path);
    ejs.renderFile(filePath, data, (err, html) => {
      if (err) return next(err);
      res.send(html); // preview as HTML
    });
  } catch (e) { next(e); }
});


const puppeteer = require('puppeteer');

router.post('/benefits/generate', async (req, res, next) => {
  try {

    console.log('req.body',req.body)
    const { ambassador_id, benefit_id } = req.body;

    const [amb] = await queryAsync(`SELECT id, name, number, email, address, image_url, created_at
       FROM shopkeeper WHERE id = ?`, [ambassador_id]);
    const [benefit] = await queryAsync(
      `SELECT code, title, template_path, filename_template
       FROM benefits WHERE id = ?`, [benefit_id]
    );
    if (!amb || !benefit || !benefit.template_path) {
      return res.status(404).json({ ok:false, message:'Template or data not found' });
    }

    const data = {
      ...amb,
      benefit,
      today: new Date(),
      slug: (amb.name || 'user').toLowerCase().replace(/\s+/g,'_'),
      org: {
        name: 'FileMakr',
        logo: 'https://res.cloudinary.com/dggf8vl9p/image/upload/v1718627756/filemakr-project-file-creator-favicon_1_dqogst.avif',
        website: 'https://filemakr.com',
        supportEmail: 'info@filemakr.com'
      },
    };

    // Render HTML
    const html = await ejs.renderFile(
      path.join('views', benefit.template_path),
      data
    );

    // Generate PDF
    const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });

    // A4 default; for ID cards we’ll set custom size inside the template (see below)
    const fileName = ejs.render(benefit.filename_template || 'benefit_<%= slug %>.pdf', data);
    const outPath = path.join(__dirname, '..', 'storage', 'benefits', String(ambassador_id));
    fs.mkdirSync(outPath, { recursive: true });
    const filePath = path.join(outPath, fileName);

    await page.pdf({ path: filePath, format: 'A4', printBackground: true });
    await browser.close();

    // Optionally: mark claim as 'generated' or 'sent' later
    // await pool.query(`UPDATE benefit_claims SET status='generated', file_path=? WHERE brand_ambassador_id=? AND benefit_id=?`, [filePath, ambassador_id, benefit_id]);

    res.json({ ok:true, filePath, fileName });
  } catch (e) { next(e); }
});



router.get('/referal-tree',(req,res)=>{
  pool.query(`SELECT 
  a1.name AS referrer_name,
  COUNT(a2.id) AS total_referred,
  GROUP_CONCAT(a2.name SEPARATOR ', ') AS referred_names
FROM shopkeeper a1
LEFT JOIN shopkeeper a2 ON a2.referal_code= a1.unique_code
GROUP BY a1.id
ORDER BY total_referred DESC;`,(err,result)=>{
  if(err) throw err;
  else res.render(`${folder}/referal_tree`,{result})
})
})




// const { nanoid } = require('nanoid');

// // Helper to ensure unique short_code (rarely needed, but safe)
// async function generateUniqueShortCode(queryAsync, maxAttempts = 5) {
//   for (let i = 0; i < maxAttempts; i++) {
//     const code = nanoid(6);
//     const rows = await queryAsync('SELECT 1 FROM links WHERE short_code = ? LIMIT 1', [code]);
//     if (rows.length === 0) return code;
//   }
//   throw new Error('Failed to generate a unique short code after multiple attempts.');
// }

// /**
//  * Bulk create links for a promoter, then set isFixIncentiveJoin = 1.
//  * @param {function} queryAsync - promisified DB query function
//  * @param {number|string} promoterId
//  * @param {string[]} urls
//  * @returns {Promise<Array<{original_url: string, short_code: string}>>}
//  */
// async function createBulkLinks(queryAsync, promoterId, urls) {
//   if (!promoterId) throw new Error('promoterId is required');
//   if (!Array.isArray(urls) || urls.length === 0) throw new Error('urls must be a non-empty array');

//   // Normalize & de-duplicate URLs while preserving order
//   const seen = new Set();
//   const cleanUrls = [];
//   for (const u of urls.map(u => String(u).trim()).filter(Boolean)) {
//     if (!seen.has(u)) { seen.add(u); cleanUrls.push(u); }
//   }

//   // Prepare rows with unique short codes
//   const prepared = [];
//   for (const original_url of cleanUrls) {
//     const short_code = await generateUniqueShortCode(queryAsync);
//     prepared.push({ original_url, short_code });
//   }

//   // Build a single multi-value INSERT statement
//   const valuesSql = prepared.map(() => '(?, ?, ?, NOW())').join(', ');
//   const params = [];
//   for (const row of prepared) {
//     params.push(promoterId, row.original_url, row.short_code);
//   }

//   try {
//     await queryAsync('START TRANSACTION');

//     await queryAsync(
//       `INSERT INTO links (promoter_id, original_url, short_code, created_at)
//        VALUES ${valuesSql}`,
//       params
//     );

//     await queryAsync(
//       'UPDATE shopkeeper SET isFixIncentiveJoin = 1 WHERE id = ?',
//       [promoterId]
//     );

//     await queryAsync('COMMIT');
//     return prepared; // [{original_url, short_code}, ...]
//   } catch (err) {
//     await queryAsync('ROLLBACK');

//     // If collision somehow slipped through, surface a helpful message
//     if (err && err.code === 'ER_DUP_ENTRY') {
//       err.message = 'Duplicate short_code encountered. Please retry.';
//     }
//     throw err;
//   }
// }

// ---------- Express Route Example ----------

/**
 * POST /shopkeeper/generate-links-bulk
 * Body:
 * {
 *   "promoterId": 123,
 *   "urls": ["https://...", "..."]   // optional; if omitted, defaults to the 15 YouTube URLs below
 * }
 */
// router.get(
//   '/shopkeeper/generate-links-bulk',
//   // verify.shopAuthenticationToken,
//   async (req, res) => {
//     try {
//       const promoterId = req.query.promoterId
//       const urls = Array.isArray(req.query.urls) && req.query.urls.length
//         ? req.query.urls
//         : [
//             'https://youtu.be/3_Sf6voNi_4',
//             'https://youtu.be/yfWQrMaQVdc',
//             'https://youtu.be/0cKV4SYeQQk',
//             'https://youtu.be/kcSF6m2icy0',
//             'https://youtu.be/Yk1dMnrHzpw',
//             'https://youtu.be/Xpg9I19F8kE',
//             'https://youtu.be/RRbD9D4w-GY',
//             'https://youtu.be/6PVxXYvOa78',
//             'https://youtu.be/R2VQeLlX70s',
//             'https://youtu.be/1rGs-t8pBto',
//             'https://youtu.be/v_X2ykG217k',
//             'https://youtu.be/oHSxkGbYV98',
//             'https://youtu.be/5IoSxgK2AG8',
//             'https://youtu.be/fBsgBS_Nl2E',
//             'https://youtu.be/C5ZG0yJWvLg',
//           ];

//       const created = await createBulkLinks(queryAsync, promoterId, urls);

//       // Example: redirect back to a page that can show results,
//       // or send JSON. Choose whichever suits your UI.
//       // res.redirect('/shopkeeper/generateLink');
//       res.json({
//         ok: true,
//         promoterId,
//         count: created.length,
//         links: created, // [{original_url, short_code}]
//       });
//     } catch (error) {
//       console.error('Bulk link generation failed:', error);
//       res.status(500).json({ ok: false, message: error.message || 'Internal Server Error' });
//     }
//   }
// );



const { nanoid } = require('nanoid');

// Assumes you have a promisified MySQL query function:
// const queryAsync = util.promisify(connection.query).bind(connection);

/** Generate a unique short code with collision check */
async function generateUniqueShortCode(queryAsync, maxAttempts = 5) {
  for (let i = 0; i < maxAttempts; i++) {
    const code = nanoid(6);
    const rows = await queryAsync(
      'SELECT 1 FROM fileachiever.links WHERE short_code = ? LIMIT 1',
      [code]
    );
    if (rows.length === 0) return code;
  }
  throw new Error('Failed to generate a unique short code after multiple attempts.');
}

/** Try to get shopkeepers by isFixInceitve=1; if the column doesn’t exist, try isFixIncentiveJoin=1 */
async function getEligibleShopkeepers(queryAsync) {
  try {
    return await queryAsync('SELECT id FROM shopkeeper WHERE isFixInceitve = 1');
  } catch (e) {
    // ER_BAD_FIELD_ERROR (1054) -> fallback to prior column name
    if (e && (e.code === 'ER_BAD_FIELD_ERROR' || e.errno === 1054)) {
      return await queryAsync('SELECT id FROM shopkeeper WHERE isFixIncentiveJoin = 1');
    }
    throw e;
  }
}

/** Insert missing URLs for a single promoter */
async function assignMissingYoutubeLinksToPromoter(queryAsync, promoterId, allYoutubeUrls) {
  // Get existing original_url for this promoter from fileachiever.links
  const existing = await queryAsync(
    'SELECT original_url FROM fileachiever.links WHERE promoter_id = ?',
    [promoterId]
  );
  const existingSet = new Set(existing.map(r => String(r.original_url).trim()));

  // Compute missing URLs (preserve order, dedupe source list)
  const seen = new Set();
  const missing = [];
  for (const raw of allYoutubeUrls) {
    const url = String(raw).trim();
    if (!url) continue;
    if (seen.has(url)) continue;      // dedupe source list
    seen.add(url);
    if (!existingSet.has(url)) {
      missing.push(url);
    }
  }

  if (missing.length === 0) return { inserted: 0, skipped: allYoutubeUrls.length };

  // Prepare rows (promoter_id, original_url, short_code, created_at)
  const prepared = [];
  for (const original_url of missing) {
    const short_code = await generateUniqueShortCode(queryAsync);
    prepared.push({ original_url, short_code });
  }

  // Build bulk insert
  const valuesSql = prepared.map(() => '(?, ?, ?, NOW())').join(', ');
  const params = [];
  for (const row of prepared) {
    params.push(promoterId, row.original_url, row.short_code);
  }

  await queryAsync('START TRANSACTION');
  try {
    await queryAsync(
      `INSERT INTO fileachiever.links (promoter_id, original_url, short_code, created_at)
       VALUES ${valuesSql}`,
      params
    );
    await queryAsync('COMMIT');

    return { inserted: prepared.length, skipped: allYoutubeUrls.length - prepared.length };
  } catch (err) {
    await queryAsync('ROLLBACK');
    // Handle a race where original_url is uniquely constrained by (promoter_id, original_url)
    if (err && err.code === 'ER_DUP_ENTRY') {
      // In rare cases of race, just report zero inserted for safety.
      return { inserted: 0, skipped: allYoutubeUrls.length };
    }
    throw err;
  }
}

/**
 * Route: Assign all youtube_link URLs to every eligible shopkeeper
 * Only insert URLs that are NOT already present in fileachiever.links for that promoter.
 */
router.get('/shopkeeper/assign-youtube-links', async (req, res) => {
  try {
    // 1) Shopkeepers with the flag = 1
    const shopkeepers = await getEligibleShopkeepers(queryAsync);
    if (shopkeepers.length === 0) {
      return res.json({ ok: true, message: 'No eligible shopkeepers found.', totalPromoters: 0, totalInserted: 0 });
    }

    // 2) All youtube_link rows
    const ytRows = await queryAsync('SELECT link FROM youtube_link');
    const allYoutubeUrls = ytRows.map(r => String(r.link).trim()).filter(Boolean);
    if (allYoutubeUrls.length === 0) {
      return res.json({ ok: true, message: 'No youtube_link entries found.', totalPromoters: shopkeepers.length, totalInserted: 0 });
    }

    // 3) For each shopkeeper, insert only missing URLs into fileachiever.links
    const summary = [];
    let totalInserted = 0;
    for (const { id: promoterId } of shopkeepers) {
      const { inserted, skipped } = await assignMissingYoutubeLinksToPromoter(
        queryAsync,
        promoterId,
        allYoutubeUrls
      );
      totalInserted += inserted;
      summary.push({ promoterId, inserted, skipped });
    }

    // Optional: return a sample of current links if you want
    // const linksPreview = await queryAsync(
    //   'SELECT id, promoter_id, original_url, short_code, created_at FROM fileachiever.links ORDER BY id DESC LIMIT 20'
    // );

    return res.json({
      ok: true,
      message: 'YouTube links assigned where missing. Existing links were left untouched.',
      totalPromoters: shopkeepers.length,
      totalInserted,
      details: summary,
      // preview: linksPreview,
    });
  } catch (error) {
    console.error('Assigning YouTube links failed:', error);
    return res.status(500).json({ ok: false, message: error.message || 'Internal Server Error' });
  }
});






module.exports = router;
