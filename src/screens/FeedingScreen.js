import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  TextInput, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { useBabyStore } from '../store/useBabyStore';
import {
  useFeedingStore, sideSecs, feedMs, MAX_FEED_HOURS, MAX_FEED_MS,
} from '../store/useFeedingStore';
import { setReminders, cancelReminder, feedLimitKey } from '../lib/reminders';

// A sound at the 3-hour mark of a breastfeed, so it is heard with the app closed.
import { COLORS } from '../constants/colors';
import { FONT_WEIGHT, RADIUS, SPACING, SHADOW, fs } from '../constants/theme';
import {
  formatDurationMins, formatDuration, formatRelative, formatTime, parsePositiveNumber, startOfToday,
} from '../utils/formatters';

// Local palette for this screen, taken from the user's approved screenshot.
const SHOT_LIGHT = { blue: '#006BFD', blueText: '#0058D4', tile: '#DAE9FE', hero: '#EBF3FE', card: '#EEF4FE', surface: '#FFFFFF', text: '#032049', textSecondary: '#5A6690', border: '#E1EAFB', background: '#FBFBFE' };
const SHOT_DARK = { blue: '#006BFD', blueText: '#7FB0FF', tile: '#1C2D52', hero: '#16223D', card: '#131D33', surface: '#1A2540', text: '#EEF3FF', textSecondary: '#A9B6D6', border: '#26324F', background: '#0B1220' };

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

// ─── Shared bits ──────────────────────────────────────────────────────────────

// Solid blue pill call-to-action. Accessibility props live on the touchable.
function PrimaryButton({ S, onPress, disabled, icon, iconSize = 22, label, accessibilityLabel, style }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.85}
      style={[styles.primaryBtn, { backgroundColor: S.blue }, style]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <Ionicons name={icon} size={iconSize} color={COLORS.white} />
      <Text style={styles.primaryBtnText}>{label}</Text>
    </TouchableOpacity>
  );
}

// Light-blue main card used by every state of the screen.
function HeroCard({ S, style, children }) {
  return <View style={[styles.hero, { backgroundColor: S.hero }, style]}>{children}</View>;
}

// Icon tile + heading row at the top of a form card.
function InfoBadge({ S, icon, children, style }) {
  return (
    <View style={[styles.infoBadge, style]}>
      <View style={[styles.infoBadgeIcon, { backgroundColor: S.tile }]}>
        <Ionicons name={icon} size={22} color={S.blue} />
      </View>
      <Text style={[styles.infoBadgeText, { color: S.text }]}>{children}</Text>
    </View>
  );
}

// Light-blue pill with an outline icon ("Total", "Bottle Feeding · …").
function HeroPill({ S, icon, children }) {
  return (
    <View style={[styles.heroPill, { backgroundColor: S.tile }]}>
      <Ionicons name={icon} size={18} color={S.text} />
      <Text style={[styles.heroPillText, { color: S.text }]}>{children}</Text>
    </View>
  );
}

// ─── Breast Side Picker ───────────────────────────────────────────────────────

