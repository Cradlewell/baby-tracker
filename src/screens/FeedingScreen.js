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
import { COLORS, DARK_COLORS, GRADIENTS } from '../constants/colors';
import { FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING, SHADOW } from '../constants/theme';
import GradientView from '../components/GradientView';
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

const WHITE_SOFT = 'rgba(255,255,255,0.85)';

// ─── Shared bits ──────────────────────────────────────────────────────────────

// Full-width gradient call-to-action. Accessibility props live on the touchable.
function PrimaryButton({ onPress, disabled, icon, iconSize = 22, label, accessibilityLabel, style }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.85}
      style={style}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <GradientView
        colors={GRADIENTS.feeding}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[styles.primaryBtn, SHADOW.md, { shadowColor: COLORS.feeding }]}
      >
        <Ionicons name={icon} size={iconSize} color={COLORS.white} />
        <Text style={styles.primaryBtnText}>{label}</Text>
      </GradientView>
    </TouchableOpacity>
  );
}

// Small tinted header row used above forms.
function InfoBadge({ C, icon, children, style }) {
  return (
    <View style={[styles.infoBadge, { backgroundColor: C.card, borderColor: C.border }, SHADOW.sm, style]}>
      <View style={[styles.infoBadgeIcon, { backgroundColor: C.feedingLight }]}>
        <Ionicons name={icon} size={18} color={COLORS.feeding} />
      </View>
      <Text style={[styles.infoBadgeText, { color: C.text }]}>{children}</Text>
    </View>
  );
}

// ─── Breast Side Picker ───────────────────────────────────────────────────────

function BreastSidePicker({ C, onSelect }) {
  return (
    <View style={styles.sidePickerWrap}>
      <InfoBadge C={C} icon="heart">Breastfeed — Which side to start?</InfoBadge>
      <View style={styles.sidesRow}>
        {['left', 'right'].map((side) => (
          <TouchableOpacity
            key={side}
            onPress={() => onSelect(side)}
            style={[styles.pickCard, { backgroundColor: C.card, borderColor: C.border }, SHADOW.sm]}
            accessibilityRole="button"
            accessibilityLabel={`Start from ${side} breast`}
          >
            <View style={[styles.pickIcon, { backgroundColor: C.feedingLight }]}>
              <Ionicons name={side === 'left' ? 'arrow-back-circle' : 'arrow-forward-circle'} size={30} color={COLORS.feeding} />
            </View>
            <Text style={[styles.pickLabel, { color: COLORS.feeding }]}>{side.toUpperCase()}</Text>
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
        style={[styles.heroSide, active && styles.heroSideActive]}
        accessibilityRole="button"
        accessibilityLabel={`${side} side`}
        accessibilityState={{ selected: active }}
      >
        <Ionicons
          name={active ? 'radio-button-on' : 'radio-button-off'}
          size={18}
          color={active ? COLORS.feeding : WHITE_SOFT}
        />
        <Text style={[styles.sideLabel, { color: active ? COLORS.feeding : WHITE_SOFT }]}>
          {side.toUpperCase()}
        </Text>
        <Text style={[styles.sideTime, { color: active ? COLORS.feeding : COLORS.white }]}>
          {formatDurationMins(secs)}
        </Text>
        {active && !paused && <View style={styles.activeDot} />}
      </TouchableOpacity>
    );
  };

  return (
    <GradientView colors={GRADIENTS.feeding} bubbles style={[styles.hero, SHADOW.lg]}>
      <View style={styles.heroPill}>
        <Ionicons name="time-outline" size={14} color={COLORS.white} />
        <Text style={styles.heroPillText}>{paused ? 'Paused' : 'Total'}</Text>
      </View>
      <Text style={styles.heroTime}>{formatDurationMins(leftSecs + rightSecs)}</Text>

      <View style={styles.sidesRow}>
        {renderSide('left', leftSecs)}
        <TouchableOpacity
          onPress={handleSwitch}
          style={styles.switchBtn}
          accessibilityRole="button"
          accessibilityLabel="Switch side"
        >
          <Ionicons name="swap-horizontal" size={22} color={COLORS.white} />
        </TouchableOpacity>
        {renderSide('right', rightSecs)}
      </View>

      <Text style={[styles.switchHint, { color: WHITE_SOFT }]}>
        Tap the other side to switch · The timer keeps running if you lock your phone
      </Text>

      <TouchableOpacity
        onPress={() => { Haptics.selectionAsync(); toggleBurped(); }}
        style={styles.heroRow}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: burped }}
        accessibilityLabel="Burping completed"
      >
        <Ionicons
          name={burped ? 'checkmark-circle' : 'ellipse-outline'}
          size={22}
          color={burped ? COLORS.white : WHITE_SOFT}
        />
        <Text style={styles.heroRowText}>Burping completed</Text>
      </TouchableOpacity>

      <View style={styles.controlRow}>
        <TouchableOpacity
          onPress={() => { Haptics.selectionAsync(); paused ? resumeSession() : pauseSession(); }}
          style={styles.heroGhostBtn}
          accessibilityRole="button"
          accessibilityLabel={paused ? 'Resume' : 'Pause'}
        >
          <Ionicons name={paused ? 'play' : 'pause'} size={20} color={COLORS.white} />
          <Text style={styles.heroGhostText}>{paused ? 'Resume' : 'Pause'}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleEnd}
          disabled={ending}
          style={[styles.heroSolidBtn, { opacity: ending ? 0.6 : 1 }]}
          accessibilityRole="button"
          accessibilityLabel="End feeding"
        >
          <Ionicons name="stop-circle" size={22} color={COLORS.feeding} />
          <Text style={styles.heroSolidText}>End Feeding</Text>
        </TouchableOpacity>
      </View>
    </GradientView>
  );
}

