import AsyncStorage from '@react-native-async-storage/async-storage';
import DynamoDBTokenStorageService from './DynamoDBTokenStorageService';

// Storage keys for authentication tokens
const STORAGE_KEYS = {
  ACCESS_TOKEN: 'auth_access_token',
  REFRESH_TOKEN: 'auth_refresh_token',
  ID_TOKEN: 'auth_id_token',
  TOKEN_EXPIRY: 'auth_token_expiry',
  USER_PROFILE: 'auth_user_profile',
  LAST_REFRESH: 'auth_last_refresh',
  LAST_REFRESH_FAILURE: 'auth_last_refresh_failure',
  REFRESH_FAILURE_COUNT: 'auth_refresh_failure_count',
};

// Token validation constants
const TOKEN_BUFFER_TIME = 5 * 60 * 1000; // 5 minutes buffer before expiry
const MAX_REFRESH_ATTEMPTS = 3;
const REFRESH_COOLDOWN = 30 * 1000; // 30 seconds cooldown between refresh attempts
const FAILED_REFRESH_COOLDOWN = 5 * 60 * 1000; // 5 minutes cooldown after failed refresh

class TokenStorageService {
  // Configuration flag to switch between storage backends
  static USE_DYNAMODB = process.env.EXPO_PUBLIC_USE_DYNAMODB === 'true' || false;
  
  /**
   * Enable DynamoDB backend
   * @static
   */
  static enableDynamoDB() {
    this.USE_DYNAMODB = true;
  }
  
  /**
   * Disable DynamoDB backend (fallback to AsyncStorage)
   * @static
   */
  static disableDynamoDB() {
    this.USE_DYNAMODB = false;
  }
  
  /**
   * Check if DynamoDB backend is enabled
   * @static
   * @returns {boolean} True if DynamoDB is enabled
   */
  static isDynamoDBEnabled() {
    return this.USE_DYNAMODB;
  }
  /**
   * Store authentication tokens securely
   * @param {Object} tokens - Token object
   * @param {string} tokens.accessToken - Access token
   * @param {string} tokens.refreshToken - Refresh token
   * @param {string} tokens.idToken - ID token
   * @param {number} tokens.expiresIn - Token expiry time in seconds
   * @returns {Promise<boolean>} Success status
   */
  static async storeTokens(tokens) {
    if (this.USE_DYNAMODB) {
      try {
        return await DynamoDBTokenStorageService.storeTokens(tokens);
      } catch (error) {
        console.warn('DynamoDB backend failed, falling back to AsyncStorage:', error);
        return await this._storeTokensInAsyncStorage(tokens);
      }
    }
    return await this._storeTokensInAsyncStorage(tokens);
  }
  
  /**
   * Retrieve stored authentication tokens
   * @returns {Promise<Object|null>} Token object or null if not found
   */
  static async getTokens() {
    if (this.USE_DYNAMODB) {
      try {
        const result = await DynamoDBTokenStorageService.getTokens();
        // If DynamoDB returns null, try AsyncStorage as fallback
        if (result === null) {
          return await this._getTokensFromAsyncStorage();
        }
        return result;
      } catch (error) {
        console.warn('DynamoDB backend failed, falling back to AsyncStorage:', error);
        return await this._getTokensFromAsyncStorage();
      }
    }
    return await this._getTokensFromAsyncStorage();
  }
  
  /**
   * Get access token if valid, otherwise return null
   * @returns {Promise<string|null>} Valid access token or null
   */
  static async getValidAccessToken() {
    if (this.USE_DYNAMODB) {
      try {
        return await DynamoDBTokenStorageService.getValidAccessToken();
      } catch (error) {
        console.warn('DynamoDB backend failed, falling back to AsyncStorage:', error);
        return await this._getValidAccessTokenFromAsyncStorage();
      }
    }
    return await this._getValidAccessTokenFromAsyncStorage();
  }
  
