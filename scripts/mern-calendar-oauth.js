#!/usr/bin/env node
/**
 * One-time helper: obtain MERN_GOOGLE_OAUTH_REFRESH_TOKEN for MERN class Calendar + Meet.
 *
 * 1. Google Cloud Console → APIs & Services → Credentials → Create OAuth client ID
 *    (Web application). Enable Google Calendar API for the project.
 * 2. Authorized redirect URIs: http://127.0.0.1:8766/mern-calendar-oauth-callback
 * 3. Put MERN_GOOGLE_OAUTH_CLIENT_ID and MERN_GOOGLE_OAUTH_CLIENT_SECRET in .env
 * 4. From project root: npm run mern-calendar-oauth
 * 5. Add MERN_GOOGLE_OAUTH_REFRESH_TOKEN to .env (and MERN_GOOGLE_CALENDAR_ID — often
 *    "primary" for the signing-in user, or a calendar ID from Calendar settings).
 *
 * If Google returns no refresh token, revoke the app under the Google account
 * (Third-party access) and run this script again.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const http = require('http');
const { google } = require('googleapis');
const { URL } = require('url');

const PORT = 8766;
const REDIRECT_PATH = '/mern-calendar-oauth-callback';
const REDIRECT_URI = `http://127.0.0.1:${PORT}${REDIRECT_PATH}`;

const clientId = process.env.MERN_GOOGLE_OAUTH_CLIENT_ID;
const clientSecret = process.env.MERN_GOOGLE_OAUTH_CLIENT_SECRET;

if (!clientId || !clientSecret) {
  console.error(
    'Set MERN_GOOGLE_OAUTH_CLIENT_ID and MERN_GOOGLE_OAUTH_CLIENT_SECRET in .env first.'
  );
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);
const scopes = ['https://www.googleapis.com/auth/calendar'];

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url || '/', `http://127.0.0.1:${PORT}`);
  if (u.pathname !== REDIRECT_PATH) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }
  const code = u.searchParams.get('code');
  const oerr = u.searchParams.get('error');
  if (oerr) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`OAuth error: ${oerr}`);
    server.close();
    process.exit(1);
    return;
  }
  if (!code) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Missing code');
    server.close();
    process.exit(1);
    return;
  }
  try {
    const { tokens } = await oauth2Client.getToken(code);
    const rt = tokens.refresh_token;
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(
      `<!DOCTYPE html><meta charset="utf-8"><title>MERN Calendar OAuth</title>` +
        `<p>Add to <code>.env</code>:</p><pre>MERN_GOOGLE_OAUTH_REFRESH_TOKEN=${rt || '(missing — revoke app access and run again)'}</pre>` +
        `<p>You can close this tab.</p>`
    );
    if (rt) {
      console.log('\nMERN_GOOGLE_OAUTH_REFRESH_TOKEN=' + rt);
      console.log(
        '\nOptional (must match the redirect used to obtain the token):\nMERN_GOOGLE_OAUTH_REDIRECT_URI=' +
          REDIRECT_URI +
          '\n'
      );
    } else {
      console.warn(
        '\nNo refresh token returned. Remove this app from your Google account (third-party access), then run this script again.\n'
      );
    }
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(e.message || String(e));
    console.error(e);
  }
  server.close();
});

server.listen(PORT, '127.0.0.1', () => {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    prompt: 'consent'
  });
  console.log('Listening on ' + REDIRECT_URI);
  console.log('Open in browser:\n' + authUrl + '\n');
});
