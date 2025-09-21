const emailTemplates = {
    welcomeMessage: {
        userSubject: 'Welcome to FileMakr, {{Customer_Name}}! 🎓 Your Final Year Project Journey Begins Now',
        userMessage: (username) => `
    <p>Hi ${username},</p>
    <p>Welcome to FileMakr – your ultimate destination for hassle-free final year projects! We’re thrilled to have you on board. 🎉</p>
    <p>At FileMakr, we know how challenging final year projects can be, especially when you're balancing academics, internships, and everything else. That’s why we’ve designed our platform to provide you with affordable, high-quality solutions that make your project journey smoother and more manageable.</p>
    <p>Here's what you can expect from FileMakr:</p>
    <ul>
        <li><strong>Instant Access:</strong> Dive into a wide range of project reports and source codes across multiple technologies, right at your fingertips.</li>
        <li><strong>No Upfront Payments:</strong> With our unique payment-after-evaluation model, you can fully explore a live demo of your chosen project before committing – zero risks, 100% satisfaction guaranteed.</li>
        <li><strong>Tailored Solutions:</strong> Whether you're in B.Tech, M.Tech, B.E., M.E., BCA, or MCA, we’ve got you covered with resources that are specifically designed to meet the needs of your program.</li>
    </ul>
    <p>We’re here to support you every step of the way, ensuring that your final year project is a success and not a stress.</p>
    <p>Ready to get started? Log in to your FileMakr account and explore the wide range of project solutions waiting for you.</p>
    <p>If you have any questions or need assistance, our support team is just an email away at [Support Email]. We’re here to help you succeed!</p>
    <p>Empower yourself with knowledge and succeed with FileMakr today.</p>
    <p>Best regards,</p>
    <p>The FileMakr Team</p>
    <p>https://www.filemakr.com</p>
    <p>info@filemakr.com</p>
`,
    },
    beforprojectreport: {
        userSubject: 'Just One Step Away from Downloading Your {{Project_Name}} Report! 💼',
        userMessage: (name,project_name,rollNumber) => `
    <p>Hi ${name},</p>
    <p>Great news! 🎉 Your ${project_name} project report is ready and waiting for you.</p>
    <p>You’re just one step away from downloading your project report and getting started on your final year project with ease.</p>
    <p>Here’s what you need to do:</p>
    <ul>
        <li><strong>Complete the Payment:</strong>  Simply make the payment using the secure link below.</li>
        <li><strong>Download Your Project Report:</strong> Once the payment is confirmed, you’ll be able to instantly download your project report.</li>
    </ul>

    <p><a href='https://www.filemakr.com/final/year/project/report/${rollNumber}'>Complete Your Payment and Download Now</a></p>
    <p>With FileMakr, you get more than just a report. You gain access to a comprehensive guide that includes source codes and detailed documentation to help you successfully complete your final year project.</p>
    <p>Don't miss out on this opportunity to excel in your final year. Complete the last step, and your project report will be ready for you to download immediately.</p>
    <p>If you have any questions or need assistance, feel free to reach out to our support team at <a href="mailto:info@filemakr.com">info@filemakr.com</a>. We’re here to help!</p>
    <p>Empower yourself and succeed with FileMakr today!</p>
    <p>Best regards,</p>
    <p>The FileMakr Team</p>
    <p><a href="https://www.filemakr.com">https://www.filemakr.com</a></p>
    <p><a href="mailto:info@filemakr.com">info@filemakr.com</a></p>
`,
       
    },
    orderConfirmation: {
        userSubject: 'Your Project Report is Ready for Download! 🎓',
        userMessage: (username,projectlink) => `
    <p>Dear ${username},</p>
    <p>Thank you for choosing FileMakr for your final year project needs! We’re excited to let you know that your Daily Expense Tracker project report is ready and waiting for you to download.</p>
    <p>Here’s your download link:</p>
    <p><a href=${projectlink}>Download Your Project Report Now</a></p>
    <p>Simply click the link above, and your project report will be instantly downloaded. It’s that easy!</p>
    <p>At FileMakr, we’re committed to providing you with high-quality, comprehensive project reports that help you succeed. We hope you find this resource valuable and that it supports you in achieving your academic goals.</p>
    <p>If you have any questions or need further assistance, don’t hesitate to reach out to our support team at <a href="mailto:info@filemakr.com">info@filemakr.com</a>. We’re here to help!</p>
    <p>Thank you again for your purchase and trust in FileMakr.</p>
    <p>Best regards,</p>
    <p>The FileMakr Team</p>
    <p><a href="https://www.filemakr.com">https://www.filemakr.com</a></p>
    <p><a href="mailto:info@filemakr.com">info@filemakr.com</a></p>
`,

        adminSubject: 'User {{Customer_Name}}! Has Downloaded the Project Report',
        adminMessage: (username, userNumber, rollNumber, downloadLink) => `
    <p>Hi FileMakr Xpert,</p>
    <p>This is to inform you that the project report for ${username} is now ready for download.</p>

    <p><strong>User Information:</strong></p>
    <ul>
        <li><strong>Name:</strong> ${username}</li>
        <li><strong>Number:</strong> ${userNumber}</li>
        <li><strong>Roll Number:</strong> ${rollNumber}</li>
    </ul>

    <p><strong>Action Required:</strong></p>
    <p>Please ensure that the user receives their report promptly and assist them with any queries they may have.</p>

    <p><strong>Download Link for Admin Reference:</strong></p>
    <p><a href="${downloadLink}">Click Here to Access the User's Project Report</a></p>

    <p>Thank you for your continued support and dedication to providing our users with the best possible experience.</p>

    <p>Best regards,</p>
    <p>The FileMakr Team</p>
    <p><a href="https://www.filemakr.com">https://www.filemakr.com</a></p>
    <p><a href="mailto:info@filemakr.com">info@filemakr.com</a></p>
`,

    },

    soucrceCodeConfirmation: {
        userSubject: 'Your Source Code is Ready for Download! 🎉    ',
        userMessage: (username,projectlink) => `
    <p>Dear ${username},</p>
    <p>Thank you for choosing FileMakr for your final year project needs! We're excited to inform you that your requested source code is now ready for download. 🚀</p>
    <p>To download your project source code and report, simply click on the link below:</p>
    <p><a href=${projectlink}>Download Now</a></p>
    <p>Your download includes:</p>
    <ul>
        <li><strong>Complete Source Code:</strong> Ready to be implemented and customized according to your project requirements.</li>
    </ul>
    <p>Important: Please make sure to review the files and let us know if you need any additional assistance or customization.</p>
    <p>We hope that our resources will help you excel in your final year project. Should you have any questions or need further support, don’t hesitate to reach out to us at <a href="mailto:[Support Email]">[Support Email]</a>.</p>
    <p>Thank you for trusting FileMakr! We look forward to supporting you throughout your academic journey.</p>
    <p>Best regards,</p>
    <p>The FileMakr Team</p>
    <p><a href="https://www.filemakr.com">https://www.filemakr.com</a></p>
    <p><a href="mailto:info@filemakr.com">info@filemakr.com</a></p>
`,


        adminSubject: 'User {{Customer_Name}}! Has Downloaded the Source Code',
        adminMessage: (username, userNumber, downloadLink) => `
    <p>Hi FileMakr Xpert,</p>
    <p>This is to inform you that ${username} has successfully initiated the download of their requested source code and project report. Please find the details below:</p>

    <p><strong>User Information:</strong></p>
    <ul>
        <li><strong>Name:</strong> ${username}</li>
        <li><strong>Number:</strong> ${userNumber}</li>
    </ul>

    <p><strong>If any follow-up or additional support is required, please ensure to assist the user promptly.</strong></p>
    <p>Please ensure that the user receives their report promptly and assist them with any queries they may have.</p>

    <p><strong>Download Link for Admin Reference:</strong></p>
    <p><a href="${downloadLink}">Click Here to Access the User's Project Report</a></p>

    <p>Thank you for your continued support and dedication to providing our users with the best possible experience.</p>

    <p>Best regards,</p>
    <p>The FileMakr Team</p>
    <p><a href="https://www.filemakr.com">https://www.filemakr.com</a></p>
    <p><a href="mailto:info@filemakr.com">info@filemakr.com</a></p>
`,

    },

    beforesourcecode: {
        userSubject: 'You are Just One Step Away! 💻 Download Your {{Project_Name}} Project Now',
        userMessage: (name,project_name,source_code_link) => `
    <p>Hi ${name},</p>
    <p>Great news! 🎉 Your ${project_name} source code is ready and waiting for you.</p>
    <p>You’re just one step away from accessing the complete source code and project report. To get started, all you need to do is complete the payment, and your project will be available for instant download.</p>
    <p>Here’s what you need to do:</p>
    <ul>
        <li><strong>Complete the Payment:</strong>  Simply make the payment using the secure link below. </li>
        <li><strong>Download Your Project Report:</strong> Once the payment is confirmed, you'll gain immediate access to your ${project_name} project source code and report</li>
    </ul>


    <p><a href='https://www.filemakr.com/${source_code_link}/source-code'>Download Your Source Code Now</a></p>

    <p>We understand how crucial your final year project is, and we're here to ensure you have everything you need to succeed. With our no-risk payment model, you only pay when you're ready to download your fully evaluated project.</p>
    <p>Don't wait any longer – complete the final step and take control of your project today!</p>
    <p>If you have any questions or need assistance, feel free to reach out to our support team at <a href="mailto:info@filemakr.com">info@filemakr.com</a>. We’re here to help!</p>
    <p>Empower yourself and succeed with FileMakr today!</p>
    <p>Best regards,</p>
    <p>The FileMakr Team</p>
    <p><a href="https://www.filemakr.com">https://www.filemakr.com</a></p>
    <p><a href="mailto:info@filemakr.com">info@filemakr.com</a></p>
`,
       
    },
    userorderRecive: {
        userSubject: 'Order Confirmation and Details',
        userMessage: (username,orderType,topic,quantity,totalamount,advanceamount) => `
    <p>Dear ${username},</p>
    <p>Thank you for placing your order with us. Below are the details of your order for your reference:</p>
    <ul>
        <li><strong>Order Type:</strong> ${orderType}</li>
        <li><strong>Topic:</strong> ${topic}</li>
        <li><strong>Quantity:</strong> ${quantity}</li>
        <li><strong>Total Amount:</strong> Rs.${totalamount}</li>
        <li><strong>Advance Amount:</strong> Rs.${advanceamount}</li>

     </ul>
    <p>We appreciate your trust in us and are committed to delivering high-quality results. Should you have any changes or questions regarding your order, please do not hesitate to reach out to us.</p>
    <p>Looking forward to serving you!</p>
    <p>Best regards,</p>
    <p>The FileMakr Team</p>
    <p>https://www.filemakr.com</p>
    <p>info@filemakr.com</p>
`,
    },
    shopkeeperorder: {
        userSubject: 'Order Confirmation and Details',
        userMessage: (username,orderType,topic,quantity,totalamount,advanceamount) => `
    <p>Dear User,</p>
    <p>A new order has been placed. Below are the details for your reference:</p>
    <ul>
       
        <li><strong>Customer Name:</strong> ${username}</li>
        <li><strong>Order Type:</strong> ${orderType}</li>
        <li><strong>Topic:</strong> ${topic}</li>
        <li><strong>Quantity:</strong> ${quantity}</li>
        <li><strong>Total Amount:</strong> Rs.${totalamount}</li>
        <li><strong>Advance Amount:</strong> Rs.${advanceamount}</li>

     </ul>
    <p>We appreciate your trust in us and are committed to delivering high-quality results. Should you have any changes or questions regarding your order, please do not hesitate to reach out to us.</p>
    <p>Looking forward to serving you!</p>
    <p>Best regards,</p>
    <p>The FileMakr Team</p>
    <p>https://www.filemakr.com</p>
    <p>info@filemakr.com</p>
`,
    },
  
};

module.exports = emailTemplates;
