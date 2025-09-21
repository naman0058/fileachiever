
var express = require('express');
var router = express.Router();
var upload = require('../multer');
var pool = require('../pool');
var pool2 = require('../pool2');
const cron = require('node-cron');
const { OpenAI } = require('openai');
const slugify = require('slugify');

const openai = new OpenAI({
   apiKey: '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'
   });

//    const { Octokit } = require("@octokit/rest");
// const htmlToMarkdown = require('../../utils/markdownConverter');



require('dotenv').config()
var folder = process.env.affilation_folder
var table = process.env.affiliation_table
var table1 = 'source_code'
var dataService = require('../dataService');
const path = require('path');
const fs = require('fs');

router.use(dataService.adminAuthenticationToken);

// import {v2 as cloudinary} from 'cloudinary';
const cloudinary = require('cloudinary').v2

const util = require('util');
const { route } = require('.')
const queryAsync = util.promisify(pool.query).bind(pool);

          
cloudinary.config({ 
  cloud_name: 'dggf8vl9p', 
  api_key: '689413729986639', 
  api_secret: 'hL5COn6ja_-lCqIK021H1YpVyoo' 
});


// Example Express endpoint
router.get('/generate-blog/:category/:type', async (req, res) => {
  const category = req.params.category; // 'PHP' or 'node-js'
  const type = req.params.type; // 'PHP' or 'node-js'

  console.log('categgory',category)
  try {
    await insertBlogsByCategory(category,type);
    res.redirect('/affiliateblog/dashboard')
  } catch (err) {
    console.error(err);
    res.status(500).send('Error generating blogs.');
  }
});


function queryAsync1(sql, params) {
  return new Promise((resolve, reject) => {
    pool2.query(sql, params, (err, results) => {
      if (err) reject(err);
      resolve(results);
    });
  });
}


async function insertBlogsByCategory(category,type) {
  try {
    const projects = await queryAsync(`
      SELECT 
        sc.id,
        sc.name,
        sc.category,
        sc.admin_features,
        sc.user_features,
        sc.seo_name,
        sc.demo_url,
        (
          SELECT GROUP_CONCAT(s.url SEPARATOR ', ')
          FROM (
            SELECT s.url FROM screenshots s 
            WHERE s.source_code_id = sc.id 
            LIMIT 2
          ) AS s
        ) AS screenshots
      FROM source_code sc
      WHERE sc.category = ?
    `, [category]);

    for (const project of projects) {
        console.log('pproject name',projects.length)
      const existing = await queryAsync1(
        'SELECT id FROM blog_topics WHERE topic = ? LIMIT 1',
        [project.name]
      );

      console.log('e',typeof(existing))

      if (existing.length > 0) {
        console.log(`Blog already exists for: ${project.name}`);
        continue;
      }

      let tech_stack = '';
      if (category === 'PHP') {
        tech_stack = 'HTML, CSS, Bootstrap, MySQL, JavaScript, jQuery';
      } else if (category === 'node-js') {
        tech_stack = 'MongoDB, Node.js, Express.js, React';
      } else {
        tech_stack = category;
      }

      let project_details = `Admin Features:\n${project.admin_features}\n\nUser Features:\n${project.user_features}`;
      if (project.screenshots) {
        project_details += `\n\nScreenshots:\n${project.screenshots}`;
      }
      if (project.demo_url) {
        project_details += `\n\nDemo URL:\n${project.demo_url}`;
      }

      const link = `https://www.filemakr.com/${project.seo_name}/source-code`;

      await queryAsync1(`
        INSERT INTO blog_topics (topic, published, link, project_details, tech_stack, category)
        VALUES (?, 0, ?, ?, ?, ?)
      `, [project.name, link, project_details, tech_stack,type]);

      console.log(`Blog inserted for: ${project.name}`);
    }

    console.log('All blogs processed.');
  } catch (err) {
    console.error('Error in insertBlogsByCategory:', err);
  }
}




router.get('/generate-report-blog/:type', async (req, res) => {
  const type = req.params.type;
   try {
    await insertProjectReportsByCategory(type);
    res.redirect('/affiliateblog/dashboard');
  } catch (err) {
    console.error(err);
    res.status(500).send('Error generating report blogs.');
  }
});



