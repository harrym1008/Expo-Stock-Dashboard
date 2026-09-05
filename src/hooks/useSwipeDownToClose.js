import { useRef, useEffect } from 'react';
import { Animated, PanResponder, Dimensions, Easing } from 'react-native';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const DISMISS_DISTANCE = 100;
const VELOCITY_THRESHOLD = 0.5;

/**
 * Custom hook to enable swipe-down-to-close behavior on sheet modals.
 *
 * @param {Object} params
 * @param {boolean} params.visible Whether the modal is currently visible
 * @param {Function} params.onClose Callback invoked when modal is dismissed
 * @returns {{ panHandlers: Object, animatedStyle: Object }}
 */
export default function useSwipeDownToClose({ visible, onClose }) {
  const translateY = useRef(new Animated.Value(0)).current;
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Reset offset whenever modal opens
  useEffect(() => {
    if (visible) {
      translateY.setValue(0);
    }
  }, [visible, translateY]);

  const panResponder = useRef(
    PanResponder.create({
      // Claim the responder on touch start so native touch system sends MOVE events
      onStartShouldSetPanResponder: () => true,
      // Do NOT capture during capture phase so child TouchableOpacity components can claim touch on start
      onStartShouldSetPanResponderCapture: () => false,

      // If a child (e.g. TouchableOpacity) claimed the start event, capture on move if dragging down
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return gestureState.dy > 6 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx);
      },
      onMoveShouldSetPanResponderCapture: (_, gestureState) => {
        return gestureState.dy > 6 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx);
      },

      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          translateY.setValue(gestureState.dy);
        } else {
          translateY.setValue(0);
        }
      },

      onPanResponderRelease: (_, gestureState) => {
        if (
          gestureState.dy > DISMISS_DISTANCE ||
          (gestureState.dy > 30 && gestureState.vy > VELOCITY_THRESHOLD)
        ) {
          // Animate smoothly off-screen on the native UI thread immediately upon release
          const remainingDistance = Math.max(10, SCREEN_HEIGHT - gestureState.dy);
          const computedDuration = Math.min(200, Math.max(120, (remainingDistance / Math.max(gestureState.vy, 1)) * 0.25));

          Animated.timing(translateY, {
            toValue: SCREEN_HEIGHT,
            duration: computedDuration,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }).start(() => {
            if (onCloseRef.current) {
              onCloseRef.current();
            }
          });
        } else {
          Animated.spring(translateY, {
            toValue: 0,
            bounciness: 4,
            useNativeDriver: true,
          }).start();
        }
      },

      onPanResponderTerminate: () => {
        Animated.spring(translateY, {
          toValue: 0,
          bounciness: 4,
          useNativeDriver: true,
        }).start();
      },
    })
  ).current;

  return {
    panHandlers: panResponder.panHandlers,
    animatedStyle: {
      transform: [{ translateY }],
    },
  };
}
