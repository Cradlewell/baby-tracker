import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { reportError } from '../lib/crashReporter';
import { COLORS } from '../constants/colors';
import { FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING } from '../constants/theme';

/**
 * If a screen fails while drawing, show a calm message with "Try again" instead of a blank or
 * closed app, and send a crash report. Saved records are safe: they live in storage, not here.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error, info) {
    const err = error instanceof Error ? error : new Error(String(error));
    if (info?.componentStack) err.stack = `${err.stack || ''}\nComponents:${info.componentStack}`.slice(0, 8000);
    reportError(err, { fatal: false });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <View style={styles.wrap} accessibilityRole="alert">
        <View style={styles.icon}><Ionicons name="alert-circle" size={36} color={COLORS.primary} /></View>
        <Text style={styles.title}>Something went wrong</Text>
        <Text style={styles.body}>
          Your saved records are safe. We've been told about the problem. Tap Try again to go back to the app.
        </Text>
        <TouchableOpacity style={styles.btn} onPress={() => this.setState({ failed: false })} accessibilityRole="button">
          <Ionicons name="refresh" size={18} color={COLORS.white} />
          <Text style={styles.btnText}>Try again</Text>
        </TouchableOpacity>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.xl, backgroundColor: COLORS.background },
  icon: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: COLORS.primaryLight,
    alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.md,
  },
  title: { fontSize: FONT_SIZE.xl, fontWeight: FONT_WEIGHT.heavy, color: COLORS.text, textAlign: 'center' },
  body: { fontSize: FONT_SIZE.base, color: COLORS.textSecondary, textAlign: 'center', marginTop: 8, lineHeight: 22, maxWidth: 340 },
  btn: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: SPACING.lg,
    backgroundColor: COLORS.primary, borderRadius: RADIUS.full, paddingVertical: 14, paddingHorizontal: 28, minHeight: 48,
  },
  btnText: { color: COLORS.white, fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.bold },
});
