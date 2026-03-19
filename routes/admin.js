
var express = require('express');
var router = express.Router();
var upload = require('./multer');
var mysql = require('mysql')
var pool = require('./pool')
var pool2 = require('./pool2')
var table = 'admin'
var table1 = 'source_code'
var verify = require('./verify')

const TelegramBot = require('node-telegram-bot-api');
const token = process.env.TELEGRAM_BOT_TOKEN;
const bot = token ? new TelegramBot(token, { polling: false }) : null;

require('dotenv').config();

const OTP_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes
const util = require('util');
const poolQuery = util.promisify(pool.query).bind(pool);

function generateOTP() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function findAdminByEmail(email) {
  const e = (email || '').trim().toLowerCase();
  if (!e) return null;
  try {
    const rows = await poolQuery(
      `SELECT id FROM ${table} WHERE (LOWER(TRIM(email)) = ? AND email IS NOT NULL AND email != '') OR (LOWER(TRIM(username)) = ? AND username LIKE '%@%') LIMIT 1`,
      [e, e]
    );
    return rows[0] || null;
  } catch (err) {
    if (err.code === 'ER_BAD_FIELD_ERROR') {
      const fallback = await poolQuery(
        `SELECT id FROM ${table} WHERE LOWER(TRIM(username)) = ? AND username LIKE '%@%' LIMIT 1`,
        [e]
      );
      return fallback[0] || null;
    }
    throw err;
  }
}

router.get('/', (req, res) => {
  if (req.query.clear === '1') {
    req.session.backofficeOtp = null;
    req.session.backofficeOtpEmail = null;
    req.session.backofficeOtpAdminId = null;
    req.session.backofficeOtpTime = null;
    return res.redirect('/backoffice');
  }
  const redirect = (req.query.redirect || '').toString();
  if (redirect && redirect.startsWith('/')) req.session.backofficeRedirect = redirect;
  if (req.session.backofficeOtpEmail) {
    return res.redirect('/backoffice/verify-otp-page?email=' + encodeURIComponent(req.session.backofficeOtpEmail));
  }
  res.render('backoffice', { msg: req.query.msg || '', msgType: 'danger', step: 'email' });
});

router.post('/request-otp', async (req, res) => {
  const email = (req.body.email || '').toString().trim().toLowerCase();
  if (!email) {
    return res.render('backoffice', { msg: 'Please enter your email.', msgType: 'danger', step: 'email' });
  }
  let admin;
  try {
    admin = await findAdminByEmail(email);
  } catch (err) {
    console.error('Backoffice auth error');
    return res.render('backoffice', { msg: 'Database error. Please try again.', msgType: 'danger', step: 'email' });
  }
  if (!admin) {
    return res.render('backoffice', { msg: 'This email is not registered. Contact administrator.', msgType: 'danger', step: 'email' });
  }
  const otp = generateOTP();
  req.session.backofficeOtp = otp;
  req.session.backofficeOtpEmail = email;
  req.session.backofficeOtpAdminId = admin.id;
  req.session.backofficeOtpTime = Date.now();

  const subject = 'Your FileAchiever backoffice verification code';
  const html = `
    <p>Your one-time verification code is:</p>
    <h2 style="font-family:monospace;letter-spacing:8px;color:#F17F23;">${otp}</h2>
    <p style="color:#6b7280;font-size:14px;">This code expires in 10 minutes. If you didn't request this, ignore this email.</p>
    <p style="color:#6b7280;font-size:12px;">— FileAchiever</p>
  `;

  verify.sendUserMail(email, subject, html).catch(() => {});

  res.redirect('/backoffice/verify-otp-page?email=' + encodeURIComponent(email));
});

router.get('/verify-otp-page', (req, res) => {
  const email = (req.query.email || '').toString().trim();
  if (!email || req.session.backofficeOtpEmail !== email) {
    req.session.backofficeOtp = null;
    req.session.backofficeOtpEmail = null;
    req.session.backofficeOtpAdminId = null;
    req.session.backofficeOtpTime = null;
    return res.redirect('/backoffice');
  }
  res.render('backoffice', { msg: req.query.msg || '', msgType: req.query.msgType || 'danger', step: 'verify', email });
});

router.post('/verify-otp', (req, res) => {
  const email = (req.body.email || '').toString().trim().toLowerCase();
  const otp1 = (req.body.otp1 || '').toString();
  const otp2 = (req.body.otp2 || '').toString();
  const otp3 = (req.body.otp3 || '').toString();
  const otp4 = (req.body.otp4 || '').toString();
  const otp5 = (req.body.otp5 || '').toString();
  const otp6 = (req.body.otp6 || '').toString();
  const enteredOtp = otp1 + otp2 + otp3 + otp4 + otp5 + otp6;

  if (!email || enteredOtp.length !== 6) {
    return res.redirect('/backoffice/verify-otp-page?email=' + encodeURIComponent(email) + '&msg=Please%20enter%20the%206-digit%20code');
  }
  if (req.session.backofficeOtpEmail !== email) {
    return res.redirect('/backoffice?msg=Session%20expired.%20Please%20start%20again');
  }
  const elapsed = Date.now() - (req.session.backofficeOtpTime || 0);
  if (elapsed > OTP_EXPIRY_MS) {
    req.session.backofficeOtp = null;
    req.session.backofficeOtpEmail = null;
    req.session.backofficeOtpAdminId = null;
    req.session.backofficeOtpTime = null;
    return res.redirect('/backoffice?msg=Code%20expired.%20Request%20a%20new%20one');
  }
  if (req.session.backofficeOtp !== enteredOtp) {
    return res.redirect('/backoffice/verify-otp-page?email=' + encodeURIComponent(email) + '&msg=Invalid%20code.%20Please%20try%20again');
  }

  const adminId = req.session.backofficeOtpAdminId || 1;
  req.session.backofficeOtp = null;
  req.session.backofficeOtpEmail = null;
  req.session.backofficeOtpAdminId = null;
  req.session.backofficeOtpTime = null;
  req.session.adminid = adminId;
  const redirect = req.session.backofficeRedirect || '';
  delete req.session.backofficeRedirect;
  if (redirect && redirect.startsWith('/') && !redirect.startsWith('//')) {
    return res.redirect(redirect);
  }
  res.redirect('/backoffice/add-project');
});

function requireBackofficeAuth(req, res, next) {
  if (!req.session || !req.session.adminid) return res.redirect('/backoffice');
  next();
}

router.get('/add-project', requireBackofficeAuth, (req, res) => {
  pool.query(`select * from ${table1}`, (err, result) => {
    if (err) throw err;
    else res.render('AddProject/add-project', { result });
  });
});

router.post('/add-project/insert', requireBackofficeAuth, upload.single('zip'), (req, res) => {
  let body = req.body;
  var seo_variable = (body.name.split(' ').join('-')).toLowerCase();
  body['source_code'] = req.file.filename;
  body['seo_name'] = seo_variable;
  pool.query(`insert into ${table1} set ?`, body, (err, result) => err ? console.log(err) : res.json(result));
});

router.get('/project-delete', requireBackofficeAuth, (req, res) =>
  pool.query(`delete from ${table1} where id = ${req.query.id}`, (err, result) => err ? console.log(err) : res.json(result))
);

module.exports = router;
