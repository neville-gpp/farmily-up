import AuthenticationStateManager from './AuthenticationStateManager.js';
import TokenStorageService from './TokenStorageService.js';
import AuthenticationError from './AuthenticationError.js';

/**
 * ProactiveTokenRefreshService handles background token validation and proactive refresh
 * Prevents token expiry during critical operations by monitoring and refreshing tokens before expiration
 */
class ProactiveTokenRefreshService {
  // Configuration constants
  static PROACTIVE_REFRESH_THRESHOLD = 10 * 60 * 1000; // 10 minutes before expiry
  static BACKGROUND_CHECK_INTERVAL = 5 * 60 * 1000; // Check every 5 minutes
  static CRITICAL_OPERATION_THRESHOLD = 2 * 60 * 1000; // 2 minutes before expiry for critical ops
  static MAX_BACKGROUND_FAILURES = 3; // Max consecutive background refresh failures
  static BACKGROUND_RETRY_DELAY = 30 * 1000; // 30 seconds between background retries

  // Service state
  static _serviceState = {
    isInitialized: false,
    isBackgroundRefreshEnabled: false,
    backgroundIntervalId: null,
    lastBackgroundCheck: null,
    backgroundFailureCount: 0,
    lastBackgroundFailure: null,
    scheduledRefreshes: new Map(), // Map of operation IDs to scheduled refresh promises
    criticalOperationQueue: [], // Queue of critical operations waiting for token refresh
  };

  // Event listeners for token refresh events
  static _eventListeners = {
    onTokenRefreshed: [],
    onRefreshFailed: [],
    onCriticalOperationBlocked: [],
  };

  /**
   * Initialize the proactive token refresh service
   * @param {Object} options - Configuration options
   * @param {boolean} options.enableBackgroundRefresh - Enable background token monitoring
   * @param {number} options.proactiveThreshold - Time before expiry to trigger proactive refresh (ms)
   * @param {number} options.backgroundInterval - Background check interval (ms)
   */
  static initialize(options = {}) {
    try {
      // Apply configuration options
      if (options.proactiveThreshold) {
        this.PROACTIVE_REFRESH_THRESHOLD = options.proactiveThreshold;
      }
      if (options.backgroundInterval) {
        this.BACKGROUND_CHECK_INTERVAL = options.backgroundInterval;
      }

      // Reset service state
      this._serviceState = {
        isInitialized: true,
        isBackgroundRefreshEnabled: false,
        backgroundIntervalId: null,
        lastBackgroundCheck: null,
        backgroundFailureCount: 0,
        lastBackgroundFailure: null,
        scheduledRefreshes: new Map(),
        criticalOperationQueue: [],
      };

      // Enable background refresh if requested
      if (options.enableBackgroundRefresh !== false) {
        this.enableBackgroundRefresh();
      }

    } catch (error) {
      console.error('[ProactiveTokenRefreshService] Failed to initialize service:', error);
      throw new AuthenticationError(
        'Failed to initialize proactive token refresh service',
        'UNKNOWN_ERROR',
        false,
        { operation: 'initialize', error: error.message }
      );
    }
  }

  /**
   * Enable background token monitoring and proactive refresh
   */
  static enableBackgroundRefresh() {
    try {
      if (this._serviceState.isBackgroundRefreshEnabled) {
        console.log('[ProactiveTokenRefreshService] Background refresh already enabled');
        return;
      }

      // Start background monitoring interval
      this._serviceState.backgroundIntervalId = setInterval(
        () => this._performBackgroundCheck(),
        this.BACKGROUND_CHECK_INTERVAL
      );

      this._serviceState.isBackgroundRefreshEnabled = true;

      // Perform initial check
      this._performBackgroundCheck();

    } catch (error) {
      console.error('[ProactiveTokenRefreshService] Failed to enable background refresh:', error);
    }
  }

