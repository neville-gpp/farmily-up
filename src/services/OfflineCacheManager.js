import AsyncStorage from '@react-native-async-storage/async-storage';
import NetworkConnectivityService from './NetworkConnectivityService';

/**
 * Manager for offline data caching and queue management
 */
class OfflineCacheManager {
  static CACHE_PREFIX = 'offline_cache_';
  static QUEUE_PREFIX = 'offline_queue_';
  static CACHE_METADATA_KEY = 'cache_metadata';
  static DEFAULT_TTL = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
  static MAX_CACHE_SIZE = 50; // Maximum number of cached items per type

  /**
   * Cache data with TTL and metadata
   */
  static async cacheData(key, data, ttl = this.DEFAULT_TTL) {
    try {
      const cacheKey = `${this.CACHE_PREFIX}${key}`;
      const cacheItem = {
        data,
        timestamp: Date.now(),
        ttl,
        key
      };

      await AsyncStorage.setItem(cacheKey, JSON.stringify(cacheItem));
      await this.updateCacheMetadata(key, cacheItem);

      return true;
    } catch (error) {
      console.error('Failed to cache data:', error);
      return false;
    }
  }

  /**
   * Get cached data if valid
   */
  static async getCachedData(key) {
    try {
      const cacheKey = `${this.CACHE_PREFIX}${key}`;
      const cachedItem = await AsyncStorage.getItem(cacheKey);

      if (!cachedItem) {
        return null;
      }

      const parsed = JSON.parse(cachedItem);
      const now = Date.now();

      // Check if cache is expired
      if (now - parsed.timestamp > parsed.ttl) {
        await this.removeCachedData(key);
        return null;
      }

      return parsed.data;
    } catch (error) {
      console.error('Failed to get cached data:', error);
      return null;
    }
  }

  /**
   * Remove cached data
   */
  static async removeCachedData(key) {
    try {
      const cacheKey = `${this.CACHE_PREFIX}${key}`;
      await AsyncStorage.removeItem(cacheKey);
      await this.removeCacheMetadata(key);
      return true;
    } catch (error) {
      console.error('Failed to remove cached data:', error);
      return false;
    }
  }

  /**
   * Cache frequently accessed data with intelligent strategies
   */
  static async cacheFrequentData(type, data, accessCount = 1) {
    try {
      const key = `frequent_${type}`;
      const metadata = {
        accessCount,
        lastAccessed: Date.now(),
        priority: this.calculatePriority(accessCount, Date.now())
      };

      // Use longer TTL for frequently accessed data
      const ttl = this.calculateTTL(accessCount);
      
      await this.cacheData(key, { ...data, metadata }, ttl);
      return true;
    } catch (error) {
      console.error('Failed to cache frequent data:', error);
      return false;
    }
  }

  /**
   * Get frequently accessed data and update access count
   */
  static async getFrequentData(type) {
    try {
      const key = `frequent_${type}`;
      const cachedData = await this.getCachedData(key);

      if (cachedData && cachedData.metadata) {
        // Update access count and recache
        const newAccessCount = cachedData.metadata.accessCount + 1;
        await this.cacheFrequentData(type, cachedData, newAccessCount);
        
        return cachedData;
      }

      return cachedData;
    } catch (error) {
      console.error('Failed to get frequent data:', error);
      return null;
    }
  }

  /**
   * Queue operation for offline execution
   */
  static async queueOperation(operation) {
    try {
      const queueKey = `${this.QUEUE_PREFIX}${Date.now()}_${Math.random()}`;
      const queueItem = {
        ...operation,
        id: queueKey,
        timestamp: Date.now(),
        retryCount: 0,
        maxRetries: operation.maxRetries || 3
      };

      await AsyncStorage.setItem(queueKey, JSON.stringify(queueItem));
      return queueKey;
    } catch (error) {
      console.error('Failed to queue operation:', error);
      return null;
    }
  }

