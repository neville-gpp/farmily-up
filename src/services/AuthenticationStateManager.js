import AuthenticationError from './AuthenticationError.js';
import TokenRefreshCoordinator from './TokenRefreshCoordinator.js';

/**
 * AuthenticationStateManager provides centralized authentication state management
 * Coordinates between AuthenticationService and TokenStorageService to prevent race conditions
 * Integrates with AuthenticationStatePersistence for state caching and recovery
 */
class AuthenticationStateManager {
  static _authState = {
    isAuthenticated: false,
    userId: null,
    lastCheck: null,
    error: null,
    isRefreshing: false
  };

  // Cache duration for authentication checks (5 minutes)
  static AUTH_CACHE_DURATION = 5 * 60 * 1000;
  
  // Services will be injected to avoid circular dependencies
  static _authenticationService = null;
  static _tokenStorageService = null;
  static _persistenceService = null;

  // Coordination state to prevent multiple simultaneous authentication requests
  static _coordinationState = {
    isAuthenticating: false,
    authenticationPromise: null,
    waitingRequests: []
  };

  /**
   * Initialize the AuthenticationStateManager with required services
   * This prevents circular dependency issues
   */
  static initialize(authenticationService, tokenStorageService, persistenceService = null) {
    this._authenticationService = authenticationService;
    this._tokenStorageService = tokenStorageService;
    this._persistenceService = persistenceService;
    // Services initialized
  }

  /**
   * Get current user ID with centralized authentication management
   * @returns {Promise<string>} User ID
   * @throws {AuthenticationError} If user is not authenticated
   */
  static async getCurrentUserId() {
    try {
      this._logAuthenticationStateChange('getCurrentUserId', 'started');
      
      // Try to get from persistence cache first
      if (this._persistenceService) {
        const cachedState = await this._persistenceService.getCachedAuthState();
        if (cachedState && cachedState.isAuthenticated && cachedState.userId) {
          this._logAuthenticationStateChange('getCurrentUserId', 'persistence_cache_hit', { userId: cachedState.userId });
          
          // Update local state from cache
          this._authState.isAuthenticated = cachedState.isAuthenticated;
          this._authState.userId = cachedState.userId;
          this._authState.lastCheck = cachedState.lastCheck || Date.now();
          
          return cachedState.userId;
        }
      }
      
      // Check if we have a cached valid authentication state
      if (this._isCacheValid() && this._authState.userId) {
        this._logAuthenticationStateChange('getCurrentUserId', 'memory_cache_hit', { userId: this._authState.userId });
        return this._authState.userId;
      }

      // Use coordinated authentication to prevent race conditions
      const userId = await this._coordinatedAuthentication(async () => {
        await this.ensureAuthenticated();
        return this._authState.userId;
      });
      
      if (!userId) {
        const error = new AuthenticationError(
          'User ID not available after authentication',
          AuthenticationError.ERROR_CODES.TOKEN_MISSING,
          true,
          { operation: 'getCurrentUserId', service: 'AuthenticationStateManager' }
        );
        this._logAuthenticationError('getCurrentUserId', error);
        throw error;
      }

      this._logAuthenticationStateChange('getCurrentUserId', 'success', { userId });
      return userId;
      
    } catch (error) {
      this._logAuthenticationError('getCurrentUserId', error);
      
      // Update auth state with error and classify it
      const authError = this._classifyAndHandleError(error, 'getCurrentUserId');
      this._authState.error = authError;
      this._authState.isAuthenticated = false;
      this._authState.userId = null;
      
      // Update persistence cache with error state
      if (this._persistenceService) {
        await this._persistenceService.cacheAuthState(this._authState, {
          source: 'error_state',
          operation: 'getCurrentUserId'
        });
      }
      
      throw authError;
    }
  }

