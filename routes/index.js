
var express = require('express');
var router = express.Router();
var mysql = require('mysql')
var pool = require('./pool')
var pool2 = require('./pool2')
var pool3 = require('./pool3')
var fetch = require('node-fetch')
var ccavutil = require('./ccavutil')
var qs = require('querystring');
var dataService = require('./dataService');
var onPageSeo = require('./onPageSeo');

const verify = require('./verify');
const emailTemplates = require('./utility/emailTemplates');


const Tesseract = require('tesseract.js');

// async function extractTextFromImage(imagePath) {
//     try {
//         const { data: { text } } = await Tesseract.recognize(
//             imagePath,
//             'eng', // Language (English)
//             {}
//         );
//         console.log("Extracted Text:\n", text);
//         return text;
//     } catch (error) {
//         console.error("Error extracting text:", error.message || error);
//         return "";
//     }
// }

// function mobileExtractDetails(text) {
//     const nameMatch = text.match(/& ([A-Za-z ]+) ©/) || text.match(/& ([A-Za-z ]+) @/);
//     const numberMatch = text.match(/©\) (\d{10})/) || text.match(/©?\s?(\d{10})/);
//     const titleMatch = text.match(/Enquiry Title » (.+)/);
//     const descriptionMatch = text.match(/Enquiry Description ¥\s*([\s\S]*?)(?:\n1\.|$)/);
    
//     let enquiryTitle = "Not Found";
//     if (titleMatch) {
//         const lines = text.split('\n');
//         const titleIndex = lines.findIndex(line => line.includes("Enquiry Title »"));
//         if (titleIndex !== -1 && titleIndex + 1 < lines.length) {
//             enquiryTitle = lines[titleIndex + 1].trim();
//         }
//     }
    
//     return {
//         name: nameMatch ? nameMatch[1].trim() : "Not Found",
//         number: numberMatch ? numberMatch[1].trim() : "Not Found",
//         enquiryTitle: enquiryTitle,
//         enquiryDescription: descriptionMatch ? descriptionMatch[1].replace(/\n/g, ' ').trim() : "Not Found"
//     };
// }


// function laptopExtractDetails(text) {
//     const nameMatch = text.match(/« ([A-Za-z ]+) minutes ago/);
//     const numberMatch = text.match(/© (\d{10}) v lock/) ||  text.match(/©?\s?(\d{10})/);
//     const titleMatch = text.match(/Enquiry Title v (.+)/);
//     const descriptionMatch = text.match(/Enquiry Description ¥\s*([\s\S]*?)(?:\n& Profile|$)/);

//     return {
//         name: nameMatch ? nameMatch[1].trim() : "Not Found",
//         number: numberMatch ? numberMatch[1].trim() : "Not Found",
//         enquiryTitle: titleMatch ? titleMatch[1].trim() : "Not Found",
//         enquiryDescription: descriptionMatch ? descriptionMatch[1].replace(/\n/g, ' ').trim() : "Not Found"
//     };
// }


// (async () => {
//     const extractedText = await extractTextFromImage('./routes/image7.jpeg');
//     if (extractedText) {
//         const details = laptopExtractDetails(extractedText);
//         console.log("Extracted Details:", details);
//     }
// })();




const util = require('util');
const queryAsync = util.promisify(pool.query).bind(pool);
const queryAsync2 = util.promisify(pool2.query).bind(pool);
const queryAsync3 = util.promisify(pool3.query).bind(pool3);

 
















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

// router.post('/ccavRequestHandler', function (request, res){

//     request.session.source_code_id = request.body.source_code_id;
//     request.session.type = 'source_code'

//     let guid = () => {
//         let s4 = () => {
//             return Math.floor((1 + Math.random()) * 0x10000)
//                 .toString(16)
//                 .substring(1);
//         }
//         //return id of format 'aaaaaaaa'-'aaaa'-'aaaa'-'aaaa'-'aaaaaaaaaaaa'
//         return s4() + s4() + '-' + s4() + '-' + s4() + '-' + s4() + '-' + s4() + s4() + s4();
//     }

//     let body = request.body;
//     body['merchant_id'] = '1760015';
//     body['order_id'] = guid();
//     body['currency'] = 'INR';
//     body['amount'] = '10.00';
//     body['redirect_url'] = 'https://www.filemakr.com/ccavResponseHandler';
//     body['cancel_url'] =   'https://www.filemakr.com/ccavResponseHandler';
//     body['source_code_id'] = request.session.source_code_id;
//     body['type'] = 'source_code'
//     body['seo_name'] = request.body.seo_name

//    pool.query(`insert into payment_request set ?`,body,(err,result)=>{
//     if(err) throw err;
//     else{
   
// // ccavReqHandler.postReq(request, response);
// console.log(request.body)
// const encryptedOrderData = ccave.getEncryptedOrder(request.body);
// // console.log(encryptedOrderData);

// res.render('send',{enccode:encryptedOrderData,accesscode:'AVZN72JL86AQ28NZQA'})
//     }
//    })
// });



router.post('/ccavRequestHandler', dataService.date_and_time,async function (request, res) {
    try {

        const body = request.body;


        request.session.source_code_id = request.body.source_code_id;
        request.session.type = 'source_code';

        body['coupon_code']  = request.body.coupon_code || '';
body['final_amount'] = request.body.final_amount || '99.00';

        let amount = request.body.final_amount;
        //  if(request.body.referral_code == 'FILEMKR50'){
        //    amount = '250.00'
        //  }
        // //  else if(request.body.referral_code == 'COMBO99'){
        // //     amount = '99.00'
        // //   }
        //  else{
        //     amount = '500.00'
        //  }

        const guid = () => {
            const s4 = () => {
                return Math.floor((1 + Math.random()) * 0x10000)
                    .toString(16)
                    .substring(1);
            }
            return s4() + s4() + '-' + s4() + '-' + s4() + '-' + s4() + '-' + s4() + s4() + s4();
        }

        body['merchant_id'] = '1760015';
        body['order_id'] = guid();
        body['currency'] = 'INR';
        body['amount'] = amount;
        body['redirect_url'] = 'https://www.filemakr.com/ccavResponseHandler';
        body['cancel_url'] = 'https://www.filemakr.com/ccavResponseHandler';
        body['source_code_id'] = request.session.source_code_id;
        body['type'] = 'source_code';
        body['seo_name'] = request.body.seo_name;
        body['date'] = verify.getCurrentDate();
        body['referral_code'] = request.body.referral_code;
        body['status'] = 'pending'


        const result = await queryAsync('INSERT INTO payment_request SET ?', body);

        console.log(request.body);

        var title_case_name = request.body.seo_name.split('-') // Split the string into an array of words
        .map(function(word) {
            return word.charAt(0).toUpperCase() + word.slice(1); // Capitalize the first letter of each word
        })
        .join(' '); // Join the words back into a single string with spaces

        setImmediate(async () => {
          try {
               const userSubject = emailTemplates.beforesourcecode.userSubject.replace('{{Project_Name}}', title_case_name);
        const userMessage = emailTemplates.beforesourcecode.userMessage(request.body.billing_name,title_case_name,request.body.seo_name);

        await verify.sendUserMail(request.body.billing_email,userSubject,userMessage)
          } catch (backgroundErr) {
            console.error('Background task error (email):', backgroundErr);
          }
        });


     

        const encryptedOrderData = ccave.getEncryptedOrder(request.body);
        res.render('send', { enccode: encryptedOrderData, accesscode: 'AVZN72JL86AQ28NZQA' });
    } catch (err) {
        console.error('Error handling CCAV request:', err);
        res.status(500).send('Internal Server Error');
    }
});




// router.post('/ccavResponseHandler',(request,response)=>{
// const { encResp } = request.body;

// let decryptedJsonResponse = ccave.redirectResponseToJson(encResp);

// // response.json(request.session.source_code_id)

// console.log(request.body)

// decryptedJsonResponse.type = 'source_code'
// decryptedJsonResponse.typeid = request.session.source_code_id;


// pool.query(`insert into payment_response(order_id , tracking_id , bank_ref_no , order_status , failure_message , payment_mode , card_name , status_code , status_message , currency , amount , billing_name , billing_address , billing_city , billing_state , billing_zip , billing_tel , billing_email , trans_date) 
// values('${decryptedJsonResponse.order_id}' , '${decryptedJsonResponse.tracking_id}' , '${decryptedJsonResponse.bank_ref_no}' , '${decryptedJsonResponse.order_status}' , '${decryptedJsonResponse.failure_message}' , '${decryptedJsonResponse.payment_mode}' , '${decryptedJsonResponse.card_name}' , '${decryptedJsonResponse.status_code}' , '${decryptedJsonResponse.status_message}' , '${decryptedJsonResponse.currency}' , '${decryptedJsonResponse.amount}', '${decryptedJsonResponse.billing_name}' , '${decryptedJsonResponse.billing_address}' , '${decryptedJsonResponse.billing_city}', '${decryptedJsonResponse.billing_state}' , '${decryptedJsonResponse.billing_zip}', '${decryptedJsonResponse.billing_tel}', '${decryptedJsonResponse.billing_email}' , '${decryptedJsonResponse.trans_date}')`,(err,result)=>{
//     if(err) throw err;
//     else{
//         if(decryptedJsonResponse.order_status == 'Aborted' || decryptedJsonResponse.order_status =='Failure'){
//             // response.json({msg:'aborted or failed'})


//         pool.query(`select * from payment_request where order_id = '${request.body.orderNo}'`,(err,result)=>{
//             if(err) throw err;
//             else {
//                 console.log(result)
//                 response.redirect(`https://www.filemakr.com/${result[0].seo_name}/source-code`)
//             }
//         })



//         }
//         else if(decryptedJsonResponse.order_status == 'Success'){
//             pool.query(`select * from payment_request where order_id = '${request.body.orderNo}'`,(err,result)=>{
//                 if(err) throw err;
//                 else {
//                     pool.query(`select source_code from source_code where id = '${result[0].source_code_id}'`,(err,result)=>{
//                         if(err) throw err;
//                         //else res.json(result)
//                         else response.render('download-successfull',{result:result})
//                     })
//                 }
//             })
//         }

//         else{

//             response.json(decryptedJsonResponse)
          
    
         
//             // response.json({msg:'success'})
//         }
//     }
// })


// })


