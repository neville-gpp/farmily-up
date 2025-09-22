import React, { useEffect, useState } from 'react';
import { Alert, View, Text, ActivityIndicator, StyleSheet, Modal, TouchableOpacity } from 'react-native';
import AuthenticationService from '../services/AuthenticationService';
import TokenStorageService from '../services/TokenStorageService';

/**
 * Authentication guard utilities for protecting screens and handling session management
 */

/**
 * Hook to check authentication status and handle automatic logout
 * @param {Object} navigation - Navigation object for redirecting to login
 * @returns {Object} Authentication state and handlers
 */
export const useAuthGuard = (navigation) => {
  const [isAuthenticated, setIsAuthenticated] = useState(null); // null = checking, true/false = result
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState(null);

  useEffect(() => {
    checkAuthenticationStatus();
  }, []);

  const checkAuthenticationStatus = async () => {
    try {
      setIsLoading(true);
      
      // Check if user is authenticated
      const authenticated = await AuthenticationService.isAuthenticated();
      
      if (authenticated) {
        // Get current user profile
        const currentUser = await AuthenticationService.getCurrentUser();
        setUser(currentUser);
        setIsAuthenticated(true);
      } else {
        setUser(null);
        setIsAuthenticated(false);
        // Redirect to login if not authenticated
        handleUnauthenticated();
      }
    } catch (error) {
      console.error('Error checking authentication status:', error);
      setUser(null);
      setIsAuthenticated(false);
      handleUnauthenticated();
    } finally {
      setIsLoading(false);
    }
  };

  const handleUnauthenticated = () => {
    // Clear any stored tokens
    TokenStorageService.clearTokens();
    
    // Navigate to login screen
    if (navigation) {
      navigation.reset({
        index: 0,
        routes: [{ name: 'Login' }],
      });
    }
  };

  const handleTokenExpiration = () => {
    Alert.alert(
      'Session Expired',
      'Your session has expired. Please log in again.',
      [
        {
          text: 'OK',
          onPress: handleUnauthenticated,
        },
      ],
      { cancelable: false }
    );
  };

  const refreshAuthentication = async () => {
    try {
      const refreshed = await AuthenticationService.refreshTokens();
      if (refreshed) {
        const currentUser = await AuthenticationService.getCurrentUser();
        setUser(currentUser);
        setIsAuthenticated(true);
        return true;
      } else {
        handleTokenExpiration();
        return false;
      }
    } catch (error) {
      console.error('Error refreshing authentication:', error);
      handleTokenExpiration();
      return false;
    }
  };

  return {
    isAuthenticated,
    isLoading,
    user,
    checkAuthenticationStatus,
    refreshAuthentication,
    handleTokenExpiration,
    handleUnauthenticated
  };
};

/**
 * Higher-order component to protect screens with authentication
 * @param {Component} WrappedComponent - Component to protect
 * @param {Object} options - Configuration options
 * @returns {Component} Protected component
 */
export const withAuthGuard = (WrappedComponent, options = {}) => {
  const {
    showLoadingScreen = true,
    checkInterval = 60000, // Check every minute
  } = options;

  return function AuthGuardedComponent(props) {
    const { navigation } = props;
    const {
      isAuthenticated,
      isLoading,
      user,
      checkAuthenticationStatus,
      refreshAuthentication,
      handleTokenExpiration
    } = useAuthGuard(navigation);

    // Set up periodic authentication checks
    useEffect(() => {
      if (isAuthenticated && checkInterval > 0) {
        const interval = setInterval(async () => {
          const stillAuthenticated = await AuthenticationService.isAuthenticated();
          if (!stillAuthenticated) {
            handleTokenExpiration();
          }
        }, checkInterval);

        return () => clearInterval(interval);
      }
    }, [isAuthenticated, checkInterval]);

    // Show loading screen while checking authentication
    if (isLoading && showLoadingScreen) {
      return <LoadingScreen />;
    }

    // If not authenticated, the useAuthGuard hook will handle redirection
    if (!isAuthenticated) {
      return null;
    }

    // Render the protected component with additional auth props
    return (
      <WrappedComponent
        {...props}
        user={user}
        isAuthenticated={isAuthenticated}
        refreshAuthentication={refreshAuthentication}
        checkAuthenticationStatus={checkAuthenticationStatus}
      />
    );
  };
};

/**
 * Simple loading screen component
 */
const LoadingScreen = () => {
  return (
    <View style={loadingStyles.loadingContainer}>
      <ActivityIndicator size="large" color="#48b6b0" />
      <Text style={loadingStyles.loadingText}>Checking authentication...</Text>
    </View>
  );
};

const loadingStyles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
});

/**
 * Session timeout manager
 */
export class SessionTimeoutManager {
  static WARNING_TIME = 5 * 60 * 1000; // 5 minutes before expiration
  static CHECK_INTERVAL = 30 * 1000; // Check every 30 seconds
  
  static warningTimer = null;
  static checkTimer = null;
  static onSessionExpired = null;
  static onSessionWarning = null;

