import React, { useState } from 'react';
import { APPROVAL_NOTICE } from '../constants/app';
import { View } from 'react-native';

import { AuthScreen, AuthHeader, Field, PrimaryButton, Banner, RoleToggle } from '../components/AuthUI';
import { goAfterLogin } from '../components/ContinueWithGoogle';
import { completeGoogleSignup } from '../lib/session';

/**
 * A new person who continued with Google: Google confirmed their name and email, so only the
 * phone number is missing (the app and nurses find a family by it). It is asked only once:
 * it is saved with the account, and the next Google sign-in goes straight in.
 */
export default function GoogleSignupScreen({ navigation, route }) {
  const { signupToken, email } = route.params;
  const [role, setRole] = useState(route.params.role || 'client');
  const [fullName, setFullName] = useState(route.params.fullName || '');
  const [phone, setPhone] = useState('');
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const e = {};
    if (fullName.trim().length < 2) e.fullName = 'Enter your full name.';
    if (phone.replace(/\D/g, '').length < 8) e.phone = 'Enter a valid phone number.';
    setErrors(e);
    setError(null);
    if (Object.keys(e).length || busy) return;

    setBusy(true);
    try {
      const res = await completeGoogleSignup({ signupToken, phone: phone.trim(), role, fullName: fullName.trim() });
      if (res.otpRequired) {
        // This number already has a family's records: prove it is yours before they open.
        navigation.navigate('VerifyOtp', {
          purpose: 'google', signupToken, email: res.email || email,
          phoneMasked: res.phoneMasked, expiresInSeconds: res.expiresInSeconds,
        });
        return;
      }
      if (res.approvalPending) {
        // A new nurse: the account exists but waits for Cradlewell to approve it.
        navigation.reset({
          index: 0,
          routes: [{ name: 'Login', params: { email: res.email || email, role: 'nurse', notice: { kind: 'pending', message: APPROVAL_NOTICE } } }],
        });
        return;
      }
      // Phone saved, account ready: straight to the dashboard (asked only this once).
      goAfterLogin(navigation, res.status);
    } catch (err) {
      if (err.code === 'invalid_phone' || err.code === 'phone_taken' || err.code === 'phone_needs_verification') setErrors({ phone: err.message });
      else if (err.code === 'invalid_name') setErrors({ fullName: err.message });
      else setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthScreen onBack={() => navigation.goBack()}>
      <AuthHeader
        icon="person-add"
        title="Almost done"
        subtitle={`Signed in with Google as ${email}. Add your phone number to finish creating your account.`}
      />
      <RoleToggle value={role} onChange={setRole} />
      <Banner message={error} />
      <Field
        label="Full name"
        icon="person-outline"
        value={fullName}
        onChangeText={setFullName}
        error={errors.fullName}
        autoCapitalize="words"
        autoComplete="name"
        textContentType="name"
      />
      <Field
        label="Phone number"
        icon="call-outline"
        value={phone}
        onChangeText={setPhone}
        error={errors.phone}
        placeholder="+91 98765 43210"
        keyboardType="phone-pad"
        autoComplete="tel"
        textContentType="telephoneNumber"
        returnKeyType="done"
        onSubmitEditing={submit}
      />
      <View style={{ height: 8 }} />
      <PrimaryButton label="Create account" icon="checkmark" onPress={submit} loading={busy} />
    </AuthScreen>
  );
}
