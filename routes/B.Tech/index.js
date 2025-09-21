var express = require('express');
var router = express.Router();
var pool = require('../pool')
var table = 'btech_project'
var upload = require('../multer');
var verify = require('../verify')
var emailTemplates = require('../utility/emailTemplates');
var dataService = require('../dataService');
var onPageSeo = require('../onPageSeo');



var today = new Date();
var dd = String(today.getDate()).padStart(2, '0');
var mm = String(today.getMonth() + 1).padStart(2, '0'); //January is 0!
var yyyy = today.getFullYear();

today = yyyy + '-' + mm + '-' + dd;






router.get('/', (req, res) => { pool.query(`select name,seo_name,short_description from project where er_diagram is not null`,
(err,result)=>err ? console.log(err) : res.render('B.Tech/index',{result:result}))
})





// router.post('/insert',upload.fields([{ name: 'college_logo', maxCount: 1 }, { name: 'affilated_college_logo', maxCount: 1 }]),(req,res)=>{
//     let body = req.body
//     console.log(req.body)

  
   
//       body['college_logo'] = req.files['college_logo'][0].filename
//     body['affilated_college_logo'] = req.files['affilated_college_logo'][0].filename
//     body['date'] = today
//     body['view'] = req.session.deviceInfo   
//     req.session.roll_number = body.roll_number
//     console.log('yaha insert ho gya h',req.session.roll_number)
//     pool.query(`insert into ${table} set ?`,body,(err,result)=>{
//       if(err) throw err;
//       else{
//         res.redirect('/btech-final-year-project-report/projects')
//     }
//     })
    
  
// })


router.post(
  '/insert',
  upload.fields([{ name: 'college_logo', maxCount: 1 }, { name: 'affilated_college_logo', maxCount: 1 }]),
  async (req, res) => {
    try {
      const body = { ...req.body };

      // Safe joins for checkbox arrays
      const frontendArr = Array.isArray(req.body.frontend) ? req.body.frontend : (req.body.frontend ? [req.body.frontend] : []);
      const backendArr  = Array.isArray(req.body.backend)  ? req.body.backend  : (req.body.backend  ? [req.body.backend]  : []);

      body.frontend = frontendArr.join(', ');
      body.backend  = backendArr.join(', ');

      // Safe file reads
      body.college_logo = req.files?.college_logo?.[0]?.filename || null;
      body.affilated_college_logo = req.files?.affilated_college_logo?.[0]?.filename || null;

      body.date   = today;
      body.view   = req.session.deviceInfo;
      body.status = 'pending';

      // Persist roll number for later payment use
      req.session.roll_number = body.roll_number;

      pool.query(`INSERT INTO ${table} SET ?`, body, async (err, result) => {
        if (err) throw err;

        // Fire-and-forget emails
        setImmediate(async () => {
          try {
            const title_case_name = (body.seo_name || '')
              .split('-')
              .map(w => w.charAt(0).toUpperCase() + w.slice(1))
              .join(' ');

            const userSubject  = emailTemplates.welcomeMessage.userSubject.replace('{{Customer_Name}}', body.name);
            const userMessage  = emailTemplates.welcomeMessage.userMessage(body.name);

            const userSubject1 = emailTemplates.beforprojectreport.userSubject.replace('{{Project_Name}}', title_case_name);
            const userMessage1 = emailTemplates.beforprojectreport.userMessage(body.name, title_case_name, req.session.roll_number);

            await verify.sendUserMail(body.email, userSubject,  userMessage);
            await verify.sendUserMail(body.email, userSubject1, userMessage1);
          } catch (backgroundErr) {
            console.error('Background task error (email):', backgroundErr);
          }
        });

        // ---- Immediately POST to /ccavRequestHandler1 ----
        // Build a minimal auto-submit document so we keep POST semantics.
        const source_code_id = body.projectid || ''; // adjust if you use a different id for source code/report
        const coupon_code    = body.coupon_code || ''; // pass through if present
        const seo_name       = body.seo_name || '';
        const name       = body.name || '';
        const number       = body.number || '';
        const email       = body.email || '';
        const final_amount       = body.final_amount || '';



        res.set('Content-Type', 'text/html; charset=utf-8');
        return res.send(`<!doctype html>
<html><head>
  <meta charset="utf-8">
  <title>Redirecting to Payment…</title>
  <noscript>
    <style>form{display:block !important}</style>
  </noscript>
</head>
<body>
  <form id="autoPay" action="/ccavRequestHandler1" method="post" style="display:none">
    <input type="hidden" name="source_code_id" value="${String(source_code_id).replace(/"/g,'&quot;')}">
    <input type="hidden" name="seo_name"       value="${String(seo_name).replace(/"/g,'&quot;')}">
    <input type="hidden" name="coupon_code"    value="${String(coupon_code).replace(/"/g,'&quot;')}">
    <input type="hidden" name="billing_name"    value="${String(name).replace(/"/g,'&quot;')}">
    <input type="hidden" name="billing_tel"    value="${String(number).replace(/"/g,'&quot;')}">
    <input type="hidden" name="billing_email"    value="${String(email).replace(/"/g,'&quot;')}">
    <input type="hidden" name="final_amount"    value="${String(final_amount).replace(/"/g,'&quot;')}">


  </form>
  <script>
    try { document.getElementById('autoPay').submit(); }
    catch(e){ /* fallback for very old browsers */ }
  </script>
  <noscript>
    <p>Click continue to proceed to payment.</p>
    <button type="submit" form="autoPay">Continue</button>
  </noscript>
</body></html>`);
      });
    } catch (e) {
      console.error('Insert error:', e);
      return res.status(500).send('Something went wrong while starting your payment. Please try again.');
    }
  }
);






router.get('/projects',dataService.allCategory,(req,res)=>{


console.log('yaha v correct h',req.session.roll_number)

    if(req.session.roll_number){


if(req.session.deviceInfo == 'mobile'){




  pool.query(`select * from ${table} where roll_number = '${req.session.roll_number}' order by id desc limit 1`,(err,result)=>{
        if(err) throw err;
        else {
            console.log('this null',req.session.roll_number)
            console.log(result[0].php)
           var query = `select * from ${table} where roll_number = '${req.session.roll_number}' order by id desc limit 1;`
           var query3 = `select * from project where id = '${result[0].projectid}';`
           //For Testing

           pool.query(query+query3,(err,result)=>{
               if(err) throw err;
               //else res.json(result)
               else res.render('B.Tech/final',{result:result,graduation_type_send :'',active:'report',Metatags: onPageSeo.homePage,
                       CommonMetaTags: onPageSeo.commonMetaTags,category:req.categories,fullUrl:req.fullUrl,active:'report'})
           })

        }
    })



}
else{


  pool.query(`select * from ${table} where roll_number = '${req.session.roll_number}' order by id desc limit 1`,(err,result)=>{
        if(err) throw err;
        else {
            console.log('this null',req.session.roll_number)
           var query = `select * from ${table} where roll_number = '${req.session.roll_number}' order by id desc limit 1;`
           var query3 = `select * from project where id = '${result[0].projectid}';`
         //For Testing

           pool.query(query+query3,(err,result)=>{
               if(err) throw err;
               else res.render('B.Tech/final',{result:result,graduation_type_send :'',active:'report',Metatags: onPageSeo.homePage,
                       CommonMetaTags: onPageSeo.commonMetaTags,category:req.categories,fullUrl:req.fullUrl,active:'report'})
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