  /**
   * Start session timeout monitoring
   * @param {Function} onExpired - Callback when session expires
   * @param {Function} onWarning - Callback when session is about to expire
   */
  static startMonitoring(onExpired, onWarning) {
    this.onSessionExpired = onExpired;
    this.onSessionWarning = onWarning;

    // Start periodic checks
    this.checkTimer = setInterval(() => {
      this.checkTokenExpiration();
    }, this.CHECK_INTERVAL);
  }

  /**
   * Stop session timeout monitoring
   */
  static stopMonitoring() {
    if (this.warningTimer) {
      clearTimeout(this.warningTimer);
      this.warningTimer = null;
    }

    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }

    this.onSessionExpired = null;
    this.onSessionWarning = null;

    console.log('Session timeout monitoring stopped');
  }

  /**
   * Check if tokens are about to expire or have expired
   * @private
   */
  static async checkTokenExpiration() {
    try {
      const tokens = await TokenStorageService.getTokens();
      
      if (!tokens) {
        // No tokens, session already expired
        if (this.onSessionExpired) {
          this.onSessionExpired();
        }
        return;
      }

      const isExpired = await TokenStorageService.areTokensExpired();
      
      if (isExpired) {
        // Try to refresh tokens
        const refreshed = await AuthenticationService.refreshTokens();
        
        if (!refreshed && this.onSessionExpired) {
          this.onSessionExpired();
        }
        return;
      }

      // Check if tokens are about to expire
      const expirationTime = await TokenStorageService.getTokenExpirationTime();
      const currentTime = Date.now();
      const timeUntilExpiration = expirationTime - currentTime;

      if (timeUntilExpiration <= this.WARNING_TIME && timeUntilExpiration > 0) {
        // Show warning if not already shown
        if (!this.warningTimer && this.onSessionWarning) {
          this.onSessionWarning(Math.floor(timeUntilExpiration / 1000 / 60)); // Minutes remaining
          
          // Set timer to show expiration when time runs out
          this.warningTimer = setTimeout(() => {
            if (this.onSessionExpired) {
              this.onSessionExpired();
            }
          }, timeUntilExpiration);
        }
      }
    } catch (error) {
      console.error('Error checking token expiration:', error);
    }
  }

  /**
   * Extend session by refreshing tokens
   * @returns {Promise<boolean>} Success status
   */
  static async extendSession() {
    try {
      const refreshed = await AuthenticationService.refreshTokens();
      
      if (refreshed) {
        // Clear warning timer since session is extended
        if (this.warningTimer) {
          clearTimeout(this.warningTimer);
          this.warningTimer = null;
        }
        
        console.log('Session extended successfully');
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Error extending session:', error);
      return false;
    }
  }
}

/**
 * Hook for session timeout management
 * @param {Object} navigation - Navigation object
 * @returns {Object} Session management functions
 */
export const useSessionTimeout = (navigation) => {
  const [showWarning, setShowWarning] = useState(false);
  const [minutesRemaining, setMinutesRemaining] = useState(0);

  useEffect(() => {
    const handleSessionExpired = () => {
      setShowWarning(false);
      Alert.alert(
        'Session Expired',
        'Your session has expired. Please log in again.',
        [
          {
            text: 'OK',
            onPress: () => {
              TokenStorageService.clearTokens();
              navigation.reset({
                index: 0,
                routes: [{ name: 'Login' }],
              });
            },
          },
        ],
        { cancelable: false }
      );
    };

    const handleSessionWarning = (minutes) => {
      setMinutesRemaining(minutes);
      setShowWarning(true);
    };

    SessionTimeoutManager.startMonitoring(handleSessionExpired, handleSessionWarning);

    return () => {
      SessionTimeoutManager.stopMonitoring();
    };
  }, [navigation]);

  const extendSession = async () => {
    const extended = await SessionTimeoutManager.extendSession();
    if (extended) {
      setShowWarning(false);
    }
    return extended;
  };

  const dismissWarning = () => {
    setShowWarning(false);
  };

  return {
    showWarning,
    minutesRemaining,
    extendSession,
    dismissWarning
  };
};

/**
 * Session warning modal component
 */
export const SessionWarningModal = ({ visible, minutesRemaining, onExtend, onDismiss }) => {
  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <View style={sessionStyles.overlay}>
        <View style={sessionStyles.modal}>
          <Text style={sessionStyles.title}>Session Expiring</Text>
          <Text style={sessionStyles.message}>
            Your session will expire in {minutesRemaining} minute{minutesRemaining !== 1 ? 's' : ''}.
            Would you like to extend your session?
          </Text>
          <View style={sessionStyles.buttonContainer}>
            <TouchableOpacity
              style={[sessionStyles.button, sessionStyles.extendButton]}
              onPress={onExtend}
            >
              <Text style={sessionStyles.extendButtonText}>Extend Session</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[sessionStyles.button, sessionStyles.dismissButton]}
              onPress={onDismiss}
            >
              <Text style={sessionStyles.dismissButtonText}>Dismiss</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const sessionStyles = StyleSheet.create({
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
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center',
  },
  message: {
    fontSize: 16,
    marginBottom: 20,
    textAlign: 'center',
    lineHeight: 22,
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
  },
  dismissButton: {
    backgroundColor: '#f0f0f0',
  },
  dismissButtonText: {
    color: '#333',
    textAlign: 'center',
  },
});