import AsyncStorage from '@react-native-async-storage/async-storage';
import { 
  retryWithBackoff, 
  logError, 
  safeJsonParse, 
  safeJsonStringify,
  withErrorHandling 
} from '../utils/errorUtils';
import DataNamespacing from '../utils/dataNamespacing';
import DynamoDBFamilyTimeService from './DynamoDBFamilyTimeService';
import AuthenticationStateManager from './AuthenticationStateManager';
import AuthenticationError from './AuthenticationError';

const ACTIVITIES_STORAGE_KEY = 'activities.json';
const BACKUP_STORAGE_KEY = 'activities_backup.json';

class FamilyTimeService {
  // Configuration flag to switch between storage backends
  static USE_DYNAMODB = process.env.EXPO_PUBLIC_USE_DYNAMODB === 'true' || false;
  
  /**
   * Get the appropriate backend service based on configuration
   * @private
   * @returns {Object} Backend service (DynamoDB or AsyncStorage-based)
   */
  static _getBackendService() {
    return this.USE_DYNAMODB ? DynamoDBFamilyTimeService : this;
  }
  
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
   * Initialize the service with required dependencies
   * This should be called during app initialization to set up authentication services
   * @static
   * @param {Object} authenticationService - AuthenticationService instance
   * @param {Object} tokenStorageService - TokenStorageService instance
   */
  static initialize(authenticationService, tokenStorageService) {    
    // Initialize AuthenticationStateManager with required services
    AuthenticationStateManager.initialize(authenticationService, tokenStorageService);
  }
  // Public API methods that delegate to the appropriate backend
  
  /**
   * Get all activities from storage
   * @returns {Promise<Array>} Array of activity objects
   */
  static async getActivities() {
    const operation = 'getActivities';
    const context = { service: 'FamilyTimeService', operation, backend: this.USE_DYNAMODB ? 'DynamoDB' : 'AsyncStorage' };
    
    try {      
      if (this.USE_DYNAMODB) {
        try {
          // Ensure authentication before calling DynamoDB service
          await this._ensureAuthenticated(context);
          
          const activities = await DynamoDBFamilyTimeService.getActivities();
          return activities;
          
        } catch (error) {
          console.error(`[FamilyTimeService] DynamoDB ${operation} failed:`, {
            ...context,
            error: error.message,
            code: error.code || 'UNKNOWN',
            recoverable: error.recoverable !== undefined ? error.recoverable : true
          });
          
          // Handle authentication errors with recovery attempts
          if (this._isAuthenticationError(error)) {
            const recovered = await this._handleAuthenticationError(error, context);
            if (recovered) {
              return await DynamoDBFamilyTimeService.getActivities();
            }
            
            // If recovery failed, try fallback to AsyncStorage
            console.warn(`[FamilyTimeService] Authentication recovery failed, falling back to AsyncStorage for ${operation}`);
            return await this._getActivitiesFromAsyncStorage();
          }
          
          // For non-authentication errors, fall back to AsyncStorage
          console.warn(`[FamilyTimeService] DynamoDB ${operation} failed, falling back to AsyncStorage:`, error.message);
          return await this._getActivitiesFromAsyncStorage();
        }
      }
      
      // Use AsyncStorage backend
      const activities = await this._getActivitiesFromAsyncStorage();
      return activities;
      
    } catch (error) {
      console.error(`[FamilyTimeService] ${operation} failed completely:`, {
        ...context,
        error: error.message,
        code: error.code || 'UNKNOWN',
        stack: error.stack
      });
      
      // Log error with context for debugging
      logError(error, context);
      
      // Return empty array as fallback to prevent UI crashes
      return [];
    }
  }
  
  /**
   * Save activities array to storage
   * @param {Array} activities - Array of activity objects
   * @returns {Promise<boolean>} Success status
   */
  static async saveActivities(activities) {
    const operation = 'saveActivities';
    const context = { 
      service: 'FamilyTimeService', 
      operation, 
      backend: this.USE_DYNAMODB ? 'DynamoDB' : 'AsyncStorage',
      activitiesCount: Array.isArray(activities) ? activities.length : 'not-array'
    };
    
    try {      
      // Validate input
      if (!Array.isArray(activities)) {
        const validationError = new Error('Activities must be an array');
        validationError.name = 'ValidationError';
        throw validationError;
      }
      
      if (this.USE_DYNAMODB) {
        try {
          // Ensure authentication before calling DynamoDB service
          await this._ensureAuthenticated(context);
          
          const success = await DynamoDBFamilyTimeService.saveActivities(activities);
          return success;
          
        } catch (error) {
          console.error(`[FamilyTimeService] DynamoDB ${operation} failed:`, {
            ...context,
            error: error.message,
            code: error.code || 'UNKNOWN',
            recoverable: error.recoverable !== undefined ? error.recoverable : true
          });
          
          // Handle authentication errors with recovery attempts
          if (this._isAuthenticationError(error)) {
            const recovered = await this._handleAuthenticationError(error, context);
            if (recovered) {
              return await DynamoDBFamilyTimeService.saveActivities(activities);
            }
            
            // If recovery failed, try fallback to AsyncStorage
            console.warn(`[FamilyTimeService] Authentication recovery failed, falling back to AsyncStorage for ${operation}`);
            return await this._saveActivitiesToAsyncStorage(activities);
          }
          
          // For non-authentication errors, fall back to AsyncStorage
          console.warn(`[FamilyTimeService] DynamoDB ${operation} failed, falling back to AsyncStorage:`, error.message);
          return await this._saveActivitiesToAsyncStorage(activities);
        }
      }
      
      // Use AsyncStorage backend
      const success = await this._saveActivitiesToAsyncStorage(activities);
      return success;
      
    } catch (error) {
      console.error(`[FamilyTimeService] ${operation} failed completely:`, {
        ...context,
        error: error.message,
        code: error.code || 'UNKNOWN',
        stack: error.stack
      });
      
      // Log error with context for debugging
      logError(error, context);
      
      // Re-throw validation errors
      if (error.name === 'ValidationError') {
        throw error;
      }
      
      // Return false for other errors to indicate failure
      return false;
    }
  }
  
