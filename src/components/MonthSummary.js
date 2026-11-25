import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';

import { COLORS, GRADIENTS } from '../constants/colors';
import { FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING, SHADOW, TIGHT_TEXT, fs } from '../constants/theme';
import GradientView from './GradientView';
import { SummaryBlock, StatRow, EmptyNote, SortedBlocks } from './SummaryParts';
import { RANGE_DAYS } from '../lib/monthSummary';
import { formatDuration } from '../utils/formatters';

const one = (n) => (Math.round(n * 10) / 10).toString();
const day = (d) => format(d, 'd MMM');
const NONE = 'No records in these 30 days';

// 'All' charts how many records were logged each day and shows every card;
// the others chart one measure and show only that report's card.
const CHARTS = [
  { key: 'all', label: 'All', card: null, axis: 'Records per day', value: (d) => d.records, text: (v) => `${v} records` },
  { key: 'feeds', label: 'Feeds', card: 'feeding', axis: 'Feeds per day', value: (d) => d.feeds, text: (v) => `${v} feeds` },
  { key: 'sleep', label: 'Sleep', card: 'sleep', axis: 'Hours of sleep per day', value: (d) => d.sleepSecs / 3600, text: (v) => `${one(v)} h sleep` },
  { key: 'diapers', label: 'Diapers', card: 'diapers', axis: 'Diapers per day', value: (d) => d.diapers, text: (v) => `${v} diapers` },
];