function BreastSidePicker({ S, onSelect }) {
  return (
    <HeroCard S={S}>
      <InfoBadge S={S} icon="heart-outline">Breastfeed — Which side to start?</InfoBadge>
      <View style={styles.sidesRow}>
        {['left', 'right'].map((side) => (
          <TouchableOpacity
            key={side}
            onPress={() => onSelect(side)}
            style={[styles.pickCard, { backgroundColor: S.surface, borderColor: S.border }]}
            accessibilityRole="button"
            accessibilityLabel={`Start from ${side} breast`}
          >
            <View style={[styles.pickIcon, { backgroundColor: S.tile }]}>
              <Ionicons name={side === 'left' ? 'arrow-back-circle-outline' : 'arrow-forward-circle-outline'} size={28} color={S.blue} />
            </View>
            <Text style={[styles.pickLabel, { color: S.text }]}>{side.toUpperCase()}</Text>
            <Text style={[styles.sidePickerHint, { color: S.textSecondary }]}>Start timer on {side}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </HeroCard>
  );
}

// The "timer has run for 3 hours" alarm, set for when this feed's counted time reaches the
// limit. Pausing stops the clock, so pause cancels it and resume sets it again.
function scheduleFeedLimit(babyId) {
  const session = useFeedingStore.getState().sessions[babyId];
  if (!session || session.paused) return;
  const name = useBabyStore.getState().babies.find((b) => b.id === babyId)?.name || 'Baby';
  const left = Math.max(0, MAX_FEED_MS - feedMs(session));
  const bottle = session.type === 'bottle';
  setReminders(feedLimitKey(babyId), [{
    at: new Date(Date.now() + left),
    title: `${name}'s ${bottle ? 'bottle' : 'feeding'} timer has run for ${MAX_FEED_HOURS} hours`,
    body: bottle ? 'Open the app and enter how long baby drank and how much.'
      : 'Open the app and enter how long baby fed on each side.',
  }]).catch(() => {});
}

function pauseFeed(babyId) {
  useFeedingStore.getState().pauseSession(babyId);
  cancelReminder(feedLimitKey(babyId)).catch(() => {});
}

function resumeFeed(babyId) {
  useFeedingStore.getState().resumeSession(babyId);
  scheduleFeedLimit(babyId);
}

// ─── Breastfeeding Live Timer ─────────────────────────────────────────────────

function BreastfeedTimer({ S, babyId, onEnd }) {
  const session = useFeedingStore((s) => s.sessions[babyId]);
  const store = useFeedingStore.getState();
  const switchSide = () => store.switchSide(babyId);
  const pauseSession = () => pauseFeed(babyId);
  const resumeSession = () => resumeFeed(babyId);
  const endSession = () => store.endSession(babyId);
  const now = useNow(!!session && !session.paused);
  const [ending, setEnding] = useState(false);

  if (!session) return null;
  const { activeSide, paused } = session;
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
          { backgroundColor: active ? S.surface : S.card, borderColor: S.border },
          active && SHADOW.sm,
        ]}
        accessibilityRole="button"
        accessibilityLabel={`${side} side`}
        accessibilityState={{ selected: active }}
      >
        <Ionicons name="radio-button-off" size={24} color={S.text} />
        <Text style={[styles.sideLabel, { color: S.text }]}>
          {side.toUpperCase()}
        </Text>
        <Text style={[styles.sideTime, { color: S.text }]}>
          {formatDurationMins(secs)}
        </Text>
        {active && <View style={[styles.activeDot, { backgroundColor: S.blue }]} />}
      </TouchableOpacity>
    );
  };

  return (
    <HeroCard S={S}>
      <HeroPill S={S} icon="time-outline">{paused ? 'Paused' : 'Total'}</HeroPill>
      <Text style={[styles.heroTime, { color: S.text }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{formatDurationMins(leftSecs + rightSecs)}</Text>

      <View style={styles.sidesRow}>
        {renderSide('left', leftSecs)}
        <TouchableOpacity
          onPress={handleSwitch}
          style={[styles.switchBtn, { backgroundColor: S.tile }]}
          accessibilityRole="button"
          accessibilityLabel="Switch side"
        >
          <Ionicons name="swap-horizontal" size={26} color={S.blue} />
        </TouchableOpacity>
        {renderSide('right', rightSecs)}
      </View>

      <Text style={[styles.switchHint, { color: S.textSecondary }]}>
        Tap the other side to switch · The timer keeps running if you lock your phone
      </Text>

      <View style={styles.controlRow}>
        <TouchableOpacity
          onPress={() => { Haptics.selectionAsync(); paused ? resumeSession() : pauseSession(); }}
          style={[styles.secondaryBtn, { backgroundColor: S.surface, borderColor: S.tile }]}
          accessibilityRole="button"
          accessibilityLabel={paused ? 'Resume' : 'Pause'}
        >
          <Ionicons name={paused ? 'play-outline' : 'pause-outline'} size={22} color={S.blueText} />
          <Text style={[styles.secondaryBtnText, { color: S.blueText }]}>{paused ? 'Resume' : 'Pause'}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleEnd}
          disabled={ending}
          style={[styles.primaryBtn, styles.controlPrimary, { backgroundColor: S.blue, opacity: ending ? 0.6 : 1 }]}
          accessibilityRole="button"
          accessibilityLabel="End feeding"
        >
          <Ionicons name="stop-circle-outline" size={24} color={COLORS.white} />
          <Text style={styles.primaryBtnText}>End Feeding</Text>
        </TouchableOpacity>
      </View>
    </HeroCard>
  );
}

// ─── Quantity stepper (shared by bottle forms) ───────────────────────────────

function QtyButton({ S, icon, onPress, label }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.qtyBtn, { backgroundColor: S.tile }]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Ionicons name={icon} size={24} color={S.text} />
    </TouchableOpacity>
  );
}

// ─── Bottle Prepare Form ──────────────────────────────────────────────────────

