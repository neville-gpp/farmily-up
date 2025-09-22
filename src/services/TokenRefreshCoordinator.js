import AuthenticationError from './AuthenticationError.js';

/**
 * TokenRefreshCoordinator prevents race conditions during token refresh operations
 * Ensures only one refresh happens at a time and queues other requests
 */
class TokenRefreshCoordinator {
  static _refreshState = {
    isInProgress: false,
    startTime: null,
    waitingRequests: [],
    lastAttempt: null,
    failureCount: 0,
    currentRefreshPromise: null
  };

  // Configuration constants
  static MAX_RETRY_ATTEMPTS = 3;
  static RETRY_DELAY_BASE = 1000; // 1 second base delay
  static MAX_RETRY_DELAY = 30000; // 30 seconds max delay
  static REFRESH_TIMEOUT = 30000; // 30 seconds timeout for refresh operation

  /**
   * Coordinate token refresh to prevent race conditions
   * @param {Function} refreshFunction - Function that performs the actual token refresh
   * @returns {Promise} Promise that resolves when refresh is complete
   */
  static async coordinatedRefresh(refreshFunction) {
    // If refresh is already in progress, wait for it
    if (this._refreshState.isInProgress && this._refreshState.currentRefreshPromise) {
      console.log('[TokenRefreshCoordinator] Refresh already in progress, waiting...');
      return this.waitForRefresh();
    }

    return this._performRefreshWithRetry(refreshFunction);
  }

  /**
   * Perform refresh with retry logic
   */
  static async _performRefreshWithRetry(refreshFunction) {
    // Start new refresh operation
    this._refreshState.isInProgress = true;
    this._refreshState.startTime = Date.now();
    this._refreshState.lastAttempt = Date.now();

    console.log('[TokenRefreshCoordinator] Starting coordinated token refresh');

    try {
      // Create refresh promise with timeout
      this._refreshState.currentRefreshPromise = this._executeRefreshWithTimeout(refreshFunction);
      
      const result = await this._refreshState.currentRefreshPromise;
      
      // Reset failure count on success
      this._refreshState.failureCount = 0;
      
      console.log('[TokenRefreshCoordinator] Token refresh completed successfully');
      return result;
      
    } catch (error) {
      this._refreshState.failureCount++;
      
      console.error('[TokenRefreshCoordinator] Token refresh failed:', {
        error: error.message,
        failureCount: this._refreshState.failureCount,
        code: error.code
      });

      // Determine if we should retry
      if (this._shouldRetry(error)) {
        const delay = this._calculateRetryDelay();
        console.log(`[TokenRefreshCoordinator] Retrying refresh in ${delay}ms (attempt ${this._refreshState.failureCount})`);
        
        // Reset current promise but keep refresh in progress
        this._refreshState.currentRefreshPromise = null;
        
        await this._delay(delay);
        
        // Retry by calling the refresh function again
        return this._performRefreshWithRetry(refreshFunction);
      }

      // Convert to AuthenticationError if not already
      const authError = AuthenticationError.fromError(error, {
        operation: 'token_refresh',
        service: 'TokenRefreshCoordinator',
        failureCount: this._refreshState.failureCount
      });

      throw authError;
      
    } finally {
      // Clean up refresh state
      this._refreshState.isInProgress = false;
      this._refreshState.currentRefreshPromise = null;
      this._refreshState.startTime = null;
    }
  }

  /**
   * Execute refresh function with timeout
   */
  static async _executeRefreshWithTimeout(refreshFunction) {
    return new Promise(async (resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new AuthenticationError(
          'Token refresh operation timed out',
          AuthenticationError.ERROR_CODES.NETWORK_ERROR,
          true,
          { operation: 'token_refresh_timeout', timeout: this.REFRESH_TIMEOUT }
        ));
      }, this.REFRESH_TIMEOUT);

      try {
        const result = await refreshFunction();
        clearTimeout(timeoutId);
        resolve(result);
      } catch (error) {
        clearTimeout(timeoutId);
        reject(error);
      }
    });
  }

  /**
   * Wait for current refresh operation to complete
   */
  static async waitForRefresh() {
    if (!this._refreshState.isInProgress || !this._refreshState.currentRefreshPromise) {
      return Promise.resolve();
    }

    try {
      return await this._refreshState.currentRefreshPromise;
    } catch (error) {
      // Re-throw the error from the refresh operation
      throw error;
    }
  }

  /**
   * Check if refresh is currently in progress
   */
  static isRefreshInProgress() {
    return this._refreshState.isInProgress;
  }

  /**
   * Get current refresh state for debugging
   */
  static getRefreshState() {
    return {
      ...this._refreshState,
      currentRefreshPromise: this._refreshState.currentRefreshPromise ? 'Promise<pending>' : null
    };
  }

  /**
   * Determine if we should retry the refresh operation
   */
  static _shouldRetry(error) {
    // Don't retry if we've exceeded max attempts
    if (this._refreshState.failureCount >= this.MAX_RETRY_ATTEMPTS) {
      return false;
    }

    // Don't retry for non-recoverable errors
    if (error instanceof AuthenticationError && !error.canRecover()) {
      return false;
    }

    // Retry for network errors, rate limiting, and unknown errors
    const retryableCodes = [
      AuthenticationError.ERROR_CODES.NETWORK_ERROR,
      AuthenticationError.ERROR_CODES.RATE_LIMITED,
      AuthenticationError.ERROR_CODES.UNKNOWN_ERROR
    ];

    if (error instanceof AuthenticationError) {
      return retryableCodes.includes(error.code);
    }

    // Retry for generic network-related errors
    const message = error.message?.toLowerCase() || '';
    return message.includes('network') || 
           message.includes('timeout') || 
           message.includes('connection') ||
           message.includes('rate limit');
  }

  /**
   * Calculate retry delay with exponential backoff
   */
  static _calculateRetryDelay() {
    const attempt = this._refreshState.failureCount;
    const delay = Math.min(
      this.RETRY_DELAY_BASE * Math.pow(2, attempt - 1),
      this.MAX_RETRY_DELAY
    );
    
    // Add some jitter to prevent thundering herd
    const jitter = Math.random() * 0.1 * delay;
    return Math.floor(delay + jitter);
  }

  /**
   * Utility function to create a delay
   */
  static _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Reset refresh state (useful for testing or error recovery)
   */
  static resetState() {
    this._refreshState = {
      isInProgress: false,
      startTime: null,
      waitingRequests: [],
      lastAttempt: null,
      failureCount: 0,
      currentRefreshPromise: null
    };
  }

  /**
   * Force cancel current refresh operation (emergency use only)
   */
  static forceCancel() {
    console.warn('[TokenRefreshCoordinator] Force cancelling refresh operation');
    this._refreshState.isInProgress = false;
    this._refreshState.currentRefreshPromise = null;
    this._refreshState.startTime = null;
  }
}

export default TokenRefreshCoordinator;