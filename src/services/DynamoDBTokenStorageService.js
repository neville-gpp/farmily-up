import { DynamoDBService } from './DynamoDBService';
import AuthenticationService from './AuthenticationService';
import DataEncryptionService from './DataEncryptionService';
import { 
  GetCommand, 
  PutCommand, 
  DeleteCommand 
} from '@aws-sdk/lib-dynamodb';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { AWS_CONFIG, DYNAMODB_TABLES } from '../config/aws-config.js';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * DynamoDB-enabled Token Storage Service
 * Provides secure token storage and management using DynamoDB as the backend
 * Maintains compatibility with the existing TokenStorageService interface
 * Supports multi-device token synchronization and conflict resolution
 */
class DynamoDBTokenStorageService {
  static TABLE_NAME = DYNAMODB_TABLES.AUTH_TOKENS;
  
  // Token validation constants
  static TOKEN_BUFFER_TIME = 5 * 60 * 1000; // 5 minutes buffer before expiry
  static MAX_REFRESH_ATTEMPTS = 3;
  static REFRESH_COOLDOWN = 30 * 1000; // 30 seconds cooldown between refresh attempts
  static FAILED_REFRESH_COOLDOWN = 5 * 60 * 1000; // 5 minutes cooldown after failed refresh
  
  // Prevent infinite loops with operation-specific call stack tracking
  static _callStackTracking = new Map();
  
  // User ID cache structure
  static _userIdCache = {
    userId: null,
    cachedAt: null,
    source: null,
    tokenHash: null,
    expiresAt: null
  };

  /**
   * Get current authenticated user ID from cache without calling AuthenticationService
   * @private
   * @returns {Promise<string>} User ID
   * @throws {Error} If user is not authenticated
   */
  static async _getCurrentUserIdFromCache() {
    // Protect against circular calls in user ID resolution
    if (!this._isCallStackSafe('getCurrentUserId')) {
      throw new Error('Call stack protection: getCurrentUserId recursion detected');
    }
    
    if (!this._incrementCallStack('getCurrentUserId')) {
      throw new Error('Call stack protection: Failed to track getCurrentUserId operation');
    }
    
    try {
      // First try to get from in-memory cache
      const cachedUserId = await this._validateCachedUserId();
      if (cachedUserId) {
        return cachedUserId;
      }
      
      // Try to get tokens from AsyncStorage (bypass DynamoDB)
      const TokenStorageService = await import('./TokenStorageService');
      const asyncTokens = await TokenStorageService.default._getTokensFromAsyncStorage();
      
      if (asyncTokens && asyncTokens.idToken) {
        // Extract and cache user ID from ID token payload
        const userId = await this._cacheUserIdFromToken(asyncTokens.idToken);
        if (userId) {
          return userId;
        }
        
        // If standard extraction failed, try fallback token extraction
        const fallbackUserId = await this._tryTokenExtractionFallback(asyncTokens.idToken);
        if (fallbackUserId) {
          // Cache the fallback-extracted user ID
          await this._cacheUserId(fallbackUserId);
          
          // Update in-memory cache
          this._userIdCache = {
            userId: fallbackUserId,
            cachedAt: Date.now(),
            source: 'token_extraction_fallback',
            tokenHash: this._createTokenHash(asyncTokens.idToken),
            expiresAt: Date.now() + (60 * 60 * 1000) // 1 hour
          };
          
          return fallbackUserId;
        }
      }
      
      // Try AsyncStorage fallback for cached user ID
      const asyncStorageFallbackUserId = await this._tryAsyncStorageFallback();
      if (asyncStorageFallbackUserId) {
        return asyncStorageFallbackUserId;
      }
      
      // Try legacy cached user ID method as final fallback
      const legacyFallbackUserId = await this._getCachedUserId();
      if (legacyFallbackUserId && this._validateUserIdFormat(legacyFallbackUserId)) {
        // Update in-memory cache with legacy fallback
        this._userIdCache = {
          userId: legacyFallbackUserId,
          cachedAt: Date.now(),
          source: 'legacy_cache_fallback',
          tokenHash: null,
          expiresAt: Date.now() + (30 * 60 * 1000) // 30 minutes for legacy cache
        };
        return legacyFallbackUserId;
      }
      
      // All methods failed - handle graceful failure
      await this._handleFallbackFailure('_getCurrentUserIdFromCache', new Error('All user ID retrieval methods failed'));
      throw new Error('Unable to determine user ID for token operations');
      
    } catch (error) {      
      // If this is not already a handled fallback failure, try one more time with fallback failure handling
      if (!error.message.includes('All user ID retrieval methods failed')) {
        await this._handleFallbackFailure('_getCurrentUserIdFromCache_exception', error);
      }
      
      throw new Error('Unable to determine user ID for token operations');
    } finally {
      this._decrementCallStack('getCurrentUserId');
    }
  }

  /**
   * Get current authenticated user ID (legacy method for backward compatibility)
   * @private
   * @returns {Promise<string>} User ID
   * @throws {Error} If user is not authenticated
   */
  static async _getCurrentUserId() {
    return await this._getCurrentUserIdFromCache();
  }

  /**
   * Extract and cache user ID from ID token
   * @private
   * @param {string} idToken - JWT ID token
   * @returns {Promise<string|null>} User ID or null if extraction fails
   */
  static async _cacheUserIdFromToken(idToken) {
    // Protect against recursive token parsing
    if (!this._isCallStackSafe('cacheUserIdFromToken')) {
      return null;
    }
    
    if (!this._incrementCallStack('cacheUserIdFromToken')) {
      console.error('DynamoDBTokenStorageService: Failed to increment call stack for cacheUserIdFromToken');
      return null;
    }
    
    try {
      const userId = this._extractUserIdFromIdToken(idToken);
      if (!userId) {
        return null;
      }
      
      // Create token hash for validation
      const tokenHash = this._createTokenHash(idToken);
      
      // Cache user ID in memory
      this._userIdCache = {
        userId: userId,
        cachedAt: Date.now(),
        source: 'token',
        tokenHash: tokenHash,
        expiresAt: Date.now() + (60 * 60 * 1000) // 1 hour cache expiry
      };
      
      // Also cache in AsyncStorage as fallback
      await this._cacheUserId(userId);
      
      return userId;
    } catch (error) {
      console.error('DynamoDBTokenStorageService: Failed to cache user ID from token:', error.message);
      return null;
    } finally {
      this._decrementCallStack('cacheUserIdFromToken');
    }
  }

