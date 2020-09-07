var mysql = require('mysql')
require('dotenv').config()

const pool = mysql.createPool({

  // host:process.env.DATABASEKEY,
  host : 'localhost',
   user: 'root',
  //password:process.env.DATABASEKEY1,
   password : '123',
    database: 'fileachiever',
    port:'3306' ,
    multipleStatements: true
  })


module.exports = pool;