// Jest setup file for React Native testing
import 'react-native-get-random-values';

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
  getAllKeys: jest.fn(() => Promise.resolve([])),
  clear: jest.fn(() => Promise.resolve()),
  multiGet: jest.fn(() => Promise.resolve([])),
  multiSet: jest.fn(() => Promise.resolve()),
  multiRemove: jest.fn(() => Promise.resolve()),
}));

// Mock React Native modules
jest.mock('react-native', () => ({
  Platform: {
    OS: 'ios',
    select: jest.fn((obj) => obj.ios),
  },
  Dimensions: {
    get: jest.fn(() => ({ width: 375, height: 812 })),
  },
  Alert: {
    alert: jest.fn(),
  },
  StyleSheet: {
    create: jest.fn((styles) => styles),
  },
  View: 'View',
  Text: 'Text',
  ScrollView: 'ScrollView',
  TouchableOpacity: 'TouchableOpacity',
  Image: 'Image',
  ActivityIndicator: 'ActivityIndicator',
  FlatList: 'FlatList',
  TextInput: 'TextInput',
  Modal: 'Modal',
  Pressable: 'Pressable',
}));

// Mock React Native Community modules
jest.mock('@react-native-community/netinfo', () => ({
  default: {
    fetch: jest.fn(() => Promise.resolve({ isConnected: true, type: 'wifi' })),
    addEventListener: jest.fn(() => jest.fn()),
    removeEventListener: jest.fn(),
  },
}));

// Mock Expo modules
jest.mock('expo-notifications', () => ({
  requestPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted' })),
  scheduleNotificationAsync: jest.fn(() => Promise.resolve('notification-id')),
  cancelScheduledNotificationAsync: jest.fn(() => Promise.resolve()),
  getAllScheduledNotificationsAsync: jest.fn(() => Promise.resolve([])),
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted' })),
  cancelAllScheduledNotificationsAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
  MaterialIcons: 'MaterialIcons',
  FontAwesome: 'FontAwesome',
  AntDesign: 'AntDesign',
}));

jest.mock('expo-font', () => ({
  loadAsync: jest.fn(() => Promise.resolve()),
  isLoaded: jest.fn(() => true),
}));

// Mock AWS SDK modules
jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn(() => ({
    send: jest.fn(),
  })),
}));

jest.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: {
    from: jest.fn(() => ({
      send: jest.fn(),
    })),
  },
  GetCommand: jest.fn(),
  PutCommand: jest.fn(),
  UpdateCommand: jest.fn(),
  DeleteCommand: jest.fn(),
  QueryCommand: jest.fn(),
  ScanCommand: jest.fn(),
  BatchGetCommand: jest.fn(),
  BatchWriteCommand: jest.fn(),
}));

jest.mock('@aws-sdk/client-cognito-identity-provider', () => ({
  CognitoIdentityProviderClient: jest.fn(() => ({
    send: jest.fn(),
  })),
  SignUpCommand: jest.fn(),
  ConfirmSignUpCommand: jest.fn(),
  InitiateAuthCommand: jest.fn(),
  GlobalSignOutCommand: jest.fn(),
  ForgotPasswordCommand: jest.fn(),
  ConfirmForgotPasswordCommand: jest.fn(),
  GetUserCommand: jest.fn(),
  UpdateUserAttributesCommand: jest.fn(),
  ChangePasswordCommand: jest.fn(),
  ResendConfirmationCodeCommand: jest.fn(),
}));

// Global test utilities
global.console = {
  ...console,
  // Suppress console.error and console.warn in tests unless needed
  error: jest.fn(),
  warn: jest.fn(),
  log: console.log,
  info: console.info,
  debug: console.debug,
};