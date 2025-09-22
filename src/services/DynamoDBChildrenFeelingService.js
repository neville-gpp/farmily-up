import { DynamoDBService } from './DynamoDBService';
import AuthenticationService from './AuthenticationService';
import DataEncryptionService from './DataEncryptionService';
import DataValidationService from './DataValidationService';

/**
 * DynamoDB-enabled Children Feeling Service
 * Provides CRUD operations for children's emotional state tracking using DynamoDB as the backend
 * Maintains compatibility with the existing children-feeling.json data structure
 */
class DynamoDBChildrenFeelingService {
  static TABLE_NAME = 'ParentChildApp-ChildrenFeelings';
  
  // Valid feelings for children
  static VALID_FEELINGS = ['exciting', 'happy', 'sad'];

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
   * Validate feeling data before saving
   * @private
   * @param {string} feeling - Feeling to validate
   * @param {string} childId - Child ID to validate
   * @throws {Error} If validation fails
   */
  static _validateFeelingData(feeling, childId) {
    if (!this.VALID_FEELINGS.includes(feeling)) {
      const validationError = new Error(`Invalid feeling: ${feeling}. Must be one of: ${this.VALID_FEELINGS.join(', ')}`);
      validationError.name = 'ValidationError';
      throw validationError;
    }
    
    if (!childId || typeof childId !== 'string') {
      const validationError = new Error('Child ID is required and must be a string');
      validationError.name = 'ValidationError';
      throw validationError;
    }
    
    // Check for dangerous patterns
    DataValidationService.validateNoDangerousPatterns({ feeling, childId });
  }

  /**
   * Get all children feelings data for the current user
   * @returns {Promise<Object>} Object with children feelings organized by childId
   */
  static async getAllChildrenFeelings() {
    try {
      const userId = await this._getCurrentUserId();
      
      const result = await DynamoDBService.queryItems(
        this.TABLE_NAME,
        'userId = :userId',
        {
          ExpressionAttributeValues: {
            ':userId': userId
          },
          ScanIndexForward: true // Sort by childId ascending
        }
      );
      
      const feelingEntries = result.items || [];
      
      // Decrypt sensitive fields before returning
      const decryptedEntries = await DataEncryptionService.decryptFromStorage(feelingEntries);
      
      // Organize feelings by childId to match the original data structure
      const organizedFeelings = {};
      
      decryptedEntries.forEach(entry => {
        const childId = entry.childId;
        
        if (!organizedFeelings[childId]) {
          organizedFeelings[childId] = {
            exciting: 0,
            happy: 0,
            sad: 0,
            records: []
          };
        }
        
        // Add to the appropriate feeling count
        if (this.VALID_FEELINGS.includes(entry.feeling)) {
          organizedFeelings[childId][entry.feeling]++;
        }
        
        // Add to records array
        organizedFeelings[childId].records.push({
          feeling: entry.feeling,
          datetime: entry.datetime,
          timestamp: entry.timestamp,
          date: entry.date,
          time: entry.time
        });
      });
      
      // Sort records by timestamp (newest first) for each child
      Object.keys(organizedFeelings).forEach(childId => {
        organizedFeelings[childId].records.sort((a, b) => b.timestamp - a.timestamp);
      });
      
      return organizedFeelings;
    } catch (error) {
      // Re-throw authentication errors
      if (error.message.includes('not authenticated') || 
          error.message.includes('User not authenticated')) {
        throw error;
      }
      
      console.error('Error loading children feelings data:', DataEncryptionService.sanitizeForLogging(error));
      return {};
    }
  }