router.post('/ccavResponseHandler',dataService.allCategory, (request, response) => {
    console.log('routes call')
    const { encResp } = request.body;
    let decryptedJsonResponse = ccave.redirectResponseToJson(encResp);

    decryptedJsonResponse.type = 'source_code';
    decryptedJsonResponse.typeid = request.session.source_code_id;

    console.log('routes call after decryptedJsonResponse',decryptedJsonResponse)


    const insertQuery = `INSERT INTO payment_response(order_id, tracking_id, bank_ref_no, order_status, failure_message, payment_mode, card_name, status_code, status_message, currency, amount, billing_name, billing_address, billing_city, billing_state, billing_zip, billing_tel, billing_email, trans_date) 
                         VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    pool.query(insertQuery, [decryptedJsonResponse.order_id, decryptedJsonResponse.tracking_id, decryptedJsonResponse.bank_ref_no, decryptedJsonResponse.order_status, decryptedJsonResponse.failure_message, decryptedJsonResponse.payment_mode, decryptedJsonResponse.card_name, decryptedJsonResponse.status_code, decryptedJsonResponse.status_message, decryptedJsonResponse.currency, decryptedJsonResponse.amount, decryptedJsonResponse.billing_name, decryptedJsonResponse.billing_address, decryptedJsonResponse.billing_city, decryptedJsonResponse.billing_state, decryptedJsonResponse.billing_zip, decryptedJsonResponse.billing_tel, decryptedJsonResponse.billing_email, decryptedJsonResponse.trans_date], (err, result) => {
        if (err) {
            console.error('Error inserting payment response:', err);
            throw err;
        } else {
            if (decryptedJsonResponse.order_status === 'Aborted' || decryptedJsonResponse.order_status === 'Failure') {
                pool.query(`SELECT * FROM payment_request WHERE order_id = ?`, [request.body.orderNo], (err, result) => {
                    if (err) {
                        console.error('Error retrieving payment request:', err);
                        throw err;
                    } else {
                        response.redirect(`https://www.filemakr.com/${result[0].seo_name}/source-code`);
                    }
                });
            } else if (decryptedJsonResponse.order_status === 'Success') {



                pool.query(`update payment_request set status = 'success' where order_id = ?`,[request.body.orderNo],(err,result)=>{

                    if(err) throw err;
                    else{
                        pool.query(`SELECT * FROM payment_request WHERE order_id = ?`, [request.body.orderNo], (err, result) => {
                            if (err) {
                                console.error('Error retrieving payment request:', err);
                                throw err;
                            } else {
                                pool.query(`SELECT source_code FROM source_code WHERE id = ?`, [result[0].source_code_id], async(err, result) => {
                                    if (err) {
                                        console.error('Error retrieving source code:', err);
                                        throw err;
                                    } else {

                                      console.log('source code',result)
                                        let project_link = verify.generateSignedUrl(`https://filemakr.com/images/${result[0].source_code}`, result[0].source_code);
                                        


                                        if(decryptedJsonResponse.amount>110){
                                        response.render('download-successfull', { result: result,Metatags:onPageSeo.refundPage,CommonMetaTags:onPageSeo.commonMetaTags,msg:'',category:request.categories ,fullUrl:request.fullUrl,setupSupport:true});

                                        }
                                        else{
                                        response.render('download-successfull', { result: result,Metatags:onPageSeo.refundPage,CommonMetaTags:onPageSeo.commonMetaTags,msg:'',category:request.categories ,fullUrl:request.fullUrl,setupSupport:false});

                                        }
                                

                                       setImmediate(async () => {
          try {
            const userMessage = emailTemplates.soucrceCodeConfirmation.userMessage(decryptedJsonResponse.billing_name,project_link);
                            
                                        const adminSubject = emailTemplates.soucrceCodeConfirmation.adminSubject.replace('{{Customer_Name}}', decryptedJsonResponse.billing_name);
                                        const adminMessage = emailTemplates.soucrceCodeConfirmation.adminMessage(decryptedJsonResponse.billing_name , decryptedJsonResponse.billing_tel,project_link);
                            
                            
                                        await verify.sendUserMail(decryptedJsonResponse.billing_email,emailTemplates.soucrceCodeConfirmation.userSubject,userMessage);
                                        await verify.sendUserMail('filemakrxpert@gmail.com',adminSubject,adminMessage);

          } catch (backgroundErr) {
            console.error('Background task error (email):', backgroundErr);
          }
        });
                                        
                                       
                                    }
                                });
                            }
                        });
                    }
             })


               
            } else {
                response.json(decryptedJsonResponse);
            }
        }
    });
});



// router.get('/check-page',dataService.allCategory,(request,res)=>{
//    pool.query(`SELECT source_code,seo_name FROM source_code WHERE id = ?`, ['64'], async(err, result) => {
// if(err) throw err;
// else
//    res.render('download-successfull', { result: result,Metatags:onPageSeo.refundPage,CommonMetaTags:onPageSeo.commonMetaTags,msg:'',category:request.categories ,fullUrl:request.fullUrl,graduation_type_send:'',active:'source-code',setupSupport:false});
//    })
// })


// router.get('/images/:resource', (req, res) => {
//     // If the token is valid, the user can access the resource
//     res.sendFile(`/images/${req.resource}`);
// });



router.post('/ccavRequestHandler1',dataService.date_and_time, function (req, res){

    req.session.source_code_id = req.body.source_code_id;
    req.session.type = 'project_report'
    let body = req.body;

    // in ccavRequestHandler1
body['coupon_code']  = req.body.coupon_code || '';
body['final_amount'] = req.body.final_amount || '10.00';


    let amount = req.body.final_amount;
    console.log('amount',amount)
    
    let guid = () => {
        let s4 = () => {
            return Math.floor((1 + Math.random()) * 0x10000)
                .toString(16)
                .substring(1);
        }
        //return id of format 'aaaaaaaa'-'aaaa'-'aaaa'-'aaaa'-'aaaaaaaaaaaa'
        return s4() + s4() + '-' + s4() + '-' + s4() + '-' + s4() + '-' + s4() + s4() + s4();
    }

    body['merchant_id'] = '1760015';
    body['order_id'] = guid();
    body['currency'] = 'INR';
    body['amount'] = amount;
    body['redirect_url'] = 'https://www.filemakr.com/ccavResponseHandler1';
    body['cancel_url'] =   'https://www.filemakr.com/ccavResponseHandler1';
    body['source_code_id'] = req.session.source_code_id;
    body['type'] = 'project_report'
    body['seo_name'] = req.body.seo_name;
    body['date'] = verify.getCurrentDate();
    body['roll_number'] = req.session.roll_number
   



   pool.query(`insert into payment_request set ?`,body,(err,result)=>{
    if(err) throw err;
    else{
   
// ccavReqHandler.postReq(req, response);
console.log(req.body)
const encryptedOrderData = ccave.getEncryptedOrder(req.body);
// console.log(encryptedOrderData);

console.log('payment k response tk sahi h',req.session) 


res.render('send1',{enccode:encryptedOrderData,accesscode:'AVZN72JL86AQ28NZQA'})
    }
   })
});




router.post('/ccavResponseHandler1',(req,response)=>{
    const { encResp } = req.body;
    
    // console.log('after payment', req.session);

    
    let decryptedJsonResponse = ccave.redirectResponseToJson(encResp);
    
    // response.json(req.session.source_code_id)
    
    // console.log(req.body)
    
    decryptedJsonResponse.type = 'project_report'
    decryptedJsonResponse.typeid = req.session.source_code_id;
    
    
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
               
                pool.query(`select * from payment_request where order_id = '${req.body.orderNo}' limit 1`,(err,result)=>{
                    if(err) throw err;
                    else {

    req.session.roll_number = result[0].roll_number;
    req.session.ispayment ='done';

pool.query(`update payment_request set status = 'success' where order_id = '${req.body.orderNo}'`,(err,result)=>{
    if(err) throw err;
    else {
        pool.query(`update btech_project set status = 'success' where roll_number = '${req.session.roll_number}' order by id desc limit 1`,async(err,result)=>{
            if(err) throw err;
            else {
    
                let project_link = `https://filemakr.com/download-my-report?roll_number=${req.session.roll_number}`
                const userMessage = emailTemplates.orderConfirmation.userMessage(decryptedJsonResponse.billing_name,project_link);
    
                const adminSubject = emailTemplates.orderConfirmation.adminSubject.replace('{{Customer_Name}}', decryptedJsonResponse.billing_name);
                const adminMessage = emailTemplates.orderConfirmation.adminMessage(decryptedJsonResponse.billing_name , decryptedJsonResponse.billing_tel,req.session.roll_number,project_link);
    
    
                await verify.sendUserMail(decryptedJsonResponse.billing_email,emailTemplates.orderConfirmation.userSubject,userMessage);
                await verify.sendUserMail('filemakrxpert@gmail.com',adminSubject,adminMessage);
                response.redirect('/download-project-report')
    
            }
        })
    }
})
   
    
                    }
    
                })
       
        
                    }
                   
               
          
            else{
    
                response.json(decryptedJsonResponse)
    
              
            }
        }
    })
    
    
    })



// router.get('/download-project-report',(req,res)=>{
//     // req.session.roll_number = '0904cs151020'
//     // req.session.roll_number = '21btrcs212'

//     if(req.session.roll_number){


//         if(req.session.deviceInfo == 'mobile'){
        
        
        
        
//           pool.query(`select * from btech_project where roll_number = '${req.session.roll_number}' order by id desc limit 1`,(err,result)=>{
//                 if(err) throw err;
//                 else {
//                     console.log(req.session.roll_number)
//                     console.log(result[0].php)
//                    var query = `select * from btech_project where roll_number = '${req.session.roll_number}' order by id desc limit 1;`
//                    var query1 = `select * from programming_language where id = '${result[0].html}' or id = '${result[0].css}' or id = '${result[0].bootstrap}' or id = '${result[0].javascript}' or id = '${result[0].jquery}' or id = '${result[0].json}' or id = '${result[0].react}' or id = '${result[0].angular}'  ;`
//                    var query2 = `select * from programming_language where id = '${result[0].php}' or id = '${result[0].nodejs}' or id = '${result[0].python}' or id = '${result[0].java}';`
//                    var query3 = `select * from project where id = '${result[0].projectid}';`
//                    //For Testing
        
//                    pool.query(query+query1+query2+query3,(err,result)=>{
//                        if(err) throw err;
//                        //else res.json(result)
//                        else res.render('B.Tech/finalnew',{result:result})
//                    })
        
//                 }
//             })
        
        
        
//         }
//         else{
        
        
//           pool.query(`select * from btech_project where roll_number = '${req.session.roll_number}' order by id desc limit 1`,(err,result)=>{
//                 if(err) throw err;
//                 else {
//                     console.log(req.session.roll_number)
//                     console.log('laravl',result[0].laravel)
//                    var query = `select * from btech_project where roll_number = '${req.session.roll_number}' order by id desc limit 1;`
//                    var query1 = `select * from programming_language where id = '${result[0].html}' or id = '${result[0].css}' or id = '${result[0].bootstrap}' or id = '${result[0].javascript}' or id = '${result[0].jquery}' or id = '${result[0].json}' or id = '${result[0].react}' or id = '${result[0].angular}'  ;`
//                    var query2 = `select * from programming_language where id = '${result[0].php}' or id = '${result[0].nodejs}' or id = '${result[0].python}' or id = '${result[0].java}'  or id = '${result[0].laravel}';`
//                    var query3 = `select * from project where id = '${result[0].projectid}';`
//                  //For Testing
        
//                    pool.query(query+query1+query2+query3,(err,result)=>{
//                        if(err) throw err;
//                        else res.render('B.Tech/finalnew',{result:result})
//                    })
        
//                 }
//             })
        
//         }
        
        
//         }
//         else{
//             res.redirect('/')
//         }
// })



router.get('/download-project-report', async (req, res) => {
    // req.session.roll_number = '1132230096';
    // req.session.roll_number = '61'
    // req.session.ispayment = 'done'

    console.log('why this roll_number',req.session.ispayment)
    console.log('why this roll_number',req.session.roll_number)

    if (req.session.roll_number && req.session.ispayment) {
        pool.query(`select * from btech_project where roll_number = '${req.session.roll_number}' order by id desc limit 1`,(err,result)=>{
            if(err) throw err;
            else {
                console.log(req.session.roll_number)
                // Split the backend string into an array of IDs
const backendIds = result[0].backend.split(',');
const frontIds = result[0].frontend.split(',');


// Create an array to hold the conditions for each ID
const conditions = backendIds.map(id => `id = '${id.trim()}'`);
const conditions1 = frontIds.map(id => `id = '${id.trim()}'`);

                // let frontend = result[0].backend
                // console.log(result[0].projectid)
               var query = `select * from btech_project where roll_number = '${req.session.roll_number}' order by id desc limit 1;`
               var query1 = `SELECT * FROM programming_language WHERE ${conditions1.join(' OR ')};`
               var query2 = `SELECT * FROM programming_language WHERE ${conditions.join(' OR ')};`;
               var query3 = `select * from project where id = '${result[0].projectid}';`
               var query4 = `SELECT * FROM screenshots WHERE source_code_id = (SELECT assign FROM project WHERE id = '${result[0].projectid}');`
               //For Testing
    
               pool.query(query+query1+query2+query3+query4,(err,result)=>{
                   if(err) throw err;
                //    else res.json(result)

                //    else 
                else{

                   // Define a mapping of report types to project types
const typeMapping = {
    'BCA': 'Bachelor of Computer Application',
    'MCA': 'Master of Computer Application',
    'M.Tech': 'Master of Technology',
    'B.Tech': 'Bachelor of Technology',
    'B.E.': 'Bachelor of Engineering',
    'M.E.': 'Master of Engineering',
    'BSc': 'Bachelor of Science',
    'MSc': 'Master of Science'
};

// Check if the report type exists in the mapping, otherwise use the original report type
const project_type = typeMapping[result[0][0].report_type] || result[0][0].report_type;

                    res.render('B.Tech/finalnew',{result:result,project_type})
                    // res.json(result)
                }
               })
    
            }
        })
    }    
           
    else {
        res.redirect('/');
    }
});



