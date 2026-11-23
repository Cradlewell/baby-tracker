import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  TextInput, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { useBabyStore } from '../store/useBabyStore';
import { useFeedingStore, sideSecs } from '../store/useFeedingStore';
import { COLORS, DARK_COLORS } from '../constants/colors';
import { FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING, SHADOW } from '../constants/theme';
import {
  formatDurationMins, formatDuration, formatRelative, parsePositiveNumber, startOfToday,
} from '../utils/formatters';

// Re-renders every second while a timer is on screen. The time itself is always
// computed from saved timestamps, so nothing is lost if renders are skipped.
function useNow(active = true) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

const QTY_STEP = { ml: 10, oz: 0.5 };
const fmtQty = (n) => String(Math.round(n * 10) / 10);

// ─── Breast Side Picker ───────────────────────────────────────────────────────

function BreastSidePicker({ C, onSelect }) {
  return (
    <View style={styles.sidePickerWrap}>
      <View style={[styles.totalBadge, { backgroundColor: C.feedingLight, marginBottom: SPACING.md }]}>
        <Ionicons name="heart" size={16} color={COLORS.feeding} />
        <Text style={[styles.totalLabel, { color: C.textSecondary }]}>
          Breastfeed — Which side to start?
        </Text>
      </View>
      <View style={styles.sidesRow}>
        {['left', 'right'].map((side) => (
          <TouchableOpacity
            key={side}
            onPress={() => onSelect(side)}
            style={[styles.sideCard, { backgroundColor: C.card, borderColor: C.border }]}
            accessibilityRole="button"
            accessibilityLabel={`Start from ${side} breast`}
          >
            <Ionicons name={side === 'left' ? 'arrow-back-circle' : 'arrow-forward-circle'} size={34} color={COLORS.feeding} />
            <Text style={[styles.sideLabel, { color: COLORS.feeding }]}>{side.toUpperCase()}</Text>
            <Text style={[styles.sidePickerHint, { color: C.textMuted }]}>Start timer on {side}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

// ─── Breastfeeding Live Timer ─────────────────────────────────────────────────

function BreastfeedTimer({ C, onEnd }) {
  const session = useFeedingStore((s) => s.session);
  const { switchSide, pauseSession, resumeSession, toggleBurped, endSession } = useFeedingStore.getState();
  const now = useNow(!!session && !session.paused);
  const [ending, setEnding] = useState(false);

  if (!session) return null;
  const { activeSide, paused, burped } = session;
  const leftSecs = sideSecs(session, 'left', now);
  const rightSecs = sideSecs(session, 'right', now);

  const handleSwitch = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    switchSide();
  };

  const handleEnd = async () => {
    if (ending) return;
    setEnding(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const entry = await endSession();
    onEnd(entry);
  };

  const renderSide = (side, secs) => {
    const active = activeSide === side;
    return (
      <TouchableOpacity
        onPress={() => !active && handleSwitch()}
        style={[
          styles.sideCard,
          { backgroundColor: C.card, borderColor: C.border },
          active && styles.sideCardActive,
          active && { backgroundColor: C.feedingLight },
        ]}
        accessibilityRole="button"
        accessibilityLabel={`${side} side`}
        accessibilityState={{ selected: active }}
      >
        <Ionicons
          name={active ? 'radio-button-on' : 'radio-button-off'}
          size={18}
          color={active ? COLORS.feeding : C.textMuted}
        />
        <Text style={[styles.sideLabel, { color: active ? COLORS.feeding : C.textSecondary }]}>
          {side.toUpperCase()}
        </Text>
        <Text style={[styles.sideTime, { color: active ? COLORS.feeding : C.text }]}>
          {formatDurationMins(secs)}
        </Text>
        {active && !paused && <View style={styles.activeDot} />}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.timerContainer}>
      <View style={[styles.totalBadge, { backgroundColor: C.feedingLight }]}>
        <Ionicons name="time-outline" size={16} color={COLORS.feeding} />
        <Text style={[styles.totalLabel, { color: C.textSecondary }]}>{paused ? 'Paused' : 'Total'}</Text>
        <Text style={[styles.totalTime, { color: COLORS.feeding }]}>
          {formatDurationMins(leftSecs + rightSecs)}
        </Text>
      </View>

      <View style={styles.sidesRow}>
        {renderSide('left', leftSecs)}
        <TouchableOpacity
          onPress={handleSwitch}
          style={[styles.switchBtn, { backgroundColor: COLORS.feeding + '18' }]}
          accessibilityRole="button"
          accessibilityLabel="Switch side"
        >
          <Ionicons name="swap-horizontal" size={22} color={COLORS.feeding} />
        </TouchableOpacity>
        {renderSide('right', rightSecs)}
      </View>

      <Text style={[styles.switchHint, { color: C.textMuted }]}>
        Tap the other side to switch · The timer keeps running if you lock your phone
      </Text>

      <TouchableOpacity
        onPress={() => { Haptics.selectionAsync(); toggleBurped(); }}
        style={[styles.burpRow, { backgroundColor: C.card, borderColor: C.border }]}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: burped }}
        accessibilityLabel="Burping completed"
      >
        <Ionicons
          name={burped ? 'checkmark-circle' : 'ellipse-outline'}
          size={22}
          color={burped ? COLORS.success : C.textMuted}
        />
        <Text style={[styles.burpText, { color: C.text }]}>Burping completed</Text>
      </TouchableOpacity>

      <View style={styles.controlRow}>
        <TouchableOpacity
          onPress={() => { Haptics.selectionAsync(); paused ? resumeSession() : pauseSession(); }}
          style={[styles.controlBtn, { backgroundColor: C.card, borderColor: C.border }]}
          accessibilityRole="button"
          accessibilityLabel={paused ? 'Resume' : 'Pause'}
        >
          <Ionicons name={paused ? 'play' : 'pause'} size={22} color={C.text} />
          <Text style={[styles.controlBtnText, { color: C.text }]}>{paused ? 'Resume' : 'Pause'}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleEnd}
          disabled={ending}
          style={[styles.endBtn, { backgroundColor: COLORS.feeding, opacity: ending ? 0.6 : 1 }]}
          accessibilityRole="button"
          accessibilityLabel="End feeding"
        >
          <Ionicons name="stop-circle" size={22} color={COLORS.white} />
          <Text style={styles.endBtnText}>End Feeding</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Bottle Prepare Form ──────────────────────────────────────────────────────

function BottlePrepForm({ C, milkType, setMilkType, unit, setUnit, preparedQty, setPreparedQty, onStart }) {
  const step = QTY_STEP[unit];
  const qty = parsePositiveNumber(preparedQty);
  const changeUnit = (u) => {
    if (u === unit) return;
    // Convert the current amount so switching units doesn't change the real quantity.
    if (qty) setPreparedQty(fmtQty(u === 'oz' ? qty / 29.5735 : qty * 29.5735));
    setUnit(u);
  };

  return (
    <View style={styles.bottleForm}>
      <View style={[styles.totalBadge, { backgroundColor: C.feedingLight, marginBottom: SPACING.sm }]}>
        <Ionicons name="beaker" size={16} color={COLORS.feeding} />
        <Text style={[styles.totalLabel, { color: C.textSecondary }]}>How much did you prepare?</Text>
      </View>

      <Text style={[styles.formSection, { color: C.textSecondary }]}>MILK TYPE</Text>
      <View style={styles.pillRow3}>
        {[
          { value: 'formula', label: 'Formula' },
          { value: 'pumped', label: 'Pumped Milk' },
          { value: 'donor', label: 'Donor Milk' },
        ].map((t) => (
          <TouchableOpacity
            key={t.value}
            onPress={() => setMilkType(t.value)}
            style={[
              styles.typePill,
              { backgroundColor: C.card, borderColor: C.border },
              milkType === t.value && styles.typePillActive,
              milkType === t.value && { backgroundColor: C.feedingLight },
            ]}
            accessibilityRole="radio"
            accessibilityState={{ selected: milkType === t.value }}
          >
            <Text style={[styles.typePillText, { color: C.textSecondary }, milkType === t.value && styles.typePillTextActive]}>
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={[styles.formSection, { color: C.textSecondary, marginTop: SPACING.sm }]}>PREPARED QUANTITY</Text>
      <View style={styles.qtyRow}>
        <TouchableOpacity
          onPress={() => setPreparedQty(fmtQty(Math.max(0, (qty || 0) - step)))}
          style={[styles.qtyBtn, { backgroundColor: C.card }]}
          accessibilityRole="button"
          accessibilityLabel="Decrease quantity"
        >
          <Ionicons name="remove" size={22} color={C.text} />
        </TouchableOpacity>
        <TextInput
          style={[styles.qtyInput, { color: C.text, backgroundColor: C.card }]}
          value={preparedQty}
          onChangeText={setPreparedQty}
          keyboardType="decimal-pad"
          textAlign="center"
          accessibilityLabel="Prepared quantity"
        />
        <TouchableOpacity
          onPress={() => setPreparedQty(fmtQty((qty || 0) + step))}
          style={[styles.qtyBtn, { backgroundColor: C.card }]}
          accessibilityRole="button"
          accessibilityLabel="Increase quantity"
        >
          <Ionicons name="add" size={22} color={C.text} />
        </TouchableOpacity>
        <View style={styles.unitToggle}>
          {['ml', 'oz'].map((u) => (
            <TouchableOpacity
              key={u}
              onPress={() => changeUnit(u)}
              style={[styles.unitBtn, { backgroundColor: C.card }, unit === u && styles.unitBtnActive]}
              accessibilityRole="radio"
              accessibilityState={{ selected: unit === u }}
            >
              <Text style={[styles.unitText, { color: C.textSecondary }, unit === u && styles.unitTextActive]}>{u}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <TouchableOpacity
        onPress={onStart}
        disabled={!qty}
        style={[styles.startBtn, { backgroundColor: COLORS.feeding, marginTop: SPACING.lg, opacity: qty ? 1 : 0.5 }]}
        accessibilityRole="button"
        accessibilityLabel="Start feeding timer"
      >
        <Ionicons name="timer" size={22} color={COLORS.white} />
        <Text style={styles.startBtnText}>Start Feeding Timer</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Bottle Timing View ───────────────────────────────────────────────────────

function BottleTimingView({ C, session }) {
  const { pauseSession, resumeSession, finishTiming } = useFeedingStore.getState();
  const now = useNow(!session.paused);
  const elapsed = sideSecs(session, 'left', now);

  return (
    <View style={styles.timerContainer}>
      <View style={[styles.totalBadge, { backgroundColor: C.feedingLight }]}>
        <Ionicons name="beaker" size={16} color={COLORS.feeding} />
        <Text style={[styles.totalLabel, { color: C.textSecondary }]}>
          Bottle Feeding · {session.preparedQty} {session.unit} prepared
        </Text>
      </View>

      <View style={[styles.bottleTimerCenter, { backgroundColor: C.card, borderColor: C.border }]}>
        <Text style={[styles.formSection, { color: C.textMuted, marginBottom: 4 }]}>TIME ELAPSED</Text>
        <Text style={[styles.totalTime, { color: COLORS.feeding, fontSize: FONT_SIZE.hero }]}>
          {formatDurationMins(elapsed)}
        </Text>
        {session.paused && (
          <Text style={[styles.switchHint, { color: C.textMuted, marginTop: 4 }]}>Paused</Text>
        )}
      </View>

      <View style={styles.controlRow}>
        <TouchableOpacity
          onPress={() => { Haptics.selectionAsync(); session.paused ? resumeSession() : pauseSession(); }}
          style={[styles.controlBtn, { backgroundColor: C.card, borderColor: C.border }]}
          accessibilityRole="button"
          accessibilityLabel={session.paused ? 'Resume' : 'Pause'}
        >
          <Ionicons name={session.paused ? 'play' : 'pause'} size={22} color={C.text} />
          <Text style={[styles.controlBtnText, { color: C.text }]}>{session.paused ? 'Resume' : 'Pause'}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); finishTiming(); }}
          style={[styles.endBtn, { backgroundColor: COLORS.feeding }]}
          accessibilityRole="button"
          accessibilityLabel="Done feeding"
        >
          <Ionicons name="checkmark-circle" size={22} color={COLORS.white} />
          <Text style={styles.endBtnText}>Done Feeding</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Bottle Finish Form ───────────────────────────────────────────────────────

function BottleFinishForm({ C, session, consumedQty, setConsumedQty, onSave, saving }) {
  const duration = sideSecs(session, 'left');
  const maxQty = session.preparedQty || 0;
  const unit = session.unit || 'ml';
  const step = unit === 'oz' ? 0.5 : 5;

  const handleConsumedChange = (v) => {
    const num = parsePositiveNumber(v) || 0;
    setConsumedQty(num > maxQty ? fmtQty(maxQty) : v);
  };

  const stepConsumed = (delta) => {
    const current = parsePositiveNumber(consumedQty) || 0;
    setConsumedQty(fmtQty(Math.min(maxQty, Math.max(0, current + delta))));
  };

  return (
    <View style={styles.bottleForm}>
      <View style={[styles.totalBadge, { backgroundColor: C.feedingLight, marginBottom: SPACING.sm }]}>
        <Ionicons name="time-outline" size={16} color={COLORS.feeding} />
        <Text style={[styles.totalLabel, { color: C.textSecondary }]}>
          Duration: {formatDurationMins(duration)} · Prepared: {maxQty} {unit}
        </Text>
      </View>

      <Text style={[styles.formSection, { color: C.textSecondary }]}>HOW MUCH DID BABY CONSUME? ({unit})</Text>
      <Text style={[styles.switchHint, { color: C.textMuted, marginTop: -8 }]}>
        Max: {maxQty} {unit}
      </Text>
      <View style={styles.qtyRow}>
        <TouchableOpacity
          onPress={() => stepConsumed(-step)}
          style={[styles.qtyBtn, { backgroundColor: C.card }]}
          accessibilityRole="button"
          accessibilityLabel="Decrease consumed"
        >
          <Ionicons name="remove" size={22} color={C.text} />
        </TouchableOpacity>
        <TextInput
          style={[styles.qtyInput, { color: C.text, backgroundColor: C.card }]}
          value={consumedQty}
          onChangeText={handleConsumedChange}
          keyboardType="decimal-pad"
          textAlign="center"
          accessibilityLabel="Consumed quantity"
        />
        <TouchableOpacity
          onPress={() => stepConsumed(step)}
          style={[styles.qtyBtn, { backgroundColor: C.card }]}
          accessibilityRole="button"
          accessibilityLabel="Increase consumed"
        >
          <Ionicons name="add" size={22} color={C.text} />
        </TouchableOpacity>
        <Text style={[styles.unitLabel, { color: C.textSecondary }]}>{unit}</Text>
      </View>

      <View style={[styles.prepSummary, { backgroundColor: C.card, borderColor: C.border }]}>
        {[
          ['Prepared', `${maxQty} ${unit}`, C.text],
          ['Consumed', `${consumedQty || 0} ${unit}`, COLORS.feeding],
          ['Duration', formatDurationMins(duration), C.textMuted],
        ].map(([label, value, color]) => (
          <View key={label} style={styles.prepSummaryRow}>
            <Text style={[styles.prepSummaryLabel, { color: C.textSecondary }]}>{label}</Text>
            <Text style={[styles.prepSummaryVal, { color }]}>{value}</Text>
          </View>
        ))}
      </View>

      <TouchableOpacity
        onPress={onSave}
        disabled={saving}
        style={[styles.endBtn, { backgroundColor: COLORS.feeding, marginTop: SPACING.lg, opacity: saving ? 0.6 : 1 }]}
        accessibilityRole="button"
        accessibilityLabel="Save bottle feed"
      >
        <Ionicons name="checkmark-circle" size={22} color={COLORS.white} />
        <Text style={styles.endBtnText}>Save Feed</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── History Item ─────────────────────────────────────────────────────────────

function FeedLogItem({ log, C }) {
  const isBreast = log.type === 'breast';
  let subText = '';
  if (isBreast) {
    subText = log.totalSecs > 0
      ? `${formatDuration(log.totalSecs)} · L: ${formatDurationMins(log.leftSecs)} R: ${formatDurationMins(log.rightSecs)}`
      : '—';
  } else {
    const consumed = log.consumedQty !== undefined ? log.consumedQty : log.bottleQty;
    const prepared = log.preparedQty;
    const unit = log.unit || 'ml';
    const dur = log.totalSecs > 0 ? ` · ${formatDuration(log.totalSecs)}` : '';
    subText = prepared > 0
      ? `${consumed} of ${prepared} ${unit} consumed${dur}`
      : `${consumed || 0} ${unit}${dur}`;
  }
  return (
    <View style={[styles.logItem, { backgroundColor: C.card, borderColor: C.border }]}>
      <View style={[styles.logIcon, { backgroundColor: C.feedingLight }]}>
        <Ionicons name={isBreast ? 'heart' : 'beaker'} size={18} color={COLORS.feeding} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.logTitle, { color: C.text }]}>
          {isBreast ? 'Breastfeed' : 'Bottle Feed'}
        </Text>
        <Text style={[styles.logSub, { color: C.textSecondary }]}>{subText}</Text>
      </View>
      <Text style={[styles.logTime, { color: C.textMuted }]}>{formatRelative(log.startTime || log.createdAt)}</Text>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function FeedingScreen() {
  const { getActiveBaby, darkMode, babies, setActiveBaby } = useBabyStore();
  const baby = getActiveBaby();
  const babyId = baby?.id;
  const C = darkMode ? DARK_COLORS : COLORS;
  const insets = useSafeAreaInsets();

  const session = useFeedingStore((s) => s.session);
  const logs = useFeedingStore((s) => s.logs[babyId]) || [];
  const { startSession, cancelSession, load, endSession } = useFeedingStore.getState();

  const [feedType, setFeedType] = useState(baby?.feedingType === 'bottle' ? 'bottle' : 'breast');
  const [showSuccess, setShowSuccess] = useState(false);
  const [saving, setSaving] = useState(false);

  const [breastSidePicking, setBreastSidePicking] = useState(false);
  const [bottlePreparing, setBottlePreparing] = useState(false);
  const [milkType, setMilkType] = useState('formula');
  const [unit, setUnit] = useState('ml');
  const [preparedQty, setPreparedQty] = useState('90');
  const [consumedQty, setConsumedQty] = useState('');

  useEffect(() => {
    if (babyId) load(babyId);
  }, [babyId]);

  // A timer that belongs to a different baby than the one on screen.
  const otherBabySession = session && session.babyId !== babyId ? session : null;
  const mySession = session && session.babyId === babyId ? session : null;
  const otherBabyName = otherBabySession
    ? babies.find((b) => b.id === otherBabySession.babyId)?.name || 'another baby'
    : null;

  // When the bottle timer is done, pre-fill "consumed" with the prepared amount.
  useEffect(() => {
    if (mySession?.type === 'bottle' && mySession.stage === 'finish' && consumedQty === '') {
      setConsumedQty(fmtQty(mySession.preparedQty || 0));
    }
  }, [mySession?.stage]);

  const handleStart = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (feedType === 'bottle') setBottlePreparing(true);
    else setBreastSidePicking(true);
  };

  const handleBreastSideSelect = (side) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setBreastSidePicking(false);
    startSession(babyId, 'breast', side);
  };

  const handleBottleStartTimer = () => {
    const prepared = parsePositiveNumber(preparedQty);
    if (!prepared) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setBottlePreparing(false);
    setConsumedQty('');
    startSession(babyId, 'bottle', 'left', { milkType, unit, preparedQty: prepared });
  };

  const showSaved = () => {
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 3000);
  };

  const handleBottleSave = async () => {
    if (saving) return;
    setSaving(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await endSession({ consumedQty: parsePositiveNumber(consumedQty) || 0 });
    setConsumedQty('');
    setSaving(false);
    showSaved();
  };

  const resetLocal = () => {
    setBreastSidePicking(false);
    setBottlePreparing(false);
    setConsumedQty('');
  };

  const handleCancel = () => {
    if (!mySession) {
      resetLocal();
      return;
    }
    Alert.alert('Discard this feed?', 'The timer will stop and this feed will not be saved.', [
      { text: 'Keep timing', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: () => { cancelSession(); resetLocal(); },
      },
    ]);
  };

  const showStartScreen = !session && !breastSidePicking && !bottlePreparing;
  const showBreastPicker = breastSidePicking && !session;
  const showBottlePrepare = bottlePreparing && !session;
  const showBreastTimer = mySession?.type === 'breast';
  const showBottleTiming = mySession?.type === 'bottle' && mySession.stage !== 'finish';
  const showBottleFinish = mySession?.type === 'bottle' && mySession.stage === 'finish';
  const showCancel = showBreastPicker || showBottlePrepare || !!mySession;

  const todayStart = startOfToday();
  const todayCount = logs.filter((l) => new Date(l.startTime || l.createdAt) >= todayStart).length;

  return (
    <View style={[styles.container, { backgroundColor: C.background }]}>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 100 },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.screenHeader}>
          <View style={[styles.headerIcon, { backgroundColor: C.feedingLight }]}>
            <Ionicons name="nutrition" size={24} color={COLORS.feeding} />
          </View>
          <View>
            <Text style={[styles.screenTitle, { color: C.text }]}>Feeding</Text>
            <Text style={[styles.screenSub, { color: C.textSecondary }]}>
              {logs.length > 0 ? `${todayCount} feed${todayCount === 1 ? '' : 's'} today` : 'Start first feed'}
            </Text>
          </View>
        </View>

        {showSuccess && (
          <View style={[styles.successToast, { backgroundColor: COLORS.successLight }]}>
            <Ionicons name="checkmark-circle" size={18} color={COLORS.success} />
            <Text style={[styles.successText, { color: COLORS.success }]}>Feed logged!</Text>
          </View>
        )}

        {/* Timer running for a different baby */}
        {otherBabySession && (
          <View style={[extra.otherBaby, { backgroundColor: C.feedingLight, borderColor: COLORS.feeding + '40' }]}>
            <Ionicons name="time-outline" size={20} color={COLORS.feeding} />
            <Text style={[extra.otherBabyText, { color: C.text }]}>
              A feeding timer is running for {otherBabyName}.
            </Text>
            <TouchableOpacity
              onPress={() => setActiveBaby(otherBabySession.babyId)}
              style={[extra.otherBabyBtn, { backgroundColor: COLORS.feeding }]}
              accessibilityRole="button"
              accessibilityLabel={`Switch to ${otherBabyName}`}
            >
              <Text style={extra.otherBabyBtnText}>Open</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Start screen */}
        {showStartScreen && (
          <>
            <Text style={[styles.sectionLabel, { color: C.textSecondary }]}>FEEDING TYPE</Text>
            <View style={styles.typeGrid}>
              {[
                { value: 'breast', label: 'Breastfeed', icon: 'heart', sub: 'Choose side & timer' },
                { value: 'bottle', label: 'Bottle Feed', icon: 'beaker', sub: 'Qty + timer + log' },
              ].map((t) => (
                <TouchableOpacity
                  key={t.value}
                  onPress={() => setFeedType(t.value)}
                  style={[
                    styles.typeCard,
                    { backgroundColor: C.card, borderColor: C.border },
                    feedType === t.value && styles.typeCardActive,
                    feedType === t.value && { backgroundColor: C.feedingLight },
                  ]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: feedType === t.value }}
                  accessibilityLabel={t.label}
                >
                  <Ionicons name={t.icon} size={26} color={feedType === t.value ? COLORS.feeding : C.textMuted} />
                  <Text style={[styles.typeLabel, { color: feedType === t.value ? COLORS.feeding : C.text }]}>
                    {t.label}
                  </Text>
                  <Text style={[styles.typeSub, { color: C.textMuted }]}>{t.sub}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              onPress={handleStart}
              style={[styles.startBtn, { backgroundColor: COLORS.feeding }]}
              accessibilityRole="button"
              accessibilityLabel="Start feeding"
            >
              <Ionicons name="play-circle" size={24} color={COLORS.white} />
              <Text style={styles.startBtnText}>Start Feeding</Text>
            </TouchableOpacity>
          </>
        )}

        {showBreastPicker && <BreastSidePicker C={C} onSelect={handleBreastSideSelect} />}

        {showBreastTimer && <BreastfeedTimer C={C} onEnd={showSaved} />}

        {showBottlePrepare && (
          <BottlePrepForm
            C={C}
            milkType={milkType}
            setMilkType={setMilkType}
            unit={unit}
            setUnit={setUnit}
            preparedQty={preparedQty}
            setPreparedQty={setPreparedQty}
            onStart={handleBottleStartTimer}
          />
        )}

        {showBottleTiming && <BottleTimingView C={C} session={mySession} />}

        {showBottleFinish && (
          <BottleFinishForm
            C={C}
            session={mySession}
            consumedQty={consumedQty}
            setConsumedQty={setConsumedQty}
            onSave={handleBottleSave}
            saving={saving}
          />
        )}

        {showCancel && (
          <TouchableOpacity
            onPress={handleCancel}
            style={[styles.cancelBtn, { borderColor: C.border }]}
            accessibilityRole="button"
            accessibilityLabel="Cancel session"
          >
            <Text style={[styles.cancelText, { color: C.textSecondary }]}>Cancel</Text>
          </TouchableOpacity>
        )}

        {/* History */}
        {logs.length > 0 && (
          <>
            <Text style={[styles.sectionLabel, { color: C.textSecondary, marginTop: SPACING.xl }]}>
              RECENT
            </Text>
            {logs.slice(0, 10).map((log) => (
              <FeedLogItem key={log.id} log={log} C={C} />
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const extra = StyleSheet.create({
  otherBaby: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    padding: SPACING.md, borderRadius: RADIUS.lg, borderWidth: 1, marginBottom: SPACING.md,
  },
  otherBabyText: { flex: 1, fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.medium },
  otherBabyBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: RADIUS.full },
  otherBabyBtnText: { color: COLORS.white, fontWeight: FONT_WEIGHT.semibold, fontSize: FONT_SIZE.sm },
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: SPACING.lg },
  screenHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, marginBottom: SPACING.xl },
  headerIcon: { width: 52, height: 52, borderRadius: RADIUS.lg, alignItems: 'center', justifyContent: 'center' },
  screenTitle: { fontSize: FONT_SIZE.xl, fontWeight: FONT_WEIGHT.bold },
  screenSub: { fontSize: FONT_SIZE.sm },

  successToast: {
    flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12,
    borderRadius: RADIUS.lg, marginBottom: SPACING.md,
  },
  successText: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.semibold },

  sectionLabel: { fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.semibold, letterSpacing: 1, marginBottom: SPACING.sm },

  typeGrid: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.lg },
  typeCard: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    padding: SPACING.md, borderRadius: RADIUS.xl, borderWidth: 1.5, gap: 4, minHeight: 100,
  },
  typeCardActive: { borderColor: COLORS.feeding, backgroundColor: COLORS.feedingLight },
  typeLabel: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold },
  typeSub: { fontSize: FONT_SIZE.xs, textAlign: 'center' },

  startBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    padding: 18, borderRadius: RADIUS.xl, gap: 8,
    ...SHADOW.md,
  },
  startBtnText: { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold, color: COLORS.white },

  // Shared timer/form styles
  timerContainer: { gap: SPACING.md },
  totalBadge: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, padding: SPACING.md, borderRadius: RADIUS.xl,
    backgroundColor: COLORS.feedingLight, marginBottom: SPACING.sm,
  },
  totalLabel: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.medium, flex: 1 },
  totalTime: { fontSize: FONT_SIZE.xxl, fontWeight: FONT_WEIGHT.bold, fontVariant: ['tabular-nums'] },

  sidesRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  sideCard: {
    flex: 1, alignItems: 'center', padding: SPACING.md,
    borderRadius: RADIUS.xl, borderWidth: 1.5, gap: 6, minHeight: 110, position: 'relative',
  },
  sideCardActive: { borderColor: COLORS.feeding, backgroundColor: COLORS.feedingLight },
  sidePickerWrap: { gap: SPACING.md },
  sidePickerHint: { fontSize: FONT_SIZE.xs, textAlign: 'center' },
  sideLabel: { fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.heavy, letterSpacing: 1 },
  sideTime: { fontSize: FONT_SIZE.xxl, fontWeight: FONT_WEIGHT.bold, fontVariant: ['tabular-nums'] },
  activeDot: {
    position: 'absolute', top: 8, right: 8,
    width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.feeding,
  },
  switchBtn: {
    width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
  },
  switchHint: { textAlign: 'center', fontSize: FONT_SIZE.xs },

  bottleTimerCenter: {
    alignItems: 'center', padding: SPACING.xl, borderRadius: RADIUS.xl,
    borderWidth: 1, gap: 4,
  },

  burpRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: SPACING.md, borderRadius: RADIUS.lg, borderWidth: 1,
  },
  burpText: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.medium },

  controlRow: { flexDirection: 'row', gap: SPACING.sm },
  controlBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, padding: 16, borderRadius: RADIUS.xl, borderWidth: 1,
  },
  controlBtnText: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.semibold },
  endBtn: {
    flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, padding: 16, borderRadius: RADIUS.xl, ...SHADOW.sm,
  },
  endBtnText: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.bold, color: COLORS.white },

  cancelBtn: {
    alignItems: 'center', padding: 14, borderRadius: RADIUS.xl, borderWidth: 1, marginTop: SPACING.sm,
  },
  cancelText: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.medium },

  // Bottle forms
  bottleForm: { gap: SPACING.md },
  formSection: { fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.semibold, letterSpacing: 1 },
  pillRow3: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  typePill: {
    paddingVertical: 10, paddingHorizontal: 16, borderRadius: RADIUS.full,
    borderWidth: 1.5, borderColor: COLORS.border, backgroundColor: COLORS.card,
  },
  typePillActive: { borderColor: COLORS.feeding, backgroundColor: COLORS.feedingLight },
  typePillText: { fontSize: FONT_SIZE.sm, color: COLORS.textSecondary, fontWeight: FONT_WEIGHT.medium },
  typePillTextActive: { color: COLORS.feeding, fontWeight: FONT_WEIGHT.semibold },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  qtyBtn: { width: 48, height: 48, borderRadius: RADIUS.lg, alignItems: 'center', justifyContent: 'center' },
  qtyInput: {
    flex: 1, height: 56, borderRadius: RADIUS.lg, fontSize: FONT_SIZE.xl,
    fontWeight: FONT_WEIGHT.bold,
  },
  unitToggle: { flexDirection: 'row', borderRadius: RADIUS.lg, overflow: 'hidden', borderWidth: 1.5, borderColor: COLORS.border },
  unitBtn: { paddingHorizontal: 12, paddingVertical: 14, backgroundColor: COLORS.card },
  unitBtnActive: { backgroundColor: COLORS.feeding },
  unitText: { fontSize: FONT_SIZE.sm, color: COLORS.textSecondary, fontWeight: FONT_WEIGHT.medium },
  unitTextActive: { color: COLORS.white, fontWeight: FONT_WEIGHT.semibold },
  unitLabel: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.medium, paddingHorizontal: 8 },

  prepSummary: {
    borderRadius: RADIUS.lg, borderWidth: 1, padding: SPACING.md, gap: 8,
  },
  prepSummaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  prepSummaryLabel: { fontSize: FONT_SIZE.sm },
  prepSummaryVal: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold },

  // Log items
  logItem: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    padding: SPACING.md, borderRadius: RADIUS.lg, borderWidth: 1, marginBottom: SPACING.sm,
  },
  logIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  logTitle: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.semibold },
  logSub: { fontSize: FONT_SIZE.sm, marginTop: 2 },
  logTime: { fontSize: FONT_SIZE.xs },
});