// ─── Quantity stepper (shared by bottle forms) ───────────────────────────────

function QtyButton({ C, icon, onPress, label }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.qtyBtn, { backgroundColor: C.feedingLight }]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Ionicons name={icon} size={22} color={COLORS.feeding} />
    </TouchableOpacity>
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
      <InfoBadge C={C} icon="beaker">How much did you prepare?</InfoBadge>

      <Text style={[styles.formSection, { color: C.textSecondary }]}>MILK TYPE</Text>
      <View style={styles.pillRow3}>
        {[
          { value: 'formula', label: 'Formula' },
          { value: 'pumped', label: 'Pumped Milk' },
          { value: 'donor', label: 'Donor Milk' },
        ].map((t) => {
          const selected = milkType === t.value;
          return (
            <TouchableOpacity
              key={t.value}
              onPress={() => setMilkType(t.value)}
              style={[
                styles.typePill,
                { backgroundColor: C.card, borderColor: C.border },
                selected && { backgroundColor: C.feedingLight, borderColor: COLORS.feeding },
              ]}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
            >
              <Text style={[styles.typePillText, { color: selected ? COLORS.feeding : C.textSecondary }, selected && styles.typePillTextActive]}>
                {t.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={[styles.formSection, { color: C.textSecondary, marginTop: SPACING.sm }]}>PREPARED QUANTITY</Text>
      <View style={[styles.qtyCard, { backgroundColor: C.card, borderColor: C.border }, SHADOW.sm]}>
        <QtyButton
          C={C}
          icon="remove"
          label="Decrease quantity"
          onPress={() => setPreparedQty(fmtQty(Math.max(0, (qty || 0) - step)))}
        />
        <TextInput
          style={[styles.qtyInput, { color: C.text }]}
          value={preparedQty}
          onChangeText={setPreparedQty}
          keyboardType="decimal-pad"
          textAlign="center"
          accessibilityLabel="Prepared quantity"
        />
        <QtyButton
          C={C}
          icon="add"
          label="Increase quantity"
          onPress={() => setPreparedQty(fmtQty((qty || 0) + step))}
        />
        <View style={[styles.unitToggle, { backgroundColor: C.background, borderColor: C.border }]}>
          {['ml', 'oz'].map((u) => (
            <TouchableOpacity
              key={u}
              onPress={() => changeUnit(u)}
              style={[styles.unitBtn, unit === u && styles.unitBtnActive]}
              accessibilityRole="radio"
              accessibilityState={{ selected: unit === u }}
            >
              <Text style={[styles.unitText, { color: C.textSecondary }, unit === u && styles.unitTextActive]}>{u}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <PrimaryButton
        onPress={onStart}
        disabled={!qty}
        icon="timer"
        label="Start Feeding Timer"
        accessibilityLabel="Start feeding timer"
        style={{ marginTop: SPACING.sm, opacity: qty ? 1 : 0.5 }}
      />
    </View>
  );
}

// ─── Bottle Timing View ───────────────────────────────────────────────────────

function BottleTimingView({ C, session }) {
  const { pauseSession, resumeSession, finishTiming } = useFeedingStore.getState();
  const now = useNow(!session.paused);
  const elapsed = sideSecs(session, 'left', now);

  return (
    <GradientView colors={GRADIENTS.feeding} bubbles style={[styles.hero, SHADOW.lg]}>
      <View style={styles.heroPill}>
        <Ionicons name="beaker" size={14} color={COLORS.white} />
        <Text style={styles.heroPillText}>
          Bottle Feeding · {session.preparedQty} {session.unit} prepared
        </Text>
      </View>

      <View style={styles.heroCenter}>
        <Text style={styles.heroCaption}>TIME ELAPSED</Text>
        <Text style={[styles.heroTime, { fontSize: 56 }]}>
          {formatDurationMins(elapsed)}
        </Text>
        {session.paused && (
          <Text style={[styles.switchHint, { color: WHITE_SOFT, marginTop: 4 }]}>Paused</Text>
        )}
      </View>

      <View style={styles.controlRow}>
        <TouchableOpacity
          onPress={() => { Haptics.selectionAsync(); session.paused ? resumeSession() : pauseSession(); }}
          style={styles.heroGhostBtn}
          accessibilityRole="button"
          accessibilityLabel={session.paused ? 'Resume' : 'Pause'}
        >
          <Ionicons name={session.paused ? 'play' : 'pause'} size={20} color={COLORS.white} />
          <Text style={styles.heroGhostText}>{session.paused ? 'Resume' : 'Pause'}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); finishTiming(); }}
          style={styles.heroSolidBtn}
          accessibilityRole="button"
          accessibilityLabel="Done feeding"
        >
          <Ionicons name="checkmark-circle" size={22} color={COLORS.feeding} />
          <Text style={styles.heroSolidText}>Done Feeding</Text>
        </TouchableOpacity>
      </View>
    </GradientView>
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
      <InfoBadge C={C} icon="time-outline">
        Duration: {formatDurationMins(duration)} · Prepared: {maxQty} {unit}
      </InfoBadge>

      <View>
        <Text style={[styles.formSection, { color: C.textSecondary }]}>HOW MUCH DID BABY CONSUME? ({unit})</Text>
        <Text style={[styles.switchHint, { color: C.textMuted, textAlign: 'left', marginTop: 4 }]}>
          Max: {maxQty} {unit}
        </Text>
      </View>
      <View style={[styles.qtyCard, { backgroundColor: C.card, borderColor: C.border }, SHADOW.sm]}>
        <QtyButton C={C} icon="remove" label="Decrease consumed" onPress={() => stepConsumed(-step)} />
        <TextInput
          style={[styles.qtyInput, { color: C.text }]}
          value={consumedQty}
          onChangeText={handleConsumedChange}
          keyboardType="decimal-pad"
          textAlign="center"
          accessibilityLabel="Consumed quantity"
        />
        <QtyButton C={C} icon="add" label="Increase consumed" onPress={() => stepConsumed(step)} />
        <Text style={[styles.unitLabel, { color: C.textSecondary }]}>{unit}</Text>
      </View>

      <View style={[styles.prepSummary, { backgroundColor: C.card, borderColor: C.border }, SHADOW.sm]}>
        {[
          ['Prepared', `${maxQty} ${unit}`, C.text],
          ['Consumed', `${consumedQty || 0} ${unit}`, COLORS.feeding],
          ['Duration', formatDurationMins(duration), C.textMuted],
        ].map(([label, value, color], i) => (
          <View
            key={label}
            style={[styles.prepSummaryRow, i > 0 && { borderTopWidth: 1, borderTopColor: C.border }]}
          >
            <Text style={[styles.prepSummaryLabel, { color: C.textSecondary }]}>{label}</Text>
            <Text style={[styles.prepSummaryVal, { color }]}>{value}</Text>
          </View>
        ))}
      </View>

      <PrimaryButton
        onPress={onSave}
        disabled={saving}
        icon="checkmark-circle"
        label="Save Feed"
        accessibilityLabel="Save bottle feed"
        style={{ marginTop: SPACING.sm, opacity: saving ? 0.6 : 1 }}
      />
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
    <View style={[styles.logItem, { backgroundColor: C.card, borderColor: C.border }, SHADOW.sm]}>
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
          { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 110 },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.screenHeader}>
          <GradientView colors={GRADIENTS.feeding} style={[styles.headerIcon, { shadowColor: COLORS.feeding }]}>
            <Ionicons name="nutrition" size={24} color={COLORS.white} />
          </GradientView>
          <View style={{ flex: 1 }}>
            <Text style={[styles.screenTitle, { color: C.text }]}>Feeding</Text>
            <Text style={[styles.screenSub, { color: C.textSecondary }]}>
              {logs.length > 0 ? `${todayCount} feed${todayCount === 1 ? '' : 's'} today` : 'Start first feed'}
            </Text>
          </View>
        </View>

        {showSuccess && (
          <View style={[styles.successToast, { backgroundColor: C.medicineLight, borderColor: COLORS.success + '40' }]}>
            <Ionicons name="checkmark-circle" size={18} color={COLORS.success} />
            <Text style={[styles.successText, { color: COLORS.success }]}>Feed logged!</Text>
          </View>
        )}

        {/* Timer running for a different baby */}
        {otherBabySession && (
          <View style={[extra.otherBaby, { backgroundColor: C.card, borderColor: C.border }, SHADOW.sm]}>
            <View style={[extra.otherBabyIcon, { backgroundColor: C.feedingLight }]}>
              <Ionicons name="time-outline" size={20} color={COLORS.feeding} />
            </View>
            <Text style={[extra.otherBabyText, { color: C.text }]}>
              A feeding timer is running for {otherBabyName}.
            </Text>
            <TouchableOpacity
              onPress={() => setActiveBaby(otherBabySession.babyId)}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={`Switch to ${otherBabyName}`}
            >
              <GradientView colors={GRADIENTS.feeding} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={extra.otherBabyBtn}>
                <Text style={extra.otherBabyBtnText}>Open</Text>
              </GradientView>
            </TouchableOpacity>
          </View>
        )}

        {/* Start screen */}
        {showStartScreen && (
          <>
            <Text style={[styles.sectionTitle, { color: C.text }]}>Feeding type</Text>
            <View style={styles.typeGrid}>
              {[
                { value: 'breast', label: 'Breastfeed', icon: 'heart', sub: 'Choose side & timer' },
                { value: 'bottle', label: 'Bottle Feed', icon: 'beaker', sub: 'Qty + timer + log' },
              ].map((t) => {
                const selected = feedType === t.value;
                return (
                  <TouchableOpacity
                    key={t.value}
                    onPress={() => setFeedType(t.value)}
                    style={[
                      styles.typeCard,
                      { backgroundColor: C.card, borderColor: C.border },
                      SHADOW.sm,
                      selected && { backgroundColor: C.feedingLight, borderColor: COLORS.feeding },
                    ]}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    accessibilityLabel={t.label}
                  >
                    {selected ? (
                      <GradientView colors={GRADIENTS.feeding} style={styles.typeIcon}>
                        <Ionicons name={t.icon} size={22} color={COLORS.white} />
                      </GradientView>
                    ) : (
                      <View style={[styles.typeIcon, { backgroundColor: C.feedingLight }]}>
                        <Ionicons name={t.icon} size={22} color={COLORS.feeding} />
                      </View>
                    )}
                    <Text style={[styles.typeLabel, { color: selected ? COLORS.feeding : C.text }]}>
                      {t.label}
                    </Text>
                    <Text style={[styles.typeSub, { color: C.textMuted }]}>{t.sub}</Text>
                    {selected && (
                      <View style={styles.typeCheck}>
                        <Ionicons name="checkmark-circle" size={20} color={COLORS.feeding} />
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            <PrimaryButton
              onPress={handleStart}
              icon="play-circle"
              iconSize={24}
              label="Start Feeding"
              accessibilityLabel="Start feeding"
            />
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
            style={[styles.cancelBtn, { backgroundColor: C.card, borderColor: C.border }]}
            accessibilityRole="button"
            accessibilityLabel="Cancel session"
          >
            <Text style={[styles.cancelText, { color: C.textSecondary }]}>Cancel</Text>
          </TouchableOpacity>
        )}

        {/* History */}
        {logs.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { color: C.text, marginTop: SPACING.xl }]}>
              Recent
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
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 12, borderRadius: RADIUS.xl, borderWidth: 1, marginBottom: SPACING.md,
  },
  otherBabyIcon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  otherBabyText: { flex: 1, fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold },
  otherBabyBtn: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: RADIUS.full },
  otherBabyBtnText: { color: COLORS.white, fontWeight: FONT_WEIGHT.heavy, fontSize: FONT_SIZE.sm },
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: SPACING.lg },
  screenHeader: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: SPACING.lg },
  headerIcon: {
    width: 52, height: 52, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
    shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 5,
  },
  screenTitle: { fontSize: FONT_SIZE.xxl, fontWeight: FONT_WEIGHT.heavy, letterSpacing: -0.8 },
  screenSub: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.medium, marginTop: 2 },

  successToast: {
    flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12,
    borderRadius: RADIUS.lg, borderWidth: 1, marginBottom: SPACING.md,
  },
  successText: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.bold },

  sectionTitle: {
    fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.heavy, letterSpacing: -0.3, marginBottom: 12,
  },

  // Start screen
  typeGrid: { flexDirection: 'row', gap: 12, marginBottom: SPACING.lg },
  typeCard: {
    flex: 1, alignItems: 'flex-start', padding: SPACING.md,
    borderRadius: RADIUS.xl, borderWidth: 1.5, gap: 4, minHeight: 130,
  },
  typeIcon: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  typeCheck: { position: 'absolute', top: 12, right: 12 },
  typeLabel: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.heavy },
  typeSub: { fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.medium },

  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 18, paddingHorizontal: SPACING.lg, borderRadius: RADIUS.full, gap: 10,
  },
  primaryBtnText: { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.heavy, color: COLORS.white, letterSpacing: -0.2 },

  // Info badge above forms
  infoBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 12, borderRadius: RADIUS.xl, borderWidth: 1,
  },
  infoBadgeIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  infoBadgeText: { flex: 1, fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.bold },

  // Gradient hero (live timers)
  hero: { borderRadius: RADIUS.xxl, padding: SPACING.lg, gap: SPACING.md },
  heroPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: RADIUS.full,
    backgroundColor: 'rgba(255,255,255,0.22)', maxWidth: '100%',
  },
  heroPillText: { color: COLORS.white, fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.bold, flexShrink: 1 },
  heroTime: {
    color: COLORS.white, fontSize: 48, fontWeight: FONT_WEIGHT.heavy,
    letterSpacing: -1.5, fontVariant: ['tabular-nums'],
  },
  heroCenter: { alignItems: 'center', paddingVertical: SPACING.sm },
  heroCaption: { color: WHITE_SOFT, fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.bold, letterSpacing: 1 },

  sidesRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  heroSide: {
    flex: 1, alignItems: 'center', padding: SPACING.md, gap: 6, minHeight: 110,
    borderRadius: RADIUS.xl, borderWidth: 1.5,
    backgroundColor: 'rgba(255,255,255,0.18)', borderColor: 'rgba(255,255,255,0.3)',
  },
  heroSideActive: { backgroundColor: COLORS.white, borderColor: COLORS.white },
  sideLabel: { fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.heavy, letterSpacing: 1 },
  sideTime: { fontSize: FONT_SIZE.xxl, fontWeight: FONT_WEIGHT.heavy, letterSpacing: -0.5, fontVariant: ['tabular-nums'] },
  activeDot: {
    position: 'absolute', top: 10, right: 10,
    width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.feeding,
  },
  switchBtn: {
    width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  switchHint: { textAlign: 'center', fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.medium },

  heroRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 14, borderRadius: RADIUS.lg, backgroundColor: 'rgba(255,255,255,0.18)',
  },
  heroRowText: { color: COLORS.white, fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.bold },

  controlRow: { flexDirection: 'row', gap: SPACING.sm },
  heroGhostBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 15, borderRadius: RADIUS.full,
    backgroundColor: 'rgba(255,255,255,0.2)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)',
  },
  heroGhostText: { color: COLORS.white, fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.heavy },
  heroSolidBtn: {
    flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 15, borderRadius: RADIUS.full, backgroundColor: COLORS.white,
  },
  heroSolidText: { color: COLORS.feeding, fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.heavy },

  // Side picker
  sidePickerWrap: { gap: SPACING.md },
  pickCard: {
    flex: 1, alignItems: 'center', padding: SPACING.md, gap: 6, minHeight: 130,
    borderRadius: RADIUS.xl, borderWidth: 1,
  },
  pickIcon: { width: 52, height: 52, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  pickLabel: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.heavy, letterSpacing: 1 },
  sidePickerHint: { fontSize: FONT_SIZE.xs, textAlign: 'center', fontWeight: FONT_WEIGHT.medium },

  cancelBtn: {
    alignItems: 'center', padding: 14, borderRadius: RADIUS.full, borderWidth: 1, marginTop: SPACING.md,
  },
  cancelText: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.bold },

  // Bottle forms
  bottleForm: { gap: SPACING.md },
  formSection: { fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.bold, letterSpacing: 1 },
  pillRow3: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  typePill: {
    paddingVertical: 10, paddingHorizontal: 16, borderRadius: RADIUS.full, borderWidth: 1.5,
  },
  typePillText: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold },
  typePillTextActive: { fontWeight: FONT_WEIGHT.heavy },
  qtyCard: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    padding: 10, borderRadius: RADIUS.xl, borderWidth: 1,
  },
  qtyBtn: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  qtyInput: {
    flex: 1, height: 52, fontSize: FONT_SIZE.xl, fontWeight: FONT_WEIGHT.heavy,
  },
  unitToggle: { flexDirection: 'row', borderRadius: RADIUS.full, overflow: 'hidden', borderWidth: 1, padding: 3 },
  unitBtn: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: RADIUS.full },
  unitBtnActive: { backgroundColor: COLORS.feeding },
  unitText: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold },
  unitTextActive: { color: COLORS.white, fontWeight: FONT_WEIGHT.heavy },
  unitLabel: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.bold, paddingHorizontal: 8 },

  prepSummary: { borderRadius: RADIUS.xl, borderWidth: 1, paddingHorizontal: SPACING.md },
  prepSummaryRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12,
  },
  prepSummaryLabel: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.medium },
  prepSummaryVal: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.heavy },

  // Log items
  logItem: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    padding: 14, borderRadius: RADIUS.xl, borderWidth: 1, marginBottom: 10,
  },
  logIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  logTitle: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.bold },
  logSub: { fontSize: FONT_SIZE.sm, marginTop: 2 },
  logTime: { fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.medium },
});