router.get('/download-project-report1', async (req, res) => {
    // req.session.roll_number = 'SRCEM';

    // req.session.roll_number = '222111210356'
   
        pool.query(`select * from btech_project where roll_number = '${req.session.roll_number}' order by id desc limit 1`,(err,result)=>{
            if(err) throw err;
            else {
                console.log(req.session.roll_number)
                // Split the backend string into an array of IDs
const backendIds = result[0].backend.split(',');
const frontIds = result[0].frontend.split(',');


// Create an array to hold the conditions for each ID
const conditions = backendIds.map(id => `id = '${id.trim()}'`);
const conditions1 = frontIds.map(id => `id = '${id.trim()}'`);

                // let frontend = result[0].backend
                // console.log(result[0])
               var query = `select * from btech_project where roll_number = '${req.session.roll_number}' order by id desc limit 1;`
               var query1 = `SELECT * FROM programming_language WHERE ${conditions1.join(' OR ')};`
               var query2 = `SELECT * FROM programming_language WHERE ${conditions.join(' OR ')};`;
               var query3 = `select * from project where id = '${result[0].projectid}';`
               //For Testing
    
               pool.query(query+query1+query2+query3,(err,result)=>{
                   if(err) throw err;
                //    else res.json(result)
                   else res.json(result)
               })
    
            }
        })
  
});















router.get('/index2',(req,res)=>{
    res.render('index2')
})





router.use((req, res, next) => {
    req.startTime = Date.now();
    next();
});


// using this route
router.get('/', dataService.allCategory, async (req, res) => {
    try {
        req.session.referralCode = req.query.referral
        const projectQuery = 'SELECT name, seo_name, short_description FROM project limit 8';
        const sourceCodeQuery = 'SELECT * FROM source_code';
        const liveprojectQuery = 'SELECT * FROM source_code where demo_url is not null limit 8';


        const [project, sourceCode,liveproject] = await Promise.all([
            queryAsync(projectQuery),
            queryAsync(sourceCodeQuery),
            queryAsync(liveprojectQuery)
        ]);
        

        res.render('index1', {
            Metatags: onPageSeo.homePage,
            CommonMetaTags: onPageSeo.commonMetaTags,
            project,
            sourceCode,
            liveproject,
            category: req.categories,
            fullUrl:req.fullUrl,
            active:'home',
            graduation_type_send:''
        });

        const endTime = Date.now();
        console.log(`Response time: ${endTime - req.startTime}ms`);
    } catch (err) {
        console.error(err);
        res.status(500).send('Internal Server Error');
    }
});



router.get('/contact-us',dataService.allCategory,async (req, res) => { 
      res.render('contact',{Metatags:onPageSeo.contactPage,CommonMetaTags:onPageSeo.commonMetaTags,msg:'',category:req.categories,fullUrl:req.fullUrl,active:'',graduation_type_send:''})
   })


   router.get('/about-us',dataService.allCategory,async(req, res) => {
    res.render('aboutus',{Metatags:onPageSeo.aboutPage,CommonMetaTags:onPageSeo.commonMetaTags,msg:'',category:req.categories,fullUrl:req.fullUrl,active:'',graduation_type_send:''})
 })  
 
 
router.get('/refund-policy',dataService.allCategory,async (req, res) => {
    res.render('refund',{Metatags:onPageSeo.refundPage,CommonMetaTags:onPageSeo.commonMetaTags,msg:'',category:req.categories,fullUrl:req.fullUrl,active:'',graduation_type_send:''})
});


router.get('/privacy-policy',dataService.allCategory,async(req, res) => { 
    res.render('privacy',{Metatags:onPageSeo.privacyPage,CommonMetaTags:onPageSeo.commonMetaTags,msg:'',category:req.categories,fullUrl:req.fullUrl,active:'',graduation_type_send:''})
 })


 router.get('/terms-and-conditions',dataService.allCategory,async(req, res) => { 
    res.render('terms',{Metatags:onPageSeo.termsPage,CommonMetaTags:onPageSeo.commonMetaTags,msg:'',category:req.categories,fullUrl:req.fullUrl,active:'',graduation_type_send:''})
 })



// router.post('/get-html-response',(req,res)=>{
//     pool.query(`select ${req.body.value} from source_code where id = '${req.body.id}'`,(err,result)=>{
//         if(err) throw err;
//         else res.json(result);
//     })
// })

router.post('/get-html-response', (req, res) => {
    const { value, id } = req.body;
    const query = `SELECT ${pool.escapeId(value)} FROM source_code WHERE id = ?`;
    
    pool.query(query, [id], (err, result) => {
        if (err) {
            console.error('Error executing SQL query:', err);
            return res.status(500).json({ error: 'Internal Server Error' });
        }
        
        res.json(result);
    });
});



// router.post('/contact-us',dataService.date_and_time,async(req,res)=>{
//     let body = req.body
//     body['date'] = req.currentDate

//     pool.query(`insert into contactus set ?`,body,(err,result)=>{
//         if(err) throw err;
//         else{

//             let category = await dataService.allCategory
//       res.render('contact',{Metatags:onPageSeo.contactPage,CommonMetaTags:onPageSeo.commonMetaTags,msg:'Our team will contact you soon',category:category})
   
//         }

//     })
// //     pool.query(`insert into contactus set ?`,body,(err,result)=>{(
// //     if(err) throw err;
// //     else{

// //     }
// // })
// })




router.post('/contact-us', dataService.date_and_time, dataService.allCategory, async (req, res) => {
    try {
        let body = req.body;
        body['date'] = req.currentDate;
        body['status'] = 'pending'

        pool.query('INSERT INTO contactus SET ?', body, async (err, result) => {
            if (err) {
                console.error('Error inserting into contactus:', err);
                throw err;
            } else {
                try {
                    // Access categories from req object
                    let category = req.categories;

                    res.render('contact', {
                        Metatags: onPageSeo.contactPage,
                        CommonMetaTags: onPageSeo.commonMetaTags,
                        msg: 'Our team will contact you soon',
                        category: category,
                        fullUrl:req.fullUrl
                    });
                } catch (error) {
                    console.error('Error accessing categories from req:', error);
                    throw error;
                }
            }
        });
    } catch (error) {
        console.error('Error processing contact form:', error);
        res.status(500).send('Internal Server Error');
    }
});






router.get('/synopsis', (req, res) => {
    res.redirect('/btech-final-year-project-report')
})



//old route
router.get('/cse/:name',(req,res)=>{
    res.redirect(`/btech-final-year-project-report-${req.params.name}`)
})



// new btech route




// using this routes
   router.get('/final-year-project-ideas',dataService.allCategory, (req, res) => { 
    res.setHeader('X-Robots-Tag', 'index, follow');
pool.query(`select name,seo_name,short_description from project where assign is not null`,
(err,result)=>err ? console.log(err) : res.render('project-ideas',{result:result,Metatags: onPageSeo.projectPage,
    CommonMetaTags: onPageSeo.commonMetaTags,category:req.categories,msg:'',fullUrl:req.fullUrl,graduation_type_send:'',active:'report'}))
})


// using this route
router.get('/source-code',dataService.allCategory, (req, res) => { 
    res.setHeader('X-Robots-Tag', 'index, follow');
    pool.query(`select * from source_code`, 
    (err,result)=>err ? console.log(err) : res.render('category',{result:result,Metatags: onPageSeo.homePage,
        CommonMetaTags: onPageSeo.commonMetaTags,category:req.categories,fullUrl:req.fullUrl,graduation_type_send:'',active:'source-code'}))
    })



    // using this route
router.get('/demo',dataService.allCategory, (req, res) => { 
    res.setHeader('X-Robots-Tag', 'index, follow');
    pool.query(`select * from source_code where demo_url is not null`, 
    (err,result)=>err ? console.log(err) : res.render('live_demo',{result:result,Metatags: onPageSeo.homePage,
        CommonMetaTags: onPageSeo.commonMetaTags,category:req.categories,fullUrl:req.fullUrl,graduation_type_send:'',active:'demo'}))
    })


    // using this route
router.get('/final-year-project-report-:name',dataService.allCategory,(req,res)=>{

    let graduation_type_send = '';
   
    
       var query = `select * from project where seo_name = '${req.params.name}';`
       var query2 = `select name,seo_name,short_description from project where seo_name!= '${req.params.name}';`
       pool.query(query+query2,(err,result)=>{
           err ? console.log(err) : res.render('single-project-report',{result:result,Metatags: onPageSeo.homePage,
            CommonMetaTags: onPageSeo.commonMetaTags,category:req.categories,fullUrl:req.fullUrl,active:'report',graduation_type_send})
       })
   })


// using this routes
router.get('/:graduation_type-final-year-project-report', dataService.allCategory, async (req, res) => {
  

  // Map for graduation types
  const DEGREE_MAP = {
    btech: 'B.Tech',
    mtech: 'M.Tech',
    be: 'B.E.',
    me: 'M.E.',
    bca: 'BCA',
    mca: 'MCA',
    msc: 'MSc',
    bsc: 'BSc',
  };


  const original = String(req.params.graduation_type || '').toLowerCase().trim();
  const graduation_type_send = DEGREE_MAP[original] ?? original.toUpperCase();

  // --- OPTIONAL: tiny in-memory cache (60s TTL) to reduce DB load ---
  // Feel free to remove if you don't want caching.
  const CACHE_TTL_MS = 60 * 1000;
  if (!global.__projectReportCache) {
    global.__projectReportCache = { data: null, exp: 0 };
  }
  const cache = global.__projectReportCache;

  try {
    let rows;

    if (cache.data && cache.exp > Date.now()) {
      rows = cache.data;
    } else {
      const sql = `
        SELECT name, seo_name, short_description
        FROM project
        WHERE assign IS NOT NULL
      `;
      // Using mysql2/promise pool
      const [result] = await pool.promise().query(sql);
      rows = result;
      cache.data = rows;
      cache.exp = Date.now() + CACHE_TTL_MS;
    }

    // Optional HTTP caching for intermediaries/browsers (adjust as needed)
    res.setHeader('Cache-Control', 'public, max-age=60');

    res.render('project-report', {
      result: rows,
      graduation_type_send,
      original,
      Metatags: onPageSeo.homePage,
      CommonMetaTags: onPageSeo.commonMetaTags,
      category: req.categories,
      msg: '',
      fullUrl: req.fullUrl,
      active:'report'
    });
  } catch (err) {
    console.error('project-report route error:', err);
    res.status(500).render('error', {
      message: 'Something went wrong. Please try again.',
      error: process.env.NODE_ENV === 'development' ? err : {},
    });
  }
});


