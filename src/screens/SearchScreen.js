import React from 'react';
import { View, StyleSheet } from 'react-native';
import ScreenContainer from '../components/common/ScreenContainer';

export default function SearchScreen() {
  return (
    <ScreenContainer title="Search">
      <View style={styles.container}>
        {/* Configure your Search screen content here */}
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
