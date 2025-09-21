const nodemailer = require('nodemailer');

// 👉 Use env vars in production
// SMTP_HOST=smtpout.secureserver.net
// SMTP_PORT=465
// SMTP_USER=info@filemakr.com
// SMTP_PASS=********
 const transporter = nodemailer.createTransport({
    host: 'smtpout.secureserver.net',
    port: 465,
    secure: true,
    auth: {
      user: 'info@filemakr.com',
      pass: 'Np2tr6G84',
    },
  });

const BRAND = {
  name: 'FileMakr',
  from: `"FILEMAKR Team" <${process.env.SMTP_USER || 'info@filemakr.com'}>`,
  support: 'info@filemakr.com',
  website: 'https://filemakr.com',
  // Minimal inline style tokens
  styles: `
    font-family: Arial, Helvetica, sans-serif; line-height:1.6; color:#111;
  `
};

/**
 * Returns { subject, filename, intro, bullets[], closing }
 */
function buildTemplate(docType, ctx) {
  const {
    studentName,
    collegeName,
    startDate,
    endDate,
    title , // "Mr." / "Ms." / '' (optional)
  } = ctx;

  const sharedClosing = [
    `If you have any questions, reach us at ${BRAND.support}.`,
    `Warm regards,`,
    `Team ${BRAND.name}`,
  ];

  switch (docType) {
    case 'LEVEL_1':
      return {
        subject: `Your Level 1 Certificate – ${BRAND.name}`,
        filename: 'Level_1_Certificate.pdf',
        intro: `Dear ${studentName},`,
        body: [
          `Congratulations on successfully completing <strong>Level 1</strong> of the Campus Brand Ambassador Program at ${BRAND.name}.`,
          `Your consistency, task completion, and initiative have been duly recognized.`,
        ],
        bullets: [
          'Engaged peers and represented the brand professionally.',
          'Maintained daily progress and met milestone targets.',
        ],
        closing: sharedClosing,
      };

    case 'LEVEL_2':
      return {
        subject: `Your Level 2 Certificate – ${BRAND.name}`,
        filename: 'Level_2_Certificate.pdf',
        intro: `Dear ${studentName},`,
        body: [
          `Kudos on achieving <strong>Level 2</strong> in the Campus Brand Ambassador Program at ${BRAND.name}.`,
          `This milestone highlights your advanced consistency, outreach quality, and ownership.`,
        ],
        bullets: [
          'Expanded campus/digital impact with measurable outcomes.',
          'Sustained momentum across tasks and initiatives.',
        ],
        closing: sharedClosing,
      };

    case 'LEADERSHIP':
      return {
        subject: `Your Leadership Certificate – ${BRAND.name}`,
        filename: 'Leadership_Certificate.pdf',
        intro: `Dear ${studentName},`,
        body: [
          `We are pleased to award you the <strong>Leadership Certificate</strong> for outstanding initiative and peer inspiration in the ${BRAND.name} Campus Brand Ambassador Program.`,
          `You’ve set a high bar for communication, guidance, and brand advocacy.`,
        ],
        bullets: [
          'Mentored peers and drove collaborative outcomes.',
          'Demonstrated strategic thinking and responsibility.',
        ],
        closing: sharedClosing,
      };

    case 'EXPERIENCE':
      return {
        subject: `Your Experience Certificate – ${BRAND.name}`,
        filename: 'Experience_Certificate.pdf',
        intro: `To whom it may concern,`,
        body: [
          `This is to certify that ${title ? title + ' ' : ''}${studentName}, a student of ${collegeName}, has successfully served as a Campus Brand Ambassador at ${BRAND.name} from ${startDate} to ${endDate}.`,
          `The ambassador contributed to outreach, daily tasks, and milestone achievements with professionalism and dedication.`,
        ],
        bullets: [
          'Promoted campaigns on campus and online.',
          'Completed milestones including Level 1, Level 2, and Leadership.',
        ],
        closing: [
          `Issued on: ${new Date().toDateString()}`,
          ...sharedClosing,
        ],
      };

    case 'RELIEVING':
      return {
        subject: `Relieving Letter – ${BRAND.name}`,
        filename: 'Relieving_Letter.pdf',
        intro: `To whom it may concern,`,
        body: [
          `This letter formally relieves ${title ? title + ' ' : ''}${studentName} (${collegeName}) from responsibilities as a Campus Brand Ambassador at ${BRAND.name}.`,
          `${title ? title + ' ' : ''}${studentName} was associated from ${startDate} to ${endDate}, contributing to outreach and promotional activities under our program.`,
        ],
        bullets: [
          'Demonstrated timely task completion and professional conduct.',
          'Actively represented the brand across digital and campus platforms.',
        ],
        closing: [
          `Issued on: ${new Date().toDateString()}`,
          `We appreciate their contribution and wish them success ahead.`,
          ...sharedClosing,
        ],
      };

    default:
      throw new Error(`Unsupported docType: ${docType}`);
  }
}

function renderHtml({ intro, body, bullets = [], closing }) {
  const bulletsHtml = bullets.length
    ? `<ul style="margin:8px 0 16px 20px; padding:0;">${bullets
        .map(li => `<li style="margin:4px 0;">${li}</li>`)
        .join('')}</ul>`
    : '';

  const paragraphs = [
    `<p>${intro}</p>`,
    ...body.map(p => `<p>${p}</p>`),
    bulletsHtml,
    ...closing.map(p => `<p>${p}</p>`),
    `<p style="font-size:12px;color:#667; margin-top:16px;">${BRAND.website}</p>`
  ].join('');

  return `
  <div style="${BRAND.styles}">
    ${paragraphs}
  </div>`;
}

/**
 * Send any certificate/letter email with attached PDF.
 *
 * @param {Object} args
 * @param {string} args.to - Recipient email
 * @param {Buffer} args.pdfBuffer - The PDF buffer to attach
 * @param {string} args.docType - One of: LEVEL_1, LEVEL_2, LEADERSHIP, EXPERIENCE, RELIEVING
 * @param {string} args.studentName
 * @param {string} [args.collegeName]
 * @param {string} [args.startDate]
 * @param {string} [args.endDate]
 * @param {string} [args.title] - "Mr." | "Ms." | ""
 */
async function sendCommonBodyLetter(args) {
  const tmpl = buildTemplate(args.docType, args);
  const html = renderHtml(tmpl);

  const mailOptions = {
    from: BRAND.from,
    to: args.to,
    subject: tmpl.subject,
    html,
    attachments: [
      {
        filename: tmpl.filename,
        content: args.pdfBuffer,
        contentType: 'application/pdf',
      },
    ],
  };

  return transporter.sendMail(mailOptions);
}

module.exports = { sendCommonBodyLetter };
