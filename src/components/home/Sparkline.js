import React, { useState, useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';

export default function Sparkline({
  data = [],
  width: customWidth,
  height: customHeight,
  color = '#00D084',
  strokeWidth = 2,
  smoothing = 0,
  style,
}) {
  const [layout, setLayout] = useState({ width: 0, height: 0 });

  const handleLayout = (event) => {
    const { width, height } = event.nativeEvent.layout;
    if (
      Math.round(width) !== Math.round(layout.width) ||
      Math.round(height) !== Math.round(layout.height)
    ) {
      setLayout({ width, height });
    }
  };

  // Mean average smoothing of X surrounding values (e.g. radius = smoothing)
  const smoothedData = useMemo(() => {
    if (!data || data.length < 2 || !smoothing || smoothing <= 0) {
      return data;
    }
    const len = data.length;
    const radius = Math.floor(smoothing);

    return data.map((_, i) => {
      const start = Math.max(0, i - radius);
      const end = Math.min(len - 1, i + radius);
      let sum = 0;
      let count = 0;
      for (let j = start; j <= end; j++) {
        sum += data[j];
        count++;
      }
      return sum / count;
    });
  }, [data, smoothing]);

  if (!smoothedData || smoothedData.length < 2) {
    return <View style={[styles.container, style]} onLayout={handleLayout} />;
  }

  const effectiveWidth = customWidth || layout.width || 100;
  const effectiveHeight = customHeight || layout.height || 36;

  const min = Math.min(...smoothedData);
  const max = Math.max(...smoothedData);
  const range = max - min === 0 ? 1 : max - min;
  const paddingY = 4;
  const usableHeight = Math.max(effectiveHeight - paddingY * 2, 2);

  const points = smoothedData.map((val, index) => {
    const x = (index / (smoothedData.length - 1)) * effectiveWidth;
    const y = effectiveHeight - paddingY - ((val - min) / range) * usableHeight;
    return { x, y };
  });

  const pathD = points.reduce((acc, point, index) => {
    return index === 0
      ? `M ${point.x.toFixed(2)} ${point.y.toFixed(2)}`
      : `${acc} L ${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
  }, '');

  return (
    <View
      style={[
        styles.container,
        customWidth ? { width: customWidth } : { flex: 1, width: '100%' },
        customHeight ? { height: customHeight } : { height: '100%' },
        style,
      ]}
      onLayout={handleLayout}
    >
      {effectiveWidth > 0 && effectiveHeight > 0 && (
        <Svg
          width="100%"
          height="100%"
          viewBox={`0 0 ${effectiveWidth} ${effectiveHeight}`}
          preserveAspectRatio="none"
        >
          <Path
            d={pathD}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </Svg>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
});
