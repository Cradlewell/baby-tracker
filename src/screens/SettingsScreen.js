import React from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Switch, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { deleteBabyAndData, clearAllData } from '../lib/dataReset';

import { useBabyStore } from '../store/useBabyStore';
import { COLORS, DARK_COLORS, GRADIENTS } from '../constants/colors';
import GradientView from '../components/GradientView';
import { FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING, SHADOW } from '../constants/theme';

function SettingRow({ icon, color, gradient, tileBg, label, labelColor, sub, right, onPress, C }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={!onPress}
      style={styles.row}
      accessibilityRole={onPress ? 'button' : 'none'}
      accessibilityLabel={label}
    >
      {gradient ? (
        <GradientView colors={gradient} style={styles.rowIcon}>
          <Ionicons name={icon} size={20} color={COLORS.white} />
        </GradientView>
      ) : (
        <View style={[styles.rowIcon, { backgroundColor: tileBg || C.border }]}>
          <Ionicons name={icon} size={20} color={color || C.textSecondary} />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowLabel, { color: labelColor || C.text }]}>{label}</Text>
        {sub && <Text style={[styles.rowSub, { color: C.textSecondary }]}>{sub}</Text>}
      </View>
      {right}
    </TouchableOpacity>
  );
}

export default function SettingsScreen({ navigation }) {
  const {
    darkMode, setDarkMode,
    babies, activeBabyId, setActiveBaby,
  } = useBabyStore();
  const C = darkMode ? DARK_COLORS : COLORS;
  const insets = useSafeAreaInsets();
  const errorTint = darkMode ? COLORS.error + '22' : COLORS.errorLight;

  const handleExport = () => {
    Alert.alert(
      'Export Data',
      'All data is stored only on this device — nothing is uploaded. An export feature is coming in a future update.',
      [{ text: 'OK' }]
    );
  };

  const handleResetOnboarding = () => {
    Alert.alert(
      'Add New Baby',
      'This will take you through onboarding to add another baby profile.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          onPress: () => {
            navigation.goBack();
            setTimeout(() => navigation.navigate('Onboarding'), 100);
          },
        },
      ]
    );
  };

  const handleDeleteBaby = (b) => {
    if (babies.length === 1) {
      Alert.alert(
        'Cannot Delete',
        'You must have at least one baby profile. Add another baby before deleting this one.',
        [{ text: 'OK' }]
      );
      return;
    }
    Alert.alert(
      `Delete ${b.name}?`,
      `This will permanently delete ${b.name}'s profile and all their tracking data. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteBabyAndData(b.id);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          },
        },
      ]
    );
  };

  const handleClearData = () => {
    Alert.alert(
      'Clear All Data',
      'This will permanently delete every baby profile and all tracking data on this device. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await clearAllData();
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            navigation.reset({ index: 0, routes: [{ name: 'Onboarding' }] });
          },
        },
      ]
    );
  };

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
            <Text style={[styles.title, { color: C.text }]}>Settings</Text>
            <Text style={[styles.subtitle, { color: C.textSecondary }]}>Profiles, display & data</Text>
          </View>
        </View>

        {/* App card */}
        <GradientView colors={GRADIENTS.brand} bubbles style={[styles.appCard, SHADOW.lg]}>
          <View style={styles.appIcon}>
            <Ionicons name="heart" size={24} color={COLORS.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.appName}>Cradlewell Bloom</Text>
            <Text style={styles.appSub}>
              {babies.length} baby profile{babies.length === 1 ? '' : 's'}
            </Text>
          </View>
          <View style={styles.appChip}>
            <Ionicons name="lock-closed" size={12} color={COLORS.white} />
            <Text style={styles.appChipText}>On-device</Text>
          </View>
        </GradientView>

        {/* Baby profiles */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: C.textSecondary }]}>BABY PROFILES</Text>
          <View style={[styles.groupCard, { backgroundColor: C.card, borderColor: C.border }, SHADOW.sm]}>
            {babies.map((b, i) => {
              const isActive = b.id === activeBabyId;
              return (
                <View key={b.id}>
                  {i > 0 && <View style={[styles.divider, { backgroundColor: C.border }]} />}
                  <View style={styles.babyRow}>
                    <TouchableOpacity
                      onPress={() => setActiveBaby(b.id)}
                      accessibilityRole="button"
                      accessibilityLabel={`Switch to ${b.name}`}
                    >
                      {isActive ? (
                        <GradientView colors={GRADIENTS.brand} style={styles.babyAvatarBtn}>
                          <Text style={[styles.babyInitial, { color: COLORS.white }]}>{b.name?.[0]?.toUpperCase()}</Text>
                        </GradientView>
                      ) : (
                        <View style={[styles.babyAvatarBtn, { backgroundColor: C.border }]}>
                          <Text style={[styles.babyInitial, { color: C.textSecondary }]}>{b.name?.[0]?.toUpperCase()}</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.babyName, { color: C.text }]} numberOfLines={1}>
                        {b.name}{isActive ? '  ✓' : ''}
                      </Text>
                      <Text style={[styles.babySub, { color: C.textSecondary }]}>
                        {b.gender} · {b.dob}
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => navigation.navigate('EditBaby', { babyId: b.id })}
                      style={[styles.editBtn, { backgroundColor: C.primaryLight }]}
                      accessibilityRole="button"
                      accessibilityLabel={`Edit ${b.name}'s profile`}
                    >
                      <Ionicons name="pencil" size={14} color={COLORS.primary} />
                      <Text style={[styles.editBtnText, { color: COLORS.primary }]}>Edit</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleDeleteBaby(b)}
                      style={[styles.deleteBtn, { backgroundColor: errorTint, borderColor: COLORS.error + '33' }]}
                      accessibilityRole="button"
                      accessibilityLabel={`Delete ${b.name}'s profile`}
                    >
                      <Ionicons name="trash-outline" size={15} color={COLORS.error} />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        </View>

        {/* Display */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: C.textSecondary }]}>DISPLAY</Text>
          <View style={[styles.groupCard, { backgroundColor: C.card, borderColor: C.border }, SHADOW.sm]}>
            <SettingRow
              C={C}
              icon="moon"
              gradient={GRADIENTS.sleep}
              label="Dark Mode"
              sub="Night-friendly dark theme"
              right={
                <Switch
                  value={darkMode}
                  onValueChange={(v) => { Haptics.selectionAsync(); setDarkMode(v); }}
                  trackColor={{ false: darkMode ? C.border : COLORS.gray200, true: COLORS.sleep }}
                  thumbColor={COLORS.white}
                  accessibilityLabel="Toggle dark mode"
                />
              }
            />
          </View>
        </View>

        {/* Data */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: C.textSecondary }]}>DATA</Text>
          <View style={[styles.groupCard, { backgroundColor: C.card, borderColor: C.border }, SHADOW.sm]}>
            <SettingRow
              C={C}
              icon="download-outline"
              gradient={GRADIENTS.growth}
              label="Export Data"
              sub="Coming soon · data stays on this device"
              onPress={handleExport}
              right={<Ionicons name="chevron-forward" size={16} color={C.textMuted} />}
            />
            <View style={[styles.divider, { backgroundColor: C.border }]} />
            <SettingRow
              C={C}
              icon="person-add-outline"
              gradient={GRADIENTS.brand}
              label="Add Another Baby"
              onPress={handleResetOnboarding}
              right={<Ionicons name="chevron-forward" size={16} color={C.textMuted} />}
            />
          </View>
        </View>

        {/* Danger zone */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: COLORS.error }]}>DANGER ZONE</Text>
          <View style={[styles.groupCard, { backgroundColor: C.card, borderColor: COLORS.error + '40' }, SHADOW.sm]}>
            <SettingRow
              C={C}
              icon="trash-outline"
              color={COLORS.error}
              tileBg={errorTint}
              label="Clear All Data"
              labelColor={COLORS.error}
              sub="Permanently delete everything"
              onPress={handleClearData}
              right={<Ionicons name="chevron-forward" size={16} color={COLORS.error} />}
            />
          </View>
        </View>

        <Text style={[styles.footer, { color: C.textMuted }]}>
          Cradlewell Bloom v1.0.0{'\n'}Your comfort is our care
        </Text>
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
  appCard: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    padding: SPACING.lg, borderRadius: RADIUS.xxl, marginBottom: SPACING.lg,
  },
  appIcon: {
    width: 52, height: 52, borderRadius: 26, backgroundColor: COLORS.white,
    alignItems: 'center', justifyContent: 'center',
  },
  appName: { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.heavy, color: COLORS.white, letterSpacing: -0.3 },
  appSub: { fontSize: FONT_SIZE.sm, marginTop: 2, color: 'rgba(255,255,255,0.9)', fontWeight: FONT_WEIGHT.medium },
  appChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: RADIUS.full,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  appChipText: { fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.bold, color: COLORS.white },
  section: { marginBottom: SPACING.lg },
  sectionTitle: { fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.heavy, letterSpacing: 1.2, marginBottom: 10, marginLeft: 4 },
  groupCard: { borderRadius: RADIUS.xl, borderWidth: 1, overflow: 'hidden' },
  babyRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, padding: SPACING.md, minHeight: 70 },
  babyAvatarBtn: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  babyInitial: { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.heavy },
  babyName: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.bold },
  babySub: { fontSize: FONT_SIZE.sm, marginTop: 2, textTransform: 'capitalize' },
  editBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingVertical: 7, paddingHorizontal: 12, borderRadius: RADIUS.full,
  },
  editBtnText: { fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.heavy },
  deleteBtn: {
    width: 32, height: 32, borderRadius: 16, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, padding: SPACING.md, minHeight: 70 },
  rowIcon: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.bold },
  rowSub: { fontSize: FONT_SIZE.sm, marginTop: 2 },
  divider: { height: 1, marginLeft: 76, marginRight: SPACING.md },
  footer: { textAlign: 'center', fontSize: FONT_SIZE.sm, marginTop: SPACING.sm, lineHeight: 20 },
});
