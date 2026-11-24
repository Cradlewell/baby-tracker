import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, Alert, ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { useBabyStore } from '../store/useBabyStore';
import { useVaccinationStore } from '../store/useVaccinationStore';
import { validateDob, formatDobInput } from '../utils/formatters';
import { COLORS, DARK_COLORS, GRADIENTS } from '../constants/colors';
import GradientView from '../components/GradientView';
import { FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING, SHADOW } from '../constants/theme';

export default function EditBabyScreen({ navigation, route }) {
  const { babyId } = route.params;
  const { babies, darkMode, updateBaby } = useBabyStore();
  const regenerateSchedule = useVaccinationStore((s) => s.regenerateSchedule);
  const baby = babies.find((b) => b.id === babyId);
  const C = darkMode ? DARK_COLORS : COLORS;
  const insets = useSafeAreaInsets();

  const [name, setName] = useState(baby?.name || '');
  const [dob, setDob] = useState(baby?.dob || '');
  const [gender, setGender] = useState(baby?.gender || 'girl');

  const handleSave = () => {
    if (!name.trim()) {
      Alert.alert('Name required', "Please enter baby's name.");
      return;
    }
    const dobError = validateDob(dob);
    if (dobError) {
      Alert.alert('Invalid date of birth', dobError);
      return;
    }

    const dobChanged = dob !== baby?.dob;

    const doSave = async () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await updateBaby(babyId, { name: name.trim(), dob, gender });
      if (dobChanged) await regenerateSchedule(babyId, dob);
      navigation.goBack();
    };

    if (dobChanged) {
      Alert.alert(
        'Update Date of Birth?',
        "This will recalculate baby's age and vaccine schedule. Past logs will not be deleted.",
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Continue', onPress: doSave },
        ]
      );
    } else {
      doSave();
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: C.background }]}>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 40 },
        ]}
        keyboardShouldPersistTaps="handled"
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
            <Text style={[styles.title, { color: C.text }]}>Edit Profile</Text>
            <Text style={[styles.subtitle, { color: C.textSecondary }]}>Name, birthday & more</Text>
          </View>
        </View>

        {/* Avatar hero */}
        <GradientView colors={GRADIENTS.brand} bubbles style={[styles.hero, SHADOW.lg]}>
          <View style={styles.avatarRing}>
            <View style={styles.avatar}>
              <Text style={styles.avatarLetter}>
                {name?.[0]?.toUpperCase() || '?'}
              </Text>
            </View>
          </View>
          <Text style={styles.heroName} numberOfLines={1}>{name.trim() || "Baby's name"}</Text>
          {!!dob && (
            <View style={styles.heroChip}>
              <Ionicons name="calendar-outline" size={13} color={COLORS.white} />
              <Text style={styles.heroChipText}>{dob}</Text>
            </View>
          )}
        </GradientView>

        <Text style={[styles.label, { color: C.textSecondary }]}>BABY NAME</Text>
        <TextInput
          style={[styles.input, { color: C.text, backgroundColor: C.card, borderColor: C.border }]}
          value={name}
          onChangeText={setName}
          placeholder="Enter baby's name"
          placeholderTextColor={C.textMuted}
          autoCapitalize="words"
        />

        <Text style={[styles.label, { color: C.textSecondary }]}>DATE OF BIRTH</Text>
        <TextInput
          style={[styles.input, { color: C.text, backgroundColor: C.card, borderColor: C.border }]}
          value={dob}
          onChangeText={(t) => setDob(formatDobInput(t))}
          placeholder="DD/MM/YYYY"
          placeholderTextColor={C.textMuted}
          keyboardType="number-pad"
          maxLength={10}
        />
        <View style={styles.hintRow}>
          <Ionicons name="information-circle-outline" size={14} color={C.textMuted} />
          <Text style={[styles.hint, { color: C.textMuted }]}>
            Changing DOB will recalculate age &amp; vaccine schedule
          </Text>
        </View>

        <Text style={[styles.label, { color: C.textSecondary, marginTop: SPACING.md }]}>GENDER</Text>
        <View style={styles.genderRow}>
          {[
            { value: 'girl', label: 'Girl', icon: 'female-outline' },
            { value: 'boy', label: 'Boy', icon: 'male-outline' },
          ].map((g) => (
            <TouchableOpacity
              key={g.value}
              onPress={() => setGender(g.value)}
              style={[
                styles.genderBtn,
                { backgroundColor: C.card, borderColor: C.border },
                gender === g.value && { backgroundColor: C.primaryLight, borderColor: COLORS.primary },
              ]}
              accessibilityRole="radio"
              accessibilityState={{ selected: gender === g.value }}
            >
              <Ionicons
                name={g.icon}
                size={20}
                color={gender === g.value ? COLORS.primary : C.textMuted}
              />
              <Text style={[
                styles.genderLabel,
                { color: gender === g.value ? COLORS.primary : C.text },
              ]}>
                {g.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          onPress={handleSave}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Save changes"
        >
          <GradientView
            colors={GRADIENTS.brand}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.saveBtn, SHADOW.md]}
          >
            <Ionicons name="checkmark-circle" size={22} color={COLORS.white} />
            <Text style={styles.saveBtnText}>Save Changes</Text>
          </GradientView>
        </TouchableOpacity>
      </ScrollView>
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
  hero: {
    alignItems: 'center', paddingVertical: SPACING.xl, paddingHorizontal: SPACING.lg,
    borderRadius: RADIUS.xxl, marginBottom: SPACING.xl,
  },
  avatarRing: { padding: 5, borderRadius: 50, backgroundColor: 'rgba(255,255,255,0.25)' },
  avatar: {
    width: 84, height: 84, borderRadius: 42, backgroundColor: COLORS.white,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarLetter: { fontSize: 38, fontWeight: FONT_WEIGHT.heavy, color: COLORS.primary },
  heroName: {
    fontSize: FONT_SIZE.xl, fontWeight: FONT_WEIGHT.heavy, color: COLORS.white,
    letterSpacing: -0.4, marginTop: SPACING.md,
  },
  heroChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: SPACING.sm,
    paddingHorizontal: 12, paddingVertical: 5, borderRadius: RADIUS.full,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  heroChipText: { fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.bold, color: COLORS.white },
  label: {
    fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.heavy,
    letterSpacing: 1.2, marginBottom: SPACING.sm, marginLeft: 4,
  },
  input: {
    minHeight: 56, borderRadius: RADIUS.lg, borderWidth: 1.5,
    paddingHorizontal: SPACING.md, fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.semibold,
    marginBottom: SPACING.md,
  },
  hintRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: -4, marginBottom: SPACING.md, marginLeft: 4 },
  hint: { flex: 1, fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.medium },
  genderRow: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.xl },
  genderBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, minHeight: 56, padding: SPACING.md, borderRadius: RADIUS.xl, borderWidth: 1.5,
  },
  genderLabel: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.bold },
  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    padding: 18, borderRadius: RADIUS.xl, gap: 8,
  },
  saveBtnText: { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.heavy, color: COLORS.white },
});
