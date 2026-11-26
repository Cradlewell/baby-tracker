import { addDays, differenceInCalendarDays, isSameDay, startOfDay } from 'date-fns';
import { DIAPER_TYPES, STOOL_COLORS, findColor, urineColourOf } from '../store/useDiaperStore';
import { temperatureStatus, breathingStatus, skinStatus, JAUNDICE_LEVELS } from '../store/useHealthStores';
import { toMl, toKg, parseDob } from '../utils/formatters';

export const RANGE_DAYS = 30;
const ms = (v) => (v ? new Date(v).getTime() : NaN);

/**
 * Everything the 30-day summary shows, for the `rangeDays` days ending on `end` (that day included).
 * The PDF export also uses it with rangeDays 1 for a single day.
 * When `end` is today the range stops at the current time.
 */
export function monthSummary({
  end, dob, rangeDays = RANGE_DAYS, feeds = [], sleeps = [], diapers = [], medicines = [], temps = [], breaths = [], skin = [],
  growth = [], vaccines = [],
}) {
  const endDay = startOfDay(end);
  const startDay = addDays(endDay, -(rangeDays - 1));
  const from = startDay.getTime();
  const to = isSameDay(endDay, new Date()) ? Date.now() : addDays(endDay, 1).getTime();
  const inRange = (v) => { const t = ms(v); return t >= from && t < to; };
  const dayIndex = (v) => differenceInCalendarDays(new Date(v), startDay);

  const days = Array.from({ length: rangeDays }, (_, i) => ({
    date: addDays(startDay, i), feeds: 0, breast: 0, bottle: 0, sleepSecs: 0, diapers: 0, wet: 0, records: 0, logged: false,
  }));
  // Marks a day as having records and counts one record on it.
  const touch = (v) => { const d = days[dayIndex(v)]; if (d) { d.logged = true; d.records += 1; } return d; };

  // ---- Feeding ----
  const feedsIn = feeds.filter((l) => inRange(l.startTime || l.createdAt));
  feedsIn.forEach((l) => {
    const d = touch(l.startTime || l.createdAt);
    d.feeds += 1;
    if (l.type === 'breast') d.breast += 1;
    if (l.type === 'bottle') d.bottle += 1;
  });
  const breast = feedsIn.filter((l) => l.type === 'breast');
  const bottle = feedsIn.filter((l) => l.type === 'bottle');

  // ---- Sleep: only the part of each sleep inside the range, split across days ----
  const sleepsIn = [];
  let sleepSecs = 0;
  let longestSleep = 0;
  for (const l of sleeps) {
    const s = Math.max(ms(l.startTime), from);
    const e = Math.min(l.endTime ? ms(l.endTime) : Date.now(), to);
    if (!(e > s)) continue;
    sleepsIn.push(l);
    touch(s);
    sleepSecs += (e - s) / 1000;
    longestSleep = Math.max(longestSleep, (ms(l.endTime || Date.now()) - ms(l.startTime)) / 1000);
    for (let t = s; t < e;) {
      const d = days[dayIndex(t)];
      const next = Math.min(e, addDays(startOfDay(new Date(t)), 1).getTime());
      if (d) { d.sleepSecs += (next - t) / 1000; d.logged = true; }
      t = next;
    }
  }
  const nights = sleepsIn.filter((l) => !l.isNap);

  // ---- Diapers ----
  const diapersIn = diapers.filter((l) => inRange(l.eventTime || l.createdAt));
  const colourWarnings = {};
  diapersIn.forEach((l) => {
    const d = touch(l.eventTime || l.createdAt);
    d.diapers += 1;
    if (DIAPER_TYPES[l.eventType]?.wet) d.wet += 1;
    for (const c of [urineColourOf(l), findColor(STOOL_COLORS, l.stoolColor)]) {
      if (c?.warn) colourWarnings[c.label] = (colourWarnings[c.label] || 0) + 1;
    }
  });
  const today = startOfDay(new Date());
  // Only full days where diapers were being logged, so an unlogged day or today-so-far isn't flagged.
  const lowWetDays = days.filter((d) => d.diapers > 0 && d.wet < 6 && d.date < today).length;

  // ---- Medicine, per medicine name ----
  const medicine = {};
  medicines.filter((l) => inRange(l.time || l.createdAt)).forEach((l) => {
    touch(l.time || l.createdAt);
    const m = (medicine[l.name] ||= { name: l.name, given: 0, skipped: 0 });
    m[l.status === 'skipped' ? 'skipped' : 'given'] += 1;
  });

  // ---- Temperature ----
  const tempsIn = temps.filter((l) => inRange(l.time));
  tempsIn.forEach((l) => touch(l.time));
  const highest = tempsIn.reduce((h, l) => (!h || Number(l.celsius) > Number(h.celsius) ? l : h), null);
  const feverDays = new Set(tempsIn.filter((l) => Number(l.celsius) >= 38).map((l) => dayIndex(l.time))).size;

  // ---- Breathing ----
  const breathsIn = breaths.filter((l) => inRange(l.time));
  breathsIn.forEach((l) => touch(l.time));
  const breathLevels = breathsIn.map((l) => breathingStatus(l.rate != null ? Number(l.rate) : null, l.signs || [])?.level);

  // ---- Skin & jaundice: oldest check compared with the newest ----
  const skinIn = skin.filter((l) => inRange(l.time)).sort((a, b) => ms(a.time) - ms(b.time));
  skinIn.forEach((l) => touch(l.time));
  const rank = (v) => JAUNDICE_LEVELS.findIndex((j) => j.value === v);
  const firstSkin = skinIn.find((l) => rank(l.yellow) >= 0);
  const lastSkin = [...skinIn].reverse().find((l) => rank(l.yellow) >= 0);
  let jaundiceTrend = null;
  if (firstSkin && lastSkin && firstSkin !== lastSkin) {
    const diff = rank(lastSkin.yellow) - rank(firstSkin.yellow);
    jaundiceTrend = diff < 0 ? 'Improving' : diff > 0 ? 'Getting worse' : 'No change';
  }
  const skinLevels = skinIn.map((l) => skinStatus(l.yellow, l.signs || [])?.level);

  // ---- Growth: first and latest measurement in the range ----
  const growthIn = growth.filter((l) => inRange(l.date || l.createdAt))
    .sort((a, b) => ms(a.date || a.createdAt) - ms(b.date || b.createdAt));
  const firstW = growthIn.find((l) => toKg(l.weight, l.unit));
  const lastW = [...growthIn].reverse().find((l) => toKg(l.weight, l.unit));
  const firstH = growthIn.find((l) => parseFloat(l.height));
  const lastH = [...growthIn].reverse().find((l) => parseFloat(l.height));
  growthIn.forEach((l) => touch(l.date || l.createdAt));

  // ---- Vaccines ----
  const vaccinesGiven = vaccines.filter((v) => v.completed && inRange(v.completedDate))
    .sort((a, b) => ms(a.completedDate) - ms(b.completedDate));
  vaccinesGiven.forEach((x) => touch(x.completedDate));
  const overdue = vaccines.filter((v) => !v.completed && ms(v.dueDate) < today.getTime()).length;

  // Averages are per day the baby could have records: not before birth or the first log.
  const birth = dob ? parseDob(dob) : null;
  const firstLogDay = days.find((d) => d.logged)?.date;
  const countFrom = [startDay, birth, firstLogDay].filter(Boolean).reduce((a, b) => (b > a ? b : a));
  const daysCounted = Math.max(1, differenceInCalendarDays(endDay, countFrom) + 1);
  const daysWithLogs = days.filter((d) => d.logged).length;

  // Busiest and quietest among days that had feeds; today is left out of "quietest" as it isn't over.
  const feedDays = days.filter((d) => d.feeds > 0).sort((a, b) => b.feeds - a.feeds);
  const fullFeedDays = feedDays.filter((d) => d.date < today);
  const quietest = fullFeedDays[fullFeedDays.length - 1];

  return {
    startDay, endDay, days, daysCounted, daysWithLogs,
    feeding: {
      total: feedsIn.length,
      perDay: feedsIn.length / daysCounted,
      breastCount: breast.length,
      breastSecs: breast.reduce((s, l) => s + (l.totalSecs || 0), 0),
      bottleCount: bottle.length,
      bottleMl: Math.round(bottle.reduce((s, l) => s + toMl(l.consumedQty ?? l.bottleQty, l.unit), 0)),
      busiest: feedDays[0] || null,
      quietest: quietest && quietest !== feedDays[0] ? quietest : null,
    },
    sleep: {
      totalSecs: Math.round(sleepSecs),
      perDaySecs: Math.round(sleepSecs / daysCounted),
      longestSecs: Math.round(longestSleep),
      naps: sleepsIn.length - nights.length,
      nights: nights.length,
      wakeupsPerNight: nights.length ? nights.reduce((s, l) => s + (l.wakeups || 0), 0) / nights.length : null,
    },
    diapers: {
      total: diapersIn.length,
      perDay: diapersIn.length / daysCounted,
      wet: diapersIn.filter((l) => DIAPER_TYPES[l.eventType]?.wet).length,
      stool: diapersIn.filter((l) => DIAPER_TYPES[l.eventType]?.stool).length,
      dry: diapersIn.filter((l) => l.eventType === 'dry').length,
      lowWetDays,
      colourWarnings: Object.entries(colourWarnings).map(([label, count]) => ({ label, count })),
    },
    medicine: Object.values(medicine).sort((a, b) => b.given + b.skipped - (a.given + a.skipped)),
    temperature: {
      count: tempsIn.length,
      highest: highest ? { celsius: Number(highest.celsius), time: highest.time } : null,
      highestLevel: highest ? temperatureStatus(Number(highest.celsius))?.level : null,
      feverDays,
    },
    breathing: {
      count: breathsIn.length,
      attention: breathLevels.filter((l) => l === 'attention').length,
      urgent: breathLevels.filter((l) => l === 'urgent').length,
    },
    skin: {
      count: skinIn.length,
      attention: skinLevels.filter((l) => l === 'attention').length,
      urgent: skinLevels.filter((l) => l === 'urgent').length,
      first: firstSkin ? JAUNDICE_LEVELS[rank(firstSkin.yellow)].label : null,
      last: lastSkin ? JAUNDICE_LEVELS[rank(lastSkin.yellow)].label : null,
      trend: jaundiceTrend,
    },
    growth: {
      count: growthIn.length,
      firstWeight: firstW ? { value: parseFloat(firstW.weight), unit: firstW.unit || 'kg', kg: toKg(firstW.weight, firstW.unit), date: firstW.date || firstW.createdAt } : null,
      lastWeight: lastW ? { value: parseFloat(lastW.weight), unit: lastW.unit || 'kg', kg: toKg(lastW.weight, lastW.unit), date: lastW.date || lastW.createdAt } : null,
      oneWeighIn: firstW === lastW,
      firstHeight: firstH ? parseFloat(firstH.height) : null,
      lastHeight: lastH ? parseFloat(lastH.height) : null,
    },
    vaccines: { given: vaccinesGiven, overdue },
  };
}
