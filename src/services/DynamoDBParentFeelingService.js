import { DynamoDBService } from './DynamoDBService';
import AuthenticationService from './AuthenticationService';
import DataEncryptionService from './DataEncryptionService';
import DataValidationService from './DataValidationService';

/**
 * DynamoDB-enabled Parent Feeling Service
 * Provides CRUD operations for parent emotional state tracking using DynamoDB as the backend
 * Maintains compatibility with the existing ParentFeelingService interface
 */
class DynamoDBParentFeelingService {
  static TABLE_NAME = 'ParentChildApp-ParentFeelings';
  
  static VALID_FEELINGS = [
    'Helplessness', 
    'Anxiety',
    'Exhaustion',
    'Excitement',
    'Happy',
    'Sad',
    // New category-based feelings
    'Moody',
    'Angry',
    'Excited',
    'Satisfied',
    'Neutral',
    'Calm'
  ];

  static FEELING_CATEGORIES = {
    'negative': {
      color: '#FF6B6B',
      feelings: ['Moody', 'Angry', 'Sad'],
      icon: 'sad-outline'
    },
    'positive': {
      color: '#FFD93D', 
      feelings: ['Happy', 'Excited', 'Satisfied'],
      icon: 'happy-outline'
    },
    'neutral': {
      color: '#6BCF7F',
      feelings: ['Neutral', 'Calm'],
      icon: 'remove-circle-outline'
    }
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
   * Determine the category of a feeling based on its type
   * @private
   * @param {string} feelingType - The feeling type
   * @returns {string|null} The category or null if not found
   */
  static _determineFeelingCategory(feelingType) {
    for (const [category, categoryData] of Object.entries(this.FEELING_CATEGORIES)) {
      if (categoryData.feelings.includes(feelingType)) {
        return category;
      }
    }
    
    // Handle legacy feelings
    const legacyMappings = {
      'Helplessness': 'negative',
      'Anxiety': 'negative', 
      'Exhaustion': 'negative',
      'Excitement': 'positive',
      'Happy': 'positive',
      'Sad': 'negative'
    };
    
    return legacyMappings[feelingType] || null;
  }

  /**
   * Validate feeling data before saving
   * @private
   * @param {string} feelingType - Feeling type to validate
   * @throws {Error} If validation fails
   */
  static _validateFeelingData(feelingType) {
    if (!this.VALID_FEELINGS.includes(feelingType)) {
      const validationError = new Error(`Invalid feeling type: ${feelingType}. Must be one of: ${this.VALID_FEELINGS.join(', ')}`);
      validationError.name = 'ValidationError';
      throw validationError;
    }
    
    // Check for dangerous patterns
    DataValidationService.validateNoDangerousPatterns({ feeling: feelingType });
  }

  /**
   * Record a parent's feeling with timestamp and automatic category assignment
   * @param {string} feelingType - One of the valid feeling types
   * @returns {Promise<boolean>} Success status
   */
  static async recordFeeling(feelingType) {
    try {
      // Validate feeling type
      this._validateFeelingData(feelingType);

      const userId = await this._getCurrentUserId();

      // Determine category and color automatically
      const category = this._determineFeelingCategory(feelingType);
      const color = category ? this.FEELING_CATEGORIES[category].color : '#CCCCCC';

      const now = new Date();
      const feelingId = DynamoDBService.generateId();
      
      const feelingEntry = {
        userId: userId,
        feelingId: feelingId,
        feeling: feelingType,
        category: category || 'uncategorized',
        color: color,
        timestamp: now.toISOString(),
        date: now.toISOString().split('T')[0], // YYYY-MM-DD format
        // Add id field for backward compatibility
        id: feelingId
      };

      // Encrypt sensitive fields before storage
      const encryptedEntry = await DataEncryptionService.encryptSensitiveFields(feelingEntry);

      const result = await DynamoDBService.putItem(this.TABLE_NAME, encryptedEntry);
      
      return result.success;
    } catch (error) {
      // Re-throw authentication and validation errors
      if (error.message.includes('not authenticated') || 
          error.message.includes('User not authenticated') ||
          error.name === 'ValidationError') {
        throw error;
      }
      
      console.error('Error recording feeling:', error);
      return false;
    }
  }

  /**
   * Record a parent's feeling with category and color information
   * @param {string} feelingType - One of the valid feeling types
   * @param {string} category - The feeling category (negative, positive, neutral)
   * @param {string} color - The color associated with the category
   * @returns {Promise<boolean>} Success status
   */
  static async recordFeelingWithCategory(feelingType, category, color) {
    try {
      // Validate feeling type
      this._validateFeelingData(feelingType);

      // Validate category
      if (!this.FEELING_CATEGORIES[category]) {
        const validationError = new Error(`Invalid category: ${category}. Must be one of: ${Object.keys(this.FEELING_CATEGORIES).join(', ')}`);
        validationError.name = 'ValidationError';
        throw validationError;
      }

      const userId = await this._getCurrentUserId();

      const now = new Date();
      const feelingId = DynamoDBService.generateId();
      
      const feelingEntry = {
        userId: userId,
        feelingId: feelingId,
        feeling: feelingType,
        category: category,
        color: color,
        timestamp: now.toISOString(),
        date: now.toISOString().split('T')[0], // YYYY-MM-DD format
        // Add id field for backward compatibility
        id: feelingId
      };

      // Encrypt sensitive fields before storage
      const encryptedEntry = await DataEncryptionService.encryptSensitiveFields(feelingEntry);

      const result = await DynamoDBService.putItem(this.TABLE_NAME, encryptedEntry);
      
      return result.success;
    } catch (error) {
      // Re-throw authentication and validation errors
      if (error.message.includes('not authenticated') || 
          error.message.includes('User not authenticated') ||
          error.name === 'ValidationError') {
        throw error;
      }
      
      console.error('Error recording feeling with category:', error);
      return false;
    }
  }

  /**
   * Retrieve all recorded feelings with enhanced error handling
   * @returns {Promise<Object>} Object with feelings array
   */
  static async getFeelings() {
    try {
      const userId = await this._getCurrentUserId();
      
      const result = await DynamoDBService.queryItems(
        this.TABLE_NAME,
        'userId = :userId',
        {
          ExpressionAttributeValues: {
            ':userId': userId
          },
          ScanIndexForward: false // Sort by feelingId descending (newest first)
        }
      );
      
      const feelings = result.items || [];
      
      // Decrypt sensitive fields before returning
      const decryptedFeelings = await DataEncryptionService.decryptFromStorage(feelings);
      
      // Validate individual feeling entries and filter out invalid ones
      const validFeelings = decryptedFeelings.filter(feeling => {
        if (!feeling || typeof feeling !== 'object') {
          console.warn('Invalid feeling entry (not an object):', feeling);
          return false;
        }
        
        if (!feeling.id || !feeling.feeling || !feeling.timestamp || !feeling.date) {
          console.warn('Feeling entry missing required properties:', feeling);
          return false;
        }
        
        if (!this.VALID_FEELINGS.includes(feeling.feeling)) {
          console.warn('Feeling entry has invalid feeling type:', feeling.feeling);
          return false;
        }

        // Validate category if present (for new format)
        if (feeling.category && !this.FEELING_CATEGORIES[feeling.category] && feeling.category !== 'uncategorized') {
          console.warn('Feeling entry has invalid category:', feeling.category);
          return false;
        }
        
        // Validate timestamp
        const timestamp = new Date(feeling.timestamp);
        if (isNaN(timestamp.getTime())) {
          console.warn('Feeling entry has invalid timestamp:', feeling.timestamp);
          return false;
        }
        
        return true;
      });

      return { feelings: validFeelings };
    } catch (error) {
      // Re-throw authentication errors
      if (error.message.includes('not authenticated') || 
          error.message.includes('User not authenticated')) {
        throw error;
      }
      
      console.error('Error retrieving feelings:', DataEncryptionService.sanitizeForLogging(error));
      // Return empty structure on error
      return { feelings: [] };
    }
  }

  /**
   * Get feelings for a specific date
   * @param {string} date - Date in YYYY-MM-DD format
   * @returns {Promise<Array>} Array of feeling entries for the date
   */
  static async getFeelingsForDate(date) {
    try {
      const data = await this.getFeelings();
      return data.feelings.filter(feeling => feeling.date === date);
    } catch (error) {
      console.error('Error retrieving feelings for date:', error);
      return [];
    }
  }

  /**
   * Get feelings within a date range
   * @param {string} startDate - Start date in YYYY-MM-DD format
   * @param {string} endDate - End date in YYYY-MM-DD format
   * @returns {Promise<Array>} Array of feeling entries in the range
   */
  static async getFeelingsInRange(startDate, endDate) {
    try {
      const data = await this.getFeelings();
      return data.feelings.filter(feeling => {
        return feeling.date >= startDate && feeling.date <= endDate;
      });
    } catch (error) {
      console.error('Error retrieving feelings in range:', error);
      return [];
    }
  }

  /**
   * Clear all feeling data (for testing or reset purposes)
   * @returns {Promise<boolean>} Success status
   */
  static async clearAllFeelings() {
    try {
      const userId = await this._getCurrentUserId();
      
      // Get all feelings first
      const data = await this.getFeelings();
      
      // Delete each feeling individually
      for (const feeling of data.feelings) {
        await DynamoDBService.deleteItem(
          this.TABLE_NAME,
          {
            userId: userId,
            feelingId: feeling.feelingId || feeling.id
          }
        );
      }
      
      return true;
    } catch (error) {
      console.error('Error clearing feelings:', error);
      return false;
    }
  }

  /**
   * Get the most recent feeling entry
   * @returns {Promise<Object|null>} Most recent feeling entry or null
   */
  static async getLatestFeeling() {
    try {
      const data = await this.getFeelings();
      if (data.feelings.length === 0) {
        return null;
      }
      
      // Sort by timestamp descending and return the first (most recent)
      const sortedFeelings = data.feelings.sort((a, b) => 
        new Date(b.timestamp) - new Date(a.timestamp)
      );
      
      return sortedFeelings[0];
    } catch (error) {
      console.error('Error retrieving latest feeling:', error);
      return null;
    }
  }

  /**
   * Get feelings grouped by category with color information
   * @returns {Promise<Object>} Object with feelings grouped by category
   */
  static async getFeelingsByCategory() {
    try {
      const data = await this.getFeelings();
      const categorizedFeelings = {
        negative: [],
        positive: [],
        neutral: [],
        uncategorized: [] // For legacy feelings without category
      };

      data.feelings.forEach(feeling => {
        if (feeling.category && categorizedFeelings[feeling.category]) {
          categorizedFeelings[feeling.category].push(feeling);
        } else {
          // Handle legacy feelings or determine category based on feeling type
          const category = this._determineFeelingCategory(feeling.feeling);
          if (category) {
            categorizedFeelings[category].push({
              ...feeling,
              category: category,
              color: this.FEELING_CATEGORIES[category].color
            });
          } else {
            categorizedFeelings.uncategorized.push(feeling);
          }
        }
      });

      return categorizedFeelings;
    } catch (error) {
      console.error('Error retrieving feelings by category:', error);
      return {
        negative: [],
        positive: [],
        neutral: [],
        uncategorized: []
      };
    }
  }

  /**
   * Get historical feeling data with color categories for analytics
   * @param {number} days - Number of days to look back (default: 30)
   * @returns {Promise<Array>} Array of feeling entries with category and color info
   */
  static async getHistoricalFeelingsWithCategories(days = 30) {
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(endDate.getDate() - days);
      
      const startDateStr = startDate.toISOString().split('T')[0];
      const endDateStr = endDate.toISOString().split('T')[0];
      
      const feelings = await this.getFeelingsInRange(startDateStr, endDateStr);
      
      // Ensure all feelings have category and color information
      return feelings.map(feeling => {
        if (!feeling.category || !feeling.color) {
          const category = this._determineFeelingCategory(feeling.feeling);
          return {
            ...feeling,
            category: category || 'uncategorized',
            color: category ? this.FEELING_CATEGORIES[category].color : '#CCCCCC'
          };
        }
        return feeling;
      });
    } catch (error) {
      console.error('Error retrieving historical feelings with categories:', error);
      return [];
    }
  }

