/**
 * Debug script to help diagnose token retrieval issues
 * Run this to test different scenarios and identify the root cause
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

// Simple test to check AsyncStorage directly
async function testAsyncStorage() {
  console.log('=== Testing AsyncStorage directly ===');
  
  try {
    // Test basic AsyncStorage functionality
    await AsyncStorage.setItem('test_key', 'test_value');
    const value = await AsyncStorage.getItem('test_key');
    console.log('AsyncStorage test:', value === 'test_value' ? 'PASS' : 'FAIL');
    
    // Check for existing tokens
    const keys = [
      'auth_access_token',
      'auth_refresh_token', 
      'auth_id_token',
      'auth_token_expiry'
    ];
    
    console.log('Checking for existing tokens:');
    for (const key of keys) {
      const value = await AsyncStorage.getItem(key);
      console.log(`  ${key}: ${value ? 'EXISTS' : 'NOT FOUND'}`);
    }
    
    // Clean up test
    await AsyncStorage.removeItem('test_key');
    
  } catch (error) {
    console.error('AsyncStorage test failed:', error);
  }
}

// Test environment variables
function testEnvironment() {
  console.log('=== Testing Environment Variables ===');
  
  const envVars = [
    'EXPO_PUBLIC_USE_DYNAMODB',
    'EXPO_PUBLIC_AWS_REGION',
    'EXPO_PUBLIC_AWS_ACCESS_KEY_ID',
    'EXPO_PUBLIC_COGNITO_USER_POOL_ID',
    'EXPO_PUBLIC_COGNITO_USER_POOL_CLIENT_ID'
  ];
  
  envVars.forEach(varName => {
    const value = process.env[varName];
    console.log(`  ${varName}: ${value ? 'SET' : 'NOT SET'}`);
  });
}

// Test token storage service configuration
async function testTokenStorageConfig() {
  console.log('=== Testing Token Storage Configuration ===');
  
  try {
    // Import the service
    const TokenStorageService = await import('./src/services/TokenStorageService.js');
    
    console.log('TokenStorageService imported successfully');
    console.log('DynamoDB enabled:', TokenStorageService.default.isDynamoDBEnabled());
    
    // Test getting tokens (should return null if none exist)
    const tokens = await TokenStorageService.default.getTokens();
    console.log('Current tokens:', tokens ? 'FOUND' : 'NOT FOUND');
    
  } catch (error) {
    console.error('TokenStorageService test failed:', error);
  }
}

// Main debug function
async function debugTokens() {
  console.log('🔍 Starting token debug session...\n');
  
  await testAsyncStorage();
  console.log('');
  
  testEnvironment();
  console.log('');
  
  await testTokenStorageConfig();
  console.log('');
  
  console.log('✅ Debug session complete');
}

// Export for use in React Native
export default debugTokens;

// For Node.js testing
if (typeof require !== 'undefined' && require.main === module) {
  debugTokens().catch(console.error);
}