import * as FileSystem from 'expo-file-system';

/**
 * Utility functions for handling image encoding/decoding
 */
class ImageUtils {
  // Temp file registry to track files by component instance
  static tempFileRegistry = new Map();

  /**
   * Generate a unique filename using instanceId and timestamp
   * @param {string} instanceId - Unique identifier for the component instance
   * @param {string} base64String - Base64 string to generate hash from
   * @returns {string} Unique filename
   */
  static generateUniqueFileName(instanceId, base64String) {
    try {
      const timestamp = Date.now();
      const randomSuffix = Math.random().toString(36).substring(2, 8);
      
      // Create a simple hash from the base64 string for uniqueness
      let hash = 0;
      if (base64String && base64String.length > 0) {
        const dataToHash = base64String.substring(0, 100); // Use first 100 chars for performance
        for (let i = 0; i < dataToHash.length; i++) {
          const char = dataToHash.charCodeAt(i);
          hash = ((hash << 5) - hash) + char;
          hash = hash & hash; // Convert to 32-bit integer
        }
      }
      
      const format = this.getImageFormatFromDataUrl(base64String.split(',')[0] || '');
      return `temp_${instanceId}_${timestamp}_${Math.abs(hash)}_${randomSuffix}.${format}`;
    } catch (error) {
      console.error('Error generating unique filename:', error);
      // Fallback to basic unique name
      const timestamp = Date.now();
      const randomSuffix = Math.random().toString(36).substring(2, 8);
      return `temp_${instanceId}_${timestamp}_${randomSuffix}.jpg`;
    }
  }

  /**
   * Track a temporary file for a specific component instance
   * @param {string} instanceId - Component instance identifier
   * @param {string} filePath - Path to the temporary file
   */
  static trackTempFile(instanceId, filePath) {
    try {
      if (!this.tempFileRegistry.has(instanceId)) {
        this.tempFileRegistry.set(instanceId, {
          files: [],
          createdAt: Date.now(),
          lastAccessed: Date.now()
        });
      }

      const instanceData = this.tempFileRegistry.get(instanceId);
      instanceData.files.push(filePath);
      instanceData.lastAccessed = Date.now();
    } catch (error) {
      console.error('Error tracking temp file:', error);
    }
  }

