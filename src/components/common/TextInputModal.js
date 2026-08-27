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
import { spacing, borderRadius, fonts } from '../../constants/theme';
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
  const [text, setText] = useState(initialValue || '');
  const inputRef = useRef(null);

  // Reset input text to initialValue whenever the modal opens
  useEffect(() => {
    if (visible) {
      setText(initialValue || '');
      // Ensure input receives focus once modal is presented
      const focusTimer = setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
        }
      }, 100);
      return () => clearTimeout(focusTimer);
    }
  }, [visible, initialValue]);

  const trimmedText = text.trim();
  const isSubmitDisabled = trimmedText.length === 0;

  const handleSubmit = () => {
    if (isSubmitDisabled) return;
    if (onSubmit) {
      onSubmit(trimmedText);
    }
  };

  const handleCancel = () => {
    if (onCancel) {
      onCancel();
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={true}
      onRequestClose={handleCancel}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.overlay}
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
            styles.card,
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
              styles.input,
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
          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[
                styles.button,
                styles.cancelButton,
                { backgroundColor: isDark ? '#262D3D' : '#E8ECF2' },
              ]}
              onPress={handleCancel}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={cancelLabel}
            >
              <AppText bold style={[styles.buttonText, { color: theme.textSecondary }]}>
                {cancelLabel}
              </AppText>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.button,
                styles.submitButton,
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
              <AppText bold style={[styles.buttonText, styles.submitButtonText]}>
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
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    borderRadius: borderRadius.md + 4,
    borderWidth: 1,
    padding: spacing.xl,
    // Elevation / Shadow for depth
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 10,
  },
  title: {
    fontSize: 18,
    marginBottom: spacing.lg,
  },
  input: {
    height: 48,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    fontSize: 15,
    marginBottom: spacing.xl,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: spacing.md,
  },
  button: {
    paddingVertical: spacing.md - 2,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 84,
  },
  cancelButton: {},
  submitButton: {},
  buttonText: {
    fontSize: 14,
  },
  submitButtonText: {
    color: '#FFFFFF',
  },
});
