
var express = require('express');
var router = express.Router();
var mysql = require('mysql')
var pool = require('./pool')
var table = 'admin'
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



module.exports = router;