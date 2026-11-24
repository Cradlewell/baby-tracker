import React, { useState } from 'react';
import { View, Alert } from 'react-native';

import { AuthScreen, AuthHeader, Field, PrimaryButton, TextLink, Banner } from '../components/AuthUI';
import { requestClientOtp, createClient, logout } from '../lib/session';
import { useAuthStore } from '../store/useAuthStore';
import { useBabyStore } from '../store/useBabyStore';

// After login: the nurse enters the client's phone number.
//  - Existing client -> their records open (clients are shared: one nurse serves many clients).
//  - No client with that number -> ask for the name and create a new client, then add the baby.
// If one-time codes are switched on, the client also receives a code that must be entered next.
export default function ClientVerifyScreen({ navigation, route }) {
  const user = useAuthStore((s) => s.user);
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [isNew, setIsNew] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const notice = route.params?.notice;

  const firstName = user?.fullName?.split(' ')[0];
  const phoneOk = phone.replace(/\D/g, '').length >= 8;
  const canSubmit = phoneOk && (!isNew || name.trim().length >= 2) && !busy;

  // The server answered: either the client is open, or a code was sent.
  const proceed = (res) => {
    if (res.otpRequired === false) {
      const { onboardingDone } = useBabyStore.getState();
      navigation.reset({ index: 0, routes: [{ name: onboardingDone ? 'Main' : 'Onboarding' }] });
      return;
    }
    navigation.navigate('VerifyOtp', {
      purpose: 'client', phone: phone.trim(), phoneMasked: res.phoneMasked, expiresInSeconds: res.expiresInSeconds,
    });
  };

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      if (isNew) {
        proceed(await createClient(name.trim(), phone.trim()));
      } else {
        proceed(await requestClientOtp(phone.trim()));
      }
    } catch (err) {
      if (err.code === 'client_not_found') {
        setIsNew(true);
      } else {
        if (err.code === 'client_exists') setIsNew(false);
        setError(err.message);
      }
    } finally {
      setBusy(false);
    }
  };

  const changePhone = (t) => {
    setPhone(t);
    setError(null);
    if (isNew) setIsNew(false);
  };

  const confirmLogout = () => {
    Alert.alert('Log out?', 'You can log in again with your email and password.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log out',
        style: 'destructive',
        onPress: async () => {
          await logout();
          navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
        },
      },
    ]);
  };

  return (
    <AuthScreen footer={<TextLink prefix={user?.email ? `Signed in as ${user.email}.` : undefined} label="Log out" onPress={confirmLogout} />}>
      <AuthHeader
        icon={isNew ? 'person-add' : 'people'}
        title={isNew ? 'New client' : firstName ? `Hi ${firstName}, whose records?` : 'Whose records?'}
        subtitle={isNew
          ? "No client is registered with this number yet. Add their name to create a new client and start tracking their baby."
          : "Enter the client's phone number. If they're new, you can create them next."}
      />
      {notice ? <Banner kind={notice.kind} message={notice.message} /> : null}
      <Banner message={error} />
      <Field
        label="Client's phone number"
        icon="call-outline"
        value={phone}
        onChangeText={changePhone}
        placeholder="+91 98765 43210"
        keyboardType="phone-pad"
        autoComplete="tel"
        textContentType="telephoneNumber"
        returnKeyType={isNew ? 'next' : 'go'}
        onSubmitEditing={isNew ? undefined : submit}
      />
      {isNew ? (
        <Field
          label="Client's name"
          icon="person-outline"
          value={name}
          onChangeText={(t) => { setName(t); setError(null); }}
          placeholder="e.g. Priya Sharma"
          autoCapitalize="words"
          autoFocus
          returnKeyType="go"
          onSubmitEditing={submit}
        />
      ) : null}
      <View style={{ height: 8 }} />
      <PrimaryButton
        label={isNew ? 'Create client & start tracking' : 'Continue'}
        onPress={submit}
        loading={busy}
        disabled={!canSubmit}
        icon={isNew ? 'add' : 'arrow-forward'}
      />
      {isNew ? <TextLink label="Use a different number" onPress={() => { setIsNew(false); setPhone(''); setName(''); }} /> : null}
    </AuthScreen>
  );
}
