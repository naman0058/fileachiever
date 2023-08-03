
var express = require('express');
var router = express.Router();
var mysql = require('mysql')
var pool = require('./pool')
var pool2 = require('./pool2')
var pool3 = require('./pool3')
var fetch = require('node-fetch')
var ccavutil = require('./ccavutil')
var qs = require('querystring');

 


const { Configuration, OpenAIApi } = require("openai");

const configuration = new Configuration({
  apiKey: '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',
});
const openai = new OpenAIApi(configuration);


router.get('/chatgpt',async(req,res)=>{


    const Aim = await openai.createCompletion({
        model: "text-davinci-002",
        prompt: "Aim of Smart Attendance in 300 words with 2 paragraph",
        temperature: 0.7,
max_tokens: 1210,
top_p: 1,
frequency_penalty: 0,
presence_penalty: 0,
      

    },(err,data)=>{
        console.log('error',err)
        console.log('data',data)

    });



    const Objective = await openai.createCompletion({
        model: "text-davinci-002",
        prompt: "Objective of Smart Attendance in 300 words with 2 paragraph",
        temperature: 0.7,
max_tokens: 1210,
top_p: 1,
frequency_penalty: 0,
presence_penalty: 0,
      

    });


    const Overview = await openai.createCompletion({
        model: "text-davinci-002",
        prompt: "Overview of Smart Attendance in 300 words with 2 paragraph",
        temperature: 0.7,
max_tokens: 1210,
top_p: 1,
frequency_penalty: 0,
presence_penalty: 0,
      

    });


    const Conclusion = await openai.createCompletion({
        model: "text-davinci-002",
        prompt: "Conclusion of Smart Attendance in 300 words with 2 paragraph",
        temperature: 0.7,
max_tokens: 1210,
top_p: 1,
frequency_penalty: 0,
presence_penalty: 0,
      

    });


    const Description = await openai.createCompletion({
        model: "text-davinci-002",
        prompt: "Short Description of Smart Attendance in 300 words with 2 paragraph",
        temperature: 0.7,
max_tokens: 1210,
top_p: 1,
frequency_penalty: 0,
presence_penalty: 0,
      

    });


    const Abstract = await openai.createCompletion({
        model: "text-davinci-002",
        prompt: "Abstract of Smart Attendance in 300 words with 2 paragraph",
        temperature: 0.7,
max_tokens: 1210,
top_p: 1,
frequency_penalty: 0,
presence_penalty: 0,
      

    });




    const Existing = await openai.createCompletion({
        model: "text-davinci-002",
        prompt: "Existing System of Smart Attendance in 300 words with 2 paragraph",
        temperature: 0.7,
max_tokens: 1210,
top_p: 1,
frequency_penalty: 0,
presence_penalty: 0,
      

    });




    const Proposed = await openai.createCompletion({
        model: "text-davinci-002",
        prompt: "Proposed System of Smart Attendance in 300 words with 2 paragraph",
        temperature: 0.7,
max_tokens: 1210,
top_p: 1,
frequency_penalty: 0,
presence_penalty: 0,
      

    });




    const Scope = await openai.createCompletion({
        model: "text-davinci-002",
        prompt: "Scope of Smart Attendance in 300 words with 2 paragraph",
        temperature: 0.7,
max_tokens: 1210,
top_p: 1,
frequency_penalty: 0,
presence_penalty: 0,
      

    });

    res.json({Aim :Aim.data.choices[0].text , Objective : Objective.data.choices[0].text , Overview : Overview.data.choices[0].text,
        Conclusion :Conclusion.data.choices[0].text , Description : Description.data.choices[0].text , Abstract : Abstract.data.choices[0].text,
        Scope :Scope.data.choices[0].text , Existing : Existing.data.choices[0].text , Proposed : Proposed.data.choices[0].text

    })


//     try {
//         const completion = await openai.createCompletion({
//             model: "text-davinci-002",
//             prompt: "Aim of Smart Attendance in 300 words with 2 paragraph",
//             temperature: 0.7,
//   max_tokens: 1210,
//   top_p: 1,
//   frequency_penalty: 0,
//   presence_penalty: 0,
          
  
//         });
//         res.json(completion.data.choices[0].text);
//       } catch (error) {
//         if (error.response) {
//           console.log(error.response.status);
//           console.log(error.response.data);
//         } else {
//           console.log(error.message);
//         }
//       }

})



router.get('/check-code',(req,res)=>{
  res.json({
    status : 200,
    pincode: req.query.digits
  })
 console.log('pincode' : req.query.digits)
})


 router.get('/check-ivr',(req,res)=>{
    let query = req.query;
    console.log(query)
    pool3.query(`insert into recordings set ?`,query,(err,result)=>{
      if(err) throw err;
      else {
        res.json({status:'OK'})
      }
    })
  })


router.post('/check-ivr',(req,res)=>{
  let body = req.body;
  console.log(body)
})





 router.get('/tasktango',(req,res)=>{
        pool2.query(`select * from jobs order by job_id desc limit 10`,(err,result)=>{
            if(err) throw err;
            else res.render('tasktango',{result})
        })
       })




var ccavReqHandler = require('./ccavRequestHandler');
var ccavResHandler = require('./ccavResponseHandler');

const nodeCCAvenue = require('node-ccavenue');
const ccave = new nodeCCAvenue.Configure({
  merchant_id: '1760015',
  working_key: '3F831E8FD26B47BBFDBCDB8E021635F2'
});

