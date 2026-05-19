import React from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Switch, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useBabyStore } from '../store/useBabyStore';
import { COLORS, DARK_COLORS } from '../constants/colors';
import { FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING } from '../constants/theme';

function SettingRow({ icon, color, label, sub, right, onPress, C }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={!onPress}
      style={styles.row}
      accessibilityRole={onPress ? 'button' : 'none'}
      accessibilityLabel={label}
    >
      <View style={[styles.rowIcon, { backgroundColor: color + '18' }]}>
        <Ionicons name={icon} size={20} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowLabel, { color: C.text }]}>{label}</Text>
        {sub && <Text style={[styles.rowSub, { color: C.textSecondary }]}>{sub}</Text>}
      </View>
      {right}
    </TouchableOpacity>
  );
}

export default function SettingsScreen({ navigation }) {
  const {
    getActiveBaby, darkMode, setDarkMode,
    notificationsEnabled, setNotifications,
    babies, activeBabyId, setActiveBaby, deleteBaby,
  } = useBabyStore();
  const baby = getActiveBaby();
  const C = darkMode ? DARK_COLORS : COLORS;
  const insets = useSafeAreaInsets();

  const handleExport = () => {
    Alert.alert(
      'Export Data',
      'Your data is stored locally on this device. Export feature coming in a future update.',
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
            await deleteBaby(b.id);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          },
        },
      ]
    );
  };

  const handleClearData = () => {
    Alert.alert(
      'Clear All Data',
      'This will permanently delete all tracking data. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await AsyncStorage.clear();
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            Alert.alert('Done', 'All data has been cleared. Restart the app.');
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
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="chevron-back" size={24} color={C.text} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: C.text }]}>Settings</Text>
          <View style={{ width: 24 }} />
        </View>

        {/* Baby profiles */}
        <View style={[styles.card, { backgroundColor: C.card, borderColor: C.border }]}>
          <Text style={[styles.cardTitle, { color: C.textSecondary }]}>BABY PROFILES</Text>
          {babies.map((b, i) => {
            const isActive = b.id === activeBabyId;
            return (
              <View key={b.id}>
                {i > 0 && <View style={[styles.rowDivider, { backgroundColor: C.border }]} />}
                <View style={styles.babyRow}>
                  <TouchableOpacity
                    onPress={() => setActiveBaby(b.id)}
                    style={[
                      styles.babyAvatarBtn,
                      { backgroundColor: isActive ? COLORS.primary : COLORS.gray200 },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={`Switch to ${b.name}`}
                  >
                    <Text style={styles.babyInitial}>{b.name?.[0]?.toUpperCase()}</Text>
                  </TouchableOpacity>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.babyName, { color: C.text }]}>
                      {b.name}{isActive ? '  ✓' : ''}
                    </Text>
                    <Text style={[styles.babySub, { color: C.textSecondary }]}>
                      {b.gender} · {b.dob}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => navigation.navigate('EditBaby', { babyId: b.id })}
                    style={[styles.editBtn, { backgroundColor: COLORS.primaryLight }]}
                    accessibilityRole="button"
                    accessibilityLabel={`Edit ${b.name}'s profile`}
                  >
                    <Ionicons name="pencil" size={15} color={COLORS.primary} />
                    <Text style={[styles.editBtnText, { color: COLORS.primary }]}>Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleDeleteBaby(b)}
                    style={[styles.editBtn, { backgroundColor: COLORS.error + '15' }]}
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

        {/* Display */}
        <View style={[styles.card, { backgroundColor: C.card, borderColor: C.border }]}>
          <Text style={[styles.cardTitle, { color: C.textSecondary }]}>DISPLAY</Text>
          <SettingRow
            C={C}
            icon="moon"
            color={COLORS.sleep}
            label="Dark Mode"
            sub="Night-friendly dark theme"
            right={
              <Switch
                value={darkMode}
                onValueChange={(v) => { Haptics.selectionAsync(); setDarkMode(v); }}
                trackColor={{ false: COLORS.gray200, true: COLORS.sleep }}
                thumbColor={COLORS.white}
                accessibilityLabel="Toggle dark mode"
              />
            }
          />
        </View>

        {/* Notifications */}
        <View style={[styles.card, { backgroundColor: C.card, borderColor: C.border }]}>
          <Text style={[styles.cardTitle, { color: C.textSecondary }]}>NOTIFICATIONS</Text>
          <SettingRow
            C={C}
            icon="notifications"
            color={COLORS.primary}
            label="Push Notifications"
            sub="Feeding & medicine reminders"
            right={
              <Switch
                value={notificationsEnabled}
                onValueChange={(v) => { Haptics.selectionAsync(); setNotifications(v); }}
                trackColor={{ false: COLORS.gray200, true: COLORS.primary }}
                thumbColor={COLORS.white}
                accessibilityLabel="Toggle notifications"
              />
            }
          />
        </View>

        {/* Data */}
        <View style={[styles.card, { backgroundColor: C.card, borderColor: C.border }]}>
          <Text style={[styles.cardTitle, { color: C.textSecondary }]}>DATA</Text>
          <SettingRow
            C={C}
            icon="download-outline"
            color={COLORS.growth}
            label="Export Data"
            sub="Coming soon"
            onPress={handleExport}
            right={<Ionicons name="chevron-forward" size={16} color={C.textMuted} />}
          />
          <View style={[styles.rowDivider, { backgroundColor: C.border }]} />
          <SettingRow
            C={C}
            icon="person-add-outline"
            color={COLORS.primary}
            label="Add Another Baby"
            onPress={handleResetOnboarding}
            right={<Ionicons name="chevron-forward" size={16} color={C.textMuted} />}
          />
        </View>

        {/* Danger zone */}
        <View style={[styles.card, { backgroundColor: C.card, borderColor: COLORS.error + '30' }]}>
          <Text style={[styles.cardTitle, { color: COLORS.error }]}>DANGER ZONE</Text>
          <SettingRow
            C={C}
            icon="trash-outline"
            color={COLORS.error}
            label="Clear All Data"
            sub="Permanently delete everything"
            onPress={handleClearData}
            right={<Ionicons name="chevron-forward" size={16} color={COLORS.error} />}
          />
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
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.xl },
  title: { fontSize: FONT_SIZE.xl, fontWeight: FONT_WEIGHT.bold },
  card: { borderRadius: RADIUS.xl, borderWidth: 1, marginBottom: SPACING.md, overflow: 'hidden', paddingHorizontal: SPACING.md, paddingTop: SPACING.sm, paddingBottom: 4 },
  cardTitle: { fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.semibold, letterSpacing: 1, paddingVertical: SPACING.sm },
  babyRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, paddingVertical: SPACING.sm },
  babyAvatarBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  babyInitial: { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold, color: COLORS.white },
  babyName: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.semibold },
  babySub: { fontSize: FONT_SIZE.sm, marginTop: 2 },
  editBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingVertical: 6, paddingHorizontal: 10, borderRadius: RADIUS.full,
  },
  editBtnText: { fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.semibold },
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, paddingVertical: SPACING.md, minHeight: 60 },
  rowIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.semibold },
  rowSub: { fontSize: FONT_SIZE.sm, marginTop: 2 },
  rowDivider: { height: 1, marginHorizontal: -SPACING.md },
  footer: { textAlign: 'center', fontSize: FONT_SIZE.sm, marginTop: SPACING.md, lineHeight: 20 },
});
