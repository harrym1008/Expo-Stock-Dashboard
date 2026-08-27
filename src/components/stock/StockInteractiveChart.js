import React, { useState, useMemo, useRef, useCallback } from 'react';
import { View, StyleSheet, PanResponder } from 'react-native';
import Svg, { Path, Line, Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import AppText from '../common/AppText';
import { useTheme } from '../../context/ThemeContext';
import { spacing, borderRadius } from '../../constants/theme';

/**
 * Calculates neat tick values where the gap is strictly in {1, 2, 4, 5} * 10^n
 * and all ticks are exact multiples of the step.
 */
export function calculateNeatTicks(minVal, maxVal, targetIntervals = 4) {
  if (minVal == null || maxVal == null || isNaN(minVal) || isNaN(maxVal)) {
    return { ticks: [], step: 1, yMin: 0, yMax: 100 };
  }

  let range = maxVal - minVal;
  if (range <= 0) {
    const pad = Math.abs(minVal) * 0.05 || 1;
    minVal -= pad;
    maxVal += pad;
    range = maxVal - minVal;
  }

  const rawStep = range / targetIntervals;
  const exponent = Math.floor(Math.log10(rawStep));
  const powerOf10 = Math.pow(10, exponent);

  // Candidate multipliers: 1, 2, 4, 5, 10
  const candidateMultipliers = [1, 2, 4, 5, 10];
  const candidates = candidateMultipliers.map((m) => {
    const s = parseFloat((m * powerOf10).toPrecision(10));
    const firstTick = Math.ceil((minVal - 1e-9) / s) * s;
    const lastTick = Math.floor((maxVal + 1e-9) / s) * s;
    const count = Math.round((lastTick - firstTick) / s) + 1;
    return { multiplier: m, step: s, count, firstTick, lastTick };
  });

  // Pick the candidate step that produces between 3 and 6 ticks, closest to target
  let best = candidates.find((c) => c.count >= 3 && c.count <= 6);
  if (!best) {
    best = candidates.reduce((prev, curr) =>
      Math.abs(curr.count - targetIntervals) < Math.abs(prev.count - targetIntervals) ? curr : prev
    );
  }

  const chosenStep = best.step;
  const ticks = [];
  const start = Math.ceil((minVal - 1e-9) / chosenStep) * chosenStep;
  const end = Math.floor((maxVal + 1e-9) / chosenStep) * chosenStep;

  const count = Math.max(0, Math.round((end - start) / chosenStep) + 1);
  for (let i = 0; i < count; i++) {
    const val = parseFloat((start + i * chosenStep).toPrecision(10));
    if (val >= minVal - 1e-6 && val <= maxVal + 1e-6) {
      ticks.push(val);
    }
  }

  return {
    ticks,
    step: chosenStep,
    yMin: minVal,
    yMax: maxVal,
  };
}

/**
 * Formats tick numbers cleanly according to their precision.
 */
export function formatTickLabel(value, step) {
  if (value == null || isNaN(value)) return '';
  if (step >= 1) {
    if (Number.isInteger(value)) {
      return value.toLocaleString('en-US');
    }
    return value.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
  const decimals = Math.min(4, Math.max(0, -Math.floor(Math.log10(step) + 1e-9)));
  return value.toFixed(decimals);
}

/**
 * Formats candle timestamp according to the selected timeframe.
 */
export function formatCandleDate(timestamp, timeframe = '1D') {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  if (isNaN(date.getTime())) return '';

  if (timeframe === '1H') {
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  }
  if (timeframe === '1D') {
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  }
  if (timeframe === '1W') {
    const day = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    const time = date.toLocaleTimeString('en-US', { hour: 'numeric', hour12: true });
    return `${day}, ${time}`;
  }
  if (timeframe === '3M' || timeframe === '1Y') {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }
  if (timeframe === '5Y' || timeframe === 'ALL') {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      year: 'numeric',
    });
  }
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function StockInteractiveChart({
  points = [],
  sparkline = [],
  timeframe = '1D',
  color = '#00D084',
  currency = '$',
  onScrub,
  onScrubEnd,
  style,
}) {
  const { theme, isDark } = useTheme();
  const [layout, setLayout] = useState({ width: 0, height: 0 });
  const [scrubIndex, setScrubIndex] = useState(null);
  const [badgeWidth, setBadgeWidth] = useState(74);

  const containerRef = useRef(null);
  const containerPageXRef = useRef(0);

  // Unify points array: if points with { time, price } exist, use them; else fallback to sparkline
  const chartPoints = useMemo(() => {
    if (Array.isArray(points) && points.length > 0) {
      return points.filter((p) => typeof p?.price === 'number' && !isNaN(p.price));
    }
    if (Array.isArray(sparkline) && sparkline.length > 0) {
      const now = Date.now();
      const stepMs = 60 * 1000;
      return sparkline.map((price, idx) => ({
        time: now - (sparkline.length - 1 - idx) * stepMs,
        price,
      }));
    }
    return [];
  }, [points, sparkline]);

  const prices = useMemo(() => chartPoints.map((p) => p.price), [chartPoints]);

  const { minVal, maxVal, neatY } = useMemo(() => {
    if (prices.length === 0) {
      return { minVal: 0, maxVal: 100, neatY: { ticks: [], step: 1, yMin: 0, yMax: 100 } };
    }
    const rawMin = Math.min(...prices);
    const rawMax = Math.max(...prices);
    const padding = (rawMax - rawMin) * 0.06 || (rawMin === 0 ? 1 : Math.abs(rawMin) * 0.02);
    const paddedMin = rawMin - padding;
    const paddedMax = rawMax + padding;

    const calculated = calculateNeatTicks(paddedMin, paddedMax, 4);
    return {
      minVal: paddedMin,
      maxVal: paddedMax,
      neatY: calculated,
    };
  }, [prices]);

  // Dynamic adaptive Y-axis column width based on the formatted tick lengths
  const Y_AXIS_WIDTH = useMemo(() => {
    if (!neatY.ticks || neatY.ticks.length === 0) return 30;
    const maxChars = Math.max(
      ...neatY.ticks.map((t) => formatTickLabel(t, neatY.step).length)
    );
    // Dynamic width: ~7.2px per character + 8px right padding
    return Math.max(26, Math.ceil(maxChars * 7.2 + 8));
  }, [neatY.ticks, neatY.step]);

  const paddingY = 16;
  const chartWidth = Math.max(10, layout.width - Y_AXIS_WIDTH);
  const chartHeight = Math.max(10, layout.height);
  const usableHeight = Math.max(10, chartHeight - paddingY * 2);

  const yRange = maxVal - minVal === 0 ? 1 : maxVal - minVal;

  const getYCoordinate = useCallback(
    (price) => {
      const fraction = (price - minVal) / yRange;
      return chartHeight - paddingY - fraction * usableHeight;
    },
    [chartHeight, minVal, yRange, usableHeight]
  );

  const getXCoordinate = useCallback(
    (index) => {
      if (chartPoints.length <= 1) return 0;
      return (index / (chartPoints.length - 1)) * chartWidth;
    },
    [chartPoints.length, chartWidth]
  );

  // Compute SVG line path and area gradient path
  const { linePath, areaPath } = useMemo(() => {
    if (chartPoints.length < 2 || chartWidth <= 0 || chartHeight <= 0) {
      return { linePath: '', areaPath: '' };
    }

    let dLine = '';
    chartPoints.forEach((p, idx) => {
      const x = getXCoordinate(idx);
      const y = getYCoordinate(p.price);
      dLine += idx === 0 ? `M ${x.toFixed(2)} ${y.toFixed(2)}` : ` L ${x.toFixed(2)} ${y.toFixed(2)}`;
    });

    const lastX = getXCoordinate(chartPoints.length - 1);
    const firstX = getXCoordinate(0);
    const bottomY = chartHeight;

    const dArea = `${dLine} L ${lastX.toFixed(2)} ${bottomY.toFixed(2)} L ${firstX.toFixed(2)} ${bottomY.toFixed(2)} Z`;

    return { linePath: dLine, areaPath: dArea };
  }, [chartPoints, chartWidth, chartHeight, getXCoordinate, getYCoordinate]);

  // Touch & Scrub Handler with global screen coordinates tracking
  const updateTouch = useCallback(
    (evt, gestureState) => {
      if (!chartPoints || chartPoints.length === 0 || chartWidth <= 0) return;
      const pageX = evt?.nativeEvent?.pageX ?? gestureState?.moveX ?? 0;
      const localX = pageX - containerPageXRef.current;
      const clampedX = Math.max(0, Math.min(chartWidth, localX));
      const ratio = clampedX / chartWidth;
      const idx = Math.round(ratio * (chartPoints.length - 1));
      const clampedIdx = Math.max(0, Math.min(chartPoints.length - 1, idx));

      setScrubIndex(clampedIdx);

      if (onScrub) {
        const curr = chartPoints[clampedIdx];
        const prev = clampedIdx > 0 ? chartPoints[clampedIdx - 1] : null;
        onScrub(curr, prev);
      }
    },
    [chartPoints, chartWidth, onScrub]
  );

  const handleTouchEnd = useCallback(() => {
    setScrubIndex(null);
    if (onScrubEnd) {
      onScrubEnd();
    }
  }, [onScrubEnd]);

  // PanResponder to capture scrubbing seamlessly even when dragging over external buttons
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onStartShouldSetPanResponderCapture: () => true,
        onMoveShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponderCapture: () => true,
        onPanResponderTerminationRequest: () => false,
        onShouldBlockNativeResponder: () => true,
        onPanResponderGrant: (evt, gestureState) => {
          containerRef.current?.measureInWindow?.((x) => {
            if (typeof x === 'number') {
              containerPageXRef.current = x;
            }
          });
          updateTouch(evt, gestureState);
        },
        onPanResponderMove: (evt, gestureState) => {
          updateTouch(evt, gestureState);
        },
        onPanResponderRelease: () => {
          handleTouchEnd();
        },
        onPanResponderTerminate: () => {
          handleTouchEnd();
        },
      }),
    [updateTouch, handleTouchEnd]
  );

  const handleLayout = (event) => {
    const { width, height } = event.nativeEvent.layout;
    if (
      Math.round(width) !== Math.round(layout.width) ||
      Math.round(height) !== Math.round(layout.height)
    ) {
      setLayout({ width, height });
    }
    containerRef.current?.measureInWindow?.((x) => {
      if (typeof x === 'number') {
        containerPageXRef.current = x;
      }
    });
  };

  // Active scrubbed point data
  const activePoint = scrubIndex !== null && chartPoints[scrubIndex] ? chartPoints[scrubIndex] : null;
  const activeX = activePoint ? getXCoordinate(scrubIndex) : null;
  const activeY = activePoint ? getYCoordinate(activePoint.price) : null;

  const dateText = activePoint ? formatCandleDate(activePoint.time, timeframe) : '';

  const gridLineColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)';
  const crosshairColor = isDark ? 'rgba(255, 255, 255, 0.45)' : 'rgba(0, 0, 0, 0.4)';

  return (
    <View
      ref={containerRef}
      style={[styles.container, style]}
      onLayout={handleLayout}
      {...panResponder.panHandlers}
    >
      {layout.width > 0 && layout.height > 0 && chartPoints.length > 1 && (
        <View style={styles.chartWrapper}>
          {/* Main SVG Area */}
          <Svg
            width={chartWidth}
            height={chartHeight}
            style={styles.svg}
          >
            <Defs>
              <LinearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0%" stopColor={color} stopOpacity={isDark ? "0.22" : "0.15"} />
                <Stop offset="100%" stopColor={color} stopOpacity="0.0" />
              </LinearGradient>
            </Defs>

            {/* Horizontal Gridlines aligned strictly to neat ticks */}
            {neatY.ticks.map((tickVal) => {
              const tickY = getYCoordinate(tickVal);
              return (
                <Line
                  key={`grid-${tickVal}`}
                  x1={0}
                  y1={tickY}
                  x2={chartWidth}
                  y2={tickY}
                  stroke={gridLineColor}
                  strokeWidth={1}
                  strokeDasharray="4,4"
                />
              );
            })}

            {/* Gradient Fill under curve */}
            {areaPath ? <Path d={areaPath} fill="url(#chartGradient)" /> : null}

            {/* Main Sparkline Curve */}
            {linePath ? (
              <Path
                d={linePath}
                fill="none"
                stroke={color}
                strokeWidth={2.2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {/* Active Scrub Vertical Crosshair and Intersection Dot */}
            {activePoint && activeX !== null && activeY !== null && (
              <>
                {/* Vertical Hairline */}
                <Line
                  x1={activeX}
                  y1={0}
                  x2={activeX}
                  y2={chartHeight}
                  stroke={crosshairColor}
                  strokeWidth={1.2}
                  strokeDasharray="3,3"
                />

                {/* Outer glowing halo on intersection */}
                <Circle
                  cx={activeX}
                  cy={activeY}
                  r={7}
                  fill={color}
                  fillOpacity={0.3}
                />

                {/* Inner crisp intersection dot */}
                <Circle
                  cx={activeX}
                  cy={activeY}
                  r={3.8}
                  fill={color}
                  stroke={isDark ? '#000000' : '#FFFFFF'}
                  strokeWidth={1.8}
                />
              </>
            )}
          </Svg>

          {/* Top Date-Time Pill: Always at top, centered on the line, clamped at borders */}
          {activePoint && activeX !== null && (
            <View
              pointerEvents="none"
              onLayout={(e) => {
                const w = e.nativeEvent.layout.width;
                if (w && Math.abs(w - badgeWidth) > 1) {
                  setBadgeWidth(w);
                }
              }}
              style={[
                styles.candleDateBadge,
                {
                  backgroundColor: isDark ? '#1C212B' : '#E2E8F0',
                  borderColor: isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.12)',
                  top: 6,
                  left: Math.max(4, Math.min(chartWidth - badgeWidth - 4, activeX - badgeWidth / 2)),
                },
              ]}
            >
              <AppText bold style={[styles.candleDateText, { color: theme.textPrimary }]}>
                {dateText}
              </AppText>
            </View>
          )}

          {/* Right-Hand Y-Axis Labels Column */}
          <View style={[styles.yAxisLabelsColumn, { width: Y_AXIS_WIDTH, borderLeftColor: gridLineColor }]}>
            {neatY.ticks.map((tickVal) => {
              const tickY = getYCoordinate(tickVal);
              return (
                <View
                  key={`label-${tickVal}`}
                  style={[
                    styles.yLabelItem,
                    {
                      top: Math.max(2, Math.min(chartHeight - 16, tickY - 7)),
                    },
                  ]}
                >
                  <AppText style={[styles.yAxisText, { color: theme.textMuted }]}>
                    {formatTickLabel(tickVal, neatY.step)}
                  </AppText>
                </View>
              );
            })}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  chartWrapper: {
    flex: 1,
    flexDirection: 'row',
    position: 'relative',
  },
  svg: {
    overflow: 'visible',
  },
  candleDateBadge: {
    position: 'absolute',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 3,
    zIndex: 10,
  },
  candleDateText: {
    fontSize: 11,
    letterSpacing: 0.2,
  },
  yAxisLabelsColumn: {
    position: 'relative',
    height: '100%',
    borderLeftWidth: 1,
  },
  yLabelItem: {
    position: 'absolute',
    right: 4,
    alignItems: 'flex-end',
  },
  yAxisText: {
    fontSize: 11.5,
    fontWeight: '600',
  },
});