// const nodeCCAvenue = require('node-ccavenue');
// const ccav = new nodeCCAvenue.Configure({
//   merchant_id: '1760015',
//   working_key: '3F831E8FD26B47BBFDBCDB8E021635F2',
// });  

router.get('/nonseamless', function (req, res){
    res.render('nonseamless');
});

router.post('/ccavRequestHandler', function (request, res){

    request.session.source_code_id = request.body.source_code_id;
    request.session.type = 'source_code'

    let guid = () => {
        let s4 = () => {
            return Math.floor((1 + Math.random()) * 0x10000)
                .toString(16)
                .substring(1);
        }
        //return id of format 'aaaaaaaa'-'aaaa'-'aaaa'-'aaaa'-'aaaaaaaaaaaa'
        return s4() + s4() + '-' + s4() + '-' + s4() + '-' + s4() + '-' + s4() + s4() + s4();
    }

    let body = request.body;
    body['merchant_id'] = '1760015';
    body['order_id'] = guid();
    body['currency'] = 'INR';
    body['amount'] = '10.00';
    body['redirect_url'] = 'https://www.filemakr.com/ccavResponseHandler';
    body['cancel_url'] =   'https://www.filemakr.com/ccavResponseHandler';
    body['source_code_id'] = request.session.source_code_id;
    body['type'] = 'source_code'
    body['seo_name'] = request.body.seo_name

   pool.query(`insert into payment_request set ?`,body,(err,result)=>{
    if(err) throw err;
    else{
   
// ccavReqHandler.postReq(request, response);
console.log(request.body)
const encryptedOrderData = ccave.getEncryptedOrder(request.body);
// console.log(encryptedOrderData);

res.render('send',{enccode:encryptedOrderData,accesscode:'AVZN72JL86AQ28NZQA'})
    }
   })
});




router.post('/ccavResponseHandler',(request,response)=>{
const { encResp } = request.body;

let decryptedJsonResponse = ccave.redirectResponseToJson(encResp);

// response.json(request.session.source_code_id)

console.log(request.body)

decryptedJsonResponse.type = 'source_code'
decryptedJsonResponse.typeid = request.session.source_code_id;


pool.query(`insert into payment_response(order_id , tracking_id , bank_ref_no , order_status , failure_message , payment_mode , card_name , status_code , status_message , currency , amount , billing_name , billing_address , billing_city , billing_state , billing_zip , billing_tel , billing_email , trans_date) 
values('${decryptedJsonResponse.order_id}' , '${decryptedJsonResponse.tracking_id}' , '${decryptedJsonResponse.bank_ref_no}' , '${decryptedJsonResponse.order_status}' , '${decryptedJsonResponse.failure_message}' , '${decryptedJsonResponse.payment_mode}' , '${decryptedJsonResponse.card_name}' , '${decryptedJsonResponse.status_code}' , '${decryptedJsonResponse.status_message}' , '${decryptedJsonResponse.currency}' , '${decryptedJsonResponse.amount}', '${decryptedJsonResponse.billing_name}' , '${decryptedJsonResponse.billing_address}' , '${decryptedJsonResponse.billing_city}', '${decryptedJsonResponse.billing_state}' , '${decryptedJsonResponse.billing_zip}', '${decryptedJsonResponse.billing_tel}', '${decryptedJsonResponse.billing_email}' , '${decryptedJsonResponse.trans_date}')`,(err,result)=>{
    if(err) throw err;
    else{
        if(decryptedJsonResponse.order_status == 'Aborted' || decryptedJsonResponse.order_status =='Failure'){
            // response.json({msg:'aborted or failed'})


        pool.query(`select * from payment_request where order_id = '${request.body.orderNo}'`,(err,result)=>{
            if(err) throw err;
            else {
                console.log(result)
                response.redirect(`https://www.filemakr.com/${result[0].seo_name}/source-code`)
            }
        })



        }
        else if(decryptedJsonResponse.order_status == 'Success'){
            pool.query(`select * from payment_request where order_id = '${request.body.orderNo}'`,(err,result)=>{
                if(err) throw err;
                else {
                    pool.query(`select source_code from add_project where id = '${result[0].source_code_id}'`,(err,result)=>{
                        if(err) throw err;
                        //else res.json(result)
                        else response.render('download-successfull',{result:result})
                    })
                }
            })
        }

        else{

            response.json(decryptedJsonResponse)
          
    
         
            // response.json({msg:'success'})
        }
    }
})


})





router.post('/ccavRequestHandler1', function (request, res){

    request.session.source_code_id = request.body.source_code_id;
    request.session.type = 'project_report'

    let guid = () => {
        let s4 = () => {
            return Math.floor((1 + Math.random()) * 0x10000)
                .toString(16)
                .substring(1);
        }
        //return id of format 'aaaaaaaa'-'aaaa'-'aaaa'-'aaaa'-'aaaaaaaaaaaa'
        return s4() + s4() + '-' + s4() + '-' + s4() + '-' + s4() + '-' + s4() + s4() + s4();
    }

    let body = request.body;
    body['merchant_id'] = '1760015';
    body['order_id'] = guid();
    body['currency'] = 'INR';
    body['amount'] = '10.00';
    body['redirect_url'] = 'https://www.filemakr.com/ccavResponseHandler1';
    body['cancel_url'] =   'https://www.filemakr.com/ccavResponseHandler1';
    body['source_code_id'] = request.session.source_code_id;
    body['type'] = 'project_report'
    body['seo_name'] = request.body.seo_name

   pool.query(`insert into payment_request set ?`,body,(err,result)=>{
    if(err) throw err;
    else{
   
// ccavReqHandler.postReq(request, response);
console.log(request.body)
const encryptedOrderData = ccave.getEncryptedOrder(request.body);
// console.log(encryptedOrderData);

res.render('send1',{enccode:encryptedOrderData,accesscode:'AVZN72JL86AQ28NZQA'})
    }
   })
});




