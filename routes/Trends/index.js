const express = require('express');
const router = express.Router();
var pool = require('../pool');
const cron = require('node-cron');
const googleTrends = require('google-trends-api');
const slugify = require('slugify');
const sanitizeHtml = require('sanitize-html');
const { OpenAI } = require('openai');
require('dotenv').config();


function queryAsync(sql, params) {
  return new Promise((resolve, reject) => {
    pool.query(sql, params, (err, results) => {
      if (err) reject(err);
      resolve(results);
    });
  });
}


const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const DEBUG_TRENDS = true;           // set to false in prod
const ALLOW_FALLBACK = false;        // force real topics only while testing
const RECENT_DAYS = 5;               // was 7/14; shorter to avoid over-pruning

function logDebug(label, payload) {
  if (!DEBUG_TRENDS) return;
  try {
    console.log(`[debug:${label}]`, Array.isArray(payload) ? `len=${payload.length}` : payload);
  } catch { /* noop */ }
}


// --- AdSense safety: blocklists / allowlists
const BLOCKED_KEYWORDS = [
  // Politics & elections
  'election','president','prime minister','pm','senate','parliament','polls','vote','campaign','democrat','republican','tory','labour','conservative','brexit',
  // Violence / war / crime / tragedy
  'war','terror','attack','shooting','gun','bomb','missile','israel','gaza','hamas','hezbollah','ukraine','russia','nuclear',
  'murder','kidnap','assault','riot','protest','genocide','suicide','overdose','earthquake','flood','disaster','plane crash',
  // Adult / unsafe for ads
  'porn','sex','nsfw','nudity','onlyfans',
  // Medical / sensitive YMYL (broad health claims)
  'cancer','covid','covid-19','vaccine','vaccination','diabetes','heart attack','depression','anxiety','therapy','drug','medicine','surgery',
  // Hate/harassment/illegal
  'racist','hate','slur','nazi','extremist','isis','kkk','illegal','piracy','torrent'
];

const ALLOWED_THEMES_HINTS = [
  // Safer, monetizable themes
  'technology','apps','smartphone','iphone','android','ai','gaming','ps5','xbox','steam','entertainment','movies','netflix','prime video',
  'music','sports','football','premier league','nba','mlb','nfl','cricket','how to','guide','tips','best','review','comparison',
  'education','careers','interview','resume','productivity','software','startups','business tools','gadgets','deals','discount'
];


function safeParseTrends(raw, label='') {
  if (!raw || typeof raw !== 'string') { console.warn(`[trends] empty raw for ${label}`); return null; }
  const trimmed = raw.trim();
  if (trimmed.startsWith('<')) { // HTML (rate limit / redirect / WAF)
    console.warn(`[trends] HTML response for ${label} (likely rate-limited)`);
    return null;
  }
  try { return JSON.parse(trimmed); }
  catch (e) { console.warn(`[trends] JSON.parse failed for ${label}:`, e.message); return null; }
}

async function fetchDaily(geo, hl='en-US') {
  try {
    const raw = await googleTrends.dailyTrends({ geo, hl });
    return safeParseTrends(raw, `daily ${geo}`);
  } catch (e) {
    console.warn(`[trends] dailyTrends error ${geo}:`, e.message);
    return null;
  }
}

async function fetchRealtime(geo, hl='en-US', category='all') {
  try {
    const raw = await googleTrends.realTimeTrends({ geo, hl, category });
    return safeParseTrends(raw, `realtime ${geo}`);
  } catch (e) {
    console.warn(`[trends] realTimeTrends error ${geo}:`, e.message);
    return null;
  }
}

function normalizeTrends(daily, realtime) {
  const out = [];

  // daily
  const days = daily?.default?.trendingSearchesDays || [];
  if (Array.isArray(days) && days[0]?.trendingSearches) {
    for (const t of days[0].trendingSearches) {
      out.push({
        title: t?.title?.query || '',
        traffic: parseTraffic(t?.formattedTraffic),
        related: (t?.relatedQueries || []).map(r => r?.query).filter(Boolean)
      });
    }
  }

  // realtime
  const stories = realtime?.storySummaries?.trendingStories || [];
  for (const s of stories) {
    const entityNames = (s?.entityNames || []).filter(Boolean);
    const title = entityNames[0] || s?.title || '';
    out.push({
      title,
      traffic: 0,
      related: entityNames
    });
  }

  return out;
}






