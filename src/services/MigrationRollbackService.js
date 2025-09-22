import AsyncStorage from '@react-native-async-storage/async-storage';
import DynamoDBChildrenService from './DynamoDBChildrenService';
import DynamoDBCalendarService from './DynamoDBCalendarService';
import DataNamespacing from '../utils/dataNamespacing';
import AuthenticationService from './AuthenticationService';

/**
 * Migration Rollback Service
 * Handles rollback operations for failed migrations with data integrity checks
 */
class MigrationRollbackService {
  // Rollback operation types
  static ROLLBACK_OPERATIONS = {
    RESTORE_ASYNCSTORAGE: 'restore_asyncstorage',
    CLEANUP_DYNAMODB: 'cleanup_dynamodb',
    VERIFY_INTEGRITY: 'verify_integrity'
  };

  // Rollback status constants
  static ROLLBACK_STATUS = {
    NOT_NEEDED: 'not_needed',
    IN_PROGRESS: 'in_progress',
    COMPLETED: 'completed',
    FAILED: 'failed',
    PARTIAL: 'partial'
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
   * Execute comprehensive rollback for a failed migration
   * @param {string} userId - Optional user ID (uses current user if not provided)
   * @param {Object} options - Rollback options
   * @returns {Promise<Object>} Rollback result
   */
  static async executeRollback(userId = null, options = {}) {
    const rollbackOptions = {
      restoreAsyncStorage: true,
      cleanupDynamoDB: true,
      verifyIntegrity: true,
      createRollbackLog: true,
      ...options
    };

    let currentUserId;
    
    try {
      currentUserId = userId || await this._getCurrentUserId();
      
      const rollbackResult = {
        success: true,
        userId: currentUserId,
        startedAt: new Date().toISOString(),
        completedAt: null,
        operations: [],
        errors: [],
        warnings: []
      };

      // Update rollback status to in progress
      await this._updateRollbackStatus(currentUserId, this.ROLLBACK_STATUS.IN_PROGRESS, {
        startedAt: rollbackResult.startedAt,
        options: rollbackOptions
      });

      // Step 1: Restore AsyncStorage data from backup
      if (rollbackOptions.restoreAsyncStorage) {
        try {
          const restoreResult = await this._restoreAsyncStorageFromBackup(currentUserId);
          rollbackResult.operations.push({
            type: this.ROLLBACK_OPERATIONS.RESTORE_ASYNCSTORAGE,
            success: restoreResult.success,
            details: restoreResult,
            timestamp: new Date().toISOString()
          });

          if (!restoreResult.success) {
            rollbackResult.success = false;
            rollbackResult.errors.push(...restoreResult.errors);
          }
        } catch (error) {
          rollbackResult.success = false;
          rollbackResult.errors.push({
            operation: this.ROLLBACK_OPERATIONS.RESTORE_ASYNCSTORAGE,
            error: error.message,
            timestamp: new Date().toISOString()
          });
        }
      }

      // Step 2: Clean up partially migrated DynamoDB data
      if (rollbackOptions.cleanupDynamoDB) {
        try {
          const cleanupResult = await this._cleanupDynamoDBData(currentUserId);
          rollbackResult.operations.push({
            type: this.ROLLBACK_OPERATIONS.CLEANUP_DYNAMODB,
            success: cleanupResult.success,
            details: cleanupResult,
            timestamp: new Date().toISOString()
          });

          if (!cleanupResult.success) {
            rollbackResult.success = false;
            rollbackResult.errors.push(...cleanupResult.errors);
          }
        } catch (error) {
          rollbackResult.success = false;
          rollbackResult.errors.push({
            operation: this.ROLLBACK_OPERATIONS.CLEANUP_DYNAMODB,
            error: error.message,
            timestamp: new Date().toISOString()
          });
        }
      }

      // Step 3: Verify data integrity after rollback
      if (rollbackOptions.verifyIntegrity) {
        try {
          const verifyResult = await this._verifyRollbackIntegrity(currentUserId);
          rollbackResult.operations.push({
            type: this.ROLLBACK_OPERATIONS.VERIFY_INTEGRITY,
            success: verifyResult.success,
            details: verifyResult,
            timestamp: new Date().toISOString()
          });

          if (!verifyResult.success) {
            rollbackResult.warnings.push(...verifyResult.warnings);
          }
        } catch (error) {
          rollbackResult.warnings.push({
            operation: this.ROLLBACK_OPERATIONS.VERIFY_INTEGRITY,
            error: error.message,
            timestamp: new Date().toISOString()
          });
        }
      }

      rollbackResult.completedAt = new Date().toISOString();

      // Determine final status
      let finalStatus = this.ROLLBACK_STATUS.COMPLETED;
      if (!rollbackResult.success) {
        finalStatus = rollbackResult.operations.some(op => op.success) 
          ? this.ROLLBACK_STATUS.PARTIAL 
          : this.ROLLBACK_STATUS.FAILED;
      }

      // Update rollback status
      await this._updateRollbackStatus(currentUserId, finalStatus, rollbackResult);

      // Create rollback log if requested
      if (rollbackOptions.createRollbackLog) {
        await this._createRollbackLog(currentUserId, rollbackResult);
      }

      return rollbackResult;

    } catch (error) {
      console.error('Rollback execution failed:', error);
      
      if (currentUserId) {
        await this._updateRollbackStatus(currentUserId, this.ROLLBACK_STATUS.FAILED, {
          error: error.message,
          failedAt: new Date().toISOString()
        });
      }
      
      return {
        success: false,
        error: error.message,
        executedAt: new Date().toISOString()
      };
    }
  }

  /**
   * Check if rollback is needed for a user
   * @param {string} userId - Optional user ID (uses current user if not provided)
   * @returns {Promise<Object>} Rollback need assessment
   */
  static async checkRollbackNeeded(userId = null) {
    try {
      const currentUserId = userId || await this._getCurrentUserId();
      
      // Get migration status
      const migrationStatus = await DataNamespacing.getUserData('migration_status', null, currentUserId);
      
      if (!migrationStatus) {
        return {
          needed: false,
          reason: 'No migration status found'
        };
      }

      // Check if migration failed
      if (migrationStatus.status === 'failed') {
        // Check if rollback already completed
        const rollbackStatus = await this._getRollbackStatus(currentUserId);
        if (rollbackStatus && rollbackStatus.status === this.ROLLBACK_STATUS.COMPLETED) {
          return {
            needed: false,
            reason: 'Rollback already completed',
            rollbackCompletedAt: rollbackStatus.completedAt
          };
        }

        return {
          needed: true,
          reason: 'Migration failed, rollback required',
          migrationFailedAt: migrationStatus.failedAt,
          migrationError: migrationStatus.error
        };
      }

      // Check for partial migration that might need cleanup
      if (migrationStatus.status === 'in_progress') {
        const lastUpdate = new Date(migrationStatus.updatedAt);
        const now = new Date();
        const hoursSinceUpdate = (now - lastUpdate) / (1000 * 60 * 60);

        if (hoursSinceUpdate > 1) { // Consider stale after 1 hour
          return {
            needed: true,
            reason: 'Migration appears stalled, rollback recommended',
            lastUpdateAt: migrationStatus.updatedAt
          };
        }
      }

      return {
        needed: false,
        reason: 'Migration status is healthy',
        status: migrationStatus.status
      };

    } catch (error) {
      console.error('Error checking rollback need:', error);
      return {
        needed: false,
        reason: `Check failed: ${error.message}`,
        error: error.message
      };
    }
  }

  /**
   * Get rollback status for a user
   * @param {string} userId - Optional user ID (uses current user if not provided)
   * @returns {Promise<Object|null>} Rollback status or null if not found
   */
  static async getRollbackStatus(userId = null) {
    try {
      const currentUserId = userId || await this._getCurrentUserId();
      return await this._getRollbackStatus(currentUserId);
    } catch (error) {
      console.error('Error getting rollback status:', error);
      return null;
    }
  }

  /**
   * Create a manual rollback point (backup current state)
   * @param {string} userId - Optional user ID (uses current user if not provided)
   * @param {string} reason - Reason for creating rollback point
   * @returns {Promise<Object>} Rollback point creation result
   */
  static async createRollbackPoint(userId = null, reason = 'Manual rollback point') {
    try {
      const currentUserId = userId || await this._getCurrentUserId();
      
      const rollbackPoint = {
        userId: currentUserId,
        createdAt: new Date().toISOString(),
        reason,
        data: {}
      };

      // Backup current AsyncStorage data
      const legacyKeys = [
        'children-profile.json',
        'calendar-tasks.json',
        'activities.json'
      ];

      for (const key of legacyKeys) {
        const data = await AsyncStorage.getItem(key);
        if (data) {
          rollbackPoint.data[key] = data;
        }
      }

      // Store rollback point
      await DataNamespacing.setUserData('rollback_point', rollbackPoint, currentUserId);

      return {
        success: true,
        rollbackPointId: rollbackPoint.createdAt,
        dataSize: Object.keys(rollbackPoint.data).length,
        createdAt: rollbackPoint.createdAt
      };

    } catch (error) {
      console.error('Error creating rollback point:', error);
      return {
        success: false,
        error: error.message,
        createdAt: new Date().toISOString()
      };
    }
  }

  // Private helper methods

  /**
   * Restore AsyncStorage data from backup
   * @private
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Restore result
   */
  static async _restoreAsyncStorageFromBackup(userId) {
    const result = {
      success: true,
      restoredKeys: [],
      errors: []
    };

    try {
      // Get migration backup
      const backup = await DataNamespacing.getUserData('migration_backup', null, userId);
      if (!backup) {
        // Try rollback point as fallback
        const rollbackPoint = await DataNamespacing.getUserData('rollback_point', null, userId);
        if (!rollbackPoint) {
          throw new Error('No backup or rollback point found');
        }
        backup = { data: rollbackPoint.data };
      }

      // Restore each backed up data type
      for (const [key, data] of Object.entries(backup.data)) {
        try {
          if (key.includes('children') || key.includes('calendar') || key.includes('activities')) {
            await AsyncStorage.setItem(key, data);
            result.restoredKeys.push({
              key,
              size: data.length,
              timestamp: new Date().toISOString()
            });
          }
        } catch (error) {
          result.errors.push({
            key,
            error: error.message,
            timestamp: new Date().toISOString()
          });
          result.success = false;
        }
      }

    } catch (error) {
      result.success = false;
      result.errors.push({
        operation: 'backup_retrieval',
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }

    return result;
  }

  /**
   * Clean up partially migrated DynamoDB data
   * @private
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Cleanup result
   */
  static async _cleanupDynamoDBData(userId) {
    const result = {
      success: true,
      cleanedItems: {
        children: 0,
        events: 0
      },
      errors: []
    };

    try {
      // Get migration status to see what was partially migrated
      const migrationStatus = await DataNamespacing.getUserData('migration_status', null, userId);
      
      if (migrationStatus && migrationStatus.migratedItems) {
        // Clean up children if they were migrated
        if (migrationStatus.migratedItems.children && migrationStatus.migratedItems.children.items) {
          for (const item of migrationStatus.migratedItems.children.items) {
            try {
              const deleted = await DynamoDBChildrenService.deleteChild(item.newId);
              if (deleted) {
                result.cleanedItems.children++;
              }
            } catch (error) {
              result.errors.push({
                type: 'child',
                id: item.newId,
                name: item.name,
                error: error.message
              });
            }
          }
        }

        // Clean up events if they were migrated
        if (migrationStatus.migratedItems.calendar_events && migrationStatus.migratedItems.calendar_events.items) {
          for (const item of migrationStatus.migratedItems.calendar_events.items) {
            try {
              const deleted = await DynamoDBCalendarService.deleteEvent(item.newId);
              if (deleted) {
                result.cleanedItems.events++;
              }
            } catch (error) {
              result.errors.push({
                type: 'event',
                id: item.newId,
                title: item.title,
                error: error.message
              });
            }
          }
        }
      }

      result.success = result.errors.length === 0;

    } catch (error) {
      result.success = false;
      result.errors.push({
        operation: 'cleanup_preparation',
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }

    return result;
  }

  /**
   * Verify rollback integrity
   * @private
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Verification result
   */
  static async _verifyRollbackIntegrity(userId) {
    const result = {
      success: true,
      checks: {},
      warnings: []
    };

    try {
      // Check AsyncStorage data integrity
      const asyncStorageCheck = await this._verifyAsyncStorageIntegrity();
      result.checks.asyncStorage = asyncStorageCheck;

      if (!asyncStorageCheck.success) {
        result.warnings.push(...asyncStorageCheck.warnings);
      }

      // Check DynamoDB data is cleaned up
      const dynamoCleanupCheck = await this._verifyDynamoDBCleanup(userId);
      result.checks.dynamoCleanup = dynamoCleanupCheck;

      if (!dynamoCleanupCheck.success) {
        result.warnings.push(...dynamoCleanupCheck.warnings);
      }

      result.success = asyncStorageCheck.success && dynamoCleanupCheck.success;

    } catch (error) {
      result.success = false;
      result.warnings.push({
        check: 'integrity_verification',
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }

    return result;
  }

  /**
   * Verify AsyncStorage data integrity
   * @private
   * @returns {Promise<Object>} Verification result
   */
  static async _verifyAsyncStorageIntegrity() {
    const result = {
      success: true,
      warnings: []
    };

    const keysToCheck = [
      'children-profile.json',
      'calendar-tasks.json',
      'activities.json'
    ];

    for (const key of keysToCheck) {
      try {
        const data = await AsyncStorage.getItem(key);
        if (data) {
          // Try to parse JSON to verify integrity
          JSON.parse(data);
        }
      } catch (error) {
        result.success = false;
        result.warnings.push({
          key,
          error: `Data integrity check failed: ${error.message}`,
          timestamp: new Date().toISOString()
        });
      }
    }

    return result;
  }

  /**
   * Verify DynamoDB cleanup
   * @private
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Verification result
   */
  static async _verifyDynamoDBCleanup(userId) {
    const result = {
      success: true,
      warnings: []
    };

    try {
      // Check if any data remains in DynamoDB
      const children = await DynamoDBChildrenService.getChildren();
      const events = await DynamoDBCalendarService.getEvents();

      if (children.length > 0) {
        result.warnings.push({
          type: 'children',
          message: `${children.length} children records still exist in DynamoDB`,
          timestamp: new Date().toISOString()
        });
      }

      if (events.length > 0) {
        result.warnings.push({
          type: 'events',
          message: `${events.length} event records still exist in DynamoDB`,
          timestamp: new Date().toISOString()
        });
      }

      // Success if no warnings or only minor warnings
      result.success = result.warnings.length === 0;

    } catch (error) {
      result.success = false;
      result.warnings.push({
        check: 'dynamodb_cleanup',
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }

    return result;
  }

  /**
   * Get rollback status
   * @private
   * @param {string} userId - User ID
   * @returns {Promise<Object|null>} Rollback status
   */
  static async _getRollbackStatus(userId) {
    return await DataNamespacing.getUserData('rollback_status', null, userId);
  }

  /**
   * Update rollback status
   * @private
   * @param {string} userId - User ID
   * @param {string} status - Rollback status
   * @param {Object} data - Additional status data
   */
  static async _updateRollbackStatus(userId, status, data = {}) {
    const statusData = {
      status,
      updatedAt: new Date().toISOString(),
      ...data
    };
    await DataNamespacing.setUserData('rollback_status', statusData, userId);
  }

  /**
   * Create rollback log
   * @private
   * @param {string} userId - User ID
   * @param {Object} rollbackResult - Rollback result
   */
  static async _createRollbackLog(userId, rollbackResult) {
    const log = {
      userId,
      rollbackId: rollbackResult.startedAt,
      result: rollbackResult,
      createdAt: new Date().toISOString()
    };

    // Store log with timestamp-based key for history
    const logKey = `rollback_log_${rollbackResult.startedAt.replace(/[:.]/g, '_')}`;
    await DataNamespacing.setUserData(logKey, log, userId);
  }
}

export default MigrationRollbackService;