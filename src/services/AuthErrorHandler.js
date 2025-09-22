import AuthenticationError from './AuthenticationError.js';

/**
 * Centralized authentication error handling service
 * Provides error classification, recovery strategy selection, and logging
 */
class AuthErrorHandler {
  static instance = null;
  
  constructor() {
    this.errorLog = [];
    this.maxLogSize = 100; // Keep last 100 errors for debugging
  }

  /**
   * Get singleton instance
   */
  static getInstance() {
    if (!AuthErrorHandler.instance) {
      AuthErrorHandler.instance = new AuthErrorHandler();
    }
    return AuthErrorHandler.instance;
  }

  /**
   * Execute an operation with comprehensive error handling
   * @param {Function} operation - The async operation to execute
   * @param {string} operationName - Name of the operation for logging
   * @param {Object} context - Additional context for error handling
   * @returns {Promise<any>} - Result of the operation
   */
  static async executeWithErrorHandling(operation, operationName, context = {}) {
    const handler = AuthErrorHandler.getInstance();
    
    try {
      const result = await operation();
      return result;
    } catch (error) {
      console.error(`[AuthErrorHandler] Operation ${operationName} failed:`, error);
      
      // Handle the error using the instance method
      const errorHandlingResult = await handler.handleAuthenticationError(error, {
        ...context,
        operation: operationName
      });
      
      // If the error is recoverable and recovery was successful, we might want to retry
      if (errorHandlingResult.shouldRetry) {
        console.log(`[AuthErrorHandler] Retrying operation ${operationName} after recovery`);
        try {
          const retryResult = await operation();
          console.log(`[AuthErrorHandler] Retry of ${operationName} succeeded`);
          return retryResult;
        } catch (retryError) {
          console.error(`[AuthErrorHandler] Retry of ${operationName} failed:`, retryError);
          // Throw the original error, not the retry error
          throw errorHandlingResult.error;
        }
      }
      
      // If not recoverable or recovery failed, throw the classified error
      throw errorHandlingResult.error;
    }
  }

  /**
   * Handle an authentication error with appropriate recovery strategy
   * @param {Error} error - The error to handle
   * @param {Object} context - Additional context for error handling
   * @returns {Object} - Error handling result with recovery actions
   */
  async handleAuthenticationError(error, context = {}) {
    // Convert to AuthenticationError if needed
    const authError = AuthenticationError.fromError(error, context);
    
    // Log the error
    this._logError(authError);
    
    // Determine recovery actions
    const recoveryActions = this._determineRecoveryActions(authError);
    
    // Execute recovery if appropriate
    const recoveryResult = await this._executeRecovery(authError, recoveryActions, context);
    
    return {
      error: authError,
      recoveryActions,
      recoveryResult,
      shouldRetry: recoveryResult.success && authError.shouldRetry(),
      requiresUserAction: authError.requiresReauthentication()
    };
  }

  /**
   * Classify an error and determine if it's authentication-related
   * @param {Error} error - The error to classify
   * @returns {Object} - Classification result
   */
  classifyError(error) {
    const isAuthError = AuthenticationError.isAuthenticationError(error);
    
    if (!isAuthError) {
      return {
        isAuthenticationError: false,
        classification: 'NON_AUTH_ERROR',
        recoverable: false
      };
    }

    const authError = AuthenticationError.fromError(error);
    
    return {
      isAuthenticationError: true,
      classification: authError.code,
      recoverable: authError.recoverable,
      recoveryStrategy: authError.getRecoveryStrategy(),
      userMessage: authError.getUserMessage()
    };
  }

  /**
   * Get error statistics for monitoring
   * @returns {Object} - Error statistics
   */
  getErrorStatistics() {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const recentErrors = this.errorLog.filter(entry => 
      new Date(entry.timestamp) > oneHourAgo
    );
    
    const dailyErrors = this.errorLog.filter(entry => 
      new Date(entry.timestamp) > oneDayAgo
    );

    const errorsByCode = {};
    dailyErrors.forEach(entry => {
      errorsByCode[entry.error.code] = (errorsByCode[entry.error.code] || 0) + 1;
    });

    return {
      totalErrors: this.errorLog.length,
      recentErrors: recentErrors.length,
      dailyErrors: dailyErrors.length,
      errorsByCode,
      mostCommonError: Object.keys(errorsByCode).reduce((a, b) => 
        errorsByCode[a] > errorsByCode[b] ? a : b, null
      )
    };
  }

  /**
   * Clear error log (for testing or maintenance)
   */
  clearErrorLog() {
    this.errorLog = [];
  }

  /**
   * Get recent errors for debugging
   * @param {number} limit - Number of recent errors to return
   * @returns {Array} - Recent error entries
   */
  getRecentErrors(limit = 10) {
    return this.errorLog
      .slice(-limit)
      .reverse(); // Most recent first
  }

