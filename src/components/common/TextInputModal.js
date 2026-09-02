import { useState, useEffect, useRef } from 'react';
import {Modal, View, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform} from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { spacing, fonts } from '../../constants/theme';
import { dialogueStyles } from '../../styles';
import AppText from './AppText';


// Reusable centred modal for naming something
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

  // Submit only if input is not empty
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
        style={dialogueStyles.overlay}
      >
        {/* Semi-transparent backdrop... tapping this dismisses the modal */}
        <TouchableOpacity
          style={StyleSheet.absoluteFillObject}
          activeOpacity={1}
          onPress={handleCancel}
          accessibilityRole="button"
          accessibilityLabel="Dismiss modal backdrop"
        />

        <View
          style={[
            dialogueStyles.card,
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
              dialogueStyles.input,
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

          {/* Action buttons row */}
          <View style={dialogueStyles.buttonRow}>
            <TouchableOpacity
              style={[
                dialogueStyles.button,
                { backgroundColor: isDark ? '#262D3D' : '#E8ECF2' },
              ]}
              onPress={handleCancel}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={cancelLabel}
            >
              <AppText bold style={[dialogueStyles.buttonText, { color: theme.textSecondary }]}>
                {cancelLabel}
              </AppText>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                dialogueStyles.button,
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
              <AppText bold style={[dialogueStyles.buttonText, dialogueStyles.submitButtonText]}>
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
