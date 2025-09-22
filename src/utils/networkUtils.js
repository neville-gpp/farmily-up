import NetInfo from '@react-native-community/netinfo';

/**
 * Network utilities for handling connectivity and offline scenarios
 */

/**
 * Enhanced network connectivity checker
 */
export const checkNetworkConnectivity = async () => {
  try {
    const netInfoState = await NetInfo.fetch();
    
    // Check if device is connected
    if (!netInfoState.isConnected) {
      return {
        isConnected: false,
        type: 'none',
        quality: 'none'
      };
    }

    // Check connection quality with a lightweight test
    const startTime = Date.now();
    try {
      const response = await fetch('https://www.google.com/favicon.ico', {
        method: 'HEAD',
        timeout: 5000,
        cache: 'no-cache'
      });
      
      const responseTime = Date.now() - startTime;
      
      return {
        isConnected: response.ok,
        type: netInfoState.type,
        quality: getConnectionQuality(responseTime),
        responseTime
      };
    } catch (error) {
      return {
        isConnected: false,
        type: netInfoState.type,
        quality: 'poor',
        error: error.message
      };
    }
  } catch (error) {
    console.warn('Network connectivity check failed:', error);
    return {
      isConnected: false,
      type: 'unknown',
      quality: 'unknown',
      error: error.message
    };
  }
};

/**
 * Determine connection quality based on response time
 */
const getConnectionQuality = (responseTime) => {
  if (responseTime < 500) return 'excellent';
  if (responseTime < 1000) return 'good';
  if (responseTime < 2000) return 'fair';
  return 'poor';
};

/**
 * Enhanced retry mechanism with exponential backoff and jitter
 */