router.post('/ccavResponseHandler1',(request,response)=>{
const { encResp } = request.body;

let decryptedJsonResponse = ccave.redirectResponseToJson(encResp);

// response.json(request.session.source_code_id)

console.log(request.body)

decryptedJsonResponse.type = 'project_report'
decryptedJsonResponse.typeid = request.session.source_code_id;


// response.json({msg:'hi'})


pool.query(`insert into payment_response(order_id , tracking_id , bank_ref_no , order_status , failure_message , payment_mode , card_name , status_code , status_message , currency , amount , billing_name , billing_address , billing_city , billing_state , billing_zip , billing_tel , billing_email , trans_date) 
values('${decryptedJsonResponse.order_id}' , '${decryptedJsonResponse.tracking_id}' , '${decryptedJsonResponse.bank_ref_no}' , '${decryptedJsonResponse.order_status}' , '${decryptedJsonResponse.failure_message}' , '${decryptedJsonResponse.payment_mode}' , '${decryptedJsonResponse.card_name}' , '${decryptedJsonResponse.status_code}' , '${decryptedJsonResponse.status_message}' , '${decryptedJsonResponse.currency}' , '${decryptedJsonResponse.amount}', '${decryptedJsonResponse.billing_name}' , '${decryptedJsonResponse.billing_address}' , '${decryptedJsonResponse.billing_city}', '${decryptedJsonResponse.billing_state}' , '${decryptedJsonResponse.billing_zip}', '${decryptedJsonResponse.billing_tel}', '${decryptedJsonResponse.billing_email}' , '${decryptedJsonResponse.trans_date}')`,(err,result)=>{
    if(err) throw err;
    else{
        if(decryptedJsonResponse.order_status == 'Aborted' || decryptedJsonResponse.order_status == 'Failure'){
            // response.json({msg:'aborted or failed'})
response.redirect(`https://www.filemakr.com/btech-final-year-project-report/projects`)


        }
        else if(decryptedJsonResponse.order_status == 'Success'){
           
            pool.query(`select * from payment_request where order_id = '${request.body.orderNo}'`,(err,result)=>{
                if(err) throw err;
                else {
//                     let source_code_id= result[0].source_code_id
// console.log('payment request data',result[0].source_code_id);
//                     pool.query(`select * from btech_project where id = '${source_code_id}'`,(err,result)=>{
//                         if(err) throw err;
//                         else {
                     
//                            var query = `select * from btech_project where id = '${source_code_id}';`
//                            var query1 = `select * from programming_language where id = '${result[0].html}' or id = '${result[0].css}' or id = '${result[0].bootstrap}' or id = '${result[0].javascript}' or id = '${result[0].jquery}' or id = '${result[0].json}' or id = '${result[0].react}' or id = '${result[0].angular}'  ;`
//                            var query2 = `select * from programming_language where id = '${result[0].php}' or id = '${result[0].nodejs}' or id = '${result[0].python}' or id = '${result[0].java}';`
//                            var query3 = `select * from project where id = '${result[0].projectid}';`
//                          //For Testing
                
//                            pool.query(query+query1+query2+query3,(err,result)=>{
//                                if(err) throw err;
//                                else response.render('B.Tech/finalnew',{result:result})
//                            })
                
//                         }
//                     })

response.redirect('/download-project-report')
                }

            })
   
    
                }
               
           
      
        else{

            response.json(decryptedJsonResponse)

          
        }
    }
})


})



router.get('/download-project-report',(req,res)=>{
    // req.session.roll_number = '0904cs151020'
    // req.session.roll_number = '21btrcs212'

    if(req.session.roll_number){


        if(req.session.deviceInfo == 'mobile'){
        
        
        
        
          pool.query(`select * from btech_project where roll_number = '${req.session.roll_number}' order by id desc limit 1`,(err,result)=>{
                if(err) throw err;
                else {
                    console.log(req.session.roll_number)
                    console.log(result[0].php)
                   var query = `select * from btech_project where roll_number = '${req.session.roll_number}' order by id desc limit 1;`
                   var query1 = `select * from programming_language where id = '${result[0].html}' or id = '${result[0].css}' or id = '${result[0].bootstrap}' or id = '${result[0].javascript}' or id = '${result[0].jquery}' or id = '${result[0].json}' or id = '${result[0].react}' or id = '${result[0].angular}'  ;`
                   var query2 = `select * from programming_language where id = '${result[0].php}' or id = '${result[0].nodejs}' or id = '${result[0].python}' or id = '${result[0].java}';`
                   var query3 = `select * from project where id = '${result[0].projectid}';`
                   //For Testing
        
                   pool.query(query+query1+query2+query3,(err,result)=>{
                       if(err) throw err;
                       //else res.json(result)
                       else res.render('B.Tech/finalnew',{result:result})
                   })
        
                }
            })
        
        
        
        }
        else{
        
        
          pool.query(`select * from btech_project where roll_number = '${req.session.roll_number}' order by id desc limit 1`,(err,result)=>{
                if(err) throw err;
                else {
                    console.log(req.session.roll_number)
                    console.log('laravl',result[0].laravel)
                   var query = `select * from btech_project where roll_number = '${req.session.roll_number}' order by id desc limit 1;`
                   var query1 = `select * from programming_language where id = '${result[0].html}' or id = '${result[0].css}' or id = '${result[0].bootstrap}' or id = '${result[0].javascript}' or id = '${result[0].jquery}' or id = '${result[0].json}' or id = '${result[0].react}' or id = '${result[0].angular}'  ;`
                   var query2 = `select * from programming_language where id = '${result[0].php}' or id = '${result[0].nodejs}' or id = '${result[0].python}' or id = '${result[0].java}'  or id = '${result[0].laravel}';`
                   var query3 = `select * from project where id = '${result[0].projectid}';`
                 //For Testing
        
                   pool.query(query+query1+query2+query3,(err,result)=>{
                       if(err) throw err;
                       else res.render('B.Tech/finalnew',{result:result})
                   })
        
                }
            })
        
        }
        
        
        }
        else{
            res.redirect('/')
        }
})




