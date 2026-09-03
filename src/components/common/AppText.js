import { Text, StyleSheet } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { fonts } from '../../constants/theme';

// Share the same font family across the whole app using AppText for every text element
export default function AppText({
  style,
  bold,
  italic,
  children,
  color,
  ...props
}) {
  const { theme } = useTheme();

  // Merge incoming style so prop-driven fontWeight and italic are honored
  const flattened = StyleSheet.flatten(style) || {};
  const isBold = bold || flattened.fontWeight === 'bold' || Number(flattened.fontWeight) >= 600;
  const isItalic = italic || flattened.fontStyle === 'italic';

  let fontFamily = fonts.regular;
  if (isBold && isItalic) {
    fontFamily = fonts.boldItalic;
  } else if (isBold) {
    fontFamily = fonts.bold;
  } else if (isItalic) {
    fontFamily = fonts.italic;
  }

  const { fontWeight, fontStyle, ...sanitisedStyle } = flattened;
  const textColor = color || sanitisedStyle.color || theme.textPrimary;

  return (
    <Text style={[{fontSize: 14}, sanitisedStyle, {color: textColor, fontFamily}]} {...props}>
      {children}
    </Text>
  );
}
