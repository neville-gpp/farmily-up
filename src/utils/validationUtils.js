/**
 * Form validation utilities for authentication and user input
 */

/**
 * Email format validation using RFC 5322 compliant regex
 */
export const validateEmail = (email) => {
  if (!email || typeof email !== 'string') {
    return {
      isValid: false,
      error: 'Email is required'
    };
  }

  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  
  if (!emailRegex.test(email.trim())) {
    return {
      isValid: false,
      error: 'Please enter a valid email address'
    };
  }

  return {
    isValid: true,
    error: null
  };
};

/**
 * Password strength validation with comprehensive requirements
 */
export const validatePassword = (password) => {
  if (!password || typeof password !== 'string') {
    return {
      isValid: false,
      error: 'Password is required',
      strength: 'none',
      requirements: {
        minLength: false,
        hasUppercase: false,
        hasLowercase: false,
        hasNumber: false,
        hasSpecialChar: false
      }
    };
  }

  const requirements = {
    minLength: password.length >= 8,
    hasUppercase: /[A-Z]/.test(password),
    hasLowercase: /[a-z]/.test(password),
    hasNumber: /\d/.test(password),
    hasSpecialChar: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)
  };

  const metRequirements = Object.values(requirements).filter(Boolean).length;
  
  let strength = 'weak';
  if (metRequirements >= 5) {
    strength = 'strong';
  } else if (metRequirements >= 3) {
    strength = 'medium';
  }

  const isValid = Object.values(requirements).every(Boolean);
  
  let error = null;
  if (!isValid) {
    const missingRequirements = [];
    if (!requirements.minLength) missingRequirements.push('at least 8 characters');
    if (!requirements.hasUppercase) missingRequirements.push('one uppercase letter');
    if (!requirements.hasLowercase) missingRequirements.push('one lowercase letter');
    if (!requirements.hasNumber) missingRequirements.push('one number');
    if (!requirements.hasSpecialChar) missingRequirements.push('one special character');
    
    error = `Password must contain ${missingRequirements.join(', ')}`;
  }

  return {
    isValid,
    error,
    strength,
    requirements
  };
};

/**
 * Phone number format validation (supports multiple formats)
 */
export const validatePhoneNumber = (phoneNumber) => {
  if (!phoneNumber || typeof phoneNumber !== 'string') {
    return {
      isValid: false,
      error: 'Phone number is required'
    };
  }

  // Remove all non-digit characters for validation
  const digitsOnly = phoneNumber.replace(/\D/g, '');
  
  // Check for valid length (10-15 digits, accounting for country codes)
  if (digitsOnly.length < 10 || digitsOnly.length > 15) {
    return {
      isValid: false,
      error: 'Phone number must be between 10-15 digits'
    };
  }

  // Common phone number formats
  const phoneRegexes = [
    /^\+?1?[-.\s]?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}$/, // US format
    /^\+?[1-9]\d{1,14}$/, // International format (E.164)
    /^[0-9]{10}$/, // Simple 10-digit format
    /^\([0-9]{3}\)\s?[0-9]{3}-[0-9]{4}$/ // (XXX) XXX-XXXX format
  ];

  const isValidFormat = phoneRegexes.some(regex => regex.test(phoneNumber.trim()));
  
  if (!isValidFormat) {
    return {
      isValid: false,
      error: 'Please enter a valid phone number'
    };
  }

  return {
    isValid: true,
    error: null,
    formatted: formatPhoneNumber(phoneNumber)
  };
};

/**
 * Format phone number for display
 */
export const formatPhoneNumber = (phoneNumber) => {
  if (!phoneNumber) return '';
  
  const digitsOnly = phoneNumber.replace(/\D/g, '');
  
  // Format US phone numbers
  if (digitsOnly.length === 10) {
    return `(${digitsOnly.slice(0, 3)}) ${digitsOnly.slice(3, 6)}-${digitsOnly.slice(6)}`;
  }
  
  // Format US phone numbers with country code
  if (digitsOnly.length === 11 && digitsOnly.startsWith('1')) {
    return `+1 (${digitsOnly.slice(1, 4)}) ${digitsOnly.slice(4, 7)}-${digitsOnly.slice(7)}`;
  }
  
  // Return original for international numbers
  return phoneNumber;
};

/**
 * Name validation (first name, last name)
 */