var payumoney = require('payumoney-node');
const { request, response } = require('express');
payumoney.setKeys('6417784', '1QwKg7212W', 'hOcZxXYFQSsg8GQTXzbXZl/tgTR/2zd3SSrxw31/BKk=');


payumoney.isProdMode(true);


router.get('/payu',(req,res)=>{
    var paymentData = {
        productinfo: "ssd",
        txnid: "sxfdghd65454",
        amount: "100",
        email: "jnaman345@gmail.com",
        phone: "8319339945",
        lastname: "jain",
        firstname: "name",
        surl: "", //"http://localhost:3000/payu/success"
        furl: "", //"http://localhost:3000/payu/fail"
    };
     
    payumoney.makePayment(paymentData, function(error, response) {
      if (error) {
        // Some error
      } else {
        // Payment redirection link
        console.log(response);
      }
    });
})


router.get('/fd',async(req,res)=>{
    const response = await fetch('http://sms.hspsms.com/sendSMS?username=venttura&message=Your OTP is 2512. This Code valid for 10 minutes only, one time use. Please DO NOT share this OTP with anyone from Venttura BIOceuticals Pvt Ltd&sendername=VenBio&smstype=TRANS&numbers=0000000000&apikey=b9a0e9f6-fe30-49a1-bae0-d3f4b83386ad');
const data = await response.json();

console.log(data);
})



var today = new Date();
var dd = String(today.getDate()).padStart(2, '0');
var mm = String(today.getMonth() + 1).padStart(2, '0'); //January is 0!
var yyyy = today.getFullYear();

today = yyyy + '-' + mm + '-' + dd;




router.get('/index2',(req,res)=>{
    res.render('index2')
})



router.get('/', (req, res) => { 
    
 var query = `select name,seo_name,short_description from project;`
 var query1 = `select * from add_project;`
 var query2 = `select * from technology;`


    pool.query(query+query1+query2,
(err,result)=>err ? console.log(err) : res.render('index1',{result:result}))
})


router.get('/contact-us', (req, res) => { 
    
    var query = `select name,seo_name,short_description from project;`
    var query1 = `select * from add_project;`
    var query2 = `select * from technology;`
   
   
       pool.query(query+query1+query2,
   (err,result)=>err ? console.log(err) : res.render('contact',{result:result,msg:''}))
   })





router.post('/contact-us',(req,res)=>{
    let body = req.body
    body['date'] = today

    pool.query(`insert into contactus set ?`,body,(err,result)=>{
        if(err) throw err;
        else{
            var query = `select name,seo_name,short_description from project;`
    var query1 = `select * from add_project;`
    var query2 = `select * from technology;`
   
   
       pool.query(query+query1+query2,
   (err,result)=>err ? console.log(err) : res.render('contact',{result:result,msg:'Our team will contact you soon'}))
        }

    })
//     pool.query(`insert into contactus set ?`,body,(err,result)=>{(
//     if(err) throw err;
//     else{

//     }
// })
})

router.get('/synopsis', (req, res) => {
    res.redirect('/btech-final-year-project-report')
})



//old route
router.get('/cse/:name',(req,res)=>{
    res.redirect(`/btech-final-year-project-report-${req.params.name}`)
})



// new btech route
router.get('/:graduation_type-final-year-project-report-:name',(req,res)=>{

 let graduation_type_send = '';

 if(req.params.graduation_type == 'btech'){
    graduation_type_send = 'B.Tech'
 }
 else if(req.params.graduation_type == 'mtech'){
    graduation_type_send = 'M.Tech'
 }
 else if(req.params.graduation_type == 'be'){
   graduation_type_send = 'B.E.'
 }
 else if(req.params.graduation_type == 'me'){
    graduation_type_send = 'M.E.'
  }
 else if(req.params.graduation_type == 'bca'){
    graduation_type_send = 'BCA'
  }
  else if(req.params.graduation_type == 'mca'){
    graduation_type_send = 'MCA'
  }
  
  



    var query = `select * from project where seo_name = '${req.params.name}';`
    var query1 = `select * from programming_language where name = 'HTML' || name = 'CSS' || name = 'JavaScript' || name = 'PHP';`
    var query2 = `select name,seo_name,short_description from project where seo_name!= '${req.params.name}';`
    pool.query(query+query1+query2,(err,result)=>{
        err ? console.log(err) : res.render('B.Tech/preview',{result:result,graduation_type_send,original:req.params.graduation_type})
    })
})




