import React, { useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, AppState } from 'react-native';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useBabyStore } from '../store/useBabyStore';
import { COLORS, DARK_COLORS, GRADIENTS } from '../constants/colors';
import GradientView from '../components/GradientView';
import { FONT_SIZE, FONT_WEIGHT, RADIUS, SHADOW, TIGHT_TEXT } from '../constants/theme';

import SplashScreen from '../screens/SplashScreen';
import OnboardingScreen from '../screens/OnboardingScreen';
import HomeScreen from '../screens/HomeScreen';
import FeedingScreen from '../screens/FeedingScreen';
import SleepScreen from '../screens/SleepScreen';
import GrowthScreen from '../screens/GrowthScreen';
import MoreScreen from '../screens/MoreScreen';
import DiaperScreen from '../screens/DiaperScreen';
import MedicineScreen from '../screens/MedicineScreen';
import VaccinationScreen from '../screens/VaccinationScreen';
import SummaryScreen from '../screens/SummaryScreen';
import SettingsScreen from '../screens/SettingsScreen';
import EditBabyScreen from '../screens/EditBabyScreen';
import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
import VerifyOtpScreen from '../screens/VerifyOtpScreen';
import ClientVerifyScreen from '../screens/ClientVerifyScreen';
import TemperatureScreen from '../screens/TemperatureScreen';
import BreathingScreen from '../screens/BreathingScreen';
import SkinScreen from '../screens/SkinScreen';
import MilestonesScreen from '../screens/MilestonesScreen';
import HealthAlertsScreen from '../screens/HealthAlertsScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import { setUnauthorizedHandler } from '../lib/api';
import { handleSessionLost } from '../lib/session';
import { flushPending } from '../lib/storage';

const Stack = createStackNavigator();
const navigationRef = createNavigationContainerRef();

// When the server ends the session (expired, logged out elsewhere) or the client's access is
// revoked, leave the records and return to the right sign-in step.
let handlingSessionLoss = false;
async function onSessionLost(err) {
  if (handlingSessionLoss) return;
  handlingSessionLoss = true;
  try {
    const next = await handleSessionLost(err);
    if (navigationRef.isReady()) {
      navigationRef.reset({
        index: 0,
        routes: [{ name: next, params: { notice: { kind: 'error', message: err.message } } }],
      });
    }
  } finally {
    handlingSessionLoss = false;
  }
}
const Tab = createBottomTabNavigator();

