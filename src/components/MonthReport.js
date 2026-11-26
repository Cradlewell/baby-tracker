import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Rect, Line, Text as SvgText } from 'react-native-svg';
import { format } from 'date-fns';

import { CHART_COLORS as CH, COLORS } from '../constants/colors';
import { FONT_WEIGHT, fs } from '../constants/theme';
import { hm, niceMax, pct, DAY_MS, stackLabels } from '../lib/dailyReport';
import {
  Chart, Section, Stats, Legend, Split, Empty, AxisTitle, MonitoringTable,
  valueGrid, PAD_L, PAD_R, AXIS_H, styles, DiaperDot, ShapeKey,
} from './DailyReport';

// The Month view laid out like the monthly PDF: the daily report's sections with one
// row / one bar per day. `data` comes from buildMonthData (lib/monthReport.js).
// Tapping a day in the table opens that day.

// x-axis name of the day-by-day charts, with the month: "Date (November 2026)".
const dateTitle = (days) => (days.length ? `Date (${format(days[0].date, 'MMMM yyyy')})` : 'Date');

// One slot per day of the report (up to 31).
const xDay = (w, n) => (i) => PAD_L + ((i + 0.5) / n) * (w - PAD_L - PAD_R);
const barW = (w, n, share) => Math.max(2, Math.min(14, ((w - PAD_L - PAD_R) / n) * share));

// The date under every day the baby was tracked (days with records). On a narrow phone a
// date that would touch the one before it is left out.
function dayAxis(w, days, base, C) {
  const x = xDay(w, days.length);
  let lastX = -Infinity;
  return days.map((d, i) => {
    if (!d.logged || x(i) - lastX < 14) return null;
    lastX = x(i);
    return (
      <SvgText key={`d${i}`} x={x(i)} y={base + 16} fontSize={fs(9)} fill={C.textSecondary} textAnchor="middle">
        {format(d.date, 'd')}
      </SvgText>
    );
  });
}

function BreastDays({ days, C }) {
  const top = 10;
  const base = 150;
  const max = niceMax(Math.max(...days.map((d) => Math.max(d.left, d.right))));
  return (
    <Chart height={base + AXIS_H} C={C} xTitle={dateTitle(days)} yTitle="Duration per day (min)" render={(w) => {
      const x = xDay(w, days.length);
      const bw = barW(w, days.length, 0.4);
      const h = (v) => ((base - top) * v) / max;
      return (
        <>
          {valueGrid(w, max, top, base, C)}
          {days.map((d, i) => (
            <React.Fragment key={`b${i}`}>
              {d.left ? <Rect x={x(i) - bw} y={base - h(d.left)} width={bw} height={h(d.left)} fill={CH.left} /> : null}
              {d.right ? <Rect x={x(i)} y={base - h(d.right)} width={bw} height={h(d.right)} fill={CH.right} /> : null}
            </React.Fragment>
          ))}
          {dayAxis(w, days, base, C)}
        </>
      );
    }} />
  );
}

function BottleDays({ days, C }) {
  const top = 28; // room for the ml labels above the tallest bars
  const base = 150;
  const max = niceMax(Math.max(...days.map((d) => d.bottleMl)));
  return (
    <Chart height={base + AXIS_H} C={C} xTitle={dateTitle(days)} yTitle="Milk per day (mL)" render={(w) => {
      const x = xDay(w, days.length);
      const bw = barW(w, days.length, 0.6);
      const slot = (w - PAD_L - PAD_R) / days.length;
      const h = (v) => ((base - top) * v) / max;
      const bars = days.map((d, i) => ({ i, x: x(i), y: base - h(d.bottleMl), ml: d.bottleMl })).filter((b) => b.ml);
      // "130ml" above each bar, horizontal; a label that would run into its neighbour moves up
      // a line. Left out when the bars are too close for that (a full month on a phone).
      const labelY = slot >= 12 ? stackLabels(bars.map((b) => ({ x: b.x, y: b.y - 3 })), 28, 11) : [];
      return (
        <>
          {valueGrid(w, max, top, base, C)}
          {bars.map((b, k) => (
            <React.Fragment key={`m${b.i}`}>
              <Rect x={b.x - bw / 2} y={b.y} width={bw} height={base - b.y} rx={1} fill={CH.bottle} />
              {labelY[k] != null && labelY[k] > 6 ? (
                <SvgText x={b.x} y={labelY[k]} fontSize={fs(8)} fontWeight="bold" fill={C.text} textAnchor="middle">
                  {`${b.ml}ml`}
                </SvgText>
              ) : null}
            </React.Fragment>
          ))}
          {dayAxis(w, days, base, C)}
        </>
      );
    }} />
  );
}