  /**
   * Ensure user is authenticated, refreshing tokens if necessary
   * @returns {Promise<void>}
   * @throws {AuthenticationError} If authentication fails
   */
  static async ensureAuthenticated() {
    try {
      this._logAuthenticationStateChange('ensureAuthenticated', 'started');

      // Check if we have valid cached authentication
      if (this._isCacheValid() && this._authState.isAuthenticated && this._authState.userId) {
        this._logAuthenticationStateChange('ensureAuthenticated', 'cache_valid');
        return;
      }

      // Check services are initialized
      if (!this._authenticationService || !this._tokenStorageService) {
        const error = new AuthenticationError(
          'AuthenticationStateManager not properly initialized',
          AuthenticationError.ERROR_CODES.UNKNOWN_ERROR,
          false,
          { operation: 'ensureAuthenticated', service: 'AuthenticationStateManager' }
        );
        this._logAuthenticationError('ensureAuthenticated', error);
        throw error;
      }

      // Try to get current user from AuthenticationService with recovery
      let currentUser = null;
      try {
        this._logAuthenticationStateChange('ensureAuthenticated', 'getting_current_user');
        currentUser = await this._authenticationService.getCurrentUser();
      } catch (error) {
        this._logAuthenticationStateChange('ensureAuthenticated', 'getCurrentUser_failed', { error: error.message });
        
        // Attempt recovery based on error classification
        const authError = this._classifyAndHandleError(error, 'ensureAuthenticated');
        const recoveryStrategy = authError.getRecoveryStrategy();
        
        if (recoveryStrategy === AuthenticationError.RECOVERY_STRATEGIES.TOKEN_REFRESH) {
          this._logAuthenticationStateChange('ensureAuthenticated', 'attempting_token_refresh');
          await this.refreshTokensIfNeeded();
          // Try again after refresh
          currentUser = await this._authenticationService.getCurrentUser();
        } else {
          throw authError;
        }
      }

      if (currentUser && (currentUser.userId || currentUser.id)) {
        // Handle both userId and id properties for compatibility
        const userId = currentUser.userId || currentUser.id;
        
        // Update authentication state
        this._authState.isAuthenticated = true;
        this._authState.userId = userId;
        this._authState.lastCheck = Date.now();
        this._authState.error = null;
        
        // Cache the successful authentication state
        if (this._persistenceService) {
          await this._persistenceService.cacheAuthState(this._authState, {
            source: 'ensure_authenticated',
            operation: 'ensureAuthenticated'
          });
        }
        
        this._logAuthenticationStateChange('ensureAuthenticated', 'success', { userId });
      } else {
        const error = new AuthenticationError(
          'Unable to retrieve authenticated user',
          AuthenticationError.ERROR_CODES.TOKEN_MISSING,
          true,
          { operation: 'ensureAuthenticated', service: 'AuthenticationStateManager' }
        );
        this._logAuthenticationError('ensureAuthenticated', error);
        throw error;
      }
      
    } catch (error) {
      this._logAuthenticationError('ensureAuthenticated', error);
      
      // Update auth state with error and classify it
      const authError = this._classifyAndHandleError(error, 'ensureAuthenticated');
      this._authState.error = authError;
      this._authState.isAuthenticated = false;
      this._authState.userId = null;
      this._authState.lastCheck = Date.now();
      
      // Cache the error state
      if (this._persistenceService) {
        await this._persistenceService.cacheAuthState(this._authState, {
          source: 'error_state',
          operation: 'ensureAuthenticated'
        });
      }
      
      throw authError;
    }
  }