  /**
   * Save all children feelings data (for backward compatibility)
   * @param {Object} allChildrenFeelings - Object with children feelings organized by childId
   * @returns {Promise<boolean>} Success status
   */
  static async saveAllChildrenFeelings(allChildrenFeelings) {
    try {
      if (!allChildrenFeelings || typeof allChildrenFeelings !== 'object') {
        throw new Error('Children feelings data must be an object');
      }
      
      const userId = await this._getCurrentUserId();
      
      // Get existing feelings to determine which ones to delete
      const existingFeelings = await this.getAllChildrenFeelings();
      
      // Clear existing data for children that are being updated
      const childrenToUpdate = Object.keys(allChildrenFeelings);
      for (const childId of childrenToUpdate) {
        if (existingFeelings[childId] && existingFeelings[childId].records) {
          // Delete existing records for this child
          for (const record of existingFeelings[childId].records) {
            if (record.recordId) {
              await this._deleteFeelingRecord(userId, childId, record.recordId);
            }
          }
        }
      }
      
      // Save new data
      for (const [childId, childFeelings] of Object.entries(allChildrenFeelings)) {
        if (childFeelings.records && Array.isArray(childFeelings.records)) {
          for (const record of childFeelings.records) {
            await this._createFeelingRecord(userId, childId, record);
          }
        }
      }
      
      return true;
    } catch (error) {
      console.error('Error saving children feelings data:', error);
      return false;
    }
  }

  /**
   * Record a feeling for a specific child
   * @param {string} childId - Child ID
   * @param {string} feeling - Feeling type ('exciting', 'happy', 'sad')
   * @returns {Promise<Object|null>} Created feeling record or null if failed
   */
  static async recordChildFeeling(childId, feeling) {
    try {
      // Validate input
      this._validateFeelingData(feeling, childId);
      
      const userId = await this._getCurrentUserId();
      
      const currentDateTime = new Date().toISOString();
      const timestamp = Date.now();
      
      const feelingRecord = {
        feeling: feeling,
        datetime: currentDateTime,
        timestamp: timestamp,
        date: new Date().toLocaleDateString(),
        time: new Date().toLocaleTimeString()
      };
      
      return await this._createFeelingRecord(userId, childId, feelingRecord);
    } catch (error) {
      // Re-throw authentication and validation errors
      if (error.message.includes('not authenticated') || 
          error.message.includes('User not authenticated') ||
          error.message.includes('Invalid feeling') ||
          error.message.includes('Child ID is required')) {
        throw error;
      }
      
      console.error('Error recording child feeling:', error);
      return null;
    }
  }

  /**
   * Get feelings for a specific child
   * @param {string} childId - Child ID
   * @returns {Promise<Object>} Child's feeling data with counts and records
   */
  static async getChildFeelings(childId) {
    try {
      if (!childId || typeof childId !== 'string') {
        const validationError = new Error('Child ID is required and must be a string');
        validationError.name = 'ValidationError';
        throw validationError;
      }
      
      const allFeelings = await this.getAllChildrenFeelings();
      
      return allFeelings[childId] || {
        exciting: 0,
        happy: 0,
        sad: 0,
        records: []
      };
    } catch (error) {
      // Re-throw validation errors
      if (error.name === 'ValidationError') {
        throw error;
      }
      
      console.error('Error getting child feelings:', error);
      return {
        exciting: 0,
        happy: 0,
        sad: 0,
        records: []
      };
    }
  }

  /**
   * Get feelings for a specific child within a date range
   * @param {string} childId - Child ID
   * @param {string} startDate - Start date (YYYY-MM-DD)
   * @param {string} endDate - End date (YYYY-MM-DD)
   * @returns {Promise<Array>} Array of feeling records in the date range
   */
  static async getChildFeelingsInDateRange(childId, startDate, endDate) {
    try {
      const childFeelings = await this.getChildFeelings(childId);
      
      return childFeelings.records.filter(record => {
        const recordDate = record.date;
        return recordDate >= startDate && recordDate <= endDate;
      });
    } catch (error) {
      console.error('Error getting child feelings in date range:', error);
      return [];
    }
  }

