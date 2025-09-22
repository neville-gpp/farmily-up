import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { 
  DynamoDBDocumentClient, 
  GetCommand, 
  PutCommand, 
  UpdateCommand, 
  DeleteCommand, 
  QueryCommand, 
  ScanCommand,
  BatchGetCommand,
  BatchWriteCommand
} from '@aws-sdk/lib-dynamodb';
import { AWS_CONFIG } from '../config/aws-config.js';
import AuthenticationService from './AuthenticationService';
import TokenStorageService from './TokenStorageService';

/**
 * Base DynamoDB Service Class
 * Provides common CRUD operations and error handling for DynamoDB operations
 * Integrates with authentication system for secure access control
 */
export class DynamoDBService {
  static client = null;
  static docClient = null;

  /**
   * Initialize DynamoDB clients with authentication context
   */
  static async initializeClients() {
    if (!this.client) {
      // Get current user to ensure authentication
      const user = await AuthenticationService.getCurrentUser();
      if (!user) {
        throw new Error('User must be authenticated to access DynamoDB');
      }

      this.client = new DynamoDBClient({
        region: AWS_CONFIG.region,
        credentials: {
          accessKeyId: AWS_CONFIG.accessKeyId,
          secretAccessKey: AWS_CONFIG.secretAccessKey,
        },
      });
      
      this.docClient = DynamoDBDocumentClient.from(this.client, {
        marshallOptions: {
          convertEmptyValues: false,
          removeUndefinedValues: true,
          convertClassInstanceToMap: false,
        },
        unmarshallOptions: {
          wrapNumbers: false,
        },
      });
    }
  }

  /**
   * Ensure user is authenticated and tokens are valid before operations
   * @private
   * @returns {Promise<string>} Current user ID
   * @throws {Error} If user is not authenticated or tokens are invalid
   */
  static async _ensureAuthenticated() {
    // Check if user is authenticated
    const isAuthenticated = await AuthenticationService.isAuthenticated();
    if (!isAuthenticated) {
      throw new Error('User not authenticated. Please sign in to continue.');
    }

    // Get current user
    const user = await AuthenticationService.getCurrentUser();
    if (!user || !user.id) {
      throw new Error('Unable to retrieve user information. Please sign in again.');
    }

    // Ensure tokens are valid (this will refresh if needed)
    const tokens = await TokenStorageService.getTokens();
    if (!tokens) {
      throw new Error('Authentication tokens not found. Please sign in again.');
    }

    // Check if tokens need refresh
    const needsRefresh = await TokenStorageService.needsRefresh();
    if (needsRefresh) {
      const refreshed = await AuthenticationService.refreshTokens();
      if (!refreshed) {
        throw new Error('Unable to refresh authentication tokens. Please sign in again.');
      }
    }

    return user.id;
  }

  /**
   * Execute DynamoDB operation with authentication and error handling
   * @private
   * @param {Function} operation - The DynamoDB operation to execute
   * @param {string} operationName - Name of the operation for error reporting
   * @param {Object} context - Additional context for error handling
   * @returns {Promise<any>} Operation result
   */
  static async _executeWithAuth(operation, operationName, context = {}) {
    try {
      // Ensure user is authenticated
      await this._ensureAuthenticated();
      
      // Initialize clients if needed
      await this.initializeClients();
      
      // Execute the operation
      return await operation();
    } catch (error) {
      // Handle authentication-specific errors
      if (error.message.includes('not authenticated') || 
          error.message.includes('tokens') || 
          error.message.includes('sign in')) {
        // Clear potentially invalid tokens
        await TokenStorageService.clearTokens();
        throw error;
      }
      
      // For test environment, preserve original error messages
      if (process.env.NODE_ENV === 'test') {
        throw error;
      }
      
      // Handle other errors through existing error handler
      throw this.handleError(error, operationName, context);
    }
  }

  /**
   * Get a single item from DynamoDB table
   * @param {string} tableName - The table name
   * @param {Object} key - The primary key object
   * @param {Object} options - Additional options (ProjectionExpression, etc.)
   * @returns {Promise<Object|null>} The item or null if not found
   */
  static async getItem(tableName, key, options = {}) {
    return await this._executeWithAuth(async () => {
      const command = new GetCommand({
        TableName: tableName,
        Key: key,
        ...options,
      });

      const response = await this.docClient.send(command);
      return response.Item || null;
    }, 'getItem', { tableName, key });
  }