// Quick keyword checks
function isBlocked(text) {
  const s = (text || '').toLowerCase();
  return BLOCKED_KEYWORDS.some(k => s.includes(k));
}
function looksAllowed(text, related = []) {
  const blob = [text, ...(related || [])].join(' ').toLowerCase();
  return ALLOWED_THEMES_HINTS.some(k => blob.includes(k));
}

// Parse “formattedTraffic” like “200K+”
function parseTraffic(ft) {
  if (!ft) return 0;
  const m = String(ft).match(/([\d.]+)\s*([kKmMbB+]?)/);
  if (!m) return 0;
  let n = parseFloat(m[1] || 0);
  const u = (m[2] || '').toLowerCase();
  if (u.startsWith('k')) n *= 1e3;
  else if (u.startsWith('m')) n *= 1e6;
  else if (u.startsWith('b')) n *= 1e9;
  return n;
}

// Check if topic was used recently (e.g., last 14 days)
async function usedRecently(pool, title, days = 14) {
  const [rows] = await queryAsync(
    `SELECT topic FROM used_topics
     WHERE topic = ? AND last_used_at >= (NOW() - INTERVAL ? DAY) LIMIT 1`,
    [title, days]
  );
  console.log('used_topic',rows)

  return rows.length > 0;
}


async function markUsed(pool, title) {
  try {
    await queryAsync(
      `INSERT INTO used_topics (topic) VALUES (?)
       ON DUPLICATE KEY UPDATE last_used_at = NOW()`,
      [title]
    );
  } catch (e) {
    console.warn('markUsed warn:', e.message);
  }
}



// Helper: pick a promising trend topic
// --- Fetch + merge US & UK trends, filter unsafe topics, score & pick one
// npm i axios
const axios = require('axios');

async function fetchTrendingNow(countryCode, timeWindow='past_4_hours',id) {
  // SearchAPI: https://www.searchapi.io/docs/google-trends-trending-now-api
  const url = 'https://www.searchapi.io/api/v1/search';
  const params = {
    engine: 'google_trends_trending_now',
    api_key: process.env.SEARCHAPI_KEY, // <-- set in .env
    location: countryCode,              // 'United States' or 'United Kingdom'
    time: timeWindow     ,
    categories: ["law_and_government", "politics" , "business_and_finance" , "entertainment", "technology"],               // past_4_hours | past_4_hours | past_48_hours | past_7_days
  };

  const { data } = await axios.get(url, { params, timeout: 12000 });

//   console.log('trend data fetch',data.trends[0])

  // Normalize to { title, related[] } similar to your pipeline
  // SearchAPI returns items in "trending_now" array with "title" and "queries"
  const items =  data.trends[id]

  console.log('trend fetch',items)
  return items;
}

async function getHotTopic(id) {
  console.log('[autoblog] using SearchAPI.io for trends (US+UK)...');
  // Fetch in sequence with a small delay to be gentle
  const us = await fetchTrendingNow('US', 'past_4_hours',id).catch(()=>[]);
 return us;
}






