import React, { useState, useEffect, useRef } from 'react';
import {
  Modal,
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { spacing, fonts } from '../../constants/theme';
import { dialogStyles } from '../../styles';
import AppText from './AppText';

/**
 * TextInputModal
 *
 * A reusable modal for creating/naming or renaming items (such as watchlists).
 *
 * @param {Object} props
 * @param {boolean} props.visible - Controls modal visibility
 * @param {string} props.title - Modal title header
 * @param {string} [props.placeholder] - Placeholder text for input field
 * @param {string} [props.initialValue] - Pre-filled value (useful for renaming)
 * @param {string} [props.submitLabel] - Label for submit button (default: 'Submit')
 * @param {string} [props.cancelLabel] - Label for cancel button (default: 'Cancel')
 * @param {(text: string) => void} props.onSubmit - Callback when submit is pressed with trimmed text
 * @param {() => void} props.onCancel - Callback when cancel or overlay is pressed
 */
export default function TextInputModal({
  visible = false,
  title = '',
  placeholder = '',
  initialValue = '',
  submitLabel = 'Submit',
  cancelLabel = 'Cancel',
  onSubmit,
  onCancel,
}) {
  const { theme, isDark } = useTheme();
  const [text, setText] = useState(initialValue);
  const inputRef = useRef(null);

  // Sync state when modal opens or initialValue changes
  useEffect(() => {
    if (visible) {
      setText(initialValue);
    }
  }, [visible, initialValue]);

  const handleSubmit = () => {
    const trimmed = text.trim();
    if (trimmed.length === 0) return;
    if (onSubmit) {
      onSubmit(trimmed);
    }
  };

  const handleCancel = () => {
    if (onCancel) {
      onCancel();
    }
  };

  const isSubmitDisabled = text.trim().length === 0;

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={handleCancel}
      statusBarTranslucent={true}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={dialogStyles.overlay}
      >
        {/* Semi-transparent backdrop - tapping dismisses */}
        <TouchableOpacity
          style={StyleSheet.absoluteFillObject}
          activeOpacity={1}
          onPress={handleCancel}
          accessibilityRole="button"
          accessibilityLabel="Dismiss modal backdrop"
        />

        {/* Centered Modal Card */}
        <View
          style={[
            dialogStyles.card,
            {
              backgroundColor: isDark ? '#1C1F26' : '#FFFFFF',
              borderColor: theme.border,
            },
          ]}
        >
          {title ? (
            <AppText bold style={styles.title}>
              {title}
            </AppText>
          ) : null}

          <TextInput
            ref={inputRef}
            style={[
              dialogStyles.input,
              {
                backgroundColor: isDark ? '#12161E' : '#F0F3F7',
                borderColor: theme.border,
                color: theme.textPrimary,
                fontFamily: fonts.regular,
              },
            ]}
            placeholder={placeholder}
            placeholderTextColor={theme.textMuted}
            value={text}
            onChangeText={setText}
            autoFocus={true}
            selectTextOnFocus={true}
            autoCapitalize="words"
            autoCorrect={false}
            selectionColor={theme.primary}
            returnKeyType="done"
            onSubmitEditing={handleSubmit}
          />

          {/* Action Buttons Row */}
          <View style={dialogStyles.buttonRow}>
            <TouchableOpacity
              style={[
                dialogStyles.button,
                { backgroundColor: isDark ? '#262D3D' : '#E8ECF2' },
              ]}
              onPress={handleCancel}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={cancelLabel}
            >
              <AppText bold style={[dialogStyles.buttonText, { color: theme.textSecondary }]}>
                {cancelLabel}
              </AppText>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                dialogStyles.button,
                {
                  backgroundColor: theme.primary,
                  opacity: isSubmitDisabled ? 0.45 : 1,
                },
              ]}
              onPress={handleSubmit}
              disabled={isSubmitDisabled}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={submitLabel}
            >
              <AppText bold style={[dialogStyles.buttonText, dialogStyles.submitButtonText]}>
                {submitLabel}
              </AppText>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 18,
    marginBottom: spacing.lg,
  },
});