  /**
   * Validate token structure before parsing
   * @private
   * @param {string} token - JWT token to validate
   * @returns {boolean} True if token structure is valid
   */
  static _validateTokenStructure(token) {
    try {
      // Basic input validation
      if (!token || typeof token !== 'string') {
        return false;
      }

      // Remove whitespace
      token = token.trim();
      
      // Check minimum length (JWT tokens are typically much longer)
      if (token.length < 20) {
        return false;
      }

      // JWT tokens have 3 parts separated by dots
      const parts = token.split('.');
      if (parts.length !== 3) {
        return false;
      }

      // Validate each part is not empty and contains valid base64url characters
      const base64UrlRegex = /^[A-Za-z0-9_-]+$/;
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        
        // Each part should not be empty (except signature can be empty in some cases)
        if (!part || part.length === 0) {
          // Allow empty signature for unsigned tokens, but not empty header/payload
          if (i < 2) {
            return false;
          }
        }
        
        // Each part should contain only valid base64url characters (if not empty)
        if (part && part.length > 0 && !base64UrlRegex.test(part)) {
          return false;
        }
        
        // Header and payload should have reasonable minimum lengths
        if (i < 2 && part.length < 4) {
          return false;
        }
      }

      return true;
    } catch (error) {
      console.error('DynamoDBTokenStorageService: Error validating token structure:', error.message);
      return false;
    }
  }

  /**
   * Handle token parsing errors gracefully
   * @private
   * @param {Error} error - The parsing error
   * @param {string} context - Context where the error occurred
   * @param {string} tokenPreview - First few characters of token for debugging
   * @returns {null} Always returns null for consistent error handling
   */
  static _handleTokenParsingError(error, context = 'token parsing', tokenPreview = '') {
    try {
      // Create a safe token preview (first 10 characters + ...)
      const safePreview = tokenPreview && typeof tokenPreview === 'string' 
        ? tokenPreview.substring(0, 10) + '...' 
        : 'unknown';


      // Log specific error types for better debugging
      if (error.name === 'SyntaxError') {
        console.log('DynamoDBTokenStorageService: JSON parsing failed - token payload may be corrupted');
      } else if (error.message && error.message.includes('base64')) {
        console.log('DynamoDBTokenStorageService: Base64 decoding failed - token encoding may be invalid');
      } else if (error.message && error.message.includes('atob')) {
        console.log('DynamoDBTokenStorageService: atob function failed - using fallback decoding');
      }

      // Return null consistently for all error cases
      return null;
    } catch (handlingError) {
      // If error handling itself fails, log minimal info and return null
      console.log('DynamoDBTokenStorageService: Error handling failed:', handlingError.message);
      return null;
    }
  }

  /**
   * Extract user ID from ID token without making API calls
   * Enhanced with better error handling and validation
   * @private
   * @param {string} idToken - JWT ID token
   * @returns {string|null} User ID or null if extraction fails
   */
  static _extractUserIdFromIdToken(idToken) {
    try {
      // Enhanced input validation
      if (!idToken || typeof idToken !== 'string') {
        return this._handleTokenParsingError(
          new Error('Invalid token input'), 
          'token input validation',
          idToken
        );
      }

      // Clean the token
      const cleanToken = idToken.trim();
      
      // Validate token structure before attempting to parse
      if (!this._validateTokenStructure(cleanToken)) {
        return this._handleTokenParsingError(
          new Error('Invalid token structure'), 
          'token structure validation',
          cleanToken
        );
      }

      // Split token into parts
      const parts = cleanToken.split('.');
      
      // Extract and validate payload part
      const payload = parts[1];
      if (!payload) {
        return this._handleTokenParsingError(
          new Error('Missing token payload'), 
          'payload extraction',
          cleanToken
        );
      }

      // Prepare payload for base64 decoding
      // Add padding if needed for base64 decoding
      const paddedPayload = payload + '='.repeat((4 - payload.length % 4) % 4);
      
      // Convert base64url to base64 (replace URL-safe characters)
      const base64Payload = paddedPayload.replace(/-/g, '+').replace(/_/g, '/');
      
      // Decode base64 payload with multiple fallback methods
      let decodedPayload;
      try {
        if (typeof atob !== 'undefined') {
          // Browser/React Native atob method
          decodedPayload = atob(base64Payload);
        } else if (typeof Buffer !== 'undefined') {
          // Node.js/React Native Buffer method
          const buffer = Buffer.from(base64Payload, 'base64');
          decodedPayload = buffer.toString('utf8');
        } else {
          // Manual base64 decode as last resort
          decodedPayload = this._manualBase64Decode(base64Payload);
        }
      } catch (decodeError) {
        return this._handleTokenParsingError(
          decodeError, 
          'base64 decoding',
          cleanToken
        );
      }

      // Validate decoded payload is not empty
      if (!decodedPayload || decodedPayload.length === 0) {
        return this._handleTokenParsingError(
          new Error('Empty decoded payload'), 
          'payload validation',
          cleanToken
        );
      }
      
      // Parse JSON payload
      let payloadObj;
      try {
        payloadObj = JSON.parse(decodedPayload);
      } catch (jsonError) {
        return this._handleTokenParsingError(
          jsonError, 
          'JSON parsing',
          cleanToken
        );
      }

      // Validate payload is an object
      if (!payloadObj || typeof payloadObj !== 'object') {
        return this._handleTokenParsingError(
          new Error('Invalid payload object'), 
          'payload object validation',
          cleanToken
        );
      }
      
      // Extract user ID with multiple fallback fields
      const userId = payloadObj.sub || payloadObj.username || payloadObj.user_id || payloadObj.userId;
      
      // Validate extracted user ID
      if (!userId || typeof userId !== 'string' || userId.trim().length === 0) {
        return this._handleTokenParsingError(
          new Error('No valid user ID found in token'), 
          'user ID extraction',
          cleanToken
        );
      }

      // Return cleaned user ID
      return userId.trim();
      
    } catch (error) {
      return this._handleTokenParsingError(
        error, 
        'token extraction',
        idToken
      );
    }
  }

  /**
   * Validate cached user ID and return it if still valid
   * @private
   * @returns {Promise<string|null>} Valid cached user ID or null
   */
  static async _validateCachedUserId() {
    // Protect against recursive cache validation
    if (!this._isCallStackSafe('validateCachedUserId')) {
      return null;
    }
    
    if (!this._incrementCallStack('validateCachedUserId')) {
      return null;
    }
    
    try {
      // Check if we have a cached user ID
      if (!this._userIdCache.userId || !this._userIdCache.cachedAt) {
        return null;
      }
      
      // Check if cache has expired
      const now = Date.now();
      if (this._userIdCache.expiresAt && now > this._userIdCache.expiresAt) {
        console.log('DynamoDBTokenStorageService: User ID cache expired');
        this._userIdCache = { userId: null, cachedAt: null, source: null, tokenHash: null, expiresAt: null };
        return null;
      }
      
      // If cached from token, validate token hasn't changed
      if (this._userIdCache.source === 'token' && this._userIdCache.tokenHash) {
        try {
          const TokenStorageService = await import('./TokenStorageService');
          const asyncTokens = await TokenStorageService.default._getTokensFromAsyncStorage();
          
          if (asyncTokens && asyncTokens.idToken) {
            const currentTokenHash = this._createTokenHash(asyncTokens.idToken);
            if (currentTokenHash !== this._userIdCache.tokenHash) {
              this._userIdCache = { userId: null, cachedAt: null, source: null, tokenHash: null, expiresAt: null };
              return null;
            }
          }
        } catch (error) {
          // If we can't validate token, assume cache is still valid for now
          console.log('DynamoDBTokenStorageService: Could not validate token hash, keeping cache');
        }
      }
      
      // Cache is valid
      return this._userIdCache.userId;
    } catch (error) {
      console.log('DynamoDBTokenStorageService: Error validating cached user ID:', error.message);
      return null;
    } finally {
      this._decrementCallStack('validateCachedUserId');
    }
  }

  /**
   * Get cached user ID from AsyncStorage
   * @private
   * @returns {Promise<string|null>} Cached user ID or null
   */
  static async _getCachedUserId() {
    try {
      const cachedUserId = await AsyncStorage.getItem('cached_user_id');
      return cachedUserId;
    } catch (error) {
      return null;
    }
  }

  /**
   * Cache user ID for token operations
   * @private
   * @param {string} userId - User ID to cache
   */
  static async _cacheUserId(userId) {
    try {
      await AsyncStorage.setItem('cached_user_id', userId);
    } catch (error) {
      // Ignore caching errors
    }
  }

  /**
   * Create a simple hash of the token for validation purposes
   * @private
   * @param {string} token - Token to hash
   * @returns {string} Simple hash of the token
   */
  static _createTokenHash(token) {
    try {
      if (!token || typeof token !== 'string') {
        return '';
      }
      
      // Simple hash using token length and first/last characters
      // This is not cryptographically secure but sufficient for cache validation
      const length = token.length;
      const first = token.charAt(0);
      const last = token.charAt(length - 1);
      const middle = token.charAt(Math.floor(length / 2));
      
      return `${length}_${first}${middle}${last}`;
    } catch (error) {
      return '';
    }
  }

  /**
   * Manual base64 decode as fallback
   * @private
   * @param {string} str - Base64 string to decode
   * @returns {string} Decoded string
   */
  static _manualBase64Decode(str) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let result = '';
    
    for (let i = 0; i < str.length; i += 4) {
      const a = chars.indexOf(str[i]);
      const b = chars.indexOf(str[i + 1]);
      const c = chars.indexOf(str[i + 2]);
      const d = chars.indexOf(str[i + 3]);
      
      const bitmap = (a << 18) | (b << 12) | (c << 6) | d;
      
      result += String.fromCharCode((bitmap >> 16) & 255);
      if (c !== 64) result += String.fromCharCode((bitmap >> 8) & 255);
      if (d !== 64) result += String.fromCharCode(bitmap & 255);
    }
    
    return result;
  }

  /**
   * Try AsyncStorage fallback to check for cached user ID
   * @private
   * @returns {Promise<string|null>} Cached user ID from AsyncStorage or null
   */
  static async _tryAsyncStorageFallback() {
    // Protect against recursive AsyncStorage fallback calls
    if (!this._isCallStackSafe('asyncStorageFallback')) {
      return null;
    }
    
    if (!this._incrementCallStack('asyncStorageFallback')) {
      return null;
    }
    
    try {      
      // Try multiple AsyncStorage keys that might contain user ID
      const fallbackKeys = [
        'cached_user_id',
        'user_id_backup',
        'last_known_user_id',
        'auth_user_id'
      ];
      
      for (const key of fallbackKeys) {
        try {
          const cachedValue = await AsyncStorage.getItem(key);
          if (cachedValue && typeof cachedValue === 'string' && cachedValue.trim().length > 0) {
            const userId = cachedValue.trim();
            
            // Basic validation of user ID format
            if (this._validateUserIdFormat(userId)) {
              // Update in-memory cache with fallback data
              this._userIdCache = {
                userId: userId,
                cachedAt: Date.now(),
                source: 'asyncstorage_fallback',
                tokenHash: null,
                expiresAt: Date.now() + (30 * 60 * 1000) // 30 minutes for fallback cache
              };
              
              return userId;
            }
          }
        } catch (keyError) {
          console.log(`DynamoDBTokenStorageService: Error reading AsyncStorage key ${key}:`, keyError.message);
          continue;
        }
      }
      
      // Try to get user ID from stored token data in AsyncStorage
      try {
        const tokenKeys = ['auth_tokens', 'stored_tokens', 'user_tokens'];
        
        for (const tokenKey of tokenKeys) {
          const tokenData = await AsyncStorage.getItem(tokenKey);
          if (tokenData) {
            const parsedTokens = JSON.parse(tokenData);
            if (parsedTokens && parsedTokens.idToken) {
              const userId = this._extractUserIdFromIdToken(parsedTokens.idToken);
              if (userId) {                
                // Cache the extracted user ID
                await this._cacheUserId(userId);
                
                // Update in-memory cache
                this._userIdCache = {
                  userId: userId,
                  cachedAt: Date.now(),
                  source: 'asyncstorage_token_extraction',
                  tokenHash: this._createTokenHash(parsedTokens.idToken),
                  expiresAt: Date.now() + (60 * 60 * 1000) // 1 hour for token-based cache
                };
                
                return userId;
              }
            }
          }
        }
      } catch (tokenError) {
        console.log('DynamoDBTokenStorageService: Error extracting user ID from AsyncStorage tokens:', tokenError.message);
      }
      
      return null;
      
    } catch (error) {
      return null;
    } finally {
      this._decrementCallStack('asyncStorageFallback');
    }
  }

  /**
   * Try alternative token extraction approaches as fallback
   * @private
   * @param {string} idToken - ID token to parse with alternative methods
   * @returns {Promise<string|null>} User ID extracted with fallback methods or null
   */
  static async _tryTokenExtractionFallback(idToken) {
    // Protect against recursive token extraction fallback calls
    if (!this._isCallStackSafe('tokenExtractionFallback')) {
      console.log('DynamoDBTokenStorageService: tokenExtractionFallback operation not safe to proceed');
      return null;
    }
    
    if (!this._incrementCallStack('tokenExtractionFallback')) {
      console.log('DynamoDBTokenStorageService: Failed to increment call stack for tokenExtractionFallback');
      return null;
    }
    
    try {
      console.log('DynamoDBTokenStorageService: Attempting token extraction fallback');
      
      if (!idToken || typeof idToken !== 'string') {
        return null;
      }
      
      const cleanToken = idToken.trim();
      
      // Fallback method 1: Try different base64 decoding approaches
      try {
        const parts = cleanToken.split('.');
        if (parts.length === 3) {
          const payload = parts[1];
          
          // Try different padding strategies
          const paddingStrategies = [
            payload, // No padding
            payload + '=', // Single padding
            payload + '==', // Double padding
            payload + '===', // Triple padding
            payload + '='.repeat((4 - payload.length % 4) % 4) // Calculated padding
          ];
          
          for (const paddedPayload of paddingStrategies) {
            try {
              // Convert base64url to base64
              const base64Payload = paddedPayload.replace(/-/g, '+').replace(/_/g, '/');
              
              let decodedPayload;
              
              // Try multiple decoding methods
              if (typeof atob !== 'undefined') {
                decodedPayload = atob(base64Payload);
              } else if (typeof Buffer !== 'undefined') {
                const buffer = Buffer.from(base64Payload, 'base64');
                decodedPayload = buffer.toString('utf8');
              } else {
                decodedPayload = this._manualBase64Decode(base64Payload);
              }
              
              if (decodedPayload && decodedPayload.length > 0) {
                const payloadObj = JSON.parse(decodedPayload);
                
                // Try multiple user ID field names
                const userIdFields = ['sub', 'username', 'user_id', 'userId', 'cognito:username', 'email', 'preferred_username'];
                
                for (const field of userIdFields) {
                  const userId = payloadObj[field];
                  if (userId && typeof userId === 'string' && userId.trim().length > 0) {
                    const cleanUserId = userId.trim();
                    if (this._validateUserIdFormat(cleanUserId)) {
                      console.log(`DynamoDBTokenStorageService: Token extraction fallback succeeded with field: ${field}`);
                      return cleanUserId;
                    }
                  }
                }
              }
            } catch (paddingError) {
              // Try next padding strategy
              continue;
            }
          }
        }
      } catch (fallbackError) {
        console.log('DynamoDBTokenStorageService: Base64 fallback methods failed:', fallbackError.message);
      }
      
      // Fallback method 2: Try regex extraction for common patterns
      try {
        // Look for user ID patterns in the raw token
        const userIdPatterns = [
          /"sub":"([^"]+)"/,
          /"username":"([^"]+)"/,
          /"user_id":"([^"]+)"/,
          /"userId":"([^"]+)"/,
          /"cognito:username":"([^"]+)"/,
          /"email":"([^"]+)"/
        ];
        
        // Decode the payload part manually and search for patterns
        const parts = cleanToken.split('.');
        if (parts.length === 3) {
          const payload = parts[1];
          
          // Try to decode without strict base64 validation
          try {
            const roughDecoded = payload.replace(/-/g, '+').replace(/_/g, '/');
            const decodedBytes = [];
            
            // Manual character-by-character decoding
            for (let i = 0; i < roughDecoded.length; i++) {
              const char = roughDecoded.charAt(i);
              if (char.match(/[A-Za-z0-9+/]/)) {
                decodedBytes.push(char);
              }
            }
            
            const roughPayload = decodedBytes.join('');
            
            for (const pattern of userIdPatterns) {
              const match = roughPayload.match(pattern);
              if (match && match[1]) {
                const userId = match[1].trim();
                if (this._validateUserIdFormat(userId)) {
                  console.log('DynamoDBTokenStorageService: Token extraction fallback succeeded with regex pattern');
                  return userId;
                }
              }
            }
          } catch (regexError) {
            console.log('DynamoDBTokenStorageService: Regex extraction failed:', regexError.message);
          }
        }
      } catch (patternError) {
        console.log('DynamoDBTokenStorageService: Pattern matching fallback failed:', patternError.message);
      }
      
      console.log('DynamoDBTokenStorageService: All token extraction fallback methods failed');
      return null;
      
    } catch (error) {
      console.log('DynamoDBTokenStorageService: Token extraction fallback failed:', error.message);
      return null;
    } finally {
      this._decrementCallStack('tokenExtractionFallback');
    }
  }

  /**
   * Handle graceful failure when all fallback methods fail
   * @private
   * @param {string} context - Context where the failure occurred
   * @param {Error} lastError - The last error that occurred
   * @returns {Promise<null>} Always returns null after logging
   */
  static async _handleFallbackFailure(context = 'unknown', lastError = null) {
    try {
      const timestamp = new Date().toISOString();
      const errorMessage = lastError ? lastError.message : 'No specific error';
      
      // Clear potentially corrupted cache
      this._userIdCache = {
        userId: null,
        cachedAt: null,
        source: null,
        tokenHash: null,
        expiresAt: null
      };
      
      // Try to store failure information for debugging (non-blocking)
      try {
        const failureInfo = {
          timestamp: timestamp,
          context: context,
          error: errorMessage,
          userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown'
        };
        
        await AsyncStorage.setItem('last_fallback_failure', JSON.stringify(failureInfo));
      } catch (storageError) {
        // Ignore storage errors during failure handling
      }
      
      // Return null to indicate complete failure
      return null;
      
    } catch (handlingError) {
      // If failure handling itself fails, log minimal info
      console.log('DynamoDBTokenStorageService: Failure handling failed:', handlingError.message);
      return null;
    }
  }

  /**
   * Validate user ID format
   * @private
   * @param {string} userId - User ID to validate
   * @returns {boolean} True if user ID format is valid
   */
  static _validateUserIdFormat(userId) {
    try {
      if (!userId || typeof userId !== 'string') {
        return false;
      }
      
      const cleanUserId = userId.trim();
      
      // Basic length validation
      if (cleanUserId.length < 1 || cleanUserId.length > 256) {
        return false;
      }
      
      // Check for obviously invalid values
      const invalidValues = ['null', 'undefined', 'anonymous', 'guest', '', 'unknown'];
      if (invalidValues.includes(cleanUserId.toLowerCase())) {
        return false;
      }
      
      // Check for valid characters (alphanumeric, hyphens, underscores, @ for emails)
      const validPattern = /^[a-zA-Z0-9@._-]+$/;
      if (!validPattern.test(cleanUserId)) {
        return false;
      }
      
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Initialize DynamoDB client without authentication (for token operations)
   * @private
   */
  static async _initializeClientForTokenOps() {
    if (!DynamoDBService.client) {
      DynamoDBService.client = new DynamoDBClient({
        region: AWS_CONFIG.region,
        credentials: {
          accessKeyId: AWS_CONFIG.accessKeyId,
          secretAccessKey: AWS_CONFIG.secretAccessKey,
        },
      });
      
      DynamoDBService.docClient = DynamoDBDocumentClient.from(DynamoDBService.client, {
        marshallOptions: {
          convertEmptyValues: false,
          removeUndefinedValues: true,
          convertClassInstanceToMap: false,
        },
        unmarshallOptions: {
          wrapNumbers: false,
        },
      });
    }
  }

  /**
   * Increment call stack tracking for specific operation
   * @private
   * @param {string} operation - Operation name to track
   * @returns {boolean} True if operation is safe to proceed
   */
  static _incrementCallStack(operation) {
    try {
      if (!operation || typeof operation !== 'string') {
        console.log('DynamoDBTokenStorageService: Invalid operation name for call stack tracking');
        return false;
      }

      // Initialize tracking for this operation if not exists
      if (!this._callStackTracking.has(operation)) {
        this._callStackTracking.set(operation, {
          depth: 0,
          startTime: Date.now(),
          maxDepth: this._getMaxDepthForOperation(operation)
        });
      }

      const tracking = this._callStackTracking.get(operation);
      
      // Check if we're already at maximum depth
      if (tracking.depth >= tracking.maxDepth) {
        console.log(`DynamoDBTokenStorageService: Call stack too deep for operation '${operation}' (depth: ${tracking.depth}, max: ${tracking.maxDepth})`);
        return false;
      }

      // Increment depth and update start time if this is the first call
      tracking.depth++;
      if (tracking.depth === 1) {
        tracking.startTime = Date.now();
      }

      return true;
    } catch (error) {
      console.log('DynamoDBTokenStorageService: Error incrementing call stack:', error.message);
      return false;
    }
  }

  /**
   * Decrement call stack tracking for specific operation
   * @private
   * @param {string} operation - Operation name to clean up
   */
  static _decrementCallStack(operation) {
    try {
      if (!operation || typeof operation !== 'string') {
        console.log('DynamoDBTokenStorageService: Invalid operation name for call stack cleanup');
        return;
      }

      if (!this._callStackTracking.has(operation)) {
        console.log(`DynamoDBTokenStorageService: No tracking found for operation '${operation}' during cleanup`);
        return;
      }

      const tracking = this._callStackTracking.get(operation);
      
      // Decrement depth
      tracking.depth = Math.max(0, tracking.depth - 1);

      // If depth reaches 0, clean up the tracking entry
      if (tracking.depth === 0) {
        const duration = Date.now() - tracking.startTime;
        this._callStackTracking.delete(operation);
      }
    } catch (error) {
      console.error('DynamoDBTokenStorageService: Error decrementing call stack:', error.message);
    }
  }

  /**
   * Check if operation is safe to proceed based on call stack depth
   * @private
   * @param {string} operation - Operation name to check
   * @returns {boolean} True if operation is safe to proceed
   */
  static _isCallStackSafe(operation) {
    try {
      if (!operation || typeof operation !== 'string') {
        console.log('DynamoDBTokenStorageService: Invalid operation name for call stack safety check');
        return false;
      }

      // If no tracking exists, operation is safe
      if (!this._callStackTracking.has(operation)) {
        return true;
      }

      const tracking = this._callStackTracking.get(operation);
      const maxDepth = tracking.maxDepth;
      const currentDepth = tracking.depth;

      // Check if current depth is within safe limits
      const isSafe = currentDepth < maxDepth;

      if (!isSafe) {
        const duration = Date.now() - tracking.startTime;
      }

      return isSafe;
    } catch (error) {
      console.log('DynamoDBTokenStorageService: Error checking call stack safety:', error.message);
      return false;
    }
  }

  /**
   * Get maximum allowed depth for specific operation
   * @private
   * @param {string} operation - Operation name
   * @returns {number} Maximum allowed depth
   */
  static _getMaxDepthForOperation(operation) {
    const maxDepths = {
      'getTokens': 2,           // Allow 2 levels for token retrieval with fallbacks
      'storeTokens': 1,         // Store operations should not recurse
      'clearTokens': 1,         // Clear operations should not recurse
      'getCurrentUserId': 3,    // Allow more depth for user ID resolution with fallbacks
      'cacheUserIdFromToken': 2, // Allow some recursion for token parsing
      'validateCachedUserId': 2, // Allow validation with fallback checks
      'tokenExtractionFallback': 1, // Fallback methods should not recurse
      'asyncStorageFallback': 1,    // AsyncStorage fallbacks should not recurse
      'default': 2              // Default maximum depth for unknown operations
    };

    return maxDepths[operation] || maxDepths['default'];
  }

  /**
   * Store authentication tokens securely in DynamoDB
   * @param {Object} tokens - Token object
   * @param {string} tokens.accessToken - Access token
   * @param {string} tokens.refreshToken - Refresh token
   * @param {string} tokens.idToken - ID token
   * @param {number} tokens.expiresIn - Token expiry time in seconds
   * @returns {Promise<boolean>} Success status
   */
  static async storeTokens(tokens) {
    // Protect against recursive token storage calls
    if (!this._isCallStackSafe('storeTokens')) {
      console.log('DynamoDBTokenStorageService: storeTokens operation not safe to proceed');
      return false;
    }
    
    if (!this._incrementCallStack('storeTokens')) {
      console.log('DynamoDBTokenStorageService: Failed to increment call stack for storeTokens');
      return false;
    }
    
    try {
      // Enhanced token validation
      if (!tokens || typeof tokens !== 'object') {
        throw new Error('Invalid tokens object provided');
      }

      if (!tokens.accessToken || typeof tokens.accessToken !== 'string' || tokens.accessToken.trim().length === 0) {
        throw new Error('Invalid or missing access token');
      }

      if (!tokens.refreshToken || typeof tokens.refreshToken !== 'string' || tokens.refreshToken.trim().length === 0) {
        throw new Error('Invalid or missing refresh token');
      }

      if (!tokens.idToken || typeof tokens.idToken !== 'string' || tokens.idToken.trim().length === 0) {
        throw new Error('Invalid or missing ID token');
      }

      // Validate token structure before attempting to extract user ID
      if (!this._validateTokenStructure(tokens.idToken)) {
        throw new Error('ID token has invalid structure');
      }

      // Extract and cache user ID from the ID token BEFORE any DynamoDB operations
      // This ensures user ID is available and cached before storage operations begin
      const userId = await this._cacheUserIdFromToken(tokens.idToken);
      
      // Enhanced validation to ensure user ID extraction succeeds
      if (!userId) {        
        // Try fallback token extraction methods
        const fallbackUserId = await this._tryTokenExtractionFallback(tokens.idToken);
        if (!fallbackUserId) {
          throw new Error('Unable to extract user ID from ID token using any method');
        }
        
        // Cache the fallback-extracted user ID
        await this._cacheUserId(fallbackUserId);
        
        // Update in-memory cache with fallback data
        this._userIdCache = {
          userId: fallbackUserId,
          cachedAt: Date.now(),
          source: 'token_extraction_fallback_store',
          tokenHash: this._createTokenHash(tokens.idToken),
          expiresAt: Date.now() + (60 * 60 * 1000) // 1 hour
        };
      
      }

      // Final validation that we have a valid user ID
      const finalUserId = userId || this._userIdCache.userId;
      if (!finalUserId || !this._validateUserIdFormat(finalUserId)) {
        throw new Error('Failed to obtain valid user ID for token storage');
      }

      // Validate expiry time
      if (!tokens.expiresIn || typeof tokens.expiresIn !== 'number' || tokens.expiresIn <= 0) {
        console.log('DynamoDBTokenStorageService: Invalid or missing expiresIn, using default value');
        tokens.expiresIn = 3600; // Default to 1 hour
      }

      const expiryTime = Date.now() + tokens.expiresIn * 1000;
      const currentTime = Date.now();

      const tokenData = {
        userId: finalUserId,
        tokenId: 'primary', // Single token record per user
        accessToken: tokens.accessToken.trim(),
        refreshToken: tokens.refreshToken.trim(),
        idToken: tokens.idToken.trim(),
        expiryTime: expiryTime,
        storedAt: currentTime,
        lastRefresh: currentTime,
        deviceId: await this._getDeviceId(),
        refreshFailureCount: 0
      };

      // Initialize DynamoDB client for token operations
      await this._initializeClientForTokenOps();

      // Encrypt sensitive token data before storage
      const encryptedTokenData = await DataEncryptionService.encryptSensitiveFields(tokenData);

      // Direct DynamoDB call without authentication wrapper
      const command = new PutCommand({
        TableName: this.TABLE_NAME,
        Item: {
          ...encryptedTokenData,
          updatedAt: new Date().toISOString(),
          createdAt: encryptedTokenData.createdAt || new Date().toISOString(),
          version: (encryptedTokenData.version || 0) + 1,
        }
      });

      await DynamoDBService.docClient.send(command);
      
      return true;
    } catch (error) {
      console.error('DynamoDBTokenStorageService: Error storing tokens:', {
        message: error?.message || 'Unknown error',
        name: error?.name || 'Unknown',
        code: error?.code || 'Unknown',
        hasUserId: !!this._userIdCache.userId,
        cacheSource: this._userIdCache.source,
        timestamp: new Date().toISOString()
      });
      return false;
    } finally {
      this._decrementCallStack('storeTokens');
    }
  }

  /**
   * Retrieve stored authentication tokens from DynamoDB
   * Uses new user ID caching system to eliminate circular dependencies
   * @returns {Promise<Object|null>} Token object or null if not found
   */
  static async getTokens() {
    // Enhanced call stack protection with operation-specific tracking
    if (!this._isCallStackSafe('getTokens')) {
      return null;
    }
    
    if (!this._incrementCallStack('getTokens')) {
      return null;
    }
    
    try {
      // Use new user ID caching system to avoid circular dependencies
      // This method does NOT call AuthenticationService
      let userId;
      try {
        userId = await this._getCurrentUserIdFromCache();
      } catch (error) {
        // Implement fallback chain for user ID retrieval
        try {
          // Fallback 1: Try AsyncStorage fallback
          userId = await this._tryAsyncStorageFallback();
          if (!userId) {
            // Fallback 2: Try token extraction from AsyncStorage
            const TokenStorageService = await import('./TokenStorageService');
            const asyncTokens = await TokenStorageService.default._getTokensFromAsyncStorage();
            if (asyncTokens && asyncTokens.idToken) {
              userId = await this._tryTokenExtractionFallback(asyncTokens.idToken);
            }
          }
        } catch (fallbackError) {
          console.log('DynamoDBTokenStorageService: All fallback methods failed:', fallbackError.message);
          await this._handleFallbackFailure('getTokens_userIdRetrieval', fallbackError);
          return null;
        }
        
        // If all methods failed, we cannot retrieve tokens
        if (!userId) {
          return null;
        }
      }

      // Validate user ID format before proceeding
      if (!this._validateUserIdFormat(userId)) {
        console.log('DynamoDBTokenStorageService: Invalid user ID format, cannot retrieve tokens');
        return null;
      }

      // Initialize DynamoDB client without authentication requirements
      try {
        await this._initializeClientForTokenOps();
      } catch (initError) {
        console.log('DynamoDBTokenStorageService: Failed to initialize DynamoDB client:', initError.message);
        return null;
      }
      
      // Direct DynamoDB call without authentication wrapper
      const command = new GetCommand({
        TableName: this.TABLE_NAME,
        Key: {
          userId: userId,
          tokenId: 'primary'
        }
      });

      let response;
      try {
        response = await DynamoDBService.docClient.send(command);
      } catch (dynamoError) {
        console.log('DynamoDBTokenStorageService: DynamoDB query failed:', dynamoError.message);
        
        // Try fallback to AsyncStorage if DynamoDB fails
        try {
          const TokenStorageService = await import('./TokenStorageService');
          const fallbackTokens = await TokenStorageService.default._getTokensFromAsyncStorage();
          if (fallbackTokens) {
            console.log('DynamoDBTokenStorageService: Using AsyncStorage fallback tokens');
            return fallbackTokens;
          }
        } catch (asyncFallbackError) {
          console.log('DynamoDBTokenStorageService: AsyncStorage fallback also failed:', asyncFallbackError.message);
        }
        
        return null;
      }

      const tokenRecord = response.Item;

      if (!tokenRecord) {
        console.log('DynamoDBTokenStorageService: No token record found for user');
        return null;
      }

      // Validate data isolation
      try {
        DynamoDBService.validateUserDataIsolation(tokenRecord, userId);
      } catch (isolationError) {
        console.log('DynamoDBTokenStorageService: Data isolation validation failed:', isolationError.message);
        return null;
      }

      // Decrypt sensitive fields before returning
      let decryptedTokens;
      try {
        decryptedTokens = await DataEncryptionService.decryptSensitiveFields(tokenRecord);
      } catch (decryptionError) {
        console.log('DynamoDBTokenStorageService: Token decryption failed:', decryptionError.message);
        return null;
      }

      // Validate decrypted tokens before returning
      if (!decryptedTokens || !decryptedTokens.accessToken) {
        console.log('DynamoDBTokenStorageService: Invalid decrypted token data');
        return null;
      }

      const tokens = {
        accessToken: decryptedTokens.accessToken,
        refreshToken: decryptedTokens.refreshToken,
        idToken: decryptedTokens.idToken,
        expiresAt: decryptedTokens.expiryTime,
        storedAt: decryptedTokens.storedAt,
        lastRefresh: decryptedTokens.lastRefresh,
        deviceId: decryptedTokens.deviceId,
        refreshFailureCount: decryptedTokens.refreshFailureCount || 0
      };

      // Update user ID cache if we have a valid ID token
      if (tokens.idToken) {
        try {
          await this._cacheUserIdFromToken(tokens.idToken);
        } catch (cacheError) {
          // Cache update failure is not critical, just log it
          console.log('DynamoDBTokenStorageService: Failed to update user ID cache:', cacheError.message);
        }
      }

      return tokens;
    } catch (error) {
      // Enhanced error logging with context
      console.error('DynamoDBTokenStorageService: Error retrieving tokens:', {
        error: error?.message || 'Unknown error',
        errorType: error?.name || 'Unknown',
        timestamp: new Date().toISOString(),
        callStackDepth: this._callStackTracking.get('getTokens')?.depth || 0
      });
      
      // Handle fallback failure if this is an unexpected error
      await this._handleFallbackFailure('getTokens_unexpectedError', error);
      return null;
    } finally {
      this._decrementCallStack('getTokens');
    }
  }

  /**
   * Get access token if valid, otherwise return null
   * @returns {Promise<string|null>} Valid access token or null
   */
  static async getValidAccessToken() {
    try {
      const tokens = await this.getTokens();

      if (!tokens) {
        return null;
      }

      const isValid = await this.validateToken(
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
      const isExpired = now >= expiryTime - this.TOKEN_BUFFER_TIME;

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
      return now >= tokens.expiresAt - this.TOKEN_BUFFER_TIME;
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
      return timeUntilExpiry <= this.TOKEN_BUFFER_TIME && timeUntilExpiry > 0;
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
      const tokens = await this.getTokens();
      
      if (!tokens) {
        return true;
      }

      const now = Date.now();

      // Check regular refresh cooldown
      if (tokens.lastRefresh) {
        if (now - tokens.lastRefresh < this.REFRESH_COOLDOWN) {
          console.log('Refresh blocked by regular cooldown');
          return false;
        }
      }

      // Check failure-based cooldown
      if (tokens.refreshFailureCount > 0) {
        const lastFailureTime = tokens.lastRefreshFailure || tokens.lastRefresh;
        
        // Exponential backoff based on failure count
        const failureCooldown = Math.min(
          this.FAILED_REFRESH_COOLDOWN * Math.pow(2, tokens.refreshFailureCount - 1),
          30 * 60 * 1000 // Max 30 minutes
        );
        
        if (lastFailureTime && now - lastFailureTime < failureCooldown) {
          console.log(`Refresh blocked by failure cooldown: ${tokens.refreshFailureCount} failures, ${Math.round(failureCooldown / 1000)}s remaining`);
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
      const userId = await this._getCurrentUserId();
      const now = Date.now();
      
      await DynamoDBService.updateItem(
        this.TABLE_NAME,
        {
          userId: userId,
          tokenId: 'primary'
        },
        {
          lastRefresh: now,
          // Clear failure tracking on successful refresh
          refreshFailureCount: 0,
          lastRefreshFailure: null
        }
      );
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
      const userId = await this._getCurrentUserId();
      const now = Date.now();
      
      const tokens = await this.getTokens();
      const currentFailureCount = tokens ? (tokens.refreshFailureCount || 0) : 0;
      const newFailureCount = currentFailureCount + 1;
      
      await DynamoDBService.updateItem(
        this.TABLE_NAME,
        {
          userId: userId,
          tokenId: 'primary'
        },
        {
          lastRefreshFailure: now,
          refreshFailureCount: newFailureCount
        }
      );
      
      console.log(`Recorded refresh failure #${newFailureCount}`);
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
      const tokens = await this.getTokens();
      
      if (!tokens) {
        return {
          lastFailureTime: null,
          failureCount: 0,
          timeSinceLastFailure: null,
        };
      }

      return {
        lastFailureTime: tokens.lastRefreshFailure || null,
        failureCount: tokens.refreshFailureCount || 0,
        timeSinceLastFailure: tokens.lastRefreshFailure ? Date.now() - tokens.lastRefreshFailure : null,
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
    // Protect against recursive token clearing calls
    if (!this._isCallStackSafe('clearTokens')) {
      console.log('DynamoDBTokenStorageService: clearTokens operation not safe to proceed');
      return false;
    }
    
    if (!this._incrementCallStack('clearTokens')) {
      console.log('DynamoDBTokenStorageService: Failed to increment call stack for clearTokens');
      return false;
    }
    
    try {
      const userId = await this._getCurrentUserId();
      
      // Initialize DynamoDB client for token operations
      await this._initializeClientForTokenOps();
      
      // Direct DynamoDB call without authentication wrapper
      const command = new DeleteCommand({
        TableName: this.TABLE_NAME,
        Key: {
          userId: userId,
          tokenId: 'primary'
        },
        ReturnValues: 'ALL_OLD'
      });

      await DynamoDBService.docClient.send(command);

      // Clear cached user ID from AsyncStorage and in-memory cache
      await AsyncStorage.removeItem('cached_user_id');
      this._userIdCache = { userId: null, cachedAt: null, source: null, tokenHash: null, expiresAt: null };

      return true;
    } catch (error) {
      console.error('Error clearing tokens:', error);
      
      // Even if DynamoDB clear fails, clear the cached user ID
      try {
        await AsyncStorage.removeItem('cached_user_id');
        this._userIdCache = { userId: null, cachedAt: null, source: null, tokenHash: null, expiresAt: null };
      } catch (cacheError) {
        // Ignore cache clear errors
      }
      
      return false;
    } finally {
      this._decrementCallStack('clearTokens');
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

      const userId = await this._getCurrentUserId();

      const profileData = {
        ...userProfile,
        cachedAt: Date.now(),
      };

      // Update the token record with profile data
      const result = await DynamoDBService.updateItem(
        this.TABLE_NAME,
        {
          userId: userId,
          tokenId: 'primary'
        },
        {
          userProfile: profileData
        }
      );
      
      return result.success;
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
      const tokens = await this.getTokens();
      
      if (!tokens || !tokens.userProfile) {
        return null;
      }

      return tokens.userProfile;
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
        deviceId: tokens ? tokens.deviceId : null,
        lastRefresh: tokens ? tokens.lastRefresh : null
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
        deviceId: null,
        lastRefresh: null
      };
    }
  }

  /**
   * Synchronize tokens across devices (resolve conflicts)
   * @returns {Promise<boolean>} Success status
   */
  static async synchronizeTokensAcrossDevices() {
    try {
      const userId = await this._getCurrentUserId();
      const currentDeviceId = await this._getDeviceId();
      
      // Get current token record
      const tokenRecord = await DynamoDBService.getItem(
        this.TABLE_NAME,
        {
          userId: userId,
          tokenId: 'primary'
        }
      );

      if (!tokenRecord) {
        // No tokens to synchronize
        return true;
      }

      // Check if tokens are from a different device
      if (tokenRecord.deviceId && tokenRecord.deviceId !== currentDeviceId) {
        console.log('Tokens from different device detected, synchronizing...');
        
        // Update device ID to current device
        await DynamoDBService.updateItem(
          this.TABLE_NAME,
          {
            userId: userId,
            tokenId: 'primary'
          },
          {
            deviceId: currentDeviceId,
            lastSyncAt: Date.now()
          }
        );
      }

      return true;
    } catch (error) {
      console.error('Error synchronizing tokens across devices:', error);
      return false;
    }
  }

  // Private helper methods

  /**
   * Get a unique device identifier
   * @private
   * @returns {Promise<string>} Device ID
   */
  static async _getDeviceId() {
    // In a real implementation, this would use a device-specific identifier
    // For now, we'll use a combination of timestamp and random string
    const deviceId = `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    return deviceId;
  }

  /**
   * Validate token format (basic JWT structure check)
   * @private
   * @param {string} token - Token to validate
   * @returns {boolean} True if token format is valid
   */
  static _validateTokenFormat(token) {
    try {
      // Use the enhanced token structure validation
      return this._validateTokenStructure(token);
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
}

export default DynamoDBTokenStorageService;