  /**
   * Get feeling statistics by category for a given time period
   * @param {number} days - Number of days to analyze (default: 7)
   * @returns {Promise<Object>} Statistics object with category counts and percentages
   */
  static async getFeelingStatsByCategory(days = 7) {
    try {
      const feelings = await this.getHistoricalFeelingsWithCategories(days);
      
      const stats = {
        total: feelings.length,
        categories: {
          negative: { count: 0, percentage: 0, color: this.FEELING_CATEGORIES.negative.color },
          positive: { count: 0, percentage: 0, color: this.FEELING_CATEGORIES.positive.color },
          neutral: { count: 0, percentage: 0, color: this.FEELING_CATEGORIES.neutral.color },
          uncategorized: { count: 0, percentage: 0, color: '#CCCCCC' }
        }
      };

      feelings.forEach(feeling => {
        const category = feeling.category || 'uncategorized';
        if (stats.categories[category]) {
          stats.categories[category].count++;
        }
      });

      // Calculate percentages
      if (stats.total > 0) {
        Object.keys(stats.categories).forEach(category => {
          stats.categories[category].percentage = 
            Math.round((stats.categories[category].count / stats.total) * 100);
        });
      }

      return stats;
    } catch (error) {
      console.error('Error calculating feeling stats by category:', error);
      return {
        total: 0,
        categories: {
          negative: { count: 0, percentage: 0, color: this.FEELING_CATEGORIES.negative.color },
          positive: { count: 0, percentage: 0, color: this.FEELING_CATEGORIES.positive.color },
          neutral: { count: 0, percentage: 0, color: this.FEELING_CATEGORIES.neutral.color },
          uncategorized: { count: 0, percentage: 0, color: '#CCCCCC' }
        }
      };
    }
  }

