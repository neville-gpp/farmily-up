import AsyncStorage from '@react-native-async-storage/async-storage';
import AuthenticationService from '../services/AuthenticationService';

/**
 * Utility for managing user-specific data namespacing in AsyncStorage
 * Provides methods to create user-specific keys and migrate existing data
 */
class DataNamespacing {
  // Global storage keys that should not be namespaced
  static GLOBAL_KEYS = [
    'auth_tokens',
    'user_profile',
    'last_token_refresh',
    'app_settings',
    'onboarding_completed'
  ];

  // Legacy storage keys that need to be migrated to user-specific keys
  static LEGACY_KEYS = {
    'children-profile.json': 'children-profile.json',
    'calendar-tasks.json': 'calendar-tasks.json',
    'activities.json': 'activities.json',
    'activities_backup.json': 'activities_backup.json',
    'parent-feeling.json': 'parent-feeling.json'
  };

  /**
   * Get the current authenticated user ID
   * @returns {Promise<string|null>} User ID or null if not authenticated
   */
  static async getCurrentUserId() {
    try {
      const user = await AuthenticationService.getCurrentUser();
      return user?.id || null;
    } catch (error) {
      console.error('Error getting current user ID:', error);
      return null;
    }
  }

  /**
   * Create a user-specific storage key
   * @param {string} baseKey - The base storage key
   * @param {string} userId - Optional user ID (will get current user if not provided)
   * @returns {Promise<string>} User-specific storage key
   */
  static async createUserKey(baseKey, userId = null) {
    try {
      // Check if this is a global key that shouldn't be namespaced
      if (this.GLOBAL_KEYS.includes(baseKey)) {
        return baseKey;
      }

      const currentUserId = userId || await this.getCurrentUserId();
      
      if (!currentUserId) {
        console.warn(`No user ID available for key: ${baseKey}, using global key`);
        return baseKey;
      }

      return `user_${currentUserId}_${baseKey}`;
    } catch (error) {
      console.error('Error creating user key:', error);
      return baseKey; // Fallback to original key
    }
  }

  /**
   * Get user-specific data from AsyncStorage
   * @param {string} baseKey - The base storage key
   * @param {any} defaultValue - Default value if no data exists
   * @param {string} userId - Optional user ID
   * @returns {Promise<any>} Stored data or default value
   */
  static async getUserData(baseKey, defaultValue = null, userId = null) {
    try {
      const userKey = await this.createUserKey(baseKey, userId);
      const jsonValue = await AsyncStorage.getItem(userKey);
      
      if (jsonValue === null) {
        return defaultValue;
      }

      try {
        return JSON.parse(jsonValue);
      } catch (parseError) {
        console.error(`Error parsing data for key ${userKey}:`, parseError);
        return defaultValue;
      }
    } catch (error) {
      console.error(`Error getting user data for key ${baseKey}:`, error);
      return defaultValue;
    }
  }

  /**
   * Set user-specific data in AsyncStorage
   * @param {string} baseKey - The base storage key
   * @param {any} data - Data to store
   * @param {string} userId - Optional user ID
   * @returns {Promise<boolean>} Success status
   */
  static async setUserData(baseKey, data, userId = null) {
    try {
      const userKey = await this.createUserKey(baseKey, userId);
      const jsonValue = JSON.stringify(data);
      await AsyncStorage.setItem(userKey, jsonValue);
      return true;
    } catch (error) {
      console.error(`Error setting user data for key ${baseKey}:`, error);
      return false;
    }
  }

  /**
   * Remove user-specific data from AsyncStorage
   * @param {string} baseKey - The base storage key
   * @param {string} userId - Optional user ID
   * @returns {Promise<boolean>} Success status
   */
  static async removeUserData(baseKey, userId = null) {
    try {
      const userKey = await this.createUserKey(baseKey, userId);
      await AsyncStorage.removeItem(userKey);
      return true;
    } catch (error) {
      console.error(`Error removing user data for key ${baseKey}:`, error);
      return false;
    }
  }

