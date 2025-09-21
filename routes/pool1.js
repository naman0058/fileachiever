
var mysql = require('mysql2/promise')

const pool = mysql.createPool({

  host : '64.227.185.217',
   user: 'root',
  password:'Np2tr6G84',
    database: 'fileachiever',
    port:'3306' ,
    multipleStatements: true


  // host : 'localhost',
  //  user: 'root',
  // password:'123',
  //   database: 'fileachiever',
  //   port:'3306' ,
  //   multipleStatements: true

  })



  // country , story , blog-category , blogs , state , 



  // var mysql = require('mysql')
  // require('dotenv').config()
  
  // const pool = mysql.createPool({
  //   host:'103.117.180.114',
  //   ///host : 'localhost',
  //    user: 'shopsun_shopsun',
  //   password:'Shopsun@321!',
  //     database: 'shopsun_shopsun',
  //     port:'3306' ,
  //     multipleStatements: true
  //   })
  
  
  
  
  // module.exports = pool;

module.exports = pool;




