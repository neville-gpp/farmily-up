export default {
  preset: 'react-native',
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/src/utils/testSetup.js'],
  transformIgnorePatterns: [
    'node_modules/(?!(react-native|@react-native|@aws-sdk|expo|@expo)/)',
  ],
  moduleNameMapper: {
    '^@/(.*)': '<rootDir>/src/$1',
  },
  testMatch: [
    '<rootDir>/src/**/__tests__/**/*.{js,jsx,ts,tsx}',
    '<rootDir>/src/**/*.{test,spec}.{js,jsx,ts,tsx}',
  ],
  collectCoverageFrom: [
    'src/**/*.{js,jsx}',
    '!src/**/__tests__/**',
    '!src/**/*.test.{js,jsx}',
    '!src/**/*.spec.{js,jsx}',
  ],
  moduleFileExtensions: ['js', 'jsx', 'json'],
  testTimeout: 10000,
};