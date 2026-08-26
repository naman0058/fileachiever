
var express = require('express');
var router = express.Router();
var mysql = require('mysql')
var pool = require('./pool')
var pool2 = require('./pool2')
var fetch = require('node-fetch')
var ccavutil = require('./ccavutil')
var qs = require('querystring');
var dataService = require('./dataService');
var onPageSeo = require('./onPageSeo');

const verify = require('./verify');
const emailTemplates = require('./utility/emailTemplates');
const upload = require('./multer');
const multer = require('multer');
const { requireMernManagerToolkit, redirectMernManagerAddAmbassadorToPortal, mernPortalEmbedLocals } = require('./mernManagerAccess');
const bulkAmbassadorUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
});
const projectReportShared = require('./projectReportShared');
const {
  handleProjectReportWordDownload,
  loadPrcLibraryForExport
} = require('./project-report-creator');
const { buildFullReportItems, filterSynopsisItems, filterPredefinedReportItems } = require('./prc-build-full-report-items');
const checkoutOrders = require('../services/checkoutOrderService');
const fs = require('fs');
const path = require('path');

const CHECKOUT_PRICES = {
  source: { basic: 99, support: 248 },
  report: { synopsis: 49, report: 99, customized: 149, originality: 299 }
};

function checkoutGuid() {
  const s4 = () => Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);
  return s4() + s4() + '-' + s4() + '-' + s4() + '-' + s4() + '-' + s4() + s4() + s4();
}

function normalizeReportPlan(plan) {
  const p = String(plan || '').toLowerCase();
  if (p === 'synopsis') return 'synopsis';
  if (p === 'customized') return 'customized';
  if (p === 'originality' || p === 'ai' || p === 'original') return 'originality';
  return 'report';
}

function isDeferredReportPlan(plan) {
  const p = normalizeReportPlan(plan);
  return p === 'customized' || p === 'originality';
}

function resolveCheckoutCatalog(type, plan) {
  const t = String(type || '').toLowerCase();
  const p = String(plan || '').toLowerCase();
  if (t === 'source' && (p === 'basic' || p === 'support')) {
    return {
      productType: 'source',
      plan: p,
      price: CHECKOUT_PRICES.source[p],
      paymentType: 'source_code',
      planLabel: p === 'support' ? 'Code + setup support (24hr)' : 'Source code download',
      delivery: 'instant',
      includes: p === 'support'
        ? ['Full source + Database File', 'Setup README', '24hr setup support', 'Instant ZIP']
        : ['Full source + Database File', 'Setup README', 'Instant ZIP']
    };
  }
  if (t === 'report') {
    const rp = normalizeReportPlan(p);
    if (!CHECKOUT_PRICES.report[rp] && rp !== 'report') return null;
    if (rp === 'synopsis') {
      return {
        productType: 'report',
        plan: 'synopsis',
        price: CHECKOUT_PRICES.report.synopsis,
        paymentType: 'synopsis',
        planLabel: 'Synopsis (PDF & Word)',
        delivery: 'instant',
        includes: ['Up to ~30 pages', '1 diagram', 'Instant PDF & Word download']
      };
    }
    if (rp === 'customized') {
      return {
        productType: 'report',
        plan: 'customized',
        price: CHECKOUT_PRICES.report.customized,
        paymentType: 'customized_report',
        planLabel: 'Customized Report (PDF & Word)',
        delivery: 'deferred',
        includes: ['College-format customization', 'Personalized content', 'PDF & Word · delivery within 24-48 hours']
      };
    }
    if (rp === 'originality') {
      return {
        productType: 'report',
        plan: 'originality',
        price: CHECKOUT_PRICES.report.originality,
        paymentType: 'originality_report',
        planLabel: 'Originality Reviewed Report (PDF & Word)',
        delivery: 'deferred',
        includes: ['AI detection reviewed', 'Plagiarism-free rewrite', 'PDF & Word · delivery within 24-48 hours']
      };
    }
    return {
      productType: 'report',
      plan: 'report',
      price: CHECKOUT_PRICES.report.report,
      paymentType: 'project_report',
      planLabel: 'Pre Defined Project Report (PDF & Word)',
      delivery: 'instant',
      includes: ['Up to ~70 pages', 'ER/DFD + diagrams', 'Instant PDF & Word download']
    };
  }
  return null;
}

/** Optional matching add-on (report↔source) — simple combo, not a cart. */
function listCheckoutAddonPlans(primaryType) {
  const t = String(primaryType || '').toLowerCase();
  if (t === 'report') {
    return [
      {
        id: 'basic',
        price: CHECKOUT_PRICES.source.basic,
        title: 'Code Only',
        sub: 'ZIP · instant download',
        planLabel: 'Source code download',
        label: 'Matching Source Code',
        delivery: 'instant'
      },
      {
        id: 'support',
        price: CHECKOUT_PRICES.source.support,
        title: 'Code + Setup',
        sub: 'ZIP · 24hr support',
        planLabel: 'Code + setup support (24hr)',
        label: 'Matching Source Code',
        delivery: 'instant'
      }
    ];
  }
  if (t === 'source') {
    return [
      {
        id: 'synopsis',
        price: CHECKOUT_PRICES.report.synopsis,
        title: 'Synopsis',
        sub: 'PDF & Word · instant',
        planLabel: 'Synopsis (PDF & Word)',
        label: 'Matching Project Report',
        delivery: 'instant'
      },
      {
        id: 'report',
        price: CHECKOUT_PRICES.report.report,
        title: 'Project Report',
        sub: 'PDF & Word · instant',
        planLabel: 'Pre Defined Project Report (PDF & Word)',
        label: 'Matching Project Report',
        delivery: 'instant'
      },
      {
        id: 'customized',
        price: CHECKOUT_PRICES.report.customized,
        title: 'Customized',
        sub: 'PDF & Word · 24-48 hrs',
        planLabel: 'Customized Report (PDF & Word)',
        label: 'Matching Project Report',
        delivery: 'deferred'
      },
      {
        id: 'originality',
        price: CHECKOUT_PRICES.report.originality,
        title: 'Originality',
        sub: 'PDF & Word · 24-48 hrs',
        planLabel: 'Originality Reviewed Report (PDF & Word)',
        label: 'Matching Project Report',
        delivery: 'deferred'
      }
    ];
  }
  return [];
}

function resolveCheckoutAddon(primaryType, rawFlag, rawPlan) {
  const flag = String(rawFlag == null ? '' : rawFlag).toLowerCase().trim();
  const on =
    flag === '1' ||
    flag === 'true' ||
    flag === 'yes' ||
    flag === 'on' ||
    flag === 'source' ||
    flag === 'report' ||
    flag === 'basic' ||
    flag === 'support' ||
    flag === 'synopsis' ||
    flag === 'customized' ||
    flag === 'originality';
  if (!on) return null;

  const t = String(primaryType || '').toLowerCase();
  const plans = listCheckoutAddonPlans(t);
  if (!plans.length) return null;

  let planId = String(rawPlan || flag || '').toLowerCase().trim();
  if (planId === 'ai' || planId === 'original') planId = 'originality';
  if (!plans.some((p) => p.id === planId)) {
    planId = t === 'report' ? 'basic' : 'report';
  }
  const selected = plans.find((p) => p.id === planId) || plans[0];
  return {
    type: t === 'report' ? 'source' : 'report',
    plan: selected.id,
    price: selected.price,
    label: selected.label,
    planLabel: selected.planLabel,
    title: selected.title,
    delivery: selected.delivery || 'instant'
  };
}

function setPaidCheckoutSession(req, opts) {
  req.session.ispayment = 'done';
  req.session.fm_order_id = opts.orderId || '';
  req.session.paid_source_code_id = opts.sourceCodeId;
  req.session.paid_plan = opts.plan || '';
  req.session.paid_product_type = opts.productType || 'report';
  req.session.paid_order_id = opts.orderId || '';
  req.session.paid_billing_name = opts.billingName || '';
  req.session.paid_billing_email = opts.billingEmail || '';
  req.session.paid_amount = opts.amount != null ? String(opts.amount) : '';
  req.session.paid_method = opts.method || 'UPI';
  req.session.paid_product_name = opts.productName || '';
  req.session.paid_date = opts.paymentDate || checkoutOrders.formatPaymentDate(new Date());
  if (opts.zipFileName) req.session.paid_zip_file = opts.zipFileName;
  if (opts.addon) {
    req.session.paid_addon = opts.addon;
  } else {
    delete req.session.paid_addon;
  }
}

function reportAddonPlanFromLabel(label) {
  const l = String(label || '');
  if (/customized/i.test(l)) return 'customized';
  if (/originality/i.test(l)) return 'originality';
  if (/synopsis/i.test(l)) return 'synopsis';
  if (/pre defined project report/i.test(l)) return 'report';
  return '';
}

function resolvePaidAddonFromOrder(order) {
  if (!order) return null;
  const label = String(order.plan_label || '');
  const productType = String(order.product_type || '').toLowerCase();

  if (order.addon_plan) {
    if (productType === 'report') {
      return resolveCheckoutAddon('report', '1', order.addon_plan);
    }
    return resolveCheckoutAddon('source', '1', order.addon_plan);
  }
  if (/\+\s*source code/i.test(label)) return resolveCheckoutAddon('report', '1');
  const reportPlan = reportAddonPlanFromLabel(label);
  if (reportPlan && /\+/i.test(label)) {
    return resolveCheckoutAddon('source', '1', reportPlan);
  }
  return null;
}

function resolvePaidAddonForCheckout(req, fmOrder) {
  const fromOrder = resolvePaidAddonFromOrder(fmOrder);
  const fromSession =
    req.session && req.session.paid_addon && req.session.paid_addon.type
      ? req.session.paid_addon
      : null;

  if (!fromOrder) return fromSession;
  if (!fromSession) return fromOrder;

  const orderPlan = normalizeReportPlan(fromOrder.plan || '');
  const sessionPlan = normalizeReportPlan(fromSession.plan || '');
  if (fromOrder.type === 'report' && fromSession.type === 'report' && orderPlan !== sessionPlan) {
    return fromOrder;
  }
  if (isDeferredReportPlan(orderPlan) && !isDeferredReportPlan(sessionPlan)) {
    return fromOrder;
  }
  return fromSession;
}

function reportReadyRedirectUrl(orderId) {
  const id = String(orderId || '').trim();
  if (!id) return '/checkout/report-ready';
  return '/checkout/report-ready?order=' + encodeURIComponent(id);
}

async function restoreCheckoutSessionFromPaidOrder(req, orderId) {
  const id = String(orderId || '').trim();
  if (!id) return null;
  try {
    const order = await checkoutOrders.findOrderForDownloadRestore(id);
    if (!order) return null;

    const payType = String(order.payment_type || 'source_code').toLowerCase();
    const isReport =
      payType === 'synopsis' ||
      payType === 'project_report' ||
      payType === 'customized_report' ||
      payType === 'originality_report' ||
      String(order.product_type || '').toLowerCase() === 'report';

    let zipFileName = '';
    try {
      const zipRows = await queryAsync(
        'SELECT source_code FROM source_code WHERE id = ? LIMIT 1',
        [order.source_code_id]
      );
      zipFileName = (zipRows && zipRows[0] && zipRows[0].source_code) || '';
    } catch (_) {}

    const paidAddon = resolvePaidAddonFromOrder(order);
    const reportPlan = normalizeReportPlan(order.plan || payType);
    const amountNum = parseFloat(order.final_amount) || 0;

    setPaidCheckoutSession(req, {
      orderId: order.order_id,
      sourceCodeId: order.source_code_id,
      plan: isReport
        ? reportPlan
        : String(order.plan || '').toLowerCase() === 'support' || amountNum > 200
          ? 'support'
          : 'basic',
      productType: isReport ? 'report' : 'source',
      billingName: order.billing_name || '',
      billingEmail: order.billing_email || '',
      amount: order.final_amount || '',
      method: order.payment_pref || 'UPI',
      productName: order.product_name || '',
      paymentDate: checkoutOrders.formatPaymentDate(order.paid_at || new Date()),
      zipFileName,
      addon: paidAddon
    });
    req.session.type = order.payment_type;
    req.session.checkout_plan = order.plan;
    return order;
  } catch (e) {
    console.error('restoreCheckoutSessionFromPaidOrder:', e.message || e);
    return null;
  }
}

async function resolveCheckoutDownloadAvailability({ isSource, sourceId, plan, zipFileName }) {
  const result = {
    downloadAvailable: false,
    downloadUnavailableTitle: 'Download temporarily unavailable',
    downloadUnavailableMessage:
      'Your payment was successful. The file for this order is not ready for download yet. Please share your Order ID with support on WhatsApp and our team will enable it shortly.'
  };

  if (!Number.isFinite(sourceId)) {
    result.downloadUnavailableTitle = 'Project could not be verified';
    result.downloadUnavailableMessage =
      'Your payment was successful, but we could not link this order to a project file. Please contact support with your Order ID for immediate assistance.';
    return result;
  }

  if (isSource) {
    const zip = String(zipFileName || '').trim();
    if (!zip) {
      result.downloadUnavailableTitle = 'Source code file not published';
      result.downloadUnavailableMessage =
        'Your payment was successful. The ZIP package for this project has not been published yet. Share your Order ID on WhatsApp and we will attach your download within a short time.';
      return result;
    }

    const safeZip = path.basename(zip);
    const localPath = path.join(__dirname, '..', 'public', 'images', safeZip);
    try {
      if (fs.existsSync(localPath) && fs.statSync(localPath).size > 0) {
        result.downloadAvailable = true;
        return result;
      }
    } catch (e) {}

    try {
      const remoteUrl = 'https://filemakr.com/images/' + encodeURIComponent(safeZip);
      let head = await fetch(remoteUrl, { method: 'HEAD', timeout: 6000 }).catch(() => null);
      if (head && head.status === 405) {
        head = await fetch(remoteUrl, {
          method: 'GET',
          headers: { Range: 'bytes=0-0' },
          timeout: 6000
        }).catch(() => null);
      }
      if (head && head.ok) {
        result.downloadAvailable = true;
        return result;
      }
      if (head && (head.status === 404 || head.status === 410)) {
        result.downloadUnavailableTitle = 'Source code file not found';
        result.downloadUnavailableMessage =
          'Your payment was successful, but the source code package could not be located on our servers. Please contact WhatsApp support with your Order ID — delivery will be prioritized.';
        return result;
      }
    } catch (e) {}

    // Filename exists in catalog; local/remote probe inconclusive — allow download attempt
    result.downloadAvailable = true;
    return result;
  }

  try {
    const lib = await loadPrcLibraryForExport(sourceId);
    let items = buildFullReportItems({
      sections: lib.sectionsWithSub,
      dbScreenshots: lib.dbScreenshots,
      screenshots: lib.screenshots,
      diagrams: lib.diagramsList
    });
    if (plan === 'synopsis') {
      items = filterSynopsisItems(items);
    } else if (plan === 'report') {
      items = filterPredefinedReportItems(items);
    }
    if (items && items.length) {
      result.downloadAvailable = true;
      return result;
    }
    result.downloadUnavailableTitle = 'Report content not ready';
    result.downloadUnavailableMessage =
      'Your payment was successful. The Word document for this project is still being prepared in our library. Share your Order ID on WhatsApp and our team will enable your download as soon as content is published.';
    return result;
  } catch (e) {
    result.downloadUnavailableTitle = 'Report could not be verified';
    result.downloadUnavailableMessage =
      'Your payment was successful, but we could not verify the report file right now. Please contact WhatsApp support with your Order ID and we will resolve this promptly.';
    return result;
  }
}

const Tesseract = require('tesseract.js');

// async function extractTextFromImage(imagePath) {
//     try {
//         const { data: { text } } = await Tesseract.recognize(
//             imagePath,
//             'eng', // Language (English)
//             {}
//         );
//         console.log("Extracted Text:\n", text);
//         return text;
//     } catch (error) {
//         console.error("Error extracting text:", error.message || error);
//         return "";
//     }
// }

// function mobileExtractDetails(text) {
//     const nameMatch = text.match(/& ([A-Za-z ]+) ©/) || text.match(/& ([A-Za-z ]+) @/);
//     const numberMatch = text.match(/©\) (\d{10})/) || text.match(/©?\s?(\d{10})/);
//     const titleMatch = text.match(/Enquiry Title » (.+)/);
//     const descriptionMatch = text.match(/Enquiry Description ¥\s*([\s\S]*?)(?:\n1\.|$)/);
    
//     let enquiryTitle = "Not Found";
//     if (titleMatch) {
//         const lines = text.split('\n');
//         const titleIndex = lines.findIndex(line => line.includes("Enquiry Title »"));
//         if (titleIndex !== -1 && titleIndex + 1 < lines.length) {
//             enquiryTitle = lines[titleIndex + 1].trim();
//         }
//     }
    
//     return {
//         name: nameMatch ? nameMatch[1].trim() : "Not Found",
//         number: numberMatch ? numberMatch[1].trim() : "Not Found",
//         enquiryTitle: enquiryTitle,
//         enquiryDescription: descriptionMatch ? descriptionMatch[1].replace(/\n/g, ' ').trim() : "Not Found"
//     };
// }


// function laptopExtractDetails(text) {
//     const nameMatch = text.match(/« ([A-Za-z ]+) minutes ago/);
//     const numberMatch = text.match(/© (\d{10}) v lock/) ||  text.match(/©?\s?(\d{10})/);
//     const titleMatch = text.match(/Enquiry Title v (.+)/);
//     const descriptionMatch = text.match(/Enquiry Description ¥\s*([\s\S]*?)(?:\n& Profile|$)/);

//     return {
//         name: nameMatch ? nameMatch[1].trim() : "Not Found",
//         number: numberMatch ? numberMatch[1].trim() : "Not Found",
//         enquiryTitle: titleMatch ? titleMatch[1].trim() : "Not Found",
//         enquiryDescription: descriptionMatch ? descriptionMatch[1].replace(/\n/g, ' ').trim() : "Not Found"
//     };
// }


// (async () => {
//     const extractedText = await extractTextFromImage('./routes/image7.jpeg');
//     if (extractedText) {
//         const details = laptopExtractDetails(extractedText);
//         console.log("Extracted Details:", details);
//     }
// })();




const util = require('util');
const queryAsync = util.promisify(pool.query).bind(pool);
const queryAsync2 = util.promisify(pool2.query).bind(pool);

router.use(mernPortalEmbedLocals);

 
















var ccavReqHandler = require('./ccavRequestHandler');
var ccavResHandler = require('./ccavResponseHandler');

const nodeCCAvenue = require('node-ccavenue');
const ccavConfig = require('../config/ccavenue');
const crypto = require('crypto');
const ccave = new nodeCCAvenue.Configure({
  merchant_id: ccavConfig.merchantId,
  working_key: ccavConfig.workingKey
});

const CHECKOUT_CSRF_TTL_MS = 45 * 60 * 1000;

function checkoutCsrfSecret() {
  return String(process.env.SESSION_KEYS || 'naman').split(',')[0].trim() || 'naman';
}

function issueCheckoutCsrf(req) {
  const nonce = crypto.randomBytes(18).toString('hex');
  const exp = String(Date.now() + CHECKOUT_CSRF_TTL_MS);
  const payload = nonce + '.' + exp;
  const sig = crypto.createHmac('sha256', checkoutCsrfSecret()).update(payload).digest('hex');
  const token = payload + '.' + sig;
  req.session.checkout_csrf = nonce;
  return token;
}

function assertCheckoutCsrf(req) {
  const got = String(req.body.checkout_csrf || '').trim();
  if (!got) return false;

  const parts = got.split('.');
  if (parts.length === 3) {
    const nonce = parts[0];
    const expMs = parseInt(parts[1], 10);
    const sig = parts[2];
    if (nonce && nonce.length >= 16 && Number.isFinite(expMs) && Date.now() <= expMs) {
      const payload = nonce + '.' + parts[1];
      const expectedSig = crypto
        .createHmac('sha256', checkoutCsrfSecret())
        .update(payload)
        .digest('hex');
      if (sig === expectedSig) return true;
    }
  }

  // Backward compat: session-stored token (older checkout pages)
  const expected = String(req.session.checkout_csrf || '');
  return !!(expected && expected.length >= 16 && got === expected);
}

async function redirectCheckoutAfterPaymentDrop(request, response, opts = {}) {
  const orderId =
    request.session.fm_order_id ||
    (request.body && (request.body.orderNo || request.body.order_id)) ||
    '';
  if (orderId) {
    try {
      const order = await checkoutOrders.findByOrderId(String(orderId));
      if (order) {
        return response.redirect(checkoutOrders.checkoutUrlFromOrder(order, opts));
      }
    } catch (e) {
      console.error('redirectCheckoutAfterPaymentDrop:', e.message || e);
    }
  }
  return response.redirect('/');
}

// const nodeCCAvenue = require('node-ccavenue');
// const ccav = new nodeCCAvenue.Configure({
//   merchant_id: '1760015',
//   working_key: '3F831E8FD26B47BBFDBCDB8E021635F2',
// });  

router.get('/nonseamless', function (req, res){
    res.render('nonseamless');
});

// router.post('/ccavRequestHandler', function (request, res){

//     request.session.source_code_id = request.body.source_code_id;
//     request.session.type = 'source_code'

//     let guid = () => {
//         let s4 = () => {
//             return Math.floor((1 + Math.random()) * 0x10000)
//                 .toString(16)
//                 .substring(1);
//         }
//         //return id of format 'aaaaaaaa'-'aaaa'-'aaaa'-'aaaa'-'aaaaaaaaaaaa'
//         return s4() + s4() + '-' + s4() + '-' + s4() + '-' + s4() + '-' + s4() + s4() + s4();
//     }

