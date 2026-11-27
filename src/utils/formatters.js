import { format, formatDistanceToNow } from 'date-fns';

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

// Strictly parses a DD/MM/YYYY string. Returns a local-midnight Date, or null
// when the string is not a real calendar date (e.g. 31/02/2025 or 99/99/2025).
export function parseDob(dob) {
  if (!dob || typeof dob !== 'string') return null;
  const m = dob.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) {
    // Fallback for ISO strings stored by older versions.
    const d = new Date(dob);
    return isNaN(d.getTime()) ? null : d;
  }
  const dd = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  const yyyy = parseInt(m[3], 10);
  const d = new Date(yyyy, mm - 1, dd);
  if (d.getFullYear() !== yyyy || d.getMonth() !== mm - 1 || d.getDate() !== dd) return null;
  return d;
}

// Returns an error message for an invalid date of birth, or null if it is valid.
export function validateDob(dob) {
  if (!dob || dob.length !== 10) return 'Enter the full date as DD/MM/YYYY';
  const d = parseDob(dob);
  if (!d) return 'That date does not exist';
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  if (d > today) return 'Date of birth cannot be in the future';
  const oldest = new Date();
  oldest.setFullYear(oldest.getFullYear() - 6);
  if (d < oldest) return 'Date of birth must be within the last 6 years';
  return null;
}

export function formatDobInput(text) {
  let v = text.replace(/\D/g, '');
  if (v.length > 2) v = v.slice(0, 2) + '/' + v.slice(2);
  if (v.length > 5) v = v.slice(0, 5) + '/' + v.slice(5, 9);
  return v;
}

// ── Units ──
export const ML_PER_OZ = 29.5735;
export const KG_PER_LB = 0.45359237;

export function toMl(qty, unit) {
  const n = parseFloat(qty) || 0;
  return unit === 'oz' ? n * ML_PER_OZ : n;
}

export function toKg(weight, unit) {
  const n = parseFloat(weight);
  if (!n) return null;
  return unit === 'lbs' ? n * KG_PER_LB : n;
}

// Accepts "4,2" as well as "4.2". Returns a positive number or null.
export function parsePositiveNumber(text) {
  if (text === null || text === undefined || text === '') return null;
  const n = parseFloat(String(text).replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
}

// ── Day boundaries ──
export function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

// Seconds of [start, end] that fall inside today (midnight → now).
export function secondsWithinToday(startMs, endMs) {
  const dayStart = startOfToday().getTime();
  const s = Math.max(startMs, dayStart);
  const e = Math.min(endMs, Date.now());
  return e > s ? Math.floor((e - s) / 1000) : 0;
}

export function calcAge(dob) {
  if (!dob) return '';
  const birth = parseDob(dob);
  if (!birth) return '';
  const now = new Date();
  const diffMs = now - birth;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return '';

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

export function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
