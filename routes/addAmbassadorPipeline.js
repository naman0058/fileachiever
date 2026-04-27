/**
 * Shared MERN / ambassador onboarding: DB + welcome + credentials emails + benefit row.
 */
const { filemakrMailFrom, filemakrSupportEmail } = require('../utils/filemakrSmtp');
function generateUniqueCodeFromNameCollege(name, address) {
  const clean = (str) => (str || '').trim().replace(/\s+/g, '').toUpperCase();
  const part1 = clean(name).substring(0, 3);
  const part2 = clean(address).substring(0, 3);
  const randomNum = Math.floor(100 + Math.random() * 900);
  return `${part1}${part2}${randomNum}`;
}

function createPipeline({ queryAsync, generatePassword, sendWithRetry, moment }) {
  async function addAmbassadorOne(body) {
    const name = (body.name || '').trim();
    const number = (body.number || '').trim();
    const address = (body.address || '').trim();
    let unique_code = (body.unique_code || '').trim();
    const email = (body.email || '').trim();
    const instagram_id = (body.instagram_id || '').trim();
    const referal_code = (body.referal_code || '').trim() || null;

    if (!name || !number || !address || !email || !instagram_id) {
      throw new Error('Missing name, phone, college, email, or Instagram');
    }
    if (!unique_code) unique_code = generateUniqueCodeFromNameCollege(name, address);

    const password = generatePassword(name, number, address);
    const start_date = moment().format('YYYY-MM-DD');
    const end_date = moment().add(1.5, 'months').format('YYYY-MM-DD');

    const insertQuery = `
      INSERT INTO shopkeeper 
        (name, number, address, password, unique_code, email, instagram_id,
         comission, discount, is_login_mail_send, is_password_mail_send, certificate_issued,referal_code)
      VALUES (?, ?, ?, ?, ?, ?, ?, 20, 5, 0, 0, 0,?)
    `;
    const insertResult = await queryAsync(insertQuery, [name, number, address, password, unique_code, email, instagram_id, referal_code]);
    const brandAmbassadorId = insertResult.insertId;

    const offerLetterMail = {
      from: filemakrMailFrom('FILEMAKR Team'),
      to: email,
      subject: 'Welcome Letter – Campus Brand Ambassador at FileMakr',
      html: `
    <div style="font-family: Arial, Helvetica, sans-serif; line-height:1.6; color:#333;">
  <h2>Dear ${name},</h2>

  <p>Greetings from <strong>FileMakr</strong>!</p>

  <p>
    We are pleased to welcome you as a <strong>Campus Brand Ambassador</strong> for FileMakr at
    <strong>${address}</strong>. Your ambassadorship runs from <strong>${start_date}</strong> to
    <strong>${end_date}</strong>.
  </p>

  <p>
    As part of this program, you will also receive access to our <strong>45 Days MERN Stack Training Program</strong>—
    designed to help you transition from <strong>Student to Industry Professional</strong> through a structured,
    project-based learning journey.
  </p>

  <h4>About FileMakr</h4>
  <p>
    FileMakr is a trusted academic solutions company operating since 2019, dedicated to empowering students with
    practical skills and career-focused opportunities. Through our Campus Brand Ambassador Program, we provide a
    structured <strong>45-day training in web and application development</strong>, along with
    <strong>industry-recognized certifications</strong> and real-world professional exposure.
  </p>

  <h4>Our Vision (Zero to Hero)</h4>
  <ul>
    <li><strong>Transforming Beginners:</strong> We guide students from absolute basics to strong technical foundations.</li>
    <li><strong>Industry-Oriented Learning:</strong> Training aligned with real tools, workflows, and technologies.</li>
    <li><strong>Structured Mentorship:</strong> Continuous guidance from experienced mentors.</li>
    <li><strong>Skills, Mindset &amp; Confidence:</strong> Building professional habits along with technical ability.</li>
  </ul>

  <h4>Roles &amp; Responsibilities (Campus Ambassador)</h4>
  <ul>
    <li>Promote FileMakr on campus (clubs, peers, faculty) and within your campus network.</li>
    <li>Promote FileMakr on social media platforms in a professional and consistent manner.</li>
    <li>Complete one simple daily task (approx. <strong>30 minutes/day</strong>).</li>
    <li>Maintain professional conduct and timely communication.</li>
  </ul>

  <h4>Daily Task Process</h4>
  <ul>
    <li>Open your dashboard daily and complete the listed task(s).</li>
    <li>Mark completion; tasks are counted only after verification.</li>
    <li>Verified performance unlocks benefits and recognition.</li>
  </ul>

  <h4>45 Days MERN Stack Training Program (Key Details)</h4>
  <p><strong>Duration:</strong> 45 Days | <strong>Daily:</strong> 1 Hour | <strong>Format:</strong> Practical &amp; Project-Based</p>

  <h4>Training Methodology</h4>
  <ul>
    <li>50% Live Coding + 50% Concept Explanation</li>
    <li>Daily hands-on practice with homework &amp; assignments</li>
    <li>Real-world project development with mentor guidance</li>
  </ul>

   <h4>Technologies Covered (MERN + Core Frontend)</h4>
  <ul>
    <li><strong>MongoDB</strong> (Database) – CRUD, Mongoose, schemas/models, relationships</li>
    <li><strong>Express.js</strong> (Backend) – REST APIs, middleware, error handling</li>
    <li><strong>React.js</strong> (Frontend) – components, hooks, routing, API integration</li>
    <li><strong>Node.js</strong> (Runtime) – backend fundamentals &amp; server-side development</li>
    <li>HTML5, CSS3, JavaScript (ES6+), Responsive UI, API Integration</li>
  </ul>

  <h4>Program Highlights</h4>
  <ul>
    <li>Mini projects in JavaScript, React, and Backend APIs</li>
    <li>Full MERN stack capstone project (plan → build → integrate → deploy)</li>
    <li>Deployment &amp; hosting (Netlify/Vercel + Render/Railway)</li>
    <li>Testing, debugging, optimization, and security best practices</li>
    <li>Project documentation (README, GitHub best practices, clean repo structure)</li>
    <li>Resume &amp; interview preparation + mock interview sessions</li>
  </ul>

  <h4>What You Will Receive (Benefits)</h4>
  <ul>
    <li><strong>45 Days MERN Stack Training Program</strong> (Industry-oriented, beginner to advanced, practical focused)</li>
    <li><strong>Training Certificate</strong> upon successful completion</li>
    <li><strong>Professional Recognition</strong> to strengthen your resume and LinkedIn profile</li>
    <li><strong>Letter of Recommendation (LOR)</strong> (performance-based)</li>
    <li><strong>Experience Letter</strong> validating responsibilities and project contributions</li>
    <li><strong>Relationship Building</strong> with mentors, peers, and industry professionals</li>
    <li><strong>20% commission</strong> on every new sale you generate</li>
  </ul>

  <h4>Performance-Based Growth (Opportunities)</h4>
  <ul>
    <li><strong>Internal Assessment &amp; Evaluation</strong> to validate skills gained during the program</li>
    <li><strong>Top Performers Selection</strong> for special recognition in each batch</li>
    <li><strong>Opportunity to Showcase Skills</strong> through real performance and consistency</li>
    <li><strong>Balanced Time Commitment</strong> designed to respect academics and personal schedules</li>
  </ul>

  <h4>Internship Opportunity (For High Performers)</h4>
  <ul>
    <li><strong>1 Month Paid Internship Opportunity</strong></li>
    <li><strong>Stipend:</strong> ₹1000/-</li>
    <li><strong>Official Offer Letter</strong></li>
    <li><strong>Real Project Responsibilities</strong></li>
  </ul>

  <h4>Congratulations</h4>
  <p>
    Congratulations, and welcome to the FileMakr community. Your journey toward becoming an industry-ready professional
    starts here.
  </p>

  <p>
    Warm regards,<br />
    <strong>Team FileMakr</strong><br />
    <span>www.filemakr.com</span>
    
  </p>
</div>
  `,
    };

    const credentialsMail = {
      from: filemakrMailFrom('FILEMAKR Team'),
      to: email,
      subject: 'Your Login Credentials',
      html: `
        <div style="font-family: Arial, Helvetica, sans-serif; color: #333; line-height: 1.6;">
          <p>Dear Student,</p>
          <p>Welcome aboard! Below are your login credentials to access the Attendance Dashboard.</p>
          <ul>
            <li><strong>Mobile Number:</strong> ${number}</li>
            <li><strong>Password:</strong> ${password}</li>
          </ul>
          <p style="text-align: center; margin: 20px 0;">
            <a href="https://www.filemakr.com/mern-training-program" target="_blank"
              style="background-color: #007bff; color: white; padding: 10px 20px; border-radius: 5px; text-decoration: none; display: inline-block;">
              Go to Dashboard
            </a>
          </p>
          <p>For support, write to <a href="mailto:${filemakrSupportEmail()}">${filemakrSupportEmail()}</a>.</p>
          <p>Warm regards,<br><strong>Team FileMakr</strong></p>
        </div>
      `,
    };

    await sendWithRetry(offerLetterMail, { tries: 3 });
    await sendWithRetry(credentialsMail, { tries: 3 });

    await queryAsync(
      `UPDATE shopkeeper SET is_login_mail_send = 1, is_password_mail_send = 1 WHERE id = ?`,
      [brandAmbassadorId]
    );

    await queryAsync(
      `INSERT INTO benefit_claims (brand_ambassador_id, benefit_id, status, claimed_at)
       VALUES (?, 1, 'issued', ?)`,
      [brandAmbassadorId, moment().format('YYYY-MM-DD')]
    );

    return { brandAmbassadorId, email, name };
  }

  function parseSimpleAmbassadorCsv(text) {
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2) return [];
    const headers = lines[0].split(',').map((h) => h.replace(/^\ufeff/, '').replace(/^"|"$/g, '').trim().toLowerCase());
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map((c) => c.replace(/^"|"$/g, '').trim());
      const row = {};
      headers.forEach((h, j) => {
        row[h] = cols[j] !== undefined ? cols[j] : '';
      });
      rows.push(row);
    }
    return rows;
  }

  function csvRecordToAmbassadorBody(rec) {
    return {
      name: rec.name || rec.full_name || '',
      number: rec.number || rec.phone || rec.mobile || '',
      address: rec.address || rec.college || rec.college_name || '',
      email: rec.email || '',
      instagram_id: rec.instagram_id || rec.instagram || '',
      referal_code: rec.referal_code || rec.referral_code || '',
      unique_code: rec.unique_code || '',
    };
  }

  return { addAmbassadorOne, parseSimpleAmbassadorCsv, csvRecordToAmbassadorBody, generateUniqueCodeFromNameCollege };
}

module.exports = createPipeline;
