import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

import { useBabyStore } from '../store/useBabyStore';
import { COLORS, DARK_COLORS, GRADIENTS } from '../constants/colors';
import GradientView from '../components/GradientView';
import { FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING, SHADOW } from '../constants/theme';
import { calcAge } from '../utils/formatters';
import { useHealthCheck } from '../lib/useHealthCheck';

function MenuSection({ title, items, C }) {
  return (
    <View style={styles.section}>
      {title && <Text style={[styles.sectionTitle, { color: C.textSecondary }]}>{title}</Text>}
      <View style={[styles.menuCard, { backgroundColor: C.card, borderColor: C.border }, SHADOW.sm]}>
        {items.map((item, i) => (
          <View key={item.label}>
            <TouchableOpacity
              onPress={item.onPress}
              style={styles.menuRow}
              accessibilityRole="button"
              accessibilityLabel={item.label}
            >
              <View style={[styles.menuIcon, { backgroundColor: item.tint || C.primaryLight }]}>
                {item.mci ? (
                  <MaterialCommunityIcons name={item.mci} size={22} color={item.iconColor || C.primary} />
                ) : (
                  <Ionicons name={item.icon.endsWith('-outline') ? item.icon : `${item.icon}-outline`} size={22} color={item.iconColor || C.primary} />
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.menuLabel, { color: C.text }]}>{item.label}</Text>
                {item.sub && <Text style={[styles.menuSub, { color: C.textSecondary }]}>{item.sub}</Text>}
              </View>
              {item.badge ? (
                <View style={[styles.badge, { backgroundColor: item.badgeColor || COLORS.error }]}>
                  <Text style={styles.badgeText}>{item.badge}</Text>
                </View>
              ) : null}
              <Ionicons name="chevron-forward" size={16} color={C.textMuted} />
            </TouchableOpacity>
            {i < items.length - 1 && <View style={[styles.divider, { backgroundColor: C.border }]} />}
          </View>
        ))}
      </View>
    </View>
  );
}

/** The Health tab: the baby's health records, medicines, vaccines and today's health check. */
export default function HealthScreen({ navigation }) {
  const { getActiveBaby, darkMode } = useBabyStore();
  const baby = getActiveBaby();
  const C = darkMode ? DARK_COLORS : COLORS;
  const insets = useSafeAreaInsets();
  const { alerts } = useHealthCheck();
  const urgent = alerts.filter((a) => a.level === 'urgent').length;

  return (
    <View style={[styles.container, { backgroundColor: C.background }]}>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 110 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.pageTitle, { color: C.text }]}>Health</Text>

        {/* Baby card */}
        {baby && (
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() => navigation.navigate('EditBaby', { babyId: baby.id })}
            accessibilityRole="button"
            accessibilityLabel={`Edit ${baby.name}'s profile`}
          >
            <GradientView colors={GRADIENTS.brand} style={[styles.babyCard, SHADOW.lg]}>
              <View style={styles.babyAvatarRing}>
                <View style={styles.babyAvatar}>
                  <Text style={styles.babyAvatarText}>{baby.name?.[0]?.toUpperCase()}</Text>
                </View>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.babyName} numberOfLines={1}>{baby.name}</Text>
                <Text style={styles.babyAge}>{calcAge(baby.dob)}</Text>
              </View>
              <View style={styles.babyChip}>
                <Ionicons name={baby.gender === 'girl' ? 'female' : baby.gender === 'boy' ? 'male' : 'person'} size={16} color={COLORS.white} />
              </View>
            </GradientView>
          </TouchableOpacity>
        )}

        <MenuSection
          title="TODAY"
          C={C}
          items={[
            {
              label: 'Health alerts',
              sub: alerts.length ? `${alerts.length} to check${urgent ? ` · ${urgent} urgent` : ''}` : 'Everything logged is within the usual range',
              icon: alerts.length ? 'alert-circle' : 'checkmark-circle',
              tint: alerts.length ? (urgent ? COLORS.error + '1F' : COLORS.warning + '1F') : COLORS.success + '1F',
              iconColor: alerts.length ? (urgent ? COLORS.error : COLORS.warning) : COLORS.success,
              badge: alerts.length ? String(alerts.length) : null,
              badgeColor: urgent ? COLORS.error : COLORS.warning,
              onPress: () => navigation.navigate('HealthAlerts'),
            },
          ]}
        />

        <MenuSection
          title="MEDICINES & VACCINES"
          C={C}
          items={[
            { label: 'Medication', sub: 'Track doses & reminders', mci: 'calendar-clock', onPress: () => navigation.navigate('Medicine') },
            { label: 'Vaccination', sub: 'Schedule & completed', mci: 'needle', onPress: () => navigation.navigate('Vaccination') },
          ]}
        />

        <MenuSection
          title="HEALTH CHECKS"
          C={C}
          items={[
            { label: 'Temperature', sub: 'Track body temperature', mci: 'thermometer', onPress: () => navigation.navigate('Temperature') },
            { label: 'Breathing', sub: 'Respiratory rate & effort', mci: 'lungs', onPress: () => navigation.navigate('Breathing') },
            { label: 'Skin & Jaundice', sub: 'Rash, yellowing, skin changes', mci: 'face-man-shimmer-outline', onPress: () => navigation.navigate('Skin') },
          ]}
        />

        <MenuSection
          title="DEVELOPMENT"
          C={C}
          items={[
            { label: 'Milestones', sub: 'Smiles, rolling, sitting and more', icon: 'flag-outline', onPress: () => navigation.navigate('Milestones') },
          ]}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: SPACING.lg },
  pageTitle: { fontSize: FONT_SIZE.xxl, fontWeight: FONT_WEIGHT.heavy, letterSpacing: -0.8, marginBottom: SPACING.md },
  babyCard: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    padding: SPACING.lg, borderRadius: RADIUS.xxl, marginBottom: SPACING.lg,
  },
  babyAvatarRing: { padding: 4, borderRadius: 36, backgroundColor: 'rgba(255,255,255,0.25)' },
  babyAvatar: {
    width: 54, height: 54, borderRadius: 27, backgroundColor: COLORS.white,
    alignItems: 'center', justifyContent: 'center',
  },
  babyAvatarText: { fontSize: FONT_SIZE.xl, fontWeight: FONT_WEIGHT.heavy, color: COLORS.primary },
  babyName: { fontSize: FONT_SIZE.xl, fontWeight: FONT_WEIGHT.heavy, color: COLORS.white, letterSpacing: -0.4 },
  babyAge: { fontSize: FONT_SIZE.sm, marginTop: 3, color: 'rgba(255,255,255,0.9)', fontWeight: FONT_WEIGHT.medium },
  babyChip: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center', justifyContent: 'center',
  },
  section: { marginBottom: SPACING.lg },
  sectionTitle: { fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.heavy, letterSpacing: 1.2, marginBottom: 10, marginLeft: 4 },
  menuCard: { borderRadius: RADIUS.xl, borderWidth: 1, overflow: 'hidden' },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, padding: SPACING.md, minHeight: 70 },
  menuIcon: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  menuLabel: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.bold },
  menuSub: { fontSize: FONT_SIZE.sm, marginTop: 2 },
  divider: { height: 1, marginLeft: 76, marginRight: SPACING.md },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: RADIUS.full },
  badgeText: { fontSize: FONT_SIZE.xs, color: COLORS.white, fontWeight: FONT_WEIGHT.bold },
});