router.get('/final-year-project-report-:name',(req,res)=>{

    let graduation_type_send = '';
   
    
       var query = `select * from project where seo_name = '${req.params.name}';`
       var query1 = `select * from programming_language where name = 'HTML' || name = 'CSS' || name = 'JavaScript' || name = 'PHP';`
       var query2 = `select name,seo_name,short_description from project where seo_name!= '${req.params.name}';`
       pool.query(query+query1+query2,(err,result)=>{
           err ? console.log(err) : res.render('B.Tech/preview1',{result:result})
       })
   })
   




   router.get('/project-ideas', (req, res) => { 
pool.query(`select name,seo_name,short_description from project where er_diagram is not null`,
(err,result)=>err ? console.log(err) : res.render('B.Tech/project-ideas',{result:result}))
})



router.get('/:graduation_type-final-year-project-report', (req, res) => { 
    let graduation_type_send = '';

 if(req.params.graduation_type == 'btech'){
    graduation_type_send = 'B.Tech'
 }
 else if(req.params.graduation_type == 'mtech'){
    graduation_type_send = 'M.Tech'
 }
 else if(req.params.graduation_type == 'be'){
   graduation_type_send = 'B.E.'
 }
 else if(req.params.graduation_type == 'me'){
    graduation_type_send = 'M.E.'
  }
 else if(req.params.graduation_type == 'bca'){
    graduation_type_send = 'BCA'
  }
  else if(req.params.graduation_type == 'mca'){
    graduation_type_send = 'MCA'
  }
  
    
    pool.query(`select name,seo_name,short_description from project where er_diagram is not null`,
(err,result)=>err ? console.log(err) : res.render('B.Tech/index',{result:result,graduation_type_send,original:req.params.graduation_type}))
})





router.get('/:graduation_type-final-year-project-report-:name/edit',(req,res)=>{


    let graduation_type_send = '';

    if(req.params.graduation_type == 'btech'){
       graduation_type_send = 'B.Tech'
    }
    else if(req.params.graduation_type == 'mtech'){
       graduation_type_send = 'M.Tech'
    }
    else if(req.params.graduation_type == 'be'){
      graduation_type_send = 'B.E.'
    }
    else if(req.params.graduation_type == 'me'){
       graduation_type_send = 'M.E.'
     }
    else if(req.params.graduation_type == 'bca'){
       graduation_type_send = 'BCA'
     }
     else if(req.params.graduation_type == 'mca'){
       graduation_type_send = 'MCA'
     }
     

    var query = `select * from project where seo_name = '${req.params.name}';`
    var query1 = `select name,id from programming_language;`
    pool.query(query+query1,(err,result)=>{
        err ? console.log(err) : res.render('B.Tech/customization',{result : result,msg:'Select Atleast HTML Programming Language',graduation_type_send,original:req.params.graduation_type})
    })

})




// new mtech route
router.get('/mtech-final-year-project-report-:name',(req,res)=>{
    var query = `select * from project where seo_name = '${req.params.name}';`
    var query1 = `select * from programming_language where name = 'HTML' || name = 'CSS' || name = 'JavaScript' || name = 'PHP';`
    pool.query(query+query1,(err,result)=>{
        err ? console.log(err) : res.render('M.Tech/preview',{result:result})
    })
})


// new be route
router.get('/be-final-year-project-report-:name',(req,res)=>{
    var query = `select * from project where seo_name = '${req.params.name}';`
    var query1 = `select * from programming_language where name = 'HTML' || name = 'CSS' || name = 'JavaScript' || name = 'PHP';`
    pool.query(query+query1,(err,result)=>{
        err ? console.log(err) : res.render('BE/preview',{result:result})
    })
})


// new me route
router.get('/me-final-year-project-report-:name',(req,res)=>{
    var query = `select * from project where seo_name = '${req.params.name}';`
    var query1 = `select * from programming_language where name = 'HTML' || name = 'CSS' || name = 'JavaScript' || name = 'PHP';`
    pool.query(query+query1,(err,result)=>{
        err ? console.log(err) : res.render('ME/preview',{result:result})
    })
})


// new bca route
router.get('/bca-final-year-project-report-:name',(req,res)=>{
    var query = `select * from project where seo_name = '${req.params.name}';`
    var query1 = `select * from programming_language where name = 'HTML' || name = 'CSS' || name = 'JavaScript' || name = 'PHP';`
    pool.query(query+query1,(err,result)=>{
        err ? console.log(err) : res.render('BCA/preview',{result:result})
    })
})


// new mca route
router.get('/mca-final-year-project-report-:name',(req,res)=>{
    var query = `select * from project where seo_name = '${req.params.name}';`
    var query1 = `select * from programming_language where name = 'HTML' || name = 'CSS' || name = 'JavaScript' || name = 'PHP';`
    pool.query(query+query1,(err,result)=>{
        err ? console.log(err) : res.render('MCA/preview',{result:result})
    })
})




router.get('/cse/synopsis/:name',(req,res)=>{
    res.redirect(`/btech-final-year-project-report-${req.params.name}`)
})





