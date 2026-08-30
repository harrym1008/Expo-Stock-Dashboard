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
import { dialogStyles } from '../../styles';
import AppText from './AppText';

export default function CreatePortfolioModal({
  visible = false,
  initialTitle = 'Portfolio 1',
  defaultCash = 10000,
  minCash = 100,
  maxCash = 1000000,
  onSubmit,
  onCancel,
}) {
  const { theme, isDark } = useTheme();
  const [title, setTitle] = useState(initialTitle);
  const [cashInput, setCashInput] = useState('10,000');
  const [errorMessage, setErrorMessage] = useState('');

  const titleInputRef = useRef(null);

  useEffect(() => {
    if (visible) {
      setTitle(initialTitle);
      setCashInput(Number(defaultCash).toLocaleString('en-US'));
      setErrorMessage('');
    }
  }, [visible, initialTitle, defaultCash]);

  // Clean and format numeric cash input
  const handleCashChange = (text) => {
    // Keep numbers and single decimal
    const raw = text.replace(/[^0-9.]/g, '');
    const parts = raw.split('.');
    let cleanNum = parts[0];
    if (parts.length > 1) {
      cleanNum += '.' + parts[1].slice(0, 2);
    }
    setCashInput(cleanNum);

    const val = parseFloat(cleanNum);
    if (!isNaN(val)) {
      if (val < minCash) {
        setErrorMessage(`Minimum starting cash is $${minCash.toLocaleString('en-US')}`);
      } else if (val > maxCash) {
        setErrorMessage(`Maximum starting cash is $${maxCash.toLocaleString('en-US')}`);
      } else {
        setErrorMessage('');
      }
    } else {
      setErrorMessage('Please enter a valid dollar amount');
    }
  };

  const parsedCash = parseFloat(cashInput.replace(/,/g, ''));
  const isCashValid = !isNaN(parsedCash) && parsedCash >= minCash && parsedCash <= maxCash;
  const isTitleValid = title.trim().length > 0;
  const isSubmitDisabled = !isTitleValid || !isCashValid;

  const handleSubmit = () => {
    if (isSubmitDisabled) return;
    onSubmit?.({
      title: title.trim(),
      cash: parsedCash,
    });
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onCancel}
      statusBarTranslucent={true}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={dialogStyles.overlay}
      >
        {/* Semi-transparent backdrop */}
        <TouchableOpacity
          style={StyleSheet.absoluteFillObject}
          activeOpacity={1}
          onPress={onCancel}
          accessibilityRole="button"
          accessibilityLabel="Dismiss modal backdrop"
        />

        {/* Modal Card */}
        <View
          style={[
            dialogStyles.card,
            {
              backgroundColor: isDark ? '#1C1F26' : '#FFFFFF',
              borderColor: theme.border,
            },
          ]}
        >
          <AppText bold style={styles.modalTitle}>
            Create New Portfolio
          </AppText>

          {/* Portfolio Name Input */}
          <AppText bold style={[styles.inputLabel, { color: theme.textSecondary }]}>
            PORTFOLIO NAME
          </AppText>
          <TextInput
            ref={titleInputRef}
            style={[
              dialogStyles.input,
              styles.inputField,
              {
                backgroundColor: isDark ? '#12161E' : '#F0F3F7',
                borderColor: theme.border,
                color: theme.textPrimary,
                fontFamily: fonts.regular,
              },
            ]}
            placeholder="e.g. Portfolio 1"
            placeholderTextColor={theme.textMuted}
            value={title}
            onChangeText={setTitle}
            autoCapitalize="words"
            autoCorrect={false}
            selectionColor={theme.primary}
            returnKeyType="next"
          />

          {/* Starting Cash Input */}
          <AppText bold style={[styles.inputLabel, { color: theme.textSecondary }]}>
            STARTING CASH ($100 – $1,000,000)
          </AppText>
          <View
            style={[
              styles.cashInputWrapper,
              {
                backgroundColor: isDark ? '#12161E' : '#F0F3F7',
                borderColor: errorMessage ? '#FF4D4F' : theme.border,
              },
            ]}
          >
            <AppText bold style={[styles.currencyPrefix, { color: theme.textSecondary }]}>
              $
            </AppText>
            <TextInput
              style={[
                styles.cashTextInput,
                {
                  color: theme.textPrimary,
                  fontFamily: fonts.regular,
                },
              ]}
              placeholder="10,000"
              placeholderTextColor={theme.textMuted}
              value={cashInput}
              onChangeText={handleCashChange}
              keyboardType="decimal-pad"
              selectionColor={theme.primary}
              returnKeyType="done"
              onSubmitEditing={handleSubmit}
            />
          </View>

          {/* Error / Range Hint Message */}
          {errorMessage ? (
            <AppText style={styles.errorText}>
              {errorMessage}
            </AppText>
          ) : (
            <AppText style={[styles.hintText, { color: theme.textMuted }]}>
              Default is $10,000
            </AppText>
          )}

          {/* Action Buttons Row */}
          <View style={dialogStyles.buttonRow}>
            <TouchableOpacity
              style={[
                dialogStyles.button,
                { backgroundColor: isDark ? '#262D3D' : '#E8ECF2' },
              ]}
              onPress={onCancel}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
            >
              <AppText bold style={[dialogStyles.buttonText, { color: theme.textSecondary }]}>
                Cancel
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
              accessibilityLabel="Create Portfolio"
            >
              <AppText bold style={[dialogStyles.buttonText, dialogStyles.submitButtonText]}>
                Create
              </AppText>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalTitle: {
    fontSize: 20,
    marginBottom: spacing.lg,
  },
  inputLabel: {
    fontSize: 11.5,
    letterSpacing: 0.6,
    marginBottom: spacing.xs + 2,
  },
  inputField: {
    marginBottom: spacing.md,
  },
  cashInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
  },
  currencyPrefix: {
    fontSize: 16,
    marginRight: spacing.xs,
  },
  cashTextInput: {
    flex: 1,
    fontSize: 15,
    height: '100%',
  },
  hintText: {
    fontSize: 12,
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },
  errorText: {
    fontSize: 12,
    color: '#FF4D4F',
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },
});
