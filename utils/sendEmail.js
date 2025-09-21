const nodemailer = require('nodemailer');

async function sendOfferLetter(toEmail, pdfBuffer, student_name) {
  const transporter = nodemailer.createTransport({
    host: 'smtpout.secureserver.net',
    port: 465,
    secure: true,
    auth: {
      user: 'info@filemakr.com',
      pass: 'Np2tr6G84',
    },
  });

  const mailOptions = {
    from: '"FILEMAKR Team" <info@filemakr.com>',
    to: toEmail,
    subject: '🎓 Your Official Offer Letter from FileMakr',
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <p>Dear <strong>${student_name}</strong>,</p>

        <p>We are delighted to welcome you as a <strong>Campus Brand Ambassador</strong> at <strong>FileMakr</strong>.</p>

        <p>Your dedication and enthusiasm toward helping students and spreading awareness about FileMakr's final-year project services have impressed us.</p>

        <p>Please find your official offer letter attached with this email.</p>

        <p>If you have any questions or need support, feel free to reach out to us at <a href="mailto:info@filemakr.com">info@filemakr.com</a>.</p>

        <p>Best regards,<br/>
        <strong>Team FileMakr</strong><br/>
        <em>Empowering Students with Real Project Solutions</em></p>
      </div>
    `,
    attachments: [
      {
        filename: 'Offer_Letter.pdf',
        content: pdfBuffer,
        contentType: 'application/pdf',
      },
    ],
  };

  return transporter.sendMail(mailOptions);
}

module.exports = sendOfferLetter;