  /**
   * Add a new activity
   * @param {Object} activityData - Activity data to add
   * @returns {Promise<Object|null>} Created activity object or null if failed
   */
  static async addActivity(activityData) {
    const operation = 'addActivity';
    const context = { 
      service: 'FamilyTimeService', 
      operation, 
      backend: this.USE_DYNAMODB ? 'DynamoDB' : 'AsyncStorage',
      activityType: activityData?.type,
      participantCount: activityData?.participants?.length
    };
    
    try {      
      if (this.USE_DYNAMODB) {
        try {
          // Ensure authentication before calling DynamoDB service
          await this._ensureAuthenticated(context);
          
          const activity = await DynamoDBFamilyTimeService.addActivity(activityData);
          return activity;
          
        } catch (error) {
          console.error(`[FamilyTimeService] DynamoDB ${operation} failed:`, {
            ...context,
            error: error.message,
            code: error.code || 'UNKNOWN',
            recoverable: error.recoverable !== undefined ? error.recoverable : true
          });
          
          // Handle authentication errors with recovery attempts
          if (this._isAuthenticationError(error)) {
            const recovered = await this._handleAuthenticationError(error, context);
            if (recovered) {
              return await DynamoDBFamilyTimeService.addActivity(activityData);
            }
            
            // If recovery failed, try fallback to AsyncStorage
            console.warn(`[FamilyTimeService] Authentication recovery failed, falling back to AsyncStorage for ${operation}`);
            return await this._addActivityToAsyncStorage(activityData);
          }
          
          // Re-throw validation errors without fallback
          if (error.name === 'ValidationError') {
            throw error;
          }
          
          // For non-authentication errors, fall back to AsyncStorage
          console.warn(`[FamilyTimeService] DynamoDB ${operation} failed, falling back to AsyncStorage:`, error.message);
          return await this._addActivityToAsyncStorage(activityData);
        }
      }
      
      // Use AsyncStorage backend
      const activity = await this._addActivityToAsyncStorage(activityData);
      return activity;
      
    } catch (error) {
      console.error(`[FamilyTimeService] ${operation} failed completely:`, {
        ...context,
        error: error.message,
        code: error.code || 'UNKNOWN',
        stack: error.stack
      });
      
      // Log error with context for debugging
      logError(error, context);
      
      // Re-throw validation errors to UI layer
      if (error.name === 'ValidationError') {
        throw error;
      }
      
      // Return null for other errors to indicate failure
      return null;
    }
  }
  
  /**
   * Update an existing activity
   * @param {string} activityId - Activity ID to update
   * @param {Object} updatedData - Updated activity data
   * @returns {Promise<Object|null>} Updated activity object or null if failed
   */
  static async updateActivity(activityId, updatedData) {
    const operation = 'updateActivity';
    const context = { 
      service: 'FamilyTimeService', 
      operation, 
      backend: this.USE_DYNAMODB ? 'DynamoDB' : 'AsyncStorage',
      activityId,
      updateFields: updatedData ? Object.keys(updatedData) : []
    };
    
    try {      
      // Validate input
      if (!activityId || typeof activityId !== 'string') {
        const validationError = new Error('Valid activity ID is required for update');
        validationError.name = 'ValidationError';
        throw validationError;
      }
      
      if (this.USE_DYNAMODB) {
        try {
          // Ensure authentication before calling DynamoDB service
          await this._ensureAuthenticated(context);
          
          const activity = await DynamoDBFamilyTimeService.updateActivity(activityId, updatedData);
          return activity;
          
        } catch (error) {
          console.error(`[FamilyTimeService] DynamoDB ${operation} failed:`, {
            ...context,
            error: error.message,
            code: error.code || 'UNKNOWN',
            recoverable: error.recoverable !== undefined ? error.recoverable : true
          });
          
          // Handle authentication errors with recovery attempts
          if (this._isAuthenticationError(error)) {
            const recovered = await this._handleAuthenticationError(error, context);
            if (recovered) {
              return await DynamoDBFamilyTimeService.updateActivity(activityId, updatedData);
            }
            
            // If recovery failed, try fallback to AsyncStorage
            console.warn(`[FamilyTimeService] Authentication recovery failed, falling back to AsyncStorage for ${operation}`);
            return await this._updateActivityInAsyncStorage(activityId, updatedData);
          }
          
          // Re-throw validation and not found errors without fallback
          if (error.name === 'ValidationError' || error.name === 'NotFoundError') {
            throw error;
          }
          
          // For non-authentication errors, fall back to AsyncStorage
          console.warn(`[FamilyTimeService] DynamoDB ${operation} failed, falling back to AsyncStorage:`, error.message);
          return await this._updateActivityInAsyncStorage(activityId, updatedData);
        }
      }
      
      // Use AsyncStorage backend
      const activity = await this._updateActivityInAsyncStorage(activityId, updatedData);
      return activity;
      
    } catch (error) {
      console.error(`[FamilyTimeService] ${operation} failed completely:`, {
        ...context,
        error: error.message,
        code: error.code || 'UNKNOWN',
        stack: error.stack
      });
      
      // Log error with context for debugging
      logError(error, context);
      
      // Re-throw validation and not found errors to UI layer
      if (error.name === 'ValidationError' || error.name === 'NotFoundError') {
        throw error;
      }
      
      // Return null for other errors to indicate failure
      return null;
    }
  }
  