async function insertProjectReportsByCategory(type) {
  try {
    const reports = await queryAsync(`
      SELECT 
        pr.id,
        pr.name,
        pr.seo_name
      FROM project pr
    `);

    for (const report of reports) {
      const existing = await queryAsync1(
        'SELECT id FROM blog_topics WHERE topic = ? LIMIT 1',
        [report.report_title]
      );

      if (existing.length > 0) {
        console.log(`Report blog already exists: ${report.report_title}`);
        continue;
      }

   const tech_stack = {
  'BCA': 'BCA Project Report with IEEE Standard Format',
  'MCA': 'MCA Project Report with IEEE Standard Format',
  'B.E.': 'BE Project Report with IEEE Standard Format',
  'M.E.': 'ME Project Report with IEEE Standard Format',
  'B.Tech': 'B.Tech Project Report with IEEE Standard Format',
  'M.Tech': 'M.Tech Project Report with IEEE Standard Format',
  'B.Sc': 'B.Sc Project Report with IEEE Standard Format',
  'M.Sc': 'M.Sc Project Report with IEEE Standard Format'
}[type] || `${type} Project Report`;

// Normalize the type into slug for link
const typeSlugMap = {
  'BCA': 'bca-final-year-project-report',
  'MCA': 'mca-final-year-project-report',
  'B.E.': 'be-final-year-project-report',
  'M.E.': 'me-final-year-project-report',
  'B.Tech': 'btech-final-year-project-report',
  'M.Tech': 'mtech-final-year-project-report',
  'B.Sc': 'bsc-final-year-project-report',
  'M.Sc': 'msc-final-year-project-report'
};

const typeSlug = typeSlugMap[type] || 'final-year-project-report';

const link = `https://www.filemakr.com/${typeSlug}-${report.seo_name}`;

      const project_details = `
Overview:
Our ${report.name} project report is designed to help students and developers understand and implement a robust system. This final year project report includes comprehensive documentation, detailed explanations, and source code in various programming languages.

What’s Included in the ${report.name} Report?
- ER Diagram
- DFD Diagram
- Waterfall Model
- Flow Chart
- Technology Stack
- Testing Cases
- References
- Indexing
- IEEE Standards
- Gantt Chart

This report will guide you through the development of a ${report.name} and includes:

Chapters:
1. Introduction
   - AIM
   - Existing System
   - Proposed System
   - Feasibility Study
   - Work Schedule
   - Report Organization
2. Software Requirements Specification
   - Hardware Requirements
   - Software Requirements
3. Design & Planning
   - SDLC Model
   - Use Flow Diagram
   - ER Diagram
   - DFD Diagram
4. Implementation
   - Front-End & Back-End Tech
5. Testing
   - Unit, Integration, System, Black/White Box Testing
6. Result
7. Advantages
8. Conclusion
9. Bibliography

Download your complete ${report.name} final year report with source code now.
      `;

      await queryAsync1(`
  INSERT INTO blog_topics (topic, published, link, project_details, tech_stack, category)
  VALUES (?, 0, ?, ?, ?, ?)
`, [`${report.name} – ${tech_stack}`, link, project_details, tech_stack, 'project_report']);

      console.log(`Inserted report blog for: ${report.name}`);
    }

    console.log('All project report blogs processed.');
  } catch (err) {
    console.error('Error in insertProjectReportsByCategory:', err);
  }
}


router.get('/dashboard',(req,res)=>{
  let getCurrentWeekDates = dataService.getCurrentWeekDates()
  console.log(getCurrentWeekDates)
     var query = `SELECT distinct(category) FROM source_code;`
     var query1 = `select count(id) as contactus from contactus where date between '${getCurrentWeekDates.startDate}' and '${getCurrentWeekDates.endDate}';`
     var query2 = `select count(id) as payment_request from payment_request where date between '${getCurrentWeekDates.startDate}' and '${getCurrentWeekDates.endDate}';`
     var query3 = `select count(id) as demobooked from requestDemo where status = 'booked';`
     var query4 = `select count(id) from btech_project where status = 'pending';`

     var query5 = `select count(id) as counter from customizeOrder where status = 'pending';`
     var query6 = `select count(id) as counter from customizeOrder where status = 'interested';`
     var query7 = `select count(id) as counter from customizeOrder where status = 'recall';`
     var query8 = `select count(id) as counter from customizeOrder where status = 'reminder_sent';`
     var query9 = `select count(id) as counter from customizeOrder where status = 'success';`
     var query10 = `select count(id) as counter from customizeOrder where status = 'Out for Delivery';`
     var query11 = `select count(id) as counter from customizeOrder where status = 'completed';`
     var query51 = `select count(id) as counter from customizeOrder where status = 'dnp';`




     // Source Code Overview
     
     var query12 = `select count(id) as counter from payment_request where status = 'pending' and type = 'source_code';`
     var query13 = `select count(id) as counter from payment_request where status = 'interested' and type = 'source_code';`
     var query14 = `select count(id) as counter from payment_request where status = 'recall' and type = 'source_code';`
     var query15 = `select count(id) as counter from payment_request where status = 'dnp' and type = 'source_code';`
     var query16 = `select count(id) as counter from payment_request where status = 'reminder_sent' and type = 'source_code';`
     var query17 = `select count(id) as counter from payment_request where status = 'success' and type = 'source_code';`


     
// Project Report Overview
     
var query18 = `select count(id) as counter from btech_project where status = 'pending';`
var query19 = `select count(id) as counter from btech_project where status = 'interested';`
var query20 = `select count(id) as counter from btech_project where status = 'recall';`
var query21 = `select count(id) as counter from btech_project where status = 'dnp';`
var query22 = `select count(id) as counter from btech_project where status = 'reminder_sent';`
var query23 = `select count(id) as counter from btech_project where status = 'success';`

     
     pool.query(query+query1+query2+query3+query4+query5+query6+query7+query8+query9+query10+query11+query51+query12+query13+query14+query15+query16+query17+query18+query19+query20+query21+query22+query23
      ,(err,result)=>{
      if(err) throw err;
      else res.render(`${folder}/blogDashboard`,{result});
     })
    
})



