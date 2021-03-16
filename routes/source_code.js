var express = require('express');
var router = express.Router();
var pool = require('./pool')
var table = 'add_project'

const fetch = require('node-fetch');

const Razorpay = require("razorpay");
var instance = new Razorpay({
    key_id: 'rzp_live_2AYlv8GRAaT63p',
    key_secret: 'iIzpixX7YsDSUVPtAtbO5SMn',
  });



var hash = require('sha256')


var today = new Date();
var dd = String(today.getDate()).padStart(2, '0');
var mm = String(today.getMonth() + 1).padStart(2, '0'); //January is 0!
var yyyy = today.getFullYear();

today = yyyy + '-' + mm + '-' + dd;


router.get('/', (req, res) => { pool.query(`select * from ${table}`,
(err,result)=>err ? console.log(err) : res.render('source_code',{result:result}))
})




router.post('/checkout-data',(req,res)=>{
    let body = req.body;
    req.session.username = req.body.name
    req.session.usernumber = req.body.number
    req.session.usercollegename = req.body.college_name
    req.session.userprojectid = req.body.id 
    req.session.useremail = req.body.email
    res.send('done')
})




router.get('/success_razorpay',(req,res)=>{
  res.json({
    msg : 'success'
  })
})

router.post('/razorpay-response',(req,res)=>{
 let body = req.body;
 console.log('response recieve',body);



if(body.razorpay_signature){
   res.send('success')
}
  else{
    res.send('failed')
  }

})

    

router.get('/failed_payment',(req,res)=>{
  res.json({
    msg : 'failed'
  })
})



router.post('/failed_payment',(req,res)=>{
  res.json({
    msg : 'failed'
  })
})


router.get('/demo',(req,res)=>{
    res.render('sportzkeeda')
})

// router.get('/demo1',(req,res)=>{
//     console.log(req.query)
//     res.send(req.query)
// })


    




router.post('/sportzkeeda-create',(req,res)=>{
  const url = `https://rzp_live_2AYlv8GRAaT63p:iIzpixX7YsDSUVPtAtbO5SMn@api.razorpay.com/v1/orders/`;
    const data = {
        amount:req.body.amount,  // amount in the smallest currency unit
      //amount:100,
      currency: 'INR',
        payment_capture: true
    }
    console.log('data',data)
    const options = {
        method: 'POST',
        body: JSON.stringify(data),
        headers: {
            'Content-Type': 'application/json'
        }
    }
    fetch(url, options)
        .then(res => res.json())
        .then(
            resu => res.send(resu)
        );
 })





// router.get('/sportzkeeda-create',(req,res)=>{
//   const url = `https://rzp_live_2AYlv8GRAaT63p:iIzpixX7YsDSUVPtAtbO5SMn@api.razorpay.com/v1/orders/`;
//     const data = {
//     //    amount:req.body.amount,  // amount in the smallest currency unit
//       amount:100,
//       currency: 'INR',
//         payment_capture: true
//     }
//     console.log('data',data)
//     const options = {
//         method: 'POST',
//         body: JSON.stringify(data),
//         headers: {
//             'Content-Type': 'application/json'
//         }
//     }
//     fetch(url, options)
//         .then(res => res.json())
//         .then(
//             resu => res.send(resu)
//         );
//  })





router.post('/razorpay',(req,res)=>{
  const url = `https://rzp_live_2AYlv8GRAaT63p:iIzpixX7YsDSUVPtAtbO5SMn@api.razorpay.com/v1/orders/`;
    const data = {
        amount:200*100,  // amount in the smallest currency unit
      //amount:100,
      currency: 'INR',
        payment_capture: true
    }
    console.log('data',data)
    const options = {
        method: 'POST',
        body: JSON.stringify(data),
        headers: {
            'Content-Type': 'application/json'
        }
    }
    fetch(url, options)
        .then(res => res.json())
        .then(
            resu => res.send(resu)
        );
 })








 router.post('/razorpay_response',(req,res)=>{
let body = req.body
console.log('response',req.body)
req.session.payment_id = req.body.razorpay_payment_id
body['name'] = req.session.username
body['number'] = req.session.usernumber
body['college_name'] = req.session.usercollegename
body['projectid'] = req.session.userprojectid
body['email'] = req.session.useremail
body['date'] = today
console.log('data insert',req.body)
pool.query(`insert into book set ?`,req.body , (err,result)=>{
    if(err) throw err;
    else res.send('success')
})




    })



 router.get('/download-successfull',(req,res)=>{
    console.log('')
  if(req.session.usernumber){
   pool.query(`select * from book where number = '${req.session.usernumber}' and projectid = '${req.session.userprojectid}' and razorpay_payment_id = '${req.session.payment_id}'`,(err,result)=>{
    if(err) throw err;
    else if(result[0]){
    pool.query(`select source_code from add_project where id = '${req.session.userprojectid}'`,(err,result)=>{
        if(err) throw err;
        //else res.json(result)
        else res.render('download-successfull',{result:result})
    })
    }
    else{
        res.send('/')
    }
   })
  }
  else{
    res.redirect('/')
  }
 })




module.exports = router;
