import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Switch, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { deleteBabyAndData } from '../lib/dataReset';
import { logout } from '../lib/session';
import { openSwitchClient } from '../lib/switchClientFlow';
import { hasPendingChanges } from '../lib/storage';
import { useAuthStore } from '../store/useAuthStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { applyReminderSetting } from '../lib/reminders';
import { PinSheet, biometricsAvailable } from '../components/AppLock';
import { emailSupport } from './AboutScreen';
import { APP_NAME, APP_VERSION } from '../constants/app';

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
        <View style={[styles.rowIcon, { backgroundColor: C.primaryLight }]}>
          <Ionicons name={icon.endsWith('-outline') ? icon : `${icon}-outline`} size={22} color={C.primary} />
        </View>
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

const NOTIFY_ROWS = [
  { kind: 'health', icon: 'heart-outline', label: 'Health alerts', sub: 'Diaper colours, temperature, breathing, skin' },
  { kind: 'care', icon: 'nutrition-outline', label: 'Care alerts', sub: 'Long gap since a feed, few wet diapers' },
  { kind: 'medicine', icon: 'medkit-outline', label: 'Medicine reminders', sub: 'Sound when the next dose is due' },
  { kind: 'vaccine', icon: 'shield-checkmark-outline', label: 'Vaccine reminders', sub: 'Vaccines due soon or overdue' },
];

// The pages Settings opens; the main list shows one row for each.
const PAGES = {
  account: { title: 'Account', sub: 'Your login and the open client' },
  babies: { title: 'Baby profiles', sub: 'Switch, edit or add a baby' },
  notifications: { title: 'Notifications', sub: 'What this phone shows and rings for' },
  security: { title: 'Security', sub: 'App lock and password' },
};