export const retryWithBackoff = async (
  operation,
  options = {}
) => {
  const {
    maxRetries = 3,
    baseDelay = 1000,
    maxDelay = 10000,
    backoffFactor = 2,
    jitter = true,
    retryCondition = defaultRetryCondition,
    onRetry = null
  } = options;

  let lastError;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Network operation attempt ${attempt + 1}/${maxRetries + 1}`);
      const result = await operation();
      return result;
    } catch (error) {
      lastError = error;
      console.error(`Attempt ${attempt + 1} failed:`, error.message);
      
      // Don't retry on the last attempt
      if (attempt === maxRetries) {
        break;
      }
      
      // Check if error should be retried
      if (!retryCondition(error)) {
        console.log('Non-retryable error detected, stopping retries');
        break;
      }
      
      // Calculate delay with exponential backoff and optional jitter
      let delay = Math.min(
        baseDelay * Math.pow(backoffFactor, attempt),
        maxDelay
      );
      
      if (jitter) {
        delay += Math.random() * 1000;
      }
      
      console.log(`Waiting ${Math.round(delay)}ms before retry...`);
      
      // Call retry callback if provided
      if (onRetry) {
        onRetry(attempt + 1, error, delay);
      }
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
};

/**
 * Default retry condition - determines if an error should be retried
 */
const defaultRetryCondition = (error) => {
  const errorMessage = error.message?.toLowerCase() || '';
  const errorCode = error.code?.toLowerCase() || '';
  
  // Don't retry authentication/authorization errors
  const authErrors = [
    'unauthorized',
    'forbidden',
    'invalid_grant',
    'access_denied',
    'notauthorizedexception',
    'usernotfoundexception',
    'incorrectusernameorpasswordexception'
  ];
  
  if (authErrors.some(authError => 
    errorMessage.includes(authError) || errorCode.includes(authError)
  )) {
    return false;
  }
  
  // Don't retry validation errors
  const validationErrors = [
    'validation',
    'invalid parameter',
    'bad request',
    'invalidparameterexception',
    'invalidpasswordexception',
    'usernameexistsexception'
  ];
  
  if (validationErrors.some(validationError => 
    errorMessage.includes(validationError) || errorCode.includes(validationError)
  )) {
    return false;
  }
  
  // Retry network and server errors
  const retryableErrors = [
    'network',
    'timeout',
    'connection',
    'fetch',
    'server error',
    'service unavailable',
    'too many requests',
    'throttling',
    'rate limit'
  ];
  
  return retryableErrors.some(retryableError => 
    errorMessage.includes(retryableError) || errorCode.includes(retryableError)
  );
};

/**
 * Network-aware operation wrapper
 */
export const withNetworkHandling = async (
  operation,
  options = {}
) => {
  const {
    requiresNetwork = true,
    showNetworkErrors = true,
    retryOptions = {},
    onNetworkError = null,
    onOffline = null
  } = options;

  try {
    // Check network connectivity if required
    if (requiresNetwork) {
      const networkStatus = await checkNetworkConnectivity();
      
      if (!networkStatus.isConnected) {
        const error = new Error('No network connection available');
        error.code = 'NETWORK_UNAVAILABLE';
        error.networkStatus = networkStatus;
        
        if (onOffline) {
          onOffline(networkStatus);
        }
        
        throw error;
      }
      
      // Warn about poor connection quality
      if (networkStatus.quality === 'poor') {
        console.warn('Poor network connection detected, operation may be slow');
      }
    }
    
    // Execute operation with retry logic
    const result = await retryWithBackoff(operation, retryOptions);
    return { success: true, data: result, error: null };
    
  } catch (error) {
    console.error('Network operation failed:', error);
    
    // Enhance error with network context
    const enhancedError = await enhanceNetworkError(error);
    
    // Call custom network error handler if provided
    if (onNetworkError) {
      onNetworkError(enhancedError);
    }
    
    return { success: false, data: null, error: enhancedError };
  }
};

/**
 * Enhance error with network context information
 */
const enhanceNetworkError = async (error) => {
  const networkStatus = await checkNetworkConnectivity();
  
  return {
    ...error,
    networkStatus,
    timestamp: new Date().toISOString(),
    isNetworkError: isNetworkRelatedError(error),
    userFriendlyMessage: getNetworkErrorMessage(error, networkStatus)
  };
};

/**
 * Check if error is network-related
 */
const isNetworkRelatedError = (error) => {
  const errorMessage = error.message?.toLowerCase() || '';
  const networkKeywords = [
    'network',
    'connection',
    'timeout',
    'fetch',
    'offline',
    'unreachable',
    'dns',
    'socket'
  ];
  
  return networkKeywords.some(keyword => errorMessage.includes(keyword));
};

/**
 * Get user-friendly network error message
 */
const getNetworkErrorMessage = (error, networkStatus) => {
  if (!networkStatus.isConnected) {
    return 'You appear to be offline. Please check your internet connection and try again.';
  }
  
  if (networkStatus.quality === 'poor') {
    return 'Your connection seems slow. Please check your internet connection or try again later.';
  }
  
  const errorMessage = error.message?.toLowerCase() || '';
  
  if (errorMessage.includes('timeout')) {
    return 'The request timed out. Please check your connection and try again.';
  }
  
  if (errorMessage.includes('server') || errorMessage.includes('5')) {
    return 'The service is temporarily unavailable. Please try again in a few moments.';
  }
  
  if (errorMessage.includes('throttl') || errorMessage.includes('rate limit')) {
    return 'Too many requests. Please wait a moment before trying again.';
  }
  
  return 'A network error occurred. Please check your connection and try again.';
};

/**
 * Offline operation queue for handling requests when offline
 */
class OfflineQueue {
  constructor() {
    this.queue = [];
    this.isProcessing = false;
    this.listeners = [];
  }
  
  /**
   * Add operation to offline queue
   */
  enqueue(operation, metadata = {}) {
    const queueItem = {
      id: Date.now() + Math.random(),
      operation,
      metadata,
      timestamp: new Date().toISOString(),
      retryCount: 0
    };
    
    this.queue.push(queueItem);
    this.notifyListeners('enqueued', queueItem);
    
    return queueItem.id;
  }
  
  /**
   * Process offline queue when network is available
   */
  async processQueue() {
    if (this.isProcessing || this.queue.length === 0) {
      return;
    }
    
    this.isProcessing = true;
    this.notifyListeners('processing', { queueLength: this.queue.length });
    
    const results = [];
    
    while (this.queue.length > 0) {
      const item = this.queue.shift();
      
      try {
        const result = await item.operation();
        results.push({ id: item.id, success: true, result });
        this.notifyListeners('success', { id: item.id, result });
      } catch (error) {
        item.retryCount++;
        
        if (item.retryCount < 3 && defaultRetryCondition(error)) {
          // Re-queue for retry
          this.queue.push(item);
          this.notifyListeners('retry', { id: item.id, error, retryCount: item.retryCount });
        } else {
          // Give up on this item
          results.push({ id: item.id, success: false, error });
          this.notifyListeners('failed', { id: item.id, error });
        }
      }
    }
    
    this.isProcessing = false;
    this.notifyListeners('completed', { results });
    
    return results;
  }
  
  /**
   * Clear the offline queue
   */
  clear() {
    const clearedCount = this.queue.length;
    this.queue = [];
    this.notifyListeners('cleared', { clearedCount });
  }
  
  /**
   * Get queue status
   */
  getStatus() {
    return {
      queueLength: this.queue.length,
      isProcessing: this.isProcessing,
      oldestItem: this.queue[0]?.timestamp || null
    };
  }
  
  /**
   * Add listener for queue events
   */
  addListener(callback) {
    this.listeners.push(callback);
  }
  
  /**
   * Remove listener
   */
  removeListener(callback) {
    this.listeners = this.listeners.filter(listener => listener !== callback);
  }
  
  /**
   * Notify all listeners of queue events
   */
  notifyListeners(event, data) {
    this.listeners.forEach(listener => {
      try {
        listener(event, data);
      } catch (error) {
        console.error('Error in offline queue listener:', error);
      }
    });
  }
}

// Global offline queue instance
export const offlineQueue = new OfflineQueue();

/**
 * Auto-process offline queue when network becomes available
 */
let networkListener = null;

export const startOfflineQueueMonitoring = () => {
  if (networkListener) {
    return; // Already monitoring
  }
  
  networkListener = NetInfo.addEventListener(state => {
    if (state.isConnected && offlineQueue.getStatus().queueLength > 0) {
      console.log('Network restored, processing offline queue...');
      offlineQueue.processQueue();
    }
  });
};

export const stopOfflineQueueMonitoring = () => {
  if (networkListener) {
    networkListener();
    networkListener = null;
  }
};

/**
 * Network-aware authentication operation wrapper
 */
export const withAuthNetworkHandling = async (
  operation,
  operationName = 'Authentication operation'
) => {
  return withNetworkHandling(operation, {
    requiresNetwork: true,
    retryOptions: {
      maxRetries: 2,
      baseDelay: 1000,
      maxDelay: 5000,
      onRetry: (attempt, error, delay) => {
        console.log(`${operationName} retry ${attempt}, waiting ${Math.round(delay)}ms`);
      }
    },
    onNetworkError: (error) => {
      console.error(`${operationName} network error:`, error.userFriendlyMessage);
    },
    onOffline: (networkStatus) => {
      console.warn(`${operationName} attempted while offline:`, networkStatus);
    }
  });
};

/**
 * Queue authentication operation for offline execution
 */
export const queueAuthOperation = (operation, metadata = {}) => {
  return offlineQueue.enqueue(operation, {
    ...metadata,
    type: 'authentication',
    category: 'auth'
  });
};

/**
 * Get network status for UI display
 */
export const getNetworkStatusForUI = async () => {
  const status = await checkNetworkConnectivity();
  
  const statusMap = {
    excellent: { color: '#00aa00', text: 'Excellent', icon: 'wifi' },
    good: { color: '#88aa00', text: 'Good', icon: 'wifi' },
    fair: { color: '#aaaa00', text: 'Fair', icon: 'wifi-outline' },
    poor: { color: '#aa4400', text: 'Poor', icon: 'wifi-outline' },
    none: { color: '#aa0000', text: 'Offline', icon: 'wifi-off' },
    unknown: { color: '#888888', text: 'Unknown', icon: 'help-circle-outline' }
  };
  
  return {
    ...status,
    ui: statusMap[status.quality] || statusMap.unknown
  };
};