  /**
   * Migrate existing global data to user-specific data
   * This should be called when a user first logs in after the authentication system is implemented
   * @param {string} userId - User ID to migrate data to
   * @returns {Promise<Object>} Migration result with success status and details
   */
  static async migrateUserData(userId) {
    const migrationResult = {
      success: true,
      migratedKeys: [],
      errors: [],
      skippedKeys: []
    };

    try {
      console.log(`Starting data migration for user: ${userId}`);

      for (const [legacyKey, newBaseKey] of Object.entries(this.LEGACY_KEYS)) {
        try {
          // Check if legacy data exists
          const legacyData = await AsyncStorage.getItem(legacyKey);
          
          if (legacyData === null) {
            console.log(`No legacy data found for key: ${legacyKey}`);
            migrationResult.skippedKeys.push(legacyKey);
            continue;
          }

          // Create user-specific key
          const userKey = await this.createUserKey(newBaseKey, userId);
          
          // Check if user-specific data already exists
          const existingUserData = await AsyncStorage.getItem(userKey);
          
          if (existingUserData !== null) {
            console.log(`User-specific data already exists for key: ${userKey}, skipping migration`);
            migrationResult.skippedKeys.push(legacyKey);
            continue;
          }

          // Validate the legacy data before migration
          try {
            JSON.parse(legacyData);
          } catch (parseError) {
            console.error(`Invalid JSON in legacy data for key ${legacyKey}:`, parseError);
            migrationResult.errors.push({
              key: legacyKey,
              error: 'Invalid JSON format',
              details: parseError.message
            });
            continue;
          }

          // Copy legacy data to user-specific key
          await AsyncStorage.setItem(userKey, legacyData);
          
          console.log(`Successfully migrated ${legacyKey} to ${userKey}`);
          migrationResult.migratedKeys.push({
            from: legacyKey,
            to: userKey,
            dataSize: legacyData.length
          });

        } catch (error) {
          console.error(`Error migrating key ${legacyKey}:`, error);
          migrationResult.errors.push({
            key: legacyKey,
            error: error.message,
            details: error.stack
          });
          migrationResult.success = false;
        }
      }

      // Store migration metadata
      const migrationMetadata = {
        userId: userId,
        migratedAt: new Date().toISOString(),
        migratedKeys: migrationResult.migratedKeys.map(item => item.from),
        errors: migrationResult.errors,
        version: '1.0.0'
      };

      await this.setUserData('migration_metadata.json', migrationMetadata, userId);

      console.log(`Data migration completed for user ${userId}:`, {
        migrated: migrationResult.migratedKeys.length,
        skipped: migrationResult.skippedKeys.length,
        errors: migrationResult.errors.length
      });

      return migrationResult;

    } catch (error) {
      console.error('Error during data migration:', error);
      migrationResult.success = false;
      migrationResult.errors.push({
        key: 'MIGRATION_PROCESS',
        error: error.message,
        details: error.stack
      });
      return migrationResult;
    }
  }

  /**
   * Check if data migration has been completed for a user
   * @param {string} userId - User ID to check
   * @returns {Promise<boolean>} True if migration is complete
   */
  static async isMigrationComplete(userId) {
    try {
      const migrationMetadata = await this.getUserData('migration_metadata.json', null, userId);
      return migrationMetadata !== null && migrationMetadata.userId === userId;
    } catch (error) {
      console.error('Error checking migration status:', error);
      return false;
    }
  }

