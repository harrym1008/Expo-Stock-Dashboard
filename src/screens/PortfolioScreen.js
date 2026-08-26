import React from 'react';
import { View, StyleSheet } from 'react-native';
import ScreenContainer from '../components/common/ScreenContainer';

export default function PortfolioScreen() {
  return (
    <ScreenContainer title="Portfolio">
      <View style={styles.container}>
        {/* Configure your Portfolio screen content here */}
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
