import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import Svg, { Rect, Line, Path, Text as SvgText } from 'react-native-svg';
import { format } from 'date-fns';

import { CHART_COLORS as CH, COLORS } from '../constants/colors';
import { FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING, SHADOW, TIGHT_TEXT, fs } from '../constants/theme';
import { DAY_MS, hm, niceMax, pct, feedWindow, tickLabel, diaperShape, diamondHalves, DIAPER_SHAPES, keyFill } from '../lib/dailyReport';

// The Daily Summary laid out like the PDF report: monitoring table, medicines, vaccines and
// a chart each for breastfeeding, bottle feeding, sleep and diapers.
// `data` comes from buildDailyData (lib/dailyReport.js).

const HOURS = [0, 4, 8, 12, 16, 20, 24];
export const PAD_L = 62; // room for the y-axis name and the lane names / y values
export const PAD_R = 10;
export const AXIS_H = 26;

/** Measures its width, then draws the chart for that width. */
const X_TITLE_H = 20;

/**
 * Measures its width, then draws the chart for that width, with the x-axis name under it and
 * the y-axis name running up the left edge. `height` is the plot plus its tick labels.
 */
export function Chart({ height, render, xTitle, yTitle, C }) {
  const [w, setW] = useState(0);
  const total = height + (xTitle ? X_TITLE_H : 0);
  const mid = (height - AXIS_H) / 2;
  return (
    <View style={{ height: total }} onLayout={(e) => setW(Math.round(e.nativeEvent.layout.width))}>
      {w > 0 ? (
        <Svg width={w} height={total}>
          {render(w)}
          {xTitle ? (
            <SvgText x={PAD_L + (w - PAD_L - PAD_R) / 2} y={height + 14} fontSize={fs(11)} fontWeight="bold" fill={C.text} textAnchor="middle">
              {xTitle}
            </SvgText>
          ) : null}
          {yTitle ? (
            <SvgText x={10} y={mid} transform={`rotate(-90 10 ${mid})`} fontSize={fs(11)} fontWeight="bold" fill={C.text} textAnchor="middle">
              {yTitle}
            </SvgText>
          ) : null}
        </Svg>
      ) : null}
    </View>
  );
}

function timeAxis(w, base, C, vTop) {
  const x = (h) => PAD_L + (h / 24) * (w - PAD_L - PAD_R);
  return HOURS.map((h) => (
    <React.Fragment key={`h${h}`}>
      {vTop != null ? <Line x1={x(h)} y1={vTop} x2={x(h)} y2={base} stroke={C.border} strokeWidth={1} /> : null}
      <SvgText x={x(h)} y={base + 16} fontSize={fs(10)} fill={C.textSecondary} textAnchor="middle">
        {`${String(h).padStart(2, '0')}:00`}
      </SvgText>
    </React.Fragment>
  ));
}

export function valueGrid(w, max, top, base, C) {
  return [0, 1, 2, 3, 4].map((i) => {
    const y = base - ((base - top) * i) / 4;
    const v = (max * i) / 4;
    return (
      <React.Fragment key={`g${i}`}>
        <Line x1={PAD_L} y1={y} x2={w - PAD_R} y2={y} stroke={C.border} strokeWidth={1} />
        <SvgText x={PAD_L - 8} y={y + 4} fontSize={fs(10)} fill={C.textSecondary} textAnchor="end">
          {Number.isInteger(v) ? String(v) : v.toFixed(1)}
        </SvgText>
      </React.Fragment>
    );
  });
}

// Feeding charts: the axis runs from the first feed of the day, not from 00:00.
function feedScale(list, dayStart, w) {
  const win = feedWindow(list.map((f) => f.at), dayStart);
  const pad = 8;
  const x = (ms) => PAD_L + pad + ((Math.min(Math.max(ms, win.from), win.to) - win.from) / (win.to - win.from)) * (w - PAD_L - PAD_R - 2 * pad);
  const axis = (base, C) => win.ticks.map((t) => (
    <SvgText key={`t${t}`} x={x(t)} y={base + 16} fontSize={fs(10)} fill={C.textSecondary} textAnchor="middle">
      {tickLabel(t, dayStart)}
    </SvgText>
  ));
  return { x, axis };
}