function TabBar({ state, navigation }) {
  const darkMode = useBabyStore((s) => s.darkMode);
  const C = darkMode ? DARK_COLORS : COLORS;
  const insets = useSafeAreaInsets();

  const tabs = [
    { name: 'Home', label: 'Home', icon: 'home-outline', iconActive: 'home' },
    { name: 'Feeding', label: 'Feed', icon: 'nutrition-outline', iconActive: 'nutrition' },
    { name: 'Sleep', label: 'Sleep', icon: 'moon-outline', iconActive: 'moon' },
    { name: 'Reports', label: 'Reports', icon: 'bar-chart-outline', iconActive: 'bar-chart' },
    { name: 'More', label: 'More', icon: 'grid-outline', iconActive: 'grid' },
  ];

  return (
    <View
      style={[
        styles.tabBar,
        SHADOW.lg,
        { backgroundColor: C.surface, borderColor: C.border, bottom: (insets.bottom || 0) + 12 },
      ]}
    >
      {state.routes.map((route, index) => {
        const isFocused = state.index === index;
        const tab = tabs[index];

        return (
          <TouchableOpacity
            key={route.key}
            style={[styles.tabItem, isFocused && styles.tabItemActive]}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityState={isFocused ? { selected: true } : {}}
            accessibilityLabel={tab.label}
            onPress={() => {
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });
              if (!isFocused && !event.defaultPrevented) {
                navigation.navigate(route.name);
              }
            }}
          >
            {isFocused ? (
              <GradientView colors={GRADIENTS.brand} style={styles.activePill}>
                <Ionicons name={tab.iconActive} size={20} color={COLORS.white} />
                <Text style={styles.activeLabel} numberOfLines={1} adjustsFontSizeToFit {...TIGHT_TEXT}>{tab.label}</Text>
              </GradientView>
            ) : (
              <View style={styles.idleItem}>
                <Ionicons name={tab.icon} size={20} color={C.textSecondary} />
                <Text style={[styles.idleLabel, { color: C.textSecondary }]} numberOfLines={1} adjustsFontSizeToFit {...TIGHT_TEXT}>{tab.label}</Text>
              </View>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function MainTabs() {
  return (
    <Tab.Navigator
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Feeding" component={FeedingScreen} />
      <Tab.Screen name="Sleep" component={SleepScreen} />
      <Tab.Screen name="Reports" component={SummaryScreen} />
      <Tab.Screen name="More" component={MoreScreen} />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  const darkMode = useBabyStore((s) => s.darkMode);
  const C = darkMode ? DARK_COLORS : COLORS;

  useEffect(() => {
    setUnauthorizedHandler(onSessionLost);
    // Send changes made offline whenever the app comes back to the foreground.
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') flushPending().catch(() => {});
    });
    return () => {
      setUnauthorizedHandler(null);
      sub.remove();
    };
  }, []);

  return (
    <NavigationContainer ref={navigationRef}>
      <Stack.Navigator screenOptions={{ headerShown: false, cardStyle: { backgroundColor: C.background } }}>
        <Stack.Screen name="Splash" component={SplashScreen} />
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="Register" component={RegisterScreen} />
        <Stack.Screen name="VerifyOtp" component={VerifyOtpScreen} />
        <Stack.Screen name="ClientVerify" component={ClientVerifyScreen} />
        <Stack.Screen name="Onboarding" component={OnboardingScreen} />
        <Stack.Screen name="Main" component={MainTabs} />
        <Stack.Screen name="Diaper" component={DiaperScreen} options={{ presentation: 'modal' }} />
        <Stack.Screen name="Medicine" component={MedicineScreen} options={{ presentation: 'modal' }} />
        <Stack.Screen name="Vaccination" component={VaccinationScreen} options={{ presentation: 'modal' }} />
        <Stack.Screen name="Summary" component={SummaryScreen} options={{ presentation: 'modal' }} />
        <Stack.Screen name="Settings" component={SettingsScreen} options={{ presentation: 'modal' }} />
        <Stack.Screen name="EditBaby" component={EditBabyScreen} options={{ presentation: 'modal' }} />
        <Stack.Screen name="Growth" component={GrowthScreen} />
        <Stack.Screen name="Temperature" component={TemperatureScreen} />
        <Stack.Screen name="Breathing" component={BreathingScreen} />
        <Stack.Screen name="Skin" component={SkinScreen} />
        <Stack.Screen name="Milestones" component={MilestonesScreen} />
        <Stack.Screen name="HealthAlerts" component={HealthAlertsScreen} />
        <Stack.Screen name="Notifications" component={NotificationsScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  // Brand UI: a white bar with a label under every icon; the active tab is a gradient pill.
  tabBar: {
    position: 'absolute',
    left: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 28,
    borderWidth: 1,
    paddingVertical: 6,
    paddingHorizontal: 6,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
  },
  tabItemActive: {},
  activePill: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    width: '100%',
    maxWidth: 72,
    minHeight: 52,
    paddingHorizontal: 4,
    paddingVertical: 4,
    borderRadius: 26,
  },
  activeLabel: {
    color: COLORS.white,
    fontSize: FONT_SIZE.xs,
    fontWeight: FONT_WEIGHT.bold,
  },
  idleItem: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    minHeight: 52,
    paddingHorizontal: 2,
  },
  idleLabel: {
    fontSize: FONT_SIZE.xs,
    fontWeight: FONT_WEIGHT.semibold,
  },
});
