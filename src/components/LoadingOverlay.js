import React from 'react';
import {
  View,
  Text,
  ActivityIndicator,
  StyleSheet,
  Modal,
} from 'react-native';

/**
 * LoadingOverlay Component
 * 
 * A reusable loading overlay component that can be used across authentication flows
 * to provide consistent loading feedback to users during async operations.
 * 
 * @param {boolean} visible - Whether the overlay is visible
 * @param {string} message - Loading message to display
 * @param {boolean} transparent - Whether the overlay background is transparent
 */
export default function LoadingOverlay({ 
  visible = false, 
  message = 'Loading...', 
  transparent = false 
}) {
  if (!visible) return null;

  return (
    <Modal
      transparent={true}
      animationType="fade"
      visible={visible}
      statusBarTranslucent={true}
    >
      <View style={[
        styles.overlay, 
        transparent && styles.transparentOverlay
      ]}>
        <View style={styles.container}>
          <ActivityIndicator 
            size="large" 
            color="#48b6b0" 
            style={styles.spinner}
          />
          <Text style={styles.message}>{message}</Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  transparentOverlay: {
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
  },
  container: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    minWidth: 150,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  spinner: {
    marginBottom: 16,
  },
  message: {
    fontSize: 16,
    color: '#333',
    textAlign: 'center',
    fontWeight: '500',
  },
});