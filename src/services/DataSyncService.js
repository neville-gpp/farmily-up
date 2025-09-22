import AsyncStorage from '@react-native-async-storage/async-storage';
import NetworkConnectivityService from './NetworkConnectivityService';
import OperationQueueService from './OperationQueueService';
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
 * Service for coordinating data synchronization across devices
 */
class DataSyncService {
  static SYNC_KEYS = {
    LAST_SYNC: 'last_sync_timestamp',
    SYNC_STATUS: 'sync_status',
    DEVICE_ID: 'device_id'
  };

  static syncListeners = [];
  static autoSyncEnabled = true;
  static syncInterval = null;

  /**
   * Initialize sync service
   */
  static async initialize() {
    try {
      // Generate or retrieve device ID
      await this.ensureDeviceId();
      
      // Set up network connectivity listener
      NetworkConnectivityService.addConnectivityListener(async (isOnline) => {
        if (isOnline && this.autoSyncEnabled) {
          await this.performFullSync();
        }
      });

      // Start periodic sync if online
      if (NetworkConnectivityService.getOnlineStatus()) {
        this.startPeriodicSync();
      }

      return true;
    } catch (error) {
      console.error('Failed to initialize sync service:', error);
      return false;
    }
  }

  /**
   * Perform full data synchronization
   */
  static async performFullSync(userId) {
    try {
      if (!NetworkConnectivityService.getOnlineStatus()) {
        return { success: false, reason: 'offline' };
      }

      this.notifySyncListeners({ type: 'sync_started', stage: 'full' });

      // Step 1: Sync pending operations
      const queueResult = await OperationQueueService.syncPendingOperations();
      
      // Step 2: Pull latest data from server
      const pullResult = await this.pullLatestData(userId);
      
      // Step 3: Update last sync timestamp
      await this.updateLastSyncTimestamp();

      const result = {
        success: true,
        queueSync: queueResult,
        dataPull: pullResult,
        timestamp: Date.now()
      };

      this.notifySyncListeners({ type: 'sync_completed', result });
      return result;
    } catch (error) {
      console.error('Full sync failed:', error);
      this.notifySyncListeners({ type: 'sync_error', error: error.message });
      return { success: false, error: error.message };
    }
  }