cron.schedule('0 2 * * *', async () => {
  console.log("🌙 [CRON] Starting blog generation at 2:00 AM...");
  try {
    await generateSourceCodeBlog();
    console.log("✅ Blog generated and saved successfully.");
  } catch (err) {
    console.error("❌ Blog generation failed:", err.message);
  }
}, {
  timezone: 'Asia/Kolkata' // Optional: ensure it's aligned with IST
});



async function generateSourceCodeBlog() {
  try {
    const [rows] = await queryAsync1("SELECT * FROM blog_topics WHERE published = 0 and category = 'project_report' LIMIT 1");
   console.log('rews without array',rows.topic)
   
  

    if (rows.length === 0) {
      console.log("🎯 No unpublished topics available.");
      return;
    }
    console.log("row",rows)

    const topic = rows.topic;
    const demolink = rows.link;
    const id = rows.id;
    const project_details = rows.project_details;
    const tech_stack = rows.tech_stack;
    const category = rows.category;


   

const blogPrompt = `You are an expert blog content strategist and writer with 15+ years of experience specializing in viral educational and technical content. Act as a high-performing content generator for FileMakr.com—a platform that provides source code, project reports, dissertations, synopses, and PowerPoint presentations for final-year students worldwide (BCA, MCA, B.Tech, M.Tech, BSc, MSc, Diploma).


Your task is to write a **fully optimized, viral blog article in pure HTML format** that convinces final-year students to download a specific project by showing its technical value, ease of implementation, academic scoring potential, and how it simplifies their final year stress using semantic SEO-friendly markup. Use proper HTML tags such as <h1>, <h2>, <p>, <ul>, <img>, <a>, etc., to structure the content professionally. 

Make sure the output is clean, directly renderable HTML with:
- Only one <h1> for the main title
- Use of <h2> for main sections
- Use of <p> for paragraphs
- <strong> for emphasis
- Responsive image tags for screenshots and diagrams
- CTA buttons styled using <a> with class="cta-button" for downloads
- Internal links using <a href="">
- Include SEO meta title and meta description as comments at the top

Do NOT include markdown or pseudo formatting—only real HTML.

---

### 🔑 Input Variables:

- **Blog Title:** ${topic}
- **Demo URL (optional):** ${demolink}
- **Project Details (optional):** ${project_details}
- **Tech Stack (optional):** ${tech_stack}
- **Source Code Cost (optional):** ₹99
- **Pre Defined Project Report (optional):** ₹10
- **Pre Defined Project Report with more diagrams (optional):** ₹49
- **Customized Project Report:** ₹149
- **Customized Project Report with plagiarism Free (optional):** ₹299
- **All Reports Follow IEEE Standard (optional):** ₹299
-** Source Code + Basic Report = ₹109 only!


- ** Important Note - 

Not Show Source Code + Basic Report = ₹99 only! because it's 109
Notification , Payment Gateway , Email and OTP Verficiation and other advances features not included because it's academic project so don't mention it
This project comes not with  code comments
The package does not includes viva questions and suggested answers



---

### 🎯 Content Strategy Rules to Follow:

#### 1. 🎣 Emotional Hook Strategy (choose ONE hook randomly per blog):
Use **one** of the following emotional content hooks at the top (do NOT use the same one repeatedly):

- “I completed my final-year project in just 3 days using this code.”
- “This project saved me from backlog—here’s how.”
- “I had zero coding experience, but this project got me full marks.”
- “1000+ students already submitted this same code successfully.”
- “This ₹109 package helped me crack my internal review with ease.”
- “I didn’t even open my laptop for 2 weeks—and still topped my final project!”
- “If your deadline is 72 hours away, this is your best shot.”
- “Toppers in my college are using this exact project for 2025.”
- “How I avoided rejection during project submission with this simple trick.”

Always rotate between these hooks to maintain freshness and boost CTRs.

;

#### 2. 📚 Blog Format
Choose the format based on the topic:
- **How-To Guide** – Step-by-step building the app
- **Case Study** – Real student journey
- **Ultimate Guide** – Cover everything from tech to submission

#### 3. 🧠 Headline & SEO
- Title should be 55–65 characters, with keywords + emotion
- Include **meta title** and **meta description**
- Use **keyword clustering** (e.g., MERN + final year + project report)
- Insert **internal links** to other FileMakr projects/tools
- Use FAQs with schema where possible

#### 4. 🧱 Structure, Visuals & Specificity
- Short paras (2–3 lines)
- Use **H2/H3s** for flow
- Add **UI screenshots (desktop + mobile)**, **GIF of task creation**
- Use **specific tech terms**, e.g.,:
  - "Use React Hooks for dynamic task states"
  - "Secure backend with Express and JWT"
  - "MongoDB + Mongoose for real-time task data"

#### 5. ✅ Social Proof & Testimonials
Include a **realistic student story/testimonial**
Generate a unique and realistic testimonial each time from a different student in a different college and city. Vary names, colleges (NIT, VIT, DTU, NSUT, etc.), programs (BCA, B.Tech CSE, MCA, etc.), and experiences (viva success, placement help, project explanation, code demo, etc.).
Use a natural tone and include 1–2 specific outcomes, e.g., viva marks, professor praise, placement results, etc

#### 6. 🚀 CTA Strategy
- Clearly separate **Demo URL** (preview only) and **Download Link** (source code + report)
- Clarify if:
  - The **download is ** (e.g., ₹99 only)
  - The **user must enter their email**
- Use **one final CTA block** (e.g., “Download Source Code + Report Now for ₹99”)

#### 7. 🧠 Psychological Triggers
Include:
- **FOMO/urgency** – "Don’t wait until the last week"
- **Tribal identity** – "Every MCA student needs this project"
- **Reciprocity** – “Free demo, only ₹99 for the full package”
- **Novelty** – “Unlike typical to-do apps, this is fully responsive with JWT login and MongoDB storage”

---

### 🧾 Output Format:

Slug Url - for seo friendly-url

1. **SEO-Optimized Title**  
2. **Meta Title & Meta Description**  
3. **Intro** (hook + CTA teaser)  
4. **Main Body**  
   - H2: What Makes This Project Technically Impressive  
   - H2: Step-by-Step Overview of How It Works  
   - H2: See the App in Action (Demo URL with screenshot/GIF references)  
   - H2: Student Success Story/Testimonial  
   - H2: Why It’s Perfect for Your Final Year Submission  
5. **Download CTA Section**  
   - Cost (₹99 or Free)  
   - Whether email is required  
   - Download now button/CTA  
6. **Quick Checklist / Recap (optional)**  
7. **Internal Links + Final FAQ**

---

Now, generate the **complete blog article** with real content (no placeholders or instructions). Use emotionally engaging language, real student tone, and developer-specific terms that appeal to final-year B.Tech, MCA, and BCA students under pressure.

Let’s begin.
`;


     



        const blogResponse = await openai.chat.completions.create({
      model: "gpt-4.1", // or "gpt-4.1" if you are 100% sure it's supported
      temperature: 0.7,
      frequency_penalty: 0.2,
      presence_penalty: 0.2,
      messages: [
        {
          role: 'system',
          content: 'You are an expert technical content strategist and SEO blog writer with 15+ years of experience. Write in a human-like, emotionally engaging, technically accurate tone for final-year students. Never write outlines or placeholders—always generate complete content.'
        },
        {
          role: 'user',
          content: blogPrompt
        }
      ]
    });

    const content = blogResponse.choices[0].message.content.trim();

    // ✅ Step 2: Generate the meta title and description using the blog content
    // const metaPrompt = `Extract only the SEO-optimized title and a 150-character meta description from the following blog content:\n\n"${content}"\n\nReturn both clearly labeled as:\nTitle: <title here>\nDescription: <meta description here>`;

const metaPrompt = `
You are an expert SEO copywriter. Your task is to extract:

1. An SEO-optimized <title> (max 60 characters) using emotional and keyword-rich phrasing.
2. A compelling <meta description> (max 150 characters) that increases CTR and summarizes the blog.
3. A list of 5–10 meta <keywords> relevant to the blog topic, targeting high-volume search phrases.
4. A list of 5–10 SEO tags (hashtags or blog tags) suitable for content categorization and discovery.
2. A compelling <meta abstract> (max 150 characters) that increases CTR and summarizes the blog.
5. 

Respond in the format:
Title: <your title here>
Description: <your meta description here>
Keywords: <comma-separated keyword list>
Tags: <comma-separated tag list>
Asbtract: <your meta abstract here>

Blog Content:
${content}
`;
    
    const metaResponse = await openai.chat.completions.create({
      model: "gpt-4.1",
      temperature: 0.7,
      
frequency_penalty: 0.2,
      presence_penalty: 0.2,
      messages: [
        {
          role: 'system',
          content: 'You are an SEO expert. Write compelling meta titles and meta descriptions optimized for Google, targeting final-year students searching for projects online.'
        },
        {
          role: 'user',
          content: metaPrompt
        }
      ]
    });

    const metaRaw = metaResponse.choices[0].message.content.trim();



  let metaTitle = '', metaDesc = '', metaKeywords = '', metaTags = '', metaAbstract;

if (metaRaw.includes('\n')) {
  const lines = metaRaw.split('\n');

  metaTitle = lines.find(l => l.toLowerCase().startsWith('title:'))?.replace(/^Title:\s*/i, '').trim() || '';
  metaDesc = lines.find(l => l.toLowerCase().startsWith('description:'))?.replace(/^Description:\s*/i, '').trim() || '';
  metaKeywords = lines.find(l => l.toLowerCase().startsWith('keywords:'))?.replace(/^Keywords:\s*/i, '').trim() || '';
  metaTags = lines.find(l => l.toLowerCase().startsWith('tags:'))?.replace(/^Tags:\s*/i, '').trim() || '';
  metaAbstract = lines.find(l => l.toLowerCase().startsWith('abstract:'))?.replace(/^Abstract:\s*/i, '').trim() || '';

}

if (!metaTitle || !metaDesc) {
  console.warn("Meta title or description missing. Using fallback.");
  metaTitle = topic;
  metaDesc = "Explore this final-year project built using " + (tech_stack || "latest technologies") + " with source code and report available.";
}

// Optional fallback for keywords and tags
if (!metaKeywords) {
  metaKeywords = `${topic}, final year project, ${tech_stack || 'project ideas'}, source code`;
}
if (!metaTags) {
  metaTags = `#${topic.replace(/\s+/g, '').toLowerCase()}, #finalyearproject, #${(tech_stack || 'technology').toLowerCase()}`;
}

if (!metaAbstract) {
  metaAbstract = "Explore this final-year project built using " + (tech_stack || "latest technologies") + " with source code and report available.";
}

       const slug = slugify(topic, { lower: true, strict: true });

    await queryAsync1(
      `INSERT INTO blogs (title, slug, content, meta_title, meta_description, created_at,category,thumbnail_url,meta_keywords,tags,meta_abstract) VALUES (?, ?, ?, ?, ?, NOW(),'${category}',null,?,?,?)`,
      [topic, slug, content, metaTitle, metaDesc, metaKeywords, metaTags, metaAbstract]
    );

    await queryAsync1("UPDATE blog_topics SET published = 1 WHERE id = ?", [id]);

    console.log(`Blog on "\${topic}" posted with slug "/blog/\${slug}`);
    console.log('continue with next blog')
// generateSourceCodeBlog()


  } catch (error) {
    console.error(" Error in generateAndPostBlog:", error.message);
  }
}



