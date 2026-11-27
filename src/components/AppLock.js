import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal, AppState, Alert, Vibration,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as LocalAuthentication from 'expo-local-authentication';

import { useSettingsStore, MAX_PIN_TRIES } from '../store/useSettingsStore';
import { useAuthStore } from '../store/useAuthStore';
import { useBabyStore } from '../store/useBabyStore';
import { COLORS, DARK_COLORS } from '../constants/colors';
import { FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING } from '../constants/theme';

export const PIN_LENGTH = 4;
// Back from the background after this long, the app locks again. A short trip (opening a PDF,
// answering the share sheet) does not ask for the PIN again.
const RELOCK_AFTER_MS = 30 * 1000;

const waitText = (ms) => {
  const s = Math.max(1, Math.ceil(ms / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.ceil(s / 60);
  return `${m} min`;
};

/** True when this phone has a fingerprint / face set up that can unlock the app. */
export async function biometricsAvailable() {
  try {
    return (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync());
  } catch (_) {
    return false;
  }
}

async function askBiometrics() {
  try {
    const r = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Unlock Cradlewell Bloom',
      cancelLabel: 'Use PIN',
      disableDeviceFallback: true,
    });
    return r.success;
  } catch (_) {
    return false;
  }
}

/**
 * Four PIN dots and a number pad. Calls onComplete(pin) when 4 digits are in, then clears.
 * onBiometrics: shows a fingerprint key in the bottom-left corner.
 */
export function PinPad({ title, subtitle, error, onComplete, onBiometrics, disabled, C }) {
  const [pin, setPin] = useState('');
  useEffect(() => { if (error) setPin(''); }, [error]);

  const press = (d) => {
    if (disabled || pin.length >= PIN_LENGTH) return;
    const next = pin + d;
    setPin(next);
    if (next.length === PIN_LENGTH) {
      // Let the last dot fill before moving on.
      setTimeout(() => { onComplete(next); setPin(''); }, 120);
    }
  };

  const key = (content, onPress, label) => (
    <TouchableOpacity
      key={label}
      onPress={onPress}
      disabled={disabled || !onPress}
      style={[styles.key, onPress && content !== null && { backgroundColor: C.card, borderColor: C.border }]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {content}
    </TouchableOpacity>
  );
  const digit = (d) => key(<Text style={[styles.keyText, { color: C.text }]}>{d}</Text>, () => press(d), d);

  return (
    <View style={styles.pad}>
      <Text style={[styles.padTitle, { color: C.text }]}>{title}</Text>
      {subtitle ? <Text style={[styles.padSub, { color: C.textSecondary }]}>{subtitle}</Text> : null}
      <View style={styles.dots} accessibilityLabel={`${pin.length} of ${PIN_LENGTH} digits entered`}>
        {Array.from({ length: PIN_LENGTH }, (_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              { borderColor: error ? COLORS.error : C.primary },
              i < pin.length && { backgroundColor: error ? COLORS.error : C.primary },
            ]}
          />
        ))}
      </View>
      <Text style={[styles.error, { color: COLORS.error }]} accessibilityLiveRegion="polite">{error || ' '}</Text>
      <View style={styles.grid}>
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(digit)}
        {onBiometrics
          ? key(<Ionicons name="finger-print" size={30} color={C.primary} />, onBiometrics, 'Unlock with fingerprint or face')
          : <View key="blank" style={styles.key} />}
        {digit('0')}
        {key(<Ionicons name="backspace-outline" size={26} color={C.text} />, () => setPin(pin.slice(0, -1)), 'Delete')}
      </View>
    </View>
  );
}

/**
 * The lock screen, over the whole app, while the app lock is on and the app is locked.
 * It locks when the app starts and when it comes back after RELOCK_AFTER_MS in the background.
 * It is its own full-screen window (a Modal), so sheets and pop-ups opened before the app
 * locked stay underneath it, and the Android back button does nothing while it is up.
 * The wrong-PIN count and wait are saved, so closing and reopening the app doesn't reset them.
 * onForgot: called after the parent confirms "Forgot PIN" (logs out).
 */
