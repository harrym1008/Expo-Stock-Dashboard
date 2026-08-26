import React from 'react';
import { View, StyleSheet } from 'react-native';
import ScreenContainer from '../components/common/ScreenContainer';

export default function NewsScreen() {
  return (
    <ScreenContainer title="News">
      <View style={styles.container}>
        {/* Configure your News screen content here */}
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