// using this route
router.get('/:graduation_type-final-year-project-report-:name',dataService.allCategory,(req,res)=>{

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

      else if(req.params.graduation_type == 'msc'){
       graduation_type_send = 'MSc'
     }

      else if(req.params.graduation_type == 'bsc'){
       graduation_type_send = 'BSc'
     }
  
       var query = `select * from project where seo_name = '${req.params.name}';`
       var query1 = `select * from programming_language where name = 'HTML' || name = 'CSS' || name = 'JavaScript' || name = 'PHP';`
       var query2 = `select name,seo_name,short_description from project where seo_name!= '${req.params.name}';`
       pool.query(query+query1+query2,(err,result)=>{
           err ? console.log(err) : res.render('graduation-single-project-report',{result:result,graduation_type_send,original:req.params.graduation_type,Metatags: onPageSeo.homePage,
            CommonMetaTags: onPageSeo.commonMetaTags,category:req.categories,fullUrl:req.fullUrl,active:'report'})
            const endTime = Date.now();
        console.log(`Response time: ${endTime - req.startTime}ms`);
       })
   })


// using this route
router.get('/:graduation_type-final-year-project-report-:name/edit',dataService.allCategory,(req,res)=>{


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
    var query1 = `select name,id,type from programming_language where type = 'backend[]';`
    var query2 = `select name,id,type from programming_language where type = 'frontend[]';`

    pool.query(query+query1+query2,(err,result)=>{
        err ? console.log(err) : res.render('customization',{result : result,msg:req.query.msg,graduation_type_send,original:req.params.graduation_type,Metatags: onPageSeo.homePage,
        CommonMetaTags: onPageSeo.commonMetaTags,category:req.categories,fullUrl:req.fullUrl,active:'report'})
    })

})





// using this route
router.get('/api/coupon/validate', (req, res) => {
  const code = (req.query.code || '').trim();
  if (!code) return res.json({ valid:false });

  const sql = 'SELECT discount FROM shopkeeper WHERE unique_code = ? LIMIT 1';
  pool.query(sql, [code], (err, rows) => {
    if (err) {
      console.error('Coupon lookup error:', err);
      return res.status(500).json({ valid:false });
    }
    if (!rows || !rows.length) return res.json({ valid:false });
    const discount = Number(rows[0].discount) || 0;
    if (discount <= 0) return res.json({ valid:false });
    res.json({ valid:true, discount });
  });
});




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



//new mtech edit route

//new me edit route



//new mca edit route




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



router.get('/search',dataService.allCategory,(req,res)=>{
    if(req.query.type == 'Project Report'){
        pool.query(`select name,seo_name,short_description from project where assign is not null and seo_name like '%${req.query.q}%'`,
        (err,result)=>err ? console.log(err) : res.render('project-ideas',{result:result,Metatags: onPageSeo.successPage,
                CommonMetaTags: onPageSeo.commonMetaTags,
                category: req.categories,msg:'',fullUrl:req.fullUrl}))
    }
    else{
        pool.query(`select name,seo_name,description from source_code where seo_name like '%${req.query.q}%'`,
        (err,result)=>err ? console.log(err) : res.render('searching-source-code',{result:result,Metatags: onPageSeo.successPage,
                CommonMetaTags: onPageSeo.commonMetaTags,
                category: req.categories,msg:'',fullUrl:req.fullUrl,graduation_type_send:'',active:''}))  
    }
})




// using this routes
router.get('/source-code/:category', dataService.allCategory ,async (req, res) => {
    res.setHeader('X-Robots-Tag', 'index, follow');
    // Split the string into an array of words separated by hyphens

    
var words = req.params.category.split('-');

// Capitalize the first letter of each word and join them with spaces
var graduation_type_send = words.map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
    try {        
        pool.query(
            'SELECT name, seo_name, description, image FROM source_code WHERE category = ?',
            [req.params.category],
            (err, result) => {
                if (err) {
                    console.error(err);
                    return res.status(500).send('Internal Server Error');
                }

                res.render('source_code', {
                    result: result,
                    graduation_type_send,
                    original:req.params.category,
                    msg: '',
                    category: req.categories,
                    fullUrl:req.fullUrl,
                    active:'source-code'
                });
            }
        );
        const endTime = Date.now();
        console.log(`Response time: ${endTime - req.startTime}ms`);
    } catch (error) {
        console.error(error);
        res.status(500).send('Internal Server Error');
    }
});



// using this routes
router.get('/:name/source-code', dataService.allCategory, async (req, res) => {
    try {
        const projectidQuery = await queryAsync('SELECT id,category,license FROM source_code WHERE seo_name = ?', [req.params.name]);
        const projectid = projectidQuery[0].id;
        const projectcategory = projectidQuery[0].category;
        const projectlicense = projectidQuery[0].license;

        console.log('ca',projectcategory)

     

              const queries = [
            'SELECT * FROM source_code WHERE seo_name = ?;',
            `SELECT name, seo_name, description, image FROM source_code WHERE seo_name != ? and category = '${projectcategory}' ORDER BY RAND() LIMIT 12;`,
            'SELECT * FROM screenshots WHERE source_code_id = ?;'
        ];
        const params = [req.params.name, req.params.name, projectid];
        const result = await queryAsync(queries.join(' '), params);

        // res.render('download-source-code', { result, category: req.categories, fullUrl:req.fullUrl });

        const endTime = Date.now();
        console.log(`Response time: ${endTime - req.startTime}ms`);

        // if(projectlicense){
            res.render('download-source-code', { result, category: req.categories, fullUrl:req.fullUrl,active:'source-code',graduation_type_send:'' ,projectlicense });
        // }
        // else{
        //  res.render('under_maintenace',{result, category: req.categories, fullUrl:req.fullUrl,active:'source-code',graduation_type_send:'',projectlicense })
        // }
   
         

      

         } catch (error) {
        console.error('Error executing queries:', error);
        res.status(500).send('Internal Server Error');
    }

      
});



// router.get('/web-development',(req,res)=>{
//     res.render('web-development',{type:'Web Development'})
// })

// router.get('/web-design',(req,res)=>{
//     res.render('web-design',{type:'Web Design'})
// })


// router.get('/app-development',(req,res)=>{
//     res.render('app-development',{type:'App Development'})
// })

// router.get('/graphics-design',(req,res)=>{
//     res.render('graphics-design',{type:'Graphics Design'})
// })

// router.get('/video-editing',(req,res)=>{
//     res.render('video-editing',{type:'Video Editing'})
// })






//  TaskTango Payment Recieved













    router.get('/failue-page',(req,res)=>{
        res.render('failed',{type:'Dear valued customer, we regret to inform you that the transaction you initiated has failed. We apologize for any inconvenience this may have caused. Please ensure that you have sufficient funds or correct payment information for future transactions.'})
    })

    router.get('/success-page',(req,res)=>{
        res.render('success',{type:`Dear customer, we would like to inform you that your recharge has been successfully processed and your account's validity has been extended until   2023-05-23. Thank you for choosing our services.`})
    })
    


    // router.post('/requestForDemo',dataService.allCategory,(req,res)=>{
    //     let body = req.body;
    //     console.log(body);
    //     pool.query(`insert into requestDemo set ?`,body,(err,result)=>{
    //         if(err) throw err;
    //         else res.render('success',{type:'Thankyou for requesting a demo.Our team will contact you soon', Metatags: onPageSeo.successPage,
    //         CommonMetaTags: onPageSeo.commonMetaTags,category:req.categories})
    //     })
    // })

    router.post('/requestForDemo', dataService.date_and_time, dataService.allCategory, async (req, res) => {
        try {
            const body = req.body;
            body['status'] = 'pending';
        body['date'] = req.currentDate;

            console.log(body);
            const result = await queryAsync('INSERT INTO requestDemo SET ?', body);
            pool.query(`select * from liveDemo where source_code = '${req.body.source_code_id}'`,(err,result)=>{
                if(err) throw err;
                else if(result.length>0){
                    // console.log(result[0])
                    res.redirect(result[0].link)
                }
                else{
                    res.render('success', {
                        type: 'Thank you for requesting a demo. Our team will contact you soon',
                        Metatags: onPageSeo.successPage,
                        CommonMetaTags: onPageSeo.commonMetaTags,
                        category: req.categories,
                        fullUrl:req.fullUrl
                    });
                }
            })
          
        } catch (err) {
            console.error('Error processing demo request:', err);
            res.status(500).send('Internal Server Error');
        }
    });



    
    router.get('/v1/user/profile',(req,res)=>{
        let a =[
            {
            "id": 7,
            "name": "Vaanika Shah",
            "number": "7021198737",
            "unique_id": "3459316",
            "password": "123",
            "percentage": "20"
            }
            ]
            
        res.json(a)
    })



    router.post('/dashboard/requestForDemo', dataService.date_and_time, dataService.allCategory, async (req, res) => {
        try {
            let body = req.body;
            body['status'] = 'pending';
        body['date'] = req.currentDate;
      
            console.log('insert data',body);
            const result = await queryAsync('INSERT INTO requestDemo SET ?', body);
            res.json({msg:'success'})
        } catch (err) {
            console.error('Error processing demo request:', err);
            res.status(500).send('Internal Server Error');
        }
      });




      router.post('/dashboard/sentmail', dataService.date_and_time, dataService.allCategory, async (req, res) => {
        try {
            let body = req.body;
            
      await dataService.sendDemoMail({ result: body});

            res.json({msg:'success'})
        } catch (err) {
            console.error('Error processing demo request:', err);
            res.status(500).send('Internal Server Error');
        }
      });

// Find the second smallest number?



router.get('/api',(req,res)=>{
    pool.query(`select * from ${table_name} where id = '${id}'`,(err,result)=>{
        if(err) throw err;
        else {
            let a =
            {
                "formatVersion" : 1,
                "passTypeIdentifier" : "pass.com.expo.passmaker",
                "teamIdentifier" : "6ST4QA3X2Z",
                "barcode" : {
                  "message" : `${result[0].name}`,
                  "format" : "PKBarcodeFormatQR",
                  "messageEncoding" : "iso-8859-1",
                  "backgroundColor": "rgb(255, 255, 255)"
                },
                "organizationName" : "Toy Town",
                "description" : "Toy Town Membership",
                "logoText" : "Toy Town",
                "labelColor": "rgb(255, 255, 255)",
                "logoTextColor": "rgb(255, 255, 255)",
                "foregroundColor" : "rgb(255, 255, 255)",
                "backgroundColor" : "rgb(197, 31, 31)",
                "generic" : {
                  "primaryFields" : [
                    
                  ],
                  "secondaryFields" : [
                    
                  ],
                  "auxiliaryFields" : [
                    
                  ]
                 
                }
              }
              
        }
    })
})
    

// For Google Login

const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;


passport.use(new GoogleStrategy({
    clientID: '215117966247-hds0pt2s321nota106e5ninkcbuemtjh.apps.googleusercontent.com',
    clientSecret: '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',
    callbackURL: 'https://filemakr.com/auth/google/callback'
  },
  (accessToken, refreshToken, profile, done) => {
    // Use the profile information (e.g., profile.id, profile.displayName) to authenticate or create a user in your system
    // You can also store the accessToken and refreshToken for future use
    console.log('user',profile)
    return done(null, profile);
  }
));


// Serialize and deserialize user
passport.serializeUser((user, done) => {
    done(null, user);
  });
  
  passport.deserializeUser((obj, done) => {
    done(null, obj);
  });

  router.get('/api/v1/users/auth/google',
  passport.authenticate('google', { scope: ['profile', 'email'] }));

// // Google login callback route
// router.get('/auth/google/callback',
//   passport.authenticate('google', { failureRedirect: '/login' }),
//   (req, res) => {
//     // Successful authentication, send user details as JSON response
//     res.json({ user: req.user });
//   });



router.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/login' }),
  (req, res) => {
    // Create a query object to store user data


    // Redirect to the callback URL with user data as query parameters
    res.redirect(`/login-success?a=done&id=${req.user.id}&displayName=${req.user.displayName}&email=${req.user.emails[0].value}&photos=${req.user.photos[0].value}`);
  });

router.get('/login-success', (req, res) => {
    // Parse the JSON string to get the user object
    
    res.json(req.query);
});