export function LockScreen({ onForgot }) {
  const { loaded, appLock, biometrics, locked } = useSettingsStore();
  const status = useAuthStore((s) => s.status);
  const darkMode = useBabyStore((s) => s.darkMode);
  const C = darkMode ? DARK_COLORS : COLORS;
  const insets = useSafeAreaInsets();
  const [error, setError] = useState('');
  const [waitUntil, setWaitUntil] = useState(0);
  const [, tick] = useState(0);
  const leftAt = useRef(null);

  const show = loaded && appLock && locked && status !== 'signedOut';

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') leftAt.current = Date.now();
      if (state === 'active' && leftAt.current && Date.now() - leftAt.current > RELOCK_AFTER_MS) {
        useSettingsStore.getState().lock();
      }
      if (state === 'active') leftAt.current = null;
    });
    return () => sub.remove();
  }, []);

  const tryBiometrics = useCallback(async () => {
    if (await askBiometrics()) {
      setError('');
      await useSettingsStore.getState().pinPassed();
      useSettingsStore.getState().unlock();
    }
  }, []);

  // When the lock appears: pick up a wait still running from before the app was closed, and
  // offer the fingerprint / face prompt (not during a wait).
  useEffect(() => {
    if (!show) return;
    let cancelled = false;
    useSettingsStore.getState().pinTries().then(({ waitUntil: w }) => {
      if (cancelled) return;
      setWaitUntil(w);
      if (biometrics && !(w > Date.now())) tryBiometrics();
    });
    return () => { cancelled = true; };
  }, [show, biometrics]);

  // Counts down the wait after too many wrong PINs.
  const waiting = waitUntil > Date.now();
  useEffect(() => {
    if (!waiting) return undefined;
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [waiting]);

  if (!show) return null;

  const check = async (pin) => {
    if (waitUntil > Date.now()) return;
    const store = useSettingsStore.getState();
    if (await store.checkPin(pin)) {
      setError('');
      await store.pinPassed();
      store.unlock();
      return;
    }
    Vibration.vibrate(200);
    const { left, waitUntil: w } = await store.pinFailed();
    setWaitUntil(w);
    setError(left === MAX_PIN_TRIES ? '' : `Wrong PIN. ${left} ${left === 1 ? 'try' : 'tries'} left.`);
  };

  const forgot = () => Alert.alert(
    'Forgot your PIN?',
    'You will be logged out and the app lock is removed. Log in again with your email and password, then set a new PIN in Settings.',
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log out', style: 'destructive', onPress: onForgot },
    ]
  );

  return (
    <Modal
      visible
      animationType="none"
      statusBarTranslucent
      // Android back button: stays on the lock screen.
      onRequestClose={() => {}}
    >
    <View
      style={[styles.lock, { flex: 1, backgroundColor: C.background, paddingTop: insets.top + 40, paddingBottom: insets.bottom + 20 }]}
      accessibilityViewIsModal
    >
      <View style={[styles.lockIcon, { backgroundColor: C.primaryLight }]}>
        <Ionicons name="lock-closed" size={30} color={C.primary} />
      </View>
      <PinPad
        C={C}
        title="Enter your PIN"
        subtitle="Cradlewell Bloom is locked"
        error={waiting ? `Too many wrong tries. Wait ${waitText(waitUntil - Date.now())}.` : error}
        disabled={waiting}
        onComplete={check}
        onBiometrics={biometrics ? tryBiometrics : null}
      />
      <TouchableOpacity onPress={forgot} style={styles.forgot} accessibilityRole="button">
        <Text style={[styles.forgotText, { color: C.primary }]}>Forgot PIN?</Text>
      </TouchableOpacity>
    </View>
    </Modal>
  );
}

/**
 * PIN steps in a sheet, for Settings.
 * mode 'set'    : new PIN, confirm it, then onDone(pin).
 * mode 'verify' : the current PIN, then onDone() (to turn the lock off).
 * mode 'change' : the current PIN, a new one and its confirmation, then onDone(pin).
 */
export function PinSheet({ visible, mode, onDone, onClose, C }) {
  const [step, setStep] = useState('current');
  const [first, setFirst] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (visible) {
      setStep(mode === 'set' ? 'new' : 'current');
      setFirst('');
      setError('');
    }
  }, [visible, mode]);

  const onPin = async (pin) => {
    setError('');
    if (step === 'current') {
      if (!(await useSettingsStore.getState().checkPin(pin))) { Vibration.vibrate(200); setError('Wrong PIN. Try again.'); return; }
      if (mode === 'verify') { onDone(); return; }
      setStep('new');
      return;
    }
    if (step === 'new') { setFirst(pin); setStep('confirm'); return; }
    if (pin !== first) {
      Vibration.vibrate(200);
      setError("The PINs don't match. Start again.");
      setFirst('');
      setStep('new');
      return;
    }
    onDone(pin);
  };

  const titles = {
    current: ['Enter your current PIN', mode === 'verify' ? 'To turn off the app lock' : 'To change your PIN'],
    new: ['Choose a 4-digit PIN', 'You will enter it each time you open the app'],
    confirm: ['Enter the PIN again', 'To make sure it is right'],
  }[step];

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.sheet, { backgroundColor: C.background }]}>
        <TouchableOpacity
          onPress={onClose}
          style={[styles.close, { backgroundColor: C.card, borderColor: C.border }]}
          accessibilityRole="button"
          accessibilityLabel="Cancel"
        >
          <Ionicons name="close" size={22} color={C.text} />
        </TouchableOpacity>
        <PinPad key={step} C={C} title={titles[0]} subtitle={titles[1]} error={error} onComplete={onPin} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  lock: { alignItems: 'center', zIndex: 1000, elevation: 1000 },
  lockIcon: { width: 64, height: 64, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.md },
  sheet: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.lg },
  close: {
    position: 'absolute', top: 48, right: SPACING.lg, width: 44, height: 44, borderRadius: 14, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  pad: { alignItems: 'center', width: '100%', maxWidth: 340 },
  padTitle: { fontSize: FONT_SIZE.xl, fontWeight: FONT_WEIGHT.heavy, textAlign: 'center' },
  padSub: { fontSize: FONT_SIZE.sm, marginTop: 6, textAlign: 'center' },
  dots: { flexDirection: 'row', gap: 18, marginTop: SPACING.lg },
  dot: { width: 16, height: 16, borderRadius: 8, borderWidth: 2 },
  error: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold, marginTop: SPACING.sm, minHeight: 20, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 16, marginTop: SPACING.md, width: 280 },
  key: { width: 76, height: 64, borderRadius: RADIUS.lg, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'transparent' },
  keyText: { fontSize: 26, fontWeight: FONT_WEIGHT.bold },
  forgot: { marginTop: SPACING.lg, minHeight: 44, justifyContent: 'center', paddingHorizontal: SPACING.md },
  forgotText: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.bold },
});