  /**
   * Get category information for a specific feeling type
   * @param {string} feelingType - The feeling type to get category info for
   * @returns {Object|null} Category information object or null if not found
   */
  static getCategoryInfo(feelingType) {
    const category = this._determineFeelingCategory(feelingType);
    if (category && this.FEELING_CATEGORIES[category]) {
      return {
        category: category,
        color: this.FEELING_CATEGORIES[category].color,
        icon: this.FEELING_CATEGORIES[category].icon,
        allFeelings: this.FEELING_CATEGORIES[category].feelings
      };
    }
    return null;
  }

  /**
   * Get all available feeling categories with their metadata
   * @returns {Object} Complete category information
   */
  static getAllCategories() {
    return this.FEELING_CATEGORIES;
  }

  /**
   * Migrate existing feeling data to include category information
   * @returns {Promise<boolean>} Success status
   */
  static async migrateFeelingData() {
    try {
      const data = await this.getFeelings();
      let migrationNeeded = false;
      
      const userId = await this._getCurrentUserId();
      
      for (const feeling of data.feelings) {
        if (!feeling.category || !feeling.color) {
          migrationNeeded = true;
          const category = this._determineFeelingCategory(feeling.feeling);
          const updatedFeeling = {
            category: category || 'uncategorized',
            color: category ? this.FEELING_CATEGORIES[category].color : '#CCCCCC'
          };
          
          // Update the feeling in DynamoDB
          await DynamoDBService.updateItem(
            this.TABLE_NAME,
            {
              userId: userId,
              feelingId: feeling.feelingId || feeling.id
            },
            updatedFeeling
          );
        }
      }

      if (migrationNeeded) {
        console.log(`Successfully migrated ${data.feelings.length} feeling records with category information`);
      } else {
        console.log('No migration needed - all feeling records already have category information');
      }

      return true;
    } catch (error) {
      console.error('Error migrating feeling data:', error);
      return false;
    }
  }
}

export default DynamoDBParentFeelingService;