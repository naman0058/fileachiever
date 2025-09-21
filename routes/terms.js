var express = require('express');
var router = express.Router();
var pool = require('./pool')
var table = 'programming_language'
const fetch = require('node-fetch')
const crypto = require('crypto')


router.get('/', (req, res) =>  res.render(`terms`));

router.get('/all',(req,res)=>pool.query(`select * from ${table}`,(err,result)=> err ? console.log(err) : res.json(result)))



router.post('/request',function(req, res, next){

	var postData = {
        "appId" : '10462273d657d4cbc1431d9107226401',
		"orderId" : req.body.orderId,
		"orderAmount" : req.body.orderAmount,
		"orderCurrency" : 'INR',
		"orderNote" : 'Deposit Amount',
		'customerName' : 'Sportzkeeda User',
		"customerEmail" : 'info.sportzkeeda@gmail.com',
		"customerPhone" : req.body.customerPhone,
		"returnUrl" : 'https://filemakr.com/terms-and-conditions/checking',
		"notifyUrl" :'https://filemakr.com/terms-and-conditions/checking'
	},
	mode = "PROD",
	secretKey = "3a57fd9f569d19ebfad2154e551d2617181453bf",
	sortedkeys = Object.keys(postData),
	url="",
	signatureData = "";
	sortedkeys.sort();
	for (var i = 0; i < sortedkeys.length; i++) {
		k = sortedkeys[i];
		signatureData += k + postData[k];
	}
	var signature = crypto.createHmac('sha256',secretKey).update(signatureData).digest('base64');
	postData['signature'] = signature;
	if (mode == "PROD") {
	  url = "https://www.cashfree.com/checkout/post/submit";
	} else {
	  url = "https://test.cashfree.com/billpay/checkout/post/submit";
	}


    res.json(postData)

	//res.render('request',{postData : JSON.stringify(postData),url : url});
});


router.get('/request',(req,res)=>{
   // res.json(req.query.postData)
   let query = JSON.parse(req.query.postData)
    res.render('request',{postData:query})
})

router.post('/response',function(req, res, next){

	var postData = {
	  "orderId" : req.body.orderId,
	  "orderAmount" : req.body.orderAmount,
	  "referenceId" : req.body.referenceId,
	  "txStatus" : req.body.txStatus,
	  "paymentMode" : req.body.paymentMode,
	  "txMsg" : req.body.txMsg,
	  "txTime" : req.body.txTime
	 },
	secretKey = "3a57fd9f569d19ebfad2154e551d2617181453bf",

	signatureData = "";
	for (var key in postData) {
		signatureData +=  postData[key];
	}
	var computedsignature = crypto.createHmac('sha256',secretKey).update(signatureData).digest('base64');
	postData['signature'] = req.body.signature;
	postData['computedsignature'] = computedsignature;
	res.render('response',{postData : JSON.stringify(postData)});
});




router.post('/checking',(req,res)=>{
    let body = req.body;
    if(req.body.txStatus == 'SUCCESS' && req.body.txMsg == 'Transaction Successful'){
      res.json({
        msg : 'success'
      })
    }
    else {
      res.json({
        msg :'fail'
      })
    }
    
  })









module.exports = router;