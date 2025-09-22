import AsyncStorage from '@react-native-async-storage/async-storage';
import NetworkConnectivityService from './NetworkConnectivityService';
import OfflineCacheManager from './OfflineCacheManager';

// For testing purposes, allow services to be injected
let mockServices = null;
export const __setMockServices = (services) => {
  mockServices = services;
};

const getService = async (serviceName) => {
  if (mockServices && mockServices[serviceName]) {
    return mockServices[serviceName];
  }
  
  try {
    const module = await import(`./${serviceName}`);
    return module.default || module[serviceName];
  } catch (error) {
    throw new Error(`${serviceName} not available`);
  }
};

/**
 * Service for queuing operations when offline and syncing when online
 */
class OperationQueueService {
  static OPERATION_TYPES = {
    CREATE_CHILD: 'CREATE_CHILD',
    UPDATE_CHILD: 'UPDATE_CHILD',
    DELETE_CHILD: 'DELETE_CHILD',
    CREATE_EVENT: 'CREATE_EVENT',
    UPDATE_EVENT: 'UPDATE_EVENT',
    DELETE_EVENT: 'DELETE_EVENT',
    CREATE_FAMILY_TIME: 'CREATE_FAMILY_TIME',
    UPDATE_FAMILY_TIME: 'UPDATE_FAMILY_TIME',
    DELETE_FAMILY_TIME: 'DELETE_FAMILY_TIME',
    UPDATE_USER_PROFILE: 'UPDATE_USER_PROFILE'
  };

  static OPERATION_STATUS = {
    PENDING: 'PENDING',
    IN_PROGRESS: 'IN_PROGRESS',
    COMPLETED: 'COMPLETED',
    FAILED: 'FAILED',
    CONFLICT: 'CONFLICT'
  };

  static syncInProgress = false;
  static syncListeners = [];

  /**
   * Queue an operation for offline execution
   */
  static async queueOperation(operationType, data, options = {}) {
    try {
      const operation = {
        type: operationType,
        data,
        userId: options.userId,
        timestamp: Date.now(),
        status: this.OPERATION_STATUS.PENDING,
        retryCount: 0,
        maxRetries: options.maxRetries || 3,
        priority: options.priority || 1,
        metadata: options.metadata || {}
      };

      const operationId = await OfflineCacheManager.queueOperation(operation);
      
      if (operationId && NetworkConnectivityService.getOnlineStatus()) {
        // If online, try to sync immediately
        this.syncPendingOperations();
      }

      return operationId;
    } catch (error) {
      console.error('Failed to queue operation:', error);
      return null;
    }
  }

