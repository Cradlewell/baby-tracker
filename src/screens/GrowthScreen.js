import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  TextInput, Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { useBabyStore } from '../store/useBabyStore';
import { useGrowthStore } from '../store/useGrowthStore';
import { COLORS } from '../constants/colors';
import { FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING, fs } from '../constants/theme';
import { formatDateFull, formatRelative, parsePositiveNumber } from '../utils/formatters';

// Local palette for this screen, taken from the user's approved screenshot.
const SHOT_LIGHT = { blue: '#006BFD', blueText: '#0058D4', tile: '#DAE9FE', hero: '#EBF3FE', card: '#EEF4FE', surface: '#FFFFFF', text: '#032049', textSecondary: '#5A6690', border: '#E1EAFB', background: '#FBFBFE' };
const SHOT_DARK = { blue: '#006BFD', blueText: '#7FB0FF', tile: '#1C2D52', hero: '#16223D', card: '#131D33', surface: '#1A2540', text: '#EEF3FF', textSecondary: '#A9B6D6', border: '#26324F', background: '#0B1220' };

// `series` is oldest → newest, every weight already converted to kg.
function MiniChart({ series, color, S }) {
  const recent = series.slice(-8); // the 8 most recent weigh-ins, left = oldest
  if (recent.length < 2) return null;
  const values = recent.map((p) => p.kg);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  return (
    <View style={styles.chartWrap}>
      <View style={styles.chartBars}>
        {values.map((v, i) => (
          <View
            key={recent[i].id}
            style={[styles.chartBar, { height: ((v - min) / range) * 48 + 4, backgroundColor: color, opacity: 0.6 + (i / values.length) * 0.4 }]}
          />
        ))}
      </View>
      <Text style={[styles.chartRange, { color: S.textSecondary }]}>
        {formatDateFull(recent[0].date)} → {formatDateFull(recent[recent.length - 1].date)}
      </Text>
    </View>
  );
}

// Sensible limits for a baby/toddler; anything outside is almost certainly a typo.
const LIMITS = {
  kg: [0.3, 40],
  lbs: [0.7, 90],
  height: [20, 150],
  headCirc: [20, 60],
};

function AddMeasurementModal({ visible, onClose, onSave, S, defaultUnit }) {
  const [weight, setWeight] = useState('');
  const [height, setHeight] = useState('');
  const [headCirc, setHeadCirc] = useState('');
  const [unit, setUnit] = useState(defaultUnit || 'kg');
  const [error, setError] = useState(null);

  const check = (text, [lo, hi], label) => {
    if (!text.trim()) return { value: null };
    const n = parsePositiveNumber(text);
    if (!n || n < lo || n > hi) return { error: `${label} should be between ${lo} and ${hi}` };
    return { value: n };
  };

  const handleSave = () => {
    const w = check(weight, LIMITS[unit], `Weight (${unit})`);
    const h = check(height, LIMITS.height, 'Height (cm)');
    const hc = check(headCirc, LIMITS.headCirc, 'Head circumference (cm)');
    const firstError = w.error || h.error || hc.error;
    if (firstError) return setError(firstError);
    if (!w.value && !h.value && !hc.value) return setError('Enter at least one measurement');
    setError(null);
    onSave({ weight: w.value, height: h.value, headCirc: hc.value, unit });
    setWeight(''); setHeight(''); setHeadCirc('');
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.modal, { backgroundColor: S.background }]}>
        <View style={[styles.modalHandle, { backgroundColor: S.border }]} />
        <View style={styles.modalHeader}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.modalTitle, { color: S.text }]}>Add Measurement</Text>
          </View>
          <TouchableOpacity
            onPress={onClose}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={[styles.headerBtn, { backgroundColor: S.tile }]}
          >
            <Ionicons name="close" size={24} color={S.text} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
          {[
            { label: 'Weight', value: weight, onChange: setWeight, placeholder: 'e.g. 4.2', suffix: unit },
            { label: 'Height / Length (cm)', value: height, onChange: setHeight, placeholder: 'e.g. 55', suffix: 'cm' },
            { label: 'Head Circumference (cm)', value: headCirc, onChange: setHeadCirc, placeholder: 'e.g. 38', suffix: 'cm' },
          ].map((field) => (
            <View key={field.label} style={styles.fieldWrap}>
              <Text style={[styles.fieldLabel, { color: S.textSecondary }]}>{field.label}</Text>
              <View style={styles.fieldRow}>
                <TextInput
                  style={[styles.fieldInput, { color: S.text, backgroundColor: S.surface, borderColor: S.border }]}
                  placeholder={field.placeholder}
                  placeholderTextColor={S.textSecondary}
                  value={field.value}
                  onChangeText={field.onChange}
                  keyboardType="decimal-pad"
                />
                <View style={[styles.suffixTile, { backgroundColor: S.tile }]}>
                  <Text style={[styles.fieldSuffix, { color: S.text }]}>{field.suffix}</Text>
                </View>
              </View>
            </View>
          ))}

          <View style={styles.unitRow}>
            <Text style={[styles.fieldLabel, { color: S.textSecondary }]}>Weight unit</Text>
            <View style={styles.unitToggle}>
              {['kg', 'lbs'].map((u) => (
                <TouchableOpacity
                  key={u}
                  onPress={() => setUnit(u)}
                  style={[
                    styles.unitBtn,
                    unit === u
                      ? { backgroundColor: S.tile, borderColor: S.blue, borderWidth: 1.5 }
                      : { backgroundColor: S.surface, borderColor: S.border },
                  ]}
                >
                  {unit === u ? <Ionicons name="checkmark-circle" size={18} color={S.blue} /> : null}
                  <Text style={[styles.unitText, { color: unit === u ? S.blueText : S.text }, unit === u && styles.unitTextActive]}>{u}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {error && <Text style={[styles.errorText, { color: COLORS.error }]}>{error}</Text>}

          <TouchableOpacity
            onPress={handleSave}
            activeOpacity={0.85}
            style={[styles.saveWrap, styles.saveBtn, { backgroundColor: S.blue }]}
            accessibilityRole="button"
            accessibilityLabel="Save measurement"
          >
            <Ionicons name="checkmark-circle-outline" size={24} color={COLORS.white} />
            <Text style={styles.saveBtnText}>Save Measurement</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  );
}

function HeroChip({ icon, value, label, S }) {
  return (
    <View style={[styles.heroChip, { backgroundColor: S.surface, borderColor: S.border }]}>
      <Ionicons name={icon} size={22} color={S.blue} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.heroChipValue, { color: S.text }]}>{value}</Text>
        <Text style={[styles.heroChipLabel, { color: S.textSecondary }]} numberOfLines={1}>{label}</Text>
      </View>
    </View>
  );
}

