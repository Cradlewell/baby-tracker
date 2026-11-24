import React, { useState } from 'react';
import { View } from 'react-native';

import { AuthScreen, AuthHeader, Field, PrimaryButton, TextLink, Banner, RoleToggle } from '../components/AuthUI';
import { login, resendRegistrationOtp } from '../lib/session';
import { useBabyStore } from '../store/useBabyStore';

export default function LoginScreen({ navigation, route }) {
  const [role, setRole] = useState(route.params?.role || 'nurse');
  const [email, setEmail] = useState(route.params?.email || '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const notice = route.params?.notice;

  const canSubmit = email.trim().length > 3 && password.length > 0 && !busy;

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const status = await login(email.trim(), password, role);
      if (status === 'ready') {
        // Client (parent): straight to their own dashboard.
        const { onboardingDone } = useBabyStore.getState();
        navigation.reset({ index: 0, routes: [{ name: onboardingDone ? 'Main' : 'Onboarding' }] });
      } else {
        // Nurse: choose which client's records to open.
        navigation.reset({ index: 0, routes: [{ name: 'ClientVerify' }] });
      }
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
      } else {
        setError(err.message);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthScreen
      footer={<TextLink prefix="New to Cradlewell?" label="Create an account" onPress={() => navigation.navigate('Register', { role })} />}
    >
      <AuthHeader title="Welcome back" subtitle="Log in to continue caring for your little one" />
      <RoleToggle value={role} onChange={(r) => { setRole(r); setError(null); }} />
      {notice ? <Banner kind={notice.kind} message={notice.message} /> : null}
      <Banner message={error} />
      <Field
        label="Email address"
        icon="mail-outline"
        value={email}
        onChangeText={setEmail}
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
      />
      <View style={{ height: 8 }} />
      <PrimaryButton label="Log in" onPress={submit} loading={busy} disabled={!canSubmit} />
    </AuthScreen>
  );
}
