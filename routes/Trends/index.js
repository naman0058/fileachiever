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

async function fetchTrendingNow(countryCode, timeWindow='past_24_hours') {
  // SearchAPI: https://www.searchapi.io/docs/google-trends-trending-now-api
  const url = 'https://www.searchapi.io/api/v1/search';
  const params = {
    engine: 'google_trends_trending_now',
    api_key: process.env.SEARCHAPI_KEY, // <-- set in .env
    location: countryCode,              // 'United States' or 'United Kingdom'
    // time: timeWindow                    // past_4_hours | past_24_hours | past_48_hours | past_7_days
  };

  const { data } = await axios.get(url, { params, timeout: 12000 });

//   console.log('trend data fetch',data.trends[0])

  // Normalize to { title, related[] } similar to your pipeline
  // SearchAPI returns items in "trending_now" array with "title" and "queries"
  const items =  data.trends[0]

  console.log('trend fetch',items)
  return items;
}

async function getHotTopic() {
  console.log('[autoblog] using SearchAPI.io for trends (US+UK)...');
  // Fetch in sequence with a small delay to be gentle
  const us = await fetchTrendingNow('US', 'past_24_hours').catch(()=>[]);
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

const guidelines = `
You are an expert US news & SEO editor writing in en-US.

Goal: Produce a best-in-class, news-style article that can rank on Google by fully satisfying search intent, matching Top Stories tone, and optimizing for featured snippets and People Also Ask (PAA). Write with newsroom discipline and evergreen utility where possible.

OUTPUT PACKAGE
Return ONLY a single JSON object with:
{
  "metaTitle": string,                    // <= 60 chars, CTR-friendly
  "metaDescription": string,              // <= 150 chars, value-forward
  "title": string,                        // <= 70 chars; headline-style
  "slug": string,                         // kebab-case, concise, keyword-led
  "excerpt": string,                      // <= 160 chars; summary for cards
  "h1": string,                           // same or close to title
  "body_html": string,                    // 900–1200 words; HTML with H2/H3
  "faq": [{ "q": string, "a_html": string }], // 3–5 Q&A; 40–55 words each
  "tags": string[],                       // 5–8 topical tags
  "thumbnail_url": string,                // 1200×630 placeholder ok
  "mid_thumbnail_url": string,            // 800×418 placeholder ok
  "json_ld": object                       // Valid Article JSON-LD (see below)
}

AUDIENCE & STYLE
- Audience: United States; US English; AP-style clarity; Grade 7–9 readability.
- Newswriting: Inverted pyramid. Lead with who/what/when/where/why/how.
- Dates: Use absolute dates (e.g., "September 27, 2025") and ET/PT if relevant.
- Tone: Neutral, factual, and accessible. Avoid hype. Short sentences, short paragraphs, scannable subheads.

SEARCH INTENT & SERP COVERAGE (do before writing; reflect in output)
- Identify the dominant intent (usually informational). Satisfy it within the first 60–80 words of the intro for a featured snippet.
- Recon Top Stories, featured snippets, and PAA. Note recurring entities, definitions, dates, timelines, and user questions. Cover gaps.

TOPICAL COVERAGE & STRUCTURE (mandatory sections in body_html)
- Snippet-ready intro (60–80 words) that directly answers the core query.
- H2: "What happened" — concise, sourced facts; include date/time zones.
- H2: "Why it matters" — impacts on consumers/professionals; stakes and scale.
- H2: "Context & background" — short history, key players, definitions (define jargon on first mention).
- H2: "What to watch next" — timeline of next milestones; regulatory/market dates.
- Timeline (H3 or list) with absolute dates if applicable.
- If useful, include a clean HTML comparison or pros/cons table.
- Add a short, actionable checklist if readers need to take steps.
- Insert a “Key takeaways” box (3–5 bullets) near the end.
- Include 1–3 image suggestions inline (HTML comments or small captions) with descriptive alt text.
- Add at least 2 internal link placeholders to tech/education/career topics, e.g., [[internal:how-to-build-a-portfolio]], [[internal:best-online-certifications]].
- Cite 2–3 reputable US sources using placeholders like [[source:https://www.bls.gov/...]], [[source:https://www.ed.gov/...]], major publishers, or .gov/.edu.
- End with the exact “Legal & Editorial Disclaimer” block (provided below).

E-E-A-T & EVIDENCE
- Attribute all critical facts ("according to…"). Use data points where helpful.
- Use reputable sources (.gov, .edu, major US outlets). Include URL placeholders as [[source:...]].
- No medical/financial/legal advice. Do not speculate beyond sourced info.

SEO RULES
- Headline: include the primary keyword naturally (also include in at least one H2).
- Slug: short, keyword-led, kebab-case.
- Meta: craft for intent + value; avoid truncation (respect character limits).
- Accessibility: descriptive anchor text; meaningful alt text.

MEDIA
- Provide 1–3 image callouts inside body_html with suggested captions and explicit alt text descriptions.
- Provide thumbnail_url (1200×630) and mid_thumbnail_url (800×418) placeholders.

FAQ (PAA)
- Include 3–5 concise Q&As that map to common PAA angles (definitions, timelines, actions, costs/impact, eligibility). Each answer 40–55 words of clean HTML.

JSON-LD (Article)
- "@type": "Article"
- headline, description (match meta)
- mainEntityOfPage: canonical placeholder allowed
- author: { "@type": "Person", "name": "Staff Writer" }
- publisher: { "@type": "Organization", "name": "Your Site Name", "logo": { "@type": "ImageObject", "url": "https://example.com/logo.png" } }
- image: use thumbnail_url
- datePublished & dateModified: ISO 8601 using today’s date
- articleSection: derive from Categories
- keywords: mirror tags

COMPLIANCE
- No clickbait, no harmful content, no unverifiable claims, no plagiarism.
- Keep it evergreen where possible; when covering current developments, explain policies, timelines, and implications with lasting value.

REQUIRED DISCLAIMER (verbatim at end of body_html):
<strong>Legal & Editorial Disclaimer:</strong> This article is for general informational purposes only and does not constitute legal, financial, or professional advice. Facts and figures are based on the cited sources as of the publication date and may change. No warranties are made regarding completeness or accuracy. The publisher and author disclaim any liability for actions taken based on this content. All trademarks and copyrights belong to their respective owners. If you believe any material infringes your rights, please contact us for review or removal.
`;

const topic = topicObj.query;
const related = topicObj.keywords?.slice(0, 12) || [];

const prompt = `
You are creating a US news–style article package per the "newsGuidelines".

Topic: "${topic}"
Primary keyword: "${topic}"
Related keywords to weave naturally (clustered, not stuffed): ${related.join(', ') || 'n/a'}
Categories: ${topicObj.categories}

SERP & News analysis (do before writing; summarize implicitly in coverage):
- Skim Top Stories/News and organic results for this topic.
- Identify the current lede (what the snippet answers), then note gaps you can fill (definitions, timeline, impacts, next steps).
- List 3–5 long-tail questions to target as featured snippets (definition, timeline, how-to, vs., impact/cost, eligibility).
- Note 2–3 authoritative sources to cite with placeholders (e.g., [[source:https://www.energy.gov/...]], [[source:https://www.fcc.gov/...]]).

WRITING TASKS
1) Produce a news article package that:
   - Opens with a snippet-ready 60–80 word intro that directly answers the core query.
   - Uses H2/H3 subheads to cover: What happened; Why it matters; Context & background; What to watch next (rename only if the topic demands).
   - Adds a simple absolute-date timeline if relevant.
   - Includes a clean HTML comparison or pros/cons table if useful.
   - Provides a short step-by-step checklist if readers should take action.
   - Includes a “Key takeaways” box with 3–5 bullets.
   - Embeds 1–3 image suggestions with descriptive alt text.
   - Includes at least 2 internal link placeholders like [[internal:how-to-build-a-portfolio]] and [[internal:best-online-certifications]].
   - Cites 2–3 reputable sources using [[source:...]] placeholders.
   - Appends the exact “Legal & Editorial Disclaimer” text verbatim.

2) Ensure:
   - metaTitle (<=60 chars) and metaDescription (<=150 chars) reflect intent and value.
   - title (<=70 chars), slug (kebab case), excerpt (<=160 chars), and h1 are aligned.
   - body_html is 900–1200 words, concise, factual, scannable, and US-centric.
   - FAQs: 3–5 Q&As, each 40–55 words in clean HTML, covering common PAA angles.
   - tags: 5–8 relevant tags.
   - thumbnail_url (1200×630) and mid_thumbnail_url (800×418) as placeholders.
   - JSON-LD is valid Article with today’s date (ISO), correct fields, and consistency with meta/post.

3) OUTPUT FORMAT
- Return ONLY valid JSON with these exact fields:
{
  "metaTitle": string,
  "metaDescription": string,
  "title": string,
  "slug": string,
  "excerpt": string,
  "h1": string,
  "body_html": string,
  "faq": { "q": string, "a_html": string }[],
  "tags": string[],
  "thumbnail_url": string,
  "mid_thumbnail_url": string,
  "json_ld": object
}
- Do NOT include backticks, code fences, or any commentary outside the JSON.
`;



const resp = await openai.chat.completions.create({
  model: "gpt-5",
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
async function runOneCycle() {
  try {
    const topic = await getHotTopic();
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


// runOneCycle()


// avoid overlapping runs (optional safety)
let isRunning = false;
async function safeRun() {
  if (isRunning) return console.warn('[autoblog] skip: job already running');
  isRunning = true;
  try { await runOneCycle(); } finally { isRunning = false; }
}

// Add a small random jitter (0–180s) to avoid a robotic pattern
function withJitter(fn) {
  const delay = Math.floor(Math.random() * 180) * 1000;
  setTimeout(fn, delay);
}

// 8:15 AM ET
cron.schedule('15 8 * * *', () => withJitter(safeRun), { timezone: 'America/New_York' });

// 12:30 PM ET
cron.schedule('30 12 * * *', () => withJitter(safeRun), { timezone: 'America/New_York' });

// 8:30 PM ET
cron.schedule('30 20 * * *', () => withJitter(safeRun), { timezone: 'America/New_York' });



router.get('/trends/debug', async (req, res) => {
  try {
    const [usDaily, ukDaily] = await Promise.all([
      fetchDaily('US','en-US'),
      fetchDaily('GB','en-GB')
    ]);
    const [usRT, ukRT] = await Promise.all([
      usDaily ? null : fetchRealtime('US','en-US','all'),
      ukDaily ? null : fetchRealtime('GB','en-GB','all')
    ]);

    const merged = [
      ...normalizeTrends(usDaily, usRT),
      ...normalizeTrends(ukDaily, ukRT)
    ];

    // Return just titles + a few related terms so you can eyeball it
    const preview = merged.slice(0, 30).map(x => ({
      title: x.title,
      related: (x.related || []).slice(0,5),
      traffic: x.traffic
    }));

    res.json({ usDaily: !!usDaily, ukDaily: !!ukDaily, usRT: !!usRT, ukRT: !!ukRT, preview });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});


module.exports = router;