const xOf = (start, w) => (ms) => PAD_L + (Math.min(Math.max(ms - start, 0), DAY_MS) / DAY_MS) * (w - PAD_L - PAD_R);

// ---------- Small pieces ----------
export function Section({ n, title, C, children }) {
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: C.text }]}>{`${n}. ${title}`}</Text>
      <View style={[styles.card, { backgroundColor: C.card, borderColor: C.border }, SHADOW.sm]}>{children}</View>
    </View>
  );
}

export function Stats({ items, C }) {
  return (
    <View style={styles.stats}>
      {items.filter(Boolean).map(([label, value, colour, big = true]) => (
        <View key={label} style={styles.stat}>
          <Text style={[styles.statLabel, { color: C.textSecondary }]}>{label}</Text>
          <Text style={[big ? styles.statBig : styles.statSmall, { color: colour || C.text }]}>{value}</Text>
        </View>
      ))}
    </View>
  );
}

export function Legend({ items, C }) {
  return (
    <View style={styles.legend}>
      {items.map(([label, colour]) => (
        <View key={label} style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colour }]} />
          <Text style={[styles.legendText, { color: C.textSecondary }]} {...TIGHT_TEXT}>{label}</Text>
        </View>
      ))}
    </View>
  );
}

export function Split({ a, b, colourA, colourB, caption, labels, labelColours = [], C }) {
  if (!(a + b)) return null;
  return (
    <View style={{ marginTop: SPACING.sm }}>
      {caption ? <Text style={[styles.caption, { color: C.textSecondary }]}>{caption}</Text> : null}
      <View style={styles.split}>
        <View style={{ flex: a, backgroundColor: colourA }} />
        <View style={{ flex: b, backgroundColor: colourB }} />
      </View>
      {labels ? (
        <View style={styles.splitLabels}>
          <Text style={[styles.splitLabel, { color: labelColours[0] || C.textSecondary }]}>{`${labels[0]}: ${pct(a, b)}`}</Text>
          <Text style={[styles.splitLabel, { color: labelColours[1] || C.textSecondary }]}>{`${labels[1]}: ${pct(b, a)}`}</Text>
        </View>
      ) : null}
    </View>
  );
}

export const Empty = ({ text, C }) => <Text style={[styles.empty, { color: C.textMuted }]}>{text}</Text>;
export const AxisTitle = ({ text, C }) => <Text style={[styles.axisTitle, { color: C.text }]}>{text}</Text>;

// ---------- Monitoring table ----------
const COLS = [
  { group: 'Breastfeeding (min)', subs: ['LB', 'RB', 'Total'], width: 40 },
  { group: 'Bottle feeding', subs: ['Min', 'mL'], width: 42 },
  { group: 'Sleep cycle', subs: ['Sleep', 'Awake'], width: 62 },
  { group: 'Diapers', subs: ['Wet', 'Stool', 'Both', 'Dry'], width: 44 },
];
const CELL_W = COLS.flatMap((g) => g.subs.map(() => g.width));
const TIME_W = 56;

/**
 * rows: [{ cells }] · footer: [{ label, cells }] (Total, Daily average)
 * firstHeader / firstLabel: the first column (Time for a day, Date for a month)
 */