  /**
   * Clean up all temporary files for a specific component instance
   * @param {string} instanceId - Component instance identifier
   * @returns {Promise<void>}
   */
  static async cleanupInstanceFiles(instanceId) {
    try {
      const instanceData = this.tempFileRegistry.get(instanceId);
      if (!instanceData) {
        return;
      }

      // Clean up all files for this instance
      const cleanupPromises = instanceData.files.map(async (filePath) => {
        try {
          await FileSystem.deleteAsync(filePath, { idempotent: true });
        } catch (error) {
          console.warn(`[ImageUtils] Error cleaning up temp file ${filePath}:`, error);
        }
      });

      await Promise.all(cleanupPromises);

      // Remove the instance from registry
      this.tempFileRegistry.delete(instanceId);
      
    } catch (error) {
      console.error(`Error cleaning up instance files for ${instanceId}:`, error);
    }
  }
  /**
   * Convert image URI to base64 string
   * @param {string} imageUri - The image URI (file:// or content://)
   * @returns {Promise<string>} Base64 encoded image string with data URL prefix
   */
  static async encodeImageToBase64(imageUri) {
    try {
      if (!imageUri) {
        return null;
      }

      // If it's already a base64 string, return as is
      if (imageUri.startsWith('data:image/')) {
        return imageUri;
      }

      // Read the file as base64
      const base64 = await FileSystem.readAsStringAsync(imageUri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Determine the image format from the URI
      const imageFormat = this.getImageFormatFromUri(imageUri);
      
      // Return with proper data URL prefix
      return `data:image/${imageFormat};base64,${base64}`;
    } catch (error) {
      console.error('Error encoding image to base64:', error);
      throw new Error(`Failed to encode image: ${error.message}`);
    }
  }

  /**
   * Convert base64 string to temporary file URI for display
   * @param {string} base64String - Base64 encoded image string
   * @param {string} instanceId - Optional unique identifier for the component instance
   * @returns {Promise<string>} Temporary file URI
   */
  static async decodeBase64ToUri(base64String, instanceId = null) {
    try {
      if (!base64String) {
        return null;
      }

      // If it's already a file URI, return as is
      if (base64String.startsWith('file://') || base64String.startsWith('content://')) {
        return base64String;
      }

      // If it's not a base64 data URL, return as is (might be a regular URI)
      if (!base64String.startsWith('data:image/')) {
        return base64String;
      }

      // Extract the base64 data and format
      const [header, base64Data] = base64String.split(',');
      
      // Generate unique filename using instanceId if provided
      let filename;
      if (instanceId) {
        filename = this.generateUniqueFileName(instanceId, base64String);
      } else {
        // Fallback to timestamp-based naming for backward compatibility
        const format = this.getImageFormatFromDataUrl(header);
        filename = `temp_image_${Date.now()}.${format}`;
      }
      
      const fileUri = `${FileSystem.cacheDirectory}${filename}`;

      // Write the base64 data to the temporary file
      await FileSystem.writeAsStringAsync(fileUri, base64Data, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Track the file if instanceId is provided
      if (instanceId) {
        this.trackTempFile(instanceId, fileUri);
      }

      return fileUri;
    } catch (error) {
      console.error('Error decoding base64 to URI:', error);
      // Return the original string if decoding fails
      return base64String;
    }
  }

  /**
   * Get image format from URI
   * @param {string} uri - Image URI
   * @returns {string} Image format (jpg, png, etc.)
   */
  static getImageFormatFromUri(uri) {
    const extension = uri.split('.').pop()?.toLowerCase();
    switch (extension) {
      case 'jpg':
      case 'jpeg':
        return 'jpeg';
      case 'png':
        return 'png';
      case 'gif':
        return 'gif';
      case 'webp':
        return 'webp';
      default:
        return 'jpeg'; // Default to JPEG
    }
  }

  /**
   * Get image format from data URL header
   * @param {string} header - Data URL header (e.g., "data:image/jpeg;base64")
   * @returns {string} Image format
   */
  static getImageFormatFromDataUrl(header) {
    const match = header.match(/data:image\/([^;]+)/);
    if (match) {
      return match[1] === 'jpeg' ? 'jpg' : match[1];
    }
    return 'jpg'; // Default to JPG
  }

  /**
   * Validate if a string is a valid base64 image
   * @param {string} str - String to validate
   * @returns {boolean} True if valid base64 image
   */
  static isValidBase64Image(str) {
    if (!str || typeof str !== 'string') {
      return false;
    }

    // Check if it's a data URL
    if (str.startsWith('data:image/')) {
      const [header, base64Data] = str.split(',');
      if (!base64Data) {
        return false;
      }

      // Basic base64 validation
      const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
      return base64Regex.test(base64Data);
    }

    return false;
  }

  /**
   * Get the size of a base64 image in bytes
   * @param {string} base64String - Base64 encoded image string
   * @returns {number} Size in bytes
   */
  static getBase64ImageSize(base64String) {
    if (!base64String || !base64String.startsWith('data:image/')) {
      return 0;
    }

    const [, base64Data] = base64String.split(',');
    if (!base64Data) {
      return 0;
    }

    // Calculate size: base64 encoding increases size by ~33%
    // So actual size = (base64Length * 3) / 4
    return Math.floor((base64Data.length * 3) / 4);
  }

  /**
   * Compress base64 image if it's too large
   * @param {string} base64String - Base64 encoded image string
   * @param {number} maxSizeBytes - Maximum size in bytes (default: 5MB)
   * @returns {Promise<string>} Compressed base64 image string
   */
  static async compressBase64Image(base64String, maxSizeBytes = 5 * 1024 * 1024) {
    try {
      const currentSize = this.getBase64ImageSize(base64String);
      
      if (currentSize <= maxSizeBytes) {
        return base64String;
      }

      console.log(`Image size (${currentSize} bytes) exceeds limit (${maxSizeBytes} bytes), compressing...`);

      // Convert to temporary file for compression (use compression instanceId)
      const compressionInstanceId = `compression_${Date.now()}`;
      const tempUri = await this.decodeBase64ToUri(base64String, compressionInstanceId);
      
      // Use ImageManipulator to compress
      const ImageManipulator = require('expo-image-manipulator');
      
      // Calculate compression ratio
      const compressionRatio = Math.max(0.1, maxSizeBytes / currentSize);
      const quality = Math.min(0.8, compressionRatio);

      const compressedImage = await ImageManipulator.manipulateAsync(
        tempUri,
        [], // No resize, just compress
        { 
          compress: quality, 
          format: ImageManipulator.SaveFormat.JPEG 
        }
      );

      // Convert back to base64
      const compressedBase64 = await this.encodeImageToBase64(compressedImage.uri);

      // Clean up temporary files
      try {
        await this.cleanupInstanceFiles(compressionInstanceId);
        await FileSystem.deleteAsync(compressedImage.uri, { idempotent: true });
      } catch (cleanupError) {
        console.warn('Error cleaning up temporary files:', cleanupError);
      }

      const newSize = this.getBase64ImageSize(compressedBase64);
      console.log(`Image compressed from ${currentSize} to ${newSize} bytes`);

      return compressedBase64;
    } catch (error) {
      console.error('Error compressing base64 image:', error);
      // Return original if compression fails
      return base64String;
    }
  }

  /**
   * Clean up temporary image files
   * @param {string} uri - File URI to clean up
   */
  static async cleanupTempFile(uri) {
    try {
      if (uri && uri.startsWith(FileSystem.cacheDirectory)) {
        await FileSystem.deleteAsync(uri, { idempotent: true });
      }
    } catch (error) {
      console.warn('Error cleaning up temp file:', error);
    }
  }

  /**
   * Get registry information for debugging
   * @returns {Object} Current state of temp file registry
   */
  static getTempFileRegistryInfo() {
    const info = {
      totalInstances: this.tempFileRegistry.size,
      instances: {}
    };

    for (const [instanceId, data] of this.tempFileRegistry.entries()) {
      info.instances[instanceId] = {
        fileCount: data.files.length,
        createdAt: new Date(data.createdAt).toISOString(),
        lastAccessed: new Date(data.lastAccessed).toISOString(),
        files: data.files
      };
    }

    return info;
  }

  /**
   * Clean up all temporary files (useful for app cleanup)
   * @returns {Promise<void>}
   */
  static async cleanupAllTempFiles() {
    try {
      console.log('[ImageUtils] Starting cleanup of all temp files');
      const instances = Array.from(this.tempFileRegistry.keys());
      
      for (const instanceId of instances) {
        await this.cleanupInstanceFiles(instanceId);
      }

      console.log('[ImageUtils] Completed cleanup of all temp files');
    } catch (error) {
      console.error('Error cleaning up all temp files:', error);
    }
  }

  /**
   * Clean up old temporary files based on age
   * @param {number} maxAgeMs - Maximum age in milliseconds (default: 1 hour)
   * @returns {Promise<void>}
   */
  static async cleanupOldTempFiles(maxAgeMs = 60 * 60 * 1000) {
    try {
      const now = Date.now();
      const instancesToCleanup = [];

      for (const [instanceId, data] of this.tempFileRegistry.entries()) {
        if (now - data.lastAccessed > maxAgeMs) {
          instancesToCleanup.push(instanceId);
        }
      }

      console.log(`[ImageUtils] Cleaning up ${instancesToCleanup.length} old temp file instances`);

      for (const instanceId of instancesToCleanup) {
        await this.cleanupInstanceFiles(instanceId);
      }
    } catch (error) {
      console.error('Error cleaning up old temp files:', error);
    }
  }
}

export default ImageUtils;