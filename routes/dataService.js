var express = require('express');
var router = express.Router();
var pool = require('./pool')
const nodemailer = require('nodemailer');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const util = require('util');
const queryAsync = util.promisify(pool.query).bind(pool);











// check whatsapp end

// Create a transporter for sending emails
const transporter = nodemailer.createTransport({
  service: 'Gmail',
  auth: {
    user: 'filemakr@gmail.com',
    pass: 'mlgv tdpy tlnx sorq',
  },
});


// https://api.whatsapp.com/send/?phone=918877152035&text=Hello%2C+how+are+you%3F&type=phone_number&app_absent=0




async function sendBusinessEmails(date, time) {
  try {
    // Fetch recipients from an API (replace 'api_url' with your API endpoint)
    const apiResponse = await axios.get('http://localhost:3000/affiliate/sending_message');
    const recipients = apiResponse.data; // Assuming the API returns an array of recipients

    // Loop through recipients and send emails
    await Promise.all(
      recipients.map(async (recipient) => {
        try {
          const mailOptions = {
            from: 'tasktango.in@gmail.com',
            to: recipient.email,
            subject: `Reminder: Scheduled Demo Session for ${recipient.source_code_name}`,
            text: `Dear ${recipient.name},

I hope this email finds you well. We are writing to remind you about the scheduled demo session for the ${recipient.source_code_name}, which is set to take place on ${date} at ${time}.

This session will provide you with a comprehensive overview of the project, including its functionalities, features, and the underlying source code. It's an excellent opportunity for you to gain insights into how our solution can address your needs effectively.

As a quick reminder, our current offer allows you to access the full project and its source code for just ₹500/-, making it an incredibly valuable opportunity for you.

Please ensure that you are available at the designated time so that we can walk you through the project and address any questions or concerns you may have. If, for any reason, you need to reschedule or if you have any specific requirements regarding the demo session, please feel free to let us know, and we will do our best to accommodate your needs.

We look forward to showcasing the full potential of our project and discussing how it can benefit you and your organization. Thank you for your interest and participation.

Best regards,
FileMakr
`,
          };

          // Send the email
          const info = await transporter.sendMail(mailOptions);
          console.log(`Email sent to ${recipient.email}: ${info.response}`);
        } catch (emailError) {
          console.error(`Error sending email to ${recipient.email}:`, emailError);
        }
      })
    );
  } catch (fetchError) {
    console.error('Error fetching recipients or sending emails:', fetchError);
  }
}



async function sendInviduallyMail(result,Mydate, Mytime) {
  try {
    console.log('Data Recieve',result.Mydate); 
    // Fetch recipients from an API (replace 'api_url' with your API endpoint)
    const recipients = result.result; // Assuming the API returns an array of recipients

    // Loop through recipients and send emails
    await Promise.all(
      recipients.map(async (recipient) => {

        // console.log('recipients',recipients)
        try {
          const mailOptions = {
            from: 'filemakr@gmail.com',
            to: recipient.email,
            subject: `Reminder: Scheduled Demo Session for ${recipient.source_code_name}`,
            html: `
            <html>
              <head>
                <style>
                  body {
                    style="font-family: Georgia;
                    color: black;
                  }
                  strong {
                    font-weight: bold;
                  }
                </style>
              </head>
              <body style="font-family: Georgia;color:'black'">
                <p>Dear <strong>${recipient.name}</strong>,</p>
                <p>I hope this email finds you well. We are writing to remind you about the scheduled demo session for the <strong>${recipient.source_code_name}</strong>, which is set to take place on <strong>${result.Mydate}</strong> at <strong>${result.Mytime}</strong>.</p>
                <p>This session will provide you with a comprehensive overview of the project, including its functionalities, features, and the underlying source code. It's an excellent opportunity for you to gain insights into how our solution can address your needs effectively.</p>
                <p>As a quick reminder, our current offer allows you to access the full project and its source code for just ₹500/-, making it an incredibly valuable opportunity for you.</p>
                <p>Please ensure that you are available at the designated time so that we can walk you through the project and address any questions or concerns you may have. If, for any reason, you need to reschedule or if you have any specific requirements regarding the demo session, please feel free to let us know, and we will do our best to accommodate your needs.</p>
                <p>Thank you for your interest and participation.</p>
                <p>Best regards,<br>FileMakr</p>
              </body>
            </html>
          `,
        
          };

          // Send the email
          const info = await transporter.sendMail(mailOptions);
          console.log(`Email sent to ${recipient.email}: ${info.response}`);
        } catch (emailError) {
          console.error(`Error sending email to ${recipient.email}:`, emailError);
        }
      })
    );
  } catch (fetchError) {
    console.error('Error fetching recipients or sending emails:', fetchError);
  }
}