/** Bar per day for the 30 days. Tapping a bar opens that day. */
function DailyChart({ days, chart, setChart, onPickDay, C }) {
  const values = days.map(chart.value);
  const max = Math.max(...values, 0);
  // Round the top of the scale up to an even number so the middle line is a whole number.
  const top = Math.max(2, Math.ceil(max / 2) * 2);
  const tick = (t) => (chart.key === 'sleep' ? `${t}h` : `${t}`);

  return (
    <View style={[styles.chartCard, { backgroundColor: C.card, borderColor: C.border }, SHADOW.sm]}>
      <Text style={[styles.chartTitle, { color: C.text }]}>Day by day</Text>
      <View style={[styles.tabs, { backgroundColor: C.primaryLight }]}>
        {CHARTS.map((c) => {
          const active = c.key === chart.key;
          return (
            <TouchableOpacity
              key={c.key}
              onPress={() => setChart(c)}
              style={[styles.tab, active && { backgroundColor: C.primary }]}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.tabText, { color: active ? COLORS.white : C.primary }]} numberOfLines={1} adjustsFontSizeToFit {...TIGHT_TEXT}>{c.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={[styles.chartMax, { color: C.textSecondary }]}>{chart.axis}</Text>
      <View style={styles.histRow}>
        {/* Scale on the left: top, middle, zero */}
        <View style={styles.yAxis}>
          {[top, top / 2, 0].map((t) => (
            <Text key={t} style={[styles.yText, { color: C.textSecondary }]} {...TIGHT_TEXT}>{tick(t)}</Text>
          ))}
        </View>
        <View style={{ flex: 1 }}>
          <View style={[styles.plot, { borderColor: C.textMuted }]}>
            <View style={[styles.grid, { top: 0, backgroundColor: C.border }]} />
            <View style={[styles.grid, { top: '50%', backgroundColor: C.border }]} />
            <View style={styles.bars}>
              {days.map((d, i) => {
                const v = values[i];
                return (
                  <Pressable
                    key={d.date.toISOString()}
                    onPress={() => onPickDay(d.date)}
                    style={styles.barCol}
                    accessibilityRole="button"
                    accessibilityLabel={`${format(d.date, 'd MMMM')}: ${chart.text(chart.key === 'sleep' ? v : Math.round(v))}. Open this day`}
                  >
                    {v ? (
                      <View
                        style={[
                          styles.bar,
                          { height: `${Math.max((v / top) * 100, 2)}%`, backgroundColor: C.primary, borderColor: C.card },
                        ]}
                      />
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          </View>
          {/* Day of the month under every fifth bar and the last one */}
          <View style={styles.xAxis}>
            {days.map((d, i) => (i % 5 === 0 || i === RANGE_DAYS - 1 ? (
              <Text
                key={d.date.toISOString()}
                style={[styles.xText, { color: C.textSecondary, left: `${((i + 0.5) / RANGE_DAYS) * 100}%` }]}
                {...TIGHT_TEXT}
              >
                {format(d.date, i === 0 || d.date.getDate() === 1 ? 'd MMM' : 'd')}
              </Text>
            ) : null))}
          </View>
        </View>
      </View>
      <Text style={[styles.chartHint, { color: C.textSecondary }]}>
        {chart.card
          ? `Showing the ${chart.label.toLowerCase()} report only. Tap All to see every report. Tap a bar to see that day.`
          : 'Tap Feeds, Sleep or Diapers to see only that report. Tap a bar to see that day.'}
      </Text>
    </View>
  );
}

export default function MonthSummary({ data, babyName, onPickDay, C }) {
  const [chart, setChart] = useState(CHARTS[0]);
  const { feeding: f, sleep: s, diapers: d, temperature: t, breathing: b, skin: sk, growth: g, vaccines: v } = data;
  const partial = data.daysWithLogs < RANGE_DAYS;

  const gainKg = g.firstWeight && !g.oneWeighIn
    ? g.lastWeight.kg - g.firstWeight.kg : null;

  return (
    <>
      <GradientView colors={GRADIENTS.brand} style={[styles.hero, SHADOW.lg]}>
        <View style={styles.heroTop}>
          <View style={styles.heroChip}>
            <Ionicons name="calendar" size={13} color={COLORS.white} />
            <Text style={styles.heroChipText}>30 days</Text>
          </View>
          {babyName ? <Text style={styles.heroBaby} numberOfLines={1}>{babyName}</Text> : null}
        </View>
        <View style={styles.overviewRow}>
          {[
            { label: 'Feeds', value: f.total, avg: `${one(f.perDay)} a day` },
            { label: 'Sleep', value: s.totalSecs ? formatDuration(s.totalSecs) : '0m', avg: `${s.perDaySecs ? formatDuration(s.perDaySecs) : '0m'} a day` },
            { label: 'Diapers', value: d.total, avg: `${one(d.perDay)} a day` },
          ].map((item, i) => (
            <React.Fragment key={item.label}>
              {i > 0 && <View style={styles.heroDivider} />}
              <View style={styles.overviewPill}>
                <Text style={styles.overviewNum} numberOfLines={1} adjustsFontSizeToFit>{item.value}</Text>
                <Text style={styles.overviewLabel}>{item.label}</Text>
                <Text style={styles.overviewAvg} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{item.avg}</Text>
              </View>
            </React.Fragment>
          ))}
        </View>
        {partial ? (
          <Text style={styles.heroNote}>
            Based on {data.daysWithLogs} {data.daysWithLogs === 1 ? 'day' : 'days'} with records.
            Averages cover {data.daysCounted} {data.daysCounted === 1 ? 'day' : 'days'}.
          </Text>
        ) : null}
      </GradientView>

      <DailyChart days={data.days} chart={chart} setChart={setChart} onPickDay={onPickDay} C={C} />

      {/* Cards with records first, empty ones below */}
      <SortedBlocks blocks={[
        { key: 'feeding', has: f.total > 0, node: (
          <SummaryBlock icon="nutrition" color={C.primary} bg={C.primaryLight} title="Feeding" C={C}>
            {f.total ? (
              <>
                <StatRow label="Total feeds" value={`${f.total} · ${one(f.perDay)} a day`} C={C} />
                {f.breastCount ? <StatRow label="Breastfeeds" value={`${f.breastCount} · ${formatDuration(f.breastSecs)}`} C={C} /> : null}
                {f.bottleCount ? <StatRow label="Bottle feeds" value={`${f.bottleCount} · ${f.bottleMl} ml`} C={C} /> : null}
                {f.bottleCount ? <StatRow label="Bottle milk per day" value={`${Math.round(f.bottleMl / data.daysCounted)} ml`} C={C} /> : null}
                <StatRow label="Busiest day" value={`${day(f.busiest.date)} · ${f.busiest.feeds} feeds`} C={C} />
                {f.quietest ? <StatRow label="Quietest day" value={`${day(f.quietest.date)} · ${f.quietest.feeds} feeds`} C={C} /> : null}
              </>
            ) : <EmptyNote C={C}>{NONE}</EmptyNote>}
          </SummaryBlock>
        ) },
        { key: 'sleep', has: s.totalSecs > 0, node: (
          <SummaryBlock icon="moon" color={C.primary} bg={C.primaryLight} title="Sleep" C={C}>
            {s.totalSecs ? (
              <>
                <StatRow label="Average sleep a day" value={formatDuration(s.perDaySecs)} C={C} />
                <StatRow label="Longest sleep" value={formatDuration(s.longestSecs)} C={C} />
                <StatRow label="Naps" value={s.naps} C={C} />
                <StatRow label="Night sleeps" value={s.nights} C={C} />
                {s.wakeupsPerNight != null ? <StatRow label="Wakeups per night" value={one(s.wakeupsPerNight)} C={C} /> : null}
              </>
            ) : <EmptyNote C={C}>{NONE}</EmptyNote>}
          </SummaryBlock>
        ) },
        { key: 'diapers', has: d.total > 0, node: (
          <SummaryBlock icon="water" color={C.primary} bg={C.primaryLight} title="Diapers" C={C}>
            {d.total ? (
              <>
                <StatRow label="Total diapers" value={`${d.total} · ${one(d.perDay)} a day`} C={C} />
                <StatRow label="Wet (urine or both)" value={`${d.wet} · ${one(d.wet / data.daysCounted)} a day`} C={C} />
                <StatRow label="Stool (stool or both)" value={d.stool} C={C} />
                <StatRow label="Dry" value={d.dry} C={C} />
                {d.lowWetDays ? (
                  <StatRow label="Days with fewer than 6 wet diapers" value={d.lowWetDays} level="attention" C={C} />
                ) : null}
                {d.colourWarnings.map((w) => (
                  <StatRow key={w.label} label={`Warning colour: ${w.label}`} value={`${w.count}×`} level="urgent" C={C} />
                ))}
              </>
            ) : <EmptyNote C={C}>{NONE}</EmptyNote>}
          </SummaryBlock>
        ) },
        { key: 'medicine', has: data.medicine.length > 0, node: (
          <SummaryBlock icon="medical" color={C.primary} bg={C.primaryLight} title="Medicine" C={C}>
            {data.medicine.length ? data.medicine.map((m) => (
              <StatRow
                key={m.name}
                label={m.name}
                value={`${m.given} given${m.skipped ? ` · ${m.skipped} skipped` : ''}`}
                level={m.skipped ? 'attention' : undefined}
                C={C}
              />
            )) : <EmptyNote C={C}>{NONE}</EmptyNote>}
          </SummaryBlock>
        ) },
        { key: 'temperature', has: t.count > 0, node: (
          <SummaryBlock mci="thermometer" color={C.primary} bg={C.primaryLight} title="Temperature" C={C}>
            {t.count ? (
              <>
                <StatRow label="Readings" value={t.count} C={C} />
                <StatRow
                  label={`Highest · ${day(new Date(t.highest.time))}`}
                  value={`${t.highest.celsius.toFixed(1)} °C`}
                  level={t.highestLevel}
                  C={C}
                />
                <StatRow label="Days with fever (38 °C or more)" value={t.feverDays} level={t.feverDays ? 'urgent' : undefined} C={C} />
              </>
            ) : <EmptyNote C={C}>{NONE}</EmptyNote>}
          </SummaryBlock>
        ) },
        { key: 'breathing', has: b.count > 0, node: (
          <SummaryBlock mci="lungs" color={C.primary} bg={C.primaryLight} title="Breathing" C={C}>
            {b.count ? (
              <>
                <StatRow label="Checks" value={b.count} C={C} />
                <StatRow label="Needed attention" value={b.attention} level={b.attention ? 'attention' : undefined} C={C} />
                <StatRow label="Urgent" value={b.urgent} level={b.urgent ? 'urgent' : undefined} C={C} />
              </>
            ) : <EmptyNote C={C}>{NONE}</EmptyNote>}
          </SummaryBlock>
        ) },
        { key: 'skin', has: sk.count > 0, node: (
          <SummaryBlock mci="face-man-shimmer-outline" color={C.primary} bg={C.primaryLight} title="Skin & Jaundice" C={C}>
            {sk.count ? (
              <>
                <StatRow label="Checks" value={sk.count} C={C} />
                {sk.first ? <StatRow label="Yellowing at the start" value={sk.first} C={C} /> : null}
                {sk.last ? <StatRow label="Yellowing at the end" value={sk.last} C={C} /> : null}
                {sk.trend ? (
                  <StatRow
                    label="Trend"
                    value={sk.trend}
                    level={sk.trend === 'Getting worse' ? 'urgent' : undefined}
                    C={C}
                  />
                ) : null}
                {sk.attention || sk.urgent ? (
                  <StatRow
                    label="Checks needing attention or urgent"
                    value={sk.attention + sk.urgent}
                    level={sk.urgent ? 'urgent' : 'attention'}
                    C={C}
                  />
                ) : null}
              </>
            ) : <EmptyNote C={C}>{NONE}</EmptyNote>}
          </SummaryBlock>
        ) },
        { key: 'growth', has: g.count > 0, node: (
          <SummaryBlock icon="bar-chart" color={C.primary} bg={C.primaryLight} title="Growth" C={C}>
            {g.count ? (
              <>
                {g.firstWeight ? (
                  <StatRow label={`Weight · ${day(new Date(g.firstWeight.date))}`} value={`${g.firstWeight.value} ${g.firstWeight.unit}`} C={C} />
                ) : null}
                {g.lastWeight && !g.oneWeighIn ? (
                  <StatRow label={`Weight · ${day(new Date(g.lastWeight.date))}`} value={`${g.lastWeight.value} ${g.lastWeight.unit}`} C={C} />
                ) : null}
                {gainKg != null ? (
                  <StatRow
                    label={gainKg >= 0 ? 'Weight gained' : 'Weight lost'}
                    value={`${Math.round(Math.abs(gainKg) * 1000)} g`}
                    level={gainKg < 0 ? 'attention' : undefined}
                    C={C}
                  />
                ) : null}
                {g.firstHeight != null && g.lastHeight != null && g.lastHeight !== g.firstHeight ? (
                  <StatRow label="Height" value={`${g.firstHeight} → ${g.lastHeight} cm`} C={C} />
                ) : g.lastHeight != null ? (
                  <StatRow label="Height" value={`${g.lastHeight} cm`} C={C} />
                ) : null}
              </>
            ) : <EmptyNote C={C}>{NONE}</EmptyNote>}
          </SummaryBlock>
        ) },
        { key: 'vaccines', has: v.given.length > 0 || v.overdue > 0, node: (
          <SummaryBlock icon="shield-checkmark" color={C.primary} bg={C.primaryLight} title="Vaccines" C={C}>
            {v.given.map((x) => (
              <StatRow key={x.id} label={x.name} value={`Given ${day(new Date(x.completedDate))}`} C={C} />
            ))}
            {!v.given.length ? <EmptyNote C={C}>No vaccines given in these 30 days</EmptyNote> : null}
            <StatRow
              label="Overdue now"
              value={v.overdue}
              level={v.overdue ? 'urgent' : undefined}
              C={C}
            />
          </SummaryBlock>
        ) },
      ].filter((card) => !chart.card || card.key === chart.card)} />
    </>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: RADIUS.xxl, padding: SPACING.lg, marginBottom: SPACING.lg },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACING.sm },
  heroChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: RADIUS.full,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  heroChipText: { fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.bold, color: COLORS.white },
  heroBaby: { flexShrink: 1, fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.heavy, color: COLORS.white },
  overviewRow: {
    flexDirection: 'row', alignItems: 'center', marginTop: SPACING.md,
    backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: RADIUS.xl, paddingVertical: 14,
  },
  overviewPill: { flex: 1, alignItems: 'center', paddingHorizontal: 4, gap: 2 },
  overviewNum: { fontSize: fs(22), fontWeight: FONT_WEIGHT.heavy, color: COLORS.white, letterSpacing: -0.4 },
  overviewLabel: { fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.bold, color: COLORS.white },
  overviewAvg: { fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.medium, color: COLORS.white },
  heroDivider: { width: 1, height: 48, backgroundColor: 'rgba(255,255,255,0.3)' },
  heroNote: { marginTop: SPACING.sm, fontSize: FONT_SIZE.sm, color: COLORS.white, lineHeight: 19 },

  chartCard: { borderRadius: RADIUS.xl, borderWidth: 1, padding: SPACING.md, marginBottom: SPACING.md },
  chartTitle: { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.heavy, marginBottom: SPACING.sm },
  tabs: { flexDirection: 'row', borderRadius: RADIUS.full, padding: 4 },
  tab: { flex: 1, minHeight: 38, paddingVertical: 6, paddingHorizontal: 2, borderRadius: RADIUS.full, alignItems: 'center', justifyContent: 'center' },
  tabText: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.bold },
  chartMax: { fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.semibold, marginTop: SPACING.md, marginBottom: 8 },
  histRow: { flexDirection: 'row', gap: 6 },
  yAxis: { width: 28, height: 140, justifyContent: 'space-between', alignItems: 'flex-end', marginTop: -7, marginBottom: -7 },
  yText: { fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.medium },
  plot: { height: 140, borderLeftWidth: 1, borderBottomWidth: 1 },
  grid: { position: 'absolute', left: 0, right: 0, height: 1 },
  bars: { ...StyleSheet.absoluteFillObject, flexDirection: 'row', alignItems: 'flex-end' },
  barCol: { flex: 1, height: '100%', justifyContent: 'flex-end' },
  // Histogram look: bars touch, with a hairline between neighbours.
  bar: { width: '100%', borderRightWidth: StyleSheet.hairlineWidth, borderTopLeftRadius: 2, borderTopRightRadius: 2 },
  xAxis: { height: 22, marginTop: 4 },
  xText: { position: 'absolute', width: 40, marginLeft: -20, textAlign: 'center', fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.medium },
  chartHint: { fontSize: FONT_SIZE.xs, marginTop: SPACING.sm },
});