router.get('/view-user-report', async (req, res) => {
    req.session.ispayment = 'done'

    console.log('why this roll_number',req.session.ispayment)
    console.log('why this roll_number',req.query.roll_number)

    if (req.query.roll_number && req.session.ispayment) {
        pool.query(`select * from btech_project where roll_number = '${req.query.roll_number}' order by id desc limit 1`,(err,result)=>{
            if(err) throw err;
            else {
                console.log(req.query.roll_number)
                // Split the backend string into an array of IDs
const backendIds = result[0].backend.split(',');
const frontIds = result[0].frontend.split(',');


// Create an array to hold the conditions for each ID
const conditions = backendIds.map(id => `id = '${id.trim()}'`);
const conditions1 = frontIds.map(id => `id = '${id.trim()}'`);

                // let frontend = result[0].backend
                // console.log(result[0].projectid)
               var query = `select * from btech_project where roll_number = '${req.query.roll_number}' order by id desc limit 1;`
               var query1 = `SELECT * FROM programming_language WHERE ${conditions1.join(' OR ')};`
               var query2 = `SELECT * FROM programming_language WHERE ${conditions.join(' OR ')};`;
               var query3 = `select * from project where id = '${result[0].projectid}';`
             var query4 = `SELECT * FROM screenshots WHERE source_code_id = (SELECT assign FROM project WHERE id = '${result[0].projectid}');`
               //For Testing
    
               pool.query(query+query1+query2+query3+query4,(err,result)=>{
                   if(err) throw err;
                //    else res.json(result)

                //    else 
                else{

                   // Define a mapping of report types to project types
const typeMapping = {
    'BCA': 'Bachelor of Computer Application',
    'MCA': 'Master of Computer Application',
    'M.Tech': 'Master of Technology',
    'B.Tech': 'Bachelor of Technology',
    'B.E.': 'Bachelor of Engineering',
    'M.E.': 'Master of Engineering',
    'BSc': 'Bachelor of Science',
    'MSc': 'Master of Science'
};

// Check if the report type exists in the mapping, otherwise use the original report type
const project_type = typeMapping[result[0][0].report_type] || result[0][0].report_type;

                    res.render('B.Tech/finalnew',{result:result,project_type})
                    // res.json(result)
                }
               })
    
            }
        })
    }    
           
    else {
        res.redirect('/');
    }
});





router.get('/download-my-report', async (req, res) => {
    req.session.ispayment = 'done'

  

    if (req.query.roll_number && req.session.ispayment) {
        pool.query(`select * from btech_project where roll_number = '${req.query.roll_number}' and status = 'success' order by id desc limit 1`,(err,result)=>{
            if(err) throw err;
            else if(result.length>0){
                console.log(req.query.roll_number)
                // Split the backend string into an array of IDs
const backendIds = result[0].backend.split(',');
const frontIds = result[0].frontend.split(',');


// Create an array to hold the conditions for each ID
const conditions = backendIds.map(id => `id = '${id.trim()}'`);
const conditions1 = frontIds.map(id => `id = '${id.trim()}'`);

                // let frontend = result[0].backend
                // console.log(result[0].projectid)
               var query = `select * from btech_project where roll_number = '${req.query.roll_number}' order by id desc limit 1;`
               var query1 = `SELECT * FROM programming_language WHERE ${conditions1.join(' OR ')};`
               var query2 = `SELECT * FROM programming_language WHERE ${conditions.join(' OR ')};`;
               var query3 = `select * from project where id = '${result[0].projectid}';`
               var query4 = `SELECT * FROM screenshots WHERE source_code_id = (SELECT assign FROM project WHERE id = '${result[0].projectid}');`
               //For Testing
    
               pool.query(query+query1+query2+query3+query4,(err,result)=>{
                   if(err) throw err;
                //    else res.json(result)

                //    else 
                else{

                   // Define a mapping of report types to project types
const typeMapping = {
    'BCA': 'Bachelor of Computer Application',
    'MCA': 'Master of Computer Application',
    'M.Tech': 'Master of Technology',
    'B.Tech': 'Bachelor of Technology',
    'B.E.': 'Bachelor of Engineering',
    'M.E.': 'Master of Engineering',
    'BSc': 'Bachelor of Science',
    'MSc': 'Master of Science'
};

// Check if the report type exists in the mapping, otherwise use the original report type
const project_type = typeMapping[result[0][0].report_type] || result[0][0].report_type;

                    res.render('B.Tech/finalnew',{result:result,project_type})
                    // res.json(result)
                }
               })
            }
            else {
        res.redirect('/');
               
    
            }
        })
    }    
           
    else {
        res.redirect('/');
    }
});








router.get('/download-my-report', async (req, res) => {
    // req.query.roll_number = '21BECE30336';
    // req.query.roll_number = '61'
    req.session.ispayment = 'done'

    console.log('why this roll_number',req.session.ispayment)
    console.log('why this roll_number',req.query.roll_number)

    if (req.query.roll_number && req.session.ispayment) {
        pool.query(`select * from btech_project where roll_number = '${req.query.roll_number}' order by id desc limit 1`,(err,result)=>{
            if(err) throw err;
            else {
                console.log(req.query.roll_number)
                // Split the backend string into an array of IDs
const backendIds = result[0].backend.split(',');
const frontIds = result[0].frontend.split(',');


// Create an array to hold the conditions for each ID
const conditions = backendIds.map(id => `id = '${id.trim()}'`);
const conditions1 = frontIds.map(id => `id = '${id.trim()}'`);

                // let frontend = result[0].backend
                // console.log(result[0].projectid)
               var query = `select * from btech_project where roll_number = '${req.query.roll_number}' order by id desc limit 1;`
               var query1 = `SELECT * FROM programming_language WHERE ${conditions1.join(' OR ')};`
               var query2 = `SELECT * FROM programming_language WHERE ${conditions.join(' OR ')};`;
               var query3 = `select * from project where id = '${result[0].projectid}';`
               var query4 = `SELECT * FROM screenshots WHERE source_code_id = (SELECT assign FROM project WHERE id = '${result[0].projectid}');`
               //For Testing
    
               pool.query(query+query1+query2+query3+query4,(err,result)=>{
                   if(err) throw err;
                //    else res.json(result)

                //    else 
                else{

                   // Define a mapping of report types to project types
const typeMapping = {
    'BCA': 'Bachelor of Computer Application',
    'MCA': 'Master of Computer Application',
    'M.Tech': 'Master of Technology',
    'B.Tech': 'Bachelor of Technology',
    'B.E.': 'Bachelor of Engineering',
    'M.E.': 'Master of Engineering',
    'BSc': 'Bachelor of Science',
    'MSc': 'Master of Science'
};

// Check if the report type exists in the mapping, otherwise use the original report type
const project_type = typeMapping[result[0][0].report_type] || result[0][0].report_type;

                    res.render('B.Tech/finalnew',{result:result,project_type})
                    // res.json(result)
                }
               })
    
            }
        })
    }    
           
    else {
        res.redirect('/');
    }
});




const axios = require('axios');
const { Template } = require('ejs');
const { verify1 } = require('crypto');
const ACCESS_TOKEN = 'EAAU06ZC3UpdABO4Y4qUJxUTMAbBeF6iHKl70DSJ9cmZBrJmkf7pXJaUUjlfNWPyrtwoSj3G7juPFXh8KCzlZA4eCw00Mfzjrm8UW32UxaTgujbzDoTY9sRCUSxMeYmTAVZAxBZCcOvvj5PalgnRvKLUxDzZAwbn6M22z8dj9Ta16zVcSNg31eZCt4kjDa58nkYlT81y2vkcaNUwC8mJhix7ulidZCXqBZCF2Su60ZD';
const PHONE_NUMBER_ID = '389545867577984';





// router.get('/send-message1', async (req, res) => {
//     // const { phoneNumber } = req.body;

//     const messageData = {
//         messaging_product: 'whatsapp',
//         to: '+91 8319339945',
//         type: 'template',
//         template: {
//             name: 'hello_world',
//             language: {
//                 code: 'en_US'
//             },
//         }
//     };

//     try {
//         const response = await axios.post(
//             'https://graph.facebook.com/v20.0/389545867577984/messages',
//             messageData,
//             {
//                 headers: {
//                     'Authorization': 'Bearer EAAU06ZC3UpdABO2wIGbJZARgXfWaq7bu3nXBpUjzpz0ItUDn9VJW7u4NZCKK3cULAAbLlvfQIkqUph1SFJRS2N0HkEnBBwwrZBahdbD2WubgZBCQzximXyD7Mz86i1jxB6A27FZAnPJGVseUGgOOZA2wHpKZCra2PpxETZBcyVAfKUqdBx4zHyeaqUwxNomjtCDd2ZA2ZBPKR1whuutJyfsigZDZD',
//                     'Content-Type': 'application/json'
//                 }
//             }
//         );
//         console.log('Message sent response:', response.data);
//         res.status(200).send('Message sent');
//     } catch (error) {
//         console.error('Error sending message:', error.response ? error.response.data : error.message);
//         res.status(500).send('Error sending message');
//     }
// });




router.get('/send-message1', async (req, res) => {
    // const { phoneNumber } = req.body;

    const messageData = {
        messaging_product: 'whatsapp',
        to: '+91 8319339945',
        type: 'template',
        template: {
            name: 'reviewtempelate',
            language: {
                code: 'en_US'
            },
            components: [
                {
                    type: 'body',
                    parameters: [
                        {
                            type: 'text',
                            text: 'Naman'  // Replace 'User' with the actual user's name or dynamic value
                        }
                    ]
                }
            ]
        }
    };

    try {
        const response = await axios.post(
            'https://graph.facebook.com/v20.0/389545867577984/messages',
            messageData,
            {
                headers: {
                    'Authorization': 'Bearer EAAU06ZC3UpdABO2wIGbJZARgXfWaq7bu3nXBpUjzpz0ItUDn9VJW7u4NZCKK3cULAAbLlvfQIkqUph1SFJRS2N0HkEnBBwwrZBahdbD2WubgZBCQzximXyD7Mz86i1jxB6A27FZAnPJGVseUGgOOZA2wHpKZCra2PpxETZBcyVAfKUqdBx4zHyeaqUwxNomjtCDd2ZA2ZBPKR1whuutJyfsigZDZD',
                    'Content-Type': 'application/json'
                }
            }
        );
        console.log('Message sent response:', response.data);
        res.status(200).send('Message sent');
    } catch (error) {
        console.error('Error sending message:', error.response ? error.response.data : error.message);
        res.status(500).send('Error sending message');
    }
});




// router.get('/send-message1', async (req, res) => {
//     const messageData = {
//         messaging_product: 'whatsapp',
//         to: '+91 8319339945',
//         type: 'template',
//         template: {
//             name: 'project_report_ready_new',
//             language: {
//                 code: 'en_US'
//             },
//             components: [
//                 {
//                     type: 'body',
//                     parameters: [
//                         {
//                             type: 'text',
//                             text: 'Naman Jain'  // Replace with the actual user's name or dynamic value
//                         },                       
//                     ]
//                 },
//                 {
//                     "type": "button",
//                     "sub_type": "url",
//                     "index": 0,
//                     "parameters": [
//                       {
//                         "type": "text",
//                         "text": "21BECE30336"
//                       }
//                     ]
//                   }
//             ]
//         }
//     };

//     try {
//         const response = await axios.post(
//             'https://graph.facebook.com/v20.0/389545867577984/messages',
//             messageData,
//             {
//                 headers: {
//                     'Authorization': 'Bearer EAAU06ZC3UpdABOyL9VTRBuDhegsy2yCLNyYVZBxykhfwZB5ZCRwKqgHwQkaiqtBmhAEg3IYcDCNbfTFFTT40EzacOhqzS0ZC3pJsao3dJVKY8EnWvVZBkZBzp6410rAKRVdMUiV7DJWsuJKAqGZCq3YG5u1mPACraEKiZBZAxTMiOJGZCK92mLiuTvlawyaFddRS3ZBOPreaF67sbafIXnBUt6UxqOCmcHEaaSGGooUZD',
//                     'Content-Type': 'application/json'
//                 }
//             }
//         );
//         console.log('Message sent response:', response.data);
//         res.status(200).send('Message sent');
//     } catch (error) {
//         console.error('Error sending message:', error.response ? error.response.data : error.message);
//         res.status(500).send('Error sending message');
//     }
// });



