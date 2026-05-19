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
import { COLORS, DARK_COLORS } from '../constants/colors';
import { FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING, SHADOW } from '../constants/theme';
import { formatDateFull, formatRelative } from '../utils/formatters';

function MiniChart({ data, color }) {
  if (!data || data.length < 2) return null;
  const values = data.map((d) => parseFloat(d.weight) || 0).filter((v) => v > 0);
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const W = 200, H = 60;

  const points = values.slice(-8).map((v, i, arr) => ({
    x: (i / Math.max(arr.length - 1, 1)) * W,
    y: H - ((v - min) / range) * (H - 10) - 5,
  }));

  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  return (
    <View style={{ width: W, height: H }}>
      {/* Simplified chart using View bars */}
      <View style={styles.chartBars}>
        {values.slice(-8).map((v, i) => {
          const h = ((v - min) / range) * 48 + 4;
          return (
            <View
              key={i}
              style={[styles.chartBar, { height: h, backgroundColor: color, opacity: 0.6 + (i / values.length) * 0.4 }]}
            />
          );
        })}
      </View>
    </View>
  );
}

function AddMeasurementModal({ visible, onClose, onSave, C }) {
  const [weight, setWeight] = useState('');
  const [height, setHeight] = useState('');
  const [headCirc, setHeadCirc] = useState('');
  const [unit, setUnit] = useState('kg');

  const handleSave = () => {
    if (!weight && !height && !headCirc) return;
    onSave({ weight, height, headCirc, unit });
    setWeight(''); setHeight(''); setHeadCirc('');
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.modal, { backgroundColor: C.background }]}>
        <View style={styles.modalHandle} />
        <View style={styles.modalHeader}>
          <Text style={[styles.modalTitle, { color: C.text }]}>Add Measurement</Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="close" size={24} color={C.textSecondary} />
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
                  placeholderTextColor={COLORS.textMuted}
                  value={field.value}
                  onChangeText={field.onChange}
                  keyboardType="decimal-pad"
                />
                <Text style={[styles.fieldSuffix, { color: C.textSecondary }]}>{field.suffix}</Text>
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
                  style={[styles.unitBtn, unit === u && styles.unitBtnActive]}
                >
                  <Text style={[styles.unitText, unit === u && styles.unitTextActive]}>{u}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <TouchableOpacity
            onPress={handleSave}
            style={[styles.saveBtn, { backgroundColor: COLORS.growth }]}
            accessibilityRole="button"
            accessibilityLabel="Save measurement"
          >
            <Ionicons name="checkmark-circle" size={20} color={COLORS.white} />
            <Text style={styles.saveBtnText}>Save Measurement</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  );
}

