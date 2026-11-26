import {
  format, addDays, startOfDay, startOfMonth, endOfMonth, differenceInCalendarDays,
} from 'date-fns';
import { parseDob } from '../utils/formatters';
import { CHART_COLORS as CH } from '../constants/colors';
import {
  buildDailyData, hm, niceMax, pct, DAY_MS, stackLabels,
  esc, reportName, INK, MUTED, LINE, L, R, valueGrid, yTitle, diaperDot, shapeKey, svg, stat, legend, split, empty, section, REPORT_CSS,
} from './dailyReport';

// The monthly report: the same sections as the daily report, with one row / one bar per day
// instead of one per event. Shown in the Month view of the Summary (components/MonthReport.js)
// and saved as the monthly PDF (monthReportHtml below).

/**
 * The days a month's report covers: from the first day with records in that month to today
 * (this month) or to the last day with records (a past month). A month with no records
 * covers the whole month, up to today.
 * Returns { month, startDay, endDay } (Dates at midnight).
 */
export function monthRange({ month, now = new Date(), feeds = [], sleeps = [], diapers = [], medicines = [] }) {
  const first = startOfMonth(month);
  const last = endOfMonth(month);
  const today = startOfDay(now);
  const inMonth = (v) => { const x = new Date(v).getTime(); return x >= first.getTime() && x <= last.getTime(); };
  const times = [
    ...feeds.map((f) => f.startTime || f.createdAt),
    ...sleeps.map((x) => x.startTime),
    ...diapers.map((d) => d.eventTime || d.createdAt),
    ...medicines.map((m) => m.time || m.createdAt),
  ].filter((v) => v && inMonth(v)).map((v) => new Date(v).getTime());
  const isCurrent = today >= first && today <= last;
  const cap = isCurrent ? today : startOfDay(last);
  if (!times.length) return { month: first, startDay: first, endDay: cap };
  const startDay = startOfDay(Math.min(...times));
  const endDay = isCurrent ? today : startOfDay(Math.max(...times));
  return { month: first, startDay, endDay: endDay < startDay ? startDay : endDay };
}

/**
 * startDay / endDay : the first and last day of the report (both included)
 * now               : the moment to count up to (today is cut off there)
 */
