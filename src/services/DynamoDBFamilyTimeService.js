import { DynamoDBService } from './DynamoDBService';
import AuthenticationStateManager from './AuthenticationStateManager';
import AuthenticationError from './AuthenticationError';
import DataEncryptionService from './DataEncryptionService';
import DataValidationService from './DataValidationService';
import ProactiveTokenRefreshService from './ProactiveTokenRefreshService';
import { DYNAMODB_TABLES } from '../config/aws-config.js';

/**
 * DynamoDB-enabled Family Time Activities Service
 * Provides CRUD operations for family time activities using DynamoDB as the backend
 * Maintains compatibility with the existing FamilyTimeService interface
 */
class DynamoDBFamilyTimeService {
  static TABLE_NAME = DYNAMODB_TABLES.FAMILY_TIME_ACTIVITIES;
  
  // Valid activity types
  static VALID_ACTIVITY_TYPES = ['Reading Time', 'Sports', 'Adventure', 'Important'];
  
  // Valid feelings
  static VALID_FEELINGS = ['Exciting', 'Happy', 'Sad'];
  
  // Required fields for activity validation
  static REQUIRED_FIELDS = ['type', 'title', 'startTime', 'endTime', 'participants'];

  /**
   * Get current authenticated user ID using centralized authentication management
   * @private
   * @returns {Promise<string>} User ID
   * @throws {AuthenticationError} If user is not authenticated
   */
  static async _getCurrentUserId() {
    try {
      const userId = await AuthenticationStateManager.getCurrentUserId();
      return userId;
    } catch (error) {
      console.error('[DynamoDBFamilyTimeService] Authentication failed:', {
        operation: '_getCurrentUserId',
        service: 'DynamoDBFamilyTimeService',
        error: error.message,
        code: error.code || 'UNKNOWN',
        recoverable: error.recoverable !== undefined ? error.recoverable : true,
        context: error.context || {}
      });

      // If it's already an AuthenticationError, re-throw with updated context
      if (error instanceof AuthenticationError) {
        if (error.context) {
          error.context.service = 'DynamoDBFamilyTimeService';
          error.context.operation = '_getCurrentUserId';
        }
        throw error;
      }

      // Convert other errors to AuthenticationError for consistent handling
      const authError = AuthenticationError.fromError(error, {
        operation: '_getCurrentUserId',
        service: 'DynamoDBFamilyTimeService'
      });
      
      throw authError;
    }
  }