// Helper: ask OpenAI to generate a full SEO package
async function generateSEOArticle(topicObj) {
  // === SEO-Optimized Blog Generation Command (US Audience) ===



// const guidelines = `
// You are an expert US SEO news editor writing in 'en-US'.
// Goal: Write a best-in-class, news-style article that can rank on Google and go viral. The article must fully satisfy search intent, explain the topic clearly for everyday readers, and include in-depth analysis presented in a way that feels engaging, shareable, and trustworthy.

// Deliverables:
// 1) meta: {
//    metaTitle (<=60 chars),
//    metaDescription (<=150 chars)
// }
// 2) post: {
//    title (<=70 chars),
//    slug (kebab-case),
//    excerpt (<=160 chars),
//    h1,
//    body_html (formatted with H2/H3, short paragraphs, bullet lists, comparison tables if relevant, a "Key takeaways" box, suggested images with alt text, internal link placeholders [[internal:slug-or-title]], and external credible source placeholders [[source:https://example.gov/...]]),
//    faq (3–5 Q&A, each 40–55 words in clean HTML),
//    tags (5–8 topical tags),
//    word_count 900–1200,
//    thumbnail_url,
//    mid_thumbnail_url
// }
// 3) schema: JSON-LD (valid Article schema.org) including headline, description, author, publisher, logo, image, datePublished, dateModified, keywords, and articleSection.

// SEO Writing Rules:
// - Audience: US readers, general public. Use plain English with culturally relevant US examples.
// - Search Intent: Capture in the **first 60–80 words** with a snippet-friendly answer (informational + investigation intent).
// - Headline: Compelling, keyword-rich, not clickbait.
// - Readability: Grade 7–9, active voice, scannable structure, short paragraphs.
// - Coverage: Answer primary question directly, then explore subtopics, step-by-step checklists, pros/cons tables, examples, and related FAQs.
// - Internal Links: At least 2 placeholders to career/tech/education topics (e.g., [[internal:how-to-build-a-portfolio]], [[internal:best-online-certifications]]).
// - External Sources: Cite at least 2 reputable US sources (.gov, .edu, or major publishers).
// - Media: Suggest 1–3 relevant images with descriptive alt text; include social-friendly thumbnails.
// - Evergreen Style: Make it timeless; only use current trends if they strengthen credibility.
// - PAA Coverage: FAQ must reflect common “People Also Ask” queries on Google.

// JSON-LD Requirements:
// - Use "@type": "Article"
// - Fields: headline, description, mainEntityOfPage, author (Person), publisher (Organization + logo), image, datePublished, dateModified, articleSection (from categories), keywords (from tags).
// - Ensure metadata matches the article content.

// Extra Rule:
// - Include a clear **Disclaimer section** at the bottom of the article:
//   "Disclaimer: This article is intended for informational and educational purposes only. We do not provide legal, financial, or medical advice. The author and this website are not liable for any misuse of the information provided."

// Prohibited:
// - Harmful, misleading, or clickbait content.
// - Medical/financial/legal advice beyond general public knowledge.
// - Keyword stuffing.

// `;

// const topic = topicObj.query; 
// const related = topicObj.keywords?.slice(0, 12) || [];

// const prompt = `
// Topic: "${topic}"
// Primary Keyword: "${topic}"
// Related Keywords: ${related.join(', ') || 'n/a'}
// Categories: ${topicObj.categories}

// Research Plan:
// - Review current Google SERPs for "${topic}" and analyze featured snippets, People Also Ask questions, and trending subtopics.
// - Identify long-tail keyword angles to target for snippet wins.

// Writing Task:
// - Create a viral, news-style SEO package that:
//    • Introduces the topic with a clear, direct answer in the first 60–80 words.  
//    • Explains the full story with structured sections (H2/H3s, bullet points, checklists, comparison tables).  
//    • Adds "Key Takeaways" (3–5 bullets).  
//    • Includes internal and external link placeholders.  
//    • Suggests 1–3 image ideas with descriptive alt text.  
//    • Concludes with a legally protective Disclaimer.  

// - Ensure consistency across title, meta tags, slug, and excerpt.  
// - Deliver only valid JSON in this TypeScript shape:

// {
//   "metaTitle": string,
//   "metaDescription": string,
//   "title": string,
//   "slug": string,
//   "excerpt": string,
//   "h1": string,
//   "body_html": string,
//   "faq": { "q": string, "a_html": string }[],
//   "tags": string[],
//   "thumbnail_url": string,
//   "mid_thumbnail_url": string,
//   "json_ld": object
// }
// `;


// ————— NEWS SEO PROMPT (US ENGLISH) —————
// === News-Optimized Article Generation Prompt ===
// Drop-in replacement for your existing prompt with tighter news SEO,
// stronger structure, clearer evidence rules, and cleaner output schema.

// =========================
// FileMakr Viral News Prompt v2 (US-focused)
// =========================

const guidelines = `
ROLE & AUDIENCE
You are an expert U.S. news & viral trends editor writing in en-US for a 18–40, mobile-first audience.

CORE OUTCOME (NON-NEGOTIABLE)
Deliver a newsroom-grade but social-native, *viral-ready* article package that can rank in Google Top Stories AND pop on TikTok/X/Instagram. Be factual, fast, hook-heavy.

VOICE & STRUCTURE
- Base: Inverted pyramid (who/what/when/where/why/how first).
- Flavor: AP facts + BuzzFeed hooks + Insider storytelling + TikTok caption energy.
- Tone: punchy, memey, culture-aware. No corporate-speak. No academic fluff.
- Sentences: short, skimmable. Front-load verbs, cut filler.
- Headlines: emotional but accurate; curiosity without clickbait lies.

RECENCY & VERIFICATION (MUST DO)
- Browse 3+ authoritative U.S. sources within the last 4 hours (AP, Reuters, NYT, WaPo, WSJ, Bloomberg, NPR, ABC/CBS/NBC, CNN/FOX, major local papers, .gov/.edu).
- If no 0–4h coverage exists, expand to 6–12h *and state this in one line: “Recency note: nearest coverage is X hours old.”*
- Attribute EVERY fact in-line as [[source:Publisher – URL – HH:MM ET]].
- Use exact times + dates with time zones (ET; add PT if helpful).
- Verify key numbers/names/titles twice; prefer wire services for first confirmation.

SEARCH/SEO & VIRAL
- Primary keyword must appear in H1, slug, first 2 sentences, and one H2.
- Add U.S.-centric phrasing (“across the U.S. today,” “in America right now”).
- Build for snippet: answer the top query in ~70 words under “What happened”.
- Hooks: “shocking twist,” “fans can’t stop talking,” “here’s why it hits your wallet,” “wild timeline,” “unexpected flip,” etc.
- Add 2+ internal links in [[internal:slug-here]] format.

ANGLE & FORMAT REQUIREMENTS
- H1 ≤ 70 chars, scroll-stopping but accurate.
- “Updated” line with absolute ET timestamp (and PT if useful).
- H2 blocks in this order:
  1) What happened → ~70 words, concrete lead + spicy hook.
  2) Why it matters → money/rights/safety/experience; *make it personal*.
  3) Context & background → quick history, key players, data, trendline.
  4) What to watch next → crystal-clear dates, hearings, releases, key windows.
- Add a Key Takeaways box (3–5 bullets).
- If tradeoff exists (policy, tech, consumer), add a Pros & Cons table.
- **Image suggestions** as HTML comments with detailed alt text and shot ideas (wide, vertical, cutline hint).
- FAQs: 4–6 “People Also Ask”-style; crisp 40–60 words each.
- End with the **exact** Legal & Editorial Disclaimer (verbatim).

SOCIAL-FIRST FLAVOR CHECKS (SILENT, DO NOT OUTPUT THE CHECKLIST)
- Is there a celebrity/politics/money/consumer-impact hook?
- One tweet-length zinger line included in body.
- 1–2 pop-culture nods max; never force a meme.
- Zero hedging clichés (“reportedly” spam). Use direct attributions.

SAFETY & STYLE GUARDRAILS
- No sensational lies or unverified rumors.
- Respect-labeled quotes; avoid doxxing/private data.
- AP style for names/titles; U.S. dates (Month Day, Year), time with ET.

OUTPUT RULES (STRICT)
- Output ONLY a single JSON object with fields exactly as specified.
- Escape quotes where needed. No backticks, no commentary.
- All citations in body use [[source:...]] format, never footnotes.
- Include “Updated” line inside body_html near the top.
`;

const prompt = `
You are creating a viral-style U.S. news article package per “guidelines”.

INPUTS
Topic: "${topicObj.query}"
Primary keyword: "${topicObj.query}"
Related keywords: ${(topicObj.keywords?.slice(0, 12) || []).join(', ') || 'n/a'}
Categories: ${topicObj.categories}

MANDATORY PRE-WRITE ACTIONS
1) Browse real-time authoritative U.S. sources (aim ≤4h). Gather ≥3 headlines with timestamps + URLs. If only 6–12h exist, add “Recency note” line.
2) Identify the dominant angle U.S. readers are reacting to (money hit, safety risk, celeb drama, political power move, tech wow).
3) Capture top SERP/social questions for FAQs (Google PAA, trending queries phrased for U.S. readers).
4) Choose a viral hook (pick ONE primary: shocking twist / wallet impact / celeb crossover / emotional trigger / “that one chart”).

WRITING TASKS
- Minimum 1,200 words in body_html.
- Lead with “What happened” (≈70 words) that fully answers the news while adding a spicy, shareable hook.
- Use witty H2s like “Why Fans Are Losing It,” “The Bigger Picture,” “Receipts & Context,” “What Happens Next.”
- Sprinkle engaging phrasing (“wild,” “jaw-dropping,” “can’t stop talking”) tastefully—never overdo.
- Include 2+ [[internal:...]] links relevant to U.S. readers.
- Embed exact time stamps in ET (and PT if useful).
- Every concrete fact/number/name gets an inline citation: [[source:Publisher – URL – HH:MM ET]].

IMAGE SUGGESTIONS (IN HTML COMMENTS ONLY)
- Provide 2–3 ideas, each with alt text, recommended framing (wide/vertical), and suggested cutline.

STRICT JSON OUTPUT SCHEMA
Return ONLY:
{
"metaTitle": string, // <= 60 chars
"metaDescription": string, // <= 150 chars
"title": string, // <= 70 chars
"slug": string, // kebab-case, keyword-led
"excerpt": string, // <= 160 chars
"h1": string, // same or close to title
"body_html": string, // min 1,200 words, includes Updated line, H2s, tables, key takeaways, image comments, inline [[source:...]] citations
"faq": [{ "q": string, "a_html": string }], // 4–6 Q&As, each 40–60 words
"tags": string[], // 6–10 topical tags (mirror keywords & categories)
"thumbnail_url": string, // 1200×630 ok
"mid_thumbnail_url": string, // 800×418 ok
"json_ld": object // Valid Article JSON-LD (see below)
}

JSON-LD (Article) REQUIREMENTS
- "@type": "Article"
- "headline" == metaTitle; "description" == metaDescription
- "mainEntityOfPage": canonical placeholder allowed
- "author": { "@type": "Person", "name": "FileMakr" }
- "publisher": {
    "@type": "Organization",
    "name": "FileMakr",
    "logo": { "@type": "ImageObject", "url": "https://res.cloudinary.com/dggf8vl9p/image/upload/v1718627756/filemakr-project-file-creator-favicon_1_dqogst.avif" }
  }
- "image": use thumbnail_url
- "datePublished" & "dateModified": current timestamp in ISO 8601 (ET)
- "articleSection": derive from Categories
- "keywords": mirror tags

LEGAL BLOCK (MUST APPEND VERBATIM AT END OF body_html)
<strong>Legal & Editorial Disclaimer:</strong> This article is for general informational purposes only and does not constitute legal, financial, or professional advice. Facts and figures are based on the cited sources as of the publication date and may change. No warranties are made regarding completeness or accuracy. The publisher and author disclaim any liability for actions taken based on this content. All trademarks and copyrights belong to their respective owners. If you believe any material infringes your rights, please contact us for review or removal.
`;

// Usage in your app: feed `guidelines` + `prompt` + your `topicObj` + `blogUrl` to your OpenAI call.



const resp = await openai.chat.completions.create({
  model: "gpt-5",
  // temperature: 0.7,
  //     frequency_penalty: 0.2,
  //     presence_penalty: 0.2,
  messages: [
    { role: 'system', content: guidelines },
    { role: 'user', content: prompt }
  ]
});
const content = resp.choices?.[0]?.message?.content || '';

console.log('content',content)

const clean = content.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
const pkg = JSON.parse(clean);


const ensureUrl = (val, fallback) =>
  (typeof val === 'string' && /^https?:\/\//i.test(val)) ? val : fallback;

// You can control these via env, or keep these placeholders:
const THUMB_FALLBACK = process.env.THUMBNAIL_PLACEHOLDER_1200 ||
  'https://via.placeholder.com/1200x630.png?text=Thumbnail';
const MID_THUMB_FALLBACK = process.env.THUMBNAIL_PLACEHOLDER_800 ||
  'https://via.placeholder.com/800x418.png?text=Image';

pkg.slug = slugify(pkg.slug || pkg.title || 'post', { lower: true, strict: true, trim: true });

// If the model didn’t provide URLs, or gave non-URLs, set sane defaults
pkg.thumbnail_url = ensureUrl(pkg.thumbnail_url, THUMB_FALLBACK);
pkg.mid_thumbnail_url = ensureUrl(pkg.mid_thumbnail_url, MID_THUMB_FALLBACK);

// Optional: if you have a CDN you prefer, you can build deterministic URLs:
// const CDN = process.env.CDN_BASE_URL; // e.g., https://cdn.example.com
// if (CDN) {
//   pkg.thumbnail_url = `${CDN}/thumbs/${pkg.slug}-1200x630.jpg`;
//   pkg.mid_thumbnail_url = `${CDN}/thumbs/${pkg.slug}-800x418.jpg`;
// }

// --- keep JSON-LD in sync with thumbnails
if (pkg.json_ld && typeof pkg.json_ld === 'object') {
  // schema.org Article "image" can be a string or array
  pkg.json_ld.image = pkg.thumbnail_url;
  // also nice-to-have consistency:
  pkg.json_ld.headline = pkg.json_ld.headline || pkg.title;
  pkg.json_ld.description = pkg.json_ld.description || pkg.metaDescription;
  pkg.json_ld.keywords = pkg.json_ld.keywords || (Array.isArray(pkg.tags) ? pkg.tags.join(', ') : undefined);
}

  // sanitize HTML to avoid XSS in your CMS
  pkg.body_html = sanitizeHtml(pkg.body_html, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img','h2','h3','table','thead','tbody','tr','th','td']),
    allowedAttributes: { a: ['href','title','rel','target'], img: ['src','alt'] }
  });
  pkg.slug = slugify(pkg.slug || pkg.title, { lower: true, strict: true, trim: true });

  return pkg;
}

