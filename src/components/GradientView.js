import React, { useId } from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';

/**
 * A View with a linear-gradient background, drawn with react-native-svg
 * (already a dependency, so no extra native module is needed).
 *
 * colors: [from, to]  ·  start/end: {x, y} in 0..1 (default: top-left → bottom-right)
 * Shadows in `style` stay on the outer view, so they still render on iOS.
 * bubbles: draw soft decorative circles, clipped to the rounded corners.
 */
export default function GradientView({
  colors,
  start = { x: 0, y: 0 },
  end = { x: 1, y: 1 },
  bubbles = false,
  style,
  children,
  ...rest
}) {
  const id = `g${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const flat = StyleSheet.flatten(style) || {};
  const radius = flat.borderRadius || 0;

  return (
    <View style={style} {...rest}>
      <View style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: 'hidden' }]} pointerEvents="none">
        <Svg width="100%" height="100%">
          <Defs>
            <LinearGradient id={id} x1={start.x} y1={start.y} x2={end.x} y2={end.y}>
              <Stop offset="0" stopColor={colors[0]} />
              <Stop offset="1" stopColor={colors[1]} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
        </Svg>
        {bubbles ? <Bubbles /> : null}
      </View>
      {children}
    </View>
  );
}

/** Soft translucent circles used as decoration on gradient cards. */
export function Bubbles({ color = 'rgba(255,255,255,0.14)' }) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={[styles.bubble, { width: 180, height: 180, top: -70, right: -50, backgroundColor: color }]} />
      <View style={[styles.bubble, { width: 110, height: 110, bottom: -40, left: -30, backgroundColor: color }]} />
      <View style={[styles.bubble, { width: 46, height: 46, top: 24, right: 110, backgroundColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  bubble: { position: 'absolute', borderRadius: 999 },
});
