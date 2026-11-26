import { formatDuration } from '../utils/formatters';
import { STOOL_COLORS, findColor, urineColourOf } from '../store/useDiaperStore';
import { JAUNDICE_LEVELS } from '../store/useHealthStores';

/**
 * Every care event across all features, newest first, for the Home "Recent activity" list.
 * A running feed or sleep timer counts as happening now.
 * Each item: { key, at (ms), icon (Ionicons) or mci (MaterialCommunityIcons), label, value }.
 */
export function recentActivity({
  babyId, feeds = [], sleeps = [], diapers = [], medicines = [], growth = [], vaccines = [],
  temperatures = [], breathing = [], skin = [], milestones = [], feedSession, sleepSession, limit = 4,
}) {
  const items = [];
  const t = (v) => (v ? new Date(v).getTime() : NaN);
  const add = (at, item) => { if (Number.isFinite(at)) items.push({ ...item, at }); };

  if (feedSession?.babyId === babyId) {
    add(Date.now(), { key: 'feed-now', icon: 'nutrition-outline', label: 'Feeding', value: 'Feeding in progress' });
  }
  if (sleepSession?.babyId === babyId) {
    add(Date.now(), { key: 'sleep-now', icon: 'moon-outline', label: 'Sleep', value: 'Sleeping now' });
  }

  for (const l of feeds) {
    const isBottle = l.type === 'bottle';
    const qty = l.consumedQty ?? l.bottleQty;
    add(t(l.startTime || l.createdAt), {
      key: `feed-${l.id}`, icon: 'nutrition-outline', label: 'Feeding',
      value: isBottle
        ? `Bottle${qty != null ? ` · ${qty} ${l.unit || 'ml'}` : ''}`
        : `Breastfeed${l.totalSecs ? ` · ${formatDuration(l.totalSecs)}` : ''}`,
    });
  }
  for (const l of sleeps) {
    add(t(l.endTime || l.createdAt), {
      key: `sleep-${l.id}`, icon: 'moon-outline', label: 'Sleep',
      value: `${l.isNap ? 'Nap' : 'Night sleep'}${l.totalSecs ? ` · ${formatDuration(l.totalSecs)}` : ''}`,
    });
  }
  for (const l of diapers) {
    const type = { urine: 'Wet', stool: 'Stool', both: 'Wet + stool', dry: 'Dry' }[l.eventType] || 'Diaper';
    const colour = urineColourOf(l)?.label || findColor(STOOL_COLORS, l.stoolColor)?.label;
    add(t(l.eventTime || l.createdAt), {
      key: `diaper-${l.id}`, icon: 'water-outline', label: 'Diaper',
      value: `${type}${colour ? ` · ${colour.toLowerCase()}` : ''}`,
    });
  }
  for (const l of medicines) {
    add(t(l.time || l.createdAt), {
      key: `med-${l.id}`, icon: 'medkit-outline', label: 'Medicine',
      value: `${l.name}${l.dose ? ` ${l.dose} ${l.unit}` : ''} · ${l.status === 'skipped' ? 'skipped' : 'given'}`,
    });
  }
  for (const l of growth) {
    const parts = [l.weight ? `${l.weight} ${l.unit || 'kg'}` : null, l.height ? `${l.height} ${l.heightUnit || 'cm'}` : null].filter(Boolean);
    add(t(l.createdAt || l.date), {
      key: `growth-${l.id}`, icon: 'bar-chart-outline', label: 'Growth',
      value: parts.length ? parts.join(' · ') : 'Measurement',
    });
  }
  for (const v of vaccines) {
    if (!v.completed) continue;
    add(t(v.completedDate), { key: `vacc-${v.id}`, icon: 'shield-checkmark-outline', label: 'Vaccine', value: `${v.name} given` });
  }
  for (const l of temperatures) {
    add(t(l.time), { key: `temp-${l.id}`, mci: 'thermometer', label: 'Temperature', value: `${Number(l.celsius).toFixed(1)} °C` });
  }
  for (const l of breathing) {
    add(t(l.time), {
      key: `breath-${l.id}`, mci: 'lungs', label: 'Breathing',
      value: l.rate != null ? `${l.rate} breaths/min` : 'Signs noted',
    });
  }
  for (const l of skin) {
    add(t(l.time), {
      key: `skin-${l.id}`, mci: 'face-man-shimmer-outline', label: 'Skin & jaundice',
      value: JAUNDICE_LEVELS.find((j) => j.value === l.yellow)?.label || 'Skin changes',
    });
  }
  for (const l of milestones) {
    add(t(l.time), { key: `ms-${l.id}`, icon: 'flag-outline', label: 'Milestone', value: l.name });
  }

  return items.sort((a, b) => b.at - a.at).slice(0, limit);
}