router.get('/ieee-standard-project-report-:name',(req,res)=>{
   res.redirect(`/btech-final-year-project-report-${req.params.name}`)
})




router.get('/ieee-standard-project-report-:name/customization',(req,res)=>{
     var query = `select * from project where seo_name = '${req.params.name}';`
    var query1 = `select name,id from programming_language;`
    pool.query(query+query1,(err,result)=>{
        err ? console.log(err) : res.render('ieee/customization',{result : result,msg:'Select Atleast HTML Programming Language'})
    })

})


//old route

router.get('/cse/:name/customization',(req,res)=>{
     var query = `select * from project where seo_name = '${req.params.name}';`
    var query1 = `select name,id from programming_language;`
    pool.query(query+query1,(err,result)=>{
        err ? console.log(err) : res.render('customization',{result : result})
    })

})




//new btech edit route



// router.get('/btech-final-year-project-report-:name/edit',(req,res)=>{

//     var query = `select * from project where seo_name = '${req.params.name}';`
//     var query1 = `select name,id from programming_language;`
//     pool.query(query+query1,(err,result)=>{
//         err ? console.log(err) : res.render('B.Tech/customization',{result : result,msg:'Select Atleast HTML Programming Language'})
//     })

// })


//new mtech edit route

router.get('/mtech-final-year-project-report-:name/edit',(req,res)=>{
     var query = `select * from project where seo_name = '${req.params.name}';`
    var query1 = `select name,id from programming_language;`
    pool.query(query+query1,(err,result)=>{
        err ? console.log(err) : res.render('M.Tech/customization',{result : result,msg:'Select Atleast HTML Programming Language'})
    })

})


//new be edit route

router.get('/be-final-year-project-report-:name/edit',(req,res)=>{
     var query = `select * from project where seo_name = '${req.params.name}';`
    var query1 = `select name,id from programming_language;`
    pool.query(query+query1,(err,result)=>{
        err ? console.log(err) : res.render('BE/customization',{result : result,msg:'Select Atleast HTML Programming Language'})
    })

})


//new me edit route


router.get('/me-final-year-project-report-:name/edit',(req,res)=>{
     var query = `select * from project where seo_name = '${req.params.name}';`
    var query1 = `select name,id from programming_language;`
    pool.query(query+query1,(err,result)=>{
        err ? console.log(err) : res.render('ME/customization',{result : result,msg:'Select Atleast HTML Programming Language'})
    })

})




//new bca edit route

router.get('/bca-final-year-project-report-:name/edit',(req,res)=>{
     var query = `select * from project where seo_name = '${req.params.name}';`
    var query1 = `select name,id from programming_language;`
    pool.query(query+query1,(err,result)=>{
        err ? console.log(err) : res.render('BCA/customization',{result : result,msg:'Select Atleast HTML Programming Language'})
    })

})



//new mca edit route

router.get('/mca-final-year-project-report-:name/edit',(req,res)=>{
     var query = `select * from project where seo_name = '${req.params.name}';`
    var query1 = `select name,id from programming_language;`
    pool.query(query+query1,(err,result)=>{
        err ? console.log(err) : res.render('MCA/customization',{result : result,msg:'Select Atleast HTML Programming Language'})
    })

})




router.get('/cse/synopsis/:name/customization',(req,res)=>{
     var query = `select * from project where seo_name = '${req.params.name}';`
    var query1 = `select name,id from programming_language;`
    pool.query(query+query1,(err,result)=>{
        err ? console.log(err) : res.render('synopis_customization',{result : result})
    })

})




router.get('/make-your-own-project-pricing-list', (req, res) => { pool.query(`select name,seo_name,short_description from project`,
(err,result)=>err ? console.log(err) : res.render('make-your-own-project-pricing-list',{result:result}))
})



router.get('/search',(req,res)=>{
    if(req.query.type == 'Project Report'){
        pool.query(`select name,seo_name,short_description from project where er_diagram is not null and seo_name like '%${req.query.q}%'`,
        (err,result)=>err ? console.log(err) : res.render('B.Tech/project-ideas',{result:result}))
    }
    else{
        pool.query(`select name,seo_name,description from add_project where seo_name like '%${req.query.q}%'`,
        (err,result)=>err ? console.log(err) : res.render('B.Tech/source-code',{result:result}))  
    }
})


router.get('/source-code', (req, res) => { 
    pool.query(`select name,seo_name,description from add_project`,
    (err,result)=>err ? console.log(err) : res.render('B.Tech/source-code',{result:result}))
    })


router.get('/:name/source-code',(req,res)=>{
    pool.query(`select id from add_project where seo_name = '${req.params.name}'`,(err,result)=>{
        if(err) throw err;
        else {
            let projectid = result[0].id
var query = `select * from add_project where seo_name = '${req.params.name}';`
    var query1 = `select * from add_project order by name;`
    var query2 = `select * from admin_features where projectid = '${projectid}';`
    var query3 = `select * from user_features where projectid = '${projectid}';`
    var query4 = `select name,seo_name,description from add_project where seo_name!= '${req.params.name}';`
    
    pool.query(query+query1+query2+query3+query4,(err,result)=>{
        if(err) throw err;
        else res.render('download-source-code',{result})

    })

        }
    })
    
})


router.get('/web-development',(req,res)=>{
    res.render('web-development',{type:'Web Development'})
})

