import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useAuth } from '../context/AuthContext';

/**
 * Modal component that displays session expiration warnings
 * Automatically shows when session is about to expire
 */
const SessionWarningModal = () => {
  const { 
    sessionWarning, 
    sessionMinutesRemaining, 
    extendSession, 
    dismissSessionWarning 
  } = useAuth();

  const handleExtendSession = async () => {
    const extended = await extendSession();
    if (!extended) {
      // If extension failed, the auth context will handle logout
      console.warn('Failed to extend session');
    }
  };

  const handleDismiss = () => {
    dismissSessionWarning();
  };

  return (
    <Modal
      visible={sessionWarning}
      transparent={true}
      animationType="fade"
      onRequestClose={handleDismiss}
    >
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <Text style={styles.title}>Session Expiring</Text>
          <Text style={styles.message}>
            Your session will expire in {sessionMinutesRemaining} minute{sessionMinutesRemaining !== 1 ? 's' : ''}.
            {'\n\n'}
            Would you like to extend your session?
          </Text>
          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={[styles.button, styles.extendButton]}
              onPress={handleExtendSession}
            >
              <Text style={styles.extendButtonText}>Extend Session</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.dismissButton]}
              onPress={handleDismiss}
            >
              <Text style={styles.dismissButtonText}>Dismiss</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modal: {
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 20,
    margin: 20,
    minWidth: 300,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center',
    color: '#333',
  },
  message: {
    fontSize: 16,
    marginBottom: 20,
    textAlign: 'center',
    lineHeight: 22,
    color: '#666',
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  button: {
    flex: 1,
    padding: 12,
    borderRadius: 5,
    marginHorizontal: 5,
  },
  extendButton: {
    backgroundColor: '#48b6b0',
  },
  extendButtonText: {
    color: 'white',
    textAlign: 'center',
    fontWeight: 'bold',
    fontSize: 16,
  },
  dismissButton: {
    backgroundColor: '#f0f0f0',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  dismissButtonText: {
    color: '#333',
    textAlign: 'center',
    fontSize: 16,
  },
});

export default SessionWarningModal;