
var express = require('express');
var router = express.Router();
var mysql = require('mysql')
var pool = require('./pool')

router.get('/', (req, res) => { pool.query(`select name,seo_name,short_description from project`,
(err,result)=>err ? console.log(err) : res.render('index1',{result:result}))
})


router.get('/images',(req,res)=>{
	pool.query(`select * from project where er_diagram is not null`,(err,result)=>{
		err ? console.log(err) : res.render('index1',{result:result})
	})
})

module.exports = router;