import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal, TextInput, Alert, Switch,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { format, differenceInCalendarDays } from 'date-fns';

import { useBabyStore } from '../store/useBabyStore';
import { useVaccinationStore, SCHEDULE_SOURCE } from '../store/useVaccinationStore';
import { COLORS } from '../constants/colors';
import { FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING, fs } from '../constants/theme';
import { parseDob, formatDobInput } from '../utils/formatters';
import { setReminders, cancelReminder, vaccineReminderKey, remindersAllowed } from '../lib/reminders';
import { remindersOnKey, REMIND_NEXT, vaccineReminderItems } from '../lib/vaccineReminders';

// Local palette for this screen, taken from the user's approved screenshot.
const SHOT_LIGHT = { blue: '#006BFD', blueText: '#0058D4', tile: '#DAE9FE', hero: '#EBF3FE', card: '#EEF4FE', surface: '#FFFFFF', text: '#032049', textSecondary: '#5A6690', border: '#E1EAFB', background: '#FBFBFE' };
const SHOT_DARK = { blue: '#006BFD', blueText: '#7FB0FF', tile: '#1C2D52', hero: '#16223D', card: '#131D33', surface: '#1A2540', text: '#EEF3FF', textSecondary: '#A9B6D6', border: '#26324F', background: '#0B1220' };

const todayStr = () => format(new Date(), 'dd/MM/yyyy');

