import AsyncStorage from '@react-native-async-storage/async-storage';
import DataNamespacing from '../utils/dataNamespacing';
import AuthenticationService from './AuthenticationService';

/**
 * Service for handling data migration when users first authenticate
 * Manages the transition from global storage to user-specific storage
 */
class DataMigrationService {
  static MIGRATION_STATUS_KEY = 'migration_status';
  static MIGRATION_VERSION = '1.0.0';

  /**
   * Check if migration is needed for the current user
   * @returns {Promise<boolean>} True if migration is needed
   */
  static async isMigrationNeeded() {
    try {
      const user = await AuthenticationService.getCurrentUser();
      if (!user) {
        console.log('No authenticated user, migration not needed');
        return false;
      }

      const migrationComplete = await DataNamespacing.isMigrationComplete(user.id);
      return !migrationComplete;
    } catch (error) {
      console.error('Error checking migration status:', error);
      return false;
    }
  }

  /**
   * Perform complete data migration for the current user
   * @returns {Promise<Object>} Migration result
   */
  static async performMigration() {
    const migrationResult = {
      success: false,
      userId: null,
      startTime: new Date().toISOString(),
      endTime: null,
      duration: 0,
      migratedData: {},
      errors: []
    };

    try {
      const user = await AuthenticationService.getCurrentUser();
      if (!user) {
        throw new Error('No authenticated user found for migration');
      }

      migrationResult.userId = user.id;
      console.log(`Starting data migration for user: ${user.id}`);

      // Check if migration already completed
      const alreadyMigrated = await DataNamespacing.isMigrationComplete(user.id);
      if (alreadyMigrated) {
        console.log('Migration already completed for this user');
        migrationResult.success = true;
        migrationResult.endTime = new Date().toISOString();
        return migrationResult;
      }

      // Perform the actual migration using DataNamespacing utility
      const namespacingResult = await DataNamespacing.migrateUserData(user.id);
      
      migrationResult.migratedData = {
        migratedKeys: namespacingResult.migratedKeys,
        skippedKeys: namespacingResult.skippedKeys,
        errors: namespacingResult.errors
      };

      if (namespacingResult.success) {
        // Store migration completion status
        await this.storeMigrationStatus(user.id, {
          completed: true,
          version: this.MIGRATION_VERSION,
          completedAt: new Date().toISOString(),
          migratedKeys: namespacingResult.migratedKeys.map(item => item.from),
          errors: namespacingResult.errors
        });

        migrationResult.success = true;
        console.log(`Data migration completed successfully for user: ${user.id}`);
      } else {
        migrationResult.errors = namespacingResult.errors;
        console.error(`Data migration failed for user: ${user.id}`, namespacingResult.errors);
      }

    } catch (error) {
      console.error('Error during data migration:', error);
      migrationResult.errors.push({
        type: 'MIGRATION_ERROR',
        message: error.message,
        stack: error.stack
      });
    } finally {
      migrationResult.endTime = new Date().toISOString();
      migrationResult.duration = new Date(migrationResult.endTime) - new Date(migrationResult.startTime);
    }

    return migrationResult;
  }

  /**
   * Store migration status for a user
   * @private
   */
  static async storeMigrationStatus(userId, status) {
    try {
      const migrationData = {
        userId: userId,
        ...status
      };
      
      await DataNamespacing.setUserData(this.MIGRATION_STATUS_KEY, migrationData, userId);
      return true;
    } catch (error) {
      console.error('Error storing migration status:', error);
      return false;
    }
  }

  /**
   * Get migration status for the current user
   * @returns {Promise<Object|null>} Migration status or null
   */
  static async getMigrationStatus() {
    try {
      const user = await AuthenticationService.getCurrentUser();
      if (!user) {
        return null;
      }

      return await DataNamespacing.getUserData(this.MIGRATION_STATUS_KEY, null, user.id);
    } catch (error) {
      console.error('Error getting migration status:', error);
      return null;
    }
  }

