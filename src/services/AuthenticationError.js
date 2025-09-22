/**
 * Enhanced AuthenticationError class with error classification and recovery strategies
 * Provides detailed error information for debugging and appropriate recovery mechanisms
 */
class AuthenticationError extends Error {
  // Error codes for classification
  static ERROR_CODES = {
    TOKEN_EXPIRED: 'TOKEN_EXPIRED',
    TOKEN_INVALID: 'TOKEN_INVALID',
    TOKEN_MISSING: 'TOKEN_MISSING',
    INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
    NETWORK_ERROR: 'NETWORK_ERROR',
    RATE_LIMITED: 'RATE_LIMITED',
    USER_NOT_FOUND: 'USER_NOT_FOUND',
    TOKEN_REFRESH_FAILED: 'TOKEN_REFRESH_FAILED',
    CONCURRENT_REFRESH: 'CONCURRENT_REFRESH',
    INVALID_TOKEN_FORMAT: 'INVALID_TOKEN_FORMAT',
    ACCOUNT_DISABLED: 'ACCOUNT_DISABLED',
    SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
    TIMEOUT: 'TIMEOUT',
    UNKNOWN_ERROR: 'UNKNOWN_ERROR'
  };

  // Recovery strategies
  static RECOVERY_STRATEGIES = {
    TOKEN_REFRESH: 'TOKEN_REFRESH',
    RETRY_WITH_BACKOFF: 'RETRY_WITH_BACKOFF',
    FALLBACK_TO_CACHE: 'FALLBACK_TO_CACHE',
    USER_REAUTHENTICATION: 'USER_REAUTHENTICATION',
    WAIT_AND_RETRY: 'WAIT_AND_RETRY',
    NO_RECOVERY: 'NO_RECOVERY'
  };

  constructor(message, code = AuthenticationError.ERROR_CODES.UNKNOWN_ERROR, recoverable = true, context = {}) {
    super(message);
    this.name = 'AuthenticationError';
    this.code = code;
    this.recoverable = recoverable;
    this.context = {
      timestamp: new Date().toISOString(),
      operation: context.operation || 'unknown',
      service: context.service || 'unknown',
      userId: context.userId || null,
      stackTrace: this.stack,
      ...context
    };
    this.recoveryAttempted = false;
    this.recoveryStrategy = this._determineRecoveryStrategy(code);
  }

  /**
   * Determine the appropriate recovery strategy based on error code
   */
  _determineRecoveryStrategy(code) {
    const { ERROR_CODES, RECOVERY_STRATEGIES } = AuthenticationError;
    
    switch (code) {
      case ERROR_CODES.TOKEN_EXPIRED:
        return RECOVERY_STRATEGIES.TOKEN_REFRESH;
      
      case ERROR_CODES.NETWORK_ERROR:
      case ERROR_CODES.TIMEOUT:
      case ERROR_CODES.SERVICE_UNAVAILABLE:
        return RECOVERY_STRATEGIES.RETRY_WITH_BACKOFF;
      
      case ERROR_CODES.RATE_LIMITED:
      case ERROR_CODES.CONCURRENT_REFRESH:
        return RECOVERY_STRATEGIES.WAIT_AND_RETRY;
      
      case ERROR_CODES.INVALID_CREDENTIALS:
      case ERROR_CODES.TOKEN_INVALID:
      case ERROR_CODES.TOKEN_MISSING:
      case ERROR_CODES.TOKEN_REFRESH_FAILED:
      case ERROR_CODES.INVALID_TOKEN_FORMAT:
      case ERROR_CODES.USER_NOT_FOUND:
        return RECOVERY_STRATEGIES.USER_REAUTHENTICATION;
      
      case ERROR_CODES.ACCOUNT_DISABLED:
        return RECOVERY_STRATEGIES.NO_RECOVERY;
      
      default:
        return this.recoverable ? RECOVERY_STRATEGIES.FALLBACK_TO_CACHE : RECOVERY_STRATEGIES.NO_RECOVERY;
    }
  }

  /**
   * Mark this error as having had recovery attempted
   */
  markRecoveryAttempted() {
    this.recoveryAttempted = true;
    this.context.recoveryAttemptedAt = new Date().toISOString();
  }

  /**
   * Check if this error can be recovered from
   */
  canRecover() {
    return this.recoverable && this.recoveryStrategy !== AuthenticationError.RECOVERY_STRATEGIES.NO_RECOVERY;
  }

  /**
   * Get recovery strategy for this error
   */
  getRecoveryStrategy() {
    return this.recoveryStrategy;
  }

  /**
   * Get error context for logging and debugging
   */
  getContext() {
    return this.context;
  }

  /**
   * Check if this error should trigger a retry
   */
  shouldRetry() {
    return this.recoverable && !this.recoveryAttempted && 
           [AuthenticationError.RECOVERY_STRATEGIES.RETRY_WITH_BACKOFF, 
            AuthenticationError.RECOVERY_STRATEGIES.WAIT_AND_RETRY].includes(this.recoveryStrategy);
  }

  /**
   * Check if this error should trigger token refresh
   */
  shouldRefreshToken() {
    return this.recoverable && !this.recoveryAttempted && 
           this.recoveryStrategy === AuthenticationError.RECOVERY_STRATEGIES.TOKEN_REFRESH;
  }

  /**
   * Check if this error requires user re-authentication
   */
  requiresReauthentication() {
    return this.recoveryStrategy === AuthenticationError.RECOVERY_STRATEGIES.USER_REAUTHENTICATION;
  }

