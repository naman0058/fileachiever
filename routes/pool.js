
var mysql = require('mysql')

const pool = mysql.createPool({

  host : 'db-mysql-blr1-55215-do-user-13029391-0.b.db.ondigitalocean.com',
   user: 'doadmin',
  password:'AVNS_BUlYRoHmtHSKlCjHe5y',
    database: 'fileachiever',
    port:'25060' ,
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