export function buildMonthData({
  startDay, endDay, now = new Date(),
  feeds = [], sleeps = [], diapers = [], medicines = [], vaccines = [],
}) {
  const nowMs = new Date(now).getTime();
  const rangeDays = differenceInCalendarDays(endDay, startDay) + 1;
  const days = [];
  for (let i = 0; i < rangeDays; i += 1) {
    const date = addDays(startDay, i);
    if (date.getTime() > nowMs) break;
    const d = buildDailyData({ day: date, now, feeds, sleeps, diapers, medicines, vaccines });
    const { s } = d;
    days.push({
      date,
      breastN: d.breast.length,
      left: s.breastLeft,
      right: s.breastRight,
      bottleN: d.bottle.length,
      bottleMin: s.bottleMin,
      bottleMl: s.bottleMl,
      hasSleep: d.sleepParts.length > 0,
      sleepSecs: s.sleepSecs,
      awakeSecs: s.awakeSecs,
      sleepN: d.sleepParts.length,
      awakeN: d.awakeParts.length,
      longestSleep: s.longestSleep,
      longestAwake: s.longestAwake,
      diaperN: d.diapers.length,
      wet: s.wet,
      stool: s.stool,
      both: s.both,
      dry: s.dry,
      diapers: d.diapers,
      meds: d.meds,
      vacc: d.vacc,
      logged: d.breast.length + d.bottle.length + d.sleepParts.length + d.diapers.length + d.meds.length > 0,
    });
  }

  // ---- Table: one row per day. Columns as in the daily table; diapers are counts. ----
  const rows = days.map((x) => ({
    date: x.date,
    cells: {
      0: x.breastN ? x.left : null,
      1: x.breastN ? x.right : null,
      2: x.breastN ? x.left + x.right : null,
      3: x.bottleN ? x.bottleMin : null,
      4: x.bottleN ? x.bottleMl : null,
      5: x.hasSleep ? hm(x.sleepSecs) : null,
      6: x.hasSleep && x.awakeSecs ? hm(x.awakeSecs) : null,
      7: x.diaperN ? x.wet : null,
      8: x.diaperN ? x.stool : null,
      9: x.diaperN ? x.both : null,
      10: x.diaperN ? x.dry : null,
    },
  }));

  const sum = (k) => days.reduce((a, x) => a + x[k], 0);
  const sleepDays = days.filter((x) => x.hasSleep).length;
  const loggedDays = days.filter((x) => x.logged).length;
  const s = {
    breastN: sum('breastN'),
    breastLeft: sum('left'),
    breastRight: sum('right'),
    bottleN: sum('bottleN'),
    bottleMin: sum('bottleMin'),
    bottleMl: sum('bottleMl'),
    sleepSecs: sum('sleepSecs'),
    awakeSecs: sum('awakeSecs'),
    sleepN: sum('sleepN'),
    awakeN: sum('awakeN'),
    longestSleep: Math.max(0, ...days.map((x) => x.longestSleep)),
    longestAwake: Math.max(0, ...days.map((x) => x.longestAwake)),
    diaperN: sum('diaperN'),
    wet: sum('wet'),
    stool: sum('stool'),
    both: sum('both'),
    dry: sum('dry'),
    breastDays: days.filter((x) => x.breastN).length,
    bottleDays: days.filter((x) => x.bottleN).length,
    diaperDays: days.filter((x) => x.diaperN).length,
    sleepDays,
    loggedDays,
    // Whole days (not today) with diapers logged but fewer than 6 wet ones.
    lowWetDays: days.filter((x) => x.diaperN && x.wet + x.both < 6 && x.date.getTime() + DAY_MS <= nowMs).length,
  };

  const totals = [s.breastLeft, s.breastRight, s.breastLeft + s.breastRight, s.bottleMin, s.bottleMl,
    sleepDays ? hm(s.sleepSecs) : 0, sleepDays ? hm(s.awakeSecs) : 0, s.wet, s.stool, s.both, s.dry];
  // Daily average over the days that have records of that kind.
  const avg = (v, n) => (n ? Math.round(v / n) : 0);
  const averages = [
    avg(s.breastLeft, s.breastDays), avg(s.breastRight, s.breastDays), avg(s.breastLeft + s.breastRight, s.breastDays),
    avg(s.bottleMin, s.bottleDays), avg(s.bottleMl, s.bottleDays),
    sleepDays ? hm(s.sleepSecs / sleepDays) : 0, sleepDays ? hm(s.awakeSecs / sleepDays) : 0,
    s.diaperDays ? (s.wet / s.diaperDays).toFixed(1) : 0,
    s.diaperDays ? (s.stool / s.diaperDays).toFixed(1) : 0,
    s.diaperDays ? (s.both / s.diaperDays).toFixed(1) : 0,
    s.diaperDays ? (s.dry / s.diaperDays).toFixed(1) : 0,
  ];

  // Medicines grouped by name.
  const medMap = new Map();
  days.forEach((x) => x.meds.forEach((m) => {
    const key = (m.name || '').trim().toLowerCase();
    const g = medMap.get(key) || { name: m.name, dose: '–', given: 0, skipped: 0, first: m.at, last: m.at };
    if (m.dose !== '–') g.dose = m.dose;
    if (m.skipped) g.skipped += 1; else g.given += 1;
    g.first = Math.min(g.first, m.at);
    g.last = Math.max(g.last, m.at);
    medMap.set(key, g);
  }));
  const meds = [...medMap.values()].sort((a, b) => a.first - b.first);
  const vacc = days.flatMap((x) => x.vacc);

  return {
    start: startOfDay(startDay).getTime(),
    end: days.length ? Math.min(days[days.length - 1].date.getTime() + DAY_MS, nowMs) : startOfDay(startDay).getTime(),
    days, rows, totals, averages, s, meds, vacc,
  };
}

