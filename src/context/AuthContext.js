import React, { createContext, useContext, useReducer, useEffect } from 'react';
import AuthenticationService from '../services/AuthenticationService';
import TokenStorageService from '../services/TokenStorageService';
import FamilyTimeService from '../services/FamilyTimeService';
import DataMigrationService from '../services/DataMigrationService';
import AuthenticationInitializer from '../services/AuthenticationInitializer';
import AuthenticationStateManager from '../services/AuthenticationStateManager';
import { SessionTimeoutManager } from '../utils/authGuards';

// Initial authentication state
const initialState = {
  isAuthenticated: false,
  user: null,
  tokens: null,
  loading: true,
  error: null,
  isInitialized: false,
  sessionWarning: false,
  sessionMinutesRemaining: 0,
  migrationStatus: null,
};

// Authentication action types
const AUTH_ACTIONS = {
  SET_LOADING: 'SET_LOADING',
  SET_AUTHENTICATED: 'SET_AUTHENTICATED',
  SET_UNAUTHENTICATED: 'SET_UNAUTHENTICATED',
  SET_USER: 'SET_USER',
  SET_ERROR: 'SET_ERROR',
  CLEAR_ERROR: 'CLEAR_ERROR',
  SET_INITIALIZED: 'SET_INITIALIZED',
  SET_SESSION_WARNING: 'SET_SESSION_WARNING',
  CLEAR_SESSION_WARNING: 'CLEAR_SESSION_WARNING',
  SET_MIGRATION_STATUS: 'SET_MIGRATION_STATUS',
};

// Authentication reducer
function authReducer(state, action) {
  switch (action.type) {
    case AUTH_ACTIONS.SET_LOADING:
      return {
        ...state,
        loading: action.payload,
      };

    case AUTH_ACTIONS.SET_AUTHENTICATED:
      return {
        ...state,
        isAuthenticated: true,
        user: action.payload.user,
        tokens: action.payload.tokens,
        loading: false,
        error: null,
      };

    case AUTH_ACTIONS.SET_UNAUTHENTICATED:
      return {
        ...state,
        isAuthenticated: false,
        user: null,
        tokens: null,
        loading: false,
        error: null,
      };

    case AUTH_ACTIONS.SET_USER:
      return {
        ...state,
        user: action.payload,
      };

    case AUTH_ACTIONS.SET_ERROR:
      return {
        ...state,
        error: action.payload,
        loading: false,
      };

    case AUTH_ACTIONS.CLEAR_ERROR:
      return {
        ...state,
        error: null,
      };

    case AUTH_ACTIONS.SET_INITIALIZED:
      return {
        ...state,
        isInitialized: true,
        loading: false,
      };

    case AUTH_ACTIONS.SET_SESSION_WARNING:
      return {
        ...state,
        sessionWarning: true,
        sessionMinutesRemaining: action.payload,
      };

    case AUTH_ACTIONS.CLEAR_SESSION_WARNING:
      return {
        ...state,
        sessionWarning: false,
        sessionMinutesRemaining: 0,
      };

    case AUTH_ACTIONS.SET_MIGRATION_STATUS:
      return {
        ...state,
        migrationStatus: action.payload,
      };

    default:
      return state;
  }
}

// Create authentication context
const AuthContext = createContext(null);

// Custom hook to use authentication context
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

