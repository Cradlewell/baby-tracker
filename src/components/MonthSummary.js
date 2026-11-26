import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';

import { COLORS, GRADIENTS } from '../constants/colors';
import { FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING, SHADOW, fs } from '../constants/theme';
import GradientView from './GradientView';
import MonthReport from './MonthReport';
import { SummaryBlock, StatRow, EmptyNote, SortedBlocks } from './SummaryParts';
import { formatDuration } from '../utils/formatters';

const one = (n) => (Math.round(n * 10) / 10).toString();
const day = (d) => format(d, 'd MMM');
const NONE = 'No records in this month';

// Hero with the month's totals, then the monthly report (same sections as the daily report,
// one row / bar per day), then the other health checks.
export default function MonthSummary({ data, report, month, babyName, onPickDay, C, darkMode }) {
  const { feeding: f, sleep: s, diapers: d, temperature: t, breathing: b, skin: sk, growth: g, vaccines: v } = data;
  const partial = data.daysWithLogs < data.days.length;

  const gainKg = g.firstWeight && !g.oneWeighIn
    ? g.lastWeight.kg - g.firstWeight.kg : null;

  return (
    <>
      <GradientView colors={GRADIENTS.brand} style={[styles.hero, SHADOW.lg]}>
        <View style={styles.heroTop}>
          <View style={styles.heroChip}>
            <Ionicons name="calendar" size={13} color={COLORS.white} />
            <Text style={styles.heroChipText}>{format(month, 'MMMM yyyy')}</Text>
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

      <MonthReport data={report} C={C} darkMode={darkMode} onPickDay={onPickDay} overdue={v.overdue} />

      {/* Cards with records first, empty ones below */}
      <SortedBlocks blocks={[
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
      ]} />
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
});
