import React, { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, Animated, Dimensions, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useBabyStore } from '../store/useBabyStore';
import { useGrowthStore } from '../store/useGrowthStore';
import { validateDob, formatDobInput, parseDob, parsePositiveNumber } from '../utils/formatters';
import { COLORS } from '../constants/colors';
import { FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING, SHADOW } from '../constants/theme';

const { width: W } = Dimensions.get('window');

const STEPS = ['name', 'dob', 'gender', 'weight', 'feeding'];
const STEP_LABELS = ["Baby's name", 'Date of birth', 'Gender', 'Birth weight', 'Feeding type'];

function ProgressDots({ current, total }) {
  return (
    <View style={styles.dots}>
      {Array.from({ length: total }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.dot,
            i === current && styles.dotActive,
            i < current && styles.dotDone,
          ]}
        />
      ))}
    </View>
  );
}

function OptionPill({ label, selected, onPress, icon }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={[styles.pill, selected && styles.pillSelected]}
    >
      {icon && <Ionicons name={icon} size={18} color={selected ? COLORS.primary : COLORS.textSecondary} />}
      <Text style={[styles.pillText, selected && styles.pillTextSelected]}>{label}</Text>
    </TouchableOpacity>
  );
}

export default function OnboardingScreen({ navigation }) {
  const addBaby = useBabyStore((s) => s.addBaby);
  const insets = useSafeAreaInsets();

  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    name: '', dob: '', gender: 'girl',
    birthWeight: '', weightUnit: 'kg', feedingType: 'breast',
  });

  const slideAnim = useRef(new Animated.Value(0)).current;

  const animateNext = (dir = 1) => {
    Animated.sequence([
      Animated.timing(slideAnim, { toValue: -W * dir, duration: 200, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: W * dir, duration: 0, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 250, useNativeDriver: true }),
    ]).start();
  };

  const [saving, setSaving] = useState(false);

  const dobError = form.dob.length === 10 ? validateDob(form.dob) : null;
  const weightValue = parsePositiveNumber(form.birthWeight);
  const weightLimits = form.weightUnit === 'lbs' ? [0.7, 15] : [0.3, 7];
  const weightError = form.birthWeight.trim() && (!weightValue || weightValue < weightLimits[0] || weightValue > weightLimits[1])
    ? `Birth weight should be between ${weightLimits[0]} and ${weightLimits[1]} ${form.weightUnit}`
    : null;

  // Name and date of birth are required; the later steps are optional.
  const canContinue = () => {
    if (step === 0) return form.name.trim().length > 0;
    if (step === 1) return form.dob.length === 10 && !dobError;
    if (step === 3) return !weightError;
    return true;
  };
  const canSkip = step >= 2 && step < STEPS.length - 1;

  const goNext = () => {
    if (step < STEPS.length - 1) {
      animateNext(1);
      setStep(step + 1);
    } else {
      finish();
    }
  };

  const skip = () => {
    if (STEPS[step] === 'weight') setForm({ ...form, birthWeight: '' });
    animateNext(1);
    setStep(step + 1);
  };

  const goBack = () => {
    if (step === 0) return;
    animateNext(-1);
    setStep(step - 1);
  };

  const finish = async () => {
    if (saving) return;
    setSaving(true);
    const baby = await addBaby({
      name: form.name.trim(),
      dob: form.dob,
      gender: form.gender,
      birthWeight: weightValue ? String(weightValue) : '',
      weightUnit: form.weightUnit,
      feedingType: form.feedingType,
    });
    // Record the birth weight as the first growth measurement.
    if (weightValue && !weightError) {
      const birth = parseDob(form.dob);
      await useGrowthStore.getState().addEntry(baby.id, {
        weight: weightValue,
        unit: form.weightUnit,
        notes: 'Birth weight',
        date: birth ? birth.toISOString() : undefined,
      });
    }
    // Opened from inside the app ("Add baby") → go back; first launch → replace with Main.
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.replace('Main');
  };

  const renderStep = () => {
    switch (STEPS[step]) {
      case 'name':
        return (
          <View style={styles.stepContent}>
            <Text style={styles.stepEmoji}>👶</Text>
            <Text style={styles.stepTitle}>What's your baby's name?</Text>
            <Text style={styles.stepSub}>You can change this anytime</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Aria, Noah..."
              placeholderTextColor={COLORS.textMuted}
              value={form.name}
              onChangeText={(t) => setForm({ ...form, name: t })}
              autoFocus
              returnKeyType="next"
              onSubmitEditing={canContinue() ? goNext : undefined}
            />
          </View>
        );
      case 'dob':
        return (
          <View style={styles.stepContent}>
            <Text style={styles.stepEmoji}>🎂</Text>
            <Text style={styles.stepTitle}>When was {form.name || 'baby'} born?</Text>
            <Text style={styles.stepSub}>Enter date of birth</Text>
            <TextInput
              style={styles.input}
              placeholder="DD / MM / YYYY"
              placeholderTextColor={COLORS.textMuted}
              value={form.dob}
              onChangeText={(t) => setForm({ ...form, dob: formatDobInput(t) })}
              keyboardType="number-pad"
              maxLength={10}
            />
            {dobError && <Text style={styles.errorText}>{dobError}</Text>}
          </View>
        );
      case 'gender':
        return (
          <View style={styles.stepContent}>
            <Text style={styles.stepEmoji}>💝</Text>
            <Text style={styles.stepTitle}>Gender</Text>
            <Text style={styles.stepSub}>Helps personalize your experience</Text>
            <View style={styles.pillRow}>
              {[
                { value: 'girl', label: 'Girl', icon: 'female-outline' },
                { value: 'boy', label: 'Boy', icon: 'male-outline' },
              ].map((g) => (
                <OptionPill
                  key={g.value}
                  label={g.label}
                  icon={g.icon}
                  selected={form.gender === g.value}
                  onPress={() => setForm({ ...form, gender: g.value })}
                />
              ))}
            </View>
          </View>
        );
      case 'weight':
        return (
          <View style={styles.stepContent}>
            <Text style={styles.stepEmoji}>⚖️</Text>
            <Text style={styles.stepTitle}>Birth weight</Text>
            <Text style={styles.stepSub}>Optional — track growth from day one</Text>
            <View style={styles.inputRow}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="e.g. 3.2"
                placeholderTextColor={COLORS.textMuted}
                value={form.birthWeight}
                onChangeText={(t) => setForm({ ...form, birthWeight: t })}
                keyboardType="decimal-pad"
              />
              <View style={styles.unitToggle}>
                {['kg', 'lbs'].map((u) => (
                  <TouchableOpacity
                    key={u}
                    onPress={() => setForm({ ...form, weightUnit: u })}
                    style={[styles.unitBtn, form.weightUnit === u && styles.unitBtnActive]}
                  >
                    <Text style={[styles.unitText, form.weightUnit === u && styles.unitTextActive]}>
                      {u}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            {weightError && <Text style={styles.errorText}>{weightError}</Text>}
          </View>
        );
      case 'feeding':
        return (
          <View style={styles.stepContent}>
            <Text style={styles.stepEmoji}>🍼</Text>
            <Text style={styles.stepTitle}>Feeding type</Text>
            <Text style={styles.stepSub}>We'll customize your tracker for this</Text>
            <View style={styles.pillColumn}>
              {[
                { value: 'breast', label: 'Breastfeeding', icon: 'heart-outline' },
                { value: 'bottle', label: 'Bottle / Formula', icon: 'beaker-outline' },
                { value: 'mixed', label: 'Mixed feeding', icon: 'shuffle-outline' },
              ].map((f) => (
                <OptionPill
                  key={f.value}
                  label={f.label}
                  icon={f.icon}
                  selected={form.feedingType === f.value}
                  onPress={() => setForm({ ...form, feedingType: f.value })}
                />
              ))}
            </View>
          </View>
        );
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={[styles.inner, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}>
        {/* Header */}
        <View style={styles.header}>
          {step > 0 ? (
            <TouchableOpacity onPress={goBack} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Ionicons name="chevron-back" size={24} color={COLORS.text} />
            </TouchableOpacity>
          ) : <View style={{ width: 24 }} />}
          <ProgressDots current={step} total={STEPS.length} />
          {canSkip ? (
            <TouchableOpacity onPress={skip} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Text style={styles.skipText}>Skip</Text>
            </TouchableOpacity>
          ) : <View style={{ width: 40 }} />}
        </View>

        {/* Content */}
        <Animated.View style={{ flex: 1, transform: [{ translateX: slideAnim }] }}>
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {renderStep()}
          </ScrollView>
        </Animated.View>

        {/* CTA */}
        <TouchableOpacity
          onPress={goNext}
          style={[styles.cta, (!canContinue() || saving) && styles.ctaDisabled]}
          disabled={!canContinue() || saving}
          accessibilityRole="button"
          accessibilityLabel={step === STEPS.length - 1 ? 'Get started' : 'Continue'}
        >
          <Text style={styles.ctaText}>
            {step === STEPS.length - 1 ? "Let's go 🎉" : 'Continue'}
          </Text>
          <Ionicons name="arrow-forward" size={18} color={COLORS.white} />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  inner: { flex: 1, paddingHorizontal: SPACING.lg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.xl },
  dots: { flexDirection: 'row', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.border },
  dotActive: { width: 20, backgroundColor: COLORS.primary },
  dotDone: { backgroundColor: COLORS.primaryLight },
  skipText: { fontSize: FONT_SIZE.sm, color: COLORS.textSecondary, fontWeight: FONT_WEIGHT.medium },
  errorText: { fontSize: FONT_SIZE.sm, color: COLORS.error, marginTop: SPACING.sm, textAlign: 'center' },
  scrollContent: { flexGrow: 1, justifyContent: 'center' },
  stepContent: { alignItems: 'center', gap: SPACING.md, paddingVertical: SPACING.xl },
  stepEmoji: { fontSize: 64 },
  stepTitle: { fontSize: FONT_SIZE.xxl, fontWeight: FONT_WEIGHT.bold, color: COLORS.text, textAlign: 'center' },
  stepSub: { fontSize: FONT_SIZE.md, color: COLORS.textSecondary, textAlign: 'center' },
  input: {
    width: '100%',
    minHeight: 56,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.card,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.md,
    fontSize: FONT_SIZE.lg,
    color: COLORS.text,
    fontWeight: FONT_WEIGHT.medium,
  },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, justifyContent: 'center' },
  pillColumn: { width: '100%', gap: SPACING.sm },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.xl,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    minWidth: 100,
    justifyContent: 'center',
  },
  pillSelected: { borderColor: COLORS.primary, backgroundColor: COLORS.primaryLight },
  pillText: { fontSize: FONT_SIZE.md, color: COLORS.textSecondary, fontWeight: FONT_WEIGHT.medium },
  pillTextSelected: { color: COLORS.primary, fontWeight: FONT_WEIGHT.semibold },
  inputRow: { flexDirection: 'row', gap: SPACING.sm, width: '100%' },
  unitToggle: { flexDirection: 'row', borderRadius: RADIUS.lg, overflow: 'hidden', borderWidth: 1.5, borderColor: COLORS.border },
  unitBtn: { paddingHorizontal: 16, paddingVertical: 14, backgroundColor: COLORS.card },
  unitBtnActive: { backgroundColor: COLORS.primary },
  unitText: { fontSize: FONT_SIZE.md, color: COLORS.textSecondary, fontWeight: FONT_WEIGHT.medium },
  unitTextActive: { color: COLORS.white, fontWeight: FONT_WEIGHT.semibold },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.xl,
    paddingVertical: 18,
    gap: 8,
    marginTop: SPACING.md,
    ...SHADOW.md,
  },
  ctaDisabled: { opacity: 0.5 },
  ctaText: { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold, color: COLORS.white },
});
