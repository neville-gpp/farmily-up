import ChildrenDataService from '../services/ChildrenDataService';
import ImageUtils from './imageUtils';

/**
 * Migration utility to convert existing child photos from file URIs to base64
 */
class PhotoMigration {
  /**
   * Check if migration is needed
   * @returns {Promise<{needsMigration: boolean, childrenCount: number, photosToMigrate: number}>}
   */
  static async checkMigrationNeeded() {
    try {
      const children = await ChildrenDataService.getChildren();
      let photosToMigrate = 0;

      for (const child of children) {
        if (child.photo && !ImageUtils.isValidBase64Image(child.photo)) {
          photosToMigrate++;
        }
      }

      return {
        needsMigration: photosToMigrate > 0,
        childrenCount: children.length,
        photosToMigrate
      };
    } catch (error) {
      console.error('Error checking migration status:', error);
      return {
        needsMigration: false,
        childrenCount: 0,
        photosToMigrate: 0,
        error: error.message
      };
    }
  }

  /**
   * Migrate all child photos to base64 format
   * @param {Function} onProgress - Progress callback (current, total, childName)
   * @returns {Promise<{success: boolean, migratedCount: number, errors: Array}>}
   */
  static async migratePhotosToBase64(onProgress = null) {
    const results = {
      success: true,
      migratedCount: 0,
      errors: [],
      skippedCount: 0
    };

    try {
      const children = await ChildrenDataService.getChildren();
      const childrenWithPhotos = children.filter(child => 
        child.photo && !ImageUtils.isValidBase64Image(child.photo)
      );

      console.log(`Starting photo migration for ${childrenWithPhotos.length} children`);

      for (let i = 0; i < childrenWithPhotos.length; i++) {
        const child = childrenWithPhotos[i];
        
        try {
          if (onProgress) {
            onProgress(i + 1, childrenWithPhotos.length, child.firstName || child.nickname || 'Unknown');
          }

          console.log(`Migrating photo for child: ${child.firstName || child.nickname}`);

          // Check if the file still exists (for file:// URIs)
          if (child.photo.startsWith('file://')) {
            try {
              // Try to encode the image
              const base64Image = await ImageUtils.encodeImageToBase64(child.photo);
              
              // Compress if needed
              const compressedBase64 = await ImageUtils.compressBase64Image(base64Image);

              // Update the child record
              const updateSuccess = await ChildrenDataService.updateChild(child.id, {
                photo: compressedBase64
              });

              if (updateSuccess) {
                results.migratedCount++;
                console.log(`✅ Successfully migrated photo for ${child.firstName || child.nickname}`);
              } else {
                throw new Error('Failed to update child record');
              }
            } catch (fileError) {
              console.warn(`⚠️ File not accessible for ${child.firstName || child.nickname}, removing photo reference`);
              
              // Remove the invalid photo reference
              await ChildrenDataService.updateChild(child.id, {
                photo: null
              });
              
              results.skippedCount++;
              results.errors.push({
                childId: child.id,
                childName: child.firstName || child.nickname,
                error: 'File not accessible, photo reference removed',
                action: 'removed'
              });
            }
          } else {
            // For other URI types, try to process them
            try {
              const base64Image = await ImageUtils.encodeImageToBase64(child.photo);
              const compressedBase64 = await ImageUtils.compressBase64Image(base64Image);

              const updateSuccess = await ChildrenDataService.updateChild(child.id, {
                photo: compressedBase64
              });

              if (updateSuccess) {
                results.migratedCount++;
                console.log(`✅ Successfully migrated photo for ${child.firstName || child.nickname}`);
              } else {
                throw new Error('Failed to update child record');
              }
            } catch (processError) {
              console.error(`❌ Failed to process photo for ${child.firstName || child.nickname}:`, processError);
              results.errors.push({
                childId: child.id,
                childName: child.firstName || child.nickname,
                error: processError.message,
                action: 'failed'
              });
            }
          }
        } catch (error) {
          console.error(`❌ Error migrating photo for child ${child.id}:`, error);
          results.errors.push({
            childId: child.id,
            childName: child.firstName || child.nickname || 'Unknown',
            error: error.message,
            action: 'failed'
          });
          results.success = false;
        }
      }

      console.log(`Migration complete: ${results.migratedCount} migrated, ${results.skippedCount} skipped, ${results.errors.length} errors`);

    } catch (error) {
      console.error('Error during photo migration:', error);
      results.success = false;
      results.errors.push({
        error: error.message,
        action: 'migration_failed'
      });
    }

    return results;
  }

  /**
   * Validate all child photos are in base64 format
   * @returns {Promise<{valid: boolean, invalidPhotos: Array, totalPhotos: number}>}
   */
  static async validatePhotoMigration() {
    try {
      const children = await ChildrenDataService.getChildren();
      const invalidPhotos = [];
      let totalPhotos = 0;

      for (const child of children) {
        if (child.photo) {
          totalPhotos++;
          if (!ImageUtils.isValidBase64Image(child.photo)) {
            invalidPhotos.push({
              childId: child.id,
              childName: child.firstName || child.nickname || 'Unknown',
              photoType: child.photo.startsWith('file://') ? 'file_uri' : 
                         child.photo.startsWith('content://') ? 'content_uri' : 
                         child.photo.startsWith('http') ? 'http_uri' : 'unknown'
            });
          }
        }
      }

      return {
        valid: invalidPhotos.length === 0,
        invalidPhotos,
        totalPhotos,
        validPhotos: totalPhotos - invalidPhotos.length
      };
    } catch (error) {
      console.error('Error validating photo migration:', error);
      return {
        valid: false,
        error: error.message,
        invalidPhotos: [],
        totalPhotos: 0,
        validPhotos: 0
      };
    }
  }

  /**
   * Get migration statistics
   * @returns {Promise<Object>} Migration statistics
   */
  static async getMigrationStats() {
    try {
      const children = await ChildrenDataService.getChildren();
      const stats = {
        totalChildren: children.length,
        childrenWithPhotos: 0,
        base64Photos: 0,
        fileUriPhotos: 0,
        otherUriPhotos: 0,
        invalidPhotos: 0,
        totalPhotoSize: 0
      };

      for (const child of children) {
        if (child.photo) {
          stats.childrenWithPhotos++;
          
          if (ImageUtils.isValidBase64Image(child.photo)) {
            stats.base64Photos++;
            stats.totalPhotoSize += ImageUtils.getBase64ImageSize(child.photo);
          } else if (child.photo.startsWith('file://')) {
            stats.fileUriPhotos++;
          } else if (child.photo.startsWith('content://') || child.photo.startsWith('http')) {
            stats.otherUriPhotos++;
          } else {
            stats.invalidPhotos++;
          }
        }
      }

      return stats;
    } catch (error) {
      console.error('Error getting migration stats:', error);
      return {
        error: error.message,
        totalChildren: 0,
        childrenWithPhotos: 0,
        base64Photos: 0,
        fileUriPhotos: 0,
        otherUriPhotos: 0,
        invalidPhotos: 0,
        totalPhotoSize: 0
      };
    }
  }
}

export default PhotoMigration;