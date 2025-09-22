import { DynamoDBService } from './DynamoDBService';
import AuthenticationService from './AuthenticationService';
import DataEncryptionService from './DataEncryptionService';
import DataValidationService from './DataValidationService';
import { DYNAMODB_TABLES } from '../config/aws-config.js';

/**
 * DynamoDB-enabled User Profile Service
 * Provides CRUD operations for user profiles and preferences using DynamoDB as the backend
 * Handles user-specific settings and family-wide configurations
 */
class DynamoDBUserProfileService {
  static TABLE_NAME = DYNAMODB_TABLES.USERS;
  
  // Required fields for user profile validation
  static REQUIRED_FIELDS = ['email'];
  
  // Default user preferences
  static DEFAULT_PREFERENCES = {
    notifications: true,
    theme: 'light',
    language: 'en',
    timeFormat: '12h',
    dateFormat: 'MM/DD/YYYY',
    reminderDefaults: {
      enabled: true,
      minutesBefore: 15
    },
    privacy: {
      shareData: false,
      analytics: true
    }
  };

  /**
   * Get current authenticated user ID
   * @private
   * @returns {Promise<string>} User ID
   * @throws {Error} If user is not authenticated
   */
  static async _getCurrentUserId() {
    const user = await AuthenticationService.getCurrentUser();
    if (!user || !user.id) {
      throw new Error('User not authenticated');
    }
    return user.id;
  }

  /**
   * Validate user profile data before saving
   * @private
   * @param {Object} profileData - User profile data to validate
   * @throws {Error} If validation fails
   */
  static _validateUserProfileData(profileData) {
    // Check for dangerous patterns first
    DataValidationService.validateNoDangerousPatterns(profileData);
    
    // Use comprehensive validation service
    return DataValidationService.validateUserProfileData(profileData);
  }

  /**
   * Prepare user profile data for storage by applying validation, defaults, and encryption
   * @private
   * @param {Object} profileData - Raw user profile data
   * @returns {Promise<Object>} Sanitized and encrypted user profile data with defaults applied
   */
  static async _prepareUserProfileData(profileData) {
    // Validate and sanitize the data first
    const validatedData = this._validateUserProfileData(profileData);
    
    // Apply default values for missing fields
    const preparedData = {
      ...validatedData,
      // Merge preferences with defaults
      preferences: {
        ...this.DEFAULT_PREFERENCES,
        ...(validatedData.preferences || {})
      }
    };
    
    // Ensure nested preference objects are properly merged
    if (validatedData.preferences?.reminderDefaults) {
      preparedData.preferences.reminderDefaults = {
        ...this.DEFAULT_PREFERENCES.reminderDefaults,
        ...validatedData.preferences.reminderDefaults
      };
    }
    
    if (validatedData.preferences?.privacy) {
      preparedData.preferences.privacy = {
        ...this.DEFAULT_PREFERENCES.privacy,
        ...validatedData.preferences.privacy
      };
    }
    
    // Encrypt sensitive fields before storage
    const encryptedData = await DataEncryptionService.encryptSensitiveFields(preparedData);
    
    return encryptedData;
  }

  /**
   * Get user profile for the current user
   * @returns {Promise<Object|null>} User profile object or null if not found
   */
  static async getUserProfile() {
    try {
      const userId = await this._getCurrentUserId();
      
      const profile = await DynamoDBService.getItem(
        this.TABLE_NAME,
        { userId: userId }
      );
      
      if (profile) {
        // Validate data isolation
        DynamoDBService.validateUserDataIsolation(profile, userId);
        
        // Decrypt sensitive fields before returning
        const decryptedProfile = await DataEncryptionService.decryptSensitiveFields(profile);
        return decryptedProfile;
      }
      
      return null;
    } catch (error) {
      // Re-throw authentication errors
      if (error.message.includes('not authenticated') || 
          error.message.includes('User not authenticated')) {
        throw error;
      }
      
      console.error('Error loading user profile:', DataEncryptionService.sanitizeForLogging(error));
      return null;
    }
  }