// router.get('/send-message1', async (req, res) => {
//     const messageData = {
//         messaging_product: 'whatsapp',
//         to: '+91 8319339945',
//         type: 'template',
//         template: {
//             name: 'thankyou_message',
//             language: {
//                 code: 'en_US'
//             },
//             components: [
//                 {
//                     type: 'body',
//                     parameters: [
//                         {
//                             type: 'text',
//                             text: 'Naman Jain'  // Replace with the actual user's name or dynamic value
//                         },                       
//                     ]
//                 }
//             ]
//         }
//     };

//     try {
//         const response = await axios.post(
//             'https://graph.facebook.com/v20.0/389545867577984/messages',
//             messageData,
//             {
//                 headers: {
//                     'Authorization': 'Bearer EAAU06ZC3UpdABOyL9VTRBuDhegsy2yCLNyYVZBxykhfwZB5ZCRwKqgHwQkaiqtBmhAEg3IYcDCNbfTFFTT40EzacOhqzS0ZC3pJsao3dJVKY8EnWvVZBkZBzp6410rAKRVdMUiV7DJWsuJKAqGZCq3YG5u1mPACraEKiZBZAxTMiOJGZCK92mLiuTvlawyaFddRS3ZBOPreaF67sbafIXnBUt6UxqOCmcHEaaSGGooUZD',
//                     'Content-Type': 'application/json'
//                 }
//             }
//         );
//         console.log('Message sent response:', response.data);
//         res.status(200).send('Message sent');
//     } catch (error) {
//         console.error('Error sending message:', error.response ? error.response.data : error.message);
//         res.status(500).send('Error sending message');
//     }
// });




// router.get('/send-message1', async (req, res) => {
//     const messageData = {
//         messaging_product: 'whatsapp',
//         to: '+91 8319339945',
//         type: 'template',
//         template: {
//             name: 'thankyou_message',
//             language: {
//                 code: 'en_US'
//             },
//             components: [
//                 {
//                     type: 'body',
//                     parameters: [
//                         {
//                             type: 'text',
//                             text: 'Naman Jain'  // Replace with the actual user's name or dynamic value
//                         },
                                           
//                     ]
//                 },
//                 {
//                     "type": "button",
//                     "sub_type": "flow",
//                     "index": 0,
//                     "parameters": [
//                       {
//                         "type": "text",
//                         "text": "Customer Support"
//                       }
//                     ]
//                   }  
//             ]
//         }
//     };

//     try {
//         const response = await axios.post(
//             'https://graph.facebook.com/v20.0/389545867577984/messages',
//             messageData,
//             {
//                 headers: {
//                     'Authorization': 'Bearer EAAU06ZC3UpdABOyL9VTRBuDhegsy2yCLNyYVZBxykhfwZB5ZCRwKqgHwQkaiqtBmhAEg3IYcDCNbfTFFTT40EzacOhqzS0ZC3pJsao3dJVKY8EnWvVZBkZBzp6410rAKRVdMUiV7DJWsuJKAqGZCq3YG5u1mPACraEKiZBZAxTMiOJGZCK92mLiuTvlawyaFddRS3ZBOPreaF67sbafIXnBUt6UxqOCmcHEaaSGGooUZD',
//                     'Content-Type': 'application/json'
//                 }
//             }
//         );
//         console.log('Message sent response:', response.data);
//         res.status(200).send('Message sent');
//     } catch (error) {
//         console.error('Error sending message:', error.response ? error.response.data : error.message);
//         res.status(500).send('Error sending message');
//     }
// });



const sendMessage = async (to, messageText) => {
    const messageData = {
        messaging_product: 'whatsapp',
        to: to,
        type: 'text',
        text: {
            body: messageText
        }
    };

    try {
        const response = await axios.post(
            'https://graph.facebook.com/v20.0/389545867577984/messages',
            messageData,
            {
                headers: {
                  'Authorization': 'Bearer EAAU06ZC3UpdABO2wIGbJZARgXfWaq7bu3nXBpUjzpz0ItUDn9VJW7u4NZCKK3cULAAbLlvfQIkqUph1SFJRS2N0HkEnBBwwrZBahdbD2WubgZBCQzximXyD7Mz86i1jxB6A27FZAnPJGVseUGgOOZA2wHpKZCra2PpxETZBcyVAfKUqdBx4zHyeaqUwxNomjtCDd2ZA2ZBPKR1whuutJyfsigZDZD',

                    'Content-Type': 'application/json'
                }
            }
        );
        console.log('Message sent response:', response.data);
    } catch (error) {
        console.error('Error sending message:', error.response ? error.response.data : error.message);
    }
};


// sendMessage('+91 8319339945', 'Testing Done')










