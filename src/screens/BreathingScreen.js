import React, { useEffect, useState } from 'react';
import { TextInput, StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import * as Haptics from 'expo-haptics';

import { useBabyStore } from '../store/useBabyStore';
import { useBreathingStore, BREATHING_SIGNS, breathingStatus } from '../store/useHealthStores';
import {
  Screen, Hero, SectionTitle, Card, FieldLabel, Chip, ChipRow, StatusNote,
  PrimaryButton, HistoryRow, Empty, Disclaimer, useTheme,
} from '../components/HealthUI';
import { formatRelative, formatTime } from '../utils/formatters';
import { FONT_SIZE, FONT_WEIGHT, RADIUS } from '../constants/theme';

// Count breaths for a full minute while the baby is calm or asleep.
const COUNT_SECONDS = 60;

export default function BreathingScreen({ navigation }) {
  const C = useTheme();
  const baby = useBabyStore((s) => s.getActiveBaby());
  const babyId = baby?.id;
  const logs = useBreathingStore((s) => s.logs[babyId]) || [];
  const { load, addLog } = useBreathingStore.getState();

  const [rate, setRate] = useState('');
  const [signs, setSigns] = useState([]);
  const [notes, setNotes] = useState('');
  const [countEnd, setCountEnd] = useState(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => { if (babyId) load(babyId); }, [babyId]);

  // One-minute counting timer: tap, count the chest rising, type the number.
  useEffect(() => {
    if (!countEnd) return undefined;
    const id = setInterval(() => {
      setNow(Date.now());
      if (Date.now() >= countEnd) {
        setCountEnd(null);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    }, 250);
    return () => clearInterval(id);
  }, [countEnd]);
  const secsLeft = countEnd ? Math.max(0, Math.ceil((countEnd - now) / 1000)) : 0;

  const num = parseInt(rate, 10);
  const validRate = Number.isFinite(num) && num >= 5 && num <= 150 ? num : null;
  const status = validRate != null || signs.length ? breathingStatus(validRate, signs) : null;
  const toggle = (v) => setSigns((s) => (s.includes(v) ? s.filter((x) => x !== v) : [...s, v]));
  const last = logs[0];

  const save = async () => {
    if (validRate == null && !signs.length) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await addLog(babyId, { rate: validRate, signs, notes: notes.trim() });
    setRate('');
    setSigns([]);
    setNotes('');
  };

  return (
    <Screen title="Breathing" subtitle="Respiratory rate & effort" onBack={() => navigation.goBack()}>
      <Hero
        mci="lungs"
        label="Last check"
        value={last ? (last.rate != null ? String(last.rate) : 'Signs') : '--'}
        unit={last?.rate != null ? 'breaths/min' : null}
        note={last ? formatRelative(last.time) : 'Normal for a newborn: 30 to 60 a minute'}
      >
        <TouchableOpacity
          onPress={() => { setCountEnd(Date.now() + COUNT_SECONDS * 1000); setNow(Date.now()); }}
          style={styles.timerBtn}
          accessibilityRole="button"
          accessibilityLabel={countEnd ? `Counting, ${secsLeft} seconds left` : 'Start one-minute count'}
        >
          <Text style={styles.timerText}>
            {countEnd ? `Counting… ${secsLeft}s left` : 'Start 1-minute count'}
          </Text>
        </TouchableOpacity>
      </Hero>

      <Card>
        <FieldLabel>Breaths in one minute</FieldLabel>
        <TextInput
          style={[styles.input, { color: C.text, borderColor: C.border, backgroundColor: C.background }]}
          value={rate}
          onChangeText={setRate}
          placeholder="e.g. 44"
          placeholderTextColor={C.textMuted}
          keyboardType="number-pad"
          accessibilityLabel="Breaths per minute"
        />
        {rate && validRate == null ? (
          <Text style={[styles.error, { color: C.textSecondary }]}>Enter a count between 5 and 150.</Text>
        ) : null}

        <FieldLabel>Any of these signs?</FieldLabel>
        <ChipRow>
          {BREATHING_SIGNS.map((s) => (
            <Chip key={s.value} label={s.label} multi selected={signs.includes(s.value)} onPress={() => toggle(s.value)} />
          ))}
        </ChipRow>
        <StatusNote status={status} />

        <FieldLabel>Notes (optional)</FieldLabel>
        <TextInput
          style={[styles.input, styles.notes, { color: C.text, borderColor: C.border, backgroundColor: C.background }]}
          value={notes}
          onChangeText={setNotes}
          placeholder="e.g. asleep, after feed"
          placeholderTextColor={C.textMuted}
          multiline
        />
        <PrimaryButton label="Save check" onPress={save} disabled={validRate == null && !signs.length} />
      </Card>

      <SectionTitle>History</SectionTitle>
      {logs.length === 0 ? <Empty text="Breathing checks you save appear here." /> : logs.slice(0, 20).map((l) => {
        const st = breathingStatus(l.rate, l.signs || []);
        const signLabels = (l.signs || []).map((v) => BREATHING_SIGNS.find((s) => s.value === v)?.label).filter(Boolean);
        return (
          <HistoryRow
            key={l.id}
            mci="lungs"
            level={st?.level}
            title={l.rate != null ? `${l.rate} breaths/min` : 'Signs noted'}
            sub={[signLabels.join(', '), formatTime(l.time), l.notes].filter(Boolean).join(' · ')}
            right={formatRelative(l.time)}
          />
        );
      })}
      <Disclaimer />
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: {
    minHeight: 56, borderWidth: 1.5, borderRadius: RADIUS.md,
    paddingHorizontal: 14, fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.semibold,
  },
  notes: { minHeight: 72, textAlignVertical: 'top', paddingTop: 12, fontSize: FONT_SIZE.md },
  error: { fontSize: FONT_SIZE.sm },
  timerBtn: {
    marginTop: 16, minHeight: 48, borderRadius: RADIUS.full, backgroundColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center',
  },
  timerText: { color: '#5F47FF', fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.heavy },
});
