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

async function generateOfferLetter({ student_name, college_name, start_date, end_date }) {
  const templatePath = path.join(__dirname, '../templates/OFFER_LETTER.pdf');
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

  const content = [
  { text: `Dear ${student_name},`, bold: true },
  {},
  { text: `We are pleased to offer you the role of Campus Brand Ambassador at ${college_name}, from ${start_date} to ${end_date}.` },
  {},
  { text: `Role & Responsibilities`, bold: true },
  { text: `- Promote FileMakr on campus and online.` },
  { text: `- Complete daily dashboard tasks and communicate promptly.` },
  {},
  { text: `Verification & Performance`, bold: true },
  { text: `- Mark tasks daily; rewards unlock only after verification.` },
  {},
  { text: `Benefits`, bold: true },
  { text: `- Certificates at milestones, commission on sales, and performance based recommendation.` },
  { text: `- Recognition, incentives, and LinkedIn endorsement.` },
  {},
  { text: `Milestone Highlights`, bold: true },
  { text: `- Day 10: Offer Letter | Day 30: Level 1 Certificate | Day 60: Level 2 Certificate | Day 75: Leadership Certificate | Day 90: Job Recommendation.` },
  {},
  { text: `Conduct`, bold: true },
  { text: `- Maintain professionalism and follow brand guidelines throughout the program.` },
  {},
  { text: `We look forward to your contribution. Welcome to the FileMakr community!` }
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
