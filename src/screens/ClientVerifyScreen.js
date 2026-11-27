import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { AuthScreen, AuthHeader, Field, PrimaryButton, TextLink, Banner } from '../components/AuthUI';
import { requestClientOtp, createClient, myClients } from '../lib/session';
import { useAuthStore } from '../store/useAuthStore';
import { useBabyStore } from '../store/useBabyStore';
import { COLORS } from '../constants/colors';
import { FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING, SHADOW } from '../constants/theme';

// "Your families" lists only the 10 most recently opened (the server sends no more).
const RECENT_SHOWN = 10;

// Any typed, pasted or contact number -> the 10-digit Indian mobile number (no +91 / leading 0).
function toTenDigits(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  if (d.length > 10 && d.startsWith('91')) d = d.slice(2);
  d = d.replace(/^0+/, '');
  return d.slice(0, 10);
}
const isMobile = (d) => /^[6-9]\d{9}$/.test(d);
function lastEntry(iso) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}
const initials = (name) => name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');

// After login: the nurse enters the client's phone number.
//  - A family this nurse verified before opens at once (listed under "Your families").
//  - Another existing family -> the parent is emailed a code, which the nurse enters next.
//  - No family with that number -> name and parent's email, then the parent's code.
// A family with no email on file yet is asked for the parent's email once.
export default function ClientVerifyScreen({ navigation, route }) {
  const user = useAuthStore((s) => s.user);
  const current = useAuthStore((s) => s.client);
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [isNew, setIsNew] = useState(false);
  const [needsEmail, setNeedsEmail] = useState(false);
  const [emailError, setEmailError] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [families, setFamilies] = useState(null); // null while loading
  const [query, setQuery] = useState('');
  const [openingId, setOpeningId] = useState(null);
  const notice = route.params?.notice;
  // Opened with "Switch client": the current client is still open behind this screen.
  const switching = !!route.params?.switching && navigation.canGoBack();

  useEffect(() => {
    myClients().then(setFamilies).catch(() => setFamilies([]));
  }, []);

  const firstName = user?.fullName?.split(' ')[0];
  const fullPhone = `+91${phone}`;
  const phoneOk = isMobile(phone);
  const showEmail = isNew || needsEmail;
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const canSubmit = phoneOk && (!isNew || name.trim().length >= 2) && (!needsEmail || emailOk) && !busy && !openingId;
  const known = families?.find((f) => f.phone === fullPhone);

  // Search by name or by digits of the number; without a search, the most recent few.
  const shown = useMemo(() => {
    if (!families) return [];
    const q = query.trim().toLowerCase();
    if (!q) return families.slice(0, RECENT_SHOWN);
    const digits = q.replace(/\D/g, '');
    return families.filter((f) => f.name.toLowerCase().includes(q) || (digits.length >= 3 && f.phone.includes(digits))).slice(0, 20);
  }, [families, query]);

  // The server answered: either the client is open, or a code was sent.
  const proceed = (res, phoneE164) => {
    if (res.otpRequired === false) {
      const { onboardingDone } = useBabyStore.getState();
      navigation.reset({ index: 0, routes: [{ name: onboardingDone ? 'Main' : 'Onboarding' }] });
      return;
    }
    navigation.navigate('VerifyOtp', {
      purpose: 'client', phone: phoneE164, parentEmail: showEmail ? email.trim() : undefined,
      sentTo: res.sentTo, phoneMasked: res.phoneMasked, emailMasked: res.emailMasked, expiresInSeconds: res.expiresInSeconds,
    });
  };

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    setEmailError(null);
    const parentEmail = showEmail && email.trim() ? email.trim() : undefined;
    try {
      if (isNew) {
        proceed(await createClient(name.trim(), fullPhone, parentEmail), fullPhone);
      } else {
        proceed(await requestClientOtp(fullPhone, parentEmail), fullPhone);
      }
    } catch (err) {
      if (err.code === 'client_not_found') {
        setIsNew(true);
      } else if (err.code === 'email_needed' || err.code === 'invalid_email') {
        setNeedsEmail(true);
        setEmailError(err.message);
      } else {
        if (err.code === 'client_exists') setIsNew(false);
        setError(err.message);
      }
    } finally {
      setBusy(false);
    }
  };

  // One tap on a family this nurse verified before: it opens without a code.
  const openFamily = async (f) => {
    if (openingId || busy) return;
    if (switching && current && String(current.id) === String(f.id)) {
      navigation.goBack();
      return;
    }
    setOpeningId(f.id);
    setError(null);
    try {
      proceed(await requestClientOtp(f.phone), f.phone);
    } catch (err) {
      setError(err.message);
    } finally {
      setOpeningId(null);
    }
  };

  const changePhone = (t) => {
    setPhone(toTenDigits(t));
    setError(null);
    if (isNew) setIsNew(false);
    if (needsEmail) setNeedsEmail(false);
    setEmailError(null);
  };

  // Back: from "Switch client", return to the client still open; right after login, show the
  // login page (still logged in, so its Back returns here).
  const goBack = () => (switching ? navigation.goBack() : navigation.navigate('Login', { canReturn: true }));

  // Under the Next button: whether this number needs the parent's code.
  let hint = null;
  if (!isNew && phoneOk) {
    hint = known
      ? { icon: 'checkmark-circle', color: COLORS.success, text: `${known.name}: you've opened this family before, no code needed.` }
      : { icon: 'mail-outline', color: COLORS.textSecondary, text: "If you haven't opened this family before, we'll email the parent a 6-digit code." };
  }

  return (
    <AuthScreen onBack={goBack}>
      <AuthHeader
        icon={isNew ? 'person-add' : 'people'}
        title={isNew ? 'New client' : switching ? 'Switch client' : firstName ? `Hi ${firstName}, whose records?` : 'Whose records?'}
        subtitle={isNew
          ? "No client is registered with this number yet. Add their name and the parent's email: we'll email the parent a code to confirm."
          : needsEmail
            ? "We'll email the parent a code. Ask them to share it with you."
            : 'Pick one of your families, or enter a phone number.'}
      />
      {switching && current ? (
        <View style={styles.currentCard} accessibilityLabel={`Currently open: ${current.name}`}>
          <Ionicons name="radio-button-on" size={16} color={COLORS.success} />
          <Text style={styles.currentText} numberOfLines={1}>
            Currently open: <Text style={styles.currentName}>{current.name}</Text>
            {current.phoneMasked ? `  ·  ${current.phoneMasked}` : ''}
          </Text>
        </View>
      ) : null}
      {notice ? <Banner kind={notice.kind} message={notice.message} /> : null}
      <Banner message={error} />

      <Field
        label="Client's phone number"
        icon="call-outline"
        prefix="+91"
        value={phone}
        onChangeText={changePhone}
        placeholder="98765 43210"
        keyboardType="number-pad"
        autoComplete="tel"
        textContentType="telephoneNumber"
        returnKeyType={showEmail ? 'next' : 'go'}
        onSubmitEditing={showEmail ? undefined : submit}
        error={phone.length === 10 && !phoneOk ? 'A mobile number starts with 6, 7, 8 or 9.' : null}
      />
      {isNew ? (
        <Field
          label="Client's name"
          icon="person-outline"
          value={name}
          onChangeText={(t) => { setName(t); setError(null); }}
          placeholder="e.g. Priya Sharma"
          autoCapitalize="words"
          autoFocus={!name}
          returnKeyType="next"
        />
      ) : null}
      {showEmail ? (
        <Field
          label="Parent's email"
          icon="mail-outline"
          value={email}
          onChangeText={(t) => { setEmail(t); setEmailError(null); }}
          error={emailError}
          placeholder="parent@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          textContentType="emailAddress"
          autoFocus={needsEmail && !isNew}
          returnKeyType="go"
          onSubmitEditing={submit}
        />
      ) : null}
      <View style={{ height: 4 }} />
      <PrimaryButton
        label={isNew ? 'Create client & start tracking' : 'Next'}
        onPress={submit}
        loading={busy}
        disabled={!canSubmit}
        icon={isNew ? 'add' : 'arrow-forward'}
      />
      {hint ? (
        <View style={styles.hint}>
          <Ionicons name={hint.icon} size={16} color={hint.color} />
          <Text style={[styles.hintText, { color: hint.color }]}>{hint.text}</Text>
        </View>
      ) : null}
      {isNew ? <TextLink label="Use a different number" onPress={() => { setIsNew(false); setNeedsEmail(false); setPhone(''); setName(''); setEmail(''); setEmailError(null); }} /> : null}

      {!isNew ? (
        <View style={styles.families}>
          <Text style={styles.sectionLabel}>Your families</Text>
          {families === null ? (
            <ActivityIndicator color={COLORS.primary} style={{ marginVertical: SPACING.md }} />
          ) : families.length === 0 ? (
            <Text style={styles.empty}>Families you've tracked in the last 30 days appear here, so it's one tap to open them.</Text>
          ) : (
            <>
              {families.length > 5 ? (
                <View style={styles.search}>
                  <Ionicons name="search" size={17} color={COLORS.textMuted} />
                  <TextInput
                    style={styles.searchInput}
                    value={query}
                    onChangeText={setQuery}
                    placeholder="Search by name or number"
                    placeholderTextColor={COLORS.textMuted}
                    autoCorrect={false}
                    returnKeyType="search"
                    accessibilityLabel="Search your families"
                  />
                  {query ? (
                    <TouchableOpacity onPress={() => setQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel="Clear search">
                      <Ionicons name="close-circle" size={18} color={COLORS.textMuted} />
                    </TouchableOpacity>
                  ) : null}
                </View>
              ) : null}
              {shown.length === 0 ? (
                <Text style={styles.empty}>No family matches “{query.trim()}”. Enter their number above.</Text>
              ) : shown.map((f) => {
                const isOpen = switching && current && String(current.id) === String(f.id);
                return (
                  <TouchableOpacity
                    key={f.id}
                    style={styles.row}
                    onPress={() => openFamily(f)}
                    disabled={!!openingId || busy}
                    accessibilityRole="button"
                    accessibilityLabel={`Open ${f.name}`}
                  >
                    <View style={styles.avatar}><Text style={styles.avatarText}>{initials(f.name) || '?'}</Text></View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowName} numberOfLines={1}>{f.name}</Text>
                      <Text style={styles.rowPhone}>
                        {f.phoneMasked}{f.lastTracked ? `  ·  Last entry ${lastEntry(f.lastTracked)}` : '  ·  No entries yet'}
                      </Text>
                    </View>
                    {openingId === f.id ? (
                      <ActivityIndicator color={COLORS.primary} />
                    ) : (
                      <View style={[styles.badge, isOpen && styles.badgeOpen]}>
                        <Text style={[styles.badgeText, isOpen && styles.badgeOpenText]}>{isOpen ? 'Open now' : 'No code needed'}</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </>
          )}
        </View>
      ) : null}
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  currentCard: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: COLORS.successLight, borderRadius: RADIUS.md,
    paddingVertical: 10, paddingHorizontal: SPACING.md, marginBottom: SPACING.md,
  },
  currentText: { flex: 1, fontSize: FONT_SIZE.sm, color: COLORS.text },
  currentName: { fontWeight: FONT_WEIGHT.bold },

  hint: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: SPACING.sm, paddingHorizontal: 4 },
  hintText: { flex: 1, fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.medium, lineHeight: 19 },

  families: { marginTop: SPACING.lg },
  sectionLabel: {
    fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.heavy, color: COLORS.textSecondary,
    letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 8, marginLeft: 4,
  },
  search: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: COLORS.card, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border,
    paddingHorizontal: 12, minHeight: 46, marginBottom: 10,
  },
  searchInput: { flex: 1, fontSize: FONT_SIZE.base, color: COLORS.text, paddingVertical: 10 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: COLORS.card, borderRadius: RADIUS.lg, padding: 12, marginBottom: 8,
    borderWidth: 1, borderColor: COLORS.border, ...SHADOW.sm,
  },
  avatar: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.primaryLight,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: COLORS.primary, fontWeight: FONT_WEIGHT.heavy, fontSize: FONT_SIZE.sm },
  rowName: { fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.bold, color: COLORS.text },
  rowPhone: { fontSize: FONT_SIZE.sm, color: COLORS.textSecondary, marginTop: 2 },
  badge: { backgroundColor: COLORS.successLight, borderRadius: RADIUS.full, paddingVertical: 4, paddingHorizontal: 10 },
  badgeText: { color: COLORS.success, fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.bold },
  badgeOpen: { backgroundColor: COLORS.primaryLight },
  badgeOpenText: { color: COLORS.primary },
  empty: { fontSize: FONT_SIZE.sm, color: COLORS.textSecondary, marginLeft: 4, marginBottom: 8, lineHeight: 19 },
});