  /**
   * Create or update user profile
   * @param {Object} profileData - User profile data
   * @returns {Promise<Object|null>} Created/updated user profile or null if failed
   */
  static async saveUserProfile(profileData) {
    try {
      const userId = await this._getCurrentUserId();
      
      // Validate, sanitize, and encrypt data
      const preparedData = await this._prepareUserProfileData(profileData);
      
      // Create user profile item for DynamoDB
      const profileItem = {
        userId: userId,
        ...preparedData
      };
      
      const result = await DynamoDBService.putItem(this.TABLE_NAME, profileItem);
      
      if (result.success) {
        // Decrypt sensitive fields before returning
        const decryptedItem = await DataEncryptionService.decryptSensitiveFields(result.item);
        return decryptedItem;
      } else {
        throw new Error('Failed to save user profile');
      }
    } catch (error) {
      // Re-throw authentication and validation errors
      if (error.message.includes('not authenticated') || 
          error.message.includes('User not authenticated') ||
          error.message.includes('must be one of') ||
          error.message.includes('invalid')) {
        throw error;
      }
      
      console.error('Error saving user profile:', DataEncryptionService.sanitizeForLogging(error));
      return null;
    }
  }

  /**
   * Update specific user profile fields
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object|null>} Updated user profile or null if failed
   */
  static async updateUserProfile(updates) {
    try {
      const userId = await this._getCurrentUserId();
      
      // Validate and prepare updates (excluding system fields)
      const { userId: _, ...dataToUpdate } = updates;
      
      let preparedData = {};
      if (Object.keys(dataToUpdate).length > 0) {
        // For partial updates, validate individual fields
        try {
          if (dataToUpdate.email !== undefined) {
            DataValidationService.validateEmail(dataToUpdate.email);
          }
          if (dataToUpdate.firstName !== undefined) {
            DataValidationService.validateName(dataToUpdate.firstName, 'First name');
          }
          if (dataToUpdate.lastName !== undefined) {
            DataValidationService.validateName(dataToUpdate.lastName, 'Last name');
          }
          if (dataToUpdate.phoneNumber !== undefined) {
            DataValidationService.validatePhoneNumber(dataToUpdate.phoneNumber);
          }
          
          // Check for dangerous patterns
          DataValidationService.validateNoDangerousPatterns(dataToUpdate);
          
          // Encrypt sensitive fields
          preparedData = await DataEncryptionService.encryptSensitiveFields(dataToUpdate);
        } catch (validationError) {
          throw validationError;
        }
      }
      
      const result = await DynamoDBService.updateItem(
        this.TABLE_NAME,
        { userId: userId },
        preparedData,
        {
          // Ensure the profile exists before updating
          ConditionExpression: 'attribute_exists(userId)'
        }
      );
      
      if (result.success) {
        // Decrypt sensitive fields before returning
        const decryptedItem = await DataEncryptionService.decryptSensitiveFields(result.item);
        return decryptedItem;
      } else {
        throw new Error('Failed to update user profile');
      }
    } catch (error) {
      // Re-throw authentication errors
      if (error.message.includes('not authenticated') || 
          error.message.includes('User not authenticated')) {
        throw error;
      }
      
      console.error('Error updating user profile:', DataEncryptionService.sanitizeForLogging(error));
      return null;
    }
  }

  /**
   * Update user preferences only
   * @param {Object} preferences - Preferences to update
   * @returns {Promise<boolean>} Success status
   */
  static async updateUserPreferences(preferences) {
    try {
      const userId = await this._getCurrentUserId();
      
      // Get current profile to merge preferences
      const currentProfile = await this.getUserProfile();
      if (!currentProfile) {
        throw new Error('User profile not found');
      }
      
      // Merge new preferences with existing ones
      const updatedPreferences = {
        ...currentProfile.preferences,
        ...preferences
      };
      
      // Handle nested objects properly
      if (preferences.reminderDefaults) {
        updatedPreferences.reminderDefaults = {
          ...currentProfile.preferences.reminderDefaults,
          ...preferences.reminderDefaults
        };
      }
      
      if (preferences.privacy) {
        updatedPreferences.privacy = {
          ...currentProfile.preferences.privacy,
          ...preferences.privacy
        };
      }
      
      const result = await DynamoDBService.updateItem(
        this.TABLE_NAME,
        { userId: userId },
        { preferences: updatedPreferences }
      );
      
      return result.success;
    } catch (error) {
      console.error('Error updating user preferences:', error);
      return false;
    }
  }

  /**
   * Get user preferences only
   * @returns {Promise<Object>} User preferences object
   */
  static async getUserPreferences() {
    try {
      const profile = await this.getUserProfile();
      return profile?.preferences || this.DEFAULT_PREFERENCES;
    } catch (error) {
      console.error('Error getting user preferences:', error);
      return this.DEFAULT_PREFERENCES;
    }
  }

