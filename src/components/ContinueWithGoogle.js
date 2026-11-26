import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { getGoogleIdToken } from '../lib/google';
import { googleLogin } from '../lib/session';
import { useBabyStore } from '../store/useBabyStore';
import { COLORS } from '../constants/colors';
import { FONT_SIZE, FONT_WEIGHT, RADIUS } from '../constants/theme';

// Where a signed-in person goes: a parent to their records, a nurse to choose a client.
export function goAfterLogin(navigation, status) {
  if (status === 'ready') {
    const { onboardingDone } = useBabyStore.getState();
    navigation.reset({ index: 0, routes: [{ name: onboardingDone ? 'Main' : 'Onboarding' }] });
  } else {
    navigation.reset({ index: 0, routes: [{ name: 'ClientVerify' }] });
  }
}

// Google's four-colour "G".
function GoogleG({ size = 20 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <Path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <Path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <Path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </Svg>
  );
}

/**
 * "or" divider and the Continue with Google button. Signs an existing account in, or opens the
 * short Google sign-up step (phone number) for a new person. onError(message) shows problems.
 */
export default function ContinueWithGoogle({ navigation, role, onError, disabled }) {
  const [busy, setBusy] = useState(false);

  const run = async () => {
    if (busy) return;
    setBusy(true);
    onError(null);
    try {
      const idToken = await getGoogleIdToken();
      if (!idToken) return; // cancelled
      const res = await googleLogin(idToken, role);
      if (res.needsSignup) {
        navigation.navigate('GoogleSignup', {
          signupToken: res.signupToken, fullName: res.fullName, email: res.email, role,
        });
      } else {
        goAfterLogin(navigation, res.status);
      }
    } catch (err) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View>
      <View style={styles.orRow}>
        <View style={styles.line} />
        <Text style={styles.orText}>or</Text>
        <View style={styles.line} />
      </View>
      <TouchableOpacity
        onPress={run}
        disabled={busy || disabled}
        activeOpacity={0.85}
        style={[styles.btn, (busy || disabled) && { opacity: 0.6 }]}
        accessibilityRole="button"
        accessibilityLabel="Continue with Google"
        accessibilityState={{ busy, disabled: !!disabled }}
      >
        {busy ? <ActivityIndicator color={COLORS.text} /> : <GoogleG />}
        <Text style={styles.btnText}>Continue with Google</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  orRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 14 },
  line: { flex: 1, height: 1, backgroundColor: COLORS.border },
  orText: { fontSize: FONT_SIZE.sm, color: COLORS.textSecondary, fontWeight: FONT_WEIGHT.semibold },
  btn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12,
    minHeight: 54, borderRadius: RADIUS.full, borderWidth: 1.5, borderColor: '#DADCE0', backgroundColor: COLORS.white,
  },
  btnText: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.bold, color: '#1F1F1F' },
});
