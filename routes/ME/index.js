var express = require('express');
var router = express.Router();
var pool = require('../pool')
var table = 'me_project'
var upload = require('../multer');


var today = new Date();
var dd = String(today.getDate()).padStart(2, '0');
var mm = String(today.getMonth() + 1).padStart(2, '0'); //January is 0!
var yyyy = today.getFullYear();

today = yyyy + '-' + mm + '-' + dd;



router.get('/', (req, res) => { pool.query(`select name,seo_name,short_description from project where er_diagram is not null`,
(err,result)=>err ? console.log(err) : res.render('ME/index',{result:result}))
})




router.post('/insert',upload.fields([{ name: 'college_logo', maxCount: 1 }, { name: 'affilated_college_logo', maxCount: 1 }]),(req,res)=>{
    let body = req.body
    body['college_logo'] = req.files['college_logo'][0].filename
    body['affilated_college_logo'] = req.files['affilated_college_logo'][0].filename
    body['date'] = today
    req.session.roll_number = body.roll_number
    console.log(req.body)
    pool.query(`insert into ${table} set ?`,body,(err,result)=>{
      if(err) throw err;
      else{
        res.redirect('/me-final-year-project-report/projects')
    }
    })
})




router.get('/projects',(req,res)=>{
    if(req.session.roll_number){


if(req.session.deviceInfo == 'mobile'){




  pool.query(`select * from ${table} where roll_number = "${req.session.roll_number}" order by id desc limit 1`,(err,result)=>{
        if(err) throw err;
        else {
            console.log(req.session.roll_number)
            console.log(result[0].php)
           var query = `select * from ${table} where roll_number = "${req.session.roll_number}" order by id desc limit 1;`
           var query1 = `select * from programming_language where id = "${result[0].html}" || id = "${result[0].css}" || id = "${result[0].bootstrap}" || id = "${result[0].javascript}" || id = "${result[0].jquery}" || id = "${result[0].json}" || id = "${result[0].react}" || id = "${result[0].angular}"  ;`
           var query2 = `select * from programming_language where id = "${result[0].php}" || id = "${result[0].nodejs}" || id = "${result[0].python}" || id = "${result[0].java}";`
           var query3 = `select * from project where id = "${result[0].projectid}";`
           //For Testing
             var query4 = `select name ,er_diagram , general_overview_diagram , use_case_diagram from project where er_diagram is not null;`
           pool.query(query+query1+query2+query3+query4,(err,result)=>{
               if(err) throw err;
               else res.render('ME/mobile_view',{result:result})
           })

        }
    })



}
else{


  pool.query(`select * from ${table} where roll_number = "${req.session.roll_number}" order by id desc limit 1`,(err,result)=>{
        if(err) throw err;
        else {
            console.log(req.session.roll_number)
            console.log(result[0].php)
           var query = `select * from ${table} where roll_number = "${req.session.roll_number}" order by id desc limit 1;`
           var query1 = `select * from programming_language where id = "${result[0].html}" || id = "${result[0].css}" || id = "${result[0].bootstrap}" || id = "${result[0].javascript}" || id = "${result[0].jquery}" || id = "${result[0].json}" || id = "${result[0].react}" || id = "${result[0].angular}"  ;`
           var query2 = `select * from programming_language where id = "${result[0].php}" || id = "${result[0].nodejs}" || id = "${result[0].python}" || id = "${result[0].java}";`
           var query3 = `select * from project where id = "${result[0].projectid}";`
         //For Testing
           var query4 = `select name ,er_diagram , general_overview_diagram , use_case_diagram from project where er_diagram is not null;`
           pool.query(query+query1+query2+query3+query4,(err,result)=>{
               if(err) throw err;
               else res.render('ME/final',{result:result})
           })

        }
    })

}

  
}
else{
    res.redirect('/')
}
})





module.exports = router;