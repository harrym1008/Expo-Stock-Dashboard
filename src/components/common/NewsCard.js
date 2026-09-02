import { useState } from 'react';
import { View, TouchableOpacity, Image, Linking } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { formatTimeAgo } from '../../utils/formatters';
import { newsStyles } from '../../styles';
import AppText from './AppText';

// Standard news card for a single article with source, time, headline, summary and optional thumbnail
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

  const hasValidImage = Boolean(item.image?.trim());
  const showImage = !hideImageBySource && hasValidImage && !imageError;

  // Open the article URL in default browser on press
  const handlePress = () => {
    if (item.url) {
      Linking.openURL(item.url).catch(() => {});
    }
  };

  return (
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
        <Image
          source={{ uri: item.image }}
          style={newsStyles.newsThumbnail}
          resizeMode="cover"
          // Hide the image if it fails to load
          onError={() => setImageError(true)}
        />
      )}
    </TouchableOpacity>
  );
}
