import { DYNAMODB_TABLES } from './aws-config.js';

/**
 * DynamoDB Table Schema Definitions
 * These schemas define the table structures, indexes, and access patterns
 * for the Parent-Child App DynamoDB migration
 */

export const TABLE_SCHEMAS = {
  // Users Table Schema
  USERS: {
    TableName: DYNAMODB_TABLES.USERS,
    KeySchema: [
      {
        AttributeName: 'userId',
        KeyType: 'HASH' // Partition key
      }
    ],
    AttributeDefinitions: [
      {
        AttributeName: 'userId',
        AttributeType: 'S'
      }
    ],
    BillingMode: 'PAY_PER_REQUEST', // On-demand billing for cost efficiency
    StreamSpecification: {
      StreamEnabled: true,
      StreamViewType: 'NEW_AND_OLD_IMAGES'
    }
  },

  // Children Table Schema
  CHILDREN: {
    TableName: DYNAMODB_TABLES.CHILDREN,
    KeySchema: [
      {
        AttributeName: 'userId',
        KeyType: 'HASH' // Partition key
      },
      {
        AttributeName: 'childId',
        KeyType: 'RANGE' // Sort key
      }
    ],
    AttributeDefinitions: [
      {
        AttributeName: 'userId',
        AttributeType: 'S'
      },
      {
        AttributeName: 'childId',
        AttributeType: 'S'
      }
    ],
    BillingMode: 'PAY_PER_REQUEST',
    StreamSpecification: {
      StreamEnabled: true,
      StreamViewType: 'NEW_AND_OLD_IMAGES'
    }
  },

  // Calendar Events Table Schema
  CALENDAR_EVENTS: {
    TableName: DYNAMODB_TABLES.CALENDAR_EVENTS,
    KeySchema: [
      {
        AttributeName: 'userId',
        KeyType: 'HASH' // Partition key
      },
      {
        AttributeName: 'eventId',
        KeyType: 'RANGE' // Sort key
      }
    ],
    AttributeDefinitions: [
      {
        AttributeName: 'userId',
        AttributeType: 'S'
      },
      {
        AttributeName: 'eventId',
        AttributeType: 'S'
      },
      {
        AttributeName: 'startDate',
        AttributeType: 'S'
      },
      {
        AttributeName: 'childId',
        AttributeType: 'S'
      }
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: 'userId-startDate-index',
        KeySchema: [
          {
            AttributeName: 'userId',
            KeyType: 'HASH'
          },
          {
            AttributeName: 'startDate',
            KeyType: 'RANGE'
          }
        ],
        Projection: {
          ProjectionType: 'ALL'
        }
      },
      {
        IndexName: 'userId-childId-index',
        KeySchema: [
          {
            AttributeName: 'userId',
            KeyType: 'HASH'
          },
          {
            AttributeName: 'childId',
            KeyType: 'RANGE'
          }
        ],
        Projection: {
          ProjectionType: 'ALL'
        }
      }
    ],
    BillingMode: 'PAY_PER_REQUEST',
    StreamSpecification: {
      StreamEnabled: true,
      StreamViewType: 'NEW_AND_OLD_IMAGES'
    }
  },

  // Family Time Activities Table Schema
  FAMILY_TIME_ACTIVITIES: {
    TableName: DYNAMODB_TABLES.FAMILY_TIME_ACTIVITIES,
    KeySchema: [
      {
        AttributeName: 'userId',
        KeyType: 'HASH' // Partition key
      },
      {
        AttributeName: 'activityId',
        KeyType: 'RANGE' // Sort key
      }
    ],
    AttributeDefinitions: [
      {
        AttributeName: 'userId',
        AttributeType: 'S'
      },
      {
        AttributeName: 'activityId',
        AttributeType: 'S'
      },
      {
        AttributeName: 'date',
        AttributeType: 'S'
      }
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: 'userId-date-index',
        KeySchema: [
          {
            AttributeName: 'userId',
            KeyType: 'HASH'
          },
          {
            AttributeName: 'date',
            KeyType: 'RANGE'
          }
        ],
        Projection: {
          ProjectionType: 'ALL'
        }
      }
    ],
    BillingMode: 'PAY_PER_REQUEST',
    StreamSpecification: {
      StreamEnabled: true,
      StreamViewType: 'NEW_AND_OLD_IMAGES'
    }
  },

  // Authentication Tokens Table Schema
  AUTH_TOKENS: {
    TableName: DYNAMODB_TABLES.AUTH_TOKENS,
    KeySchema: [
      {
        AttributeName: 'userId',
        KeyType: 'HASH' // Partition key
      },
      {
        AttributeName: 'tokenId',
        KeyType: 'RANGE' // Sort key (always 'primary' for single token per user)
      }
    ],
    AttributeDefinitions: [
      {
        AttributeName: 'userId',
        AttributeType: 'S'
      },
      {
        AttributeName: 'tokenId',
        AttributeType: 'S'
      }
    ],
    BillingMode: 'PAY_PER_REQUEST',
    // No streams needed for tokens (sensitive data)
    StreamSpecification: {
      StreamEnabled: false
    },
    // Enable point-in-time recovery for security
    PointInTimeRecoverySpecification: {
      PointInTimeRecoveryEnabled: true
    }
  }
};

/**
 * Data Access Patterns
 * Documents the query patterns and their corresponding table/index usage
 */
export const ACCESS_PATTERNS = {
  // User operations
  GET_USER_PROFILE: {
    table: 'USERS',
    operation: 'GetItem',
    key: ['userId']
  },
  
  // Children operations
  GET_ALL_CHILDREN_FOR_USER: {
    table: 'CHILDREN',
    operation: 'Query',
    key: ['userId']
  },
  GET_CHILD_BY_ID: {
    table: 'CHILDREN',
    operation: 'GetItem',
    key: ['userId', 'childId']
  },
  
  // Calendar events operations
  GET_EVENTS_FOR_DATE_RANGE: {
    table: 'CALENDAR_EVENTS',
    operation: 'Query',
    index: 'userId-startDate-index',
    key: ['userId', 'startDate']
  },
  GET_EVENTS_FOR_CHILD: {
    table: 'CALENDAR_EVENTS',
    operation: 'Query',
    index: 'userId-childId-index',
    key: ['userId', 'childId']
  },
  GET_EVENT_BY_ID: {
    table: 'CALENDAR_EVENTS',
    operation: 'GetItem',
    key: ['userId', 'eventId']
  },
  
  // Family time activities operations
  GET_ACTIVITIES_FOR_DATE: {
    table: 'FAMILY_TIME_ACTIVITIES',
    operation: 'Query',
    index: 'userId-date-index',
    key: ['userId', 'date']
  },
  GET_ACTIVITY_BY_ID: {
    table: 'FAMILY_TIME_ACTIVITIES',
    operation: 'GetItem',
    key: ['userId', 'activityId']
  },
  
  // Authentication tokens operations
  GET_USER_TOKENS: {
    table: 'AUTH_TOKENS',
    operation: 'GetItem',
    key: ['userId', 'tokenId']
  },
  STORE_USER_TOKENS: {
    table: 'AUTH_TOKENS',
    operation: 'PutItem',
    key: ['userId', 'tokenId']
  },
  DELETE_USER_TOKENS: {
    table: 'AUTH_TOKENS',
    operation: 'DeleteItem',
    key: ['userId', 'tokenId']
  }
};