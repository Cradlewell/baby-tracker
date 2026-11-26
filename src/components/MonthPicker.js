import React, { useEffect, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { addMonths, addYears, format, isAfter, isSameMonth, startOfMonth, startOfYear } from 'date-fns';

import { COLORS } from '../constants/colors';
import { FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING, SHADOW } from '../constants/theme';

/** A year with its 12 months; months after this one can't be picked. onSelect(startOfMonth). */
export function MonthGrid({ value, onSelect, C }) {
  const [year, setYear] = useState(startOfYear(value || new Date()));
  useEffect(() => { setYear(startOfYear(value || new Date())); }, [value]);
  const thisMonth = startOfMonth(new Date());
  const canGoNext = !isAfter(addYears(year, 1), thisMonth);

  return (
    <View>
      <View style={styles.yearRow}>
        <TouchableOpacity
          onPress={() => setYear(addYears(year, -1))}
          style={[styles.navBtn, { backgroundColor: C.primaryLight }]}
          accessibilityRole="button"
          accessibilityLabel="Previous year"
        >
          <Ionicons name="chevron-back" size={20} color={C.primary} />
        </TouchableOpacity>
        <Text style={[styles.yearText, { color: C.text }]}>{format(year, 'yyyy')}</Text>
        <TouchableOpacity
          onPress={() => canGoNext && setYear(addYears(year, 1))}
          disabled={!canGoNext}
          style={[styles.navBtn, { backgroundColor: C.primaryLight, opacity: canGoNext ? 1 : 0.4 }]}
          accessibilityRole="button"
          accessibilityLabel="Next year"
        >
          <Ionicons name="chevron-forward" size={20} color={C.primary} />
        </TouchableOpacity>
      </View>
      <View style={styles.grid}>
        {Array.from({ length: 12 }, (_, i) => addMonths(year, i)).map((m) => {
          const future = isAfter(m, thisMonth);
          const selected = value && isSameMonth(m, value);
          const current = isSameMonth(m, thisMonth);
          return (
            <View key={m.toISOString()} style={styles.cell}>
              <TouchableOpacity
                disabled={future}
                onPress={() => onSelect(startOfMonth(m))}
                style={[
                  styles.month,
                  { borderColor: C.border },
                  selected && { backgroundColor: C.primary, borderColor: C.primary },
                  !selected && current && { borderColor: C.primary, borderWidth: 1.5 },
                  future && { opacity: 0.4 },
                ]}
                accessibilityRole="button"
                accessibilityLabel={format(m, 'MMMM yyyy')}
                accessibilityState={{ selected: !!selected, disabled: future }}
              >
                <Text style={[styles.monthText, { color: selected ? COLORS.white : future ? C.textMuted : C.text }]}>
                  {format(m, 'MMM')}
                </Text>
              </TouchableOpacity>
            </View>
          );
        })}
      </View>
    </View>
  );
}

/** The month grid in a sheet, like CalendarModal. */
export default function MonthPickerModal({ visible, value, onSelect, onClose, C, title }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close month picker">
        <Pressable style={[styles.sheet, { backgroundColor: C.card }, SHADOW.lg]}>
          {title ? <Text style={[styles.title, { color: C.textSecondary }]}>{title}</Text> : null}
          <MonthGrid value={value} onSelect={onSelect} C={C} />
          <View style={styles.footer}>
            <TouchableOpacity
              onPress={() => onSelect(startOfMonth(new Date()))}
              style={[styles.footerBtn, { backgroundColor: C.primaryLight }]}
              accessibilityRole="button"
            >
              <Text style={[styles.footerText, { color: C.primary }]}>This month</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onClose}
              style={[styles.footerBtn, { backgroundColor: C.primary }]}
              accessibilityRole="button"
            >
              <Text style={[styles.footerText, { color: COLORS.white }]}>Close</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(27,31,46,0.45)', justifyContent: 'center', padding: SPACING.lg },
  sheet: { borderRadius: RADIUS.xxl, padding: SPACING.lg, width: '100%', maxWidth: 460, alignSelf: 'center' },
  title: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold, textAlign: 'center', marginBottom: SPACING.sm },
  yearRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.md },
  navBtn: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  yearText: { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.heavy },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: '33.333%', padding: 4 },
  month: { minHeight: 48, borderRadius: RADIUS.lg, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  monthText: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.bold },
  footer: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.md },
  footerBtn: { flex: 1, minHeight: 48, paddingVertical: 8, borderRadius: RADIUS.lg, alignItems: 'center', justifyContent: 'center' },
  footerText: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.bold },
});
