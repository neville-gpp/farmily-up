import { Alert } from 'react-native';

/**
 * Utility functions for error handling and user feedback
 */

/**
 * Check if device has network connectivity
 */
export const checkNetworkConnectivity = async () => {
  try {
    // Simple connectivity check using a lightweight request
    const response = await fetch('https://www.google.com/favicon.ico', {
      method: 'HEAD',
      timeout: 5000,
    });
    return response.ok;
  } catch (error) {
    console.warn('Network connectivity check failed:', error);
    return false;
  }
};

/**
 * Retry mechanism with exponential backoff
 */
export const retryWithBackoff = async (
  operation,
  maxRetries = 3,
  baseDelay = 1000,
  maxDelay = 10000
) => {
  let lastError;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Attempt ${attempt + 1}/${maxRetries + 1} for operation`);
      const result = await operation();
      return result;
    } catch (error) {
      lastError = error;
      console.error(`Attempt ${attempt + 1} failed:`, error.message);
      
      // Don't retry on the last attempt
      if (attempt === maxRetries) {
        break;
      }
      
      // Don't retry certain types of errors
      if (isNonRetryableError(error)) {
        console.log('Non-retryable error detected, stopping retries');
        break;
      }
      
      // Calculate delay with exponential backoff and jitter
      const delay = Math.min(
        baseDelay * Math.pow(2, attempt) + Math.random() * 1000,
        maxDelay
      );
      
      console.log(`Waiting ${delay}ms before retry...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
};

/**
 * Check if an error should not be retried
 */
export const isNonRetryableError = (error) => {
  const nonRetryablePatterns = [
    'validation',
    'invalid parameter',
    'unauthorized',
    'forbidden',
    'not found',
    'bad request',
    'credentials',
    'permission denied',
  ];
  
  const errorMessage = error.message?.toLowerCase() || '';
  return nonRetryablePatterns.some(pattern => errorMessage.includes(pattern));
};

/**
 * Get user-friendly error message based on error type
 */
export const getUserFriendlyErrorMessage = (error) => {
  const errorMessage = error.message?.toLowerCase() || '';
  
  // Network errors
  if (errorMessage.includes('network') || 
      errorMessage.includes('fetch') || 
      errorMessage.includes('timeout') ||
      errorMessage.includes('connection')) {
    return {
      title: 'Connection Problem',
      message: 'Please check your internet connection and try again.',
      icon: 'wifi-outline',
      canRetry: true,
    };
  }
  
  // Storage errors
  if (errorMessage.includes('asyncstorage') || 
      errorMessage.includes('storage') ||
      errorMessage.includes('save') ||
      errorMessage.includes('load')) {
    return {
      title: 'Storage Error',
      message: 'There was a problem saving your data. Please try again.',
      icon: 'save-outline',
      canRetry: true,
    };
  }
  
  // AWS/Textract errors
  if (errorMessage.includes('textract') || 
      errorMessage.includes('aws') ||
      errorMessage.includes('credentials')) {
    return {
      title: 'Service Unavailable',
      message: 'The book detection service is temporarily unavailable. You can still add book information manually.',
      icon: 'cloud-offline-outline',
      canRetry: true,
    };
  }
  
  // Validation errors
  if (errorMessage.includes('validation') || 
      errorMessage.includes('required') ||
      errorMessage.includes('invalid')) {
    return {
      title: 'Invalid Input',
      message: 'Please check your input and try again.',
      icon: 'alert-circle-outline',
      canRetry: false,
    };
  }
  
  // Permission errors
  if (errorMessage.includes('permission') || 
      errorMessage.includes('camera') ||
      errorMessage.includes('photo')) {
    return {
      title: 'Permission Required',
      message: 'Please grant the required permissions in your device settings.',
      icon: 'lock-closed-outline',
      canRetry: false,
    };
  }
  
  // Generic error
  return {
    title: 'Something went wrong',
    message: 'An unexpected error occurred. Please try again.',
    icon: 'alert-circle-outline',
    canRetry: true,
  };
};

/**
 * Show user-friendly error alert
 */
export const showErrorAlert = (error, onRetry = null) => {
  const errorInfo = getUserFriendlyErrorMessage(error);
  
  const buttons = [
    { text: 'OK', style: 'cancel' }
  ];
  
  if (errorInfo.canRetry && onRetry) {
    buttons.unshift({
      text: 'Try Again',
      onPress: onRetry,
    });
  }
  
  Alert.alert(
    errorInfo.title,
    errorInfo.message,
    buttons
  );
};

