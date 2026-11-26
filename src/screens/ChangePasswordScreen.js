import React, { useState } from 'react';
import { Alert } from 'react-native';

import { AuthScreen, AuthHeader, Field, PrimaryButton, Banner } from '../components/AuthUI';
import { changePassword } from '../lib/session';

// Same rules as the server: 8–72 characters with at least one letter and one number.
function passwordProblem(pw) {
  if (pw.length < 8) return 'Use at least 8 characters.';
  if (pw.length > 72) return 'Use at most 72 characters.';
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return 'Use at least one letter and one number.';
  return '';
}

export default function ChangePasswordScreen({ navigation }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const e = {};
    if (!current) e.current = 'Enter your current password.';
    const problem = passwordProblem(next);
    if (problem) e.next = problem;
    else if (next === current) e.next = 'Choose a password different from the current one.';
    if (!e.next && confirm !== next) e.confirm = 'The new passwords do not match.';
    setErrors(e);
    setMessage('');
    if (Object.keys(e).length) return;

    setBusy(true);
    try {
      await changePassword(current, next, confirm);
      Alert.alert(
        'Password changed',
        'Use your new password next time you log in. Other phones signed in to this account have been logged out.',
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } catch (err) {
      if (err.code === 'wrong_password') setErrors({ current: err.message });
      else if (err.code === 'weak_password' || err.code === 'same_password') setErrors({ next: err.message });
      else if (err.code === 'password_mismatch') setErrors({ confirm: err.message });
      else setMessage(err.message || 'Could not change the password. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthScreen onBack={() => navigation.goBack()}>
      <AuthHeader
        icon="key-outline"
        title="Change password"
        subtitle="Other phones signed in to your account will be logged out."
      />
      <Banner kind="error" message={message} />
      <Field
        label="Current password"
        icon="lock-closed-outline"
        secure
        value={current}
        onChangeText={setCurrent}
        error={errors.current}
        autoCapitalize="none"
        autoComplete="current-password"
        textContentType="password"
        returnKeyType="next"
      />
      <Field
        label="New password"
        icon="key-outline"
        secure
        value={next}
        onChangeText={setNext}
        error={errors.next}
        placeholder="At least 8 characters, a letter and a number"
        autoCapitalize="none"
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="next"
      />
      <Field
        label="Confirm new password"
        icon="key-outline"
        secure
        value={confirm}
        onChangeText={setConfirm}
        error={errors.confirm}
        autoCapitalize="none"
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="done"
        onSubmitEditing={submit}
      />
      <PrimaryButton label="Change password" icon="checkmark" onPress={submit} loading={busy} />
    </AuthScreen>
  );
}
