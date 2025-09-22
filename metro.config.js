const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Add polyfills for AWS SDK and Cognito
config.resolver.alias = {
  ...config.resolver.alias,
  'buffer': 'buffer',
  'process': 'process',
  'crypto': 'react-native-get-random-values',
};

module.exports = config;