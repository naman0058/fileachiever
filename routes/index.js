
var express = require('express');
var router = express.Router();
var mysql = require('mysql')
var pool = require('./pool')
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




// router.get('/scrap',(req,res)=>{
//     fetch('https://www.rockerstop.com/freelance-jobs.php',(err,response,html)=>{
//         if(err) throw err;
//         else{
//             console.log(res)
//         }
//     });
// })



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



router.post('/ccavRequestHandler', function (req, res){

    req.session.source_code_id = req.body.source_code_id;
    req.session.type = 'source_code'

    let guid = () => {
        let s4 = () => {
            return Math.floor((1 + Math.random()) * 0x10000)
                .toString(16)
                .substring(1);
        }
        //return id of format 'aaaaaaaa'-'aaaa'-'aaaa'-'aaaa'-'aaaaaaaaaaaa'
        return s4() + s4() + '-' + s4() + '-' + s4() + '-' + s4() + '-' + s4() + s4() + s4();
    }

    let body = req.body;
    body['merchant_id'] = '1760015';
    body['order_id'] = guid();
    body['currency'] = 'INR';
    body['amount'] = '10.00';
    body['redirect_url'] = 'https://www.filemakr.com/ccavResponseHandler';
    body['cancel_url'] =   'https://www.filemakr.com/ccavResponseHandler';
    body['source_code_id'] = req.session.source_code_id;
    body['type'] = 'source_code'




   
// ccavReqHandler.postReq(request, response);
console.log(req.body)
const encryptedOrderData = ccave.getEncryptedOrder(req.body);
// console.log(encryptedOrderData);

res.render('send',{enccode:encryptedOrderData,accesscode:'AVZN72JL86AQ28NZQA'})
});




router.post('/ccavResponseHandler',(req,response)=>{
const { encResp } = req.body;

let decryptedJsonResponse = ccave.redirectResponseToJson(encResp);

response.json(req.session)


decryptedJsonResponse.type = 'source_code'
decryptedJsonResponse.typeid = req.session.source_code_id;


pool.query(`insert into payment_response set ?`,decryptedJsonResponse,(err,result)=>{
    if(err) throw err;
    else{
        if(decryptedJsonResponse.order_status == 'Aborted'){
            response.json({msg:'aborted or failed'})
        }
        else{
            response.json({msg:'success'})
        }
    }
})


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


module.exports = router;