  /**
   * Validate activity data before saving
   * @private
   * @param {Object} activityData - Activity data to validate
   * @throws {Error} If validation fails
   */
  static _validateActivityData(activityData) {
    const errors = [];

    // Required fields validation
    if (!activityData.type || !this.VALID_ACTIVITY_TYPES.includes(activityData.type)) {
      errors.push(`Activity type must be one of: ${this.VALID_ACTIVITY_TYPES.join(', ')}`);
    }

    if (!activityData.title || typeof activityData.title !== 'string' || activityData.title.trim().length === 0) {
      errors.push('Activity title is required and must be a non-empty string');
    }

    if (!activityData.startTime || !activityData.endTime) {
      errors.push('Start time and end time are required');
    }

    // Validate time order
    if (activityData.startTime && activityData.endTime) {
      const startTime = new Date(activityData.startTime);
      const endTime = new Date(activityData.endTime);
      
      if (isNaN(startTime.getTime()) || isNaN(endTime.getTime())) {
        errors.push('Start time and end time must be valid dates');
      } else if (startTime >= endTime) {
        errors.push('Start time must be before end time');
      }
    }

    // Validate participants
    if (!activityData.participants || !Array.isArray(activityData.participants) || activityData.participants.length === 0) {
      errors.push('At least one participant is required');
    } else {
      activityData.participants.forEach((participant, index) => {
        if (!participant.childId || typeof participant.childId !== 'string') {
          errors.push(`Participant ${index + 1}: childId is required and must be a string`);
        }
        if (!participant.childName || typeof participant.childName !== 'string') {
          errors.push(`Participant ${index + 1}: childName is required and must be a string`);
        }
        if (!participant.feeling || !this.VALID_FEELINGS.includes(participant.feeling)) {
          errors.push(`Participant ${index + 1}: feeling must be one of: ${this.VALID_FEELINGS.join(', ')}`);
        }
      });
    }

    // Validate optional fields
    if (activityData.location && typeof activityData.location !== 'string') {
      errors.push('Location must be a string');
    }

    if (activityData.remarks && typeof activityData.remarks !== 'string') {
      errors.push('Remarks must be a string');
    }

    if (activityData.photos && !Array.isArray(activityData.photos)) {
      errors.push('Photos must be an array');
    }

    // Validate book info for Reading Time activities
    if (activityData.type === 'Reading Time' && activityData.bookInfo) {
      if (!activityData.bookInfo.title || typeof activityData.bookInfo.title !== 'string') {
        errors.push('Book title is required for Reading Time activities');
      }
      if (!activityData.bookInfo.author || typeof activityData.bookInfo.author !== 'string') {
        errors.push('Book author is required for Reading Time activities');
      }
      if (typeof activityData.bookInfo.detectedByAI !== 'boolean') {
        errors.push('Book detectedByAI flag must be a boolean');
      }
    }

    // Check for dangerous patterns
    DataValidationService.validateNoDangerousPatterns(activityData);

    if (errors.length > 0) {
      const validationError = new Error(`Validation failed: ${errors.join(', ')}`);
      validationError.name = 'ValidationError';
      throw validationError;
    }

    return activityData;
  }

  /**
   * Prepare activity data for storage
   * @private
   * @param {Object} activityData - Raw activity data
   * @returns {Promise<Object>} Prepared activity data
   */
  static async _prepareActivityData(activityData) {
    // Validate and sanitize the data
    const validatedData = this._validateActivityData(activityData);
    
    // Apply safe defaults
    const preparedData = {
      ...validatedData,
      location: (validatedData.location || '').trim(),
      remarks: (validatedData.remarks || '').trim(),
      photos: Array.isArray(validatedData.photos) ? validatedData.photos : [],
    };
    
    // Encrypt sensitive fields before storage
    const encryptedData = await DataEncryptionService.encryptSensitiveFields(preparedData);
    
    return encryptedData;
  }

  /**
   * Get all activities for the current user
   * @returns {Promise<Array>} Array of activity objects
   */
  static async getActivities() {
    // Use proactive token refresh for this critical operation
    return await ProactiveTokenRefreshService.executeWithTokenValidation(
      async () => {
        const userId = await this._getCurrentUserId();
        
        const result = await DynamoDBService.queryItems(
          this.TABLE_NAME,
          'userId = :userId',
          {
            ExpressionAttributeValues: {
              ':userId': userId
            },
            ScanIndexForward: false // Sort by activityId descending (newest first)
          }
        );
        
        const activities = result.items || [];
        
        // Decrypt sensitive fields before returning
        const decryptedActivities = await DataEncryptionService.decryptFromStorage(activities);
        
        return decryptedActivities;
      },
      {
        operationId: `getActivities_${Date.now()}`,
        estimatedDuration: 3000, // 3 seconds estimated duration
        retryOnFailure: true
      }
    ).catch(error => {
      console.error('[DynamoDBFamilyTimeService] Error in getActivities:', {
        operation: 'getActivities',
        service: 'DynamoDBFamilyTimeService',
        error: error.message,
        code: error.code || 'UNKNOWN',
        recoverable: error.recoverable !== undefined ? error.recoverable : true,
        context: error.context || {},
        sanitizedError: DataEncryptionService.sanitizeForLogging(error)
      });
      
      // For non-authentication errors, log and return empty array
      console.error('[DynamoDBFamilyTimeService] Non-authentication error, returning empty array');
      return [];
    });
  }