//     let body = request.body;
//     body['merchant_id'] = '1760015';
//     body['order_id'] = guid();
//     body['currency'] = 'INR';
//     body['amount'] = '10.00';
//     body['redirect_url'] = 'https://www.filemakr.com/ccavResponseHandler';
//     body['cancel_url'] =   'https://www.filemakr.com/ccavResponseHandler';
//     body['source_code_id'] = request.session.source_code_id;
//     body['type'] = 'source_code'
//     body['seo_name'] = request.body.seo_name

//    pool.query(`insert into payment_request set ?`,body,(err,result)=>{
//     if(err) throw err;
//     else{
   
// // ccavReqHandler.postReq(request, response);
// console.log(request.body)
// const encryptedOrderData = ccave.getEncryptedOrder(request.body);
// // console.log(encryptedOrderData);

// res.render('send',{enccode:encryptedOrderData,accesscode:'AVZN72JL86AQ28NZQA'})
//     }
//    })
// });



router.post('/ccavRequestHandler', dataService.date_and_time,async function (request, res) {
    try {

        const body = request.body;


        request.session.source_code_id = request.body.source_code_id;
        request.session.type = 'source_code';

        body['coupon_code']  = request.body.coupon_code || '';
body['final_amount'] = request.body.final_amount || '99.00';

        let amount = request.body.final_amount;
        //  if(request.body.referral_code == 'FILEMKR50'){
        //    amount = '250.00'
        //  }
        // //  else if(request.body.referral_code == 'COMBO99'){
        // //     amount = '99.00'
        // //   }
        //  else{
        //     amount = '500.00'
        //  }

        const guid = () => {
            const s4 = () => {
                return Math.floor((1 + Math.random()) * 0x10000)
                    .toString(16)
                    .substring(1);
            }
            return s4() + s4() + '-' + s4() + '-' + s4() + '-' + s4() + '-' + s4() + s4() + s4();
        }

        body['merchant_id'] = '1760015';
        body['order_id'] = guid();
        body['currency'] = 'INR';
        body['amount'] = amount;
        body['redirect_url'] = 'https://www.filemakr.com/ccavResponseHandler';
        body['cancel_url'] = 'https://www.filemakr.com/ccavResponseHandler';
        body['source_code_id'] = request.session.source_code_id;
        body['type'] = 'source_code';
        body['seo_name'] = request.body.seo_name;
        body['date'] = verify.getCurrentDate();
        body['referral_code'] = request.body.referral_code;
        body['status'] = 'pending'


        const result = await queryAsync('INSERT INTO payment_request SET ?', body);

        console.log(request.body);

        var title_case_name = request.body.seo_name.split('-') // Split the string into an array of words
        .map(function(word) {
            return word.charAt(0).toUpperCase() + word.slice(1); // Capitalize the first letter of each word
        })
        .join(' '); // Join the words back into a single string with spaces

        setImmediate(async () => {
          try {
               const userSubject = emailTemplates.beforesourcecode.userSubject.replace('{{Project_Name}}', title_case_name);
        const userMessage = emailTemplates.beforesourcecode.userMessage(request.body.billing_name,title_case_name,request.body.seo_name);

        await verify.sendUserMail(request.body.billing_email,userSubject,userMessage)
          } catch (backgroundErr) {
            console.error('Background task error (email):', backgroundErr);
          }
        });


     

        const encryptedOrderData = ccave.getEncryptedOrder(request.body);
        res.render('send', { enccode: encryptedOrderData, accesscode: 'AVZN72JL86AQ28NZQA' });
    } catch (err) {
        console.error('Error handling CCAV request:', err);
        res.status(500).send('Internal Server Error');
    }
});




// router.post('/ccavResponseHandler',(request,response)=>{
// const { encResp } = request.body;

// let decryptedJsonResponse = ccave.redirectResponseToJson(encResp);

// // response.json(request.session.source_code_id)

// console.log(request.body)

// decryptedJsonResponse.type = 'source_code'
// decryptedJsonResponse.typeid = request.session.source_code_id;


// pool.query(`insert into payment_response(order_id , tracking_id , bank_ref_no , order_status , failure_message , payment_mode , card_name , status_code , status_message , currency , amount , billing_name , billing_address , billing_city , billing_state , billing_zip , billing_tel , billing_email , trans_date) 
// values('${decryptedJsonResponse.order_id}' , '${decryptedJsonResponse.tracking_id}' , '${decryptedJsonResponse.bank_ref_no}' , '${decryptedJsonResponse.order_status}' , '${decryptedJsonResponse.failure_message}' , '${decryptedJsonResponse.payment_mode}' , '${decryptedJsonResponse.card_name}' , '${decryptedJsonResponse.status_code}' , '${decryptedJsonResponse.status_message}' , '${decryptedJsonResponse.currency}' , '${decryptedJsonResponse.amount}', '${decryptedJsonResponse.billing_name}' , '${decryptedJsonResponse.billing_address}' , '${decryptedJsonResponse.billing_city}', '${decryptedJsonResponse.billing_state}' , '${decryptedJsonResponse.billing_zip}', '${decryptedJsonResponse.billing_tel}', '${decryptedJsonResponse.billing_email}' , '${decryptedJsonResponse.trans_date}')`,(err,result)=>{
//     if(err) throw err;
//     else{
//         if(decryptedJsonResponse.order_status == 'Aborted' || decryptedJsonResponse.order_status =='Failure'){
//             // response.json({msg:'aborted or failed'})


//         pool.query(`select * from payment_request where order_id = '${request.body.orderNo}'`,(err,result)=>{
//             if(err) throw err;
//             else {
//                 console.log(result)
//                 response.redirect(`https://www.filemakr.com/${result[0].seo_name}/source-code`)
//             }
//         })



//         }
//         else if(decryptedJsonResponse.order_status == 'Success'){
//             pool.query(`select * from payment_request where order_id = '${request.body.orderNo}'`,(err,result)=>{
//                 if(err) throw err;
//                 else {
//                     pool.query(`select source_code from source_code where id = '${result[0].source_code_id}'`,(err,result)=>{
//                         if(err) throw err;
//                         //else res.json(result)
//                         else response.render('download-successfull',{result:result})
//                     })
//                 }
//             })
//         }

//         else{

//             response.json(decryptedJsonResponse)
          
    
         
//             // response.json({msg:'success'})
//         }
//     }
// })


// })


router.get('/ccavResponseHandler', dataService.allCategory, async (request, response) => {
  return redirectCheckoutAfterPaymentDrop(request, response, { cancelled: true });
});

router.post('/ccavResponseHandler', dataService.allCategory, async (request, response) => {
  console.log('routes call');
  const encResp = request.body && request.body.encResp;
  if (!encResp) {
    return redirectCheckoutAfterPaymentDrop(request, response, { cancelled: true });
  }

  let decryptedJsonResponse;
  try {
    decryptedJsonResponse = ccave.redirectResponseToJson(encResp);
  } catch (decErr) {
    console.error('CCAvenue decrypt error:', decErr.message || decErr);
    return redirectCheckoutAfterPaymentDrop(request, response, { cancelled: true });
  }

  decryptedJsonResponse.type = request.session.type || 'source_code';
  decryptedJsonResponse.typeid = request.session.source_code_id;

  console.log('routes call after decryptedJsonResponse', decryptedJsonResponse);

  const gatewayOrderId =
    decryptedJsonResponse.order_id || request.body.orderNo || request.session.fm_order_id || '';

  try {
    const fmOrder = gatewayOrderId ? await checkoutOrders.findByOrderId(gatewayOrderId) : null;
    if (fmOrder) {
      const updated = await checkoutOrders.recordGatewayResponse(fmOrder, decryptedJsonResponse);
      const order = updated || fmOrder;
      const payType = String(order.payment_type || 'source_code');
      const gatewayStatus = String(decryptedJsonResponse.order_status || '');

      if (gatewayStatus === 'Aborted' || gatewayStatus === 'Failure') {
        const dropOpts = gatewayStatus === 'Aborted' ? { cancelled: true } : { failed: true };
        return response.redirect(checkoutOrders.checkoutUrlFromOrder(order, dropOpts));
      }

      if (gatewayStatus === 'Success') {
        // Only fulfill when our ledger confirms paid (amount/currency verified)
        if (String(order.order_status) !== 'paid') {
          console.error('CCAvenue Success ignored — order not marked paid', {
            order_id: order.order_id,
            order_status: order.order_status,
            gateway_amount: decryptedJsonResponse.amount,
            expected_amount: order.final_amount
          });
          const restored = await checkoutOrders.findOrderForDownloadRestore(order.order_id);
          if (restored) {
            order = restored;
          } else {
            return response.redirect(reportReadyRedirectUrl(order.order_id));
          }
        }

        const paidAddon =
          (request.session.checkout_addon && request.session.checkout_addon.type
            ? request.session.checkout_addon
            : null) || resolvePaidAddonFromOrder(order);

        if (
          payType === 'synopsis' ||
          payType === 'project_report' ||
          payType === 'customized_report' ||
          payType === 'originality_report'
        ) {
          let zipFileName = '';
          if (paidAddon && paidAddon.type === 'source') {
            try {
              const zipRows = await queryAsync(
                'SELECT source_code FROM source_code WHERE id = ? LIMIT 1',
                [order.source_code_id]
              );
              zipFileName = (zipRows && zipRows[0] && zipRows[0].source_code) || '';
            } catch (e) {}
          }

          const reportPlan = normalizeReportPlan(order.plan || payType);
          setPaidCheckoutSession(request, {
            orderId: order.order_id,
            sourceCodeId: order.source_code_id,
            plan: reportPlan,
            productType: 'report',
            billingName: decryptedJsonResponse.billing_name || order.billing_name || '',
            billingEmail: decryptedJsonResponse.billing_email || order.billing_email || '',
            amount: order.final_amount || decryptedJsonResponse.amount || '',
            method: decryptedJsonResponse.payment_mode || order.payment_pref || 'UPI',
            productName: order.product_name || '',
            paymentDate: checkoutOrders.formatPaymentDate(order.paid_at || new Date()),
            zipFileName,
            addon: paidAddon
          });

          setImmediate(async () => {
            try {
              const deferred = isDeferredReportPlan(reportPlan);
              const planLabel =
                (order.plan_label || '').split('+')[0].trim() ||
                (reportPlan === 'synopsis'
                  ? 'Synopsis'
                  : reportPlan === 'customized'
                    ? 'Customized Report'
                    : reportPlan === 'originality'
                      ? 'Originality Reviewed Report'
                      : 'Project Report');
              const dl =
                'https://www.filemakr.com/checkout/report-ready?order=' +
                encodeURIComponent(order.order_id);
              const subject = deferred
                ? `Payment received — ${planLabel} delivery in 24-48 hours | FileMakr`
                : `Your ${planLabel}${paidAddon ? ' + Source Code' : ''} is ready — FileMakr`;
              const msg = deferred
                ? `Hi ${decryptedJsonResponse.billing_name || order.billing_name || 'there'},\n\nPayment received for ${planLabel}.\n\nDelivery within 24-48 hours on your WhatsApp or Email ID.\n\nOrder ID: ${order.order_id}\nTrack / details: ${dl}\n\n— FileMakr`
                : `Hi ${decryptedJsonResponse.billing_name || order.billing_name || 'there'},\n\nPayment received. Download your files here:\n${dl}\n\nOrder ID: ${order.order_id}\n\n— FileMakr`;
              const email = decryptedJsonResponse.billing_email || order.billing_email;
              if (email) await verify.sendUserMail(email, subject, msg);
            } catch (backgroundErr) {
              console.error('Background task error (report email):', backgroundErr);
            }
          });

          return response.redirect(reportReadyRedirectUrl(order.order_id));
        }

        pool.query(
          `SELECT source_code FROM source_code WHERE id = ?`,
          [order.source_code_id],
          async (err, result) => {
            if (err) {
              console.error('Error retrieving source code:', err);
              return response.status(500).send('Unable to prepare download');
            }
            const zipName = (result[0] && result[0].source_code) || '';
            const project_link = verify.generateSignedUrl(
              `https://filemakr.com/images/${zipName}`,
              zipName
            );
            const amountNum = parseFloat(order.final_amount || decryptedJsonResponse.amount) || 0;

            setPaidCheckoutSession(request, {
              orderId: order.order_id,
              sourceCodeId: order.source_code_id,
              plan: order.plan === 'support' || amountNum > 200 ? 'support' : 'basic',
              productType: 'source',
              billingName: decryptedJsonResponse.billing_name || order.billing_name || '',
              billingEmail: decryptedJsonResponse.billing_email || order.billing_email || '',
              amount: order.final_amount || decryptedJsonResponse.amount || '',
              method: decryptedJsonResponse.payment_mode || order.payment_pref || 'UPI',
              productName: order.product_name || '',
              paymentDate: checkoutOrders.formatPaymentDate(order.paid_at || new Date()),
              zipFileName: zipName,
              addon: paidAddon
            });

            setImmediate(async () => {
              try {
                const userMessage = emailTemplates.soucrceCodeConfirmation.userMessage(
                  decryptedJsonResponse.billing_name || order.billing_name,
                  project_link
                );
                const adminSubject = emailTemplates.soucrceCodeConfirmation.adminSubject.replace(
                  '{{Customer_Name}}',
                  decryptedJsonResponse.billing_name || order.billing_name
                );
                const adminMessage = emailTemplates.soucrceCodeConfirmation.adminMessage(
                  decryptedJsonResponse.billing_name || order.billing_name,
                  decryptedJsonResponse.billing_tel || order.billing_tel,
                  project_link
                );
                const email = decryptedJsonResponse.billing_email || order.billing_email;
                if (email) {
                  await verify.sendUserMail(
                    email,
                    emailTemplates.soucrceCodeConfirmation.userSubject,
                    userMessage
                  );
                }
                await verify.sendUserMail('filemakrxpert@gmail.com', adminSubject, adminMessage);
              } catch (backgroundErr) {
                console.error('Background task error (email):', backgroundErr);
              }
            });

              return response.redirect(reportReadyRedirectUrl(order.order_id));
          }
        );
        return;
      }

      return response.json(decryptedJsonResponse);
    }

    // Gateway success but order row missing — try order id from decrypted payload
    if (String(decryptedJsonResponse.order_status || '') === 'Success' && gatewayOrderId) {
      const lateOrder = await checkoutOrders.findOrderForDownloadRestore(gatewayOrderId);
      if (lateOrder) {
        await restoreCheckoutSessionFromPaidOrder(request, lateOrder.order_id);
        return response.redirect(reportReadyRedirectUrl(lateOrder.order_id));
      }
    }
  } catch (fmErr) {
    console.error('fm_orders gateway handler error:', fmErr);
  }

  // Legacy payment_request / payment_response path (old flows only)
  const insertQuery = `INSERT INTO payment_response(order_id, tracking_id, bank_ref_no, order_status, failure_message, payment_mode, card_name, status_code, status_message, currency, amount, billing_name, billing_address, billing_city, billing_state, billing_zip, billing_tel, billing_email, trans_date) 
                         VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

  pool.query(
    insertQuery,
    [
      decryptedJsonResponse.order_id,
      decryptedJsonResponse.tracking_id,
      decryptedJsonResponse.bank_ref_no,
      decryptedJsonResponse.order_status,
      decryptedJsonResponse.failure_message,
      decryptedJsonResponse.payment_mode,
      decryptedJsonResponse.card_name,
      decryptedJsonResponse.status_code,
      decryptedJsonResponse.status_message,
      decryptedJsonResponse.currency,
      decryptedJsonResponse.amount,
      decryptedJsonResponse.billing_name,
      decryptedJsonResponse.billing_address,
      decryptedJsonResponse.billing_city,
      decryptedJsonResponse.billing_state,
      decryptedJsonResponse.billing_zip,
      decryptedJsonResponse.billing_tel,
      decryptedJsonResponse.billing_email,
      decryptedJsonResponse.trans_date
    ],
    (err, result) => {
      if (err) {
        console.error('Error inserting payment response:', err);
        throw err;
      } else {
        if (
          decryptedJsonResponse.order_status === 'Aborted' ||
          decryptedJsonResponse.order_status === 'Failure'
        ) {
          const legacyOrderId =
            decryptedJsonResponse.order_id || request.body.orderNo || request.session.fm_order_id || '';
          pool.query(
            `SELECT * FROM payment_request WHERE order_id = ?`,
            [legacyOrderId],
            async (err, result) => {
              if (err) {
                console.error('Error retrieving payment request:', err);
                return redirectCheckoutAfterPaymentDrop(request, response, { cancelled: true });
              }
              const pay = (result && result[0]) || {};
              if (pay.seo_name) {
                const dropOpts =
                  decryptedJsonResponse.order_status === 'Aborted' ? { cancelled: true } : { failed: true };
                const legacyOrder = {
                  seo_name: pay.seo_name,
                  payment_type: pay.type || 'source_code',
                  product_type: pay.type === 'source_code' ? 'source' : 'report',
                  plan:
                    pay.plan ||
                    (pay.type === 'synopsis'
                      ? 'synopsis'
                      : pay.type === 'project_report'
                        ? 'report'
                        : 'basic'),
                  addon_plan: null
                };
                return response.redirect(checkoutOrders.checkoutUrlFromOrder(legacyOrder, dropOpts));
              }
              return redirectCheckoutAfterPaymentDrop(request, response, { cancelled: true });
            }
          );
          return;
        } else if (decryptedJsonResponse.order_status === 'Success') {
          const legacyOrderId =
            decryptedJsonResponse.order_id || request.body.orderNo || request.session.fm_order_id || '';

          checkoutOrders
            .findOrderForDownloadRestore(legacyOrderId)
            .then(async (fmPaid) => {
              if (fmPaid) {
                await restoreCheckoutSessionFromPaidOrder(request, fmPaid.order_id);
                response.redirect(reportReadyRedirectUrl(fmPaid.order_id));
                return true;
              }
              return false;
            })
            .catch((legacyFmErr) => {
              console.error('legacy Success fm_orders fallback:', legacyFmErr.message || legacyFmErr);
              return false;
            })
            .then((handled) => {
              if (handled) return;
              pool.query(
            `update payment_request set status = 'success' where order_id = ?`,
            [legacyOrderId],
            (err, result) => {
              if (err) throw err;
              else {
                pool.query(
                  `SELECT * FROM payment_request WHERE order_id = ?`,
                  [legacyOrderId],
                  (err, payRows) => {
                    if (err) {
                      console.error('Error retrieving payment request:', err);
                      throw err;
                    } else {
                      const pay = payRows[0] || {};
                      const payType = String(pay.type || 'source_code');

                      if (
                        payType === 'synopsis' ||
                        payType === 'project_report' ||
                        payType === 'customized_report' ||
                        payType === 'originality_report'
                      ) {
                        request.session.ispayment = 'done';
                        request.session.paid_source_code_id = pay.source_code_id;
                        request.session.paid_plan =
                          payType === 'synopsis'
                            ? 'synopsis'
                            : payType === 'customized_report'
                              ? 'customized'
                              : payType === 'originality_report'
                                ? 'originality'
                                : 'report';
                        request.session.paid_product_type = 'report';
                        request.session.paid_order_id = pay.order_id || legacyOrderId;
                        request.session.paid_billing_name =
                          decryptedJsonResponse.billing_name || pay.billing_name || '';
                        request.session.paid_billing_email =
                          decryptedJsonResponse.billing_email || pay.billing_email || '';
                        request.session.paid_amount =
                          pay.final_amount || pay.amount || decryptedJsonResponse.amount || '';
                        request.session.paid_method =
                          decryptedJsonResponse.payment_mode || pay.payment_mode || 'UPI';
                        request.session.paid_product_name = '';
                        request.session.paid_date = new Date().toLocaleString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                          hour12: true
                        });

                        setImmediate(async () => {
                          try {
                            const planLabel = payType === 'synopsis' ? 'Synopsis' : 'Project Report';
                            const dl = 'https://www.filemakr.com/download-instant-report';
                            const subject = `Your ${planLabel} is ready — FileMakr`;
                            const msg = `Hi ${decryptedJsonResponse.billing_name || 'there'},\n\nPayment received. Download your ${planLabel} (Word) here:\n${dl}\n\n— FileMakr`;
                            if (decryptedJsonResponse.billing_email) {
                              await verify.sendUserMail(
                                decryptedJsonResponse.billing_email,
                                subject,
                                msg
                              );
                            }
                          } catch (backgroundErr) {
                            console.error('Background task error (report email):', backgroundErr);
                          }
                        });

                        return response.redirect(
                          reportReadyRedirectUrl(pay.order_id || legacyOrderId)
                        );
                      }

                      if (!pay.source_code_id) {
                        return response.redirect(reportReadyRedirectUrl(legacyOrderId));
                      }

                      pool.query(
                        `SELECT source_code FROM source_code WHERE id = ?`,
                        [pay.source_code_id],
                        async (err, result) => {
                          if (err) {
                            console.error('Error retrieving source code:', err);
                            return response.redirect(reportReadyRedirectUrl(legacyOrderId));
                          }
                          if (!result || !result[0]) {
                            return response.redirect(reportReadyRedirectUrl(legacyOrderId));
                          }
                          console.log('source code', result);
                            let project_link = verify.generateSignedUrl(
                              `https://filemakr.com/images/${result[0].source_code}`,
                              result[0].source_code
                            );

                            const downloadSuccessLocals = {
                              result,
                              Metatags: onPageSeo.refundPage,
                              CommonMetaTags: onPageSeo.commonMetaTags,
                              msg: '',
                              category: request.categories,
                              fullUrl: request.fullUrl,
                              navOnly: true,
                              active: 'source-code',
                              graduation_type_send: '',
                              conversionTrack: {
                                order_id: String(
                                  decryptedJsonResponse.order_id || request.body.orderNo || ''
                                ),
                                value: parseFloat(decryptedJsonResponse.amount) || 1,
                                currency: String(
                                  decryptedJsonResponse.currency || 'INR'
                                ).toUpperCase(),
                                email: decryptedJsonResponse.billing_email || '',
                                product_type: 'source_code',
                                item_name:
                                  result[0] && result[0].source_code
                                    ? 'Source Code - ' + result[0].source_code
                                    : 'Source Code',
                                item_category: 'Source Code'
                              }
                            };

                            if (decryptedJsonResponse.amount > 110) {
                              response.render('download-successfull', {
                                ...downloadSuccessLocals,
                                setupSupport: true
                              });
                            } else {
                              response.render('download-successfull', {
                                ...downloadSuccessLocals,
                                setupSupport: false
                              });
                            }

                            setImmediate(async () => {
                              try {
                                const userMessage =
                                  emailTemplates.soucrceCodeConfirmation.userMessage(
                                    decryptedJsonResponse.billing_name,
                                    project_link
                                  );

                                const adminSubject =
                                  emailTemplates.soucrceCodeConfirmation.adminSubject.replace(
                                    '{{Customer_Name}}',
                                    decryptedJsonResponse.billing_name
                                  );
                                const adminMessage =
                                  emailTemplates.soucrceCodeConfirmation.adminMessage(
                                    decryptedJsonResponse.billing_name,
                                    decryptedJsonResponse.billing_tel,
                                    project_link
                                  );

                                await verify.sendUserMail(
                                  decryptedJsonResponse.billing_email,
                                  emailTemplates.soucrceCodeConfirmation.userSubject,
                                  userMessage
                                );
                                await verify.sendUserMail(
                                  'filemakrxpert@gmail.com',
                                  adminSubject,
                                  adminMessage
                                );
                              } catch (backgroundErr) {
                                console.error('Background task error (email):', backgroundErr);
                              }
                            });
                        }
                      );
                    }
                  }
                );
              }
            }
          );
            });
        } else {
          response.json(decryptedJsonResponse);
        }
      }
    }
  );
});



