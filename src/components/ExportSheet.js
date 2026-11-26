import React, { useEffect, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, Pressable, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { COLORS } from '../constants/colors';
import { FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING, SHADOW } from '../constants/theme';
import { calcAge } from '../utils/formatters';
import { MonthGrid } from './MonthPicker';
import { DayGrid } from './CalendarModal';

const REPORTS = [
  { kind: 'day', icon: 'today-outline', title: 'Daily report', sub: 'Choose a date: everything logged that day, entry by entry' },
  { kind: 'month', icon: 'calendar-outline', title: 'Monthly report', sub: 'Choose a month: day-by-day table and charts' },
];

/**
 * Asks which baby (only when there is more than one), which report and then the date (daily
 * report) or the month (monthly report); then calls onChoose(babyId, kind, date or month).
 */
export default function ExportSheet({ visible, babies, activeBabyId, onChoose, onClose, C }) {
  const several = babies.length > 1;
  const [babyId, setBabyId] = useState(null);
  // The report whose date / month is being chosen ('day' or 'month'), or null.
  const [picking, setPicking] = useState(null);

  // Each time the sheet opens: with one baby skip straight to the report choice.
  useEffect(() => {
    if (visible) {
      setBabyId(several ? null : babies[0]?.id ?? activeBabyId);
      setPicking(null);
    }
  }, [visible]);

  const baby = babies.find((b) => b.id === babyId);
  const choosingBaby = several && !babyId;
  const goBack = () => (picking ? setPicking(null) : setBabyId(null));

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close">
        <Pressable style={[styles.sheet, { backgroundColor: C.card }, SHADOW.lg]}>
          <View style={styles.head}>
            {(several && !choosingBaby) || picking ? (
              <TouchableOpacity
                onPress={goBack}
                style={[styles.back, { backgroundColor: C.primaryLight }]}
                accessibilityRole="button"
                accessibilityLabel={picking ? 'Choose another report' : 'Choose another baby'}
              >
                <Ionicons name="chevron-back" size={20} color={C.primary} />
              </TouchableOpacity>
            ) : null}
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: C.text }]}>
                {choosingBaby ? 'Which baby?' : picking === 'day' ? 'Which date?' : picking ? 'Which month?' : 'Which report?'}
              </Text>
              <Text style={[styles.sub, { color: C.textSecondary }]}>
                {choosingBaby
                  ? 'Choose the baby for the report.'
                  : picking === 'day'
                    ? 'Everything logged on that day.'
                    : picking
                    ? 'From the first day with records to today, or to the last day with records.'
                    : `PDF report for ${baby?.name || 'this baby'}.`}
              </Text>
            </View>
          </View>

          {picking === 'day' ? (
            <DayGrid value={null} onSelect={(d) => onChoose(babyId, 'day', d)} C={C} />
          ) : picking ? (
            <MonthGrid value={null} onSelect={(m) => onChoose(babyId, 'month', m)} C={C} />
          ) : (
          <ScrollView style={{ maxHeight: 360 }} contentContainerStyle={{ gap: SPACING.sm }}>
            {choosingBaby
              ? babies.map((b) => (
                <TouchableOpacity
                  key={b.id}
                  onPress={() => setBabyId(b.id)}
                  style={[styles.option, { borderColor: C.border }]}
                  accessibilityRole="button"
                >
                  <View style={[styles.avatar, { backgroundColor: C.primaryLight }]}>
                    <Text style={[styles.initial, { color: C.primary }]}>{b.name?.[0]?.toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.optTitle, { color: C.text }]}>{b.name}</Text>
                    {b.dob ? <Text style={[styles.optSub, { color: C.textSecondary }]}>{calcAge(b.dob)}</Text> : null}
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={C.textSecondary} />
                </TouchableOpacity>
              ))
              : REPORTS.map((r) => (
                <TouchableOpacity
                  key={r.kind}
                  onPress={() => setPicking(r.kind)}
                  style={[styles.option, { borderColor: C.border }]}
                  accessibilityRole="button"
                >
                  <View style={[styles.avatar, { backgroundColor: C.primaryLight }]}>
                    <Ionicons name={r.icon} size={20} color={C.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.optTitle, { color: C.text }]}>{r.title}</Text>
                    <Text style={[styles.optSub, { color: C.textSecondary }]}>{r.sub}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={C.primary} />
                </TouchableOpacity>
              ))}
          </ScrollView>
          )}

          <TouchableOpacity
            onPress={onClose}
            style={[styles.cancel, { backgroundColor: C.primaryLight }]}
            accessibilityRole="button"
          >
            <Text style={[styles.cancelText, { color: C.primary }]}>Cancel</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(27,31,46,0.45)', justifyContent: 'center', padding: SPACING.lg },
  sheet: { borderRadius: RADIUS.xxl, padding: SPACING.lg, gap: SPACING.md, width: '100%', maxWidth: 460, alignSelf: 'center' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  back: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.heavy },
  sub: { fontSize: FONT_SIZE.sm, marginTop: 2 },
  option: {
    flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64,
    padding: 12, borderRadius: RADIUS.xl, borderWidth: 1,
  },
  avatar: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  initial: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.heavy },
  optTitle: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.bold },
  optSub: { fontSize: FONT_SIZE.sm, marginTop: 2 },
  cancel: { minHeight: 48, paddingVertical: 8, borderRadius: RADIUS.lg, alignItems: 'center', justifyContent: 'center' },
  cancelText: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.bold, color: COLORS.primary },
});
