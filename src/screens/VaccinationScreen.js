import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal, TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { format, differenceInDays } from 'date-fns';

import { useBabyStore } from '../store/useBabyStore';
import { useVaccinationStore } from '../store/useVaccinationStore';
import { COLORS, DARK_COLORS } from '../constants/colors';
import { FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING, SHADOW } from '../constants/theme';

function VaccineItem({ vacc, onMark, C }) {
  const now = new Date();
  const due = new Date(vacc.dueDate);
  const daysUntil = differenceInDays(due, now);
  const isOverdue = !vacc.completed && daysUntil < 0;
  const isDueSoon = !vacc.completed && daysUntil >= 0 && daysUntil <= 7;

  return (
    <TouchableOpacity
      onPress={() => !vacc.completed && onMark(vacc)}
      activeOpacity={vacc.completed ? 1 : 0.7}
      style={[
        styles.vaccItem,
        { backgroundColor: C.card, borderColor: C.border },
        isOverdue && styles.vaccOverdue,
        isDueSoon && styles.vaccSoon,
        vacc.completed && styles.vaccDone,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${vacc.name}, ${vacc.completed ? 'completed' : 'tap to mark complete'}`}
    >
      <View style={[
        styles.vaccIcon,
        { backgroundColor: vacc.completed ? COLORS.successLight : isOverdue ? COLORS.errorLight : COLORS.vaccinationLight },
      ]}>
        <Ionicons
          name={vacc.completed ? 'checkmark-circle' : isOverdue ? 'alert-circle' : 'shield-checkmark'}
          size={20}
          color={vacc.completed ? COLORS.success : isOverdue ? COLORS.error : COLORS.vaccination}
        />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.vaccName, { color: C.text }]}>{vacc.name}</Text>
        <Text style={[styles.vaccDue, { color: C.textSecondary }]}>
          {vacc.completed
            ? `Done · ${format(new Date(vacc.completedDate), 'MMM d, yyyy')}`
            : isOverdue
            ? `Overdue · ${format(due, 'MMM d, yyyy')}`
            : daysUntil === 0
            ? 'Due today'
            : daysUntil > 0
            ? `Due in ${daysUntil}d · ${format(due, 'MMM d')}`
            : format(due, 'MMM d, yyyy')}
        </Text>
      </View>
      {!vacc.completed && (
        <Ionicons name="chevron-forward" size={16} color={C.textMuted} />
      )}
    </TouchableOpacity>
  );
}

export default function VaccinationScreen({ navigation }) {
  const { getActiveBaby, darkMode } = useBabyStore();
  const baby = getActiveBaby();
  const babyId = baby?.id;
  const C = darkMode ? DARK_COLORS : COLORS;
  const insets = useSafeAreaInsets();

  const { load, markCompleted, getRecords, getUpcoming, getOverdue } = useVaccinationStore();
  const records = getRecords(babyId);
  const upcoming = getUpcoming(babyId);
  const overdue = getOverdue(babyId);
  const completed = records.filter((r) => r.completed);

  const [markTarget, setMarkTarget] = useState(null);
  const [markNotes, setMarkNotes] = useState('');

  useEffect(() => {
    if (babyId) load(babyId, baby.dob);
  }, [babyId]);

  const handleMark = async () => {
    if (!markTarget) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await markCompleted(babyId, markTarget.id, markNotes);
    setMarkTarget(null);
    setMarkNotes('');
  };

  const [tab, setTab] = useState('upcoming');

  const displayList = tab === 'upcoming'
    ? [...overdue, ...upcoming]
    : completed.sort((a, b) => new Date(b.completedDate) - new Date(a.completedDate));

  return (
    <View style={[styles.container, { backgroundColor: C.background }]}>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 40 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="chevron-back" size={24} color={C.text} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: C.text }]}>Vaccinations</Text>
          <View style={{ width: 24 }} />
        </View>

        {/* Progress */}
        <View style={[styles.progressCard, { backgroundColor: COLORS.vaccinationLight }]}>
          <Text style={[styles.progressNum, { color: COLORS.vaccination }]}>
            {completed.length}/{records.length}
          </Text>
          <Text style={[styles.progressLabel, { color: COLORS.textSecondary }]}>Vaccines completed</Text>
          <View style={[styles.progressBar, { backgroundColor: COLORS.vaccination + '30' }]}>
            <View
              style={[
                styles.progressFill,
                { backgroundColor: COLORS.vaccination, width: `${records.length ? (completed.length / records.length) * 100 : 0}%` },
              ]}
            />
          </View>
        </View>

        {overdue.length > 0 && (
          <View style={[styles.overdueAlert, { backgroundColor: COLORS.errorLight }]}>
            <Ionicons name="alert-circle" size={18} color={COLORS.error} />
            <Text style={[styles.overdueText, { color: COLORS.error }]}>
              {overdue.length} vaccine{overdue.length > 1 ? 's' : ''} overdue — please consult your doctor
            </Text>
          </View>
        )}

        {/* Tabs */}
        <View style={[styles.tabs, { backgroundColor: C.card, borderColor: C.border }]}>
          {[
            { value: 'upcoming', label: `Upcoming (${upcoming.length + overdue.length})` },
            { value: 'done', label: `Done (${completed.length})` },
          ].map((t) => (
            <TouchableOpacity
              key={t.value}
              onPress={() => setTab(t.value)}
              style={[styles.tab, tab === t.value && styles.tabActive]}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === t.value }}
            >
              <Text style={[styles.tabText, { color: tab === t.value ? COLORS.white : C.textSecondary }]}>
                {t.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {displayList.length === 0 && (
          <View style={styles.emptyWrap}>
            <Ionicons name={tab === 'done' ? 'shield-checkmark' : 'checkmark-done-circle'} size={48} color={COLORS.textMuted} />
            <Text style={[styles.emptyTitle, { color: C.text }]}>
              {tab === 'done' ? 'No vaccines completed yet' : 'All vaccines up to date!'}
            </Text>
          </View>
        )}

        {displayList.map((v) => (
          <VaccineItem key={v.id} vacc={v} onMark={setMarkTarget} C={C} />
        ))}
      </ScrollView>

      {/* Mark complete modal */}
      <Modal visible={!!markTarget} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setMarkTarget(null)}>
        <View style={[styles.modal, { backgroundColor: C.background }]}>
          <View style={styles.modalHandle} />
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: C.text }]}>Mark as Done</Text>
            <TouchableOpacity onPress={() => setMarkTarget(null)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Ionicons name="close" size={24} color={C.textSecondary} />
            </TouchableOpacity>
          </View>
          <View style={styles.modalContent}>
            <Text style={[styles.modalVaccName, { color: C.text }]}>{markTarget?.name}</Text>
            <Text style={[styles.modalLabel, { color: C.textSecondary }]}>NOTES (optional)</Text>
            <TextInput
              style={[styles.modalInput, { color: C.text, backgroundColor: C.card, borderColor: C.border }]}
              placeholder="Batch number, reactions, clinic..."
              placeholderTextColor={COLORS.textMuted}
              value={markNotes}
              onChangeText={setMarkNotes}
              multiline
            />
            <TouchableOpacity
              onPress={handleMark}
              style={[styles.markBtn, { backgroundColor: COLORS.vaccination }]}
              accessibilityRole="button"
              accessibilityLabel="Confirm vaccination complete"
            >
              <Ionicons name="shield-checkmark" size={20} color={COLORS.white} />
              <Text style={styles.markBtnText}>Mark Complete</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: SPACING.lg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.xl },
  title: { fontSize: FONT_SIZE.xl, fontWeight: FONT_WEIGHT.bold },
  progressCard: { alignItems: 'center', padding: SPACING.lg, borderRadius: RADIUS.xl, marginBottom: SPACING.md, gap: 8 },
  progressNum: { fontSize: FONT_SIZE.hero, fontWeight: FONT_WEIGHT.bold },
  progressLabel: { fontSize: FONT_SIZE.md },
  progressBar: { width: '100%', height: 8, borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4 },
  overdueAlert: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: SPACING.md, borderRadius: RADIUS.lg, marginBottom: SPACING.md },
  overdueText: { flex: 1, fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.medium },
  tabs: { flexDirection: 'row', borderRadius: RADIUS.xl, borderWidth: 1, padding: 4, marginBottom: SPACING.md },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: RADIUS.lg },
  tabActive: { backgroundColor: COLORS.vaccination },
  tabText: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold },
  emptyWrap: { alignItems: 'center', paddingVertical: SPACING.xxl, gap: SPACING.md },
  emptyTitle: { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.semibold },
  vaccItem: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, padding: SPACING.md, borderRadius: RADIUS.xl, borderWidth: 1, marginBottom: SPACING.sm },
  vaccOverdue: { borderColor: COLORS.error + '40', backgroundColor: COLORS.errorLight },
  vaccSoon: { borderColor: COLORS.vaccination + '40' },
  vaccDone: { opacity: 0.7 },
  vaccIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  vaccName: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.semibold },
  vaccDue: { fontSize: FONT_SIZE.sm, marginTop: 2 },
  modal: { flex: 1, paddingHorizontal: SPACING.lg },
  modalHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: COLORS.gray200, alignSelf: 'center', marginTop: 12, marginBottom: 8 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: SPACING.md },
  modalTitle: { fontSize: FONT_SIZE.xl, fontWeight: FONT_WEIGHT.bold },
  modalContent: { gap: SPACING.md },
  modalVaccName: { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.semibold },
  modalLabel: { fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.semibold, letterSpacing: 1 },
  modalInput: {
    minHeight: 80, borderRadius: RADIUS.lg, borderWidth: 1.5,
    paddingHorizontal: SPACING.md, paddingVertical: 12, fontSize: FONT_SIZE.md, textAlignVertical: 'top',
  },
  markBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    padding: 18, borderRadius: RADIUS.xl, gap: 8, ...SHADOW.md,
  },
  markBtnText: { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold, color: COLORS.white },
});