  /**
   * Disable background token monitoring
   */
  static disableBackgroundRefresh() {
    try {
      if (!this._serviceState.isBackgroundRefreshEnabled) {
        console.log('[ProactiveTokenRefreshService] Background refresh already disabled');
        return;
      }

      // Clear background interval
      if (this._serviceState.backgroundIntervalId) {
        clearInterval(this._serviceState.backgroundIntervalId);
        this._serviceState.backgroundIntervalId = null;
      }

      this._serviceState.isBackgroundRefreshEnabled = false;

    } catch (error) {
      console.error('[ProactiveTokenRefreshService] Failed to disable background refresh:', error);
    }
  }

  /**
   * Ensure tokens are valid for a critical operation
   * Proactively refreshes tokens if they expire within the critical threshold
   * @param {string} operationId - Unique identifier for the operation
   * @param {number} estimatedDuration - Estimated operation duration in milliseconds
   * @returns {Promise<boolean>} True if tokens are valid for the operation
   */
  static async ensureTokensForCriticalOperation(operationId, estimatedDuration = 0) {
    try {
      // Calculate required token validity duration
      const requiredValidityDuration = Math.max(
        estimatedDuration + this.CRITICAL_OPERATION_THRESHOLD,
        this.CRITICAL_OPERATION_THRESHOLD
      );

      // Check current token expiry
      const timeUntilExpiry = await this._getTimeUntilTokenExpiry();
      
      if (timeUntilExpiry === null) {
        return false;
      }

      // If tokens are valid for the required duration, return success
      if (timeUntilExpiry > requiredValidityDuration) {

        return true;
      }

      // Perform proactive refresh
      const refreshSuccess = await this._performProactiveRefresh(operationId, 'critical_operation');
      
      if (refreshSuccess) {
        return true;
      } else {
        console.error('[ProactiveTokenRefreshService] Failed to refresh tokens for critical operation');
        this._notifyEventListeners('onCriticalOperationBlocked', { operationId, reason: 'token_refresh_failed' });
        return false;
      }

    } catch (error) {
      console.error('[ProactiveTokenRefreshService] Error ensuring tokens for critical operation:', error);
      this._notifyEventListeners('onCriticalOperationBlocked', { operationId, error: error.message });
      return false;
    }
  }

  /**
   * Schedule a proactive token refresh before expiry
   * @param {string} operationId - Unique identifier for the scheduled refresh
   * @param {number} refreshTime - Timestamp when refresh should occur
   * @returns {Promise<boolean>} True if refresh was scheduled successfully
   */
  static async scheduleProactiveRefresh(operationId, refreshTime) {
    try {
      const now = Date.now();
      const delay = refreshTime - now;

      if (delay <= 0) {
        return await this._performProactiveRefresh(operationId, 'scheduled_immediate');
      }

      // Cancel any existing scheduled refresh for this operation
      if (this._serviceState.scheduledRefreshes.has(operationId)) {
        const existingTimeout = this._serviceState.scheduledRefreshes.get(operationId);
        clearTimeout(existingTimeout.timeoutId);
      }

      // Schedule the refresh
      const timeoutId = setTimeout(async () => {
        try {
          console.log('[ProactiveTokenRefreshService] Executing scheduled refresh', { operationId });
          await this._performProactiveRefresh(operationId, 'scheduled');
          this._serviceState.scheduledRefreshes.delete(operationId);
        } catch (error) {
          console.error('[ProactiveTokenRefreshService] Scheduled refresh failed:', error);
          this._serviceState.scheduledRefreshes.delete(operationId);
        }
      }, delay);

      // Store the scheduled refresh
      this._serviceState.scheduledRefreshes.set(operationId, {
        timeoutId,
        refreshTime,
        scheduledAt: now
      });

      return true;

    } catch (error) {
      console.error('[ProactiveTokenRefreshService] Failed to schedule proactive refresh:', error);
      return false;
    }
  }

