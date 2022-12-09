var express = require('express');
var router = express.Router();
var pool = require('../pool')
var table = 'btech_project'
var upload = require('../multer');




var today = new Date();
var dd = String(today.getDate()).padStart(2, '0');
var mm = String(today.getMonth() + 1).padStart(2, '0'); //January is 0!
var yyyy = today.getFullYear();

today = yyyy + '-' + mm + '-' + dd;






router.get('/', (req, res) => { pool.query(`select name,seo_name,short_description from project where er_diagram is not null`,
(err,result)=>err ? console.log(err) : res.render('B.Tech/index',{result:result}))
})





router.post('/insert',upload.fields([{ name: 'college_logo', maxCount: 1 }, { name: 'affilated_college_logo', maxCount: 1 }]),(req,res)=>{
    let body = req.body
    console.log(req.body)
    if(req.body.html){
      body['college_logo'] = req.files['college_logo'][0].filename
    body['affilated_college_logo'] = req.files['affilated_college_logo'][0].filename
    body['date'] = today
    body['view'] = req.session.deviceInfo
    req.session.roll_number = body.roll_number
    console.log(req.body)
    pool.query(`insert into ${table} set ?`,body,(err,result)=>{
      if(err) throw err;
      else{
        res.redirect('/btech-final-year-project-report/projects')
    }
    })
    }
    else if(!req.body.html){
res.redirect(`/btech-final-year-project-report-${req.body.seo_name}/edit`)
    }

})





router.get('/projects',(req,res)=>{

    if(req.session.roll_number){


if(req.session.deviceInfo == 'mobile'){




  pool.query(`select * from ${table} where roll_number = '${req.session.roll_number}' order by id desc limit 1`,(err,result)=>{
        if(err) throw err;
        else {
            console.log(req.session.roll_number)
            console.log(result[0].php)
           var query = `select * from ${table} where roll_number = '${req.session.roll_number}' order by id desc limit 1;`
           var query1 = `select * from programming_language where id = '${result[0].html}' or id = '${result[0].css}' or id = '${result[0].bootstrap}' or id = '${result[0].javascript}' or id = '${result[0].jquery}' or id = '${result[0].json}' or id = '${result[0].react}' or id = '${result[0].angular}'  ;`
           var query2 = `select * from programming_language where id = '${result[0].php}' or id = '${result[0].nodejs}' or id = '${result[0].python}' or id = '${result[0].java}';`
           var query3 = `select * from project where id = '${result[0].projectid}';`
           //For Testing

           pool.query(query+query1+query2+query3,(err,result)=>{
               if(err) throw err;
               //else res.json(result)
                else res.render('B.Tech/mobile_view',{result:result})
           })

        }
    })



}
else{


  pool.query(`select * from ${table} where roll_number = '${req.session.roll_number}' order by id desc limit 1`,(err,result)=>{
        if(err) throw err;
        else {
            console.log(req.session.roll_number)
            console.log(result[0].php)
           var query = `select * from ${table} where roll_number = '${req.session.roll_number}' order by id desc limit 1;`
           var query1 = `select * from programming_language where id = '${result[0].html}' or id = '${result[0].css}' or id = '${result[0].bootstrap}' or id = '${result[0].javascript}' or id = '${result[0].jquery}' or id = '${result[0].json}' or id = '${result[0].react}' or id = '${result[0].angular}'  ;`
           var query2 = `select * from programming_language where id = '${result[0].php}' or id = '${result[0].nodejs}' or id = '${result[0].python}' or id = '${result[0].java}';`
           var query3 = `select * from project where id = '${result[0].projectid}';`
         //For Testing

           pool.query(query+query1+query2+query3,(err,result)=>{
               if(err) throw err;
               else res.render('B.Tech/final',{result:result})
           })

        }
    })

}


}
else{
    res.redirect('/')
}
})







router.get('/download-your-report',(req,res)=>{





  pool.query(`select * from ${table} where roll_number = '${req.query.roll_number}' order by id desc limit 1`,(err,result)=>{
        if(err) throw err;
        else {
            console.log(req.session.roll_number)
            console.log(result[0].php)
           var query = `select * from ${table} where roll_number = '${req.query.roll_number}' order by id desc limit 1;`
           var query1 = `select * from programming_language where id = '${result[0].html}' or id = '${result[0].css}' or id = '${result[0].bootstrap}' or id = '${result[0].javascript}' or id = '${result[0].jquery}' or id = '${result[0].json}' or id = '${result[0].react}' or id = '${result[0].angular}'  ;`
           var query2 = `select * from programming_language where id = '${result[0].php}' or id = '${result[0].nodejs}' or id = '${result[0].python}' or id = '${result[0].java}';`
           var query3 = `select * from project where id = '${result[0].projectid}';`
           //For Testing

           pool.query(query+query1+query2+query3,(err,result)=>{
               if(err) throw err;
               //else res.json(result)
                else res.render('B.Tech/mobile_view',{result:result})
           })

        }
    })







})



module.exports = router;
