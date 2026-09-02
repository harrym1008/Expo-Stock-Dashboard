import React from 'react';
import { StyleSheet, TouchableOpacity } from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, {useAnimatedStyle} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { spacing } from '../../constants/theme';


// Right-edge delete button: fades/scales with swipe progress
function RightActionButton({ progress, onDelete }) {
  // Fade in and scale the icon as the swipe opens
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
    // Red action pane with trash icon 
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

// Swipe-to-delete wrapper... left swipe reveals the delete action pane behind the watchlist item
function SwipeableStockItem({ children, onDelete, itemId }) {

  const handleDelete = () => {
    if (onDelete) {
      onDelete(itemId);
    }
  };

  // Render the swipe action pane
  const renderRightActions = (progress) => {
    return (
      <RightActionButton
        progress={progress}
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

export default React.memo(SwipeableStockItem);

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