  /**
   * Get feeling statistics for a specific child
   * @param {string} childId - Child ID
   * @param {number} days - Number of days to analyze (default: 30)
   * @returns {Promise<Object>} Feeling statistics
   */
  static async getChildFeelingStats(childId, days = 30) {
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(endDate.getDate() - days);
      
      const startDateStr = startDate.toLocaleDateString();
      const endDateStr = endDate.toLocaleDateString();
      
      const recentFeelings = await this.getChildFeelingsInDateRange(childId, startDateStr, endDateStr);
      
      const stats = {
        totalRecords: recentFeelings.length,
        feelingCounts: {
          exciting: 0,
          happy: 0,
          sad: 0
        },
        feelingPercentages: {
          exciting: 0,
          happy: 0,
          sad: 0
        },
        mostCommonFeeling: null,
        recentTrend: 'neutral' // 'positive', 'negative', 'neutral'
      };
      
      // Count feelings
      recentFeelings.forEach(record => {
        if (this.VALID_FEELINGS.includes(record.feeling)) {
          stats.feelingCounts[record.feeling]++;
        }
      });
      
      // Calculate percentages
      if (stats.totalRecords > 0) {
        Object.keys(stats.feelingCounts).forEach(feeling => {
          stats.feelingPercentages[feeling] = 
            Math.round((stats.feelingCounts[feeling] / stats.totalRecords) * 100);
        });
        
        // Find most common feeling
        const maxCount = Math.max(...Object.values(stats.feelingCounts));
        stats.mostCommonFeeling = Object.keys(stats.feelingCounts).find(
          feeling => stats.feelingCounts[feeling] === maxCount
        );
        
        // Determine recent trend
        const positiveCount = stats.feelingCounts.exciting + stats.feelingCounts.happy;
        const negativeCount = stats.feelingCounts.sad;
        
        if (positiveCount > negativeCount * 1.5) {
          stats.recentTrend = 'positive';
        } else if (negativeCount > positiveCount * 1.5) {
          stats.recentTrend = 'negative';
        } else {
          stats.recentTrend = 'neutral';
        }
      }
      
      return stats;
    } catch (error) {
      console.error('Error getting child feeling stats:', error);
      return {
        totalRecords: 0,
        feelingCounts: { exciting: 0, happy: 0, sad: 0 },
        feelingPercentages: { exciting: 0, happy: 0, sad: 0 },
        mostCommonFeeling: null,
        recentTrend: 'neutral'
      };
    }
  }

  /**
   * Get the most recent feeling for a specific child
   * @param {string} childId - Child ID
   * @returns {Promise<Object|null>} Most recent feeling record or null
   */
  static async getChildLatestFeeling(childId) {
    try {
      const childFeelings = await this.getChildFeelings(childId);
      
      if (childFeelings.records.length === 0) {
        return null;
      }
      
      // Records are already sorted by timestamp (newest first)
      return childFeelings.records[0];
    } catch (error) {
      console.error('Error getting child latest feeling:', error);
      return null;
    }
  }

  /**
   * Clear all feeling data for a specific child
   * @param {string} childId - Child ID
   * @returns {Promise<boolean>} Success status
   */
  static async clearChildFeelings(childId) {
    try {
      if (!childId || typeof childId !== 'string') {
        const validationError = new Error('Child ID is required and must be a string');
        validationError.name = 'ValidationError';
        throw validationError;
      }
      
      const userId = await this._getCurrentUserId();
      
      // Get all feeling records for this child
      const childFeelings = await this.getChildFeelings(childId);
      
      // Delete each record
      for (const record of childFeelings.records) {
        if (record.recordId) {
          await this._deleteFeelingRecord(userId, childId, record.recordId);
        }
      }
      
      return true;
    } catch (error) {
      // Re-throw validation errors
      if (error.name === 'ValidationError') {
        throw error;
      }
      
      console.error('Error clearing child feelings:', error);
      return false;
    }
  }

  /**
   * Clear all feeling data for all children (for testing or reset purposes)
   * @returns {Promise<boolean>} Success status
   */
  static async clearAllChildrenFeelings() {
    try {
      const userId = await this._getCurrentUserId();
      
      // Get all feelings first
      const result = await DynamoDBService.queryItems(
        this.TABLE_NAME,
        'userId = :userId',
        {
          ExpressionAttributeValues: {
            ':userId': userId
          }
        }
      );
      
      // Delete each feeling record individually
      for (const record of result.items || []) {
        await DynamoDBService.deleteItem(
          this.TABLE_NAME,
          {
            userId: userId,
            recordId: record.recordId
          }
        );
      }
      
      return true;
    } catch (error) {
      console.error('Error clearing all children feelings:', error);
      return false;
    }
  }

  // Private helper methods for internal operations

  /**
   * Create a new feeling record in DynamoDB
   * @private
   * @param {string} userId - User ID
   * @param {string} childId - Child ID
   * @param {Object} feelingRecord - Feeling record data
   * @returns {Promise<Object>} Created feeling record
   */
  static async _createFeelingRecord(userId, childId, feelingRecord) {
    // Generate unique record ID
    const recordId = DynamoDBService.generateId();
    
    // Create feeling record item for DynamoDB
    const recordItem = {
      userId: userId,
      recordId: recordId,
      childId: childId,
      feeling: feelingRecord.feeling,
      datetime: feelingRecord.datetime,
      timestamp: feelingRecord.timestamp,
      date: feelingRecord.date,
      time: feelingRecord.time
    };
    
    // Encrypt sensitive fields before storage
    const encryptedItem = await DataEncryptionService.encryptSensitiveFields(recordItem);
    
    const result = await DynamoDBService.putItem(this.TABLE_NAME, encryptedItem);
    
    if (result.success) {
      // Decrypt sensitive fields before returning
      const decryptedItem = await DataEncryptionService.decryptSensitiveFields(result.item);
      return decryptedItem;
    } else {
      throw new Error('Failed to create feeling record');
    }
  }

  /**
   * Delete a feeling record from DynamoDB
   * @private
   * @param {string} userId - User ID
   * @param {string} childId - Child ID
   * @param {string} recordId - Record ID
   * @returns {Promise<void>}
   */
  static async _deleteFeelingRecord(userId, childId, recordId) {
    await DynamoDBService.deleteItem(
      this.TABLE_NAME,
      {
        userId: userId,
        recordId: recordId
      },
      {
        // Ensure the record exists and belongs to the correct child before deleting
        ConditionExpression: 'attribute_exists(userId) AND attribute_exists(recordId) AND childId = :childId',
        ExpressionAttributeValues: {
          ':childId': childId
        }
      }
    );
  }

  /**
   * Get feeling records count for a specific child
   * @param {string} childId - Child ID
   * @returns {Promise<number>} Number of feeling records
   */
  static async getChildFeelingRecordsCount(childId) {
    try {
      const childFeelings = await this.getChildFeelings(childId);
      return childFeelings.records.length;
    } catch (error) {
      console.error('Error getting child feeling records count:', error);
      return 0;
    }
  }

  /**
   * Get all children who have recorded feelings
   * @returns {Promise<Array>} Array of child IDs who have feeling records
   */
  static async getChildrenWithFeelings() {
    try {
      const allFeelings = await this.getAllChildrenFeelings();
      return Object.keys(allFeelings).filter(childId => 
        allFeelings[childId].records.length > 0
      );
    } catch (error) {
      console.error('Error getting children with feelings:', error);
      return [];
    }
  }

  /**
   * Get feeling summary for all children
   * @returns {Promise<Object>} Summary of feelings for all children
   */
  static async getAllChildrenFeelingsSummary() {
    try {
      const allFeelings = await this.getAllChildrenFeelings();
      const summary = {};
      
      Object.keys(allFeelings).forEach(childId => {
        const childData = allFeelings[childId];
        summary[childId] = {
          totalRecords: childData.records.length,
          feelingCounts: {
            exciting: childData.exciting,
            happy: childData.happy,
            sad: childData.sad
          },
          lastRecordedAt: childData.records.length > 0 ? childData.records[0].datetime : null
        };
      });
      
      return summary;
    } catch (error) {
      console.error('Error getting all children feelings summary:', error);
      return {};
    }
  }
}

export default DynamoDBChildrenFeelingService;