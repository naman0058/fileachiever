var express = require('express');
var router = express.Router();
var pool = require('./pool')
var table = 'programming_language'
var upload = require('./multer');

router.post('/',(req,res)=>{
    req.session.customizationid = req.body.id
    res.send('perfect-run')
})

router.post('/insert',upload.fields([{ name: 'college_logo', maxCount: 1 }, { name: 'affilated_college_logo', maxCount: 1 }]),(req,res)=>{
    let body = req.body
    console.log(req.body)
    /*body['college_logo'] = req.files['college_logo'][0]
    body['affilated_college_logo'] = req.files['affilated_college_logo'][0]
    req.session.roll_number = body.roll_number
    console.log(req.body)
    pool.query(`insert into customize_project set ?`,body,(err,result)=>{
      if(err) throw err;
      else{
          console.log(req.session.roll_number)
res.json(result)
    }
    })*/
})

router.get('/demo',(req,res)=>{
    pool.query(`select * from customize_project where roll_number = "${req.session.roll_number}" order by id desc limit 1`,(err,result)=>{
        if(err) throw err;
        else {
            console.log(result[0].php)
           var query = `select * from customize_project where roll_number = "${req.session.roll_number}" order by id desc limit 1;`
           var query1 = `select * from programming_language where id = "${result[0].php}";`
           var query2 = `select * from programming_language where id = "${result[0].nodejs}";`
           var query3 = `select * from programming_language where id = "${result[0].android}";`
           var query4 = `select * from programming_language where id = "${result[0].react}";`
           var query5 = `select * from programming_language where id = "${result[0].java}";`
           var query6 = `select * from programming_language where id = "${result[0].html}";`
           var query7 = `select * from programming_language where id = "${result[0].python}";`
           var query8 = `select * from programming_language where id = "${result[0].javascript}";`
           var query9 = `select * from programming_language where id = "${result[0].jquery}";`
           var query10 = `select * from programming_language where id = "${result[0].json}";`
           var query11 = `select * from programming_language where id = "${result[0].ajax}";`
           var query12 = `select * from programming_language where id = "${result[0].xml}";`
           var query13 = `select * from programming_language where id = "${result[0].native}";`
           
           pool.query(query+query1+query2+query3+query4+query5+query6+query7+query8+query9+query10+query11+query12+query13,(err,result)=>{
               if(err) throw err;
               else res.json(result)
           })

        }
    })
})




module.exports = router;