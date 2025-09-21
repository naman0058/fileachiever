var express = require('express');
var router = express.Router();
var jwt = require('jsonwebtoken');
const secretkey = 'EAAU06ZC3UpdABO2wIGbJZARgXfWaq7bu3nXBpUjzpz0ItUDn9VJW7u4NZCKK3cULAAbLlvfQIkqUph1SFJRS2N0HkEnBBwwrZBahdbD2WubgZBCQzximXyD7Mz86i1jxB6A27FZAnPJGVseUGgOOZA2wHpKZCra2PpxETZBcyVAfKUqdBx4zHyeaqUwxNomjtCDd2ZA2ZBPKR1whuutJyfsigZDZD'

const fs = require('fs');

var pool = require('./pool');

const util = require('util');
const queryAsync = util.promisify(pool.query).bind(pool);


const nodeCCAvenue = require('node-ccavenue');
const ccave = new nodeCCAvenue.Configure({
  merchant_id: '1760015',
  working_key: '3F831E8FD26B47BBFDBCDB8E021635F2'
});



function generateSignedUrl(baseUrl, resourceId) {
    const payload = {
        resource: resourceId,
        exp: Math.floor(Date.now() / 1000) + (30 * 60) // 30 minutes expiration
    };

    // Generate a token with the payload and secret key
    const token = jwt.sign(payload, secretkey);

    // Construct the full URL with the token as a query parameter
    const signedUrl = `${baseUrl}?token=${token}`;
    
    return signedUrl;
}




function verifyToken(req, res, next) {
    const token = req.query.token;
    
    if (!token) {
        return res.status(403).send('Access Denied: No token provided.');
    }

    try {
        const decoded = jwt.verify(token, function verifyToken(req, res, next) {
    const token = req.query.token;
    
    if (!token) {
        return res.status(403).send('Access Denied: No token provided.');
    }

    try {
        const decoded = jwt.verify(token, secretkey);
        req.resource = decoded.resource;
        next();
    } catch (err) {
        return res.status(401).send('Access Denied: Invalid or expired token.');
    }
}
);
        req.resource = decoded.resource;
        next();
    } catch (err) {
        return res.status(401).send('Access Denied: Invalid or expired token.');
    }
}



// function userAuthenticationToken(req,res,next){
//     // const token = req.headers['authrorization'];
//     const token = undefined
//     if(!token) return res.status(401).json({message : 'Token not provided'})
//     jwt.verify(token,secretkey,(err,data)=>{
//       if(err) res.status(401).json({message:'Invalid Token Recieved'})
//       req.user = data
//       next();
//     })
//   }


// function userAuthenticationToken(req, res, next) {
//   const token = req.headers['authorization'];
//   if (!token) {
//       return res.status(401).json({ message: 'Token not provided' });
//   }
//   jwt.verify(token, secretkey, (err, data) => {
//       if (err) {
//           return res.status(401).json({ message: 'Invalid Token Received' });
//       }
//       req.user = data;
//       next();
//   });
// }



function adminAuthenticationToken(req,res,next){
  if(req.session.adminid) {
    req.categories = true;
     next();
  }
  else {
    res.render('login',{msg:'Wrong Credentials'})
    next()
  }
}



function shopAuthenticationToken(req,res,next){
  if(req.session.shopkeeper) {
    req.categories = true;
     next();
  }
  else {
    res.render('login',{msg:'Wrong Credentials'})
    next()
  }
}


