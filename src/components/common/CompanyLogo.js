import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Image } from 'react-native';
import { borderRadius } from '../../constants/theme';
import { logoService } from '../../services/logoService';

export default function CompanyLogo({
  symbol,
  size = 32,
  style,
  logoUri: customLogoUri = null,
}) {
  const [imageUri, setImageUri] = useState(() => {
    if (customLogoUri) return customLogoUri;
    return (
      logoService.getCachedLogo(symbol) ||
      logoService.getPlaceholderUri(symbol)
    );
  });

  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    if (!symbol) return;
    setHasError(false);

    // 1. Initial cached check
    const cached = logoService.getCachedLogo(symbol);
    if (cached) {
      setImageUri(cached);
    } else if (customLogoUri) {
      setImageUri(customLogoUri);
    }

    // 2. Subscribe to async cache/download resolution
    const unsubscribe = logoService.subscribe(symbol, (newUri) => {
      if (newUri) {
        setImageUri(newUri);
        setHasError(false);
      }
    });

    // 3. Trigger download & caching from static CDN or custom URL
    logoService.getLogo(symbol, customLogoUri).then((resolvedUri) => {
      if (resolvedUri) {
        setImageUri(resolvedUri);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [symbol, customLogoUri]);

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
        },
        style,
      ]}
    >
      <Image
        source={{ uri: displayUri }}
        style={styles.image}
        resizeMode="cover"
        onError={() => setHasError(true)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
});