// Replace [[internal:...]] placeholders with actual links if your DB has matching slugs
async function resolveInternalLinks(html) {
  const re = /\[\[internal:([^\]]+)\]\]/g;
  let match, out = html;
  while ((match = re.exec(html)) !== null) {
    const hint = match[1];
    const row = await queryAsync(
      "SELECT slug, title FROM posts WHERE slug=? OR title LIKE ? LIMIT 1",
      [slugify(hint, { lower: true, strict: true }), `%${hint}%`]
    );

    console.log('posts row',row)
    const post = row?.[0];
    const url = post ? `${process.env.SITE_BASE_URL}/blog/${post.slug}` : '#';
    const anchor = post ? (post.title || hint) : hint;
    out = out.replace(match[0], `<a href="${url}" rel="internal noopener">${anchor}</a>`);
  }
  return out;
}

// Insert into DB
// Insert into DB
async function publish(pkg, title) {

    console.log('ttile',title)
  const contentWithLinks = await resolveInternalLinks(pkg.body_html);

  const result = await queryAsync(
    `INSERT INTO posts 
      (slug, title, meta_title, meta_description, excerpt, content, json_ld, tags, status, thumbnail_url, mid_thumbnail_url, meta_keywords, location, categories)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      pkg.slug,
      pkg.title,
      pkg.metaTitle,
      pkg.metaDescription,
      pkg.excerpt,
      contentWithLinks,
      JSON.stringify(pkg.json_ld),
      (pkg.tags || []).join(','),
      'published',
      pkg.thumbnail_url,
      pkg.mid_thumbnail_url,
      (title.keywords || []).join(','),   // ✅ join keywords
      title.location || '',                    // ✅ keep safe default
      (title.categories || []).join(',')       // ✅ join categories
    ]
  );

  console.log('post result', result);
  return result.insertId;
}


// Whole job
async function runOneCycle(value) {
  try {
    const topic = await getHotTopic(value);
    if (!topic) { console.warn('No topic found'); return; }

    console.log('topic',topic)

    const pkg = await generateSEOArticle(topic);
    const id = await publish(pkg,topic);

    console.log('Published post id:', id, 'slug:', pkg.slug);
    // Optional: ping sitemap or build sitemap here
  } catch (e) {
    console.error('AutoBlog error:', e?.message, e);
  }
}

// Schedule: every day at 10:15, 14:15, 18:15 (IST)
// cron.schedule('15 10,14,18 * * *', () => {
//   runOneCycle();
// }, { timezone: 'Asia/Kolkata' });


// runOneCycle(9)



let isRunning = false;
let currentIndex = 0;
const MAX_INDEX = 12;           // 0..12 => 13 slots

async function safeRun(index = 0) {
  if (isRunning) return console.warn('[autoblog] skip: job already running');
  isRunning = true;
  try {
    await runOneCycle(index);
  } catch (e) {
    console.error('safeRun error:', e?.message, e);
  } finally {
    isRunning = false;
  }
}

// Jitter helper that forwards args to the function
function withJitter(fn, ...args) {
  const delay = Math.floor(Math.random() * 180) * 1000; // 0–180s
  setTimeout(() => fn(...args), delay);
}

// Every 2 hours on the hour, ET
// cron.schedule(
//   '0 */2 * * *',
//   () => {
//     const index = currentIndex;                  // use current
//     currentIndex = (currentIndex >= MAX_INDEX)   // advance & wrap
//       ? 0
//       : currentIndex + 1;

//     withJitter(safeRun, index);                  // run with jitter
//   },
//   { timezone: 'America/New_York' }
// );



module.exports = router;