  /**
   * Save activities array to storage (for backward compatibility)
   * @param {Array} activities - Array of activity objects
   * @returns {Promise<boolean>} Success status
   */
  static async saveActivities(activities) {
    try {
      if (!Array.isArray(activities)) {
        throw new Error('Activities must be an array');
      }
      
      const userId = await this._getCurrentUserId();
      
      // Get existing activities to determine which ones to delete
      const existingActivities = await this.getActivities();
      const existingActivityIds = existingActivities.map(activity => activity.id || activity.activityId);
      const newActivityIds = activities.map(activity => activity.id || activity.activityId).filter(Boolean);
      
      // Find activities to delete (exist in DB but not in new array)
      const activitiesToDelete = existingActivityIds.filter(id => !newActivityIds.includes(id));
      
      // Delete removed activities
      for (const activityId of activitiesToDelete) {
        await this._deleteActivityById(userId, activityId);
      }
      
      // Save or update each activity
      for (const activityData of activities) {
        if (activityData.id || activityData.activityId) {
          // Update existing activity
          await this._updateActivityById(userId, activityData.id || activityData.activityId, activityData);
        } else {
          // Create new activity
          await this._createActivity(userId, activityData);
        }
      }
      
      return true;
    } catch (error) {
      console.error('[DynamoDBFamilyTimeService] Error in saveActivities:', {
        operation: 'saveActivities',
        service: 'DynamoDBFamilyTimeService',
        activitiesCount: Array.isArray(activities) ? activities.length : 'not-array',
        error: error.message,
        code: error.code || 'UNKNOWN',
        recoverable: error.recoverable !== undefined ? error.recoverable : true,
        context: error.context || {},
        sanitizedError: DataEncryptionService.sanitizeForLogging(error)
      });

      // Handle authentication errors with recovery attempts
      if (AuthenticationStateManager.isAuthenticationError(error)) {
        console.log('[DynamoDBFamilyTimeService] Detected authentication error in saveActivities, attempting recovery...');
        
        try {
          const recovered = await AuthenticationStateManager.handleAuthenticationError(error);
          if (recovered) {
            console.log('[DynamoDBFamilyTimeService] Authentication recovered, retrying saveActivities...');
            // Retry the operation once after recovery
            return await this.saveActivities(activities);
          }
        } catch (recoveryError) {
          console.error('[DynamoDBFamilyTimeService] Authentication recovery failed in saveActivities:', recoveryError);
        }
        
        // Re-throw authentication errors after recovery attempt
        throw error;
      }
      
      // For other errors, log and return false
      console.error('[DynamoDBFamilyTimeService] Non-authentication error in saveActivities, returning false');
      return false;
    }
  }

  /**
   * Add a new activity
   * @param {Object} activityData - Activity data to add
   * @returns {Promise<Object|null>} Created activity object or null if failed
   */
  static async addActivity(activityData) {
    // Use proactive token refresh for this critical operation
    return await ProactiveTokenRefreshService.executeWithTokenValidation(
      async () => {
        const userId = await this._getCurrentUserId();
        return await this._createActivity(userId, activityData);
      },
      {
        operationId: `addActivity_${Date.now()}`,
        estimatedDuration: 5000, // 5 seconds estimated duration
        retryOnFailure: true
      }
    ).catch(error => {
      console.error('[DynamoDBFamilyTimeService] Error in addActivity:', {
        operation: 'addActivity',
        service: 'DynamoDBFamilyTimeService',
        error: error.message,
        code: error.code || 'UNKNOWN',
        recoverable: error.recoverable !== undefined ? error.recoverable : true,
        context: error.context || {},
        sanitizedError: DataEncryptionService.sanitizeForLogging(error)
      });

      // Re-throw validation errors without modification
      if (error.name === 'ValidationError') {
        throw error;
      }
      
      // For other errors, log and return null
      console.error('[DynamoDBFamilyTimeService] Non-authentication/validation error in addActivity, returning null');
      return null;
    });
  }

