import CryptoJS from 'crypto-js';
import AuthenticationService from './AuthenticationService';
import TokenStorageService from './TokenStorageService';

/**
 * Data Encryption Service
 * Provides client-side encryption for sensitive data before storing in DynamoDB
 * Uses AES encryption with user-specific keys derived from authentication tokens
 */
class DataEncryptionService {
  // Fields that should be encrypted
  static SENSITIVE_FIELDS = [
    'phoneNumber',
    'medicalInfo',
    'allergies',
    'medications',
    'notes',
    'description'
  ];

  // Fields that should never be encrypted (needed for queries)
  static NEVER_ENCRYPT_FIELDS = [
    'userId',
    'childId',
    'eventId',
    'id',
    'firstName',
    'lastName',
    'email',
    'startDate',
    'endDate',
    'startDateTime',
    'endDateTime',
    'title',
    'eventType',
    'isAllDay',
    'isMultiDate',
    'createdAt',
    'updatedAt',
    'version'
  ];

  /**
   * Generate encryption key from user authentication context
   * @private
   * @returns {Promise<string>} Encryption key
   * @throws {Error} If user is not authenticated
   */
  static async _generateEncryptionKey() {
    const user = await AuthenticationService.getCurrentUser();
    if (!user || !user.id) {
      throw new Error('User not authenticated for encryption');
    }

    const tokens = await TokenStorageService.getTokens();
    if (!tokens || !tokens.idToken) {
      throw new Error('Authentication tokens not available for encryption');
    }

    try {
      // Create a deterministic key from user ID and a portion of the ID token
      // This ensures the same key is generated for the same user session
      const keyMaterial = user.id + tokens.idToken.substring(0, 32);
      
      // Use PBKDF2 to derive a strong encryption key
      const key = CryptoJS.PBKDF2(keyMaterial, user.id, {
        keySize: 256/32,
        iterations: 1000
      });

      return key.toString();
    } catch (error) {
      console.error('Error generating encryption key:', error);
      throw new Error('Failed to generate encryption key');
    }
  }

  /**
   * Encrypt sensitive data
   * @param {string} data - Data to encrypt
   * @returns {Promise<string>} Encrypted data with prefix
   */
  static async encryptData(data) {
    try {
      if (!data || typeof data !== 'string') {
        return data;
      }

      const key = await this._generateEncryptionKey();
      const encrypted = CryptoJS.AES.encrypt(data, key).toString();
      
      // Add prefix to identify encrypted data
      return `ENC:${encrypted}`;
    } catch (error) {
      console.error('Error encrypting data:', error);
      // Return original data if encryption fails (graceful degradation)
      return data;
    }
  }

  /**
   * Decrypt sensitive data
   * @param {string} encryptedData - Encrypted data with prefix
   * @returns {Promise<string>} Decrypted data
   */
  static async decryptData(encryptedData) {
    try {
      if (!encryptedData || typeof encryptedData !== 'string') {
        return encryptedData;
      }

      // Check if data is encrypted (has our prefix)
      if (!encryptedData.startsWith('ENC:')) {
        return encryptedData; // Not encrypted, return as-is
      }

      const key = await this._generateEncryptionKey();
      const encryptedContent = encryptedData.substring(4); // Remove 'ENC:' prefix
      
      const decrypted = CryptoJS.AES.decrypt(encryptedContent, key);
      return decrypted.toString(CryptoJS.enc.Utf8);
    } catch (error) {
      console.error('Error decrypting data:', error);
      // Return encrypted data if decryption fails
      return encryptedData;
    }
  }

  /**
   * Check if a field should be encrypted
   * @param {string} fieldName - Name of the field
   * @returns {boolean} True if field should be encrypted
   */
  static shouldEncryptField(fieldName) {
    // Never encrypt certain fields
    if (this.NEVER_ENCRYPT_FIELDS.includes(fieldName)) {
      return false;
    }

    // Encrypt sensitive fields
    if (this.SENSITIVE_FIELDS.includes(fieldName)) {
      return true;
    }

    // Check for nested sensitive fields
    return this.SENSITIVE_FIELDS.some(sensitiveField => 
      fieldName.toLowerCase().includes(sensitiveField.toLowerCase())
    );
  }

