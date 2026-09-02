import React, { useState } from 'react';
import { View, TouchableOpacity, Image, Linking } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { formatTimeAgo } from '../../utils/formatters';
import { newsStyles } from '../../styles';
import AppText from './AppText';

// News row: meta line, headline, optional summary + thumbnail; tappable to open URL
export default function NewsCard({ item }) {
  const { theme, isDark } = useTheme();
  const [imageError, setImageError] = useState(false);

  if (!item) return null;

  // Reuters/Bloomberg/Yahoo omit the thumbnail
  const sourceLower = (item.source || '').toLowerCase();
  const isReuters = sourceLower.includes('reuters');
  const isBloomberg = sourceLower.includes('bloomberg');
  const isYahoo = sourceLower.includes('yahoo');
  const hideImageBySource = isReuters || isBloomberg || isYahoo;
  const hasSummary = !isReuters && Boolean(item.summary && item.summary.trim());

  const hasValidImage = Boolean(item.image && typeof item.image === 'string' && item.image.trim().length > 0);
  const showImage = !hideImageBySource && hasValidImage && !imageError;

  // Open the article URL on press
  const handlePress = () => {
    if (item.url) {
      Linking.openURL(item.url).catch(() => {});
    }
  };

  return (
    {/* Tappable card: content block + optional thumbnail */}
    <TouchableOpacity
      style={[
        newsStyles.newsCard,
        {
          backgroundColor: isDark ? '#12161E' : '#FFFFFF',
          borderColor: theme.border,
        },
      ]}
      activeOpacity={0.7}
      onPress={handlePress}
    >
      <View style={newsStyles.newsContent}>
        {/* Source • time meta row */}
        <View style={newsStyles.newsMetaRow}>
          <AppText bold style={[newsStyles.newsSource, { color: theme.textSecondary }]}>
            {item.source}
          </AppText>
          <AppText style={[newsStyles.newsDot, { color: theme.textMuted }]}>•</AppText>
          <AppText style={[newsStyles.newsTime, { color: theme.textMuted }]}>
            {formatTimeAgo(item.datetime)}
          </AppText>
        </View>
        <AppText bold style={newsStyles.newsHeadline}>
          {item.headline}
        </AppText>
        {hasSummary && (
          <AppText style={[newsStyles.newsSummary, { color: theme.textSecondary }]} numberOfLines={3} ellipsizeMode="tail">
            {item.summary}
          </AppText>
        )}
      </View>

      {showImage && (
        {/* Thumbnail; hides on image error */}
        <Image
          source={{ uri: item.image }}
          style={newsStyles.newsThumbnail}
          resizeMode="cover"
          onError={() => setImageError(true)}
        />
      )}
    </TouchableOpacity>
  );
}