  /**
   * Update an existing activity
   * @param {string} activityId - Activity ID to update
   * @param {Object} updatedData - Updated activity data
   * @returns {Promise<Object|null>} Updated activity object or null if failed
   */
  static async updateActivity(activityId, updatedData) {
    try {
      const userId = await this._getCurrentUserId();
      return await this._updateActivityById(userId, activityId, updatedData);
    } catch (error) {
      console.error('[DynamoDBFamilyTimeService] Error in updateActivity:', {
        operation: 'updateActivity',
        service: 'DynamoDBFamilyTimeService',
        activityId,
        error: error.message,
        code: error.code || 'UNKNOWN',
        recoverable: error.recoverable !== undefined ? error.recoverable : true,
        context: error.context || {},
        sanitizedError: DataEncryptionService.sanitizeForLogging(error)
      });

      // Handle authentication errors with recovery attempts
      if (AuthenticationStateManager.isAuthenticationError(error)) {
        console.log('[DynamoDBFamilyTimeService] Detected authentication error in updateActivity, attempting recovery...');
        
        try {
          const recovered = await AuthenticationStateManager.handleAuthenticationError(error);
          if (recovered) {
            console.log('[DynamoDBFamilyTimeService] Authentication recovered, retrying updateActivity...');
            // Retry the operation once after recovery
            return await this.updateActivity(activityId, updatedData);
          }
        } catch (recoveryError) {
          console.error('[DynamoDBFamilyTimeService] Authentication recovery failed in updateActivity:', recoveryError);
        }
        
        // Re-throw authentication errors after recovery attempt
        throw error;
      }
      
      // Re-throw validation errors without modification
      if (error.name === 'ValidationError') {
        throw error;
      }
      
      // For other errors, log and return null
      console.error('[DynamoDBFamilyTimeService] Non-authentication/validation error in updateActivity, returning null');
      return null;
    }
  }

  /**
   * Delete an activity
   * @param {string} activityId - Activity ID to delete
   * @returns {Promise<boolean>} Success status
   */
  static async deleteActivity(activityId) {
    try {
      const userId = await this._getCurrentUserId();
      await this._deleteActivityById(userId, activityId);
      return true;
    } catch (error) {
      console.error('[DynamoDBFamilyTimeService] Error in deleteActivity:', {
        operation: 'deleteActivity',
        service: 'DynamoDBFamilyTimeService',
        activityId,
        error: error.message,
        code: error.code || 'UNKNOWN',
        recoverable: error.recoverable !== undefined ? error.recoverable : true,
        context: error.context || {},
        sanitizedError: DataEncryptionService.sanitizeForLogging(error)
      });

      // Handle authentication errors with recovery attempts
      if (AuthenticationStateManager.isAuthenticationError(error)) {
        console.log('[DynamoDBFamilyTimeService] Detected authentication error in deleteActivity, attempting recovery...');
        
        try {
          const recovered = await AuthenticationStateManager.handleAuthenticationError(error);
          if (recovered) {
            console.log('[DynamoDBFamilyTimeService] Authentication recovered, retrying deleteActivity...');
            // Retry the operation once after recovery
            return await this.deleteActivity(activityId);
          }
        } catch (recoveryError) {
          console.error('[DynamoDBFamilyTimeService] Authentication recovery failed in deleteActivity:', recoveryError);
        }
        
        // Re-throw authentication errors after recovery attempt
        throw error;
      }
      
      // For other errors, log and return false
      console.error('[DynamoDBFamilyTimeService] Non-authentication error in deleteActivity, returning false');
      return false;
    }
  }