// router.get('/check-page',dataService.allCategory,(request,res)=>{
//    pool.query(`SELECT source_code,seo_name FROM source_code WHERE id = ?`, ['64'], async(err, result) => {
// if(err) throw err;
// else
//    res.render('download-successfull', { result: result,Metatags:onPageSeo.refundPage,CommonMetaTags:onPageSeo.commonMetaTags,msg:'',category:request.categories ,fullUrl:request.fullUrl,graduation_type_send:'',active:'source-code',setupSupport:false});
//    })
// })


// router.get('/images/:resource', (req, res) => {
//     // If the token is valid, the user can access the resource
//     res.sendFile(`/images/${req.resource}`);
// });



router.post('/ccavRequestHandler1',dataService.date_and_time, function (req, res){

    req.session.source_code_id = req.body.source_code_id;
    req.session.type = 'project_report'
    let body = req.body;

    // in ccavRequestHandler1
body['coupon_code']  = req.body.coupon_code || '';
body['final_amount'] = req.body.final_amount || '10.00';


    let amount = req.body.final_amount;
    console.log('amount',amount)
    
    let guid = () => {
        let s4 = () => {
            return Math.floor((1 + Math.random()) * 0x10000)
                .toString(16)
                .substring(1);
        }
        //return id of format 'aaaaaaaa'-'aaaa'-'aaaa'-'aaaa'-'aaaaaaaaaaaa'
        return s4() + s4() + '-' + s4() + '-' + s4() + '-' + s4() + '-' + s4() + s4() + s4();
    }

    body['merchant_id'] = '1760015';
    body['order_id'] = guid();
    body['currency'] = 'INR';
    body['amount'] = amount;
    body['redirect_url'] = 'https://www.filemakr.com/ccavResponseHandler1';
    body['cancel_url'] =   'https://www.filemakr.com/ccavResponseHandler1';
    body['source_code_id'] = req.session.source_code_id;
    body['type'] = 'project_report'
    body['seo_name'] = req.body.seo_name;
    body['date'] = verify.getCurrentDate();
    body['roll_number'] = req.session.roll_number
   



   pool.query(`insert into payment_request set ?`,body,(err,result)=>{
    if(err) throw err;
    else{
   
// ccavReqHandler.postReq(req, response);
console.log(req.body)
const encryptedOrderData = ccave.getEncryptedOrder(req.body);
// console.log(encryptedOrderData);

console.log('payment k response tk sahi h',req.session) 


res.render('send1',{enccode:encryptedOrderData,accesscode:'AVZN72JL86AQ28NZQA'})
    }
   })
});



/**
 * Project report checkout (all degrees) — was POST /:degree-final-year-project-report/insert
 * on routers that are not mounted on the main app. Inserts into the correct *\_project table
 * and auto-submits to CCAvenue like routes/B.Tech/index.js
 */
const REPORT_DEGREE_TO_TABLE = {
  'B.Tech': 'btech_project',
  'M.Tech': 'mtech_project',
  'B.E.': 'be_project',
  'M.E.': 'me_project',
  'BCA': 'bca_project',
  'MCA': 'mca_project',
  'BSc': 'btech_project',
  'MSc': 'btech_project'
};

/** URL slug (from /:graduation_type-...) → DB table; most reliable for checkout. */
const DEGREE_SLUG_TO_TABLE = {
  btech: 'btech_project',
  mtech: 'mtech_project',
  be: 'be_project',
  me: 'me_project',
  bca: 'bca_project',
  mca: 'mca_project',
  bsc: 'btech_project',
  msc: 'btech_project'
};

function resolveProjectReportTable(req) {
  const slug = (req.body.degree_key || '').toString().toLowerCase().trim();
  if (slug && DEGREE_SLUG_TO_TABLE[slug]) {
    return DEGREE_SLUG_TO_TABLE[slug];
  }
  const label = (req.body.report_type || '').toString().trim();
  if (label && REPORT_DEGREE_TO_TABLE[label]) {
    return REPORT_DEGREE_TO_TABLE[label];
  }
  return null;
}

function projectReportTodayStr() {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}

