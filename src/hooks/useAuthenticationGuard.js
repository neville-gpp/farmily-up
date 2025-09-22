import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigation } from '@react-navigation/native';
import AuthenticationStateManager from '../services/AuthenticationStateManager';
import AuthenticationError from '../services/AuthenticationError';
import AuthenticationInitializer from '../services/AuthenticationInitializer';

/**
 * Enhanced authentication guard hook with comprehensive error handling and retry mechanisms
 * Integrates with AuthenticationStateManager for centralized authentication state management
 * @param {Object} options - Configuration options
 * @returns {Object} Authentication state, error handling, and retry mechanisms
 */
export const useAuthenticationGuard = (options = {}) => {
  const {
    redirectOnUnauthenticated = true,
    checkInterval = 60000, // Check every minute
    maxRetryAttempts = 3,
    retryDelay = 1000,
    enableProactiveRefresh = true,
    proactiveRefreshThreshold = 5 * 60 * 1000, // 5 minutes before expiry
  } = options;

  // State management
  const [authState, setAuthState] = useState({
    isAuthenticated: false,
    isLoading: true,
    error: null,
    userId: null,
    lastCheck: null,
    isRefreshing: false,
    retryCount: 0,
  });

  // Refs for cleanup and state management
  const checkIntervalRef = useRef(null);
  const proactiveRefreshTimeoutRef = useRef(null);
  const retryTimeoutRef = useRef(null);
  const mountedRef = useRef(true);

  // Context and navigation
  const { isAuthenticated: contextAuth, user, loading: contextLoading, refreshTokens } = useAuth();
  const navigation = useNavigation();

  /**
   * Update authentication state safely (only if component is mounted)
   */
  const updateAuthState = useCallback((updates) => {
    if (mountedRef.current) {
      setAuthState(prev => ({
        ...prev,
        ...updates,
        lastCheck: Date.now(),
      }));
    }
  }, []);

  /**
   * Log authentication events for debugging
   */
  const logAuthEvent = useCallback((event, data = {}) => {
    console.log(`[useAuthenticationGuard] ${event}:`, {
      timestamp: new Date().toISOString(),
      ...data,
      authState: {
        isAuthenticated: authState.isAuthenticated,
        isLoading: authState.isLoading,
        hasError: !!authState.error,
        retryCount: authState.retryCount,
      },
    });
  }, [authState]);

  /**
   * Check authentication status using AuthenticationStateManager
   */
  const checkAuthentication = useCallback(async (isRetry = false) => {
    try {
      if (!isRetry) {
        updateAuthState({ isLoading: true, error: null });
      }

      // Use AuthenticationStateManager for centralized authentication
      const userId = await AuthenticationStateManager.getCurrentUserId();
      
      if (userId) {
        updateAuthState({
          isAuthenticated: true,
          isLoading: false,
          error: null,
          userId,
          retryCount: 0,
        });
        
        return true;
      } else {
        throw new AuthenticationError(
          'No user ID available',
          AuthenticationError.ERROR_CODES.TOKEN_MISSING,
          true
        );
      }
      
    } catch (error) {
      logAuthEvent('checkAuthentication_error', { 
        error: error.message, 
        code: error.code,
        recoverable: error.recoverable 
      });

      const authError = AuthenticationError.isAuthenticationError(error) 
        ? error 
        : AuthenticationError.fromError(error, { operation: 'checkAuthentication' });

      updateAuthState({
        isAuthenticated: false,
        isLoading: false,
        error: authError,
        userId: null,
      });

      return false;
    }
  }, [updateAuthState, logAuthEvent]);

  /**
   * Retry authentication with exponential backoff
   */
  const retryAuthentication = useCallback(async () => {
    if (authState.retryCount >= maxRetryAttempts) {
      logAuthEvent('retryAuthentication_maxAttemptsReached', { 
        retryCount: authState.retryCount,
        maxRetryAttempts 
      });
      return false;
    }

    const currentRetryCount = authState.retryCount + 1;
    const delay = authState.error?.getRetryDelay?.(currentRetryCount) || (retryDelay * currentRetryCount);

    logAuthEvent('retryAuthentication_scheduled', { 
      retryCount: currentRetryCount,
      delay 
    });

    updateAuthState({ retryCount: currentRetryCount });

    return new Promise((resolve) => {
      retryTimeoutRef.current = setTimeout(async () => {
        if (mountedRef.current) {
          const success = await checkAuthentication(true);
          resolve(success);
        } else {
          resolve(false);
        }
      }, delay);
    });
  }, [authState.retryCount, authState.error, maxRetryAttempts, retryDelay, updateAuthState, logAuthEvent, checkAuthentication]);

  /**
   * Handle authentication errors with recovery strategies
   */
  const handleAuthenticationError = useCallback(async (error) => {
    logAuthEvent('handleAuthenticationError_started', { 
      error: error.message,
      code: error.code,
      recoverable: error.recoverable 
    });

    try {
      // Attempt recovery using AuthenticationStateManager
      const recovered = await AuthenticationStateManager.handleAuthenticationError(error);
      
      if (recovered) {
        logAuthEvent('handleAuthenticationError_recovered');
        // Re-check authentication after recovery
        return await checkAuthentication(true);
      } else {
        logAuthEvent('handleAuthenticationError_recoveryFailed');
        
        // If recovery failed but error is retryable, attempt retry
        if (error.shouldRetry?.() && authState.retryCount < maxRetryAttempts) {
          return await retryAuthentication();
        }
        
        return false;
      }
    } catch (recoveryError) {
      logAuthEvent('handleAuthenticationError_recoveryError', { 
        recoveryError: recoveryError.message 
      });
      return false;
    }
  }, [logAuthEvent, checkAuthentication, retryAuthentication, authState.retryCount, maxRetryAttempts]);

  /**
   * Manual retry function for UI components
   */
  const retry = useCallback(async () => {
    logAuthEvent('retry_manual');
    
    // Reset retry count for manual retry
    updateAuthState({ retryCount: 0, error: null });
    
    const success = await checkAuthentication();
    
    if (!success && authState.error) {
      return await handleAuthenticationError(authState.error);
    }
    
    return success;
  }, [updateAuthState, logAuthEvent, checkAuthentication, handleAuthenticationError, authState.error]);

  /**
   * Proactive token refresh before expiry
   */
  const scheduleProactiveRefresh = useCallback(() => {
    if (!enableProactiveRefresh || !authState.isAuthenticated) {
      return;
    }

    // Clear existing timeout
    if (proactiveRefreshTimeoutRef.current) {
      clearTimeout(proactiveRefreshTimeoutRef.current);
    }

    // Schedule proactive refresh
    proactiveRefreshTimeoutRef.current = setTimeout(async () => {
      if (mountedRef.current && authState.isAuthenticated) {
        logAuthEvent('proactiveRefresh_triggered');
        
        try {
          updateAuthState({ isRefreshing: true });
          await AuthenticationStateManager.refreshTokensIfNeeded();
          await checkAuthentication();
        } catch (error) {
          logAuthEvent('proactiveRefresh_error', { error: error.message });
          await handleAuthenticationError(error);
        } finally {
          if (mountedRef.current) {
            updateAuthState({ isRefreshing: false });
          }
        }
      }
    }, proactiveRefreshThreshold);
  }, [enableProactiveRefresh, authState.isAuthenticated, proactiveRefreshThreshold, updateAuthState, logAuthEvent, checkAuthentication, handleAuthenticationError]);

  /**
   * Set up periodic authentication monitoring
   */
  const setupPeriodicCheck = useCallback(() => {
    if (checkInterval <= 0) {
      return;
    }

    // Clear existing interval
    if (checkIntervalRef.current) {
      clearInterval(checkIntervalRef.current);
    }

    checkIntervalRef.current = setInterval(async () => {
      if (mountedRef.current && authState.isAuthenticated) {
        logAuthEvent('periodicCheck_triggered');
        
        try {
          // Check if authentication state is still valid
          const authStateData = AuthenticationStateManager.getAuthenticationState();
          
          if (!authStateData.isCacheValid || authStateData.error) {
            logAuthEvent('periodicCheck_stateInvalid', { authStateData });
            await checkAuthentication();
          }
        } catch (error) {
          logAuthEvent('periodicCheck_error', { error: error.message });
          await handleAuthenticationError(AuthenticationError.fromError(error));
        }
      }
    }, checkInterval);
  }, [checkInterval, authState.isAuthenticated, logAuthEvent, checkAuthentication, handleAuthenticationError]);

  // Initialize authentication on mount
  useEffect(() => {
    // Ensure AuthenticationStateManager is initialized
    if (!AuthenticationInitializer.isInitialized()) {
      try {
        AuthenticationInitializer.initialize();
      } catch (error) {
        logAuthEvent('initialization_error', { error: error.message });
        updateAuthState({
          isAuthenticated: false,
          isLoading: false,
          error: new AuthenticationError(
            'Failed to initialize authentication system',
            AuthenticationError.ERROR_CODES.UNKNOWN_ERROR,
            false,
            { operation: 'initialization', service: 'useAuthenticationGuard' }
          ),
          userId: null,
        });
        return;
      }
    }

    checkAuthentication();
  }, [checkAuthentication, logAuthEvent, updateAuthState]);

  // Handle context authentication changes
  useEffect(() => {
    if (!contextLoading) {
      if (contextAuth && user) {
        // Context indicates user is authenticated
        if (!authState.isAuthenticated) {
          updateAuthState({
            isAuthenticated: true,
            isLoading: false,
            error: null,
            userId: user.userId || user.id,
            retryCount: 0,
          });
        }
      } else {
        // Context indicates user is not authenticated
        if (authState.isAuthenticated) {
          logAuthEvent('context_unauthenticated');
          updateAuthState({
            isAuthenticated: false,
            isLoading: false,
            error: new AuthenticationError(
              'Authentication lost in context',
              AuthenticationError.ERROR_CODES.TOKEN_MISSING,
              true
            ),
            userId: null,
          });
        }
      }
    }
  }, [contextAuth, contextLoading, user, authState.isAuthenticated, updateAuthState, logAuthEvent]);

  // Set up periodic checks and proactive refresh
  useEffect(() => {
    if (authState.isAuthenticated) {
      setupPeriodicCheck();
      scheduleProactiveRefresh();
    }
  }, [authState.isAuthenticated, setupPeriodicCheck, scheduleProactiveRefresh]);

  // Handle redirect on unauthenticated
  useEffect(() => {
    if (!authState.isLoading && !authState.isAuthenticated && redirectOnUnauthenticated) {
      // Only redirect if error is not recoverable or max retries reached
      const shouldRedirect = !authState.error || 
                           !authState.error.canRecover() || 
                           authState.retryCount >= maxRetryAttempts;
      
      if (shouldRedirect) {
        logAuthEvent('redirecting_to_login', { 
          error: authState.error?.message,
          retryCount: authState.retryCount 
        });
        
        navigation.reset({
          index: 0,
          routes: [{ name: 'Login' }],
        });
      }
    }
  }, [
    authState.isLoading, 
    authState.isAuthenticated, 
    authState.error, 
    authState.retryCount,
    redirectOnUnauthenticated, 
    maxRetryAttempts,
    navigation, 
    logAuthEvent
  ]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
      }
      
      if (proactiveRefreshTimeoutRef.current) {
        clearTimeout(proactiveRefreshTimeoutRef.current);
      }
      
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
      
    };
  }, [logAuthEvent]);

  return {
    isAuthenticated: authState.isAuthenticated,
    isLoading: authState.isLoading,
    error: authState.error,
    userId: authState.userId,
    isRefreshing: authState.isRefreshing,
    retryCount: authState.retryCount,
    canRetry: authState.error?.shouldRetry?.() && authState.retryCount < maxRetryAttempts,
    retry,
    lastCheck: authState.lastCheck,
    isGuarded: true,
  };
};

/**
 * Hook specifically for screens that require authentication
 * Will show loading state until authentication is verified
 * Provides enhanced error handling and retry mechanisms
 * @param {Object} options - Configuration options
 * @returns {Object} Authentication state with loading and content display logic
 */
export const useRequireAuth = (options = {}) => {
  const authState = useAuthenticationGuard(options);

  // Determine content display logic based on authentication state
  const shouldShowLoading = authState.isLoading || authState.isRefreshing;
  const shouldShowContent = authState.isAuthenticated && !shouldShowLoading;
  const shouldShowError = !authState.isLoading && !authState.isAuthenticated && !!authState.error;
  const shouldShowRetry = shouldShowError && authState.canRetry;

  return {
    ...authState,
    shouldShowContent,
    shouldShowLoading,
    shouldShowError,
    shouldShowRetry,
    
    // Helper methods for UI components
    getErrorMessage: () => authState.error?.getUserMessage?.() || authState.error?.message || 'Authentication error',
    isRecoverableError: () => authState.error?.canRecover?.() || false,
    getRetryDelay: () => authState.error?.getRetryDelay?.(authState.retryCount + 1) || 1000,
  };
};

export default useAuthenticationGuard;
