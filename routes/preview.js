var express = require('express');
var router = express.Router();
var pool = require('./pool')
var table = 'programming_language'

router.get('/', (req, res) =>  res.render(`preview`));

router.get('/all',(req,res)=>pool.query(`select * from ${table}`,(err,result)=> err ? console.log(err) : res.json(result)))







module.exports = router;