  /**
   * Refresh tokens if needed using coordinated refresh
   * @returns {Promise<void>}
   * @throws {AuthenticationError} If token refresh fails
   */
  static async refreshTokensIfNeeded() {
    try {
      this._logAuthenticationStateChange('refreshTokensIfNeeded', 'started');
      
      if (!this._tokenStorageService) {
        const error = new AuthenticationError(
          'TokenStorageService not available',
          AuthenticationError.ERROR_CODES.UNKNOWN_ERROR,
          false,
          { operation: 'refreshTokensIfNeeded', service: 'AuthenticationStateManager' }
        );
        this._logAuthenticationError('refreshTokensIfNeeded', error);
        throw error;
      }

      // Use TokenRefreshCoordinator to prevent race conditions
      await TokenRefreshCoordinator.coordinatedRefresh(async () => {
        this._logAuthenticationStateChange('refreshTokensIfNeeded', 'executing_refresh');
        
        // Get current tokens
        const tokens = await this._tokenStorageService.getTokens();
        
        if (!tokens || !tokens.refreshToken) {
          const error = new AuthenticationError(
            'No refresh token available',
            AuthenticationError.ERROR_CODES.TOKEN_MISSING,
            false,
            { operation: 'refreshTokensIfNeeded', service: 'AuthenticationStateManager' }
          );
          this._logAuthenticationError('refreshTokensIfNeeded', error);
          throw error;
        }

        // Refresh tokens using AuthenticationService
        const refreshResult = await this._authenticationService.refreshTokens();
        
        if (!refreshResult) {
          const error = new AuthenticationError(
            'Token refresh failed',
            AuthenticationError.ERROR_CODES.REFRESH_FAILED,
            false,
            { operation: 'refreshTokensIfNeeded', service: 'AuthenticationStateManager' }
          );
          this._logAuthenticationError('refreshTokensIfNeeded', error);
          throw error;
        }
        
        // Get the refreshed tokens
        const refreshedTokens = await this._tokenStorageService.getTokens();
        
        if (!refreshedTokens || !refreshedTokens.accessToken) {
          const error = new AuthenticationError(
            'Token refresh returned invalid tokens',
            AuthenticationError.ERROR_CODES.REFRESH_FAILED,
            false,
            { operation: 'refreshTokensIfNeeded', service: 'AuthenticationStateManager' }
          );
          this._logAuthenticationError('refreshTokensIfNeeded', error);
          throw error;
        }

        this._logAuthenticationStateChange('refreshTokensIfNeeded', 'refresh_successful');
        return refreshedTokens;
      });

      // Clear any previous authentication errors after successful refresh
      this._authState.error = null;
      
      // Cache the successful refresh state
      if (this._persistenceService) {
        await this._persistenceService.cacheAuthState(this._authState, {
          source: 'token_refresh',
          operation: 'refreshTokensIfNeeded'
        });
      }
      
      this._logAuthenticationStateChange('refreshTokensIfNeeded', 'completed');
      
    } catch (error) {
      this._logAuthenticationError('refreshTokensIfNeeded', error);
      
      // Update auth state with error and classify it
      const authError = this._classifyAndHandleError(error, 'refreshTokensIfNeeded');
      this._authState.error = authError;
      this._authState.isAuthenticated = false;
      this._authState.userId = null;
      
      // Cache the error state
      if (this._persistenceService) {
        await this._persistenceService.cacheAuthState(this._authState, {
          source: 'error_state',
          operation: 'refreshTokensIfNeeded'
        });
      }
      
      throw authError;
    }
  }

  /**
   * Handle authentication errors with appropriate recovery strategies
   * @param {Error} error - The authentication error to handle
   * @returns {Promise<boolean>} True if error was recovered, false otherwise
   */
  static async handleAuthenticationError(error) {
    try {
      // Handle authentication error
      
      const authError = AuthenticationError.fromError(error, {
        operation: 'handleAuthenticationError',
        service: 'AuthenticationStateManager'
      });

      // Update auth state with error
      this._authState.error = authError;
      this._authState.isAuthenticated = false;
      this._authState.userId = null;

      // Attempt recovery based on error type
      if (!authError.canRecover()) {
        return false;
      }

      const strategy = authError.getRecoveryStrategy();

      switch (strategy) {
        case AuthenticationError.RECOVERY_STRATEGIES.TOKEN_REFRESH:
          try {
            await this.refreshTokensIfNeeded();
            await this.ensureAuthenticated();
            return true;
          } catch (refreshError) {
            console.error('[AuthenticationStateManager] Token refresh recovery failed:', refreshError);
            return false;
          }

        case AuthenticationError.RECOVERY_STRATEGIES.RETRY_WITH_BACKOFF:
          // For network errors, we'll let the calling code handle retry logic
          // This just indicates that retry is possible
          return true;

        case AuthenticationError.RECOVERY_STRATEGIES.FALLBACK_TO_CACHE:
          // Indicate that cached data should be used
          return true;

        case AuthenticationError.RECOVERY_STRATEGIES.RE_AUTHENTICATE:
          // Clear all authentication state to force re-authentication
          await this.clearAuthenticationState();
          return false;

        default:
          return false;
      }
      
    } catch (error) {
      console.error('[AuthenticationStateManager] Error recovery failed:', error);
      return false;
    }
  }

  /**
   * Check if an error is an authentication error
   * @param {Error} error - Error to check
   * @returns {boolean} True if it's an authentication error
   */
  static isAuthenticationError(error) {
    if (error instanceof AuthenticationError) {
      return true;
    }

    // Check for common authentication error patterns
    const message = error.message?.toLowerCase() || '';
    return message.includes('not authenticated') ||
           message.includes('unauthorized') ||
           message.includes('token') ||
           message.includes('authentication') ||
           message.includes('credentials');
  }

