import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

import GradientView from './GradientView';
import { useBabyStore } from '../store/useBabyStore';
import { COLORS, DARK_COLORS, GRADIENTS } from '../constants/colors';
import { FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING, SHADOW, fs } from '../constants/theme';

// Shared pieces for the health tracking screens (temperature, breathing, skin, milestones,
// health alerts), in the Cradlewell brand UI.

export function useTheme() {
  const darkMode = useBabyStore((s) => s.darkMode);
  return darkMode ? DARK_COLORS : COLORS;
}

export const LEVEL_STYLE = {
  normal: { icon: 'checkmark-circle', fg: COLORS.success, bg: COLORS.successLight, label: 'Normal' },
  attention: { icon: 'warning', fg: COLORS.warning, bg: COLORS.warningLight, label: 'Attention' },
  urgent: { icon: 'alert-circle', fg: COLORS.error, bg: COLORS.errorLight, label: 'Urgent' },
};

export function Screen({ title, subtitle, onBack, children }) {
  const C = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.container, { backgroundColor: C.background }]}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 40 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <TouchableOpacity
            onPress={onBack}
            style={[styles.roundBtn, { backgroundColor: C.card }, SHADOW.sm]}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="arrow-back" size={22} color={C.primary} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} style={[styles.title, { color: C.text }]}>{title}</Text>
            {subtitle ? <Text style={[styles.subtitle, { color: C.textSecondary }]}>{subtitle}</Text> : null}
          </View>
        </View>
        {children}
      </ScrollView>
    </View>
  );
}

// The one gradient card of a screen, carrying its live state.
export function Hero({ icon, mci, label, value, unit, note, children }) {
  return (
    <GradientView colors={GRADIENTS.brand} style={[styles.hero, SHADOW.md]}>
      <View style={styles.heroRow}>
        <View style={styles.heroIcon}>
          {mci
            ? <MaterialCommunityIcons name={mci} size={24} color={COLORS.white} />
            : <Ionicons name={icon} size={24} color={COLORS.white} />}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.heroLabel}>{label}</Text>
          <Text style={styles.heroValue} numberOfLines={1} adjustsFontSizeToFit>
            {value}{unit ? <Text style={styles.heroUnit}> {unit}</Text> : null}
          </Text>
          {note ? <Text style={styles.heroNote} numberOfLines={2}>{note}</Text> : null}
        </View>
      </View>
      {children}
    </GradientView>
  );
}

export function SectionTitle({ children }) {
  const C = useTheme();
  return <Text style={[styles.sectionTitle, { color: C.text }]}>{children}</Text>;
}

export function Card({ children, style }) {
  const C = useTheme();
  return <View style={[styles.card, { backgroundColor: C.card, borderColor: C.border }, SHADOW.sm, style]}>{children}</View>;
}

export function FieldLabel({ children }) {
  const C = useTheme();
  return <Text style={[styles.fieldLabel, { color: C.textSecondary }]}>{children}</Text>;
}

// A selectable chip: lavender fill and violet border with a check when selected.
export function Chip({ label, selected, onPress, multi }) {
  const C = useTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        styles.chip,
        selected
          ? { backgroundColor: C.primaryLight, borderColor: C.primary }
          : { backgroundColor: C.card, borderColor: C.border },
      ]}
      accessibilityRole={multi ? 'checkbox' : 'radio'}
      accessibilityState={multi ? { checked: !!selected } : { selected: !!selected }}
      accessibilityLabel={label}
    >
      {selected ? <Ionicons name="checkmark-circle" size={18} color={C.primary} /> : null}
      <Text style={[styles.chipText, { color: selected ? C.primary : C.text }]}>{label}</Text>
    </TouchableOpacity>
  );
}

export function ChipRow({ children }) {
  return <View style={styles.chipRow}>{children}</View>;
}

// Normal / attention / urgent note, with a reminder that it is guidance, not a diagnosis.
export function StatusNote({ status }) {
  if (!status) return null;
  const s = LEVEL_STYLE[status.level];
  return (
    <View style={[styles.note, { backgroundColor: s.bg }]} accessibilityLiveRegion="polite">
      <Ionicons name={s.icon} size={20} color={s.fg} />
      <Text style={[styles.noteText, { color: COLORS.text }]}>
        <Text style={{ fontWeight: FONT_WEIGHT.heavy, color: s.fg }}>{s.label}. </Text>{status.text}
      </Text>
    </View>
  );
}