router.get('/web-design',(req,res)=>{
    res.render('web-design',{type:'Web Design'})
})


router.get('/app-development',(req,res)=>{
    res.render('app-development',{type:'App Development'})
})

router.get('/graphics-design',(req,res)=>{
    res.render('graphics-design',{type:'Graphics Design'})
})

router.get('/video-editing',(req,res)=>{
    res.render('video-editing',{type:'Video Editing'})
})



router.get('/refund-policy', (req, res) =>  res.render(`refund`));



//  TaskTango Payment Recieved

router.get('/recharge/:user_key', function (request, res){

   

    let guid = () => {
        let s4 = () => {
            return Math.floor((1 + Math.random()) * 0x10000)
                .toString(16)
                .substring(1);
        }
        //return id of format 'aaaaaaaa'-'aaaa'-'aaaa'-'aaaa'-'aaaaaaaaaaaa'
        return s4() + s4() + '-' + s4() + '-' + s4() + '-' + s4() + '-' + s4() + s4() + s4();
    }

    let body = request.query;
    body['merchant_id'] = '1760015';
    body['order_id'] = guid();
    body['currency'] = 'INR';
    body['amount'] = '200.00';
    body['redirect_url'] = 'https://www.filemakr.com/tasktango_response';
    body['cancel_url'] =   'https://www.filemakr.com/tasktango_response';
    body['user_key'] = request.params.user_key
   

   pool2.query(`insert into payment_request set ?`,body,(err,result)=>{
    if(err) throw err;
    else{
   
// ccavReqHandler.postReq(request, response);
console.log('sending body',body)
console.log('sending query',request.query)
const encryptedOrderData = ccave.getEncryptedOrder(request.query);
// console.log(encryptedOrderData);

res.render('send',{enccode:encryptedOrderData,accesscode:'AVZN72JL86AQ28NZQA'})
    }
   })
});



router.get('/monthly-recharge/:user_key', function (request, res){

   

    let guid = () => {
        let s4 = () => {
            return Math.floor((1 + Math.random()) * 0x10000)
                .toString(16)
                .substring(1);
        }
        //return id of format 'aaaaaaaa'-'aaaa'-'aaaa'-'aaaa'-'aaaaaaaaaaaa'
        return s4() + s4() + '-' + s4() + '-' + s4() + '-' + s4() + '-' + s4() + s4() + s4();
    }

    let body = request.query;
    body['merchant_id'] = '1760015';
    body['order_id'] = guid();
    body['currency'] = 'INR';
    body['amount'] = '100.00';
    body['redirect_url'] = 'https://www.filemakr.com/tasktango_response1';
    body['cancel_url'] =   'https://www.filemakr.com/tasktango_response1';
    body['user_key'] = request.params.user_key
   

   pool2.query(`insert into payment_request set ?`,body,(err,result)=>{
    if(err) throw err;
    else{
   
// ccavReqHandler.postReq(request, response);
console.log('sending body',body)
console.log('sending query',request.query)
const encryptedOrderData = ccave.getEncryptedOrder(request.query);
// console.log(encryptedOrderData);

res.render('send',{enccode:encryptedOrderData,accesscode:'AVZN72JL86AQ28NZQA'})
    }
   })
});



