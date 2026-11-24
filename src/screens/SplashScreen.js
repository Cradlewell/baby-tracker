import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBabyStore } from '../store/useBabyStore';
import { useFeedingStore } from '../store/useFeedingStore';
import { useSleepStore } from '../store/useSleepStore';
import { COLORS, GRADIENTS } from '../constants/colors';
import GradientView from '../components/GradientView';
import { FONT_SIZE, FONT_WEIGHT } from '../constants/theme';

export default function SplashScreen({ navigation }) {
  const load = useBabyStore((s) => s.load);
  const insets = useSafeAreaInsets();

  const scale = useRef(new Animated.Value(0.7)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const tagOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Promise.all([
      load(),
      useFeedingStore.getState().restoreSession(),
      useSleepStore.getState().restoreSession(),
    ]).then(() => {
      Animated.sequence([
        Animated.parallel([
          Animated.spring(scale, { toValue: 1, useNativeDriver: true, tension: 60, friction: 8 }),
          Animated.timing(opacity, { toValue: 1, duration: 500, useNativeDriver: true }),
        ]),
        Animated.timing(tagOpacity, { toValue: 1, duration: 400, useNativeDriver: true, delay: 100 }),
      ]).start(() => {
        setTimeout(() => {
          const { onboardingDone } = useBabyStore.getState();
          navigation.replace(onboardingDone ? 'Main' : 'Onboarding');
        }, 1200);
      });
    });
  }, []);

  return (
    <GradientView colors={GRADIENTS.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} bubbles style={[styles.container, { paddingTop: insets.top }]}>
      <Animated.View style={[styles.logoWrap, { opacity, transform: [{ scale }] }]}>
        <View style={styles.logoHalo}>
          <View style={styles.logoCard}>
            <Image
              source={require('../../assets/logo.png')}
              style={styles.logoImage}
              resizeMode="contain"
            />
          </View>
        </View>
        <Text style={styles.appName}>Cradlewell Bloom</Text>
      </Animated.View>
      <Animated.View style={[styles.taglinePill, { opacity: tagOpacity }]}>
        <Text style={styles.tagline}>Your comfort is our care</Text>
      </Animated.View>
    </GradientView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 22,
  },
  logoWrap: {
    alignItems: 'center',
    gap: 22,
  },
  logoHalo: {
    padding: 14,
    borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  logoCard: {
    width: 136,
    height: 136,
    borderRadius: 46,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#3A1F8F',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.3,
    shadowRadius: 28,
    elevation: 14,
  },
  logoImage: {
    width: 96,
    height: 96,
  },
  appName: {
    fontSize: 34,
    fontWeight: FONT_WEIGHT.heavy,
    color: COLORS.white,
    letterSpacing: -0.8,
  },
  taglinePill: {
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  tagline: {
    fontSize: FONT_SIZE.md,
    color: COLORS.white,
    fontWeight: FONT_WEIGHT.semibold,
    letterSpacing: 0.3,
  },
});
