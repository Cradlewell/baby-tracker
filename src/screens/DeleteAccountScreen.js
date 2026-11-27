import React, { useState } from 'react';
import { View, Text, StyleSheet, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { AuthScreen, AuthHeader, Field, PrimaryButton, Banner, TextLink } from '../components/AuthUI';
import { deleteAccount, isClientAccount } from '../lib/session';
import { useAuthStore } from '../store/useAuthStore';
import { COLORS } from '../constants/colors';
import { FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING } from '../constants/theme';
import { DELETE_ACCOUNT_URL } from '../constants/app';

/**
 * Delete account (Google Play requires it inside the app). The person types DELETE and, unless
 * they sign in with Google, their password. A parent loses the account, babies and every record;
 * a nurse loses the account and their access to families (the families keep their records).
 */
export default function DeleteAccountScreen({ navigation }) {
  const user = useAuthStore((s) => s.user);
  const parent = isClientAccount(user);
  const needsPassword = !user?.google;
  const [confirm, setConfirm] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const ready = confirm.trim().toUpperCase() === 'DELETE' && (!needsPassword || password.length > 0) && !busy;

  const submit = async () => {
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      await deleteAccount(needsPassword ? password : undefined);
      navigation.reset({
        index: 0,
        routes: [{ name: 'Login', params: { notice: { kind: 'success', message: 'Your account and its data have been deleted.' } } }],
      });
    } catch (err) {
      setError(err.message);
      if (err.code === 'wrong_password') setPassword('');
    } finally {
      setBusy(false);
    }
  };

  const lost = parent
    ? ['Your account and login', 'Your family record and every baby profile', 'Every feed, sleep, diaper, medicine, vaccine, growth and health record', "Every nurse's access to your family"]
    : ['Your account and login', 'Your access to every family you opened'];

  return (
    <AuthScreen onBack={() => navigation.goBack()}>
      <AuthHeader
        icon="trash"
        title="Delete account"
        subtitle={`This permanently deletes ${user?.email || 'your account'}. It can't be undone.`}
      />
      <View style={styles.box}>
        <Text style={styles.boxTitle}>What will be deleted</Text>
        {lost.map((t) => (
          <View key={t} style={styles.item}>
            <Ionicons name="close-circle" size={17} color={COLORS.error} />
            <Text style={styles.itemText}>{t}</Text>
          </View>
        ))}
        {parent ? null : (
          <Text style={styles.note}>The records you entered belong to the families and stay with them.</Text>
        )}
        {parent ? (
          <Text style={styles.note}>Want to keep a copy? Export a PDF report from Reports first.</Text>
        ) : null}
      </View>
      <Banner message={error} />
      <Field
        label="Type DELETE to confirm"
        icon="alert-circle-outline"
        value={confirm}
        onChangeText={(t) => { setConfirm(t); setError(null); }}
        placeholder="DELETE"
        autoCapitalize="characters"
        autoCorrect={false}
        returnKeyType={needsPassword ? 'next' : 'go'}
        onSubmitEditing={needsPassword ? undefined : submit}
      />
      {needsPassword ? (
        <Field
          label="Your password"
          icon="lock-closed-outline"
          value={password}
          onChangeText={(t) => { setPassword(t); setError(null); }}
          placeholder="Your password"
          secure
          autoCapitalize="none"
          autoComplete="current-password"
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={submit}
        />
      ) : (
        <Text style={styles.google}>You sign in with Google, so no password is needed.</Text>
      )}
      <View style={{ height: 8 }} />
      <PrimaryButton label="Delete my account" icon="trash" onPress={submit} loading={busy} disabled={!ready} />
      <TextLink label="Keep my account" onPress={() => navigation.goBack()} />
      {DELETE_ACCOUNT_URL ? (
        <TextLink prefix="Can't log in on a phone?" label="Delete from the web" onPress={() => Linking.openURL(DELETE_ACCOUNT_URL).catch(() => {})} />
      ) : null}
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: COLORS.errorLight, borderRadius: RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.md,
  },
  boxTitle: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.heavy, color: COLORS.text, marginBottom: 8 },
  item: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 4 },
  itemText: { flex: 1, fontSize: FONT_SIZE.sm, color: COLORS.text, lineHeight: 20 },
  note: { fontSize: FONT_SIZE.sm, color: COLORS.textSecondary, marginTop: 10, lineHeight: 20 },
  google: { fontSize: FONT_SIZE.sm, color: COLORS.textSecondary, marginBottom: SPACING.md, marginLeft: 4 },
});