export default function GrowthScreen() {
  const { getActiveBaby, darkMode } = useBabyStore();
  const baby = getActiveBaby();
  const babyId = baby?.id;
  const C = darkMode ? DARK_COLORS : COLORS;
  const insets = useSafeAreaInsets();

  const { load, addEntry, getLogs, getLatest, getWeightGain } = useGrowthStore();
  const logs = getLogs(babyId);
  const latest = getLatest(babyId);
  const gain = getWeightGain(babyId);
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
          <View style={[styles.headerIcon, { backgroundColor: COLORS.growthLight }]}>
            <Ionicons name="trending-up" size={24} color={COLORS.growth} />
          </View>
          <View>
            <Text style={[styles.screenTitle, { color: C.text }]}>Growth</Text>
            <Text style={[styles.screenSub, { color: C.textSecondary }]}>
              {logs.length} measurement{logs.length !== 1 ? 's' : ''}
            </Text>
          </View>
        </View>

        {/* Current stats */}
        {latest && (
          <View style={[styles.statsCard, { backgroundColor: C.card, borderColor: C.border }]}>
            {latest.weight && (
              <View style={styles.statRow}>
                <View style={[styles.statBadge, { backgroundColor: COLORS.growthLight }]}>
                  <Ionicons name="scale-outline" size={18} color={COLORS.growth} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.statLabel, { color: C.textSecondary }]}>Current Weight</Text>
                  <Text style={[styles.statVal, { color: C.text }]}>
                    {parseFloat(latest.weight).toFixed(2)} {latest.unit || 'kg'}
                  </Text>
                </View>
                {gain && (
                  <View style={[styles.gainBadge, { backgroundColor: COLORS.successLight }]}>
                    <Ionicons name="arrow-up" size={12} color={COLORS.success} />
                    <Text style={[styles.gainText, { color: COLORS.success }]}>
                      +{gain.gain} {latest.unit || 'kg'}
                    </Text>
                  </View>
                )}
              </View>
            )}
            {latest.height && (
              <>
                <View style={[styles.divider, { backgroundColor: C.border }]} />
                <View style={styles.statRow}>
                  <View style={[styles.statBadge, { backgroundColor: COLORS.growthLight }]}>
                    <Ionicons name="resize-outline" size={18} color={COLORS.growth} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.statLabel, { color: C.textSecondary }]}>Height / Length</Text>
                    <Text style={[styles.statVal, { color: C.text }]}>{latest.height} cm</Text>
                  </View>
                </View>
              </>
            )}
            {latest.headCirc && (
              <>
                <View style={[styles.divider, { backgroundColor: C.border }]} />
                <View style={styles.statRow}>
                  <View style={[styles.statBadge, { backgroundColor: COLORS.growthLight }]}>
                    <Ionicons name="ellipse-outline" size={18} color={COLORS.growth} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.statLabel, { color: C.textSecondary }]}>Head Circumference</Text>
                    <Text style={[styles.statVal, { color: C.text }]}>{latest.headCirc} cm</Text>
                  </View>
                </View>
              </>
            )}
            {gain && (
              <Text style={[styles.gainNote, { color: C.textMuted }]}>
                +{gain.gain} {latest.unit || 'kg'} gained in {gain.daysDiff} days
              </Text>
            )}
          </View>
        )}

        {/* Mini chart */}
        {logs.length >= 2 && (
          <View style={[styles.chartCard, { backgroundColor: C.card, borderColor: C.border }]}>
            <Text style={[styles.chartTitle, { color: C.text }]}>Weight Trend</Text>
            <MiniChart data={logs} color={COLORS.growth} />
          </View>
        )}

        {/* Add button */}
        <TouchableOpacity
          onPress={() => setShowAdd(true)}
          style={[styles.addBtn, { backgroundColor: COLORS.growth }]}
          accessibilityRole="button"
          accessibilityLabel="Add measurement"
        >
          <Ionicons name="add-circle" size={22} color={COLORS.white} />
          <Text style={styles.addBtnText}>Add Measurement</Text>
        </TouchableOpacity>

        {/* History */}
        {logs.length > 0 && (
          <>
            <Text style={[styles.sectionLabel, { color: C.textSecondary, marginTop: SPACING.xl }]}>
              HISTORY
            </Text>
            {logs.map((log) => (
              <View key={log.id} style={[styles.logItem, { backgroundColor: C.card, borderColor: C.border }]}>
                <View style={[styles.logIcon, { backgroundColor: COLORS.growthLight }]}>
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
          <View style={styles.emptyWrap}>
            <Ionicons name="trending-up-outline" size={48} color={COLORS.textMuted} />
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
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: SPACING.lg },
  screenHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, marginBottom: SPACING.xl },
  headerIcon: { width: 52, height: 52, borderRadius: RADIUS.lg, alignItems: 'center', justifyContent: 'center' },
  screenTitle: { fontSize: FONT_SIZE.xl, fontWeight: FONT_WEIGHT.bold },
  screenSub: { fontSize: FONT_SIZE.sm },
  sectionLabel: { fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.semibold, letterSpacing: 1, marginBottom: SPACING.sm },

  statsCard: { borderRadius: RADIUS.xl, borderWidth: 1, marginBottom: SPACING.md, overflow: 'hidden' },
  statRow: { flexDirection: 'row', alignItems: 'center', padding: SPACING.md, gap: SPACING.md },
  statBadge: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  statLabel: { fontSize: FONT_SIZE.sm, marginBottom: 2 },
  statVal: { fontSize: FONT_SIZE.xl, fontWeight: FONT_WEIGHT.bold },
  divider: { height: 1 },
  gainBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.full },
  gainText: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold },
  gainNote: { textAlign: 'center', fontSize: FONT_SIZE.sm, padding: SPACING.sm, paddingTop: 0 },

  chartCard: { borderRadius: RADIUS.xl, borderWidth: 1, padding: SPACING.md, marginBottom: SPACING.md, alignItems: 'center' },
  chartTitle: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.semibold, alignSelf: 'flex-start', marginBottom: SPACING.sm },
  chartBars: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 60 },
  chartBar: { flex: 1, borderRadius: 4 },

  addBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    padding: 18, borderRadius: RADIUS.xl, gap: 8, marginBottom: SPACING.md, ...SHADOW.md,
  },
  addBtnText: { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold, color: COLORS.white },

  logItem: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, padding: SPACING.md, borderRadius: RADIUS.lg, borderWidth: 1, marginBottom: SPACING.sm },
  logIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  logTitle: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.semibold },
  logSub: { fontSize: FONT_SIZE.sm, marginTop: 2 },

  emptyWrap: { alignItems: 'center', paddingVertical: SPACING.xxl, gap: SPACING.md },
  emptyTitle: { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.semibold },
  emptySub: { fontSize: FONT_SIZE.md, textAlign: 'center' },

  // Modal
  modal: { flex: 1, paddingHorizontal: SPACING.lg },
  modalHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: COLORS.gray200, alignSelf: 'center', marginTop: 12, marginBottom: 8 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: SPACING.md },
  modalTitle: { fontSize: FONT_SIZE.xl, fontWeight: FONT_WEIGHT.bold },
  modalContent: { paddingBottom: 40, gap: SPACING.md },
  fieldWrap: { gap: 8 },
  fieldLabel: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.medium, letterSpacing: 0.5 },
  fieldRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  fieldInput: {
    flex: 1, height: 52, borderRadius: RADIUS.lg, borderWidth: 1.5,
    paddingHorizontal: SPACING.md, fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.medium,
  },
  fieldSuffix: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.medium, width: 36 },
  unitRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  unitToggle: { flexDirection: 'row', borderRadius: RADIUS.lg, overflow: 'hidden', borderWidth: 1.5, borderColor: COLORS.border },
  unitBtn: { paddingHorizontal: 20, paddingVertical: 12, backgroundColor: COLORS.card },
  unitBtnActive: { backgroundColor: COLORS.growth },
  unitText: { fontSize: FONT_SIZE.md, color: COLORS.textSecondary, fontWeight: FONT_WEIGHT.medium },
  unitTextActive: { color: COLORS.white, fontWeight: FONT_WEIGHT.semibold },
  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    padding: 18, borderRadius: RADIUS.xl, gap: 8, marginTop: SPACING.md, ...SHADOW.md,
  },
  saveBtnText: { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold, color: COLORS.white },
});
