import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import { Platform } from 'react-native';
import { format } from 'date-fns';

import { useBabyStore } from '../store/useBabyStore';
import { useFeedingStore } from '../store/useFeedingStore';
import { useSleepStore } from '../store/useSleepStore';
import { useDiaperStore } from '../store/useDiaperStore';
import { useMedicineStore } from '../store/useMedicineStore';
import { useGrowthStore } from '../store/useGrowthStore';
import { useVaccinationStore } from '../store/useVaccinationStore';
import {
  useTemperatureStore, useBreathingStore, useSkinStore, useMilestoneStore,
} from '../store/useHealthStores';
import { monthSummary } from './monthSummary';
import { dailyReportHtml } from './dailyReport';
import { recentActivity } from './recentActivity';
import { formatDuration, calcAge, startOfToday } from '../utils/formatters';

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));
const one = (n) => (Math.round(n * 10) / 10).toString();
const dur = (secs) => (secs > 0 ? formatDuration(Math.round(secs)) : '0m');

/** Row of a two-column table. `level` colours the value for attention or urgent. */
const row = (label, value, level) =>
  `<tr><td>${esc(label)}</td><td class="v ${level || ''}">${esc(value)}</td></tr>`;
const section = (title, rows) =>
  `<section><h2>${esc(title)}</h2>${rows.length ? `<table>${rows.join('')}</table>` : '<p class="empty">No records</p>'}</section>`;

function buildSections(r, isDay) {
  const { feeding: f, sleep: s, diapers: d, temperature: t, breathing: b, skin: sk, growth: g, vaccines: v } = r;
  const perDay = (n) => (isDay ? '' : ` · ${one(n / r.daysCounted)} a day`);
  const out = [];

  out.push(['Feeding', f.total ? [
    row('Breastfeeds', `${f.breastCount}${perDay(f.breastCount)}`),
    row('Breastfeeding time', dur(f.breastSecs)),
    row('Bottle feeds', `${f.bottleCount}${perDay(f.bottleCount)}`),
    row('Bottle milk', `${f.bottleMl} ml`),
    row('Total feeds', `${f.total}${perDay(f.total)}`),
    !isDay && f.busiest ? row('Busiest day', `${format(f.busiest.date, 'd MMM')} · ${f.busiest.feeds} feeds`) : '',
  ] : []]);
  out.push(['Sleep', s.totalSecs ? [
    row(isDay ? 'Total sleep' : 'Average sleep a day', dur(isDay ? s.totalSecs : s.perDaySecs)),
    row('Longest sleep', dur(s.longestSecs)),
    row('Naps', s.naps),
    row('Night sleeps', s.nights),
    s.wakeupsPerNight != null ? row('Wakeups per night', one(s.wakeupsPerNight)) : '',
  ] : []]);
  out.push(['Diapers', d.total ? [
    row('Total diapers', `${d.total}${perDay(d.total)}`),
    row('Wet (urine or both)', d.wet),
    row('Stool (stool or both)', d.stool),
    row('Dry', d.dry),
    !isDay && d.lowWetDays ? row('Days with fewer than 6 wet diapers', d.lowWetDays, 'attention') : '',
    ...d.colourWarnings.map((w) => row(`Warning colour: ${w.label}`, `${w.count}×`, 'urgent')),
  ] : []]);
  out.push(['Medicine', r.medicine.map((m) =>
    row(m.name, `${m.given} given${m.skipped ? ` · ${m.skipped} skipped` : ''}`, m.skipped ? 'attention' : ''))]);
  out.push(['Temperature', t.count ? [
    row('Readings', t.count),
    row(`Highest (${format(new Date(t.highest.time), isDay ? 'h:mm a' : 'd MMM')})`,
      `${t.highest.celsius.toFixed(1)} °C`, t.highestLevel),
    !isDay ? row('Days with fever (38 °C or more)', t.feverDays, t.feverDays ? 'urgent' : '') : '',
  ] : []]);
  out.push(['Breathing', b.count ? [
    row('Checks', b.count),
    row('Needed attention', b.attention, b.attention ? 'attention' : ''),
    row('Urgent', b.urgent, b.urgent ? 'urgent' : ''),
  ] : []]);
  out.push(['Skin & Jaundice', sk.count ? [
    row('Checks', sk.count),
    sk.first ? row('Yellowing at the start', sk.first) : '',
    sk.last ? row('Yellowing at the end', sk.last) : '',
    sk.trend ? row('Trend', sk.trend, sk.trend === 'Getting worse' ? 'urgent' : '') : '',
  ] : []]);
  out.push(['Growth', g.count ? [
    g.firstWeight ? row(`Weight (${format(new Date(g.firstWeight.date), 'd MMM')})`, `${g.firstWeight.value} ${g.firstWeight.unit}`) : '',
    g.lastWeight && !g.oneWeighIn ? row(`Weight (${format(new Date(g.lastWeight.date), 'd MMM')})`, `${g.lastWeight.value} ${g.lastWeight.unit}`) : '',
    g.lastHeight != null ? row('Height', `${g.lastHeight} cm`) : '',
  ] : []]);
  out.push(['Vaccines', [
    ...v.given.map((x) => row(x.name, `Given ${format(new Date(x.completedDate), 'd MMM')}`)),
    v.overdue ? row('Overdue now', v.overdue, 'urgent') : '',
  ]]);

  // Same order as the app: sections with records first, empty ones after.
  const built = out.map(([title, rows]) => ({ title, rows: rows.filter(Boolean) }));
  return [...built.filter((x) => x.rows.length), ...built.filter((x) => !x.rows.length)]
    .map((x) => section(x.title, x.rows)).join('');
}

