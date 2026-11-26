import { format } from 'date-fns';
import { parseDob, toMl } from '../utils/formatters';
import { CHART_COLORS as CH } from '../constants/colors';
import { STOOL_COLORS, findColor, urineColourOf } from '../store/useDiaperStore';

// One day of care, worked out once and shown two ways: the Daily Summary screen
// (components/DailyReport.js) and today's PDF report (dailyReportHtml below).

const HOUR = 3600 * 1000;
export const DAY_MS = 24 * HOUR;

const t = (v) => new Date(v).getTime();
export const mins = (secs) => Math.round((secs || 0) / 60);

/** 12h 50m · 2h · 35m */
export const hm = (secs) => {
  const total = Math.round((secs || 0) / 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
};

/** A round top value for a chart axis with 4 steps (14 → 20, 70 → 80). */
export function niceMax(v) {
  if (!(v > 0)) return 4;
  const raw = v / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((s) => s * mag).find((s) => s >= raw);
  return step * 4;
}

/**
 * Time window for a feeding chart: from the hour of the day's first feed to the hour after
 * the last one (at least 4 hours, never outside the day), instead of always 00:00–24:00.
 * Returns { from, to, ticks } in ms; ticks are 1, 2, 3 or 4 hours apart (at most 7 labels).
 */
export function feedWindow(times, dayStart) {
  const dayEnd = dayStart + DAY_MS;
  if (!times.length) return { from: dayStart, to: dayEnd, ticks: [0, 4, 8, 12, 16, 20, 24].map((h) => dayStart + h * HOUR) };
  const firstH = Math.floor((Math.min(...times) - dayStart) / HOUR);
  const lastH = Math.floor((Math.max(...times) - dayStart) / HOUR) + 1;
  const hours = Math.max(4, lastH - firstH);
  const step = [1, 2, 3, 4].find((s) => hours / s <= 6);
  const span = Math.ceil(hours / step) * step;
  let from = firstH;
  if (from + span > 24) from = 24 - span;
  const ticks = [];
  for (let h = from; h <= from + span; h += step) ticks.push(dayStart + h * HOUR);
  return { from: dayStart + from * HOUR, to: dayStart + (from + span) * HOUR, ticks };
}

/** 00:00 … 23:00, and 24:00 for the end of the day. */
export const tickLabel = (ms, dayStart) => (ms - dayStart >= DAY_MS ? '24:00' : format(ms, 'HH:mm'));

/**
 * Heights for value labels above bars ({ x, y } with y = bar top), so no two labels overlap:
 * a label that would run into the one before it moves up a line. Returns the label y's.
 */
export function stackLabels(items, width, lineH) {
  const placed = [];
  return items.map(({ x, y }) => {
    let ly = y;
    for (let k = placed.length - 1; k >= 0 && x - placed[k].x < width; k -= 1) {
      if (Math.abs(placed[k].y - ly) < lineH) { ly = placed[k].y - lineH; k = placed.length; }
    }
    placed.push({ x, y: ly });
    return ly;
  });
}

// Diapers are saved with eventType ('urine' | 'stool' | 'both' | 'dry').
const diaperType = (d) => d.eventType || d.type;

/**
 * day  : midnight of the day (Date)
 * now  : the moment to count up to (the day is cut off there when it is today)
 * Returns everything the table and charts need. Table cells: numbers or strings, `true` = tick.
 */
export function buildDailyData({ day, now = new Date(), feeds = [], sleeps = [], diapers = [], medicines = [], vaccines = [] }) {
  const start = t(day);
  const end = Math.min(start + DAY_MS, t(now));
  const inDay = (v) => {
    const x = t(v);
    return x >= start && x < start + DAY_MS;
  };

  const breast = feeds.filter((f) => f.type === 'breast' && inDay(f.startTime || f.createdAt))
    .map((f) => ({ at: t(f.startTime || f.createdAt), left: mins(f.leftSecs), right: mins(f.rightSecs) }))
    .sort((a, b) => a.at - b.at);
  const bottle = feeds.filter((f) => f.type === 'bottle' && inDay(f.startTime || f.createdAt))
    .map((f) => ({
      at: t(f.startTime || f.createdAt),
      min: mins(f.totalSecs),
      ml: Math.round(toMl(f.consumedQty ?? f.bottleQty, f.unit)),
    }))
    .sort((a, b) => a.at - b.at);

  // Sleep pieces inside the day, merged where they overlap. A sleep still running counts to now.
  const sleepParts = [];
  sleeps
    .map((s) => [Math.max(t(s.startTime), start), Math.min(s.endTime ? t(s.endTime) : end, end)])
    .filter(([s, e]) => e > s)
    .sort((a, b) => a[0] - b[0])
    .forEach(([s, e]) => {
      const last = sleepParts[sleepParts.length - 1];
      if (last && s <= last[1]) last[1] = Math.max(last[1], e);
      else sleepParts.push([s, e]);
    });
  // Awake = the time between sleeps, from midnight up to the end of the period.
  const awakeParts = [];
  if (sleepParts.length) {
    let cursor = start;
    sleepParts.forEach(([s, e]) => {
      if (s - cursor >= 60 * 1000) awakeParts.push([cursor, s]);
      cursor = e;
    });
    if (end - cursor >= 60 * 1000) awakeParts.push([cursor, end]);
  }

  const diaperList = diapers.filter((d) => inDay(d.eventTime || d.createdAt))
    .map((d) => ({
      at: t(d.eventTime || d.createdAt),
      type: diaperType(d),
      // Logged colours ({ value, label, swatch }), or null when none was chosen.
      urine: urineColourOf(d),
      stool: findColor(STOOL_COLORS, d.stoolColor),
    }))
    .sort((a, b) => a.at - b.at);
  const meds = medicines.filter((m) => inDay(m.time || m.createdAt))
    .map((m) => ({
      id: m.id, at: t(m.time || m.createdAt), name: m.name, skipped: m.status === 'skipped',
      dose: m.dose != null && m.dose !== '' ? `${m.dose} ${m.unit || ''}`.trim() : '–',
    }))
    .sort((a, b) => a.at - b.at);
  const vacc = vaccines.filter((v) => v.completed && v.completedDate && inDay(v.completedDate))
    .map((v) => ({ id: v.id, at: t(v.completedDate), name: v.name }))
    .sort((a, b) => a.at - b.at);

  // ---- Monitoring table: one row per event ----
  // Columns: 0 LB, 1 RB, 2 Total, 3 bottle min, 4 mL, 5 sleep, 6 awake, 7 wet, 8 stool, 9 both, 10 dry.
  const rows = [];
  breast.forEach((f) => rows.push({ at: f.at, cells: { 0: f.left, 1: f.right, 2: f.left + f.right } }));
  bottle.forEach((f) => rows.push({ at: f.at, cells: { 3: f.min, 4: f.ml } }));
  // Each sleep row shows that sleep and the awake time after it; awake time from midnight
  // to the first sleep gets its own row.
  if (awakeParts.length && awakeParts[0][1] <= sleepParts[0][0]) {
    rows.push({ at: start, cells: { 6: hm((awakeParts[0][1] - awakeParts[0][0]) / 1000) } });
  }
  sleepParts.forEach(([s, e]) => {
    const after = awakeParts.find(([a]) => a === e);
    rows.push({ at: s, cells: { 5: hm((e - s) / 1000), ...(after ? { 6: hm((after[1] - after[0]) / 1000) } : {}) } });
  });
  diaperList.forEach((d) => {
    const col = { urine: 7, stool: 8, both: 9, dry: 10 }[d.type];
    if (col != null) rows.push({ at: d.at, cells: { [col]: true } });
  });
  rows.sort((a, b) => a.at - b.at);

  const sum = (list, k) => list.reduce((s, x) => s + x[k], 0);
  const span = (parts) => parts.reduce((s, [a, b]) => s + (b - a) / 1000, 0);
  const longest = (parts) => parts.reduce((m, [a, b]) => Math.max(m, (b - a) / 1000), 0);
  const count = (type) => diaperList.filter((d) => d.type === type).length;

  const s = {
    breastLeft: sum(breast, 'left'),
    breastRight: sum(breast, 'right'),
    bottleMin: sum(bottle, 'min'),
    bottleMl: sum(bottle, 'ml'),
    sleepSecs: span(sleepParts),
    awakeSecs: span(awakeParts),
    longestSleep: longest(sleepParts),
    longestAwake: longest(awakeParts),
    wet: count('urine'),
    stool: count('stool'),
    both: count('both'),
    dry: count('dry'),
  };
  const totals = [s.breastLeft, s.breastRight, s.breastLeft + s.breastRight, s.bottleMin, s.bottleMl,
    sleepParts.length ? hm(s.sleepSecs) : 0, sleepParts.length ? hm(s.awakeSecs) : 0, s.wet, s.stool, s.both, s.dry];

  return { start, end, breast, bottle, sleepParts, awakeParts, diapers: diaperList, meds, vacc, rows, totals, s };
}

// ======================= PDF (daily report) =======================

export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));
const hhmm = (ms) => format(ms, 'HH:mm');

