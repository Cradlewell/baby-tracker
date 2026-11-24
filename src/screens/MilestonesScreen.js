import React, { useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { useBabyStore } from '../store/useBabyStore';
import { useMilestoneStore, MILESTONES } from '../store/useHealthStores';
import { Screen, Hero, SectionTitle, Disclaimer, useTheme } from '../components/HealthUI';
import { parseDob, formatDateFull } from '../utils/formatters';
import { FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING, SHADOW } from '../constants/theme';

export default function MilestonesScreen({ navigation }) {
  const C = useTheme();
  const baby = useBabyStore((s) => s.getActiveBaby());
  const babyId = baby?.id;
  const logs = useMilestoneStore((s) => s.logs[babyId]) || [];
  const { load, addLog, removeLog } = useMilestoneStore.getState();

  useEffect(() => { if (babyId) load(babyId); }, [babyId]);

  const birth = parseDob(baby?.dob);
  const ageWeeks = birth ? Math.floor((Date.now() - birth.getTime()) / (7 * 86400000)) : null;
  const doneById = Object.fromEntries(logs.map((l) => [l.milestoneId, l]));
  const doneCount = MILESTONES.filter((m) => doneById[m.id]).length;

  const toggle = (m) => {
    const done = doneById[m.id];
    if (!done) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      addLog(babyId, { milestoneId: m.id, name: m.name });
      return;
    }
    Alert.alert(`Undo "${m.name}"?`, 'This removes the date it was reached.', [
      { text: 'Keep', style: 'cancel' },
      { text: 'Undo', style: 'destructive', onPress: () => removeLog(babyId, done.id) },
    ]);
  };

  // Group by where the baby is now: due around now first, then coming up, then later.
  const stateOf = (m) => {
    if (doneById[m.id]) return 'done';
    if (ageWeeks == null) return 'upcoming';
    if (ageWeeks > m.to) return 'late';
    if (ageWeeks >= m.from) return 'now';
    return 'upcoming';
  };

  const sections = [
    { key: 'now', title: 'Around now' },
    { key: 'late', title: 'Usually reached by now' },
    { key: 'upcoming', title: 'Coming up' },
    { key: 'done', title: 'Reached' },
  ];

  return (
    <Screen title="Milestones" subtitle="Track development" onBack={() => navigation.goBack()}>
      <Hero
        icon="flag-outline"
        label={`${baby?.name || 'Baby'}'s milestones`}
        value={`${doneCount} / ${MILESTONES.length}`}
        note={ageWeeks != null ? `${ageWeeks} weeks old · tap a milestone when it happens` : 'Add a date of birth to see what is due'}
      />

      {sections.map((sec) => {
        const items = MILESTONES.filter((m) => stateOf(m) === sec.key);
        if (!items.length) return null;
        return (
          <View key={sec.key}>
            <SectionTitle>{sec.title}</SectionTitle>
            {sec.key === 'late' ? (
              <Text style={[styles.hint, { color: C.textSecondary }]}>
                Every baby develops at their own pace. If several are still to come, mention it at the next check-up.
              </Text>
            ) : null}
            {items.map((m) => {
              const done = doneById[m.id];
              return (
                <TouchableOpacity
                  key={m.id}
                  onPress={() => toggle(m)}
                  style={[styles.row, { backgroundColor: C.card, borderColor: done ? C.primary : C.border }, SHADOW.sm]}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: !!done }}
                  accessibilityLabel={m.name}
                >
                  <View style={[styles.check, done ? { backgroundColor: C.primary } : { borderColor: C.border, borderWidth: 2 }]}>
                    {done ? <Ionicons name="checkmark" size={18} color="#FFFFFF" /> : null}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.name, { color: C.text }]}>{m.name}</Text>
                    <Text style={[styles.sub, { color: C.textSecondary }]}>
                      {done ? `Reached ${formatDateFull(done.time)}` : `Usually ${m.from}–${m.to} weeks`}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        );
      })}
      <Disclaimer />
    </Screen>
  );
}

const styles = StyleSheet.create({
  hint: { fontSize: FONT_SIZE.sm, marginTop: -4, marginBottom: SPACING.sm, lineHeight: 19 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64,
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: RADIUS.lg, borderWidth: 1.5, marginBottom: SPACING.sm,
  },
  check: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.bold },
  sub: { fontSize: FONT_SIZE.sm, marginTop: 2 },
});
