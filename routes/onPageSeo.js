const homePage = {
    title : 'Final-Year Projects, Reports & Source Code | FileMakr',
    description:'Explore final-year project reports, runnable source code and live demos for B.Tech, BCA, MCA and more.',
    author:'https://www.filemakr.com',
    abstract:'FileMakr helps final-year students discover project reports, source code and live demos across Python, AIML, PHP, MERN and AI/ML with documentation structured for academic evaluation and originality review.',
    keywords:'final year projects, project reports, source code, live demo, B.Tech projects, BCA projects, MCA projects, Python projects, AI ML projects, FileMakr',
    url:'https://www.filemakr.com/',
    ogImageAlt:'FileMakr — final year projects, reports and source code'
}


const blogPage = {
    title: 'FileMakr Blog — Project Tips, Guides & Tech Insights',
    description: 'Read student-friendly guides on system design, web development, final-year projects, viva prep and more on the FileMakr Blog.',
    author: 'https://www.filemakr.com',
    abstract: 'FileMakr Blog — practical articles for engineering and CS students.',
    keywords: 'FileMakr blog, final year project tips, system design, web development, student guides',
    url: 'https://www.filemakr.com/blog'
};

function stripHtmlMeta(text) {
    return String(text || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function isGenericBlogMetaCopy(text) {
    const t = String(text || '').toLowerCase();
    return t.includes('feeling the pressure of your final year project')
        || t.includes('navigating your final year project can be daunting')
        || t.includes('discover ready-to-submit project reports and source code for b.tech')
        || t.includes('[add your meta description here]')
        || t.includes('add your meta description');
}

function truncateSeoTitle(text, maxLen) {
    const t = String(text || '').replace(/\s+/g, ' ').trim();
    if (t.length <= maxLen) return t;
    const cut = t.slice(0, maxLen);
    const lastSpace = cut.lastIndexOf(' ');
    return (lastSpace > Math.floor(maxLen * 0.45) ? cut.slice(0, lastSpace) : cut).trim();
}

function blogPostHeading(post) {
    const title = stripHtmlMeta(post && post.title);
    const metaTitle = stripHtmlMeta(post && post.meta_title);
    return title || metaTitle || 'Blog Article';
}

function blogPostSeoTitle(post) {
    const heading = blogPostHeading(post);
    const rawMeta = stripHtmlMeta(post && post.meta_title);
    let base = rawMeta && !isGenericBlogMetaCopy(rawMeta) ? rawMeta : heading;
    if (/\|\s*filemakr/i.test(base)) return truncateSeoTitle(base, 60);
    const brandSuffix = ' | FileMakr Blog';
    if (`${base}${brandSuffix}`.length <= 60) return `${base}${brandSuffix}`;
    const trimmed = truncateSeoTitle(base, 60 - brandSuffix.length);
    return `${trimmed}${brandSuffix}`;
}

function blogPostExcerpt(post, maxLen = 160) {
    const candidates = [
        post && post.meta_description,
        post && post.meta_abstract,
        post && post.content,
    ];
    for (const raw of candidates) {
        const text = stripHtmlMeta(raw);
        if (!text || isGenericBlogMetaCopy(text)) continue;
        return truncateMetaDescription(text, maxLen);
    }
    const heading = blogPostHeading(post);
    const cat = stripHtmlMeta(post && post.category);
    const topic = cat ? `${heading} — ${cat}` : heading;
    return truncateMetaDescription(`${topic}. Practical tips for B.Tech, BCA and MCA students on FileMakr Blog.`, maxLen);
}

/** Single blog post: /blog/:slug */
function blogDetailMeta(post, pageUrl) {
    const heading = blogPostHeading(post);
    const description = blogPostExcerpt(post, 160);
    const abstract = truncateMetaDescription(blogPostExcerpt(post, 220), 200);
    const keywords = [post && post.meta_keywords, post && post.tags, post && post.category, heading]
        .map((v) => stripHtmlMeta(v))
        .filter(Boolean)
        .join(', ')
        .replace(/,\s*,/g, ',')
        .trim() || `FileMakr blog, ${heading}, final year projects`;

    return {
        title: blogPostSeoTitle(post),
        description,
        author: 'https://www.filemakr.com',
        abstract,
        keywords: keywords.length > 220 ? truncateMetaDescription(keywords, 220) : keywords,
        url: pageUrl || 'https://www.filemakr.com/blog',
        ogImage: (post && post.thumbnail_url) || '',
        ogImageAlt: `${heading} on FileMakr Blog`,
        displayTitle: heading,
    };
}

/** Blog listing: /blog */
function blogListingMeta(pageUrl, options = {}) {
    const q = options.q ? stripHtmlMeta(options.q) : '';
    const cat = options.cat ? stripHtmlMeta(options.cat) : '';
    const page = Number(options.page) > 1 ? Number(options.page) : 0;

    if (q) {
        return {
            title: `Blog: ${truncateMetaDescription(q, 40).replace(/…$/, '')} | FileMakr`,
            description: truncateMetaDescription(`Articles and guides about ${q} for final-year students on FileMakr Blog.`),
            author: 'https://www.filemakr.com',
            abstract: truncateMetaDescription(`Search results for ${q} on FileMakr Blog.`, 200),
            keywords: `${q}, FileMakr blog, final year projects, student guides`,
            url: pageUrl || blogPage.url,
        };
    }
    if (cat) {
        const label = cat.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
        return {
            title: `${label} Blog Articles | FileMakr`,
            description: truncateMetaDescription(`Browse ${label} articles, tips and project guides on FileMakr Blog.`),
            author: 'https://www.filemakr.com',
            abstract: truncateMetaDescription(`${label} articles on FileMakr Blog for engineering students.`, 200),
            keywords: `${label}, FileMakr blog, final year projects`,
            url: pageUrl || blogPage.url,
        };
    }
    if (page) {
        return {
            title: `FileMakr Blog — Page ${page}`,
            description: blogPage.description,
            author: 'https://www.filemakr.com',
            abstract: blogPage.abstract,
            keywords: blogPage.keywords,
            url: pageUrl || blogPage.url,
        };
    }
    return {
        title: blogPage.title,
        description: truncateMetaDescription(blogPage.description),
        author: 'https://www.filemakr.com',
        abstract: truncateMetaDescription(blogPage.abstract, 200),
        keywords: blogPage.keywords,
        url: pageUrl || blogPage.url,
    };
}


const contactPage = {
    title : 'Contact Us | FileMakr',
    description:'Contact Filemakr for access to comprehensive source code and project reports, ideal for final year students.',
    author:'https://www.filemakr.com',
    abstract:'Filemakr specializes in providing final year students with essential resources such as source code and project reports, ensuring academic success and project completion. Contact us for tailored assistance today',
    keywords:'contact us, Filemakr, source code, project report, final year students, academic support, project completion, tailored solutions',
    url:'https://filemakr.com/contact-us'

   
}

const errorPage = {
    title: 'Page Not Found (404) | FileMakr',
    description: 'The page you requested was not found. Browse FileMakr project reports, source code and live demos for B.Tech, BCA, MCA and other final-year projects.',
    author: 'https://www.filemakr.com',
    abstract: 'FileMakr 404 — find project reports, runnable source code and academic project support for final-year students.',
    keywords: '404, page not found, FileMakr, project reports, source code, final year projects',
    url: 'https://www.filemakr.com'
}


const aboutPage = {
    title : 'About Us | Filemakr: Empowering Final Year Students',
    description:'We specialize in providing final year students with high-quality source code and comprehensive project reports to facilitate their academic journey',
    author:'https://www.filemakr.com',
    abstract:'we are committed to empowering final year students by offering top-notch source code and project reports.',
    keywords:'about us, Filemakr, final year students, source code, project report, academic support',
    url:'https://filemakr.com/about-us'

   
}


const refundPage = {
    title : 'Refund Policy | FileMakr',
    description:`Filemakr's refund policy, ensuring satisfaction for final year students accessing source code and project reports. Our commitment to quality guarantees customer contentment`,
    author:'https://www.filemakr.com',
    abstract:`Filemakr's refund policy, ensuring satisfaction for final year students accessing source code and project reports. Our commitment to quality guarantees customer contentment`,
    keywords:'refund policy, Filemakr, final year students, source code, project report, academic resources, quality assurance',
    url:'https://filemakr.com/refund-policy'   
}


const privacyPage = {
    title : 'Privacy Policy | FileMakr',
    description:'Filemakr prioritizes data protection for final year students while offering access to high-quality source code and project reports',
    author:'https://www.filemakr.com',
    abstract:'Filemakr prioritizes data protection for final year students while offering access to high-quality source code and project reports',
    keywords:'privacy policy, Filemakr, data protection, final year students, source code, project report',
    url:'https://filemakr.com/privacy-policy'

   
}


const termsPage = {
    title : 'Terms and Conditions | FileMakr',
    description:`Filemakr's terms and conditions establish clear guidelines for final year students accessing our academic resources,ensuring a transparent and beneficial experience.`,
    author:'https://www.filemakr.com',
    abstract:`Filemakr's terms and conditions establish clear guidelines for final year students accessing our academic resources,ensuring a transparent and beneficial experience.`,
    keywords:'terms and conditions, Filemakr, final year students, source code, project report, academic resources, guidelines',
    url:'https://filemakr.com/terms-and-conditions'

   
}


const sourcePage = {
    title : 'Source Code for Final Year Projects — PHP, AIML, Python, Node.js | FileMakr',
    description:'Download ready-to-run source code for B.Tech, M.Tech, BCA, MCA final year projects. PHP, AIML, Python, Node.js, MERN stack with database and documentation.',
    author:'https://www.filemakr.com',
    abstract:'FileMakr provides source code for final year projects across PHP, AIML, Python, Node.js. Easy setup, full documentation, and database included for engineering and CS students.',
    keywords:'source code, final year project code, PHP projects, AIML projects, Python projects, Node.js, MERN stack, project source code, FileMakr',
    url:'https://www.filemakr.com/source-code'

   
}


const successPage = {
    title : 'Terms and Conditions | FileMakr',
    description:'Des FileMakr — The #1 Online Major & Minor Project file Generator!',
    author:'https://www.filemakr.com',
    abstract:'Download Readymade Major & Minor Project File of Smart Attendance , E-commerce ,  Payroll Management , Online Quiz System, ERP College Management , Library Management Systemand so on',
    keywords:'dg,fg,g',
    url:'https://filemakr.com/final-year-project-ideas'

   
}


const projectPage = {
    title : 'Top Final Year Project Ideas for College Students | FileMakr',
    description:'Discover top final year project ideas for  B.Tech, M.Tech, BCA, and MCA students.',
    author:'https://www.filemakr.com',
    abstract:'Discover innovative final year project ideas and access comprehensive reports and source code for B.Tech, M.Tech, BCA, and MCA students at FileMakr.',
    keywords:'Final year project ideas, B.Tech project reports, M.Tech project source code, BCA final year projects, MCA project ideas, College project reports, Final year project source code, Engineering project ideas, FileMakr',
    url:'https://filemakr.com/final-year-project-ideas'
   
}


const AmbassadorPage = {
  title: 'Our Campus Brand Ambassadors | FileMakr',
  description: 'Meet our top-performing brand ambassadors from colleges across India, promoting final year project solutions for B.Tech, M.Tech, BCA, and MCA students.',
  author: 'https://www.filemakr.com',
  abstract: 'Explore the profiles of FileMakr’s brand ambassadors—college students dedicated to helping peers discover final year project reports and source code solutions.',
  keywords: 'Brand ambassadors, FileMakr ambassadors, student ambassadors, campus brand representatives, B.Tech brand ambassador, MCA project ambassador, final year project promotion, college campus marketing, FileMakr representatives',
  url: 'https://filemakr.com/our-campus-brand-ambassador'
};



const commonMetaTags = {
    ogPhone: '+91-8319339945',
    ogEmail:'filemakr@gmail.com',
    ogCountry:'India',
    ogImage:'',
    HandheldFriendly:'true',
    MobileOptimized:'width',
    Icon:'https://res.cloudinary.com/dggf8vl9p/image/upload/v1718627756/filemakr-project-file-creator-favicon_1_dqogst.avif',
    URL:'https://www.filemakr.com',
    siteName:'FileMakr'
}

/** Keep meta descriptions within SEO-friendly length (default 160). */
function truncateMetaDescription(text, maxLen = 160) {
    const t = String(text || '').replace(/\s+/g, ' ').trim();
    if (t.length <= maxLen) return t;
    const cut = t.slice(0, maxLen - 1);
    const lastSpace = cut.lastIndexOf(' ');
    return ((lastSpace > 80 ? cut.slice(0, lastSpace) : cut).trim() + '…');
}

/** Catalog pages: /{degree}-final-year-project-report */
function graduationReportCatalogMeta(degreeLabel, pageUrl) {
    const degree = String(degreeLabel || 'Final year').trim() || 'Final year';
    const description = truncateMetaDescription(
        `We offer detailed and affordable ${degree} final year project reports for final year students, including comprehensive documentation and source code.`
    );
    return {
        title: `${degree} Final Year Project Reports | FileMakr`,
        description,
        author: 'https://www.filemakr.com',
        abstract: truncateMetaDescription(
            `Download detailed ${degree} final year project reports in PDF format for final year students, with comprehensive documentation and source code.`,
            200
        ),
        keywords: `${degree} Final Year Project Report, Final Year Project Report, Project Report, Final Year Students, ${degree} Final Year Students, ${degree} Project Report`,
        url: pageUrl || 'https://www.filemakr.com'
    };
}

const SOURCE_CATEGORY_SLUG_LABELS = {
    'node-js': 'Node.js',
    nodejs: 'Node.js',
    php: 'PHP',
    java: 'Java',
    python: 'Python',
    mern: 'MERN',
    react: 'React',
    'machine-learning': 'Machine Learning',
    aiml: 'AI/ML',
    'data-analytics': 'Data Analytics',
    flutter: 'Flutter',
    android: 'Android',
    django: 'Django',
    flask: 'Flask',
};

/** Display label for /source-code/:slug (prefers category table name). */
function resolveSourceCategoryLabel(categories, categorySlug) {
    const slug = String(categorySlug || '').trim().toLowerCase();
    if (!slug) return 'Final Year';
    if (Array.isArray(categories)) {
        const hit = categories.find((c) => String(c.seo_name || '').trim().toLowerCase() === slug);
        if (hit && hit.name) return String(hit.name).trim();
    }
    if (SOURCE_CATEGORY_SLUG_LABELS[slug]) return SOURCE_CATEGORY_SLUG_LABELS[slug];
    return slug
        .split('-')
        .filter(Boolean)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

/** Category hub pages: /source-code/:seo_name */
function sourceCodeCategoryMeta(categories, categorySlug, pageUrl) {
    const slug = String(categorySlug || '').trim().toLowerCase();
    const name = resolveSourceCategoryLabel(categories, slug);
    const description = truncateMetaDescription(
        `Download ready-to-run ${name} final year project source code with frontend, backend, database and documentation for B.Tech, BCA and MCA students.`
    );
    return {
        title: `${name} Source Code for Final Year Projects | FileMakr`,
        description,
        author: 'https://www.filemakr.com',
        abstract: truncateMetaDescription(
            `${name} project source code with working demos, setup guides and database scripts for final-year students. Browse runnable ${name} projects on FileMakr.`,
            200
        ),
        keywords: `${name} source code, ${name} final year project, ${name} project code, final year ${name} projects, ${slug} source code, FileMakr`,
        url: pageUrl || `https://www.filemakr.com/source-code/${slug}`,
        ogImageAlt: `${name} final year project source code on FileMakr`,
    };
}

/** DB project name as-is (strip HTML only). */
function plainProductName(rawName) {
    return String(rawName || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function escapeRegExp(text) {
    return String(text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeReportMetaText(text) {
    return String(text || '').replace(/\s+/g, ' ').trim();
}

function stripTrailingReport(name) {
    return normalizeReportMetaText(name).replace(/\s+report\s*$/i, '').trim();
}

function hasFinalYearProjectPhrase(text) {
    return /\bfinal[\s-]*year[\s-]*project\b/i.test(String(text || ''));
}

/** DB product name without trailing "Report". */
function reportProductSubject(rawName) {
    return stripTrailingReport(plainProductName(rawName)) || 'Final Year Project';
}

/** "project report" when name already says final year project; else full phrase. */
function reportTypePhrase(subject) {
    return hasFinalYearProjectPhrase(subject) ? 'project report' : 'final year project report';
}

/** Remove repeated "final year project" when the DB name already includes it. */
function cleanReportMetaCopy(text, subject) {
    let t = normalizeReportMetaText(text);
    if (!t || !hasFinalYearProjectPhrase(subject)) return t;

    t = t.replace(/\bfinal\s+year\s+project\s+report\b/gi, 'project report');

    const stem = subject.replace(/\s+final\s+year\s+project\s*$/i, '').trim();
    if (stem) {
        t = t.replace(
            new RegExp(`^${escapeRegExp(stem)}\\s+final\\s+year\\s+project\\b`, 'i'),
            subject
        );
    }
    return normalizeReportMetaText(t);
}

function buildReportMetaDescription(subject, options = {}) {
    const degree = options.degree ? String(options.degree).trim() : '';
    const lead = degree ? `${degree} ${subject}` : subject;
    return truncateMetaDescription(`${lead} with documentation, UML diagrams and test cases.`);
}

function buildReportAbstract(subject, options = {}) {
    const degree = options.degree ? String(options.degree).trim() : '';
    const categoryLabel = options.categoryLabel ? String(options.categoryLabel).trim() : '';
    const lead = degree ? `${degree} ${subject}` : subject;
    const reportLabel = categoryLabel
        ? `${categoryLabel} ${reportTypePhrase(subject)}`
        : reportTypePhrase(subject);
    return `${lead} — ${reportLabel} with documentation, UML diagrams and test cases.`;
}

function buildReportKeywords(product, ctx) {
    const { subject, pageHeading, categoryLabel, slug, degree } = ctx;
    const reportPhrase = reportTypePhrase(subject);
    const fromDb = product && product.meta_keywords && String(product.meta_keywords).trim();
    if (fromDb) {
        let kw = cleanReportMetaCopy(fromDb, subject);
        if (degree && !new RegExp(escapeRegExp(degree), 'i').test(kw)) {
            kw = `${degree} ${reportPhrase}, ${kw}`;
        }
        return kw;
    }
    const parts = [];
    if (degree) parts.push(`${degree} ${reportPhrase}`);
    parts.push(pageHeading);
    if (categoryLabel) parts.push(`${categoryLabel} ${reportPhrase}`);
    if (slug) parts.push(slug);
    parts.push('project documentation', 'viva ready report', 'FileMakr');
    return parts.join(', ');
}

/** Single report pages: /{seo_name}-report or /{seo_name}-report-{degree} */
function projectReportDetailMeta(product, pageUrl, options = {}) {
    const degree = options.degreeLabel ? String(options.degreeLabel).trim() : '';
    const subject = reportProductSubject(product && product.name);
    const pageHeading = degree
        ? `${degree} ${subject} Report`
        : (/\breport\s*$/i.test(subject) ? subject : `${subject} Report`);
    const categoryLabel = resolveSourceCategoryLabel(options.categories, product && product.category);
    const slug = product && product.seo_name ? String(product.seo_name) : '';

    const title = `${pageHeading} | FileMakr`;
    const description = buildReportMetaDescription(subject, { degree });
    const abstract = truncateMetaDescription(
        buildReportAbstract(subject, { degree, categoryLabel }),
        200
    );
    const keywords = buildReportKeywords(product, {
        subject,
        pageHeading,
        categoryLabel,
        slug,
        degree,
    });

    return {
        title,
        description,
        author: 'https://www.filemakr.com',
        abstract,
        keywords,
        url: pageUrl || 'https://www.filemakr.com',
        ogImage: (product && product.image) || '',
        ogImageAlt: `${pageHeading} on FileMakr`,
        displayName: pageHeading,
        pageHeading,
    };
}



module.exports = {
    homePage,
    contactPage,
    aboutPage,
    refundPage,
    privacyPage,
    termsPage,
    commonMetaTags,
    sourcePage,
    successPage,
    projectPage,
    AmbassadorPage,
    blogPage,
    blogDetailMeta,
    blogListingMeta,
    blogPostHeading,
    blogPostExcerpt,
    errorPage,
    truncateMetaDescription,
    graduationReportCatalogMeta,
    resolveSourceCategoryLabel,
    sourceCodeCategoryMeta,
    plainProductName,
    projectReportDetailMeta
}