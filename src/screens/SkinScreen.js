import React, { useEffect, useState } from 'react';
import { TextInput, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';

import { useBabyStore } from '../store/useBabyStore';
import { useSkinStore, JAUNDICE_LEVELS, SKIN_SIGNS, skinStatus } from '../store/useHealthStores';
import {
  Screen, Hero, SectionTitle, Card, FieldLabel, Chip, ChipRow, StatusNote,
  PrimaryButton, HistoryRow, Empty, Disclaimer, useTheme,
} from '../components/HealthUI';
import { formatRelative, formatTime } from '../utils/formatters';
import { FONT_SIZE, RADIUS } from '../constants/theme';

const levelLabel = (v) => JAUNDICE_LEVELS.find((l) => l.value === v)?.label;

export default function SkinScreen({ navigation }) {
  const C = useTheme();
  const baby = useBabyStore((s) => s.getActiveBaby());
  const babyId = baby?.id;
  const logs = useSkinStore((s) => s.logs[babyId]) || [];
  const { load, addLog } = useSkinStore.getState();

  const [yellow, setYellow] = useState(null);
  const [signs, setSigns] = useState([]);
  const [notes, setNotes] = useState('');

  useEffect(() => { if (babyId) load(babyId); }, [babyId]);

  const status = yellow || signs.length ? skinStatus(yellow, signs) : null;
  const toggle = (v) => setSigns((s) => (s.includes(v) ? s.filter((x) => x !== v) : [...s, v]));
  const last = logs[0];
  const lastStatus = last ? skinStatus(last.yellow, last.signs || []) : null;

  const save = async () => {
    if (!yellow && !signs.length) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await addLog(babyId, { yellow, signs, notes: notes.trim() });
    setYellow(null);
    setSigns([]);
    setNotes('');
  };

  return (
    <Screen title="Skin & Jaundice" subtitle="Rash, yellowing, skin changes" onBack={() => navigation.goBack()}>
      <Hero
        mci="face-man-shimmer-outline"
        label="Last check"
        value={last ? (levelLabel(last.yellow) || 'Skin signs') : '--'}
        note={last ? `${formatRelative(last.time)}${lastStatus && lastStatus.level !== 'normal' ? ` · ${lastStatus.level === 'urgent' ? 'Urgent' : 'Attention'}` : ''}` : 'Check in daylight: press the skin and look at the colour'}
      />

      <Card>
        <FieldLabel>How far does yellowing reach?</FieldLabel>
        <ChipRow>
          {JAUNDICE_LEVELS.map((l) => (
            <Chip key={l.value} label={l.label} selected={yellow === l.value} onPress={() => setYellow(yellow === l.value ? null : l.value)} />
          ))}
        </ChipRow>

        <FieldLabel>Other skin changes</FieldLabel>
        <ChipRow>
          {SKIN_SIGNS.map((s) => (
            <Chip key={s.value} label={s.label} multi selected={signs.includes(s.value)} onPress={() => toggle(s.value)} />
          ))}
        </ChipRow>
        <StatusNote status={status} />

        <FieldLabel>Notes (optional)</FieldLabel>
        <TextInput
          style={[styles.notes, { color: C.text, borderColor: C.border, backgroundColor: C.background }]}
          value={notes}
          onChangeText={setNotes}
          placeholder="e.g. rash on cheeks, eyes slightly yellow"
          placeholderTextColor={C.textMuted}
          multiline
        />
        <PrimaryButton label="Save check" onPress={save} disabled={!yellow && !signs.length} />
      </Card>

      <SectionTitle>History</SectionTitle>
      {logs.length === 0 ? <Empty text="Skin checks you save appear here." /> : logs.slice(0, 20).map((l) => {
        const st = skinStatus(l.yellow, l.signs || []);
        const signLabels = (l.signs || []).map((v) => SKIN_SIGNS.find((s) => s.value === v)?.label).filter(Boolean);
        return (
          <HistoryRow
            key={l.id}
            mci="face-man-shimmer-outline"
            level={st?.level}
            title={levelLabel(l.yellow) || 'Skin changes'}
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
  notes: {
    minHeight: 72, borderWidth: 1.5, borderRadius: RADIUS.md, paddingHorizontal: 14,
    paddingTop: 12, textAlignVertical: 'top', fontSize: FONT_SIZE.md,
  },
});
