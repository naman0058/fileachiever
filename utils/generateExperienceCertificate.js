const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const fs = require('fs');
const path = require('path');

function sanitizeToWinAnsi(s = '') {
  return s
    // replace non-breaking space
    .replace(/\u00A0/g, ' ')
    // hyphens/dashes → ASCII hyphen
    .replace(/[\u2010-\u2015]/g, '-')
    // smart quotes → straight quotes
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    // strip emojis and extended pictographs
    .replace(/\p{Extended_Pictographic}/gu, '');
}

function wrapText(text, font, size, maxWidth) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    const tentative = line ? `${line} ${w}` : w;
    const width = font.widthOfTextAtSize(tentative, size);
    if (width <= maxWidth) {
      line = tentative;
    } else {
      if (line) lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  return lines;
}

async function generateOfferLetter({ student_name, college_name, start_date, end_date,title }) {
  const templatePath = path.join(__dirname, '../templates/EXPERIENCE_CERTIFICATE.pdf');
  const existingPdfBytes = fs.readFileSync(templatePath);
  const pdfDoc = await PDFDocument.load(existingPdfBytes);
  const pages = pdfDoc.getPages();
  let page = pages[0];

  const times = await pdfDoc.embedFont(StandardFonts.TimesRoman);
  const timesBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);

  const fontSize = 12;
  const lineHeight = 18;
  const marginTop = 650;
  const marginBottom = 50;
  const leftMargin = 50;
  const maxWidth = 500;

  let y = marginTop;

const today = new Date();
const formattedDate = today.toLocaleDateString('en-US', {
  year: 'numeric',
  month: 'long',
  day: 'numeric'
});



const content = [
  { text: `To whom it may concern,`, bold: true },
  {},
  { text: `This is to certify that Mr./Ms. ${student_name} from ${college_name} has successfully served as a Campus Brand Ambassador at FileMakr from ${start_date} to ${end_date}.` },
  {},
  { text: `During this tenure, the ambassador actively participated in a structured 90-day engagement program aimed at promoting FileMakr’s brand presence within their college network and across digital platforms.` },
  {},
  { text: `Roles and Responsibilities`, bold: true },
  { text: `- Represented FileMakr in college events, social circles, and online communities.` },
  { text: `- Promoted campaigns and initiatives through daily tasks and creative outreach.` },
  { text: `- Maintained a consistent activity streak while achieving major performance milestones.` },
  { text: `- Provided valuable feedback to enhance brand visibility and user engagement.` },
  {},
  { text: `Performance Overview`, bold: true },
  { text: `Mr./Ms. ${student_name} displayed a strong sense of responsibility, punctuality, and innovation throughout the program.` },
  { text: `They completed all key milestones — including Offer Letter, Level 1, Level 2, and Leadership recognitions — with a high degree of professionalism.` },
  {},
  { text: `This certificate is issued as a token of appreciation for their contribution and is intended to support their future academic and professional endeavors.` },
  {},
  { text: `Issued on: ${formattedDate}` },
  {}
].map(p => (p.text ? { ...p, text: sanitizeToWinAnsi(p.text) } : p));

  for (const paragraph of content) {
    if (!paragraph.text) { y -= lineHeight; continue; }
    const font = paragraph.bold ? timesBold : times;
    const lines = wrapText(paragraph.text, font, fontSize, maxWidth);
    for (const line of lines) {
      if (y < marginBottom) { page = pdfDoc.addPage([595.28, 841.89]); y = marginTop; }
      page.drawText(line, { x: leftMargin, y, size: fontSize, font, color: rgb(0, 0, 0) });
      y -= lineHeight;
    }
  }

  return await pdfDoc.save();
}

module.exports = generateOfferLetter;
