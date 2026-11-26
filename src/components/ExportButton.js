import React, { useState } from 'react';
import { Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useBabyStore } from '../store/useBabyStore';
import { exportReport, openReport } from '../lib/reportPdf';
import ExportSheet from './ExportSheet';
import { COLORS } from '../constants/colors';
import { FONT_SIZE, FONT_WEIGHT, RADIUS } from '../constants/theme';

/**
 * "Export PDF" button with its sheet: choose the baby (when there are several), the daily
 * report (a date) or the monthly report (a month); the PDF is saved and can be opened.
 */
export default function ExportButton({ C }) {
  const { babies, activeBabyId } = useBabyStore();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const run = async (babyId, kind, when) => {
    setOpen(false);
    setBusy(true);
    try {
      const file = await exportReport(kind, babyId, when);
      Alert.alert('Download complete', file.name, [
        { text: 'Close', style: 'cancel' },
        {
          text: 'Open',
          onPress: () => openReport(file.uri).catch((err) => Alert.alert('Could not open the report', err?.message || 'Please try again.')),
        },
      ]);
    } catch (err) {
      Alert.alert(
        err?.code === 'NO_DATA' ? 'No records to download' : 'Could not create the report',
        err?.message || 'Please try again.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <TouchableOpacity
        onPress={() => setOpen(true)}
        disabled={busy}
        style={[styles.btn, { backgroundColor: C.primaryLight }]}
        accessibilityRole="button"
        accessibilityLabel={busy ? 'Preparing the report' : 'Export a PDF report'}
        accessibilityState={{ busy }}
      >
        {busy
          ? <ActivityIndicator size="small" color={C.primary} />
          : <Ionicons name="download-outline" size={18} color={C.primary} />}
        <Text style={[styles.text, { color: C.primary }]}>{busy ? 'Preparing…' : 'Export PDF'}</Text>
      </TouchableOpacity>
      <ExportSheet
        visible={open}
        babies={babies}
        activeBabyId={activeBabyId}
        C={C}
        onClose={() => setOpen(false)}
        onChoose={run}
      />
    </>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44,
    paddingHorizontal: 14, borderRadius: RADIUS.full,
  },
  text: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.bold, color: COLORS.primary },
});
