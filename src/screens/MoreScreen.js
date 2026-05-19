import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { useBabyStore } from '../store/useBabyStore';
import { COLORS, DARK_COLORS } from '../constants/colors';
import { FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING, SHADOW } from '../constants/theme';
import { calcAge } from '../utils/formatters';

function MenuSection({ title, items, C }) {
  return (
    <View style={styles.section}>
      {title && <Text style={[styles.sectionTitle, { color: C.textSecondary }]}>{title}</Text>}
      <View style={[styles.menuCard, { backgroundColor: C.card, borderColor: C.border }]}>
        {items.map((item, i) => (
          <View key={item.label}>
            <TouchableOpacity
              onPress={item.onPress}
              style={styles.menuRow}
              accessibilityRole="button"
              accessibilityLabel={item.label}
            >
              <View style={[styles.menuIcon, { backgroundColor: item.color + '18' }]}>
                <Ionicons name={item.icon} size={20} color={item.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.menuLabel, { color: C.text }]}>{item.label}</Text>
                {item.sub && <Text style={[styles.menuSub, { color: C.textSecondary }]}>{item.sub}</Text>}
              </View>
              {item.badge && (
                <View style={[styles.badge, { backgroundColor: item.badgeColor || COLORS.error }]}>
                  <Text style={styles.badgeText}>{item.badge}</Text>
                </View>
              )}
              <Ionicons name="chevron-forward" size={16} color={C.textMuted} />
            </TouchableOpacity>
            {i < items.length - 1 && <View style={[styles.divider, { backgroundColor: C.border }]} />}
          </View>
        ))}
      </View>
    </View>
  );
}

export default function MoreScreen({ navigation }) {
  const { getActiveBaby, darkMode } = useBabyStore();
  const baby = getActiveBaby();
  const C = darkMode ? DARK_COLORS : COLORS;
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { backgroundColor: C.background }]}>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 100 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Baby card */}
        {baby && (
          <View style={[styles.babyCard, { backgroundColor: COLORS.primaryLight }]}>
            <View style={styles.babyAvatar}>
              <Text style={styles.babyAvatarText}>{baby.name?.[0]?.toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.babyName, { color: COLORS.primary }]}>{baby.name}</Text>
              <Text style={[styles.babyAge, { color: COLORS.textSecondary }]}>{calcAge(baby.dob)}</Text>
            </View>
            <Ionicons name={baby.gender === 'girl' ? 'female' : baby.gender === 'boy' ? 'male' : 'person'} size={20} color={COLORS.primary} />
          </View>
        )}

        <MenuSection
          title="TRACK"
          C={C}
          items={[
            {
              label: 'Diaper Log',
              sub: 'Wet, dirty, mixed',
              icon: 'water',
              color: COLORS.diaper,
              onPress: () => navigation.navigate('Diaper'),
            },
            {
              label: 'Medicine',
              sub: 'Track doses & reminders',
              icon: 'medical',
              color: COLORS.medicine,
              onPress: () => navigation.navigate('Medicine'),
            },
            {
              label: 'Vaccination',
              sub: 'Schedule & completed',
              icon: 'shield-checkmark',
              color: COLORS.vaccination,
              onPress: () => navigation.navigate('Vaccination'),
            },
          ]}
        />

        <MenuSection
          title="REPORTS"
          C={C}
          items={[
            {
              label: 'Daily Summary',
              sub: "Today's full report",
              icon: 'bar-chart',
              color: COLORS.primary,
              onPress: () => navigation.navigate('Summary'),
            },
          ]}
        />

        <MenuSection
          title="PREFERENCES"
          C={C}
          items={[
            {
              label: 'Settings',
              sub: 'Dark mode, notifications',
              icon: 'settings',
              color: COLORS.textSecondary,
              onPress: () => navigation.navigate('Settings'),
            },
          ]}
        />

        <Text style={[styles.version, { color: C.textMuted }]}>Cradlewell Bloom v1.0 · Your comfort is our care</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: SPACING.lg },
  babyCard: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    padding: SPACING.md, borderRadius: RADIUS.xl, marginBottom: SPACING.lg,
  },
  babyAvatar: {
    width: 52, height: 52, borderRadius: 26, backgroundColor: COLORS.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  babyAvatarText: { fontSize: FONT_SIZE.xl, fontWeight: FONT_WEIGHT.bold, color: COLORS.white },
  babyName: { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold },
  babyAge: { fontSize: FONT_SIZE.sm, marginTop: 2 },
  section: { marginBottom: SPACING.md },
  sectionTitle: { fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.semibold, letterSpacing: 1, marginBottom: SPACING.sm },
  menuCard: { borderRadius: RADIUS.xl, borderWidth: 1, overflow: 'hidden' },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, padding: SPACING.md, minHeight: 64 },
  menuIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  menuLabel: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.semibold },
  menuSub: { fontSize: FONT_SIZE.sm, marginTop: 2 },
  divider: { height: 1, marginHorizontal: SPACING.md },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: RADIUS.full },
  badgeText: { fontSize: FONT_SIZE.xs, color: COLORS.white, fontWeight: FONT_WEIGHT.bold },
  version: { textAlign: 'center', fontSize: FONT_SIZE.sm, marginTop: SPACING.xl },
});