async function userAuthenticationToken(req, res, next) {
    try {
        const result = await queryAsync('SELECT * FROM users WHERE id = ?', [req.query.id]);

        if (result.length > 0) {
            req.data = req.query.id;
            next();
        } else {
            res.status(401).json({ msg: 'Invalid User ID' });
            // If you're continuing the middleware chain after sending a response,
            // you shouldn't call next() after sending the response.
        }
    } catch (error) {
        console.error('Error while verifying user authentication token:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}







function formatDate(date) {
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0'); // January is 0!
    const yyyy = date.getFullYear();
    return yyyy + '-' + mm + '-' + dd ;
  }


  function getCurrentDate() {
    const today = new Date();
    return formatDate(today);
  }
  
  
  function getCurrentWeekDates() {
    const today = new Date();
    const startOfWeek = new Date(today.getFullYear(), today.getMonth(), today.getDate() - today.getDay() + (today.getDay() === 0 ? -6 : 1));
    const endOfWeek = new Date(today.getFullYear(), today.getMonth(), today.getDate() + (7 - today.getDay()));
    return { startDate: formatDate(startOfWeek), endDate: formatDate(endOfWeek) };
  }
  // Function to get the start and end dates of the current month
  
  function getCurrentMonthDates() {
    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    return { startDate: formatDate(startOfMonth), endDate: formatDate(endOfMonth) };
  }
  
  function getLastMonthDates() {
    const today = new Date();
    const firstDayOfLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const lastDayOfLastMonth = new Date(today.getFullYear(), today.getMonth(), 0);
    return { startDate: formatDate(firstDayOfLastMonth), endDate: formatDate(lastDayOfLastMonth) };
  }

  
  // Function to get the start and end dates of the current year
  
  function getCurrentYearDates() {
  
    //   const today = new Date();
  
    //   const startOfYear = new Date(today.getFullYear(), 3, 1);

    //   const endOfYear = new Date(today.getFullYear(), 2, 31);
  
    //   return { startDate: formatDate(startOfYear), endDate: formatDate(endOfYear) };

    const today = new Date();
   // Check if the current month is April or later
   // If so, the financial year starts from April of the current year
   // Otherwise, it starts from April of the previous year
   const startYear = today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1;
   // The financial year ends on March 31st of the following year
   const endYear = today.getMonth() >= 3 ? today.getFullYear() + 1 : today.getFullYear();
   // Set the start date to April 1st of the start year
   const startDate = new Date(startYear, 3, 1);
   // Set the end date to March 31st of the end year
   const endDate = new Date(endYear, 2, 31);
   return { startDate: formatDate(startDate), endDate: formatDate(endDate) };
  
  }


  function getLastFinancialYearDates() {
    const today = new Date();

    // Check if the current month is April or later
    // If so, the financial year started from April of the current year
    // Otherwise, it started from April of the previous year
    const startYear = today.getMonth() >= 3 ? today.getFullYear() - 1 : today.getFullYear() - 2;

    // The financial year ended on March 31st of the current year
    const endYear = today.getMonth() >= 3 ? today.getFullYear() - 1 : today.getFullYear() - 1;

    // Set the start date to April 1st of the start year
    const startDate = new Date(startYear, 3, 1);

    // Set the end date to March 31st of the end year
    const endDate = new Date(endYear, 2, 31);

    return { startDate: formatDate(startDate), endDate: formatDate(endDate) };
}



function generateOrderNumber(prefix = 'ORD') {
    // Get the current timestamp
    const timestamp = Date.now().toString(); // Convert to string

    // Generate a random number
    const randomNumber = Math.floor(Math.random() * 1000000).toString(); // Convert to string

    // Combine the prefix, timestamp, and random number
    const orderNumber = `${prefix}-${timestamp}-${randomNumber}`;

    return orderNumber;
}


function generateUniqueId(prefix = 'LPY') {
    // Get the current timestamp
    const timestamp = Date.now().toString(); // Convert to string

    // Generate a random number
    const randomNumber = Math.floor(Math.random() * 10000).toString(); // Convert to string

    // Combine the prefix, timestamp, and random number
    const orderNumber = `${prefix}-${timestamp}-${randomNumber}`;

    return orderNumber;
}



async function getDatas(tableName, columnName) {
    return new Promise((resolve, reject) => {
        pool.query(`SELECT name FROM ${tableName} WHERE id = ${columnName}`, (err, result) => {
            if (err) {
                return reject(err);
            }
            if (result.length > 0) {
                resolve(result[0].name);
            } else {
                resolve(null);
            }
        });
    });
}


// console.log('Last Financial Year',getCurrentYearDates())



const nodemailer = require('nodemailer');




// Create a transporter for sending emails
const transporter = nodemailer.createTransport({
    host: 'smtpout.secureserver.net', // GoDaddy's SMTP server
    port: 465, // Secure port for SSL
    secure: true, // Use SSL
    auth: {
      user: 'info@filemakr.com', // Your GoDaddy email address
      pass: 'Np2tr6G84', // Your GoDaddy email password
    },
  });
  




  
  
    async function sendInviduallyMail(result,subject,message) {
      try {
        console.log('Data Recieve',result); 
        // Fetch recipients from an API (replace 'api_url' with your API endpoint)
        const recipients = result; // Assuming the API returns an array of recipients
    
        // Loop through recipients and send emails
     
    
            // console.log('recipients',recipients)
            try {
              const mailOptions = {
                from: 'info@filemakr.com',
                to: result.email,
                subject: subject,
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
                    ${message}
                  </body>
                </html>
              `,
            
              };
    
              // Send the email
              const info = await transporter.sendMail(mailOptions);
              console.log('information',info)
              console.log(`Email sent to ${result.email}: ${info.response}`);
            } catch (emailError) {
              console.error(`Error sending email to ${result.email}:`, emailError);
            }
          
        
      } catch (fetchError) {
        console.error('Error fetching recipients or sending emails:', fetchError);
      }
    }
  
  
  
  
    async function sendPromotionalMail(result, subject, message) {
      try {
        console.log('Data Received', result);
        
        const mailOptions = {
          from: 'info@filemakr.com',
          to: result.email,
          subject: subject,
          html: `
            <html>
              <head>
                <style>
                  body {
                    font-family: Georgia;
                    color: black;
                  }
                  strong {
                    font-weight: bold;
                  }
                </style>
              </head>
              <body style="font-family: Georgia; color: black;">
                ${message}
              </body>
            </html>
          `,
        };
    
        const info = await transporter.sendMail(mailOptions);
        console.log('Information', info);
        console.log(`Email sent to ${result.email}: ${info.response}`);
      } catch (emailError) {
        console.error(`Error sending email to ${result.email}:`, emailError);
      }
    }
  
  
  
    async function sendUserMail(result,subject,message) {
      try {
        console.log('Data Recieve',result); 
        console.log('Data Recieve',subject); 
        console.log('Data Recieve',message); 
  
        // Fetch recipients from an API (replace 'api_url' with your API endpoint)
        const recipients = result; // Assuming the API returns an array of recipients
    
        // Loop through recipients and send emails
     
    
            // console.log('recipients',recipients)
            try {
              const mailOptions = {
                from: 'info@filemakr.com',
                to: result,
                subject: subject,
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
                    ${message}
                  </body>
                </html>
              `,
            
              };
    
              // Send the email
              const info = await transporter.sendMail(mailOptions);
              console.log('information',info)
              console.log(`Email sent to ${result}: ${info.response}`);
            } catch (emailError) {
              console.error(`Error sending email to ${result}:`, emailError);
            }
          
        
      } catch (fetchError) {
        console.error('Error fetching recipients or sending emails:', fetchError);
      }
    }
  

    async function profile(id) {
        try {
             let result = await queryAsync(`SELECT * FROM users WHERE id = '${id}'`);
            return result;
        } catch (error) {
            console.error('Error while fetching user:', error);
            throw new Error('Internal server error');
        }
      }


      async function getOrderDetails(value) {
        try {
            let result = await queryAsync(`SELECT o.*, u.name as username, u.number as usernumber, u.unique_id as uniqueid 
                                           FROM orders o 
                                           JOIN users u ON u.id = o.userid 
                                           WHERE o.orderid = ? 
                                           ORDER BY o.id DESC 
                                           LIMIT 1000`, [value]);
            
            return result;
        } catch (error) {
            console.error('Error while fetching user:', error);
            throw new Error('Internal server error');
        }
      }
      



      const axios = require('axios');

const sendWhatsAppMessage = async (phoneNumber, templateName, languageCode, bodyParameters = [], buttonParameters = []) => {
    const messageData = {
        messaging_product: 'whatsapp',
        to: phoneNumber,
        type: 'template',
        template: {
            name: templateName,
            language: {
                code: languageCode
            },
            components: []
        }
    };

    if (bodyParameters.length > 0) {
        messageData.template.components.push({
            type: 'body',
            parameters: bodyParameters.map(param => ({
                type: 'text',
                text: param
            }))
        });
    }

    if (buttonParameters.length > 0) {
        messageData.template.components.push({
            type: 'button',
            sub_type: 'url', // or 'flow' depending on your need
            index: 0,
            parameters: buttonParameters.map(param => ({
                type: 'text',
                text: param
            }))
        });
    }

    try {
        const response = await axios.post(
            'https://graph.facebook.com/v20.0/389545867577984/messages',
            messageData,
            {
                headers: {
                    'Authorization': 'Bearer EAAU06ZC3UpdABOwOq59DsyZCzsZB25lp0ui7J3M9lXdVzfhKnviX0TH7yFM4K3ZCHTmhA9qkxVCPPaFD2MZC3OjDvmjCgX24274CSfs6pMpm0JVtjSoDsz3m7fG7VyD5nF6PnZCZCjgvLE7fgLanzuQk9x04BZA3T0iRwC46bPvYCTU8jM5oRKm7GuIZC',
                    'Content-Type': 'application/json'
                }
            }
        );
        console.log('Message sent response:', response.data);
        return response.data;
    } catch (error) {
        console.error('Error sending message:', error.response ? error.response.data : error.message);
        throw new Error('Error sending message');
    }
};


const generateRandomOrderNo = () => {
    return `FILE${Math.floor(Math.random() * 1000000000)}`;
};
  

const createPaymentRequest = (req, res, data, ccave) => {
  console.log('data',data)
  const generateGUID = () => {
      const s4 = () => Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);
      return `${s4()}${s4()}-${s4()}-${s4()}-${s4()}-${s4()}${s4()}${s4()}`;
  };

  const body = {
      billing_name:data.name,
      billing_email:data.email,
      billing_tel:data.number,
      merchant_id: '1760015',
      order_id: generateGUID(),
      currency: 'INR',
      amount: data.amount, // Ensure the amount is passed in req.body
      redirect_url: 'https://www.filemakr.com/shopkeeper/successful/payment',
      cancel_url: 'https://www.filemakr.com/shopkeeper/successful/payment',
  };

          try {
              const encryptedOrderData = ccave.getEncryptedOrder(body);
              res.render('send1', {
                  enccode: encryptedOrderData,
                  accesscode: 'AVZN72JL86AQ28NZQA'
              });
          } catch (encryptionError) {
              console.error('Error encrypting order data:', encryptionError);
              res.status(500).send('Encryption error');
          }
};





const fetchOrderDetails = async (uniqueOrderNo,tablename) => {
  try {
    // Use a parameterized query to prevent SQL injection
    const query = `SELECT name, email, number,amount FROM ${tablename} WHERE unique_order_no = ?`;

    // Promisify the pool.query to work seamlessly with async/await
    const result = await new Promise((resolve, reject) => {
      pool.query(query, [uniqueOrderNo], (err, results) => {
        if (err) {
          reject(err); // Pass the error to the caller
        } else {
          resolve(results);
        }
      });
    });

    // If no results found, return null or handle accordingly
    if (result.length === 0) {
      return null;
    }

    // Format the data as needed
    const data = {
      name: result[0].name,
      email: result[0].email,
      number: result[0].number,
      amount: result[0].amount
    };

    return data;
  } catch (error) {
    console.error('Error fetching order details:', error);
    throw error; // Re-throw the error for the caller to handle
  }
};



// Utility function to handle payment response
const handlePaymentResponse = async (encResp, session) => {
  try {
      // Decrypt the response
      const decryptedJsonResponse = ccave.redirectResponseToJson(encResp);
      decryptedJsonResponse.type = 'customizeOrder';
      decryptedJsonResponse.typeid = session.source_code_id;


      // Insert payment response into the database
      const insertQuery = `
          INSERT INTO payment_response(
              order_id, tracking_id, bank_ref_no, order_status, failure_message, 
              payment_mode, card_name, status_code, status_message, currency, 
              amount, billing_name, billing_address, billing_city, billing_state, 
              billing_zip, billing_tel, billing_email, trans_date, type
          ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,?)`;

      // Insert into the database
      await new Promise((resolve, reject) => {
          pool.query(insertQuery, [
              decryptedJsonResponse.order_id,
              decryptedJsonResponse.tracking_id,
              decryptedJsonResponse.bank_ref_no,
              decryptedJsonResponse.order_status,
              decryptedJsonResponse.failure_message,
              decryptedJsonResponse.payment_mode,
              decryptedJsonResponse.card_name,
              decryptedJsonResponse.status_code,
              decryptedJsonResponse.status_message,
              decryptedJsonResponse.currency,
              decryptedJsonResponse.amount,
              decryptedJsonResponse.billing_name,
              decryptedJsonResponse.billing_address,
              decryptedJsonResponse.billing_city,
              decryptedJsonResponse.billing_state,
              decryptedJsonResponse.billing_zip,
              decryptedJsonResponse.billing_tel,
              decryptedJsonResponse.billing_email,
              decryptedJsonResponse.trans_date,
              decryptedJsonResponse.type = 'customizeOrder'
              
              
          ], (err, result) => {
              if (err) {
                  console.error('Database Insert Error:', err);
                  return reject(err);
              }
              resolve(result);
          });
      });

      // Return the order status
      return {
          success: true,
          orderStatus: decryptedJsonResponse.order_status,
          decryptedResponse: decryptedJsonResponse
      };
  } catch (error) {
      console.error('Error handling payment response:', error);
      return {
          success: false,
          message: 'Failed to handle payment response',
          error: error.message || error
      };
  }
};






async function sendEmails() {
  try {
    // Create a database connection

    // Fetch shopkeepers who haven't received a login email
    const rows = await queryAsync(
      "SELECT id, email, name, number, unique_code, password FROM shopkeeper WHERE is_password_mail_send IS NULL OR is_password_mail_send = 0"
    );

    console.log(rows)

    if (rows.length === 0) {
      console.log("No pending emails to send.");
      return;
    }

    // Loop through each shopkeeper and send an email
    for (const shopkeeper of rows) {
      const mailOptions = {
        from: `info@filemakr.com`,
        to: shopkeeper.email,
        subject: "Your Brand Ambassador Login Details & Referral Code",
        html: `
          <p>Dear ${shopkeeper.name},</p>
          <p>Welcome to the FileMakr Brand Ambassador Program! We’re excited to have you on board. Below are your login details to access your ambassador dashboard, where you can track your progress and referrals.</p>
          <p><strong>Login Details:</strong></p>
          <ul>
            <li>Website: <a href="https://filemakr.com/shopkeeper/">https://filemakr.com/shopkeeper/</a></li>
            <li>Login Number: ${shopkeeper.number}</li>
            <li>Password: ${shopkeeper.password}</li>
            <li>Your Unique Referral Code: ${shopkeeper.unique_code}</li>
          </ul>
          <p>Please use this referral code to share with your network. Every successful referral will be tracked through your dashboard.</p>
          <p>For any assistance, feel free to reach out to our support team at <a href="mailto:info@filemakr.com">info@filemakr.com</a> or call us at 8877152035.</p>
          <p>Looking forward to seeing your success!</p>
          <p>Best regards,</p>
          <p>Abhishek Jain<br>Business Development Manager<br>FileMakr<br><a href="mailto:info@filemakr.com">info@filemakr.com</a></p>
        `,
      };

      try {
        await transporter.sendMail(mailOptions);
        console.log(`Email sent to ${shopkeeper.email}`);

        // Update the is_login_mail_send flag
        await queryAsync(
          "UPDATE shopkeeper SET is_password_mail_send = 1 WHERE id = ?",
          [shopkeeper.id]
        );
      } catch (mailError) {
        console.error(`Error sending email to ${shopkeeper.email}:`, mailError);
      }
    }

    // Close the database connection
  } catch (error) {
    console.error("Error processing emails:", error);
  }
}




async function sendWelcomeEmails() {
  try {
    // Create a database connection

    // Fetch shopkeepers who haven't received a login email
    const rows = await queryAsync(
      "SELECT id, email, name, address FROM shopkeeper WHERE is_login_mail_send IS NULL OR is_login_mail_send = 0"
    );

    console.log(rows)

    if (rows.length === 0) {
      console.log("No pending emails to send.");
      return;
    }

    // Loop through each shopkeeper and send an email
    for (const shopkeeper of rows) {
      const mailOptions = {
        from: `info@filemakr.com`,
        to: shopkeeper.email,
        subject: "Congratulations on Becoming a Campus Brand Ambassador",
        html: `
          <p>Dear ${shopkeeper.name},</p>
          <p>Greetings from FileMakr!</p>

          <p>We are delighted to inform you that you have been selected as a <strong>Campus Brand Ambassador</strong> for <strong>${shopkeeper.address}</strong> Congratulations on this achievement!</p>
          <p>As a Campus Brand Ambassador, you will represent our brand on campus, promoting our programs and initiatives, and inspiring your peers to learn more about the opportunities we offer. We believe your enthusiasm, leadership qualities, and commitment make you the perfect fit for this role.</p>
          <p>Once again, congratulations on this exciting opportunity! We look forward to having you as a valued part of our ambassador program.</p>
          <p>Best regards,</p>
          <p>Abhishek Jain<br>Business Development Manager<br>FileMakr<br><a href="mailto:info@filemakr.com">info@filemakr.com</a></p>
        `,
      };

      try {
        await transporter.sendMail(mailOptions);
        console.log(`Email sent to ${shopkeeper.email}`);

        // Update the is_login_mail_send flag

        await queryAsync(
          "UPDATE shopkeeper SET is_login_mail_send = 1 WHERE id = ?",
          [shopkeeper.id]
        );
       
      } catch (mailError) {
        console.error(`Error sending email to ${shopkeeper.email}:`, mailError);
      }
    }

    // Close the database connection
  } catch (error) {
    console.error("Error processing emails:", error);
  }
}

// Run the function
// sendEmails();

// Run the function
// sendEmails();
// sendWelcomeEmails()



  module.exports = {
    adminAuthenticationToken,
    getCurrentWeekDates,
    getCurrentMonthDates,
    getLastMonthDates,
    getCurrentYearDates,
    userAuthenticationToken,
    getCurrentDate,
    getLastFinancialYearDates,
    generateOrderNumber,
    generateUniqueId,
    getDatas,
    sendInviduallyMail,
    sendPromotionalMail,
    sendUserMail,
    profile,
    getOrderDetails,
    sendWhatsAppMessage,
    generateSignedUrl,
    verifyToken,
    shopAuthenticationToken,
    createPaymentRequest,
    generateRandomOrderNo,
    fetchOrderDetails,
    handlePaymentResponse
  }


//   wkltwfbwnhnvzmwr