function BottlePrepForm({ S, milkType, setMilkType, unit, setUnit, preparedQty, setPreparedQty, onStart }) {
  const step = QTY_STEP[unit];
  const qty = parsePositiveNumber(preparedQty);
  const changeUnit = (u) => {
    if (u === unit) return;
    // Convert the current amount so switching units doesn't change the real quantity.
    if (qty) setPreparedQty(fmtQty(u === 'oz' ? qty / 29.5735 : qty * 29.5735));
    setUnit(u);
  };

  return (
    <HeroCard S={S}>
      <InfoBadge S={S} icon="beaker-outline">How much did you prepare?</InfoBadge>

      <Text style={[styles.formSection, { color: S.textSecondary }]}>MILK TYPE</Text>
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
                { backgroundColor: S.surface, borderColor: S.border },
                selected && { backgroundColor: S.tile, borderColor: S.blue },
              ]}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
            >
              <Text style={[styles.typePillText, { color: selected ? S.blueText : S.text }, selected && styles.typePillTextActive]}>
                {t.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={[styles.formSection, { color: S.textSecondary, marginTop: SPACING.sm }]}>PREPARED QUANTITY</Text>
      <View style={[styles.qtyCard, { backgroundColor: S.surface, borderColor: S.border }]}>
        <QtyButton
          S={S}
          icon="remove"
          label="Decrease quantity"
          onPress={() => setPreparedQty(fmtQty(Math.max(0, (qty || 0) - step)))}
        />
        <TextInput
          style={[styles.qtyInput, { color: S.text }]}
          value={preparedQty}
          onChangeText={setPreparedQty}
          keyboardType="decimal-pad"
          textAlign="center"
          accessibilityLabel="Prepared quantity"
        />
        <QtyButton
          S={S}
          icon="add"
          label="Increase quantity"
          onPress={() => setPreparedQty(fmtQty((qty || 0) + step))}
        />
        <View style={[styles.unitToggle, { backgroundColor: S.card, borderColor: S.border }]}>
          {['ml', 'oz'].map((u) => (
            <TouchableOpacity
              key={u}
              onPress={() => changeUnit(u)}
              style={[styles.unitBtn, unit === u && { backgroundColor: S.blue }]}
              accessibilityRole="radio"
              accessibilityState={{ selected: unit === u }}
            >
              <Text style={[styles.unitText, { color: S.textSecondary }, unit === u && styles.unitTextActive]}>{u}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <PrimaryButton
        S={S}
        onPress={onStart}
        disabled={!qty}
        icon="timer-outline"
        label="Start Feeding Timer"
        accessibilityLabel="Start feeding timer"
        style={{ marginTop: SPACING.sm, opacity: qty ? 1 : 0.5 }}
      />
    </HeroCard>
  );
}

// ─── Breastfeed reached 3 hours: enter the real minutes ─────────────────────────

// "Left  [−15] [−5]  20 min  [+5] [+15]": minutes for one side (or the bottle), up to maxMin.
function MinutesRow({ S, label, mins, maxMin, onSet }) {
  const btn = (delta, text) => {
    const disabled = (delta < 0 && mins <= 0) || (delta > 0 && mins >= maxMin);
    return (
      <TouchableOpacity
        onPress={() => { Haptics.selectionAsync(); onSet(Math.max(0, Math.min(maxMin, mins + delta))); }}
        disabled={disabled}
        style={[styles.minStep, { backgroundColor: S.tile, opacity: disabled ? 0.4 : 1 }]}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${delta > 0 ? 'add' : 'remove'} ${Math.abs(delta)} minutes`}
      >
        <Text style={[styles.minStepText, { color: S.text }]}>{text}</Text>
      </TouchableOpacity>
    );
  };
  return (
    <View style={[styles.minRow, { backgroundColor: S.surface, borderColor: S.border }]}>
      <Text style={[styles.minLabel, { color: S.text }]}>{label}</Text>
      {btn(-15, '−15')}
      {btn(-5, '−5')}
      <Text style={[styles.minValue, { color: S.text }]}>{mins} min</Text>
      {btn(5, '+5')}
      {btn(15, '+15')}
    </View>
  );
}

function BreastFinishForm({ S, session, onSave, saving }) {
  const leftMin = Math.round(session.leftMs / 60000);
  const rightMin = Math.round(session.rightMs / 60000);
  const total = leftMin + rightMin;
  const set = (side) => (mins) => useFeedingStore.getState().setFeedSide(session.babyId, side, mins * 60000);
  const limit = MAX_FEED_HOURS * 60;

  return (
    <HeroCard S={S}>
      <HeroPill S={S} icon="alert-circle-outline">Feed stopped at {MAX_FEED_HOURS} hours</HeroPill>
      <Text style={[styles.finishTitle, { color: S.text }]}>How long did baby feed?</Text>
      <Text style={[styles.switchHint, { color: S.textSecondary }]}>
        Started {formatTime(session.startTime)}. Set the minutes on each side · at most {MAX_FEED_HOURS} hours in total.
      </Text>
      <MinutesRow S={S} label="Left" mins={leftMin} maxMin={limit - rightMin} onSet={set('left')} />
      <MinutesRow S={S} label="Right" mins={rightMin} maxMin={limit - leftMin} onSet={set('right')} />
      <Text style={[styles.finishTotal, { color: S.text }]}>Total {formatDurationMins(total * 60)}</Text>
      <PrimaryButton
        S={S}
        onPress={onSave}
        icon="checkmark-circle-outline"
        label={saving ? 'Saving…' : 'Save Feed'}
        accessibilityLabel="Save feed"
        style={{ opacity: total > 0 && !saving ? 1 : 0.5 }}
        disabled={total === 0 || saving}
      />
    </HeroCard>
  );
}

// ─── Bottle Timing View ───────────────────────────────────────────────────────

function BottleTimingView({ S, session }) {
  const store = useFeedingStore.getState();
  const pauseSession = () => pauseFeed(session.babyId);
  const resumeSession = () => resumeFeed(session.babyId);
  const finishTiming = () => { store.finishTiming(session.babyId); cancelReminder(feedLimitKey(session.babyId)); };
  const now = useNow(!session.paused);
  const elapsed = sideSecs(session, 'left', now);

  return (
    <HeroCard S={S}>
      <HeroPill S={S} icon="beaker-outline">
        Bottle Feeding · {session.preparedQty} {session.unit} prepared
      </HeroPill>

      <View style={styles.heroCenter}>
        <Text style={[styles.heroCaption, { color: S.textSecondary }]}>TIME ELAPSED</Text>
        <Text style={[styles.heroTime, { color: S.text }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
          {formatDurationMins(elapsed)}
        </Text>
        {session.paused && (
          <Text style={[styles.switchHint, { color: S.textSecondary, marginTop: 4 }]}>Paused</Text>
        )}
      </View>

      <View style={styles.controlRow}>
        <TouchableOpacity
          onPress={() => { Haptics.selectionAsync(); session.paused ? resumeSession() : pauseSession(); }}
          style={[styles.secondaryBtn, { backgroundColor: S.surface, borderColor: S.tile }]}
          accessibilityRole="button"
          accessibilityLabel={session.paused ? 'Resume' : 'Pause'}
        >
          <Ionicons name={session.paused ? 'play-outline' : 'pause-outline'} size={22} color={S.blueText} />
          <Text style={[styles.secondaryBtnText, { color: S.blueText }]}>{session.paused ? 'Resume' : 'Pause'}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); finishTiming(); }}
          style={[styles.primaryBtn, styles.controlPrimary, { backgroundColor: S.blue }]}
          accessibilityRole="button"
          accessibilityLabel="Done feeding"
        >
          <Ionicons name="checkmark-circle-outline" size={24} color={COLORS.white} />
          <Text style={styles.primaryBtnText}>Done Feeding</Text>
        </TouchableOpacity>
      </View>
    </HeroCard>
  );
}

// ─── Bottle Finish Form ───────────────────────────────────────────────────────

function BottleFinishForm({ S, session, consumedQty, setConsumedQty, onSave, saving }) {
  const duration = sideSecs(session, 'left');
  const durationMin = Math.round(session.leftMs / 60000);
  const maxQty = session.preparedQty || 0;
  const unit = session.unit || 'ml';
  const step = unit === 'oz' ? 0.5 : 5;

  // No upper limit: baby may drink more than was first prepared (a top-up).
  const handleConsumedChange = (v) => setConsumedQty(v);

  const stepConsumed = (delta) => {
    const current = parsePositiveNumber(consumedQty) || 0;
    setConsumedQty(fmtQty(Math.max(0, current + delta)));
  };

  return (
    <HeroCard S={S}>
      {session.capped ? (
        <>
          <HeroPill S={S} icon="alert-circle-outline">Feed stopped at {MAX_FEED_HOURS} hours</HeroPill>
          <Text style={[styles.switchHint, { color: S.textSecondary }]}>
            Started {formatTime(session.startTime)}. How long did baby drink? At most {MAX_FEED_HOURS} hours.
          </Text>
          <MinutesRow
            S={S}
            label="Time"
            mins={durationMin}
            maxMin={MAX_FEED_HOURS * 60}
            onSet={(m) => useFeedingStore.getState().setFeedSide(session.babyId, 'left', m * 60000)}
          />
        </>
      ) : null}
      <InfoBadge S={S} icon="time-outline">
        Duration: {formatDurationMins(duration)} · Prepared: {maxQty} {unit}
      </InfoBadge>

      <View>
        <Text style={[styles.formSection, { color: S.textSecondary }]}>HOW MUCH DID BABY CONSUME? ({unit})</Text>
        <Text style={[styles.switchHint, { color: S.textSecondary, textAlign: 'left', marginTop: 4 }]}>
          Prepared: {maxQty} {unit}. Enter more if baby drank more.
        </Text>
      </View>
      <View style={[styles.qtyCard, { backgroundColor: S.surface, borderColor: S.border }]}>
        <QtyButton S={S} icon="remove" label="Decrease consumed" onPress={() => stepConsumed(-step)} />
        <TextInput
          style={[styles.qtyInput, { color: S.text }]}
          value={consumedQty}
          onChangeText={handleConsumedChange}
          keyboardType="decimal-pad"
          textAlign="center"
          accessibilityLabel="Consumed quantity"
        />
        <QtyButton S={S} icon="add" label="Increase consumed" onPress={() => stepConsumed(step)} />
        <Text style={[styles.unitLabel, { color: S.textSecondary }]}>{unit}</Text>
      </View>

      <View style={[styles.prepSummary, { backgroundColor: S.surface, borderColor: S.border }]}>
        {[
          ['Prepared', `${maxQty} ${unit}`, S.text],
          ['Consumed', `${consumedQty || 0} ${unit}`, S.blueText],
          ['Duration', formatDurationMins(duration), S.textSecondary],
        ].map(([label, value, color], i) => (
          <View
            key={label}
            style={[styles.prepSummaryRow, i > 0 && { borderTopWidth: 1, borderTopColor: S.border }]}
          >
            <Text style={[styles.prepSummaryLabel, { color: S.textSecondary }]}>{label}</Text>
            <Text style={[styles.prepSummaryVal, { color }]}>{value}</Text>
          </View>
        ))}
      </View>

      <PrimaryButton
        S={S}
        onPress={onSave}
        disabled={saving}
        icon="checkmark-circle-outline"
        label="Save Feed"
        accessibilityLabel="Save bottle feed"
        style={{ marginTop: SPACING.sm, opacity: saving ? 0.6 : 1 }}
      />
    </HeroCard>
  );
}

// ─── History Item ─────────────────────────────────────────────────────────────

function FeedLogItem({ log, S }) {
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
    <View style={[styles.logItem, { backgroundColor: S.card }]}>
      <View style={[styles.logIcon, { backgroundColor: S.surface, borderColor: S.border }]}>
        <Ionicons name={isBreast ? 'heart-outline' : 'beaker-outline'} size={24} color={S.text} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.logTitle, { color: S.text }]}>
          {isBreast ? 'Breastfeed' : 'Bottle Feed'}
        </Text>
        <Text style={[styles.logSub, { color: S.text }]}>{subText}</Text>
      </View>
      <Text style={[styles.logTime, { color: S.textSecondary }]}>{formatRelative(log.startTime || log.createdAt)}</Text>
    </View>
  );
}

// ─── Another baby feeding at the same time (twins) ───────────────────────────

function OtherFeedCard({ S, session, name, onOpen, onSaved }) {
  const now = useNow(!session.paused);
  const [saving, setSaving] = useState(false);
  const isBottle = session.type === 'bottle';
  const capped = !isBottle && session.stage === 'finish';
  const secs = isBottle ? sideSecs(session, 'left', now) : sideSecs(session, 'left', now) + sideSecs(session, 'right', now);
  const status = isBottle
    ? session.stage === 'finish' ? 'Bottle done · enter the amount' : `Bottle · ${formatDurationMins(secs)}`
    : capped
      ? `Reached ${MAX_FEED_HOURS} hours · enter the minutes`
      : `${session.activeSide === 'left' ? 'Left' : 'Right'} breast · ${formatDurationMins(secs)}${session.paused ? ' · paused' : ''}`;

  // A breastfeed can be saved from here; a bottle still needs the amount, so it opens.
  const stop = async () => {
    if (saving) return;
    setSaving(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await useFeedingStore.getState().endSession(session.babyId);
    cancelReminder(feedLimitKey(session.babyId));
    onSaved(name);
  };

  return (
    <View style={[styles.otherBaby, { backgroundColor: S.hero }]}>
      <View style={[styles.otherBabyIcon, { backgroundColor: S.tile }]}>
        <Ionicons name={isBottle ? 'beaker-outline' : 'heart-outline'} size={22} color={S.blue} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.otherBabyText, { color: S.text }]} numberOfLines={1}>{name} is also feeding</Text>
        <Text style={[styles.otherBabySub, { color: S.textSecondary }]} numberOfLines={1}>{status}</Text>
      </View>
      {isBottle || capped ? (
        <TouchableOpacity
          onPress={onOpen}
          activeOpacity={0.85}
          style={[styles.otherBabyBtn, { backgroundColor: S.blue }]}
          accessibilityRole="button"
          accessibilityLabel={`Open ${name}'s feed`}
        >
          <Text style={styles.otherBabyBtnText}>Open</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          onPress={stop}
          disabled={saving}
          activeOpacity={0.85}
          style={[styles.otherBabyBtn, { backgroundColor: S.blue }]}
          accessibilityRole="button"
          accessibilityLabel={`Stop and save ${name}'s feed`}
        >
          <Text style={styles.otherBabyBtnText}>Stop</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function FeedingScreen({ navigation }) {
  const { getActiveBaby, darkMode, babies, setActiveBaby } = useBabyStore();
  const baby = getActiveBaby();
  const babyId = baby?.id;
  const S = darkMode ? SHOT_DARK : SHOT_LIGHT;
  const insets = useSafeAreaInsets();

  // Every baby has their own timer, so twins can feed at the same time.
  const sessions = useFeedingStore((s) => s.sessions);
  const logs = useFeedingStore((s) => s.logs[babyId]) || [];
  const { startSession, load } = useFeedingStore.getState();

  const [feedType, setFeedType] = useState(baby?.feedingType === 'bottle' ? 'bottle' : 'breast');
  const [showSuccess, setShowSuccess] = useState(false);
  const [saving, setSaving] = useState(false);

  const [breastSidePicking, setFeedSidePicking] = useState(false);
  const [bottlePreparing, setBottlePreparing] = useState(false);
  const [milkType, setMilkType] = useState('formula');
  const [unit, setUnit] = useState('ml');
  const [preparedQty, setPreparedQty] = useState('90');
  const [consumedQty, setConsumedQty] = useState('');

  // A half-filled start form belongs to the baby it was opened for.
  useEffect(() => {
    if (babyId) load(babyId);
    setFeedSidePicking(false);
    setBottlePreparing(false);
    setConsumedQty('');
  }, [babyId]);

  const mySession = sessions[babyId] || null;
  // Other babies feeding right now (shown as small cards).
  const otherSessions = Object.values(sessions)
    .filter((x) => x.babyId !== babyId && babies.some((b) => b.id === x.babyId));
  const nameOf = (id) => babies.find((b) => b.id === id)?.name || 'Baby';
  const [savedName, setSavedName] = useState(null);

  // A feed (breast or bottle) that reaches 3 hours stops there; the parent is told once and
  // enters the real minutes.
  const warned = useRef(new Set());
  useEffect(() => {
    const check = () => {
      Object.values(useFeedingStore.getState().sessions).forEach((x) => {
        if (x.stage === 'finish' || feedMs(x) < MAX_FEED_MS) return;
        useFeedingStore.getState().capFeed(x.babyId);
        cancelReminder(feedLimitKey(x.babyId));
        const key = `${x.babyId}@${x.startTime}`;
        if (warned.current.has(key)) return;
        warned.current.add(key);
        const who = nameOf(x.babyId);
        Alert.alert(
          `${who}'s feed reached ${MAX_FEED_HOURS} hours`,
          x.type === 'bottle'
            ? `A single feed can be at most ${MAX_FEED_HOURS} hours, so the bottle timer stopped. Enter how long ${who} drank and how much, then save.`
            : `A single feed can be at most ${MAX_FEED_HOURS} hours, so the timer stopped. Enter how many minutes ${who} fed on each side, then save.`,
          [
            { text: 'Later', style: 'cancel' },
            { text: 'Enter the time', onPress: () => { if (x.babyId !== babyId) setActiveBaby(x.babyId); } },
          ]
        );
      });
    };
    check();
    const id = setInterval(check, 15000);
    return () => clearInterval(id);
  }, [babyId, babies]);

  const handleBreastFinishSave = async () => {
    if (saving) return;
    setSaving(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await useFeedingStore.getState().endSession(babyId);
    cancelReminder(feedLimitKey(babyId));
    setSaving(false);
    showSaved();
  };

  // When the bottle timer is done, pre-fill "consumed" with the prepared amount.
  useEffect(() => {
    if (mySession?.type === 'bottle' && mySession.stage === 'finish' && consumedQty === '') {
      setConsumedQty(fmtQty(mySession.preparedQty || 0));
    }
  }, [mySession?.stage]);

  const handleStart = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (feedType === 'bottle') setBottlePreparing(true);
    else setFeedSidePicking(true);
  };

  const handleBreastSideSelect = (side) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setFeedSidePicking(false);
    startSession(babyId, 'breast', side);
    scheduleFeedLimit(babyId);
  };

  const handleBottleStartTimer = () => {
    const prepared = parsePositiveNumber(preparedQty);
    if (!prepared) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setBottlePreparing(false);
    setConsumedQty('');
    startSession(babyId, 'bottle', 'left', { milkType, unit, preparedQty: prepared });
    scheduleFeedLimit(babyId);
  };

  const showSaved = () => {
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 3000);
  };

  const handleBottleSave = async () => {
    if (saving) return;
    setSaving(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await useFeedingStore.getState().endSession(babyId, { consumedQty: parsePositiveNumber(consumedQty) || 0 });
    cancelReminder(feedLimitKey(babyId));
    setConsumedQty('');
    setSaving(false);
    showSaved();
  };

  const resetLocal = () => {
    setFeedSidePicking(false);
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
        onPress: () => { useFeedingStore.getState().cancelSession(babyId); cancelReminder(feedLimitKey(babyId)); resetLocal(); },
      },
    ]);
  };

  const showStartScreen = !mySession && !breastSidePicking && !bottlePreparing;
  const showBreastPicker = breastSidePicking && !mySession;
  const showBottlePrepare = bottlePreparing && !mySession;
  const showBreastTimer = mySession?.type === 'breast' && mySession.stage !== 'finish';
  const showBreastFinish = mySession?.type === 'breast' && mySession.stage === 'finish';
  const showBottleTiming = mySession?.type === 'bottle' && mySession.stage !== 'finish';
  const showBottleFinish = mySession?.type === 'bottle' && mySession.stage === 'finish';
  const showCancel = showBreastPicker || showBottlePrepare || !!mySession;

  const todayStart = startOfToday();
  const todayCount = logs.filter((l) => new Date(l.startTime || l.createdAt) >= todayStart).length;

  return (
    <View style={[styles.container, { backgroundColor: S.background }]}>
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
          <View style={[styles.headerIcon, { backgroundColor: S.tile }]}>
            <Ionicons name="nutrition-outline" size={30} color={S.blue} />
          </View>
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} style={[styles.screenTitle, { color: S.text }]}>Feeding</Text>
            <Text style={[styles.screenSub, { color: S.textSecondary }]}>
              {logs.length > 0 ? `${todayCount} feed${todayCount === 1 ? '' : 's'} today` : 'Start first feed'}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => navigation.navigate('Settings')}
            style={[styles.headerBtn, { backgroundColor: S.tile }]}
            accessibilityRole="button"
            accessibilityLabel="Settings"
          >
            <Ionicons name="settings-outline" size={24} color={S.blue} />
          </TouchableOpacity>
        </View>

        {showSuccess && (
          <View style={[styles.successToast, { backgroundColor: S.card, borderColor: COLORS.success + '40' }]}>
            <Ionicons name="checkmark-circle-outline" size={22} color={COLORS.success} />
            <Text style={[styles.successText, { color: S.text }]}>Feed logged!</Text>
          </View>
        )}

        {savedName ? (
          <View style={[styles.successToast, { backgroundColor: S.card, borderColor: COLORS.success + '40' }]}>
            <Ionicons name="checkmark-circle-outline" size={22} color={COLORS.success} />
            <Text style={[styles.successText, { color: S.text }]}>{savedName}'s feed logged!</Text>
          </View>
        ) : null}

        {/* Other babies feeding at the same time (twins): their own timers keep running. */}
        {otherSessions.map((x) => (
          <OtherFeedCard
            key={x.babyId}
            S={S}
            session={x}
            name={nameOf(x.babyId)}
            onOpen={() => setActiveBaby(x.babyId)}
            onSaved={(n) => { setSavedName(n); setTimeout(() => setSavedName(null), 3000); }}
          />
        ))}

        {/* Start screen */}
        {showStartScreen && (
          <HeroCard S={S}>
            <Text style={[styles.cardTitle, { color: S.text }]}>Feeding type</Text>
            <View style={styles.typeGrid}>
              {[
                { value: 'breast', label: 'Breastfeed', icon: 'heart-outline', sub: 'Choose side & timer' },
                { value: 'bottle', label: 'Bottle Feed', icon: 'beaker-outline', sub: 'Qty + timer + log' },
              ].map((t) => {
                const selected = feedType === t.value;
                return (
                  <TouchableOpacity
                    key={t.value}
                    onPress={() => setFeedType(t.value)}
                    style={[
                      styles.typeCard,
                      { backgroundColor: S.card, borderColor: S.border },
                      selected && [{ backgroundColor: S.surface, borderColor: S.blue }, SHADOW.sm],
                    ]}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    accessibilityLabel={t.label}
                  >
                    <View style={[styles.typeIcon, { backgroundColor: S.tile }]}>
                      <Ionicons name={t.icon} size={24} color={S.blue} />
                    </View>
                    <Text style={[styles.typeLabel, { color: S.text }]}>
                      {t.label}
                    </Text>
                    <Text style={[styles.typeSub, { color: S.textSecondary }]}>{t.sub}</Text>
                    {selected && (
                      <View style={[styles.activeDot, { backgroundColor: S.blue }]} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            <PrimaryButton
              S={S}
              onPress={handleStart}
              icon="play-circle-outline"
              iconSize={24}
              label="Start Feeding"
              accessibilityLabel="Start feeding"
            />
          </HeroCard>
        )}

        {showBreastPicker && <BreastSidePicker S={S} onSelect={handleBreastSideSelect} />}

        {showBreastTimer && (
          <BreastfeedTimer S={S} babyId={babyId} onEnd={() => { cancelReminder(feedLimitKey(babyId)); showSaved(); }} />
        )}

        {showBreastFinish && (
          <BreastFinishForm S={S} session={mySession} onSave={handleBreastFinishSave} saving={saving} />
        )}

        {showBottlePrepare && (
          <BottlePrepForm
            S={S}
            milkType={milkType}
            setMilkType={setMilkType}
            unit={unit}
            setUnit={setUnit}
            preparedQty={preparedQty}
            setPreparedQty={setPreparedQty}
            onStart={handleBottleStartTimer}
          />
        )}

        {showBottleTiming && <BottleTimingView S={S} session={mySession} />}

        {showBottleFinish && (
          <BottleFinishForm
            S={S}
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
            style={[styles.cancelBtn, { backgroundColor: S.surface, borderColor: S.border }]}
            accessibilityRole="button"
            accessibilityLabel="Cancel session"
          >
            <Text style={[styles.cancelText, { color: S.text }]}>Cancel</Text>
          </TouchableOpacity>
        )}

        {/* History */}
        {logs.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { color: S.text, marginTop: SPACING.xl }]}>
              Recent
            </Text>
            {logs.slice(0, 10).map((log) => (
              <FeedLogItem key={log.id} log={log} S={S} />
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

  // Header
  screenHeader: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: SPACING.lg },
  headerIcon: { width: 56, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  screenTitle: { fontSize: fs(28), fontWeight: FONT_WEIGHT.heavy, letterSpacing: -0.6 },
  screenSub: { fontSize: fs(15), fontWeight: FONT_WEIGHT.medium, marginTop: 2 },
  headerBtn: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },

  successToast: {
    flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, minHeight: 48,
    borderRadius: RADIUS.full, borderWidth: 1, marginBottom: SPACING.md,
  },
  successText: { fontSize: fs(15), fontWeight: FONT_WEIGHT.bold },

  sectionTitle: { fontSize: fs(22), fontWeight: FONT_WEIGHT.heavy, letterSpacing: -0.3, marginBottom: 12 },
  cardTitle: { fontSize: fs(18), fontWeight: FONT_WEIGHT.heavy },

  // Main light-blue card (every state)
  hero: { borderRadius: 28, padding: 20, gap: SPACING.md },
  heroPill: {
    flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start',
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: RADIUS.full, maxWidth: '100%',
  },
  heroPillText: { fontSize: fs(15), fontWeight: FONT_WEIGHT.bold, flexShrink: 1 },
  heroTime: { fontSize: fs(64), fontWeight: FONT_WEIGHT.heavy, letterSpacing: -2, fontVariant: ['tabular-nums'] },
  heroCenter: { alignItems: 'center', paddingVertical: SPACING.sm },
  heroCaption: { fontSize: fs(13), fontWeight: FONT_WEIGHT.bold, letterSpacing: 1 },

  // Start screen
  typeGrid: { flexDirection: 'row', gap: 12 },
  typeCard: {
    flex: 1, alignItems: 'flex-start', padding: SPACING.md,
    borderRadius: 24, borderWidth: 1, gap: 4, minHeight: 130,
  },
  typeIcon: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  typeLabel: { fontSize: fs(17), fontWeight: FONT_WEIGHT.heavy },
  typeSub: { fontSize: fs(13), fontWeight: FONT_WEIGHT.medium },

  // Buttons
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    minHeight: 56, paddingHorizontal: SPACING.lg, borderRadius: RADIUS.full, gap: 10,
  },
  primaryBtnText: { fontSize: fs(18), fontWeight: FONT_WEIGHT.heavy, color: COLORS.white, letterSpacing: -0.2 },
  controlRow: { flexDirection: 'row', gap: 12 },
  controlPrimary: { flex: 2, paddingHorizontal: 12 },
  secondaryBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, minHeight: 56, borderRadius: RADIUS.full, borderWidth: 1.5,
  },
  secondaryBtnText: { fontSize: fs(18), fontWeight: FONT_WEIGHT.heavy },
  cancelBtn: {
    alignItems: 'center', justifyContent: 'center', minHeight: 52,
    borderRadius: RADIUS.full, borderWidth: 1, marginTop: SPACING.md,
  },
  cancelText: { fontSize: fs(17), fontWeight: FONT_WEIGHT.bold },

  // Heading row at the top of form cards
  infoBadge: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  infoBadgeIcon: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  infoBadgeText: { flex: 1, fontSize: fs(17), fontWeight: FONT_WEIGHT.bold },

  // Breast sides
  sidesRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sideCard: {
    flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.md, gap: 6, minHeight: 150,
    borderRadius: 24, borderWidth: 1,
  },
  sideLabel: { fontSize: fs(15), fontWeight: FONT_WEIGHT.medium, letterSpacing: 0.5 },
  sideTime: { fontSize: fs(32), fontWeight: FONT_WEIGHT.heavy, letterSpacing: -0.5, fontVariant: ['tabular-nums'] },
  activeDot: { position: 'absolute', top: 14, right: 14, width: 10, height: 10, borderRadius: 5 },
  switchBtn: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  switchHint: { textAlign: 'center', fontSize: fs(13), fontWeight: FONT_WEIGHT.medium },


  // Side picker
  pickCard: {
    flex: 1, alignItems: 'center', padding: SPACING.md, gap: 6, minHeight: 140,
    borderRadius: 24, borderWidth: 1,
  },
  pickIcon: { width: 56, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  pickLabel: { fontSize: fs(17), fontWeight: FONT_WEIGHT.heavy, letterSpacing: 1 },
  sidePickerHint: { fontSize: fs(13), textAlign: 'center', fontWeight: FONT_WEIGHT.medium },

  // Bottle forms
  formSection: { fontSize: fs(13), fontWeight: FONT_WEIGHT.bold, letterSpacing: 1 },
  pillRow3: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  typePill: {
    minHeight: 48, justifyContent: 'center', paddingHorizontal: 18, borderRadius: RADIUS.full, borderWidth: 1,
  },
  typePillText: { fontSize: fs(15), fontWeight: FONT_WEIGHT.semibold },
  typePillTextActive: { fontWeight: FONT_WEIGHT.heavy },
  qtyCard: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    padding: 10, borderRadius: 24, borderWidth: 1,
  },
  qtyBtn: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  qtyInput: { flex: 1, height: 52, fontSize: fs(26), fontWeight: FONT_WEIGHT.heavy },
  unitToggle: { flexDirection: 'row', borderRadius: RADIUS.full, overflow: 'hidden', borderWidth: 1, padding: 3 },
  unitBtn: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 12, borderRadius: RADIUS.full },
  unitText: { fontSize: fs(15), fontWeight: FONT_WEIGHT.semibold },
  unitTextActive: { color: COLORS.white, fontWeight: FONT_WEIGHT.heavy },
  unitLabel: { fontSize: fs(15), fontWeight: FONT_WEIGHT.bold, paddingHorizontal: 8 },

  prepSummary: { borderRadius: 24, borderWidth: 1, paddingHorizontal: SPACING.md },
  prepSummaryRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12,
  },
  prepSummaryLabel: { fontSize: fs(15), fontWeight: FONT_WEIGHT.medium },
  prepSummaryVal: { fontSize: fs(17), fontWeight: FONT_WEIGHT.heavy },

  // Timer running for another baby
  otherBaby: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 14, borderRadius: 24, marginBottom: SPACING.md,
  },
  otherBabyIcon: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  otherBabyText: { fontSize: fs(15), fontWeight: FONT_WEIGHT.semibold },
  finishTitle: { fontSize: fs(20), fontWeight: FONT_WEIGHT.heavy, marginTop: SPACING.sm },
  finishTotal: { fontSize: fs(18), fontWeight: FONT_WEIGHT.heavy, textAlign: 'center', marginVertical: SPACING.sm },
  minRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6, padding: 8, marginTop: SPACING.sm,
    borderRadius: RADIUS.lg, borderWidth: 1,
  },
  minLabel: { width: 44, fontSize: fs(15), fontWeight: FONT_WEIGHT.bold },
  minValue: { flex: 1, textAlign: 'center', fontSize: fs(16), fontWeight: FONT_WEIGHT.heavy },
  minStep: { minWidth: 44, minHeight: 44, borderRadius: RADIUS.full, alignItems: 'center', justifyContent: 'center' },
  minStepText: { fontSize: fs(14), fontWeight: FONT_WEIGHT.bold },
  otherBabySub: { fontSize: fs(13), fontWeight: FONT_WEIGHT.medium, marginTop: 2 },
  otherBabyBtn: {
    minHeight: 48, justifyContent: 'center', paddingHorizontal: 20, borderRadius: RADIUS.full,
  },
  otherBabyBtnText: { color: COLORS.white, fontWeight: FONT_WEIGHT.heavy, fontSize: fs(15) },

  // Log items
  logItem: {
    flexDirection: 'row', alignItems: 'center', gap: 16,
    padding: 16, borderRadius: 20, marginBottom: 10,
  },
  logIcon: {
    width: 48, height: 48, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center',
  },
  logTitle: { fontSize: fs(17), fontWeight: FONT_WEIGHT.bold },
  logSub: { fontSize: fs(15), marginTop: 2 },
  logTime: { fontSize: fs(14), fontWeight: FONT_WEIGHT.medium, alignSelf: 'flex-start', marginTop: 2 },
});
