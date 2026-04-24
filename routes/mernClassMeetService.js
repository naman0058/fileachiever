/**
 * MERN Training: one Google Meet per calendar day (default 7:00 PM Asia/Kolkata),
 * Calendar API + DB dedupe.
 *
 * Auth (pick one):
 * - OAuth user (MERN_GOOGLE_OAUTH_*): can add attendees and send real Calendar invites.
 * - Service account keyfile: create events + Meet only if the calendar is shared with the
 *   service account; cannot add guests without Workspace domain-wide delegation.
 */
const path = require('path');
const { google } = require('googleapis');
const { DateTime } = require('luxon');
const pool = require('./pool');

const promisePool = pool.promise();

const TZ = process.env.MERN_CLASS_TZ || 'Asia/Kolkata';
const HOUR = parseInt(process.env.MERN_CLASS_HOUR || '19', 10);
const MINUTE = parseInt(process.env.MERN_CLASS_MINUTE || '0', 10);
const DURATION_MIN = parseInt(process.env.MERN_CLASS_DURATION_MINUTES || '60', 10);
const KEYFILE =
  process.env.MERN_GOOGLE_CALENDAR_KEYFILE || process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '';
const CALENDAR_ID = process.env.MERN_GOOGLE_CALENDAR_ID || '';
const OAUTH_REDIRECT_DEFAULT = 'http://127.0.0.1:8766/mern-calendar-oauth-callback';

function useOAuth() {
  const id = String(process.env.MERN_GOOGLE_OAUTH_CLIENT_ID || '').trim();
  const secret = String(process.env.MERN_GOOGLE_OAUTH_CLIENT_SECRET || '').trim();
  const rt = String(process.env.MERN_GOOGLE_OAUTH_REFRESH_TOKEN || '').trim();
  return !!(id && secret && rt);
}

function calendarInvitesEnabled() {
  return useOAuth();
}

let tablesEnsured = false;

function todayMeetDate() {
  return DateTime.now().setZone(TZ).toISODate();
}

function meetWindowForDate(meetDateStr) {
  const start = DateTime.fromISO(
    `${meetDateStr}T${String(HOUR).padStart(2, '0')}:${String(MINUTE).padStart(2, '0')}:00`,
    { zone: TZ }
  );
  const end = start.plus({ minutes: DURATION_MIN });
  return { start, end };
}

