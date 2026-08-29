import React from 'react';
import { View } from 'react-native';
import ScreenContainer from '../components/common/ScreenContainer';
import { layoutStyles } from '../styles';

export default function NewsScreen() {
  return (
    <ScreenContainer title="News">
      <View style={layoutStyles.flex1}>
        {/* Configure your News screen content here */}
      </View>
    </ScreenContainer>
  );
}

