import { DynamoDBClient, CreateTableCommand, DescribeTableCommand } from '@aws-sdk/client-dynamodb';
import { AWS_CONFIG } from '../config/aws-config.js';
import { TABLE_SCHEMAS } from '../config/dynamodb-schemas.js';

/**
 * DynamoDB Table Creation Utility
 * Provides functions to create and manage DynamoDB tables for the Parent-Child App
 */
export class DynamoDBTableCreator {
  static client = null;

  /**
   * Initialize DynamoDB client
   */
  static initializeClient() {
    if (!this.client) {
      this.client = new DynamoDBClient({
        region: AWS_CONFIG.region,
        credentials: {
          accessKeyId: AWS_CONFIG.accessKeyId,
          secretAccessKey: AWS_CONFIG.secretAccessKey,
        },
      });
    }
  }

  /**
   * Check if a table exists
   * @param {string} tableName - The table name to check
   * @returns {Promise<boolean>} True if table exists, false otherwise
   */
  static async tableExists(tableName) {
    try {
      this.initializeClient();
      
      const command = new DescribeTableCommand({
        TableName: tableName,
      });

      await this.client.send(command);
      return true;
    } catch (error) {
      if (error.name === 'ResourceNotFoundException') {
        return false;
      }
      throw error;
    }
  }

  /**
   * Create a single table
   * @param {string} tableKey - The table key from TABLE_SCHEMAS
   * @returns {Promise<Object>} Creation result
   */
  static async createTable(tableKey) {
    try {
      this.initializeClient();
      
      const schema = TABLE_SCHEMAS[tableKey];
      if (!schema) {
        throw new Error(`Table schema not found for key: ${tableKey}`);
      }

      // Check if table already exists
      const exists = await this.tableExists(schema.TableName);
      if (exists) {
        console.log(`Table ${schema.TableName} already exists`);
        return { success: true, message: `Table ${schema.TableName} already exists` };
      }

      console.log(`Creating table: ${schema.TableName}`);
      
      const command = new CreateTableCommand(schema);
      const response = await this.client.send(command);

      console.log(`Table ${schema.TableName} created successfully`);
      return { 
        success: true, 
        message: `Table ${schema.TableName} created successfully`,
        tableDescription: response.TableDescription 
      };
    } catch (error) {
      console.error(`Error creating table ${tableKey}:`, error);
      throw new Error(`Failed to create table ${tableKey}: ${error.message}`);
    }
  }

  /**
   * Create all tables defined in the schema
   * @returns {Promise<Array>} Array of creation results
   */
  static async createAllTables() {
    const results = [];
    const tableKeys = Object.keys(TABLE_SCHEMAS);

    console.log(`Creating ${tableKeys.length} tables...`);

    for (const tableKey of tableKeys) {
      try {
        const result = await this.createTable(tableKey);
        results.push({ tableKey, ...result });
        
        // Add a small delay between table creations to avoid throttling
        if (tableKeys.indexOf(tableKey) < tableKeys.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } catch (error) {
        results.push({ 
          tableKey, 
          success: false, 
          error: error.message 
        });
      }
    }

    return results;
  }

  /**
   * Wait for a table to become active
   * @param {string} tableName - The table name to wait for
   * @param {number} maxWaitTime - Maximum wait time in milliseconds (default: 5 minutes)
   * @returns {Promise<boolean>} True if table is active, false if timeout
   */
  static async waitForTableActive(tableName, maxWaitTime = 300000) {
    const startTime = Date.now();
    const pollInterval = 5000; // 5 seconds

    while (Date.now() - startTime < maxWaitTime) {
      try {
        this.initializeClient();
        
        const command = new DescribeTableCommand({
          TableName: tableName,
        });

        const response = await this.client.send(command);
        const status = response.Table.TableStatus;

        console.log(`Table ${tableName} status: ${status}`);

        if (status === 'ACTIVE') {
          return true;
        }

        if (status === 'FAILED') {
          throw new Error(`Table ${tableName} creation failed`);
        }

        // Wait before next poll
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      } catch (error) {
        if (error.name === 'ResourceNotFoundException') {
          console.log(`Table ${tableName} not found, continuing to wait...`);
        } else {
          throw error;
        }
      }
    }

    return false; // Timeout
  }

  /**
   * Wait for all tables to become active
   * @param {Array<string>} tableNames - Array of table names to wait for
   * @returns {Promise<Object>} Results of waiting for each table
   */
  static async waitForAllTablesActive(tableNames = null) {
    if (!tableNames) {
      tableNames = Object.values(TABLE_SCHEMAS).map(schema => schema.TableName);
    }

    const results = {};

    for (const tableName of tableNames) {
      try {
        console.log(`Waiting for table ${tableName} to become active...`);
        const isActive = await this.waitForTableActive(tableName);
        results[tableName] = { 
          success: isActive, 
          message: isActive ? 'Table is active' : 'Timeout waiting for table to become active' 
        };
      } catch (error) {
        results[tableName] = { 
          success: false, 
          error: error.message 
        };
      }
    }

    return results;
  }

  /**
   * Setup complete DynamoDB infrastructure
   * Creates all tables and waits for them to become active
   * @returns {Promise<Object>} Complete setup results
   */
  static async setupInfrastructure() {
    console.log('Starting DynamoDB infrastructure setup...');
    
    try {
      // Create all tables
      const creationResults = await this.createAllTables();
      
      // Get list of successfully created tables
      const createdTables = creationResults
        .filter(result => result.success)
        .map(result => TABLE_SCHEMAS[result.tableKey].TableName);

      // Wait for tables to become active
      let activeResults = {};
      if (createdTables.length > 0) {
        console.log('Waiting for tables to become active...');
        activeResults = await this.waitForAllTablesActive(createdTables);
      }

      const summary = {
        totalTables: Object.keys(TABLE_SCHEMAS).length,
        createdTables: creationResults.filter(r => r.success).length,
        failedCreations: creationResults.filter(r => !r.success).length,
        activeTables: Object.values(activeResults).filter(r => r.success).length,
        creationResults,
        activeResults,
      };

      console.log('DynamoDB infrastructure setup complete:', summary);
      return summary;
    } catch (error) {
      console.error('DynamoDB infrastructure setup failed:', error);
      throw error;
    }
  }

  /**
   * Validate table configuration
   * Checks if all required tables exist and are accessible
   * @returns {Promise<Object>} Validation results
   */
  static async validateInfrastructure() {
    console.log('Validating DynamoDB infrastructure...');
    
    const results = {};
    const tableKeys = Object.keys(TABLE_SCHEMAS);

    for (const tableKey of tableKeys) {
      const schema = TABLE_SCHEMAS[tableKey];
      try {
        const exists = await this.tableExists(schema.TableName);
        results[tableKey] = {
          tableName: schema.TableName,
          exists,
          status: exists ? 'OK' : 'MISSING'
        };
      } catch (error) {
        results[tableKey] = {
          tableName: schema.TableName,
          exists: false,
          status: 'ERROR',
          error: error.message
        };
      }
    }

    const summary = {
      totalTables: tableKeys.length,
      existingTables: Object.values(results).filter(r => r.exists).length,
      missingTables: Object.values(results).filter(r => !r.exists).length,
      errorTables: Object.values(results).filter(r => r.status === 'ERROR').length,
      results
    };

    console.log('Infrastructure validation complete:', summary);
    return summary;
  }
}

export default DynamoDBTableCreator;