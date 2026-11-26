import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import { Platform } from 'react-native';
import { format, addDays, differenceInCalendarDays, isSameDay, startOfDay } from 'date-fns';

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
import { dailyReportHtml, reportName } from './dailyReport';
import { monthReportHtml, monthRange } from './monthReport';
import { recentActivity } from './recentActivity';

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
 * Builds the daily report (kind 'day', for the day `when` falls on) or the monthly report
 * (kind 'month', for the month `when` falls in); `when` is now by default. For the given baby
 * (the active baby when no id is passed); saves it as a PDF in the app's reports folder.
 * Resolves { name, uri }: the file name to show and the file to open with openReport.
 */
export async function exportReport(kind, babyId, when = new Date()) {
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

  // A month runs from its first day with records to today (this month) or to its last day
  // with records (a past month).
  // A day runs to now when it is today, otherwise to its end.
  const isDay = kind === 'day';
  const day = startOfDay(when);
  const isToday = isSameDay(day, new Date());
  const range = isDay ? null : monthRange({ month: when, ...data });
  const r = isDay
    ? monthSummary({ ...data, end: day, dob: baby.dob, rangeDays: 1 })
    : monthSummary({ ...data, end: range.endDay, dob: baby.dob, rangeDays: differenceInCalendarDays(range.endDay, range.startDay) + 1 });
  const from = isDay ? day.getTime() : range.startDay.getTime();
  const until = isDay && isToday ? Infinity : addDays(isDay ? day : range.endDay, 1).getTime();
  const entries = recentActivity({
    babyId: id, feeds: data.feeds, sleeps: data.sleeps, diapers: data.diapers, medicines: data.medicines,
    growth: data.growth, vaccines: data.vaccines, temperatures: data.temps, breathing: data.breaths,
    skin: data.skin, milestones: logs(useMilestoneStore), limit: Infinity,
  }).filter((e) => e.at >= from && e.at < until && !e.key.endsWith('-now')).reverse();

  // Nothing recorded for that day / month: no report, a warning instead.
  if (!entries.length) {
    const what = isDay ? format(day, 'd MMMM yyyy') : format(range.month, 'MMMM yyyy');
    const err = new Error(`${baby.name || 'This baby'} has nothing recorded for ${what}. A report needs at least one entry; choose another ${isDay ? 'date' : 'month'}.`);
    err.code = 'NO_DATA';
    throw err;
  }

  // Each step reports which part failed, with the phone's own error text.
  const step = async (what, fn) => {
    try { return await fn(); } catch (err) {
      throw new Error(`${what} failed: ${err?.message || String(err)}`);
    }
  };

  // Written straight from the PDF's data, so no file has to be moved between folders.
  // The daily report: time-by-time table and charts. A sleep still running counts up to now.
  // The monthly report: the same sections with one row / bar per day.
  const page = () => {
    const running = useSleepStore.getState().sessions[id];
    const sleeps = running && running.startTime
      ? [...data.sleeps, { startTime: running.startTime, endTime: running.endTime || Date.now() }]
      : data.sleeps;
    const OTHER = ['temp-', 'breath-', 'skin-', 'growth-', 'ms-'];
    const common = {
      baby, now: new Date(),
      feeds: data.feeds, sleeps, diapers: data.diapers, medicines: data.medicines, vaccines: data.vaccines,
      others: entries.filter((e) => OTHER.some((k) => e.key.startsWith(k))),
    };
    if (!isDay) return monthReportHtml({ ...common, month: when, overdue: r.vaccines.overdue });
    return dailyReportHtml({ ...common, day });
  };
  const { base64 } = await step('Creating the PDF', () =>
    Print.printToFileAsync({ html: page(), base64: true }));

  // File name: Cradlewell (baby) and the day or the month,
  // e.g. "Cradlewell_Asha_26 Nov 2026.pdf" or "Cradlewell_Asha_October 2026.pdf".
  // Characters a file name can't hold are dropped; the path is URI-encoded for the spaces.
  const title = reportName(baby, isDay ? format(r.endDay, 'd MMM yyyy') : format(range.month, 'MMMM yyyy'));
  const name = `${title.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim()}.pdf`;
  const target = `${REPORTS_DIR}${encodeURIComponent(name)}`;
  await step('Preparing the reports folder', async () => {
    const info = await FileSystem.getInfoAsync(REPORTS_DIR);
    if (!info.exists) await FileSystem.makeDirectoryAsync(REPORTS_DIR, { intermediates: true });
  });
  // A newer report for the same dates replaces the old file.
  await step('Saving the file', () =>
    FileSystem.writeAsStringAsync(target, base64, { encoding: FileSystem.EncodingType.Base64 }));
  return { name, uri: target };
}
