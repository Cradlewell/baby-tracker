import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

import { COLORS } from '../constants/colors';
import { FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING, SHADOW } from '../constants/theme';

/** A titled card used by the daily and 30-day summaries. */
export function SummaryBlock({ icon, mci, color, bg, title, children, C }) {
  return (
    <View style={[styles.block, { backgroundColor: C.card, borderColor: C.border }, SHADOW.sm]}>
      <View style={styles.blockHeader}>
        <View style={[styles.blockIcon, { backgroundColor: bg }]}>
          {mci
            ? <MaterialCommunityIcons name={mci} size={20} color={color} />
            : <Ionicons name={icon} size={20} color={color} />}
        </View>
        <Text style={[styles.blockTitle, { color: C.text }]}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

/** One label / value line. `level` colours the value for attention or urgent readings. */
export function StatRow({ label, value, level, C }) {
  const color = level === 'urgent' ? COLORS.error : level === 'attention' ? COLORS.warning : C.text;
  return (
    <View style={styles.statRow}>
      <Text style={[styles.statLabel, { color: C.textSecondary }]}>{label}</Text>
      <Text style={[styles.statVal, { color }]}>{value}</Text>
    </View>
  );
}

/** Renders cards that have records first and empty ones after, each group in its given order. */
export function SortedBlocks({ blocks }) {
  const ordered = [...blocks.filter((b) => b.has), ...blocks.filter((b) => !b.has)];
  return ordered.map((b) => (b.node ? <React.Fragment key={b.key}>{b.node}</React.Fragment> : null));
}

export function EmptyNote({ children, C }) {
  return <Text style={[styles.emptyNote, { color: C.textMuted }]}>{children}</Text>;
}

const styles = StyleSheet.create({
  block: { borderRadius: RADIUS.xl, borderWidth: 1, padding: SPACING.md, marginBottom: SPACING.md, gap: 12 },
  blockHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 2 },
  blockIcon: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  blockTitle: { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.heavy, letterSpacing: -0.3 },
  statRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: SPACING.sm },
  statLabel: { flex: 1, fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.medium },
  statVal: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.heavy, flexShrink: 1, textAlign: 'right' },
  emptyNote: { fontSize: FONT_SIZE.sm, textAlign: 'center', paddingVertical: 4 },
});
