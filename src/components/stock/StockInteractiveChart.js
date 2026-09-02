import React, { useState, useMemo, useRef, useCallback } from 'react';
import { View, StyleSheet, PanResponder } from 'react-native';
import Svg, { Path, Line, Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import AppText from '../common/AppText';
import { useTheme } from '../../context/ThemeContext';
import { borderRadius } from '../../constants/theme';

// Calculate neat tick values for the Y-axis given a min/max range and a target number of intervals
// Example input (0.123, 0.987, 4) => output [0.2, 0.4, 0.6, 0.8]
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

// Format tick label for display, with decimal places tending to step size
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
  const decimals = Math.min(6, Math.max(0, -Math.floor(Math.log10(step) + 1e-9)));
  return value.toFixed(decimals);
}

// Formats candle timestamp while scrubbing into human readable date
export function formatCandleDate(timestamp, timeframe = '1D') {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  if (isNaN(date.getTime())) return '';

  if (timeframe === '1H' || timeframe === '1D') {
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

// Static portion of the chart (gridlines, sparkline, gradient fill) that does not change when scrubbing
const StaticChart = React.memo(function StaticChart({
  chartWidth,
  chartHeight,
  linePath,
  areaPath,
  color,
  isDark,
  gridLineColor,
  gridLines,
}) {
  return (
    <Svg width={chartWidth} height={chartHeight} style={styles.svg}>
      <Defs>
        <LinearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor={color} stopOpacity={isDark ? "0.22" : "0.15"} />
          <Stop offset="100%" stopColor={color} stopOpacity="0.0" />
        </LinearGradient>
      </Defs>

      {/* Horizontal Gridlines aligned strictly to neat ticks */}
      {gridLines.map(({ key, y }) => (
        <Line
          key={key}
          x1={0}
          y1={y}
          x2={chartWidth}
          y2={y}
          stroke={gridLineColor}
          strokeWidth={1}
          strokeDasharray="4,4"
        />
      ))}

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
    </Svg>
  );
});

// Scrub overlay, updates upon scrubbing (vertical hairline, intersection dot, halo) ... does not re-render the static chart
const ScrubOverlay = React.memo(function ScrubOverlay({
  activeX,
  activeY,
  chartWidth,
  chartHeight,
  color,
  isDark,
  crosshairColor,
  visible,
}) {
  if (!visible || activeX === null || activeY === null) return null;

  return (
    <Svg
      width={chartWidth}
      height={chartHeight}
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
    >
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
    </Svg>
  );
});

// Create the full interactive touch-scrubbable SVG chart with static and overlay layers 
function StockInteractiveChart({
  points = [],
  sparkline = [],
  timeframe = '1D',
  color = '#00D084',
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

  // Stable refs for callbacks so the PanResponder doesnt rebuild due to prop changes
  const onScrubRef = useRef(onScrub);
  const onScrubEndRef = useRef(onScrubEnd);
  onScrubRef.current = onScrub;
  onScrubEndRef.current = onScrubEnd;


  // Throttle parent onScrub callback: fire at most once per 33ms (~30fps)
  // to avoid cascading parent re-renders on every touch-move frame
  const lastScrubCallTimeRef = useRef(0);
  const pendingScrubRafRef = useRef(null);

  // Unify points array: if points with { time, price } exist, use them; else fallback to sparkline
  const chartPoints = useMemo(() => {
    if (Array.isArray(points) && points.length > 0) {
      return points.filter((p) => p?.price > 0);
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

  // Extract just the price axis values
  const prices = useMemo(() => chartPoints.map((p) => p.price), [chartPoints]);

  // Y-axis range and the neat tick layout for the grid/labels
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
  const yAxisWidth = useMemo(() => {
    if (!neatY.ticks || neatY.ticks.length === 0) return 30;
    const maxChars = Math.max(
      ...neatY.ticks.map((t) => formatTickLabel(t, neatY.step).length)
    );
    return Math.max(26, Math.ceil(maxChars * 7.2 + 8));
  }, [neatY.ticks, neatY.step]);

  
  // Calculate usable height and chart region with different vertical pardding
  const paddingTop = 16;
  const paddingBottom = 8;
  const chartWidth = Math.max(10, layout.width - yAxisWidth);
  const chartHeight = Math.max(10, layout.height);
  const usableHeight = Math.max(10, chartHeight - paddingTop - paddingBottom);
  const yRange = maxVal - minVal === 0 ? 1 : maxVal - minVal;  // Prevent divide by zero if all prices are the same

  // Pre-compute coordinate lookup arrays so scrub doesn't call functions per-frame
  const { xCoords, yCoords } = useMemo(() => {
    const len = chartPoints.length;
    if (len === 0) return { xCoords: [], yCoords: [] };

    const xs = new Float64Array(len);
    const ys = new Float64Array(len);
    const divisor = len <= 1 ? 1 : len - 1;

    for (let i = 0; i < len; i++) {
      xs[i] = (i / divisor) * chartWidth;
      const fraction = (chartPoints[i].price - minVal) / yRange;
      ys[i] = chartHeight - paddingBottom - fraction * usableHeight;
    }
    return { xCoords: xs, yCoords: ys };
  }, [chartPoints, chartWidth, chartHeight, minVal, yRange, usableHeight, paddingBottom]);

  // Calculate the SVG line path and area gradient path
  const { linePath, areaPath } = useMemo(() => {
    const len = chartPoints.length;
    if (len < 2 || chartWidth <= 0 || chartHeight <= 0) {
      return { linePath: '', areaPath: '' };
    }

    // Build the SVG line path string
    const parts = new Array(len);
    parts[0] = `M ${xCoords[0].toFixed(2)} ${yCoords[0].toFixed(2)}`;
    for (let i = 1; i < len; i++) {
      parts[i] = `L ${xCoords[i].toFixed(2)} ${yCoords[i].toFixed(2)}`;
    }
    const dLine = parts.join(' ');

    const lastX = xCoords[len - 1].toFixed(2);
    const firstX = xCoords[0].toFixed(2);
    const bottomY = chartHeight.toFixed(2);

    const dArea = `${dLine} L ${lastX} ${bottomY} L ${firstX} ${bottomY} Z`;
    return { linePath: dLine, areaPath: dArea };
  }, [chartPoints.length, chartWidth, chartHeight, xCoords, yCoords]);

  // Pre calculate the grid lines for the Y-axis based on the neat ticks
  const gridLines = useMemo(() => {
    return neatY.ticks.map((tickVal) => ({
      key: `grid-${tickVal}`,
      y: chartHeight - paddingBottom - ((tickVal - minVal) / yRange) * usableHeight,
      tickVal,
    }));
  }, [neatY.ticks, chartHeight, minVal, yRange, usableHeight, paddingBottom]);

  const lastScrubIdxRef = useRef(null);

  // Touch and Scrub Handler
  const updateTouch = useCallback(
    (evt, gestureState) => {
      const len = chartPoints.length;
      if (len === 0 || chartWidth <= 0) return;

      // Convert touch X to local chart X, clamp to chart width, then map to nearest index in the points array
      const pageX = evt?.nativeEvent?.pageX ?? gestureState?.moveX ?? 0;
      const localX = pageX - containerPageXRef.current;
      const clampedX = Math.max(0, Math.min(chartWidth, localX));
      const ratio = clampedX / chartWidth;
      const idx = Math.round(ratio * (len - 1));
      const clampedIdx = Math.max(0, Math.min(len - 1, idx));

      if (lastScrubIdxRef.current === clampedIdx) return;
      lastScrubIdxRef.current = clampedIdx;

      // Update the scrub index state and call the parent onScrub callback
      setScrubIndex((prev) => (prev === clampedIdx ? prev : clampedIdx));

      const cb = onScrubRef.current;
      if (cb) {
        const now = Date.now();
        if (now - lastScrubCallTimeRef.current >= 33) {   // Throttle to 30 fps
          lastScrubCallTimeRef.current = now;
          const curr = chartPoints[clampedIdx];
          const prev = clampedIdx > 0 ? chartPoints[clampedIdx - 1] : null;
          cb(curr, prev);
        } else if (!pendingScrubRafRef.current) {
          // Schedule a trailing call so the final position is always reported
          const capturedIdx = clampedIdx;
          pendingScrubRafRef.current = requestAnimationFrame(() => {
            pendingScrubRafRef.current = null;
            lastScrubCallTimeRef.current = Date.now();
            const curr = chartPoints[capturedIdx];
            const prev = capturedIdx > 0 ? chartPoints[capturedIdx - 1] : null;
            onScrubRef.current?.(curr, prev);
          });
        }
      }
    },
    [chartPoints, chartWidth]
  );

  // On release/cancel drop pending call, clear scrub, notify parent (to change the text price back)
  const handleTouchEnd = useCallback(() => {
    // Cancel any pending trailing scrub call
    if (pendingScrubRafRef.current) {
      cancelAnimationFrame(pendingScrubRafRef.current);
      pendingScrubRafRef.current = null;
    }
    lastScrubIdxRef.current = null;
    setScrubIndex(null);
    onScrubEndRef.current?.();
  }, []);

  // Define the PanResponder to handle touch gestures for scrubbing
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

  // Measure container size and window offset only when they actually change
  const handleLayout = useCallback((event) => {
    const { width, height } = event.nativeEvent.layout;
    setLayout((prev) => {
      if (
        Math.round(width) !== Math.round(prev.width) ||
        Math.round(height) !== Math.round(prev.height)
      ) {
        return { width, height };
      }
      return prev;
    });
    containerRef.current?.measureInWindow?.((x) => {
      if (typeof x === 'number') {
        containerPageXRef.current = x;
      }
    });
  }, []);

  // Access the active point and its coordinates for the scrub overlay and date badge
  const activePoint = scrubIndex !== null && chartPoints[scrubIndex] ? chartPoints[scrubIndex] : null;
  const activeX = activePoint ? xCoords[scrubIndex] : null;
  const activeY = activePoint ? yCoords[scrubIndex] : null;

  const dateText = activePoint ? formatCandleDate(activePoint.time, timeframe) : '';

  // Theme-aware grid + crosshair colors
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
          {/* Static chart layer */}
          <StaticChart
            chartWidth={chartWidth}
            chartHeight={chartHeight}
            linePath={linePath}
            areaPath={areaPath}
            color={color}
            isDark={isDark}
            gridLineColor={gridLineColor}
            gridLines={gridLines}
          />

          {/* Scrub overlay*/}
          <ScrubOverlay
            activeX={activeX}
            activeY={activeY}
            chartWidth={chartWidth}
            chartHeight={chartHeight}
            color={color}
            isDark={isDark}
            crosshairColor={crosshairColor}
            visible={scrubIndex !== null}
          />

          {/* Top neat datetime pill */}
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

          {/* Right hand Y-Axis labels column */}
          <View style={[styles.yAxisLabelsColumn, { width: yAxisWidth, borderLeftColor: gridLineColor }]}>
            {gridLines.map(({ tickVal, y }) => (
              <View
                key={`label-${tickVal}`}
                style={[
                  styles.yLabelItem,
                  {
                    top: Math.max(2, Math.min(chartHeight - 14, y - 7)),
                  },
                ]}
              >
                <AppText style={[styles.yAxisText, { color: theme.textMuted }]}>
                  {formatTickLabel(tickVal, neatY.step)}
                </AppText>
              </View>
            ))}
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

export default React.memo(StockInteractiveChart);

