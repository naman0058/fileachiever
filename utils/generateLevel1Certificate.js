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

async function generateLevel1Certificate({ student_name, college_name, start_date, end_date , title}) {
  const templatePath = path.join(__dirname, '../templates/Level1_CERTIFICATE.pdf');
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
    { text: `This is to proudly acknowledge that ${title} ${student_name} from ${college_name} has successfully completed Level 1 of the Campus Brand Ambassador Program at FileMakr.` },
    {},
    { text: `As part of this achievement, the ambassador demonstrated consistent engagement, timely task completion, and active participation in community growth initiatives.` },
    {},
    { text: `Key Contributions`, bold: true },
    { text: `- Promoted FileMakr across digital platforms and college networks.` },
    { text: `- Maintained daily activity streaks and milestone tracking.` },
    { text: `- Upheld professionalism and represented the brand with integrity.` },
    {},
    { text: `Recognition`, bold: true },
    { text: `This Level 1 Certificate serves as a formal recognition of the ambassador’s dedication, initiative, and valuable contribution during the first phase of the program.` },
    {},
    { text: `We commend their efforts and look forward to their continued growth through subsequent milestones.` },
    {},
    { text: `Issued on: ${formattedDate}` },
    {},
    { text: `Warm regards,` },
    { text: `Team FileMakr` }
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

  console.log('run here perfectly')
  return await pdfDoc.save();
  
}

module.exports = generateLevel1Certificate;