export function PrimaryButton({ label, icon = 'checkmark-circle', onPress, disabled }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.85}
      style={[styles.btnWrap, disabled && { opacity: 0.45 }]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
    >
      <GradientView colors={GRADIENTS.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.btn, SHADOW.md]}>
        <Ionicons name={icon} size={20} color={COLORS.white} />
        <Text style={styles.btnText}>{label}</Text>
      </GradientView>
    </TouchableOpacity>
  );
}

export function HistoryRow({ icon, mci, title, sub, right, level }) {
  const C = useTheme();
  const s = level && level !== 'normal' ? LEVEL_STYLE[level] : null;
  return (
    <View style={[styles.row, { backgroundColor: C.card, borderColor: C.border }, SHADOW.sm]}>
      <View style={[styles.rowIcon, { backgroundColor: s ? s.bg : C.primaryLight }]}>
        {mci
          ? <MaterialCommunityIcons name={mci} size={20} color={s ? s.fg : C.primary} />
          : <Ionicons name={icon} size={20} color={s ? s.fg : C.primary} />}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowTitle, { color: C.text }]} numberOfLines={1}>{title}</Text>
        {sub ? <Text style={[styles.rowSub, { color: C.textSecondary }]} numberOfLines={2}>{sub}</Text> : null}
      </View>
      {right ? <Text style={[styles.rowRight, { color: C.textSecondary }]}>{right}</Text> : null}
    </View>
  );
}

export function Empty({ text }) {
  const C = useTheme();
  return <Text style={[styles.empty, { color: C.textSecondary }]}>{text}</Text>;
}

export function Disclaimer() {
  const C = useTheme();
  return (
    <Text style={[styles.disclaimer, { color: C.textSecondary }]}>
      General newborn guidance, not a diagnosis. When in doubt, contact the doctor.
    </Text>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: SPACING.lg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: SPACING.lg },
  roundBtn: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: FONT_SIZE.xxl, fontWeight: FONT_WEIGHT.heavy, letterSpacing: -0.6 },
  subtitle: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.medium, marginTop: 2 },

  hero: { borderRadius: RADIUS.xl, padding: SPACING.lg, marginBottom: SPACING.lg },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  heroIcon: {
    width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center', justifyContent: 'center',
  },
  heroLabel: { color: COLORS.white, fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.bold },
  heroValue: { color: COLORS.white, fontSize: fs(34), fontWeight: FONT_WEIGHT.heavy, letterSpacing: -0.8 },
  heroUnit: { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold },
  heroNote: { color: COLORS.white, fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.semibold, marginTop: 2 },

  sectionTitle: { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.heavy, marginTop: SPACING.sm, marginBottom: SPACING.sm + 2 },
  card: { borderRadius: RADIUS.xl, borderWidth: 1, padding: SPACING.md, gap: SPACING.md, marginBottom: SPACING.md },
  fieldLabel: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.bold },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44,
    paddingHorizontal: 14, borderRadius: RADIUS.full, borderWidth: 1.5,
  },
  chipText: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.semibold },

  note: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 12, borderRadius: RADIUS.md },
  noteText: { flex: 1, fontSize: FONT_SIZE.md, lineHeight: 21 },

  btnWrap: { marginTop: SPACING.xs },
  btn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    minHeight: 56, borderRadius: RADIUS.full,
  },
  btnText: { color: COLORS.white, fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.heavy },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14,
    borderRadius: RADIUS.lg, borderWidth: 1, marginBottom: SPACING.sm,
  },
  rowIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.bold },
  rowSub: { fontSize: FONT_SIZE.sm, marginTop: 2 },
  rowRight: { fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.semibold },

  empty: { fontSize: FONT_SIZE.md, textAlign: 'center', paddingVertical: SPACING.lg },
  disclaimer: { fontSize: FONT_SIZE.xs, textAlign: 'center', marginTop: SPACING.md, lineHeight: 17 },
});
