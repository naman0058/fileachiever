
var express = require('express');
var router = express.Router();
var mysql = require('mysql')
var pool = require('./pool')


router.get('/', (req, res) => { pool.query(`select name,seo_name,short_description from project`,
(err,result)=>err ? console.log(err) : res.render('index',{result:result}))
})

router.post('/contactus',(req,res)=>{
    let body = req.body
    console.log(body)
    pool.query(`insert into contactus set ?`,body,(err,result)=>err ? console.log(err) : res.send('OK'))
})

router.get('/synopsis', (req, res) => { pool.query(`select name,seo_name,short_description from project`,
(err,result)=>err ? console.log(err) : res.render('synopsis',{result:result}))
})



router.get('/cse/:name',(req,res)=>{
    var query = `select * from project where seo_name = "${req.params.name}";`
    var query1 = `select * from programming_language where name = 'PHP' || name = 'JavaScript' || name = 'HTML' || name='CSS' || name = 'Jquery' || name = 'JSON';`
    pool.query(query+query1,(err,result)=>{
        err ? console.log(err) : res.render('preview',{result:result})
    })
})




router.get('/cse/synopsis/:name',(req,res)=>{
    var query = `select * from project where seo_name = "${req.params.name}";`
    var query1 = `select * from programming_language where name = 'PHP' || name = 'JavaScript' || name = 'HTML' || name='CSS' || name = 'Jquery' || name = 'JSON';`
    pool.query(query+query1,(err,result)=>{
        err ? console.log(err) : res.render('synopsis-preview',{result:result})
    })
})



router.get('/cse/:name/customization',(req,res)=>{
    var query = `select * from project where id = '${req.session.customizationid}';`
    var query1 = `select name,id from programming_language;`
    pool.query(query+query1,(err,result)=>{
        err ? console.log(err) : res.render('customization',{result : result})
    })
    
})



router.get('/cse/synopsis/:name/customization',(req,res)=>{
    var query = `select * from project where id = '${req.session.customizationid}';`
    var query1 = `select name,id from programming_language;`
    pool.query(query+query1,(err,result)=>{
        err ? console.log(err) : res.render('synopis_customization',{result : result})
    })
    
})




router.get('/make-your-own-project-pricing-list', (req, res) => { pool.query(`select name,seo_name,short_description from project`,
(err,result)=>err ? console.log(err) : res.render('make-your-own-project-pricing-list',{result:result}))
})
module.exports = router;