function escPayAttr(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

/**
 * btech_project was extended with `frontend` / `backend` text columns.
 * bca_project, mca_project, etc. still use one column per language (html, php, nodejs, …) like routes/BCA/index.js
 */
const LEGACY_PL_NAME_TO_COL = {
  html: 'html',
  css: 'css',
  javascript: 'javascript',
  bootstrap: 'bootstrap',
  jquery: 'jquery',
  json: 'json',
  react: 'react',
  'react js': 'react',
  angular: 'angular',
  angularjs: 'angular',
  'angular js': 'angular',
  php: 'php',
  java: 'java',
  python: 'python',
  'node.js': 'nodejs',
  nodejs: 'nodejs',
  'node js': 'nodejs',
  laravel: 'laravel',
  codeigniter: 'codeigniter',
  django: 'django',
  mysql: 'mysql',
  mongodb: 'mongodb',
  postgresql: 'postgresql',
  xml: 'xml',
  android: 'android',
  'vue.js': 'vue',
  vue: 'vue',
  'express.js': 'express',
  express: 'express',
  kotlin: 'kotlin',
  flutter: 'flutter',
  'react native': 'react',
  'machine learning': 'ml'
};

/** Per-language FK columns that exist on legacy *\_project tables (see routes/BCA/index.js / old forms). */
const LEGACY_PROJECT_LANG_COLUMNS = new Set([
  'html', 'css', 'bootstrap', 'javascript', 'jquery', 'json', 'react', 'angular',
  'php', 'nodejs', 'python', 'java'
]);

function plDisplayNameToColumn(name) {
  if (!name || typeof name !== 'string') return null;
  const k = name.toLowerCase().replace(/\s+/g, ' ').trim();
  if (LEGACY_PL_NAME_TO_COL[k]) return LEGACY_PL_NAME_TO_COL[k];
  const compact = k.replace(/[^a-z0-9]/g, '');
  if (compact.length > 0 && compact.length < 40) {
    if (['nodejs', 'javascript', 'bootstrap', 'codeigniter', 'postgresql', 'mongodb'].includes(compact)) return compact;
  }
  return null;
}

async function buildProjectReportInsertRow(req, table) {
  const body = { ...req.body };
  const frontendArr = Array.isArray(req.body.frontend)
    ? req.body.frontend
    : (req.body.frontend ? [req.body.frontend] : []);
  const backendArr = Array.isArray(req.body.backend)
    ? req.body.backend
    : (req.body.backend ? [req.body.backend] : []);
  const allIds = [...new Set(
    [...frontendArr, ...backendArr]
      .map((x) => String(x == null ? '' : x).trim())
      .filter((x) => x.length > 0)
  )];

  body.college_logo = req.files?.college_logo?.[0]?.filename || null;
  body.affilated_college_logo = req.files?.affilated_college_logo?.[0]?.filename || null;
  body.date = projectReportTodayStr();
  body.view = req.session.deviceInfo;
  delete body.report_type;
  delete body.degree_key;

  if (table === 'btech_project') {
    body.frontend = frontendArr.join(', ');
    body.backend = backendArr.join(', ');
    body.status = 'pending';
    return body;
  }

  delete body.status;
  delete body.coupon_code;
  delete body.final_amount;
  delete body.project_type;
  delete body.frontend;
  delete body.backend;
  // Legacy *\_project tables (BCA, MCA, …) predate the unified form; they have no `email` column.
  // Keep email only on btech_project; still read from req.body for payment + welcome emails in the route.
  delete body.email;
  // Unified form adds extra group members; legacy tables only have friend / roll_number1 / friend1 / roll_number2.
  ['friend3', 'friend4', 'roll_number3', 'roll_number4'].forEach((k) => {
    delete body[k];
  });

  if (allIds.length > 0) {
    const rows = await queryAsync('SELECT id, name FROM programming_language WHERE id IN (?)', [allIds]);
    for (const row of rows || []) {
      const col = plDisplayNameToColumn(row.name);
      if (col && LEGACY_PROJECT_LANG_COLUMNS.has(col)) {
        body[col] = row.id;
      }
    }
  }

  return body;
}

router.post(
  '/project-report-checkout/submit',
  upload.fields([{ name: 'college_logo', maxCount: 1 }, { name: 'affilated_college_logo', maxCount: 1 }]),
  async (req, res) => {
    try {
      const table = resolveProjectReportTable(req);
      if (!table) {
        return res.status(400).send('Invalid or missing degree. Use a valid program link or refresh the page.');
      }

      const body = await buildProjectReportInsertRow(req, table);
      req.session.roll_number = body.roll_number;
      req.session.project_report_table = table;
      const customerEmail = (req.body && String(req.body.email || '').trim()) || (body.email || '');

      await queryAsync(`INSERT INTO ${table} SET ?`, body);

      setImmediate(async () => {
        try {
          const title_case_name = (body.seo_name || '')
            .split('-')
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(' ');
          const userSubject = emailTemplates.welcomeMessage.userSubject.replace('{{Customer_Name}}', body.name);
          const userMessage = emailTemplates.welcomeMessage.userMessage(body.name);
          const userSubject1 = emailTemplates.beforprojectreport.userSubject.replace('{{Project_Name}}', title_case_name);
          const userMessage1 = emailTemplates.beforprojectreport.userMessage(body.name, title_case_name, req.session.roll_number);
          if (customerEmail) {
            await verify.sendUserMail(customerEmail, userSubject, userMessage);
            await verify.sendUserMail(customerEmail, userSubject1, userMessage1);
          }
        } catch (e) {
          console.error('project-report-checkout email error:', e);
        }
      });

      const source_code_id = body.projectid || req.body.projectid || '';
      const coupon_code = (req.body.coupon_code || body.coupon_code || '');
      const seo_name = body.seo_name || '';
      const name = body.name || '';
      const number = body.number || '';
      const email = customerEmail;
      const final_amount = (req.body.final_amount || body.final_amount || '');

      res.set('Content-Type', 'text/html; charset=utf-8');
      return res.send(`<!doctype html>
<html><head>
  <meta charset="utf-8">
  <title>Redirecting to Payment…</title>
  <noscript>
    <style>form{display:block !important}</style>
  </noscript>
</head>
<body>
  <form id="autoPay" action="/ccavRequestHandler1" method="post" style="display:none">
    <input type="hidden" name="source_code_id" value="${escPayAttr(source_code_id)}">
    <input type="hidden" name="seo_name" value="${escPayAttr(seo_name)}">
    <input type="hidden" name="coupon_code" value="${escPayAttr(coupon_code)}">
    <input type="hidden" name="billing_name" value="${escPayAttr(name)}">
    <input type="hidden" name="billing_tel" value="${escPayAttr(number)}">
    <input type="hidden" name="billing_email" value="${escPayAttr(email)}">
    <input type="hidden" name="final_amount" value="${escPayAttr(final_amount)}">
  </form>
  <script>
    try { document.getElementById('autoPay').submit(); }
    catch(e) {}
  </script>
  <noscript>
    <p>Click continue to proceed to payment.</p>
    <button type="submit" form="autoPay">Continue</button>
  </noscript>
</body></html>`);
    } catch (e) {
      console.error('project-report-checkout error:', (e && e.message) || e, (e && e.sqlMessage) || '');
      return res.status(500).send('Could not save your order. Please try again.');
    }
  }
);

router.post('/ccavResponseHandler1',(req,response)=>{
    const { encResp } = req.body;
    
    // console.log('after payment', req.session);

    
    let decryptedJsonResponse = ccave.redirectResponseToJson(encResp);
    
    // response.json(req.session.source_code_id)
    
    // console.log(req.body)
    
    decryptedJsonResponse.type = 'project_report'
    decryptedJsonResponse.typeid = req.session.source_code_id;
    
    
    // response.json({msg:'hi'})
    
    
    pool.query(`insert into payment_response(order_id , tracking_id , bank_ref_no , order_status , failure_message , payment_mode , card_name , status_code , status_message , currency , amount , billing_name , billing_address , billing_city , billing_state , billing_zip , billing_tel , billing_email , trans_date) 
    values('${decryptedJsonResponse.order_id}' , '${decryptedJsonResponse.tracking_id}' , '${decryptedJsonResponse.bank_ref_no}' , '${decryptedJsonResponse.order_status}' , '${decryptedJsonResponse.failure_message}' , '${decryptedJsonResponse.payment_mode}' , '${decryptedJsonResponse.card_name}' , '${decryptedJsonResponse.status_code}' , '${decryptedJsonResponse.status_message}' , '${decryptedJsonResponse.currency}' , '${decryptedJsonResponse.amount}', '${decryptedJsonResponse.billing_name}' , '${decryptedJsonResponse.billing_address}' , '${decryptedJsonResponse.billing_city}', '${decryptedJsonResponse.billing_state}' , '${decryptedJsonResponse.billing_zip}', '${decryptedJsonResponse.billing_tel}', '${decryptedJsonResponse.billing_email}' , '${decryptedJsonResponse.trans_date}')`,(err,result)=>{
        if(err) throw err;
        else{
            if(decryptedJsonResponse.order_status == 'Aborted' || decryptedJsonResponse.order_status == 'Failure'){
                // response.json({msg:'aborted or failed'})
    response.redirect(`https://www.filemakr.com/btech-final-year-project-report/projects`)
    
    
            }
            else if(decryptedJsonResponse.order_status == 'Success'){
               
                pool.query(`select * from payment_request where order_id = '${req.body.orderNo}' limit 1`,(err,result)=>{
                    if(err) throw err;
                    else {

    req.session.roll_number = result[0].roll_number;
    req.session.ispayment ='done';

pool.query(`update payment_request set status = 'success' where order_id = '${req.body.orderNo}'`,(err,result)=>{
    if(err) throw err;
    else {
        const prTable = projectReportShared.safeTableName(req.session.project_report_table);
        const upSql = `UPDATE \`${prTable}\` SET \`status\` = 'success' WHERE \`roll_number\` = ? ORDER BY \`id\` DESC LIMIT 1`;
        pool.query(upSql, [req.session.roll_number], async (eUp) => {
            if (eUp) {
                console.error('project report status update (ccavResponseHandler1)', prTable, eUp && eUp.sqlMessage ? eUp.sqlMessage : eUp);
            }

                let project_link = `https://filemakr.com/download-my-report?roll_number=${req.session.roll_number}`
                const userMessage = emailTemplates.orderConfirmation.userMessage(decryptedJsonResponse.billing_name,project_link);
    
                const adminSubject = emailTemplates.orderConfirmation.adminSubject.replace('{{Customer_Name}}', decryptedJsonResponse.billing_name);
                const adminMessage = emailTemplates.orderConfirmation.adminMessage(decryptedJsonResponse.billing_name , decryptedJsonResponse.billing_tel,req.session.roll_number,project_link);
    
    
                try {
                await verify.sendUserMail(decryptedJsonResponse.billing_email,emailTemplates.orderConfirmation.userSubject,userMessage);
                await verify.sendUserMail('filemakrxpert@gmail.com',adminSubject,adminMessage);
                } catch (mailErr) { console.error('ccav project_report mail', mailErr); }
                req.session.conversionTrack = {
                    order_id: String(decryptedJsonResponse.order_id || req.body.orderNo || ''),
                    value: parseFloat(decryptedJsonResponse.amount) || 1,
                    currency: String(decryptedJsonResponse.currency || 'INR').toUpperCase(),
                    email: decryptedJsonResponse.billing_email || '',
                    product_type: 'project_report',
                    item_name: 'Project Report',
                    item_category: 'Project Report'
                };
                response.redirect('/download-project-report')
        })
    }
})
   
    
                    }
    
                })
       
        
                    }
                   
               
          
            else{
    
                response.json(decryptedJsonResponse)
    
              
            }
        }
    })
    
    
    })



// router.get('/download-project-report',(req,res)=>{
//     // req.session.roll_number = '0904cs151020'
//     // req.session.roll_number = '21btrcs212'

//     if(req.session.roll_number){


//         if(req.session.deviceInfo == 'mobile'){
        
        
        
        
//           pool.query(`select * from btech_project where roll_number = '${req.session.roll_number}' order by id desc limit 1`,(err,result)=>{
//                 if(err) throw err;
//                 else {
//                     console.log(req.session.roll_number)
//                     console.log(result[0].php)
//                    var query = `select * from btech_project where roll_number = '${req.session.roll_number}' order by id desc limit 1;`
//                    var query1 = `select * from programming_language where id = '${result[0].html}' or id = '${result[0].css}' or id = '${result[0].bootstrap}' or id = '${result[0].javascript}' or id = '${result[0].jquery}' or id = '${result[0].json}' or id = '${result[0].react}' or id = '${result[0].angular}'  ;`
//                    var query2 = `select * from programming_language where id = '${result[0].php}' or id = '${result[0].nodejs}' or id = '${result[0].python}' or id = '${result[0].java}';`
//                    var query3 = `select * from project where id = '${result[0].projectid}';`
//                    //For Testing
        
//                    pool.query(query+query1+query2+query3,(err,result)=>{
//                        if(err) throw err;
//                        //else res.json(result)
//                        else res.render('B.Tech/finalnew',{result:result})
//                    })
        
//                 }
//             })
        
        
        
//         }
//         else{
        
        
//           pool.query(`select * from btech_project where roll_number = '${req.session.roll_number}' order by id desc limit 1`,(err,result)=>{
//                 if(err) throw err;
//                 else {
//                     console.log(req.session.roll_number)
//                     console.log('laravl',result[0].laravel)
//                    var query = `select * from btech_project where roll_number = '${req.session.roll_number}' order by id desc limit 1;`
//                    var query1 = `select * from programming_language where id = '${result[0].html}' or id = '${result[0].css}' or id = '${result[0].bootstrap}' or id = '${result[0].javascript}' or id = '${result[0].jquery}' or id = '${result[0].json}' or id = '${result[0].react}' or id = '${result[0].angular}'  ;`
//                    var query2 = `select * from programming_language where id = '${result[0].php}' or id = '${result[0].nodejs}' or id = '${result[0].python}' or id = '${result[0].java}'  or id = '${result[0].laravel}';`
//                    var query3 = `select * from project where id = '${result[0].projectid}';`
//                  //For Testing
        
//                    pool.query(query+query1+query2+query3,(err,result)=>{
//                        if(err) throw err;
//                        else res.render('B.Tech/finalnew',{result:result})
//                    })
        
//                 }
//             })
        
//         }
        
        
//         }
//         else{
//             res.redirect('/')
//         }
// })



router.get('/download-project-report', async (req, res) => {
    const paidOrderId = String(req.session.paid_order_id || req.session.fm_order_id || '').trim();
    if (req.session.ispayment === 'done' && paidOrderId && !req.session.roll_number) {
        return res.redirect(reportReadyRedirectUrl(paidOrderId));
    }
    console.log('download-project-report session', req.session.ispayment, req.session.roll_number, req.session.project_report_table);
    if (!req.session.roll_number || !req.session.ispayment) {
        return res.redirect('/');
    }
    try {
        const found = await projectReportShared.findLatestProjectReport(
            req.session.roll_number,
            req.session.project_report_table
        );
        if (!found) {
            return res.redirect('/');
        }
        const result = await projectReportShared.buildBtechStyleReportResult(found.row, found.table);
        const project_type = projectReportShared.projectTypeLabel(result[0][0].report_type) || result[0][0].report_type;
        let conversionTrack = null;
        if (req.session.conversionTrack) {
            conversionTrack = req.session.conversionTrack;
            delete req.session.conversionTrack;
        }
        return res.render('B.Tech/finalnew', { result, project_type, conversionTrack });
    } catch (e) {
        console.error('download-project-report', (e && e.message) || e, (e && e.sqlMessage) || '');
        return res.redirect('/');
    }
});



router.get('/download-project-report1', async (req, res) => {
    if (!req.session.roll_number) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    try {
        const found = await projectReportShared.findLatestProjectReport(
            req.session.roll_number,
            req.session.project_report_table
        );
        if (!found) {
            return res.status(404).json({ error: 'Not found' });
        }
        const result = await projectReportShared.buildBtechStyleReportResult(found.row, found.table);
        return res.json(result);
    } catch (e) {
        console.error('download-project-report1', (e && e.message) || e, (e && e.sqlMessage) || '');
        return res.status(500).json({ error: 'Server error' });
    }
});















router.get('/index2', (req, res) => {
  res.redirect(301, '/');
});





router.use((req, res, next) => {
    req.startTime = Date.now();
    next();
});

// ========== 404 FIX: Permanent redirects for old/broken URLs ==========
const URL_REDIRECTS = {
  '/terms': '/terms-and-conditions',
  '/final-year-project-tools': '/final-year-project-ideas',
  '/final-year-projects-list': '/final-year-project-ideas',
  '/privacy': '/privacy-policy',
  '/refund': '/refund-policy',
};
router.get(Object.keys(URL_REDIRECTS), (req, res) => {
  const target = URL_REDIRECTS[req.path] || '/';
  res.redirect(301, target);
});

// using this route — lean homepage payload (no SELECT *, no unused blogs)
router.get('/', dataService.allCategory, async (req, res) => {
    try {
        res.setHeader('X-Robots-Tag', 'index, follow');

        if (req.query.referral) {
            req.session.referralCode = req.query.referral;
        }

        // Only columns the homepage template reads; keep row counts small.
        // Note: source_code has no created_at — order by id DESC for recency.
        const scCols = 'id, name, seo_name, category, image, demo_url, LEFT(description, 280) AS description';
        const stripByCategory = (cat, limit = 5) =>
            queryAsync(
                `SELECT ${scCols} FROM source_code WHERE category = ? ORDER BY id DESC LIMIT ?`,
                [cat, limit]
            );

        const [sourceCode, liveproject, homeStrips] = await Promise.all([
            queryAsync(
                `SELECT ${scCols} FROM source_code ORDER BY id DESC LIMIT 48`
            ),
            queryAsync(
                `SELECT ${scCols} FROM source_code
                 WHERE demo_url IS NOT NULL AND demo_url != ''
                 ORDER BY id DESC LIMIT 12`
            ),
            Promise.all([
                stripByCategory('php', 5),
                stripByCategory('python', 5),
                stripByCategory('machine-learning', 5),
            ]).then(([php, python, ml]) => ({ php, python, ml }))
        ]);

        res.render('index1', {
            Metatags: onPageSeo.homePage,
            CommonMetaTags: onPageSeo.commonMetaTags,
            sourceCode,
            liveproject,
            homeStrips,
            blogs: [],
            category: req.categories,
            fullUrl: req.fullUrl,
            active: 'home',
            graduation_type_send: '',
            homeLite: true
        });

        if (req.startTime) {
            console.log(`Homepage response time: ${Date.now() - req.startTime}ms`);
        }
    } catch (err) {
        console.error(err);
        res.status(500).send('Internal Server Error');
    }
});



router.get('/contact-us',dataService.allCategory,async (req, res) => { 
      res.render('contact',{Metatags:onPageSeo.contactPage,CommonMetaTags:onPageSeo.commonMetaTags,msg:'',category:req.categories,fullUrl:req.fullUrl,active:'',graduation_type_send:''})
   })


   router.get('/about-us',dataService.allCategory,async(req, res) => {
    res.render('aboutus',{Metatags:onPageSeo.aboutPage,CommonMetaTags:onPageSeo.commonMetaTags,msg:'',category:req.categories,fullUrl:req.fullUrl,active:'',graduation_type_send:''})
 })  
 
 
router.get('/refund-policy',dataService.allCategory,async (req, res) => {
    res.render('refund',{Metatags:onPageSeo.refundPage,CommonMetaTags:onPageSeo.commonMetaTags,msg:'',category:req.categories,fullUrl:req.fullUrl,active:'',graduation_type_send:''})
});


router.get('/privacy-policy',dataService.allCategory,async(req, res) => { 
    res.render('privacy',{Metatags:onPageSeo.privacyPage,CommonMetaTags:onPageSeo.commonMetaTags,msg:'',category:req.categories,fullUrl:req.fullUrl,active:'',graduation_type_send:''})
 })


 router.get('/terms-and-conditions',dataService.allCategory,async(req, res) => { 
    res.render('terms',{Metatags:onPageSeo.termsPage,CommonMetaTags:onPageSeo.commonMetaTags,msg:'',category:req.categories,fullUrl:req.fullUrl,active:'',graduation_type_send:''})
 })



// router.post('/get-html-response',(req,res)=>{
//     pool.query(`select ${req.body.value} from source_code where id = '${req.body.id}'`,(err,result)=>{
//         if(err) throw err;
//         else res.json(result);
//     })
// })

router.post('/get-html-response', (req, res) => {
    const { value, id } = req.body;
    const query = `SELECT ${pool.escapeId(value)} FROM source_code WHERE id = ?`;
    
    pool.query(query, [id], (err, result) => {
        if (err) {
            console.error('Error executing SQL query:', err);
            return res.status(500).json({ error: 'Internal Server Error' });
        }
        
        res.json(result);
    });
});



// router.post('/contact-us',dataService.date_and_time,async(req,res)=>{
//     let body = req.body
//     body['date'] = req.currentDate

//     pool.query(`insert into contactus set ?`,body,(err,result)=>{
//         if(err) throw err;
//         else{

//             let category = await dataService.allCategory
//       res.render('contact',{Metatags:onPageSeo.contactPage,CommonMetaTags:onPageSeo.commonMetaTags,msg:'Our team will contact you soon',category:category})
   
//         }

//     })
// //     pool.query(`insert into contactus set ?`,body,(err,result)=>{(
// //     if(err) throw err;
// //     else{

// //     }
// // })
// })




router.post('/contact-us', dataService.date_and_time, dataService.allCategory, async (req, res) => {
    try {
        const phone = String((req.body && req.body.phone) || '').trim();
        let message = String((req.body && req.body.message) || '').trim();
        if (phone) {
            message = `Phone: ${phone}\n\n${message}`;
        }

        // contactus columns: name, email, subject, message (+ date/status)
        const body = {
            name: String((req.body && req.body.name) || '').trim(),
            email: String((req.body && req.body.email) || '').trim(),
            subject: String((req.body && req.body.subject) || '').trim(),
            message,
            date: req.currentDate,
            status: 'pending'
        };

        // Honeypot: silently accept but skip insert
        if (req.body && req.body.company) {
            return res.render('contact', {
                Metatags: onPageSeo.contactPage,
                CommonMetaTags: onPageSeo.commonMetaTags,
                msg: 'Our team will contact you soon',
                category: req.categories,
                fullUrl: req.fullUrl,
                active: '',
                graduation_type_send: ''
            });
        }

        pool.query('INSERT INTO contactus SET ?', body, async (err, result) => {
            if (err) {
                console.error('Error inserting into contactus:', err);
                throw err;
            } else {
                try {
                    res.render('contact', {
                        Metatags: onPageSeo.contactPage,
                        CommonMetaTags: onPageSeo.commonMetaTags,
                        msg: 'Our team will contact you soon',
                        category: req.categories,
                        fullUrl: req.fullUrl,
                        active: '',
                        graduation_type_send: ''
                    });
                } catch (error) {
                    console.error('Error accessing categories from req:', error);
                    throw error;
                }
            }
        });
    } catch (error) {
        console.error('Error processing contact form:', error);
        res.status(500).send('Internal Server Error');
    }
});






router.get('/synopsis', (req, res) => {
    res.redirect('/btech-final-year-project-report')
})



//old route
router.get('/cse/:name',(req,res)=>{
    res.redirect(projectReportShared.projectReportUrl(req.params.name))
})



// new btech route




// using this routes
router.get('/final-year-project-ideas', dataService.allCategory, async (req, res) => {
  res.setHeader('X-Robots-Tag', 'index, follow');
  res.setHeader('Cache-Control', 'public, max-age=60');

  const CACHE_TTL_MS = 60 * 1000;
  const PR_CACHE_V = 3;
  if (!global.__projectReportSourceCache || global.__projectReportSourceCache.v !== PR_CACHE_V) {
    global.__projectReportSourceCache = { v: PR_CACHE_V, data: null, exp: 0 };
  }
  const cache = global.__projectReportSourceCache;

  try {
    let rows;
    if (cache.data && cache.exp > Date.now()) {
      rows = cache.data;
    } else {
      const sql = `
        SELECT id, name, seo_name, category, image,
               LEFT(description, 160) AS description
        FROM source_code
        ORDER BY id DESC
      `;
      const [result] = await pool.promise().query(sql);
      rows = result;
      cache.data = rows;
      cache.exp = Date.now() + CACHE_TTL_MS;
    }

    res.render('project-ideas', {
      result: rows,
      graduation_type_send: 'Final Year',
      original: 'btech',
      ideasPage: true,
      Metatags: onPageSeo.projectPage,
      CommonMetaTags: onPageSeo.commonMetaTags,
      category: req.categories,
      msg: '',
      fullUrl: req.fullUrl,
      active: 'report',
      listCtaLabel: 'View Idea'
    });
  } catch (err) {
    console.error('final-year-project-ideas error:', err);
    res.status(500).render('error', {
      message: 'Something went wrong. Please try again.',
      error: process.env.NODE_ENV === 'development' ? err : {},
    });
  }
})


// using this route
router.get('/source-code', dataService.allCategory, async (req, res) => {
  res.setHeader('X-Robots-Tag', 'index, follow');
  res.setHeader('Cache-Control', 'public, max-age=60');

  const CACHE_TTL_MS = 60 * 1000;
  const SC_CACHE_V = 1;
  if (!global.__sourceCodeListCache || global.__sourceCodeListCache.v !== SC_CACHE_V) {
    global.__sourceCodeListCache = { v: SC_CACHE_V, data: null, exp: 0 };
  }
  const cache = global.__sourceCodeListCache;

  try {
    let rows;
    if (cache.data && cache.exp > Date.now()) {
      rows = cache.data;
    } else {
      const sql = `
        SELECT id, name, seo_name, category, image, demo_url,
               LEFT(description, 160) AS description
        FROM source_code
        ORDER BY id DESC
      `;
      const [result] = await pool.promise().query(sql);
      rows = result;
      cache.data = rows;
      cache.exp = Date.now() + CACHE_TTL_MS;
    }

    res.render('source_code', {
      result: rows,
      graduation_type_send: 'Final Year',
      original: '',
      sourceCodePage: true,
      Metatags: onPageSeo.sourcePage,
      CommonMetaTags: onPageSeo.commonMetaTags,
      category: req.categories,
      msg: '',
      fullUrl: req.fullUrl,
      active: 'source-code',
      listCtaLabel: 'Get Source Code'
    });
  } catch (err) {
    console.error('source-code list error:', err);
    res.status(500).render('error', {
      message: 'Something went wrong. Please try again.',
      error: process.env.NODE_ENV === 'development' ? err : {},
    });
  }
})



    // using this route
router.get('/demo', dataService.allCategory, async (req, res) => {
  res.setHeader('X-Robots-Tag', 'index, follow');
  res.setHeader('Cache-Control', 'public, max-age=60');

  try {
    const [liveRows] = await pool.promise().query(`
      SELECT id, title AS name, description, demo_link AS demo_url, seo_slug,
             NULL AS image, tech_stack AS category,
             LEFT(IFNULL(description, ''), 160) AS short_description
      FROM live_demo
      WHERE is_active = 1
      ORDER BY id DESC
    `);
    const [codeRows] = await pool.promise().query(`
      SELECT id, name, description, demo_url, NULL AS seo_slug,
             image, category,
             LEFT(IFNULL(description, ''), 160) AS short_description
      FROM source_code
      WHERE demo_url IS NOT NULL AND demo_url != ''
      ORDER BY id DESC
    `);

    const result = [...(liveRows || []), ...(codeRows || [])].map((row) => ({
      ...row,
      description: row.short_description || row.description || ''
    }));

    res.render('live_demo', {
      result,
      graduation_type_send: 'Final Year',
      original: '',
      liveDemoPage: true,
      Metatags: onPageSeo.homePage,
      CommonMetaTags: onPageSeo.commonMetaTags,
      category: req.categories,
      fullUrl: req.fullUrl,
      active: 'demo',
      listCtaLabel: 'Try Live Demo'
    });
  } catch (err) {
    console.error('demo list error:', err);
    res.status(500).render('error', {
      message: 'Something went wrong. Please try again.',
      error: process.env.NODE_ENV === 'development' ? err : {},
    });
  }
});

// Single live demo page (SEO-friendly slug from live_demo table)
router.get('/demo/:slug', dataService.allCategory, async (req, res) => {
  const slug = (req.params.slug || '').toString().trim();
  if (!slug) return res.redirect('/demo');
  try {
    const [rows] = await pool.promise().query(
      `SELECT * FROM live_demo WHERE seo_slug = ? AND is_active = 1 LIMIT 1`,
      [slug]
    );
    if (!rows || rows.length === 0) return res.status(404).render('error', { message: 'Live demo not found' });
    const demo = rows[0];
    const baseUrl = (req.fullUrl || (req.protocol + '://' + req.get('host') || 'https://www.filemakr.com')).replace(/\/$/, '');
    const pageUrl = `${baseUrl}/demo/${demo.seo_slug}`;
    const Metatags = {
      title: demo.meta_title || (demo.title + ' | Live Demo | FileMakr'),
      description: demo.meta_description || demo.description || ('View live demo of ' + demo.title),
      abstract: demo.meta_description || demo.description || '',
      keywords: demo.meta_keywords || (demo.tech_stack || '') + ', live demo, final year project, FileMakr',
      url: pageUrl,
      ogImage: demo.og_image || demo.image || demo.thumbnail_url || '',
      ogImageAlt: (demo.title || 'Live demo') + ' — FileMakr'
    };
    res.setHeader('X-Robots-Tag', 'index, follow');
    res.render('live-demo-single', {
      demo,
      Metatags,
      CommonMetaTags: onPageSeo.commonMetaTags,
      category: req.categories,
      fullUrl: req.fullUrl,
      graduation_type_send: '',
      active: 'demo'
    });
  } catch (e) {
    console.error('Live demo single error:', e);
    res.status(500).send('Failed to load live demo.');
  }
});


async function renderSingleProjectReport(req, res, { seoName, graduation_type_send = '', original = '', degreeLabel = '' }) {
  const pathSlug = projectReportShared.parseReportDetailPathSlug(req.path);
  const candidates = [...new Set([
    pathSlug,
    projectReportShared.resolveProjectReportSeoSlug(seoName),
    projectReportShared.resolveProjectReportSeoSlug(`${String(seoName || '').trim().toLowerCase()}-final-year-project`),
  ].filter(Boolean))];

  let name = '';
  let rows = [];
  for (const slug of candidates) {
    rows = await projectReportShared.findSourceCodeByReportSeo(slug);
    if (rows && rows.length) {
      name = slug;
      break;
    }
  }

  if (!name || name.length > 150) {
    return res.status(404).render('error', { message: 'Project report not found', error: { status: 404, stack: '' } });
  }
  try {
    if (rows[0] && !rows[0].short_description) {
      rows[0].short_description = String(rows[0].description || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 280);
    }
    const product = rows[0];
    let others = [];
    if (product.category) {
      const [byCat] = await pool.promise().query(
        `SELECT name, seo_name, image, demo_url,
                LEFT(IFNULL(description, ''), 220) AS short_description
         FROM source_code
         WHERE seo_name != ?
           AND category = ?
         ORDER BY RAND()
         LIMIT 10`,
        [product.seo_name, product.category]
      );
      others = byCat || [];
    }
    if (!others.length) {
      const [fallback] = await pool.promise().query(
        `SELECT name, seo_name, image, demo_url,
                LEFT(IFNULL(description, ''), 220) AS short_description
         FROM source_code
         WHERE seo_name != ?
         ORDER BY RAND()
         LIMIT 10`,
        [product.seo_name]
      );
      others = fallback || [];
    }
    const result = [rows, others];
    res.setHeader('X-Robots-Tag', 'index, follow');
    res.render('single-project-report', {
      result,
      graduation_type_send,
      original,
      Metatags: onPageSeo.projectReportDetailMeta(product, req.fullUrl, {
        categories: req.categories,
        degreeLabel: degreeLabel || graduation_type_send,
      }),
      CommonMetaTags: onPageSeo.commonMetaTags,
      category: req.categories,
      fullUrl: req.fullUrl,
      active: 'report',
      listCtaLabel: 'Get Project Report',
    });
  } catch (err) {
    console.error('project-report detail error:', err);
    res.status(500).render('error', { message: 'Something went wrong. Please try again.', error: { status: 500, stack: '' } });
  }
}

const { projectReportUrl, resolveProjectReportSeoSlug, isReportCatalogSeoName } = projectReportShared;

// Legacy → /{db_seo_name}-report (middleware in app.js also redirects; keep route fallback)
router.get('/final-year-project-report-:name', dataService.allCategory, async (req, res) => {
  const q = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : '';
  const seo = await projectReportShared.resolveReportSeoFromLegacySlug(req.params.name);
  return res.redirect(301, projectReportUrl(seo) + q);
});


// using this routes
router.get('/:graduation_type-final-year-project-report', dataService.allCategory, async (req, res, next) => {
  const original = String(req.params.graduation_type || '').toLowerCase().trim();
  if (!projectReportShared.isReportCatalogDegree(original)) {
    return next();
  }

  // Map for graduation types
  const DEGREE_MAP = {
    btech: 'B.Tech',
    mtech: 'M.Tech',
    be: 'B.E.',
    me: 'M.E.',
    bca: 'BCA',
    mca: 'MCA',
    msc: 'MSc',
    bsc: 'BSc',
  };


  const graduation_type_send = DEGREE_MAP[original] ?? original.toUpperCase();

  // --- OPTIONAL: tiny in-memory cache (60s TTL) to reduce DB load ---
  // Feel free to remove if you don't want caching.
  const CACHE_TTL_MS = 60 * 1000;
  const PR_CACHE_V = 3;
  if (!global.__projectReportSourceCache || global.__projectReportSourceCache.v !== PR_CACHE_V) {
    global.__projectReportSourceCache = { v: PR_CACHE_V, data: null, exp: 0 };
  }
  const cache = global.__projectReportSourceCache;

  try {
    let rows;

    if (cache.data && cache.exp > Date.now()) {
      rows = cache.data;
    } else {
      // Lean source_code rows for catalog (search/filter over full set; UI loads progressively)
      const sql = `
        SELECT id, name, seo_name, category, image,
               LEFT(description, 160) AS description
        FROM source_code
        ORDER BY id DESC
      `;
      const [result] = await pool.promise().query(sql);
      rows = result;
      cache.data = rows;
      cache.exp = Date.now() + CACHE_TTL_MS;
    }

    // Optional HTTP caching for intermediaries/browsers (adjust as needed)
    res.setHeader('X-Robots-Tag', 'index, follow');
    res.setHeader('Cache-Control', 'public, max-age=60');

    res.render('project-report', {
      result: rows,
      graduation_type_send,
      original,
      Metatags: onPageSeo.graduationReportCatalogMeta(graduation_type_send, req.fullUrl),
      CommonMetaTags: onPageSeo.commonMetaTags,
      category: req.categories,
      msg: '',
      fullUrl: req.fullUrl,
      active: 'report',
      listCtaLabel: 'View Report'
    });
  } catch (err) {
    console.error('project-report route error:', err);
    res.status(500).render('error', {
      message: 'Something went wrong. Please try again.',
      error: process.env.NODE_ENV === 'development' ? err : {},
    });
  }
});


// Legacy degree-prefixed report detail → /{db_seo_name}-report-{degree}
router.get('/:graduation_type-final-year-project-report-:name', dataService.allCategory, async (req, res, next) => {
  const degree = String(req.params.graduation_type || '').toLowerCase().trim();
  if (!projectReportShared.isReportCatalogDegree(degree)) {
    return next();
  }
  const q = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : '';
  const seo = await projectReportShared.resolveReportSeoFromLegacySlug(req.params.name);
  return res.redirect(301, projectReportUrl(seo, degree) + q);
});


// Legacy edit URL → checkout (or /{seo}-report/edit via middleware)
router.get('/:graduation_type-final-year-project-report-:name/edit', dataService.allCategory, (req, res, next) => {
  const degree = String(req.params.graduation_type || '').toLowerCase().trim();
  if (!projectReportShared.isReportCatalogDegree(degree)) {
    return next();
  }
  const seo = projectReportShared.resolveProjectReportSeoSlug(req.params.name);
  if (!seo || seo.length > 200) {
    return res.status(404).render('error', { message: 'Project report not found', error: { status: 404, stack: '' } });
  }
  const qType = String(req.query.type || '').toLowerCase();
  const plan = qType === 'synopsis' ? 'synopsis' : 'report';
  return res.redirect(301, `/checkout?type=report&seo=${encodeURIComponent(seo)}&plan=${plan}`);
});





// using this route
router.get('/api/coupon/validate', (req, res) => {
  const code = (req.query.code || '').trim();
  if (!code) return res.json({ valid:false });

  const sql = 'SELECT discount FROM shopkeeper WHERE unique_code = ? LIMIT 1';
  pool.query(sql, [code], (err, rows) => {
    if (err) {
      console.error('Coupon lookup error:', err);
      return res.status(500).json({ valid:false });
    }
    if (!rows || !rows.length) return res.json({ valid:false });
    const discount = Number(rows[0].discount) || 0;
    if (discount <= 0) return res.json({ valid:false });
    res.json({ valid:true, discount });
  });
});

// ── Shared checkout (source + report / synopsis) ─────────────────────────────
router.get('/checkout', dataService.allCategory, async (req, res) => {
  try {
    const type = String(req.query.type || '').toLowerCase();
    const plan = String(req.query.plan || '').toLowerCase();
    const seo = String(req.query.seo || '').trim().toLowerCase();
    const catalog = resolveCheckoutCatalog(type, plan);
    const addon = resolveCheckoutAddon(type, req.query.addon, req.query.addon_plan);
    const addonPlans = listCheckoutAddonPlans(type);

    if (!catalog || !seo) {
      return res.status(400).render('error', {
        message: 'Invalid checkout link. Please go back and choose a package again.',
        error: { status: 400, stack: '' }
      });
    }

    let rows;
    if (type === 'report') {
      rows = await projectReportShared.findSourceCodeByReportSeo(seo);
    } else {
      rows = await queryAsync('SELECT * FROM source_code WHERE seo_name = ? LIMIT 1', [seo]);
    }
    if (!rows || !rows.length) {
      return res.status(404).render('error', {
        message: 'Product not found for checkout.',
        error: { status: 404, stack: '' }
      });
    }

    const product = rows[0];
    const backUrl =
      type === 'report'
        ? projectReportShared.projectReportUrl(product.seo_name || seo)
        : `/${product.seo_name}/source-code`;

    const addonPrice = addon ? addon.price : 0;
    const checkoutCsrf = issueCheckoutCsrf(req);

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');

    res.render('checkout', {
      product,
      catalog,
      type,
      plan: catalog.plan,
      basePrice: catalog.price,
      addon,
      addonEnabled: !!addon,
      addonPrice,
      addonPlans,
      totalPrice: Number(catalog.price) + addonPrice,
      backUrl,
      checkoutCsrf,
      allowDummyPay: !!ccavConfig.allowDummyPay,
      Metatags: {
        title: `Checkout — ${product.name} | FileMakr`,
        description: `Secure checkout for ${catalog.planLabel}`,
        abstract: '',
        keywords: ''
      },
      CommonMetaTags: onPageSeo.commonMetaTags,
      category: req.categories,
      fullUrl: req.fullUrl,
      active: type === 'report' ? 'report' : 'source-code',
      graduation_type_send: '',
      msg: ''
    });
  } catch (err) {
    console.error('GET /checkout error:', err);
    res.status(500).render('error', {
      message: 'Something went wrong loading checkout.',
      error: { status: 500, stack: '' }
    });
  }
});

router.post('/checkout/submit', dataService.date_and_time, async (req, res) => {
  try {
    if (!assertCheckoutCsrf(req)) {
      return res.status(403).send('Invalid checkout session. Please go back and try again.');
    }
    if (!ccavConfig.merchantId || !ccavConfig.workingKey || !ccavConfig.accessCode) {
      console.error('CCAvenue credentials missing');
      return res.status(503).send('Payment gateway is temporarily unavailable.');
    }

    const type = String(req.body.type || '').toLowerCase();
    const plan = String(req.body.plan || '').toLowerCase();
    const seo = String(req.body.seo_name || '').trim().toLowerCase();
    const catalog = resolveCheckoutCatalog(type, plan);
    const addon = resolveCheckoutAddon(type, req.body.addon, req.body.addon_plan);
    if (!catalog || !seo) {
      return res.status(400).send('Invalid checkout request');
    }

    let rows;
    if (type === 'report') {
      rows = await projectReportShared.findSourceCodeByReportSeo(seo);
    } else {
      rows = await queryAsync('SELECT * FROM source_code WHERE seo_name = ? LIMIT 1', [seo]);
    }
    if (!rows || !rows.length) return res.status(404).send('Product not found');

    const product = rows[0];
    const billing_name = String(req.body.billing_name || '').trim().slice(0, 120);
    const billing_email = String(req.body.billing_email || '').trim().slice(0, 180).toLowerCase();
    const billing_tel = String(req.body.billing_tel || '').replace(/\D/g, '').slice(0, 15);
    if (!billing_name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(billing_email) || billing_tel.length < 10) {
      return res.status(400).send('Please fill name, a valid email and a valid mobile number.');
    }

    const listAmount = Number(catalog.price) + (addon ? Number(addon.price) : 0);
    let finalAmount = listAmount;
    let coupon_code = String(req.body.coupon_code || '').trim().slice(0, 64);
    if (coupon_code) {
      const couponRows = await queryAsync(
        'SELECT discount FROM shopkeeper WHERE unique_code = ? LIMIT 1',
        [coupon_code]
      );
      const discountPct = couponRows && couponRows[0] ? Number(couponRows[0].discount) || 0 : 0;
      if (discountPct > 0) {
        finalAmount = Math.max(0, Math.round((listAmount * (100 - discountPct)) / 100 * 100) / 100);
      } else {
        coupon_code = '';
      }
    }

    const planLabel = addon
      ? catalog.planLabel + ' + ' + addon.planLabel
      : catalog.planLabel;

    // Ignore any client-supplied amount — only catalog + coupon
    const paymentPref = String(req.body.payment_pref || 'upi').trim().toLowerCase();
    const paymentApp = String(req.body.payment_app || paymentPref).trim().toLowerCase();

    req.session.source_code_id = product.id;
    req.session.type = catalog.paymentType;
    req.session.checkout_plan = catalog.plan;
    req.session.checkout_addon = addon || null;
    // One-time CSRF after successful submit attempt
    delete req.session.checkout_csrf;

    const created = await checkoutOrders.createCheckoutOrder({
      productType: catalog.productType,
      plan: catalog.plan,
      planLabel,
      paymentType: catalog.paymentType,
      sourceCodeId: product.id,
      productName: product.name || '',
      seoName: product.seo_name || seo,
      billingName: billing_name,
      billingEmail: billing_email,
      billingTel: billing_tel,
      listAmount,
      finalAmount,
      couponCode: coupon_code || null,
      paymentPref,
      paymentApp,
      referralCode: req.body.referral_code || null,
      isTest: false,
      ipAddress: req.ip || req.headers['x-forwarded-for'] || null,
      userAgent: req.headers['user-agent'] || null,
      sessionId: req.sessionID || null,
      addon: addon || null
    });

    req.session.fm_order_id = created.orderId;

    if (catalog.paymentType === 'source_code') {
      const title_case_name = String(product.seo_name || '')
        .split('-')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
      setImmediate(async () => {
        try {
          const userSubject = emailTemplates.beforesourcecode.userSubject.replace(
            '{{Project_Name}}',
            title_case_name
          );
          const userMessage = emailTemplates.beforesourcecode.userMessage(
            billing_name,
            title_case_name,
            product.seo_name
          );
          await verify.sendUserMail(billing_email, userSubject, userMessage);
        } catch (backgroundErr) {
          console.error('Background task error (checkout email):', backgroundErr);
        }
      });
    }

    const encryptedOrderData = ccave.getEncryptedOrder(created.ccavenuePayload);
    res.render('send', {
      enccode: encryptedOrderData,
      accesscode: ccavConfig.accessCode,
      initiateUrl: ccavConfig.initiateUrl,
      orderId: created.orderId,
      amount: created.amountStr,
      paymentPref: created.paymentPref
    });
  } catch (err) {
    console.error('POST /checkout/submit error:', err);
    res.status(500).send('Internal Server Error');
  }
});

/** TEST ONLY — skip CCAvenue (disabled in production unless ALLOW_DUMMY_PAY=1) */
router.post('/checkout/dummy-pay', dataService.allCategory, async (req, res) => {
  try {
    if (!ccavConfig.allowDummyPay) {
      return res.status(404).send('Not found');
    }
    if (!assertCheckoutCsrf(req)) {
      return res.status(403).send('Invalid checkout session. Please go back and try again.');
    }

    const type = String(req.body.type || '').toLowerCase();
    const plan = String(req.body.plan || '').toLowerCase();
    const seo = String(req.body.seo_name || '').trim().toLowerCase();
    const catalog = resolveCheckoutCatalog(type, plan);
    const addon = resolveCheckoutAddon(type, req.body.addon, req.body.addon_plan);
    if (!catalog || !seo) {
      return res.status(400).send('Invalid checkout request');
    }

    let rows;
    if (type === 'report') {
      rows = await projectReportShared.findSourceCodeByReportSeo(seo);
    } else {
      rows = await queryAsync('SELECT * FROM source_code WHERE seo_name = ? LIMIT 1', [seo]);
    }
    if (!rows || !rows.length) return res.status(404).send('Product not found');

    const product = rows[0];
    const billing_name = String(req.body.billing_name || '').trim() || 'Test User';
    const billing_email = String(req.body.billing_email || '').trim() || 'test@filemakr.com';
    const billing_tel = String(req.body.billing_tel || '').replace(/\D/g, '') || '9999999999';

    const listAmount = Number(catalog.price) + (addon ? Number(addon.price) : 0);
    const planLabel = addon
      ? catalog.planLabel + ' + ' + addon.planLabel
      : catalog.planLabel;

    req.session.source_code_id = product.id;
    req.session.type = catalog.paymentType;
    req.session.checkout_plan = catalog.plan;
    req.session.checkout_addon = addon || null;
    delete req.session.checkout_csrf;

    const created = await checkoutOrders.createCheckoutOrder({
      productType: catalog.productType,
      plan: catalog.plan,
      planLabel,
      paymentType: catalog.paymentType,
      sourceCodeId: product.id,
      productName: product.name || '',
      seoName: product.seo_name || seo,
      billingName: billing_name,
      billingEmail: billing_email,
      billingTel: billing_tel,
      listAmount,
      finalAmount: listAmount,
      couponCode: String(req.body.coupon_code || '').trim() || null,
      paymentPref: String(req.body.payment_pref || 'upi').trim().toLowerCase() || 'upi',
      paymentApp: String(req.body.payment_app || 'upi').trim().toLowerCase() || 'upi',
      referralCode: 'DUMMY_TEST',
      isTest: true,
      orderId: 'FMK-TEST-' + checkoutOrders.generatePublicOrderId().replace(/^FMK-/, ''),
      ipAddress: req.ip || req.headers['x-forwarded-for'] || null,
      userAgent: req.headers['user-agent'] || null,
      sessionId: req.sessionID || null,
      addon: addon || null
    });

    const orderId = created.orderId;
    const amountStr = created.amountStr;
    req.session.fm_order_id = orderId;

    let zipFileName = '';
    const needsZip = catalog.productType === 'source' || (addon && addon.type === 'source');
    if (needsZip) {
      const scFileRows = await queryAsync(
        'SELECT source_code FROM source_code WHERE id = ? LIMIT 1',
        [product.id]
      );
      zipFileName = (scFileRows && scFileRows[0] && scFileRows[0].source_code) || '';
    }

    setPaidCheckoutSession(req, {
      orderId,
      sourceCodeId: product.id,
      plan: catalog.plan,
      productType: catalog.productType,
      billingName: billing_name,
      billingEmail: billing_email,
      amount: amountStr,
      method: String(req.body.payment_pref || 'upi').toUpperCase(),
      productName: product.name || '',
      zipFileName,
      addon: addon || null
    });

    return res.redirect(reportReadyRedirectUrl(orderId));
  } catch (err) {
    console.error('POST /checkout/dummy-pay error:', err);
    res.status(500).send('Dummy payment failed: ' + (err.message || 'server error'));
  }
});

router.get('/checkout/report-ready', dataService.allCategory, async (req, res) => {
  const qOrder = String(req.query.order || req.query.order_id || '').trim();
  if (qOrder && (req.session.ispayment !== 'done' || !req.session.paid_source_code_id)) {
    await restoreCheckoutSessionFromPaidOrder(req, qOrder);
  }

  if (req.session.ispayment !== 'done' || !req.session.paid_source_code_id) {
    return res.status(403).render('instant-report-status', {
      kind: 'error',
      pageTitle: 'Payment session missing',
      message: 'No paid order found in this session. If you just paid, open the download link from your email or contact WhatsApp support with your Order ID.',
      orderId: req.session.paid_order_id || '',
      productName: '',
      planLabel: 'Download',
      sourceCodeId: '',
      Metatags: {
        title: 'Download unavailable | FileMakr',
        description: 'Download session missing',
        abstract: '',
        keywords: ''
      },
      CommonMetaTags: onPageSeo.commonMetaTags,
      category: req.categories,
      fullUrl: req.fullUrl,
      active: 'report',
      graduation_type_send: '',
      msg: ''
    });
  }

  let fmOrder = null;
  const lookupOrderId = req.session.fm_order_id || req.session.paid_order_id || qOrder;
  if (lookupOrderId) {
    try {
      fmOrder = await checkoutOrders.findByOrderId(lookupOrderId);
    } catch (e) {}
  }

  const paymentType = String(
    (fmOrder && fmOrder.payment_type) || req.session.type || ''
  ).toLowerCase();
  const productTypeRaw = String(
    (fmOrder && fmOrder.product_type) || req.session.paid_product_type || ''
  ).toLowerCase();
  const isSource =
    productTypeRaw === 'source' ||
    paymentType === 'source_code' ||
    req.session.paid_product_type === 'source';

  const plan = isSource
    ? String((fmOrder && fmOrder.plan) || req.session.paid_plan || 'basic').toLowerCase() ===
      'support'
      ? 'support'
      : 'basic'
    : normalizeReportPlan((fmOrder && fmOrder.plan) || req.session.paid_plan || 'report');

  const planLabel =
    (fmOrder && fmOrder.plan_label) ||
    (isSource
      ? plan === 'support'
        ? 'Code + setup support (24hr)'
        : 'Source code download'
      : plan === 'synopsis'
        ? 'Synopsis'
        : plan === 'customized'
          ? 'Customized Report'
          : plan === 'originality'
            ? 'Originality Reviewed Report'
            : 'Pre Defined Project Report');

  let productName = (fmOrder && fmOrder.product_name) || req.session.paid_product_name || '';
  const sourceId = parseInt(
    (fmOrder && fmOrder.source_code_id) || req.session.paid_source_code_id,
    10
  );

  let zipFileName = req.session.paid_zip_file || '';
  if (Number.isFinite(sourceId)) {
    try {
      const rows = await queryAsync(
        'SELECT name, source_code FROM source_code WHERE id=? LIMIT 1',
        [sourceId]
      );
      if (rows && rows[0]) {
        if (!productName) productName = rows[0].name || '';
        if (!zipFileName) zipFileName = rows[0].source_code || '';
      }
    } catch (e) {}
  }

  let amountPaid = parseFloat(
    (fmOrder && fmOrder.final_amount) || req.session.paid_amount
  );
  if (!Number.isFinite(amountPaid) || amountPaid <= 0) {
    if (isSource) {
      amountPaid = plan === 'support' ? CHECKOUT_PRICES.source.support : CHECKOUT_PRICES.source.basic;
    } else {
      amountPaid = CHECKOUT_PRICES.report[plan] || CHECKOUT_PRICES.report.report;
    }
  }

  const safeName = (productName || (isSource ? 'Source_Code' : 'Project_Report'))
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '_');

  const reportDeferred = !isSource && isDeferredReportPlan(plan);
  const renderOrderId =
    (fmOrder && fmOrder.order_id) || req.session.paid_order_id || qOrder || '';

  let fileName;
  let fileMeta;
  let downloadHref;
  if (isSource) {
    fileName = zipFileName || safeName + '.zip';
    if (fileName && !/\.zip$/i.test(fileName)) fileName = fileName + '.zip';
    fileMeta = 'ZIP Archive · .zip';
    downloadHref =
      '/download-instant-source' + (renderOrderId ? '?order=' + encodeURIComponent(renderOrderId) : '');
  } else if (reportDeferred) {
    fileName = safeName + (plan === 'customized' ? '_Customized_Report.docx' : '_Originality_Report.docx');
    fileMeta = 'Delivery within 24-48 hours';
    downloadHref = '';
  } else {
    fileName = safeName + (plan === 'synopsis' ? '_Synopsis.docx' : '_Report.docx');
    fileMeta = 'Microsoft Word · .docx';
    downloadHref = '/download-instant-report' + (renderOrderId ? '?order=' + encodeURIComponent(renderOrderId) : '');
  }

  const paidAddon = resolvePaidAddonForCheckout(req, fmOrder);
  if (paidAddon) {
    req.session.paid_addon = paidAddon;
  } else if (req.session && req.session.paid_addon) {
    delete req.session.paid_addon;
  }

  let addonDownload = null;
  if (paidAddon && paidAddon.type === 'source') {
    const addonZip = zipFileName || req.session.paid_zip_file || '';
    const addonHref =
      '/download-instant-source' + (renderOrderId ? '?order=' + encodeURIComponent(renderOrderId) : '');
    const addonAvail = await resolveCheckoutDownloadAvailability({
      isSource: true,
      sourceId,
      plan: 'basic',
      zipFileName: addonZip
    });
    addonDownload = {
      label: 'Matching Source Code',
      fileName: (addonZip ? path.basename(String(addonZip)) : safeName + '.zip').replace(/\.zip$/i, '') + '.zip',
      fileMeta: 'ZIP Archive · .zip',
      downloadHref: addonAvail.downloadAvailable ? addonHref : '',
      downloadAvailable: addonAvail.downloadAvailable,
      downloadUnavailableTitle: addonAvail.downloadUnavailableTitle,
      downloadUnavailableMessage: addonAvail.downloadUnavailableMessage
    };
  } else if (paidAddon && paidAddon.type === 'report') {
    const addonPlan = normalizeReportPlan(paidAddon.plan);
    if (isDeferredReportPlan(addonPlan)) {
      addonDownload = {
        label: paidAddon.title || 'Matching Project Report',
        fileName:
          safeName +
          (addonPlan === 'customized' ? '_Customized_Report.docx' : '_Originality_Report.docx'),
        fileMeta: 'Delivery within 24-48 hours',
        downloadHref: '',
        downloadAvailable: false,
        downloadUnavailableTitle: 'Delivery within 24-48 hours',
        downloadUnavailableMessage:
          'Payment successful. Your report will be delivered within 24-48 hours on your WhatsApp or Email ID.'
      };
    } else {
      const addonAvail = await resolveCheckoutDownloadAvailability({
        isSource: false,
        sourceId,
        plan: addonPlan,
        zipFileName: ''
      });
      addonDownload = {
        label: paidAddon.title || 'Matching Project Report',
        fileName: safeName + (addonPlan === 'synopsis' ? '_Synopsis.docx' : '_Report.docx'),
        fileMeta: 'Microsoft Word · .docx',
        downloadHref: addonAvail.downloadAvailable
          ? '/download-instant-report' + (renderOrderId ? '?order=' + encodeURIComponent(renderOrderId) : '')
          : '',
        downloadPdfHref: addonAvail.downloadAvailable
          ? '/download-instant-report?format=pdf' +
            (renderOrderId ? '&order=' + encodeURIComponent(renderOrderId) : '')
          : '',
        downloadAvailable: addonAvail.downloadAvailable,
        downloadUnavailableTitle: addonAvail.downloadUnavailableTitle,
        downloadUnavailableMessage: addonAvail.downloadUnavailableMessage
      };
    }
  }

  const paymentDate =
    req.session.paid_date ||
    checkoutOrders.formatPaymentDate((fmOrder && (fmOrder.paid_at || fmOrder.created_at)) || new Date());

  const methodRaw = String(
    req.session.paid_method || (fmOrder && fmOrder.payment_pref) || 'UPI'
  ).toLowerCase();
  const methodMap = {
    upi: 'UPI',
    card: 'Card',
    netbanking: 'Net Banking',
    wallet: 'Wallet'
  };

  let existingReview = null;
  if (renderOrderId) {
    try {
      existingReview = await checkoutOrders.findReviewByOrderId(renderOrderId);
    } catch (e) {}
  }

  const billingEmail =
    (fmOrder && fmOrder.billing_email) || req.session.paid_billing_email || '';

  let availability;
  if (reportDeferred) {
    availability = {
      downloadAvailable: false,
      downloadUnavailableTitle: 'Delivery within 24-48 hours',
      downloadUnavailableMessage:
        'Payment successful. Your report will be delivered within 24-48 hours on your WhatsApp or Email ID.'
    };
  } else {
    availability = await resolveCheckoutDownloadAvailability({
      isSource,
      sourceId,
      plan,
      zipFileName
    });
  }

  res.render('instant-report-success', {
    plan,
    planLabel,
    billingName: (fmOrder && fmOrder.billing_name) || req.session.paid_billing_name || '',
    orderId: renderOrderId,
    productName,
    amountPaid,
    paymentMethod: methodMap[methodRaw] || String(req.session.paid_method || 'UPI'),
    paymentDate,
    fileName,
    fileMeta,
    downloadHref: availability.downloadAvailable ? downloadHref : '',
    downloadPdfHref:
      !isSource && !reportDeferred && availability.downloadAvailable
        ? '/download-instant-report?format=pdf' +
          (renderOrderId ? '&order=' + encodeURIComponent(renderOrderId) : '')
        : '',
    downloadAvailable: availability.downloadAvailable,
    downloadUnavailableTitle: availability.downloadUnavailableTitle,
    downloadUnavailableMessage: availability.downloadUnavailableMessage,
    addonDownload,
    existingRating: existingReview ? Number(existingReview.rating) : 0,
    existingReviewText: existingReview ? (existingReview.review_text || '') : '',
    conversionTrack: {
      order_id: renderOrderId,
      value: amountPaid || 1,
      currency: 'INR',
      email: billingEmail,
      product_type: isSource ? 'source_code' : 'project_report',
      item_name: isSource
        ? 'Source Code - ' + (productName || 'Download')
        : (plan === 'synopsis' ? 'Synopsis - ' : 'Project Report - ') + (productName || 'Download'),
      item_category: isSource ? 'Source Code' : 'Project Report'
    },
    Metatags: {
      title: 'Download Ready | FileMakr',
      description: 'Your FileMakr files are ready to download',
      abstract: '',
      keywords: ''
    },
    CommonMetaTags: onPageSeo.commonMetaTags,
    category: req.categories,
    fullUrl: req.fullUrl,
    active: isSource ? 'source-code' : 'report',
    graduation_type_send: '',
    msg: ''
  });
});