export default function SettingsScreen({ navigation, route }) {
  const page = PAGES[route?.params?.page] ? route.params.page : null;
  // Shown as the Profile tab: no back button, room for the tab bar.
  const isTab = route?.name === 'Profile';
  const {
    darkMode, setDarkMode,
    babies, activeBabyId, setActiveBaby,
  } = useBabyStore();
  const C = darkMode ? DARK_COLORS : COLORS;
  const insets = useSafeAreaInsets();
  const errorTint = darkMode ? COLORS.error + '22' : COLORS.errorLight;
  const user = useAuthStore((s) => s.user);
  const client = useAuthStore((s) => s.client);
  const { notify, appLock, biometrics } = useSettingsStore();
  const [canBio, setCanBio] = useState(false);
  const [pinMode, setPinMode] = useState(null); // 'set' | 'verify' | 'change' while the PIN sheet is open
  useEffect(() => { biometricsAvailable().then(setCanBio); }, []);

  const switchProps = (value, onValueChange, label, tint = COLORS.primary) => ({
    value,
    onValueChange: (v) => { Haptics.selectionAsync(); onValueChange(v); },
    trackColor: { false: darkMode ? C.border : COLORS.gray200, true: tint },
    thumbColor: COLORS.white,
    accessibilityLabel: label,
  });

  const toggleNotify = async (kind, on) => {
    await useSettingsStore.getState().setNotify(kind, on);
    // Medicine and vaccine sounds are scheduled on the phone: stop them, or set them again.
    if (kind === 'medicine' || kind === 'vaccine') await applyReminderSetting(kind, on);
  };

  const onPinDone = async (pin) => {
    const mode = pinMode;
    setPinMode(null);
    const store = useSettingsStore.getState();
    if (mode === 'verify') {
      await store.disableLock();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      return;
    }
    await store.enableLock(pin, mode === 'change' ? biometrics : false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (mode === 'set' && canBio) {
      Alert.alert('Use fingerprint or face too?', 'Unlock the app with your fingerprint or face, and use the PIN when that does not work.', [
        { text: 'PIN only', style: 'cancel' },
        { text: 'Use it', onPress: () => store.setBiometrics(true) },
      ]);
    } else if (mode === 'change') {
      Alert.alert('PIN changed', 'Use your new PIN to open the app.');
    }
  };

  // Changes saved offline and not yet sent would be lost when leaving the client.
  const confirmLeave = async (title, message, actionLabel, action, nextRoute) => {
    const pending = await hasPendingChanges().catch(() => false);
    Alert.alert(
      title,
      pending
        ? `${message}\n\nSome changes made offline have not been uploaded yet and will be lost. Connect to the internet first to keep them.`
        : message,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: actionLabel,
          style: 'destructive',
          onPress: async () => {
            await action();
            navigation.reset({ index: 0, routes: [{ name: nextRoute }] });
          },
        },
      ]
    );
  };

  const handleLogout = () => confirmLeave(
    'Log out?',
    "You will need your email, password and the client's verification code to sign in again.",
    'Log out',
    logout,
    'Login'
  );

  const handleSwitchClient = () => openSwitchClient(navigation);


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
    if (!isClientAccount) return; // nurses can't delete a baby's data
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

  const chevron = <Ionicons name="chevron-forward" size={16} color={C.textMuted} />;
  const open = (to) => navigation.navigate('SettingsPage', { page: to });
  const divider = <View style={[styles.divider, { backgroundColor: C.border }]} />;
  const card = (children) => (
    <View style={[styles.groupCard, styles.section, { backgroundColor: C.card, borderColor: C.border }, SHADOW.sm]}>
      {children}
    </View>
  );
  const isClientAccount = user?.role === 'client';
  const activeBaby = babies.find((b) => b.id === activeBabyId);
  const notifyOn = NOTIFY_ROWS.filter((r) => notify[r.kind] !== false).length;

  // ---------- Main list ----------
  const main = (
    <>
      {/* Profile: opens the Account page */}
      <TouchableOpacity
        onPress={() => open('account')}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={`${user?.fullName || 'Account'}, view account`}
      >
        <GradientView colors={GRADIENTS.brand} style={[styles.appCard, SHADOW.lg]}>
          <View style={styles.appIcon}>
            <Text style={styles.profileInitial}>{(user?.fullName || '?')[0].toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.appName} numberOfLines={1}>{user?.fullName || 'Signed in'}</Text>
            <Text style={styles.appSub} numberOfLines={1}>{user?.email || (isClientAccount ? 'Parent account' : 'Nurse account')}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={COLORS.white} />
        </GradientView>
      </TouchableOpacity>

      {card(
        <>
          <SettingRow
            C={C}
            icon="people-outline"
            gradient
            label="Baby profiles"
            sub={`${babies.length} profile${babies.length === 1 ? '' : 's'}${activeBaby ? ` · ${activeBaby.name}` : ''}`}
            onPress={() => open('babies')}
            right={chevron}
          />
          {divider}
          <SettingRow
            C={C}
            icon="notifications-outline"
            gradient
            label="Notifications"
            sub={notifyOn === NOTIFY_ROWS.length ? 'All on' : notifyOn ? `${notifyOn} of ${NOTIFY_ROWS.length} on` : 'All off'}
            onPress={() => open('notifications')}
            right={chevron}
          />
          {divider}
          <SettingRow
            C={C}
            icon="lock-closed-outline"
            gradient
            label="Security"
            sub={appLock ? 'App lock on' : 'App lock off · change password'}
            onPress={() => open('security')}
            right={chevron}
          />
        </>
      )}

      {card(
        <SettingRow
          C={C}
          icon="moon"
          gradient
          label="Dark mode"
          sub="Night-friendly dark theme"
          right={<Switch {...switchProps(darkMode, setDarkMode, 'Dark mode', COLORS.sleep)} />}
        />
      )}

      {card(
        <>
          <SettingRow
            C={C}
            icon="shield-checkmark-outline"
            gradient
            label="Privacy policy"
            onPress={() => navigation.navigate('PrivacyPolicy')}
            right={chevron}
          />
          {divider}
          <SettingRow
            C={C}
            icon="information-circle-outline"
            gradient
            label="About us"
            sub={`Version ${APP_VERSION}`}
            onPress={() => navigation.navigate('About')}
            right={chevron}
          />
          {divider}
          <SettingRow
            C={C}
            icon="mail-outline"
            gradient
            label="Contact us"
            onPress={emailSupport}
            right={chevron}
          />
        </>
      )}

      {card(
        <SettingRow
          C={C}
          icon="log-out-outline"
          color={COLORS.error}
          tileBg={errorTint}
          label="Log out"
          labelColor={COLORS.error}
          onPress={handleLogout}
        />
      )}

      <Text style={[styles.footer, { color: C.textMuted }]}>
        {APP_NAME} v{APP_VERSION}{'\n'}For tracking only, not medical advice. Always consult your doctor.
      </Text>
    </>
  );

  // ---------- Account ----------
  const account = (
    <>
      {card(
        <>
          <SettingRow
            C={C}
            icon="person"
            gradient
            label={user?.fullName || 'Signed in'}
            sub={user?.email}
          />
          {/* A parent (client account) sees only their own account; nurses also see the open client. */}
          {isClientAccount ? null : (
            <>
              {divider}
              <SettingRow
                C={C}
                icon="people"
                gradient
                label={client?.name || 'Client'}
                sub={client?.phoneMasked ? `Verified client · ${client.phoneMasked}` : 'Verified client'}
              />
              {divider}
              <SettingRow
                C={C}
                icon="swap-horizontal"
                gradient
                label="Switch client"
                sub="Open another client's records"
                onPress={handleSwitchClient}
                right={chevron}
              />
            </>
          )}
          {divider}
          <SettingRow
            C={C}
            icon="key-outline"
            gradient
            label="Change password"
            onPress={() => navigation.navigate('ChangePassword')}
            right={chevron}
          />
        </>
      )}
      {card(
        <SettingRow
          C={C}
          icon="log-out-outline"
          color={COLORS.error}
          tileBg={errorTint}
          label="Log out"
          labelColor={COLORS.error}
          onPress={handleLogout}
        />
      )}
    </>
  );

  // ---------- Baby profiles ----------
  const babiesPage = (
    <>
      {card(babies.map((b, i) => {
        const isActive = b.id === activeBabyId;
        return (
          <View key={b.id}>
            {i > 0 && divider}
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
              {/* Only the family can delete a baby; a nurse can edit but not delete. */}
              {isClientAccount ? (
                <TouchableOpacity
                  onPress={() => handleDeleteBaby(b)}
                  style={[styles.deleteBtn, { backgroundColor: errorTint, borderColor: COLORS.error + '33' }]}
                  accessibilityRole="button"
                  accessibilityLabel={`Delete ${b.name}'s profile`}
                >
                  <Ionicons name="trash-outline" size={15} color={COLORS.error} />
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        );
      }))}
      {card(
        <SettingRow
          C={C}
          icon="person-add-outline"
          gradient
          label="Add another baby"
          onPress={handleResetOnboarding}
          right={chevron}
        />
      )}
      <Text style={[styles.note, { color: C.textMuted }]}>Tap a baby's initial to make them the active baby.</Text>
    </>
  );

  // ---------- Notifications ----------
  const notificationsPage = (
    <>
      {card(NOTIFY_ROWS.map((r, i) => (
        <View key={r.kind}>
          {i > 0 && divider}
          <SettingRow
            C={C}
            icon={r.icon}
            gradient
            label={r.label}
            sub={r.sub}
            right={<Switch {...switchProps(notify[r.kind] !== false, (v) => toggleNotify(r.kind, v), r.label)} />}
          />
        </View>
      )))}
      <Text style={[styles.note, { color: C.textMuted }]}>
        Alerts still show on the Home and Health alerts screens.
      </Text>
    </>
  );

  // ---------- Security ----------
  const securityPage = (
    <>
      {card(
        <>
          <SettingRow
            C={C}
            icon="lock-closed-outline"
            gradient
            label="App lock"
            sub={appLock ? 'PIN needed to open the app' : 'Ask for a PIN when the app opens'}
            right={<Switch {...switchProps(appLock, (v) => setPinMode(v ? 'set' : 'verify'), 'App lock')} />}
          />
          {appLock && canBio ? (
            <>
              {divider}
              <SettingRow
                C={C}
                icon="finger-print-outline"
                gradient
                label="Unlock with fingerprint or face"
                sub="The PIN still works"
                right={<Switch {...switchProps(biometrics, (v) => useSettingsStore.getState().setBiometrics(v), 'Unlock with fingerprint or face')} />}
              />
            </>
          ) : null}
          {appLock ? (
            <>
              {divider}
              <SettingRow
                C={C}
                icon="keypad-outline"
                gradient
                label="Change PIN"
                onPress={() => setPinMode('change')}
                right={chevron}
              />
            </>
          ) : null}
        </>
      )}
      {card(
        <SettingRow
          C={C}
          icon="key-outline"
          gradient
          label="Change password"
          sub="For logging in to your account"
          onPress={() => navigation.navigate('ChangePassword')}
          right={chevron}
        />
      )}
    </>
  );

  const body = { account, babies: babiesPage, notifications: notificationsPage, security: securityPage }[page] || main;
  const head = page ? PAGES[page] : { title: isTab ? 'Profile' : 'Settings', sub: null };

  return (
    <View style={[styles.container, { backgroundColor: C.background }]}>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + 16, paddingBottom: insets.bottom + (isTab ? 110 : 40) },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          {isTab ? null : (
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              style={[styles.backBtn, { backgroundColor: C.card, borderColor: C.border }, SHADOW.sm]}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <Ionicons name="chevron-back" size={22} color={C.text} />
            </TouchableOpacity>
          )}
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} style={[styles.title, { color: C.text }]}>{head.title}</Text>
            {head.sub ? <Text style={[styles.subtitle, { color: C.textSecondary }]}>{head.sub}</Text> : null}
          </View>
        </View>

        {body}
      </ScrollView>

      <PinSheet
        visible={!!pinMode}
        mode={pinMode || 'set'}
        onDone={onPinDone}
        onClose={() => setPinMode(null)}
        C={C}
      />
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
  profileInitial: { fontSize: FONT_SIZE.xl, fontWeight: FONT_WEIGHT.heavy, color: COLORS.primary },
  section: { marginBottom: SPACING.lg },
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
  note: { fontSize: FONT_SIZE.xs, marginTop: 8, marginLeft: 4, lineHeight: 16 },
  footer: { textAlign: 'center', fontSize: FONT_SIZE.sm, marginTop: SPACING.sm, lineHeight: 20 },
});
