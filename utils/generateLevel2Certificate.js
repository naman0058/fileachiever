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
  const templatePath = path.join(__dirname, '../templates/Level2_CERTIFICATE.pdf');
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
  { text: `This is to formally recognize ${title} ${student_name} from ${college_name} for successfully completing **Level 2** of the Campus Brand Ambassador Program at FileMakr.` },
  {},
  { text: `Reaching Level 2 reflects the ambassador’s exceptional commitment, consistent execution of responsibilities, and growing leadership within the FileMakr community.` },
  {},
  { text: `Distinguished Contributions`, bold: true },
  { text: `- Actively drove awareness initiatives both online and offline.` },
  { text: `- Maintained a strong performance streak and task completion rate.` },
  { text: `- Mentored new ambassadors and contributed to peer learning.` },
  { text: `- Represented the FileMakr brand with professionalism and initiative.` },
  {},
  { text: `Acknowledgement`, bold: true },
  { text: `This Level 2 Certificate is awarded in appreciation of the ambassador’s impactful involvement and as encouragement to continue striving toward higher milestones in the program.` },
  {},
  { text: `Their work sets a benchmark for others and reflects our shared values of excellence, innovation, and collaboration.` },
  {},
  { text: `Issued on: ${formattedDate}` },
  {},
  { text: `With appreciation,` },
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

  return await pdfDoc.save();
}

module.exports = generateOfferLetter;