// ======================= PDF (monthly report) =======================

const xDay = (i, n) => L + ((i + 0.5) / n) * (R - L);

// The date under every day the baby was tracked (days with records); the month is in the title.
function dayAxis(days, base, n) {
  let s = '';
  days.forEach((x, i) => {
    if (x.logged) s += `<text x="${xDay(i, n)}" y="${base + 22}" text-anchor="middle" class="axd">${format(x.date, 'd')}</text>`;
  });
  const month = days.length ? ` (${format(days[0].date, 'MMMM yyyy')})` : '';
  s += `<text x="${(L + R) / 2}" y="${base + 54}" text-anchor="middle" class="axt">Date${month}</text>`;
  return s;
}

function breastDaysChart(days, n) {
  const top = 30;
  const base = 300;
  const max = niceMax(Math.max(...days.map((x) => Math.max(x.left, x.right))));
  const h = (v) => ((base - top) * v) / max;
  const bw = Math.min(12, Math.max(2, ((R - L) / n) * 0.35));
  let bars = '';
  days.forEach((x, i) => {
    const cx = xDay(i, n);
    if (x.left) bars += `<rect x="${cx - bw}" y="${base - h(x.left)}" width="${bw}" height="${h(x.left)}" fill="${CH.left}"/>`;
    if (x.right) bars += `<rect x="${cx}" y="${base - h(x.right)}" width="${bw}" height="${h(x.right)}" fill="${CH.right}"/>`;
  });
  return svg(base + 64, valueGrid(max, top, base, 'Duration per day (min)') + bars + dayAxis(days, base, n));
}

function bottleDaysChart(days, n) {
  const top = 60;
  const base = 320;
  const max = niceMax(Math.max(...days.map((x) => x.bottleMl)));
  const h = (v) => ((base - top) * v) / max;
  const bw = Math.min(24, Math.max(3, ((R - L) / n) * 0.6));
  let bars = '';
  const shown = days.map((x, i) => ({ x: xDay(i, n), y: base - h(x.bottleMl), ml: x.bottleMl })).filter((b) => b.ml);
  // "130ml" above each bar; a label that would run into its neighbour moves up a line.
  const labelY = stackLabels(shown.map((b) => ({ x: b.x, y: b.y - 6 })), 31, 12);
  shown.forEach((b, k) => {
    bars += `<rect x="${b.x - bw / 2}" y="${b.y}" width="${bw}" height="${base - b.y}" rx="2" fill="${CH.bottle}"/>`;
    bars += `<text x="${b.x}" y="${labelY[k]}" text-anchor="middle" class="valxs">${b.ml}ml</text>`;
  });
  return svg(base + 64, valueGrid(max, top, base, 'Milk consumed per day (mL)') + bars + dayAxis(days, base, n));
}

function sleepDaysChart(days, n) {
  const top = 30;
  const base = 300;
  const hr = (secs) => ((base - top) * (secs / 3600)) / 24;
  const bw = Math.min(24, Math.max(3, ((R - L) / n) * 0.6));
  let bars = '';
  days.forEach((x, i) => {
    if (!x.hasSleep) return;
    const cx = xDay(i, n);
    const sh = hr(x.sleepSecs);
    const ah = hr(x.awakeSecs);
    bars += `<rect x="${cx - bw / 2}" y="${base - sh}" width="${bw}" height="${sh}" fill="${CH.sleep}"/>`;
    if (ah) bars += `<rect x="${cx - bw / 2}" y="${base - sh - ah}" width="${bw}" height="${ah}" fill="${CH.awake}"/>`;
  });
  return svg(base + 64, valueGrid(24, top, base, 'Hours per day') + bars + dayAxis(days, base, n));
}

