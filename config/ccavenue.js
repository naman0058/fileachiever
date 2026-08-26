/**
 * CCAvenue gateway config — secrets from env only.
 * Never hardcode working_key / access_code in route files.
 */
'use strict';

require('dotenv').config();

const siteBase = (process.env.SITE_BASE_URL || 'https://www.filemakr.com').replace(/\/$/, '');
const merchantId = String(process.env.CCAVENUE_MERCHANT_ID || '').trim();
const workingKey = String(process.env.CCAVENUE_WORKING_KEY || '').trim();
const accessCode = String(process.env.CCAVENUE_ACCESS_CODE || '').trim();

if (!merchantId || !workingKey || !accessCode) {
  console.warn(
    '[ccavenue] Set CCAVENUE_MERCHANT_ID, CCAVENUE_WORKING_KEY, CCAVENUE_ACCESS_CODE in .env'
  );
}

/** Map our checkout preference → CCAvenue payment_option (pre-selects method on hosted page). */
const PAYMENT_OPTION_MAP = {
  upi: 'OPTUPI',
  gpay: 'OPTUPI',
  phonepe: 'OPTUPI',
  paytm: 'OPTUPI',
  card: 'OPTCRDC',
  netbanking: 'OPTNBK',
  wallet: 'OPTWLT'
};

function mapPaymentOption(pref) {
  const key = String(pref || 'upi').trim().toLowerCase();
  return PAYMENT_OPTION_MAP[key] || 'OPTUPI';
}

function normalizePaymentPref(pref) {
  const key = String(pref || 'upi').trim().toLowerCase();
  if (key === 'gpay' || key === 'phonepe' || key === 'paytm') return 'upi';
  if (PAYMENT_OPTION_MAP[key]) return key;
  return 'upi';
}

module.exports = {
  merchantId,
  workingKey,
  accessCode,
  redirectUrl: process.env.CCAVENUE_REDIRECT_URL || siteBase + '/ccavResponseHandler',
  cancelUrl: process.env.CCAVENUE_CANCEL_URL || siteBase + '/ccavResponseHandler',
  initiateUrl:
    process.env.CCAVENUE_INITIATE_URL ||
    'https://secure.ccavenue.com/transaction/transaction.do?command=initiateTransaction',
  allowDummyPay:
    process.env.ALLOW_DUMMY_PAY === '1' ||
    (process.env.NODE_ENV !== 'production' && process.env.ALLOW_DUMMY_PAY !== '0'),
  mapPaymentOption,
  normalizePaymentPref,
  PAYMENT_OPTION_MAP
};
