var express = require('express');
var router = express.Router();
var pool = require('../pool')
var table = 'be_project'
var upload = require('../multer');




var today = new Date();
var dd = String(today.getDate()).padStart(2, '0');
var mm = String(today.getMonth() + 1).padStart(2, '0'); //January is 0!
var yyyy = today.getFullYear();

today = yyyy + '-' + mm + '-' + dd;



router.get('/', (req, res) => { pool.query(`select name,seo_name,short_description from project where er_diagram is not null`,
(err,result)=>err ? console.log(err) : res.render('BE/index',{result:result}))
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
        res.redirect('/ieee-standard-project-report/projects')
    }
    })
})





router.get('/projects',(req,res)=>{
    if(req.session.roll_number){
    pool.query(`select * from ${table} where roll_number = "${req.session.roll_number}" order by id desc limit 1`,(err,result)=>{
        if(err) throw err;
        else {
            console.log(req.session.roll_number)
            console.log(result[0].php)
           var query = `select * from ${table} where roll_number = "${req.session.roll_number}" order by id desc limit 1;`
           var query1 = `select * from programming_language where id = "${result[0].php}";`
           var query2 = `select * from programming_language where id = "${result[0].nodejs}";`
           var query3 = `select * from programming_language where id = "${result[0].angular}";`
           var query4 = `select * from programming_language where id = "${result[0].react}";`
           var query5 = `select * from programming_language where id = "${result[0].java}";`
           var query6 = `select * from programming_language where id = "${result[0].html}";`
           var query7 = `select * from programming_language where id = "${result[0].python}";`
           var query8 = `select * from programming_language where id = "${result[0].javascript}";`
           var query9 = `select * from programming_language where id = "${result[0].jquery}";`
           var query10 = `select * from programming_language where id = "${result[0].json}";`
           var query11 = `select * from programming_language where id = "${result[0].css}";`
           var query12 = `select * from programming_language where id = "${result[0].bootstrap}";`
         var query14 = `select * from project where id = "${result[0].projectid}";`
           pool.query(query+query1+query2+query3+query4+query5+query6+query7+query8+query9+query10+query11+query12+query14,(err,result)=>{
               if(err) throw err;
               else res.render(`ieee/project-preview`,{result})
           })

        }
    })
}
else{
    res.redirect('/')
}
})










module.exports = router;