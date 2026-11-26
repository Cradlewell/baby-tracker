import React, { useEffect, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  addDays, addMonths, endOfMonth, endOfWeek, format, isAfter, isSameDay, isSameMonth,
  startOfDay, startOfMonth, startOfWeek,
} from 'date-fns';

import { COLORS } from '../constants/colors';
import { FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING, SHADOW } from '../constants/theme';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** A month of days with month navigation. Future days can't be picked. onSelect(startOfDay). */
export function DayGrid({ value, onSelect, C }) {
  const [month, setMonth] = useState(startOfMonth(value || new Date()));
  useEffect(() => { setMonth(startOfMonth(value || new Date())); }, [value]);

  const today = startOfDay(new Date());
  const canGoNext = !isAfter(addMonths(month, 1), today);

  const days = [];
  const last = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
  for (let d = startOfWeek(month, { weekStartsOn: 1 }); !isAfter(d, last); d = addDays(d, 1)) days.push(d);

  return (
    <View>
      <View style={styles.monthRow}>
        <TouchableOpacity
          onPress={() => setMonth(addMonths(month, -1))}
          style={[styles.navBtn, { backgroundColor: C.primaryLight }]}
          accessibilityRole="button"
          accessibilityLabel="Previous month"
        >
          <Ionicons name="chevron-back" size={20} color={C.primary} />
        </TouchableOpacity>
        <Text style={[styles.monthText, { color: C.text }]}>{format(month, 'MMMM yyyy')}</Text>
        <TouchableOpacity
          onPress={() => canGoNext && setMonth(addMonths(month, 1))}
          disabled={!canGoNext}
          style={[styles.navBtn, { backgroundColor: C.primaryLight, opacity: canGoNext ? 1 : 0.4 }]}
          accessibilityRole="button"
          accessibilityLabel="Next month"
        >
          <Ionicons name="chevron-forward" size={20} color={C.primary} />
        </TouchableOpacity>
      </View>

      <View style={styles.grid}>
        {WEEKDAYS.map((w) => (
          <Text key={w} style={[styles.weekday, { color: C.textSecondary }]}>{w}</Text>
        ))}
        {days.map((d) => {
          const inMonth = isSameMonth(d, month);
          const future = isAfter(d, today);
          const selected = !!value && isSameDay(d, value);
          const isToday = isSameDay(d, today);
          return (
            <View key={d.toISOString()} style={styles.cell}>
              {inMonth ? (
                <TouchableOpacity
                  disabled={future}
                  onPress={() => onSelect(startOfDay(d))}
                  style={[
                    styles.day,
                    selected && { backgroundColor: C.primary },
                    !selected && isToday && { borderWidth: 1.5, borderColor: C.primary },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={format(d, 'EEEE d MMMM')}
                  accessibilityState={{ selected, disabled: future }}
                >
                  <Text
                    style={[
                      styles.dayText,
                      { color: selected ? COLORS.white : future ? C.textMuted : C.text },
                      future && { opacity: 0.5 },
                    ]}
                  >
                    {format(d, 'd')}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          );
        })}
      </View>
    </View>
  );
}

/** Month calendar in a sheet. Future days can't be picked. */
export default function CalendarModal({ visible, value, onSelect, onClose, C, title }) {
  const today = startOfDay(new Date());
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close calendar">
        <Pressable style={[styles.sheet, { backgroundColor: C.card }, SHADOW.lg]}>
          {title ? <Text style={[styles.title, { color: C.textSecondary }]}>{title}</Text> : null}
          {visible ? <DayGrid value={value} onSelect={onSelect} C={C} /> : null}

          <View style={styles.footer}>
            <TouchableOpacity
              onPress={() => onSelect(today)}
              style={[styles.footerBtn, { backgroundColor: C.primaryLight }]}
              accessibilityRole="button"
            >
              <Text style={[styles.footerText, { color: C.primary }]}>Today</Text>
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
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.md },
  navBtn: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  monthText: { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.heavy },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  weekday: { width: `${100 / 7}%`, textAlign: 'center', fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.semibold, marginBottom: 6 },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, padding: 2 },
  day: { flex: 1, borderRadius: RADIUS.full, alignItems: 'center', justifyContent: 'center' },
  dayText: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.bold },
  footer: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.md },
  footerBtn: { flex: 1, minHeight: 48, paddingVertical: 8, borderRadius: RADIUS.lg, alignItems: 'center', justifyContent: 'center' },
  footerText: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.bold },
});