  /**
   * Create or update an item in DynamoDB table
   * @param {string} tableName - The table name
   * @param {Object} item - The item to put
   * @param {Object} options - Additional options (ConditionExpression, etc.)
   * @returns {Promise<Object>} The operation result
   */
  static async putItem(tableName, item, options = {}) {
    return await this._executeWithAuth(async () => {
      // Add timestamps
      const timestamp = new Date().toISOString();
      const itemWithTimestamps = {
        ...item,
        updatedAt: timestamp,
        ...(item.createdAt ? {} : { createdAt: timestamp }),
        version: (item.version || 0) + 1,
      };

      const command = new PutCommand({
        TableName: tableName,
        Item: itemWithTimestamps,
        ...options,
      });

      await this.docClient.send(command);
      return { success: true, item: itemWithTimestamps };
    }, 'putItem', { tableName, item });
  }

  /**
   * Update an item in DynamoDB table
   * @param {string} tableName - The table name
   * @param {Object} key - The primary key object
   * @param {Object} updates - The updates to apply
   * @param {Object} options - Additional options (ConditionExpression, etc.)
   * @returns {Promise<Object>} The updated item
   */
  static async updateItem(tableName, key, updates, options = {}) {
    return await this._executeWithAuth(async () => {
      // Build update expression
      const updateExpressions = [];
      const expressionAttributeNames = {};
      const expressionAttributeValues = {};
      
      // Add timestamp update
      updates.updatedAt = new Date().toISOString();
      
      // Increment version for optimistic locking
      updateExpressions.push('#version = if_not_exists(#version, :zero) + :one');
      expressionAttributeNames['#version'] = 'version';
      expressionAttributeValues[':zero'] = 0;
      expressionAttributeValues[':one'] = 1;

      Object.keys(updates).forEach((key, index) => {
        const attrName = `#attr${index}`;
        const attrValue = `:val${index}`;
        
        updateExpressions.push(`${attrName} = ${attrValue}`);
        expressionAttributeNames[attrName] = key;
        expressionAttributeValues[attrValue] = updates[key];
      });

      const command = new UpdateCommand({
        TableName: tableName,
        Key: key,
        UpdateExpression: `SET ${updateExpressions.join(', ')}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnValues: 'ALL_NEW',
        ...options,
      });

      const response = await this.docClient.send(command);
      return { success: true, item: response.Attributes };
    }, 'updateItem', { tableName, key, updates });
  }

  /**
   * Delete an item from DynamoDB table
   * @param {string} tableName - The table name
   * @param {Object} key - The primary key object
   * @param {Object} options - Additional options (ConditionExpression, etc.)
   * @returns {Promise<Object>} The operation result
   */
  static async deleteItem(tableName, key, options = {}) {
    return await this._executeWithAuth(async () => {
      const command = new DeleteCommand({
        TableName: tableName,
        Key: key,
        ReturnValues: 'ALL_OLD',
        ...options,
      });

      const response = await this.docClient.send(command);
      return { success: true, deletedItem: response.Attributes };
    }, 'deleteItem', { tableName, key });
  }

  /**
   * Query items from DynamoDB table
   * @param {string} tableName - The table name
   * @param {string} keyConditionExpression - The key condition expression
   * @param {Object} options - Additional options (FilterExpression, IndexName, etc.)
   * @returns {Promise<Array>} Array of items
   */
  static async queryItems(tableName, keyConditionExpression, options = {}) {
    return await this._executeWithAuth(async () => {
      const command = new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: keyConditionExpression,
        ...options,
      });

      const response = await this.docClient.send(command);
      return {
        items: response.Items || [],
        lastEvaluatedKey: response.LastEvaluatedKey,
        count: response.Count,
        scannedCount: response.ScannedCount,
      };
    }, 'queryItems', { tableName, keyConditionExpression });
  }

  /**
   * Scan items from DynamoDB table (use sparingly)
   * @param {string} tableName - The table name
   * @param {Object} options - Additional options (FilterExpression, etc.)
   * @returns {Promise<Array>} Array of items
   */
  static async scanItems(tableName, options = {}) {
    return await this._executeWithAuth(async () => {
      const command = new ScanCommand({
        TableName: tableName,
        ...options,
      });

      const response = await this.docClient.send(command);
      return {
        items: response.Items || [],
        lastEvaluatedKey: response.LastEvaluatedKey,
        count: response.Count,
        scannedCount: response.ScannedCount,
      };
    }, 'scanItems', { tableName });
  }

  /**
   * Batch get items from DynamoDB
   * @param {Object} requestItems - The batch get request items
   * @returns {Promise<Object>} Batch get response
   */
  static async batchGetItems(requestItems) {
    return await this._executeWithAuth(async () => {
      const command = new BatchGetCommand({
        RequestItems: requestItems,
      });

      const response = await this.docClient.send(command);
      return {
        responses: response.Responses || {},
        unprocessedKeys: response.UnprocessedKeys || {},
      };
    }, 'batchGetItems', { requestItems });
  }

  /**
   * Batch write items to DynamoDB
   * @param {Object} requestItems - The batch write request items
   * @returns {Promise<Object>} Batch write response
   */
  static async batchWriteItems(requestItems) {
    return await this._executeWithAuth(async () => {
      const command = new BatchWriteCommand({
        RequestItems: requestItems,
      });

      const response = await this.docClient.send(command);
      return {
        unprocessedItems: response.UnprocessedItems || {},
      };
    }, 'batchWriteItems', { requestItems });
  }

  /**
   * Handle and format DynamoDB errors
   * @param {Error} error - The original error
   * @param {string} operation - The operation that failed
   * @param {Object} context - Additional context for debugging
   * @returns {Error} Formatted error
   */
  static handleError(error, operation, context = {}) {
    // Sanitize error for logging (remove sensitive data)
    const sanitizedError = this.sanitizeError(error, operation);
    console.error(`DynamoDB ${operation} error:`, sanitizedError.message);
    
    // Create a more user-friendly error based on the AWS error
    switch (error.name) {
      case 'ResourceNotFoundException':
        return new Error('The requested data could not be found. Please try again.');
      
      case 'ConditionalCheckFailedException':
        return new Error('Item has been modified by another process. Please refresh and try again.');
      
      case 'ProvisionedThroughputExceededException':
        return new Error('Service is temporarily busy. Please try again in a moment.');
      
      case 'ValidationException':
        return new Error('Invalid data provided. Please check your input and try again.');
      
      case 'AccessDeniedException':
        return new Error('Access denied. Please sign in again to continue.');
      
      case 'ThrottlingException':
        return new Error('Request rate too high. Please try again in a moment.');
      
      case 'NetworkingError':
      case 'TimeoutError':
        return new Error('Network connection failed. Please check your internet connection.');
      
      case 'UnauthorizedOperation':
        return new Error('You are not authorized to perform this operation. Please sign in again.');
      
      default:
        // Return sanitized error message for unknown errors
        return new Error('Database operation failed. Please try again.');
    }
  }

  /**
   * Generate a unique ID for new items
   * @returns {string} Unique ID
   */
  static generateId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Validate required fields in an item
   * @param {Object} item - The item to validate
   * @param {Array<string>} requiredFields - Array of required field names
   * @throws {Error} If validation fails
   */
  static validateRequiredFields(item, requiredFields) {
    const missingFields = requiredFields.filter(field => 
      item[field] === undefined || item[field] === null || item[field] === ''
    );
    
    if (missingFields.length > 0) {
      throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
    }
  }

  /**
   * Build expression attribute names and values for queries
   * @param {Object} attributes - Key-value pairs for the expression
   * @returns {Object} Expression attribute names and values
   */
  static buildExpressionAttributes(attributes) {
    const expressionAttributeNames = {};
    const expressionAttributeValues = {};
    
    Object.keys(attributes).forEach((key, index) => {
      const nameKey = `#attr${index}`;
      const valueKey = `:val${index}`;
      
      expressionAttributeNames[nameKey] = key;
      expressionAttributeValues[valueKey] = attributes[key];
    });
    
    return { expressionAttributeNames, expressionAttributeValues };
  }

  /**
   * Validate that an item belongs to the current user (data isolation)
   * @param {Object} item - The item to validate
   * @param {string} currentUserId - Current user ID
   * @throws {Error} If item doesn't belong to current user
   */
  static validateUserDataIsolation(item, currentUserId) {
    if (!item) {
      throw new Error('Item not found');
    }
    
    if (!item.userId || item.userId !== currentUserId) {
      throw new Error('Access denied: Item does not belong to current user');
    }
  }

  /**
   * Sanitize error messages to prevent sensitive data leakage
   * @param {Error} error - Original error
   * @param {string} operation - Operation name
   * @returns {Error} Sanitized error
   */
  static sanitizeError(error, operation) {
    // List of sensitive patterns to remove from error messages
    const sensitivePatterns = [
      /userId:\s*[a-zA-Z0-9-]+/gi,
      /accessKeyId:\s*[A-Z0-9]+/gi,
      /secretAccessKey:\s*[A-Za-z0-9/+=]+/gi,
      /token:\s*[A-Za-z0-9._-]+/gi,
      /Key:\s*\{[^}]+\}/gi,
      /Item:\s*\{[^}]+\}/gi
    ];

    let sanitizedMessage = error.message;
    
    // Remove sensitive patterns
    sensitivePatterns.forEach(pattern => {
      sanitizedMessage = sanitizedMessage.replace(pattern, '[REDACTED]');
    });

    // Create new error with sanitized message
    const sanitizedError = new Error(sanitizedMessage);
    sanitizedError.name = error.name;
    sanitizedError.operation = operation;
    
    return sanitizedError;
  }
}

export default DynamoDBService;