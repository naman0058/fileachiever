
var express = require('express');
var router = express.Router();
var upload = require('./multer');
var mysql = require('mysql')
var pool = require('./pool')
var table = 'admin'
var table1 = 'add_project'
require('dotenv').config()
router.get('/', (req, res) => {
    res.render(`admin`,{msg : ''});
    
})


router.post('/login',(req,res)=>{
    let body = req.body;
    console.log("body",body.key)
   if(process.env.key == body.key) {
 pool.query(`select * from ${table} where username ="${body.username}" and password = "${body.password}"`,(err,result)=>{
    
     if(err) throw err;
     else if(result[0]) {
         req.session.adminid = result[0].id
         res.redirect('/adminhome')
        }
     else res.render(`admin`,{msg : 'Enter Wrong Creaditionals'})
 })
    }
    
    else res.render(`admin`,{msg : 'API KEY Is Invalid'})
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


module.exports = router;