  /**
   * Get all queued operations
   */
  static async getQueuedOperations() {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const queueKeys = keys.filter(key => key.startsWith(this.QUEUE_PREFIX));
      
      const operations = [];
      for (const key of queueKeys) {
        const item = await AsyncStorage.getItem(key);
        if (item) {
          operations.push(JSON.parse(item));
        }
      }

      // Sort by timestamp (oldest first)
      return operations.sort((a, b) => a.timestamp - b.timestamp);
    } catch (error) {
      console.error('Failed to get queued operations:', error);
      return [];
    }
  }

  /**
   * Remove operation from queue
   */
  static async removeQueuedOperation(operationId) {
    try {
      await AsyncStorage.removeItem(operationId);
      return true;
    } catch (error) {
      console.error('Failed to remove queued operation:', error);
      return false;
    }
  }

  /**
   * Update cache metadata for management
   */
  static async updateCacheMetadata(key, cacheItem) {
    try {
      const metadata = await this.getCacheMetadata();
      metadata[key] = {
        timestamp: cacheItem.timestamp,
        ttl: cacheItem.ttl,
        size: JSON.stringify(cacheItem.data).length
      };

      await AsyncStorage.setItem(this.CACHE_METADATA_KEY, JSON.stringify(metadata));
    } catch (error) {
      console.error('Failed to update cache metadata:', error);
    }
  }

  /**
   * Remove cache metadata entry
   */
  static async removeCacheMetadata(key) {
    try {
      const metadata = await this.getCacheMetadata();
      delete metadata[key];
      await AsyncStorage.setItem(this.CACHE_METADATA_KEY, JSON.stringify(metadata));
    } catch (error) {
      console.error('Failed to remove cache metadata:', error);
    }
  }

  /**
   * Get cache metadata
   */
  static async getCacheMetadata() {
    try {
      const metadata = await AsyncStorage.getItem(this.CACHE_METADATA_KEY);
      return metadata ? JSON.parse(metadata) : {};
    } catch (error) {
      console.error('Failed to get cache metadata:', error);
      return {};
    }
  }

  /**
   * Clean expired cache entries
   */
  static async cleanExpiredCache() {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const cacheKeys = keys.filter(key => key.startsWith(this.CACHE_PREFIX));
      
      let cleanedCount = 0;
      for (const key of cacheKeys) {
        const item = await AsyncStorage.getItem(key);
        if (item) {
          const parsed = JSON.parse(item);
          const now = Date.now();
          
          if (now - parsed.timestamp > parsed.ttl) {
            await AsyncStorage.removeItem(key);
            await this.removeCacheMetadata(parsed.key);
            cleanedCount++;
          }
        }
      }

      return cleanedCount;
    } catch (error) {
      console.error('Failed to clean expired cache:', error);
      return 0;
    }
  }

  /**
   * Get cache statistics
   */
  static async getCacheStats() {
    try {
      const metadata = await this.getCacheMetadata();
      const keys = Object.keys(metadata);
      
      let totalSize = 0;
      let expiredCount = 0;
      const now = Date.now();

      keys.forEach(key => {
        const item = metadata[key];
        totalSize += item.size;
        if (now - item.timestamp > item.ttl) {
          expiredCount++;
        }
      });

      return {
        totalItems: keys.length,
        totalSize,
        expiredCount,
        averageSize: keys.length > 0 ? totalSize / keys.length : 0
      };
    } catch (error) {
      console.error('Failed to get cache stats:', error);
      return null;
    }
  }

  /**
   * Calculate priority for caching based on access patterns
   */
  static calculatePriority(accessCount, lastAccessed) {
    const recency = Date.now() - lastAccessed;
    const frequency = accessCount;
    
    // Higher frequency and more recent access = higher priority
    return frequency * (1 / (recency + 1));
  }

  /**
   * Calculate TTL based on access frequency
   */
  static calculateTTL(accessCount) {
    // More frequently accessed data gets longer TTL
    const baseTTL = this.DEFAULT_TTL;
    const multiplier = Math.min(accessCount / 10, 3); // Max 3x TTL
    return baseTTL * (1 + multiplier);
  }

  /**
   * Clear all cache data
   */
  static async clearAllCache() {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const cacheKeys = keys.filter(key => 
        key.startsWith(this.CACHE_PREFIX) || key === this.CACHE_METADATA_KEY
      );
      
      await AsyncStorage.multiRemove(cacheKeys);
      return true;
    } catch (error) {
      console.error('Failed to clear all cache:', error);
      return false;
    }
  }

  /**
   * Clear all queued operations
   */
  static async clearAllQueue() {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const queueKeys = keys.filter(key => key.startsWith(this.QUEUE_PREFIX));
      
      await AsyncStorage.multiRemove(queueKeys);
      return true;
    } catch (error) {
      console.error('Failed to clear all queue:', error);
      return false;
    }
  }
}

export default OfflineCacheManager;