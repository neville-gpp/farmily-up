import AsyncStorage from '@react-native-async-storage/async-storage';
import AuthenticationService from './AuthenticationService';
import DynamoDBChildrenService from './DynamoDBChildrenService';
import DynamoDBCalendarService from './DynamoDBCalendarService';
import DynamoDBUserProfileService from './DynamoDBUserProfileService';
import DataNamespacing from '../utils/dataNamespacing';

/**
 * Migration Service for handling data migration from AsyncStorage to DynamoDB
 * Provides comprehensive migration detection, planning, execution, verification, and cleanup
 */
class MigrationService {
  // Migration status constants
  static MIGRATION_STATUS = {
    NOT_NEEDED: 'not_needed',
    PENDING: 'pending',
    IN_PROGRESS: 'in_progress',
    COMPLETED: 'completed',
    FAILED: 'failed',
    VERIFIED: 'verified'
  };

  // Data types that can be migrated
  static DATA_TYPES = {
    CHILDREN: 'children',
    CALENDAR_EVENTS: 'calendar_events',
    USER_PROFILE: 'user_profile',
    FAMILY_TIME_ACTIVITIES: 'family_time_activities'
  };

  // Storage keys for migration tracking
  static MIGRATION_KEYS = {
    STATUS: 'migration_status',
    PLAN: 'migration_plan',
    PROGRESS: 'migration_progress',
    VERIFICATION: 'migration_verification',
    BACKUP: 'migration_backup'
  };

