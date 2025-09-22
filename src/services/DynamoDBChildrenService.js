import { DynamoDBService } from './DynamoDBService';
import AuthenticationService from './AuthenticationService';
import DataEncryptionService from './DataEncryptionService';
import DataValidationService from './DataValidationService';
import { DYNAMODB_TABLES } from '../config/aws-config.js';

/**
 * DynamoDB-enabled Children Data Service
 * Provides CRUD operations for child profiles using DynamoDB as the backend
 * Maintains compatibility with the existing ChildrenDataService interface
 */
class DynamoDBChildrenService {
  static TABLE_NAME = DYNAMODB_TABLES.CHILDREN;
  
  // Required fields for child validation
  static REQUIRED_FIELDS = ['firstName'];
  
  // Optional fields with defaults
  static DEFAULT_VALUES = {
    nickname: '',
    lastName: '',
    gender: 'boy',
    favourColor: '#E91E63',
    birthday: '',
    primarySchool: '',
    secondarySchool: '',
    favourCartoons: [],
    customCartoons: [],
    favourSports: [],
    customSports: [],
    hobbies: [],
    customHobbies: [],
    photo: null,
    // Legacy fields for backward compatibility
    dateOfBirth: '',
    interests: [],
    medicalInfo: {
      allergies: [],
      medications: []
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
   * Validate child data before saving
   * @private
   * @param {Object} childData - Child data to validate
   * @throws {Error} If validation fails
   */
  static _validateChildData(childData) {
    // Check for dangerous patterns first
    DataValidationService.validateNoDangerousPatterns(childData);
    
    // Use comprehensive validation service
    const validatedData = DataValidationService.validateChildData(childData);
    
    return validatedData;
  }

  /**
   * Prepare child data for storage by applying defaults, validation, and encryption
   * @private
   * @param {Object} childData - Raw child data
   * @returns {Promise<Object>} Sanitized and encrypted child data with defaults applied
   */
  static async _prepareChildData(childData) {
    // Validate and sanitize the data first
    const validatedData = this._validateChildData(childData);
    
    // Apply default values for missing fields
    const preparedData = {
      ...this.DEFAULT_VALUES,
      ...validatedData,
      // Ensure nested objects are properly merged
      medicalInfo: {
        ...this.DEFAULT_VALUES.medicalInfo,
        ...(validatedData.medicalInfo || {})
      }
    };
        
    // Encrypt sensitive fields before storage
    const encryptedData = await DataEncryptionService.encryptSensitiveFields(preparedData);
    
    return encryptedData;
  }

  /**
   * Get all children for the current user
   * @returns {Promise<Array>} Array of child objects
   */
  static async getChildren() {
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
      
      const children = result.items || [];
      
      // Decrypt sensitive fields before returning
      const decryptedChildren = await DataEncryptionService.decryptFromStorage(children);
      
      return decryptedChildren;
    } catch (error) {
      // Re-throw authentication errors
      if (error.message.includes('not authenticated') || 
          error.message.includes('User not authenticated')) {
        throw error;
      }
      
      console.error('Error loading children data:', DataEncryptionService.sanitizeForLogging(error));
      
      // Return empty array for user-friendly error handling
      // The UI can handle empty state gracefully
      return [];
    }
  }

  /**
   * Save children array to storage (for backward compatibility)
   * Note: This method is kept for interface compatibility but internally
   * it will save each child individually to maintain DynamoDB best practices
   * @param {Array} children - Array of child objects
   * @returns {Promise<boolean>} Success status
   */
  static async saveChildren(children) {
    try {
      if (!Array.isArray(children)) {
        throw new Error('Children must be an array');
      }
      
      const userId = await this._getCurrentUserId();
      
      // Get existing children to determine which ones to delete
      const existingChildren = await this.getChildren();
      const existingChildIds = existingChildren.map(child => child.childId || child.id);
      const newChildIds = children.map(child => child.childId || child.id).filter(Boolean);
      
      // Find children to delete (exist in DB but not in new array)
      const childrenToDelete = existingChildIds.filter(id => !newChildIds.includes(id));
      
      // Delete removed children
      for (const childId of childrenToDelete) {
        await this._deleteChildById(userId, childId);
      }
      
      // Save or update each child
      for (const childData of children) {
        if (childData.childId || childData.id) {
          // Update existing child
          await this._updateChildById(userId, childData.childId || childData.id, childData);
        } else {
          // Create new child
          await this._createChild(userId, childData);
        }
      }
      
      return true;
    } catch (error) {
      console.error('Error saving children data:', error);
      return false;
    }
  }

  /**
   * Add a new child
   * @param {Object} childData - Child data to add
   * @returns {Promise<Object|null>} Created child object or null if failed
   */
  static async addChild(childData) {
    try {
      console.log('🔍 DynamoDBChildrenService.addChild: Starting...');
      const userId = await this._getCurrentUserId();
      console.log('👤 User ID obtained:', userId);
      const result = await this._createChild(userId, childData);
      console.log('✅ DynamoDBChildrenService.addChild: Success', result);
      return result;
    } catch (error) {
      console.error('❌ DynamoDBChildrenService.addChild: Error', error);
      // Re-throw authentication errors
      if (error.message.includes('not authenticated') || 
          error.message.includes('User not authenticated')) {
        throw error;
      }
      
      console.error('Error adding child:', error);
      return null;
    }
  }

  /**
   * Update an existing child
   * @param {string} childId - Child ID to update
   * @param {Object} updatedData - Updated child data
   * @returns {Promise<boolean>} Success status
   */
  static async updateChild(childId, updatedData) {
    try {
      const userId = await this._getCurrentUserId();
      const result = await this._updateChildById(userId, childId, updatedData);
      return result !== null;
    } catch (error) {
      // Re-throw authentication errors
      if (error.message.includes('not authenticated') || 
          error.message.includes('User not authenticated')) {
        throw error;
      }
      
      console.error('Error updating child:', error);
      return false;
    }
  }

  /**
   * Delete a child
   * @param {string} childId - Child ID to delete
   * @returns {Promise<boolean>} Success status
   */
  static async deleteChild(childId) {
    try {
      const userId = await this._getCurrentUserId();
      await this._deleteChildById(userId, childId);
      return true;
    } catch (error) {
      // Re-throw authentication errors
      if (error.message.includes('not authenticated') || 
          error.message.includes('User not authenticated')) {
        throw error;
      }
      
      console.error('Error deleting child:', error);
      return false;
    }
  }

  /**
   * Get a specific child by ID
   * @param {string} childId - Child ID to retrieve
   * @returns {Promise<Object|null>} Child object or null if not found
   */
  static async getChildById(childId) {
    try {
      const userId = await this._getCurrentUserId();
      
      const child = await DynamoDBService.getItem(
        this.TABLE_NAME,
        {
          userId: userId,
          childId: childId
        }
      );
      
      if (child) {
        // Validate data isolation
        DynamoDBService.validateUserDataIsolation(child, userId);
        
        // Decrypt sensitive fields before returning
        const decryptedChild = await DataEncryptionService.decryptSensitiveFields(child);
        return decryptedChild;
      }
      
      return null;
    } catch (error) {
      console.error('Error getting child by ID:', DataEncryptionService.sanitizeForLogging(error));
      return null;
    }
  }

  // Private helper methods for internal operations

  /**
   * Create a new child in DynamoDB
   * @private
   * @param {string} userId - User ID
   * @param {Object} childData - Child data
   * @returns {Promise<Object>} Created child object
   */
  static async _createChild(userId, childData) {
    // Validate, sanitize, and encrypt data
    const preparedData = await this._prepareChildData(childData);
    
    // Generate unique child ID
    const childId = DynamoDBService.generateId();
    
    // Create child item for DynamoDB
    const childItem = {
      userId: userId,
      childId: childId,
      ...preparedData,
      // Add id field for backward compatibility with existing code
      id: childId
    };
    
    const result = await DynamoDBService.putItem(this.TABLE_NAME, childItem);
    
    if (result.success) {
      // Decrypt sensitive fields before returning
      const decryptedItem = await DataEncryptionService.decryptSensitiveFields(result.item);
      return decryptedItem;
    } else {
      throw new Error('Failed to create child');
    }
  }

  /**
   * Update an existing child in DynamoDB
   * @private
   * @param {string} userId - User ID
   * @param {string} childId - Child ID
   * @param {Object} updatedData - Updated child data
   * @returns {Promise<Object>} Updated child object
   */
  static async _updateChildById(userId, childId, updatedData) {
    // Validate and prepare data (excluding system fields)
    const { userId: _, childId: __, id: ___, ...dataToUpdate } = updatedData;
    
    // Only validate if we have data to update
    let preparedData = {};
    if (Object.keys(dataToUpdate).length > 0) {
      // For partial updates, we need to be more flexible with validation
      try {
        // Validate individual fields that are being updated
        if (dataToUpdate.firstName !== undefined) {
          DataValidationService.validateName(dataToUpdate.firstName, 'First name');
        }
        if (dataToUpdate.dateOfBirth !== undefined && dataToUpdate.dateOfBirth !== '') {
          DataValidationService.validateDate(dataToUpdate.dateOfBirth);
        }
        if (dataToUpdate.favourColor !== undefined) {
          DataValidationService.validateHexColor(dataToUpdate.favourColor);
        }
        
        // Check for dangerous patterns
        DataValidationService.validateNoDangerousPatterns(dataToUpdate);
        
        // Encrypt sensitive fields
        preparedData = await DataEncryptionService.encryptSensitiveFields(dataToUpdate);
      } catch (validationError) {
        throw validationError;
      }
    }
    
    const result = await DynamoDBService.updateItem(
      this.TABLE_NAME,
      {
        userId: userId,
        childId: childId
      },
      preparedData,
      {
        // Ensure the child exists before updating
        ConditionExpression: 'attribute_exists(userId) AND attribute_exists(childId)'
      }
    );
    
    if (result.success) {
      // Decrypt sensitive fields before returning
      const decryptedItem = await DataEncryptionService.decryptSensitiveFields(result.item);
      return decryptedItem;
    } else {
      throw new Error('Failed to update child');
    }
  }

  /**
   * Delete a child from DynamoDB
   * @private
   * @param {string} userId - User ID
   * @param {string} childId - Child ID
   * @returns {Promise<void>}
   */
  static async _deleteChildById(userId, childId) {
    await DynamoDBService.deleteItem(
      this.TABLE_NAME,
      {
        userId: userId,
        childId: childId
      },
      {
        // Ensure the child exists before deleting
        ConditionExpression: 'attribute_exists(userId) AND attribute_exists(childId)'
      }
    );
  }

  /**
   * Get children count for the current user (utility method)
   * @returns {Promise<number>} Number of children
   */
  static async getChildrenCount() {
    try {
      const children = await this.getChildren();
      return children.length;
    } catch (error) {
      console.error('Error getting children count:', error);
      return 0;
    }
  }

  /**
   * Check if a child exists by ID
   * @param {string} childId - Child ID to check
   * @returns {Promise<boolean>} True if child exists
   */
  static async childExists(childId) {
    try {
      const child = await this.getChildById(childId);
      return child !== null;
    } catch (error) {
      console.error('Error checking if child exists:', error);
      return false;
    }
  }

  /**
   * Get children by specific criteria (utility method for advanced queries)
   * @param {Object} criteria - Search criteria
   * @param {string} criteria.firstName - Filter by first name (partial match)
   * @param {string} criteria.ageRange - Filter by age range ('0-2', '3-5', '6-12', '13+')
   * @returns {Promise<Array>} Filtered children array
   */
  static async getChildrenByCriteria(criteria = {}) {
    try {
      const allChildren = await this.getChildren();
      
      let filteredChildren = allChildren;
      
      // Filter by first name (case-insensitive partial match)
      if (criteria.firstName) {
        const searchName = criteria.firstName.toLowerCase();
        filteredChildren = filteredChildren.filter(child => 
          child.firstName.toLowerCase().includes(searchName)
        );
      }
      
      // Filter by age range
      if (criteria.ageRange && criteria.ageRange !== 'all') {
        const currentDate = new Date();
        filteredChildren = filteredChildren.filter(child => {
          if (!child.dateOfBirth) return false;
          
          const birthDate = new Date(child.dateOfBirth);
          const ageInYears = Math.floor((currentDate - birthDate) / (365.25 * 24 * 60 * 60 * 1000));
          
          switch (criteria.ageRange) {
            case '0-2':
              return ageInYears >= 0 && ageInYears <= 2;
            case '3-5':
              return ageInYears >= 3 && ageInYears <= 5;
            case '6-12':
              return ageInYears >= 6 && ageInYears <= 12;
            case '13+':
              return ageInYears >= 13;
            default:
              return true;
          }
        });
      }
      
      return filteredChildren;
    } catch (error) {
      console.error('Error getting children by criteria:', error);
      return [];
    }
  }

  /**
   * Batch update multiple children (utility method for bulk operations)
   * @param {Array} updates - Array of {childId, data} objects
   * @returns {Promise<Object>} Batch update result with success/failure counts
   */
  static async batchUpdateChildren(updates) {
    const result = {
      success: true,
      updated: 0,
      failed: 0,
      errors: []
    };
    
    try {
      const userId = await this._getCurrentUserId();
      
      for (const update of updates) {
        try {
          await this._updateChildById(userId, update.childId, update.data);
          result.updated++;
        } catch (error) {
          result.failed++;
          result.success = false;
          result.errors.push({
            childId: update.childId,
            error: error.message
          });
        }
      }
      
      return result;
    } catch (error) {
      console.error('Error in batch update children:', error);
      return {
        success: false,
        updated: 0,
        failed: updates.length,
        errors: [{ error: error.message }]
      };
    }
  }
}

export default DynamoDBChildrenService;