  /**
   * Cancel a scheduled proactive refresh
   * @param {string} operationId - Operation ID of the scheduled refresh to cancel
   * @returns {boolean} True if refresh was cancelled successfully
   */
  static cancelScheduledRefresh(operationId) {
    try {
      if (!this._serviceState.scheduledRefreshes.has(operationId)) {
        console.log('[ProactiveTokenRefreshService] No scheduled refresh found for operation', { operationId });
        return false;
      }

      const scheduledRefresh = this._serviceState.scheduledRefreshes.get(operationId);
      clearTimeout(scheduledRefresh.timeoutId);
      this._serviceState.scheduledRefreshes.delete(operationId);

      return true;

    } catch (error) {
      console.error('[ProactiveTokenRefreshService] Failed to cancel scheduled refresh:', error);
      return false;
    }
  }

  /**
   * Check if tokens need proactive refresh
   * @returns {Promise<boolean>} True if tokens need proactive refresh
   */
  static async needsProactiveRefresh() {
    try {
      const timeUntilExpiry = await this._getTimeUntilTokenExpiry();
      
      if (timeUntilExpiry === null) {
        return false; // No tokens available
      }

      return timeUntilExpiry > 0 && timeUntilExpiry <= this.PROACTIVE_REFRESH_THRESHOLD;

    } catch (error) {
      console.error('[ProactiveTokenRefreshService] Error checking proactive refresh need:', error);
      return false;
    }
  }

  /**
   * Get token expiry monitoring status
   * @returns {Promise<Object>} Token monitoring status
   */
  static async getTokenMonitoringStatus() {
    try {
      const timeUntilExpiry = await this._getTimeUntilTokenExpiry();
      const needsProactive = await this.needsProactiveRefresh();
      const tokensExpired = await TokenStorageService.areTokensExpired();

      return {
        timeUntilExpiry,
        needsProactiveRefresh: needsProactive,
        tokensExpired,
        proactiveThreshold: this.PROACTIVE_REFRESH_THRESHOLD,
        criticalThreshold: this.CRITICAL_OPERATION_THRESHOLD,
        backgroundRefreshEnabled: this._serviceState.isBackgroundRefreshEnabled,
        lastBackgroundCheck: this._serviceState.lastBackgroundCheck,
        backgroundFailureCount: this._serviceState.backgroundFailureCount,
        scheduledRefreshCount: this._serviceState.scheduledRefreshes.size
      };

    } catch (error) {
      console.error('[ProactiveTokenRefreshService] Error getting monitoring status:', error);
      return {
        timeUntilExpiry: null,
        needsProactiveRefresh: false,
        tokensExpired: true,
        error: error.message
      };
    }
  }

  /**
   * Add event listener for token refresh events
   * @param {string} eventType - Event type ('onTokenRefreshed', 'onRefreshFailed', 'onCriticalOperationBlocked')
   * @param {Function} listener - Event listener function
   */
  static addEventListener(eventType, listener) {
    if (this._eventListeners[eventType]) {
      this._eventListeners[eventType].push(listener);
      console.log(`[ProactiveTokenRefreshService] Added event listener for ${eventType}`);
    } else {
      console.warn(`[ProactiveTokenRefreshService] Unknown event type: ${eventType}`);
    }
  }

  /**
   * Remove event listener
   * @param {string} eventType - Event type
   * @param {Function} listener - Event listener function to remove
   */
  static removeEventListener(eventType, listener) {
    if (this._eventListeners[eventType]) {
      const index = this._eventListeners[eventType].indexOf(listener);
      if (index > -1) {
        this._eventListeners[eventType].splice(index, 1);
        console.log(`[ProactiveTokenRefreshService] Removed event listener for ${eventType}`);
      }
    }
  }

  /**
   * Shutdown the service and clean up resources
   */
  static shutdown() {
    try {

      // Disable background refresh
      this.disableBackgroundRefresh();

      // Cancel all scheduled refreshes
      for (const [operationId, scheduledRefresh] of this._serviceState.scheduledRefreshes) {
        clearTimeout(scheduledRefresh.timeoutId);
      }
      this._serviceState.scheduledRefreshes.clear();

      // Clear event listeners
      for (const eventType in this._eventListeners) {
        this._eventListeners[eventType] = [];
      }

      // Reset service state
      this._serviceState.isInitialized = false;

    } catch (error) {
      console.error('[ProactiveTokenRefreshService] Error during shutdown:', error);
    }
  }

