import React, { useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView,
  KeyboardAvoidingView, Platform, ActivityIndicator, Dimensions, Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import GradientView from './GradientView';
import { COLORS, GRADIENTS } from '../constants/colors';
import { FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING, SHADOW, MAX_CONTENT_WIDTH, fs } from '../constants/theme';

// The app sits in a centred column on wide screens, so size from that column's width.
const W = Math.min(Dimensions.get('window').width, MAX_CONTENT_WIDTH);

// Page frame shared by the login, registration and verification screens.
export function AuthScreen({ onBack, children, footer }) {
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <GradientView colors={GRADIENTS.brand} style={styles.glow} pointerEvents="none" />
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {onBack ? (
          <TouchableOpacity
            onPress={onBack}
            style={styles.backBtn}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="chevron-back" size={22} color={COLORS.text} />
          </TouchableOpacity>
        ) : <View style={{ height: 42 }} />}
        {children}
        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// Title block with either the app logo or an icon badge.
export function AuthHeader({ icon, title, subtitle }) {
  return (
    <View style={styles.headerBlock}>
      <View style={styles.badgeHalo}>
        {icon ? (
          <GradientView colors={GRADIENTS.brand} style={styles.badge}>
            <Ionicons name={icon} size={40} color={COLORS.white} />
          </GradientView>
        ) : (
          <View style={[styles.badge, styles.logoBadge]}>
            <Image source={require('../../assets/logo.png')} style={styles.logo} resizeMode="contain" />
          </View>
        )}
      </View>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

export function Field({ label, icon, error, secure, style, ...inputProps }) {
  const [hidden, setHidden] = useState(true);
  const [focused, setFocused] = useState(false);
  return (
    <View style={[styles.field, style]}>
      <Text style={styles.label}>{label}</Text>
      <View style={[
        styles.inputWrap,
        focused && { borderColor: COLORS.primary },
        error && { borderColor: COLORS.error },
      ]}>
        {icon ? <Ionicons name={icon} size={18} color={focused ? COLORS.primary : COLORS.textMuted} /> : null}
        <TextInput
          style={styles.input}
          placeholderTextColor={COLORS.textMuted}
          secureTextEntry={secure && hidden}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          accessibilityLabel={label}
          {...inputProps}
        />
        {secure ? (
          <TouchableOpacity
            onPress={() => setHidden(!hidden)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel={hidden ? 'Show password' : 'Hide password'}
          >
            <Ionicons name={hidden ? 'eye-outline' : 'eye-off-outline'} size={19} color={COLORS.textMuted} />
          </TouchableOpacity>
        ) : null}
      </View>
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}

export function PrimaryButton({ label, onPress, loading, disabled, icon = 'arrow-forward' }) {
  const off = disabled || loading;
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={off}
      activeOpacity={0.85}
      style={off && styles.ctaDisabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: off, busy: !!loading }}
    >
      <GradientView colors={GRADIENTS.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.cta}>
        <Text style={styles.ctaText}>{label}</Text>
        <View style={styles.ctaArrow}>
          {loading
            ? <ActivityIndicator color={COLORS.white} />
            : <Ionicons name={icon} size={18} color={COLORS.white} />}
        </View>
      </GradientView>
    </TouchableOpacity>
  );
}

export function TextLink({ prefix, label, onPress, disabled }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      style={styles.linkRow}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {prefix ? <Text style={styles.linkPrefix}>{prefix} </Text> : null}
      <Text style={[styles.link, disabled && { color: COLORS.textMuted }]}>{label}</Text>
    </TouchableOpacity>
  );
}

// Nurse / Client choice at the top of login and sign-up.
const ROLE_OPTIONS = [
  { value: 'client', label: 'Client', icon: 'people-outline', hint: 'Parent or family' },
  { value: 'nurse', label: 'Nurse', icon: 'medkit-outline', hint: 'Care for clients' },
];

export function RoleToggle({ value, onChange }) {
  return (
    <View style={styles.roleRow} accessibilityRole="radiogroup">
      {ROLE_OPTIONS.map((o) => {
        const on = value === o.value;
        return (
          <TouchableOpacity
            key={o.value}
            onPress={() => onChange(o.value)}
            activeOpacity={0.85}
            style={[styles.roleCard, on && styles.roleCardOn]}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`${o.label}: ${o.hint}`}
          >
            <View style={[styles.roleIcon, on && styles.roleIconOn]}>
              <Ionicons name={o.icon} size={22} color={on ? COLORS.white : COLORS.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.roleLabel, on && { color: COLORS.primary }]}>{o.label}</Text>
              <Text style={styles.roleHint}>{o.hint}</Text>
            </View>
            {on ? <Ionicons name="checkmark-circle" size={20} color={COLORS.primary} /> : null}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// Error / success / info message box.
export function Banner({ kind = 'error', message }) {
  if (!message) return null;
  const palette = {
    error: { bg: COLORS.errorLight, fg: COLORS.error, icon: 'alert-circle' },
    success: { bg: COLORS.successLight, fg: COLORS.success, icon: 'checkmark-circle' },
    info: { bg: COLORS.primaryLight, fg: COLORS.primary, icon: 'information-circle' },
  }[kind];
  return (
    <View style={[styles.banner, { backgroundColor: palette.bg, borderColor: palette.fg + '33' }]} accessibilityLiveRegion="polite">
      <Ionicons name={palette.icon} size={18} color={palette.fg} />
      <Text style={[styles.bannerText, { color: palette.fg }]}>{message}</Text>
    </View>
  );
}

// Six boxes backed by one hidden input, so paste and SMS autofill work.
export function OtpInput({ value, onChange, onComplete, error }) {
  const ref = useRef(null);
  const [focused, setFocused] = useState(true);
  return (
    <TouchableOpacity activeOpacity={1} onPress={() => ref.current?.focus()} style={styles.otpRow} accessibilityRole="none">
      {Array.from({ length: 6 }).map((_, i) => {
        const active = focused && (i === value.length || (i === 5 && value.length === 6));
        return (
          <View
            key={i}
            style={[
              styles.otpBox,
              value[i] && styles.otpBoxFilled,
              active && styles.otpBoxActive,
              error && styles.otpBoxError,
            ]}
          >
            <Text style={styles.otpDigit}>{value[i] || ''}</Text>
          </View>
        );
      })}
      <TextInput
        ref={ref}
        value={value}
        onChangeText={(t) => {
          const digits = t.replace(/\D/g, '').slice(0, 6);
          onChange(digits);
          if (digits.length === 6) onComplete?.(digits);
        }}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        maxLength={6}
        autoFocus
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={styles.otpHidden}
        accessibilityLabel="6-digit verification code"
      />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  glow: {
    position: 'absolute', top: -W * 0.55, left: -W * 0.25,
    width: W * 1.5, height: W * 1.1, borderRadius: W, opacity: 0.16,
  },
  scroll: { flexGrow: 1, paddingHorizontal: SPACING.lg },
  backBtn: {
    width: 42, height: 42, borderRadius: 14, backgroundColor: COLORS.white,
    alignItems: 'center', justifyContent: 'center', ...SHADOW.sm,
  },
  footer: { marginTop: 'auto', paddingTop: SPACING.lg, alignItems: 'center' },

  headerBlock: { alignItems: 'center', marginTop: SPACING.sm, marginBottom: SPACING.lg },
  badgeHalo: { padding: 10, borderRadius: 60, backgroundColor: COLORS.primaryLight, marginBottom: SPACING.md },
  badge: {
    width: 92, height: 92, borderRadius: 32, alignItems: 'center', justifyContent: 'center', ...SHADOW.lg,
  },
  logoBadge: { backgroundColor: COLORS.white },
  logo: { width: 64, height: 64 },
  title: {
    fontSize: FONT_SIZE.xxl, fontWeight: FONT_WEIGHT.heavy, color: COLORS.text,
    textAlign: 'center', letterSpacing: -0.6,
  },
  subtitle: {
    fontSize: FONT_SIZE.md, color: COLORS.textSecondary, textAlign: 'center',
    marginTop: 6, lineHeight: 21, paddingHorizontal: SPACING.sm,
  },

  field: { marginBottom: SPACING.md },
  label: {
    fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.heavy, color: COLORS.textSecondary,
    letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 8, marginLeft: 4,
  },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    minHeight: 56, borderRadius: RADIUS.lg, backgroundColor: COLORS.card,
    borderWidth: 1.5, borderColor: COLORS.border, paddingHorizontal: SPACING.md, ...SHADOW.sm,
  },
  input: {
    flex: 1, fontSize: FONT_SIZE.base, color: COLORS.text, fontWeight: FONT_WEIGHT.semibold, paddingVertical: 14,
  },
  fieldError: { fontSize: FONT_SIZE.sm, color: COLORS.error, marginTop: 6, marginLeft: 4, fontWeight: FONT_WEIGHT.medium },

  cta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderRadius: RADIUS.full, paddingVertical: 8, paddingLeft: SPACING.lg, paddingRight: 8,
    minHeight: 60, marginTop: SPACING.sm, ...SHADOW.lg,
  },
  ctaArrow: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center', justifyContent: 'center',
  },
  ctaDisabled: { opacity: 0.5 },
  ctaText: { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.heavy, color: COLORS.white },

  linkRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: SPACING.sm },
  linkPrefix: { fontSize: FONT_SIZE.md, color: COLORS.textSecondary },
  link: { fontSize: FONT_SIZE.md, color: COLORS.primary, fontWeight: FONT_WEIGHT.heavy },

  banner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    padding: 12, borderRadius: RADIUS.md, borderWidth: 1, marginBottom: SPACING.md,
  },
  bannerText: { flex: 1, fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold, lineHeight: 19 },

  roleRow: { flexDirection: 'row', gap: 10, marginBottom: SPACING.lg },
  roleCard: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 64,
    paddingHorizontal: 12, borderRadius: RADIUS.lg, borderWidth: 1.5,
    borderColor: COLORS.border, backgroundColor: COLORS.card, ...SHADOW.sm,
  },
  roleCardOn: { borderColor: COLORS.primary, backgroundColor: COLORS.primaryLight },
  roleIcon: {
    width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.primaryLight,
  },
  roleIconOn: { backgroundColor: COLORS.primary },
  roleLabel: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.heavy, color: COLORS.text },
  roleHint: { fontSize: FONT_SIZE.xs, color: COLORS.textSecondary, marginTop: 1 },

  otpRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginBottom: SPACING.md },
  otpBox: {
    flex: 1, aspectRatio: 0.85, maxWidth: 56, borderRadius: RADIUS.md, borderWidth: 1.5,
    borderColor: COLORS.border, backgroundColor: COLORS.card,
    alignItems: 'center', justifyContent: 'center', ...SHADOW.sm,
  },
  otpBoxFilled: { borderColor: COLORS.primary + '66', backgroundColor: COLORS.primaryLight },
  otpBoxActive: { borderColor: COLORS.primary, borderWidth: 2 },
  otpBoxError: { borderColor: COLORS.error },
  otpDigit: { fontSize: fs(24), fontWeight: FONT_WEIGHT.heavy, color: COLORS.text },
  otpHidden: { position: 'absolute', opacity: 0, width: 1, height: 1 },
});
