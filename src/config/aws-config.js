export const AWS_CONFIG = {
  region: process.env.EXPO_PUBLIC_AWS_REGION || 'ap-east-1',
  accessKeyId: process.env.EXPO_PUBLIC_AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.EXPO_PUBLIC_AWS_SECRET_ACCESS_KEY,
};

export const COGNITO_CONFIG = {
  region: process.env.EXPO_PUBLIC_AWS_REGION || 'ap-east-1',
  userPoolId: process.env.EXPO_PUBLIC_COGNITO_USER_POOL_ID,
  userPoolWebClientId: process.env.EXPO_PUBLIC_COGNITO_USER_POOL_CLIENT_ID,
  mandatorySignIn: true,
  authenticationFlowType: 'USER_PASSWORD_AUTH',
};

export const DYNAMODB_CONFIG = {
  region: process.env.EXPO_PUBLIC_AWS_REGION || 'ap-east-1',
  tablePrefix: process.env.EXPO_PUBLIC_DYNAMODB_TABLE_PREFIX || 'FarmilyUP',
};

// DynamoDB Table Names
export const DYNAMODB_TABLES = {
  USERS: `${DYNAMODB_CONFIG.tablePrefix}-Users`,
  CHILDREN: `${DYNAMODB_CONFIG.tablePrefix}-Children`,
  CALENDAR_EVENTS: `${DYNAMODB_CONFIG.tablePrefix}-CalendarEvents`,
  FAMILY_TIME_ACTIVITIES: `${DYNAMODB_CONFIG.tablePrefix}-FarmilyTimeActivities`,
  AUTH_TOKENS: `${DYNAMODB_CONFIG.tablePrefix}-AuthTokens`,
};