  /**
   * Clear all stored tokens and related data
   * @returns {Promise<boolean>} Success status
   */
  static async clearTokens() {
    if (this.USE_DYNAMODB) {
      try {
        return await DynamoDBTokenStorageService.clearTokens();
      } catch (error) {
        console.warn('DynamoDB backend failed, falling back to AsyncStorage:', error);
        return await this._clearTokensFromAsyncStorage();
      }
    }
    return await this._clearTokensFromAsyncStorage();
  }
  
  /**
   * Store user profile data
   * @param {Object} userProfile - User profile object
   * @returns {Promise<boolean>} Success status
   */
  static async storeUserProfile(userProfile) {
    if (this.USE_DYNAMODB) {
      try {
        return await DynamoDBTokenStorageService.storeUserProfile(userProfile);
      } catch (error) {
        console.warn('DynamoDB backend failed, falling back to AsyncStorage:', error);
        return await this._storeUserProfileInAsyncStorage(userProfile);
      }
    }
    return await this._storeUserProfileInAsyncStorage(userProfile);
  }
  
  /**
   * Retrieve stored user profile
   * @returns {Promise<Object|null>} User profile or null
   */
  static async getUserProfile() {
    if (this.USE_DYNAMODB) {
      try {
        return await DynamoDBTokenStorageService.getUserProfile();
      } catch (error) {
        console.warn('DynamoDB backend failed, falling back to AsyncStorage:', error);
        return await this._getUserProfileFromAsyncStorage();
      }
    }
    return await this._getUserProfileFromAsyncStorage();
  }
  
  // Delegate other methods to DynamoDB or AsyncStorage implementations
  static async validateToken(token, expiryTime) {
    if (this.USE_DYNAMODB) {
      try {
        return await DynamoDBTokenStorageService.validateToken(token, expiryTime);
      } catch (error) {
        console.warn('DynamoDB backend failed, falling back to AsyncStorage:', error);
        return await this._validateTokenInAsyncStorage(token, expiryTime);
      }
    }
    return await this._validateTokenInAsyncStorage(token, expiryTime);
  }
  
  static async areTokensExpired() {
    if (this.USE_DYNAMODB) {
      try {
        return await DynamoDBTokenStorageService.areTokensExpired();
      } catch (error) {
        console.warn('DynamoDB backend failed, falling back to AsyncStorage:', error);
        return await this._areTokensExpiredInAsyncStorage();
      }
    }
    return await this._areTokensExpiredInAsyncStorage();
  }
  
  static async needsRefresh() {
    if (this.USE_DYNAMODB) {
      try {
        return await DynamoDBTokenStorageService.needsRefresh();
      } catch (error) {
        console.warn('DynamoDB backend failed, falling back to AsyncStorage:', error);
        return await this._needsRefreshInAsyncStorage();
      }
    }
    return await this._needsRefreshInAsyncStorage();
  }
  
  static async canRefresh() {
    if (this.USE_DYNAMODB) {
      try {
        return await DynamoDBTokenStorageService.canRefresh();
      } catch (error) {
        console.warn('DynamoDB backend failed, falling back to AsyncStorage:', error);
        return await this._canRefreshInAsyncStorage();
      }
    }
    return await this._canRefreshInAsyncStorage();
  }
  
  static async updateLastRefresh() {
    if (this.USE_DYNAMODB) {
      try {
        return await DynamoDBTokenStorageService.updateLastRefresh();
      } catch (error) {
        console.warn('DynamoDB backend failed, falling back to AsyncStorage:', error);
        return await this._updateLastRefreshInAsyncStorage();
      }
    }
    return await this._updateLastRefreshInAsyncStorage();
  }
  
  static async recordRefreshFailure() {
    if (this.USE_DYNAMODB) {
      try {
        return await DynamoDBTokenStorageService.recordRefreshFailure();
      } catch (error) {
        console.warn('DynamoDB backend failed, falling back to AsyncStorage:', error);
        return await this._recordRefreshFailureInAsyncStorage();
      }
    }
    return await this._recordRefreshFailureInAsyncStorage();
  }
  