  /**
   * Get a user-friendly error message
   */
  getUserMessage() {
    const { ERROR_CODES } = AuthenticationError;
    
    switch (this.code) {
      case ERROR_CODES.TOKEN_EXPIRED:
        return 'Your session has expired. Please wait while we refresh your login.';
      case ERROR_CODES.INVALID_CREDENTIALS:
        return 'Your login credentials are invalid. Please log in again.';
      case ERROR_CODES.NETWORK_ERROR:
        return 'Network connection error. Please check your internet connection and try again.';
      case ERROR_CODES.RATE_LIMITED:
        return 'Too many requests. Please wait a moment and try again.';
      case ERROR_CODES.USER_NOT_FOUND:
        return 'User account not found. Please log in again.';
      case ERROR_CODES.TOKEN_REFRESH_FAILED:
        return 'Unable to refresh your session. Please log in again.';
      case ERROR_CODES.CONCURRENT_REFRESH:
        return 'Authentication is being refreshed. Please wait a moment.';
      case ERROR_CODES.INVALID_TOKEN_FORMAT:
        return 'Invalid authentication format. Please log in again.';
      case ERROR_CODES.ACCOUNT_DISABLED:
        return 'Your account has been disabled. Please contact support.';
      case ERROR_CODES.SERVICE_UNAVAILABLE:
        return 'Authentication service is temporarily unavailable. Please try again later.';
      case ERROR_CODES.TIMEOUT:
        return 'Authentication request timed out. Please try again.';
      default:
        return 'An authentication error occurred. Please try again.';
    }
  }

  /**
   * Get retry delay in milliseconds based on error type
   */
  getRetryDelay(attemptCount = 1) {
    const { ERROR_CODES } = AuthenticationError;
    const baseDelay = 1000; // 1 second
    
    switch (this.code) {
      case ERROR_CODES.RATE_LIMITED:
        return Math.min(baseDelay * Math.pow(2, attemptCount), 30000); // Max 30 seconds
      case ERROR_CODES.NETWORK_ERROR:
      case ERROR_CODES.TIMEOUT:
        return Math.min(baseDelay * attemptCount, 10000); // Max 10 seconds
      case ERROR_CODES.SERVICE_UNAVAILABLE:
        return Math.min(baseDelay * Math.pow(2, attemptCount), 60000); // Max 1 minute
      case ERROR_CODES.CONCURRENT_REFRESH:
        return 500; // Short delay for concurrent operations
      default:
        return baseDelay;
    }
  }

  /**
   * Create error from existing error with classification
   */
  static fromError(error, context = {}) {
    if (error instanceof AuthenticationError) {
      return error;
    }

    let code = AuthenticationError.ERROR_CODES.UNKNOWN_ERROR;
    let recoverable = true;

    // Classify error based on message content
    const message = error.message?.toLowerCase() || '';
    
    if (message.includes('token') && message.includes('format')) {
      code = AuthenticationError.ERROR_CODES.INVALID_TOKEN_FORMAT;
      recoverable = false;
    } else if (message.includes('token') && (message.includes('expired') || message.includes('invalid'))) {
      code = AuthenticationError.ERROR_CODES.TOKEN_EXPIRED;
    } else if (message.includes('user not authenticated') || message.includes('not authenticated')) {
      code = AuthenticationError.ERROR_CODES.TOKEN_MISSING;
    } else if (message.includes('network') || message.includes('connection')) {
      code = AuthenticationError.ERROR_CODES.NETWORK_ERROR;
    } else if (message.includes('timeout')) {
      code = AuthenticationError.ERROR_CODES.TIMEOUT;
    } else if (message.includes('rate limit') || message.includes('too many')) {
      code = AuthenticationError.ERROR_CODES.RATE_LIMITED;
    } else if (message.includes('user not found')) {
      code = AuthenticationError.ERROR_CODES.USER_NOT_FOUND;
    } else if (message.includes('credentials') || message.includes('unauthorized')) {
      code = AuthenticationError.ERROR_CODES.INVALID_CREDENTIALS;
      recoverable = false;
    } else if (message.includes('disabled') || message.includes('suspended')) {
      code = AuthenticationError.ERROR_CODES.ACCOUNT_DISABLED;
      recoverable = false;
    } else if (message.includes('refresh') && message.includes('failed')) {
      code = AuthenticationError.ERROR_CODES.TOKEN_REFRESH_FAILED;
      recoverable = false;
    } else if (message.includes('service unavailable') || message.includes('server error')) {
      code = AuthenticationError.ERROR_CODES.SERVICE_UNAVAILABLE;
    } else if (message.includes('concurrent') || message.includes('already refreshing')) {
      code = AuthenticationError.ERROR_CODES.CONCURRENT_REFRESH;
    }

    return new AuthenticationError(
      error.message || 'Unknown authentication error',
      code,
      recoverable,
      {
        originalError: error.name,
        originalStack: error.stack,
        ...context
      }
    );
  }

  /**
   * Check if an error is an authentication-related error
   */
  static isAuthenticationError(error) {
    if (error instanceof AuthenticationError) {
      return true;
    }

    if (!error || !error.message) {
      return false;
    }

    const message = error.message.toLowerCase();
    const authKeywords = [
      'not authenticated',
      'authentication',
      'unauthorized',
      'token',
      'credentials',
      'login',
      'session'
    ];

    return authKeywords.some(keyword => message.includes(keyword));
  }

  /**
   * Convert to JSON for logging
   */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      recoverable: this.recoverable,
      recoveryStrategy: this.recoveryStrategy,
      recoveryAttempted: this.recoveryAttempted,
      context: this.context,
      stack: this.stack
    };
  }
}

module.exports = AuthenticationError;