function SleepDays({ days, C }) {
  const top = 10;
  const base = 150;
  return (
    <Chart height={base + AXIS_H} C={C} xTitle={dateTitle(days)} yTitle="Hours per day" render={(w) => {
      const x = xDay(w, days.length);
      const bw = barW(w, days.length, 0.6);
      const h = (secs) => ((base - top) * (secs / 3600)) / 24;
      return (
        <>
          {valueGrid(w, 24, top, base, C)}
          {days.map((d, i) => (d.hasSleep ? (
            <React.Fragment key={`s${i}`}>
              <Rect x={x(i) - bw / 2} y={base - h(d.sleepSecs)} width={bw} height={h(d.sleepSecs)} fill={CH.sleep} />
              {d.awakeSecs ? (
                <Rect x={x(i) - bw / 2} y={base - h(d.sleepSecs) - h(d.awakeSecs)} width={bw} height={h(d.awakeSecs)} fill={CH.awake} />
              ) : null}
            </React.Fragment>
          ) : null))}
          {dayAxis(w, days, base, C)}
        </>
      );
    }} />
  );
}

// One row per date, a mark at the time of day of each change, in its logged colour (as in
// the daily report).
const ROW_H = 16;
function DiaperDays({ days: allDays, C, stoolColour }) {
  // Only the days the baby was tracked get a row.
  const days = allDays.filter((d) => d.logged);
  const top = 8;
  const base = top + days.length * ROW_H + 4;
  return (
    <Chart height={base + AXIS_H} C={C} xTitle="Time of day" yTitle="Date" render={(w) => {
      const xT = (d, at) => PAD_L + (Math.min(Math.max(at - d.date.getTime(), 0), DAY_MS) / DAY_MS) * (w - PAD_L - PAD_R);
      const xH = (h) => PAD_L + (h / 24) * (w - PAD_L - PAD_R);
      return (
        <>
          {[0, 3, 6, 9, 12, 15, 18, 21, 24].map((h) => (
            <React.Fragment key={`h${h}`}>
              <Line x1={xH(h)} y1={top - 4} x2={xH(h)} y2={base} stroke={C.border} strokeWidth={1} strokeDasharray="3 3" />
              {h % 6 === 0 ? (
                <SvgText x={xH(h)} y={base + 16} fontSize={fs(10)} fill={C.textSecondary} textAnchor="middle">
                  {`${String(h).padStart(2, '0')}:00`}
                </SvgText>
              ) : null}
            </React.Fragment>
          ))}
          {days.map((d, i) => {
            const y = top + i * ROW_H + ROW_H / 2;
            return (
              <React.Fragment key={`r${i}`}>
                <Line x1={PAD_L} y1={y} x2={w - PAD_R} y2={y} stroke={C.border} strokeWidth={0.6} />
                <SvgText x={PAD_L - 6} y={y + 3} fontSize={fs(9)} fill={C.text} textAnchor="end">{format(d.date, 'd MMM')}</SvgText>
                {d.diapers.map((x, k) => (
                  <DiaperDot key={k} d={x} cx={xT(d, x.at)} cy={y} r={5} stoolColour={stoolColour} ring={C.textMuted} />
                ))}
              </React.Fragment>
            );
          })}
        </>
      );
    }} />
  );
}