  static async getRefreshFailureStats() {
    if (this.USE_DYNAMODB) {
      try {
        return await DynamoDBTokenStorageService.getRefreshFailureStats();
      } catch (error) {
        console.warn('DynamoDB backend failed, falling back to AsyncStorage:', error);
        return await this._getRefreshFailureStatsFromAsyncStorage();
      }
    }
    return await this._getRefreshFailureStatsFromAsyncStorage();
  }
  
  static async getStorageStats() {
    if (this.USE_DYNAMODB) {
      try {
        return await DynamoDBTokenStorageService.getStorageStats();
      } catch (error) {
        console.warn('DynamoDB backend failed, falling back to AsyncStorage:', error);
        return await this._getStorageStatsFromAsyncStorage();
      }
    }
    return await this._getStorageStatsFromAsyncStorage();
  }
  
  // Private AsyncStorage implementation methods (renamed from original methods)
  
  /**
   * Store authentication tokens securely in AsyncStorage
   * @private
   */
  static async _storeTokensInAsyncStorage(tokens) {
    try {
      if (
        !tokens ||
        !tokens.accessToken ||
        !tokens.refreshToken ||
        !tokens.idToken
      ) {
        throw new Error('Invalid tokens provided');
      }

      const expiryTime = Date.now() + tokens.expiresIn * 1000;
      const currentTime = Date.now();

      const tokenData = {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        idToken: tokens.idToken,
        expiryTime: expiryTime.toString(),
        storedAt: currentTime.toString(),
      };

      // Store tokens atomically
      await Promise.all([
        AsyncStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, tokenData.accessToken),
        AsyncStorage.setItem(
          STORAGE_KEYS.REFRESH_TOKEN,
          tokenData.refreshToken
        ),
        AsyncStorage.setItem(STORAGE_KEYS.ID_TOKEN, tokenData.idToken),
        AsyncStorage.setItem(STORAGE_KEYS.TOKEN_EXPIRY, tokenData.expiryTime),
        AsyncStorage.setItem(STORAGE_KEYS.LAST_REFRESH, currentTime.toString()),
      ]);

      return true;
    } catch (error) {
      console.error('Error storing tokens:', error);
      return false;
    }
  }

  /**
   * Retrieve stored authentication tokens from AsyncStorage
   * @private
   * @returns {Promise<Object|null>} Token object or null if not found
   */
  static async _getTokensFromAsyncStorage() {
    try {
      const [accessToken, refreshToken, idToken, expiryTime, storedAt] =
        await Promise.all([
          AsyncStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN),
          AsyncStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN),
          AsyncStorage.getItem(STORAGE_KEYS.ID_TOKEN),
          AsyncStorage.getItem(STORAGE_KEYS.TOKEN_EXPIRY),
          AsyncStorage.getItem(STORAGE_KEYS.LAST_REFRESH),
        ]);

      if (!accessToken || !refreshToken || !idToken || !expiryTime) {
        return null;
      }

      return {
        accessToken,
        refreshToken,
        idToken,
        expiresAt: parseInt(expiryTime),
        storedAt: storedAt ? parseInt(storedAt) : null,
      };
    } catch (error) {
      console.error('Error retrieving tokens:', error);
      return null;
    }
  }

  /**
   * Get access token if valid, otherwise return null from AsyncStorage
   * @private
   * @returns {Promise<string|null>} Valid access token or null
   */
  static async _getValidAccessTokenFromAsyncStorage() {
    try {
      const tokens = await this._getTokensFromAsyncStorage();

      if (!tokens) {
        return null;
      }

      const isValid = await this._validateTokenInAsyncStorage(
        tokens.accessToken,
        tokens.expiresAt
      );
      return isValid ? tokens.accessToken : null;
    } catch (error) {
      console.error('Error getting valid access token:', error);
      return null;
    }
  }

  /**
   * Validate if a token is still valid
   * @param {string} token - Token to validate
   * @param {number} expiryTime - Token expiry timestamp
   * @returns {Promise<boolean>} Validation result
   */
  static async validateToken(token, expiryTime) {
    try {
      if (!token || !expiryTime) {
        return false;
      }

      // Check if token is expired (with buffer time)
      const now = Date.now();
      const isExpired = now >= expiryTime - TOKEN_BUFFER_TIME;

      if (isExpired) {
        return false;
      }

      // Additional token format validation
      return this._validateTokenFormat(token);
    } catch (error) {
      console.error('Error validating token:', error);
      return false;
    }
  }

  /**
   * Check if tokens are expired
   * @returns {Promise<boolean>} True if tokens are expired
   */
  static async areTokensExpired() {
    try {
      const tokens = await this.getTokens();

      if (!tokens || !tokens.expiresAt) {
        return true;
      }

      const now = Date.now();
      return now >= tokens.expiresAt - TOKEN_BUFFER_TIME;
    } catch (error) {
      console.error('Error checking token expiry:', error);
      return true;
    }
  }

  /**
   * Get time until token expiry in milliseconds
   * @returns {Promise<number>} Time until expiry (negative if expired)
   */
  static async getTimeUntilExpiry() {
    try {
      const tokens = await this.getTokens();

      if (!tokens || !tokens.expiresAt) {
        return -1;
      }

      const now = Date.now();
      return tokens.expiresAt - now;
    } catch (error) {
      console.error('Error getting time until expiry:', error);
      return -1;
    }
  }

  /**
   * Get token expiration time as timestamp
   * @returns {Promise<number>} Token expiration timestamp
   */
  static async getTokenExpirationTime() {
    try {
      const tokens = await this.getTokens();

      if (!tokens || !tokens.expiresAt) {
        return 0;
      }

      return tokens.expiresAt;
    } catch (error) {
      console.error('Error getting token expiration time:', error);
      return 0;
    }
  }

  /**
   * Check if token refresh is needed
   * @returns {Promise<boolean>} True if refresh is needed
   */
  static async needsRefresh() {
    try {
      const timeUntilExpiry = await this.getTimeUntilExpiry();

      // Refresh if token expires within buffer time
      return timeUntilExpiry <= TOKEN_BUFFER_TIME && timeUntilExpiry > 0;
    } catch (error) {
      console.error('Error checking refresh need:', error);
      return false;
    }
  }

  /**
   * Check if refresh is allowed (not in cooldown)
   * @returns {Promise<boolean>} True if refresh is allowed
   */
  static async canRefresh() {
    try {
      const [lastRefresh, lastFailure, failureCount] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEYS.LAST_REFRESH),
        AsyncStorage.getItem(STORAGE_KEYS.LAST_REFRESH_FAILURE),
        AsyncStorage.getItem(STORAGE_KEYS.REFRESH_FAILURE_COUNT),
      ]);

      const now = Date.now();

      // Check regular refresh cooldown
      if (lastRefresh) {
        const lastRefreshTime = parseInt(lastRefresh);
        if (now - lastRefreshTime < REFRESH_COOLDOWN) {
          console.log('Refresh blocked by regular cooldown');
          return false;
        }
      }

      // Check failure-based cooldown
      if (lastFailure && failureCount) {
        const lastFailureTime = parseInt(lastFailure);
        const failures = parseInt(failureCount);
        
        // Exponential backoff based on failure count
        const failureCooldown = Math.min(
          FAILED_REFRESH_COOLDOWN * Math.pow(2, failures - 1),
          30 * 60 * 1000 // Max 30 minutes
        );
        
        if (now - lastFailureTime < failureCooldown) {
          console.log(`Refresh blocked by failure cooldown: ${failures} failures, ${Math.round(failureCooldown / 1000)}s remaining`);
          return false;
        }
      }

      return true;
    } catch (error) {
      console.error('Error checking refresh cooldown:', error);
      return true;
    }
  }

  /**
   * Update last refresh timestamp
   * @returns {Promise<void>}
   */
  static async updateLastRefresh() {
    try {
      const now = Date.now();
      await Promise.all([
        AsyncStorage.setItem(STORAGE_KEYS.LAST_REFRESH, now.toString()),
        // Clear failure tracking on successful refresh
        AsyncStorage.removeItem(STORAGE_KEYS.LAST_REFRESH_FAILURE),
        AsyncStorage.removeItem(STORAGE_KEYS.REFRESH_FAILURE_COUNT),
      ]);
    } catch (error) {
      console.error('Error updating last refresh:', error);
    }
  }

  /**
   * Record a refresh failure
   * @returns {Promise<void>}
   */
  static async recordRefreshFailure() {
    try {
      const now = Date.now();
      const currentCount = await AsyncStorage.getItem(STORAGE_KEYS.REFRESH_FAILURE_COUNT);
      const failureCount = currentCount ? parseInt(currentCount) + 1 : 1;
      
      await Promise.all([
        AsyncStorage.setItem(STORAGE_KEYS.LAST_REFRESH_FAILURE, now.toString()),
        AsyncStorage.setItem(STORAGE_KEYS.REFRESH_FAILURE_COUNT, failureCount.toString()),
      ]);
      
      console.log(`Recorded refresh failure #${failureCount}`);
    } catch (error) {
      console.error('Error recording refresh failure:', error);
    }
  }

  /**
   * Get refresh failure statistics
   * @returns {Promise<Object>} Failure statistics
   */
  static async getRefreshFailureStats() {
    try {
      const [lastFailure, failureCount] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEYS.LAST_REFRESH_FAILURE),
        AsyncStorage.getItem(STORAGE_KEYS.REFRESH_FAILURE_COUNT),
      ]);

      return {
        lastFailureTime: lastFailure ? parseInt(lastFailure) : null,
        failureCount: failureCount ? parseInt(failureCount) : 0,
        timeSinceLastFailure: lastFailure ? Date.now() - parseInt(lastFailure) : null,
      };
    } catch (error) {
      console.error('Error getting refresh failure stats:', error);
      return {
        lastFailureTime: null,
        failureCount: 0,
        timeSinceLastFailure: null,
      };
    }
  }

  /**
   * Clear all stored tokens and related data
   * @returns {Promise<boolean>} Success status
   */
  static async clearTokens() {
    try {
      await Promise.all([
        AsyncStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN),
        AsyncStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN),
        AsyncStorage.removeItem(STORAGE_KEYS.ID_TOKEN),
        AsyncStorage.removeItem(STORAGE_KEYS.TOKEN_EXPIRY),
        AsyncStorage.removeItem(STORAGE_KEYS.USER_PROFILE),
        AsyncStorage.removeItem(STORAGE_KEYS.LAST_REFRESH),
        AsyncStorage.removeItem(STORAGE_KEYS.LAST_REFRESH_FAILURE),
        AsyncStorage.removeItem(STORAGE_KEYS.REFRESH_FAILURE_COUNT),
        // Clear cached user ID that might be used by DynamoDBTokenStorageService
        AsyncStorage.removeItem('cached_user_id'),
      ]);

      return true;
    } catch (error) {
      console.error('Error clearing tokens:', error);
      return false;
    }
  }

  /**
   * Store user profile data
   * @param {Object} userProfile - User profile object
   * @returns {Promise<boolean>} Success status
   */
  static async storeUserProfile(userProfile) {
    try {
      if (!userProfile) {
        return false;
      }

      const profileData = {
        ...userProfile,
        cachedAt: Date.now(),
      };

      await AsyncStorage.setItem(
        STORAGE_KEYS.USER_PROFILE,
        JSON.stringify(profileData)
      );
      return true;
    } catch (error) {
      console.error('Error storing user profile:', error);
      return false;
    }
  }

  /**
   * Retrieve stored user profile
   * @returns {Promise<Object|null>} User profile or null
   */
  static async getUserProfile() {
    try {
      const profileData = await AsyncStorage.getItem(STORAGE_KEYS.USER_PROFILE);

      if (!profileData) {
        return null;
      }

      return JSON.parse(profileData);
    } catch (error) {
      console.error('Error retrieving user profile:', error);
      return null;
    }
  }

  /**
   * Check if user profile cache is valid (not older than 1 hour)
   * @returns {Promise<boolean>} True if cache is valid
   */
  static async isProfileCacheValid() {
    try {
      const profile = await this.getUserProfile();

      if (!profile || !profile.cachedAt) {
        return false;
      }

      const now = Date.now();
      const cacheAge = now - profile.cachedAt;
      const maxCacheAge = 60 * 60 * 1000; // 1 hour

      return cacheAge < maxCacheAge;
    } catch (error) {
      console.error('Error checking profile cache validity:', error);
      return false;
    }
  }

  /**
   * Get storage statistics for debugging
   * @returns {Promise<Object>} Storage statistics
   */
  static async getStorageStats() {
    try {
      const tokens = await this.getTokens();
      const profile = await this.getUserProfile();
      const timeUntilExpiry = await this.getTimeUntilExpiry();
      const needsRefresh = await this.needsRefresh();
      const canRefresh = await this.canRefresh();
      const failureStats = await this.getRefreshFailureStats();

      return {
        hasTokens: !!tokens,
        hasProfile: !!profile,
        timeUntilExpiry,
        needsRefresh,
        canRefresh,
        tokensExpired: await this.areTokensExpired(),
        profileCacheValid: await this.isProfileCacheValid(),
        refreshFailures: failureStats,
      };
    } catch (error) {
      console.error('Error getting storage stats:', error);
      return {
        hasTokens: false,
        hasProfile: false,
        timeUntilExpiry: -1,
        needsRefresh: false,
        canRefresh: true,
        tokensExpired: true,
        profileCacheValid: false,
        refreshFailures: {
          lastFailureTime: null,
          failureCount: 0,
          timeSinceLastFailure: null,
        },
      };
    }
  }

  // Private helper methods

  /**
   * Validate token format (basic JWT structure check)
   * @private
   * @param {string} token - Token to validate
   * @returns {boolean} True if token format is valid
   */
  static _validateTokenFormat(token) {
    try {
      if (!token || typeof token !== 'string') {
        return false;
      }

      // Basic JWT format check (3 parts separated by dots)
      const parts = token.split('.');
      if (parts.length !== 3) {
        return false;
      }

      // Check that each part is base64-like (contains valid characters)
      const base64Regex = /^[A-Za-z0-9_-]+$/;
      return parts.every((part) => base64Regex.test(part));
    } catch (error) {
      console.error('Error validating token format:', error);
      return false;
    }
  }

  /**
   * Validate token expiry time
   * @private
   * @param {number} expiryTime - Expiry timestamp
   * @returns {boolean} True if expiry time is valid
   */
  static _validateExpiryTime(expiryTime) {
    try {
      if (!expiryTime || typeof expiryTime !== 'number') {
        return false;
      }

      const now = Date.now();
      const maxFutureTime = now + 365 * 24 * 60 * 60 * 1000; // 1 year from now

      // Expiry time should be in the future but not too far
      return expiryTime > now && expiryTime < maxFutureTime;
    } catch (error) {
      console.error('Error validating expiry time:', error);
      return false;
    }
  }

  // Private AsyncStorage implementation methods for fallback

  /**
   * Validate if a token is still valid (AsyncStorage version)
   * @private
   */
  static async _validateTokenInAsyncStorage(token, expiryTime) {
    try {
      if (!token || !expiryTime) {
        return false;
      }

      // Check if token is expired (with buffer time)
      const now = Date.now();
      const isExpired = now >= expiryTime - TOKEN_BUFFER_TIME;

      if (isExpired) {
        return false;
      }

      // Additional token format validation
      return this._validateTokenFormat(token);
    } catch (error) {
      console.error('Error validating token:', error);
      return false;
    }
  }

  /**
   * Check if tokens are expired (AsyncStorage version)
   * @private
   */
  static async _areTokensExpiredInAsyncStorage() {
    try {
      const tokens = await this._getTokensFromAsyncStorage();

      if (!tokens || !tokens.expiresAt) {
        return true;
      }

      const now = Date.now();
      return now >= tokens.expiresAt - TOKEN_BUFFER_TIME;
    } catch (error) {
      console.error('Error checking token expiry:', error);
      return true;
    }
  }

  /**
   * Check if token refresh is needed (AsyncStorage version)
   * @private
   */
  static async _needsRefreshInAsyncStorage() {
    try {
      const tokens = await this._getTokensFromAsyncStorage();

      if (!tokens || !tokens.expiresAt) {
        return false;
      }

      const timeUntilExpiry = tokens.expiresAt - Date.now();
      return timeUntilExpiry <= TOKEN_BUFFER_TIME && timeUntilExpiry > 0;
    } catch (error) {
      console.error('Error checking refresh need:', error);
      return false;
    }
  }

  /**
   * Check if refresh is allowed (AsyncStorage version)
   * @private
   */
  static async _canRefreshInAsyncStorage() {
    try {
      const [lastRefresh, lastFailure, failureCount] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEYS.LAST_REFRESH),
        AsyncStorage.getItem(STORAGE_KEYS.LAST_REFRESH_FAILURE),
        AsyncStorage.getItem(STORAGE_KEYS.REFRESH_FAILURE_COUNT),
      ]);

      const now = Date.now();

      // Check regular refresh cooldown
      if (lastRefresh) {
        const lastRefreshTime = parseInt(lastRefresh);
        if (now - lastRefreshTime < REFRESH_COOLDOWN) {
          console.log('Refresh blocked by regular cooldown');
          return false;
        }
      }

      // Check failure-based cooldown
      if (lastFailure && failureCount) {
        const lastFailureTime = parseInt(lastFailure);
        const failures = parseInt(failureCount);
        
        // Exponential backoff based on failure count
        const failureCooldown = Math.min(
          FAILED_REFRESH_COOLDOWN * Math.pow(2, failures - 1),
          30 * 60 * 1000 // Max 30 minutes
        );
        
        if (now - lastFailureTime < failureCooldown) {
          console.log(`Refresh blocked by failure cooldown: ${failures} failures, ${Math.round(failureCooldown / 1000)}s remaining`);
          return false;
        }
      }

      return true;
    } catch (error) {
      console.error('Error checking refresh cooldown:', error);
      return true;
    }
  }

  /**
   * Update last refresh timestamp (AsyncStorage version)
   * @private
   */
  static async _updateLastRefreshInAsyncStorage() {
    try {
      const now = Date.now();
      await Promise.all([
        AsyncStorage.setItem(STORAGE_KEYS.LAST_REFRESH, now.toString()),
        // Clear failure tracking on successful refresh
        AsyncStorage.removeItem(STORAGE_KEYS.LAST_REFRESH_FAILURE),
        AsyncStorage.removeItem(STORAGE_KEYS.REFRESH_FAILURE_COUNT),
      ]);
    } catch (error) {
      console.error('Error updating last refresh:', error);
    }
  }

  /**
   * Record a refresh failure (AsyncStorage version)
   * @private
   */
  static async _recordRefreshFailureInAsyncStorage() {
    try {
      const now = Date.now();
      const currentCount = await AsyncStorage.getItem(STORAGE_KEYS.REFRESH_FAILURE_COUNT);
      const failureCount = currentCount ? parseInt(currentCount) + 1 : 1;
      
      await Promise.all([
        AsyncStorage.setItem(STORAGE_KEYS.LAST_REFRESH_FAILURE, now.toString()),
        AsyncStorage.setItem(STORAGE_KEYS.REFRESH_FAILURE_COUNT, failureCount.toString()),
      ]);
      
      console.log(`Recorded refresh failure #${failureCount}`);
    } catch (error) {
      console.error('Error recording refresh failure:', error);
    }
  }

  /**
   * Get refresh failure statistics (AsyncStorage version)
   * @private
   */
  static async _getRefreshFailureStatsFromAsyncStorage() {
    try {
      const [lastFailure, failureCount] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEYS.LAST_REFRESH_FAILURE),
        AsyncStorage.getItem(STORAGE_KEYS.REFRESH_FAILURE_COUNT),
      ]);

      return {
        lastFailureTime: lastFailure ? parseInt(lastFailure) : null,
        failureCount: failureCount ? parseInt(failureCount) : 0,
        timeSinceLastFailure: lastFailure ? Date.now() - parseInt(lastFailure) : null,
      };
    } catch (error) {
      console.error('Error getting refresh failure stats:', error);
      return {
        lastFailureTime: null,
        failureCount: 0,
        timeSinceLastFailure: null,
      };
    }
  }

  /**
   * Clear all stored tokens (AsyncStorage version)
   * @private
   */
  static async _clearTokensFromAsyncStorage() {
    try {
      await Promise.all([
        AsyncStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN),
        AsyncStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN),
        AsyncStorage.removeItem(STORAGE_KEYS.ID_TOKEN),
        AsyncStorage.removeItem(STORAGE_KEYS.TOKEN_EXPIRY),
        AsyncStorage.removeItem(STORAGE_KEYS.USER_PROFILE),
        AsyncStorage.removeItem(STORAGE_KEYS.LAST_REFRESH),
        AsyncStorage.removeItem(STORAGE_KEYS.LAST_REFRESH_FAILURE),
        AsyncStorage.removeItem(STORAGE_KEYS.REFRESH_FAILURE_COUNT),
        // Clear cached user ID that might be used by DynamoDBTokenStorageService
        AsyncStorage.removeItem('cached_user_id'),
      ]);

      return true;
    } catch (error) {
      console.error('Error clearing tokens:', error);
      return false;
    }
  }

  /**
   * Store user profile (AsyncStorage version)
   * @private
   */
  static async _storeUserProfileInAsyncStorage(userProfile) {
    try {
      if (!userProfile) {
        return false;
      }

      const profileData = {
        ...userProfile,
        cachedAt: Date.now(),
      };

      await AsyncStorage.setItem(
        STORAGE_KEYS.USER_PROFILE,
        JSON.stringify(profileData)
      );
      return true;
    } catch (error) {
      console.error('Error storing user profile:', error);
      return false;
    }
  }

  /**
   * Get user profile (AsyncStorage version)
   * @private
   */
  static async _getUserProfileFromAsyncStorage() {
    try {
      const profileData = await AsyncStorage.getItem(STORAGE_KEYS.USER_PROFILE);

      if (!profileData) {
        return null;
      }

      return JSON.parse(profileData);
    } catch (error) {
      console.error('Error retrieving user profile:', error);
      return null;
    }
  }

  /**
   * Get storage statistics (AsyncStorage version)
   * @private
   */
  static async _getStorageStatsFromAsyncStorage() {
    try {
      const tokens = await this._getTokensFromAsyncStorage();
      const profile = await this._getUserProfileFromAsyncStorage();
      const timeUntilExpiry = tokens ? tokens.expiresAt - Date.now() : -1;
      const needsRefresh = await this._needsRefreshInAsyncStorage();
      const canRefresh = await this._canRefreshInAsyncStorage();
      const failureStats = await this._getRefreshFailureStatsFromAsyncStorage();

      return {
        hasTokens: !!tokens,
        hasProfile: !!profile,
        timeUntilExpiry,
        needsRefresh,
        canRefresh,
        tokensExpired: await this._areTokensExpiredInAsyncStorage(),
        profileCacheValid: profile && profile.cachedAt && (Date.now() - profile.cachedAt < 60 * 60 * 1000),
        refreshFailures: failureStats,
      };
    } catch (error) {
      console.error('Error getting storage stats:', error);
      return {
        hasTokens: false,
        hasProfile: false,
        timeUntilExpiry: -1,
        needsRefresh: false,
        canRefresh: true,
        tokensExpired: true,
        profileCacheValid: false,
        refreshFailures: {
          lastFailureTime: null,
          failureCount: 0,
          timeSinceLastFailure: null,
        },
      };
    }
  }
}

export default TokenStorageService;