router.post('/checkout/review', async (req, res) => {
  try {
    const orderId = String(req.body.order_id || req.session.fm_order_id || req.session.paid_order_id || '').trim();
    const rating = parseInt(req.body.rating, 10);
    const reviewText = String(req.body.review_text || '').trim();

    if (!orderId) {
      return res.status(400).json({ ok: false, error: 'Order ID missing' });
    }
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ ok: false, error: 'Please select a rating from 1 to 5' });
    }

    const saved = await checkoutOrders.saveOrderReview({
      orderId,
      rating,
      reviewText,
      sourceCodeId: req.session.paid_source_code_id || null,
      billingName: req.session.paid_billing_name || null,
      billingEmail: req.session.paid_billing_email || null,
      ipAddress: req.ip || req.headers['x-forwarded-for'] || null,
      userAgent: req.headers['user-agent'] || null
    });

    return res.json({
      ok: true,
      rating: saved.rating,
      rating_label: saved.rating_label,
      review_text: saved.review_text || ''
    });
  } catch (err) {
    console.error('POST /checkout/review error:', err);
    return res.status(500).json({ ok: false, error: err.message || 'Could not save review' });
  }
});

router.get('/download-instant-report', dataService.allCategory, async (req, res) => {
  const qOrder = String(req.query.order || req.query.order_id || '').trim();
  if (qOrder && (req.session.ispayment !== 'done' || !req.session.paid_source_code_id)) {
    await restoreCheckoutSessionFromPaidOrder(req, qOrder);
  }

  const renderStatus = (status, extras) => {
    const plan = req.session.paid_plan === 'synopsis' ? 'synopsis' : 'report';
    return res.status(status).render('instant-report-status', {
      kind: extras.kind || 'error',
      pageTitle: extras.pageTitle || 'Download unavailable',
      message: extras.message || '',
      orderId: req.session.paid_order_id || extras.orderId || '',
      productName: extras.productName || '',
      planLabel: plan === 'synopsis' ? 'Synopsis' : 'Project Report',
      sourceCodeId: extras.sourceCodeId || req.session.paid_source_code_id || '',
      Metatags: {
        title: (extras.pageTitle || 'Download unavailable') + ' | FileMakr',
        description: extras.message || 'Report download status',
        abstract: '',
        keywords: ''
      },
      CommonMetaTags: onPageSeo.commonMetaTags,
      category: req.categories,
      fullUrl: req.fullUrl,
      active: 'report',
      graduation_type_send: '',
      msg: ''
    });
  };

  try {
    if (req.session.ispayment !== 'done' || !req.session.paid_source_code_id) {
      return renderStatus(403, {
        kind: 'error',
        pageTitle: 'Payment session expired',
        message: 'Your payment session is missing or expired. Please use the confirmation email link, or contact WhatsApp support with your Order ID.'
      });
    }
    const hasReportAccess =
      req.session.paid_product_type === 'report' ||
      (req.session.paid_addon && req.session.paid_addon.type === 'report');
    if (!hasReportAccess) {
      return renderStatus(403, {
        kind: 'error',
        pageTitle: 'Report not in this order',
        message: 'This payment session does not include a project report download.'
      });
    }
    const id = parseInt(req.session.paid_source_code_id, 10);
    let plan = 'report';
    if (req.session.paid_product_type === 'report') {
      plan = normalizeReportPlan(req.session.paid_plan);
    } else if (req.session.paid_addon && req.session.paid_addon.type === 'report') {
      plan = normalizeReportPlan(req.session.paid_addon.plan);
    }
    if (isDeferredReportPlan(plan)) {
      return renderStatus(200, {
        kind: 'pending',
        pageTitle: 'Delivery within 24-48 hours',
        message:
          'Payment successful. Your report will be delivered within 24-48 hours on your WhatsApp or Email ID.',
        productName: '',
        sourceCodeId: req.session.paid_source_code_id || ''
      });
    }
    if (!Number.isFinite(id)) {
      return renderStatus(400, {
        kind: 'error',
        pageTitle: 'Invalid project',
        message: 'We could not resolve the project linked to this payment.'
      });
    }

    const scRows = await queryAsync('SELECT id, name FROM source_code WHERE id=? LIMIT 1', [id]);
    if (!scRows.length) {
      return renderStatus(404, {
        kind: 'error',
        pageTitle: 'Project not found',
        message: 'The project linked to this order was not found.',
        sourceCodeId: id
      });
    }

    const lib = await loadPrcLibraryForExport(id);
    let items = buildFullReportItems({
      sections: lib.sectionsWithSub,
      dbScreenshots: lib.dbScreenshots,
      screenshots: lib.screenshots,
      diagrams: lib.diagramsList
    });
    if (plan === 'synopsis') {
      items = filterSynopsisItems(items);
    } else if (plan === 'report') {
      items = filterPredefinedReportItems(items);
    }
    if (!items.length) {
      return renderStatus(400, {
        kind: 'empty',
        pageTitle: 'Report content not ready',
        message: 'Payment is successful, but Word content for this project is not published yet. Share your Order ID on WhatsApp and our team will enable the download.',
        productName: scRows[0].name || '',
        sourceCodeId: id
      });
    }

    const sourceCodeName =
      (scRows[0].name || 'Report').toString().trim() + (plan === 'synopsis' ? ' Synopsis' : ' Report');
    const prevBody = req.body;
    try {
      const fmt = String(req.query.format || 'docx').toLowerCase() === 'pdf' ? 'pdf' : 'docx';
      req.body = { sourceCodeId: id, sourceCodeName, items, format: fmt };
      await handleProjectReportWordDownload(req, res);
      const deliverOrderId = req.session.fm_order_id || req.session.paid_order_id;
      if (deliverOrderId) {
        setImmediate(() => {
          checkoutOrders.markDelivered(deliverOrderId).catch((e) => {
            console.warn('markDelivered failed:', e.message || e);
          });
        });
      }
    } finally {
      req.body = prevBody;
    }
  } catch (e) {
    console.error('download-instant-report error:', e);
    if (!res.headersSent) {
      return renderStatus(500, {
        kind: 'error',
        pageTitle: 'Could not generate Word file',
        message: 'Something went wrong while generating your document. Please try again, or contact WhatsApp support with your Order ID.'
      });
    }
  }
});