  /**
   * Sync all pending operations when online
   */
  static async syncPendingOperations() {
    if (this.syncInProgress || !NetworkConnectivityService.getOnlineStatus()) {
      return { success: false, reason: 'sync_in_progress_or_offline' };
    }

    this.syncInProgress = true;
    this.notifySyncListeners({ status: 'started' });

    try {
      const operations = await OfflineCacheManager.getQueuedOperations();
      const pendingOps = operations.filter(op => 
        op.status === this.OPERATION_STATUS.PENDING || 
        op.status === this.OPERATION_STATUS.FAILED
      );

      if (pendingOps.length === 0) {
        this.syncInProgress = false;
        this.notifySyncListeners({ status: 'completed', synced: 0 });
        return { success: true, synced: 0 };
      }

      // Sort by priority (higher first) then timestamp (older first)
      pendingOps.sort((a, b) => {
        if (a.priority !== b.priority) {
          return b.priority - a.priority;
        }
        return a.timestamp - b.timestamp;
      });

      let syncedCount = 0;
      let failedCount = 0;
      let conflictCount = 0;

      for (const operation of pendingOps) {
        try {
          const result = await this.executeOperation(operation);
          
          if (result.success) {
            await OfflineCacheManager.removeQueuedOperation(operation.id);
            syncedCount++;
          } else if (result.conflict) {
            await this.handleConflict(operation, result);
            conflictCount++;
          } else {
            await this.handleFailedOperation(operation, result.error);
            failedCount++;
          }
        } catch (error) {
          await this.handleFailedOperation(operation, error);
          failedCount++;
        }

        // Update sync progress
        this.notifySyncListeners({
          status: 'progress',
          completed: syncedCount + failedCount + conflictCount,
          total: pendingOps.length
        });
      }

      this.syncInProgress = false;
      this.notifySyncListeners({
        status: 'completed',
        synced: syncedCount,
        failed: failedCount,
        conflicts: conflictCount
      });

      return {
        success: true,
        synced: syncedCount,
        failed: failedCount,
        conflicts: conflictCount
      };
    } catch (error) {
      this.syncInProgress = false;
      this.notifySyncListeners({ status: 'error', error: error.message });
      console.error('Sync failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Execute a single operation
   */
  static async executeOperation(operation) {
    try {
      // Mark operation as in progress
      operation.status = this.OPERATION_STATUS.IN_PROGRESS;
      await this.updateQueuedOperation(operation);

      let result;
      
      switch (operation.type) {
        case this.OPERATION_TYPES.CREATE_CHILD:
          result = await this.executeCreateChild(operation);
          break;
        case this.OPERATION_TYPES.UPDATE_CHILD:
          result = await this.executeUpdateChild(operation);
          break;
        case this.OPERATION_TYPES.DELETE_CHILD:
          result = await this.executeDeleteChild(operation);
          break;
        case this.OPERATION_TYPES.CREATE_EVENT:
          result = await this.executeCreateEvent(operation);
          break;
        case this.OPERATION_TYPES.UPDATE_EVENT:
          result = await this.executeUpdateEvent(operation);
          break;
        case this.OPERATION_TYPES.DELETE_EVENT:
          result = await this.executeDeleteEvent(operation);
          break;
        case this.OPERATION_TYPES.CREATE_FAMILY_TIME:
          result = await this.executeCreateFamilyTime(operation);
          break;
        case this.OPERATION_TYPES.UPDATE_FAMILY_TIME:
          result = await this.executeUpdateFamilyTime(operation);
          break;
        case this.OPERATION_TYPES.DELETE_FAMILY_TIME:
          result = await this.executeDeleteFamilyTime(operation);
          break;
        case this.OPERATION_TYPES.UPDATE_USER_PROFILE:
          result = await this.executeUpdateUserProfile(operation);
          break;
        default:
          throw new Error(`Unknown operation type: ${operation.type}`);
      }

      return result;
    } catch (error) {
      console.error(`Failed to execute operation ${operation.type}:`, error);
      return { success: false, error };
    }
  }

  /**
   * Execute create child operation
   */
  static async executeCreateChild(operation) {
    try {
      const DynamoDBChildrenService = await getService('DynamoDBChildrenService');
      const result = await DynamoDBChildrenService.createChild(operation.data);
      
      if (result.success) {
        // Update local cache
        await this.updateLocalCache('children', result.child);
        return { success: true, data: result.child };
      } else {
        return { success: false, error: result.error };
      }
    } catch (error) {
      return { success: false, error };
    }
  }

  /**
   * Execute update child operation
   */
  static async executeUpdateChild(operation) {
    try {
      const DynamoDBChildrenService = await getService('DynamoDBChildrenService');
      const result = await DynamoDBChildrenService.updateChild(
        operation.data.childId,
        operation.data.updates
      );
      
      if (result.success) {
        await this.updateLocalCache('children', result.child);
        return { success: true, data: result.child };
      } else if (result.conflict) {
        return { success: false, conflict: true, serverData: result.serverData };
      } else {
        return { success: false, error: result.error };
      }
    } catch (error) {
      return { success: false, error };
    }
  }

  /**
   * Execute delete child operation
   */
  static async executeDeleteChild(operation) {
    try {
      const DynamoDBChildrenService = await getService('DynamoDBChildrenService');
      const result = await DynamoDBChildrenService.deleteChild(operation.data.childId);
      
      if (result.success) {
        await this.removeFromLocalCache('children', operation.data.childId);
        return { success: true };
      } else {
        return { success: false, error: result.error };
      }
    } catch (error) {
      return { success: false, error };
    }
  }

  /**
   * Execute create event operation
   */
  static async executeCreateEvent(operation) {
    try {
      const DynamoDBCalendarService = await getService('DynamoDBCalendarService');
      const result = await DynamoDBCalendarService.createEvent(operation.data);
      
      if (result.success) {
        await this.updateLocalCache('events', result.event);
        return { success: true, data: result.event };
      } else {
        return { success: false, error: result.error };
      }
    } catch (error) {
      return { success: false, error };
    }
  }

  /**
   * Execute update event operation
   */
  static async executeUpdateEvent(operation) {
    try {
      const DynamoDBCalendarService = await getService('DynamoDBCalendarService');
      const result = await DynamoDBCalendarService.updateEvent(
        operation.data.eventId,
        operation.data.updates
      );
      
      if (result.success) {
        await this.updateLocalCache('events', result.event);
        return { success: true, data: result.event };
      } else if (result.conflict) {
        return { success: false, conflict: true, serverData: result.serverData };
      } else {
        return { success: false, error: result.error };
      }
    } catch (error) {
      return { success: false, error };
    }
  }

  /**
   * Execute delete event operation
   */
  static async executeDeleteEvent(operation) {
    try {
      const DynamoDBCalendarService = await getService('DynamoDBCalendarService');
      const result = await DynamoDBCalendarService.deleteEvent(operation.data.eventId);
      
      if (result.success) {
        await this.removeFromLocalCache('events', operation.data.eventId);
        return { success: true };
      } else {
        return { success: false, error: result.error };
      }
    } catch (error) {
      return { success: false, error };
    }
  }

  /**
   * Execute create family time operation
   */
  static async executeCreateFamilyTime(operation) {
    try {
      const DynamoDBService = await getService('DynamoDBService');
      const result = await DynamoDBService.createItem('ParentChildApp-FamilyTimeActivities', operation.data);
      
      if (result.success) {
        await this.updateLocalCache('familyTime', result.item);
        return { success: true, data: result.item };
      } else {
        return { success: false, error: result.error };
      }
    } catch (error) {
      return { success: false, error };
    }
  }

  /**
   * Execute update family time operation
   */
  static async executeUpdateFamilyTime(operation) {
    try {
      const DynamoDBService = await getService('DynamoDBService');
      const result = await DynamoDBService.updateItem(
        'ParentChildApp-FamilyTimeActivities',
        { userId: operation.data.userId, activityId: operation.data.activityId },
        operation.data.updates
      );
      
      if (result.success) {
        await this.updateLocalCache('familyTime', result.item);
        return { success: true, data: result.item };
      } else if (result.conflict) {
        return { success: false, conflict: true, serverData: result.serverData };
      } else {
        return { success: false, error: result.error };
      }
    } catch (error) {
      return { success: false, error };
    }
  }

  /**
   * Execute delete family time operation
   */
  static async executeDeleteFamilyTime(operation) {
    try {
      const DynamoDBService = await getService('DynamoDBService');
      const result = await DynamoDBService.deleteItem(
        'ParentChildApp-FamilyTimeActivities',
        { userId: operation.data.userId, activityId: operation.data.activityId }
      );
      
      if (result.success) {
        await this.removeFromLocalCache('familyTime', operation.data.activityId);
        return { success: true };
      } else {
        return { success: false, error: result.error };
      }
    } catch (error) {
      return { success: false, error };
    }
  }

  /**
   * Execute update user profile operation
   */
  static async executeUpdateUserProfile(operation) {
    try {
      const DynamoDBUserProfileService = await getService('DynamoDBUserProfileService');
      const result = await DynamoDBUserProfileService.updateProfile(
        operation.data.userId,
        operation.data.updates
      );
      
      if (result.success) {
        await this.updateLocalCache('userProfile', result.profile);
        return { success: true, data: result.profile };
      } else if (result.conflict) {
        return { success: false, conflict: true, serverData: result.serverData };
      } else {
        return { success: false, error: result.error };
      }
    } catch (error) {
      return { success: false, error };
    }
  }

  /**
   * Handle failed operation with retry logic
   */
  static async handleFailedOperation(operation, error) {
    operation.retryCount++;
    operation.lastError = error.message || error.toString();
    
    if (operation.retryCount >= operation.maxRetries) {
      operation.status = this.OPERATION_STATUS.FAILED;
    } else {
      operation.status = this.OPERATION_STATUS.PENDING;
      // Add exponential backoff delay
      operation.nextRetryAt = Date.now() + (Math.pow(2, operation.retryCount) * 1000);
    }

    await this.updateQueuedOperation(operation);
  }

  /**
   * Handle conflict resolution
   */
  static async handleConflict(operation, result) {
    operation.status = this.OPERATION_STATUS.CONFLICT;
    operation.conflictData = {
      localData: operation.data,
      serverData: result.serverData,
      timestamp: Date.now()
    };

    await this.updateQueuedOperation(operation);
    
    // Notify conflict listeners
    this.notifyConflictListeners({
      operation,
      localData: operation.data,
      serverData: result.serverData
    });
  }

  /**
   * Resolve conflict with user choice
   */
  static async resolveConflict(operationId, resolution, mergedData = null) {
    try {
      const operations = await OfflineCacheManager.getQueuedOperations();
      const operation = operations.find(op => op.id === operationId);
      
      if (!operation || operation.status !== this.OPERATION_STATUS.CONFLICT) {
        return { success: false, error: 'Operation not found or not in conflict state' };
      }

      switch (resolution) {
        case 'use_local':
          // Retry with local data
          operation.status = this.OPERATION_STATUS.PENDING;
          operation.retryCount = 0;
          delete operation.conflictData;
          await this.updateQueuedOperation(operation);
          break;
          
        case 'use_server':
          // Accept server data and remove operation
          await this.updateLocalCache(this.getDataTypeFromOperation(operation), operation.conflictData.serverData);
          await OfflineCacheManager.removeQueuedOperation(operationId);
          break;
          
        case 'merge':
          // Use merged data
          if (mergedData) {
            operation.data = mergedData;
            operation.status = this.OPERATION_STATUS.PENDING;
            operation.retryCount = 0;
            delete operation.conflictData;
            await this.updateQueuedOperation(operation);
          } else {
            return { success: false, error: 'Merged data required for merge resolution' };
          }
          break;
          
        default:
          return { success: false, error: 'Invalid resolution type' };
      }

      return { success: true };
    } catch (error) {
      console.error('Failed to resolve conflict:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Update queued operation
   */
  static async updateQueuedOperation(operation) {
    try {
      await AsyncStorage.setItem(operation.id, JSON.stringify(operation));
      return true;
    } catch (error) {
      console.error('Failed to update queued operation:', error);
      return false;
    }
  }

  /**
   * Update local cache after successful sync
   */
  static async updateLocalCache(dataType, data) {
    try {
      const cacheKey = `synced_${dataType}`;
      await OfflineCacheManager.cacheData(cacheKey, data);
    } catch (error) {
      console.error('Failed to update local cache:', error);
    }
  }

  /**
   * Remove from local cache
   */
  static async removeFromLocalCache(dataType, itemId) {
    try {
      const cacheKey = `synced_${dataType}`;
      await OfflineCacheManager.removeCachedData(`${cacheKey}_${itemId}`);
    } catch (error) {
      console.error('Failed to remove from local cache:', error);
    }
  }

  /**
   * Get data type from operation
   */
  static getDataTypeFromOperation(operation) {
    if (operation.type.includes('CHILD')) return 'children';
    if (operation.type.includes('EVENT')) return 'events';
    if (operation.type.includes('FAMILY_TIME')) return 'familyTime';
    if (operation.type.includes('USER_PROFILE')) return 'userProfile';
    return 'unknown';
  }

  /**
   * Add sync progress listener
   */
  static addSyncListener(callback) {
    this.syncListeners.push(callback);
    
    return () => {
      this.syncListeners = this.syncListeners.filter(listener => listener !== callback);
    };
  }

  /**
   * Notify sync listeners
   */
  static notifySyncListeners(event) {
    this.syncListeners.forEach(callback => {
      try {
        callback(event);
      } catch (error) {
        console.error('Error in sync listener:', error);
      }
    });
  }

  /**
   * Notify conflict listeners
   */
  static notifyConflictListeners(conflict) {
    // This would be implemented to notify UI components about conflicts
    console.log('Conflict detected:', conflict);
  }

  /**
   * Get sync status
   */
  static getSyncStatus() {
    return {
      inProgress: this.syncInProgress,
      isOnline: NetworkConnectivityService.getOnlineStatus()
    };
  }

  /**
   * Clear all failed operations
   */
  static async clearFailedOperations() {
    try {
      const operations = await OfflineCacheManager.getQueuedOperations();
      const failedOps = operations.filter(op => op.status === this.OPERATION_STATUS.FAILED);
      
      for (const operation of failedOps) {
        await OfflineCacheManager.removeQueuedOperation(operation.id);
      }

      return { success: true, cleared: failedOps.length };
    } catch (error) {
      console.error('Failed to clear failed operations:', error);
      return { success: false, error: error.message };
    }
  }
}

export default OperationQueueService;