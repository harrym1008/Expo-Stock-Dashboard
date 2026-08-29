import React from 'react';
import { View } from 'react-native';
import ScreenContainer from '../components/common/ScreenContainer';
import { layoutStyles } from '../styles';

export default function PortfolioScreen() {
  return (
    <ScreenContainer title="Portfolio">
      <View style={layoutStyles.flex1}>
        {/* Configure your Portfolio screen content here */}
      </View>
    </ScreenContainer>
  );
}

