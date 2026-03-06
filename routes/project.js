var express = require('express');
var router = express.Router();
var pool = require('./pool');
var upload = require('./multer');
var table = 'project';

router.get('/', (req, res) => req.session.adminid ? res.render(`project`) : res.render(`admin`,{msg : 'Enter Login Details'}))

router.post('/insert',upload.fields([{ name: 'index_page', maxCount: 1 }, { name: 'database_page', maxCount: 1 },
                                     { name: 'front_page', maxCount: 1 }, { name: 'admin_page', maxCount: 1 },
                                     { name: 'dashboard_page', maxCount: 1 }, { name: 'user_page', maxCount: 1 }]),(req,res)=> {
                                         let body = req.body;  
                                         var dirt = false
                                         var seo_variable = (body.name.split(' ').join('-')).toLowerCase()
                                         body['index_page'] = req.files['index_page'][0].filename
                                         body['database_page'] = req.files['database_page'][0].filename
                                         body['front_page'] = req.files['front_page'][0].filename
                                         body['admin_page'] = req.files['admin_page'][0].filename
                                         body['dashboard_page'] = req.files['dashboard_page'][0].filename
                                         body['user_page'] = req.files['user_page'][0].filename
                                        body['seo_name'] = seo_variable 
                                        
                                         pool.query(`insert into ${table} set ?`,body,(err,result)=>err ? console.log(err) : res.json(result))

});

router.get('/all',(req,res)=>pool.query(`select * from ${table}`,(err,result)=> err ? console.log(err) : res.json(result)))

router.get('/delete', (req, res) => pool.query(`delete from ${table} where id = ${req.query.id}`, (err, result) => err ? console.log(err) : res.json(result)))

router.post('/update', (req, res) => pool.query(`update ${table} set ? where id = ?`, [req.body, req.body.id], (err, result) => err ? console.log(err) : res.json(result)))

module.exports = router;