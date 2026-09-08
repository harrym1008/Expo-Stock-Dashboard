import React from 'react';
import { StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { spacing } from '../../constants/theme';


// Right-edge delete button: fades/scales with swipe progress
function RightActionButton({ progress, onDelete }) {
  // Fade in and scale the icon as the swipe opens
  const opacity = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  const scale = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.6, 1],
    extrapolate: 'clamp',
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
      <Animated.View style={[styles.iconWrapper, { opacity, transform: [{ scale }] }]}>
        <Ionicons name="trash-outline" size={22} color="#FFFFFF" />
      </Animated.View>
    </TouchableOpacity>
  );
}

// Swipe-to-delete wrapper... left swipe reveals the delete action pane behind the watchlist item (only in edit mode)
function SwipeableStockItem({ children, onDelete, itemId, isEditMode = false }) {

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

  if (!isEditMode) {
    return children;
  }

  return (
    <Swipeable
      key={itemId}
      renderRightActions={renderRightActions}
      overshootRight={false}
      rightThreshold={40}
      enabled={isEditMode}
    >
      {children}
    </Swipeable>
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