// Authentication provider component
export function AuthProvider({ children }) {
  const [state, dispatch] = useReducer(authReducer, initialState);

  /**
   * Perform fresh authentication check
   */
  const performFreshAuthenticationCheck = async () => {    
    // Check if user is already authenticated
    const isAuthenticated = await AuthenticationService.isAuthenticated();
    
    if (isAuthenticated) {
      try {
        // Get current user and tokens
        const [user, tokens] = await Promise.all([
          AuthenticationService.getCurrentUser(),
          AuthenticationService.getTokens(),
        ]);

        if (user && tokens) {
          dispatch({
            type: AUTH_ACTIONS.SET_AUTHENTICATED,
            payload: { user, tokens },
          });

          // Synchronize with persistence
          await AuthenticationStateManager.synchronizeWithPersistence('fresh_auth_check');

          // Handle data migration if needed
          await handleDataMigration();

          // Start session timeout monitoring
          startSessionMonitoring();
        } else {
          // User or tokens are null, treat as unauthenticated
          dispatch({ type: AUTH_ACTIONS.SET_UNAUTHENTICATED });
        }
      } catch (error) {
        // Handle errors during user/token retrieval (e.g., revoked tokens)
        console.error('[AuthContext] Error during authentication verification:', error.message);
        dispatch({ type: AUTH_ACTIONS.SET_UNAUTHENTICATED });
      }
    } else {
      dispatch({ type: AUTH_ACTIONS.SET_UNAUTHENTICATED });
    }
  };

  /**
   * Initialize authentication state on app launch
   */
  const initializeAuth = async () => {
    try {
      dispatch({ type: AUTH_ACTIONS.SET_LOADING, payload: true });

      // Initialize authentication services including proactive token refresh and state persistence
      await AuthenticationInitializer.initialize({
        enableProactiveRefresh: true,
        enableBackgroundRefresh: true,
        proactiveThreshold: 10 * 60 * 1000, // 10 minutes
        backgroundInterval: 5 * 60 * 1000,   // 5 minutes
        enableStatePersistence: true,
        enableAppStateMonitoring: true,
        cacheExpiryDuration: 15 * 60 * 1000, // 15 minutes
        backgroundGracePeriod: 30 * 60 * 1000 // 30 minutes
      });

      // Initialize FamilyTimeService with authentication services
      FamilyTimeService.initialize(AuthenticationService, TokenStorageService);

      // Try to restore authentication state from persistence first
      const stateRestored = await AuthenticationStateManager.restoreFromPersistence();
      
      if (stateRestored) {
        const authState = AuthenticationStateManager.getAuthenticationState();
        
        if (authState.isAuthenticated && authState.userId) {
          // Get current user and tokens to verify they're still valid
          try {
            const [user, tokens] = await Promise.all([
              AuthenticationService.getCurrentUser(),
              AuthenticationService.getTokens(),
            ]);

            if (user && tokens) {
              dispatch({
                type: AUTH_ACTIONS.SET_AUTHENTICATED,
                payload: { user, tokens },
              });

              // Handle data migration if needed
              await handleDataMigration();

              // Start session timeout monitoring
              startSessionMonitoring();
            } else {
              // Tokens are invalid, clear state and proceed with fresh authentication check
              await AuthenticationStateManager.clearAuthenticationState();
              dispatch({ type: AUTH_ACTIONS.SET_UNAUTHENTICATED });
            }
          } catch (error) {
            // Proceed with fresh authentication check
            await performFreshAuthenticationCheck();
          }
        } else {
          dispatch({ type: AUTH_ACTIONS.SET_UNAUTHENTICATED });
        }
      } else {
        // No persisted state, perform fresh authentication check
        await performFreshAuthenticationCheck();
      }

      // Set up authentication state synchronization listener
      const unsubscribeSync = AuthenticationStateManager.addSyncListener((eventType, eventData) => {
        
        if (eventType === 'state_synchronized' && eventData.authState) {
          const authState = eventData.authState;
          if (authState.isAuthenticated && authState.userId) {
            // Update context state if authentication is valid
            AuthenticationService.getCurrentUser().then(user => {
              if (user) {
                dispatch({
                  type: AUTH_ACTIONS.SET_AUTHENTICATED,
                  payload: { user, tokens: null }, // Tokens will be fetched as needed
                });
              }
            }).catch(error => {
              console.error('[AuthContext] Error updating user after sync:', error);
            });
          } else if (!authState.isAuthenticated) {
            dispatch({ type: AUTH_ACTIONS.SET_UNAUTHENTICATED });
          }
        }
      });

      // Store unsubscribe function for cleanup
      window._authSyncUnsubscribe = unsubscribeSync;
    } catch (error) {
      dispatch({ type: AUTH_ACTIONS.SET_UNAUTHENTICATED });
    } finally {
      dispatch({ type: AUTH_ACTIONS.SET_INITIALIZED });
    }
  };

  /**
   * Handle data migration for authenticated users
   */
  const handleDataMigration = async () => {
    try {
      const migrationResult = await DataMigrationService.handleAppStartupMigration();
      dispatch({ type: AUTH_ACTIONS.SET_MIGRATION_STATUS, payload: migrationResult });
      
      if (migrationResult.migrationPerformed) {
        console.log('Data migration completed:', migrationResult.migrationResult);
      }
    } catch (error) {
      console.error('Error during data migration:', error);
    }
  };

  /**
   * Start session timeout monitoring
   */
  const startSessionMonitoring = () => {
    const handleSessionExpired = () => {
      dispatch({ type: AUTH_ACTIONS.SET_UNAUTHENTICATED });
      SessionTimeoutManager.stopMonitoring();
    };

    const handleSessionWarning = (minutesRemaining) => {
      dispatch({ type: AUTH_ACTIONS.SET_SESSION_WARNING, payload: minutesRemaining });
    };

    SessionTimeoutManager.startMonitoring(handleSessionExpired, handleSessionWarning);
  };

  /**
   * Stop session timeout monitoring
   */
  const stopSessionMonitoring = () => {
    SessionTimeoutManager.stopMonitoring();
    dispatch({ type: AUTH_ACTIONS.CLEAR_SESSION_WARNING });
  };

  /**
   * Sign in user
   */
  const signIn = async (email, password) => {
    try {
      dispatch({ type: AUTH_ACTIONS.SET_LOADING, payload: true });
      dispatch({ type: AUTH_ACTIONS.CLEAR_ERROR });

      const result = await AuthenticationService.signIn(email, password);
      
      if (result.success) {
        dispatch({
          type: AUTH_ACTIONS.SET_AUTHENTICATED,
          payload: {
            user: result.user,
            tokens: result.tokens,
          },
        });

        // Synchronize authentication state with persistence
        await AuthenticationStateManager.synchronizeWithPersistence('sign_in');

        // Handle data migration for newly signed in user
        await handleDataMigration();

        // Start session monitoring
        startSessionMonitoring();

        return { success: true };
      } else {
        throw new Error('Sign in failed');
      }
    } catch (error) {
      dispatch({ type: AUTH_ACTIONS.SET_ERROR, payload: error.message });
      throw error;
    }
  };

  /**
   * Sign up new user
   */
  const signUp = async (userData) => {
    try {
      dispatch({ type: AUTH_ACTIONS.SET_LOADING, payload: true });
      dispatch({ type: AUTH_ACTIONS.CLEAR_ERROR });

      const result = await AuthenticationService.signUp(userData);
      
      if (result.success) {
        dispatch({ type: AUTH_ACTIONS.SET_LOADING, payload: false });
        return { success: true, userSub: result.userSub };
      } else {
        throw new Error('Sign up failed');
      }
    } catch (error) {
      dispatch({ type: AUTH_ACTIONS.SET_ERROR, payload: error.message });
      throw error;
    }
  };

  /**
   * Confirm sign up with verification code
   */
  const confirmSignUp = async (email, code) => {
    try {
      dispatch({ type: AUTH_ACTIONS.SET_LOADING, payload: true });
      dispatch({ type: AUTH_ACTIONS.CLEAR_ERROR });

      const result = await AuthenticationService.confirmSignUp(email, code);
      
      if (result.success) {
        dispatch({ type: AUTH_ACTIONS.SET_LOADING, payload: false });
        return { success: true };
      } else {
        throw new Error('Email verification failed');
      }
    } catch (error) {
      dispatch({ type: AUTH_ACTIONS.SET_ERROR, payload: error.message });
      throw error;
    }
  };

  /**
   * Sign out user
   */
  const signOut = async () => {
    try {
      dispatch({ type: AUTH_ACTIONS.SET_LOADING, payload: true });

      // Stop session monitoring
      stopSessionMonitoring();

      await AuthenticationService.signOut();
      
      // Clear authentication state and persistence
      await AuthenticationStateManager.clearAuthenticationState();
      
      dispatch({ type: AUTH_ACTIONS.SET_UNAUTHENTICATED });
      
      return { success: true };
    } catch (error) {
      console.error('Sign out error:', error);
      // Even if sign out fails, clear local state and stop monitoring
      stopSessionMonitoring();
      
      // Clear authentication state and persistence
      try {
        await AuthenticationStateManager.clearAuthenticationState();
      } catch (clearError) {
        console.error('[AuthContext] Error clearing authentication state:', clearError);
      }
      
      dispatch({ type: AUTH_ACTIONS.SET_UNAUTHENTICATED });
      return { success: true };
    }
  };

  /**
   * Update user profile
   */
  const updateUserProfile = async (attributes) => {
    try {
      dispatch({ type: AUTH_ACTIONS.SET_LOADING, payload: true });
      dispatch({ type: AUTH_ACTIONS.CLEAR_ERROR });

      const result = await AuthenticationService.updateUserAttributes(attributes);
      
      if (result.success && result.user) {
        dispatch({ type: AUTH_ACTIONS.SET_USER, payload: result.user });
        dispatch({ type: AUTH_ACTIONS.SET_LOADING, payload: false });
        return { success: true, user: result.user };
      } else {
        throw new Error('Profile update failed');
      }
    } catch (error) {
      dispatch({ type: AUTH_ACTIONS.SET_ERROR, payload: error.message });
      //dispatch({ type: AUTH_ACTIONS.SET_LOADING, payload: false }); // Fix: Clear loading state on error
      throw error;
    }
  };

  /**
   * Change user password
   */
  const changePassword = async (currentPassword, newPassword) => {
    try {
      dispatch({ type: AUTH_ACTIONS.SET_LOADING, payload: true });
      dispatch({ type: AUTH_ACTIONS.CLEAR_ERROR });

      const result = await AuthenticationService.changePassword(currentPassword, newPassword);
      
      if (result.success) {
        dispatch({ type: AUTH_ACTIONS.SET_LOADING, payload: false });
        return { success: true };
      } else {
        throw new Error('Password change failed');
      }
    } catch (error) {
      dispatch({ type: AUTH_ACTIONS.SET_ERROR, payload: error.message });
      //dispatch({ type: AUTH_ACTIONS.SET_LOADING, payload: false }); // Fix: Clear loading state on error
      throw error;
    }
  };

  /**
   * Forgot password
   */
  const forgotPassword = async (email) => {
    try {
      dispatch({ type: AUTH_ACTIONS.SET_LOADING, payload: true });
      dispatch({ type: AUTH_ACTIONS.CLEAR_ERROR });

      const result = await AuthenticationService.forgotPassword(email);
      
      if (result.success) {
        dispatch({ type: AUTH_ACTIONS.SET_LOADING, payload: false });
        return { success: true };
      } else {
        throw new Error('Password reset request failed');
      }
    } catch (error) {
      dispatch({ type: AUTH_ACTIONS.SET_ERROR, payload: error.message });
      throw error;
    }
  };

  /**
   * Confirm forgot password
   */
  const confirmForgotPassword = async (email, code, newPassword) => {
    try {
      dispatch({ type: AUTH_ACTIONS.SET_LOADING, payload: true });
      dispatch({ type: AUTH_ACTIONS.CLEAR_ERROR });

      const result = await AuthenticationService.confirmForgotPassword(email, code, newPassword);
      
      if (result.success) {
        dispatch({ type: AUTH_ACTIONS.SET_LOADING, payload: false });
        return { success: true };
      } else {
        throw new Error('Password reset failed');
      }
    } catch (error) {
      dispatch({ type: AUTH_ACTIONS.SET_ERROR, payload: error.message });
      throw error;
    }
  };

  /**
   * Resend confirmation code
   */
  const resendConfirmationCode = async (email) => {
    try {
      dispatch({ type: AUTH_ACTIONS.SET_LOADING, payload: true });
      dispatch({ type: AUTH_ACTIONS.CLEAR_ERROR });

      const result = await AuthenticationService.resendConfirmationCode(email);
      
      if (result.success) {
        dispatch({ type: AUTH_ACTIONS.SET_LOADING, payload: false });
        return { success: true };
      } else {
        throw new Error('Resend confirmation code failed');
      }
    } catch (error) {
      dispatch({ type: AUTH_ACTIONS.SET_ERROR, payload: error.message });
      throw error;
    }
  };

  /**
   * Clear authentication error
   */
  const clearError = () => {
    dispatch({ type: AUTH_ACTIONS.CLEAR_ERROR });
  };

  /**
   * Refresh authentication tokens
   */
  const refreshTokens = async () => {
    try {
      const success = await AuthenticationService.refreshTokens();
      
      if (success) {
        // Get updated tokens and user
        const [user, tokens] = await Promise.all([
          AuthenticationService.getCurrentUser(),
          AuthenticationService.getTokens(),
        ]);

        if (user && tokens) {
          dispatch({
            type: AUTH_ACTIONS.SET_AUTHENTICATED,
            payload: { user, tokens },
          });
          return true;
        }
      }
      
      // If refresh failed, sign out user
      stopSessionMonitoring();
      dispatch({ type: AUTH_ACTIONS.SET_UNAUTHENTICATED });
      return false;
    } catch (error) {
      console.error('Token refresh error:', error);
      stopSessionMonitoring();
      dispatch({ type: AUTH_ACTIONS.SET_UNAUTHENTICATED });
      return false;
    }
  };

  /**
   * Extend session by refreshing tokens
   */
  const extendSession = async () => {
    try {
      const success = await SessionTimeoutManager.extendSession();
      if (success) {
        dispatch({ type: AUTH_ACTIONS.CLEAR_SESSION_WARNING });
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error extending session:', error);
      return false;
    }
  };

  /**
   * Dismiss session warning
   */
  const dismissSessionWarning = () => {
    dispatch({ type: AUTH_ACTIONS.CLEAR_SESSION_WARNING });
  };

  /**
   * Force data migration (for testing/recovery)
   */
  const forceMigration = async () => {
    try {
      const migrationResult = await DataMigrationService.forceMigration();
      dispatch({ type: AUTH_ACTIONS.SET_MIGRATION_STATUS, payload: migrationResult });
      return migrationResult;
    } catch (error) {
      console.error('Error forcing migration:', error);
      return { success: false, error: error.message };
    }
  };

  // Initialize authentication on mount
  useEffect(() => {
    initializeAuth();

    // Cleanup on unmount
    return () => {
      stopSessionMonitoring();
      
      // Clean up sync listener
      if (window._authSyncUnsubscribe) {
        window._authSyncUnsubscribe();
        delete window._authSyncUnsubscribe;
      }
      
      // Shutdown authentication services
      try {
        AuthenticationInitializer.shutdown();
      } catch (error) {
        console.error('[AuthContext] Error shutting down authentication services:', error);
      }
    };
  }, []);

  // Note: Automatic token refresh is now handled by ProactiveTokenRefreshService
  // The background refresh service will monitor and refresh tokens proactively

  // Context value
  const contextValue = {
    // State
    isAuthenticated: state.isAuthenticated,
    user: state.user,
    tokens: state.tokens,
    loading: state.loading,
    error: state.error,
    isInitialized: state.isInitialized,
    sessionWarning: state.sessionWarning,
    sessionMinutesRemaining: state.sessionMinutesRemaining,
    migrationStatus: state.migrationStatus,

    // Actions
    signIn,
    signUp,
    confirmSignUp,
    signOut,
    updateUserProfile,
    changePassword,
    forgotPassword,
    confirmForgotPassword,
    resendConfirmationCode,
    clearError,
    refreshTokens,
    extendSession,
    dismissSessionWarning,
    forceMigration,
  };

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}

export default AuthContext;