  /**
   * Delete an activity
   * @param {string} activityId - Activity ID to delete
   * @returns {Promise<boolean>} Success status
   */
  static async deleteActivity(activityId) {
    const operation = 'deleteActivity';
    const context = { 
      service: 'FamilyTimeService', 
      operation, 
      backend: this.USE_DYNAMODB ? 'DynamoDB' : 'AsyncStorage',
      activityId
    };
    
    try {      
      // Validate input
      if (!activityId || typeof activityId !== 'string') {
        const validationError = new Error('Valid activity ID is required for deletion');
        validationError.name = 'ValidationError';
        throw validationError;
      }
      
      if (this.USE_DYNAMODB) {
        try {
          // Ensure authentication before calling DynamoDB service
          await this._ensureAuthenticated(context);
          
          const success = await DynamoDBFamilyTimeService.deleteActivity(activityId);
          return success;
          
        } catch (error) {
          console.error(`[FamilyTimeService] DynamoDB ${operation} failed:`, {
            ...context,
            error: error.message,
            code: error.code || 'UNKNOWN',
            recoverable: error.recoverable !== undefined ? error.recoverable : true
          });
          
          // Handle authentication errors with recovery attempts
          if (this._isAuthenticationError(error)) {
            const recovered = await this._handleAuthenticationError(error, context);
            if (recovered) {
              return await DynamoDBFamilyTimeService.deleteActivity(activityId);
            }
            
            // If recovery failed, try fallback to AsyncStorage
            console.warn(`[FamilyTimeService] Authentication recovery failed, falling back to AsyncStorage for ${operation}`);
            return await this._deleteActivityFromAsyncStorage(activityId);
          }
          
          // Re-throw not found errors without fallback
          if (error.name === 'NotFoundError') {
            throw error;
          }
          
          // For non-authentication errors, fall back to AsyncStorage
          console.warn(`[FamilyTimeService] DynamoDB ${operation} failed, falling back to AsyncStorage:`, error.message);
          return await this._deleteActivityFromAsyncStorage(activityId);
        }
      }
      
      // Use AsyncStorage backend
      const success = await this._deleteActivityFromAsyncStorage(activityId);
      return success;
      
    } catch (error) {
      console.error(`[FamilyTimeService] ${operation} failed completely:`, {
        ...context,
        error: error.message,
        code: error.code || 'UNKNOWN',
        stack: error.stack
      });
      
      // Log error with context for debugging
      logError(error, context);
      
      // Re-throw validation and not found errors to UI layer
      if (error.name === 'ValidationError' || error.name === 'NotFoundError') {
        throw error;
      }
      
      // Return false for other errors to indicate failure
      return false;
    }
  }
  
  /**
   * Get a specific activity by ID
   * @param {string} activityId - Activity ID to retrieve
   * @returns {Promise<Object|null>} Activity object or null if not found
   */
  static async getActivityById(activityId) {
    const operation = 'getActivityById';
    const context = { 
      service: 'FamilyTimeService', 
      operation, 
      backend: this.USE_DYNAMODB ? 'DynamoDB' : 'AsyncStorage',
      activityId
    };
    
    try {      
      if (this.USE_DYNAMODB) {
        try {
          // Ensure authentication before calling DynamoDB service
          await this._ensureAuthenticated(context);
          
          const activity = await DynamoDBFamilyTimeService.getActivityById(activityId);
          return activity;
          
        } catch (error) {
          console.error(`[FamilyTimeService] DynamoDB ${operation} failed:`, {
            ...context,
            error: error.message,
            code: error.code || 'UNKNOWN',
            recoverable: error.recoverable !== undefined ? error.recoverable : true
          });
          
          // Handle authentication errors with recovery attempts
          if (this._isAuthenticationError(error)) {
            const recovered = await this._handleAuthenticationError(error, context);
            if (recovered) {
              return await DynamoDBFamilyTimeService.getActivityById(activityId);
            }
            
            // If recovery failed, try fallback to AsyncStorage
            console.warn(`[FamilyTimeService] Authentication recovery failed, falling back to AsyncStorage for ${operation}`);
            return await this._getActivityByIdFromAsyncStorage(activityId);
          }
          
          // For non-authentication errors, fall back to AsyncStorage
          console.warn(`[FamilyTimeService] DynamoDB ${operation} failed, falling back to AsyncStorage:`, error.message);
          return await this._getActivityByIdFromAsyncStorage(activityId);
        }
      }
      
      // Use AsyncStorage backend
      const activity = await this._getActivityByIdFromAsyncStorage(activityId);
      return activity;
      
    } catch (error) {
      console.error(`[FamilyTimeService] ${operation} failed completely:`, {
        ...context,
        error: error.message,
        code: error.code || 'UNKNOWN',
        stack: error.stack
      });
      
      // Log error with context for debugging
      logError(error, context);
      
      // Return null for errors to indicate not found/failure
      return null;
    }
  }
  
  /**
   * Get activities for a specific child
   * @param {string} childId - Child ID
   * @returns {Promise<Array>} Array of activities for the child
   */
  static async getActivitiesForChild(childId) {
    const operation = 'getActivitiesForChild';
    const context = { 
      service: 'FamilyTimeService', 
      operation, 
      backend: this.USE_DYNAMODB ? 'DynamoDB' : 'AsyncStorage',
      childId
    };
    
    try {      
      if (this.USE_DYNAMODB) {
        try {
          // Ensure authentication before calling DynamoDB service
          await this._ensureAuthenticated(context);
          
          const activities = await DynamoDBFamilyTimeService.getActivitiesForChild(childId);
          return activities;
          
        } catch (error) {
          console.error(`[FamilyTimeService] DynamoDB ${operation} failed:`, {
            ...context,
            error: error.message,
            code: error.code || 'UNKNOWN',
            recoverable: error.recoverable !== undefined ? error.recoverable : true
          });
          
          // Handle authentication errors with recovery attempts
          if (this._isAuthenticationError(error)) {
            const recovered = await this._handleAuthenticationError(error, context);
            if (recovered) {
              return await DynamoDBFamilyTimeService.getActivitiesForChild(childId);
            }
            
            // If recovery failed, try fallback to AsyncStorage
            console.warn(`[FamilyTimeService] Authentication recovery failed, falling back to AsyncStorage for ${operation}`);
            return await this._getActivitiesForChildFromAsyncStorage(childId);
          }
          
          // For non-authentication errors, fall back to AsyncStorage
          console.warn(`[FamilyTimeService] DynamoDB ${operation} failed, falling back to AsyncStorage:`, error.message);
          return await this._getActivitiesForChildFromAsyncStorage(childId);
        }
      }
      
      // Use AsyncStorage backend
      const activities = await this._getActivitiesForChildFromAsyncStorage(childId);
      return activities;
      
    } catch (error) {
      console.error(`[FamilyTimeService] ${operation} failed completely:`, {
        ...context,
        error: error.message,
        code: error.code || 'UNKNOWN',
        stack: error.stack
      });
      
      // Log error with context for debugging
      logError(error, context);
      
      // Return empty array as fallback to prevent UI crashes
      return [];
    }
  }
  
