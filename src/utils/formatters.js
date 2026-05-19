import { format, formatDistanceToNow, isToday, isYesterday } from 'date-fns';

export function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function formatDurationMins(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return `${mm}:${ss}`;
}

export function formatTime(date) {
  if (!date) return '--:--';
  return format(new Date(date), 'hh:mm a');
}

export function formatDate(date) {
  if (!date) return '';
  const d = new Date(date);
  if (isToday(d)) return 'Today';
  if (isYesterday(d)) return 'Yesterday';
  return format(d, 'MMM d');
}

export function formatRelative(date) {
  if (!date) return 'Never';
  return formatDistanceToNow(new Date(date), { addSuffix: true });
}

export function formatDateFull(date) {
  if (!date) return '';
  return format(new Date(date), 'MMM d, yyyy');
}

export function formatWeight(value, unit = 'kg') {
  if (!value) return '--';
  return `${parseFloat(value).toFixed(2)} ${unit}`;
}

export function calcAge(dob) {
  if (!dob) return '';
  let birth;
  if (typeof dob === 'string' && dob.includes('/')) {
    const [dd, mm, yyyy] = dob.split('/');
    let year = parseInt(yyyy, 10);
    if (year < 100) year += 2000;
    birth = new Date(year, parseInt(mm, 10) - 1, parseInt(dd, 10));
  } else {
    birth = new Date(dob);
  }
  if (isNaN(birth.getTime())) return '';
  const now = new Date();
  const diffMs = now - birth;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Newborn';
  if (diffDays < 7) return `${diffDays} day${diffDays === 1 ? '' : 's'} old`;
  if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    const days = diffDays % 7;
    return days > 0 ? `${weeks}w ${days}d old` : `${weeks} week${weeks === 1 ? '' : 's'} old`;
  }
  const months = Math.floor(diffDays / 30.44);
  const remainDays = Math.round(diffDays - months * 30.44);
  if (months < 12) {
    return remainDays > 0 ? `${months}mo ${remainDays}d old` : `${months} month${months === 1 ? '' : 's'} old`;
  }
  const years = Math.floor(months / 12);
  const remMonths = months % 12;
  return remMonths > 0 ? `${years}y ${remMonths}mo old` : `${years} year${years === 1 ? '' : 's'} old`;
}

export function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 6) return 'Shh, night watch 🌙';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  if (hour < 21) return 'Good evening';
  return 'Night shift';
}

export function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