  /**
   * Get current authentication state
   * @returns {Object} Current authentication state
   */
  static getAuthenticationState() {
    return {
      ...this._authState,
      isCacheValid: this._isCacheValid()
    };
  }

  /**
   * Clear authentication state (for logout or re-authentication)
   */
  static async clearAuthenticationState() {
    this._logAuthenticationStateChange('clearAuthenticationState', 'started');
    
    this._authState = {
      isAuthenticated: false,
      userId: null,
      lastCheck: null,
      error: null,
      isRefreshing: false
    };

    // Reset coordination state
    this._coordinationState = {
      isAuthenticating: false,
      authenticationPromise: null,
      waitingRequests: []
    };

    // Reset token refresh coordinator state
    TokenRefreshCoordinator.resetState();
    
    // Clear persistence cache
    if (this._persistenceService) {
      await this._persistenceService.clearCachedState('clear_authentication_state');
    }
    
    this._logAuthenticationStateChange('clearAuthenticationState', 'completed');
  }

  /**
   * Check if authentication cache is still valid
   */
  static _isCacheValid() {
    if (!this._authState.lastCheck) {
      return false;
    }
    
    const now = Date.now();
    const cacheAge = now - this._authState.lastCheck;
    return cacheAge < this.AUTH_CACHE_DURATION;
  }

  /**
   * Force refresh of authentication state (bypass cache)
   */
  static async forceRefresh() {
    this._logAuthenticationStateChange('forceRefresh', 'started');
    this._authState.lastCheck = null;
    
    // Clear persistence cache to force fresh authentication
    if (this._persistenceService) {
      await this._persistenceService.clearCachedState('force_refresh');
    }
    
    await this.ensureAuthenticated();
    this._logAuthenticationStateChange('forceRefresh', 'completed');
  }

  // Private methods for coordination, error classification, and logging

  /**
   * Coordinate authentication requests to prevent race conditions
   * @private
   * @param {Function} authFunction - Function that performs authentication
   * @returns {Promise} Result of authentication function
   */
  static async _coordinatedAuthentication(authFunction) {
    // If authentication is already in progress, wait for it
    if (this._coordinationState.isAuthenticating && this._coordinationState.authenticationPromise) {
      this._logAuthenticationStateChange('_coordinatedAuthentication', 'waiting_for_existing');
      return this._coordinationState.authenticationPromise;
    }

    // Start new authentication operation
    this._coordinationState.isAuthenticating = true;
    this._logAuthenticationStateChange('_coordinatedAuthentication', 'starting_new');

    try {
      // Create authentication promise
      this._coordinationState.authenticationPromise = authFunction();
      const result = await this._coordinationState.authenticationPromise;
      
      this._logAuthenticationStateChange('_coordinatedAuthentication', 'completed');
      return result;
      
    } catch (error) {
      this._logAuthenticationError('_coordinatedAuthentication', error);
      throw error;
      
    } finally {
      // Clean up coordination state
      this._coordinationState.isAuthenticating = false;
      this._coordinationState.authenticationPromise = null;
    }
  }

  /**
   * Classify error and determine appropriate handling strategy
   * @private
   * @param {Error} error - Error to classify
   * @param {string} operation - Operation that caused the error
   * @returns {AuthenticationError} Classified authentication error
   */
  static _classifyAndHandleError(error, operation) {
    if (error instanceof AuthenticationError) {
      // Already classified, just update context
      error.context.operation = operation;
      error.context.service = 'AuthenticationStateManager';
      return error;
    }

    // Classify the error based on message and context
    const authError = AuthenticationError.fromError(error, {
      operation,
      service: 'AuthenticationStateManager',
      userId: this._authState.userId,
      timestamp: new Date().toISOString()
    });

    // Log the classification
    this._logAuthenticationStateChange('_classifyAndHandleError', 'classified', {
      originalError: error.message,
      classifiedCode: authError.code,
      recoveryStrategy: authError.getRecoveryStrategy(),
      recoverable: authError.canRecover()
    });

    return authError;
  }