  /**
   * Get a specific activity by ID
   * @param {string} activityId - Activity ID to retrieve
   * @returns {Promise<Object|null>} Activity object or null if not found
   */
  static async getActivityById(activityId) {
    try {
      const userId = await this._getCurrentUserId();
      
      const activity = await DynamoDBService.getItem(
        this.TABLE_NAME,
        {
          userId: userId,
          activityId: activityId
        }
      );
      
      if (activity) {
        // Validate data isolation
        DynamoDBService.validateUserDataIsolation(activity, userId);
        
        // Decrypt sensitive fields before returning
        const decryptedActivity = await DataEncryptionService.decryptSensitiveFields(activity);
        return decryptedActivity;
      }
      
      return null;
    } catch (error) {
      console.error('[DynamoDBFamilyTimeService] Error in getActivityById:', {
        operation: 'getActivityById',
        service: 'DynamoDBFamilyTimeService',
        activityId,
        error: error.message,
        code: error.code || 'UNKNOWN',
        recoverable: error.recoverable !== undefined ? error.recoverable : true,
        context: error.context || {},
        sanitizedError: DataEncryptionService.sanitizeForLogging(error)
      });

      // Handle authentication errors with recovery attempts
      if (AuthenticationStateManager.isAuthenticationError(error)) {
        console.log('[DynamoDBFamilyTimeService] Detected authentication error in getActivityById, attempting recovery...');
        
        try {
          const recovered = await AuthenticationStateManager.handleAuthenticationError(error);
          if (recovered) {
            console.log('[DynamoDBFamilyTimeService] Authentication recovered, retrying getActivityById...');
            // Retry the operation once after recovery
            return await this.getActivityById(activityId);
          }
        } catch (recoveryError) {
          console.error('[DynamoDBFamilyTimeService] Authentication recovery failed in getActivityById:', recoveryError);
        }
        
        // Re-throw authentication errors after recovery attempt
        throw error;
      }
      
      // For other errors, log and return null
      console.error('[DynamoDBFamilyTimeService] Non-authentication error in getActivityById, returning null');
      return null;
    }
  }

  /**
   * Get activities for a specific child
   * @param {string} childId - Child ID
   * @returns {Promise<Array>} Array of activities for the child
   */
  static async getActivitiesForChild(childId) {
    try {
      const activities = await this.getActivities();
      return activities.filter(activity => 
        activity.participants && activity.participants.some(participant => participant.childId === childId)
      );
    } catch (error) {
      console.error('Error getting activities for child:', error);
      return [];
    }
  }

  /**
   * Get activities by type
   * @param {string} type - Activity type
   * @returns {Promise<Array>} Array of activities of the specified type
   */
  static async getActivitiesByType(type) {
    try {
      if (!this.VALID_ACTIVITY_TYPES.includes(type)) {
        throw new Error('Invalid activity type');
      }

      const activities = await this.getActivities();
      return activities.filter(activity => activity.type === type);
    } catch (error) {
      // Re-throw validation errors
      if (error.message.includes('Invalid activity type')) {
        throw error;
      }
      
      console.error('Error getting activities by type:', error);
      return [];
    }
  }

  /**
   * Get activities within a date range
   * @param {string} startDate - Start date
   * @param {string} endDate - End date
   * @returns {Promise<Array>} Array of activities in the date range
   */
  static async getActivitiesInDateRange(startDate, endDate) {
    try {
      const activities = await this.getActivities();
      const startTime = new Date(startDate);
      const endTime = new Date(endDate);

      if (isNaN(startTime.getTime()) || isNaN(endTime.getTime())) {
        throw new Error('Invalid date range provided');
      }

      if (startTime > endTime) {
        throw new Error('Start date must be before end date');
      }

      return activities.filter(activity => {
        const activityStart = new Date(activity.startTime);
        const activityEnd = new Date(activity.endTime);
        
        // Activity overlaps with the date range if:
        // Activity starts before range ends AND activity ends after range starts
        return activityStart <= endTime && activityEnd >= startTime;
      });
    } catch (error) {
      // Re-throw validation errors
      if (error.message.includes('Invalid date range') || 
          error.message.includes('Start date must be before end date')) {
        throw error;
      }
      
      console.error('Error getting activities in date range:', error);
      return [];
    }
  }