  /**
   * Delete user profile (for account deletion)
   * @returns {Promise<boolean>} Success status
   */
  static async deleteUserProfile() {
    try {
      const userId = await this._getCurrentUserId();
      
      await DynamoDBService.deleteItem(
        this.TABLE_NAME,
        { userId: userId },
        {
          // Ensure the profile exists before deleting
          ConditionExpression: 'attribute_exists(userId)'
        }
      );
      
      return true;
    } catch (error) {
      // Re-throw authentication errors
      if (error.message.includes('not authenticated') || 
          error.message.includes('User not authenticated')) {
        throw error;
      }
      
      console.error('Error deleting user profile:', error);
      return false;
    }
  }

  /**
   * Check if user profile exists
   * @returns {Promise<boolean>} True if profile exists
   */
  static async profileExists() {
    try {
      const profile = await this.getUserProfile();
      return profile !== null;
    } catch (error) {
      console.error('Error checking if profile exists:', error);
      return false;
    }
  }

  /**
   * Initialize user profile with default values (for new users)
   * @param {Object} initialData - Initial profile data from registration
   * @returns {Promise<Object|null>} Created user profile or null if failed
   */
  static async initializeUserProfile(initialData = {}) {
    try {
      const userId = await this._getCurrentUserId();
      
      // Check if profile already exists
      const existingProfile = await this.getUserProfile();
      if (existingProfile) {
        return existingProfile;
      }
      
      // Get user data from Cognito if not provided
      const cognitoUser = await AuthenticationService.getCurrentUser();
      
      const defaultProfileData = {
        email: cognitoUser?.email || initialData.email || '',
        firstName: cognitoUser?.firstName || initialData.firstName || '',
        lastName: cognitoUser?.lastName || initialData.lastName || '',
        phoneNumber: cognitoUser?.phoneNumber || initialData.phoneNumber || '',
        preferences: this.DEFAULT_PREFERENCES,
        ...initialData
      };
      
      return await this.saveUserProfile(defaultProfileData);
    } catch (error) {
      console.error('Error initializing user profile:', error);
      return null;
    }
  }

  /**
   * Get user profile statistics (utility method)
   * @returns {Promise<Object>} Profile statistics
   */
  static async getProfileStats() {
    try {
      const profile = await this.getUserProfile();
      
      if (!profile) {
        return {
          exists: false,
          completeness: 0,
          missingFields: ['email', 'firstName', 'lastName']
        };
      }
      
      const requiredFields = ['email', 'firstName', 'lastName'];
      const optionalFields = ['phoneNumber'];
      const allFields = [...requiredFields, ...optionalFields];
      
      const completedFields = allFields.filter(field => 
        profile[field] && profile[field].trim() !== ''
      );
      
      const missingFields = requiredFields.filter(field => 
        !profile[field] || profile[field].trim() === ''
      );
      
      const completeness = Math.round((completedFields.length / allFields.length) * 100);
      
      return {
        exists: true,
        completeness,
        missingFields,
        lastUpdated: profile.updatedAt,
        createdAt: profile.createdAt
      };
    } catch (error) {
      console.error('Error getting profile stats:', error);
      return {
        exists: false,
        completeness: 0,
        missingFields: ['email', 'firstName', 'lastName']
      };
    }
  }

  /**
   * Export user profile data (for data portability)
   * @returns {Promise<Object|null>} Exported profile data or null if failed
   */
  static async exportUserProfile() {
    try {
      const profile = await this.getUserProfile();
      
      if (!profile) {
        return null;
      }
      
      // Remove sensitive system fields
      const { version, createdAt, updatedAt, ...exportData } = profile;
      
      return {
        ...exportData,
        exportedAt: new Date().toISOString(),
        exportVersion: '1.0'
      };
    } catch (error) {
      console.error('Error exporting user profile:', error);
      return null;
    }
  }

  /**
   * Validate user data isolation for profile operations
   * @param {string} requestedUserId - User ID being requested
   * @returns {Promise<boolean>} True if access is allowed
   */
  static async validateProfileAccess(requestedUserId) {
    try {
      const currentUserId = await this._getCurrentUserId();
      return currentUserId === requestedUserId;
    } catch (error) {
      console.error('Error validating profile access:', error);
      return false;
    }
  }
}

export default DynamoDBUserProfileService;