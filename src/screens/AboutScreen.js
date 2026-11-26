import React from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Image, Linking, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { useBabyStore } from '../store/useBabyStore';
import { COLORS, DARK_COLORS } from '../constants/colors';
import { FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING, SHADOW } from '../constants/theme';
import {
  APP_NAME, APP_VERSION, SUPPORT_EMAIL, PRIVACY_URL, PRIVACY_UPDATED,
} from '../constants/app';

// Opens a mail to support, with the app version in the subject.
export function emailSupport() {
  const url = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(`${APP_NAME} support (v${APP_VERSION})`)}`;
  Linking.openURL(url).catch(() =>
    Alert.alert('No email app found', `Write to us at ${SUPPORT_EMAIL}.`));
}

function Page({ title, subtitle, navigation, children }) {
  const darkMode = useBabyStore((s) => s.darkMode);
  const C = darkMode ? DARK_COLORS : COLORS;
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.container, { backgroundColor: C.background }]}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            style={[styles.backBtn, { backgroundColor: C.card, borderColor: C.border }, SHADOW.sm]}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="chevron-back" size={22} color={C.text} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: C.text }]}>{title}</Text>
            {subtitle ? <Text style={[styles.subtitle, { color: C.textSecondary }]}>{subtitle}</Text> : null}
          </View>
        </View>
        {children(C)}
      </ScrollView>
    </View>
  );
}

function Row({ icon, label, sub, onPress, C }) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.row} accessibilityRole="button" accessibilityLabel={label}>
      <View style={[styles.rowIcon, { backgroundColor: C.primaryLight }]}>
        <Ionicons name={icon} size={20} color={C.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowLabel, { color: C.text }]}>{label}</Text>
        {sub ? <Text style={[styles.rowSub, { color: C.textSecondary }]}>{sub}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={16} color={C.textMuted} />
    </TouchableOpacity>
  );
}

export default function AboutScreen({ navigation }) {
  return (
    <Page title="About" navigation={navigation}>
      {(C) => (
        <>
          <View style={[styles.card, styles.appCard, { backgroundColor: C.card, borderColor: C.border }, SHADOW.sm]}>
            <Image source={require('../../assets/logo.png')} style={styles.logo} resizeMode="contain" />
            <Text style={[styles.appName, { color: C.text }]}>{APP_NAME}</Text>
            <Text style={[styles.version, { color: C.textSecondary }]}>Version {APP_VERSION}</Text>
            <Text style={[styles.body, styles.center, { color: C.textSecondary }]}>
              Track feeding, sleep, diapers, medicines, vaccines and growth, and share day-by-day
              reports with your baby's doctor.
            </Text>
          </View>

          <View
            style={[styles.card, styles.disclaimer, { backgroundColor: C.card, borderColor: COLORS.warning + '66' }]}
            accessibilityRole="summary"
          >
            <Ionicons name="medkit-outline" size={22} color={COLORS.warning} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.disclaimerTitle, { color: C.text }]}>For tracking only, not medical advice</Text>
              <Text style={[styles.body, { color: C.textSecondary }]}>
                Always consult your doctor about your baby's health. The alerts in this app are
                reminders to check with a doctor, not a diagnosis. In an emergency, call your local
                emergency number straight away.
              </Text>
            </View>
          </View>

          <View style={[styles.card, styles.group, { backgroundColor: C.card, borderColor: C.border }, SHADOW.sm]}>
            <Row C={C} icon="mail-outline" label="Contact support" sub={SUPPORT_EMAIL} onPress={emailSupport} />
            <View style={[styles.divider, { backgroundColor: C.border }]} />
            <Row
              C={C}
              icon="shield-checkmark-outline"
              label="Privacy policy"
              sub="What we collect and how it is kept"
              onPress={() => navigation.navigate('PrivacyPolicy')}
            />
          </View>
        </>
      )}
    </Page>
  );
}

const POLICY = [
  ['Who we are', `${APP_NAME} ("the app", "we") helps parents and nurses record a baby's daily care and share reports with the baby's doctor. Questions about this policy: ${SUPPORT_EMAIL}.`],
  ['What we collect', [
    'Account details: your name, email address, phone number and whether you are a parent or a nurse. Your password is stored only in a scrambled (hashed) form that cannot be read back.',
    "Baby details you enter: name, date of birth, gender and birth weight.",
    'Care records you enter: feeds, sleep, diapers, medicines and doses, vaccines, growth, temperature, breathing, skin checks and milestones.',
  ]],
  ['How we use it', [
    'To show your records, charts, alerts and reminders in the app and to create PDF reports.',
    'To keep your records in step between the phones you and your care team use.',
    'We do not sell your data, show advertising, or use it for marketing.',
  ]],
  ['Where it is kept', [
    "Your records are stored on Cradlewell's server and a copy is kept on your phone so the app works offline.",
    'Data is sent to the server over an encrypted connection.',
    'Medicine and vaccine reminders, your app lock PIN and your notification settings stay on your phone only.',
  ]],
  ['Who can see it', [
    "Nurses can open a family's records only after the parent's phone number is verified with a one-time code.",
    'PDF reports are created on your phone; they are shared only when you choose to send them.',
    'We share data with nobody else, unless the law requires it.',
  ]],
  ['How long we keep it', [
    'Records are kept while your account is open. Deleting a baby profile in Settings deletes that baby\'s records.',
    `To delete your account and all its data, email ${SUPPORT_EMAIL} from the address you signed up with. We delete it within 30 days.`,
  ]],
  ['Your choices', [
    'You can view, change and delete the records you entered at any time.',
    'You can turn notifications on or off in Settings and in your phone settings.',
    'You can ask us for a copy of your data or to correct it.',
  ]],
  ['Children', ['The app is for parents and carers, not for children to use. The records about a baby are entered and controlled by the parent or carer.']],
  ['Changes', ['If this policy changes, we update it here and change the date at the top.']],
];

export function PrivacyPolicyScreen({ navigation }) {
  return (
    <Page title="Privacy policy" subtitle={`Last updated ${PRIVACY_UPDATED}`} navigation={navigation}>
      {(C) => (
        <>
          {PRIVACY_URL ? (
            <TouchableOpacity
              onPress={() => Linking.openURL(PRIVACY_URL).catch(() => {})}
              style={[styles.webBtn, { backgroundColor: C.primaryLight }]}
              accessibilityRole="link"
            >
              <Ionicons name="open-outline" size={18} color={C.primary} />
              <Text style={[styles.webText, { color: C.primary }]}>Open the web version</Text>
            </TouchableOpacity>
          ) : null}
          <View style={[styles.card, { backgroundColor: C.card, borderColor: C.border }, SHADOW.sm]}>
            {POLICY.map(([heading, body], i) => (
              <View key={heading} style={i ? styles.policyBlock : null}>
                <Text style={[styles.policyHeading, { color: C.text }]} accessibilityRole="header">{heading}</Text>
                {(Array.isArray(body) ? body : [body]).map((p) => (
                  <View key={p} style={Array.isArray(body) ? styles.bullet : null}>
                    {Array.isArray(body) ? <Text style={[styles.body, { color: C.textSecondary }]}>•</Text> : null}
                    <Text style={[styles.body, { color: C.textSecondary, flex: 1 }]}>{p}</Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        </>
      )}
    </Page>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: SPACING.lg, gap: SPACING.md },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: SPACING.sm },
  backBtn: { width: 42, height: 42, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: FONT_SIZE.xxl, fontWeight: FONT_WEIGHT.heavy, letterSpacing: -0.8 },
  subtitle: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.medium, marginTop: 2 },
  card: { borderRadius: RADIUS.xl, borderWidth: 1, padding: SPACING.lg },
  appCard: { alignItems: 'center' },
  logo: { width: 72, height: 72, marginBottom: SPACING.sm },
  appName: { fontSize: FONT_SIZE.xl, fontWeight: FONT_WEIGHT.heavy },
  version: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold, marginTop: 2, marginBottom: SPACING.sm },
  body: { fontSize: FONT_SIZE.sm, lineHeight: 20 },
  center: { textAlign: 'center' },
  disclaimer: { flexDirection: 'row', gap: 12, borderWidth: 1.5 },
  disclaimerTitle: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.bold, marginBottom: 4 },
  group: { padding: 0, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, padding: SPACING.md, minHeight: 70 },
  rowIcon: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.bold },
  rowSub: { fontSize: FONT_SIZE.sm, marginTop: 2 },
  divider: { height: 1, marginLeft: 76, marginRight: SPACING.md },
  policyBlock: { marginTop: SPACING.lg },
  policyHeading: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.heavy, marginBottom: 6 },
  bullet: { flexDirection: 'row', gap: 8, marginTop: 4 },
  webBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 48, borderRadius: RADIUS.lg },
  webText: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.bold },
});
