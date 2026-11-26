import React, { useState } from 'react';
import { View } from 'react-native';

import { AuthScreen, AuthHeader, Field, PrimaryButton, TextLink, Banner, RoleToggle } from '../components/AuthUI';
import { register } from '../lib/session';
import ContinueWithGoogle from '../components/ContinueWithGoogle';

// Mirrors the server's checks so most mistakes are shown before anything is sent.
function validate(f) {
  const e = {};
  if (f.fullName.trim().length < 2) e.fullName = 'Enter your full name.';
  if (f.phone.replace(/\D/g, '').length < 8) e.phone = 'Enter a valid phone number.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) e.email = 'Enter a valid email address.';
  if (f.password.length < 8) e.password = 'At least 8 characters.';
  else if (f.password.length > 72) e.password = 'At most 72 characters.';
  else if (!/[A-Za-z]/.test(f.password) || !/\d/.test(f.password)) e.password = 'Use at least one letter and one number.';
  if (f.confirmPassword !== f.password) e.confirmPassword = 'Passwords do not match.';
  return e;
}

const SERVER_FIELD = {
  invalid_name: 'fullName',
  invalid_phone: 'phone',
  phone_taken: 'phone',
  invalid_email: 'email',
  email_taken: 'email',
  weak_password: 'password',
  password_mismatch: 'confirmPassword',
};

export default function RegisterScreen({ navigation, route }) {
  const [role, setRole] = useState(route?.params?.role || 'client');
  const [form, setForm] = useState({ fullName: '', phone: '', email: '', password: '', confirmPassword: '' });
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const update = (key) => (value) => {
    const next = { ...form, [key]: value };
    setForm(next);
    if (touched) setErrors(validate(next));
  };

  const submit = async () => {
    setTouched(true);
    const found = validate(form);
    setErrors(found);
    setError(null);
    if (Object.keys(found).length) return;

    setBusy(true);
    try {
      const res = await register({
        fullName: form.fullName.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        password: form.password,
        confirmPassword: form.confirmPassword,
        role,
      });
      if (res.otpRequired === false) {
        // Codes switched off: the account is already active.
        navigation.reset({
          index: 0,
          routes: [{
            name: 'Login',
            params: { email: res.email, role, notice: { kind: 'success', message: 'Your account has been created. Please log in.' } },
          }],
        });
        return;
      }
      navigation.navigate('VerifyOtp', {
        purpose: 'registration', email: res.email, phoneMasked: res.phoneMasked, expiresInSeconds: res.expiresInSeconds,
      });
    } catch (err) {
      const field = SERVER_FIELD[err.code];
      if (field) setErrors({ [field]: err.message });
      else setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthScreen
      onBack={() => navigation.goBack()}
      footer={<TextLink prefix="Already have an account?" label="Log in" onPress={() => navigation.goBack()} />}
    >
      <AuthHeader
        icon="person-add"
        title="Create your account"
        subtitle="Join Cradlewell to track and care together"
      />
      <RoleToggle value={role} onChange={setRole} />
      <Banner message={error} />
      <Field
        label="Full name"
        icon="person-outline"
        value={form.fullName}
        onChangeText={update('fullName')}
        error={errors.fullName}
        placeholder="e.g. Priya Sharma"
        autoCapitalize="words"
        autoComplete="name"
        textContentType="name"
      />
      <Field
        label="Phone number"
        icon="call-outline"
        value={form.phone}
        onChangeText={update('phone')}
        error={errors.phone}
        placeholder="+91 98765 43210"
        keyboardType="phone-pad"
        autoComplete="tel"
        textContentType="telephoneNumber"
      />
      <Field
        label="Email address"
        icon="mail-outline"
        value={form.email}
        onChangeText={update('email')}
        error={errors.email}
        placeholder="you@example.com"
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        textContentType="emailAddress"
      />
      <Field
        label="Password"
        icon="lock-closed-outline"
        value={form.password}
        onChangeText={update('password')}
        error={errors.password}
        placeholder="At least 8 characters, with a number"
        secure
        autoCapitalize="none"
        autoComplete="new-password"
        textContentType="newPassword"
      />
      <Field
        label="Confirm password"
        icon="lock-closed-outline"
        value={form.confirmPassword}
        onChangeText={update('confirmPassword')}
        error={errors.confirmPassword}
        placeholder="Type it again"
        secure
        autoCapitalize="none"
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="go"
        onSubmitEditing={submit}
      />
      <View style={{ height: 8 }} />
      <PrimaryButton label="Create account" onPress={submit} loading={busy} />
      <ContinueWithGoogle navigation={navigation} role={role} onError={setError} disabled={busy} />
    </AuthScreen>
  );
}
