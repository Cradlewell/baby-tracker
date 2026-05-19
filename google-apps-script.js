// ============================================================
// BabyBloom — Google Apps Script (Per-Baby Sheet)
// 12-hour time format fixed
// ============================================================

const BABY_SHEET_HEADERS = [
  'Date', 'Time', 'Type', 'Sub Type',
  'Start Time', 'End Time', 'Duration',
  'Quantity', 'Wakeups', 'Notes'
];

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const { table, data } = payload;
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    if (table === 'babies') {
      upsertBaby(ss, data);
      ensureBabySheet(ss, data.name);
      return ok();
    }

    const babyName = data.baby_name || resolveBabyName(ss, data.baby_id) || 'Unknown';
    const sheet = ensureBabySheet(ss, babyName);
    const row = buildRow(table, data);

    if (row) appendStyledRow(sheet, row);

    return ok();
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function ok() {
  return ContentService
    .createTextOutput(JSON.stringify({ success: true }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── Baby lookup ──────────────────────────────────────────────

function upsertBaby(ss, data) {
  let sheet = ss.getSheetByName('_babies');

  if (!sheet) {
    sheet = ss.insertSheet('_babies');
    sheet.getRange(1, 1, 1, 4).setValues([['id', 'name', 'dob', 'gender']]);
    sheet.getRange(1, 1, 1, 4).setFontWeight('bold');
    sheet.hideSheet();
  }

  const lastRow = sheet.getLastRow();

  if (lastRow > 1) {
    const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues().flat();
    const idx = ids.indexOf(data.id);

    if (idx !== -1) {
      sheet.getRange(idx + 2, 1, 1, 4).setValues([
        [data.id, data.name, data.dob, data.gender]
      ]);
      return;
    }
  }

  sheet.appendRow([data.id, data.name, data.dob, data.gender]);
}

function resolveBabyName(ss, babyId) {
  const sheet = ss.getSheetByName('_babies');

  if (!sheet || sheet.getLastRow() < 2) return null;

  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues();
  const match = rows.find(r => r[0] === babyId);

  return match ? match[1] : null;
}

// ── Per-baby sheet ───────────────────────────────────────────

function ensureBabySheet(ss, name) {
  let sheet = ss.getSheetByName(name);

  if (!sheet) {
    sheet = ss.insertSheet(name);

    const header = sheet.getRange(1, 1, 1, BABY_SHEET_HEADERS.length);
    header.setValues([BABY_SHEET_HEADERS]);
    header.setFontWeight('bold');
    header.setBackground('#4a86e8');
    header.setFontColor('#ffffff');

    sheet.setFrozenRows(1);

    sheet.setColumnWidth(1, 95);
    sheet.setColumnWidth(2, 90);
    sheet.setColumnWidth(3, 105);
    sheet.setColumnWidth(4, 130);
    sheet.setColumnWidth(5, 110);
    sheet.setColumnWidth(6, 110);
    sheet.setColumnWidth(7, 95);
    sheet.setColumnWidth(8, 140);
    sheet.setColumnWidth(9, 90);
    sheet.setColumnWidth(10, 190);

    // Force columns as text to avoid 24-hour auto-formatting
    sheet.getRange('A:J').setNumberFormat('@');
  }

  return sheet;
}

function appendStyledRow(sheet, row) {
  const newRow = sheet.getLastRow() + 1;

  const range = sheet.getRange(newRow, 1, 1, BABY_SHEET_HEADERS.length);

  // Force text before inserting values
  range.setNumberFormat('@');
  range.setValues([row]);

  if (newRow % 2 === 0) {
    range.setBackground('#f3f6ff');
  }
}

// ── Format helpers ───────────────────────────────────────────

function fmtDate(val) {
  if (!val) return '';

  const d = typeof val === 'number' ? new Date(val) : new Date(val);

  return Utilities.formatDate(
    d,
    Session.getScriptTimeZone(),
    'dd/MM/yyyy'
  );
}

function to12Hr(d) {
  return Utilities.formatDate(
    d,
    Session.getScriptTimeZone(),
    'hh:mm a'
  );
}

function fmtTime(val) {
  if (!val) return '';

  const d = typeof val === 'number' ? new Date(val) : new Date(val);

  // Apostrophe forces Google Sheets to keep it as text
  return "'" + to12Hr(d);
}

function fmtDateTime(val) {
  if (!val) return '';

  const d = typeof val === 'number' ? new Date(val) : new Date(val);

  // Only time is shown, in 12-hour format
  return "'" + to12Hr(d);
}

function fmtDuration(secs) {
  if (!secs && secs !== 0) return '';

  secs = Math.floor(secs);

  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;

  if (h > 0) return h + 'h ' + m + 'm';
  if (m > 0) return m + 'm ' + s + 's';

  return s + 's';
}

function fmtSecs(secs) {
  if (!secs && secs !== 0) return '-';

  secs = Math.floor(secs);

  const m = Math.floor(secs / 60);
  const s = secs % 60;

  return m > 0 ? m + 'm ' + s + 's' : s + 's';
}

// ── Row builders ─────────────────────────────────────────────

function buildRow(table, data) {
  switch (table) {

    case 'feeding_logs': {
      const subType = data.type === 'breast' ? 'Breast' : 'Bottle';

      let quantity = '';

      if (data.type === 'breast') {
        quantity = 'L: ' + fmtSecs(data.left_secs) + '  R: ' + fmtSecs(data.right_secs);
      } else {
        quantity = (data.bottle_qty || '0') + ' ' + (data.unit || 'ml');
      }

      return [
        fmtDate(data.created_at),
        fmtTime(data.start_time || data.created_at),
        'Feeding',
        subType,
        fmtDateTime(data.start_time),
        fmtDateTime(data.end_time),
        fmtDuration(data.total_secs),
        quantity,
        '',
        data.notes || ''
      ];
    }

    case 'sleep_logs': {
      const subType = data.is_nap ? 'Nap' : 'Night Sleep';

      return [
        fmtDate(data.created_at),
        fmtTime(data.start_time || data.created_at),
        'Sleep',
        subType,
        fmtDateTime(data.start_time),
        fmtDateTime(data.end_time),
        fmtDuration(data.total_secs),
        '',
        (data.wakeups || 0) + '',
        data.notes || ''
      ];
    }

    case 'diaper_logs': {
      const subType = data.event_type || '';
      const quantity = data.changed ? 'Changed' : 'Not changed';
      const duration = data.delay_minutes ? data.delay_minutes + ' min delay' : '';

      return [
        fmtDate(data.created_at),
        fmtTime(data.event_time || data.created_at),
        'Diaper',
        subType.charAt(0).toUpperCase() + subType.slice(1),
        fmtDateTime(data.event_time || data.created_at),
        fmtDateTime(data.change_time || ''),
        duration,
        quantity,
        '',
        data.notes || ''
      ];
    }

    case 'medicine_logs': {
      const quantity = (data.dose || '') + ' ' + (data.unit || '');

      return [
        fmtDate(data.created_at),
        fmtTime(data.time || data.created_at),
        'Medicine',
        data.name || '',
        fmtDateTime(data.time),
        '',
        '',
        quantity.trim(),
        '',
        data.notes || ''
      ];
    }

    case 'growth_logs': {
      const parts = [];

      if (data.weight) parts.push('Wt: ' + data.weight + ' ' + (data.unit || 'kg'));
      if (data.height) parts.push('Ht: ' + data.height + ' ' + (data.height_unit || 'cm'));
      if (data.head_circ) parts.push('HC: ' + data.head_circ + ' cm');

      return [
        fmtDate(data.date || data.created_at),
        '',
        'Growth',
        parts.join(' | '),
        '',
        '',
        '',
        parts.join(' | '),
        '',
        data.notes || ''
      ];
    }

    case 'vaccination_logs': {
      const quantity = data.completed ? 'Done' : 'Pending';

      return [
        fmtDate(data.due_date),
        '',
        'Vaccination',
        data.name || '',
        '',
        data.completed_date ? fmtDateTime(data.completed_date) : '',
        '',
        quantity,
        '',
        data.notes || ''
      ];
    }

    default:
      return null;
  }
}

// ── Manual test ──────────────────────────────────────────────

function testWrite() {
  const now = new Date().toISOString();
  const ms = Date.now();

  doPost({
    postData: {
      contents: JSON.stringify({
        table: 'babies',
        data: {
          id: 'baby-test',
          name: 'Krishna',
          dob: '01/01/2025',
          gender: 'boy',
          created_at: now
        }
      })
    }
  });

  doPost({
    postData: {
      contents: JSON.stringify({
        table: 'feeding_logs',
        data: {
          id: 'f1',
          baby_id: 'baby-test',
          baby_name: 'Krishna',
          type: 'breast',
          left_secs: 325,
          right_secs: 490,
          total_secs: 815,
          start_time: ms - 815000,
          end_time: ms,
          created_at: now,
          notes: ''
        }
      })
    }
  });

  doPost({
    postData: {
      contents: JSON.stringify({
        table: 'sleep_logs',
        data: {
          id: 's1',
          baby_id: 'baby-test',
          baby_name: 'Krishna',
          start_time: ms - 5400000,
          end_time: ms,
          total_secs: 5400,
          wakeups: 2,
          is_nap: false,
          created_at: now,
          notes: 'good sleep'
        }
      })
    }
  });

  doPost({
    postData: {
      contents: JSON.stringify({
        table: 'diaper_logs',
        data: {
          id: 'd1',
          baby_id: 'baby-test',
          baby_name: 'Krishna',
          event_type: 'wet',
          event_time: now,
          changed: true,
          change_time: now,
          delay_minutes: 3,
          created_at: now,
          notes: ''
        }
      })
    }
  });
}