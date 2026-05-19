import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { useBabyStore } from '../store/useBabyStore';
import { useFeedingStore } from '../store/useFeedingStore';
import { COLORS, DARK_COLORS } from '../constants/colors';
import { FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING, SHADOW } from '../constants/theme';
import {
  formatDurationMins, formatDuration, formatRelative,
} from '../utils/formatters';

// ─── Breast Side Picker ───────────────────────────────────────────────────────

function BreastSidePicker({ C, onSelect }) {
  return (
    <View style={styles.sidePickerWrap}>
      <View style={[styles.totalBadge, { backgroundColor: COLORS.feedingLight, marginBottom: SPACING.md }]}>
        <Ionicons name="heart" size={16} color={COLORS.feeding} />
        <Text style={[styles.totalLabel, { color: C.textSecondary }]}>
          Breastfeed — Which side to start?
        </Text>
      </View>
      <View style={styles.sidesRow}>
        <TouchableOpacity
          onPress={() => onSelect('left')}
          style={[styles.sideCard, { backgroundColor: C.card, borderColor: C.border }]}
          accessibilityRole="button"
          accessibilityLabel="Start from left breast"
        >
          <Ionicons name="arrow-back-circle" size={34} color={COLORS.feeding} />
          <Text style={[styles.sideLabel, { color: COLORS.feeding }]}>LEFT</Text>
          <Text style={[styles.sidePickerHint, { color: C.textMuted }]}>Start timer on left</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => onSelect('right')}
          style={[styles.sideCard, { backgroundColor: C.card, borderColor: C.border }]}
          accessibilityRole="button"
          accessibilityLabel="Start from right breast"
        >
          <Ionicons name="arrow-forward-circle" size={34} color={COLORS.feeding} />
          <Text style={[styles.sideLabel, { color: COLORS.feeding }]}>RIGHT</Text>
          <Text style={[styles.sidePickerHint, { color: C.textMuted }]}>Start timer on right</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Breastfeeding Live Timer ─────────────────────────────────────────────────

function BreastfeedTimer({ C, babyId, onEnd }) {
  const {
    session, tickSession, switchSide, pauseSession, resumeSession,
    toggleBurped, endSession,
  } = useFeedingStore();
  const intervalRef = useRef(null);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      if (!useFeedingStore.getState().session?.paused) tickSession();
    }, 1000);
    return () => clearInterval(intervalRef.current);
  }, []);

  if (!session) return null;
  const { leftSecs, rightSecs, activeSide, paused, burped } = session;
  const totalSecs = leftSecs + rightSecs;

  const handleSwitch = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    switchSide();
  };

  const handleEnd = async () => {
    clearInterval(intervalRef.current);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const entry = await endSession(babyId);
    onEnd(entry);
  };

  return (
    <View style={styles.timerContainer}>
      <View style={styles.totalBadge}>
        <Ionicons name="time-outline" size={16} color={COLORS.feeding} />
        <Text style={[styles.totalLabel, { color: C.textSecondary }]}>Total</Text>
        <Text style={[styles.totalTime, { color: COLORS.feeding }]}>
          {formatDurationMins(totalSecs)}
        </Text>
      </View>

      <View style={styles.sidesRow}>
        <TouchableOpacity
          onPress={() => activeSide !== 'left' && handleSwitch()}
          style={[
            styles.sideCard,
            { backgroundColor: C.card, borderColor: C.border },
            activeSide === 'left' && styles.sideCardActive,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Left side"
          accessibilityState={{ selected: activeSide === 'left' }}
        >
          <Ionicons
            name={activeSide === 'left' ? 'radio-button-on' : 'radio-button-off'}
            size={18}
            color={activeSide === 'left' ? COLORS.feeding : C.textMuted}
          />
          <Text style={[styles.sideLabel, { color: activeSide === 'left' ? COLORS.feeding : C.textSecondary }]}>
            LEFT
          </Text>
          <Text style={[styles.sideTime, { color: activeSide === 'left' ? COLORS.feeding : C.text }]}>
            {formatDurationMins(leftSecs)}
          </Text>
          {activeSide === 'left' && !paused && <View style={styles.activeDot} />}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleSwitch}
          style={[styles.switchBtn, { backgroundColor: COLORS.feeding + '18' }]}
          accessibilityRole="button"
          accessibilityLabel="Switch side"
        >
          <Ionicons name="swap-horizontal" size={22} color={COLORS.feeding} />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => activeSide !== 'right' && handleSwitch()}
          style={[
            styles.sideCard,
            { backgroundColor: C.card, borderColor: C.border },
            activeSide === 'right' && styles.sideCardActive,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Right side"
          accessibilityState={{ selected: activeSide === 'right' }}
        >
          <Ionicons
            name={activeSide === 'right' ? 'radio-button-on' : 'radio-button-off'}
            size={18}
            color={activeSide === 'right' ? COLORS.feeding : C.textMuted}
          />
          <Text style={[styles.sideLabel, { color: activeSide === 'right' ? COLORS.feeding : C.textSecondary }]}>
            RIGHT
          </Text>
          <Text style={[styles.sideTime, { color: activeSide === 'right' ? COLORS.feeding : C.text }]}>
            {formatDurationMins(rightSecs)}
          </Text>
          {activeSide === 'right' && !paused && <View style={styles.activeDot} />}
        </TouchableOpacity>
      </View>

      <Text style={[styles.switchHint, { color: C.textMuted }]}>
        Tap the other side card to switch · Tap the arrows to force switch
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
          style={[styles.endBtn, { backgroundColor: COLORS.feeding }]}
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
  return (
    <View style={styles.bottleForm}>
      <View style={[styles.totalBadge, { backgroundColor: COLORS.feedingLight, marginBottom: SPACING.sm }]}>
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
            style={[styles.typePill, milkType === t.value && styles.typePillActive]}
            accessibilityRole="radio"
            accessibilityState={{ selected: milkType === t.value }}
          >
            <Text style={[styles.typePillText, milkType === t.value && styles.typePillTextActive]}>
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={[styles.formSection, { color: C.textSecondary, marginTop: SPACING.sm }]}>PREPARED QUANTITY</Text>
      <View style={styles.qtyRow}>
        <TouchableOpacity
          onPress={() => setPreparedQty(String(Math.max(0, parseInt(preparedQty || '0') - 10)))}
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
          keyboardType="number-pad"
          textAlign="center"
          accessibilityLabel="Prepared quantity"
        />
        <TouchableOpacity
          onPress={() => setPreparedQty(String(parseInt(preparedQty || '0') + 10))}
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
              onPress={() => setUnit(u)}
              style={[styles.unitBtn, unit === u && styles.unitBtnActive]}
              accessibilityRole="radio"
              accessibilityState={{ selected: unit === u }}
            >
              <Text style={[styles.unitText, unit === u && styles.unitTextActive]}>{u}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <TouchableOpacity
        onPress={onStart}
        style={[styles.startBtn, { backgroundColor: COLORS.feeding, marginTop: SPACING.lg }]}
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

function BottleTimingView({ C, preparedQty, unit, onDone }) {
  const { session, tickSession, pauseSession, resumeSession } = useFeedingStore();
  const intervalRef = useRef(null);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      if (!useFeedingStore.getState().session?.paused) tickSession();
    }, 1000);
    return () => clearInterval(intervalRef.current);
  }, []);

  if (!session) return null;
  const { leftSecs, paused } = session;

  const handleDone = () => {
    clearInterval(intervalRef.current);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onDone();
  };

  return (
    <View style={styles.timerContainer}>
      <View style={[styles.totalBadge, { backgroundColor: COLORS.feedingLight }]}>
        <Ionicons name="beaker" size={16} color={COLORS.feeding} />
        <Text style={[styles.totalLabel, { color: C.textSecondary }]}>
          Bottle Feeding · {preparedQty} {unit} prepared
        </Text>
      </View>

      <View style={[styles.bottleTimerCenter, { backgroundColor: C.card, borderColor: C.border }]}>
        <Text style={[styles.formSection, { color: C.textMuted, marginBottom: 4 }]}>TIME ELAPSED</Text>
        <Text style={[styles.totalTime, { color: COLORS.feeding, fontSize: FONT_SIZE.hero }]}>
          {formatDurationMins(leftSecs)}
        </Text>
        {paused && (
          <Text style={[styles.switchHint, { color: C.textMuted, marginTop: 4 }]}>Paused</Text>
        )}
      </View>

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
          onPress={handleDone}
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

function BottleFinishForm({ C, session, preparedQty, unit, consumedQty, setConsumedQty, onSave }) {
  const duration = session?.leftSecs || 0;
  const maxQty = parseFloat(preparedQty) || 0;

  const handleConsumedChange = (v) => {
    const num = parseFloat(v) || 0;
    setConsumedQty(num > maxQty ? String(maxQty) : v);
  };

  const stepConsumed = (delta) => {
    const next = Math.min(maxQty, Math.max(0, (parseInt(consumedQty || '0') + delta)));
    setConsumedQty(String(next));
  };

  return (
    <View style={styles.bottleForm}>
      <View style={[styles.totalBadge, { backgroundColor: COLORS.feedingLight, marginBottom: SPACING.sm }]}>
        <Ionicons name="time-outline" size={16} color={COLORS.feeding} />
        <Text style={[styles.totalLabel, { color: C.textSecondary }]}>
          Duration: {formatDurationMins(duration)} · Prepared: {preparedQty} {unit}
        </Text>
      </View>

      <Text style={[styles.formSection, { color: C.textSecondary }]}>HOW MUCH DID BABY CONSUME? ({unit})</Text>
      <Text style={[styles.switchHint, { color: C.textMuted, marginTop: -8 }]}>
        Max: {preparedQty} {unit}
      </Text>
      <View style={styles.qtyRow}>
        <TouchableOpacity
          onPress={() => stepConsumed(-5)}
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
          keyboardType="number-pad"
          textAlign="center"
          accessibilityLabel="Consumed quantity"
        />
        <TouchableOpacity
          onPress={() => stepConsumed(5)}
          style={[styles.qtyBtn, { backgroundColor: C.card }]}
          accessibilityRole="button"
          accessibilityLabel="Increase consumed"
        >
          <Ionicons name="add" size={22} color={C.text} />
        </TouchableOpacity>
        <Text style={[styles.unitLabel, { color: C.textSecondary }]}>{unit}</Text>
      </View>

      <View style={[styles.prepSummary, { backgroundColor: C.card, borderColor: C.border }]}>
        <View style={styles.prepSummaryRow}>
          <Text style={[styles.prepSummaryLabel, { color: C.textSecondary }]}>Prepared</Text>
          <Text style={[styles.prepSummaryVal, { color: C.text }]}>{preparedQty} {unit}</Text>
        </View>
        <View style={styles.prepSummaryRow}>
          <Text style={[styles.prepSummaryLabel, { color: C.textSecondary }]}>Consumed</Text>
          <Text style={[styles.prepSummaryVal, { color: COLORS.feeding }]}>{consumedQty || 0} {unit}</Text>
        </View>
        <View style={styles.prepSummaryRow}>
          <Text style={[styles.prepSummaryLabel, { color: C.textSecondary }]}>Duration</Text>
          <Text style={[styles.prepSummaryVal, { color: C.textMuted }]}>{formatDurationMins(duration)}</Text>
        </View>
      </View>

      <TouchableOpacity
        onPress={onSave}
        style={[styles.endBtn, { backgroundColor: COLORS.feeding, marginTop: SPACING.lg }]}
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
    if (prepared !== undefined && prepared > 0) {
      subText = `${consumed} of ${prepared} ${unit} consumed${dur}`;
    } else {
      subText = `${consumed || 0} ${unit}${dur}`;
    }
  }
  return (
    <View style={[styles.logItem, { backgroundColor: C.card, borderColor: C.border }]}>
      <View style={[styles.logIcon, { backgroundColor: COLORS.feedingLight }]}>
        <Ionicons name={isBreast ? 'heart' : 'beaker'} size={18} color={COLORS.feeding} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.logTitle, { color: C.text }]}>
          {log.type === 'breast' ? 'Breastfeed' : 'Bottle Feed'}
        </Text>
        <Text style={[styles.logSub, { color: C.textSecondary }]}>{subText}</Text>
      </View>
      <Text style={[styles.logTime, { color: C.textMuted }]}>{formatRelative(log.createdAt)}</Text>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function FeedingScreen() {
  const { getActiveBaby, darkMode } = useBabyStore();
  const baby = getActiveBaby();
  const babyId = baby?.id;
  const C = darkMode ? DARK_COLORS : COLORS;
  const insets = useSafeAreaInsets();

  const { session, startSession, cancelSession, pauseSession, load, getLogs, endSession } = useFeedingStore();
  const logs = getLogs(babyId);

  const [feedType, setFeedType] = useState(baby?.feedingType || 'breast');
  const [showSuccess, setShowSuccess] = useState(false);

  // Breast flow
  const [breastSidePicking, setBreastSidePicking] = useState(false);

  // Bottle multi-step flow
  const [bottleStage, setBottleStage] = useState(null); // null | 'prepare' | 'timing' | 'finish'
  const [milkType, setMilkType] = useState('formula');
  const [unit, setUnit] = useState('ml');
  const [preparedQty, setPreparedQty] = useState('90');
  const [consumedQty, setConsumedQty] = useState('');

  useEffect(() => {
    if (babyId) load(babyId);
  }, [babyId]);

  const handleStart = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (feedType === 'bottle') {
      setBottleStage('prepare');
    } else {
      setBreastSidePicking(true);
    }
  };

  const handleBreastSideSelect = (side) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setBreastSidePicking(false);
    startSession(feedType, side);
  };

  const handleBottleStartTimer = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    startSession('bottle', 'left');
    useFeedingStore.setState((s) => ({
      session: s.session
        ? { ...s.session, milkType, unit, preparedQty: parseFloat(preparedQty) || 0 }
        : null,
    }));
    setBottleStage('timing');
  };

  const handleBottleTimerDone = () => {
    pauseSession();
    setConsumedQty(preparedQty);
    setBottleStage('finish');
  };

  const handleBottleSave = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const consumed = parseFloat(consumedQty) || 0;
    const prepared = parseFloat(preparedQty) || 0;
    useFeedingStore.setState((s) => ({
      session: s.session
        ? {
            ...s.session,
            bottleQty: consumed,
            milkType,
            unit,
            preparedQty: prepared,
            consumedQty: consumed,
            remainingQty: 0,
          }
        : null,
    }));
    const entry = await endSession(babyId);
    setBottleStage(null);
    handleEnd(entry);
  };

  const handleEnd = () => {
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 3000);
  };

  const handleCancel = () => {
    cancelSession();
    setBreastSidePicking(false);
    setBottleStage(null);
    setConsumedQty('');
  };

  const showStartScreen = !session && !breastSidePicking && bottleStage === null;
  const showBreastPicker = breastSidePicking && !session;
  const showBreastTimer = !!session && session.type === 'breast';
  const showBottlePrepare = bottleStage === 'prepare' && !session;
  const showBottleTiming = bottleStage === 'timing' && !!session;
  const showBottleFinish = bottleStage === 'finish';
  const showCancel = showBreastPicker || showBreastTimer || showBottlePrepare || showBottleTiming || showBottleFinish;

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
          <View style={[styles.headerIcon, { backgroundColor: COLORS.feedingLight }]}>
            <Ionicons name="nutrition" size={24} color={COLORS.feeding} />
          </View>
          <View>
            <Text style={[styles.screenTitle, { color: C.text }]}>Feeding</Text>
            <Text style={[styles.screenSub, { color: C.textSecondary }]}>
              {logs.length > 0 ? `${logs.filter(l => {
                const t = new Date(); t.setHours(0, 0, 0, 0);
                return new Date(l.createdAt) >= t;
              }).length} feeds today` : 'Start first feed'}
            </Text>
          </View>
        </View>

        {/* Success toast */}
        {showSuccess && (
          <View style={[styles.successToast, { backgroundColor: COLORS.successLight }]}>
            <Ionicons name="checkmark-circle" size={18} color={COLORS.success} />
            <Text style={[styles.successText, { color: COLORS.success }]}>Feed logged!</Text>
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
                  ]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: feedType === t.value }}
                  accessibilityLabel={t.label}
                >
                  <Ionicons
                    name={t.icon}
                    size={26}
                    color={feedType === t.value ? COLORS.feeding : C.textMuted}
                  />
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

        {/* Breast side picker */}
        {showBreastPicker && (
          <BreastSidePicker C={C} onSelect={handleBreastSideSelect} />
        )}

        {/* Active breast session */}
        {showBreastTimer && (
          <BreastfeedTimer C={C} babyId={babyId} onEnd={handleEnd} />
        )}

        {/* Bottle prepare */}
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

        {/* Bottle timing */}
        {showBottleTiming && (
          <BottleTimingView
            C={C}
            preparedQty={preparedQty}
            unit={unit}
            onDone={handleBottleTimerDone}
          />
        )}

        {/* Bottle finish */}
        {showBottleFinish && (
          <BottleFinishForm
            C={C}
            session={session}
            preparedQty={preparedQty}
            unit={unit}
            consumedQty={consumedQty}
            setConsumedQty={setConsumedQty}
            onSave={handleBottleSave}
          />
        )}

        {/* Cancel button */}
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
