// Polyfills for AWS SDK and Cognito in React Native
import 'react-native-get-random-values';

// Buffer polyfill
if (typeof global.Buffer === 'undefined') {
  global.Buffer = require('buffer').Buffer;
}

// Process polyfill
if (typeof global.process === 'undefined') {
  global.process = require('process');
  global.process.env = global.process.env || {};
}

// Crypto polyfill for Cognito
if (typeof global.crypto === 'undefined') {
  global.crypto = {
    getRandomValues: (array) => {
      const { getRandomValues } = require('react-native-get-random-values');
      return getRandomValues(array);
    }
  };
}

export default {};