// One row per date, a dot at the time of day of each change, in its logged colour
// (as in the daily report): wet, stool, both (half and half) or dry.
function diaperDaysChart(allDays) {
  // Only the days the baby was tracked get a row.
  const days = allDays.filter((x) => x.logged);
  const top = 20;
  const rowH = 20;
  const base = top + days.length * rowH + 6;
  const xT = (d, at) => L + (Math.min(Math.max(at - d.date.getTime(), 0), DAY_MS) / DAY_MS) * (R - L);
  let s = '';
  for (let h = 0; h <= 24; h += 3) {
    const x = L + (h / 24) * (R - L);
    s += `<line x1="${x}" y1="${top - 8}" x2="${x}" y2="${base}" stroke="#C9CCE0" stroke-width="1" stroke-dasharray="4 4"/>`;
    s += `<text x="${x}" y="${base + 22}" text-anchor="middle" class="ax">${String(h).padStart(2, '0')}:00</text>`;
  }
  s += `<text x="${(L + R) / 2}" y="${base + 50}" text-anchor="middle" class="axt">Time of day</text>`;
  s += yTitle('Date', top, base);
  days.forEach((d, i) => {
    const y = top + i * rowH + rowH / 2;
    s += `<line x1="${L}" y1="${y}" x2="${R}" y2="${y}" stroke="${LINE}" stroke-width="1"/>`;
    s += `<text x="${L - 12}" y="${y + 4}" text-anchor="end" class="axs">${format(d.date, 'd MMM')}</text>`;
    d.diapers.forEach((x) => { s += diaperDot(x, xT(d, x.at), y, 7); });
  });
  return svg(base + 64, s);
}

/**
 * The monthly report as HTML for expo-print. month: any date in the month.
 * others: recentActivity entries for other checks in the range ({ at, label, value })
 */
