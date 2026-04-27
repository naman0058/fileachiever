const cron = require('node-cron');
const jwt = require('jsonwebtoken');
const {
  createFilemakrSmtpTransport,
  filemakrMailFrom,
} = require('../utils/filemakrSmtp');

function scheduleDailyAttendanceMorningMail() {
  const secret = process.env.DAILY_TASK_LINK_SECRET;
  const emails = (process.env.DAILY_TASK_TEAM_EMAILS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const tz = process.env.DAILY_TASK_MAIL_TZ || 'Asia/Kolkata';

  if (!secret) {
    console.warn(
      '[daily-attendance-mail] Disabled: set DAILY_TASK_LINK_SECRET in .env (use a long random string).'
    );
    return;
  }
  if (emails.length === 0) {
    console.warn(
      '[daily-attendance-mail] Disabled: set DAILY_TASK_TEAM_EMAILS=comma@separated,emails in .env'
    );
    return;
  }

  cron.schedule(
    '45 9 * * *',
    async () => {
      const token = jwt.sign({ typ: 'daily_team' }, secret, { expiresIn: '48h' });
      const base = (process.env.PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/$/, '');
      const link = `${base}/daily-attendance/task?t=${encodeURIComponent(token)}`;
      const transporter = createFilemakrSmtpTransport();
      const from =
        process.env.DAILY_TASK_MAIL_FROM || filemakrMailFrom('FileMakr');

      for (const to of emails) {
        try {
          await transporter.sendMail({
            from,
            to,
            subject: 'Daily attendance task — please set or edit today’s task',
            html: `<p>Hi,</p>
<p>Please open the link below to set <strong>today’s daily attendance task</strong> for brand ambassadors.</p>
<p><a href="${link}">${link}</a></p>
<p><strong>Options on the page:</strong></p>
<ul>
<li><strong>Instagram — latest post</strong> — uses the latest Instagram post (same as the affiliate dashboard integration).</li>
<li><strong>Custom task</strong> — enter title and description manually, then save.</li>
</ul>
<p>If someone already created today’s task, you will only be able to <strong>edit</strong> it (no duplicate).</p>
<p>Authorized affiliate users can also edit at <code>/affiliate/create-task</code> after logging in. This email link does not use that login.</p>
<p><small>Link is valid about 48 hours.</small></p>`
          });
          console.log('[daily-attendance-mail] Sent to', to);
        } catch (e) {
          console.error('[daily-attendance-mail] Failed for', to, e.message);
        }
      }
    },
    { timezone: tz }
  );

  console.log(
    `[daily-attendance-mail] Scheduled 09:30 (${tz}) for ${emails.length} recipient(s): ${emails.join(', ')}`
  );
}

module.exports = { scheduleDailyAttendanceMorningMail };
