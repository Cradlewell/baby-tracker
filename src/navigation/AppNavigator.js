import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useBabyStore } from '../store/useBabyStore';
import { COLORS, DARK_COLORS } from '../constants/colors';
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

function TabBar({ state, descriptors, navigation }) {
  const darkMode = useBabyStore((s) => s.darkMode);
  const C = darkMode ? DARK_COLORS : COLORS;
  const insets = useSafeAreaInsets();

  const tabs = [
    { name: 'Home', label: 'Home', icon: 'home-outline', iconActive: 'home' },
    { name: 'Feeding', label: 'Feed', icon: 'nutrition-outline', iconActive: 'nutrition' },
    { name: 'Sleep', label: 'Sleep', icon: 'moon-outline', iconActive: 'moon' },
    { name: 'Growth', label: 'Growth', icon: 'stats-chart-outline', iconActive: 'stats-chart' },
    { name: 'More', label: 'More', icon: 'apps-outline', iconActive: 'apps' },
  ];

  return (
    <View
      style={[
        styles.tabBar,
        {
          backgroundColor: C.surface,
          borderTopColor: C.border,
          paddingBottom: insets.bottom || 6,
        },
      ]}
    >
      {state.routes.map((route, index) => {
        const isFocused = state.index === index;
        const tab = tabs[index];

        return (
          <TouchableOpacity
            key={route.key}
            style={styles.tabItem}
            activeOpacity={0.7}
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
            <View style={styles.tabInner}>
              <View style={[
                styles.tabIconWrap,
                isFocused && { backgroundColor: C.primaryLight },
              ]}>
                <Ionicons
                  name={isFocused ? tab.iconActive : tab.icon}
                  size={20}
                  color={isFocused ? C.primary : C.textMuted}
                />
              </View>
              <Text style={[styles.tabLabel, { color: isFocused ? C.primary : C.textMuted }]}>
                {tab.label}
              </Text>
            </View>
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
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 6,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
  },
  tabInner: {
    alignItems: 'center',
    paddingVertical: 2,
    gap: 3,
    minHeight: 44,
    justifyContent: 'center',
  },
  tabIconWrap: {
    width: 46,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: FONT_WEIGHT.medium,
  },
});
