import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBabyStore } from '../store/useBabyStore';
import { getDeviceId } from '../lib/deviceId';
import { COLORS } from '../constants/colors';
import { FONT_SIZE, FONT_WEIGHT } from '../constants/theme';

export default function SplashScreen({ navigation }) {
  const load = useBabyStore((s) => s.load);
  const insets = useSafeAreaInsets();

  const scale = useRef(new Animated.Value(0.7)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const tagOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Promise.all([load(), getDeviceId()]).then(() => {
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
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Animated.View style={[styles.logoWrap, { opacity, transform: [{ scale }] }]}>
        <Image
          source={require('../../assets/logo.png')}
          style={styles.logoImage}
          resizeMode="contain"
        />
        <Text style={styles.appName}>Cradlewell Bloom</Text>
      </Animated.View>
      <Animated.Text style={[styles.tagline, { opacity: tagOpacity }]}>
        Your comfort is our care
      </Animated.Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  logoWrap: {
    alignItems: 'center',
    gap: 16,
  },
  logoImage: {
    width: 120,
    height: 120,
  },
  appName: {
    fontSize: 32,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.primary,
    letterSpacing: -0.5,
  },
  tagline: {
    fontSize: FONT_SIZE.md,
    color: COLORS.textSecondary,
    fontWeight: FONT_WEIGHT.light,
    letterSpacing: 0.3,
  },
});