  /**
   * Log authentication state changes for debugging and monitoring
   * @private
   * @param {string} operation - Operation being performed
   * @param {string} event - Event that occurred
   * @param {Object} context - Additional context information
   */
  static _logAuthenticationStateChange(operation, event, context = {}) {
    const logData = {
      timestamp: new Date().toISOString(),
      operation,
      event,
      authState: {
        isAuthenticated: this._authState.isAuthenticated,
        hasUserId: !!this._authState.userId,
        hasError: !!this._authState.error,
        cacheValid: this._isCacheValid(),
        lastCheck: this._authState.lastCheck
      },
      coordinationState: {
        isAuthenticating: this._coordinationState.isAuthenticating,
        hasPromise: !!this._coordinationState.authenticationPromise
      },
      ...context
    };

    // Log authentication state change
  }

  /**
   * Log authentication errors with detailed context
   * @private
   * @param {string} operation - Operation that failed
   * @param {Error} error - Error that occurred
   */
  static _logAuthenticationError(operation, error) {
    const errorData = {
      timestamp: new Date().toISOString(),
      operation,
      error: {
        message: error.message,
        code: error.code || 'UNKNOWN',
        recoverable: error.recoverable !== undefined ? error.recoverable : true,
        recoveryStrategy: error.getRecoveryStrategy ? error.getRecoveryStrategy() : 'UNKNOWN',
        stack: error.stack
      },
      authState: {
        isAuthenticated: this._authState.isAuthenticated,
        hasUserId: !!this._authState.userId,
        hasError: !!this._authState.error,
        cacheValid: this._isCacheValid(),
        lastCheck: this._authState.lastCheck
      },
      context: error.context || {}
    };

    console.error(`[AuthenticationStateManager] ERROR in ${operation}:`, errorData);
  }

  /**
   * Check if tokens need proactive refresh (for integration with ProactiveTokenRefreshService)
   * @returns {Promise<boolean>} True if tokens need proactive refresh
   */
  static async needsProactiveRefresh() {
    try {
      if (!this._tokenStorageService) {
        return false;
      }

      return await this._tokenStorageService.needsRefresh();
    } catch (error) {
      console.error('[AuthenticationStateManager] Error checking proactive refresh need:', error);
      return false;
    }
  }

  /**
   * Get time until token expiry (for integration with ProactiveTokenRefreshService)
   * @returns {Promise<number|null>} Time until expiry in milliseconds or null if no tokens
   */
  static async getTimeUntilTokenExpiry() {
    try {
      if (!this._tokenStorageService) {
        return null;
      }

      const tokens = await this._tokenStorageService.getTokens();
      
      if (!tokens || !tokens.expiresAt) {
        return null;
      }

      const now = Date.now();
      return tokens.expiresAt - now;
    } catch (error) {
      console.error('[AuthenticationStateManager] Error getting time until expiry:', error);
      return null;
    }
  }

  /**
   * Perform coordinated token refresh for proactive refresh service
   * @param {string} operationId - Operation identifier for logging
   * @returns {Promise<boolean>} True if refresh was successful
   */
  static async performCoordinatedRefresh(operationId = 'proactive_refresh') {
    try {
      this._logAuthenticationStateChange('performCoordinatedRefresh', 'started', { operationId });
      
      await this.refreshTokensIfNeeded();
      
      // Verify tokens are now valid
      const timeUntilExpiry = await this.getTimeUntilTokenExpiry();
      const refreshSuccess = timeUntilExpiry !== null && timeUntilExpiry > 0;

      this._logAuthenticationStateChange('performCoordinatedRefresh', 'completed', { 
        operationId, 
        success: refreshSuccess,
        timeUntilExpiry 
      });

      return refreshSuccess;
    } catch (error) {
      this._logAuthenticationError('performCoordinatedRefresh', error);
      return false;
    }
  }

  /**
   * Synchronize authentication state with persistence service
   * @param {string} source - Source of the synchronization request
   */
  static async synchronizeWithPersistence(source = 'manual') {
    try {
      this._logAuthenticationStateChange('synchronizeWithPersistence', 'started', { source });
      
      if (this._persistenceService) {
        await this._persistenceService.synchronizeState(this._authState, source);
        this._logAuthenticationStateChange('synchronizeWithPersistence', 'completed', { source });
      } else {
        this._logAuthenticationStateChange('synchronizeWithPersistence', 'skipped_no_service', { source });
      }
    } catch (error) {
      this._logAuthenticationError('synchronizeWithPersistence', error);
    }
  }