  /**
   * Get activities sorted by date
   * @param {boolean} ascending - Sort order (false for newest first)
   * @returns {Promise<Array>} Sorted activities array
   */
  static async getActivitiesSorted(ascending = false) {
    try {
      const activities = await this.getActivities();
      return activities.sort((a, b) => {
        const dateA = new Date(a.startTime);
        const dateB = new Date(b.startTime);
        return ascending ? dateA - dateB : dateB - dateA;
      });
    } catch (error) {
      console.error('[DynamoDBFamilyTimeService] Error in getActivitiesSorted:', {
        operation: 'getActivitiesSorted',
        service: 'DynamoDBFamilyTimeService',
        ascending,
        error: error.message,
        code: error.code || 'UNKNOWN',
        recoverable: error.recoverable !== undefined ? error.recoverable : true,
        context: error.context || {},
        sanitizedError: DataEncryptionService.sanitizeForLogging(error)
      });

      // Handle authentication errors with recovery attempts
      if (AuthenticationStateManager.isAuthenticationError(error)) {        
        try {
          const recovered = await AuthenticationStateManager.handleAuthenticationError(error);
          if (recovered) {
            // Retry the operation once after recovery
            return await this.getActivitiesSorted(ascending);
          }
        } catch (recoveryError) {
          console.error('[DynamoDBFamilyTimeService] Authentication recovery failed in getActivitiesSorted:', recoveryError);
        }
        
        // Re-throw authentication errors after recovery attempt
        throw error;
      }
      
      // For other errors, log and return empty array
      console.error('[DynamoDBFamilyTimeService] Non-authentication error in getActivitiesSorted, returning empty array');
      return [];
    }
  }

  /**
   * Get activity statistics for a child
   * @param {string} childId - Child ID
   * @returns {Promise<Object|null>} Activity statistics or null if failed
   */
  static async getChildActivityStats(childId) {
    try {
      const childActivities = await this.getActivitiesForChild(childId);
      
      const stats = {
        totalActivities: childActivities.length,
        activityTypeBreakdown: {
          'Reading Time': 0,
          'Sports': 0,
          'Adventure': 0,
          'Important': 0
        },
        emotionPatterns: {
          'Exciting': 0,
          'Happy': 0,
          'Sad': 0
        },
        totalDuration: 0 // in minutes
      };

      childActivities.forEach(activity => {
        // Count activity types
        stats.activityTypeBreakdown[activity.type]++;

        // Count emotions for this child
        const childParticipant = activity.participants.find(p => p.childId === childId);
        if (childParticipant) {
          stats.emotionPatterns[childParticipant.feeling]++;
        }

        // Calculate duration
        const startTime = new Date(activity.startTime);
        const endTime = new Date(activity.endTime);
        const durationMs = endTime - startTime;
        stats.totalDuration += Math.round(durationMs / (1000 * 60)); // Convert to minutes
      });

      return stats;
    } catch (error) {
      console.error('[DynamoDBFamilyTimeService] Error in getChildActivityStats:', {
        operation: 'getChildActivityStats',
        service: 'DynamoDBFamilyTimeService',
        childId,
        error: error.message,
        code: error.code || 'UNKNOWN',
        recoverable: error.recoverable !== undefined ? error.recoverable : true,
        context: error.context || {},
        sanitizedError: DataEncryptionService.sanitizeForLogging(error)
      });

      // Handle authentication errors with recovery attempts
      if (AuthenticationStateManager.isAuthenticationError(error)) {
        console.log('[DynamoDBFamilyTimeService] Detected authentication error in getChildActivityStats, attempting recovery...');
        
        try {
          const recovered = await AuthenticationStateManager.handleAuthenticationError(error);
          if (recovered) {
            // Retry the operation once after recovery
            return await this.getChildActivityStats(childId);
          }
        } catch (recoveryError) {
          console.error('[DynamoDBFamilyTimeService] Authentication recovery failed in getChildActivityStats:', recoveryError);
        }
        
        // Re-throw authentication errors after recovery attempt
        throw error;
      }
      
      // For other errors, log and return null
      console.error('[DynamoDBFamilyTimeService] Non-authentication error in getChildActivityStats, returning null');
      return null;
    }
  }

