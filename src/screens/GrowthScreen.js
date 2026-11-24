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
import { COLORS, DARK_COLORS, GRADIENTS } from '../constants/colors';
import GradientView from '../components/GradientView';
import { FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING, SHADOW } from '../constants/theme';
import { formatDateFull, formatRelative, parsePositiveNumber } from '../utils/formatters';

// `series` is oldest → newest, every weight already converted to kg.
function MiniChart({ series, color, C }) {
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
      <Text style={[styles.chartRange, { color: C.textMuted }]}>
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

function AddMeasurementModal({ visible, onClose, onSave, C, defaultUnit }) {
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
      <View style={[styles.modal, { backgroundColor: C.background }]}>
        <View style={[styles.modalHandle, { backgroundColor: C.border }]} />
        <View style={styles.modalHeader}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.modalTitle, { color: C.text }]}>Add Measurement</Text>
          </View>
          <TouchableOpacity
            onPress={onClose}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            style={[styles.closeBtn, { backgroundColor: C.card, borderColor: C.border }, SHADOW.sm]}
          >
            <Ionicons name="close" size={22} color={C.textSecondary} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
          {[
            { label: 'Weight', value: weight, onChange: setWeight, placeholder: 'e.g. 4.2', suffix: unit },
            { label: 'Height / Length (cm)', value: height, onChange: setHeight, placeholder: 'e.g. 55', suffix: 'cm' },
            { label: 'Head Circumference (cm)', value: headCirc, onChange: setHeadCirc, placeholder: 'e.g. 38', suffix: 'cm' },
          ].map((field) => (
            <View key={field.label} style={styles.fieldWrap}>
              <Text style={[styles.fieldLabel, { color: C.textSecondary }]}>{field.label}</Text>
              <View style={styles.fieldRow}>
                <TextInput
                  style={[styles.fieldInput, { color: C.text, backgroundColor: C.card, borderColor: C.border }]}
                  placeholder={field.placeholder}
                  placeholderTextColor={C.textMuted}
                  value={field.value}
                  onChangeText={field.onChange}
                  keyboardType="decimal-pad"
                />
                <View style={[styles.suffixTile, { backgroundColor: C.growthLight }]}>
                  <Text style={[styles.fieldSuffix, { color: COLORS.growth }]}>{field.suffix}</Text>
                </View>
              </View>
            </View>
          ))}

          <View style={styles.unitRow}>
            <Text style={[styles.fieldLabel, { color: C.textSecondary }]}>Weight unit</Text>
            <View style={styles.unitToggle}>
              {['kg', 'lbs'].map((u) => (
                <TouchableOpacity
                  key={u}
                  onPress={() => setUnit(u)}
                  style={[
                    styles.unitBtn,
                    unit === u
                      ? { backgroundColor: C.growthLight, borderColor: COLORS.growth }
                      : { backgroundColor: C.card, borderColor: C.border },
                  ]}
                >
                  <Text style={[styles.unitText, { color: unit === u ? COLORS.growth : C.textSecondary }, unit === u && styles.unitTextActive]}>{u}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {error && <Text style={[styles.errorText, { color: COLORS.error }]}>{error}</Text>}

          <TouchableOpacity
            onPress={handleSave}
            activeOpacity={0.85}
            style={styles.saveWrap}
            accessibilityRole="button"
            accessibilityLabel="Save measurement"
          >
            <GradientView colors={GRADIENTS.growth} style={[styles.saveBtn, SHADOW.md]}>
              <Ionicons name="checkmark-circle" size={20} color={COLORS.white} />
              <Text style={styles.saveBtnText}>Save Measurement</Text>
            </GradientView>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  );
}

function HeroChip({ icon, value, label }) {
  return (
    <View style={styles.heroChip}>
      <Ionicons name={icon} size={16} color={COLORS.white} />
      <View style={{ flex: 1 }}>
        <Text style={styles.heroChipValue}>{value}</Text>
        <Text style={styles.heroChipLabel} numberOfLines={1}>{label}</Text>
      </View>
    </View>
  );
}

export default function GrowthScreen() {
  const { getActiveBaby, darkMode } = useBabyStore();
  const baby = getActiveBaby();
  const babyId = baby?.id;
  const C = darkMode ? DARK_COLORS : COLORS;
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
    <View style={[styles.container, { backgroundColor: C.background }]}>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 100 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.screenHeader}>
          <Text style={[styles.screenTitle, { color: C.text }]}>Growth</Text>
          <Text style={[styles.screenSub, { color: C.textSecondary }]}>
            {logs.length} measurement{logs.length !== 1 ? 's' : ''}
          </Text>
        </View>

        {/* Current stats */}
        {latest && (
          <GradientView colors={GRADIENTS.growth} bubbles style={[styles.hero, SHADOW.lg]}>
            {latestWeight ? (
              <View style={styles.heroTop}>
                <View style={styles.heroIcon}>
                  <Ionicons name="scale-outline" size={22} color={COLORS.white} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.heroLabel}>Current Weight</Text>
                  <Text style={styles.heroValue}>
                    {parseFloat(latestWeight.weight).toFixed(2)} {latestWeight.unit || 'kg'}
                  </Text>
                </View>
                {gain && (
                  <View style={styles.gainBadge}>
                    <Ionicons name={gainUp ? 'arrow-up' : 'arrow-down'} size={12} color={COLORS.white} />
                    <Text style={styles.gainText}>{gainText}</Text>
                  </View>
                )}
              </View>
            ) : (
              <View style={styles.heroTop}>
                <View style={styles.heroIcon}>
                  <Ionicons name="trending-up" size={22} color={COLORS.white} />
                </View>
                <Text style={[styles.heroLabel, { flex: 1 }]}>Latest measurement</Text>
              </View>
            )}

            {!!(latest.height || latest.headCirc) && (
              <View style={styles.heroChips}>
                {!!latest.height && (
                  <HeroChip icon="resize-outline" value={`${latest.height} cm`} label="Height / Length" />
                )}
                {!!latest.headCirc && (
                  <HeroChip icon="ellipse-outline" value={`${latest.headCirc} cm`} label="Head Circumference" />
                )}
              </View>
            )}

            {gain && (
              <Text style={styles.gainNote}>
                {gainText} since first weigh-in ({gain.daysDiff} days)
              </Text>
            )}
          </GradientView>
        )}

        {/* Mini chart */}
        {series.length >= 2 && (
          <View style={[styles.chartCard, { backgroundColor: C.card, borderColor: C.border }, SHADOW.sm]}>
            <View style={styles.chartHead}>
              <View style={[styles.tile, { backgroundColor: C.growthLight }]}>
                <Ionicons name="stats-chart" size={18} color={COLORS.growth} />
              </View>
              <Text style={[styles.chartTitle, { color: C.text }]}>Weight Trend</Text>
            </View>
            <MiniChart series={series} color={COLORS.growth} C={C} />
          </View>
        )}

        {/* Add button */}
        <TouchableOpacity
          onPress={() => setShowAdd(true)}
          activeOpacity={0.85}
          style={styles.addWrap}
          accessibilityRole="button"
          accessibilityLabel="Add measurement"
        >
          <GradientView colors={GRADIENTS.growth} style={[styles.addBtn, SHADOW.md]}>
            <Ionicons name="add-circle" size={22} color={COLORS.white} />
            <Text style={styles.addBtnText}>Add Measurement</Text>
          </GradientView>
        </TouchableOpacity>

        {/* History */}
        {logs.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { color: C.text }]}>History</Text>
            {logs.map((log) => (
              <View key={log.id} style={[styles.logItem, { backgroundColor: C.card, borderColor: C.border }, SHADOW.sm]}>
                <View style={[styles.tile, { backgroundColor: C.growthLight }]}>
                  <Ionicons name="trending-up" size={18} color={COLORS.growth} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.logTitle, { color: C.text }]}>
                    {log.weight ? `${log.weight} ${log.unit || 'kg'}` : ''}
                    {log.height ? ` · ${log.height}cm` : ''}
                    {log.headCirc ? ` · HC ${log.headCirc}cm` : ''}
                  </Text>
                  <Text style={[styles.logSub, { color: C.textSecondary }]}>
                    {formatDateFull(log.date || log.createdAt)}
                  </Text>
                </View>
              </View>
            ))}
          </>
        )}

        {logs.length === 0 && (
          <View style={[styles.emptyWrap, { backgroundColor: C.card, borderColor: C.border }, SHADOW.sm]}>
            <View style={[styles.emptyIcon, { backgroundColor: C.growthLight }]}>
              <Ionicons name="trending-up-outline" size={34} color={COLORS.growth} />
            </View>
            <Text style={[styles.emptyTitle, { color: C.text }]}>No measurements yet</Text>
            <Text style={[styles.emptySub, { color: C.textSecondary }]}>
              Tap "Add Measurement" to start tracking growth
            </Text>
          </View>
        )}
      </ScrollView>

      <AddMeasurementModal
        visible={showAdd}
        onClose={() => setShowAdd(false)}
        onSave={handleSave}
        C={C}
        defaultUnit={latestWeight?.unit || baby?.weightUnit || 'kg'}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: SPACING.lg },
  screenHeader: { marginBottom: SPACING.lg },
  screenTitle: { fontSize: FONT_SIZE.xxl, fontWeight: FONT_WEIGHT.heavy, letterSpacing: -0.8 },
  screenSub: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.medium, marginTop: 2 },
  sectionTitle: {
    fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.heavy, letterSpacing: -0.3,
    marginTop: SPACING.lg, marginBottom: SPACING.md,
  },

  // Hero
  hero: { borderRadius: RADIUS.xxl, padding: SPACING.lg, marginBottom: SPACING.lg },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  heroIcon: {
    width: 44, height: 44, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center', justifyContent: 'center',
  },
  heroLabel: { color: 'rgba(255,255,255,0.9)', fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold },
  heroValue: { color: COLORS.white, fontSize: FONT_SIZE.xxl, fontWeight: FONT_WEIGHT.heavy, letterSpacing: -0.6 },
  gainBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: RADIUS.full,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  gainText: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.heavy, color: COLORS.white },
  heroChips: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.md },
  heroChip: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 12, paddingHorizontal: 12,
    borderRadius: RADIUS.lg, backgroundColor: 'rgba(255,255,255,0.2)',
  },
  heroChipValue: { color: COLORS.white, fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.heavy },
  heroChipLabel: { color: 'rgba(255,255,255,0.85)', fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.semibold, marginTop: 1 },
  gainNote: {
    color: 'rgba(255,255,255,0.88)', fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.medium,
    textAlign: 'center', marginTop: SPACING.md,
  },

  // Chart
  chartCard: { borderRadius: RADIUS.xl, borderWidth: 1, padding: SPACING.md, marginBottom: SPACING.md },
  chartHead: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: SPACING.md },
  chartTitle: { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.heavy, letterSpacing: -0.3 },
  chartWrap: { width: '100%', minHeight: 76 },
  chartBars: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 60 },
  chartBar: { flex: 1, borderRadius: 6 },
  chartRange: { fontSize: FONT_SIZE.xs, marginTop: 6 },

  tile: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },

  addWrap: { marginBottom: SPACING.md },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    padding: 18, borderRadius: RADIUS.xl, gap: 8,
  },
  addBtnText: { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.heavy, color: COLORS.white },

  logItem: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    padding: 14, borderRadius: RADIUS.xl, borderWidth: 1, marginBottom: SPACING.sm,
  },
  logTitle: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.bold },
  logSub: { fontSize: FONT_SIZE.sm, marginTop: 2 },

  emptyWrap: {
    alignItems: 'center', paddingVertical: SPACING.xl, paddingHorizontal: SPACING.lg,
    gap: SPACING.sm, borderRadius: RADIUS.xl, borderWidth: 1, marginTop: SPACING.md,
  },
  emptyIcon: {
    width: 72, height: 72, borderRadius: 24, marginBottom: SPACING.sm,
    alignItems: 'center', justifyContent: 'center',
  },
  emptyTitle: { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.heavy, letterSpacing: -0.3 },
  emptySub: { fontSize: FONT_SIZE.md, textAlign: 'center' },

  // Modal
  modal: { flex: 1, paddingHorizontal: SPACING.lg },
  modalHandle: { width: 40, height: 5, borderRadius: 3, alignSelf: 'center', marginTop: 12, marginBottom: 8 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: SPACING.md },
  modalTitle: { fontSize: FONT_SIZE.xxl, fontWeight: FONT_WEIGHT.heavy, letterSpacing: -0.8 },
  closeBtn: {
    width: 42, height: 42, borderRadius: 14, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  modalContent: { paddingBottom: 40, gap: SPACING.md },
  fieldWrap: { gap: 8 },
  fieldLabel: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.bold, letterSpacing: 0.2 },
  fieldRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  fieldInput: {
    flex: 1, height: 54, borderRadius: RADIUS.lg, borderWidth: 1.5,
    paddingHorizontal: SPACING.md, fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.semibold,
  },
  suffixTile: {
    width: 54, height: 54, borderRadius: RADIUS.lg,
    alignItems: 'center', justifyContent: 'center',
  },
  fieldSuffix: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.heavy },
  unitRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  unitToggle: { flexDirection: 'row', gap: SPACING.sm },
  unitBtn: { paddingHorizontal: 22, paddingVertical: 11, borderRadius: RADIUS.md, borderWidth: 1.5 },
  unitText: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.medium },
  unitTextActive: { fontWeight: FONT_WEIGHT.heavy },
  errorText: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold, marginBottom: 8 },
  saveWrap: { marginTop: SPACING.md },
  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    padding: 18, borderRadius: RADIUS.xl, gap: 8,
  },
  saveBtnText: { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.heavy, color: COLORS.white },
});
