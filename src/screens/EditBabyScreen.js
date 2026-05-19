import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, Alert, ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { useBabyStore } from '../store/useBabyStore';
import { useVaccinationStore } from '../store/useVaccinationStore';
import { COLORS, DARK_COLORS } from '../constants/colors';
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
    if (dob.length !== 10) {
      Alert.alert('Invalid date', 'Please enter a complete date: DD/MM/YYYY');
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
          >
            <Ionicons name="chevron-back" size={24} color={C.text} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: C.text }]}>Edit Profile</Text>
          <View style={{ width: 24 }} />
        </View>

        <View style={styles.avatarWrap}>
          <View style={[styles.avatar, { backgroundColor: COLORS.primaryLight }]}>
            <Text style={[styles.avatarLetter, { color: COLORS.primary }]}>
              {name?.[0]?.toUpperCase() || '?'}
            </Text>
          </View>
        </View>

        <Text style={[styles.label, { color: C.textSecondary }]}>BABY NAME</Text>
        <TextInput
          style={[styles.input, { color: C.text, backgroundColor: C.card, borderColor: C.border }]}
          value={name}
          onChangeText={setName}
          placeholder="Enter baby's name"
          placeholderTextColor={COLORS.textMuted}
          autoCapitalize="words"
        />

        <Text style={[styles.label, { color: C.textSecondary }]}>DATE OF BIRTH</Text>
        <TextInput
          style={[styles.input, { color: C.text, backgroundColor: C.card, borderColor: C.border }]}
          value={dob}
          onChangeText={(t) => {
            let v = t.replace(/\D/g, '');
            if (v.length > 2) v = v.slice(0, 2) + '/' + v.slice(2);
            if (v.length > 5) v = v.slice(0, 5) + '/' + v.slice(5, 9);
            setDob(v);
          }}
          placeholder="DD/MM/YYYY"
          placeholderTextColor={COLORS.textMuted}
          keyboardType="number-pad"
          maxLength={10}
        />
        <Text style={[styles.hint, { color: C.textMuted }]}>
          Changing DOB will recalculate age &amp; vaccine schedule
        </Text>

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
                gender === g.value && { backgroundColor: COLORS.primaryLight, borderColor: COLORS.primary },
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
          style={[styles.saveBtn, { backgroundColor: COLORS.primary }]}
          accessibilityRole="button"
          accessibilityLabel="Save changes"
        >
          <Ionicons name="checkmark-circle" size={22} color={COLORS.white} />
          <Text style={styles.saveBtnText}>Save Changes</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: SPACING.lg },
  header: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: SPACING.xl,
  },
  title: { fontSize: FONT_SIZE.xl, fontWeight: FONT_WEIGHT.bold },
  avatarWrap: { alignItems: 'center', marginBottom: SPACING.xl },
  avatar: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center' },
  avatarLetter: { fontSize: 36, fontWeight: FONT_WEIGHT.bold },
  label: {
    fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.semibold,
    letterSpacing: 1, marginBottom: SPACING.sm,
  },
  input: {
    height: 52, borderRadius: RADIUS.lg, borderWidth: 1.5,
    paddingHorizontal: SPACING.md, fontSize: FONT_SIZE.md, marginBottom: SPACING.sm,
  },
  hint: { fontSize: FONT_SIZE.xs, marginBottom: SPACING.md },
  genderRow: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.xl },
  genderBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, padding: SPACING.md, borderRadius: RADIUS.xl, borderWidth: 1.5,
  },
  genderLabel: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.semibold },
  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    padding: 18, borderRadius: RADIUS.xl, gap: 8, ...SHADOW.md,
  },
  saveBtnText: { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold, color: COLORS.white },
});
