/**
 * Performance utilities for Family Time feature optimization
 */

/**
 * Image optimization utilities
 */
export const ImageOptimizer = {
  // Calculate optimal compression settings based on image dimensions
  getOptimalCompressionSettings: (width, height, fileSize) => {
    const totalPixels = width * height;
    const aspectRatio = width / height;
    
    let targetWidth = 1200;
    let compressionQuality = 0.8;
    
    // Adjust based on total pixels
    if (totalPixels > 4000000) { // > 4MP
      targetWidth = 800;
      compressionQuality = 0.7;
    } else if (totalPixels > 2000000) { // > 2MP
      targetWidth = 1000;
      compressionQuality = 0.75;
    }
    
    // Adjust for unusual aspect ratios
    if (aspectRatio > 3 || aspectRatio < 0.33) {
      compressionQuality = Math.max(0.6, compressionQuality - 0.1);
    }
    
    // Adjust based on file size if available
    if (fileSize) {
      const sizeMB = fileSize / (1024 * 1024);
      if (sizeMB > 5) {
        compressionQuality = Math.max(0.6, compressionQuality - 0.1);
        targetWidth = Math.min(targetWidth, 800);
      }
    }
    
    return {
      targetWidth,
      compressionQuality,
      shouldCompress: width > targetWidth || height > targetWidth || compressionQuality < 0.8
    };
  },

  // Estimate compressed file size
  estimateCompressedSize: (originalSize, compressionRatio, dimensionRatio) => {
    if (!originalSize) return null;
    
    // Rough estimation: file size scales with pixel count and compression
    const pixelReduction = dimensionRatio * dimensionRatio;
    const compressionReduction = compressionRatio;
    
    return Math.round(originalSize * pixelReduction * compressionReduction);
  }
};

/**
 * Memory management utilities
 */
export const MemoryManager = {
  // Check if device has sufficient memory for operation
  checkMemoryAvailability: () => {
    // This is a placeholder - React Native doesn't provide direct memory access
    // In a real implementation, you might use a native module
    return true;
  },

  // Clean up temporary resources
  cleanupTempResources: async () => {
    // Placeholder for cleanup operations
    console.log('Cleaning up temporary resources...');
  }
};

/**
 * Performance monitoring utilities
 */
export const PerformanceMonitor = {
  // Start timing an operation
  startTimer: (operationName) => {
    const startTime = Date.now();
    console.log(`⏱️ Starting ${operationName}...`);
    
    return {
      end: () => {
        const endTime = Date.now();
        const duration = endTime - startTime;
        console.log(`⏱️ ${operationName} completed in ${duration}ms`);
        return duration;
      }
    };
  },

  // Log performance metrics
  logPerformanceMetrics: (operation, metrics) => {
    console.log(`📊 Performance Metrics for ${operation}:`, {
      ...metrics,
      timestamp: new Date().toISOString()
    });
  }
};

/**
 * Cache management utilities
 */
export const CacheManager = {
  // Calculate cache size limits based on available storage
  getCacheLimits: () => {
    return {
      maxCacheSize: 50 * 1024 * 1024, // 50MB max cache
      maxCacheAge: 24 * 60 * 60 * 1000, // 24 hours
      maxCacheEntries: 100
    };
  },

  // Generate consistent cache keys (React Native compatible)
  generateCacheKey: (input) => {
    try {
      // Simple hash function for cache keys
      let hash = 0;
      const str = typeof input === 'string' ? input : JSON.stringify(input);
      
      for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
      }
      
      return `cache_${Math.abs(hash).toString(36)}`;
    } catch (error) {
      // Fallback to timestamp-based key
      return `cache_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 5)}`;
    }
  }
};

/**
 * Debouncing utility for API calls
 */
export class Debouncer {
  constructor(delay = 1000) {
    this.delay = delay;
    this.timeouts = new Map();
    this.promises = new Map();
  }

  // Debounce a function call
  debounce(key, fn) {
    // Clear existing timeout
    if (this.timeouts.has(key)) {
      clearTimeout(this.timeouts.get(key));
    }

    // Return existing promise if one exists
    if (this.promises.has(key)) {
      return this.promises.get(key);
    }

    // Create new promise
    const promise = new Promise((resolve, reject) => {
      const timeout = setTimeout(async () => {
        try {
          this.timeouts.delete(key);
          this.promises.delete(key);
          const result = await fn();
          resolve(result);
        } catch (error) {
          this.promises.delete(key);
          reject(error);
        }
      }, this.delay);

      this.timeouts.set(key, timeout);
    });

    this.promises.set(key, promise);
    return promise;
  }

  // Clear all pending operations
  clear() {
    for (const timeout of this.timeouts.values()) {
      clearTimeout(timeout);
    }
    this.timeouts.clear();
    this.promises.clear();
  }
}

/**
 * Pagination utilities
 */
export const PaginationHelper = {
  // Calculate pagination parameters
  calculatePagination: (totalItems, currentPage, itemsPerPage) => {
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, totalItems);
    const hasNextPage = currentPage < totalPages;
    const hasPrevPage = currentPage > 1;

    return {
      totalPages,
      startIndex,
      endIndex,
      hasNextPage,
      hasPrevPage,
      itemsOnCurrentPage: endIndex - startIndex
    };
  },

  // Get items for current page
  getPageItems: (items, currentPage, itemsPerPage) => {
    const { startIndex, endIndex } = PaginationHelper.calculatePagination(
      items.length, 
      currentPage, 
      itemsPerPage
    );
    return items.slice(startIndex, endIndex);
  }
};

/**
 * Network optimization utilities
 */
export const NetworkOptimizer = {
  // Check network conditions and adjust behavior
  getNetworkOptimizedSettings: () => {
    // In a real implementation, you might check network type and speed
    return {
      enableImageCompression: true,
      enableCaching: true,
      maxConcurrentRequests: 3,
      requestTimeout: 30000
    };
  },

  // Batch multiple requests for efficiency
  batchRequests: async (requests, batchSize = 3) => {
    const results = [];
    
    for (let i = 0; i < requests.length; i += batchSize) {
      const batch = requests.slice(i, i + batchSize);
      const batchResults = await Promise.allSettled(batch);
      results.push(...batchResults);
    }
    
    return results;
  }
};

export default {
  ImageOptimizer,
  MemoryManager,
  PerformanceMonitor,
  CacheManager,
  Debouncer,
  PaginationHelper,
  NetworkOptimizer
};