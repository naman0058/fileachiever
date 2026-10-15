'use strict';

const DEFAULT_TZ = 'Asia/Kolkata';

/** YYYY-MM-DD in IST (or given IANA tz if supported by runtime). */
function todayYmdInTz(tz = DEFAULT_TZ) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
      new Date()
    );
  } catch (_) {
    return new Date().toISOString().slice(0, 10);
  }
}

function parseYmd(v) {
  if (!v) return null;
  if (v instanceof Date) {
    return new Date(v.getFullYear(), v.getMonth(), v.getDate());
  }
  const s = String(v).trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function addDaysYmd(ymd, days) {
  const d = parseYmd(ymd);
  if (!d) return null;
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function daysBetweenYmd(fromYmd, toYmd) {
  const a = parseYmd(fromYmd);
  const b = parseYmd(toYmd);
  if (!a || !b) return null;
  return Math.round((b - a) / 86400000);
}

module.exports = {
  DEFAULT_TZ,
  todayYmdInTz,
  parseYmd,
  addDaysYmd,
  daysBetweenYmd,
};