export default function MonthReport({ data, C, darkMode, onPickDay, overdue = 0 }) {
  const { s, days } = data;
  const stoolColour = darkMode ? CH.stoolDark : CH.stool;
  const tint = darkMode ? CH.awake : CH.awakeText; // awake text, readable on the card
  const sleepTint = darkMode ? CH.sleep : CH.sleepText;
  const perDay = (v, n) => (n ? (v / n).toFixed(1) : '0');
  const dm = (ms) => format(ms, 'd MMM');
  const NONE = 'in this month';

  return (
    <View>
      <Section n={1} title="Monthly monitoring table" C={C}>
        {s.loggedDays ? (
          <>
            <MonitoringTable
              rows={data.rows}
              footer={[{ label: 'Total', cells: data.totals }, { label: 'Daily avg', cells: data.averages }]}
              firstHeader="Date"
              firstLabel={(r) => format(r.date, 'd MMM')}
              onPressRow={onPickDay ? (r) => onPickDay(r.date) : undefined}
              C={C}
            />
            <Text style={[local.note, { color: C.textSecondary }]}>
              Tap a date to open that day. Daily average counts only the days with records of that kind.
            </Text>
          </>
        ) : <Empty text={`Nothing recorded ${NONE}`} C={C} />}
      </Section>

      <Section n={2} title="Medicines & supplements" C={C}>
        {data.meds.length ? data.meds.map((m, i) => (
          <View key={m.name + i} style={[styles.listRow, i > 0 && { borderTopColor: C.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.listMain, { color: C.text }]}>{m.name}</Text>
              <Text style={[local.sub, { color: C.textSecondary }]}>
                {`${m.dose} · ${dm(m.first) === dm(m.last) ? dm(m.first) : `${dm(m.first)} – ${dm(m.last)}`}`}
              </Text>
            </View>
            <Text style={[styles.listSide, { color: C.textSecondary }]}>
              {`${m.given} given`}
              {m.skipped ? <Text style={{ color: COLORS.warning }}>{` · ${m.skipped} skipped`}</Text> : null}
            </Text>
          </View>
        )) : <Empty text={`No medicines or supplements ${NONE}`} C={C} />}
      </Section>

      <Section n={3} title="Vaccination" C={C}>
        {data.vacc.length ? data.vacc.map((v, i) => (
          <View key={v.id || i} style={[styles.listRow, i > 0 && { borderTopColor: C.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
            <Text style={[styles.listMain, { color: C.text }]}>{v.name}</Text>
            <Text style={[styles.listSide, { color: C.textSecondary }]}>{format(v.at, 'd MMM, hh:mm a')}</Text>
          </View>
        )) : <Empty text={`No vaccines given ${NONE}`} C={C} />}
        {overdue ? (
          <Text style={[local.overdue, { color: COLORS.warning }]}>{`Overdue now: ${overdue}`}</Text>
        ) : null}
      </Section>

      <Section n={4} title="Breastfeeding pattern" C={C}>
        {s.breastN ? (
          <>
            <Stats C={C} items={[
              ['Sessions', `${s.breastN} (${perDay(s.breastN, s.breastDays)}/day)`],
              ['Total duration', hm((s.breastLeft + s.breastRight) * 60)],
              ['Left breast', `${s.breastLeft} min (${pct(s.breastLeft, s.breastRight)})`, darkMode ? CH.left : CH.leftText],
              ['Right breast', `${s.breastRight} min (${pct(s.breastRight, s.breastLeft)})`, darkMode ? CH.right : CH.rightText],
            ]} />
            <Legend C={C} items={[['Left breast', CH.left], ['Right breast', CH.right]]} />
            <BreastDays days={days} C={C} />
            <Split a={s.breastLeft} b={s.breastRight} colourA={CH.left} colourB={CH.right} C={C}
              labels={['Left breast', 'Right breast']}
              labelColours={darkMode ? [CH.left, CH.right] : [CH.leftText, CH.rightText]} />
          </>
        ) : <Empty text={`No breastfeeds ${NONE}`} C={C} />}
      </Section>

      <Section n={5} title="Bottle feeding pattern" C={C}>
        {s.bottleN ? (
          <>
            <Stats C={C} items={[
              ['Total feeds', `${s.bottleN} (${perDay(s.bottleN, s.bottleDays)}/day)`],
              ['Milk consumed', `${s.bottleMl} mL`, darkMode ? CH.bottle : CH.bottleText],
              ['Average per day', `${Math.round(s.bottleMl / s.bottleDays)} mL`, null, false],
              ['Average per feed', `${Math.round(s.bottleMl / s.bottleN)} mL`, null, false],
            ]} />
            <BottleDays days={days} C={C} />
          </>
        ) : <Empty text={`No bottle feeds ${NONE}`} C={C} />}
      </Section>

      <Section n={6} title="Sleep pattern" C={C}>
        {s.sleepDays ? (
          <>
            <Stats C={C} items={[
              ['Average sleep a day', `${hm(s.sleepSecs / s.sleepDays)} (${pct(s.sleepSecs, s.awakeSecs)})`, sleepTint],
              ['Average awake a day', `${hm(s.awakeSecs / s.sleepDays)} (${pct(s.awakeSecs, s.sleepSecs)})`, tint],
              ['Total sleep', hm(s.sleepSecs), null, false],
              ['Longest sleep', hm(s.longestSleep), null, false],
              ['Sleep periods', `${s.sleepN} (${perDay(s.sleepN, s.sleepDays)}/day)`, null, false],
              ['Longest awake', s.awakeN ? hm(s.longestAwake) : '–', null, false],
            ]} />
            <Legend C={C} items={[['Sleep', CH.sleep], ['Awake', CH.awake]]} />
            <SleepDays days={days} C={C} />
            <Split a={s.sleepSecs} b={s.awakeSecs} colourA={CH.sleep} colourB={CH.awake} C={C}
              caption="Monthly sleep and awake distribution"
              labels={['Sleep', 'Awake']} labelColours={[sleepTint, tint]} />
          </>
        ) : <Empty text={`No sleep ${NONE}`} C={C} />}
      </Section>

      <Section n={7} title="Diaper monitoring pattern" C={C}>
        {s.diaperN ? (
          <>
            <Stats C={C} items={[
              ['Diaper changes', `${s.diaperN} (${perDay(s.diaperN, s.diaperDays)}/day)`],
              ['Wet only', String(s.wet), darkMode ? CH.wet : CH.wetText],
              ['Stool only', String(s.stool), stoolColour],
              ['Both wet and stool', String(s.both), CH.both],
              ['Dry', String(s.dry), darkMode ? CH.dry : CH.dryText],
            ]} />
            <AxisTitle text="Diaper change history, day by day" C={C} />
            <DiaperDays days={days} C={C} stoolColour={stoolColour} />
            <ShapeKey C={C} />
            <View style={[styles.rule, { borderTopColor: C.border }]} />
            <Stats C={C} items={[
              ['Containing urine', String(s.wet + s.both)],
              ['Containing stool', String(s.stool + s.both)],
              s.lowWetDays ? ['Days with fewer than 6 wet', String(s.lowWetDays), COLORS.warning] : null,
            ]} />
          </>
        ) : <Empty text={`No diaper changes ${NONE}`} C={C} />}
      </Section>
    </View>
  );
}

const local = StyleSheet.create({
  note: { fontSize: fs(11), marginTop: 8 },
  sub: { fontSize: fs(12), marginTop: 2 },
  overdue: { fontSize: fs(13), fontWeight: FONT_WEIGHT.bold, marginTop: 8 },
});
