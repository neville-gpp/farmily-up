import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TouchableWithoutFeedback,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

/**
 * AlertDialog Component
 * 
 * A customizable alert dialog component for authentication flows that provides
 * consistent styling and behavior across the app. Supports different types
 * (success, error, warning, info) with appropriate icons and colors.
 * 
 * @param {boolean} visible - Whether the dialog is visible
 * @param {string} type - Dialog type: 'success', 'error', 'warning', 'info'
 * @param {string} title - Dialog title
 * @param {string} message - Dialog message
 * @param {Array} buttons - Array of button objects with text, onPress, and style
 * @param {function} onDismiss - Callback when dialog is dismissed
 * @param {boolean} dismissible - Whether dialog can be dismissed by tapping outside
 */
export default function AlertDialog({
  visible = false,
  type = 'info',
  title = '',
  message = '',
  buttons = [],
  onDismiss = () => {},
  dismissible = true,
}) {
  const typeConfig = {
    success: {
      iconName: 'checkmark-circle',
      iconColor: '#28a745',
      titleColor: '#155724',
    },
    error: {
      iconName: 'alert-circle',
      iconColor: '#dc3545',
      titleColor: '#721c24',
    },
    warning: {
      iconName: 'warning',
      iconColor: '#ffc107',
      titleColor: '#856404',
    },
    info: {
      iconName: 'information-circle',
      iconColor: '#17a2b8',
      titleColor: '#0c5460',
    },
  };

  const config = typeConfig[type] || typeConfig.info;

  const defaultButtons = [
    {
      text: 'OK',
      onPress: onDismiss,
      style: 'default',
    },
  ];

  const dialogButtons = buttons.length > 0 ? buttons : defaultButtons;

  const handleBackdropPress = () => {
    if (dismissible) {
      onDismiss();
    }
  };

  const renderButton = (button, index) => {
    const isDestructive = button.style === 'destructive';
    const isCancel = button.style === 'cancel';
    const isPrimary = button.style === 'primary' || (dialogButtons.length === 1 && !isCancel);

    return (
      <TouchableOpacity
        key={index}
        style={[
          styles.button,
          isPrimary && styles.primaryButton,
          isDestructive && styles.destructiveButton,
          isCancel && styles.cancelButton,
          index > 0 && styles.buttonMargin,
        ]}
        onPress={button.onPress}
        disabled={button.disabled}
      >
        <Text
          style={[
            styles.buttonText,
            isPrimary && styles.primaryButtonText,
            isDestructive && styles.destructiveButtonText,
            isCancel && styles.cancelButtonText,
            button.disabled && styles.disabledButtonText,
          ]}
        >
          {button.text}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <Modal
      transparent={true}
      animationType="fade"
      visible={visible}
      onRequestClose={onDismiss}
      statusBarTranslucent={true}
    >
      <TouchableWithoutFeedback onPress={handleBackdropPress}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View style={styles.dialog}>
              {/* Icon */}
              <View style={styles.iconContainer}>
                <Ionicons
                  name={config.iconName}
                  size={48}
                  color={config.iconColor}
                />
              </View>

              {/* Title */}
              {title && (
                <Text style={[styles.title, { color: config.titleColor }]}>
                  {title}
                </Text>
              )}

              {/* Message */}
              {message && (
                <Text style={styles.message}>
                  {message}
                </Text>
              )}

              {/* Buttons */}
              <View style={[
                styles.buttonContainer,
                dialogButtons.length > 2 && styles.verticalButtons
              ]}>
                {dialogButtons.map(renderButton)}
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  dialog: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 24,
    minWidth: 280,
    maxWidth: 400,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 8,
  },
  iconContainer: {
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 12,
  },
  message: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    width: '100%',
  },
  verticalButtons: {
    flexDirection: 'column',
  },
  button: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    minWidth: 80,
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    borderWidth: 1,
    borderColor: '#dee2e6',
  },
  primaryButton: {
    backgroundColor: '#48b6b0',
    borderColor: '#48b6b0',
  },
  destructiveButton: {
    backgroundColor: '#dc3545',
    borderColor: '#dc3545',
  },
  cancelButton: {
    backgroundColor: 'transparent',
    borderColor: '#6c757d',
  },
  buttonMargin: {
    marginLeft: 12,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#495057',
  },
  primaryButtonText: {
    color: 'white',
  },
  destructiveButtonText: {
    color: 'white',
  },
  cancelButtonText: {
    color: '#6c757d',
  },
  disabledButtonText: {
    color: '#adb5bd',
  },
});