router.get('/download-instant-source', dataService.allCategory, async (req, res) => {
  const qOrder = String(req.query.order || req.query.order_id || '').trim();
  if (qOrder && (req.session.ispayment !== 'done' || !req.session.paid_source_code_id)) {
    await restoreCheckoutSessionFromPaidOrder(req, qOrder);
  }

  const renderStatus = (status, extras) => {
    return res.status(status).render('instant-report-status', {
      kind: extras.kind || 'error',
      pageTitle: extras.pageTitle || 'Download unavailable',
      message: extras.message || '',
      orderId: req.session.paid_order_id || extras.orderId || '',
      productName: extras.productName || '',
      planLabel: 'Source Code',
      sourceCodeId: extras.sourceCodeId || req.session.paid_source_code_id || '',
      Metatags: {
        title: (extras.pageTitle || 'Download unavailable') + ' | FileMakr',
        description: extras.message || 'Source code download status',
        abstract: '',
        keywords: ''
      },
      CommonMetaTags: onPageSeo.commonMetaTags,
      category: req.categories,
      fullUrl: req.fullUrl,
      active: 'source-code',
      graduation_type_send: '',
      msg: ''
    });
  };

  try {
    if (req.session.ispayment !== 'done' || !req.session.paid_source_code_id) {
      return renderStatus(403, {
        kind: 'error',
        pageTitle: 'Payment session expired',
        message:
          'Your payment session is missing or expired. Please use the confirmation email link, or contact WhatsApp support with your Order ID.'
      });
    }

    const id = parseInt(req.session.paid_source_code_id, 10);
    if (!Number.isFinite(id)) {
      return renderStatus(400, {
        kind: 'error',
        pageTitle: 'Invalid project',
        message: 'We could not resolve the project linked to this payment.'
      });
    }

    const rows = await queryAsync(
      'SELECT id, name, source_code FROM source_code WHERE id=? LIMIT 1',
      [id]
    );
    if (!rows.length) {
      return renderStatus(404, {
        kind: 'error',
        pageTitle: 'Project not found',
        message: 'The project linked to this order was not found.',
        sourceCodeId: id
      });
    }

    const zipName = path.basename(String(req.session.paid_zip_file || rows[0].source_code || '').trim());
    if (!zipName) {
      return renderStatus(400, {
        kind: 'empty',
        pageTitle: 'Source file not ready',
        message:
          'Payment is successful, but the ZIP file for this project is not available yet. Share your Order ID on WhatsApp and our team will enable the download.',
        productName: rows[0].name || '',
        sourceCodeId: id
      });
    }

    // ZIPs are hosted on production CDN — never use localhost /images (404 in local/dev)
    return res.redirect('https://filemakr.com/images/' + encodeURIComponent(zipName));
  } catch (e) {
    console.error('download-instant-source error:', e);
    if (!res.headersSent) {
      return renderStatus(500, {
        kind: 'error',
        pageTitle: 'Could not start download',
        message:
          'Something went wrong while preparing your source code. Please try again, or contact WhatsApp support with your Order ID.'
      });
    }
  }
});




router.get('/cse/synopsis/:name',(req,res)=>{
    res.redirect(projectReportShared.projectReportUrl(req.params.name))
})





router.get('/ieee-standard-project-report-:name',(req,res)=>{
   res.redirect(projectReportShared.projectReportUrl(req.params.name))
})




router.get('/ieee-standard-project-report-:name/customization',(req,res)=>{
     var query = `select * from project where seo_name = '${req.params.name}';`
    var query1 = `select name,id from programming_language;`
    pool.query(query+query1,(err,result)=>{
        err ? console.log(err) : res.render('ieee/customization',{result : result,msg:'Select Atleast HTML Programming Language',navOnly:true})
    })

})


//old route

router.get('/cse/:name/customization',(req,res)=>{
     var query = `select * from project where seo_name = '${req.params.name}';`
    var query1 = `select name,id from programming_language;`
    pool.query(query+query1,(err,result)=>{
        err ? console.log(err) : res.render('customization',{result : result,navOnly:true})
    })

})




//new btech edit route



//new mtech edit route

//new me edit route



//new mca edit route




router.get('/cse/synopsis/:name/customization',(req,res)=>{
     var query = `select * from project where seo_name = '${req.params.name}';`
    var query1 = `select name,id from programming_language;`
    pool.query(query+query1,(err,result)=>{
        err ? console.log(err) : res.render('synopis_customization',{result : result})
    })

})




router.get('/make-your-own-project-pricing-list', (req, res) => { pool.query(`select name,seo_name,short_description from project`,
(err,result)=>err ? console.log(err) : res.render('make-your-own-project-pricing-list',{result:result}))
})



function sanitizeCatalogSearchQuery(raw) {
  return String(raw || '')
    .trim()
    .slice(0, 120)
    .replace(/[%_\\]/g, '');
}

async function searchSourceCodeCatalog(term, limit) {
  const q = sanitizeCatalogSearchQuery(term);
  if (!q) return [];

  const maxRows = Math.min(Math.max(parseInt(limit, 10) || 200, 1), 300);
  const like = `%${q}%`;
  const likeStart = `${q}%`;

  const cols = [
    'name',
    'seo_name',
    'category',
    "IFNULL(description, '')",
    "IFNULL(meta_keywords, '')",
    "IFNULL(meta_desc, '')",
    "REPLACE(seo_name, '-', ' ')"
  ];

  const params = [];
  const conditions = [];

  const fullMatch = cols.map((c) => `${c} LIKE ?`).join(' OR ');
  conditions.push(`(${fullMatch})`);
  cols.forEach(() => params.push(like));

  const words = q.split(/\s+/).filter(Boolean).slice(0, 6);
  if (words.length > 1) {
    const wordGroups = words.map((word) => {
      const wLike = `%${word.replace(/[%_\\]/g, '')}%`;
      cols.forEach(() => params.push(wLike));
      return `(${cols.map((c) => `${c} LIKE ?`).join(' OR ')})`;
    });
    conditions.push(`(${wordGroups.join(' AND ')})`);
  }

  const whereSql = conditions.join(' OR ');
  params.push(q, likeStart, likeStart, like);

  const sql = `
    SELECT id, name, seo_name, category, image, demo_url,
           LEFT(IFNULL(description, ''), 160) AS description
    FROM source_code
    WHERE (${whereSql})
    ORDER BY
      CASE
        WHEN LOWER(name) = LOWER(?) THEN 0
        WHEN name LIKE ? THEN 1
        WHEN seo_name LIKE ? THEN 2
        WHEN category LIKE ? THEN 3
        ELSE 4
      END,
      id DESC
    LIMIT ${maxRows}
  `;

  const [rows] = await pool.promise().query(sql, params);
  return rows || [];
}

router.get('/search', dataService.allCategory, async (req, res) => {
  const typeRaw = String(req.query.type || 'Source Code').trim();
  const isProjectReport = /project\s*report/i.test(typeRaw);
  const q = sanitizeCatalogSearchQuery(req.query.q);

  if (!q) {
    return res.redirect(isProjectReport ? '/final-year-project-ideas' : '/source-code');
  }

  res.setHeader('X-Robots-Tag', 'noindex, follow');
  res.setHeader('Cache-Control', 'private, no-store');

  try {
    const rows = await searchSourceCodeCatalog(q);
    const label = isProjectReport ? 'Project Ideas' : 'Source Code';
    const pageTitle = `Search “${q}” – ${label} | FileMakr`;
    const pageDesc = `Results for “${q}” in FileMakr ${label.toLowerCase()} catalog. Browse matching final year projects with reports, source code and setup support.`;

    const common = {
      result: rows,
      searchPage: true,
      searchQuery: q,
      searchType: isProjectReport ? 'Project Report' : 'Source Code',
      Metatags: {
        title: pageTitle,
        description: pageDesc,
        abstract: pageDesc,
        keywords: `${q}, ${label}, final year project, FileMakr`
      },
      CommonMetaTags: onPageSeo.commonMetaTags,
      category: req.categories,
      msg: '',
      fullUrl: req.fullUrl
    };

    if (isProjectReport) {
      return res.render('project-ideas', {
        ...common,
        graduation_type_send: 'Final Year',
        original: 'btech',
        ideasPage: true,
        active: 'report',
        listCtaLabel: 'View Idea'
      });
    }

    return res.render('source_code', {
      ...common,
      graduation_type_send: 'Final Year',
      original: '',
      sourceCodePage: true,
      active: 'source-code',
      listCtaLabel: 'Get Source Code'
    });
  } catch (err) {
    console.error('search catalog error:', err);
    res.status(500).render('error', {
      message: 'Something went wrong. Please try again.',
      error: { status: 500, stack: '' }
    });
  }
})




// using this routes
router.get('/source-code/:category', dataService.allCategory, async (req, res) => {
  res.setHeader('X-Robots-Tag', 'index, follow');
  res.setHeader('Cache-Control', 'public, max-age=60');

  const cat = String(req.params.category || '').trim().toLowerCase();
  if (!cat || cat.length > 80) {
    return res.status(404).render('error', { message: 'Category not found', error: { status: 404, stack: '' } });
  }

  const graduation_type_send = onPageSeo.resolveSourceCategoryLabel(req.categories, cat);

  try {
    const [rows] = await pool.promise().query(
      `SELECT id, name, seo_name, category, image, demo_url,
              LEFT(description, 160) AS description
       FROM source_code
       WHERE category = ?
       ORDER BY id DESC`,
      [cat]
    );

    res.render('source_code', {
      result: rows || [],
      graduation_type_send,
      original: cat,
      sourceCodePage: true,
      Metatags: onPageSeo.sourceCodeCategoryMeta(req.categories, cat, req.fullUrl),
      CommonMetaTags: onPageSeo.commonMetaTags,
      category: req.categories,
      msg: '',
      fullUrl: req.fullUrl,
      active: 'source-code',
      listCtaLabel: 'Get Source Code'
    });
  } catch (err) {
    console.error('source-code category error:', err);
    res.status(500).render('error', {
      message: 'Something went wrong. Please try again.',
      error: process.env.NODE_ENV === 'development' ? err : {},
    });
  }
});



// using this routes
router.get('/:name/source-code', dataService.allCategory, async (req, res) => {
    try {
        const seoName = String(req.params.name || '').trim();
        if (!seoName || seoName.includes('/')) {
            return res.status(404).render('error', { message: 'Source code not found', error: { status: 404, stack: '' } });
        }

        const projectidQuery = await queryAsync(
            'SELECT id, category, license, name, seo_name, demo_url, image FROM source_code WHERE seo_name = ? LIMIT 1',
            [seoName]
        );
        if (!projectidQuery || projectidQuery.length === 0) {
            return res.status(404).render('error', { message: 'Source code not found', error: { status: 404, stack: '' } });
        }

        const projectid = projectidQuery[0].id;
        const projectcategory = projectidQuery[0].category;
        const projectlicense = projectidQuery[0].license;
        const canPurchase = !!(projectidQuery[0].image || projectidQuery[0].demo_url || projectlicense);

        const result = await queryAsync(
            'SELECT * FROM source_code WHERE seo_name = ?; ' +
            'SELECT sc.name, sc.seo_name, sc.description, sc.demo_url, sc.image FROM source_code sc WHERE sc.seo_name != ? AND sc.category = ? ORDER BY RAND() LIMIT 10; ' +
            'SELECT * FROM screenshots WHERE source_code_id = ? ORDER BY id ASC LIMIT 5;',
            [seoName, seoName, projectcategory, projectid]
        );

        const product = result[0] && result[0][0] ? result[0][0] : null;
        if (!product) {
            return res.status(404).render('error', { message: 'Source code not found', error: { status: 404, stack: '' } });
        }

        const pageTitle = `${product.name} Source Code Download | FileMakr`;
        const pageDesc = product.meta_desc || `Download ${product.name} final year project source code with frontend, backend, database and setup guide. Instant secure download for B.Tech, MCA, BCA students.`;

        res.setHeader('X-Robots-Tag', 'index, follow');
        res.setHeader('Cache-Control', 'public, max-age=60');
        res.render('download-source-code', {
            result,
            category: req.categories,
            fullUrl: req.fullUrl,
            active: 'source-code',
            graduation_type_send: '',
            projectlicense,
            canPurchase,
            priceBasic: 99,
            priceSupport: 248,
            listCtaLabel: 'Get Source Code',
            Metatags: {
                title: pageTitle,
                description: pageDesc,
                abstract: pageDesc,
                keywords: product.meta_keywords || `${product.name}, source code, final year project`,
                ogImage: product.image || '',
                ogImageAlt: `${product.name} source code — FileMakr`
            },
            CommonMetaTags: onPageSeo.commonMetaTags
        });
    } catch (error) {
        console.error('Error executing queries:', error);
        res.status(500).send('Internal Server Error');
    }
});



// router.get('/web-development',(req,res)=>{
//     res.render('web-development',{type:'Web Development'})
// })

// router.get('/web-design',(req,res)=>{
//     res.render('web-design',{type:'Web Design'})
// })


// router.get('/app-development',(req,res)=>{
//     res.render('app-development',{type:'App Development'})
// })

// router.get('/graphics-design',(req,res)=>{
//     res.render('graphics-design',{type:'Graphics Design'})
// })