// generateSourceCodeBlog()




async function generateYouTubeBlog(youtube_title,youtube_link,youtube_script,thumbnail_url,category) {
  try {
   

     

const blogPrompt = `
You are an **elite SEO Blog Strategist and Writer** with **15+ years of demonstrable success** in creating **viral, highly-engaging educational content**. You are now a dedicated content partner for **FileMakr.com**, the **foremost platform** empowering final-year students with indispensable practical knowledge, cutting-edge project tips, and vital technical inspiration.

Your primary mission is to craft a **fully optimized, high-conversion blog post in pure, render-ready HTML format** designed to amplify the reach and impact of a specific FileMakr YouTube video. Crucially, these blogs are **purely educational and never promotional for products**. Their singular purpose is to **maximize inbound traffic to the associated YouTube video**, **dominate search engine discoverability for relevant student queries**, and **cultivate profound audience trust and enduring engagement**.

The blog content will be dynamically generated using the following essential variables:

---

### 📥 Input Variables:

- **YouTube Title**: ${youtube_title} (The exact title of the YouTube video)
- **YouTube Script (Transcript/Summary)**: ${youtube_script} (A comprehensive transcript or well-summarized version of the video's content, providing the core information)
- **YouTube Video Link**: ${youtube_link} (The direct URL to the YouTube video)
- **YouTube Thumbnail URL**: ${thumbnail_url} (The direct URL to the video's thumbnail image)

---

### 🔥 Blog Core Objectives (Prioritized):

1.  **Explosive YouTube Engagement & Discovery**: Drive a significant volume of highly-qualified traffic from search engines to the YouTube video, leading to increased views, watch time, and subscriber growth.
2.  **Unquestionable Value Proposition**: Articulate the critical value of the video specifically for final-year B.Tech, MCA, and BCA students, addressing their unique pain points and aspirations.
3.  **Deep Emotional Resonance & Action**: Employ sophisticated psychological triggers and empathetic language to compel students to immediately watch the video, actively comment, and subscribe to the FileMakr channel.

---

### ✅ Output Requirements:

You **must** produce clean, semantic, and **100% valid HTML5** code, strictly adhering to the following structure and content guidelines. **No markdown outside the HTML content itself.**

1.  **Slug URL**: A highly SEO-friendly, concise URL derived directly from the YouTube video title. (e.g., "<p>Slug: /your-seo-friendly-slug-here</p>" - This is for your internal processing, not part of the final HTML blog body).
2.  **Meta Title & Meta Description**: Outputted as HTML comments at the absolute top of the document. The Meta Title must be a highly optimized version of the YouTube title. The Meta Description must be a compelling, keyword-rich snippet extracted or carefully crafted from the introduction or first paragraph.
3.  **H1 Headline**: Exactly one <h1> tag. It must be the **exact YouTube Title** provided in the input.
4.  **Introductory Paragraph**: A concise, emotionally resonant hook (max 2-3 sentences) that immediately addresses a student pain point. This must be followed by an invitation to watch the video for the solution. **Crucially, immediately embed the video thumbnail using an <img> tag within this section, linked to the YouTube video.**
5.  **Video Thumbnail <img> Tag**: Utilize the provided ${thumbnail_url}. The alt attribute must be highly descriptive and SEO-optimized, reflecting the video's content. It should be placed right after the introductory paragraph.
6.  **<h2> Video Highlights**: Title this section "Video Highlights" or "Key Takeaways from This Video". Provide **3-5 highly compelling, concise bullet points (<li> within <ul>)** summarizing the most impactful insights, tips, or solutions presented in the video. These points should serve as strong hooks.
7.  **<h2> Why This Video is a Must-Watch for You**: Title this section to directly appeal to the target audience (e.g., "Why Every Final-Year Student Needs to Watch This Now" or "Your Secret Weapon for Final-Year Success"). This section must articulate **at least 3-4 profound emotional and technical benefits** for specific student segments (e.g., overwhelmed final-year students, confused freshers, those struggling with project ideas, aspiring developers). Focus on problem-solution and aspirational outcomes.
8.  **<h2> Watch the Full Video on YouTube**: Title this section clearly as "Watch the Full Video on YouTube" or "Dive Deeper: Watch Now on YouTube". Embed the YouTube video using a responsive <iframe> tag. Ensure it's correctly sourced from ${youtube_link}.
9.  **<h2> More Essential Content from FileMakr**: Title this section to encourage further exploration (e.g., "Don't Stop Here: Explore More FileMakr Resources" or "Continue Your Journey with FileMakr"). Provide **2-3 internal links (<a> tags)** to other highly relevant FileMakr blog articles, tools, or project ideas. Examples: https://filemakr.com/source-code/php, https://filemakr.com/final-year-project-ideas, https://filemakr.com/final-year-project-ideas https://filemakr.com/btech-final-year-project-report. Ensure these links use absolute paths relative to FileMakr.com.
10. **<h2> Final Year Student FAQs (or specific topic FAQs)**: Title this section to clearly indicate its content (e.g., "Your Top Questions Answered: Final Year FAQs" or "FAQs on [Video Topic]"). Include **3-5 high-value, frequently asked questions (<h3> for the question,<p> for the answer)** directly related to the video's topic or broader final-year student challenges. Answers should be concise and helpful.

---

### 🧠 Style & Tone Guide:

-   **Semantic HTML**: Strictly use appropriate HTML5 tags (<h1>, <h2>, <h3>, <p>, <ul>, <li>, <a>, <img>, <iframe>,<strong>).
-   **Tone**: Maintain a consistently **friendly, highly educational, powerfully motivating, and genuinely stress-relieving** tone. Empathy for student struggles is paramount.
-   **Scannability**: Each paragraph **must not exceed 2-3 lines**. Use short, impactful sentences. Employ bullet points (<ul>, <li>) for lists.
-   **Emphasis**: Use the <strong> tag **judiciously** for key emphasis on crucial terms or phrases that drive home the message.
-   **No Markdown/Instructions**: Your output must be **pure HTML**. Do not include any markdown formatting *within* the generated HTML content, nor any template instructions or comments that are not valid HTML comments for meta tags.
-   **Authentic Language**: Integrate **real development terms, industry jargon where appropriate, and directly address common "final-year pressure" pain points** (e.g., "project anxiety," "placement worries," "coding roadblocks").
-   **Psychological Triggers**: Subtly weave in triggers such as **Fear Of Missing Out (FOMO)** on vital information, a sense of **Urgency** to act, build **Credibility** for FileMakr, and foster a strong sense of **Community** among students.
-   **Call to Action (CTA)**: The **sole CTA** throughout the blog post is "Watch Now on YouTube" or similar variations that unequivocally direct users to the video. **Absolutely no product promotion or sales language.**

---

Now, acting as the expert SEO strategist, generate the **complete, highly optimized, and viral blog post in pure HTML format** using the provided YouTube input data. Your goal is to make this post so irresistibly engaging and helpful that students not only watch the video but also feel compelled to share it and subscribe to FileMakr.
`;


     



        const blogResponse = await openai.chat.completions.create({
      model: "gpt-4.1", // or "gpt-4.1" if you are 100% sure it's supported
      temperature: 0.7,
      frequency_penalty: 0.2,
      presence_penalty: 0.2,
      messages: [
        {
          role: 'system',
          content: 'You are an expert technical content strategist and SEO blog writer with 15+ years of experience. Write in a human-like, emotionally engaging, technically accurate tone for final-year students. Never write outlines or placeholders—always generate complete content.'
        },
        {
          role: 'user',
          content: blogPrompt
        }
      ]
    });

    const content = blogResponse.choices[0].message.content.trim();

    // ✅ Step 2: Generate the meta title and description using the blog content
    // const metaPrompt = `Extract only the SEO-optimized title and a 150-character meta description from the following blog content:\n\n"${content}"\n\nReturn both clearly labeled as:\nTitle: <title here>\nDescription: <meta description here>`;

const metaPrompt = `
You are an expert SEO copywriter. Your task is to extract:

1. An SEO-optimized <title> (max 60 characters) using emotional and keyword-rich phrasing.
2. A compelling <meta description> (max 150 characters) that increases CTR and summarizes the blog.
3. A list of 5–10 meta <keywords> relevant to the blog topic, targeting high-volume search phrases.
4. A list of 5–10 SEO tags (hashtags or blog tags) suitable for content categorization and discovery.
2. A compelling <meta abstract> (max 150 characters) that increases CTR and summarizes the blog.
5. 

Respond in the format:
Title: <your title here>
Description: <your meta description here>
Keywords: <comma-separated keyword list>
Tags: <comma-separated tag list>
Asbtract: <your meta abstract here>
slug : <you slug url here> (Do not use '/' before url)

Blog Content:
${content}
`;
    
    const metaResponse = await openai.chat.completions.create({
      model: "gpt-4.1",
      temperature: 0.7,
      
frequency_penalty: 0.2,
      presence_penalty: 0.2,
      messages: [
        {
          role: 'system',
          content: 'You are an SEO expert. Write compelling meta titles and meta descriptions optimized for Google, targeting final-year students searching for projects online.'
        },
        {
          role: 'user',
          content: metaPrompt
        }
      ]
    });

    const metaRaw = metaResponse.choices[0].message.content.trim();



  let metaTitle = '', metaDesc = '', metaKeywords = '', metaTags = '', metaAbstract = '' , slug = ''; 

if (metaRaw.includes('\n')) {
  const lines = metaRaw.split('\n');

  metaTitle = lines.find(l => l.toLowerCase().startsWith('title:'))?.replace(/^Title:\s*/i, '').trim() || '';
  metaDesc = lines.find(l => l.toLowerCase().startsWith('description:'))?.replace(/^Description:\s*/i, '').trim() || '';
  metaKeywords = lines.find(l => l.toLowerCase().startsWith('keywords:'))?.replace(/^Keywords:\s*/i, '').trim() || '';
  metaTags = lines.find(l => l.toLowerCase().startsWith('tags:'))?.replace(/^Tags:\s*/i, '').trim() || '';
  metaAbstract = lines.find(l => l.toLowerCase().startsWith('abstract:'))?.replace(/^Abstract:\s*/i, '').trim() || '';
  slug = lines.find(l => l.toLowerCase().startsWith('slug:'))?.replace(/^slug:\s*/i, '').trim() || '';


}

if (!metaTitle || !metaDesc) {
  console.warn("Meta title or description missing. Using fallback.");
  metaTitle = youtube_title;
  metaDesc = youtube_title;
}

// Optional fallback for keywords and tags
if (!metaKeywords) {
  metaKeywords = youtube_title;
}
if (!metaTags) {
  metaTags = youtube_title;
}

if (!metaAbstract) {
  metaAbstract = youtube_title;
}



    await queryAsync1(
      `INSERT INTO blogs (title, slug, content, meta_title, meta_description, created_at,category,thumbnail_url,meta_keywords,tags,meta_abstract) VALUES (?, ?, ?, ?, ?, NOW(),'${category}','${thumbnail_url}',?,?,?)`,
      [youtube_title, slug, content, metaTitle, metaDesc, metaKeywords, metaTags, metaAbstract]
    );

    // await queryAsync1("UPDATE blog_topics SET published = 1 WHERE id = ?", [id]);

    console.log(`Blog on "\${topic}" posted with slug "/blog/\${slug}`);

  } catch (error) {
    console.error(" Error in generateAndPostBlog:", error.message);
  }
}