  /**
   * Check if there's any legacy data that could be migrated
   * @returns {Promise<Object>} Information about available legacy data
   */
  static async checkLegacyData() {
    const legacyDataInfo = {
      hasLegacyData: false,
      availableKeys: [],
      estimatedDataSize: 0
    };

    try {
      const legacyKeys = Object.keys(DataNamespacing.LEGACY_KEYS);
      
      for (const key of legacyKeys) {
        try {
          const data = await AsyncStorage.getItem(key);
          if (data !== null) {
            legacyDataInfo.hasLegacyData = true;
            legacyDataInfo.availableKeys.push({
              key: key,
              size: data.length,
              hasValidJson: this.isValidJson(data)
            });
            legacyDataInfo.estimatedDataSize += data.length;
          }
        } catch (error) {
          console.warn(`Error checking legacy key ${key}:`, error);
        }
      }

      return legacyDataInfo;
    } catch (error) {
      console.error('Error checking legacy data:', error);
      return legacyDataInfo;
    }
  }

  /**
   * Validate JSON data
   * @private
   */
  static isValidJson(jsonString) {
    try {
      JSON.parse(jsonString);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Clean up legacy data after successful migration
   * This should only be called after confirming migration was successful
   * @returns {Promise<Object>} Cleanup result
   */
  static async cleanupLegacyData() {
    try {
      const user = await AuthenticationService.getCurrentUser();
      if (!user) {
        throw new Error('No authenticated user found for cleanup');
      }

      // Verify migration was completed
      const migrationStatus = await this.getMigrationStatus();
      if (!migrationStatus || !migrationStatus.completed) {
        throw new Error('Cannot cleanup - migration not completed');
      }

      console.log(`Starting legacy data cleanup for user: ${user.id}`);
      return await DataNamespacing.cleanupLegacyData(user.id);
    } catch (error) {
      console.error('Error during legacy data cleanup:', error);
      return {
        success: false,
        errors: [{ type: 'CLEANUP_ERROR', message: error.message }]
      };
    }
  }

  /**
   * Perform migration check and migration if needed on app startup
   * This is the main method to call during app initialization
   * @returns {Promise<Object>} Migration result or status
   */
  static async handleAppStartupMigration() {
    const result = {
      migrationNeeded: false,
      migrationPerformed: false,
      migrationResult: null,
      error: null
    };

    try {
      // Check if user is authenticated
      const isAuthenticated = await AuthenticationService.isAuthenticated();
      if (!isAuthenticated) {
        console.log('User not authenticated, skipping migration check');
        return result;
      }

      // Check if migration is needed
      const migrationNeeded = await this.isMigrationNeeded();
      result.migrationNeeded = migrationNeeded;

      if (migrationNeeded) {
        console.log('Migration needed, performing migration...');
        const migrationResult = await this.performMigration();
        result.migrationPerformed = true;
        result.migrationResult = migrationResult;

        if (migrationResult.success) {
          console.log('Migration completed successfully');
        } else {
          console.error('Migration failed:', migrationResult.errors);
        }
      }

      return result;
    } catch (error) {
      console.error('Error during app startup migration:', error);
      result.error = error.message;
      return result;
    }
  }

  /**
   * Get migration statistics for debugging/admin purposes
   * @returns {Promise<Object>} Migration statistics
   */
  static async getMigrationStatistics() {
    try {
      const user = await AuthenticationService.getCurrentUser();
      if (!user) {
        return null;
      }

      const migrationStatus = await this.getMigrationStatus();
      const legacyDataInfo = await this.checkLegacyData();
      const userKeys = await DataNamespacing.getUserKeys(user.id);

      return {
        userId: user.id,
        migrationStatus: migrationStatus,
        legacyDataInfo: legacyDataInfo,
        userSpecificKeys: userKeys.length,
        migrationMetadata: await DataNamespacing.getMigrationMetadata(user.id)
      };
    } catch (error) {
      console.error('Error getting migration statistics:', error);
      return null;
    }
  }

  /**
   * Force re-migration (for testing or recovery purposes)
   * WARNING: This will overwrite existing user data
   * @returns {Promise<Object>} Migration result
   */
  static async forceMigration() {
    try {
      const user = await AuthenticationService.getCurrentUser();
      if (!user) {
        throw new Error('No authenticated user found');
      }

      console.warn(`Force migration initiated for user: ${user.id}`);
      
      // Clear existing migration status
      await DataNamespacing.removeUserData(this.MIGRATION_STATUS_KEY, user.id);
      
      // Perform migration
      return await this.performMigration();
    } catch (error) {
      console.error('Error during force migration:', error);
      return {
        success: false,
        errors: [{ type: 'FORCE_MIGRATION_ERROR', message: error.message }]
      };
    }
  }
}

export default DataMigrationService;