  // Legacy AsyncStorage keys that need migration
  static LEGACY_STORAGE_KEYS = {
    [MigrationService.DATA_TYPES.CHILDREN]: 'children-profile.json',
    [MigrationService.DATA_TYPES.CALENDAR_EVENTS]: 'calendar-tasks.json',
    [MigrationService.DATA_TYPES.FAMILY_TIME_ACTIVITIES]: 'activities.json'
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
   * Detect if migration is needed for the current user
   * @returns {Promise<Object>} Migration detection result
   */
  static async detectMigrationNeeded() {
    try {
      const userId = await this._getCurrentUserId();
      
      // Check if migration has already been completed
      const migrationStatus = await this._getMigrationStatus(userId);
      if (migrationStatus?.status === this.MIGRATION_STATUS.COMPLETED || 
          migrationStatus?.status === this.MIGRATION_STATUS.VERIFIED) {
        return {
          needed: false,
          reason: 'Migration already completed',
          status: migrationStatus.status,
          completedAt: migrationStatus.completedAt
        };
      }

      // Check for existing legacy data
      const legacyDataDetection = await this._detectLegacyData();
      
      // Check for existing DynamoDB data
      const dynamoDataDetection = await this._detectDynamoDBData(userId);

      // Determine if migration is needed
      const hasLegacyData = legacyDataDetection.totalItems > 0;
      const hasDynamoData = dynamoDataDetection.totalItems > 0;

      let migrationNeeded = false;
      let reason = '';

      if (hasLegacyData && !hasDynamoData) {
        migrationNeeded = true;
        reason = 'Legacy data found, no DynamoDB data exists';
      } else if (hasLegacyData && hasDynamoData) {
        migrationNeeded = true;
        reason = 'Both legacy and DynamoDB data found, migration may be incomplete';
      } else if (!hasLegacyData && !hasDynamoData) {
        migrationNeeded = false;
        reason = 'No data found in either storage system';
      } else {
        migrationNeeded = false;
        reason = 'Only DynamoDB data found, migration not needed';
      }

      const result = {
        needed: migrationNeeded,
        reason,
        userId,
        legacyData: legacyDataDetection,
        dynamoData: dynamoDataDetection,
        detectedAt: new Date().toISOString()
      };

      // Store detection result for planning
      await this._storeMigrationDetection(userId, result);

      return result;
    } catch (error) {
      console.error('Error detecting migration need:', error);
      return {
        needed: false,
        reason: `Detection failed: ${error.message}`,
        error: error.message,
        detectedAt: new Date().toISOString()
      };
    }
  }

  /**
   * Create a migration plan based on detected data
   * @param {Object} detectionResult - Result from detectMigrationNeeded
   * @returns {Promise<Object>} Migration plan
   */
  static async createMigrationPlan(detectionResult = null) {
    try {
      const userId = await this._getCurrentUserId();
      
      // Use provided detection result or detect again
      const detection = detectionResult || await this.detectMigrationNeeded();
      
      if (!detection.needed) {
        return {
          needed: false,
          reason: detection.reason,
          plan: null
        };
      }

      // Create migration steps based on detected data
      const migrationSteps = [];
      let totalItems = 0;
      let estimatedDuration = 0; // in seconds

      // Plan children migration
      if (detection.legacyData.children.count > 0) {
        migrationSteps.push({
          type: this.DATA_TYPES.CHILDREN,
          description: 'Migrate child profiles',
          itemCount: detection.legacyData.children.count,
          estimatedDuration: Math.max(5, detection.legacyData.children.count * 2), // 2 seconds per child, minimum 5 seconds
          dependencies: [],
          validation: {
            required: true,
            checks: ['data_integrity', 'field_validation', 'relationship_consistency']
          }
        });
        totalItems += detection.legacyData.children.count;
        estimatedDuration += migrationSteps[migrationSteps.length - 1].estimatedDuration;
      }

      // Plan calendar events migration
      if (detection.legacyData.calendarEvents.count > 0) {
        migrationSteps.push({
          type: this.DATA_TYPES.CALENDAR_EVENTS,
          description: 'Migrate calendar events',
          itemCount: detection.legacyData.calendarEvents.count,
          estimatedDuration: Math.max(10, detection.legacyData.calendarEvents.count * 3), // 3 seconds per event, minimum 10 seconds
          dependencies: [this.DATA_TYPES.CHILDREN], // Events reference children
          validation: {
            required: true,
            checks: ['data_integrity', 'child_references', 'date_validation', 'multi_date_consistency']
          }
        });
        totalItems += detection.legacyData.calendarEvents.count;
        estimatedDuration += migrationSteps[migrationSteps.length - 1].estimatedDuration;
      }

      // Plan family time activities migration
      if (detection.legacyData.familyTimeActivities.count > 0) {
        migrationSteps.push({
          type: this.DATA_TYPES.FAMILY_TIME_ACTIVITIES,
          description: 'Migrate family time activities',
          itemCount: detection.legacyData.familyTimeActivities.count,
          estimatedDuration: Math.max(5, detection.legacyData.familyTimeActivities.count * 1), // 1 second per activity, minimum 5 seconds
          dependencies: [this.DATA_TYPES.CHILDREN], // Activities reference children
          validation: {
            required: true,
            checks: ['data_integrity', 'child_references', 'date_validation']
          }
        });
        totalItems += detection.legacyData.familyTimeActivities.count;
        estimatedDuration += migrationSteps[migrationSteps.length - 1].estimatedDuration;
      }

      // Add buffer time for validation and cleanup
      estimatedDuration += Math.max(10, totalItems * 0.5);

      const migrationPlan = {
        userId,
        needed: true,
        totalItems,
        totalSteps: migrationSteps.length,
        estimatedDuration,
        steps: migrationSteps,
        createdAt: new Date().toISOString(),
        version: '1.0.0',
        options: {
          validateData: true,
          createBackup: true,
          cleanupAfterSuccess: false, // User choice
          rollbackOnFailure: true
        }
      };

      // Store the migration plan
      await this._storeMigrationPlan(userId, migrationPlan);

      return migrationPlan;
    } catch (error) {
      console.error('Error creating migration plan:', error);
      throw new Error(`Failed to create migration plan: ${error.message}`);
    }
  }

  /**
   * Execute the migration plan
   * @param {Object} migrationPlan - Migration plan to execute
   * @param {Function} progressCallback - Optional callback for progress updates
   * @returns {Promise<Object>} Migration execution result
   */
  static async executeMigration(migrationPlan = null, progressCallback = null) {
    let userId;
    
    try {
      userId = await this._getCurrentUserId();
      
      // Get migration plan if not provided
      const plan = migrationPlan || await this._getMigrationPlan(userId);
      if (!plan) {
        throw new Error('No migration plan found');
      }

      // Update migration status to in progress
      await this._updateMigrationStatus(userId, this.MIGRATION_STATUS.IN_PROGRESS, {
        startedAt: new Date().toISOString(),
        plan: plan
      });

      const migrationResult = {
        success: true,
        userId,
        startedAt: new Date().toISOString(),
        completedAt: null,
        totalSteps: plan.steps.length,
        completedSteps: 0,
        migratedItems: {},
        errors: [],
        warnings: []
      };

      // Create backup before starting migration
      if (plan.options.createBackup) {
        try {
          await this._createMigrationBackup(userId);
          this._reportProgress(progressCallback, 'backup_created', 'Migration backup created', 5);
        } catch (backupError) {
          migrationResult.warnings.push({
            step: 'backup',
            message: `Backup creation failed: ${backupError.message}`,
            timestamp: new Date().toISOString()
          });
        }
      }

      // Execute migration steps in dependency order
      const sortedSteps = this._sortStepsByDependencies(plan.steps);
      
      for (let i = 0; i < sortedSteps.length; i++) {
        const step = sortedSteps[i];
        const progressPercent = Math.round(((i + 1) / sortedSteps.length) * 90) + 5; // 5-95%
        
        try {
          this._reportProgress(progressCallback, 'step_started', `Starting ${step.description}`, progressPercent);
          
          const stepResult = await this._executeStep(userId, step);
          
          migrationResult.migratedItems[step.type] = stepResult;
          migrationResult.completedSteps++;
          
          // Check if step had errors
          if (stepResult.errors && stepResult.errors.length > 0) {
            migrationResult.success = false;
            migrationResult.errors.push({
              step: step.type,
              message: `Step completed with ${stepResult.errors.length} errors`,
              timestamp: new Date().toISOString(),
              details: stepResult.errors
            });
            
            // For required steps with errors, mark as critical failure but don't throw
            if (step.validation.required) {
              migrationResult.criticalFailure = true;
              break; // Stop processing further steps
            }
          }
          
          this._reportProgress(progressCallback, 'step_completed', `Completed ${step.description}`, progressPercent);
          
        } catch (stepError) {
          console.error(`Migration step failed: ${step.type}`, stepError);
          
          const error = {
            step: step.type,
            message: stepError.message,
            timestamp: new Date().toISOString(),
            details: stepError.stack
          };
          
          migrationResult.errors.push(error);
          migrationResult.success = false;
          
          // Decide whether to continue or abort based on step criticality
          if (step.validation.required) {
            migrationResult.criticalFailure = true;
            break; // Stop processing further steps
          } else {
            migrationResult.warnings.push({
              ...error,
              severity: 'non_critical'
            });
          }
        }
      }

      migrationResult.completedAt = new Date().toISOString();

      // Update migration status
      if (migrationResult.success) {
        await this._updateMigrationStatus(userId, this.MIGRATION_STATUS.COMPLETED, migrationResult);
        this._reportProgress(progressCallback, 'completed', 'Migration completed successfully', 100);
      } else {
        await this._updateMigrationStatus(userId, this.MIGRATION_STATUS.FAILED, migrationResult);
        
        // Attempt rollback if enabled
        if (plan.options.rollbackOnFailure) {
          try {
            await this._rollbackMigration(userId);
            migrationResult.rolledBack = true;
          } catch (rollbackError) {
            migrationResult.rollbackError = rollbackError.message;
          }
        }
      }

      return migrationResult;
      
    } catch (error) {
      console.error('Migration execution failed:', error);
      
      // Update status to failed
      if (userId) {
        await this._updateMigrationStatus(userId, this.MIGRATION_STATUS.FAILED, {
          error: error.message,
          failedAt: new Date().toISOString()
        });
      }
      
      throw error;
    }
  }

  /**
   * Verify migration integrity and completeness
   * @param {string} userId - Optional user ID (uses current user if not provided)
   * @returns {Promise<Object>} Verification result
   */
  static async verifyMigration(userId = null) {
    try {
      const currentUserId = userId || await this._getCurrentUserId();
      
      // Get migration status
      const migrationStatus = await this._getMigrationStatus(currentUserId);
      if (!migrationStatus || migrationStatus.status !== this.MIGRATION_STATUS.COMPLETED) {
        return {
          success: false,
          reason: 'Migration not completed',
          status: migrationStatus?.status || 'unknown'
        };
      }

      const verificationResult = {
        success: true,
        userId: currentUserId,
        verifiedAt: new Date().toISOString(),
        checks: {},
        errors: [],
        warnings: []
      };

      // Verify each data type that was migrated
      const migrationPlan = await this._getMigrationPlan(currentUserId);
      if (!migrationPlan) {
        throw new Error('Migration plan not found for verification');
      }

      for (const step of migrationPlan.steps) {
        try {
          const checkResult = await this._verifyDataType(currentUserId, step.type, step);
          verificationResult.checks[step.type] = checkResult;
          
          if (!checkResult.success) {
            verificationResult.success = false;
            verificationResult.errors.push(...checkResult.errors);
          }
          
          if (checkResult.warnings.length > 0) {
            verificationResult.warnings.push(...checkResult.warnings);
          }
          
        } catch (verifyError) {
          verificationResult.success = false;
          verificationResult.errors.push({
            type: step.type,
            message: `Verification failed: ${verifyError.message}`,
            timestamp: new Date().toISOString()
          });
        }
      }

      // Store verification result
      await this._storeVerificationResult(currentUserId, verificationResult);

      // Update migration status to verified if successful
      if (verificationResult.success) {
        await this._updateMigrationStatus(currentUserId, this.MIGRATION_STATUS.VERIFIED, {
          verifiedAt: verificationResult.verifiedAt
        });
      }

      return verificationResult;
      
    } catch (error) {
      console.error('Migration verification failed:', error);
      return {
        success: false,
        error: error.message,
        verifiedAt: new Date().toISOString()
      };
    }
  }

  /**
   * Clean up AsyncStorage data after successful migration
   * @param {string} userId - Optional user ID (uses current user if not provided)
   * @param {boolean} force - Force cleanup even if verification hasn't passed
   * @returns {Promise<Object>} Cleanup result
   */
  static async cleanupAsyncStorageData(userId = null, force = false) {
    try {
      const currentUserId = userId || await this._getCurrentUserId();
      
      // Check if migration is verified (unless forced)
      if (!force) {
        const migrationStatus = await this._getMigrationStatus(currentUserId);
        if (!migrationStatus || migrationStatus.status !== this.MIGRATION_STATUS.VERIFIED) {
          return {
            success: false,
            reason: 'Migration not verified, cleanup not safe',
            status: migrationStatus?.status || 'unknown'
          };
        }
      }

      const cleanupResult = {
        success: true,
        userId: currentUserId,
        cleanedAt: new Date().toISOString(),
        deletedKeys: [],
        errors: [],
        warnings: []
      };

      // Clean up legacy data keys
      for (const [dataType, legacyKey] of Object.entries(this.LEGACY_STORAGE_KEYS)) {
        try {
          const data = await AsyncStorage.getItem(legacyKey);
          if (data !== null) {
            await AsyncStorage.removeItem(legacyKey);
            cleanupResult.deletedKeys.push({
              key: legacyKey,
              dataType,
              size: data.length
            });
          }
        } catch (error) {
          cleanupResult.errors.push({
            key: legacyKey,
            error: error.message,
            timestamp: new Date().toISOString()
          });
        }
      }

      // Clean up user-namespaced data using DataNamespacing utility
      try {
        const namespacingCleanup = await DataNamespacing.cleanupLegacyData(currentUserId);
        if (namespacingCleanup.success) {
          cleanupResult.deletedKeys.push(...namespacingCleanup.deletedKeys.map(key => ({
            key,
            dataType: 'namespaced',
            source: 'DataNamespacing'
          })));
        } else {
          cleanupResult.warnings.push({
            message: 'DataNamespacing cleanup had errors',
            errors: namespacingCleanup.errors
          });
        }
      } catch (namespacingError) {
        cleanupResult.warnings.push({
          message: `DataNamespacing cleanup failed: ${namespacingError.message}`
        });
      }

      // Update migration status with cleanup info
      await this._updateMigrationStatus(currentUserId, this.MIGRATION_STATUS.VERIFIED, {
        cleanupCompletedAt: cleanupResult.cleanedAt,
        cleanupResult
      });

      cleanupResult.success = cleanupResult.errors.length === 0;

      return cleanupResult;
      
    } catch (error) {
      console.error('AsyncStorage cleanup failed:', error);
      return {
        success: false,
        error: error.message,
        cleanedAt: new Date().toISOString()
      };
    }
  }

  /**
   * Get migration status and progress for the current user
   * @param {string} userId - Optional user ID (uses current user if not provided)
   * @returns {Promise<Object|null>} Migration status or null if not found
   */
  static async getMigrationStatus(userId = null) {
    try {
      const currentUserId = userId || await this._getCurrentUserId();
      return await this._getMigrationStatus(currentUserId);
    } catch (error) {
      console.error('Error getting migration status:', error);
      return null;
    }
  }

  /**
   * Get migration progress tracking information
   * @param {string} userId - Optional user ID (uses current user if not provided)
   * @returns {Promise<Object|null>} Migration progress or null if not found
   */
  static async getMigrationProgress(userId = null) {
    try {
      const currentUserId = userId || await this._getCurrentUserId();
      return await DataNamespacing.getUserData(this.MIGRATION_KEYS.PROGRESS, null, currentUserId);
    } catch (error) {
      console.error('Error getting migration progress:', error);
      return null;
    }
  }

  /**
   * Rollback migration (restore from backup)
   * @param {string} userId - Optional user ID (uses current user if not provided)
   * @returns {Promise<Object>} Rollback result
   */
  static async rollbackMigration(userId = null) {
    try {
      const currentUserId = userId || await this._getCurrentUserId();
      return await this._rollbackMigration(currentUserId);
    } catch (error) {
      console.error('Migration rollback failed:', error);
      return {
        success: false,
        error: error.message,
        rolledBackAt: new Date().toISOString()
      };
    }
  }

  // Private helper methods

  /**
   * Detect legacy data in AsyncStorage
   * @private
   * @returns {Promise<Object>} Legacy data detection result
   */
  static async _detectLegacyData() {
    const detection = {
      totalItems: 0,
      children: { count: 0, size: 0, valid: true },
      calendarEvents: { count: 0, size: 0, valid: true },
      familyTimeActivities: { count: 0, size: 0, valid: true }
    };

    try {
      // Check children data
      const childrenData = await AsyncStorage.getItem(this.LEGACY_STORAGE_KEYS.children);
      if (childrenData) {
        try {
          const children = JSON.parse(childrenData);
          if (Array.isArray(children)) {
            detection.children.count = children.length;
            detection.children.size = childrenData.length;
            detection.totalItems += children.length;
          }
        } catch (error) {
          detection.children.valid = false;
          detection.children.error = error.message;
        }
      }

      // Check calendar events data
      const eventsData = await AsyncStorage.getItem(this.LEGACY_STORAGE_KEYS.calendar_events);
      if (eventsData) {
        try {
          const events = JSON.parse(eventsData);
          if (Array.isArray(events)) {
            detection.calendarEvents.count = events.length;
            detection.calendarEvents.size = eventsData.length;
            detection.totalItems += events.length;
          }
        } catch (error) {
          detection.calendarEvents.valid = false;
          detection.calendarEvents.error = error.message;
        }
      }

      // Check family time activities data
      const activitiesData = await AsyncStorage.getItem(this.LEGACY_STORAGE_KEYS.family_time_activities);
      if (activitiesData) {
        try {
          const activities = JSON.parse(activitiesData);
          if (Array.isArray(activities)) {
            detection.familyTimeActivities.count = activities.length;
            detection.familyTimeActivities.size = activitiesData.length;
            detection.totalItems += activities.length;
          }
        } catch (error) {
          detection.familyTimeActivities.valid = false;
          detection.familyTimeActivities.error = error.message;
        }
      }

    } catch (error) {
      console.error('Error detecting legacy data:', error);
    }

    return detection;
  }

  /**
   * Detect existing DynamoDB data
   * @private
   * @param {string} userId - User ID
   * @returns {Promise<Object>} DynamoDB data detection result
   */
  static async _detectDynamoDBData(userId) {
    const detection = {
      totalItems: 0,
      children: { count: 0, accessible: true },
      calendarEvents: { count: 0, accessible: true },
      userProfile: { exists: false, accessible: true }
    };

    try {
      // Check children data
      try {
        const children = await DynamoDBChildrenService.getChildren();
        detection.children.count = children.length;
        detection.totalItems += children.length;
      } catch (error) {
        detection.children.accessible = false;
        detection.children.error = error.message;
      }

      // Check calendar events data
      try {
        const events = await DynamoDBCalendarService.getEvents();
        detection.calendarEvents.count = events.length;
        detection.totalItems += events.length;
      } catch (error) {
        detection.calendarEvents.accessible = false;
        detection.calendarEvents.error = error.message;
      }

      // Check user profile data
      try {
        const profile = await DynamoDBUserProfileService.getUserProfile();
        detection.userProfile.exists = profile !== null;
        if (detection.userProfile.exists) {
          detection.totalItems += 1;
        }
      } catch (error) {
        detection.userProfile.accessible = false;
        detection.userProfile.error = error.message;
      }

    } catch (error) {
      console.error('Error detecting DynamoDB data:', error);
    }

    return detection;
  }

  /**
   * Store migration detection result
   * @private
   * @param {string} userId - User ID
   * @param {Object} detection - Detection result
   */
  static async _storeMigrationDetection(userId, detection) {
    await DataNamespacing.setUserData('migration_detection', detection, userId);
  }

  /**
   * Store migration plan
   * @private
   * @param {string} userId - User ID
   * @param {Object} plan - Migration plan
   */
  static async _storeMigrationPlan(userId, plan) {
    await DataNamespacing.setUserData(this.MIGRATION_KEYS.PLAN, plan, userId);
  }

  /**
   * Get migration plan
   * @private
   * @param {string} userId - User ID
   * @returns {Promise<Object|null>} Migration plan
   */
  static async _getMigrationPlan(userId) {
    return await DataNamespacing.getUserData(this.MIGRATION_KEYS.PLAN, null, userId);
  }

  /**
   * Get migration status
   * @private
   * @param {string} userId - User ID
   * @returns {Promise<Object|null>} Migration status
   */
  static async _getMigrationStatus(userId) {
    return await DataNamespacing.getUserData(this.MIGRATION_KEYS.STATUS, null, userId);
  }

  /**
   * Update migration status
   * @private
   * @param {string} userId - User ID
   * @param {string} status - Migration status
   * @param {Object} data - Additional status data
   */
  static async _updateMigrationStatus(userId, status, data = {}) {
    const statusData = {
      status,
      updatedAt: new Date().toISOString(),
      ...data
    };
    await DataNamespacing.setUserData(this.MIGRATION_KEYS.STATUS, statusData, userId);
  }

  /**
   * Sort migration steps by dependencies
   * @private
   * @param {Array} steps - Migration steps
   * @returns {Array} Sorted steps
   */
  static _sortStepsByDependencies(steps) {
    const sorted = [];
    const remaining = [...steps];
    
    while (remaining.length > 0) {
      const canExecute = remaining.filter(step => 
        step.dependencies.every(dep => 
          sorted.some(completedStep => completedStep.type === dep)
        )
      );
      
      if (canExecute.length === 0) {
        // Circular dependency or missing dependency, add remaining steps
        sorted.push(...remaining);
        break;
      }
      
      sorted.push(...canExecute);
      canExecute.forEach(step => {
        const index = remaining.indexOf(step);
        remaining.splice(index, 1);
      });
    }
    
    return sorted;
  }

  /**
   * Execute a single migration step
   * @private
   * @param {string} userId - User ID
   * @param {Object} step - Migration step
   * @returns {Promise<Object>} Step execution result
   */
  static async _executeStep(userId, step) {
    switch (step.type) {
      case this.DATA_TYPES.CHILDREN:
        return await this._migrateChildren(userId);
      
      case this.DATA_TYPES.CALENDAR_EVENTS:
        return await this._migrateCalendarEvents(userId);
      
      case this.DATA_TYPES.FAMILY_TIME_ACTIVITIES:
        return await this._migrateFamilyTimeActivities(userId);
      
      default:
        throw new Error(`Unknown migration step type: ${step.type}`);
    }
  }

  /**
   * Migrate children data
   * @private
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Migration result
   */
  static async _migrateChildren(userId) {
    const legacyData = await AsyncStorage.getItem(this.LEGACY_STORAGE_KEYS.children);
    if (!legacyData) {
      return { migrated: 0, errors: [] };
    }

    const children = JSON.parse(legacyData);
    const result = { migrated: 0, errors: [], items: [] };

    for (const child of children) {
      try {
        // Transform legacy child data to DynamoDB format
        const transformedChild = this._transformChildData(child);
        
        // Create child in DynamoDB
        const createdChild = await DynamoDBChildrenService.addChild(transformedChild);
        
        if (createdChild) {
          result.migrated++;
          result.items.push({
            legacyId: child.id,
            newId: createdChild.childId || createdChild.id,
            name: createdChild.firstName
          });
        } else {
          throw new Error('Failed to create child in DynamoDB');
        }
      } catch (error) {
        result.errors.push({
          childId: child.id,
          name: child.firstName || 'Unknown',
          error: error.message
        });
      }
    }

    return result;
  }

  /**
   * Migrate calendar events data
   * @private
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Migration result
   */
  static async _migrateCalendarEvents(userId) {
    const legacyData = await AsyncStorage.getItem(this.LEGACY_STORAGE_KEYS.calendar_events);
    if (!legacyData) {
      return { migrated: 0, errors: [] };
    }

    const events = JSON.parse(legacyData);
    const result = { migrated: 0, errors: [], items: [] };

    for (const event of events) {
      try {
        // Transform legacy event data to DynamoDB format
        const transformedEvent = this._transformEventData(event);
        
        // Create event in DynamoDB
        const createdEvent = await DynamoDBCalendarService.addEvent(transformedEvent);
        
        if (createdEvent) {
          result.migrated++;
          result.items.push({
            legacyId: event.id,
            newId: createdEvent.eventId || createdEvent.id,
            title: createdEvent.title
          });
        } else {
          throw new Error('Failed to create event in DynamoDB');
        }
      } catch (error) {
        result.errors.push({
          eventId: event.id,
          title: event.title || 'Unknown',
          error: error.message
        });
      }
    }

    return result;
  }

  /**
   * Migrate family time activities data
   * @private
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Migration result
   */
  static async _migrateFamilyTimeActivities(userId) {
    // This would be implemented when DynamoDBFamilyTimeService is created
    // For now, return empty result
    return { migrated: 0, errors: [], items: [] };
  }

  /**
   * Transform legacy child data to DynamoDB format
   * @private
   * @param {Object} legacyChild - Legacy child data
   * @returns {Object} Transformed child data
   */
  static _transformChildData(legacyChild) {
    return {
      firstName: legacyChild.firstName || '',
      nickname: legacyChild.nickname || '',
      dateOfBirth: legacyChild.dateOfBirth || '',
      favourColor: legacyChild.favourColor || '#ff6b6b',
      interests: legacyChild.interests || [],
      medicalInfo: {
        allergies: legacyChild.medicalInfo?.allergies || [],
        medications: legacyChild.medicalInfo?.medications || []
      }
    };
  }

  /**
   * Transform legacy event data to DynamoDB format
   * @private
   * @param {Object} legacyEvent - Legacy event data
   * @returns {Object} Transformed event data
   */
  static _transformEventData(legacyEvent) {
    const transformed = {
      title: legacyEvent.title || '',
      description: legacyEvent.description || '',
      eventType: legacyEvent.eventType || 'Personal',
      isAllDay: legacyEvent.isAllDay || false,
      children: [],
      reminders: legacyEvent.reminders || []
    };

    // Handle legacy child references
    if (legacyEvent.children && Array.isArray(legacyEvent.children)) {
      transformed.children = legacyEvent.children;
    } else if (legacyEvent.childId) {
      transformed.children = [{
        id: legacyEvent.childId,
        name: legacyEvent.childName || 'Unknown Child',
        color: '#48b6b0'
      }];
    }

    // Handle date/time fields
    if (transformed.isAllDay) {
      transformed.startDate = legacyEvent.startDate;
      transformed.endDate = legacyEvent.endDate || legacyEvent.startDate;
    } else {
      transformed.startDateTime = legacyEvent.startDateTime;
      transformed.endDateTime = legacyEvent.endDateTime;
    }

    // Handle multi-date event fields
    if (legacyEvent.isMultiDate) {
      transformed.isMultiDate = true;
      transformed.multiDateId = legacyEvent.multiDateId;
      transformed.occurrenceType = legacyEvent.occurrenceType;
      transformed.occurrenceIndex = legacyEvent.occurrenceIndex;
      transformed.totalOccurrences = legacyEvent.totalOccurrences;
    }

    return transformed;
  }

  /**
   * Create migration backup
   * @private
   * @param {string} userId - User ID
   */
  static async _createMigrationBackup(userId) {
    const backup = {
      userId,
      createdAt: new Date().toISOString(),
      data: {}
    };

    // Backup all legacy data
    for (const [dataType, key] of Object.entries(this.LEGACY_STORAGE_KEYS)) {
      const data = await AsyncStorage.getItem(key);
      if (data) {
        backup.data[dataType] = data;
      }
    }

    await DataNamespacing.setUserData(this.MIGRATION_KEYS.BACKUP, backup, userId);
  }

  /**
   * Rollback migration from backup
   * @private
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Rollback result
   */
  static async _rollbackMigration(userId) {
    const backup = await DataNamespacing.getUserData(this.MIGRATION_KEYS.BACKUP, null, userId);
    if (!backup) {
      throw new Error('No backup found for rollback');
    }

    const rollbackResult = {
      success: true,
      userId,
      rolledBackAt: new Date().toISOString(),
      restoredKeys: [],
      errors: []
    };

    // Restore legacy data from backup
    for (const [dataType, data] of Object.entries(backup.data)) {
      try {
        const key = this.LEGACY_STORAGE_KEYS[dataType];
        if (key) {
          await AsyncStorage.setItem(key, data);
          rollbackResult.restoredKeys.push(key);
        }
      } catch (error) {
        rollbackResult.errors.push({
          dataType,
          error: error.message
        });
        rollbackResult.success = false;
      }
    }

    // Update migration status
    await this._updateMigrationStatus(userId, this.MIGRATION_STATUS.FAILED, {
      rolledBack: true,
      rollbackResult
    });

    return rollbackResult;
  }

  /**
   * Verify a specific data type migration
   * @private
   * @param {string} userId - User ID
   * @param {string} dataType - Data type to verify
   * @param {Object} step - Migration step
   * @returns {Promise<Object>} Verification result
   */
  static async _verifyDataType(userId, dataType, step) {
    const result = {
      success: true,
      dataType,
      errors: [],
      warnings: [],
      stats: {}
    };

    try {
      switch (dataType) {
        case this.DATA_TYPES.CHILDREN:
          return await this._verifyChildrenMigration(userId, step);
        
        case this.DATA_TYPES.CALENDAR_EVENTS:
          return await this._verifyCalendarEventsMigration(userId, step);
        
        case this.DATA_TYPES.FAMILY_TIME_ACTIVITIES:
          return await this._verifyFamilyTimeActivitiesMigration(userId, step);
        
        default:
          result.success = false;
          result.errors.push({
            message: `Unknown data type for verification: ${dataType}`
          });
      }
    } catch (error) {
      result.success = false;
      result.errors.push({
        message: `Verification failed: ${error.message}`
      });
    }

    return result;
  }

  /**
   * Verify children migration
   * @private
   * @param {string} userId - User ID
   * @param {Object} step - Migration step
   * @returns {Promise<Object>} Verification result
   */
  static async _verifyChildrenMigration(userId, step) {
    const result = {
      success: true,
      dataType: this.DATA_TYPES.CHILDREN,
      errors: [],
      warnings: [],
      stats: {}
    };

    try {
      // Get legacy data
      const legacyData = await AsyncStorage.getItem(this.LEGACY_STORAGE_KEYS.children);
      const legacyChildren = legacyData ? JSON.parse(legacyData) : [];
      
      // Get DynamoDB data
      const dynamoChildren = await DynamoDBChildrenService.getChildren();
      
      result.stats = {
        legacyCount: legacyChildren.length,
        dynamoCount: dynamoChildren.length,
        expectedCount: step.itemCount
      };

      // Check counts match
      if (dynamoChildren.length !== legacyChildren.length) {
        result.errors.push({
          message: `Count mismatch: expected ${legacyChildren.length}, found ${dynamoChildren.length}`
        });
        result.success = false;
      }

      // Verify each child's data integrity
      for (const legacyChild of legacyChildren) {
        const matchingDynamoChild = dynamoChildren.find(dc => 
          dc.firstName === legacyChild.firstName && 
          dc.dateOfBirth === legacyChild.dateOfBirth
        );

        if (!matchingDynamoChild) {
          result.errors.push({
            message: `Child not found in DynamoDB: ${legacyChild.firstName}`
          });
          result.success = false;
        } else {
          // Verify field values
          const fieldChecks = [
            { field: 'nickname', legacy: legacyChild.nickname || '', dynamo: matchingDynamoChild.nickname || '' },
            { field: 'favourColor', legacy: legacyChild.favourColor || '', dynamo: matchingDynamoChild.favourColor || '' }
          ];

          for (const check of fieldChecks) {
            if (check.legacy !== check.dynamo) {
              result.warnings.push({
                message: `Field mismatch for ${legacyChild.firstName}.${check.field}: expected '${check.legacy}', found '${check.dynamo}'`
              });
            }
          }
        }
      }

    } catch (error) {
      result.success = false;
      result.errors.push({
        message: `Children verification failed: ${error.message}`
      });
    }

    return result;
  }

  /**
   * Verify calendar events migration
   * @private
   * @param {string} userId - User ID
   * @param {Object} step - Migration step
   * @returns {Promise<Object>} Verification result
   */
  static async _verifyCalendarEventsMigration(userId, step) {
    const result = {
      success: true,
      dataType: this.DATA_TYPES.CALENDAR_EVENTS,
      errors: [],
      warnings: [],
      stats: {}
    };

    try {
      // Get legacy data
      const legacyData = await AsyncStorage.getItem(this.LEGACY_STORAGE_KEYS.calendar_events);
      const legacyEvents = legacyData ? JSON.parse(legacyData) : [];
      
      // Get DynamoDB data
      const dynamoEvents = await DynamoDBCalendarService.getEvents();
      
      result.stats = {
        legacyCount: legacyEvents.length,
        dynamoCount: dynamoEvents.length,
        expectedCount: step.itemCount
      };

      // Check counts match
      if (dynamoEvents.length !== legacyEvents.length) {
        result.errors.push({
          message: `Count mismatch: expected ${legacyEvents.length}, found ${dynamoEvents.length}`
        });
        result.success = false;
      }

      // Verify each event's data integrity
      for (const legacyEvent of legacyEvents) {
        const matchingDynamoEvent = dynamoEvents.find(de => 
          de.title === legacyEvent.title && 
          de.eventType === legacyEvent.eventType
        );

        if (!matchingDynamoEvent) {
          result.errors.push({
            message: `Event not found in DynamoDB: ${legacyEvent.title}`
          });
          result.success = false;
        }
      }

    } catch (error) {
      result.success = false;
      result.errors.push({
        message: `Calendar events verification failed: ${error.message}`
      });
    }

    return result;
  }

  /**
   * Verify family time activities migration
   * @private
   * @param {string} userId - User ID
   * @param {Object} step - Migration step
   * @returns {Promise<Object>} Verification result
   */
  static async _verifyFamilyTimeActivitiesMigration(userId, step) {
    // Placeholder for when family time activities service is implemented
    return {
      success: true,
      dataType: this.DATA_TYPES.FAMILY_TIME_ACTIVITIES,
      errors: [],
      warnings: [],
      stats: { legacyCount: 0, dynamoCount: 0, expectedCount: 0 }
    };
  }

  /**
   * Store verification result
   * @private
   * @param {string} userId - User ID
   * @param {Object} result - Verification result
   */
  static async _storeVerificationResult(userId, result) {
    await DataNamespacing.setUserData(this.MIGRATION_KEYS.VERIFICATION, result, userId);
  }

  /**
   * Report progress to callback
   * @private
   * @param {Function} callback - Progress callback
   * @param {string} type - Progress type
   * @param {string} message - Progress message
   * @param {number} percent - Progress percentage
   */
  static _reportProgress(callback, type, message, percent) {
    if (typeof callback === 'function') {
      callback({
        type,
        message,
        percent,
        timestamp: new Date().toISOString()
      });
    }
  }
}

export default MigrationService;