// router.get('/video-editing',(req,res)=>{
//     res.render('video-editing',{type:'Video Editing'})
// })














    router.get('/failue-page',(req,res)=>{
        res.render('failed',{type:'Dear valued customer, we regret to inform you that the transaction you initiated has failed. We apologize for any inconvenience this may have caused. Please ensure that you have sufficient funds or correct payment information for future transactions.'})
    })

    router.get('/success-page',(req,res)=>{
        res.render('success',{type:`Dear customer, we would like to inform you that your recharge has been successfully processed and your account's validity has been extended until   2023-05-23. Thank you for choosing our services.`,navOnly:true})
    })
    


    // router.post('/requestForDemo',dataService.allCategory,(req,res)=>{
    //     let body = req.body;
    //     console.log(body);
    //     pool.query(`insert into requestDemo set ?`,body,(err,result)=>{
    //         if(err) throw err;
    //         else res.render('success',{type:'Thankyou for requesting a demo.Our team will contact you soon', Metatags: onPageSeo.successPage,
    //         CommonMetaTags: onPageSeo.commonMetaTags,category:req.categories})
    //     })
    // })

    router.post('/requestForDemo', dataService.date_and_time, dataService.allCategory, async (req, res) => {
        try {
            const body = req.body;
            body['status'] = 'pending';
        body['date'] = req.currentDate;

            console.log(body);
            const result = await queryAsync('INSERT INTO requestDemo SET ?', body);
            pool.query(`select * from liveDemo where source_code = '${req.body.source_code_id}'`,(err,result)=>{
                if(err) throw err;
                else if(result.length>0){
                    // console.log(result[0])
                    res.redirect(result[0].link)
                }
                else{
                    res.render('success', {
                        type: 'Thank you for requesting a demo. Our team will contact you soon',
                        Metatags: onPageSeo.successPage,
                        CommonMetaTags: onPageSeo.commonMetaTags,
                        category: req.categories,
                        fullUrl:req.fullUrl,
                        navOnly:true
                    });
                }
            })
          
        } catch (err) {
            console.error('Error processing demo request:', err);
            res.status(500).send('Internal Server Error');
        }
    });



    
    router.get('/v1/user/profile',(req,res)=>{
        let a =[
            {
            "id": 7,
            "name": "Vaanika Shah",
            "number": "7021198737",
            "unique_id": "3459316",
            "password": "123",
            "percentage": "20"
            }
            ]
            
        res.json(a)
    })



    router.post('/dashboard/requestForDemo', dataService.date_and_time, dataService.allCategory, async (req, res) => {
        try {
            let body = req.body;
            body['status'] = 'pending';
        body['date'] = req.currentDate;
      
            console.log('insert data',body);
            const result = await queryAsync('INSERT INTO requestDemo SET ?', body);
            res.json({msg:'success'})
        } catch (err) {
            console.error('Error processing demo request:', err);
            res.status(500).send('Internal Server Error');
        }
      });




      router.post('/dashboard/sentmail', dataService.date_and_time, dataService.allCategory, async (req, res) => {
        try {
            let body = req.body;
            
      await dataService.sendDemoMail({ result: body});

            res.json({msg:'success'})
        } catch (err) {
            console.error('Error processing demo request:', err);
            res.status(500).send('Internal Server Error');
        }
      });

// Find the second smallest number?



router.get('/api',(req,res)=>{
    pool.query(`select * from ${table_name} where id = '${id}'`,(err,result)=>{
        if(err) throw err;
        else {
            let a =
            {
                "formatVersion" : 1,
                "passTypeIdentifier" : "pass.com.expo.passmaker",
                "teamIdentifier" : "6ST4QA3X2Z",
                "barcode" : {
                  "message" : `${result[0].name}`,
                  "format" : "PKBarcodeFormatQR",
                  "messageEncoding" : "iso-8859-1",
                  "backgroundColor": "rgb(255, 255, 255)"
                },
                "organizationName" : "Toy Town",
                "description" : "Toy Town Membership",
                "logoText" : "Toy Town",
                "labelColor": "rgb(255, 255, 255)",
                "logoTextColor": "rgb(255, 255, 255)",
                "foregroundColor" : "rgb(255, 255, 255)",
                "backgroundColor" : "rgb(197, 31, 31)",
                "generic" : {
                  "primaryFields" : [
                    
                  ],
                  "secondaryFields" : [
                    
                  ],
                  "auxiliaryFields" : [
                    
                  ]
                 
                }
              }
              
        }
    })
})
    

// For Google Login

const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;


passport.use(new GoogleStrategy({
    clientID: '215117966247-hds0pt2s321nota106e5ninkcbuemtjh.apps.googleusercontent.com',
    clientSecret: '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',
    callbackURL: 'https://filemakr.com/auth/google/callback'
  },
  (accessToken, refreshToken, profile, done) => {
    // Use the profile information (e.g., profile.id, profile.displayName) to authenticate or create a user in your system
    // You can also store the accessToken and refreshToken for future use
    console.log('user',profile)
    return done(null, profile);
  }
));


// Serialize and deserialize user
passport.serializeUser((user, done) => {
    done(null, user);
  });
  
  passport.deserializeUser((obj, done) => {
    done(null, obj);
  });

  router.get('/api/v1/users/auth/google',
  passport.authenticate('google', { scope: ['profile', 'email'] }));

// // Google login callback route
// router.get('/auth/google/callback',
//   passport.authenticate('google', { failureRedirect: '/login' }),
//   (req, res) => {
//     // Successful authentication, send user details as JSON response
//     res.json({ user: req.user });
//   });



router.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/login' }),
  (req, res) => {
    // Create a query object to store user data


    // Redirect to the callback URL with user data as query parameters
    res.redirect(`/login-success?a=done&id=${req.user.id}&displayName=${req.user.displayName}&email=${req.user.emails[0].value}&photos=${req.user.photos[0].value}`);
  });

router.get('/login-success', (req, res) => {
    // Parse the JSON string to get the user object
    
    res.json(req.query);
});




router.get('/view-user-report', async (req, res) => {
    req.session.ispayment = 'done';
    const roll = req.query.roll_number;
    const hint = req.query.source_table;
    if (!roll || !req.session.ispayment) {
        return res.redirect('/');
    }
    try {
        const found = await projectReportShared.findLatestProjectReport(roll, hint);
        if (!found) {
            return res.redirect('/');
        }
        const result = await projectReportShared.buildBtechStyleReportResult(found.row, found.table);
        const project_type = projectReportShared.projectTypeLabel(result[0][0].report_type) || result[0][0].report_type;
        return res.render('B.Tech/finalnew', { result, project_type });
    } catch (e) {
        console.error('view-user-report', (e && e.message) || e, (e && e.sqlMessage) || '');
        return res.redirect('/');
    }
});









router.get('/download-my-report', async (req, res) => {
    req.session.ispayment = 'done';
    const roll = req.query.roll_number;
    const hint = req.query.source_table;
    if (!roll || !req.session.ispayment) {
        return res.redirect('/');
    }
    try {
        const found = await projectReportShared.findLatestProjectReport(roll, hint);
        if (!found) {
            return res.redirect('/');
        }
        if (projectReportShared.safeTableName(found.table) === 'btech_project' && found.row.status && found.row.status !== 'success') {
            return res.redirect('/');
        }
        const result = await projectReportShared.buildBtechStyleReportResult(found.row, found.table);
        const project_type = projectReportShared.projectTypeLabel(result[0][0].report_type) || result[0][0].report_type;
        return res.render('B.Tech/finalnew', { result, project_type });
    } catch (e) {
        console.error('download-my-report', (e && e.message) || e, (e && e.sqlMessage) || '');
        return res.redirect('/');
    }
});




const axios = require('axios');
const { Template } = require('ejs');
const { verify1 } = require('crypto');
const ACCESS_TOKEN = 'EAAU06ZC3UpdABO4Y4qUJxUTMAbBeF6iHKl70DSJ9cmZBrJmkf7pXJaUUjlfNWPyrtwoSj3G7juPFXh8KCzlZA4eCw00Mfzjrm8UW32UxaTgujbzDoTY9sRCUSxMeYmTAVZAxBZCcOvvj5PalgnRvKLUxDzZAwbn6M22z8dj9Ta16zVcSNg31eZCt4kjDa58nkYlT81y2vkcaNUwC8mJhix7ulidZCXqBZCF2Su60ZD';
const PHONE_NUMBER_ID = '389545867577984';





// router.get('/send-message1', async (req, res) => {
//     // const { phoneNumber } = req.body;

//     const messageData = {
//         messaging_product: 'whatsapp',
//         to: '+91 8319339945',
//         type: 'template',
//         template: {
//             name: 'hello_world',
//             language: {
//                 code: 'en_US'
//             },
//         }
//     };

//     try {
//         const response = await axios.post(
//             'https://graph.facebook.com/v20.0/389545867577984/messages',
//             messageData,
//             {
//                 headers: {
//                     'Authorization': 'Bearer EAAU06ZC3UpdABO2wIGbJZARgXfWaq7bu3nXBpUjzpz0ItUDn9VJW7u4NZCKK3cULAAbLlvfQIkqUph1SFJRS2N0HkEnBBwwrZBahdbD2WubgZBCQzximXyD7Mz86i1jxB6A27FZAnPJGVseUGgOOZA2wHpKZCra2PpxETZBcyVAfKUqdBx4zHyeaqUwxNomjtCDd2ZA2ZBPKR1whuutJyfsigZDZD',
//                     'Content-Type': 'application/json'
//                 }
//             }
//         );
//         console.log('Message sent response:', response.data);
//         res.status(200).send('Message sent');
//     } catch (error) {
//         console.error('Error sending message:', error.response ? error.response.data : error.message);
//         res.status(500).send('Error sending message');
//     }
// });




router.get('/send-message1', async (req, res) => {
    // const { phoneNumber } = req.body;

    const messageData = {
        messaging_product: 'whatsapp',
        to: '+91 8319339945',
        type: 'template',
        template: {
            name: 'reviewtempelate',
            language: {
                code: 'en_US'
            },
            components: [
                {
                    type: 'body',
                    parameters: [
                        {
                            type: 'text',
                            text: 'Naman'  // Replace 'User' with the actual user's name or dynamic value
                        }
                    ]
                }
            ]
        }
    };

    try {
        const response = await axios.post(
            'https://graph.facebook.com/v20.0/389545867577984/messages',
            messageData,
            {
                headers: {
                    'Authorization': 'Bearer EAAU06ZC3UpdABO2wIGbJZARgXfWaq7bu3nXBpUjzpz0ItUDn9VJW7u4NZCKK3cULAAbLlvfQIkqUph1SFJRS2N0HkEnBBwwrZBahdbD2WubgZBCQzximXyD7Mz86i1jxB6A27FZAnPJGVseUGgOOZA2wHpKZCra2PpxETZBcyVAfKUqdBx4zHyeaqUwxNomjtCDd2ZA2ZBPKR1whuutJyfsigZDZD',
                    'Content-Type': 'application/json'
                }
            }
        );
        console.log('Message sent response:', response.data);
        res.status(200).send('Message sent');
    } catch (error) {
        console.error('Error sending message:', error.response ? error.response.data : error.message);
        res.status(500).send('Error sending message');
    }
});




// router.get('/send-message1', async (req, res) => {
//     const messageData = {
//         messaging_product: 'whatsapp',
//         to: '+91 8319339945',
//         type: 'template',
//         template: {
//             name: 'project_report_ready_new',
//             language: {
//                 code: 'en_US'
//             },
//             components: [
//                 {
//                     type: 'body',
//                     parameters: [
//                         {
//                             type: 'text',
//                             text: 'Naman Jain'  // Replace with the actual user's name or dynamic value
//                         },                       
//                     ]
//                 },
//                 {
//                     "type": "button",
//                     "sub_type": "url",
//                     "index": 0,
//                     "parameters": [
//                       {
//                         "type": "text",
//                         "text": "21BECE30336"
//                       }
//                     ]
//                   }
//             ]
//         }
//     };

//     try {
//         const response = await axios.post(
//             'https://graph.facebook.com/v20.0/389545867577984/messages',
//             messageData,
//             {
//                 headers: {
//                     'Authorization': 'Bearer EAAU06ZC3UpdABOyL9VTRBuDhegsy2yCLNyYVZBxykhfwZB5ZCRwKqgHwQkaiqtBmhAEg3IYcDCNbfTFFTT40EzacOhqzS0ZC3pJsao3dJVKY8EnWvVZBkZBzp6410rAKRVdMUiV7DJWsuJKAqGZCq3YG5u1mPACraEKiZBZAxTMiOJGZCK92mLiuTvlawyaFddRS3ZBOPreaF67sbafIXnBUt6UxqOCmcHEaaSGGooUZD',
//                     'Content-Type': 'application/json'
//                 }
//             }
//         );
//         console.log('Message sent response:', response.data);
//         res.status(200).send('Message sent');
//     } catch (error) {
//         console.error('Error sending message:', error.response ? error.response.data : error.message);
//         res.status(500).send('Error sending message');
//     }
// });



// router.get('/send-message1', async (req, res) => {
//     const messageData = {
//         messaging_product: 'whatsapp',
//         to: '+91 8319339945',
//         type: 'template',
//         template: {
//             name: 'thankyou_message',
//             language: {
//                 code: 'en_US'
//             },
//             components: [
//                 {
//                     type: 'body',
//                     parameters: [
//                         {
//                             type: 'text',
//                             text: 'Naman Jain'  // Replace with the actual user's name or dynamic value
//                         },                       
//                     ]
//                 }
//             ]
//         }
//     };

//     try {
//         const response = await axios.post(
//             'https://graph.facebook.com/v20.0/389545867577984/messages',
//             messageData,
//             {
//                 headers: {
//                     'Authorization': 'Bearer EAAU06ZC3UpdABOyL9VTRBuDhegsy2yCLNyYVZBxykhfwZB5ZCRwKqgHwQkaiqtBmhAEg3IYcDCNbfTFFTT40EzacOhqzS0ZC3pJsao3dJVKY8EnWvVZBkZBzp6410rAKRVdMUiV7DJWsuJKAqGZCq3YG5u1mPACraEKiZBZAxTMiOJGZCK92mLiuTvlawyaFddRS3ZBOPreaF67sbafIXnBUt6UxqOCmcHEaaSGGooUZD',
//                     'Content-Type': 'application/json'
//                 }
//             }
//         );
//         console.log('Message sent response:', response.data);
//         res.status(200).send('Message sent');
//     } catch (error) {
//         console.error('Error sending message:', error.response ? error.response.data : error.message);
//         res.status(500).send('Error sending message');
//     }
// });




// router.get('/send-message1', async (req, res) => {
//     const messageData = {
//         messaging_product: 'whatsapp',
//         to: '+91 8319339945',
//         type: 'template',
//         template: {
//             name: 'thankyou_message',
//             language: {
//                 code: 'en_US'
//             },
//             components: [
//                 {
//                     type: 'body',
//                     parameters: [
//                         {
//                             type: 'text',
//                             text: 'Naman Jain'  // Replace with the actual user's name or dynamic value
//                         },
                                           
//                     ]
//                 },
//                 {
//                     "type": "button",
//                     "sub_type": "flow",
//                     "index": 0,
//                     "parameters": [
//                       {
//                         "type": "text",
//                         "text": "Customer Support"
//                       }
//                     ]
//                   }  
//             ]
//         }
//     };

//     try {
//         const response = await axios.post(
//             'https://graph.facebook.com/v20.0/389545867577984/messages',
//             messageData,
//             {
//                 headers: {
//                     'Authorization': 'Bearer EAAU06ZC3UpdABOyL9VTRBuDhegsy2yCLNyYVZBxykhfwZB5ZCRwKqgHwQkaiqtBmhAEg3IYcDCNbfTFFTT40EzacOhqzS0ZC3pJsao3dJVKY8EnWvVZBkZBzp6410rAKRVdMUiV7DJWsuJKAqGZCq3YG5u1mPACraEKiZBZAxTMiOJGZCK92mLiuTvlawyaFddRS3ZBOPreaF67sbafIXnBUt6UxqOCmcHEaaSGGooUZD',
//                     'Content-Type': 'application/json'
//                 }
//             }
//         );
//         console.log('Message sent response:', response.data);
//         res.status(200).send('Message sent');
//     } catch (error) {
//         console.error('Error sending message:', error.response ? error.response.data : error.message);
//         res.status(500).send('Error sending message');
//     }
// });



const sendMessage = async (to, messageText) => {
    const messageData = {
        messaging_product: 'whatsapp',
        to: to,
        type: 'text',
        text: {
            body: messageText
        }
    };

    try {
        const response = await axios.post(
            'https://graph.facebook.com/v20.0/389545867577984/messages',
            messageData,
            {
                headers: {
                  'Authorization': 'Bearer EAAU06ZC3UpdABO2wIGbJZARgXfWaq7bu3nXBpUjzpz0ItUDn9VJW7u4NZCKK3cULAAbLlvfQIkqUph1SFJRS2N0HkEnBBwwrZBahdbD2WubgZBCQzximXyD7Mz86i1jxB6A27FZAnPJGVseUGgOOZA2wHpKZCra2PpxETZBcyVAfKUqdBx4zHyeaqUwxNomjtCDd2ZA2ZBPKR1whuutJyfsigZDZD',

                    'Content-Type': 'application/json'
                }
            }
        );
        console.log('Message sent response:', response.data);
    } catch (error) {
        console.error('Error sending message:', error.response ? error.response.data : error.message);
    }
};


// sendMessage('+91 8319339945', 'Testing Done')










router.get('/final/year/project/report/:roll_number',(req,res)=>{

    req.session.roll_number = req.params.roll_number

    console.log('yaha v correct h',req.session.roll_number)
    
        if(req.session.roll_number){
    
    
    if(req.session.deviceInfo == 'mobile'){
    
    
    
    
      pool.query(`select * from btech_project where roll_number = '${req.session.roll_number}' order by id desc limit 1`,(err,result)=>{
            if(err) throw err;
            else {
                console.log('this null',req.session.roll_number)
                console.log(result[0].php)
               var query = `select * from btech_project where roll_number = '${req.session.roll_number}' order by id desc limit 1;`
               var query3 = `select * from project where id = '${result[0].projectid}';`
               //For Testing
    
               pool.query(query+query3,(err,result)=>{
                   if(err) throw err;
                   //else res.json(result)
                   else res.render('B.Tech/final',{result:result})
               })
    
            }
        })
    
    
    
    }
    else{
    
    
      pool.query(`select * from btech_project where roll_number = '${req.session.roll_number}' order by id desc limit 1`,(err,result)=>{
            if(err) throw err;
            else {
                console.log('this null',req.session.roll_number)
               var query = `select * from btech_project where roll_number = '${req.session.roll_number}' order by id desc limit 1;`
               var query3 = `select * from project where id = '${result[0].projectid}';`
             //For Testing
    
               pool.query(query+query3,(err,result)=>{
                   if(err) throw err;
                   else res.render('B.Tech/final',{result:result})
               })
    
            }
        })
    
    }
    
    
    }
    else{
        res.redirect('/')
    }
    })



    

    router.get('/youtube-partner-program',(req,res)=>{
        res.render('join_us')
    })




    router.get('/order/now',dataService.allCategory,async(req, res) => { 
        res.render('orderNow',{Metatags:onPageSeo.termsPage,CommonMetaTags:onPageSeo.commonMetaTags,msg:'',category:req.categories,fullUrl:req.fullUrl,unique_code:req.session.referralCode,navOnly:true})
     })
        



     router.get('/getPerPageCharge', (req, res) => {
        const { unique_code, deliveryFormat, projectType } = req.query;
      
        // Query to check shopkeeper data
        pool.query(`SELECT * FROM shopkeeper WHERE unique_code = ?`, [unique_code], (err, shopkeeperResult) => {
          if (err) {
            console.error("Error fetching shopkeeper data:", err);
            return res.status(500).json({ error: "Internal Server Error" });
          }
      
          // Check if shopkeeper data exists
          const discount = shopkeeperResult.length > 0 ? shopkeeperResult[0].discount : 0;
      
          // Query to fetch masterCategory data
          pool.query(`SELECT * FROM masterCategory WHERE deliveryFormat = ? AND name = ?`, [deliveryFormat, projectType], (err, masterResult) => {
            if (err) {
              console.error("Error fetching masterCategory data:", err);
              return res.status(500).json({ error: "Internal Server Error" });
            }
      
            // Send the result along with the discount (commission)
            res.json({ result: masterResult, discount: discount });
          });
        });
      });
      












const { createFilemakrSmtpTransport } = require('../utils/filemakrSmtp');

function generatePassword(name, number, address) {
  const base = (name + number + address).replace(/\s+/g, '');
  const shuffled = base.split('').sort(() => 0.5 - Math.random()).join('');
  return shuffled.substring(0, 8);
}

const transporter = createFilemakrSmtpTransport({
  pool: true,
  maxConnections: 5,
  maxMessages: 50,
  connectionTimeout: 20_000,
  socketTimeout: 30_000,
});



