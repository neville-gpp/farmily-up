import AsyncStorage from '@react-native-async-storage/async-storage';
import AuthenticationService from './AuthenticationService';
import TokenStorageService from './TokenStorageService';
import AuthErrorHandler from './AuthErrorHandler';

// Storage keys for user profile data
const PROFILE_STORAGE_KEYS = {
  USER_PROFILE: 'user_profile_data',
  PROFILE_CACHE_TIMESTAMP: 'profile_cache_timestamp',
  PROFILE_SYNC_STATUS: 'profile_sync_status',
  PROFILE_BACKUP: 'user_profile_backup',
};

// Profile validation constants
const PROFILE_CACHE_DURATION = 30 * 60 * 1000; // 30 minutes
const PROFILE_SYNC_RETRY_ATTEMPTS = 3;
const PROFILE_SYNC_RETRY_DELAY = 2000; // 2 seconds

class UserProfileService {
  /**
   * Get user profile with automatic sync and caching
   * @param {boolean} forceRefresh - Force refresh from Cognito
   * @returns {Promise<Object|null>} User profile or null
   */
  static async getUserProfile(forceRefresh = false) {
    try {
      // Check if user is authenticated
      const isAuthenticated = await AuthenticationService.isAuthenticated();
      if (!isAuthenticated) {
        return null;
      }

      // If not forcing refresh, try to get cached profile first
      if (!forceRefresh) {
        const cachedProfile = await this._getCachedProfile();
        if (cachedProfile && await this._isProfileCacheValid()) {
          return cachedProfile;
        }
      }

      // Get fresh profile from Cognito
      const cognitoProfile = await AuthenticationService.getCurrentUser();
      if (!cognitoProfile) {
        return null;
      }

      // Transform and validate profile data
      const transformedProfile = this._transformCognitoProfile(cognitoProfile);
      const validatedProfile = this._validateProfileData(transformedProfile);

      if (!validatedProfile.isValid) {
        console.warn('Profile validation failed:', validatedProfile.errors);
        return cognitoProfile; // Return original if validation fails
      }

      // Cache the profile locally
      await this._cacheProfile(transformedProfile);
      
      return transformedProfile;
    } catch (error) {
      console.error('Error getting user profile:', error);
      
      // Fallback to cached profile if available
      const cachedProfile = await this._getCachedProfile();
      return cachedProfile;
    }
  }

  /**
   * Update user profile with sync to Cognito
   * @param {Object} profileData - Profile data to update
   * @returns {Promise<Object>} Update result with success status and updated profile
   */
  static async updateUserProfile(profileData) {
    try {
      // Validate input data
      const validation = this._validateProfileData(profileData);
      if (!validation.isValid) {
        return {
          success: false,
          errors: validation.errors,
          profile: null,
        };
      }

      // Backup current profile before update
      await this._backupCurrentProfile();

      // Transform profile data for Cognito
      const cognitoAttributes = this._transformProfileToCognitoAttributes(profileData);

      // Update profile in Cognito
      const updateResult = await AuthenticationService.updateUserAttributes(cognitoAttributes);
      
      if (!updateResult.success) {
        throw new Error('Failed to update profile in Cognito');
      }

      // Get the updated profile from Cognito
      const updatedProfile = await this.getUserProfile(true); // Force refresh
      
      // Mark sync as successful
      await this._updateSyncStatus('success', new Date().toISOString());

      return {
        success: true,
        profile: updatedProfile,
        syncedAt: new Date().toISOString(),
      };
    } catch (error) {
      console.error('Error updating user profile:', error);
      
      // Mark sync as failed and restore backup if needed
      await this._updateSyncStatus('failed', new Date().toISOString(), error.message);
      
      const processedError = AuthErrorHandler.handleAuthError(error);
      return {
        success: false,
        error: processedError.message,
        profile: null,
      };
    }
  }

