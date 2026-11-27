import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useBabyStore } from './src/store/useBabyStore';
import AppNavigator from './src/navigation/AppNavigator';
import ErrorBoundary from './src/components/ErrorBoundary';
import { installCrashReporter } from './src/lib/crashReporter';

// Errors nothing else caught are reported to the server before the app closes.
installCrashReporter();
import { COLORS, DARK_COLORS } from './src/constants/colors';
import { MAX_CONTENT_WIDTH } from './src/constants/theme';

export default function App() {
  const darkMode = useBabyStore((s) => s.darkMode);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style={darkMode ? 'light' : 'dark'} />
        {/* On tablets and wide screens the app sits in a centred column of comfortable width. */}
        <View style={{ flex: 1, alignItems: 'center', backgroundColor: (darkMode ? DARK_COLORS : COLORS).background }}>
          <View style={{ flex: 1, width: '100%', maxWidth: MAX_CONTENT_WIDTH }}>
            <ErrorBoundary>
              <AppNavigator />
            </ErrorBoundary>
          </View>
        </View>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