router.post('/youtube/add', async (req, res) => {
  try {
    const {
      category,
      youtube_title,
      youtube_link,
      youtube_script,
      youtube_thumbnail
    } = req.body;

    // Validate inputs (optional but recommended)
    if (!youtube_title || !youtube_link || !youtube_script || !youtube_thumbnail || !category) {
      return res.status(400).json({ message: "All fields are required." });
    }

    // Call your blog generation logic
    const result = await generateYouTubeBlog(
      youtube_title,
      youtube_link,
      youtube_script,
      youtube_thumbnail,
      category
    );

    return res.status(200).json({
      message: "Blog generated successfully!",
      data: result
    });

  } catch (error) {
    console.error("Error in /youtube/add:", error);
    return res.status(500).json({ message: "Internal server error." });
  }
});





router.get('/publish-blog/:id', async (req, res) => {
  const postId = req.params.id;

  try {
    // Fetch blog from MySQL using pool2
    const rows = await queryAsync1('SELECT * FROM blogs WHERE id = ?', [postId]);
    console.log('rows',rows)
    if (!rows.length) return res.status(404).send('Blog post not found');

    const post = rows[0];

    const octokit = new Octokit({ auth: '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' });

    // Convert content to Markdown
const markdownContent = `---
layout: post
title: "${post.meta_title}"
date: "${new Date(post.created_at).toISOString().replace('T', ' ').replace('Z', ' +0000')}"
description: "${post.meta_description || ''}"
tags: [${post.tags ? post.tags.split(',').map(tag => `"${tag.trim()}"`).join(', ') : ''}]
category: "${post.category || 'General'}"
slug: "${post.slug || post.id}"
keywords: [${post.meta_keywords ? post.meta_keywords.split(',').map(meta_keywords => `"${meta_keywords.trim()}"`).join(', ') : ''}]

# Open Graph Metadata
og_title: "${post.title}"
og_description: "${post.meta_description || ''}"
og_url: "https://filemakr.github.io/blog/${post.slug || post.id}"
og_type: "article"
og_image: "${post.thumbnail_url || ''}"

# Twitter Card Metadata
twitter_card: "summary_large_image"
twitter_title: "${post.title}"
twitter_description: "${post.meta_description || ''}"
twitter_image: "${post.thumbnail_url || ''}"
twitter_site: "@filemakr"
---

${htmlToMarkdown(post.content)}
`;



    const filePath = `_posts/${new Date(post.created_at).toISOString().split('T')[0]}-${post.slug || post.id}.md`;

    // Push to GitHub
    const response = await octokit.repos.createOrUpdateFileContents({
      owner: 'Filemakr',
      repo: 'blog',
      path: filePath,
      message: `Add new blog post: ${post.title}`,
      content: Buffer.from(markdownContent).toString('base64'),
      branch: 'main',
      committer: {
        name: 'AutoPoster Bot',
        email: 'bot@example.com'
      },
      author: {
        name: 'AutoPoster Bot',
        email: 'bot@example.com'
      }
    });

    res.send(`✅ Blog pushed to GitHub: ${response.data.content.path}`);
  } catch (err) {
    console.error(err);
    res.status(500).send('Something went wrong');
  }
});


