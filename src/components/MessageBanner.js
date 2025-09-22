import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

/**
 * MessageBanner Component
 * 
 * A reusable banner component for displaying success, error, warning, and info messages
 * with automatic dismiss functionality and consistent styling across authentication flows.
 * 
 * @param {string} type - Message type: 'success', 'error', 'warning', 'info'
 * @param {string} message - Message text to display
 * @param {boolean} visible - Whether the banner is visible
 * @param {function} onDismiss - Callback when banner is dismissed
 * @param {number} autoHideDuration - Auto-hide duration in milliseconds (0 to disable)
 * @param {boolean} showIcon - Whether to show the type icon
 * @param {boolean} dismissible - Whether the banner can be manually dismissed
 */
export default function MessageBanner({
  type = 'info',
  message = '',
  visible = false,
  onDismiss = () => {},
  autoHideDuration = 5000,
  showIcon = true,
  dismissible = true,
}) {
  const slideAnim = useRef(new Animated.Value(-100)).current;
  const timeoutRef = useRef(null);

  const typeConfig = {
    success: {
      backgroundColor: '#d4edda',
      borderColor: '#c3e6cb',
      textColor: '#155724',
      iconName: 'checkmark-circle',
      iconColor: '#28a745',
    },
    error: {
      backgroundColor: '#f8d7da',
      borderColor: '#f5c6cb',
      textColor: '#721c24',
      iconName: 'alert-circle',
      iconColor: '#dc3545',
    },
    warning: {
      backgroundColor: '#fff3cd',
      borderColor: '#ffeaa7',
      textColor: '#856404',
      iconName: 'warning',
      iconColor: '#ffc107',
    },
    info: {
      backgroundColor: '#d1ecf1',
      borderColor: '#bee5eb',
      textColor: '#0c5460',
      iconName: 'information-circle',
      iconColor: '#17a2b8',
    },
  };

  const config = typeConfig[type] || typeConfig.info;

  useEffect(() => {
    if (visible) {
      // Slide in animation
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 100,
        friction: 8,
      }).start();

      // Auto-hide timer
      if (autoHideDuration > 0) {
        timeoutRef.current = setTimeout(() => {
          handleDismiss();
        }, autoHideDuration);
      }
    } else {
      // Slide out animation
      Animated.timing(slideAnim, {
        toValue: -100,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [visible, autoHideDuration]);

  const handleDismiss = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    
    Animated.timing(slideAnim, {
      toValue: -100,
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      onDismiss();
    });
  };

  if (!message) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          backgroundColor: config.backgroundColor,
          borderColor: config.borderColor,
          transform: [{ translateY: slideAnim }],
        },
      ]}
    >
      <View style={styles.content}>
        {showIcon && (
          <Ionicons
            name={config.iconName}
            size={20}
            color={config.iconColor}
            style={styles.icon}
          />
        )}
        
        <Text style={[styles.message, { color: config.textColor }]}>
          {message}
        </Text>
        
        {dismissible && (
          <TouchableOpacity
            style={styles.dismissButton}
            onPress={handleDismiss}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons
              name="close"
              size={18}
              color={config.textColor}
            />
          </TouchableOpacity>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
    borderWidth: 1,
    borderTopWidth: 0,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    paddingTop: 50, // Account for status bar
  },
  icon: {
    marginRight: 12,
  },
  message: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 20,
  },
  dismissButton: {
    marginLeft: 12,
    padding: 4,
  },
});