function html({ kind, baby, r, entries }) {
  const isDay = kind === 'day';
  const range = isDay
    ? format(r.endDay, 'EEEE, d MMMM yyyy')
    : `${format(r.startDay, 'd MMM yyyy')} – ${format(r.endDay, 'd MMM yyyy')}`;

  const daily = isDay ? '' : `<section class="wide"><h2>Day by day</h2><table class="grid">
    <tr><th>Date</th><th>Breastfeeds</th><th>Bottle feeds</th><th>Sleep</th><th>Diapers</th><th>Wet</th></tr>
    ${r.days.map((d) => `<tr><td>${format(d.date, 'EEE d MMM')}</td><td>${d.breast}</td><td>${d.bottle}</td><td>${dur(d.sleepSecs)}</td><td>${d.diapers}</td><td>${d.wet}</td></tr>`).join('')}
  </table></section>`;

  const timeline = !isDay ? '' : `<section class="wide"><h2>All entries</h2>${entries.length
    ? `<table class="grid"><tr><th>Time</th><th>Type</th><th>Details</th></tr>${entries.map((e) =>
      `<tr><td>${format(e.at, 'h:mm a')}</td><td>${esc(e.label)}</td><td>${esc(e.value)}</td></tr>`).join('')}</table>`
    : '<p class="empty">No records</p>'}</section>`;

  return `<!doctype html><html><head><meta charset="utf-8"><style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, Roboto, Helvetica, Arial, sans-serif; color: #1B1F2E; margin: 28px; font-size: 12px; }
    header { background: linear-gradient(135deg, #6388FF, #5F47FF); color: #fff; border-radius: 16px; padding: 20px 22px; }
    header h1 { margin: 0 0 4px; font-size: 22px; }
    header p { margin: 2px 0; font-size: 13px; }
    .totals { display: flex; gap: 10px; margin: 16px 0 6px; }
    .totals div { flex: 1; background: #EEF0FF; border-radius: 12px; padding: 12px; text-align: center; }
    .totals b { display: block; font-size: 20px; color: #5F47FF; }
    .cols { columns: 2; column-gap: 16px; }
    section { break-inside: avoid; border: 1px solid #E6E8F5; border-radius: 12px; padding: 12px 14px; margin: 12px 0; }
    section.wide { column-span: all; }
    h2 { font-size: 14px; margin: 0 0 8px; color: #5F47FF; }
    table { width: 100%; border-collapse: collapse; }
    td, th { padding: 5px 4px; border-bottom: 1px solid #F0F1F8; text-align: left; vertical-align: top; }
    td.v { text-align: right; font-weight: 700; }
    .grid th { background: #F5F6FF; font-size: 11px; }
    .grid td { text-align: left; }
    .attention { color: #C77700; } .urgent { color: #E03A3A; }
    .empty { color: #8C92AE; margin: 0; }
    footer { margin-top: 18px; color: #5B6280; font-size: 10px; }
  </style></head><body>
    <header>
      <h1>${isDay ? 'Daily report' : '30-day report'}</h1>
      <p><b>${esc(baby?.name || 'Baby')}</b>${baby?.dob ? ` · ${esc(calcAge(baby.dob))}` : ''}</p>
      <p>${range}</p>
    </header>
    <div class="totals">
      <div><b>${r.feeding.breastCount}</b>Breastfeeds${isDay ? '' : `<br>${one(r.feeding.breastCount / r.daysCounted)} a day`}</div>
      <div><b>${r.feeding.bottleCount}</b>Bottle feeds${isDay ? '' : `<br>${one(r.feeding.bottleCount / r.daysCounted)} a day`}</div>
      <div><b>${dur(r.sleep.totalSecs)}</b>Sleep${isDay ? '' : `<br>${dur(r.sleep.perDaySecs)} a day`}</div>
      <div><b>${r.diapers.total}</b>Diapers${isDay ? '' : `<br>${one(r.diapers.perDay)} a day`}</div>
    </div>
    ${!isDay && r.daysWithLogs < r.days.length ? `<p>Based on ${r.daysWithLogs} days with records. Averages cover ${r.daysCounted} days.</p>` : ''}
    <div class="cols">${buildSections(r, isDay)}</div>
    ${daily}${timeline}
    <footer>Created by Cradlewell on ${format(new Date(), 'd MMM yyyy, h:mm a')}. General guidance only; ask a doctor about any concern.</footer>
  </body></html>`;
}

const REPORTS_DIR = `${FileSystem.documentDirectory}reports/`;