function VaccineItem({ vacc, onPress, S, errorTint }) {
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
        { backgroundColor: S.card, borderColor: S.card },
        isOverdue && [styles.vaccOverdue, { backgroundColor: errorTint }],
        isDueSoon && { borderColor: S.blue },
        vacc.completed && styles.vaccDone,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${vacc.name}, ${vacc.completed ? 'completed, tap to undo' : 'tap to mark complete'}`}
    >
      <View style={[styles.vaccIcon, { backgroundColor: S.surface, borderColor: S.border }]}>
        <Ionicons
          name={vacc.completed ? 'checkmark-circle-outline' : isOverdue ? 'alert-circle-outline' : 'shield-checkmark-outline'}
          size={24}
          color={vacc.completed ? COLORS.success : isOverdue ? COLORS.error : S.text}
        />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.vaccName, { color: S.text }]}>{vacc.name}</Text>
        <Text style={[styles.vaccDue, { color: S.text }]}>
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
      <Ionicons name={vacc.completed ? 'arrow-undo-outline' : 'chevron-forward'} size={20} color={S.textSecondary} />
    </TouchableOpacity>
  );
}

export default function VaccinationScreen({ navigation }) {
  const { getActiveBaby, darkMode } = useBabyStore();
  const baby = getActiveBaby();
  const babyId = baby?.id;
  const S = darkMode ? SHOT_DARK : SHOT_LIGHT;
  const insets = useSafeAreaInsets();
  const errorTint = darkMode ? COLORS.error + '22' : COLORS.errorLight;

  const records = useVaccinationStore((s) => s.records[babyId]) || [];
  const { load, markCompleted, markNotCompleted, addCustom, removeCustom } = useVaccinationStore.getState();
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
  const [remindOn, setRemindOn] = useState(false);

  useEffect(() => {
    if (!babyId) return;
    AsyncStorage.getItem(remindersOnKey(babyId)).then((v) => setRemindOn(v === '1')).catch(() => {});
  }, [babyId]);

  // Keep the scheduled sounds in step with the schedule (a vaccine marked done stops ringing).
  const upcomingKey = upcoming.slice(0, REMIND_NEXT).map((v) => `${v.id}@${v.dueDate}`).join('|');
  useEffect(() => {
    if (remindOn && babyId && baby) setReminders(vaccineReminderKey(babyId), vaccineReminderItems(upcoming, baby.name));
  }, [remindOn, upcomingKey, babyId]);

  const toggleReminders = async (on) => {
    Haptics.selectionAsync();
    if (!on) {
      setRemindOn(false);
      await AsyncStorage.setItem(remindersOnKey(babyId), '0').catch(() => {});
      await cancelReminder(vaccineReminderKey(babyId));
      return;
    }
    const count = await setReminders(vaccineReminderKey(babyId), vaccineReminderItems(upcoming, baby.name));
    if (!count && upcoming.length && !remindersAllowed(vaccineReminderKey(babyId))) {
      // Kept on: they ring as soon as Vaccine reminders are switched on in Settings.
      Alert.alert(
        'Vaccine reminders are off',
        'Turn on Vaccine reminders in Settings to hear a sound when a vaccine is due.'
      );
    } else if (!count && upcoming.length) {
      Alert.alert(
        'Reminders not set',
        'Allow notifications for Cradlewell Bloom in your phone settings to hear a sound when a vaccine is due.'
      );
      return;
    }
    setRemindOn(true);
    await AsyncStorage.setItem(remindersOnKey(babyId), '1').catch(() => {});
  };

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

  // ---- Add a vaccine that is not in the standard schedule ----
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDue, setNewDue] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const openAdd = () => { setNewName(''); setNewDue(''); setNewNotes(''); setAddOpen(true); };
  const addError = (() => {
    if (!newName.trim()) return 'Enter the vaccine name';
    const d = parseDob(newDue);
    if (newDue.length !== 10 || !d) return 'Enter the due date as DD/MM/YYYY';
    if (birth && d < birth) return 'Due date cannot be before date of birth';
    return null;
  })();
  const handleAdd = async () => {
    if (addError || !addOpen) return;
    setAddOpen(false); // closes first, so a second tap cannot add the vaccine twice
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await addCustom(babyId, { name: newName, dueDate: parseDob(newDue), notes: newNotes });
    setTab('upcoming');
  };
  const handleDelete = () => {
    const v = markTarget;
    Alert.alert(`Delete ${v.name}?`, 'This removes the vaccine you added from the list.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => { await removeCustom(babyId, v.id); setMarkTarget(null); },
      },
    ]);
  };

  const displayList = tab === 'upcoming' ? [...overdue, ...upcoming] : completed;

  return (
    <View style={[styles.container, { backgroundColor: S.background }]}>
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
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={[styles.headerBtn, { backgroundColor: S.tile }]}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="arrow-back" size={22} color={S.blue} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} style={[styles.title, { color: S.text }]}>Vaccinations</Text>
            <Text style={[styles.subtitle, { color: S.textSecondary }]}>Schedule & completed</Text>
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

        {!birth ? (
          <View style={styles.emptyWrap}>
            <View style={[styles.emptyIcon, { backgroundColor: S.tile }]}>
              <Ionicons name="calendar-outline" size={36} color={S.blue} />
            </View>
            <Text style={[styles.emptyTitle, { color: S.text }]}>Add a date of birth</Text>
            <Text style={[styles.emptyText, { color: S.textSecondary }]}>
              The vaccine schedule is calculated from {baby?.name || "baby"}'s date of birth.
            </Text>
            <TouchableOpacity
              onPress={() => navigation.navigate('EditBaby', { babyId })}
              style={[styles.markBtn, { alignSelf: 'stretch', backgroundColor: S.blue }]}
              activeOpacity={0.85}
              accessibilityRole="button"
            >
              <Ionicons name="create-outline" size={24} color={COLORS.white} />
              <Text style={styles.markBtnText}>Edit profile</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* Progress hero */}
            <View style={[styles.progressCard, { backgroundColor: S.hero }]}>
              <View style={styles.progressTop}>
                <View style={[styles.progressIcon, { backgroundColor: S.tile }]}>
                  <Ionicons name="shield-checkmark-outline" size={28} color={S.blue} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.progressNum, { color: S.text }]}>
                    {completed.length}/{records.length}
                  </Text>
                  <Text style={[styles.progressLabel, { color: S.textSecondary }]}>Vaccines completed</Text>
                </View>
              </View>
              <View style={[styles.progressBar, { backgroundColor: S.tile }]}>
                <View
                  style={[
                    styles.progressFill,
                    { backgroundColor: S.blue },
                    { width: `${records.length ? (completed.length / records.length) * 100 : 0}%` },
                  ]}
                />
              </View>
              {upcoming.length > 0 && (
                <View style={[styles.heroChip, { backgroundColor: S.surface, borderColor: S.border }]}>
                  <Ionicons name="calendar-outline" size={20} color={S.blue} />
                  <Text style={[styles.heroChipText, { color: S.text }]} numberOfLines={1}>
                    Next: {upcoming[0].name} · {format(new Date(upcoming[0].dueDate), 'MMM d')}
                    {(() => {
                      const d = differenceInCalendarDays(new Date(upcoming[0].dueDate), new Date());
                      return d === 0 ? ' · today' : d === 1 ? ' · tomorrow' : ` · in ${d} days`;
                    })()}
                  </Text>
                </View>
              )}
            </View>

            {/* Reminder with sound */}
            <View style={[styles.remindCard, { backgroundColor: S.card }]}>
              <View style={[styles.vaccIcon, { backgroundColor: S.surface, borderColor: S.border }]}>
                <Ionicons name={remindOn ? 'notifications' : 'notifications-outline'} size={24} color={S.blue} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.vaccName, { color: S.text }]}>Remind me with a sound</Text>
                <Text style={[styles.vaccDue, { color: S.textSecondary }]}>
                  9:00 AM the day before and on the due day, for the next {REMIND_NEXT} vaccines
                </Text>
              </View>
              <Switch
                value={remindOn}
                onValueChange={toggleReminders}
                trackColor={{ false: S.tile, true: S.blue }}
                thumbColor={COLORS.white}
                accessibilityLabel="Vaccine reminders"
              />
            </View>

            <Text style={[styles.sourceNote, { color: S.textSecondary }]}>
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

            <TouchableOpacity
              onPress={openAdd}
              style={[styles.addBtn, { borderColor: S.blue, backgroundColor: S.surface }]}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Add a new vaccine with a due date"
            >
              <Ionicons name="add-circle-outline" size={24} color={S.blue} />
              <Text style={[styles.addBtnText, { color: S.blueText }]}>Add vaccine</Text>
            </TouchableOpacity>

            {/* Tabs */}
            <View style={styles.tabs}>
              {[
                { value: 'upcoming', label: `Upcoming (${upcoming.length + overdue.length})` },
                { value: 'done', label: `Done (${completed.length})` },
              ].map((t) => {
                const on = tab === t.value;
                return (
                  <TouchableOpacity
                    key={t.value}
                    onPress={() => setTab(t.value)}
                    style={[
                      styles.tab,
                      on
                        ? { backgroundColor: S.tile, borderColor: S.blue, borderWidth: 1.5 }
                        : { backgroundColor: S.surface, borderColor: S.border },
                    ]}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: on }}
                  >
                    {on ? <Ionicons name="checkmark-circle" size={18} color={S.blue} /> : null}
                    <Text style={[styles.tabText, { color: on ? S.blueText : S.text }]}>{t.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {displayList.length === 0 && (
              <View style={styles.emptyWrap}>
                <View style={[styles.emptyIcon, { backgroundColor: S.tile }]}>
                  <Ionicons
                    name={tab === 'done' ? 'shield-checkmark-outline' : 'checkmark-done-circle-outline'}
                    size={36}
                    color={S.blue}
                  />
                </View>
                <Text style={[styles.emptyTitle, { color: S.text }]}>
                  {tab === 'done' ? 'No vaccines completed yet' : 'All vaccines are done!'}
                </Text>
              </View>
            )}

            {displayList.map((v) => (
              <VaccineItem key={v.id} vacc={v} onPress={openItem} S={S} errorTint={errorTint} />
            ))}
          </>
        )}
      </ScrollView>

      {/* Mark complete modal */}
      <Modal visible={!!markTarget} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setMarkTarget(null)}>
        <View style={[styles.modal, { backgroundColor: S.background }]}>
          <View style={[styles.modalHandle, { backgroundColor: S.border }]} />
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: S.text }]}>Mark as Done</Text>
            <TouchableOpacity
              onPress={() => setMarkTarget(null)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={[styles.headerBtn, { backgroundColor: S.tile }]}
            >
              <Ionicons name="close" size={24} color={S.text} />
            </TouchableOpacity>
          </View>
          <View style={styles.modalContent}>
            <View style={[styles.modalVaccCard, { backgroundColor: S.hero }]}>
              <View style={[styles.vaccIcon, { backgroundColor: S.surface, borderColor: S.border }]}>
                <Ionicons name="shield-checkmark-outline" size={24} color={S.blue} />
              </View>
              <Text style={[styles.modalVaccName, { color: S.text }]}>{markTarget?.name}</Text>
            </View>

            <Text style={[styles.modalLabel, { color: S.textSecondary }]}>DATE GIVEN</Text>
            <TextInput
              style={[styles.modalInput, styles.dateInput, { color: S.text, backgroundColor: S.surface, borderColor: S.border }]}
              value={markDate}
              onChangeText={(t) => setMarkDate(formatDobInput(t))}
              placeholder="DD/MM/YYYY"
              placeholderTextColor={S.textSecondary}
              keyboardType="number-pad"
              maxLength={10}
              accessibilityLabel="Date given"
            />
            {dateError && <Text style={styles.dateError}>{dateError}</Text>}

            <Text style={[styles.modalLabel, { color: S.textSecondary }]}>NOTES (optional)</Text>
            <TextInput
              style={[styles.modalInput, { color: S.text, backgroundColor: S.surface, borderColor: S.border }]}
              placeholder="Batch number, reactions, clinic..."
              placeholderTextColor={S.textSecondary}
              value={markNotes}
              onChangeText={setMarkNotes}
              multiline
            />
            <TouchableOpacity
              onPress={handleMark}
              disabled={!!dateError}
              style={[styles.markBtn, { backgroundColor: S.blue, opacity: dateError ? 0.45 : 1 }]}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Confirm vaccination complete"
            >
              <Ionicons name="shield-checkmark-outline" size={24} color={COLORS.white} />
              <Text style={styles.markBtnText}>Mark Complete</Text>
            </TouchableOpacity>
            {markTarget?.custom ? (
              <TouchableOpacity
                onPress={handleDelete}
                style={styles.deleteBtn}
                accessibilityRole="button"
                accessibilityLabel={`Delete ${markTarget.name}`}
              >
                <Ionicons name="trash-outline" size={20} color={COLORS.error} />
                <Text style={styles.deleteText}>Delete this vaccine</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      </Modal>

      {/* Add vaccine modal */}
      <Modal visible={addOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setAddOpen(false)}>
        <ScrollView
          style={{ backgroundColor: S.background }}
          contentContainerStyle={[styles.modal, { paddingBottom: insets.bottom + 32 }]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={[styles.modalHandle, { backgroundColor: S.border }]} />
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: S.text }]}>Add Vaccine</Text>
            <TouchableOpacity
              onPress={() => setAddOpen(false)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={[styles.headerBtn, { backgroundColor: S.tile }]}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Ionicons name="close" size={24} color={S.text} />
            </TouchableOpacity>
          </View>
          <View style={styles.modalContent}>
            <Text style={[styles.modalLabel, { color: S.textSecondary }]}>VACCINE NAME</Text>
            <TextInput
              style={[styles.modalInput, styles.dateInput, { color: S.text, backgroundColor: S.surface, borderColor: S.border }]}
              value={newName}
              onChangeText={setNewName}
              placeholder="e.g. Influenza (1st), Typhoid, Hepatitis A"
              placeholderTextColor={S.textSecondary}
              autoCapitalize="words"
              maxLength={60}
              accessibilityLabel="Vaccine name"
            />

            <Text style={[styles.modalLabel, { color: S.textSecondary }]}>DUE DATE</Text>
            <TextInput
              style={[styles.modalInput, styles.dateInput, { color: S.text, backgroundColor: S.surface, borderColor: S.border }]}
              value={newDue}
              onChangeText={(t) => setNewDue(formatDobInput(t))}
              placeholder="DD/MM/YYYY"
              placeholderTextColor={S.textSecondary}
              keyboardType="number-pad"
              maxLength={10}
              accessibilityLabel="Due date"
            />

            <Text style={[styles.modalLabel, { color: S.textSecondary }]}>NOTES (optional)</Text>
            <TextInput
              style={[styles.modalInput, { color: S.text, backgroundColor: S.surface, borderColor: S.border }]}
              placeholder="Doctor's advice, dose, clinic..."
              placeholderTextColor={S.textSecondary}
              value={newNotes}
              onChangeText={setNewNotes}
              multiline
            />
            {(newName || newDue) && addError ? <Text style={styles.dateError}>{addError}</Text> : null}

            <TouchableOpacity
              onPress={handleAdd}
              disabled={!!addError}
              style={[styles.markBtn, { backgroundColor: S.blue, opacity: addError ? 0.45 : 1 }]}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Save vaccine"
            >
              <Ionicons name="add-circle-outline" size={24} color={COLORS.white} />
              <Text style={styles.markBtnText}>Add Vaccine</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: SPACING.lg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: SPACING.lg },
  headerBtn: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: fs(28), fontWeight: FONT_WEIGHT.heavy, letterSpacing: -0.6 },
  subtitle: { fontSize: fs(15), fontWeight: FONT_WEIGHT.medium, marginTop: 2 },
  progressCard: { padding: 20, borderRadius: 28, marginBottom: SPACING.md, gap: SPACING.md },
  progressTop: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  progressIcon: {
    width: 56, height: 56, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  progressNum: { fontSize: FONT_SIZE.hero, fontWeight: FONT_WEIGHT.heavy, letterSpacing: -1 },
  progressLabel: { fontSize: fs(15), fontWeight: FONT_WEIGHT.semibold },
  progressBar: { width: '100%', height: 10, borderRadius: 5, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 5 },
  heroChip: {
    flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'stretch',
    paddingHorizontal: 14, minHeight: 48, borderRadius: 20, borderWidth: 1,
  },
  heroChipText: { flexShrink: 1, fontSize: fs(15), fontWeight: FONT_WEIGHT.bold },
  sourceNote: { fontSize: fs(13), lineHeight: 18, marginBottom: SPACING.md, marginHorizontal: 4 },
  overdueAlert: {
    flexDirection: 'row', alignItems: 'center', gap: 10, padding: SPACING.md,
    borderRadius: 20, borderWidth: 1, marginBottom: SPACING.md,
  },
  overdueText: { flex: 1, fontSize: fs(15), fontWeight: FONT_WEIGHT.bold },
  tabs: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.md },
  tab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    minHeight: 48, borderRadius: RADIUS.full, borderWidth: 1,
  },
  tabText: { fontSize: fs(15), fontWeight: FONT_WEIGHT.bold },
  emptyWrap: { alignItems: 'center', paddingVertical: SPACING.xxl, gap: SPACING.md },
  emptyIcon: { width: 72, height: 72, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: fs(22), fontWeight: FONT_WEIGHT.heavy, letterSpacing: -0.3, textAlign: 'center' },
  emptyText: { textAlign: 'center', fontSize: fs(15), lineHeight: 21, marginBottom: SPACING.md },
  vaccItem: {
    flexDirection: 'row', alignItems: 'center', gap: 16, padding: 16,
    borderRadius: 20, borderWidth: 1, marginBottom: 10, minHeight: 72,
  },
  vaccOverdue: { borderColor: COLORS.error + '40' },
  vaccDone: { opacity: 0.7 },
  vaccIcon: { width: 48, height: 48, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  vaccName: { fontSize: fs(17), fontWeight: FONT_WEIGHT.bold },
  vaccDue: { fontSize: fs(15), marginTop: 2 },
  modal: { flex: 1, paddingHorizontal: SPACING.lg },
  modalHandle: { width: 40, height: 5, borderRadius: 3, alignSelf: 'center', marginTop: 12, marginBottom: 8 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: SPACING.md },
  modalTitle: { fontSize: fs(28), fontWeight: FONT_WEIGHT.heavy, letterSpacing: -0.6 },
  modalContent: { gap: SPACING.md },
  modalVaccCard: {
    flexDirection: 'row', alignItems: 'center', gap: 16, padding: 16,
    borderRadius: 24,
  },
  modalVaccName: { flex: 1, fontSize: fs(22), fontWeight: FONT_WEIGHT.heavy, letterSpacing: -0.3 },
  modalLabel: { fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.heavy, letterSpacing: 1.2, marginLeft: 4 },
  modalInput: {
    minHeight: 80, borderRadius: 16, borderWidth: 1.5,
    paddingHorizontal: SPACING.md, paddingVertical: 14, fontSize: fs(16),
    fontWeight: FONT_WEIGHT.semibold, textAlignVertical: 'top',
  },
  dateInput: { minHeight: 56, textAlignVertical: 'center' },
  dateError: {
    color: COLORS.error, fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold,
    marginTop: -4, marginBottom: 8, marginLeft: 4,
  },
  markBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    minHeight: 56, paddingHorizontal: SPACING.lg, borderRadius: RADIUS.full, gap: 10,
  },
  markBtnText: { fontSize: fs(18), fontWeight: FONT_WEIGHT.heavy, color: COLORS.white, letterSpacing: -0.2 },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    minHeight: 52, borderRadius: RADIUS.full, borderWidth: 1.5, borderStyle: 'dashed', marginBottom: SPACING.md,
  },
  addBtnText: { fontSize: fs(16), fontWeight: FONT_WEIGHT.heavy },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 48 },
  deleteText: { color: COLORS.error, fontSize: fs(16), fontWeight: FONT_WEIGHT.bold },
  remindCard: {
    flexDirection: 'row', alignItems: 'center', gap: 16,
    padding: 16, borderRadius: 20, marginBottom: SPACING.md,
  },
});
