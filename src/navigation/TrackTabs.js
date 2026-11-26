import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaInsetsContext, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { useBabyStore } from '../store/useBabyStore';
import { COLORS, DARK_COLORS } from '../constants/colors';
import { FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING, TIGHT_TEXT } from '../constants/theme';
import FeedingScreen from '../screens/FeedingScreen';
import SleepScreen from '../screens/SleepScreen';
import DiaperScreen from '../screens/DiaperScreen';
import GrowthScreen from '../screens/GrowthScreen';

const Tab = createBottomTabNavigator();

// The Track tab's own screens, switched with the bar at the top.
export const TRACK_SCREENS = [
  { name: 'Feeding', label: 'Feed', icon: 'nutrition', component: FeedingScreen },
  { name: 'Sleep', label: 'Sleep', icon: 'moon', component: SleepScreen },
  { name: 'Diaper', label: 'Diaper', icon: 'water', component: DiaperScreen },
  { name: 'Growth', label: 'Growth', icon: 'trending-up', component: GrowthScreen },
];

function Segments({ state, navigation, insetTop }) {
  const darkMode = useBabyStore((s) => s.darkMode);
  const C = darkMode ? DARK_COLORS : COLORS;
  return (
    <View style={[styles.bar, { paddingTop: insetTop + 10, backgroundColor: C.background }]}>
      <View style={[styles.track, { backgroundColor: C.primaryLight }]} accessibilityRole="tablist">
        {state.routes.map((route, i) => {
          const tab = TRACK_SCREENS.find((t) => t.name === route.name);
          const active = state.index === i;
          return (
            <TouchableOpacity
              key={route.key}
              onPress={() => {
                const e = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                if (!active && !e.defaultPrevented) navigation.navigate(route.name);
              }}
              style={[styles.seg, active && { backgroundColor: C.primary }]}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={tab.label}
            >
              <Ionicons name={active ? tab.icon : `${tab.icon}-outline`} size={16} color={active ? COLORS.white : C.primary} />
              <Text style={[styles.segText, { color: active ? COLORS.white : C.primary }]} numberOfLines={1} {...TIGHT_TEXT}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

/**
 * The Track tab: Feed, Sleep, Diaper and Growth under one tab. The bar sits under the status
 * bar, so the screens below it are given no top inset of their own.
 */
export default function TrackTabs() {
  const insets = useSafeAreaInsets();
  return (
    <SafeAreaInsetsContext.Provider value={{ ...insets, top: 0 }}>
      <Tab.Navigator
        tabBar={(props) => <Segments {...props} insetTop={insets.top} />}
        screenOptions={{ headerShown: false, tabBarPosition: 'top' }}
      >
        {TRACK_SCREENS.map((t) => (
          <Tab.Screen key={t.name} name={t.name} component={t.component} />
        ))}
      </Tab.Navigator>
    </SafeAreaInsetsContext.Provider>
  );
}

const styles = StyleSheet.create({
  bar: { paddingHorizontal: SPACING.lg, paddingBottom: 2 },
  track: { flexDirection: 'row', borderRadius: RADIUS.full, padding: 4, gap: 4 },
  seg: {
    flex: 1, minHeight: 40, borderRadius: RADIUS.full,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
  },
  segText: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.bold },
});