  // Private methods

  /**
   * Perform background token check and refresh if needed
   * @private
   */
  static async _performBackgroundCheck() {
    try {
      this._serviceState.lastBackgroundCheck = Date.now();

      // Check if tokens need proactive refresh
      const needsRefresh = await this.needsProactiveRefresh();
      
      if (!needsRefresh) {
        // Reset failure count on successful check
        if (this._serviceState.backgroundFailureCount > 0) {
          console.log('[ProactiveTokenRefreshService] Background check successful, resetting failure count');
          this._serviceState.backgroundFailureCount = 0;
          this._serviceState.lastBackgroundFailure = null;
        }
        return;
      }

      console.log('[ProactiveTokenRefreshService] Background check detected tokens need refresh');

      // Perform background refresh
      const refreshSuccess = await this._performProactiveRefresh('background_check', 'background');
      
      if (refreshSuccess) {
        this._serviceState.backgroundFailureCount = 0;
        this._serviceState.lastBackgroundFailure = null;
      } else {
        this._handleBackgroundRefreshFailure();
      }

    } catch (error) {
      console.error('[ProactiveTokenRefreshService] Background check failed:', error);
      this._handleBackgroundRefreshFailure();
    }
  }

  /**
   * Handle background refresh failure
   * @private
   */
  static _handleBackgroundRefreshFailure() {
    this._serviceState.backgroundFailureCount++;
    this._serviceState.lastBackgroundFailure = Date.now();

    console.error('[ProactiveTokenRefreshService] Background refresh failed', {
      failureCount: this._serviceState.backgroundFailureCount,
      maxFailures: this.MAX_BACKGROUND_FAILURES
    });

    // Disable background refresh if too many failures
    if (this._serviceState.backgroundFailureCount >= this.MAX_BACKGROUND_FAILURES) {
      console.error('[ProactiveTokenRefreshService] Too many background refresh failures, disabling background refresh');
      this.disableBackgroundRefresh();
    }
  }

  /**
   * Perform proactive token refresh
   * @private
   * @param {string} operationId - Operation identifier
   * @param {string} refreshType - Type of refresh ('background', 'critical_operation', 'scheduled')
   * @returns {Promise<boolean>} True if refresh was successful
   */
  static async _performProactiveRefresh(operationId, refreshType) {
    try {
      // Use AuthenticationStateManager for coordinated refresh
      const refreshSuccess = await AuthenticationStateManager.performCoordinatedRefresh(operationId);
      
      if (!refreshSuccess) {
        console.error('[ProactiveTokenRefreshService] AuthenticationStateManager refresh failed');
        return false;
      }

      // Verify tokens are now valid
      const timeUntilExpiry = await this._getTimeUntilTokenExpiry();
      const tokensValid = timeUntilExpiry !== null && timeUntilExpiry > this.CRITICAL_OPERATION_THRESHOLD;

      if (tokensValid) {
        console.log('[ProactiveTokenRefreshService] Proactive refresh successful', {
          operationId,
          refreshType,
          newTimeUntilExpiry: timeUntilExpiry
        });

        this._notifyEventListeners('onTokenRefreshed', {
          operationId,
          refreshType,
          timeUntilExpiry
        });

        return true;
      } else {
        console.error('[ProactiveTokenRefreshService] Proactive refresh failed - tokens still invalid', {
          operationId,
          refreshType,
          timeUntilExpiry
        });

        this._notifyEventListeners('onRefreshFailed', {
          operationId,
          refreshType,
          reason: 'tokens_still_invalid',
          timeUntilExpiry
        });

        return false;
      }

    } catch (error) {
      console.error('[ProactiveTokenRefreshService] Proactive refresh failed:', error);

      this._notifyEventListeners('onRefreshFailed', {
        operationId,
        refreshType,
        error: error.message
      });

      return false;
    }
  }