export default function GrowthScreen({ navigation }) {
  const { getActiveBaby, darkMode } = useBabyStore();
  const baby = getActiveBaby();
  const babyId = baby?.id;
  const S = darkMode ? SHOT_DARK : SHOT_LIGHT;
  const insets = useSafeAreaInsets();

  const { load, addEntry, getLogs, getLatest, getWeightGain, getWeightSeriesKg } = useGrowthStore();
  const logs = getLogs(babyId);
  const latest = getLatest(babyId);
  // The newest entry may only have height, so take the newest entry that has a weight.
  const latestWeight = logs.find((l) => l.weight);
  const gain = getWeightGain(babyId);
  const series = getWeightSeriesKg(babyId);
  const gainUp = !gain || parseFloat(gain.gain) >= 0;
  const gainText = gain ? `${parseFloat(gain.gain) >= 0 ? '+' : ''}${gain.gain} ${gain.unit}` : null;
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => {
    if (babyId) load(babyId);
  }, [babyId]);

  const handleSave = async (data) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await addEntry(babyId, data);
    setShowAdd(false);
  };

  return (
    <View style={[styles.container, { backgroundColor: S.background }]}>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 100 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.screenHeader, styles.headerRow]}>
          {navigation?.canGoBack() ? (
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              style={[styles.headerBtn, { backgroundColor: S.tile }]}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <Ionicons name="arrow-back" size={22} color={S.blue} />
            </TouchableOpacity>
          ) : null}
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} style={[styles.screenTitle, { color: S.text }]}>Growth</Text>
            <Text style={[styles.screenSub, { color: S.textSecondary }]}>
              {logs.length} measurement{logs.length !== 1 ? 's' : ''}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => navigation.navigate('Settings')}
            style={[styles.headerBtn, { backgroundColor: S.tile }]}
            accessibilityRole="button"
            accessibilityLabel="Settings"
          >
            <Ionicons name="settings-outline" size={24} color={S.blue} />
          </TouchableOpacity>
        </View>

        {/* Current stats */}
        {latest && (
          <View style={[styles.hero, { backgroundColor: S.hero }]}>
            {latestWeight ? (
              <View style={styles.heroTop}>
                <View style={[styles.heroIcon, { backgroundColor: S.tile }]}>
                  <Ionicons name="scale-outline" size={26} color={S.blue} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.heroLabel, { color: S.textSecondary }]}>Current Weight</Text>
                  <Text style={[styles.heroValue, { color: S.text }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                    {parseFloat(latestWeight.weight).toFixed(2)} {latestWeight.unit || 'kg'}
                  </Text>
                </View>
                {gain && (
                  <View style={[styles.gainBadge, { backgroundColor: S.surface, borderColor: S.border }]}>
                    <Ionicons name={gainUp ? 'arrow-up' : 'arrow-down'} size={14} color={S.blue} />
                    <Text style={[styles.gainText, { color: S.text }]}>{gainText}</Text>
                  </View>
                )}
              </View>
            ) : (
              <View style={styles.heroTop}>
                <View style={[styles.heroIcon, { backgroundColor: S.tile }]}>
                  <Ionicons name="trending-up-outline" size={26} color={S.blue} />
                </View>
                <Text style={[styles.heroLabel, { flex: 1, color: S.text }]}>Latest measurement</Text>
              </View>
            )}

            {!!(latest.height || latest.headCirc) && (
              <View style={styles.heroChips}>
                {!!latest.height && (
                  <HeroChip icon="resize-outline" value={`${latest.height} cm`} label="Height / Length" S={S} />
                )}
                {!!latest.headCirc && (
                  <HeroChip icon="ellipse-outline" value={`${latest.headCirc} cm`} label="Head Circumference" S={S} />
                )}
              </View>
            )}

            {gain && (
              <Text style={[styles.gainNote, { color: S.textSecondary }]}>
                {gainText} since first weigh-in ({gain.daysDiff} days)
              </Text>
            )}
          </View>
        )}

        {/* Mini chart */}
        {series.length >= 2 && (
          <View style={[styles.chartCard, { backgroundColor: S.card }]}>
            <View style={styles.chartHead}>
              <View style={[styles.tile, { backgroundColor: S.surface, borderColor: S.border }]}>
                <Ionicons name="stats-chart-outline" size={22} color={S.blue} />
              </View>
              <Text style={[styles.chartTitle, { color: S.text }]}>Weight Trend</Text>
            </View>
            <MiniChart series={series} color={S.blue} S={S} />
          </View>
        )}

        {/* Add button */}
        <TouchableOpacity
          onPress={() => setShowAdd(true)}
          activeOpacity={0.85}
          style={[styles.addWrap, styles.addBtn, { backgroundColor: S.blue }]}
          accessibilityRole="button"
          accessibilityLabel="Add measurement"
        >
          <Ionicons name="add-circle-outline" size={24} color={COLORS.white} />
          <Text style={styles.addBtnText}>Add Measurement</Text>
        </TouchableOpacity>

        {/* History */}
        {logs.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { color: S.text }]}>History</Text>
            {logs.map((log) => (
              <View key={log.id} style={[styles.logItem, { backgroundColor: S.card }]}>
                <View style={[styles.tile, { backgroundColor: S.surface, borderColor: S.border }]}>
                  <Ionicons name="trending-up-outline" size={24} color={S.text} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.logTitle, { color: S.text }]}>
                    {log.weight ? `${log.weight} ${log.unit || 'kg'}` : ''}
                    {log.height ? ` · ${log.height}cm` : ''}
                    {log.headCirc ? ` · HC ${log.headCirc}cm` : ''}
                  </Text>
                  <Text style={[styles.logSub, { color: S.text }]}>
                    {formatDateFull(log.date || log.createdAt)}
                  </Text>
                </View>
              </View>
            ))}
          </>
        )}

        {logs.length === 0 && (
          <View style={[styles.emptyWrap, { backgroundColor: S.hero }]}>
            <View style={[styles.emptyIcon, { backgroundColor: S.tile }]}>
              <Ionicons name="trending-up-outline" size={34} color={S.blue} />
            </View>
            <Text style={[styles.emptyTitle, { color: S.text }]}>No measurements yet</Text>
            <Text style={[styles.emptySub, { color: S.textSecondary }]}>
              Tap "Add Measurement" to start tracking growth
            </Text>
          </View>
        )}
      </ScrollView>

      <AddMeasurementModal
        visible={showAdd}
        onClose={() => setShowAdd(false)}
        onSave={handleSave}
        S={S}
        defaultUnit={latestWeight?.unit || baby?.weightUnit || 'kg'}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: SPACING.lg },
  screenHeader: { marginBottom: SPACING.lg },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  headerBtn: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  screenTitle: { fontSize: fs(28), fontWeight: FONT_WEIGHT.heavy, letterSpacing: -0.6 },
  screenSub: { fontSize: fs(15), fontWeight: FONT_WEIGHT.medium, marginTop: 2 },
  sectionTitle: {
    fontSize: fs(22), fontWeight: FONT_WEIGHT.heavy, letterSpacing: -0.3,
    marginTop: SPACING.lg, marginBottom: 12,
  },

  // Hero
  hero: { borderRadius: 28, padding: 20, marginBottom: SPACING.lg },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  heroIcon: {
    width: 56, height: 56, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  heroLabel: { fontSize: fs(15), fontWeight: FONT_WEIGHT.semibold },
  heroValue: { fontSize: fs(28), fontWeight: FONT_WEIGHT.heavy, letterSpacing: -0.6 },
  gainBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: RADIUS.full,
  },
  gainText: { fontSize: fs(14), fontWeight: FONT_WEIGHT.heavy },
  heroChips: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.md },
  heroChip: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 12, paddingHorizontal: 12,
    borderRadius: 20, borderWidth: 1,
  },
  heroChipValue: { fontSize: fs(17), fontWeight: FONT_WEIGHT.heavy },
  heroChipLabel: { fontSize: fs(13), fontWeight: FONT_WEIGHT.semibold, marginTop: 1 },
  gainNote: {
    fontSize: fs(15), fontWeight: FONT_WEIGHT.medium,
    textAlign: 'center', marginTop: SPACING.md,
  },

  // Chart
  chartCard: { borderRadius: 24, padding: 20, marginBottom: SPACING.md },
  chartHead: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: SPACING.md },
  chartTitle: { fontSize: fs(22), fontWeight: FONT_WEIGHT.heavy, letterSpacing: -0.3 },
  chartWrap: { width: '100%', minHeight: 76 },
  chartBars: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 60 },
  chartBar: { flex: 1, borderRadius: 6 },
  chartRange: { fontSize: fs(13), marginTop: 6 },

  tile: { width: 48, height: 48, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },

  addWrap: { marginBottom: SPACING.md },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    minHeight: 56, paddingHorizontal: SPACING.lg, borderRadius: RADIUS.full, gap: 10,
  },
  addBtnText: { fontSize: fs(18), fontWeight: FONT_WEIGHT.heavy, color: COLORS.white, letterSpacing: -0.2 },

  logItem: {
    flexDirection: 'row', alignItems: 'center', gap: 16,
    padding: 16, borderRadius: 20, marginBottom: 10,
  },
  logTitle: { fontSize: fs(17), fontWeight: FONT_WEIGHT.bold },
  logSub: { fontSize: fs(15), marginTop: 2 },

  emptyWrap: {
    alignItems: 'center', paddingVertical: SPACING.xl, paddingHorizontal: SPACING.lg,
    gap: SPACING.sm, borderRadius: 28, marginTop: SPACING.md,
  },
  emptyIcon: {
    width: 72, height: 72, borderRadius: 24, marginBottom: SPACING.sm,
    alignItems: 'center', justifyContent: 'center',
  },
  emptyTitle: { fontSize: fs(22), fontWeight: FONT_WEIGHT.heavy, letterSpacing: -0.3 },
  emptySub: { fontSize: fs(15), textAlign: 'center' },

  // Modal
  modal: { flex: 1, paddingHorizontal: SPACING.lg },
  modalHandle: { width: 40, height: 5, borderRadius: 3, alignSelf: 'center', marginTop: 12, marginBottom: 8 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: SPACING.md },
  modalTitle: { fontSize: fs(28), fontWeight: FONT_WEIGHT.heavy, letterSpacing: -0.6 },
  modalContent: { paddingBottom: 40, gap: SPACING.md },
  fieldWrap: { gap: 8 },
  fieldLabel: { fontSize: fs(15), fontWeight: FONT_WEIGHT.bold, letterSpacing: 0.2 },
  fieldRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  fieldInput: {
    flex: 1, minHeight: 56, borderRadius: 16, borderWidth: 1.5,
    paddingHorizontal: SPACING.md, fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.semibold,
  },
  suffixTile: {
    width: 56, height: 56, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  fieldSuffix: { fontSize: fs(15), fontWeight: FONT_WEIGHT.heavy },
  unitRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  unitToggle: { flexDirection: 'row', gap: SPACING.sm },
  unitBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 20, minHeight: 48, borderRadius: RADIUS.full, borderWidth: 1,
  },
  unitText: { fontSize: fs(16), fontWeight: FONT_WEIGHT.medium },
  unitTextActive: { fontWeight: FONT_WEIGHT.heavy },
  errorText: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold, marginBottom: 8 },
  saveWrap: { marginTop: SPACING.md },
  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    minHeight: 56, paddingHorizontal: SPACING.lg, borderRadius: RADIUS.full, gap: 10,
  },
  saveBtnText: { fontSize: fs(18), fontWeight: FONT_WEIGHT.heavy, color: COLORS.white, letterSpacing: -0.2 },
});
