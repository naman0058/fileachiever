var express = require('express');
var router = express.Router();
var pool = require('./pool');
var pool2 = require('./pool2');
const util = require('util');


const queryAsync = (query) => {
  return new Promise((resolve, reject) => {
    pool.query(query, (err, results) => {
      if (err) reject(err);
      else resolve(results);
    });
  });
};

const queryAsync2 = (query) => {
  return new Promise((resolve, reject) => {
    pool2.query(query, (err, results) => {
      if (err) reject(err);
      else resolve(results);
    });
  });
};

var upload = require('./multer');
var table = 'project';

// router.get('/', (req, res) =>  res.render(`sitemap`))

// router.get('/',(req,res)=>{
//     var query = `select * from category;`
//     var query1 = `SELECT * FROM source_code WHERE category IN ('php', 'node-js', 'python', 'codeigniter');`
//     // var query1 = `select * from source_code where category = 'php';`
//     var query2 = `select * from project where er_diagram is not null;`
//     pool.query(query+query1+query2,(err,result)=>{
//         if(err) throw err;
//         else res.render('sitemap',{result, lastupdate: new Date().toISOString().split('T')[0]})
//     })
// })



router.get('/', async (req, res) => {
  try {
    const lastupdate = new Date().toISOString().split('T')[0];

    // Run queries on primary DB
    const categories = await queryAsync(`SELECT * FROM category`);
    const sourceCodes = await queryAsync(
      `SELECT * FROM source_code WHERE category IN ('php', 'node-js', 'python', 'codeigniter')`
    );
    const projects = await queryAsync(`SELECT * FROM project WHERE er_diagram IS NOT NULL`);

    // Run query on secondary DB (blog)
    const blogs = await queryAsync2(`SELECT * FROM blogs`);

    // Combine all results
    const result = [sourceCodes, categories, projects, blogs];

    // Render sitemap
    res.set('Content-Type', 'application/xml');
    res.render('sitemap', { result, lastupdate });
    // res.json(result)

  } catch (err) {
    console.error('[Sitemap Error]', err);
    res.status(500).send('Error generating sitemap');
  }
});



// router.get('/blog',(req,res)=>{
//     pool2.query(`select * from blog`,(err,result)=>{
//         if(err) throw err;
//         else res.json(result)
//     })
// })

module.exports = router;