  /**
   * Get time until token expiry in milliseconds
   * @private
   * @returns {Promise<number|null>} Time until expiry or null if no tokens
   */
  static async _getTimeUntilTokenExpiry() {
    try {
      return await AuthenticationStateManager.getTimeUntilTokenExpiry();
    } catch (error) {
      console.error('[ProactiveTokenRefreshService] Error getting time until expiry:', error);
      return null;
    }
  }

  /**
   * Notify event listeners
   * @private
   * @param {string} eventType - Event type
   * @param {Object} eventData - Event data
   */
  static _notifyEventListeners(eventType, eventData) {
    try {
      const listeners = this._eventListeners[eventType] || [];
      
      for (const listener of listeners) {
        try {
          listener(eventData);
        } catch (error) {
          console.error(`[ProactiveTokenRefreshService] Error in event listener for ${eventType}:`, error);
        }
      }

    } catch (error) {
      console.error('[ProactiveTokenRefreshService] Error notifying event listeners:', error);
    }
  }

  /**
   * Wrapper function to execute critical operations with token validation
   * Ensures tokens are valid before executing the operation
   * @param {Function} operation - The operation to execute
   * @param {Object} options - Operation options
   * @param {string} options.operationId - Unique identifier for the operation
   * @param {number} options.estimatedDuration - Estimated operation duration in milliseconds
   * @param {boolean} options.retryOnFailure - Whether to retry if token refresh fails
   * @returns {Promise<any>} Result of the operation
   */
  static async executeWithTokenValidation(operation, options = {}) {
    const {
      operationId = `operation_${Date.now()}`,
      estimatedDuration = 0,
      retryOnFailure = true
    } = options;

    try {
      // Ensure tokens are valid for the operation
      const tokensValid = await this.ensureTokensForCriticalOperation(operationId, estimatedDuration);
      
      if (!tokensValid) {
        const error = new AuthenticationError(
          'Unable to ensure valid tokens for critical operation',
          'TOKEN_REFRESH_FAILED',
          retryOnFailure,
          { operationId, estimatedDuration }
        );
        
        console.error('[ProactiveTokenRefreshService] Token validation failed for operation:', error);
        throw error;
      }

      // Execute the operation
      const result = await operation();
      
      return result;

    } catch (error) {
      console.error('[ProactiveTokenRefreshService] Operation failed:', error);
      
      // If it's an authentication error and retry is enabled, try once more
      if (retryOnFailure && AuthenticationStateManager.isAuthenticationError(error)) {        
        try {
          // Force refresh authentication state
          await AuthenticationStateManager.forceRefresh();
          
          // Retry the operation
          const result = await operation();
          return result;
          
        } catch (retryError) {
          console.error('[ProactiveTokenRefreshService] Operation retry failed:', retryError);
          throw retryError;
        }
      }
      
      throw error;
    }
  }

  /**
   * Get service statistics for debugging
   * @returns {Object} Service statistics
   */
  static getServiceStats() {
    return {
      serviceState: {
        ...this._serviceState,
        scheduledRefreshes: Array.from(this._serviceState.scheduledRefreshes.entries()).map(([id, refresh]) => ({
          operationId: id,
          refreshTime: new Date(refresh.refreshTime).toISOString(),
          scheduledAt: new Date(refresh.scheduledAt).toISOString()
        }))
      },
      configuration: {
        proactiveRefreshThreshold: this.PROACTIVE_REFRESH_THRESHOLD,
        backgroundCheckInterval: this.BACKGROUND_CHECK_INTERVAL,
        criticalOperationThreshold: this.CRITICAL_OPERATION_THRESHOLD,
        maxBackgroundFailures: this.MAX_BACKGROUND_FAILURES,
        backgroundRetryDelay: this.BACKGROUND_RETRY_DELAY
      },
      eventListeners: Object.keys(this._eventListeners).reduce((acc, eventType) => {
        acc[eventType] = this._eventListeners[eventType].length;
        return acc;
      }, {})
    };
  }
}

export default ProactiveTokenRefreshService;