const axios = require('axios');
const xml2js = require('xml2js');

const SITEMAP_URL = 'https://www.filemakr.com/sitemap.xml';

async function generateNonBlogSitemapJson() {
  try {
    const response = await axios.get(SITEMAP_URL);
    const xml = response.data;

    const parser = new xml2js.Parser();
    const result = await parser.parseStringPromise(xml);

    const urls = result.urlset.url.map(entry => entry.loc[0]);
    
    // ❌ Exclude all blog URLs
    const otherUrls = urls.filter(url => !url.includes('/blog/'));

    const urlMap = {};
    otherUrls.forEach(url => {
      const slug = url.replace(/^https:\/\/www\.filemakr\.com\/|\/$/g, ''); // remove base and trailing slash
      urlMap[slug] = url;
    });

    fs.writeFileSync('sitemap-non-blogs.json', JSON.stringify(urlMap, null, 2));
    console.log('✅ sitemap-non-blogs.json generated successfully');

  } catch (error) {
    console.error('❌ Failed to generate non-blog sitemap:', error.message);
  }
}

// generateNonBlogSitemapJson();


function generateCorrectMtechDownloadUrl(slug) {
  if (!slug.includes('mtech')) return null; // Not an M.Tech project

  // Step 1: Remove everything from "-mtech" onwards
  const cleanSlug = slug.split('-mtech')[0];

  // Step 2: Format the final URL
  const correctUrl = `https://filemakr.com/mtech-final-year-project-report-${cleanSlug}`;

  return correctUrl;
}