  /**
   * Get activities by type
   * @param {string} type - Activity type
   * @returns {Promise<Array>} Array of activities of the specified type
   */
  static async getActivitiesByType(type) {
    const operation = 'getActivitiesByType';
    const context = { 
      service: 'FamilyTimeService', 
      operation, 
      backend: this.USE_DYNAMODB ? 'DynamoDB' : 'AsyncStorage',
      type
    };
    
    try {      
      if (this.USE_DYNAMODB) {
        try {
          // Ensure authentication before calling DynamoDB service
          await this._ensureAuthenticated(context);
          
          const activities = await DynamoDBFamilyTimeService.getActivitiesByType(type);
          return activities;
          
        } catch (error) {
          console.error(`[FamilyTimeService] DynamoDB ${operation} failed:`, {
            ...context,
            error: error.message,
            code: error.code || 'UNKNOWN',
            recoverable: error.recoverable !== undefined ? error.recoverable : true
          });
          
          // Re-throw validation errors without fallback
          if (error.message && error.message.includes('Invalid activity type')) {
            throw error;
          }
          
          // Handle authentication errors with recovery attempts
          if (this._isAuthenticationError(error)) {
            const recovered = await this._handleAuthenticationError(error, context);
            if (recovered) {
              return await DynamoDBFamilyTimeService.getActivitiesByType(type);
            }
            
            // If recovery failed, try fallback to AsyncStorage
            console.warn(`[FamilyTimeService] Authentication recovery failed, falling back to AsyncStorage for ${operation}`);
            return await this._getActivitiesByTypeFromAsyncStorage(type);
          }
          
          // For non-authentication errors, fall back to AsyncStorage
          console.warn(`[FamilyTimeService] DynamoDB ${operation} failed, falling back to AsyncStorage:`, error.message);
          return await this._getActivitiesByTypeFromAsyncStorage(type);
        }
      }
      
      // Use AsyncStorage backend
      const activities = await this._getActivitiesByTypeFromAsyncStorage(type);
      return activities;
      
    } catch (error) {
      console.error(`[FamilyTimeService] ${operation} failed completely:`, {
        ...context,
        error: error.message,
        code: error.code || 'UNKNOWN',
        stack: error.stack
      });
      
      // Log error with context for debugging
      logError(error, context);
      
      // Re-throw validation errors to UI layer
      if (error.message && error.message.includes('Invalid activity type')) {
        throw error;
      }
      
      // Return empty array as fallback to prevent UI crashes
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
    const operation = 'getActivitiesInDateRange';
    const context = { 
      service: 'FamilyTimeService', 
      operation, 
      backend: this.USE_DYNAMODB ? 'DynamoDB' : 'AsyncStorage',
      startDate,
      endDate
    };
    
    try {      
      if (this.USE_DYNAMODB) {
        try {
          // Ensure authentication before calling DynamoDB service
          await this._ensureAuthenticated(context);
          
          const activities = await DynamoDBFamilyTimeService.getActivitiesInDateRange(startDate, endDate);
          return activities;
          
        } catch (error) {
          console.error(`[FamilyTimeService] DynamoDB ${operation} failed:`, {
            ...context,
            error: error.message,
            code: error.code || 'UNKNOWN',
            recoverable: error.recoverable !== undefined ? error.recoverable : true
          });
          
          // Re-throw validation errors without fallback
          if (error.message && (error.message.includes('Invalid date range') || 
                               error.message.includes('Start date must be before end date'))) {
            throw error;
          }
          
          // Handle authentication errors with recovery attempts
          if (this._isAuthenticationError(error)) {
            const recovered = await this._handleAuthenticationError(error, context);
            if (recovered) {
              return await DynamoDBFamilyTimeService.getActivitiesInDateRange(startDate, endDate);
            }
            
            // If recovery failed, try fallback to AsyncStorage
            console.warn(`[FamilyTimeService] Authentication recovery failed, falling back to AsyncStorage for ${operation}`);
            return await this._getActivitiesInDateRangeFromAsyncStorage(startDate, endDate);
          }
          
          // For non-authentication errors, fall back to AsyncStorage
          console.warn(`[FamilyTimeService] DynamoDB ${operation} failed, falling back to AsyncStorage:`, error.message);
          return await this._getActivitiesInDateRangeFromAsyncStorage(startDate, endDate);
        }
      }
      
      // Use AsyncStorage backend
      const activities = await this._getActivitiesInDateRangeFromAsyncStorage(startDate, endDate);
      return activities;
      
    } catch (error) {
      console.error(`[FamilyTimeService] ${operation} failed completely:`, {
        ...context,
        error: error.message,
        code: error.code || 'UNKNOWN',
        stack: error.stack
      });
      
      // Log error with context for debugging
      logError(error, context);
      
      // Re-throw validation errors to UI layer
      if (error.message && (error.message.includes('Invalid date range') || 
                           error.message.includes('Start date must be before end date'))) {
        throw error;
      }
      
      // Return empty array as fallback to prevent UI crashes
      return [];
    }
  }
  
  /**
   * Get activities sorted by date
   * @param {boolean} ascending - Sort order (false for newest first)
   * @returns {Promise<Array>} Sorted activities array
   */
  static async getActivitiesSorted(ascending = false) {
    const operation = 'getActivitiesSorted';
    const context = { 
      service: 'FamilyTimeService', 
      operation, 
      backend: this.USE_DYNAMODB ? 'DynamoDB' : 'AsyncStorage',
      ascending
    };
    
    try {
      if (this.USE_DYNAMODB) {
        try {
          // Ensure authentication before calling DynamoDB service
          await this._ensureAuthenticated(context);
          
          const activities = await DynamoDBFamilyTimeService.getActivitiesSorted(ascending);
          return activities;
          
        } catch (error) {
          console.error(`[FamilyTimeService] DynamoDB ${operation} failed:`, {
            ...context,
            error: error.message,
            code: error.code || 'UNKNOWN',
            recoverable: error.recoverable !== undefined ? error.recoverable : true
          });
          
          // Handle authentication errors with recovery attempts
          if (this._isAuthenticationError(error)) {
            const recovered = await this._handleAuthenticationError(error, context);
            if (recovered) {
              console.log(`[FamilyTimeService] Authentication recovered, retrying ${operation}...`);
              return await DynamoDBFamilyTimeService.getActivitiesSorted(ascending);
            }
            
            // If recovery failed, try fallback to AsyncStorage
            console.warn(`[FamilyTimeService] Authentication recovery failed, falling back to AsyncStorage for ${operation}`);
            return await this._getActivitiesSortedFromAsyncStorage(ascending);
          }
          
          // For non-authentication errors, fall back to AsyncStorage
          console.warn(`[FamilyTimeService] DynamoDB ${operation} failed, falling back to AsyncStorage:`, error.message);
          return await this._getActivitiesSortedFromAsyncStorage(ascending);
        }
      }
      
      // Use AsyncStorage backend
      const activities = await this._getActivitiesSortedFromAsyncStorage(ascending);
      return activities;
      
    } catch (error) {
      console.error(`[FamilyTimeService] ${operation} failed completely:`, {
        ...context,
        error: error.message,
        code: error.code || 'UNKNOWN',
        stack: error.stack
      });
      
      // Log error with context for debugging
      logError(error, context);
      
      // Return empty array as fallback to prevent UI crashes
      return [];
    }
  }
  
  /**
   * Get activity statistics for a child
   * @param {string} childId - Child ID
   * @returns {Promise<Object|null>} Activity statistics or null if failed
   */
  static async getChildActivityStats(childId) {
    const operation = 'getChildActivityStats';
    const context = { 
      service: 'FamilyTimeService', 
      operation, 
      backend: this.USE_DYNAMODB ? 'DynamoDB' : 'AsyncStorage',
      childId
    };
    
    try {
      if (this.USE_DYNAMODB) {
        try {
          // Ensure authentication before calling DynamoDB service
          await this._ensureAuthenticated(context);
          
          const stats = await DynamoDBFamilyTimeService.getChildActivityStats(childId);
          return stats;
          
        } catch (error) {
          console.error(`[FamilyTimeService] DynamoDB ${operation} failed:`, {
            ...context,
            error: error.message,
            code: error.code || 'UNKNOWN',
            recoverable: error.recoverable !== undefined ? error.recoverable : true
          });
          
          // Handle authentication errors with recovery attempts
          if (this._isAuthenticationError(error)) {
            const recovered = await this._handleAuthenticationError(error, context);
            if (recovered) {
              return await DynamoDBFamilyTimeService.getChildActivityStats(childId);
            }
            
            // If recovery failed, try fallback to AsyncStorage
            console.warn(`[FamilyTimeService] Authentication recovery failed, falling back to AsyncStorage for ${operation}`);
            return await this._getChildActivityStatsFromAsyncStorage(childId);
          }
          
          // For non-authentication errors, fall back to AsyncStorage
          console.warn(`[FamilyTimeService] DynamoDB ${operation} failed, falling back to AsyncStorage:`, error.message);
          return await this._getChildActivityStatsFromAsyncStorage(childId);
        }
      }
      
      // Use AsyncStorage backend
      const stats = await this._getChildActivityStatsFromAsyncStorage(childId);
      return stats;
      
    } catch (error) {
      console.error(`[FamilyTimeService] ${operation} failed completely:`, {
        ...context,
        error: error.message,
        code: error.code || 'UNKNOWN',
        stack: error.stack
      });
      
      // Log error with context for debugging
      logError(error, context);
      
      // Return null to indicate failure - UI should handle gracefully
      return null;
    }
  }
  
  /**
   * Get recent activities (last N activities)
   * @param {number} limit - Number of activities to return
   * @returns {Promise<Array>} Array of recent activities
   */
  static async getRecentActivities(limit = 10) {
    const operation = 'getRecentActivities';
    const context = { 
      service: 'FamilyTimeService', 
      operation, 
      backend: this.USE_DYNAMODB ? 'DynamoDB' : 'AsyncStorage',
      limit
    };
    
    try {      
      if (this.USE_DYNAMODB) {
        try {
          // Ensure authentication before calling DynamoDB service
          await this._ensureAuthenticated(context);
          
          const activities = await DynamoDBFamilyTimeService.getRecentActivities(limit);
          return activities;
          
        } catch (error) {
          console.error(`[FamilyTimeService] DynamoDB ${operation} failed:`, {
            ...context,
            error: error.message,
            code: error.code || 'UNKNOWN',
            recoverable: error.recoverable !== undefined ? error.recoverable : true
          });
          
          // Handle authentication errors with recovery attempts
          if (this._isAuthenticationError(error)) {
            const recovered = await this._handleAuthenticationError(error, context);
            if (recovered) {
              return await DynamoDBFamilyTimeService.getRecentActivities(limit);
            }
            
            // If recovery failed, try fallback to AsyncStorage
            console.warn(`[FamilyTimeService] Authentication recovery failed, falling back to AsyncStorage for ${operation}`);
            return await this._getRecentActivitiesFromAsyncStorage(limit);
          }
          
          // For non-authentication errors, fall back to AsyncStorage
          console.warn(`[FamilyTimeService] DynamoDB ${operation} failed, falling back to AsyncStorage:`, error.message);
          return await this._getRecentActivitiesFromAsyncStorage(limit);
        }
      }
      
      // Use AsyncStorage backend
      const activities = await this._getRecentActivitiesFromAsyncStorage(limit);
      return activities;
      
    } catch (error) {
      console.error(`[FamilyTimeService] ${operation} failed completely:`, {
        ...context,
        error: error.message,
        code: error.code || 'UNKNOWN',
        stack: error.stack
      });
      
      // Log error with context for debugging
      logError(error, context);
      
      // Return empty array as fallback to prevent UI crashes
      return [];
    }
  }
  
  // Authentication and error handling helper methods
  
  /**
   * Ensure user is authenticated using AuthenticationStateManager
   * @private
   * @param {Object} context - Operation context for logging
   * @throws {AuthenticationError} If authentication fails
   */
  static async _ensureAuthenticated(context = {}) {
    try {
      await AuthenticationStateManager.ensureAuthenticated();
    } catch (error) {
      console.error(`[FamilyTimeService] Authentication failed for operation:`, {
        ...context,
        error: error.message,
        code: error.code || 'UNKNOWN',
        recoverable: error.recoverable !== undefined ? error.recoverable : true
      });
      
      // Enhance error with context if it's not already an AuthenticationError
      if (!(error instanceof AuthenticationError)) {
        const authError = AuthenticationError.fromError(error, {
          operation: context.operation || 'ensureAuthenticated',
          service: 'FamilyTimeService',
          backend: context.backend || 'unknown'
        });
        throw authError;
      }
      
      throw error;
    }
  }
  
  /**
   * Check if an error is authentication-related
   * @private
   * @param {Error} error - Error to check
   * @returns {boolean} True if it's an authentication error
   */
  static _isAuthenticationError(error) {
    return AuthenticationStateManager.isAuthenticationError(error);
  }
  
  /**
   * Handle authentication errors with recovery attempts
   * @private
   * @param {Error} error - Authentication error to handle
   * @param {Object} context - Operation context for logging
   * @returns {Promise<boolean>} True if error was recovered, false otherwise
   */
  static async _handleAuthenticationError(error, context = {}) {
    try {      
      const recovered = await AuthenticationStateManager.handleAuthenticationError(error);
      
      if (recovered) {
        console.log(`[FamilyTimeService] Authentication error recovered for operation:`, context.operation);
      } else {
        console.warn(`[FamilyTimeService] Authentication error could not be recovered for operation:`, context.operation);
      }
      
      return recovered;
      
    } catch (recoveryError) {
      console.error(`[FamilyTimeService] Authentication recovery failed for operation:`, {
        ...context,
        originalError: error.message,
        recoveryError: recoveryError.message
      });
      
      // Log the recovery failure
      logError(recoveryError, {
        ...context,
        operation: `${context.operation}_recovery_failed`,
        originalError: error.message
      });
      
      return false;
    }
  }
  
  /**
   * Create enhanced error with context for better debugging
   * @private
   * @param {Error} error - Original error
   * @param {Object} context - Operation context
   * @returns {Error} Enhanced error with context
   */
  static _createEnhancedError(error, context = {}) {
    const enhancedError = new Error(`${context.operation || 'FamilyTimeService operation'} failed: ${error.message}`);
    enhancedError.originalError = error;
    enhancedError.context = context;
    enhancedError.timestamp = new Date().toISOString();
    enhancedError.service = 'FamilyTimeService';
    
    // Preserve error properties
    if (error.name) enhancedError.name = error.name;
    if (error.code) enhancedError.code = error.code;
    if (error.recoverable !== undefined) enhancedError.recoverable = error.recoverable;
    
    return enhancedError;
  }
  
  /**
   * Log operation success with context
   * @private
   * @param {string} operation - Operation name
   * @param {Object} context - Operation context
   * @param {*} result - Operation result
   */
  static _logOperationSuccess(operation, context = {}, result = null) {
    console.log(`[FamilyTimeService] ${operation} completed successfully:`, {
      ...context,
      timestamp: new Date().toISOString(),
      resultType: result ? typeof result : 'null',
      resultLength: Array.isArray(result) ? result.length : undefined
    });
  }
  
  /**
   * Log operation failure with context
   * @private
   * @param {string} operation - Operation name
   * @param {Object} context - Operation context
   * @param {Error} error - Error that occurred
   */
  static _logOperationFailure(operation, context = {}, error) {
    console.error(`[FamilyTimeService] ${operation} failed:`, {
      ...context,
      timestamp: new Date().toISOString(),
      error: error.message,
      code: error.code || 'UNKNOWN',
      recoverable: error.recoverable !== undefined ? error.recoverable : true,
      stack: error.stack
    });
    
    // Also log to error utils for centralized error tracking
    logError(error, {
      ...context,
      operation,
      service: 'FamilyTimeService'
    });
  }

  // Private AsyncStorage implementation methods (renamed from original methods)
  
  // Get all activities from AsyncStorage with enhanced error handling
  static async _getActivitiesFromAsyncStorage() {
    const operation = async () => {
      try {
        const activities = await DataNamespacing.getUserData(ACTIVITIES_STORAGE_KEY, []);
        
        // Validate the loaded data structure
        if (!Array.isArray(activities)) {
          throw new Error('Invalid activities data structure - expected array');
        }
        
        // Validate each activity object
        const validActivities = activities.filter(activity => {
          if (!activity || typeof activity !== 'object') {
            console.warn('Skipping invalid activity object:', activity);
            return false;
          }
          
          if (!activity.id || !activity.type || !activity.participants) {
            console.warn('Skipping activity with missing required fields:', activity);
            return false;
          }
          
          return true;
        });
        
        return validActivities;
      } catch (parseError) {
        console.error('Failed to parse activities data:', parseError);
        
        // Try to load from backup
        try {
          const backupActivities = await DataNamespacing.getUserData(BACKUP_STORAGE_KEY, []);
          return Array.isArray(backupActivities) ? backupActivities : [];
        } catch (backupError) {
          console.error('Backup loading also failed:', backupError);
        }
        
        // If both main and backup fail, return empty array
        logError(parseError, { context: 'getActivities', storageKey: ACTIVITIES_STORAGE_KEY });
        return [];
      }
    };

    try {
      return await retryWithBackoff(operation, 2, 500);
    } catch (error) {
      logError(error, { context: 'getActivities_retry_failed' });
      return [];
    }
  }

  // Save activities array to AsyncStorage with backup and retry
  static async _saveActivitiesToAsyncStorage(activities) {
    if (!Array.isArray(activities)) {
      throw new Error('Activities must be an array');
    }

    const operation = async () => {
      try {        
        // Validate activities before saving
        const validActivities = activities.filter(activity => {
          if (!activity || typeof activity !== 'object') {
            console.warn('Filtering out invalid activity:', activity);
            return false;
          }
          return true;
        });

        // Create backup before saving new data
        try {
          const currentData = await DataNamespacing.getUserData(ACTIVITIES_STORAGE_KEY, null);
          if (currentData) {
            await DataNamespacing.setUserData(BACKUP_STORAGE_KEY, currentData);
          }
        } catch (backupError) {
          console.warn('Failed to create backup:', backupError);
          // Continue with save operation even if backup fails
        }

        // Save the new data
        const success = await DataNamespacing.setUserData(ACTIVITIES_STORAGE_KEY, validActivities);
        if (!success) {
          throw new Error('Failed to save activities to user storage');
        }
        
        return true;
      } catch (error) {
        console.error('Failed to save activities:', error);
        throw new Error(`Storage operation failed: ${error.message}`);
      }
    };

    try {
      return await retryWithBackoff(operation, 2, 500);
    } catch (error) {
      logError(error, { 
        context: 'saveActivities_retry_failed', 
        activitiesCount: activities.length 
      });
      throw error;
    }
  }

  // Validate activity data before operations
  static validateActivityData(activityData) {
    const errors = [];

    // Required fields validation
    if (!activityData.type || !['Reading Time', 'Sports', 'Adventure', 'Important'].includes(activityData.type)) {
      errors.push('Activity type must be one of: Reading Time, Sports, Adventure, Important');
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
        if (!participant.feeling || !['Exciting', 'Happy', 'Sad'].includes(participant.feeling)) {
          errors.push(`Participant ${index + 1}: feeling must be one of: Exciting, Happy, Sad`);
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

    return {
      isValid: errors.length === 0,
      errors: errors
    };
  }

  // Add a new activity to AsyncStorage with comprehensive error handling
  static async _addActivityToAsyncStorage(activityData) {
    const operation = async () => {
      try {        
        // Validate activity data
        const validation = this.validateActivityData(activityData);
        if (!validation.isValid) {
          const validationError = new Error(`Validation failed: ${validation.errors.join(', ')}`);
          validationError.name = 'ValidationError';
          throw validationError;
        }

        // Load current activities
        const activities = await this._getActivitiesFromAsyncStorage();
        
        // Create new activity with safe defaults
        const newActivity = {
          id: `activity_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          ...activityData,
          // Ensure required fields have safe defaults
          location: (activityData.location || '').trim(),
          remarks: (activityData.remarks || '').trim(),
          photos: Array.isArray(activityData.photos) ? activityData.photos : [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        // Validate the complete activity object
        const finalValidation = this.validateActivityData(newActivity);
        if (!finalValidation.isValid) {
          throw new Error(`Final validation failed: ${finalValidation.errors.join(', ')}`);
        }

        // Add to activities array
        activities.push(newActivity);
        
        // Save with error handling
        const saveSuccess = await this._saveActivitiesToAsyncStorage(activities);
        if (!saveSuccess) {
          throw new Error('Failed to save activity to storage');
        }

        return newActivity;
      } catch (error) {
        console.error('Error in addActivity operation:', error);
        
        // Add context to the error
        if (error.name !== 'ValidationError') {
          logError(error, { 
            context: 'addActivity', 
            activityType: activityData?.type,
            participantCount: activityData?.participants?.length 
          });
        }
        
        throw error;
      }
    };

    try {
      // Use retry mechanism for non-validation errors
      return await retryWithBackoff(operation, 1, 1000);
    } catch (error) {
      // Re-throw with enhanced error message
      if (error.name === 'ValidationError') {
        throw error; // Don't retry validation errors
      }
      
      const enhancedError = new Error(`Failed to add family time activity: ${error.message}`);
      enhancedError.originalError = error;
      throw enhancedError;
    }
  }

  // Update an existing activity in AsyncStorage with enhanced error handling
  static async _updateActivityInAsyncStorage(activityId, updatedData) {
    if (!activityId || typeof activityId !== 'string') {
      throw new Error('Valid activity ID is required for update');
    }

    const operation = async () => {
      try {
        const activities = await this._getActivitiesFromAsyncStorage();
        const activityIndex = activities.findIndex(activity => activity.id === activityId);
        
        if (activityIndex === -1) {
          const notFoundError = new Error(`Activity with ID ${activityId} not found`);
          notFoundError.name = 'NotFoundError';
          throw notFoundError;
        }

        const existingActivity = activities[activityIndex];
        
        // Merge existing data with updates for validation
        const mergedData = {
          ...existingActivity,
          ...updatedData,
          // Preserve original creation data
          id: existingActivity.id,
          createdAt: existingActivity.createdAt,
          updatedAt: new Date().toISOString(),
        };

        // Validate merged data
        const validation = this.validateActivityData(mergedData);
        if (!validation.isValid) {
          const validationError = new Error(`Validation failed: ${validation.errors.join(', ')}`);
          validationError.name = 'ValidationError';
          throw validationError;
        }

        // Update the activity
        activities[activityIndex] = mergedData;

        // Save with error handling
        const saveSuccess = await this._saveActivitiesToAsyncStorage(activities);
        if (!saveSuccess) {
          throw new Error('Failed to save updated activity to storage');
        }

        console.log('Activity updated successfully:', activityId);
        return activities[activityIndex];
      } catch (error) {
        console.error('Error in updateActivity operation:', error);
        
        if (error.name !== 'ValidationError' && error.name !== 'NotFoundError') {
          logError(error, { 
            context: 'updateActivity', 
            activityId,
            updateFields: Object.keys(updatedData) 
          });
        }
        
        throw error;
      }
    };

    try {
      return await retryWithBackoff(operation, 1, 1000);
    } catch (error) {
      // Don't retry validation or not found errors
      if (error.name === 'ValidationError' || error.name === 'NotFoundError') {
        throw error;
      }
      
      const enhancedError = new Error(`Failed to update family time activity: ${error.message}`);
      enhancedError.originalError = error;
      throw enhancedError;
    }
  }

  // Delete an activity from AsyncStorage with enhanced error handling
  static async _deleteActivityFromAsyncStorage(activityId) {
    if (!activityId || typeof activityId !== 'string') {
      throw new Error('Valid activity ID is required for deletion');
    }

    const operation = async () => {
      try {        
        const activities = await this._getActivitiesFromAsyncStorage();
        const activityIndex = activities.findIndex(activity => activity.id === activityId);
        
        if (activityIndex === -1) {
          const notFoundError = new Error(`Activity with ID ${activityId} not found`);
          notFoundError.name = 'NotFoundError';
          throw notFoundError;
        }

        // Store activity info for logging before deletion
        const activityToDelete = activities[activityIndex];
        
        // Remove the activity
        const filteredActivities = activities.filter(activity => activity.id !== activityId);
        
        // Save with error handling
        const saveSuccess = await this._saveActivitiesToAsyncStorage(filteredActivities);
        if (!saveSuccess) {
          throw new Error('Failed to save activities after deletion');
        }

        return true;
      } catch (error) {
        console.error('Error in deleteActivity operation:', error);
        
        if (error.name !== 'NotFoundError') {
          logError(error, { 
            context: 'deleteActivity', 
            activityId 
          });
        }
        
        throw error;
      }
    };

    try {
      return await retryWithBackoff(operation, 1, 1000);
    } catch (error) {
      // Don't retry not found errors
      if (error.name === 'NotFoundError') {
        throw error;
      }
      
      const enhancedError = new Error(`Failed to delete family time activity: ${error.message}`);
      enhancedError.originalError = error;
      throw enhancedError;
    }
  }

  // Get a specific activity by ID from AsyncStorage
  static async _getActivityByIdFromAsyncStorage(activityId) {
    try {
      const activities = await this._getActivitiesFromAsyncStorage();
      return activities.find(activity => activity.id === activityId) || null;
    } catch (error) {
      console.error('Error getting activity by ID:', error);
      return null;
    }
  }

  // Get activities for a specific child from AsyncStorage
  static async _getActivitiesForChildFromAsyncStorage(childId) {
    try {
      const activities = await this._getActivitiesFromAsyncStorage();
      return activities.filter(activity => 
        activity.participants.some(participant => participant.childId === childId)
      );
    } catch (error) {
      console.error('Error getting activities for child:', error);
      return [];
    }
  }

  // Get activities by type from AsyncStorage
  static async _getActivitiesByTypeFromAsyncStorage(type) {
    try {
      if (!['Reading Time', 'Sports', 'Adventure', 'Important'].includes(type)) {
        throw new Error('Invalid activity type');
      }

      const activities = await this._getActivitiesFromAsyncStorage();
      return activities.filter(activity => activity.type === type);
    } catch (error) {
      console.error('Error getting activities by type:', error);
      return [];
    }
  }

  // Get activities within a date range from AsyncStorage
  static async _getActivitiesInDateRangeFromAsyncStorage(startDate, endDate) {
    try {
      const activities = await this._getActivitiesFromAsyncStorage();
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
      console.error('Error getting activities in date range:', error);
      return [];
    }
  }

  // Get activities sorted by date from AsyncStorage (newest first by default)
  static async _getActivitiesSortedFromAsyncStorage(ascending = false) {
    try {
      const activities = await this._getActivitiesFromAsyncStorage();
      return activities.sort((a, b) => {
        const dateA = new Date(a.startTime);
        const dateB = new Date(b.startTime);
        return ascending ? dateA - dateB : dateB - dateA;
      });
    } catch (error) {
      console.error('Error getting sorted activities:', error);
      return [];
    }
  }

  // Get activity statistics for a child from AsyncStorage
  static async _getChildActivityStatsFromAsyncStorage(childId) {
    try {
      const childActivities = await this._getActivitiesForChildFromAsyncStorage(childId);
      
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
      console.error('Error getting child activity stats:', error);
      return null;
    }
  }

  // Get recent activities from AsyncStorage (last N activities)
  static async _getRecentActivitiesFromAsyncStorage(limit = 10) {
    try {
      const activities = await this._getActivitiesSortedFromAsyncStorage(false); // newest first
      return activities.slice(0, limit);
    } catch (error) {
      console.error('Error getting recent activities:', error);
      return [];
    }
  }
}

export default FamilyTimeService;