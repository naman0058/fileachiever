var express = require('express');
var router = express.Router();
var pool = require('./pool');
var upload = require('./multer');
var table = 'user_project';
var table1 = 'paid_project';




var today = new Date();
var dd = String(today.getDate()).padStart(2, '0');
var mm = String(today.getMonth() + 1).padStart(2, '0'); //January is 0!
var yyyy = today.getFullYear();

today = yyyy + '-' + mm + '-' + dd;


router.get('/', (req, res) => {
    var query = `select name,id from programming_language;`
    pool.query(query,(err,result)=>{
        err ? console.log(err) : res.render(`user_project`,{result:result})
    })
}) 
    
router.post('/insert',upload.fields([{ name: 'index_page', maxCount: 1 }, { name: 'database_page', maxCount: 1 },
                                     { name: 'front_page', maxCount: 1 }, { name: 'admin_page', maxCount: 1 },
                                     { name: 'dashboard_page', maxCount: 1 }, { name: 'user_page', maxCount: 1 },
                                     { name: 'college_logo', maxCount: 1 }, { name: 'affilated_college_logo', maxCount: 1 }]),(req,res)=> {
                                         let body = req.body
                                         body['index_page'] = req.files['index_page'][0].filename
                                         body['database_page'] = req.files['database_page'][0].filename
                                         body['front_page'] = req.files['front_page'][0].filename
                                         body['admin_page'] = req.files['admin_page'][0].filename
                                         body['dashboard_page'] = req.files['dashboard_page'][0].filename
                                         body['user_page'] = req.files['user_page'][0].filename
                                         body['college_logo'] = req.files['college_logo'][0].filename
                                         body['affilated_college_logo'] = req.files['affilated_college_logo'][0].filename
                                         body['date'] = today
                                         req.session.roll_number = body.roll_number
                                       
                                         if(process.env.key==body.key){

                                            pool.query(`insert into ${table1} set ?`,body,(err,result)=>err ? console.log(err) : res.json(result))
   
                                    
                                         }
                                         else{
                                            pool.query(`insert into ${table} set ?`,body,(err,result)=>err ? console.log(err) : res.redirect('/user-project/projects'))
                                          
                                         }
                                        });

router.get('/projects',(req,res)=>{
if(req.session.roll_number){
pool.query(`select * from user_project where roll_number = "${req.session.roll_number}" order by id desc limit 1`,(err,result)=>{
 if(err) throw err;
                                                else {
                                                    console.log(result[0].php)
                                                   var query = `select * from user_project where roll_number = "${req.session.roll_number}" order by id desc limit 1;`
                                                   var query1 = `select * from programming_language where id = "${result[0].php}";`
                                                   var query2 = `select * from programming_language where id = "${result[0].nodejs}";`
                                                   var query3 = `select * from programming_language where id = "${result[0].angular}";`
                                                   var query4 = `select * from programming_language where id = "${result[0].react}";`
                                                   var query5 = `select * from programming_language where id = "${result[0].java}";`
                                                   var query6 = `select * from programming_language where id = "${result[0].html}";`
                                                   var query7 = `select * from programming_language where id = "${result[0].python}";`
                                                   var query8 = `select * from programming_language where id = "${result[0].javascript}";`
                                                   var query9 = `select * from programming_language where id = "${result[0].jquery}";`
                                                   var query10 = `select * from programming_language where id = "${result[0].json}";`
                                                   var query11 = `select * from programming_language where id = "${result[0].css}";`
                                                   var query12 = `select * from programming_language where id = "${result[0].bootstrap}";`
                                                   pool.query(query+query1+query2+query3+query4+query5+query6+query7+query8+query9+query10+query11+query12,(err,result)=>{
                                                       if(err) throw err;
                                                       else res.render(`user-project-preview`,{result})
                                                   })
                                        
                                                }
                                            })
                                        }
                                        else{
                                            res.redirect('/')
                                        }
                                        })
                                        
                                        


router.get('/all',(req,res)=>pool.query(`select * from ${table}`,(err,result)=> err ? console.log(err) : res.json(result)))

router.get('/delete', (req, res) => pool.query(`delete from ${table} where id = ${req.query.id}`, (err, result) => err ? console.log(err) : res.json(result)))

router.post('/update', (req, res) => pool.query(`update ${table} set ? where id = ?`, [req.body, req.body.id], (err, result) => err ? console.log(err) : res.json(result)))

module.exports = router;