async function correctBlogContentLinks(blogId, content, slug, topic, blogSlugMap) {
  try {
    const downloadUrl = generateCorrectMtechDownloadUrl(slug);
    const linkFixPrompt = `
You are a professional HTML fixer for SEO-optimized student blogs.

You are provided:
- A blog's full HTML content
- A JSON map of correct blog slugs → URLs

Your tasks:
1. In the section titled "<h2>See the App in Action</h2>" or similar:
   - Change the heading to:
     <h2>See the Sample Project Report</h2>
   - Replace any demo or live demo <a href> URLs with:
     https://online.visual-paradigm.com/share/book/sample-project-report-1uzumhkivv
   - Remove any <img> tags, screenshot GIFs, or visual references in this section only

2. Fix all internal <a href> links to other blogs using the SLUG MAP provided.

3. If any referenced topic is NOT in the SLUG MAP, replace it with a valid random blog URL from the list.

4. Replace any broken or placeholder download links like "#download", "#section", "download-now", or "#download-section" with the corrected url:
   ${downloadUrl}

Preserve all visible text elsewhere. Only change:
- <h2>See the App in Action</h2> → <h2>See the Sample Project Report</h2>
- Demo <a> URLs
- Remove <img> tags in this section
- Internal blog hrefs
- Broken download links

---
BLOG SLUG: ${slug}
TOPIC: ${topic}
SLUG MAP: ${JSON.stringify(blogSlugMap)}
CONTENT:
${content}
---
Return only the updated full HTML content. No explanation.
`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4.1',
      temperature: 0.3,
      messages: [
        {
          role: 'system',
          content: 'You are an expert in HTML SEO blog repair. Only fix href attributes and headings/images as instructed. Preserve structure and visible text.',
        },
        {
          role: 'user',
          content: linkFixPrompt,
        },
      ],
    });

    const fixedContent = response.choices[0].message.content.trim();
    return fixedContent;
  } catch (error) {
    console.error(`❌ Error fixing blog ID ${blogId}:`, error.message);
    return null;
  }
}




