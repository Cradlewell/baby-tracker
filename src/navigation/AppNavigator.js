import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useBabyStore } from '../store/useBabyStore';
import { COLORS, DARK_COLORS, GRADIENTS } from '../constants/colors';
import GradientView from '../components/GradientView';
import { FONT_SIZE, FONT_WEIGHT, RADIUS, SHADOW } from '../constants/theme';

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

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

function TabBar({ state, navigation }) {
  const darkMode = useBabyStore((s) => s.darkMode);
  const C = darkMode ? DARK_COLORS : COLORS;
  const insets = useSafeAreaInsets();

  const tabs = [
    { name: 'Home', label: 'Home', icon: 'home-outline', iconActive: 'home' },
    { name: 'Feeding', label: 'Feed', icon: 'nutrition-outline', iconActive: 'nutrition' },
    { name: 'Sleep', label: 'Sleep', icon: 'moon-outline', iconActive: 'moon' },
    { name: 'Growth', label: 'Growth', icon: 'stats-chart-outline', iconActive: 'stats-chart' },
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
              <GradientView colors={GRADIENTS.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.activePill}>
                <Ionicons name={tab.iconActive} size={18} color={COLORS.white} />
                <Text style={styles.activeLabel} numberOfLines={1}>{tab.label}</Text>
              </GradientView>
            ) : (
              <View style={styles.idleIcon}>
                <Ionicons name={tab.icon} size={22} color={C.textMuted} />
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
      <Tab.Screen name="Growth" component={GrowthScreen} />
      <Tab.Screen name="More" component={MoreScreen} />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  const darkMode = useBabyStore((s) => s.darkMode);
  const C = darkMode ? DARK_COLORS : COLORS;

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false, cardStyle: { backgroundColor: C.background } }}>
        <Stack.Screen name="Splash" component={SplashScreen} />
        <Stack.Screen name="Onboarding" component={OnboardingScreen} />
        <Stack.Screen name="Main" component={MainTabs} />
        <Stack.Screen name="Diaper" component={DiaperScreen} options={{ presentation: 'modal' }} />
        <Stack.Screen name="Medicine" component={MedicineScreen} options={{ presentation: 'modal' }} />
        <Stack.Screen name="Vaccination" component={VaccinationScreen} options={{ presentation: 'modal' }} />
        <Stack.Screen name="Summary" component={SummaryScreen} options={{ presentation: 'modal' }} />
        <Stack.Screen name="Settings" component={SettingsScreen} options={{ presentation: 'modal' }} />
        <Stack.Screen name="EditBaby" component={EditBabyScreen} options={{ presentation: 'modal' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: RADIUS.full,
    borderWidth: 1,
    padding: 7,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  tabItemActive: { flex: 1.7 },
  activePill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 48,
    alignSelf: 'stretch',
    borderRadius: RADIUS.full,
    paddingHorizontal: 12,
  },
  activeLabel: {
    color: COLORS.white,
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.bold,
  },
  idleIcon: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