export const INK = '#1B1F2E';
export const MUTED = '#5B6280';
export const LINE = '#E6E8F5';

// Charts are inline SVG, 640 wide.
export const W = 640;
export const L = 96; // room for the y-axis name and the values / lane names
export const R = 620;

function timeAxis(base, vTop) {
  let s = '';
  for (let h = 0; h <= 24; h += 4) {
    const x = L + (h / 24) * (R - L);
    if (vTop != null) s += `<line x1="${x}" y1="${vTop}" x2="${x}" y2="${base}" stroke="${LINE}" stroke-width="1.5"/>`;
    s += `<text x="${x}" y="${base + 24}" text-anchor="middle" class="ax">${String(h).padStart(2, '0')}:00</text>`;
  }
  s += `<text x="${(L + R) / 2}" y="${base + 54}" text-anchor="middle" class="axt">Time of day</text>`;
  return s;
}

// Feeding charts: the axis runs from the first feed of the day, not from 00:00.
function feedScale(list, dayStart) {
  const win = feedWindow(list.map((f) => f.at), dayStart);
  const pad = 16; // keeps a bar on the first or last hour off the axis line
  const xAt = (ms) => L + pad + ((Math.min(Math.max(ms, win.from), win.to) - win.from) / (win.to - win.from)) * (R - L - 2 * pad);
  const axis = (base) => win.ticks.map((t) =>
    `<text x="${xAt(t)}" y="${base + 24}" text-anchor="middle" class="ax">${tickLabel(t, dayStart)}</text>`).join('')
    + `<text x="${(L + R) / 2}" y="${base + 54}" text-anchor="middle" class="axt">Time of day</text>`;
  return { xAt, axis };
}

