import React, { useEffect, useState } from 'react';
import { TextInput, StyleSheet, View, Text } from 'react-native';
import * as Haptics from 'expo-haptics';

import { useBabyStore } from '../store/useBabyStore';
import { useTemperatureStore, TEMP_METHODS, temperatureStatus } from '../store/useHealthStores';
import {
  Screen, Hero, SectionTitle, Card, FieldLabel, Chip, ChipRow, StatusNote,
  PrimaryButton, HistoryRow, Empty, Disclaimer, useTheme,
} from '../components/HealthUI';
import { formatRelative, formatTime } from '../utils/formatters';
import { FONT_SIZE, FONT_WEIGHT, RADIUS } from '../constants/theme';

const toC = (value, unit) => (unit === 'F' ? ((value - 32) * 5) / 9 : value);

export default function TemperatureScreen({ navigation }) {
  const C = useTheme();
  const baby = useBabyStore((s) => s.getActiveBaby());
  const babyId = baby?.id;
  const logs = useTemperatureStore((s) => s.logs[babyId]) || [];
  const { load, addLog } = useTemperatureStore.getState();

  const [value, setValue] = useState('');
  const [unit, setUnit] = useState('C');
  const [method, setMethod] = useState('armpit');
  const [notes, setNotes] = useState('');

  useEffect(() => { if (babyId) load(babyId); }, [babyId]);

  const num = parseFloat(value.replace(',', '.'));
  const celsius = Number.isFinite(num) ? Math.round(toC(num, unit) * 10) / 10 : null;
  const plausible = celsius != null && celsius >= 30 && celsius <= 43;
  const status = plausible ? temperatureStatus(celsius) : null;
  const last = logs[0];

  const save = async () => {
    if (!plausible) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    addLog(babyId, { celsius, method, notes: notes.trim() });
    setValue('');
    setNotes('');
  };

  return (
    <Screen title="Temperature" subtitle="Track body temperature" onBack={() => navigation.goBack()}>
      <Hero
        mci="thermometer"
        label="Last reading"
        value={last ? last.celsius.toFixed(1) : '--'}
        unit={last ? '°C' : null}
        note={last ? `${formatRelative(last.time)} · ${TEMP_METHODS.find((m) => m.value === last.method)?.label || ''}` : 'No reading yet'}
      />

      <Card>
        <FieldLabel>Temperature</FieldLabel>
        <View style={styles.inputRow}>
          <TextInput
            style={[styles.input, { color: C.text, borderColor: C.border, backgroundColor: C.background }]}
            value={value}
            onChangeText={setValue}
            placeholder={unit === 'C' ? 'e.g. 36.8' : 'e.g. 98.2'}
            placeholderTextColor={C.textMuted}
            keyboardType="decimal-pad"
            accessibilityLabel="Temperature reading"
          />
          <ChipRow>
            <Chip label="°C" selected={unit === 'C'} onPress={() => setUnit('C')} />
            <Chip label="°F" selected={unit === 'F'} onPress={() => setUnit('F')} />
          </ChipRow>
        </View>
        {value && !plausible ? (
          <Text style={[styles.error, { color: C.textSecondary }]}>Enter a reading between 30 and 43 °C (86 and 109 °F).</Text>
        ) : null}
        <StatusNote status={status} />

        <FieldLabel>Measured</FieldLabel>
        <ChipRow>
          {TEMP_METHODS.map((m) => (
            <Chip key={m.value} label={m.label} selected={method === m.value} onPress={() => setMethod(m.value)} />
          ))}
        </ChipRow>

        <FieldLabel>Notes (optional)</FieldLabel>
        <TextInput
          style={[styles.input, styles.notes, { color: C.text, borderColor: C.border, backgroundColor: C.background }]}
          value={notes}
          onChangeText={setNotes}
          placeholder="e.g. after bath, fussy"
          placeholderTextColor={C.textMuted}
          multiline
          maxLength={1000}
        />
        <PrimaryButton label="Save reading" onPress={save} disabled={!plausible} />
      </Card>

      <SectionTitle>History</SectionTitle>
      {logs.length === 0 ? <Empty text="Readings you save appear here." /> : logs.slice(0, 20).map((l) => {
        const st = temperatureStatus(l.celsius);
        return (
          <HistoryRow
            key={l.id}
            mci="thermometer"
            level={st?.level}
            title={`${l.celsius.toFixed(1)} °C · ${st?.level === 'normal' ? 'Normal' : st?.level === 'urgent' ? 'Urgent' : 'Attention'}`}
            sub={`${TEMP_METHODS.find((m) => m.value === l.method)?.label || ''} · ${formatTime(l.time)}${l.notes ? ` · ${l.notes}` : ''}`}
            right={formatRelative(l.time)}
          />
        );
      })}
      <Disclaimer />
    </Screen>
  );
}

const styles = StyleSheet.create({
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  input: {
    flex: 1, minHeight: 56, borderWidth: 1.5, borderRadius: RADIUS.md,
    paddingHorizontal: 14, fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.semibold,
  },
  notes: { minHeight: 72, textAlignVertical: 'top', paddingTop: 12, fontSize: FONT_SIZE.md },
  error: { fontSize: FONT_SIZE.sm },
});
