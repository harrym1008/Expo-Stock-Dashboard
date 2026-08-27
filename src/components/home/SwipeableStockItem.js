import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, {
  useAnimatedStyle,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { spacing } from '../../constants/theme';

/**
 * Animated delete button rendered when swiping left.
 */
function RightActionButton({ progress, dragX, onDelete }) {
  const animatedStyle = useAnimatedStyle(() => {
    return {
      opacity: progress.value,
      transform: [
        {
          scale: Math.min(1, Math.max(0.6, progress.value)),
        },
      ],
    };
  });

  return (
    <TouchableOpacity
      style={styles.deleteAction}
      onPress={onDelete}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel="Delete stock"
    >
      <Animated.View style={[styles.iconWrapper, animatedStyle]}>
        <Ionicons name="trash-outline" size={22} color="#FFFFFF" />
      </Animated.View>
    </TouchableOpacity>
  );
}

/**
 * SwipeableStockItem component
 * Wraps a stock item with swipe-to-delete functionality (like iOS Contacts).
 * Swiping left reveals a red action pane on the right side with a trash icon.
 *
 * @param {Object} props
 * @param {React.ReactNode} props.children - Stock item child content
 * @param {Function} props.onDelete - Callback invoked when delete button is tapped
 * @param {string|number} props.itemId - Optional ID identifier for the item
 */
export default function SwipeableStockItem({ children, onDelete, itemId }) {
  const { theme } = useTheme();

  const handleDelete = () => {
    if (onDelete) {
      onDelete(itemId);
    }
  };

  const renderRightActions = (progress, dragX) => {
    return (
      <RightActionButton
        progress={progress}
        dragX={dragX}
        onDelete={handleDelete}
      />
    );
  };

  return (
    <ReanimatedSwipeable
      key={itemId}
      renderRightActions={renderRightActions}
      overshootRight={false}
      rightThreshold={40}
    >
      {children}
    </ReanimatedSwipeable>
  );
}

const styles = StyleSheet.create({
  deleteAction: {
    width: 80,
    backgroundColor: '#FF4D4F',
    justifyContent: 'center',
    alignItems: 'center',
    height: '100%',
    paddingHorizontal: spacing.sm,
  },
  iconWrapper: {
    justifyContent: 'center',
    alignItems: 'center',
  },
});