async function sendDemoMail(result) {

 console.log(result.result)
        // console.log('recipients',recipients)
        try {
          const mailOptions = {
              from: 'filemakr@gmail.com',
              to: result.result.email,
              subject: `Explore ${result.result.source_code_id.toUpperCase()} with Live Demo!`,
              html: `
                  <p style="font-family: Georgia;color:'black'">
                      <b>Dear ${result.result.name.toUpperCase()},</b>
                      <br><br>
                      Hope you're doing well! We noticed you checked out our <b>${result.result.source_code_id.toUpperCase()} </b> on <b> Filemakr </b>. At <b> Filemakr </b>, we offer a comprehensive range of project reports and source codes across multiple technologies.
                      <br><br>
                      We offer demos so you can see it in action before you commit. And the best part? You can pay after you've seen the demo! We believe in making sure you're happy with your choice.
                      <br><br>
                      Our team is here to assist you every step of the way and address any queries or concerns you may have.
                      <br><br>
                      Please feel free to reach out to us for further assistance or to schedule your live demo. We're committed to helping you succeed in your project endeavors.
                      <br><br>
                      Thanks for considering Filemakr for your project needs. Looking forward to hearing from you!
                      <br><br>
                      Warm Regards,
                      <br>
                      Filemakr
                  </p>
              `
          };
      
          // Send the email
          const info = await transporter.sendMail(mailOptions);
          console.log(`Email sent to ${result.result.email}: ${info.response}`);
      }
       catch (fetchError) {
    console.error('Error fetching recipients or sending emails:', fetchError);
  }
}


const date_and_time = (req, res, next) => {
    const today = new Date();
    const dd = String(today.getDate()).padStart(2, '0');
    const mm = String(today.getMonth() + 1).padStart(2, '0'); // January is 0!
    const yyyy = today.getFullYear();
    const currentDate = `${yyyy}-${mm}-${dd}`;

    req.currentDate = currentDate;
    next();
};



  function headerscall(){
    
    var query = `select name,seo_name,short_description from project;`
    var query1 = `select * from source_code;`
    var query2 = `select * from technology;`
   pool.query(query+query1+query2,(err,result)=>{
    if(err) throw err;
    else return result;
   })
  }
      

  const allCategory = async (req, res, next) => {
    try {
        const result = await queryAsync('SELECT * FROM category');
        req.categories = result;
        req.fullUrl = req.protocol + '://' + req.get('host') + req.originalUrl;
        next();
    } catch (err) {
        console.error('Error fetching categories:', err);
        res.status(500).send('Internal Server Error');
    }
};

function formatDate(date) {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0'); // January is 0!
  const yyyy = date.getFullYear();
  return yyyy + '-' + mm + '-' + dd ;
}


function getCurrentWeekDates() {
  const today = new Date();
  const startOfWeek = new Date(today.getFullYear(), today.getMonth(), today.getDate() - today.getDay() + (today.getDay() === 0 ? -6 : 1));
  const endOfWeek = new Date(today.getFullYear(), today.getMonth(), today.getDate() + (7 - today.getDay()));
  return { startDate: formatDate(startOfWeek), endDate: formatDate(endOfWeek) };
}

// sendBusinessEmails('15n','')

function adminAuthenticationToken(req,res,next){
 
  if (req.path === '/login' && req.method === 'POST') {
  let body = req.body;
  console.log("body",body)
 
pool.query(`select * from affiliate where email ='${body.email}' and password = '${body.password}'`,(err,result)=>{
  
   if(err) throw err;
   else if(result[0]) {
       req.session.affiliation = result[0].id
       res.redirect('/affiliate/dashboard')
      }
   else res.render(`Affiliation/login`,{msg : 'Enter Wrong Creaditionals'})
})
 }
  else if(req.session.affiliation) {
    req.categories = true;
     next();
  }
  else {
    res.render(`Affiliation/login`,{msg : 'Login First'})
    // next()
  }
}



function freelanceAuthenticationToken(req,res,next){
 
  if(req.body.email){
   let body = req.body;
   console.log("body",body)
  
 pool.query(`select * from freelancing where email ='${body.email}' and password = '${body.password}'`,(err,result)=>{
   
    if(err) throw err;
    else if(result[0]) {
        req.session.affiliation = result[0].id
        res.redirect('/freelancing/dashboard')
       }
    else res.render(`freelancing/login`,{msg : 'Enter Wrong Creaditionals'})
 })
  }
   else if(req.session.affiliation) {
     req.categories = true;
      next();
   }
   else {
     res.render(`freelancing/login`,{msg : 'Login First'})
     // next()
   }
 }


  module.exports = {
    date_and_time,
    headerscall,
    allCategory,
    getCurrentWeekDates,
    sendBusinessEmails,
    adminAuthenticationToken,
    sendInviduallyMail,
    sendDemoMail,
    freelanceAuthenticationToken
  }