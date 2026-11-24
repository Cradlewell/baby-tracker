import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal, TextInput, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { format, differenceInCalendarDays } from 'date-fns';

import { useBabyStore } from '../store/useBabyStore';
import { useVaccinationStore, SCHEDULE_SOURCE } from '../store/useVaccinationStore';
import { COLORS, DARK_COLORS, GRADIENTS } from '../constants/colors';
import GradientView from '../components/GradientView';
import { FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING, SHADOW } from '../constants/theme';
import { parseDob, formatDobInput } from '../utils/formatters';

const todayStr = () => format(new Date(), 'dd/MM/yyyy');

function VaccineItem({ vacc, onPress, C, errorTint }) {
  const due = new Date(vacc.dueDate);
  const daysUntil = differenceInCalendarDays(due, new Date());
  const isOverdue = !vacc.completed && daysUntil < 0;
  const isDueSoon = !vacc.completed && daysUntil >= 0 && daysUntil <= 7;

  return (
    <TouchableOpacity
      onPress={() => onPress(vacc)}
      activeOpacity={0.7}
      style={[
        styles.vaccItem,
        { backgroundColor: C.card, borderColor: C.border },
        SHADOW.sm,
        isOverdue && [styles.vaccOverdue, { backgroundColor: errorTint }],
        isDueSoon && styles.vaccSoon,
        vacc.completed && styles.vaccDone,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${vacc.name}, ${vacc.completed ? 'completed, tap to undo' : 'tap to mark complete'}`}
    >
      <View style={[
        styles.vaccIcon,
        { backgroundColor: vacc.completed ? C.medicineLight : isOverdue ? C.card : C.vaccinationLight },
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
            ? `Overdue · was due ${format(due, 'MMM d, yyyy')}`
            : daysUntil === 0
            ? 'Due today'
            : `Due in ${daysUntil}d · ${format(due, 'MMM d, yyyy')}`}
          {vacc.description ? ` · ${vacc.description}` : ''}
        </Text>
      </View>
      <Ionicons name={vacc.completed ? 'arrow-undo-outline' : 'chevron-forward'} size={16} color={C.textMuted} />
    </TouchableOpacity>
  );
}

export default function VaccinationScreen({ navigation }) {
  const { getActiveBaby, darkMode } = useBabyStore();
  const baby = getActiveBaby();
  const babyId = baby?.id;
  const C = darkMode ? DARK_COLORS : COLORS;
  const insets = useSafeAreaInsets();
  const errorTint = darkMode ? COLORS.error + '22' : COLORS.errorLight;

  const records = useVaccinationStore((s) => s.records[babyId]) || [];
  const { load, markCompleted, markNotCompleted } = useVaccinationStore.getState();
  const birth = parseDob(baby?.dob);

  const { overdue, upcoming, completed } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const byDue = (a, b) => new Date(a.dueDate) - new Date(b.dueDate);
    const pending = records.filter((r) => !r.completed);
    return {
      overdue: pending.filter((r) => new Date(r.dueDate) < today).sort(byDue),
      upcoming: pending.filter((r) => new Date(r.dueDate) >= today).sort(byDue),
      completed: records.filter((r) => r.completed)
        .sort((a, b) => new Date(b.completedDate) - new Date(a.completedDate)),
    };
  }, [records]);

  const [markTarget, setMarkTarget] = useState(null);
  const [markNotes, setMarkNotes] = useState('');
  const [markDate, setMarkDate] = useState(todayStr());
  const [tab, setTab] = useState('upcoming');

  useEffect(() => {
    if (babyId) load(babyId, baby.dob);
  }, [babyId, baby?.dob]);

  const dateError = (() => {
    const d = parseDob(markDate);
    if (markDate.length !== 10 || !d) return 'Enter the date as DD/MM/YYYY';
    if (differenceInCalendarDays(d, new Date()) > 0) return 'Date cannot be in the future';
    if (birth && d < birth) return 'Date cannot be before date of birth';
    return null;
  })();

  const openItem = (vacc) => {
    if (!vacc.completed) {
      setMarkNotes(vacc.notes || '');
      setMarkDate(todayStr());
      setMarkTarget(vacc);
      return;
    }
    Alert.alert(`Undo ${vacc.name}?`, 'This will mark the vaccine as not given.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Mark as not given', style: 'destructive', onPress: () => markNotCompleted(babyId, vacc.id) },
    ]);
  };

  const handleMark = async () => {
    if (!markTarget || dateError) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const d = parseDob(markDate);
    d.setHours(12, 0, 0, 0);
    await markCompleted(babyId, markTarget.id, { notes: markNotes, date: d });
    setMarkTarget(null);
    setMarkNotes('');
  };

  const displayList = tab === 'upcoming' ? [...overdue, ...upcoming] : completed;

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
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            style={[styles.backBtn, { backgroundColor: C.card, borderColor: C.border }, SHADOW.sm]}
          >
            <Ionicons name="chevron-back" size={22} color={C.text} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: C.text }]}>Vaccinations</Text>
            <Text style={[styles.subtitle, { color: C.textSecondary }]}>Schedule & completed</Text>
          </View>
        </View>

        {!birth ? (
          <View style={styles.emptyWrap}>
            <View style={[styles.emptyIcon, { backgroundColor: C.vaccinationLight }]}>
              <Ionicons name="calendar-outline" size={36} color={COLORS.vaccination} />
            </View>
            <Text style={[styles.emptyTitle, { color: C.text }]}>Add a date of birth</Text>
            <Text style={[styles.emptyText, { color: C.textSecondary }]}>
              The vaccine schedule is calculated from {baby?.name || "baby"}'s date of birth.
            </Text>
            <TouchableOpacity
              onPress={() => navigation.navigate('EditBaby', { babyId })}
              style={{ alignSelf: 'stretch' }}
              activeOpacity={0.85}
              accessibilityRole="button"
            >
              <GradientView
                colors={GRADIENTS.vaccination}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[styles.markBtn, SHADOW.md]}
              >
                <Text style={styles.markBtnText}>Edit profile</Text>
              </GradientView>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* Progress hero */}
            <GradientView colors={GRADIENTS.vaccination} bubbles style={[styles.progressCard, SHADOW.lg]}>
              <View style={styles.progressTop}>
                <View style={styles.progressIcon}>
                  <Ionicons name="shield-checkmark" size={26} color={COLORS.vaccination} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.progressNum}>
                    {completed.length}/{records.length}
                  </Text>
                  <Text style={styles.progressLabel}>Vaccines completed</Text>
                </View>
              </View>
              <View style={styles.progressBar}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${records.length ? (completed.length / records.length) * 100 : 0}%` },
                  ]}
                />
              </View>
              {upcoming.length > 0 && (
                <View style={styles.heroChip}>
                  <Ionicons name="calendar-outline" size={13} color={COLORS.white} />
                  <Text style={styles.heroChipText} numberOfLines={1}>
                    Next: {upcoming[0].name} · {format(new Date(upcoming[0].dueDate), 'MMM d')}
                  </Text>
                </View>
              )}
            </GradientView>

            <Text style={[styles.sourceNote, { color: C.textMuted }]}>
              Schedule based on {SCHEDULE_SOURCE}. Region-specific and optional vaccines are not listed —
              always follow your pediatrician's advice.
            </Text>

            {overdue.length > 0 && (
              <View style={[styles.overdueAlert, { backgroundColor: errorTint, borderColor: COLORS.error + '33' }]}>
                <Ionicons name="alert-circle" size={18} color={COLORS.error} />
                <Text style={[styles.overdueText, { color: COLORS.error }]}>
                  {overdue.length} vaccine{overdue.length > 1 ? 's' : ''} overdue — please consult your doctor
                </Text>
              </View>
            )}

            {/* Tabs */}
            <View style={[styles.tabs, { backgroundColor: C.card, borderColor: C.border }, SHADOW.sm]}>
              {[
                { value: 'upcoming', label: `Upcoming (${upcoming.length + overdue.length})` },
                { value: 'done', label: `Done (${completed.length})` },
              ].map((t) => (
                <TouchableOpacity
                  key={t.value}
                  onPress={() => setTab(t.value)}
                  style={styles.tab}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: tab === t.value }}
                >
                  {tab === t.value ? (
                    <GradientView
                      colors={GRADIENTS.vaccination}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.tabInner}
                    >
                      <Text style={[styles.tabText, { color: COLORS.white }]}>{t.label}</Text>
                    </GradientView>
                  ) : (
                    <View style={styles.tabInner}>
                      <Text style={[styles.tabText, { color: C.textSecondary }]}>{t.label}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              ))}
            </View>

            {displayList.length === 0 && (
              <View style={styles.emptyWrap}>
                <View style={[styles.emptyIcon, { backgroundColor: C.vaccinationLight }]}>
                  <Ionicons
                    name={tab === 'done' ? 'shield-checkmark' : 'checkmark-done-circle'}
                    size={36}
                    color={COLORS.vaccination}
                  />
                </View>
                <Text style={[styles.emptyTitle, { color: C.text }]}>
                  {tab === 'done' ? 'No vaccines completed yet' : 'All scheduled vaccines are done!'}
                </Text>
              </View>
            )}

            {displayList.map((v) => (
              <VaccineItem key={v.id} vacc={v} onPress={openItem} C={C} errorTint={errorTint} />
            ))}
          </>
        )}
      </ScrollView>

      {/* Mark complete modal */}
      <Modal visible={!!markTarget} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setMarkTarget(null)}>
        <View style={[styles.modal, { backgroundColor: C.background }]}>
          <View style={[styles.modalHandle, { backgroundColor: C.border }]} />
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: C.text }]}>Mark as Done</Text>
            <TouchableOpacity
              onPress={() => setMarkTarget(null)}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              style={[styles.backBtn, { backgroundColor: C.card, borderColor: C.border }, SHADOW.sm]}
            >
              <Ionicons name="close" size={22} color={C.textSecondary} />
            </TouchableOpacity>
          </View>
          <View style={styles.modalContent}>
            <View style={[styles.modalVaccCard, { backgroundColor: C.card, borderColor: C.border }, SHADOW.sm]}>
              <View style={[styles.vaccIcon, { backgroundColor: C.vaccinationLight }]}>
                <Ionicons name="shield-checkmark" size={20} color={COLORS.vaccination} />
              </View>
              <Text style={[styles.modalVaccName, { color: C.text }]}>{markTarget?.name}</Text>
            </View>

            <Text style={[styles.modalLabel, { color: C.textSecondary }]}>DATE GIVEN</Text>
            <TextInput
              style={[styles.modalInput, styles.dateInput, { color: C.text, backgroundColor: C.card, borderColor: C.border }]}
              value={markDate}
              onChangeText={(t) => setMarkDate(formatDobInput(t))}
              placeholder="DD/MM/YYYY"
              placeholderTextColor={C.textMuted}
              keyboardType="number-pad"
              maxLength={10}
              accessibilityLabel="Date given"
            />
            {dateError && <Text style={styles.dateError}>{dateError}</Text>}

            <Text style={[styles.modalLabel, { color: C.textSecondary }]}>NOTES (optional)</Text>
            <TextInput
              style={[styles.modalInput, { color: C.text, backgroundColor: C.card, borderColor: C.border }]}
              placeholder="Batch number, reactions, clinic..."
              placeholderTextColor={C.textMuted}
              value={markNotes}
              onChangeText={setMarkNotes}
              multiline
            />
            <TouchableOpacity
              onPress={handleMark}
              disabled={!!dateError}
              style={{ opacity: dateError ? 0.5 : 1 }}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Confirm vaccination complete"
            >
              <GradientView
                colors={GRADIENTS.vaccination}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[styles.markBtn, SHADOW.md]}
              >
                <Ionicons name="shield-checkmark" size={20} color={COLORS.white} />
                <Text style={styles.markBtnText}>Mark Complete</Text>
              </GradientView>
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
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: SPACING.lg },
  backBtn: {
    width: 42, height: 42, borderRadius: 14, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: FONT_SIZE.xxl, fontWeight: FONT_WEIGHT.heavy, letterSpacing: -0.8 },
  subtitle: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.medium, marginTop: 2 },
  progressCard: { padding: SPACING.lg, borderRadius: RADIUS.xxl, marginBottom: SPACING.md, gap: SPACING.md },
  progressTop: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  progressIcon: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: COLORS.white,
    alignItems: 'center', justifyContent: 'center',
  },
  progressNum: { fontSize: FONT_SIZE.hero, fontWeight: FONT_WEIGHT.heavy, color: COLORS.white, letterSpacing: -1 },
  progressLabel: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold, color: 'rgba(255,255,255,0.9)' },
  progressBar: {
    width: '100%', height: 10, borderRadius: 5, overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  progressFill: { height: '100%', borderRadius: 5, backgroundColor: COLORS.white },
  heroChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', maxWidth: '100%',
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: RADIUS.full,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  heroChipText: { flexShrink: 1, fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.bold, color: COLORS.white },
  sourceNote: { fontSize: FONT_SIZE.xs, lineHeight: 16, marginBottom: SPACING.md, marginHorizontal: 4 },
  overdueAlert: {
    flexDirection: 'row', alignItems: 'center', gap: 8, padding: SPACING.md,
    borderRadius: RADIUS.lg, borderWidth: 1, marginBottom: SPACING.md,
  },
  overdueText: { flex: 1, fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.bold },
  tabs: { flexDirection: 'row', borderRadius: RADIUS.xl, borderWidth: 1, padding: 4, marginBottom: SPACING.md },
  tab: { flex: 1 },
  tabInner: { alignItems: 'center', paddingVertical: 11, borderRadius: RADIUS.lg },
  tabText: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.heavy },
  emptyWrap: { alignItems: 'center', paddingVertical: SPACING.xxl, gap: SPACING.md },
  emptyIcon: { width: 72, height: 72, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.heavy, letterSpacing: -0.3, textAlign: 'center' },
  emptyText: { textAlign: 'center', fontSize: FONT_SIZE.md, lineHeight: 21, marginBottom: SPACING.md },
  vaccItem: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md, padding: SPACING.md,
    borderRadius: RADIUS.xl, borderWidth: 1, marginBottom: SPACING.sm, minHeight: 70,
  },
  vaccOverdue: { borderColor: COLORS.error + '40' },
  vaccSoon: { borderColor: COLORS.vaccination + '60' },
  vaccDone: { opacity: 0.7 },
  vaccIcon: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  vaccName: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.bold },
  vaccDue: { fontSize: FONT_SIZE.sm, marginTop: 2 },
  modal: { flex: 1, paddingHorizontal: SPACING.lg },
  modalHandle: { width: 40, height: 5, borderRadius: 3, alignSelf: 'center', marginTop: 12, marginBottom: 8 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: SPACING.md },
  modalTitle: { fontSize: FONT_SIZE.xxl, fontWeight: FONT_WEIGHT.heavy, letterSpacing: -0.8 },
  modalContent: { gap: SPACING.md },
  modalVaccCard: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md, padding: SPACING.md,
    borderRadius: RADIUS.xl, borderWidth: 1,
  },
  modalVaccName: { flex: 1, fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.heavy, letterSpacing: -0.3 },
  modalLabel: { fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.heavy, letterSpacing: 1.2, marginLeft: 4 },
  modalInput: {
    minHeight: 80, borderRadius: RADIUS.lg, borderWidth: 1.5,
    paddingHorizontal: SPACING.md, paddingVertical: 12, fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.semibold, textAlignVertical: 'top',
  },
  dateInput: { minHeight: 56, textAlignVertical: 'center' },
  dateError: {
    color: COLORS.error, fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold,
    marginTop: -4, marginBottom: 8, marginLeft: 4,
  },
  markBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    padding: 18, borderRadius: RADIUS.xl, gap: 8,
  },
  markBtnText: { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.heavy, color: COLORS.white },
});
