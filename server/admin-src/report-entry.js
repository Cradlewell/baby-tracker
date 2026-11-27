// The app's own monthly report, for the admin dashboard. Built into public/admin/report.js with
// `npm run build:admin`. It prepares the data exactly like the app (src/lib/reportPdf.js) and
// calls the same monthReportHtml, so the admin's PDF is the same report a parent or nurse saves.
import { addDays, differenceInCalendarDays, format } from 'date-fns';
import { monthReportHtml, monthRange } from '../../src/lib/monthReport';
import { monthSummary } from '../../src/lib/monthSummary';
import { recentActivity } from '../../src/lib/recentActivity';
import { reportName } from '../../src/lib/dailyReport';

const OTHER = ['temp-', 'breath-', 'skin-', 'growth-', 'ms-'];

/**
 * baby: { id, name, dob, ... }; records: { feeding, sleep, diaper, medicine, growth, vaccination,
 * temperature, breathing, skin, milestone } (arrays as saved by the app); month: a Date in it.
 * Returns { html, name } or { empty: 'reason' } when nothing was recorded that month.
 */
function buildMonthReport({ baby, records, month }) {
  const r = (k) => records[k] || [];
  const data = {
    feeds: r('feeding'), sleeps: r('sleep'), diapers: r('diaper'), medicines: r('medicine'),
    growth: r('growth'), vaccines: r('vaccination'), temps: r('temperature'), breaths: r('breathing'), skin: r('skin'),
  };
  const range = monthRange({ month, ...data });
  const summary = monthSummary({
    ...data, end: range.endDay, dob: baby.dob, rangeDays: differenceInCalendarDays(range.endDay, range.startDay) + 1,
  });
  const from = range.startDay.getTime();
  const until = addDays(range.endDay, 1).getTime();
  const entries = recentActivity({
    babyId: baby.id, feeds: data.feeds, sleeps: data.sleeps, diapers: data.diapers, medicines: data.medicines,
    growth: data.growth, vaccines: data.vaccines, temperatures: data.temps, breathing: data.breaths,
    skin: data.skin, milestones: r('milestone'), limit: Infinity,
  }).filter((e) => e.at >= from && e.at < until && !e.key.endsWith('-now')).reverse();
  const monthLabel = format(range.month, 'MMMM yyyy');
  if (!entries.length) return { empty: `${baby.name || 'This baby'} has nothing recorded for ${monthLabel}.` };

  const html = monthReportHtml({
    baby, month, now: new Date(),
    feeds: data.feeds, sleeps: data.sleeps, diapers: data.diapers, medicines: data.medicines, vaccines: data.vaccines,
    others: entries.filter((e) => OTHER.some((k) => e.key.startsWith(k))),
    overdue: summary.vaccines.overdue,
  });
  // The same file name the app gives it, e.g. "Cradlewell_Asha_October 2026".
  const name = reportName(baby, monthLabel).replace(/[\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim();
  return { html, name };
}

window.CradlewellReport = { buildMonthReport };
