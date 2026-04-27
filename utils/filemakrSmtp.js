'use strict';

const nodemailer = require('nodemailer');

const SMTP_HOST = process.env.SMTP_HOST || 'smtpout.secureserver.net';

const _portRaw = process.env.SMTP_PORT;
const SMTP_PORT =
  _portRaw !== undefined && _portRaw !== '' && !Number.isNaN(Number(_portRaw))
    ? Number(_portRaw)
    : 465;

const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;

let warnedMissingCreds = false;

function warnMissingOnce() {
  if (warnedMissingCreds) return;
  warnedMissingCreds = true;
  if (!SMTP_USER || !SMTP_PASS) {
    console.warn(
      '[filemakrSmtp] SMTP_USER and/or SMTP_PASS are not set in .env — outbound mail will fail until they are set.'
    );
  }
}

function smtpSecure() {
  const s = process.env.SMTP_SECURE;
  if (s !== undefined && s !== '') {
    return s === 'true' || s === '1';
  }
  return SMTP_PORT === 465;
}

/**
 * Shared FILEMAKR SMTP transport. `auth` uses env only (no hardcoded secrets).
 * @param {object} [extra] — merged last (e.g. pool, timeouts).
 */
function createFilemakrSmtpTransport(extra = {}) {
  warnMissingOnce();
  const secure = smtpSecure();
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
    ...(SMTP_PORT === 587 && !secure ? { requireTLS: true } : {}),
    tls: { minVersion: 'TLSv1.2' },
    ...extra,
  });
}

function filemakrFromEmail() {
  return SMTP_USER || '';
}

/** If SMTP_FROM is set, use it as the full From header; else "Name" <SMTP_USER>. */
function filemakrMailFrom(displayName = 'FILEMAKR Team') {
  if (process.env.SMTP_FROM && process.env.SMTP_FROM.trim()) {
    return process.env.SMTP_FROM.trim();
  }
  const addr = filemakrFromEmail();
  if (!addr) return displayName;
  return `"${displayName}" <${addr}>`;
}

function filemakrSupportEmail() {
  return (
    (process.env.SUPPORT_EMAIL && process.env.SUPPORT_EMAIL.trim()) ||
    (process.env.PUBLIC_SUPPORT_EMAIL && process.env.PUBLIC_SUPPORT_EMAIL.trim()) ||
    filemakrFromEmail() ||
    ''
  );
}

module.exports = {
  createFilemakrSmtpTransport,
  filemakrFromEmail,
  filemakrMailFrom,
  filemakrSupportEmail,
  SMTP_HOST,
  SMTP_PORT,
};