export function MonitoringTable({ rows, footer, C, firstHeader = 'Time', firstLabel = (r) => format(r.at, 'HH:mm'), onPressRow }) {
  const cell = (v) => (v === true ? '✓' : v === undefined || v === null || v === '' ? '–' : String(v));
  const tx = (v, i, bold) => (
    <Text
      key={i}
      style={[styles.td, { width: CELL_W[i], color: v === true ? C.primary : v == null ? C.textMuted : C.text },
        (bold || v === true) && { fontWeight: FONT_WEIGHT.heavy }]}
      {...TIGHT_TEXT}
    >
      {cell(v)}
    </Text>
  );
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View>
        <View style={[styles.tr, styles.thead, { backgroundColor: C.primaryLight }]}>
          <Text style={[styles.th, styles.tl, { width: TIME_W, color: C.text }]} {...TIGHT_TEXT}>{firstHeader}</Text>
          {COLS.map((g) => (
            <Text key={g.group} style={[styles.th, { width: g.width * g.subs.length, color: C.text }]} {...TIGHT_TEXT}>{g.group}</Text>
          ))}
        </View>
        <View style={[styles.tr, { backgroundColor: C.primaryLight, borderBottomColor: C.border }]}>
          <View style={{ width: TIME_W }} />
          {COLS.flatMap((g) => g.subs.map((s) => (
            <Text key={s} style={[styles.thSub, { width: g.width, color: C.textSecondary }]} {...TIGHT_TEXT}>{s}</Text>
          )))}
        </View>
        {rows.map((r, ri) => {
          const label = firstLabel(r);
          const inner = (
            <>
              <Text style={[styles.td, styles.tl, { width: TIME_W, color: onPressRow ? C.primary : C.text }]} {...TIGHT_TEXT}>{label}</Text>
              {CELL_W.map((_, i) => tx(r.cells[i], i))}
            </>
          );
          return onPressRow ? (
            <Pressable
              key={`r${ri}`}
              onPress={() => onPressRow(r)}
              style={({ pressed }) => [styles.tr, { borderBottomColor: C.border }, pressed && { backgroundColor: C.primaryLight }]}
              accessibilityRole="button"
              accessibilityLabel={`${label}. Open this day`}
            >
              {inner}
            </Pressable>
          ) : <View key={`r${ri}`} style={[styles.tr, { borderBottomColor: C.border }]}>{inner}</View>;
        })}
        {footer.map((f, fi) => (
          <View key={f.label} style={[styles.tr, fi === 0 && styles.total, { borderTopColor: C.primary, backgroundColor: C.primaryLight, borderBottomColor: C.border }]}>
            <Text style={[styles.td, styles.tl, { width: TIME_W, color: C.text }]} numberOfLines={2} {...TIGHT_TEXT}>{f.label}</Text>
            {f.cells.map((v, i) => tx(v, i, true))}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

// ---------- Charts ----------
function BreastChart({ data, C }) {
  const top = 10;
  const base = 150;
  const max = niceMax(Math.max(...data.breast.map((f) => Math.max(f.left, f.right))));
  return (
    <Chart height={base + AXIS_H} C={C} xTitle="Time of day" yTitle="Duration (min)" render={(w) => {
      const { x, axis } = feedScale(data.breast, data.start, w);
      const h = (v) => ((base - top) * v) / max;
      return (
        <>
          {valueGrid(w, max, top, base, C)}
          {data.breast.map((f) => (
            <React.Fragment key={`b${f.at}`}>
              {f.left ? <Rect x={x(f.at) - 5} y={base - h(f.left)} width={4} height={h(f.left)} fill={CH.left} /> : null}
              {f.right ? <Rect x={x(f.at) + 1} y={base - h(f.right)} width={4} height={h(f.right)} fill={CH.right} /> : null}
            </React.Fragment>
          ))}
          {axis(base, C)}
        </>
      );
    }} />
  );
}

function BottleChart({ data, C }) {
  const top = 18;
  const base = 150;
  const max = niceMax(Math.max(...data.bottle.map((f) => f.ml)));
  return (
    <Chart height={base + AXIS_H} C={C} xTitle="Time of day" yTitle="Milk consumed (mL)" render={(w) => {
      const { x, axis } = feedScale(data.bottle, data.start, w);
      const h = (v) => ((base - top) * v) / max;
      return (
        <>
          {valueGrid(w, max, top, base, C)}
          {data.bottle.map((f) => (
            <React.Fragment key={`m${f.at}`}>
              <Rect x={x(f.at) - 6} y={base - h(f.ml)} width={12} height={h(f.ml)} rx={2} fill={CH.bottle} />
              <SvgText x={x(f.at)} y={base - h(f.ml) - 4} fontSize={fs(10)} fontWeight="bold" fill={C.text} textAnchor="middle">
                {`${f.ml}ml`}
              </SvgText>
            </React.Fragment>
          ))}
          {axis(base, C)}
        </>
      );
    }} />
  );
}

function SleepChart({ data, C }) {
  const base = 130;
  const lane = (x, label, y, list, colour) => (
    <React.Fragment key={label}>
      <SvgText x={18} y={y + 4} fontSize={fs(12)} fill={C.text}>{label}</SvgText>
      {list.map(([s, e]) => (
        <Rect key={`${label}${s}`} x={x(s)} y={y - 20} width={Math.max(2, x(e) - x(s))} height={40} rx={2} fill={colour} />
      ))}
    </React.Fragment>
  );
  return (
    <Chart height={base + AXIS_H} C={C} xTitle="Time of day" yTitle="Sleep state" render={(w) => {
      const x = xOf(data.start, w);
      return (
        <>
          {timeAxis(w, base, C, 6)}
          {lane(x, 'Sleep', 36, data.sleepParts, CH.sleep)}
          {lane(x, 'Awake', 96, data.awakeParts, CH.awake)}
        </>
      );
    }} />
  );
}

const R_DOT = 7;

/**
 * One diaper as a marker in its logged colour and its type's shape (circle wet, square stool,
 * diamond both with urine / stool halves, triangle dry); same shapes as the PDF.
 */
export function DiaperDot({ d, cx, cy, r = R_DOT, stoolColour, ring }) {
  const outline = diaperShape(d.type, cx, cy, r);
  if (d.type === 'both') {
    const [left, right] = diamondHalves(cx, cy, r);
    return (
      <>
        <Path d={left} fill={d.urine?.swatch || CH.wet} />
        <Path d={right} fill={d.stool?.swatch || stoolColour} />
        <Path d={outline} fill="none" stroke={ring} strokeWidth={1} strokeLinejoin="round" />
      </>
    );
  }
  const fill = d.type === 'urine' ? d.urine?.swatch || CH.wet
    : d.type === 'stool' ? d.stool?.swatch || stoolColour : CH.dry;
  return <Path d={outline} fill={fill} stroke={ring} strokeWidth={1} strokeLinejoin="round" />;
}

/** The chart key: each type's shape; wet and dry in their fixed colours, stool and both grey. */
export function ShapeKey({ C }) {
  return (
    <View style={styles.ckey}>
      {DIAPER_SHAPES.map(([type, label]) => (
        <View key={type} style={styles.ckeyItem}>
          <Svg width={16} height={16}>
            <Path d={diaperShape(type, 8, 8, 5.5)} fill={keyFill(type, C.border)} stroke={C.textMuted} strokeWidth={1} strokeLinejoin="round" />
          </Svg>
          <Text style={[styles.ckeyText, { color: C.textSecondary }]}>{label}</Text>
        </View>
      ))}
    </View>
  );
}

function DiaperChart({ data, C, stoolColour }) {
  const base = 170;
  const lanes = [['Wet', 'urine', 20], ['Stool', 'stool', 62], ['Both', 'both', 104], ['Dry', 'dry', 146]];
  return (
    <Chart height={base + AXIS_H} C={C} xTitle="Time of day" yTitle="Diaper type" render={(w) => {
      const x = xOf(data.start, w);
      return (
        <>
          {timeAxis(w, base, C, 6)}
          {lanes.map(([label, type, y]) => (
            <React.Fragment key={label}>
              <Line x1={PAD_L} y1={y} x2={w - PAD_R} y2={y} stroke={C.border} strokeWidth={1} />
              <SvgText x={18} y={y + 4} fontSize={fs(12)} fill={C.text}>{label}</SvgText>
              {data.diapers.filter((d) => d.type === type).map((d, i) => (
                <DiaperDot key={`${label}${d.at}-${i}`} d={d} cx={x(d.at)} cy={y} stoolColour={stoolColour} ring={C.textMuted} />
              ))}
            </React.Fragment>
          ))}
        </>
      );
    }} />
  );
}

// ---------- Screen part ----------
export default function DailyReport({ data, C, darkMode, onDay }) {
  const { s } = data;
  const stoolColour = darkMode ? CH.stoolDark : CH.stool;
  const tint = darkMode ? CH.awake : CH.awakeText; // awake text, readable on the card
  const sleepTint = darkMode ? CH.sleep : CH.sleepText;

  return (
    <View>
      <Section n={1} title="Daily monitoring table" C={C}>
        {data.rows.length ? <MonitoringTable rows={data.rows} footer={[{ label: 'Total', cells: data.totals }]} C={C} /> : <Empty text={`Nothing recorded ${onDay}`} C={C} />}
      </Section>

      <Section n={2} title="Medicines & supplements" C={C}>
        {data.meds.length ? data.meds.map((m, i) => (
          <View key={m.id || i} style={[styles.listRow, i > 0 && { borderTopColor: C.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
            <Text style={[styles.listMain, { color: C.text }]}>
              {m.name}
              {m.skipped ? <Text style={{ color: COLORS.warning }}> (skipped)</Text> : null}
            </Text>
            <Text style={[styles.listSide, { color: C.textSecondary }]}>{m.dose}</Text>
            <Text style={[styles.listSide, { color: C.textSecondary }]}>{format(m.at, 'hh:mm a')}</Text>
          </View>
        )) : <Empty text={`No medicines or supplements ${onDay}`} C={C} />}
      </Section>

      <Section n={3} title="Vaccination" C={C}>
        {data.vacc.length ? data.vacc.map((v, i) => (
          <View key={v.id || i} style={[styles.listRow, i > 0 && { borderTopColor: C.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
            <Text style={[styles.listMain, { color: C.text }]}>{v.name}</Text>
            <Text style={[styles.listSide, { color: C.textSecondary }]}>{format(v.at, 'hh:mm a')}</Text>
          </View>
        )) : <Empty text={`No vaccines given ${onDay}`} C={C} />}
      </Section>

      <Section n={4} title="Breastfeeding pattern" C={C}>
        {data.breast.length ? (
          <>
            <Stats C={C} items={[
              ['Sessions', String(data.breast.length)],
              ['Total duration', hm((s.breastLeft + s.breastRight) * 60)],
              ['Left breast', `${s.breastLeft} min (${pct(s.breastLeft, s.breastRight)})`, darkMode ? CH.left : CH.leftText],
              ['Right breast', `${s.breastRight} min (${pct(s.breastRight, s.breastLeft)})`, darkMode ? CH.right : CH.rightText],
            ]} />
            <Legend C={C} items={[['Left breast', CH.left], ['Right breast', CH.right]]} />
            <BreastChart data={data} C={C} />
            <Split a={s.breastLeft} b={s.breastRight} colourA={CH.left} colourB={CH.right} C={C}
              labels={['Left breast', 'Right breast']}
              labelColours={darkMode ? [CH.left, CH.right] : [CH.leftText, CH.rightText]} />
          </>
        ) : <Empty text={`No breastfeeds ${onDay}`} C={C} />}
      </Section>

      <Section n={5} title="Bottle feeding pattern" C={C}>
        {data.bottle.length ? (
          <>
            <Stats C={C} items={[
              ['Total feeds', String(data.bottle.length)],
              ['Milk consumed', `${s.bottleMl} mL`, darkMode ? CH.bottle : CH.bottleText],
              ['Feeding duration', `${s.bottleMin} min`, null, false],
              ['Average per feed', `${Math.round(s.bottleMl / data.bottle.length)} mL`, null, false],
            ]} />
            <BottleChart data={data} C={C} />
          </>
        ) : <Empty text={`No bottle feeds ${onDay}`} C={C} />}
      </Section>

      <Section n={6} title="Sleep pattern" C={C}>
        {data.sleepParts.length ? (
          <>
            <Stats C={C} items={[
              ['Total sleep', `${hm(s.sleepSecs)} (${pct(s.sleepSecs, s.awakeSecs)})`, sleepTint],
              ['Total awake', `${hm(s.awakeSecs)} (${pct(s.awakeSecs, s.sleepSecs)})`, tint],
              ['Sleep periods', String(data.sleepParts.length), null, false],
              ['Longest sleep', hm(s.longestSleep), null, false],
              ['Awake periods', String(data.awakeParts.length), null, false],
              ['Longest awake', data.awakeParts.length ? hm(s.longestAwake) : '–', null, false],
            ]} />
            <Legend C={C} items={[['Sleep', CH.sleep], ['Awake', CH.awake]]} />
            <SleepChart data={data} C={C} />
            <Split a={s.sleepSecs} b={s.awakeSecs} colourA={CH.sleep} colourB={CH.awake} C={C}
              caption={data.end - data.start >= DAY_MS
                ? '24-hour sleep and awake distribution'
                : `Sleep and awake distribution (00:00–${format(data.end, 'HH:mm')})`}
              labels={['Sleep', 'Awake']} labelColours={[sleepTint, tint]} />
          </>
        ) : <Empty text={`No sleep ${onDay}`} C={C} />}
      </Section>

      <Section n={7} title="Diaper monitoring pattern" C={C}>
        {data.diapers.length ? (
          <>
            <Stats C={C} items={[
              ['Diaper changes', String(data.diapers.length)],
              ['Wet only', String(s.wet), darkMode ? CH.wet : CH.wetText],
              ['Stool only', String(s.stool), stoolColour],
              ['Both wet and stool', String(s.both), CH.both],
              ['Dry', String(s.dry), darkMode ? CH.dry : CH.dryText],
            ]} />
            <DiaperChart data={data} C={C} stoolColour={stoolColour} />
            <ShapeKey C={C} />
            <View style={[styles.rule, { borderTopColor: C.border }]} />
            <Stats C={C} items={[
              ['Containing urine', String(s.wet + s.both)],
              ['Containing stool', String(s.stool + s.both)],
            ]} />
          </>
        ) : <Empty text={`No diaper changes ${onDay}`} C={C} />}
      </Section>
    </View>
  );
}

export const styles = StyleSheet.create({
  section: { marginBottom: SPACING.lg },
  sectionTitle: { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.heavy, marginBottom: SPACING.sm },
  card: { borderRadius: RADIUS.xl, borderWidth: 1, padding: SPACING.md },
  stats: { flexDirection: 'row', flexWrap: 'wrap', rowGap: SPACING.sm },
  stat: { width: '50%', paddingRight: SPACING.sm },
  statLabel: { fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.medium, marginBottom: 2 },
  statBig: { fontSize: fs(20), fontWeight: FONT_WEIGHT.heavy },
  statSmall: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.bold },
  legend: { flexDirection: 'row', justifyContent: 'center', gap: SPACING.md, marginTop: SPACING.md },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.semibold },
  axisTitle: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.bold, marginTop: SPACING.md, marginBottom: SPACING.sm },
  caption: { fontSize: FONT_SIZE.xs, marginBottom: 6 },
  splitLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  splitLabel: { fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.medium },
  ckey: { marginTop: SPACING.sm, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 14 },
  ckeyItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ckeyText: { fontSize: FONT_SIZE.xs },
  split: { flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden' },
  rule: { borderTopWidth: 1, marginVertical: SPACING.md },
  empty: { fontSize: FONT_SIZE.sm, textAlign: 'center', paddingVertical: 4 },
  tr: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'transparent' },
  thead: { borderTopLeftRadius: RADIUS.sm, borderTopRightRadius: RADIUS.sm, paddingTop: 8, paddingBottom: 2 },
  th: { fontSize: fs(11), fontWeight: FONT_WEIGHT.heavy, textAlign: 'center' },
  thSub: { fontSize: fs(10), fontWeight: FONT_WEIGHT.bold, textAlign: 'center', paddingVertical: 6 },
  td: { fontSize: fs(11), textAlign: 'center', paddingVertical: 8 },
  tl: { textAlign: 'left', paddingLeft: 8, fontWeight: FONT_WEIGHT.heavy },
  total: { borderTopWidth: 2, borderBottomWidth: 0 },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingVertical: 10 },
  listMain: { flex: 1, fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.semibold },
  listSide: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.medium },
});