export const validateName = (name, fieldName = 'Name') => {
  if (!name || typeof name !== 'string') {
    return {
      isValid: false,
      error: `${fieldName} is required`
    };
  }

  const trimmedName = name.trim();
  
  if (trimmedName.length < 2) {
    return {
      isValid: false,
      error: `${fieldName} must be at least 2 characters`
    };
  }

  if (trimmedName.length > 50) {
    return {
      isValid: false,
      error: `${fieldName} cannot exceed 50 characters`
    };
  }

  // Allow letters, spaces, hyphens, and apostrophes
  const nameRegex = /^[a-zA-Z\s\-']+$/;
  if (!nameRegex.test(trimmedName)) {
    return {
      isValid: false,
      error: `${fieldName} can only contain letters, spaces, hyphens, and apostrophes`
    };
  }

  return {
    isValid: true,
    error: null,
    formatted: trimmedName
  };
};

/**
 * Confirmation field validation (password confirmation, etc.)
 */
export const validateConfirmation = (value, originalValue, fieldName = 'Confirmation') => {
  if (!value || typeof value !== 'string') {
    return {
      isValid: false,
      error: `${fieldName} is required`
    };
  }

  if (value !== originalValue) {
    return {
      isValid: false,
      error: `${fieldName} does not match`
    };
  }

  return {
    isValid: true,
    error: null
  };
};

/**
 * Verification code validation
 */
export const validateVerificationCode = (code) => {
  if (!code || typeof code !== 'string') {
    return {
      isValid: false,
      error: 'Verification code is required'
    };
  }

  const trimmedCode = code.trim();
  
  // Most verification codes are 6 digits
  if (!/^\d{6}$/.test(trimmedCode)) {
    return {
      isValid: false,
      error: 'Verification code must be 6 digits'
    };
  }

  return {
    isValid: true,
    error: null,
    formatted: trimmedCode
  };
};

/**
 * Real-time form field validation
 */
export const createFieldValidator = (validationFunction) => {
  let timeoutId = null;
  
  return (value, callback, delay = 300) => {
    // Clear previous timeout
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    
    // Set new timeout for debounced validation
    timeoutId = setTimeout(() => {
      const result = validationFunction(value);
      callback(result);
    }, delay);
  };
};

/**
 * Validate entire authentication form
 */
export const validateAuthForm = (formData, formType = 'login') => {
  const errors = {};
  let isValid = true;

  // Common validations for all forms
  if (formData.email !== undefined) {
    const emailValidation = validateEmail(formData.email);
    if (!emailValidation.isValid) {
      errors.email = emailValidation.error;
      isValid = false;
    }
  }

  if (formData.password !== undefined) {
    const passwordValidation = validatePassword(formData.password);
    if (!passwordValidation.isValid) {
      errors.password = passwordValidation.error;
      isValid = false;
    }
  }

  // Registration-specific validations
  if (formType === 'register') {
    if (formData.firstName !== undefined) {
      const firstNameValidation = validateName(formData.firstName, 'First name');
      if (!firstNameValidation.isValid) {
        errors.firstName = firstNameValidation.error;
        isValid = false;
      }
    }

    if (formData.lastName !== undefined) {
      const lastNameValidation = validateName(formData.lastName, 'Last name');
      if (!lastNameValidation.isValid) {
        errors.lastName = lastNameValidation.error;
        isValid = false;
      }
    }

    if (formData.phoneNumber !== undefined) {
      const phoneValidation = validatePhoneNumber(formData.phoneNumber);
      if (!phoneValidation.isValid) {
        errors.phoneNumber = phoneValidation.error;
        isValid = false;
      }
    }

    if (formData.confirmPassword !== undefined) {
      const confirmPasswordValidation = validateConfirmation(
        formData.confirmPassword, 
        formData.password, 
        'Password confirmation'
      );
      if (!confirmPasswordValidation.isValid) {
        errors.confirmPassword = confirmPasswordValidation.error;
        isValid = false;
      }
    }
  }

  // Verification form validations
  if (formType === 'verify') {
    if (formData.verificationCode !== undefined) {
      const codeValidation = validateVerificationCode(formData.verificationCode);
      if (!codeValidation.isValid) {
        errors.verificationCode = codeValidation.error;
        isValid = false;
      }
    }
  }

  // Password change validations
  if (formType === 'changePassword') {
    if (formData.currentPassword !== undefined && !formData.currentPassword) {
      errors.currentPassword = 'Current password is required';
      isValid = false;
    }

    if (formData.newPassword !== undefined) {
      const newPasswordValidation = validatePassword(formData.newPassword);
      if (!newPasswordValidation.isValid) {
        errors.newPassword = newPasswordValidation.error;
        isValid = false;
      }
    }

    if (formData.confirmNewPassword !== undefined) {
      const confirmNewPasswordValidation = validateConfirmation(
        formData.confirmNewPassword, 
        formData.newPassword, 
        'New password confirmation'
      );
      if (!confirmNewPasswordValidation.isValid) {
        errors.confirmNewPassword = confirmNewPasswordValidation.error;
        isValid = false;
      }
    }
  }

  return {
    isValid,
    errors
  };
};

/**
 * Get password strength indicator
 */
export const getPasswordStrengthIndicator = (password) => {
  const validation = validatePassword(password);
  
  const indicators = {
    none: { color: '#ccc', text: '', progress: 0 },
    weak: { color: '#ff4444', text: 'Weak', progress: 0.25 },
    medium: { color: '#ffaa00', text: 'Medium', progress: 0.65 },
    strong: { color: '#00aa00', text: 'Strong', progress: 1.0 }
  };

  return {
    ...indicators[validation.strength],
    requirements: validation.requirements
  };
};

/**
 * Sanitize input to prevent XSS and other security issues
 */
export const sanitizeInput = (input) => {
  if (!input || typeof input !== 'string') {
    return '';
  }

  return input
    .trim()
    .replace(/[<>]/g, '') // Remove potential HTML tags
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/on\w+=/gi, ''); // Remove event handlers
};

/**
 * Validate and sanitize form data
 */
export const validateAndSanitizeForm = (formData, formType = 'login') => {
  // First sanitize all string inputs
  const sanitizedData = {};
  Object.keys(formData).forEach(key => {
    if (typeof formData[key] === 'string') {
      sanitizedData[key] = sanitizeInput(formData[key]);
    } else {
      sanitizedData[key] = formData[key];
    }
  });

  // Then validate the sanitized data
  const validation = validateAuthForm(sanitizedData, formType);

  return {
    ...validation,
    sanitizedData
  };
};