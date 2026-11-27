import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Linking } from 'react-native';

import { AuthScreen, AuthHeader, Field, PrimaryButton, TextLink, Banner, RoleToggle } from '../components/AuthUI';
import { login, resendRegistrationOtp, lastLogin } from '../lib/session';
import { COLORS } from '../constants/colors';
import { FONT_SIZE, FONT_WEIGHT } from '../constants/theme';
import { SUPPORT_EMAIL, APP_VERSION } from '../constants/app';


// Clearer messages for answers the person can act on.
function loginMessage(err) {
  if (err.code === 'network') return "Can't reach Cradlewell. Check your internet connection and try again.";
  if (err.code === 'rate_limited') return err.message;
  if (err.status >= 500) return 'Something went wrong on our side. Please try again in a moment.';
  return err.message;
}
import ContinueWithGoogle, { goAfterLogin } from '../components/ContinueWithGoogle';

export default function LoginScreen({ navigation, route }) {
  const [role, setRole] = useState(route.params?.role || 'client');
  const [email, setEmail] = useState(route.params?.email || '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [remembered, setRemembered] = useState(false);
  const notice = route.params?.notice;

  // Fill in the email (and Parent/Nurse) last used on this phone.
  useEffect(() => {
    if (route.params?.email) return;
    lastLogin().then((last) => {
      if (!last) return;
      setEmail((e) => e || last.email);
      if (!route.params?.role && last.role) setRole(last.role);
      setRemembered(true);
    });
  }, []);
  // Opened with Back from the client's phone-number page: Back returns there.
  const canReturn = !!route.params?.canReturn && navigation.canGoBack();

  const canSubmit = email.trim().length > 3 && password.length > 0 && !busy;

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      // A client (parent) goes straight to their dashboard; a nurse chooses a client.
      goAfterLogin(navigation, await login(email.trim(), password, role));
    } catch (err) {
      if (err.code === 'account_not_verified') {
        // Sign-up was never finished: send a fresh code and continue verification.
        try {
          const res = await resendRegistrationOtp(email.trim());
          navigation.navigate('VerifyOtp', {
            purpose: 'registration', email: res.email, phoneMasked: res.phoneMasked, expiresInSeconds: res.expiresInSeconds,
          });
        } catch (resendErr) {
          setError(resendErr.message);
        }
      } else if (err.code === 'wrong_role') {
        // Switch the choice for them: the message says which one this account is.
        setRole(role === 'client' ? 'nurse' : 'client');
        setError(`${err.message.split('.')[0]}. We switched it for you, tap "Log in" again.`);
      } else {
        setError(loginMessage(err));
        if (err.code === 'invalid_credentials') setPassword('');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthScreen
      onBack={canReturn ? () => navigation.goBack() : undefined}
      footer={(
        <View>
          <TextLink prefix="New to Cradlewell?" label="Create an account" onPress={() => navigation.navigate('Register', { role })} />
          <Text style={styles.meta}>
            {APP_VERSION ? `Version ${APP_VERSION} · ` : ''}Need help?{' '}
            <Text style={styles.metaLink} onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}`).catch(() => {})} accessibilityRole="link">
              {SUPPORT_EMAIL}
            </Text>
          </Text>
          <Text style={styles.meta}>
            <Text style={styles.metaLink} onPress={() => navigation.navigate('PrivacyPolicy')} accessibilityRole="link">Privacy policy</Text>
          </Text>
        </View>
      )}
    >
      <AuthHeader title="Welcome back" subtitle="Log in to continue caring for your little one" />
      <RoleToggle value={role} onChange={(r) => { setRole(r); setError(null); }} />
      {notice ? <Banner kind={notice.kind} message={notice.message} /> : null}
      {/* A nurse waiting for approval isn't an error: show it in the calm "waiting" style. */}
      <Banner kind={/waiting for approval/.test(error || '') ? 'pending' : 'error'} message={error} />
      <Field
        label="Email address"
        icon="mail-outline"
        value={email}
        onChangeText={(t) => { setEmail(t); setRemembered(false); }}
        placeholder="you@example.com"
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        textContentType="emailAddress"
        returnKeyType="next"
      />
      <Field
        label="Password"
        icon="lock-closed-outline"
        value={password}
        onChangeText={setPassword}
        placeholder="Your password"
        secure
        autoCapitalize="none"
        autoComplete="current-password"
        textContentType="password"
        returnKeyType="go"
        onSubmitEditing={submit}
        autoFocus={remembered && !!email}
      />
      <TouchableOpacity
        onPress={() => navigation.navigate('ForgotPassword', { email: email.trim() })}
        style={styles.forgot}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityRole="button"
      >
        <Text style={styles.forgotText}>Forgot password?</Text>
      </TouchableOpacity>
      <PrimaryButton label="Log in" onPress={submit} loading={busy} disabled={!canSubmit} />
      <ContinueWithGoogle navigation={navigation} role={role} onError={setError} disabled={busy} />
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  forgot: { alignSelf: 'flex-end', marginTop: -4, marginBottom: 14, paddingVertical: 2 },
  forgotText: { color: COLORS.primary, fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.bold },
  meta: { textAlign: 'center', color: COLORS.textMuted, fontSize: FONT_SIZE.xs, marginTop: 14 },
  metaLink: { color: COLORS.primary, fontWeight: FONT_WEIGHT.semibold },
});