  /**
   * Pull latest data from server
   */
  static async pullLatestData(userId) {
    try {
      const lastSync = await this.getLastSyncTimestamp();
      const results = {};

      // Pull children data
      results.children = await this.pullChildren(userId, lastSync);
      
      // Pull calendar events
      results.events = await this.pullEvents(userId, lastSync);
      
      // Pull family time activities
      results.familyTime = await this.pullFamilyTime(userId, lastSync);
      
      // Pull user profile
      results.userProfile = await this.pullUserProfile(userId, lastSync);

      return { success: true, results };
    } catch (error) {
      console.error('Failed to pull latest data:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Pull children data from server
   */
  static async pullChildren(userId, lastSync) {
    try {
      const DynamoDBChildrenService = await getService('DynamoDBChildrenService');
      const result = await DynamoDBChildrenService.getChildren(userId, { since: lastSync });
      
      if (result.success && result.children.length > 0) {
        // Cache the updated children data
        await OfflineCacheManager.cacheData('children', result.children);
        
        // Check for conflicts with local changes
        const conflicts = await this.detectChildrenConflicts(result.children);
        
        return { 
          success: true, 
          count: result.children.length,
          conflicts: conflicts.length,
          data: result.children 
        };
      }
      
      return { success: true, count: 0, conflicts: 0 };
    } catch (error) {
      console.error('Failed to pull children data:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Pull calendar events from server
   */
  static async pullEvents(userId, lastSync) {
    try {
      const DynamoDBCalendarService = await getService('DynamoDBCalendarService');
      const result = await DynamoDBCalendarService.getEvents(userId, { since: lastSync });
      
      if (result.success && result.events.length > 0) {
        await OfflineCacheManager.cacheData('events', result.events);
        const conflicts = await this.detectEventsConflicts(result.events);
        
        return { 
          success: true, 
          count: result.events.length,
          conflicts: conflicts.length,
          data: result.events 
        };
      }
      
      return { success: true, count: 0, conflicts: 0 };
    } catch (error) {
      console.error('Failed to pull events data:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Pull family time activities from server
   */
  static async pullFamilyTime(userId, lastSync) {
    try {
      const DynamoDBService = await getService('DynamoDBService');
      const result = await DynamoDBService.queryItems(
        'ParentChildApp-FamilyTimeActivities',
        'userId = :userId AND updatedAt > :since',
        {
          ExpressionAttributeValues: {
            ':userId': userId,
            ':since': lastSync || '1970-01-01T00:00:00.000Z'
          }
        }
      );
      
      if (result.success && result.items.length > 0) {
        await OfflineCacheManager.cacheData('familyTime', result.items);
        const conflicts = await this.detectFamilyTimeConflicts(result.items);
        
        return { 
          success: true, 
          count: result.items.length,
          conflicts: conflicts.length,
          data: result.items 
        };
      }
      
      return { success: true, count: 0, conflicts: 0 };
    } catch (error) {
      console.error('Failed to pull family time data:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Pull user profile from server
   */
  static async pullUserProfile(userId, lastSync) {
    try {
      const DynamoDBUserProfileService = await getService('DynamoDBUserProfileService');
      const result = await DynamoDBUserProfileService.getProfile(userId);
      
      if (result.success && result.profile) {
        // Check if profile was updated since last sync
        const profileUpdated = new Date(result.profile.updatedAt);
        const lastSyncDate = new Date(lastSync || '1970-01-01T00:00:00.000Z');
        
        if (profileUpdated > lastSyncDate) {
          await OfflineCacheManager.cacheData('userProfile', result.profile);
          const conflicts = await this.detectUserProfileConflicts(result.profile);
          
          return { 
            success: true, 
            updated: true,
            conflicts: conflicts.length,
            data: result.profile 
          };
        }
      }
      
      return { success: true, updated: false, conflicts: 0 };
    } catch (error) {
      console.error('Failed to pull user profile:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Detect conflicts in children data
   */
  static async detectChildrenConflicts(serverChildren) {
    try {
      const localChildren = await OfflineCacheManager.getCachedData('children') || [];
      const conflicts = [];

      for (const serverChild of serverChildren) {
        const localChild = localChildren.find(c => c.childId === serverChild.childId);
        
        if (localChild && this.hasDataConflict(localChild, serverChild)) {
          conflicts.push({
            type: 'child',
            id: serverChild.childId,
            local: localChild,
            server: serverChild
          });
        }
      }

      return conflicts;
    } catch (error) {
      console.error('Failed to detect children conflicts:', error);
      return [];
    }
  }

  /**
   * Detect conflicts in events data
   */
  static async detectEventsConflicts(serverEvents) {
    try {
      const localEvents = await OfflineCacheManager.getCachedData('events') || [];
      const conflicts = [];

      for (const serverEvent of serverEvents) {
        const localEvent = localEvents.find(e => e.eventId === serverEvent.eventId);
        
        if (localEvent && this.hasDataConflict(localEvent, serverEvent)) {
          conflicts.push({
            type: 'event',
            id: serverEvent.eventId,
            local: localEvent,
            server: serverEvent
          });
        }
      }

      return conflicts;
    } catch (error) {
      console.error('Failed to detect events conflicts:', error);
      return [];
    }
  }

  /**
   * Detect conflicts in family time data
   */
  static async detectFamilyTimeConflicts(serverActivities) {
    try {
      const localActivities = await OfflineCacheManager.getCachedData('familyTime') || [];
      const conflicts = [];

      for (const serverActivity of serverActivities) {
        const localActivity = localActivities.find(a => a.activityId === serverActivity.activityId);
        
        if (localActivity && this.hasDataConflict(localActivity, serverActivity)) {
          conflicts.push({
            type: 'familyTime',
            id: serverActivity.activityId,
            local: localActivity,
            server: serverActivity
          });
        }
      }

      return conflicts;
    } catch (error) {
      console.error('Failed to detect family time conflicts:', error);
      return [];
    }
  }

  /**
   * Detect conflicts in user profile data
   */
  static async detectUserProfileConflicts(serverProfile) {
    try {
      const localProfile = await OfflineCacheManager.getCachedData('userProfile');
      
      if (localProfile && this.hasDataConflict(localProfile, serverProfile)) {
        return [{
          type: 'userProfile',
          id: serverProfile.userId,
          local: localProfile,
          server: serverProfile
        }];
      }

      return [];
    } catch (error) {
      console.error('Failed to detect user profile conflicts:', error);
      return [];
    }
  }

  /**
   * Check if two data objects have conflicts
   */
  static hasDataConflict(localData, serverData) {
    // Compare version numbers if available
    if (localData.version && serverData.version) {
      return localData.version !== serverData.version;
    }

    // Compare update timestamps
    if (localData.updatedAt && serverData.updatedAt) {
      const localTime = new Date(localData.updatedAt);
      const serverTime = new Date(serverData.updatedAt);
      
      // Consider it a conflict if both were updated within the same minute
      // but have different content
      const timeDiff = Math.abs(localTime - serverTime);
      if (timeDiff < 60000) { // 1 minute
        return JSON.stringify(localData) !== JSON.stringify(serverData);
      }
    }

    return false;
  }

  /**
   * Start periodic sync
   */
  static startPeriodicSync(intervalMinutes = 15) {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }

    this.syncInterval = setInterval(async () => {
      if (NetworkConnectivityService.getOnlineStatus() && this.autoSyncEnabled) {
        await OperationQueueService.syncPendingOperations();
      }
    }, intervalMinutes * 60 * 1000);
  }

  /**
   * Stop periodic sync
   */
  static stopPeriodicSync() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  /**
   * Enable/disable auto sync
   */
  static setAutoSync(enabled) {
    this.autoSyncEnabled = enabled;
    
    if (enabled && NetworkConnectivityService.getOnlineStatus()) {
      this.startPeriodicSync();
    } else {
      this.stopPeriodicSync();
    }
  }

  /**
   * Get last sync timestamp
   */
  static async getLastSyncTimestamp() {
    try {
      const timestamp = await AsyncStorage.getItem(this.SYNC_KEYS.LAST_SYNC);
      return timestamp || null;
    } catch (error) {
      console.error('Failed to get last sync timestamp:', error);
      return null;
    }
  }

  /**
   * Update last sync timestamp
   */
  static async updateLastSyncTimestamp() {
    try {
      const timestamp = new Date().toISOString();
      await AsyncStorage.setItem(this.SYNC_KEYS.LAST_SYNC, timestamp);
      return timestamp;
    } catch (error) {
      console.error('Failed to update last sync timestamp:', error);
      return null;
    }
  }

  /**
   * Ensure device has unique ID
   */
  static async ensureDeviceId() {
    try {
      let deviceId = await AsyncStorage.getItem(this.SYNC_KEYS.DEVICE_ID);
      
      if (!deviceId) {
        deviceId = `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        await AsyncStorage.setItem(this.SYNC_KEYS.DEVICE_ID, deviceId);
      }

      return deviceId;
    } catch (error) {
      console.error('Failed to ensure device ID:', error);
      return null;
    }
  }

  /**
   * Get sync statistics
   */
  static async getSyncStats() {
    try {
      const lastSync = await this.getLastSyncTimestamp();
      const queuedOps = await OfflineCacheManager.getQueuedOperations();
      const cacheStats = await OfflineCacheManager.getCacheStats();

      return {
        lastSync,
        pendingOperations: queuedOps.length,
        failedOperations: queuedOps.filter(op => op.status === 'FAILED').length,
        conflictOperations: queuedOps.filter(op => op.status === 'CONFLICT').length,
        cacheStats,
        autoSyncEnabled: this.autoSyncEnabled,
        isOnline: NetworkConnectivityService.getOnlineStatus()
      };
    } catch (error) {
      console.error('Failed to get sync stats:', error);
      return null;
    }
  }

  /**
   * Add sync listener
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
   * Force sync now
   */
  static async forceSyncNow(userId) {
    if (!NetworkConnectivityService.getOnlineStatus()) {
      return { success: false, reason: 'offline' };
    }

    return await this.performFullSync(userId);
  }

  /**
   * Reset sync state
   */
  static async resetSyncState() {
    try {
      await AsyncStorage.removeItem(this.SYNC_KEYS.LAST_SYNC);
      await AsyncStorage.removeItem(this.SYNC_KEYS.SYNC_STATUS);
      await OfflineCacheManager.clearAllQueue();
      
      return { success: true };
    } catch (error) {
      console.error('Failed to reset sync state:', error);
      return { success: false, error: error.message };
    }
  }
}

export default DataSyncService;