var express = require('express');
var router = express.Router();
var pool = require('./pool')
var table = 'programming_language'

router.get('/', (req, res) => req.session.adminid ? res.render(`programming_language`) : res.render(`admin`,{msg : 'Enter Login Details'}))

router.post('/insert',(req,res)=> pool.query(`insert into ${table} set ? `,req.body,(err,result)=> err ? console.log(err) : res.json(result)))

router.get('/all',(req,res)=>pool.query(`select * from ${table}`,(err,result)=> err ? console.log(err) : res.json(result)))

router.get('/delete', (req, res) => pool.query(`delete from ${table} where id = ${req.query.id}`, (err, result) => err ? console.log(err) : res.json(result)))

router.post('/update', (req, res) => pool.query(`update ${table} set ? where id = ?`, [req.body, req.body.id], (err, result) => err ? console.log(err) : res.json(result)))

module.exports = router;