  /**
   * Get recent activities (last N activities)
   * @param {number} limit - Number of activities to return
   * @returns {Promise<Array>} Array of recent activities
   */
  static async getRecentActivities(limit = 10) {
    try {
      const activities = await this.getActivitiesSorted(false); // newest first
      return activities.slice(0, limit);
    } catch (error) {
      console.error('Error getting recent activities:', error);
      return [];
    }
  }

  // Private helper methods for internal operations

  /**
   * Create a new activity in DynamoDB
   * @private
   * @param {string} userId - User ID
   * @param {Object} activityData - Activity data
   * @returns {Promise<Object>} Created activity object
   */
  static async _createActivity(userId, activityData) {
    // Validate, sanitize, and encrypt data
    const preparedData = await this._prepareActivityData(activityData);
    
    // Generate unique activity ID
    const activityId = DynamoDBService.generateId();
    
    // Create activity item for DynamoDB
    const activityItem = {
      userId: userId,
      activityId: activityId,
      ...preparedData,
      // Add id field for backward compatibility with existing code
      id: activityId
    };
    
    const result = await DynamoDBService.putItem(this.TABLE_NAME, activityItem);
    
    if (result.success) {
      // Decrypt sensitive fields before returning
      const decryptedItem = await DataEncryptionService.decryptSensitiveFields(result.item);
      return decryptedItem;
    } else {
      throw new Error('Failed to create activity');
    }
  }

  /**
   * Update an existing activity in DynamoDB
   * @private
   * @param {string} userId - User ID
   * @param {string} activityId - Activity ID
   * @param {Object} updatedData - Updated activity data
   * @returns {Promise<Object>} Updated activity object
   */
  static async _updateActivityById(userId, activityId, updatedData) {
    // Validate and prepare data (excluding system fields)
    const { userId: _, activityId: __, id: ___, createdAt: ____, ...dataToUpdate } = updatedData;
    
    // Only validate if we have data to update
    let preparedData = {};
    if (Object.keys(dataToUpdate).length > 0) {
      // For partial updates, validate the complete merged data
      const existingActivity = await this.getActivityById(activityId);
      if (!existingActivity) {
        throw new Error(`Activity with ID ${activityId} not found`);
      }
      
      const mergedData = {
        ...existingActivity,
        ...dataToUpdate,
        // Preserve original creation data
        id: existingActivity.id,
        activityId: existingActivity.activityId,
        createdAt: existingActivity.createdAt,
      };
      
      // Validate merged data
      preparedData = await this._prepareActivityData(mergedData);
      
      // Remove system fields from update
      const { userId: _, activityId: __, id: ___, createdAt: ____, updatedAt: _____, version: ______, ...updateFields } = preparedData;
      preparedData = updateFields;
    }
    
    const result = await DynamoDBService.updateItem(
      this.TABLE_NAME,
      {
        userId: userId,
        activityId: activityId
      },
      preparedData,
      {
        // Ensure the activity exists before updating
        ConditionExpression: 'attribute_exists(userId) AND attribute_exists(activityId)'
      }
    );
    
    if (result.success) {
      // Decrypt sensitive fields before returning
      const decryptedItem = await DataEncryptionService.decryptSensitiveFields(result.item);
      return decryptedItem;
    } else {
      throw new Error('Failed to update activity');
    }
  }

  /**
   * Delete an activity from DynamoDB
   * @private
   * @param {string} userId - User ID
   * @param {string} activityId - Activity ID
   * @returns {Promise<void>}
   */
  static async _deleteActivityById(userId, activityId) {
    await DynamoDBService.deleteItem(
      this.TABLE_NAME,
      {
        userId: userId,
        activityId: activityId
      },
      {
        // Ensure the activity exists before deleting
        ConditionExpression: 'attribute_exists(userId) AND attribute_exists(activityId)'
      }
    );
  }
}

export default DynamoDBFamilyTimeService;