import React, { useState, useEffect, useCallback, memo } from 'react';
import { View, StyleSheet, Image } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { borderRadius } from '../../constants/theme';
import { logoService } from '../../services/logoService';

// A rounded logo image component with direct URL resolution and native image caching
function CompanyLogo({
  symbol,
  size = 32,
  style,
  logoUri: customLogoUri = null,
}) {
  const { theme } = useTheme();

  // Instantly resolve URI from custom prop, memory cache, or static CDN
  const [imageUri, setImageUri] = useState(() =>
    logoService.resolveLogoUri(symbol, customLogoUri)
  );
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    if (!symbol) return;
    setHasError(false);

    // Initial resolution
    const resolved = logoService.resolveLogoUri(symbol, customLogoUri);
    setImageUri(resolved);

    // Listen for custom overrides or fallback notifications
    const unsubscribe = logoService.subscribe(symbol, (newUri) => {
      if (newUri) {
        setImageUri(newUri);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [symbol, customLogoUri]);

  const handleError = useCallback(() => {
    setHasError(true);
    if (symbol) {
      logoService.markFailed(symbol);
    }
  }, [symbol]);

  const placeholder = logoService.getPlaceholderUri(symbol);
  const displayUri = hasError || !imageUri ? placeholder : imageUri;

  return (
    <View
      style={[
        styles.container,
        {
          width: size,
          height: size,
          borderRadius: borderRadius.sm + 2,
          backgroundColor: theme.surfaceSubtle,
        },
        style,
      ]}
    >
      <Image
        source={{ uri: displayUri }}
        style={styles.image}
        resizeMode="cover"
        onError={handleError}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
});

export default memo(CompanyLogo);