async function getBlogSlugMapFromSitemap() {
  try {
    const raw = fs.readFileSync('sitemap-non-blogs.json', 'utf-8');
    const blogSlugMap = JSON.parse(raw);
    console.log(`✅ Loaded ${Object.keys(blogSlugMap).length} blog URLs from sitemap-blogs.json`);
    return blogSlugMap;
  } catch (error) {
    console.error('❌ Failed to load sitemap-blogs.json:', error.message);
    return {};
  }
}

async function autoFixAllBlogs(blogPassId) {
  const blogSlugMap = await getBlogSlugMapFromSitemap();
  if (Object.keys(blogSlugMap).length === 0) {
    console.warn("⚠️ No blog URLs found. Aborting.");
    return;
  }

  try {
    const blogs = await queryAsync1(`
  SELECT id, slug, title, content 
  FROM blogs 
  WHERE id = ${blogPassId}
`);
    console.log(`🔎 Processing ${blogs.length} blogs...\n`);

    for (const blog of blogs) {
      console.log(`🔧 Fixing blog ID ${blog.id} (${blog.slug})...`);
      const updatedContent = await correctBlogContentLinks(blog.id, blog.content, blog.slug, blog.title, blogSlugMap);

      if (updatedContent && updatedContent !== blog.content) {
        await queryAsync1('UPDATE blogs SET content = ? WHERE id = ?', [updatedContent, blog.id]);
        console.log(`✅ Blog ${blog.slug} updated.\n`);
      } else {
        console.log(`⏭️ No changes made to blog ${blog.slug}.\n`);
      }
    }

    console.log('🎉 All blog content processed.');

  } catch (err) {
    console.error('🔥 DB Operation Failed:', err.message);
  }
}

// autoFixAllBlogs();

router.post('/blogFix', async (req, res) => {
  let blogPassId = req.body.id;
  let fix = await autoFixAllBlogs(blogPassId); // your logic
  res.json({ msg: 'fix' });
});
module.exports = router;