async function ensureTables() {
  if (tablesEnsured) return;
  await promisePool.query(`
    CREATE TABLE IF NOT EXISTS mern_daily_class_meet (
      id INT AUTO_INCREMENT PRIMARY KEY,
      meet_date DATE NOT NULL,
      calendar_event_id VARCHAR(255) NOT NULL,
      meet_link VARCHAR(1024) NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_mern_meet_date (meet_date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await promisePool.query(`
    CREATE TABLE IF NOT EXISTS mern_class_meet_student_sent (
      id INT AUTO_INCREMENT PRIMARY KEY,
      meet_date DATE NOT NULL,
      shopkeeper_id INT NOT NULL,
      email VARCHAR(255) NOT NULL,
      sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_mern_meet_student_day (meet_date, shopkeeper_id),
      KEY idx_mern_meet_shopkeeper (shopkeeper_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  tablesEnsured = true;
}

async function getAuth() {
  if (!String(CALENDAR_ID).trim()) {
    const err = new Error(
      'Google Calendar is not configured. Set MERN_GOOGLE_CALENDAR_ID and OAuth credentials or a service account keyfile.'
    );
    err.code = 'MEET_NOT_CONFIGURED';
    throw err;
  }
  if (useOAuth()) {
    const redirectUri =
      String(process.env.MERN_GOOGLE_OAUTH_REDIRECT_URI || '').trim() || OAUTH_REDIRECT_DEFAULT;
    const oauth2Client = new google.auth.OAuth2(
      process.env.MERN_GOOGLE_OAUTH_CLIENT_ID,
      process.env.MERN_GOOGLE_OAUTH_CLIENT_SECRET,
      redirectUri
    );
    oauth2Client.setCredentials({
      refresh_token: process.env.MERN_GOOGLE_OAUTH_REFRESH_TOKEN
    });
    return oauth2Client;
  }
  if (!String(KEYFILE).trim()) {
    const err = new Error(
      'Google Calendar is not configured. Set MERN_GOOGLE_CALENDAR_ID and either MERN_GOOGLE_OAUTH_CLIENT_ID, MERN_GOOGLE_OAUTH_CLIENT_SECRET, MERN_GOOGLE_OAUTH_REFRESH_TOKEN, or MERN_GOOGLE_CALENDAR_KEYFILE (or GOOGLE_SERVICE_ACCOUNT_JSON).'
    );
    err.code = 'MEET_NOT_CONFIGURED';
    throw err;
  }
  const keyPath = path.isAbsolute(KEYFILE) ? KEYFILE : path.join(process.cwd(), KEYFILE);
  const googleAuth = new google.auth.GoogleAuth({
    keyFile: keyPath,
    scopes: ['https://www.googleapis.com/auth/calendar']
  });
  return googleAuth.getClient();
}

async function getCalendar() {
  const auth = await getAuth();
  return google.calendar({ version: 'v3', auth });
}

function extractMeetLink(event) {
  if (event.hangoutLink) return event.hangoutLink;
  const eps = event.conferenceData?.entryPoints || [];
  const video = eps.find((e) => e.entryPointType === 'video');
  return video?.uri || '';
}

async function createCalendarEventWithMeet(meetDateStr) {
  const cal = await getCalendar();
  const { start, end } = meetWindowForDate(meetDateStr);
  const requestId = `mern-${meetDateStr}-${process.hrtime.bigint()}`;
  const event = {
    summary: `MERN Training — Daily class (${meetDateStr})`,
    description:
      'Daily MERN program live class. Join via Google Meet. One link per day for all verified students.',
    start: { dateTime: start.toISO({ includeOffset: true }), timeZone: TZ },
    end: { dateTime: end.toISO({ includeOffset: true }), timeZone: TZ },
    conferenceData: {
      createRequest: {
        requestId,
        conferenceSolutionKey: { type: 'hangoutsMeet' }
      }
    }
  };
  const { data } = await cal.events.insert({
    calendarId: CALENDAR_ID,
    requestBody: event,
    conferenceDataVersion: 1,
    sendUpdates: 'none'
  });
  const meetLink = extractMeetLink(data);
  if (!meetLink) {
    const err = new Error('Google Calendar did not return a Meet link. Check conference settings.');
    err.code = 'NO_MEET_LINK';
    throw err;
  }
  return { eventId: data.id, meetLink };
}

/**
 * Adds a guest to the daily class event and asks Google to email them (OAuth user only).
 */
async function addAttendeeToClassEvent(eventId, email, displayName) {
  if (!useOAuth() || !eventId || !String(email).trim()) return;
  const cal = await getCalendar();
  const emailTrim = String(email).trim();
  const norm = emailTrim.toLowerCase();
  const { data: event } = await cal.events.get({
    calendarId: CALENDAR_ID,
    eventId
  });
  const attendees = Array.isArray(event.attendees) ? [...event.attendees] : [];
  if (attendees.some((a) => a.email && String(a.email).toLowerCase() === norm)) return;
  attendees.push({
    email: emailTrim,
    displayName: displayName ? String(displayName).trim() : undefined,
    responseStatus: 'needsAction'
  });
  await cal.events.patch({
    calendarId: CALENDAR_ID,
    eventId,
    requestBody: { attendees },
    sendUpdates: 'all'
  });
}

/**
 * Ensures today's Meet exists (creates calendar event if needed). Email with link is sent from the route (SMTP).
 */
async function enrollStudentInTodayClass({ shopkeeperId, email, studentName }) {
  await ensureTables();
  const emailNorm = String(email || '').trim();
  if (!emailNorm) {
    const err = new Error('Your profile has no email. Update your account with the team.');
    err.code = 'NO_EMAIL';
    throw err;
  }

  const meetDate = todayMeetDate();

  const [dup] = await promisePool.query(
    'SELECT id FROM mern_class_meet_student_sent WHERE meet_date = ? AND shopkeeper_id = ? LIMIT 1',
    [meetDate, shopkeeperId]
  );
  if (dup[0]) {
    const [dayRows] = await promisePool.query(
      'SELECT meet_link FROM mern_daily_class_meet WHERE meet_date = ? LIMIT 1',
      [meetDate]
    );
    return {
      meetLink: dayRows[0]?.meet_link || null,
      emailSent: false,
      meetDate,
      alreadyEnrolled: true,
      timeLabel: formatClassTimeLabel()
    };
  }

  const conn = await promisePool.getConnection();
  try {
    const [[lockRow]] = await conn.query(
      "SELECT GET_LOCK('mern_daily_class_meet', 30) AS got"
    );
    if (lockRow.got !== 1) {
      const err = new Error('Another student is creating today’s meeting. Try again in a few seconds.');
      err.code = 'LOCK_TIMEOUT';
      throw err;
    }

    let [dayRows] = await conn.query(
      'SELECT calendar_event_id, meet_link FROM mern_daily_class_meet WHERE meet_date = ? LIMIT 1',
      [meetDate]
    );

    let meetLink;
    let eventId;

    if (!dayRows[0]) {
      const created = await createCalendarEventWithMeet(meetDate);
      eventId = created.eventId;
      meetLink = created.meetLink;
      try {
        await conn.query(
          'INSERT INTO mern_daily_class_meet (meet_date, calendar_event_id, meet_link) VALUES (?,?,?)',
          [meetDate, eventId, meetLink]
        );
      } catch (insertErr) {
        if (insertErr.code !== 'ER_DUP_ENTRY') throw insertErr;
        [dayRows] = await conn.query(
          'SELECT calendar_event_id, meet_link FROM mern_daily_class_meet WHERE meet_date = ? LIMIT 1',
          [meetDate]
        );
        eventId = dayRows[0].calendar_event_id;
        meetLink = dayRows[0].meet_link;
      }
    } else {
      meetLink = dayRows[0].meet_link;
      eventId = dayRows[0].calendar_event_id;
    }

    let emailSent = false;
    try {
      await conn.query(
        'INSERT INTO mern_class_meet_student_sent (meet_date, shopkeeper_id, email) VALUES (?,?,?)',
        [meetDate, shopkeeperId, emailNorm]
      );
      emailSent = true;
    } catch (ins) {
      if (ins.code !== 'ER_DUP_ENTRY') throw ins;
      emailSent = false;
    }

    if (useOAuth() && eventId && emailNorm) {
      try {
        await addAttendeeToClassEvent(eventId, emailNorm, studentName || '');
      } catch (calErr) {
        console.error('mernClassMeetService: calendar invite failed:', calErr.response?.data || calErr.message || calErr);
      }
    }

    return {
      meetLink,
      emailSent,
      meetDate,
      alreadyEnrolled: false,
      studentName: studentName || '',
      timeLabel: formatClassTimeLabel()
    };
  } finally {
    try {
      await conn.query("SELECT RELEASE_LOCK('mern_daily_class_meet')");
    } catch (_) {}
    conn.release();
  }
}

function formatClassTimeLabel() {
  const { start } = meetWindowForDate(todayMeetDate());
  return `${start.toFormat('h:mm a')} (${TZ})`;
}

function isConfigured() {
  if (!String(CALENDAR_ID).trim()) return false;
  if (useOAuth()) return true;
  return !!String(KEYFILE).trim();
}

module.exports = {
  ensureTables,
  todayMeetDate,
  meetWindowForDate,
  enrollStudentInTodayClass,
  formatClassTimeLabel,
  isConfigured,
  calendarInvitesEnabled,
  TZ
};