/** The y-axis name, running up the left edge, centred on the plot (top to base). */
export const yTitle = (title, top, base) =>
  `<text transform="rotate(-90)" x="${-(top + base) / 2}" y="18" text-anchor="middle" class="axt">${esc(title)}</text>`;

export function valueGrid(max, top, base, title) {
  let s = yTitle(title, top, base);
  for (let i = 0; i <= 4; i += 1) {
    const y = base - ((base - top) * i) / 4;
    const v = (max * i) / 4;
    s += `<line x1="${L}" y1="${y}" x2="${R}" y2="${y}" stroke="${LINE}" stroke-width="1.5"/>`;
    s += `<text x="${L - 12}" y="${y + 5}" text-anchor="end" class="ax">${Number.isInteger(v) ? v : v.toFixed(1)}</text>`;
  }
  return s;
}

export const svg = (h, body) => `<svg viewBox="0 0 ${W} ${h}" width="100%" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;

function breastChart(list, dayStart) {
  const { xAt, axis } = feedScale(list, dayStart);
  const top = 30;
  const base = 300;
  const max = niceMax(Math.max(...list.map((f) => Math.max(f.left, f.right))));
  const h = (v) => ((base - top) * v) / max;
  let bars = '';
  list.forEach((f) => {
    const x = xAt(f.at);
    if (f.left) bars += `<rect x="${x - 8}" y="${base - h(f.left)}" width="7" height="${h(f.left)}" rx="1" fill="${CH.left}"/>`;
    if (f.right) bars += `<rect x="${x + 1}" y="${base - h(f.right)}" width="7" height="${h(f.right)}" rx="1" fill="${CH.right}"/>`;
  });
  return svg(base + 64, valueGrid(max, top, base, 'Duration (min)') + bars + axis(base));
}

function bottleChart(list, dayStart) {
  const { xAt, axis } = feedScale(list, dayStart);
  const top = 40;
  const base = 300;
  const max = niceMax(Math.max(...list.map((f) => f.ml)));
  const h = (v) => ((base - top) * v) / max;
  let bars = '';
  list.forEach((f) => {
    const x = xAt(f.at);
    bars += `<rect x="${x - 12}" y="${base - h(f.ml)}" width="24" height="${h(f.ml)}" rx="3" fill="${CH.bottle}"/>`;
    bars += `<text x="${x}" y="${base - h(f.ml) - 7}" text-anchor="middle" class="val">${f.ml}ml</text>`;
  });
  return svg(base + 64, valueGrid(max, top, base, 'Milk consumed (mL)') + bars + axis(base));
}

function sleepChart(sleepParts, awakeParts, xAt) {
  const base = 280;
  const lane = (label, y, list, colour) =>
    `<text x="30" y="${y + 6}" class="lane">${label}</text>` +
    list.map(([s, e]) => {
      const x1 = xAt(s);
      return `<rect x="${x1}" y="${y - 40}" width="${Math.max(3, xAt(e) - x1)}" height="80" rx="3" fill="${colour}"/>`;
    }).join('');
  return svg(base + 64, timeAxis(base, 20) + yTitle('Sleep state', 20, base)
    + lane('Sleep', 80, sleepParts, CH.sleep) + lane('Awake', 200, awakeParts, CH.awake));
}

/**
 * Diaper marker shapes, sized to look about as big as a circle of radius r:
 * wet = circle, stool = square, both = diamond (left half urine, right half stool), dry = triangle.
 * Each returns SVG path data; `diaperShape` gives the outline, `diamondHalves` the two halves.
 */
export function diaperShape(type, cx, cy, r) {
  if (type === 'stool') {
    const h = r * 0.88;
    return `M${cx - h},${cy - h} H${cx + h} V${cy + h} H${cx - h} Z`;
  }
  if (type === 'both') {
    const h = r * 1.25;
    return `M${cx},${cy - h} L${cx + h},${cy} L${cx},${cy + h} L${cx - h},${cy} Z`;
  }
  if (type === 'dry') {
    const h = r * 1.2;
    return `M${cx},${cy - h} L${cx + h},${cy + h * 0.8} L${cx - h},${cy + h * 0.8} Z`;
  }
  return `M${cx - r},${cy} A${r},${r} 0 1 0 ${cx + r},${cy} A${r},${r} 0 1 0 ${cx - r},${cy} Z`;
}
export function diamondHalves(cx, cy, r) {
  const h = r * 1.25;
  return [
    `M${cx},${cy - h} L${cx - h},${cy} L${cx},${cy + h} Z`,
    `M${cx},${cy - h} L${cx + h},${cy} L${cx},${cy + h} Z`,
  ];
}

/**
 * One diaper as an SVG marker in its logged colour and its type's shape: urine colour for wet,
 * stool colour for stool, half urine / half stool for both, and the dry colour for dry.
 * Unlogged colours fall back to the colour of the type.
 */
export function diaperDot(d, cx, cy, r) {
  const ring = 'stroke="#8C92AE" stroke-width="1"';
  const outline = diaperShape(d.type, cx, cy, r);
  if (d.type === 'both') {
    const [left, right] = diamondHalves(cx, cy, r);
    return `<path d="${left}" fill="${d.urine?.swatch || CH.wet}"/>`
      + `<path d="${right}" fill="${d.stool?.swatch || CH.stool}"/>`
      + `<path d="${outline}" fill="none" ${ring} stroke-linejoin="round"/>`;
  }
  const fill = d.type === 'urine' ? d.urine?.swatch || CH.wet
    : d.type === 'stool' ? d.stool?.swatch || CH.stool : CH.dry;
  return `<path d="${outline}" fill="${fill}" ${ring} stroke-linejoin="round"/>`;
}

/**
 * The chart key: each diaper type's shape. Wet and dry always have the same colour, so they
 * are shown in it; stool and both vary with the logged stool colour, so they are grey.
 */
export const DIAPER_SHAPES = [['urine', 'Wet'], ['stool', 'Stool'], ['both', 'Both'], ['dry', 'Dry']];
export const keyFill = (type, grey) => (type === 'urine' ? CH.wet : type === 'dry' ? CH.dry : grey);
export const shapeKey = () => `<div class="ckey shapes">${DIAPER_SHAPES.map(([type, label]) =>
  `<span><svg width="16" height="16" viewBox="0 0 16 16"><path d="${diaperShape(type, 8, 8, 5.5)}" fill="${keyFill(type, '#C9CCE0')}" stroke="#8C92AE" stroke-width="1" stroke-linejoin="round"/></svg>${label}</span>`).join('')}</div>`;

function diaperChart(list, xAt) {
  const lanes = [['Wet', 'urine', 45], ['Stool', 'stool', 125], ['Both', 'both', 205], ['Dry', 'dry', 285]];
  const base = 320;
  let s = timeAxis(base, 10) + yTitle('Diaper type', 10, base);
  lanes.forEach(([label, type, y]) => {
    s += `<line x1="${L}" y1="${y}" x2="${R}" y2="${y}" stroke="${LINE}" stroke-width="1.5"/>`;
    s += `<text x="30" y="${y + 6}" class="lane">${label}</text>`;
    list.filter((d) => d.type === type).forEach((d) => { s += diaperDot(d, xAt(d.at), y, 10); });
  });
  return svg(base + 64, s);
}

export const stat = (label, value, colour, big = true) =>
  `<div class="stat"><span>${esc(label)}</span><b class="${big ? 'big' : ''}" ${colour ? `style="color:${colour}"` : ''}>${esc(value)}</b></div>`;
export const legend = (items) =>
  `<div class="legend">${items.map(([label, colour]) => `<span><i style="background:${colour}"></i>${esc(label)}</span>`).join('')}</div>`;
/** Share of a in a + b, as text with one decimal: 53.5% */
export const pct = (a, b) => `${(a + b > 0 ? (a / (a + b)) * 100 : 0).toFixed(1)}%`;

export const split = (a, b, colourA, colourB, caption, labels, labelColours = []) => {
  if (!(a + b)) return '';
  return `${caption ? `<p class="cap">${esc(caption)}</p>` : ''}<div class="split"><i style="width:${(a / (a + b)) * 100}%;background:${colourA}"></i><i style="flex:1;background:${colourB}"></i></div>${
    labels ? `<div class="splitlab"><span${labelColours[0] ? ` style="color:${labelColours[0]}"` : ''}>${esc(labels[0])}: ${pct(a, b)}</span><span${labelColours[1] ? ` style="color:${labelColours[1]}"` : ''}>${esc(labels[1])}: ${pct(b, a)}</span></div>` : ''}`;
};
export const empty = (text) => `<p class="empty">${esc(text)}</p>`;
export const section = (n, title, body) => `<section><h2>${n}. ${esc(title)}</h2>${body}</section>`;

/**
 * The report's name, also used for the PDF file:
 * Cradlewell_Aarav Sharma_26 Nov 2026  ·  Cradlewell_Aarav Sharma_October 2026
 */
export const reportName = (baby, when) => `Cradlewell_${(baby?.name || 'Baby').trim()}_${when}`;

/** Shared page style of the daily and monthly reports (light, formal, brand colours). */
export const REPORT_CSS = `
    @page { size: A4; margin: 14mm 12mm; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { margin: 0; color: ${INK}; background: #fff; font-family: -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 11px; }
    .top { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 3px solid #5F47FF; padding-bottom: 10px; }
    .top h1 { font-size: 20px; margin: 0; }
    .top .brand { color: #5F47FF; font-weight: 800; font-size: 15px; letter-spacing: 0.3px; }
    .top .gen { color: ${MUTED}; font-size: 10px; margin-top: 3px; text-align: right; }
    /* Each section (title + table or chart) stays on one page. Only a section taller than a
       whole page is split, and then its title stays with the first rows. */
    section { break-inside: avoid; page-break-inside: avoid; }
    h2 { break-after: avoid; page-break-after: avoid; }
    svg, .stats, .legend, .split, .splitlab, .ckey { break-inside: avoid; page-break-inside: avoid; }
    h2 { font-size: 14px; margin: 22px 0 10px; padding-bottom: 5px; border-bottom: 1px solid ${LINE}; color: ${INK}; }
    .box { border: 1px solid ${LINE}; border-radius: 8px; padding: 14px 16px; break-inside: avoid; }
    .info { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px 20px; margin-top: 14px; background: #F5F6FF; border-radius: 8px; padding: 14px 16px; }
    .info span, .stat span { display: block; color: ${MUTED}; font-size: 10px; margin-bottom: 3px; }
    .info b { font-size: 12px; }
    .stats { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 20px; margin-bottom: 6px; }
    .stats.rule { border-top: 1px solid ${LINE}; padding-top: 12px; margin-top: 6px; }
    .stat b { font-size: 12px; }
    .stat b.big { font-size: 17px; }
    .legend { text-align: center; color: ${MUTED}; margin: 4px 0 2px; }
    .legend span { margin: 0 6px; }
    .legend i { display: inline-block; width: 9px; height: 9px; border-radius: 50%; margin-right: 5px; vertical-align: -1px; }
    svg { display: block; margin: 4px 0; }
    svg .ax { fill: ${MUTED}; font-size: 15px; }
    svg .axt { fill: ${INK}; font-size: 16px; }
    svg .lane { fill: ${INK}; font-size: 17px; }
    svg .val { fill: ${INK}; font-size: 12px; font-weight: 600; }
    .cap { color: ${MUTED}; margin: 8px 0 5px; }
    .splitlab { display: flex; justify-content: space-between; color: ${MUTED}; font-size: 11px; margin-top: 6px; }
    .ckey { color: ${MUTED}; font-size: 10.5px; margin-top: 4px; }
    .ckey span { display: inline-block; margin: 2px 12px 2px 0; }
    .ckey.shapes { text-align: center; font-size: 12px; color: ${INK}; margin-top: 8px; }
    .ckey.shapes span { margin: 2px 10px; }
    .ckey.shapes svg { display: inline-block; width: 16px; height: 16px; margin: 0 6px 0 0; vertical-align: -3px; }
    .split { display: flex; height: 10px; border-radius: 5px; overflow: hidden; }
    table { width: 100%; border-collapse: collapse; }
    thead { display: table-header-group; }
    tr { break-inside: avoid; }
    .mon { border: 1px solid ${LINE}; }
    .mon thead th { background: #F5F6FF; font-size: 11px; font-weight: 700; padding: 7px 4px; text-align: center; border-bottom: 1px solid ${LINE}; }
    .mon tr.sub th { font-size: 9.5px; font-weight: 600; color: ${MUTED}; }
    .mon td { font-size: 10.5px; text-align: center; padding: 6px 4px; border-bottom: 1px solid ${LINE}; }
    .mon tbody tr:nth-child(even) td { background: #FAFBFF; }
    .mon .tl { text-align: left; padding-left: 10px; font-weight: 700; }
    .mon th.tl { vertical-align: middle; }
    .mon tr.tot td { font-weight: 800; background: #EEF0FF !important; border-top: 2px solid #5F47FF; }
    .dash { color: #C9CCE0; }
    .tick { color: #5F47FF; font-weight: 800; }
    .list th { text-align: left; font-weight: 700; padding: 7px 8px; background: #F5F6FF; border-bottom: 1px solid ${LINE}; }
    .list td { padding: 7px 8px; border-bottom: 1px solid ${LINE}; }
    .warn { color: #C77700; }
    .empty { color: ${MUTED}; margin: 0; font-style: italic; }
    footer { margin-top: 24px; padding-top: 8px; border-top: 1px solid ${LINE}; color: ${MUTED}; font-size: 9.5px; }
`;

/**
 * The daily report (one day) as HTML for expo-print.
 * others: recentActivity entries for other checks of the day ({ at, label, value })
 */
export function dailyReportHtml({ baby, day, now, feeds, sleeps, diapers, medicines, vaccines, others = [] }) {
  const d = buildDailyData({ day, now, feeds, sleeps, diapers, medicines, vaccines });
  const { start, end, s } = d;
  const xAt = (ms) => L + (Math.min(Math.max(ms - start, 0), DAY_MS) / DAY_MS) * (R - L);

  const DASH = '<span class="dash">–</span>';
  const TICK = '<span class="tick">✓</span>';
  const cell = (v) => (v === true ? TICK : v === undefined || v === null || v === '' ? DASH : esc(v));
  const table = d.rows.length ? `<table class="mon">
    <thead>
      <tr><th rowspan="2" class="tl">Time</th><th colspan="3">Breastfeeding (min)</th><th colspan="2">Bottle feeding</th>
        <th colspan="2">Sleep cycle</th><th colspan="4">Diapers</th></tr>
      <tr class="sub"><th>LB</th><th>RB</th><th>Total</th><th>Min</th><th>mL</th><th>Sleep</th><th>Awake</th>
        <th>Wet</th><th>Stool</th><th>Both</th><th>Dry</th></tr>
    </thead>
    <tbody>
      ${d.rows.map((r) => `<tr><td class="tl">${hhmm(r.at)}</td>${Array.from({ length: 11 }, (_, i) => `<td>${cell(r.cells[i])}</td>`).join('')}</tr>`).join('')}
      <tr class="tot"><td class="tl">Total</td>${d.totals.map((v) => `<td>${esc(v)}</td>`).join('')}</tr>
    </tbody>
  </table>` : empty('Nothing was recorded on this day.');

  const medBody = d.meds.length ? `<table class="list">
    <tr><th>Medicine / Supplement name</th><th>Dose</th><th>Time administered</th></tr>
    ${d.meds.map((m) => `<tr><td>${esc(m.name)}${m.skipped ? ' <span class="warn">(skipped)</span>' : ''}</td>
      <td>${esc(m.dose)}</td><td>${format(m.at, 'hh:mm a')}</td></tr>`).join('')}
  </table>` : empty('No medicines or supplements recorded.');

  const vaccBody = d.vacc.length ? `<table class="list">
    <tr><th>Vaccine name</th><th>Time administered</th></tr>
    ${d.vacc.map((v) => `<tr><td>${esc(v.name)}</td><td>${format(v.at, 'hh:mm a')}</td></tr>`).join('')}
  </table>` : empty('No vaccines given on this day.');

  const breastBody = d.breast.length ? `<div class="box">
    <div class="stats">
      ${stat('Total breastfeeding sessions', d.breast.length)}
      ${stat('Total breastfeeding duration', hm((s.breastLeft + s.breastRight) * 60))}
      ${stat('Left breast', `${s.breastLeft} min (${pct(s.breastLeft, s.breastRight)})`, CH.leftText)}
      ${stat('Right breast', `${s.breastRight} min (${pct(s.breastRight, s.breastLeft)})`, CH.rightText)}
    </div>
    ${legend([['Left breast', CH.left], ['Right breast', CH.right]])}
    ${breastChart(d.breast, start)}
    ${split(s.breastLeft, s.breastRight, CH.left, CH.right, null, ['Left breast', 'Right breast'], [CH.leftText, CH.rightText])}
  </div>` : empty('No breastfeeds recorded.');

  const bottleBody = d.bottle.length ? `<div class="box">
    <div class="stats">
      ${stat('Total feeds', d.bottle.length)}
      ${stat('Total milk consumed', `${s.bottleMl} mL`, CH.bottleText)}
      ${stat('Total feeding duration', `${s.bottleMin} minutes`, null, false)}
      ${stat('Average milk per feed', `${Math.round(s.bottleMl / d.bottle.length)} mL`, null, false)}
    </div>
    ${bottleChart(d.bottle, start)}
  </div>` : empty('No bottle feeds recorded.');

  const sleepBody = d.sleepParts.length ? `<div class="box">
    <div class="stats">
      ${stat('Total sleep duration', `${hm(s.sleepSecs)} (${pct(s.sleepSecs, s.awakeSecs)})`, CH.sleepText)}
      ${stat('Total awake duration', `${hm(s.awakeSecs)} (${pct(s.awakeSecs, s.sleepSecs)})`, CH.awakeText)}
      ${stat('Total sleep periods', d.sleepParts.length, null, false)}
      ${stat('Longest sleep period', hm(s.longestSleep), null, false)}
      ${stat('Total awake periods', d.awakeParts.length, null, false)}
      ${stat('Longest awake period', d.awakeParts.length ? hm(s.longestAwake) : '–', null, false)}
    </div>
    ${legend([['Sleep', CH.sleep], ['Awake', CH.awake]])}
    ${sleepChart(d.sleepParts, d.awakeParts, xAt)}
    ${split(s.sleepSecs, s.awakeSecs, CH.sleep, CH.awake, end - start >= DAY_MS ? '24-hour sleep and awake distribution' : `Sleep and awake distribution (00:00–${hhmm(end)})`, ['Sleep', 'Awake'], [CH.sleepText, CH.awakeText])}
  </div>` : empty('No sleep recorded.');

  const diaperBody = d.diapers.length ? `<div class="box">
    <div class="stats">
      ${stat('Total diaper changes', d.diapers.length)}
      ${stat('Wet only', s.wet, CH.wetText)}
      ${stat('Stool only', s.stool, CH.stool)}
      ${stat('Both wet and stool', s.both, CH.both)}
      ${stat('Dry', s.dry, CH.dryText)}
    </div>
    ${diaperChart(d.diapers, xAt)}
    ${shapeKey()}
    <div class="stats rule">
      ${stat('Total diapers containing urine', s.wet + s.both)}
      ${stat('Total diapers containing stool', s.stool + s.both)}
    </div>
  </div>` : empty('No diaper changes recorded.');

  const otherBody = others.length ? `<table class="list">
    <tr><th>Check</th><th>Result</th><th>Time</th></tr>
    ${others.map((e) => `<tr><td>${esc(e.label)}</td><td>${esc(e.value)}</td><td>${format(e.at, 'hh:mm a')}</td></tr>`).join('')}
  </table>` : '';

  const birth = parseDob(baby?.dob);
  const ageDays = birth ? Math.max(0, Math.floor((start - birth.getTime()) / DAY_MS)) : null;
  const off = -new Date(start).getTimezoneOffset();
  const tz = off === 330 ? 'IST'
    : `GMT${off >= 0 ? '+' : '-'}${Math.floor(Math.abs(off) / 60)}${Math.abs(off) % 60 ? `:${String(Math.abs(off) % 60).padStart(2, '0')}` : ''}`;
  const periodEnd = end >= start + DAY_MS ? '24:00' : hhmm(end);

  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(reportName(baby, format(start, 'd MMM yyyy')))}</title><style>${REPORT_CSS}</style></head><body>
    <div class="top">
      <div><div class="brand">Cradlewell</div><h1>Daily monitoring report</h1></div>
      <div class="gen">Generated ${format(new Date(), 'd MMM yyyy, HH:mm')}</div>
    </div>
    <div class="info">
      <div><span>Baby name</span><b>${esc(baby?.name || 'Baby')}</b></div>
      <div><span>Baby age</span><b>${ageDays == null ? '–' : `${ageDays} day${ageDays === 1 ? '' : 's'}`}</b></div>
      <div><span>Birth weight</span><b>${baby?.birthWeight ? esc(`${baby.birthWeight} ${baby.weightUnit || 'kg'}`) : '–'}</b></div>
      <div><span>Report date</span><b>${format(start, 'd MMMM yyyy')}</b></div>
      <div><span>Monitoring period</span><b>00:00–${periodEnd} ${tz}</b></div>
    </div>
    ${section(1, 'Daily monitoring table', table)}
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