export function monthReportHtml({ baby, month, now = new Date(), feeds, sleeps, diapers, medicines, vaccines, others = [], overdue = 0 }) {
  const range = monthRange({ month, now, feeds, sleeps, diapers, medicines });
  const d = buildMonthData({ startDay: range.startDay, endDay: range.endDay, now, feeds, sleeps, diapers, medicines, vaccines });
  const { s, days } = d;
  const n = days.length;

  const DASH = '<span class="dash">–</span>';
  const cell = (v) => (v === undefined || v === null || v === '' ? DASH : esc(v));
  const table = s.loggedDays ? `<table class="mon">
    <thead>
      <tr><th rowspan="2" class="tl">Date</th><th colspan="3">Breastfeeding (min)</th><th colspan="2">Bottle feeding</th>
        <th colspan="2">Sleep cycle</th><th colspan="4">Diapers</th></tr>
      <tr class="sub"><th>LB</th><th>RB</th><th>Total</th><th>Min</th><th>mL</th><th>Sleep</th><th>Awake</th>
        <th>Wet</th><th>Stool</th><th>Both</th><th>Dry</th></tr>
    </thead>
    <tbody>
      ${d.rows.map((r) => `<tr><td class="tl">${format(r.date, 'EEE, d MMM')}</td>${Array.from({ length: 11 }, (_, i) => `<td>${cell(r.cells[i])}</td>`).join('')}</tr>`).join('')}
      <tr class="tot"><td class="tl">Total</td>${d.totals.map((v) => `<td>${esc(v)}</td>`).join('')}</tr>
      <tr class="avg"><td class="tl">Daily average</td>${d.averages.map((v) => `<td>${esc(v)}</td>`).join('')}</tr>
    </tbody>
  </table>
  <p class="note">Daily average counts only the days with records of that kind.</p>` : empty('Nothing was recorded in this month.');

  const dm = (ms) => format(ms, 'd MMM');
  const medBody = d.meds.length ? `<table class="list">
    <tr><th>Medicine / Supplement name</th><th>Dose</th><th>Times given</th><th>Skipped</th><th>Dates</th></tr>
    ${d.meds.map((m) => `<tr><td>${esc(m.name)}</td><td>${esc(m.dose)}</td><td>${m.given}</td>
      <td>${m.skipped ? `<span class="warn">${m.skipped}</span>` : '0'}</td>
      <td>${dm(m.first) === dm(m.last) ? dm(m.first) : `${dm(m.first)} – ${dm(m.last)}`}</td></tr>`).join('')}
  </table>` : empty('No medicines or supplements recorded.');

  const vaccBody = `${d.vacc.length ? `<table class="list">
    <tr><th>Vaccine name</th><th>Date given</th></tr>
    ${d.vacc.map((v) => `<tr><td>${esc(v.name)}</td><td>${format(v.at, 'd MMM yyyy, hh:mm a')}</td></tr>`).join('')}
  </table>` : empty('No vaccines given in this month.')}${overdue ? `<p class="warn" style="margin:8px 0 0"><b>Overdue now: ${overdue}</b></p>` : ''}`;

  const breastBody = s.breastN ? `<div class="box">
    <div class="stats">
      ${stat('Total breastfeeding sessions', `${s.breastN} (${(s.breastN / s.breastDays).toFixed(1)} a day)`)}
      ${stat('Total breastfeeding duration', `${hm((s.breastLeft + s.breastRight) * 60)} (${hm(((s.breastLeft + s.breastRight) * 60) / s.breastDays)} a day)`)}
      ${stat('Left breast', `${s.breastLeft} min (${pct(s.breastLeft, s.breastRight)})`, CH.leftText)}
      ${stat('Right breast', `${s.breastRight} min (${pct(s.breastRight, s.breastLeft)})`, CH.rightText)}
    </div>
    ${legend([['Left breast', CH.left], ['Right breast', CH.right]])}
    ${breastDaysChart(days, n)}
    ${split(s.breastLeft, s.breastRight, CH.left, CH.right, null, ['Left breast', 'Right breast'], [CH.leftText, CH.rightText])}
  </div>` : empty('No breastfeeds recorded.');

  const bottleBody = s.bottleN ? `<div class="box">
    <div class="stats">
      ${stat('Total feeds', `${s.bottleN} (${(s.bottleN / s.bottleDays).toFixed(1)} a day)`)}
      ${stat('Total milk consumed', `${s.bottleMl} mL`, CH.bottleText)}
      ${stat('Average milk per day', `${Math.round(s.bottleMl / s.bottleDays)} mL`, null, false)}
      ${stat('Average milk per feed', `${Math.round(s.bottleMl / s.bottleN)} mL`, null, false)}
      ${stat('Total feeding duration', hm(s.bottleMin * 60), null, false)}
    </div>
    ${bottleDaysChart(days, n)}
  </div>` : empty('No bottle feeds recorded.');

  const sleepBody = s.sleepDays ? `<div class="box">
    <div class="stats">
      ${stat('Average sleep per day', `${hm(s.sleepSecs / s.sleepDays)} (${pct(s.sleepSecs, s.awakeSecs)})`, CH.sleepText)}
      ${stat('Average awake per day', `${hm(s.awakeSecs / s.sleepDays)} (${pct(s.awakeSecs, s.sleepSecs)})`, CH.awakeText)}
      ${stat('Total sleep', hm(s.sleepSecs), null, false)}
      ${stat('Longest sleep period', hm(s.longestSleep), null, false)}
      ${stat('Sleep periods', `${s.sleepN} (${(s.sleepN / s.sleepDays).toFixed(1)} a day)`, null, false)}
      ${stat('Longest awake period', s.awakeN ? hm(s.longestAwake) : '–', null, false)}
    </div>
    ${legend([['Sleep', CH.sleep], ['Awake', CH.awake]])}
    ${sleepDaysChart(days, n)}
    ${split(s.sleepSecs, s.awakeSecs, CH.sleep, CH.awake, 'Monthly sleep and awake distribution', ['Sleep', 'Awake'], [CH.sleepText, CH.awakeText])}
  </div>` : empty('No sleep recorded.');

  const diaperBody = s.diaperN ? `<div class="box">
    <div class="stats">
      ${stat('Total diaper changes', `${s.diaperN} (${(s.diaperN / s.diaperDays).toFixed(1)} a day)`)}
      ${stat('Wet only', s.wet, CH.wetText)}
      ${stat('Stool only', s.stool, CH.stool)}
      ${stat('Both wet and stool', s.both, CH.both)}
      ${stat('Dry', s.dry, CH.dryText)}
    </div>
    <p class="cap">Diaper change history, day by day</p>
    ${diaperDaysChart(days)}
    ${shapeKey()}
    <div class="stats rule">
      ${stat('Total diapers containing urine', s.wet + s.both)}
      ${stat('Total diapers containing stool', s.stool + s.both)}
      ${s.lowWetDays ? stat('Days with fewer than 6 wet diapers', s.lowWetDays, '#C77700') : ''}
    </div>
  </div>` : empty('No diaper changes recorded.');

  const otherBody = others.length ? `<table class="list">
    <thead><tr><th>Check</th><th>Result</th><th>Date &amp; time</th></tr></thead>
    <tbody>${others.map((e) => `<tr><td>${esc(e.label)}</td><td>${esc(e.value)}</td><td>${format(e.at, 'd MMM, hh:mm a')}</td></tr>`).join('')}</tbody>
  </table>` : '';

  const birth = parseDob(baby?.dob);
  const endMs = days.length ? days[days.length - 1].date.getTime() : d.start;
  const ageDays = birth ? Math.max(0, Math.floor((endMs - birth.getTime()) / DAY_MS)) : null;

  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(reportName(baby, format(range.month, 'MMMM yyyy')))}</title><style>${REPORT_CSS}
    .mon tr.avg td { font-weight: 700; color: ${MUTED}; background: #F5F6FF !important; }
    .mon td.tl { white-space: nowrap; }
    .note { color: ${MUTED}; font-size: 9.5px; margin: 6px 0 0; }
    svg .axs { fill: ${INK}; font-size: 13px; }
    svg .valxs { fill: ${INK}; font-size: 9.5px; font-weight: 600; }
    svg .axd { fill: ${MUTED}; font-size: 11px; }
  </style></head><body>
    <div class="top">
      <div><div class="brand">Cradlewell</div><h1>Monthly monitoring report · ${format(range.month, 'MMMM yyyy')}</h1></div>
      <div class="gen">Generated ${format(new Date(), 'd MMM yyyy, HH:mm')}</div>
    </div>
    <div class="info">
      <div><span>Baby name</span><b>${esc(baby?.name || 'Baby')}</b></div>
      <div><span>Baby age (at end)</span><b>${ageDays == null ? '–' : `${ageDays} day${ageDays === 1 ? '' : 's'}`}</b></div>
      <div><span>Birth weight</span><b>${baby?.birthWeight ? esc(`${baby.birthWeight} ${baby.weightUnit || 'kg'}`) : '–'}</b></div>
      <div><span>Report month</span><b>${format(range.month, 'MMMM yyyy')}</b></div>
      <div><span>Report period</span><b>${format(d.start, 'd MMM')} – ${format(endMs, 'd MMM yyyy')}</b></div>
      <div><span>Days with records</span><b>${s.loggedDays} of ${days.length}</b></div>
    </div>
    ${section(1, 'Monthly monitoring table', table)}
    ${section(2, 'Medicines & supplements', medBody)}
    ${section(3, 'Vaccination', vaccBody)}
    ${section(4, 'Breastfeeding pattern', breastBody)}
    ${section(5, 'Bottle feeding pattern', bottleBody)}
    ${section(6, 'Sleep pattern', sleepBody)}
    ${section(7, 'Diaper monitoring pattern', diaperBody)}
    ${otherBody ? section(8, 'Other health checks', otherBody) : ''}
    <footer>General guidance only; ask a doctor about any concern.</footer>
  </body></html>`;
}