/** Opens a saved report in the phone's PDF viewer (Android) or the share / preview sheet (iPhone). */
export async function openReport(uri) {
  if (Platform.OS === 'android') {
    let contentUri;
    try {
      contentUri = await FileSystem.getContentUriAsync(uri);
    } catch (err) {
      throw new Error(`Preparing the file to open failed: ${err?.message || String(err)}`);
    }
    try {
      await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
        data: contentUri,
        type: 'application/pdf',
        flags: 1, // FLAG_GRANT_READ_URI_PERMISSION: lets the viewer read the file
      });
    } catch (err) {
      throw new Error(`No app could open the PDF. Install a PDF viewer such as Google Drive and try again.\n\n(${err?.message || String(err)})`);
    }
    return;
  }
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
}

/**
 * Builds today's report (kind 'day') or the last 30 days (kind 'month') for the given baby
 * (the active baby when no id is passed) and saves it as a PDF in the app's reports folder.
 * Resolves { name, uri }: the file name to show and the file to open with openReport.
 */
export async function exportReport(kind, babyId) {
  const { babies, getActiveBaby } = useBabyStore.getState();
  const baby = babies.find((b) => b.id === babyId) || getActiveBaby();
  if (!baby) throw new Error('Add a baby first.');
  const id = baby.id;

  await Promise.all([
    useFeedingStore.getState().load(id), useSleepStore.getState().load(id),
    useDiaperStore.getState().load(id), useMedicineStore.getState().load(id),
    useGrowthStore.getState().load(id),
    baby.dob ? useVaccinationStore.getState().load(id, baby.dob) : null,
    useTemperatureStore.getState().load(id), useBreathingStore.getState().load(id),
    useSkinStore.getState().load(id), useMilestoneStore.getState().load(id),
  ]);
  const logs = (store) => store.getState().logs[id] || [];
  const data = {
    feeds: logs(useFeedingStore), sleeps: logs(useSleepStore), diapers: logs(useDiaperStore),
    medicines: logs(useMedicineStore), growth: logs(useGrowthStore),
    vaccines: useVaccinationStore.getState().records[id] || [],
    temps: logs(useTemperatureStore), breaths: logs(useBreathingStore), skin: logs(useSkinStore),
  };

  const r = monthSummary({ ...data, end: new Date(), dob: baby.dob, rangeDays: kind === 'day' ? 1 : 30 });
  const from = startOfToday().getTime();
  const entries = kind !== 'day' ? [] : recentActivity({
    babyId: id, feeds: data.feeds, sleeps: data.sleeps, diapers: data.diapers, medicines: data.medicines,
    growth: data.growth, vaccines: data.vaccines, temperatures: data.temps, breathing: data.breaths,
    skin: data.skin, milestones: logs(useMilestoneStore), limit: Infinity,
  }).filter((e) => e.at >= from && !e.key.endsWith('-now')).reverse();


  // Each step reports which part failed, with the phone's own error text.
  const step = async (what, fn) => {
    try { return await fn(); } catch (err) {
      throw new Error(`${what} failed: ${err?.message || String(err)}`);
    }
  };

  // Written straight from the PDF's data, so no file has to be moved between folders.
  // Today's report: time-by-time table and charts. A sleep still running counts up to now.
  const page = () => {
    if (kind !== 'day') return html({ kind, baby, r, entries });
    const running = useSleepStore.getState().session;
    const sleeps = running && running.babyId === id && running.startTime
      ? [...data.sleeps, { startTime: running.startTime, endTime: running.endTime || Date.now() }]
      : data.sleeps;
    const OTHER = ['temp-', 'breath-', 'skin-', 'growth-', 'ms-'];
    return dailyReportHtml({
      baby, day: startOfToday(), now: new Date(),
      feeds: data.feeds, sleeps, diapers: data.diapers, medicines: data.medicines, vaccines: data.vaccines,
      others: entries.filter((e) => OTHER.some((k) => e.key.startsWith(k))),
    });
  };
  const { base64 } = await step('Creating the PDF', () =>
    Print.printToFileAsync({ html: page(), base64: true }));

  // File name: baby, start date and end date, e.g. Asha_2026-10-27_to_2026-11-25.pdf
  const safeName = (baby.name || 'Baby').replace(/[^A-Za-z0-9 _-]/g, '').trim().replace(/\s+/g, '-') || 'Baby';
  const name = `${safeName}_${format(r.startDay, 'yyyy-MM-dd')}_to_${format(r.endDay, 'yyyy-MM-dd')}.pdf`;
  const target = `${REPORTS_DIR}${name}`;
  await step('Preparing the reports folder', async () => {
    const info = await FileSystem.getInfoAsync(REPORTS_DIR);
    if (!info.exists) await FileSystem.makeDirectoryAsync(REPORTS_DIR, { intermediates: true });
  });
  // A newer report for the same dates replaces the old file.
  await step('Saving the file', () =>
    FileSystem.writeAsStringAsync(target, base64, { encoding: FileSystem.EncodingType.Base64 }));
  return { name, uri: target };
}