  /**
   * Sync profile data between Cognito and local storage
   * @returns {Promise<Object>} Sync result
   */
  static async syncWithCognito() {
    try {
      // Check authentication status
      const isAuthenticated = await AuthenticationService.isAuthenticated();
      if (!isAuthenticated) {
        return {
          success: false,
          error: 'User not authenticated',
        };
      }

      // Get current local profile
      const localProfile = await this._getCachedProfile();
      
      // Get current Cognito profile
      const cognitoProfile = await AuthenticationService.getCurrentUser();
      
      if (!cognitoProfile) {
        return {
          success: false,
          error: 'Failed to retrieve profile from Cognito',
        };
      }

      // Transform Cognito profile
      const transformedProfile = this._transformCognitoProfile(cognitoProfile);
      
      // Compare profiles and determine sync direction
      const syncResult = await this._performProfileSync(localProfile, transformedProfile);
      
      return syncResult;
    } catch (error) {
      console.error('Error syncing with Cognito:', error);
      
      await this._updateSyncStatus('failed', new Date().toISOString(), error.message);
      
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Store profile data locally with caching
   * @param {Object} profileData - Profile data to store
   * @returns {Promise<boolean>} Success status
   */
  static async storeProfileLocally(profileData) {
    try {
      const validation = this._validateProfileData(profileData);
      if (!validation.isValid) {
        console.warn('Invalid profile data for local storage:', validation.errors);
        return false;
      }

      await this._cacheProfile(profileData);
      return true;
    } catch (error) {
      console.error('Error storing profile locally:', error);
      return false;
    }
  }

  /**
   * Get locally cached profile
   * @returns {Promise<Object|null>} Cached profile or null
   */
  static async getLocalProfile() {
    try {
      return await this._getCachedProfile();
    } catch (error) {
      console.error('Error getting local profile:', error);
      return null;
    }
  }

  /**
   * Clear all cached profile data
   * @returns {Promise<boolean>} Success status
   */
  static async clearProfileCache() {
    try {
      await Promise.all([
        AsyncStorage.removeItem(PROFILE_STORAGE_KEYS.USER_PROFILE),
        AsyncStorage.removeItem(PROFILE_STORAGE_KEYS.PROFILE_CACHE_TIMESTAMP),
        AsyncStorage.removeItem(PROFILE_STORAGE_KEYS.PROFILE_SYNC_STATUS),
        AsyncStorage.removeItem(PROFILE_STORAGE_KEYS.PROFILE_BACKUP),
      ]);

      return true;
    } catch (error) {
      console.error('Error clearing profile cache:', error);
      return false;
    }
  }

  /**
   * Get profile sync status and statistics
   * @returns {Promise<Object>} Sync status information
   */
  static async getProfileSyncStatus() {
    try {
      const [syncStatus, cacheTimestamp, hasLocalProfile, hasCognitoAccess] = await Promise.all([
        AsyncStorage.getItem(PROFILE_STORAGE_KEYS.PROFILE_SYNC_STATUS),
        AsyncStorage.getItem(PROFILE_STORAGE_KEYS.PROFILE_CACHE_TIMESTAMP),
        this._getCachedProfile().then(profile => !!profile),
        AuthenticationService.isAuthenticated(),
      ]);

      const parsedSyncStatus = syncStatus ? JSON.parse(syncStatus) : null;
      const cacheAge = cacheTimestamp ? Date.now() - parseInt(cacheTimestamp) : null;
      const isCacheValid = await this._isProfileCacheValid();

      return {
        lastSyncStatus: parsedSyncStatus?.status || 'unknown',
        lastSyncTime: parsedSyncStatus?.timestamp || null,
        lastSyncError: parsedSyncStatus?.error || null,
        hasLocalProfile,
        hasCognitoAccess,
        cacheAge,
        isCacheValid,
        needsSync: !isCacheValid && hasCognitoAccess,
      };
    } catch (error) {
      console.error('Error getting profile sync status:', error);
      return {
        lastSyncStatus: 'error',
        lastSyncTime: null,
        lastSyncError: error.message,
        hasLocalProfile: false,
        hasCognitoAccess: false,
        cacheAge: null,
        isCacheValid: false,
        needsSync: false,
      };
    }
  }

  // Private helper methods

  /**
   * Get cached profile from local storage
   * @private
   * @returns {Promise<Object|null>} Cached profile or null
   */
  static async _getCachedProfile() {
    try {
      const profileData = await AsyncStorage.getItem(PROFILE_STORAGE_KEYS.USER_PROFILE);
      return profileData ? JSON.parse(profileData) : null;
    } catch (error) {
      console.error('Error getting cached profile:', error);
      return null;
    }
  }

  /**
   * Cache profile data locally
   * @private
   * @param {Object} profileData - Profile data to cache
   * @returns {Promise<void>}
   */
  static async _cacheProfile(profileData) {
    try {
      const cacheData = {
        ...profileData,
        cachedAt: Date.now(),
        lastUpdated: new Date().toISOString(),
      };

      await Promise.all([
        AsyncStorage.setItem(PROFILE_STORAGE_KEYS.USER_PROFILE, JSON.stringify(cacheData)),
        AsyncStorage.setItem(PROFILE_STORAGE_KEYS.PROFILE_CACHE_TIMESTAMP, Date.now().toString()),
      ]);
    } catch (error) {
      console.error('Error caching profile:', error);
      throw error;
    }
  }

  /**
   * Check if profile cache is still valid
   * @private
   * @returns {Promise<boolean>} True if cache is valid
   */
  static async _isProfileCacheValid() {
    try {
      const timestamp = await AsyncStorage.getItem(PROFILE_STORAGE_KEYS.PROFILE_CACHE_TIMESTAMP);
      if (!timestamp) {
        return false;
      }

      const cacheAge = Date.now() - parseInt(timestamp);
      return cacheAge < PROFILE_CACHE_DURATION;
    } catch (error) {
      console.error('Error checking cache validity:', error);
      return false;
    }
  }

  /**
   * Transform Cognito profile to internal format
   * @private
   * @param {Object} cognitoProfile - Profile from Cognito
   * @returns {Object} Transformed profile
   */
  static _transformCognitoProfile(cognitoProfile) {
    return {
      id: cognitoProfile.id,
      email: cognitoProfile.email || '',
      firstName: cognitoProfile.firstName || '',
      lastName: cognitoProfile.lastName || '',
      phoneNumber: cognitoProfile.phoneNumber || '',
      isEmailVerified: cognitoProfile.isEmailVerified || false,
      createdAt: cognitoProfile.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      source: 'cognito',
    };
  }

  /**
   * Transform profile data to Cognito attributes format
   * @private
   * @param {Object} profileData - Internal profile data
   * @returns {Object} Cognito attributes
   */
  static _transformProfileToCognitoAttributes(profileData) {
    const attributes = {};

    if (profileData.firstName !== undefined) {
      attributes.given_name = profileData.firstName;
    }
    if (profileData.lastName !== undefined) {
      attributes.family_name = profileData.lastName;
    }
    if (profileData.phoneNumber !== undefined) {
      attributes.phone_number = profileData.phoneNumber;
    }
    // Note: Email updates require verification, handled separately

    return attributes;
  }

  /**
   * Validate profile data
   * @private
   * @param {Object} profileData - Profile data to validate
   * @returns {Object} Validation result
   */
  static _validateProfileData(profileData) {
    const errors = [];

    if (!profileData) {
      return { isValid: false, errors: ['Profile data is required'] };
    }

    // Email validation
    if (profileData.email !== undefined) {
      if (!this._isValidEmail(profileData.email)) {
        errors.push('Invalid email format');
      }
    }

    // Name validation
    if (profileData.firstName !== undefined) {
      if (!this._isValidName(profileData.firstName)) {
        errors.push('First name must be 1-50 characters and contain only letters, spaces, hyphens, and apostrophes');
      }
    }

    if (profileData.lastName !== undefined) {
      if (!this._isValidName(profileData.lastName)) {
        errors.push('Last name must be 1-50 characters and contain only letters, spaces, hyphens, and apostrophes');
      }
    }

    // Phone number validation
    if (profileData.phoneNumber !== undefined && profileData.phoneNumber !== '') {
      if (!this._isValidPhoneNumber(profileData.phoneNumber)) {
        errors.push('Invalid phone number format');
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate email format
   * @private
   * @param {string} email - Email to validate
   * @returns {boolean} True if valid
   */
  static _isValidEmail(email) {
    if (!email || typeof email !== 'string') {
      return false;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email) && email.length <= 254;
  }

  /**
   * Validate name format
   * @private
   * @param {string} name - Name to validate
   * @returns {boolean} True if valid
   */
  static _isValidName(name) {
    if (!name || typeof name !== 'string') {
      return false;
    }

    const nameRegex = /^[a-zA-Z\s\-']{1,50}$/;
    return nameRegex.test(name.trim());
  }

  /**
   * Validate phone number format
   * @private
   * @param {string} phoneNumber - Phone number to validate
   * @returns {boolean} True if valid
   */
  static _isValidPhoneNumber(phoneNumber) {
    if (!phoneNumber || typeof phoneNumber !== 'string') {
      return false;
    }

    // Support various phone number formats
    const phoneRegex = /^\+?[1-9]\d{1,14}$/;
    const cleanedPhone = phoneNumber.replace(/[\s\-\(\)]/g, '');
    return phoneRegex.test(cleanedPhone);
  }

  /**
   * Backup current profile before updates
   * @private
   * @returns {Promise<void>}
   */
  static async _backupCurrentProfile() {
    try {
      const currentProfile = await this._getCachedProfile();
      if (currentProfile) {
        const backupData = {
          profile: currentProfile,
          backedUpAt: Date.now(),
        };
        await AsyncStorage.setItem(PROFILE_STORAGE_KEYS.PROFILE_BACKUP, JSON.stringify(backupData));
      }
    } catch (error) {
      console.error('Error backing up profile:', error);
    }
  }

  /**
   * Update sync status
   * @private
   * @param {string} status - Sync status ('success', 'failed', 'in_progress')
   * @param {string} timestamp - Timestamp of sync attempt
   * @param {string} error - Error message if failed
   * @returns {Promise<void>}
   */
  static async _updateSyncStatus(status, timestamp, error = null) {
    try {
      const syncStatus = {
        status,
        timestamp,
        error,
      };
      await AsyncStorage.setItem(PROFILE_STORAGE_KEYS.PROFILE_SYNC_STATUS, JSON.stringify(syncStatus));
    } catch (storageError) {
      console.error('Error updating sync status:', storageError);
    }
  }

  /**
   * Perform profile synchronization between local and Cognito
   * @private
   * @param {Object|null} localProfile - Local cached profile
   * @param {Object} cognitoProfile - Profile from Cognito
   * @returns {Promise<Object>} Sync result
   */
  static async _performProfileSync(localProfile, cognitoProfile) {
    try {
      await this._updateSyncStatus('in_progress', new Date().toISOString());

      // If no local profile, cache the Cognito profile
      if (!localProfile) {
        await this._cacheProfile(cognitoProfile);
        await this._updateSyncStatus('success', new Date().toISOString());
        
        return {
          success: true,
          action: 'cached_cognito_profile',
          profile: cognitoProfile,
        };
      }

      // Compare timestamps to determine which is newer
      const localUpdated = new Date(localProfile.updatedAt || localProfile.cachedAt || 0);
      const cognitoUpdated = new Date(cognitoProfile.updatedAt || 0);

      // If Cognito profile is newer, update local cache
      if (cognitoUpdated > localUpdated) {
        await this._cacheProfile(cognitoProfile);
        await this._updateSyncStatus('success', new Date().toISOString());
        
        return {
          success: true,
          action: 'updated_local_from_cognito',
          profile: cognitoProfile,
        };
      }

      // If local profile is newer, we might need to sync to Cognito
      // For now, we'll just update the cache timestamp
      await this._cacheProfile(localProfile);
      await this._updateSyncStatus('success', new Date().toISOString());

      return {
        success: true,
        action: 'local_profile_current',
        profile: localProfile,
      };
    } catch (error) {
      console.error('Error performing profile sync:', error);
      await this._updateSyncStatus('failed', new Date().toISOString(), error.message);
      
      return {
        success: false,
        error: error.message,
      };
    }
  }
}

export default UserProfileService;