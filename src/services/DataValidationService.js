/**
 * Data Validation Service
 * Provides comprehensive data validation and sanitization for DynamoDB operations
 * Prevents injection attacks and ensures data integrity
 */
class DataValidationService {
  // Maximum lengths for various fields
  static MAX_LENGTHS = {
    firstName: 50,
    lastName: 50,
    nickname: 30,
    email: 254, // RFC 5321 limit
    phoneNumber: 20,
    title: 100,
    description: 1000,
    notes: 2000,
    eventType: 50,
    interest: 50,
    allergy: 100,
    medication: 100,
  };

  // Allowed characters for different field types
  static PATTERNS = {
    name: /^[a-zA-Z\s\-'\.]+$/,
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    phoneNumber: /^\+?[\d\s\-\(\)]+$/,
    hexColor: /^#[0-9A-Fa-f]{6}$/,
    date: /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/,
    dateTime: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/,
    alphanumeric: /^[a-zA-Z0-9\s\-_]+$/,
    safeText: /^[a-zA-Z0-9\s\-_.,!?()]+$/,
  };

  // Dangerous patterns that should be rejected
  static DANGEROUS_PATTERNS = [
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    /javascript:.*/gi, // Remove entire javascript: expressions
    /on\w+\s*=/gi,
    /eval\s*\(/gi,
    /expression\s*\(/gi,
    /vbscript:.*/gi, // Remove entire vbscript: expressions
    /data:text\/html.*/gi, // Remove entire data:text/html expressions
    /<iframe/gi,
    /<object/gi,
    /<embed/gi,
    /<link/gi,
    /<meta/gi,
  ];

  /**
   * Sanitize string input by removing dangerous characters and patterns
   * @param {string} input - Input string to sanitize
   * @param {Object} options - Sanitization options
   * @returns {string} Sanitized string
   */
  static sanitizeString(input, options = {}) {
    if (typeof input !== 'string') {
      return input;
    }

    let sanitized = input;

    // Trim whitespace
    if (options.trim !== false) {
      sanitized = sanitized.trim();
    }

    // Remove null bytes
    sanitized = sanitized.replace(/\0/g, '');

    // Remove dangerous patterns
    this.DANGEROUS_PATTERNS.forEach((pattern) => {
      sanitized = sanitized.replace(pattern, '');
    });

    // Limit length if specified
    if (options.maxLength && typeof options.maxLength === 'number') {
      sanitized = sanitized.substring(0, options.maxLength);
    }

    // Apply specific pattern if provided
    if (options.pattern && options.pattern instanceof RegExp) {
      if (!options.pattern.test(sanitized)) {
        throw new Error(
          `Input does not match required pattern: ${options.pattern}`
        );
      }
    }

    return sanitized;
  }

  /**
   * Validate and sanitize email address
   * @param {string} email - Email address to validate
   * @returns {string} Sanitized email address
   * @throws {Error} If email is invalid
   */
  static validateEmail(email) {
    if (!email || typeof email !== 'string') {
      throw new Error('Email is required and must be a string');
    }

    const sanitized = this.sanitizeString(email, {
      maxLength: this.MAX_LENGTHS.email,
      pattern: this.PATTERNS.email,
    }).toLowerCase();

    if (!sanitized) {
      throw new Error('Email cannot be empty');
    }

    return sanitized;
  }

  /**
   * Validate and sanitize name fields
   * @param {string} name - Name to validate
   * @param {string} fieldName - Name of the field for error messages
   * @returns {string} Sanitized name
   * @throws {Error} If name is invalid
   */
  static validateName(name, fieldName = 'Name') {
    if (!name || typeof name !== 'string') {
      throw new Error(`${fieldName} is required and must be a string`);
    }

    // Check for dangerous patterns first
    if (this.containsDangerousPatterns(name)) {
      throw new Error(`${fieldName} contains invalid characters`);
    }

    // Check against name pattern before sanitization
    if (!this.PATTERNS.name.test(name.trim())) {
      throw new Error(`${fieldName} contains invalid characters`);
    }

    try {
      const sanitized = this.sanitizeString(name, {
        maxLength: this.MAX_LENGTHS.firstName,
      });

      if (!sanitized) {
        throw new Error(`${fieldName} cannot be empty`);
      }

      return sanitized;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Validate and sanitize phone number
   * @param {string} phoneNumber - Phone number to validate
   * @returns {string} Sanitized phone number
   * @throws {Error} If phone number is invalid
   */
  static validatePhoneNumber(phoneNumber) {
    if (!phoneNumber || typeof phoneNumber !== 'string') {
      return ''; // Phone number is optional
    }

    const sanitized = this.sanitizeString(phoneNumber, {
      maxLength: this.MAX_LENGTHS.phoneNumber,
      pattern: this.PATTERNS.phoneNumber,
    });

    return sanitized;
  }

  /**
   * Validate and sanitize hex color
   * @param {string} color - Hex color to validate
   * @returns {string} Sanitized hex color
   * @throws {Error} If color is invalid
   */
  static validateHexColor(color) {
    if (!color || typeof color !== 'string') {
      return '#48b6b0'; // Default color
    }

    try {
      const sanitized = this.sanitizeString(color, {
        pattern: this.PATTERNS.hexColor,
      });

      if (!sanitized) {
        return '#48b6b0'; // Default color if invalid
      }

      return sanitized;
    } catch (error) {
      throw new Error(
        'Favourite color must be a valid hex color (e.g., #ff6b6b)'
      );
    }
  }

  /**
   * Validate and sanitize date string
   * @param {string} date - Date string to validate (YYYY-MM-DD)
   * @returns {string} Sanitized date string
   * @throws {Error} If date is invalid
   */
  static validateDate(date) {
    if (!date || typeof date !== 'string') {
      throw new Error('Date is required and must be a string');
    }

    const trimmed = date.trim();

    // Check format first
    if (!this.PATTERNS.date.test(trimmed)) {
      throw new Error('Date must be in YYYY-MM-DD format');
    }

    // Parse the date components to validate ranges
    const [year, month, day] = trimmed.split('-').map(Number);

    // Validate year (reasonable range)
    if (year < 1900 || year > 2100) {
      throw new Error('Invalid date');
    }

    // Validate month
    if (month < 1 || month > 12) {
      throw new Error('Invalid date');
    }

    // Validate day
    if (day < 1 || day > 31) {
      throw new Error('Invalid date');
    }

    // Validate that it's a real date (handles leap years, month lengths, etc.)
    const dateObj = new Date(year, month - 1, day); // month is 0-indexed in Date constructor
    if (
      dateObj.getFullYear() !== year ||
      dateObj.getMonth() !== month - 1 ||
      dateObj.getDate() !== day
    ) {
      throw new Error('Invalid date');
    }

    try {
      const sanitized = this.sanitizeString(trimmed);
      return sanitized;
    } catch (error) {
      throw new Error('Date must be in YYYY-MM-DD format');
    }
  }

  /**
   * Validate and sanitize date-time string
   * @param {string} dateTime - Date-time string to validate (ISO format)
   * @returns {string} Sanitized date-time string
   * @throws {Error} If date-time is invalid
   */
  static validateDateTime(dateTime) {
    if (!dateTime || typeof dateTime !== 'string') {
      throw new Error('Date-time is required and must be a string');
    }

    const sanitized = this.sanitizeString(dateTime, {
      pattern: this.PATTERNS.dateTime,
    });

    if (!sanitized) {
      throw new Error('Date-time must be in ISO format');
    }

    // Validate that it's a real date-time
    const dateObj = new Date(sanitized);
    if (isNaN(dateObj.getTime())) {
      throw new Error('Invalid date-time');
    }

    return sanitized;
  }

  /**
   * Validate and sanitize text fields (titles, descriptions, notes)
   * @param {string} text - Text to validate
   * @param {string} fieldName - Name of the field for error messages
   * @param {number} maxLength - Maximum length allowed
   * @returns {string} Sanitized text
   */
  static validateText(text, fieldName = 'Text', maxLength = 1000) {
    if (!text || typeof text !== 'string') {
      return ''; // Text fields are usually optional
    }

    const sanitized = this.sanitizeString(text, {
      maxLength: maxLength,
      pattern: this.PATTERNS.safeText,
    });

    return sanitized;
  }

  /**
   * Validate and sanitize array of strings
   * @param {Array} array - Array to validate
   * @param {string} fieldName - Name of the field for error messages
   * @param {Function} itemValidator - Function to validate each item
   * @returns {Array} Sanitized array
   */
  static validateStringArray(array, fieldName = 'Array', itemValidator = null) {
    if (!array) {
      return [];
    }

    if (!Array.isArray(array)) {
      throw new Error(`${fieldName} must be an array`);
    }

    const sanitized = array
      .filter((item) => item && typeof item === 'string' && item.trim() !== '')
      .map((item) => {
        if (itemValidator && typeof itemValidator === 'function') {
          return itemValidator(item);
        }
        return this.sanitizeString(item, { maxLength: 100 });
      })
      .filter((item) => item && item.trim() !== '');

    return sanitized;
  }

  /**
   * Validate child profile data
   * @param {Object} childData - Child data to validate
   * @returns {Object} Validated and sanitized child data
   * @throws {Error} If validation fails
   */
  static validateChildData(childData) {
    if (!childData || typeof childData !== 'object') {
      throw new Error('Child data must be an object');
    }

    const validated = {};

    // Required fields
    validated.firstName = this.validateName(childData.firstName, 'First name');

    // Optional name fields
    if (childData.nickname) {
      validated.nickname = this.validateName(childData.nickname, 'Nickname');
    }

    if (childData.lastName) {
      validated.lastName = this.validateName(childData.lastName, 'Last name');
    }

    // Gender validation
    if (childData.gender) {
      if (!['boy', 'girl'].includes(childData.gender)) {
        throw new Error('Gender must be either "boy" or "girl"');
      }
      validated.gender = childData.gender;
    }

    // Birthday validation (DD/MM/YYYY format from form)
    if (childData.birthday) {
      // Convert DD/MM/YYYY to YYYY-MM-DD for storage
      const birthdayParts = childData.birthday.split('/');
      if (birthdayParts.length === 3) {
        const [day, month, year] = birthdayParts;
        const isoDate = `${year}-${month.padStart(2, '0')}-${day.padStart(
          2,
          '0'
        )}`;
        validated.dateOfBirth = this.validateDate(isoDate);
        validated.birthday = childData.birthday; // Keep original format for UI

        // Check if date is not in the future
        const birthDate = new Date(validated.dateOfBirth);
        if (birthDate > new Date()) {
          throw new Error('Date of birth cannot be in the future');
        }
      } else {
        validated.birthday = childData.birthday; // Keep as-is if not in expected format
      }
    }

    // Legacy dateOfBirth field (YYYY-MM-DD format)
    if (childData.dateOfBirth && !childData.birthday) {
      validated.dateOfBirth = this.validateDate(childData.dateOfBirth);

      // Check if date is not in the future
      const birthDate = new Date(validated.dateOfBirth);
      if (birthDate > new Date()) {
        throw new Error('Date of birth cannot be in the future');
      }
    }

    // Color validation
    if (childData.favourColor) {
      validated.favourColor = this.validateHexColor(childData.favourColor);
    }

    // School fields
    if (childData.primarySchool) {
      validated.primarySchool = this.sanitizeString(childData.primarySchool, {
        maxLength: 100,
      });
    }

    if (childData.secondarySchool) {
      validated.secondarySchool = this.sanitizeString(
        childData.secondarySchool,
        { maxLength: 100 }
      );
    }

    // Array fields for interests and activities
    if (childData.favourCartoons) {
      validated.favourCartoons = this.validateStringArray(
        childData.favourCartoons,
        'Favourite cartoons',
        (cartoon) => this.sanitizeString(cartoon, { maxLength: 50 })
      );
    }

    if (childData.customCartoons) {
      validated.customCartoons = this.validateStringArray(
        childData.customCartoons,
        'Custom cartoons',
        (cartoon) => this.sanitizeString(cartoon, { maxLength: 50 })
      );
    }

    if (childData.favourSports) {
      validated.favourSports = this.validateStringArray(
        childData.favourSports,
        'Favourite sports',
        (sport) => this.sanitizeString(sport, { maxLength: 50 })
      );
    }

    if (childData.customSports) {
      validated.customSports = this.validateStringArray(
        childData.customSports,
        'Custom sports',
        (sport) => this.sanitizeString(sport, { maxLength: 50 })
      );
    }

    if (childData.hobbies) {
      validated.hobbies = this.validateStringArray(
        childData.hobbies,
        'Hobbies',
        (hobby) => this.sanitizeString(hobby, { maxLength: 50 })
      );
    }

    if (childData.customHobbies) {
      validated.customHobbies = this.validateStringArray(
        childData.customHobbies,
        'Custom hobbies',
        (hobby) => this.sanitizeString(hobby, { maxLength: 50 })
      );
    }

    // Photo field (base64 string or file path)
    if (childData.photo) {
      // Basic validation - ensure it's a string and not too large
      if (typeof childData.photo === 'string') {
        // Limit photo data size (e.g., 5MB base64 encoded)
        if (childData.photo.length > 7000000) {
          // ~5MB base64
          throw new Error('Photo data is too large (max 5MB)');
        }
        validated.photo = childData.photo;
      }
    }

    // Legacy interests field for backward compatibility
    if (childData.interests) {
      validated.interests = this.validateStringArray(
        childData.interests,
        'Interests',
        (interest) =>
          this.sanitizeString(interest, {
            maxLength: this.MAX_LENGTHS.interest,
          })
      );
    }

    // Medical information
    if (childData.medicalInfo) {
      validated.medicalInfo = this.validateMedicalInfo(childData.medicalInfo);
    }

    return validated;
  }

  /**
   * Validate medical information
   * @param {Object} medicalInfo - Medical info to validate
   * @returns {Object} Validated medical info
   */
  static validateMedicalInfo(medicalInfo) {
    if (!medicalInfo || typeof medicalInfo !== 'object') {
      return { allergies: [], medications: [] };
    }

    const validated = {};

    if (medicalInfo.allergies) {
      validated.allergies = this.validateStringArray(
        medicalInfo.allergies,
        'Allergies',
        (allergy) =>
          this.sanitizeString(allergy, { maxLength: this.MAX_LENGTHS.allergy })
      );
    } else {
      validated.allergies = [];
    }

    if (medicalInfo.medications) {
      validated.medications = this.validateStringArray(
        medicalInfo.medications,
        'Medications',
        (medication) =>
          this.sanitizeString(medication, {
            maxLength: this.MAX_LENGTHS.medication,
          })
      );
    } else {
      validated.medications = [];
    }

    return validated;
  }

  /**
   * Validate event data
   * @param {Object} eventData - Event data to validate
   * @returns {Object} Validated and sanitized event data
   * @throws {Error} If validation fails
   */
  static validateEventData(eventData) {
    if (!eventData || typeof eventData !== 'object') {
      throw new Error('Event data must be an object');
    }

    const validated = {};

    // Required fields
    validated.title = this.validateText(
      eventData.title,
      'Title',
      this.MAX_LENGTHS.title
    );
    if (!validated.title) {
      throw new Error('Title is required');
    }

    validated.eventType = this.sanitizeString(eventData.eventType, {
      maxLength: this.MAX_LENGTHS.eventType,
      pattern: this.PATTERNS.alphanumeric,
    });
    if (!validated.eventType) {
      throw new Error('Event type is required');
    }

    // Optional fields
    if (eventData.description) {
      validated.description = this.validateText(
        eventData.description,
        'Description',
        this.MAX_LENGTHS.description
      );
    }

    if (eventData.notes) {
      validated.notes = this.validateText(
        eventData.notes,
        'Notes',
        this.MAX_LENGTHS.notes
      );
    }

    // Date/time validation
    if (eventData.isAllDay) {
      if (eventData.startDate) {
        validated.startDate = this.validateDate(eventData.startDate);
      }
      if (eventData.endDate) {
        validated.endDate = this.validateDate(eventData.endDate);
      }
    } else {
      if (eventData.startDateTime) {
        validated.startDateTime = this.validateDateTime(
          eventData.startDateTime
        );
      }
      if (eventData.endDateTime) {
        validated.endDateTime = this.validateDateTime(eventData.endDateTime);
      }

      // Validate end is after start
      if (validated.startDateTime && validated.endDateTime) {
        const start = new Date(validated.startDateTime);
        const end = new Date(validated.endDateTime);
        if (end <= start) {
          throw new Error('End date-time must be after start date-time');
        }
      }
    }

    return validated;
  }

  /**
   * Validate user profile data
   * @param {Object} profileData - Profile data to validate
   * @returns {Object} Validated and sanitized profile data
   * @throws {Error} If validation fails
   */
  static validateUserProfileData(profileData) {
    if (!profileData || typeof profileData !== 'object') {
      throw new Error('Profile data must be an object');
    }

    const validated = {};

    // Email is required
    if (profileData.email) {
      validated.email = this.validateEmail(profileData.email);
    }

    // Optional name fields
    if (profileData.firstName) {
      validated.firstName = this.validateName(
        profileData.firstName,
        'First name'
      );
    }

    if (profileData.lastName) {
      validated.lastName = this.validateName(profileData.lastName, 'Last name');
    }

    if (profileData.phoneNumber) {
      validated.phoneNumber = this.validatePhoneNumber(profileData.phoneNumber);
    }

    // Validate preferences if provided
    if (profileData.preferences) {
      validated.preferences = this.validateUserPreferences(
        profileData.preferences
      );
    }

    return validated;
  }

  /**
   * Validate user preferences
   * @param {Object} preferences - Preferences to validate
   * @returns {Object} Validated preferences
   */
  static validateUserPreferences(preferences) {
    if (!preferences || typeof preferences !== 'object') {
      return {};
    }

    const validated = {};

    // Boolean preferences
    ['notifications', 'shareData', 'analytics'].forEach((key) => {
      if (preferences[key] !== undefined) {
        validated[key] = Boolean(preferences[key]);
      }
    });

    // String preferences with allowed values
    if (preferences.theme) {
      const allowedThemes = ['light', 'dark', 'auto'];
      if (!allowedThemes.includes(preferences.theme)) {
        throw new Error(`Theme must be one of: ${allowedThemes.join(', ')}`);
      }
      validated.theme = preferences.theme;
    }

    if (preferences.language) {
      const allowedLanguages = ['en', 'es', 'fr', 'de', 'it', 'pt', 'zh', 'ja'];
      if (!allowedLanguages.includes(preferences.language)) {
        throw new Error(
          `Language must be one of: ${allowedLanguages.join(', ')}`
        );
      }
      validated.language = preferences.language;
    }

    if (preferences.timeFormat) {
      const allowedFormats = ['12h', '24h'];
      if (!allowedFormats.includes(preferences.timeFormat)) {
        throw new Error(
          `Time format must be one of: ${allowedFormats.join(', ')}`
        );
      }
      validated.timeFormat = preferences.timeFormat;
    }

    if (preferences.dateFormat) {
      const allowedFormats = ['MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD'];
      if (!allowedFormats.includes(preferences.dateFormat)) {
        throw new Error(
          `Date format must be one of: ${allowedFormats.join(', ')}`
        );
      }
      validated.dateFormat = preferences.dateFormat;
    }

    return validated;
  }

  /**
   * Check if input contains dangerous patterns
   * @param {string} input - Input to check
   * @returns {boolean} True if input contains dangerous patterns
   */
  static containsDangerousPatterns(input) {
    if (typeof input !== 'string') {
      return false;
    }

    return this.DANGEROUS_PATTERNS.some((pattern) => pattern.test(input));
  }

  /**
   * Validate that an object doesn't contain dangerous patterns in any field
   * @param {Object} data - Data to validate
   * @throws {Error} If dangerous patterns are found
   */
  static validateNoDangerousPatterns(data) {
    if (!data || typeof data !== 'object') {
      return;
    }

    const checkValue = (value, path = '') => {
      if (typeof value === 'string') {
        if (this.containsDangerousPatterns(value)) {
          throw new Error(`Dangerous pattern detected in field: ${path}`);
        }
      } else if (Array.isArray(value)) {
        value.forEach((item, index) => {
          checkValue(item, `${path}[${index}]`);
        });
      } else if (typeof value === 'object' && value !== null) {
        Object.keys(value).forEach((key) => {
          checkValue(value[key], path ? `${path}.${key}` : key);
        });
      }
    };

    Object.keys(data).forEach((key) => {
      checkValue(data[key], key);
    });
  }
}

export default DataValidationService;