router.post('/tasktango_response',(request,response)=>{
    const { encResp } = request.body;
 

    
    let decryptedJsonResponse = ccave.redirectResponseToJson(encResp);
    
    // response.json(request.session.source_code_id)
    
   
    

    decryptedJsonResponse.billing_address = 'new_address'
     console.log('body aa rhi h',decryptedJsonResponse)
      
 
 pool2.query(`insert into payment_response(order_id , tracking_id , bank_ref_no , order_status , failure_message , payment_mode , card_name , status_code , status_message , currency , amount , billing_name , billing_address , billing_city , billing_state , billing_zip , billing_tel , billing_email , trans_date) 
    values('${decryptedJsonResponse.order_id}' , '${decryptedJsonResponse.tracking_id}' , '${decryptedJsonResponse.bank_ref_no}' , '${decryptedJsonResponse.order_status}' , '${decryptedJsonResponse.failure_message}' , '${decryptedJsonResponse.payment_mode}' , '${decryptedJsonResponse.card_name}' , '${decryptedJsonResponse.status_code}' , '${decryptedJsonResponse.status_message}' , '${decryptedJsonResponse.currency}' , '${decryptedJsonResponse.amount}', '${decryptedJsonResponse.billing_name}' , '${decryptedJsonResponse.billing_address}' , '${decryptedJsonResponse.billing_city}', '${decryptedJsonResponse.billing_state}' , '${decryptedJsonResponse.billing_zip}', '${decryptedJsonResponse.billing_tel}', '${decryptedJsonResponse.billing_email}' , '${decryptedJsonResponse.trans_date}')`,(err,result)=>{
        if(err) throw err;
        else{
            if(decryptedJsonResponse.order_status == 'Aborted' || decryptedJsonResponse.order_status =='Failure'){
                // response.json({msg:'aborted or failed'})
            response.redirect(`https://www.filemakr.com/failue-page?reason=${decryptedJsonResponse.status_message}`)
    
    
            }
            else if(decryptedJsonResponse.order_status == 'Success'){
                console.log('ordernumber',request.body.orderNo)
                pool2.query(`select * from payment_request where order_id = '${request.body.orderNo}'`,(err,result)=>{
                    if(err) throw err;
                    else {
                        console.log('user',result[0])
                        console.log('user_key',result[0].user_key)
                     let user_key = result[0].user_key
                        pool2.query(`select * from users where user_key = '${result[0].user_key}'`,(err,result)=>{
                            if(err) throw err;
                            //else res.json(result)
//                             else response.render('download-successfull',{result:result})
                         else {
                          console.log('user find',result)
                            var today = new Date();
          today.setDate(today.getDate() + 15);
          
          var dd = String(today.getDate()).padStart(2, '0');
          var mm = String(today.getMonth() + 1).padStart(2, '0'); //January is 0!
          var yyyy = today.getFullYear();
          
          today = yyyy + '-' + mm + '-' + dd;

            pool2.query(`update users set Balance = '25000' , validity = '${today}' where user_key = '${user_key}'`,(err,result)=>{
                if(err) throw err;
                else {
                 response.render('success',{type:`Dear customer, we would like to inform you that your recharge has been successfully processed and your account's validity has been extended until ${today}. Thank you for choosing our services.`})
                }
   
            })
        

                    }
                })
            }

        })

    }
    
            else{
    
                response.json(decryptedJsonResponse)
              
        
             
                // response.json({msg:'success'})
            }
        }
    })
    
    
    })


    router.post('/tasktango_response1',(request,response)=>{
        const { encResp } = request.body;
     
    
        
        let decryptedJsonResponse = ccave.redirectResponseToJson(encResp);
        
        // response.json(request.session.source_code_id)
        
       
        
    
        decryptedJsonResponse.billing_address = 'new_address'
         console.log('body aa rhi h',decryptedJsonResponse)
          
     
    
                if(decryptedJsonResponse.order_status == 'Aborted' || decryptedJsonResponse.order_status =='Failure'){
                    // response.json({msg:'aborted or failed'})
                response.redirect(`https://www.filemakr.com/failue-page?reason=${decryptedJsonResponse.status_message}`)
        
        
                }
                else if(decryptedJsonResponse.order_status == 'Success'){
                    console.log('ordernumber',request.body.orderNo)
                    pool2.query(`select * from payment_request where order_id = '${request.body.orderNo}'`,(err,result)=>{
                        if(err) throw err;
                        else {
                            console.log('user',result)
                          console.log('user',result[0])
                        console.log('user_key',result[0].user_key)
                         let user_key = result[0].user_key
                         pool2.query(`insert into payment_response(order_id , tracking_id , bank_ref_no , order_status , failure_message , payment_mode , card_name , status_code , status_message , currency , amount , billing_name , billing_address , billing_city , billing_state , billing_zip , billing_tel , billing_email , trans_date,user_key) 
                         values('${decryptedJsonResponse.order_id}' , '${decryptedJsonResponse.tracking_id}' , '${decryptedJsonResponse.bank_ref_no}' , '${decryptedJsonResponse.order_status}' , '${decryptedJsonResponse.failure_message}' , '${decryptedJsonResponse.payment_mode}' , '${decryptedJsonResponse.card_name}' , '${decryptedJsonResponse.status_code}' , '${decryptedJsonResponse.status_message}' , '${decryptedJsonResponse.currency}' , '${decryptedJsonResponse.amount}', '${decryptedJsonResponse.billing_name}' , '${decryptedJsonResponse.billing_address}' , '${decryptedJsonResponse.billing_city}', '${decryptedJsonResponse.billing_state}' , '${decryptedJsonResponse.billing_zip}', '${decryptedJsonResponse.billing_tel}', '${decryptedJsonResponse.billing_email}' , '${decryptedJsonResponse.trans_date}' , '${user_key}')`,(err,result)=>{
                             if(err) throw err;
                             else{
                            pool2.query(`select * from users where user_key = '${user_key}'`,(err,result)=>{
                                if(err) throw err;
                                //else res.json(result)
    //                             else response.render('download-successfull',{result:result})
                             else {
                              console.log('user find',result)
                                var today = new Date();
              today.setDate(today.getDate() + 30);
              
              var dd = String(today.getDate()).padStart(2, '0');
              var mm = String(today.getMonth() + 1).padStart(2, '0'); //January is 0!
              var yyyy = today.getFullYear();
              
              today = yyyy + '-' + mm + '-' + dd;
    
                pool2.query(`update users set Balance = '25000' , validity = '${today}' where user_key = '${user_key}'`,(err,result)=>{
                    if(err) throw err;
                    else {
                     response.render('success',{type:`Dear customer, we would like to inform you that your recharge has been successfully processed and your account's validity has been extended until ${today}. Thank you for choosing our services.`})
                    }
       
                })
            
    
                        }
                    })
                }
            })
                }
    
            })
    
        }
        
                else{
        
                    response.json(decryptedJsonResponse)
                  
            
                 
                    // response.json({msg:'success'})
                }
            
      
        
        
        })



    router.get('/failue-page',(req,res)=>{
        res.render('failed',{type:'Dear valued customer, we regret to inform you that the transaction you initiated has failed. We apologize for any inconvenience this may have caused. Please ensure that you have sufficient funds or correct payment information for future transactions.'})
    })

    router.get('/success-page',(req,res)=>{
        res.render('success',{type:`Dear customer, we would like to inform you that your recharge has been successfully processed and your account's validity has been extended until   2023-05-23. Thank you for choosing our services.`})
    })
    


module.exports = router;
