import AsyncStorage from '@react-native-async-storage/async-storage';
import DataNamespacing from '../utils/dataNamespacing';
import DynamoDBChildrenService from './DynamoDBChildrenService';

const CHILDREN_STORAGE_KEY = 'children-profile.json';

class ChildrenDataService {
  // Configuration flag to switch between storage backends
  static USE_DYNAMODB = process.env.EXPO_PUBLIC_USE_DYNAMODB === 'true' || false;
  
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
   * Check if user is authenticated (for DynamoDB operations)
   * @static
   * @returns {Promise<boolean>} True if user is authenticated
   */
  static async isUserAuthenticated() {
    try {
      const AuthenticationService = require('./AuthenticationService').default;
      const user = await AuthenticationService.getCurrentUser();
      return user !== null && user.id !== undefined;
    } catch (error) {
      console.warn('Error checking authentication status:', error);
      return false;
    }
  }

  /**
   * Get storage backend status
   * @static
   * @returns {Promise<Object>} Status information about storage backend
   */
  static async getStorageStatus() {
    const isAuthenticated = await this.isUserAuthenticated();
    return {
      dynamoDBEnabled: this.USE_DYNAMODB,
      userAuthenticated: isAuthenticated,
      effectiveBackend: this.USE_DYNAMODB && isAuthenticated ? 'DynamoDB' : 'AsyncStorage',
      canUseDynamoDB: this.USE_DYNAMODB && isAuthenticated
    };
  }
  // Get all children from storage
  static async getChildren() {    
    if (this.USE_DYNAMODB) {
      try {
        const result = await DynamoDBChildrenService.getChildren();
        return result;
      } catch (error) {        
        // Check if it's an authentication error
        if (error.message.includes('not authenticated') || error.message.includes('User not authenticated')) {
          console.warn('🔐 User not authenticated, using AsyncStorage as fallback');
        }
        
        return await this._getChildrenFromAsyncStorage();
      }
    }
    return await this._getChildrenFromAsyncStorage();
  }

  // AsyncStorage implementation
  static async _getChildrenFromAsyncStorage() {
    try {
      return await DataNamespacing.getUserData(CHILDREN_STORAGE_KEY, []);
    } catch (error) {
      console.error('Error loading children data:', error);
      return [];
    }
  }

  // Save children array to storage
  static async saveChildren(children) {
    if (this.USE_DYNAMODB) {
      try {
        return await DynamoDBChildrenService.saveChildren(children);
      } catch (error) {
        console.warn('DynamoDB backend failed, falling back to AsyncStorage:', error);
        return await this._saveChildrenToAsyncStorage(children);
      }
    }
    return await this._saveChildrenToAsyncStorage(children);
  }

  // AsyncStorage implementation
  static async _saveChildrenToAsyncStorage(children) {
    try {
      return await DataNamespacing.setUserData(CHILDREN_STORAGE_KEY, children);
    } catch (error) {
      console.error('Error saving children data:', error);
      return false;
    }
  }

  // Add a new child
  static async addChild(childData) {
    console.log('🔍 ChildrenDataService.addChild: USE_DYNAMODB =', this.USE_DYNAMODB);
    console.log('👶 Child data to add:', JSON.stringify(childData, null, 2));
    if (this.USE_DYNAMODB) {
      try {
        console.log('☁️ Using DynamoDB backend for addChild');
        const result = await DynamoDBChildrenService.addChild(childData);
        console.log('☁️ DynamoDB addChild result:', result);
        return result;
      } catch (error) {
        console.warn('❌ DynamoDB backend failed, falling back to AsyncStorage:', error);
        console.warn('Error details:', error.message);
        
        // Check if it's an authentication error
        if (error.message.includes('not authenticated') || error.message.includes('User not authenticated')) {
          console.warn('🔐 User not authenticated, using AsyncStorage as fallback');
        }
        
        return await this._addChildToAsyncStorage(childData);
      }
    }
    console.log('💾 Using AsyncStorage backend for addChild');
    return await this._addChildToAsyncStorage(childData);
  }

  // AsyncStorage implementation
  static async _addChildToAsyncStorage(childData) {
    try {
      const children = await this._getChildrenFromAsyncStorage();
      const newChild = {
        id: Date.now().toString(),
        ...childData,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      children.push(newChild);
      const success = await this._saveChildrenToAsyncStorage(children);
      return success ? newChild : null;
    } catch (error) {
      console.error('Error adding child:', error);
      return null;
    }
  }

  // Update an existing child
  static async updateChild(childId, updatedData) {
    if (this.USE_DYNAMODB) {
      try {
        return await DynamoDBChildrenService.updateChild(childId, updatedData);
      } catch (error) {
        console.warn('DynamoDB backend failed, falling back to AsyncStorage:', error);
        return await this._updateChildInAsyncStorage(childId, updatedData);
      }
    }
    return await this._updateChildInAsyncStorage(childId, updatedData);
  }

  // AsyncStorage implementation
  static async _updateChildInAsyncStorage(childId, updatedData) {
    try {
      const children = await this._getChildrenFromAsyncStorage();
      const childIndex = children.findIndex(child => child.id === childId);
      
      if (childIndex === -1) {
        return false;
      }

      children[childIndex] = {
        ...children[childIndex],
        ...updatedData,
        updatedAt: new Date().toISOString(),
      };

      return await this._saveChildrenToAsyncStorage(children);
    } catch (error) {
      console.error('Error updating child:', error);
      return false;
    }
  }

  // Delete a child
  static async deleteChild(childId) {
    if (this.USE_DYNAMODB) {
      try {
        return await DynamoDBChildrenService.deleteChild(childId);
      } catch (error) {
        console.warn('DynamoDB backend failed, falling back to AsyncStorage:', error);
        return await this._deleteChildFromAsyncStorage(childId);
      }
    }
    return await this._deleteChildFromAsyncStorage(childId);
  }

  // AsyncStorage implementation
  static async _deleteChildFromAsyncStorage(childId) {
    try {
      const children = await this._getChildrenFromAsyncStorage();
      const filteredChildren = children.filter(child => child.id !== childId);
      return await this._saveChildrenToAsyncStorage(filteredChildren);
    } catch (error) {
      console.error('Error deleting child:', error);
      return false;
    }
  }

  // Get a specific child by ID
  static async getChildById(childId) {
    if (this.USE_DYNAMODB) {
      try {
        return await DynamoDBChildrenService.getChildById(childId);
      } catch (error) {
        console.warn('DynamoDB backend failed, falling back to AsyncStorage:', error);
        return await this._getChildByIdFromAsyncStorage(childId);
      }
    }
    return await this._getChildByIdFromAsyncStorage(childId);
  }

  // AsyncStorage implementation
  static async _getChildByIdFromAsyncStorage(childId) {
    try {
      const children = await this._getChildrenFromAsyncStorage();
      return children.find(child => child.id === childId) || null;
    } catch (error) {
      console.error('Error getting child by ID:', error);
      return null;
    }
  }
}

export default ChildrenDataService;