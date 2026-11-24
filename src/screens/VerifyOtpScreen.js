import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';

import { AuthScreen, AuthHeader, PrimaryButton, TextLink, Banner, OtpInput } from '../components/AuthUI';
import {
  verifyRegistrationOtp, resendRegistrationOtp, verifyClientOtp, requestClientOtp,
} from '../lib/session';
import { useBabyStore } from '../store/useBabyStore';
import { COLORS } from '../constants/colors';
import { FONT_SIZE, FONT_WEIGHT } from '../constants/theme';

const RESEND_AFTER = 30;
const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

// One screen for both codes:
//   purpose 'registration' — the user's own phone, activates the account
//   purpose 'client'       — the client's phone, opens that client's records
export default function VerifyOtpScreen({ navigation, route }) {
  const { purpose, email, phone, phoneMasked } = route.params;
  const isClient = purpose === 'client';

  const [code, setCode] = useState('');
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);
  const [busy, setBusy] = useState(false);
  const [expiresAt, setExpiresAt] = useState(Date.now() + (route.params.expiresInSeconds || 300) * 1000);
  const [resendAt, setResendAt] = useState(Date.now() + RESEND_AFTER * 1000);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const secsLeft = Math.max(0, Math.ceil((expiresAt - now) / 1000));
  const resendIn = Math.max(0, Math.ceil((resendAt - now) / 1000));
  const expired = secsLeft === 0;

  const verify = async (value = code) => {
    if (value.length !== 6 || busy) return;
    if (expired) {
      setError('This code has expired. Request a new code.');
      return;
    }
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      if (isClient) {
        await verifyClientOtp(phone, value);
        const { onboardingDone } = useBabyStore.getState();
        navigation.reset({ index: 0, routes: [{ name: onboardingDone ? 'Main' : 'Onboarding' }] });
      } else {
        await verifyRegistrationOtp(email, value);
        navigation.reset({
          index: 0,
          routes: [{
            name: 'Login',
            params: { email, notice: { kind: 'success', message: 'Your phone number is verified and your account is active. Please log in.' } },
          }],
        });
      }
    } catch (err) {
      setError(err.message);
      setCode('');
      if (err.code === 'already_verified') {
        navigation.reset({ index: 0, routes: [{ name: 'Login', params: { email } }] });
      }
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setError(null);
    setInfo(null);
    setCode('');
    try {
      const res = isClient ? await requestClientOtp(phone) : await resendRegistrationOtp(email);
      setExpiresAt(Date.now() + (res.expiresInSeconds || 300) * 1000);
      setResendAt(Date.now() + RESEND_AFTER * 1000);
      setInfo(`A new code was sent to ${res.phoneMasked}.`);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <AuthScreen onBack={() => navigation.goBack()}>
      <AuthHeader
        icon={isClient ? 'shield-checkmark' : 'chatbubble-ellipses'}
        title={isClient ? "Enter the client's code" : 'Verify your phone'}
        subtitle={isClient
          ? `We sent a 6-digit code to the client's phone ${phoneMasked}. Ask them to share it with you.`
          : `We sent a 6-digit code to ${phoneMasked}.`}
      />
      <Banner message={error} />
      <Banner kind="info" message={info} />
      <OtpInput
        value={code}
        onChange={(v) => { setCode(v); if (error) setError(null); }}
        onComplete={verify}
        error={!!error}
      />
      <Text style={[styles.timer, expired && { color: COLORS.error }]}>
        {expired ? 'Code expired — request a new one' : `Code expires in ${fmt(secsLeft)}`}
      </Text>
      <View style={{ height: 8 }} />
      <PrimaryButton
        label={isClient ? 'Verify & open records' : 'Verify phone'}
        onPress={() => verify()}
        loading={busy}
        disabled={code.length !== 6 || expired}
        icon="checkmark"
      />
      <TextLink
        prefix="Didn't get it?"
        label={resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend code'}
        onPress={resend}
        disabled={resendIn > 0}
      />
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  timer: {
    textAlign: 'center', fontSize: FONT_SIZE.sm, color: COLORS.textSecondary,
    fontWeight: FONT_WEIGHT.semibold, marginBottom: 4,
  },
});