  /**
   * Clean up legacy data after successful migration
   * WARNING: This permanently deletes the original data
   * @param {string} userId - User ID that was migrated
   * @returns {Promise<Object>} Cleanup result
   */
  static async cleanupLegacyData(userId) {
    const cleanupResult = {
      success: true,
      deletedKeys: [],
      errors: []
    };

    try {
      // Verify migration was completed first
      const migrationComplete = await this.isMigrationComplete(userId);
      
      if (!migrationComplete) {
        throw new Error('Cannot cleanup legacy data - migration not completed or verified');
      }

      console.log(`Starting legacy data cleanup for user: ${userId}`);

      for (const legacyKey of Object.keys(this.LEGACY_KEYS)) {
        try {
          // Check if legacy data still exists
          const legacyData = await AsyncStorage.getItem(legacyKey);
          
          if (legacyData === null) {
            console.log(`Legacy key ${legacyKey} already cleaned up`);
            continue;
          }

          // Remove legacy data
          await AsyncStorage.removeItem(legacyKey);
          
          console.log(`Successfully removed legacy key: ${legacyKey}`);
          cleanupResult.deletedKeys.push(legacyKey);

        } catch (error) {
          console.error(`Error cleaning up legacy key ${legacyKey}:`, error);
          cleanupResult.errors.push({
            key: legacyKey,
            error: error.message
          });
          cleanupResult.success = false;
        }
      }

      // Update migration metadata with cleanup info
      const migrationMetadata = await this.getUserData('migration_metadata.json', {}, userId);
      migrationMetadata.cleanupCompletedAt = new Date().toISOString();
      migrationMetadata.deletedKeys = cleanupResult.deletedKeys;
      await this.setUserData('migration_metadata.json', migrationMetadata, userId);

      console.log(`Legacy data cleanup completed for user ${userId}:`, {
        deleted: cleanupResult.deletedKeys.length,
        errors: cleanupResult.errors.length
      });

      return cleanupResult;

    } catch (error) {
      console.error('Error during legacy data cleanup:', error);
      cleanupResult.success = false;
      cleanupResult.errors.push({
        key: 'CLEANUP_PROCESS',
        error: error.message
      });
      return cleanupResult;
    }
  }

  /**
   * Get all user-specific keys for a user (for debugging/admin purposes)
   * @param {string} userId - User ID
   * @returns {Promise<Array>} Array of user-specific keys
   */
  static async getUserKeys(userId) {
    try {
      const allKeys = await AsyncStorage.getAllKeys();
      const userPrefix = `user_${userId}_`;
      return allKeys.filter(key => key.startsWith(userPrefix));
    } catch (error) {
      console.error('Error getting user keys:', error);
      return [];
    }
  }

  /**
   * Remove all user-specific data (for account deletion)
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Deletion result
   */
  static async removeAllUserData(userId) {
    const deletionResult = {
      success: true,
      deletedKeys: [],
      errors: []
    };

    try {
      console.log(`Starting complete data removal for user: ${userId}`);

      const userKeys = await this.getUserKeys(userId);
      
      for (const key of userKeys) {
        try {
          await AsyncStorage.removeItem(key);
          deletionResult.deletedKeys.push(key);
          console.log(`Removed user data key: ${key}`);
        } catch (error) {
          console.error(`Error removing key ${key}:`, error);
          deletionResult.errors.push({
            key: key,
            error: error.message
          });
          deletionResult.success = false;
        }
      }

      console.log(`User data removal completed for user ${userId}:`, {
        deleted: deletionResult.deletedKeys.length,
        errors: deletionResult.errors.length
      });

      return deletionResult;

    } catch (error) {
      console.error('Error during user data removal:', error);
      deletionResult.success = false;
      deletionResult.errors.push({
        key: 'REMOVAL_PROCESS',
        error: error.message
      });
      return deletionResult;
    }
  }

  /**
   * Get migration status and metadata for a user
   * @param {string} userId - User ID
   * @returns {Promise<Object|null>} Migration metadata or null
   */
  static async getMigrationMetadata(userId) {
    try {
      return await this.getUserData('migration_metadata.json', null, userId);
    } catch (error) {
      console.error('Error getting migration metadata:', error);
      return null;
    }
  }
}

export default DataNamespacing;