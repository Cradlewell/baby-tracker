import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';

import { AuthScreen, AuthHeader, Field, PrimaryButton, TextLink, Banner, OtpInput } from '../components/AuthUI';
import { forgotPassword, resetPassword } from '../lib/session';
import { COLORS } from '../constants/colors';
import { FONT_SIZE, FONT_WEIGHT } from '../constants/theme';

const RESEND_AFTER = 30;
const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

function passwordProblem(p) {
  if (p.length < 8) return 'At least 8 characters.';
  if (p.length > 72) return 'At most 72 characters.';
  if (!/[A-Za-z]/.test(p) || !/\d/.test(p)) return 'Use at least one letter and one number.';
  return null;
}

/**
 * Forgot password: step 1 emails a 6-digit code to the account's email; step 2 takes the code
 * and a new password. Every phone signed in to the account is signed out, so the person logs in
 * again with the new password.
 */
export default function ForgotPasswordScreen({ navigation, route }) {
  const [step, setStep] = useState('email');
  const [email, setEmail] = useState(route.params?.email || '');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);
  const [busy, setBusy] = useState(false);
  const [expiresAt, setExpiresAt] = useState(0);
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (step !== 'code') return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [step]);

  const secsLeft = Math.max(0, Math.ceil((expiresAt - now) / 1000));
  const resendIn = Math.max(0, Math.ceil((resendAt - now) / 1000));
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const sendCode = async () => {
    if (!emailOk || busy) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const res = await forgotPassword(email.trim());
      setExpiresAt(Date.now() + (res.expiresInSeconds || 300) * 1000);
      setResendAt(Date.now() + RESEND_AFTER * 1000);
      setNow(Date.now());
      setCode('');
      if (step === 'code') setInfo(`A new code was sent to ${email.trim()}.`);
      setStep('code');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    const e = {};
    if (code.length !== 6) e.code = 'Enter the 6-digit code.';
    const p = passwordProblem(password);
    if (p) e.password = p;
    if (confirm !== password) e.confirm = 'Passwords do not match.';
    setErrors(e);
    setError(null);
    if (Object.keys(e).length || busy) return;
    setBusy(true);
    try {
      await resetPassword(email.trim(), code, password, confirm);
      navigation.reset({
        index: 0,
        routes: [{
          name: 'Login',
          params: { email: email.trim(), notice: { kind: 'success', message: 'Your password was changed. Log in with your new password.' } },
        }],
      });
    } catch (err) {
      if (err.code === 'weak_password') setErrors({ password: err.message });
      else if (err.code === 'password_mismatch') setErrors({ confirm: err.message });
      else {
        setError(err.message);
        if (String(err.code).startsWith('otp_')) setCode('');
      }
    } finally {
      setBusy(false);
    }
  };

  if (step === 'email') {
    return (
      <AuthScreen onBack={() => navigation.goBack()}>
        <AuthHeader
          icon="key"
          title="Forgot password?"
          subtitle="Enter your account's email. We'll send you a 6-digit code to set a new password."
        />
        <Banner message={error} />
        <Field
          label="Email address"
          icon="mail-outline"
          value={email}
          onChangeText={(t) => { setEmail(t); setError(null); }}
          placeholder="you@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="emailAddress"
          autoFocus={!email}
          returnKeyType="go"
          onSubmitEditing={sendCode}
        />
        <View style={{ height: 8 }} />
        <PrimaryButton label="Send code" icon="mail" onPress={sendCode} loading={busy} disabled={!emailOk} />
      </AuthScreen>
    );
  }

  return (
    <AuthScreen onBack={() => { setStep('email'); setError(null); setInfo(null); }}>
      <AuthHeader
        icon="mail-open"
        title="Set a new password"
        subtitle={`We emailed a 6-digit code to ${email.trim()}. It may take a minute, and can land in spam.`}
      />
      <Banner message={error} />
      <Banner kind="info" message={info} />
      <OtpInput value={code} onChange={(v) => { setCode(v); setErrors((x) => ({ ...x, code: null })); setError(null); }} error={!!errors.code} />
      {errors.code ? <Text style={styles.codeError}>{errors.code}</Text> : null}
      <Text style={[styles.timer, secsLeft === 0 && { color: COLORS.error }]}>
        {secsLeft === 0 ? 'Code expired — request a new one' : `Code expires in ${fmt(secsLeft)}`}
      </Text>
      <Field
        label="New password"
        icon="lock-closed-outline"
        value={password}
        onChangeText={(t) => { setPassword(t); setErrors((x) => ({ ...x, password: null })); }}
        error={errors.password}
        placeholder="At least 8 characters, a letter and a number"
        secure
        autoCapitalize="none"
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="next"
      />
      <Field
        label="Confirm new password"
        icon="lock-closed-outline"
        value={confirm}
        onChangeText={(t) => { setConfirm(t); setErrors((x) => ({ ...x, confirm: null })); }}
        error={errors.confirm}
        placeholder="Type it again"
        secure
        autoCapitalize="none"
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="go"
        onSubmitEditing={reset}
      />
      <View style={{ height: 8 }} />
      <PrimaryButton label="Save new password" icon="checkmark" onPress={reset} loading={busy} disabled={secsLeft === 0} />
      <TextLink
        prefix="Didn't get it?"
        label={resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend code'}
        onPress={sendCode}
        disabled={resendIn > 0 || busy}
      />
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  timer: {
    textAlign: 'center', fontSize: FONT_SIZE.sm, color: COLORS.textSecondary,
    fontWeight: FONT_WEIGHT.semibold, marginBottom: 12,
  },
  codeError: { textAlign: 'center', color: COLORS.error, fontSize: FONT_SIZE.sm, marginBottom: 4 },
});