  /**
   * Restore authentication state from persistence cache
   * @returns {Promise<boolean>} True if state was restored successfully
   */
  static async restoreFromPersistence() {
    try {
      this._logAuthenticationStateChange('restoreFromPersistence', 'started');
      
      if (!this._persistenceService) {
        this._logAuthenticationStateChange('restoreFromPersistence', 'no_persistence_service');
        return false;
      }

      const cachedState = await this._persistenceService.getCachedAuthState(true); // Allow stale
      
      if (cachedState) {
        // Restore state from cache
        this._authState.isAuthenticated = cachedState.isAuthenticated;
        this._authState.userId = cachedState.userId;
        this._authState.lastCheck = cachedState.lastCheck || Date.now();
        this._authState.error = cachedState.error ? 
          AuthenticationError.fromError(cachedState.error, cachedState.error.context || {}) : 
          null;

        this._logAuthenticationStateChange('restoreFromPersistence', 'restored', {
          isAuthenticated: cachedState.isAuthenticated,
          hasUserId: !!cachedState.userId,
          cacheSource: cachedState._cacheInfo?.source
        });

        return true;
      } else {
        this._logAuthenticationStateChange('restoreFromPersistence', 'no_cached_state');
        return false;
      }
    } catch (error) {
      this._logAuthenticationError('restoreFromPersistence', error);
      return false;
    }
  }

  /**
   * Add a listener for authentication state synchronization events
   * @param {Function} listener - Listener function
   * @returns {Function} Unsubscribe function
   */
  static addSyncListener(listener) {
    if (this._persistenceService) {
      return this._persistenceService.addSyncListener(listener);
    } else {
      return () => {}; // Return no-op unsubscribe function
    }
  }

  /**
   * Handle app foregrounding event
   * @returns {Promise<Object>} Recovery result
   */
  static async handleAppForegrounding() {
    try {
      this._logAuthenticationStateChange('handleAppForegrounding', 'started');
      
      if (this._persistenceService) {
        const recoveryResult = await this._persistenceService.handleAppForegrounding();
        
        // If state was recovered, synchronize with local state
        if (recoveryResult.stateRecovered && recoveryResult.cachedState) {
          this._authState.isAuthenticated = recoveryResult.cachedState.isAuthenticated;
          this._authState.userId = recoveryResult.cachedState.userId;
          this._authState.lastCheck = recoveryResult.cachedState.lastCheck || Date.now();
          this._authState.error = recoveryResult.cachedState.error;
        }

        this._logAuthenticationStateChange('handleAppForegrounding', 'completed', {
          strategy: recoveryResult.strategy,
          stateRecovered: recoveryResult.stateRecovered,
          authenticationValid: recoveryResult.authenticationValid
        });

        return recoveryResult;
      } else {
        this._logAuthenticationStateChange('handleAppForegrounding', 'no_persistence_service');
        return {
          strategy: 'no_persistence',
          stateRecovered: false,
          authenticationValid: this._authState.isAuthenticated,
          recommendedAction: 'validate_authentication'
        };
      }
    } catch (error) {
      this._logAuthenticationError('handleAppForegrounding', error);
      return {
        strategy: 'error',
        stateRecovered: false,
        authenticationValid: false,
        recommendedAction: 'validate_authentication',
        error: error.message
      };
    }
  }

  /**
   * Get comprehensive authentication statistics for debugging
   * @returns {Object} Authentication statistics
   */
  static getAuthenticationStats() {
    return {
      authState: {
        ...this._authState,
        isCacheValid: this._isCacheValid(),
        cacheAge: this._authState.lastCheck ? Date.now() - this._authState.lastCheck : null
      },
      coordinationState: {
        isAuthenticating: this._coordinationState.isAuthenticating,
        hasAuthenticationPromise: !!this._coordinationState.authenticationPromise,
        waitingRequestsCount: this._coordinationState.waitingRequests.length
      },
      services: {
        hasAuthenticationService: !!this._authenticationService,
        hasTokenStorageService: !!this._tokenStorageService,
        hasPersistenceService: !!this._persistenceService
      },
      refreshCoordinator: TokenRefreshCoordinator.getRefreshState(),
      persistence: this._persistenceService ? this._persistenceService.getServiceStatus() : null
    };
  }
}

export default AuthenticationStateManager;