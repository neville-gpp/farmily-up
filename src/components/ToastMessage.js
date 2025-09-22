import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const { width: screenWidth } = Dimensions.get('window');

/**
 * ToastMessage Component
 * 
 * A toast notification component that appears at the bottom of the screen
 * for brief feedback messages. Supports different types and auto-dismiss.
 * 
 * @param {boolean} visible - Whether the toast is visible
 * @param {string} type - Toast type: 'success', 'error', 'warning', 'info'
 * @param {string} message - Toast message
 * @param {number} duration - Auto-hide duration in milliseconds
 * @param {function} onDismiss - Callback when toast is dismissed
 * @param {string} position - Toast position: 'top', 'bottom'
 * @param {boolean} showIcon - Whether to show the type icon
 * @param {string} actionText - Optional action button text
 * @param {function} onActionPress - Action button callback
 */
export default function ToastMessage({
  visible = false,
  type = 'info',
  message = '',
  duration = 4000,
  onDismiss = () => {},
  position = 'bottom',
  showIcon = true,
  actionText = '',
  onActionPress = () => {},
}) {
  const slideAnim = useRef(new Animated.Value(100)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const timeoutRef = useRef(null);

  const typeConfig = {
    success: {
      backgroundColor: '#28a745',
      iconName: 'checkmark-circle',
      iconColor: 'white',
      textColor: 'white',
    },
    error: {
      backgroundColor: '#dc3545',
      iconName: 'alert-circle',
      iconColor: 'white',
      textColor: 'white',
    },
    warning: {
      backgroundColor: '#ffc107',
      iconName: 'warning',
      iconColor: '#212529',
      textColor: '#212529',
    },
    info: {
      backgroundColor: '#17a2b8',
      iconName: 'information-circle',
      iconColor: 'white',
      textColor: 'white',
    },
  };

  const config = typeConfig[type] || typeConfig.info;

  useEffect(() => {
    if (visible) {
      // Show animation
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: true,
          tension: 100,
          friction: 8,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();

      // Auto-hide timer
      if (duration > 0) {
        timeoutRef.current = setTimeout(() => {
          handleDismiss();
        }, duration);
      }
    } else {
      // Hide animation
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: position === 'top' ? -100 : 100,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [visible, duration, position]);

  const handleDismiss = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: position === 'top' ? -100 : 100,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onDismiss();
    });
  };

  const handleActionPress = () => {
    onActionPress();
    handleDismiss();
  };

  if (!message) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        position === 'top' ? styles.topPosition : styles.bottomPosition,
        {
          backgroundColor: config.backgroundColor,
          transform: [{ translateY: slideAnim }],
          opacity: opacityAnim,
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
        
        <Text
          style={[styles.message, { color: config.textColor }]}
          numberOfLines={2}
        >
          {message}
        </Text>
        
        {actionText && (
          <TouchableOpacity
            style={styles.actionButton}
            onPress={handleActionPress}
          >
            <Text style={[styles.actionText, { color: config.textColor }]}>
              {actionText}
            </Text>
          </TouchableOpacity>
        )}
        
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
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 1000,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 4.65,
    elevation: 8,
  },
  topPosition: {
    top: 60, // Account for status bar and safe area
  },
  bottomPosition: {
    bottom: 100, // Account for tab bar and safe area
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    minHeight: 56,
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
  actionButton: {
    marginLeft: 12,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  actionText: {
    fontSize: 14,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  dismissButton: {
    marginLeft: 8,
    padding: 4,
  },
});