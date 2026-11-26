import { format } from 'date-fns';
import { STOOL_COLORS, findColor, urineColourOf } from '../store/useDiaperStore';
import { upcomingDoses } from '../store/useMedicineStore';
import { temperatureStatus, breathingStatus, skinStatus } from '../store/useHealthStores';
import { parseDob } from '../utils/formatters';

/**
 * Today's health check, from what carers logged, against general newborn guidance
 * (8-12 feeds and about 6 wet diapers a day after the first week, normal temperature
 * 36.5-37.4 °C, breathing 30-60 a minute, and the diaper-colour, jaundice and fever warnings).
 *
 * It reports patterns worth a second look and when to involve the doctor. It is not a
 * diagnosis, and it says nothing when there is too little data to judge.
 *
 * Returns { status: 'healthy' | 'attention' | 'urgent' | 'unknown', alerts: [...], insight }.
 */

const HOUR = 3600000;
const RANK = { normal: 0, attention: 1, urgent: 2 };

const eventTime = (l) => new Date(l.eventTime || l.startTime || l.time || l.createdAt).getTime();
const withinHours = (l, hours, now) => now - eventTime(l) <= hours * HOUR;

export function healthCheck({ baby, feeds = [], diapers = [], medicines = [], vaccines = [], temperatures = [], breathing = [], skin = [], now = Date.now() }) {
  const alerts = [];
  // `at`: when the cause happened (for "2h ago"). `anchor`: what caused it, so a new cause
  // (a new reading, a new late dose) counts as a new notification.
  const add = (level, id, title, detail, route, at = null, anchor = null) =>
    alerts.push({ id, level, title, detail, route, at, anchor });

  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  const hoursToday = (now - midnight.getTime()) / HOUR;
  const birth = parseDob(baby?.dob);
  const ageDays = birth ? Math.floor((now - birth.getTime()) / (24 * HOUR)) : null;
  const name = baby?.name || 'Baby';

  const feedsToday = feeds.filter((l) => eventTime(l) >= midnight.getTime());
  const diapersToday = diapers.filter((l) => eventTime(l) >= midnight.getTime());
  const isWet = (l) => l.eventType === 'urine' || l.eventType === 'both';

  // Feeding: newborns feed 8-12 times a day. Judge only once part of the day has passed.
  if (feeds.length) {
    const expected = Math.floor((8 * hoursToday) / 24);
    if (hoursToday >= 6 && feedsToday.length < expected * 0.6) {
      add('attention', 'feeds-low', 'Feeding attention',
        `${feedsToday.length} feed${feedsToday.length === 1 ? '' : 's'} so far today; by now most newborns have had about ${expected}. Keep offering feeds and keep monitoring.`, 'Feeding');
    }
    const lastFeed = Math.max(...feeds.map(eventTime));
    const gapH = (now - lastFeed) / HOUR;
    if (gapH >= 4) {
      add('attention', 'feed-gap', 'Long gap since last feed',
        `No feed logged for ${Math.floor(gapH)} hours. Newborns usually feed every 2 to 3 hours.`, 'Feeding', lastFeed, lastFeed);
    }
  }

  // Wet diapers: after the first week, about 6 or more a day.
  if (diapers.length && (ageDays == null || ageDays >= 5)) {
    const wetToday = diapersToday.filter(isWet).length;
    const expectedWet = Math.floor((6 * hoursToday) / 24);
    const wet = diapers.filter(isWet);
    const lastWetH = wet.length ? (now - Math.max(...wet.map(eventTime))) / HOUR : null;
    if (lastWetH != null && lastWetH >= 8) {
      add('urgent', 'no-wet', 'No wet diaper for a long time',
        `No wet diaper logged for ${Math.floor(lastWetH)} hours. This can be a sign of dehydration: contact the doctor.`, 'Diaper',
        now - lastWetH * HOUR, `no-wet-${now - lastWetH * HOUR}`);
    } else if (lastWetH != null && lastWetH >= 6) {
      add('attention', 'wet-gap', 'No wet diaper for 6 hours',
        `No wet diaper logged for ${Math.floor(lastWetH)} hours. Offer a feed and check the diaper.`, 'Diaper',
        now - lastWetH * HOUR, now - lastWetH * HOUR);
    } else if (hoursToday >= 8 && wetToday < expectedWet * 0.6) {
      add('attention', 'wet-low', 'Fewer wet diapers',
        `${wetToday} wet diaper${wetToday === 1 ? '' : 's'} so far today; about ${expectedWet} is usual by now. Offer feeds and watch the next diapers.`, 'Diaper');
    }
  }

  // Diaper colours logged in the last 24 hours: one alert for every diaper, newest first, with
  // its time. The diaper's id makes each alert's id unique.
  const recentDiapers = diapers.filter((l) => withinHours(l, 24, now))
    .sort((a, b) => eventTime(b) - eventTime(a));
  recentDiapers.forEach((l, i) => {
    const u = urineColourOf(l);
    const st = findColor(STOOL_COLORS, l.stoolColor);
    for (const [c, kind] of [[u, 'urine'], [st, 'stool']]) {
      if (!c?.warn) continue;
      const urgent = c.value === 'red' || c.value === 'pale' || c.value === 'black';
      const at = eventTime(l);
      const when = Number.isFinite(at) ? ` at ${format(at, 'h:mm a')}` : '';
      add(urgent ? 'urgent' : 'attention', `colour-${kind}-${c.value}-${l.id ?? i}`,
        `${kind === 'urine' ? 'Urine' : 'Stool'} colour: ${c.label}${when}`, c.warn, 'Diaper', at, l.id);
    }
  });

  // Latest temperature, breathing and skin checks.
  const latest = (list, hours) => list.filter((l) => withinHours(l, hours, now))
    .sort((a, b) => eventTime(b) - eventTime(a))[0];

  const t = latest(temperatures, 24);
  const ts = t && temperatureStatus(Number(t.celsius));
  if (ts && ts.level !== 'normal') add(ts.level, 'temperature', `Temperature ${Number(t.celsius).toFixed(1)} °C`, ts.text, 'Temperature', eventTime(t), t.id);

  const b = latest(breathing, 24);
  const bs = b && breathingStatus(b.rate != null ? Number(b.rate) : null, b.signs || []);
  if (bs && bs.level !== 'normal') add(bs.level, 'breathing', 'Breathing', bs.text, 'Breathing', eventTime(b), b.id);

  const sk = latest(skin, 48);
  const ss = sk && skinStatus(sk.yellow, sk.signs || []);
  if (ss && ss.level !== 'normal') add(ss.level, 'skin', 'Skin & jaundice', ss.text, 'Skin', eventTime(sk), sk.id);

  // Vaccines and medicine.
  const overdue = vaccines.filter((v) => !v.completed && new Date(v.dueDate).getTime() < midnight.getTime());
  if (overdue.length) {
    add('attention', 'vaccines', `${overdue.length} vaccine${overdue.length === 1 ? '' : 's'} overdue`,
      `${overdue[0].name}${overdue.length > 1 ? ` and ${overdue.length - 1} more` : ''}. Book with the doctor.`, 'Vaccination',
      new Date(overdue[0].dueDate).getTime(), overdue.map((v) => v.id).join(','));
  }
  for (const d of upcomingDoses(medicines)) {
    const lateMin = (now - new Date(d.nextDoseAt).getTime()) / 60000;
    if (lateMin >= 30) {
      add('attention', `dose-${d.id}`, `${d.name} dose is late`,
        `The next dose was due ${Math.floor(lateMin / 60) ? `${Math.floor(lateMin / 60)}h ` : ''}${Math.round(lateMin % 60)}m ago.`, 'Medicine',
        new Date(d.nextDoseAt).getTime(), d.nextDoseAt);
    }
  }

  alerts.sort((a, b2) => RANK[b2.level] - RANK[a.level]);
  const worst = alerts[0]?.level;
  const hasData = feeds.length || diapers.length || temperatures.length || breathing.length || skin.length;
  const status = worst === 'urgent' ? 'urgent' : worst === 'attention' ? 'attention' : hasData ? 'healthy' : 'unknown';

  const insight = status === 'unknown'
    ? `Log ${name}'s feeds and diapers to see today's health check.`
    : status === 'healthy'
      ? `${name}'s feeding, diapers and checks today are within the usual range for a newborn. Keep it up.`
      : `${alerts.length} thing${alerts.length === 1 ? '' : 's'} to look at today, starting with: ${alerts[0].title.toLowerCase()}.`;

  return { status, alerts, insight };
}