router.get('/final/year/project/report/:roll_number',(req,res)=>{

    req.session.roll_number = req.params.roll_number

    console.log('yaha v correct h',req.session.roll_number)
    
        if(req.session.roll_number){
    
    
    if(req.session.deviceInfo == 'mobile'){
    
    
    
    
      pool.query(`select * from btech_project where roll_number = '${req.session.roll_number}' order by id desc limit 1`,(err,result)=>{
            if(err) throw err;
            else {
                console.log('this null',req.session.roll_number)
                console.log(result[0].php)
               var query = `select * from btech_project where roll_number = '${req.session.roll_number}' order by id desc limit 1;`
               var query3 = `select * from project where id = '${result[0].projectid}';`
               //For Testing
    
               pool.query(query+query3,(err,result)=>{
                   if(err) throw err;
                   //else res.json(result)
                   else res.render('B.Tech/final',{result:result})
               })
    
            }
        })
    
    
    
    }
    else{
    
    
      pool.query(`select * from btech_project where roll_number = '${req.session.roll_number}' order by id desc limit 1`,(err,result)=>{
            if(err) throw err;
            else {
                console.log('this null',req.session.roll_number)
               var query = `select * from btech_project where roll_number = '${req.session.roll_number}' order by id desc limit 1;`
               var query3 = `select * from project where id = '${result[0].projectid}';`
             //For Testing
    
               pool.query(query+query3,(err,result)=>{
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



    

    router.get('/youtube-partner-program',(req,res)=>{
        res.render('join_us')
    })




    router.get('/order/now',dataService.allCategory,async(req, res) => { 
        res.render('orderNow',{Metatags:onPageSeo.termsPage,CommonMetaTags:onPageSeo.commonMetaTags,msg:'',category:req.categories,fullUrl:req.fullUrl,unique_code:req.session.referralCode})
     })
        



     router.get('/getPerPageCharge', (req, res) => {
        const { unique_code, deliveryFormat, projectType } = req.query;
      
        // Query to check shopkeeper data
        pool.query(`SELECT * FROM shopkeeper WHERE unique_code = ?`, [unique_code], (err, shopkeeperResult) => {
          if (err) {
            console.error("Error fetching shopkeeper data:", err);
            return res.status(500).json({ error: "Internal Server Error" });
          }
      
          // Check if shopkeeper data exists
          const discount = shopkeeperResult.length > 0 ? shopkeeperResult[0].discount : 0;
      
          // Query to fetch masterCategory data
          pool.query(`SELECT * FROM masterCategory WHERE deliveryFormat = ? AND name = ?`, [deliveryFormat, projectType], (err, masterResult) => {
            if (err) {
              console.error("Error fetching masterCategory data:", err);
              return res.status(500).json({ error: "Internal Server Error" });
            }
      
            // Send the result along with the discount (commission)
            res.json({ result: masterResult, discount: discount });
          });
        });
      });
      



      router.get('/our-campus-brand-ambassador',dataService.allCategory,(req,res)=>{
        pool.query(`WITH performance_data AS (
    SELECT 
        s.id,
        s.name,
        s.address,
        s.image_url,
        s.instagram_id,
        s.linkedin_id,
        s.youtube_id,
        COUNT(pe.post_id) AS total_post,
        COALESCE(SUM(pe.liked), 0) AS total_like,
        COALESCE(SUM(pe.commented), 0) AS total_comment,
        CASE 
            WHEN COUNT(pe.post_id) = 0 THEN 0
            ELSE (COALESCE(SUM(pe.liked), 0) + COALESCE(SUM(pe.commented), 0)) / (COUNT(pe.post_id) * 2.0)
        END AS engagement_ratio
    FROM 
        shopkeeper s
    LEFT JOIN 
        post_engagement pe ON pe.ambassador_id = s.id
    GROUP BY 
        s.id, s.name, s.address
)

SELECT 
    pd.*,
    ROUND(pd.engagement_ratio * 100) AS performance_score,       -- Out of 100
    ROUND(pd.engagement_ratio * 5) AS rating_star                -- Out of 5
FROM 
    performance_data pd
ORDER BY 
    performance_score DESC;


`,(err,result)=>{
            if(err) throw err;
            else res.render('campus_ambassador',{result:result,Metatags: onPageSeo.AmbassadorPage,
    CommonMetaTags: onPageSeo.commonMetaTags,category:req.categories,msg:'',fullUrl:req.fullUrl,active:'',graduation_type_send:''})
//    else res.json(result)
        
})
      })









const nodemailer = require('nodemailer');


      


router.get('/add-ambassador',(req,res)=>{
    res.render('add_ambassador',{msg:req.query.msg})
})


function generatePassword(name, number, address) {
  const base = (name + number + address).replace(/\s+/g, '');
  const shuffled = base.split('').sort(() => 0.5 - Math.random()).join('');
  return shuffled.substring(0, 8);
}




const transporter = nodemailer.createTransport({
  pool: true,                 // <— pooled connections = better reliability
   host: 'smtpout.secureserver.net',
    port: 465,
    secure: true,
    auth: {
      user: 'info@filemakr.com',
      pass: 'Np2tr6G84',
    },
  // Optional hardening for some providers:
  // tls: { rejectUnauthorized: true, minVersion: 'TLSv1.2' },
  maxConnections: 5,
  maxMessages: 50,
  connectionTimeout: 20_000,
  socketTimeout: 30_000,
});



// small helper: retry with exponential backoff
async function sendWithRetry(mailOptions, { tries = 3, baseDelayMs = 800 } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      return await transporter.sendMail(mailOptions);
    } catch (err) {
      lastErr = err;
      // Retry only on transient errors
      const transient =
        err.code === 'EDNS' ||
        err.code === 'ETIMEDOUT' ||
        err.code === 'ECONNECTION' ||
        err.code === 'ESOCKET' ||
        /Rate|Throttl|Too\s+many/i.test(String(err.message));
      if (attempt === tries || !transient) break;
      const delay = baseDelayMs * Math.pow(2, attempt - 1);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

const moment = require("moment");



router.post('/add-ambassador', async (req, res) => {
  try {
    const { name, number, address, unique_code, email, instagram_id , referal_code } = req.body;
    const password = generatePassword(name, number, address);

    const start_date = moment().format('YYYY-MM-DD');
    const end_date = moment().add(3, 'months').format('YYYY-MM-DD');

    // Insert into DB and capture new ambassador id
    const insertQuery = `
      INSERT INTO shopkeeper 
        (name, number, address, password, unique_code, email, instagram_id,
         comission, discount, is_login_mail_send, is_password_mail_send, certificate_issued,referal_code)
      VALUES (?, ?, ?, ?, ?, ?, ?, 20, 5, 0, 0, 0,?)
    `;
    const insertResult = await queryAsync(insertQuery, [name, number, address, password, unique_code, email, instagram_id,referal_code]);
    const brandAmbassadorId = insertResult.insertId;

    // Verify SMTP before sending
    await transporter.verify().catch(() => { /* ignore; some servers don't implement VRFY */ });

    // --- Mails (subjects kept ASCII for reliability) ---
    const offerLetterMail = {
  from: `"FILEMAKR Team" <info@filemakr.com>`,
  to: email,
  subject: 'Welcome Letter – Campus Brand Ambassador at FileMakr',
  html: `
    <div style="font-family: Arial, Helvetica, sans-serif; line-height:1.6; color:#333;">
      <h2>Dear ${name},</h2>

      <p>Greetings from <strong>FileMakr</strong>!</p>
      <p>We are pleased to offer you the role of <strong>Campus Brand Ambassador</strong> for FileMakr at <strong>${address}</strong>.
         Your ambassadorship runs from <strong>${start_date}</strong> to <strong>${end_date}</strong>.</p>

      <h4>Roles &amp; Responsibility</h4>
      <ul>
        <li>Promote FileMakr on campus (clubs, peers, faculty).</li>
        <li>Complete daily micro-tasks on the dashboard.</li>
        <li>Maintain professional conduct and timely communication.</li>
      </ul>

      <h4>Complete Daily Task</h4>
      <ul>
        <li>Open your dashboard daily and finish the listed task(s).</li>
        <li>Mark completion; tasks are counted only after verification.</li>
        <li>Verified days unlock rewards at specific milestones.</li>
      </ul>

      <h4>Benefits</h4>
      <ul>
        <li>Official certificate(s) on completion of milestones.</li>
        <li>20% commission on every new sale you generate.</li>
        <li>Letter of recommendation (performance-based).</li>
        <li>Performance rewards, incentives, and LinkedIn endorsement.</li>
      </ul>

      <h4>Benefits Roadmap (Milestones)</h4>

      <p><strong>Phase 1</strong></p>
      <ul>
        <li>Day 0: 🎉 Welcome Letter</li>
        <li>Day 5: 🪪 ID Badge</li>
        <li>Day 10: 📄 Offer Letter</li>
        <li>Day 15: 🎓 Mini Skill Course</li>
        <li>Day 20: 🔓 Activation Badge</li>
        <li>Day 25: 🏅 Micro Achievement Badge</li>
        <li>Day 30: 📜 Level 1 Certificate</li>
      </ul>

      <p><strong>Phase 2</strong></p>
      <ul>
        <li>Day 35: 🌟 Featured on Website</li>
        <li>Day 40: 🎓 Skill Course #2</li>
        <li>Day 45: 📝 Resume Tips Session</li>
        <li>Day 50: ✅ Pre-Placement Tips</li>
        <li>Day 55: 📄 ATS Resume</li>
        <li>Day 60: 📜 Level 2 Certificate</li>
      </ul>

      <p><strong>Phase 3</strong></p>
      <ul>
        <li>Day 65: 📸 Social Media Spotlight</li>
        <li>Day 70: 🎓 Skill Course #3 + LinkedIn Endorsement</li>
        <li>Day 75: 📜 Leadership Certificate</li>
        <li>Day 80: 📄 Experience Letter</li>
        <li>Day 85: 🔖 Relieving Letter</li>
        <li>Day 90: 🚀 Job Recommendation</li>
      </ul>

      <p>Congratulations, and welcome to the FileMakr community!</p>

      <p>Warm regards,<br><strong>Team FileMakr</strong></p>
    </div>
  `,
};

    const credentialsMail = {
      from: `"FILEMAKR Team" <info@filemakr.com>`,
      to: email,
      subject: 'Your Brand Ambassador Login Credentials',
      html: `
        <div style="font-family: Arial, Helvetica, sans-serif; color: #333; line-height: 1.6;">
          <p>Dear Brand Ambassador,</p>
          <p>Welcome aboard! Below are your login credentials to access the Brand Ambassador dashboard.</p>
          <ul>
            <li><strong>Mobile Number:</strong> ${number}</li>
            <li><strong>Password:</strong> ${password}</li>
            <li><strong>Unique Code:</strong> ${unique_code}</li>
          </ul>
          <p style="text-align: center; margin: 20px 0;">
            <a href="https://www.filemakr.com/shopkeeper" target="_blank"
              style="background-color: #007bff; color: white; padding: 10px 20px; border-radius: 5px; text-decoration: none; display: inline-block;">
              Go to Dashboard
            </a>
          </p>
          <p>For support, write to <a href="mailto:info@filemakr.com">info@filemakr.com</a>.</p>
          <p>Warm regards,<br><strong>Team FileMakr</strong></p>
        </div>
      `,
    };

    // Send emails with retry, welcome first
    const welcomeResp = await sendWithRetry(offerLetterMail, { tries: 3 });
    console.log('welcome mail response', welcomeResp && welcomeResp.messageId);

    const credsResp = await sendWithRetry(credentialsMail, { tries: 3 });
    console.log('credentials mail response', credsResp && credsResp.messageId);

    // Mark flags after successful sends
    await queryAsync(
      `UPDATE shopkeeper SET is_login_mail_send = 1, is_password_mail_send = 1 WHERE id = ?`,
      [brandAmbassadorId]
    );

    // Insert benefit issuance record
    // Adjust table name/columns if different in your schema
    await queryAsync(
      `INSERT INTO benefit_claims (brand_ambassador_id, benefit_id, status, claimed_at)
       VALUES (?, 1, 'issued', ?)`,
      [brandAmbassadorId, moment().format('YYYY-MM-DD')]
    );

    return res.redirect('/add-ambassador?msg=Brand Ambassador added and emails sent!');
  } catch (err) {
    console.error('Error:', err);
    // Consider a fallback: if credentials mail succeeded but welcome failed,
    // you may still update is_password_mail_send = 1 accordingly.
    return res.status(500).send('Internal Server Error');
  }
});
      




// router.get('/blog',dataService.allCategory,(req,res)=>{
//     pool2.query(`select * from blogs where title like '%M.tech%' limit 40`,(err,result)=>{
//         if(err) throw err;
//          else  res.render('blog',{Metatags:onPageSeo.blogPage,CommonMetaTags:onPageSeo.commonMetaTags,msg:'',category:req.categories,fullUrl:req.fullUrl,result,active:'',graduation_type_send:''})
//     // else res.json(result)
//     })
   
// })


// routes/blog.js
router.get('/blog', dataService.allCategory, (req, res) => {
  // --- Inputs ---
  const pageSize = Math.min(Math.max(parseInt(req.query.pageSize || 12, 10), 6), 48); // clamp 6–48
  const page     = Math.max(parseInt(req.query.page || 1, 10), 1);
  const q        = (req.query.q || '').trim();
  const cat      = (req.query.category || '').trim(); // optional future filter
  const order    = (req.query.sort || 'new'); // 'new' | 'old' | 'alpha'

  // --- Build SQL safely ---
  const where = [];
  const params = [];

  if (q) {
    where.push(`(meta_title LIKE ? OR meta_description LIKE ? OR title LIKE ?)`);
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (cat) {
    where.push(`category_slug = ?`);
    params.push(cat);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  let orderSql = 'ORDER BY created_at DESC, id DESC';
  if (order === 'old')   orderSql = 'ORDER BY created_at ASC, id ASC';
  if (order === 'alpha') orderSql = 'ORDER BY meta_title ASC';

  const offset = (page - 1) * pageSize;

  // --- Queries ---
  const countSql = `SELECT COUNT(*) AS total FROM blogs ${whereSql}`;
  const listSql  = `
    SELECT id, slug, meta_title, meta_description, thumbnail_url, created_at
    FROM blogs
    ${whereSql}
    ${orderSql}
    LIMIT ? OFFSET ?
  `;

  // --- Run queries ---
  pool2.query(countSql, params, (err, countRows) => {
    if (err) throw err;
    const total = countRows[0]?.total || 0;
    const totalPages = Math.max(Math.ceil(total / pageSize), 1);

    pool2.query(listSql, [...params, pageSize, offset], (err2, result) => {
      if (err2) throw err2;

      // Build canonical & prev/next
      const baseUrl = req.fullUrl?.split('?')[0] || `${req.protocol}://${req.get('host')}${req.path}`;
      const queryNoPage = new URLSearchParams(req.query);
      queryNoPage.delete('page');
      const qStr = queryNoPage.toString();
      const canonical = qStr ? `${baseUrl}?${qStr}` : baseUrl;

      const mkUrl = (p) => {
        const sp = new URLSearchParams(req.query);
        sp.set('page', p);
        return `${baseUrl}?${sp.toString()}`;
      };

      res.render('blog', {
        Metatags: onPageSeo.blogPage,
        CommonMetaTags: onPageSeo.commonMetaTags,
        msg: '',
        category: req.categories,
        fullUrl: req.fullUrl,
        result,
        active: 'blog',
        graduation_type_send: '',
        pagination: {
          page,
          pageSize,
          total,
          totalPages,
          hasPrev: page > 1,
          hasNext: page < totalPages,
          prevUrl: page > 1 ? mkUrl(page - 1) : null,
          nextUrl: page < totalPages ? mkUrl(page + 1) : null,
          canonical,
          baseUrl
        },
        filters: { q, cat, order }
      });
    });
  });
});








router.get('/blog/:name', dataService.allCategory, (req, res) => {
    const blogSlug = req.params.name;

    // Query to fetch the requested blog
    const blogQuery = `
        SELECT * FROM blogs WHERE slug = ?;
    `;

    // Query to fetch the latest 10 blogs
    const recentBlogsQuery = `
        SELECT id, meta_title, slug, thumbnail_url, created_at 
        FROM blogs 
        ORDER BY created_at DESC 
        LIMIT 10;
    `;

    // Execute both queries
    pool2.query(blogQuery, [blogSlug], (err, blogResult) => {
        if (err) throw err;

        pool2.query(recentBlogsQuery, (err2, recentBlogs) => {
            if (err2) throw err2;

            res.render('blog_details', {
                result: blogResult,
                recentBlogs, // Pass recent blogs to the view
                Metatags: onPageSeo.contactPage,
                CommonMetaTags: onPageSeo.commonMetaTags,
                msg: '',
                category: req.categories,
                fullUrl: req.fullUrl,
                active:'',graduation_type_send:''
            });
            // res.json(recentBlogs)
        });
    });
});




const geoip = require('geoip-lite');
const cookieParser = require('cookie-parser');
const uuid = require('uuid');

router.use(cookieParser());

// router.get('/video/:shortCode', async (req, res) => {
//   const { shortCode } = req.params;
//   const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
//   const geo = geoip.lookup(ip) || {};
//   const userAgent = req.get('User-Agent');
//   const cookieId = req.cookies.visitor_id || uuid.v4();

//   // Check if shortCode exists
//   const link = await queryAsync('SELECT * FROM links WHERE short_code = ?', [shortCode]);
//   if (!link.length) return res.status(404).send('Link not found');

//   const linkId = link[0].id;



//   // Check uniqueness
//   const existing = await queryAsync('SELECT * FROM clicks WHERE link_id = ? AND cookie_id = ?', [linkId, cookieId]);
//   if (!existing.length) {
//     // Record unique click
//     await queryAsync(`INSERT INTO clicks (link_id, ip_address, city, country, user_agent, click_time, cookie_id)
//                     VALUES (?, ?, ?, ?, ?, NOW(), ?)`,
//       [linkId, ip, geo.city || 'Unknown', geo.country || 'Unknown', userAgent, cookieId]);
//   }

//   // Set cookie
//   res.cookie('visitor_id', cookieId, { maxAge: 1000 * 60 * 60 * 24 * 365 }); // 1 year

//   // Redirect to original URL
//   res.redirect(link[0].original_url);
// });


router.get('/video/:shortCode', dataService.allCategory, async (req, res) => {
  const { shortCode } = req.params;
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const geo = geoip.lookup(ip) || {};
  const userAgent = req.get('User-Agent');
  const cookieId = req.cookies.visitor_id || uuid.v4();

  // Check if shortCode exists
  const link = await queryAsync('SELECT * FROM links WHERE short_code = ?', [shortCode]);
  if (!link.length) return res.status(404).send('Link not found');

  const linkId = link[0].id;

  // Check uniqueness
  const existing = await queryAsync(
    'SELECT * FROM clicks WHERE link_id = ? AND cookie_id = ?',
    [linkId, cookieId]
  );

  if (!existing.length) {
    // Record unique click
    await queryAsync(
      `INSERT INTO clicks (link_id, ip_address, city, country, user_agent, click_time, cookie_id)
       VALUES (?, ?, ?, ?, ?, NOW(), ?)`,
      [
        linkId,
        ip,
        geo.city || 'Unknown',
        geo.country || 'Unknown',
        userAgent,
        cookieId,
      ]
    );
  }

  // Set cookie
  res.cookie('visitor_id', cookieId, { maxAge: 1000 * 60 * 60 * 24 * 365 }); // 1 year

  const country = geo.country || 'Unknown';
  console.log('country:', country);
  console.log('city:', geo.city || 'Unknown');

  // ✅ Redirect Indian users to original URL
  if (country === 'IN') {
    return res.redirect(link[0].original_url);
  }

  // 🌍 For all other countries, render the blog page
  const blogSlug = 'mern-stack-in-5-minutes-become-a-full-stack-developer';

  const blogQuery = `SELECT * FROM blogs WHERE slug = ?;`;
  const recentBlogsQuery = `
      SELECT id, meta_title, slug, thumbnail_url, created_at 
      FROM blogs 
      ORDER BY created_at DESC 
      LIMIT 10;
  `;

  pool2.query(blogQuery, [blogSlug], (err, blogResult) => {
    if (err) {
      console.error('Blog query error:', err);
      return res.status(500).send('Server error');
    }

    pool2.query(recentBlogsQuery, (err2, recentBlogs) => {
      if (err2) {
        console.error('Recent blogs query error:', err2);
        return res.status(500).send('Server error');
      }

      return res.render('blog_details', {
        result: blogResult,
        recentBlogs,
        Metatags: onPageSeo.contactPage,
        CommonMetaTags: onPageSeo.commonMetaTags,
        msg: '',
        category: req.categories,
        fullUrl: req.fullUrl,
      });
    });
  });
});




router.get('/blogvideo/:shortCode', dataService.allCategory, async (req, res) => {
  const { shortCode } = req.params;
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const geo = geoip.lookup(ip) || {};
  const userAgent = req.get('User-Agent');
  const cookieId = req.cookies.visitor_id || uuid.v4();

  // Check if shortCode exists
  const link = await queryAsync('SELECT * FROM links WHERE short_code = ?', [shortCode]);
  if (!link.length) return res.status(404).send('Link not found');

  const linkId = link[0].id;

  // Check uniqueness
  const existing = await queryAsync(
    'SELECT * FROM clicks WHERE link_id = ? AND cookie_id = ?',
    [linkId, cookieId]
  );

  if (!existing.length) {
    // Record unique click
    await queryAsync(
      `INSERT INTO clicks (link_id, ip_address, city, country, user_agent, click_time, cookie_id)
       VALUES (?, ?, ?, ?, ?, NOW(), ?)`,
      [
        linkId,
        ip,
        geo.city || 'Unknown',
        geo.country || 'Unknown',
        userAgent,
        cookieId,
      ]
    );
  }

  // Set cookie
  res.cookie('visitor_id', cookieId, { maxAge: 1000 * 60 * 60 * 24 * 365 }); // 1 year

  const country = geo.country || 'Unknown';
  console.log('country:', country);
  console.log('city:', geo.city || 'Unknown');

  // ✅ Redirect Indian users to original URL
  if (country === 'IN') {
    return res.redirect(link[0].original_url);
  }

  // 🌍 For all other countries, render the blog page
  const blogSlug = 'earn-50000-thousand-per-month-top-remote-internship';

  const blogQuery = `SELECT * FROM blogs WHERE slug = ?;`;
  const recentBlogsQuery = `
      SELECT id, meta_title, slug, thumbnail_url, created_at 
      FROM blogs 
      ORDER BY created_at DESC 
      LIMIT 10;
  `;

  pool2.query(blogQuery, [blogSlug], (err, blogResult) => {
    if (err) {
      console.error('Blog query error:', err);
      return res.status(500).send('Server error');
    }

    pool2.query(recentBlogsQuery, (err2, recentBlogs) => {
      if (err2) {
        console.error('Recent blogs query error:', err2);
        return res.status(500).send('Server error');
      }

      return res.render('blog_details', {
        result: blogResult,
        recentBlogs,
        Metatags: onPageSeo.contactPage,
        CommonMetaTags: onPageSeo.commonMetaTags,
        msg: '',
        category: req.categories,
        fullUrl: req.fullUrl,
      });
    });
  });
});



router.get('/blog/video/:shortCode', async (req, res) => {
  const { shortCode } = req.params;
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const geo = geoip.lookup(ip) || {};
  const userAgent = req.get('User-Agent');
  const cookieId = req.cookies.visitor_id || uuid.v4();

  const linkResults = await queryAsync('SELECT * FROM links WHERE short_code = ?', [shortCode]);
  if (!linkResults.length) return res.status(404).send('Link not found');

  const link = linkResults[0];
  const linkId = link.id;

  // Log the click if not already logged
  const existing = await queryAsync('SELECT * FROM clicks WHERE link_id = ? AND cookie_id = ?', [linkId, cookieId]);
  if (!existing.length) {
    await queryAsync(`
      INSERT INTO clicks (link_id, ip_address, city, country, user_agent, click_time, cookie_id)
      VALUES (?, ?, ?, ?, ?, NOW(), ?)`,
      [linkId, ip, geo.city || 'Unknown', geo.country || 'Unknown', userAgent, cookieId]
    );
  }

  // Fetch 5 other distinct recommended videos
  const recommendations = await queryAsync(`
    SELECT DISTINCT original_url 
    FROM links 
    WHERE short_code != ? 
    LIMIT 5
  `, [shortCode]);

  res.cookie('visitor_id', cookieId, { maxAge: 365 * 24 * 60 * 60 * 1000 }); // 1 year

  res.render('watchvideo', {
    originalUrl: link.original_url,
    shortCode,
    videoTitle: link.title || 'Your Video',
    videoSource: 'FileMakr',
    recommendations,
  });
});



router.post('/api/logWatchTimeRealtime', async (req, res) => {
  const { shortCode, seconds } = req.body;
  const cookieId = req.cookies.visitor_id || uuid.v4();

  try {
    const link = await queryAsync('SELECT id FROM links WHERE short_code = ?', [shortCode]);
    if (!link.length) return res.status(404).json({ error: 'Invalid link' });

    const linkId = link[0].id;

    // ✅ Check if this user already has a log
    const existing = await queryAsync(
      'SELECT * FROM video_watch_logs WHERE link_id = ? AND cookie_id = ?',
      [linkId, cookieId]
    );

    if (existing.length) {
      // ✅ Update existing watch time
      await queryAsync(
        'UPDATE video_watch_logs SET watched_seconds = watched_seconds + ?, timestamp = NOW() WHERE id = ?',
        [seconds, existing[0].id]
      );
    } else {
      // ✅ Insert new log
      await queryAsync(
        `INSERT INTO video_watch_logs (link_id, short_code, watched_seconds, timestamp, cookie_id)
         VALUES (?, ?, ?, NOW(), ?)`,
        [linkId, shortCode, seconds, cookieId]
      );
    }

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});



router.post('/api/verify/license', (req, res) => {
  const { key } = req.body;

  // Simulate logic (replace with actual logic or DB check)
  const validKeys = ['J9F2-KD83-ZXQ7-PLM2' , 'Chirag11072025'];

  if (key && validKeys.includes(key.trim())) {
    return res.json({ valid: true });
  } else {
    return res.json({ valid: false });
  }
});












router.get('/us/trends', dataService.allCategory, (req, res) => {
  // --- Inputs ---
  const pageSize = Math.min(Math.max(parseInt(req.query.pageSize || 12, 10), 6), 48); // clamp 6–48
  const page     = Math.max(parseInt(req.query.page || 1, 10), 1);
  const q        = (req.query.q || '').trim();
  const cat      = (req.query.category || '').trim(); // optional future filter
  const order    = (req.query.sort || 'new'); // 'new' | 'old' | 'alpha'

  // --- Build SQL safely ---
  const where = [];
  const params = [];

  if (q) {
    where.push(`(meta_title LIKE ? OR meta_description LIKE ? OR title LIKE ?)`);
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (cat) {
    where.push(`category_slug = ?`);
    params.push(cat);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  let orderSql = 'ORDER BY published_at DESC, id DESC';
  if (order === 'old')   orderSql = 'ORDER BY published_at ASC, id ASC';
  if (order === 'alpha') orderSql = 'ORDER BY meta_title ASC';

  const offset = (page - 1) * pageSize;

  // --- Queries ---
  const countSql = `SELECT COUNT(*) AS total FROM blogs ${whereSql}`;
  const listSql  = `
    SELECT id, slug, meta_title, meta_description, thumbnail_url, published_at
    FROM posts
    ${whereSql}
    ${orderSql}
    LIMIT ? OFFSET ?
  `;

  // --- Run queries ---
  pool.query(countSql, params, (err, countRows) => {
    if (err) throw err;
    const total = countRows[0]?.total || 0;
    const totalPages = Math.max(Math.ceil(total / pageSize), 1);

    pool.query(listSql, [...params, pageSize, offset], (err2, result) => {
      if (err2) throw err2;

      // Build canonical & prev/next
      const baseUrl = req.fullUrl?.split('?')[0] || `${req.protocol}://${req.get('host')}${req.path}`;
      const queryNoPage = new URLSearchParams(req.query);
      queryNoPage.delete('page');
      const qStr = queryNoPage.toString();
      const canonical = qStr ? `${baseUrl}?${qStr}` : baseUrl;

      const mkUrl = (p) => {
        const sp = new URLSearchParams(req.query);
        sp.set('page', p);
        return `${baseUrl}?${sp.toString()}`;
      };

      res.render('trend', {
        Metatags: onPageSeo.blogPage,
        CommonMetaTags: onPageSeo.commonMetaTags,
        msg: '',
        category: req.categories,
        fullUrl: req.fullUrl,
        result,
        active: 'blog',
        graduation_type_send: '',
        pagination: {
          page,
          pageSize,
          total,
          totalPages,
          hasPrev: page > 1,
          hasNext: page < totalPages,
          prevUrl: page > 1 ? mkUrl(page - 1) : null,
          nextUrl: page < totalPages ? mkUrl(page + 1) : null,
          canonical,
          baseUrl
        },
        filters: { q, cat, order }
      });
    });
  });
});





router.get('/us/trends/:name', dataService.allCategory, (req, res) => {
    const blogSlug = req.params.name;

    // Query to fetch the requested blog
    const blogQuery = `
        SELECT * FROM posts WHERE slug = ?;
    `;

    // Query to fetch the latest 10 blogs
    const recentBlogsQuery = `
        SELECT id, meta_title, slug, thumbnail_url, published_at 
        FROM posts 
        ORDER BY published_at DESC 
        LIMIT 10;
    `;

    // Execute both queries
    pool.query(blogQuery, [blogSlug], (err, blogResult) => {
        if (err) throw err;

        pool.query(recentBlogsQuery, (err2, recentBlogs) => {
            if (err2) throw err2;

            res.render('trend_details', {
                result: blogResult,
                recentBlogs, // Pass recent blogs to the view
                Metatags: onPageSeo.contactPage,
                CommonMetaTags: onPageSeo.commonMetaTags,
                msg: '',
                category: req.categories,
                fullUrl: req.fullUrl,
                active:'',graduation_type_send:''
            });
            // res.json(recentBlogs)
        });
    });
});

module.exports = router;
