
var express = require('express');
var router = express.Router();
var mysql = require('mysql')
var pool = require('./pool')


router.get('/', (req, res) => {
    if(req.session.id) {
      res.render(`index1`, { login: true });
    }
    else {
      res.render(`index1`, { login: false });
    }
})




module.exports = router;