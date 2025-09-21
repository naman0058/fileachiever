var express = require('express');
var router = express.Router();
var pool = require('./pool')
var table = 'notes'

router.get('/', (req, res) =>  res.render(`notes`));




router.post('/insert', (req, res) => pool.query(`update ${table} set download = download+1` , (err, result) => err ? console.log(err) : res.json(result)))


module.exports = router;