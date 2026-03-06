 
var mysql = require('mysql')



const pool = mysql.createPool({

  host : 'db-mysql-blr1-78922-do-user-4199968-0.c.db.ondigitalocean.com',
  user: 'doadmin',
 password:'AVNS_GQrps4okJNd-Q3VSn68',
    database:"ivr",
    port:25060,
   multipleStatements: true,
   connectionLimit: 10,
 })


 



module.exports = pool;

