import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useHealthCheck } from '../lib/useHealthCheck';
import { Screen, SectionTitle, Disclaimer, LEVEL_STYLE, useTheme } from '../components/HealthUI';
import { COLORS } from '../constants/colors';
import { FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING } from '../constants/theme';

export function AlertCard({ alert, onPress }) {
  const s = LEVEL_STYLE[alert.level];
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[styles.alert, { backgroundColor: s.bg }]}
      accessibilityRole="button"
      accessibilityLabel={`${s.label}: ${alert.title}. ${alert.detail}`}
    >
      <View style={[styles.alertIcon, { backgroundColor: COLORS.white }]}>
        <Ionicons name={s.icon} size={24} color={s.fg} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.alertTitle, { color: COLORS.text }]}>{alert.title}</Text>
        <Text style={[styles.alertDetail, { color: COLORS.textSecondary }]}>{alert.detail}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={COLORS.textSecondary} />
    </TouchableOpacity>
  );
}

export default function HealthAlertsScreen({ navigation }) {
  const C = useTheme();
  const { status, alerts, insight } = useHealthCheck();
  const urgent = alerts.filter((a) => a.level === 'urgent');
  const attention = alerts.filter((a) => a.level === 'attention');
  const s = status === 'urgent' ? LEVEL_STYLE.urgent : status === 'attention' ? LEVEL_STYLE.attention : LEVEL_STYLE.normal;

  return (
    <Screen title="Health Alerts" subtitle="Today's health check" onBack={() => navigation.goBack()}>
      <View style={[styles.summary, { backgroundColor: status === 'unknown' ? C.primaryLight : s.bg }]}>
        <Ionicons name={status === 'unknown' ? 'information-circle' : s.icon} size={28} color={status === 'unknown' ? C.primary : s.fg} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.summaryTitle, { color: COLORS.text }]}>
            {status === 'unknown' ? 'Not enough data yet' : status === 'healthy' ? 'Healthy' : status === 'urgent' ? 'Urgent' : 'Attention'}
          </Text>
          <Text style={[styles.summaryText, { color: COLORS.textSecondary }]}>{insight}</Text>
        </View>
      </View>

      {urgent.length ? <SectionTitle>Urgent</SectionTitle> : null}
      {urgent.map((a) => <AlertCard key={a.id} alert={a} onPress={() => navigation.navigate(a.route)} />)}
      {attention.length ? <SectionTitle>Attention</SectionTitle> : null}
      {attention.map((a) => <AlertCard key={a.id} alert={a} onPress={() => navigation.navigate(a.route)} />)}
      {!alerts.length && status !== 'unknown' ? (
        <Text style={[styles.none, { color: C.textSecondary }]}>No alerts. Everything logged today is within the usual range.</Text>
      ) : null}
      <Disclaimer />
    </Screen>
  );
}

const styles = StyleSheet.create({
  summary: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: SPACING.md, borderRadius: RADIUS.xl, marginBottom: SPACING.md },
  summaryTitle: { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.heavy },
  summaryText: { fontSize: FONT_SIZE.md, marginTop: 2, lineHeight: 21 },
  alert: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: SPACING.md,
    borderRadius: RADIUS.xl, marginBottom: SPACING.sm,
  },
  alertIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  alertTitle: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.heavy },
  alertDetail: { fontSize: FONT_SIZE.sm, marginTop: 2, lineHeight: 19 },
  none: { fontSize: FONT_SIZE.md, textAlign: 'center', paddingVertical: SPACING.lg },
});
