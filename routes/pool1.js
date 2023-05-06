 
var mysql = require('mysql')



const pool = mysql.createPool({

  host : 'db-mysql-blr1-69812-do-user-12247241-0.b.db.ondigitalocean.com',
  user: 'doadmin',
 password:'AVNS_y2INtIf0l_w0ZJgiY29',
   database: 'property_listing',
   port:'25060' ,
   multipleStatements: true
 })
  


module.exports = pool;