  /**
   * Encrypt sensitive fields in an object
   * @param {Object} data - Object containing data to encrypt
   * @returns {Promise<Object>} Object with sensitive fields encrypted
   */
  static async encryptSensitiveFields(data) {
    if (!data || typeof data !== 'object') {
      return data;
    }

    try {
      const encryptedData = { ...data };

      for (const [key, value] of Object.entries(encryptedData)) {
        if (this.shouldEncryptField(key)) {
          if (typeof value === 'string' && value.trim() !== '') {
            encryptedData[key] = await this.encryptData(value);
          } else if (typeof value === 'object' && value !== null) {
            // Handle nested objects (like medicalInfo)
            if (Array.isArray(value)) {
              // Encrypt array elements
              encryptedData[key] = await Promise.all(
                value.map(async (item) => {
                  if (typeof item === 'string') {
                    return await this.encryptData(item);
                  }
                  return item;
                })
              );
            } else {
              // Recursively encrypt nested objects
              encryptedData[key] = await this.encryptSensitiveFields(value);
            }
          }
        } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          // Recursively process nested objects even if parent field is not sensitive
          encryptedData[key] = await this.encryptSensitiveFields(value);
        }
      }

      return encryptedData;
    } catch (error) {
      console.error('Error encrypting sensitive fields:', error);
      // Return original data if encryption fails
      return data;
    }
  }

  /**
   * Decrypt sensitive fields in an object
   * @param {Object} data - Object containing encrypted data
   * @returns {Promise<Object>} Object with sensitive fields decrypted
   */
  static async decryptSensitiveFields(data) {
    if (!data || typeof data !== 'object') {
      return data;
    }

    try {
      const decryptedData = { ...data };

      for (const [key, value] of Object.entries(decryptedData)) {
        if (this.shouldEncryptField(key)) {
          if (typeof value === 'string') {
            decryptedData[key] = await this.decryptData(value);
          } else if (typeof value === 'object' && value !== null) {
            // Handle nested objects (like medicalInfo)
            if (Array.isArray(value)) {
              // Decrypt array elements
              decryptedData[key] = await Promise.all(
                value.map(async (item) => {
                  if (typeof item === 'string') {
                    return await this.decryptData(item);
                  }
                  return item;
                })
              );
            } else {
              // Recursively decrypt nested objects
              decryptedData[key] = await this.decryptSensitiveFields(value);
            }
          }
        } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          // Recursively process nested objects even if parent field is not sensitive
          decryptedData[key] = await this.decryptSensitiveFields(value);
        }
      }

      return decryptedData;
    } catch (error) {
      console.error('Error decrypting sensitive fields:', error);
      // Return original data if decryption fails
      return data;
    }
  }

  /**
   * Encrypt data for storage (batch operation)
   * @param {Array|Object} data - Data to encrypt
   * @returns {Promise<Array|Object>} Encrypted data
   */
  static async encryptForStorage(data) {
    try {
      if (Array.isArray(data)) {
        return await Promise.all(
          data.map(item => this.encryptSensitiveFields(item))
        );
      } else {
        return await this.encryptSensitiveFields(data);
      }
    } catch (error) {
      console.error('Error encrypting data for storage:', error);
      return data;
    }
  }

  /**
   * Decrypt data from storage (batch operation)
   * @param {Array|Object} data - Encrypted data
   * @returns {Promise<Array|Object>} Decrypted data
   */
  static async decryptFromStorage(data) {
    try {
      if (Array.isArray(data)) {
        return await Promise.all(
          data.map(item => this.decryptSensitiveFields(item))
        );
      } else {
        return await this.decryptSensitiveFields(data);
      }
    } catch (error) {
      console.error('Error decrypting data from storage:', error);
      return data;
    }
  }

  /**
   * Validate encryption key availability
   * @returns {Promise<boolean>} True if encryption is available
   */
  static async isEncryptionAvailable() {
    try {
      await this._generateEncryptionKey();
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Test encryption/decryption functionality
   * @returns {Promise<boolean>} True if encryption is working correctly
   */
  static async testEncryption() {
    try {
      const testData = 'Test encryption data';
      const encrypted = await this.encryptData(testData);
      const decrypted = await this.decryptData(encrypted);
      
      return decrypted === testData;
    } catch (error) {
      console.error('Encryption test failed:', error);
      return false;
    }
  }

  /**
   * Get encryption statistics for debugging
   * @returns {Promise<Object>} Encryption statistics
   */
  static async getEncryptionStats() {
    try {
      const isAvailable = await this.isEncryptionAvailable();
      const testPassed = isAvailable ? await this.testEncryption() : false;
      
      return {
        available: isAvailable,
        testPassed,
        sensitiveFields: this.SENSITIVE_FIELDS.length,
        protectedFields: this.NEVER_ENCRYPT_FIELDS.length
      };
    } catch (error) {
      console.error('Error getting encryption stats:', error);
      return {
        available: false,
        testPassed: false,
        sensitiveFields: this.SENSITIVE_FIELDS.length,
        protectedFields: this.NEVER_ENCRYPT_FIELDS.length
      };
    }
  }

  /**
   * Sanitize data for logging (remove sensitive information)
   * @param {Object} data - Data to sanitize
   * @returns {Object} Sanitized data safe for logging
   */
  static sanitizeForLogging(data) {
    if (!data || typeof data !== 'object') {
      return data;
    }

    const sanitized = { ...data };

    for (const [key, value] of Object.entries(sanitized)) {
      if (this.shouldEncryptField(key)) {
        if (typeof value === 'string') {
          sanitized[key] = value.startsWith('ENC:') ? '[ENCRYPTED]' : '[SENSITIVE]';
        } else if (Array.isArray(value)) {
          sanitized[key] = value.map(() => '[SENSITIVE]');
        } else if (typeof value === 'object' && value !== null) {
          sanitized[key] = this.sanitizeForLogging(value);
        }
      } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        sanitized[key] = this.sanitizeForLogging(value);
      }
    }

    return sanitized;
  }
}

export default DataEncryptionService;