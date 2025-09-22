import TokenStorageService from '../services/TokenStorageService';
import AuthenticationService from '../services/AuthenticationService';

/**
 * Authentication debugging utilities
 * Use these functions to diagnose token refresh issues
 */

/**
 * Get comprehensive authentication status for debugging
 * @returns {Promise<Object>} Detailed auth status
 */
export const getAuthDebugInfo = async () => {
  try {
    const [
      storageStats,
      isAuthenticated,
      tokens,
      failureStats
    ] = await Promise.all([
      TokenStorageService.getStorageStats(),
      AuthenticationService.isAuthenticated(),
      TokenStorageService.getTokens(),
      TokenStorageService.getRefreshFailureStats(),
    ]);

    const now = Date.now();
    const timeUntilExpiry = tokens ? tokens.expiresAt - now : null;
    const timeUntilExpiryMinutes = timeUntilExpiry ? Math.round(timeUntilExpiry / (1000 * 60)) : null;

    return {
      timestamp: new Date().toISOString(),
      isAuthenticated,
      tokens: {
        hasAccessToken: !!tokens?.accessToken,
        hasRefreshToken: !!tokens?.refreshToken,
        hasIdToken: !!tokens?.idToken,
        expiresAt: tokens?.expiresAt ? new Date(tokens.expiresAt).toISOString() : null,
        timeUntilExpiryMs: timeUntilExpiry,
        timeUntilExpiryMinutes: timeUntilExpiryMinutes,
        isExpired: timeUntilExpiry ? timeUntilExpiry <= 0 : true,
      },
      refresh: {
        needsRefresh: storageStats.needsRefresh,
        canRefresh: storageStats.canRefresh,
        failureCount: failureStats.failureCount,
        lastFailureTime: failureStats.lastFailureTime ? new Date(failureStats.lastFailureTime).toISOString() : null,
        timeSinceLastFailureMinutes: failureStats.timeSinceLastFailure ? Math.round(failureStats.timeSinceLastFailure / (1000 * 60)) : null,
      },
      storage: storageStats,
    };
  } catch (error) {
    console.error('Error getting auth debug info:', error);
    return {
      error: error.message,
      timestamp: new Date().toISOString(),
    };
  }
};

/**
 * Log authentication debug information to console
 */
export const logAuthDebugInfo = async () => {
  const debugInfo = await getAuthDebugInfo();
  console.log('=== AUTH DEBUG INFO ===');
  console.log(JSON.stringify(debugInfo, null, 2));
  console.log('=====================');
  return debugInfo;
};

/**
 * Test token refresh manually
 * @returns {Promise<Object>} Refresh test result
 */
export const testTokenRefresh = async () => {
  console.log('Testing token refresh...');
  
  const beforeInfo = await getAuthDebugInfo();
  console.log('Before refresh:', {
    canRefresh: beforeInfo.refresh.canRefresh,
    needsRefresh: beforeInfo.refresh.needsRefresh,
    timeUntilExpiryMinutes: beforeInfo.tokens.timeUntilExpiryMinutes,
  });

  try {
    const refreshResult = await AuthenticationService.refreshTokens();
    const afterInfo = await getAuthDebugInfo();
    
    console.log('Refresh result:', refreshResult);
    console.log('After refresh:', {
      canRefresh: afterInfo.refresh.canRefresh,
      needsRefresh: afterInfo.refresh.needsRefresh,
      timeUntilExpiryMinutes: afterInfo.tokens.timeUntilExpiryMinutes,
    });

    return {
      success: refreshResult,
      before: beforeInfo,
      after: afterInfo,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error('Token refresh test failed:', error);
    return {
      success: false,
      error: error.message,
      before: beforeInfo,
      timestamp: new Date().toISOString(),
    };
  }
};

/**
 * Clear refresh failure tracking (for testing)
 * @returns {Promise<boolean>} Success status
 */
export const clearRefreshFailures = async () => {
  try {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    await Promise.all([
      AsyncStorage.removeItem('auth_last_refresh_failure'),
      AsyncStorage.removeItem('auth_refresh_failure_count'),
    ]);
    console.log('Cleared refresh failure tracking');
    return true;
  } catch (error) {
    console.error('Error clearing refresh failures:', error);
    return false;
  }
};

/**
 * Monitor authentication status changes
 * @param {Function} callback - Callback function to receive status updates
 * @param {number} interval - Check interval in milliseconds (default: 30 seconds)
 * @returns {Function} Cleanup function to stop monitoring
 */
export const monitorAuthStatus = (callback, interval = 30000) => {
  let isMonitoring = true;
  
  const checkStatus = async () => {
    if (!isMonitoring) return;
    
    try {
      const debugInfo = await getAuthDebugInfo();
      callback(debugInfo);
    } catch (error) {
      console.error('Error monitoring auth status:', error);
      callback({ error: error.message, timestamp: new Date().toISOString() });
    }
    
    if (isMonitoring) {
      setTimeout(checkStatus, interval);
    }
  };
  
  // Start monitoring
  checkStatus();
  
  // Return cleanup function
  return () => {
    isMonitoring = false;
  };
};

/**
 * Format debug info for display in UI
 * @param {Object} debugInfo - Debug info from getAuthDebugInfo
 * @returns {string} Formatted string for display
 */
export const formatAuthDebugInfo = (debugInfo) => {
  if (debugInfo.error) {
    return `Error: ${debugInfo.error}`;
  }

  const { tokens, refresh } = debugInfo;
  
  return `
Auth Status: ${debugInfo.isAuthenticated ? 'Authenticated' : 'Not Authenticated'}
Token Expiry: ${tokens.timeUntilExpiryMinutes}min (${tokens.isExpired ? 'EXPIRED' : 'Valid'})
Needs Refresh: ${refresh.needsRefresh ? 'Yes' : 'No'}
Can Refresh: ${refresh.canRefresh ? 'Yes' : 'No'}
Refresh Failures: ${refresh.failureCount}
Last Failure: ${refresh.timeSinceLastFailureMinutes ? `${refresh.timeSinceLastFailureMinutes}min ago` : 'None'}
  `.trim();
};

export default {
  getAuthDebugInfo,
  logAuthDebugInfo,
  testTokenRefresh,
  clearRefreshFailures,
  monitorAuthStatus,
  formatAuthDebugInfo,
};