/**
 * Enhanced async operation wrapper with error handling
 */
export const withErrorHandling = async (
  operation,
  options = {}
) => {
  const {
    showLoading = false,
    showErrors = true,
    maxRetries = 1,
    requiresNetwork = false,
    onError = null,
    onRetry = null,
  } = options;
  
  try {
    // Check network connectivity if required
    if (requiresNetwork) {
      const hasNetwork = await checkNetworkConnectivity();
      if (!hasNetwork) {
        throw new Error('No network connection available');
      }
    }
    
    // Execute operation with retry logic
    const result = await retryWithBackoff(operation, maxRetries);
    return { success: true, data: result, error: null };
    
  } catch (error) {
    console.error('Operation failed:', error);
    
    // Call custom error handler if provided
    if (onError) {
      onError(error);
    }
    
    // Show error alert if enabled
    if (showErrors) {
      showErrorAlert(error, onRetry);
    }
    
    return { success: false, data: null, error };
  }
};

/**
 * Validate form data and return user-friendly error messages
 */
export const validateFormData = (data, validationRules) => {
  const errors = {};
  
  Object.keys(validationRules).forEach(field => {
    const rules = validationRules[field];
    const value = data[field];
    
    // Required validation
    if (rules.required && (!value || (typeof value === 'string' && !value.trim()))) {
      errors[field] = `${rules.label || field} is required`;
      return;
    }
    
    // Skip other validations if field is empty and not required
    if (!value || (typeof value === 'string' && !value.trim())) {
      return;
    }
    
    // String length validation
    if (rules.minLength && value.length < rules.minLength) {
      errors[field] = `${rules.label || field} must be at least ${rules.minLength} characters`;
    }
    
    if (rules.maxLength && value.length > rules.maxLength) {
      errors[field] = `${rules.label || field} cannot exceed ${rules.maxLength} characters`;
    }
    
    // Array validation
    if (rules.minItems && Array.isArray(value) && value.length < rules.minItems) {
      errors[field] = `Please select at least ${rules.minItems} ${rules.label || field}`;
    }
    
    if (rules.maxItems && Array.isArray(value) && value.length > rules.maxItems) {
      errors[field] = `Cannot select more than ${rules.maxItems} ${rules.label || field}`;
    }
    
    // Date validation
    if (rules.isDate && value) {
      const date = new Date(value);
      if (isNaN(date.getTime())) {
        errors[field] = `${rules.label || field} must be a valid date`;
      }
    }
    
    // Custom validation function
    if (rules.validate && typeof rules.validate === 'function') {
      const customError = rules.validate(value, data);
      if (customError) {
        errors[field] = customError;
      }
    }
  });
  
  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
};

/**
 * Debounce function for preventing rapid successive calls
 */
export const debounce = (func, delay) => {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func.apply(null, args), delay);
  };
};

/**
 * Create a loading state manager
 */
export const createLoadingManager = () => {
  const loadingStates = new Map();
  
  return {
    setLoading: (key, isLoading) => {
      loadingStates.set(key, isLoading);
    },
    
    isLoading: (key) => {
      return loadingStates.get(key) || false;
    },
    
    isAnyLoading: () => {
      return Array.from(loadingStates.values()).some(loading => loading);
    },
    
    clearAll: () => {
      loadingStates.clear();
    },
  };
};

/**
 * Safe JSON parsing with error handling
 */
export const safeJsonParse = (jsonString, defaultValue = null) => {
  try {
    return JSON.parse(jsonString);
  } catch (error) {
    console.warn('Failed to parse JSON:', error);
    return defaultValue;
  }
};

/**
 * Safe JSON stringifying with error handling
 */
export const safeJsonStringify = (data, defaultValue = '{}') => {
  try {
    return JSON.stringify(data);
  } catch (error) {
    console.warn('Failed to stringify JSON:', error);
    return defaultValue;
  }
};

/**
 * Log error with context information
 */
export const logError = (error, context = {}) => {
  const errorLog = {
    timestamp: new Date().toISOString(),
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack,
    },
    context,
    userAgent: navigator.userAgent || 'React Native',
  };
  
  console.error('=== ERROR LOG ===');
  console.error(JSON.stringify(errorLog, null, 2));
  
  // In a real app, you would send this to a logging service
  return errorLog;
};