  /**
   * Log an authentication error
   * @private
   */
  _logError(authError) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      error: authError.toJSON(),
      context: authError.getContext()
    };

    this.errorLog.push(logEntry);

    // Maintain log size limit
    if (this.errorLog.length > this.maxLogSize) {
      this.errorLog = this.errorLog.slice(-this.maxLogSize);
    }

    // Log to console for development
    if (__DEV__) {
      console.warn('Authentication Error:', {
        code: authError.code,
        message: authError.message,
        recoverable: authError.recoverable,
        strategy: authError.getRecoveryStrategy(),
        context: authError.getContext()
      });
    }
  }

  /**
   * Determine recovery actions based on error type
   * @private
   */
  _determineRecoveryActions(authError) {
    const strategy = authError.getRecoveryStrategy();
    const actions = [];

    switch (strategy) {
      case AuthenticationError.RECOVERY_STRATEGIES.TOKEN_REFRESH:
        actions.push({
          type: 'REFRESH_TOKEN',
          priority: 1,
          description: 'Attempt to refresh authentication tokens'
        });
        break;

      case AuthenticationError.RECOVERY_STRATEGIES.RETRY_WITH_BACKOFF:
        actions.push({
          type: 'RETRY_WITH_BACKOFF',
          priority: 1,
          delay: authError.getRetryDelay(),
          description: 'Retry operation with exponential backoff'
        });
        break;

      case AuthenticationError.RECOVERY_STRATEGIES.WAIT_AND_RETRY:
        actions.push({
          type: 'WAIT_AND_RETRY',
          priority: 1,
          delay: authError.getRetryDelay(),
          description: 'Wait and retry operation'
        });
        break;

      case AuthenticationError.RECOVERY_STRATEGIES.USER_REAUTHENTICATION:
        actions.push({
          type: 'CLEAR_TOKENS',
          priority: 1,
          description: 'Clear invalid authentication tokens'
        });
        actions.push({
          type: 'REDIRECT_TO_LOGIN',
          priority: 2,
          description: 'Redirect user to login screen'
        });
        break;

      case AuthenticationError.RECOVERY_STRATEGIES.FALLBACK_TO_CACHE:
        actions.push({
          type: 'USE_CACHED_DATA',
          priority: 1,
          description: 'Use cached data if available'
        });
        actions.push({
          type: 'SHOW_OFFLINE_MESSAGE',
          priority: 2,
          description: 'Show offline mode message to user'
        });
        break;

      case AuthenticationError.RECOVERY_STRATEGIES.NO_RECOVERY:
        actions.push({
          type: 'SHOW_ERROR_MESSAGE',
          priority: 1,
          description: 'Show error message to user'
        });
        break;
    }

    return actions;
  }

  /**
   * Execute recovery actions
   * @private
   */
  async _executeRecovery(authError, recoveryActions, context) {
    const results = [];
    let overallSuccess = false;

    for (const action of recoveryActions) {
      try {
        const result = await this._executeRecoveryAction(action, authError, context);
        results.push(result);
        
        if (result.success) {
          overallSuccess = true;
          // Mark error as having recovery attempted
          authError.markRecoveryAttempted();
          break; // Stop on first successful recovery
        }
      } catch (error) {
        results.push({
          action: action.type,
          success: false,
          error: error.message
        });
      }
    }

    return {
      success: overallSuccess,
      results,
      message: overallSuccess ? 'Recovery successful' : 'Recovery failed'
    };
  }

  /**
   * Execute a specific recovery action
   * @private
   */
  async _executeRecoveryAction(action, authError, context) {
    switch (action.type) {
      case 'REFRESH_TOKEN':
        // This would be implemented by the calling service
        return {
          action: action.type,
          success: false,
          message: 'Token refresh must be handled by calling service',
          requiresServiceAction: true
        };

      case 'RETRY_WITH_BACKOFF':
      case 'WAIT_AND_RETRY':
        // Return delay information for the calling service to handle
        return {
          action: action.type,
          success: true,
          delay: action.delay,
          message: `Wait ${action.delay}ms before retry`
        };

      case 'CLEAR_TOKENS':
        // This would be implemented by the calling service
        return {
          action: action.type,
          success: false,
          message: 'Token clearing must be handled by calling service',
          requiresServiceAction: true
        };

      case 'REDIRECT_TO_LOGIN':
        // This would be implemented by the UI layer
        return {
          action: action.type,
          success: false,
          message: 'Login redirect must be handled by UI layer',
          requiresUIAction: true
        };

      case 'USE_CACHED_DATA':
      case 'SHOW_OFFLINE_MESSAGE':
      case 'SHOW_ERROR_MESSAGE':
        // These would be implemented by the UI layer
        return {
          action: action.type,
          success: false,
          message: 'UI action must be handled by UI layer',
          requiresUIAction: true
        };

      default:
        return {
          action: action.type,
          success: false,
          message: 'Unknown recovery action'
        };
    }
  }
}

export { AuthErrorHandler };
export default AuthErrorHandler;