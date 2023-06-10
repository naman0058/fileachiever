
var express = require('express');
var router = express.Router();
var upload = require('./multer');
var mysql = require('mysql')
var pool = require('./pool')
var pool2 = require('./pool2')
var table = 'admin'
var table1 = 'add_project'




const TelegramBot = require('node-telegram-bot-api');

// replace the value below with the Telegram token you receive from @BotFather
const token = '6224747889:AAE_ox7z8etC0_G8C5owm67Be644-G8htl4';

// Create a bot that uses 'polling' to fetch new updates
const bot = new TelegramBot(token, {polling: false});


require('dotenv').config()
router.get('/', (req, res) => {
    res.render(`admin`,{msg : ''});
    
})


router.post('/login',(req,res)=>{
    let body = req.body;
    console.log("body",body.key)
   if(process.env.key == body.key) {
 pool.query(`select * from ${table} where username ='${body.username}' and password = '${body.password}'`,(err,result)=>{
    
     if(err) throw err;
     else if(result[0]) {
         req.session.adminid = result[0].id
         res.redirect('/admin/dashboard/tasktango/jobs')
        }
     else res.render(`admin`,{msg : 'Enter Wrong Creaditionals'})
 })
    }
    
    else res.render(`admin`,{msg : 'API KEY Is Invalid'})
})






router.get('/add-project',(req,res)=>{
    pool.query(`select * from ${table1}`,(err,result)=>{
        if(err) throw err;
        else res.render('AddProject/add-project' , {result})
    })
    
})








router.post('/add-project/insert',upload.single('zip'),(req,res)=> {
                                         let body = req.body;  
                                         var dirt = false
                                         var seo_variable = (body.name.split(' ').join('-')).toLowerCase()
                                         body['source_code'] = req.file.filename
                                         body['seo_name'] = seo_variable 
                                         pool.query(`insert into ${table1} set ?`,body,(err,result)=>err ? console.log(err) : res.json(result))

});




router.get('/project-delete', (req, res) => pool.query(`delete from ${table1} where id = ${req.query.id}`, (err, result) => err ? console.log(err) : res.json(result)))







router.get('/dashboard/tasktango/:name',(req,res)=>{
    pool2.query(`select * from ${req.params.name} order by job_id desc limit 10`,(err,result)=>{
        if(err) throw err;
        else res.render(`TaskTango/${req.params.name}` , {result,type:req.params.name})
    })
    
})



router.post('/dashboard/tasktango/:name/insert',(req,res)=>{
    let body = req.body
    var today = new Date();
var dd = String(today.getDate()).padStart(2, '0');
var mm = String(today.getMonth() + 1).padStart(2, '0'); //January is 0!
var yyyy = today.getFullYear();

today = yyyy + '-' + mm + '-' + dd;

body['date'] = today;
   

    pool2.query(`insert into ${req.params.name} set ?`,body,(err,result)=>{
        if(err) throw err;
        else res.redirect(`/admin/dashboard/tasktango/${req.params.name}`)
    })
    
})




router.post('/dashboard/tasktango/:name/delete',(req,res)=>{
    let body = req.body
    // let body = req.body
    pool2.query(`delete from ${req.params.name} where job_id = ${req.body.id}`, (err, result) => {
        if(err) {
            res.json({
                status:500,
                type : 'error',
                description:err
            })
        }
        else {
            res.json({
                status:200,
                type : 'success',
                description:'successfully delete'
            })
        }
    })
    
})



const util = require('util');
const query = util.promisify(pool2.query).bind(pool2);

router.post('/send_notification', async (req, res) => {
    try {
      const pageSize = 100; // Number of records to process in each iteration
      const totalCountResult = await query('SELECT COUNT(*) AS total FROM users');
      const totalCount = totalCountResult[0].total;
      console.log('Total count:', totalCount);
  
      let offset = 0;
      let processedCount = 0;
      
      while (offset < totalCount) {
        const result = await query(`SELECT * FROM users LIMIT ${pageSize} OFFSET ${offset}`);
        
        for (let i = 0; i < result.length; i++) {
          try {
            await bot.sendMessage(result[i].user_key, `Hello ${result[i].username} \n\nNew enquiry on TaskTango!-client is waiting for your response! \n\n Get started by typing /start to get new leads every time.`);
            console.log('done');
          } catch (err) {
            if (err.response?.body?.description === 'Forbidden: bot was blocked by the user') {
              try {
                await query(`DELETE FROM users WHERE user_key = ${result[i].user_key}`);
                console.log('User deleted');
              } catch (deleteErr) {
                console.error('Error deleting user:', deleteErr);
              }
            } else {
              console.error('Another Error sending message:', err);
            }
          }
          processedCount++;
        }
  
        offset += pageSize;
      } 
  
      console.log('Total processed:', processedCount);
      res.json({ msg: 'send' });
    } catch (err) {
      console.error(err);
      res.json({ error: 'An error occurred' });
    }
  });
  


module.exports = router;