// small helper: retry with exponential backoff
async function sendWithRetry(mailOptions, { tries = 3, baseDelayMs = 800 } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      return await transporter.sendMail(mailOptions);
    } catch (err) {
      lastErr = err;
      // Retry only on transient errors
      const transient =
        err.code === 'EDNS' ||
        err.code === 'ETIMEDOUT' ||
        err.code === 'ECONNECTION' ||
        err.code === 'ESOCKET' ||
        /Rate|Throttl|Too\s+many/i.test(String(err.message));
      if (attempt === tries || !transient) break;
      const delay = baseDelayMs * Math.pow(2, attempt - 1);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

const moment = require("moment");
const createAddAmbassadorPipeline = require('./addAmbassadorPipeline');
const { addAmbassadorOne, parseSimpleAmbassadorCsv, csvRecordToAmbassadorBody } = createAddAmbassadorPipeline({
  queryAsync,
  generatePassword,
  sendWithRetry,
  moment,
});

router.get('/add-ambassador', redirectMernManagerAddAmbassadorToPortal, requireMernManagerToolkit, (req, res) => {
  res.render('add_ambassador', {
    msg: req.query.msg || '',
    bulkError: req.query.bulkError || '',
  });
});

router.post('/add-ambassador', requireMernManagerToolkit, async (req, res) => {
  try {
    await transporter.verify().catch(() => {});
    await addAmbassadorOne(req.body);
    const qs = new URLSearchParams({ msg: 'Brand Ambassador added and emails sent!' });
    if (req.body.embed === '1' || req.body.embed === 'true') qs.set('embed', '1');
    return res.redirect('/add-ambassador?' + qs.toString());
  } catch (err) {
    console.error('add-ambassador:', err);
    return res.status(500).send(err.message || 'Internal Server Error');
  }
});

router.post('/add-ambassador/bulk', requireMernManagerToolkit, bulkAmbassadorUpload.single('bulk_csv'), async (req, res) => {
  const embedSuffix =
    req.body.embed === '1' || req.body.embed === 'true' ? '&embed=1' : '';
  try {
    if (!req.file || !req.file.buffer) {
      return res.redirect(
        '/add-ambassador?bulkError=' + encodeURIComponent('Choose a CSV file to upload.') + embedSuffix
      );
    }
    const rows = parseSimpleAmbassadorCsv(req.file.buffer.toString('utf8'));
    if (!rows.length) {
      return res.redirect(
        '/add-ambassador?bulkError=' + encodeURIComponent('No data rows found (need header + rows).') + embedSuffix
      );
    }
    await transporter.verify().catch(() => {});
    let ok = 0;
    const errors = [];
    for (let i = 0; i < rows.length; i++) {
      try {
        await addAmbassadorOne(csvRecordToAmbassadorBody(rows[i]));
        ok++;
      } catch (e) {
        errors.push('Row ' + (i + 2) + ': ' + (e.message || 'failed'));
      }
    }
    const msg = 'Bulk import finished: ' + ok + ' succeeded, ' + errors.length + ' failed (of ' + rows.length + ').';
    const qs = new URLSearchParams({ msg });
    if (errors.length) qs.set('bulkError', errors.slice(0, 8).join(' | '));
    if (req.body.embed === '1' || req.body.embed === 'true') qs.set('embed', '1');
    return res.redirect('/add-ambassador?' + qs.toString());
  } catch (e) {
    console.error('add-ambassador bulk:', e);
    return res.redirect(
      '/add-ambassador?bulkError=' + encodeURIComponent('Bulk upload failed.') + embedSuffix
    );
  }
});

router.get('/add-ambassador/bulk-sample.csv', requireMernManagerToolkit, (req, res) => {
  const header = 'name,number,address,email,instagram_id,referal_code\n';
  const sample = 'Jane Doe,9876543210,ABC College,jane@example.com,@jane_handle,\n';
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="mern-students-sample.csv"');
  res.send(header + sample);
});
      




// router.get('/blog',dataService.allCategory,(req,res)=>{
//     pool2.query(`select * from blogs where title like '%M.tech%' limit 40`,(err,result)=>{
//         if(err) throw err;
//          else  res.render('blog',{Metatags:onPageSeo.blogPage,CommonMetaTags:onPageSeo.commonMetaTags,msg:'',category:req.categories,fullUrl:req.fullUrl,result,active:'',graduation_type_send:''})
//     // else res.json(result)
//     })
   
// })


// routes/blog.js
router.get('/blog', dataService.allCategory, (req, res) => {
  const pageSize = 10;
  const page     = Math.max(parseInt(req.query.page || 1, 10), 1);
  const q        = (req.query.q || req.query.tag || '').trim().slice(0, 100);
  const cat      = (req.query.category || '').trim().slice(0, 80);
  const order    = (req.query.sort || 'new'); // 'new' | 'old' | 'alpha'

  const where = [];
  const params = [];

  if (q) {
    where.push(`(meta_title LIKE ? OR meta_description LIKE ? OR title LIKE ?)`);
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (cat) {
    where.push(`category = ?`);
    params.push(cat);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  let orderSql = 'ORDER BY created_at DESC, id DESC';
  if (order === 'old')   orderSql = 'ORDER BY created_at ASC, id ASC';
  if (order === 'alpha') orderSql = 'ORDER BY meta_title ASC';

  const countSql = `SELECT COUNT(*) AS total FROM blogs ${whereSql}`;
  const listSql  = `
    SELECT id, slug, title, meta_title, meta_description, thumbnail_url, created_at, category
    FROM blogs
    ${whereSql}
    ${orderSql}
    LIMIT ? OFFSET ?
  `;
  const popularSql = `
    SELECT id, slug, title, meta_title, meta_description, thumbnail_url, created_at, category
    FROM blogs
    ORDER BY created_at DESC
    LIMIT 15
  `;

  pool2.query(countSql, params, (err, countRows) => {
    if (err) throw err;
    const total = countRows[0]?.total || 0;
    const totalPages = Math.max(Math.ceil(total / pageSize), 1);
    const safePage = Math.min(page, totalPages);
    const from = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
    const to = Math.min(safePage * pageSize, total);

      pool2.query(listSql, [...params, pageSize, (safePage - 1) * pageSize], (err2, result) => {
      if (err2) throw err2;

      pool2.query(popularSql, [], (err4, popularRows) => {
        if (err4) throw err4;

          const baseUrl = req.fullUrl?.split('?')[0] || `${req.protocol}://${req.get('host')}${req.path}`;
          const queryNoPage = new URLSearchParams(req.query);
          queryNoPage.delete('page');
          const qStr = queryNoPage.toString();
          const canonical = safePage > 1 ? req.fullUrl : (qStr ? `${baseUrl}?${qStr}` : baseUrl);

          const mkUrl = (p) => {
            const sp = new URLSearchParams(req.query);
            sp.set('page', p);
            return `${baseUrl}?${sp.toString()}`;
          };

          res.render('blog', {
            Metatags: onPageSeo.blogListingMeta(canonical, { q, cat, page: safePage }),
            CommonMetaTags: onPageSeo.commonMetaTags,
            msg: '',
            category: req.categories,
            fullUrl: req.fullUrl,
            canonicalUrl: canonical,
            prevUrl: safePage > 1 ? mkUrl(safePage - 1) : null,
            nextUrl: safePage < totalPages ? mkUrl(safePage + 1) : null,
            result,
            popularPosts: popularRows || [],
            active: 'blog',
            graduation_type_send: '',
            pagination: {
              page: safePage,
              pageSize,
              total,
              totalPages,
              from,
              to,
              hasPrev: safePage > 1,
              hasNext: safePage < totalPages,
              prevUrl: safePage > 1 ? mkUrl(safePage - 1) : null,
              nextUrl: safePage < totalPages ? mkUrl(safePage + 1) : null,
              canonical,
              baseUrl
            },
            filters: { q, cat, order }
          });
        });
      });
  });
});







router.get('/blog/:name', dataService.allCategory, (req, res) => {
    const blogSlug = (req.params.name || '').trim();
    if (!blogSlug || blogSlug.length > 200) {
        return res.status(404).render('error', { message: 'Blog post not found', error: { status: 404, stack: '' } });
    }

    const blogQuery = `SELECT * FROM blogs WHERE slug = ? LIMIT 1`;
    const recentBlogsQuery = `
        SELECT id, title, meta_title, slug, thumbnail_url, created_at, meta_description
        FROM blogs ORDER BY created_at DESC LIMIT 25
    `;

    pool2.query(blogQuery, [blogSlug], (err, blogResult) => {
        if (err) {
            console.error('Blog fetch error:', err);
            return res.status(500).render('error', { message: 'Something went wrong. Please try again.', error: { status: 500, stack: '' } });
        }
        if (!blogResult || blogResult.length === 0) {
            return res.status(404).render('error', { message: 'Blog post not found', error: { status: 404, stack: '' } });
        }

        pool2.query(recentBlogsQuery, (err2, recentBlogs) => {
            if (err2) {
                console.error('Recent blogs fetch error:', err2);
                return res.status(500).render('error', { message: 'Something went wrong. Please try again.', error: { status: 500, stack: '' } });
            }

            const post = blogResult[0];
            const pageMetatags = onPageSeo.blogDetailMeta(post, req.fullUrl);
            const pageCommonMeta = {
                ...onPageSeo.commonMetaTags,
                ogImage: post.thumbnail_url || onPageSeo.commonMetaTags.ogImage
            };

            res.render('blog_details', {
                result: blogResult,
                recentBlogs: recentBlogs || [],
                Metatags: pageMetatags,
                CommonMetaTags: pageCommonMeta,
                msg: '',
                category: req.categories,
                fullUrl: req.fullUrl,
                active: 'blog',
                graduation_type_send: ''
            });
        });
    });
});




const geoip = require('geoip-lite');
const cookieParser = require('cookie-parser');
const uuid = require('uuid');

router.use(cookieParser());

// router.get('/video/:shortCode', async (req, res) => {
//   const { shortCode } = req.params;
//   const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
//   const geo = geoip.lookup(ip) || {};
//   const userAgent = req.get('User-Agent');
//   const cookieId = req.cookies.visitor_id || uuid.v4();

//   // Check if shortCode exists
//   const link = await queryAsync('SELECT * FROM links WHERE short_code = ?', [shortCode]);
//   if (!link.length) return res.status(404).send('Link not found');

//   const linkId = link[0].id;



//   // Check uniqueness
//   const existing = await queryAsync('SELECT * FROM clicks WHERE link_id = ? AND cookie_id = ?', [linkId, cookieId]);
//   if (!existing.length) {
//     // Record unique click
//     await queryAsync(`INSERT INTO clicks (link_id, ip_address, city, country, user_agent, click_time, cookie_id)
//                     VALUES (?, ?, ?, ?, ?, NOW(), ?)`,
//       [linkId, ip, geo.city || 'Unknown', geo.country || 'Unknown', userAgent, cookieId]);
//   }

//   // Set cookie
//   res.cookie('visitor_id', cookieId, { maxAge: 1000 * 60 * 60 * 24 * 365 }); // 1 year

//   // Redirect to original URL
//   res.redirect(link[0].original_url);
// });


router.get('/video/:shortCode', dataService.allCategory, async (req, res) => {
  const { shortCode } = req.params;
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const geo = geoip.lookup(ip) || {};
  const userAgent = req.get('User-Agent');
  const cookieId = req.cookies.visitor_id || uuid.v4();

  // Check if shortCode exists
  const link = await queryAsync('SELECT * FROM links WHERE short_code = ?', [shortCode]);
  if (!link.length) return res.status(404).send('Link not found');

  const linkId = link[0].id;

  // Check uniqueness
  const existing = await queryAsync(
    'SELECT * FROM clicks WHERE link_id = ? AND cookie_id = ?',
    [linkId, cookieId]
  );

  if (!existing.length) {
    // Record unique click
    await queryAsync(
      `INSERT INTO clicks (link_id, ip_address, city, country, user_agent, click_time, cookie_id)
       VALUES (?, ?, ?, ?, ?, NOW(), ?)`,
      [
        linkId,
        ip,
        geo.city || 'Unknown',
        geo.country || 'Unknown',
        userAgent,
        cookieId,
      ]
    );
  }

  // Set cookie
  res.cookie('visitor_id', cookieId, { maxAge: 1000 * 60 * 60 * 24 * 365 }); // 1 year

  const country = geo.country || 'Unknown';
  console.log('country:', country);
  console.log('city:', geo.city || 'Unknown');

  // ✅ Redirect Indian users to original URL
  if (country === 'IN') {
    return res.redirect(link[0].original_url);
  }

  // 🌍 For all other countries, render the blog page
  const blogSlug = 'mern-stack-in-5-minutes-become-a-full-stack-developer';

  const blogQuery = `SELECT * FROM blogs WHERE slug = ?;`;
  const recentBlogsQuery = `
      SELECT id, meta_title, slug, thumbnail_url, created_at 
      FROM blogs 
      ORDER BY created_at DESC 
      LIMIT 10;
  `;

  pool2.query(blogQuery, [blogSlug], (err, blogResult) => {
    if (err) {
      console.error('Blog query error:', err);
      return res.status(500).send('Server error');
    }

    pool2.query(recentBlogsQuery, (err2, recentBlogs) => {
      if (err2) {
        console.error('Recent blogs query error:', err2);
        return res.status(500).send('Server error');
      }

      return res.render('blog_details', {
        result: blogResult,
        recentBlogs,
        Metatags: onPageSeo.contactPage,
        CommonMetaTags: onPageSeo.commonMetaTags,
        msg: '',
        category: req.categories,
        fullUrl: req.fullUrl,
      });
    });
  });
});




router.get('/blogvideo/:shortCode', dataService.allCategory, async (req, res) => {
  const { shortCode } = req.params;
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const geo = geoip.lookup(ip) || {};
  const userAgent = req.get('User-Agent');
  const cookieId = req.cookies.visitor_id || uuid.v4();

  // Check if shortCode exists
  const link = await queryAsync('SELECT * FROM links WHERE short_code = ?', [shortCode]);
  if (!link.length) return res.status(404).send('Link not found');

  const linkId = link[0].id;

  // Check uniqueness
  const existing = await queryAsync(
    'SELECT * FROM clicks WHERE link_id = ? AND cookie_id = ?',
    [linkId, cookieId]
  );

  if (!existing.length) {
    // Record unique click
    await queryAsync(
      `INSERT INTO clicks (link_id, ip_address, city, country, user_agent, click_time, cookie_id)
       VALUES (?, ?, ?, ?, ?, NOW(), ?)`,
      [
        linkId,
        ip,
        geo.city || 'Unknown',
        geo.country || 'Unknown',
        userAgent,
        cookieId,
      ]
    );
  }

  // Set cookie
  res.cookie('visitor_id', cookieId, { maxAge: 1000 * 60 * 60 * 24 * 365 }); // 1 year

  const country = geo.country || 'Unknown';
  console.log('country:', country);
  console.log('city:', geo.city || 'Unknown');

  // ✅ Redirect Indian users to original URL
  if (country === 'IN') {
    return res.redirect(link[0].original_url);
  }

  // 🌍 For all other countries, render the blog page
  const blogSlug = 'earn-50000-thousand-per-month-top-remote-internship';

  const blogQuery = `SELECT * FROM blogs WHERE slug = ?;`;
  const recentBlogsQuery = `
      SELECT id, meta_title, slug, thumbnail_url, created_at 
      FROM blogs 
      ORDER BY created_at DESC 
      LIMIT 10;
  `;

  pool2.query(blogQuery, [blogSlug], (err, blogResult) => {
    if (err) {
      console.error('Blog query error:', err);
      return res.status(500).send('Server error');
    }

    pool2.query(recentBlogsQuery, (err2, recentBlogs) => {
      if (err2) {
        console.error('Recent blogs query error:', err2);
        return res.status(500).send('Server error');
      }

      return res.render('blog_details', {
        result: blogResult,
        recentBlogs,
        Metatags: onPageSeo.contactPage,
        CommonMetaTags: onPageSeo.commonMetaTags,
        msg: '',
        category: req.categories,
        fullUrl: req.fullUrl,
      });
    });
  });
});



router.get('/blog/video/:shortCode', async (req, res) => {
  const { shortCode } = req.params;
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const geo = geoip.lookup(ip) || {};
  const userAgent = req.get('User-Agent');
  const cookieId = req.cookies.visitor_id || uuid.v4();

  const linkResults = await queryAsync('SELECT * FROM links WHERE short_code = ?', [shortCode]);
  if (!linkResults.length) return res.status(404).send('Link not found');

  const link = linkResults[0];
  const linkId = link.id;

  // Log the click if not already logged
  const existing = await queryAsync('SELECT * FROM clicks WHERE link_id = ? AND cookie_id = ?', [linkId, cookieId]);
  if (!existing.length) {
    await queryAsync(`
      INSERT INTO clicks (link_id, ip_address, city, country, user_agent, click_time, cookie_id)
      VALUES (?, ?, ?, ?, ?, NOW(), ?)`,
      [linkId, ip, geo.city || 'Unknown', geo.country || 'Unknown', userAgent, cookieId]
    );
  }

  // Fetch 5 other distinct recommended videos
  const recommendations = await queryAsync(`
    SELECT DISTINCT original_url 
    FROM links 
    WHERE short_code != ? 
    LIMIT 5
  `, [shortCode]);

  res.cookie('visitor_id', cookieId, { maxAge: 365 * 24 * 60 * 60 * 1000 }); // 1 year

  res.render('watchvideo', {
    originalUrl: link.original_url,
    shortCode,
    videoTitle: link.title || 'Your Video',
    videoSource: 'FileMakr',
    recommendations,
  });
});



router.post('/api/logWatchTimeRealtime', async (req, res) => {
  const { shortCode, seconds } = req.body;
  const cookieId = req.cookies.visitor_id || uuid.v4();

  try {
    const link = await queryAsync('SELECT id FROM links WHERE short_code = ?', [shortCode]);
    if (!link.length) return res.status(404).json({ error: 'Invalid link' });

    const linkId = link[0].id;

    // ✅ Check if this user already has a log
    const existing = await queryAsync(
      'SELECT * FROM video_watch_logs WHERE link_id = ? AND cookie_id = ?',
      [linkId, cookieId]
    );

    if (existing.length) {
      // ✅ Update existing watch time
      await queryAsync(
        'UPDATE video_watch_logs SET watched_seconds = watched_seconds + ?, timestamp = NOW() WHERE id = ?',
        [seconds, existing[0].id]
      );
    } else {
      // ✅ Insert new log
      await queryAsync(
        `INSERT INTO video_watch_logs (link_id, short_code, watched_seconds, timestamp, cookie_id)
         VALUES (?, ?, ?, NOW(), ?)`,
        [linkId, shortCode, seconds, cookieId]
      );
    }

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});



router.post('/api/verify/license', (req, res) => {
  const { key } = req.body;

  // Simulate logic (replace with actual logic or DB check)
  const validKeys = ['J9F2-KD83-ZXQ7-PLM2' , 'Chirag11072025'];

  if (key && validKeys.includes(key.trim())) {
    return res.json({ valid: true });
  } else {
    return res.json({ valid: false });
  }
});












// Legacy US Trends URLs (removed) → blog
router.get('/us/trends', (req, res) => {
  const i = req.originalUrl.indexOf('?');
  const q = i >= 0 ? req.originalUrl.slice(i) : '';
  res.redirect(301, '/blog' + q);
});

router.get('/us/trends/:name', (req, res) => {
  res.redirect(301, '/blog');
});



router.get('/sitemap-news.xml', async (req, res) => {
  res.set('Content-Type', 'application/xml; charset=UTF-8');
  res.set('Cache-Control', 'public, max-age=60');
  res.render('sitemap-news', {
    items: [],
    siteOrigin: 'https://www.filemakr.com',
    publicationName: 'FileMakr',
    publicationLang: 'en'
  });
});

// Canonical report detail with degree: /{seo_name}-report-{degree}
router.get('/:seoName-report-:degree', dataService.allCategory, async (req, res, next) => {
  const degree = projectReportShared.normalizeReportDegreeSlug(req.params.degree);
  if (!projectReportShared.isReportCatalogDegree(degree)) {
    return next();
  }
  const seoName = (req.params.seoName || '').trim().toLowerCase();
  if (!seoName || isReportCatalogSeoName(seoName)) {
    return next();
  }
  const graduation_type_send = projectReportShared.degreeSlugToLabel(degree) || degree.toUpperCase();
  return renderSingleProjectReport(req, res, {
    seoName,
    original: degree,
    graduation_type_send,
    degreeLabel: graduation_type_send,
  });
});

router.get('/:seoName-report-:degree/edit', dataService.allCategory, async (req, res, next) => {
  const degree = projectReportShared.normalizeReportDegreeSlug(req.params.degree);
  if (!projectReportShared.isReportCatalogDegree(degree)) {
    return next();
  }
  const seoName = (req.params.seoName || '').trim().toLowerCase();
  if (!seoName || isReportCatalogSeoName(seoName)) {
    return next();
  }
  const seo = resolveProjectReportSeoSlug(seoName);
  if (!seo || seo.length > 200) {
    return res.status(404).render('error', { message: 'Project report not found', error: { status: 404, stack: '' } });
  }
  const qType = String(req.query.type || '').toLowerCase();
  const plan = qType === 'synopsis' ? 'synopsis' : 'report';
  return res.redirect(301, `/checkout?type=report&seo=${encodeURIComponent(seo)}&plan=${plan}`);
});

// Canonical report detail: /{seo_name}-report (register late — path ends with -report)
router.get('/:seoName-report', dataService.allCategory, async (req, res, next) => {
  const seoName = (req.params.seoName || '').trim().toLowerCase();
  if (!seoName || isReportCatalogSeoName(seoName)) {
    return next();
  }
  return renderSingleProjectReport(req, res, { seoName });
});

router.get('/:seoName-report/edit', dataService.allCategory, async (req, res, next) => {
  const seoName = (req.params.seoName || '').trim().toLowerCase();
  if (!seoName || isReportCatalogSeoName(seoName)) {
    return next();
  }
  const seo = resolveProjectReportSeoSlug(seoName);
  if (!seo || seo.length > 200) {
    return res.status(404).render('error', { message: 'Project report not found', error: { status: 404, stack: '' } });
  }
  const qType = String(req.query.type || '').toLowerCase();
  const plan = qType === 'synopsis' ? 'synopsis' : 'report';
  return res.redirect(301, `/checkout?type=report&seo=${encodeURIComponent(seo)}&plan=${plan}`);
});

module.exports = router;
