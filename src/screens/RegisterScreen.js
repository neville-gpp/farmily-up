import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  SafeAreaView,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AuthenticationService from '../services/AuthenticationService';
import LoadingOverlay from '../components/LoadingOverlay';
import ProgressIndicator from '../components/ProgressIndicator';
import MessageBanner from '../components/MessageBanner';
import ToastMessage from '../components/ToastMessage';
import useMessages from '../hooks/useMessages';

export default function RegisterScreen({ navigation }) {
  const { messages, showSuccess, showError, hideBanner, hideToast, clearAll } =
    useMessages();

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phoneNumber: '',
    password: '',
    confirmPassword: '',
  });
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errors, setErrors] = useState({});

  /**
   * Update form field value
   */
  const updateField = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    clearFieldError(field);
  };

  /**
   * Clear field error when user starts typing
   */
  const clearFieldError = (field) => {
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: null }));
    }
  };

  /**
   * Validate password strength
   */
  const validatePasswordStrength = (password) => {
    const requirements = {
      minLength: password.length >= 8,
      hasUppercase: /[A-Z]/.test(password),
      hasLowercase: /[a-z]/.test(password),
      hasNumber: /\d/.test(password),
      hasSpecialChar: /[!@#$%^&*(),.?":{}|<>]/.test(password),
    };

    const failedRequirements = [];
    if (!requirements.minLength)
      failedRequirements.push('at least 8 characters');
    if (!requirements.hasUppercase)
      failedRequirements.push('one uppercase letter');
    if (!requirements.hasLowercase)
      failedRequirements.push('one lowercase letter');
    if (!requirements.hasNumber) failedRequirements.push('one number');
    if (!requirements.hasSpecialChar)
      failedRequirements.push('one special character');

    return {
      isValid: failedRequirements.length === 0,
      requirements: failedRequirements,
    };
  };

  /**
   * Validate form inputs
   */
  const validateForm = () => {
    const newErrors = {};

    // First name validation
    if (!formData.firstName.trim()) {
      newErrors.firstName = 'First name is required';
    }

    // Last name validation
    if (!formData.lastName.trim()) {
      newErrors.lastName = 'Last name is required';
    }

    // Email validation (required)
    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email address';
    }

    // Phone number validation (optional but format check if provided)
    if (
      formData.phoneNumber.trim() &&
      !/^\+?[\d\s\-\(\)]+$/.test(formData.phoneNumber)
    ) {
      newErrors.phoneNumber = 'Please enter a valid phone number';
    }

    // Password validation
    if (!formData.password) {
      newErrors.password = 'Password is required';
    } else {
      const passwordValidation = validatePasswordStrength(formData.password);
      if (!passwordValidation.isValid) {
        newErrors.password = `Password must contain ${passwordValidation.requirements.join(
          ', '
        )}`;
      }
    }

    // Confirm password validation
    if (!formData.confirmPassword) {
      newErrors.confirmPassword = 'Please confirm your password';
    } else if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  /**
   * Handle registration form submission
   */
  const handleRegister = async () => {
    if (!validateForm()) {
      return;
    }

    setLoading(true);
    setErrors({});
    clearAll();

    try {
      const userData = {
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        email: formData.email.trim().toLowerCase(),
        phoneNumber: formData.phoneNumber.trim() || undefined,
        password: formData.password,
      };

      const result = await AuthenticationService.signUp(userData);

      if (result.success) {
        // Show success message and redirect to verification
        showSuccess(
          'Account created successfully! Please check your email for verification.',
          {
            type: 'toast',
            duration: 3000,
          }
        );

        // Navigate to verification screen after a brief delay
        setTimeout(() => {
          navigation.navigate('Verify', { email: userData.email });
        }, 1500);
      }
    } catch (error) {
      console.error('Registration error:', error);

      // Handle specific error cases with appropriate messages
      if (error.code === 'UsernameExistsException') {
        showError(
          'An account with this email already exists. Please try signing in instead.',
          {
            type: 'banner',
            autoHideDuration: 6000,
          }
        );
      } else if (error.code === 'InvalidPasswordException') {
        showError(
          'Password does not meet security requirements. Please check the requirements below.',
          {
            type: 'banner',
            autoHideDuration: 6000,
          }
        );
      } else if (error.code === 'InvalidParameterException') {
        showError('Please check your information and try again.', {
          type: 'banner',
          autoHideDuration: 5000,
        });
      } else {
        showError(
          error.message || 'Unable to create account. Please try again.',
          {
            type: 'banner',
            autoHideDuration: 5000,
          }
        );
      }
    } finally {
      setLoading(false);
    }
  };

  /**
   * Navigate to login screen
   */
  const handleSignIn = () => {
    navigation.navigate('Login');
  };

  /**
   * Get password strength indicator color
   */
  const getPasswordStrengthColor = () => {
    if (!formData.password) return '#ddd';

    const validation = validatePasswordStrength(formData.password);
    if (validation.isValid) return '#4CAF50';

    const strength = 5 - validation.requirements.length;
    if (strength >= 3) return '#FF9800';
    return '#FF6B6B';
  };

  const screenHeight = Dimensions.get('window').height;
  const isSmallScreen = screenHeight < 700;

  return (
    <SafeAreaView style={styles.container}>
      {/* Loading Overlay */}
      <LoadingOverlay visible={loading} message='Creating your account...' />

      {/* Progress Indicator */}
      <View style={styles.progressContainer}>
        <ProgressIndicator
          currentStep={1}
          totalSteps={3}
          stepLabels={['Register', 'Verify', 'Complete']}
        />
      </View>

      {/* Message Banner */}
      <MessageBanner
        type={messages.banner.type}
        message={messages.banner.message}
        visible={messages.banner.visible}
        onDismiss={hideBanner}
        autoHideDuration={messages.banner.autoHideDuration || 5000}
      />

      {/* Toast Message */}
      <ToastMessage
        type={messages.toast.type}
        message={messages.toast.message}
        visible={messages.toast.visible}
        onDismiss={hideToast}
        duration={messages.toast.duration || 4000}
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContainer,
          isSmallScreen && styles.scrollContainerSmall,
        ]}
        keyboardShouldPersistTaps='handled'
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <View style={[styles.header, isSmallScreen && styles.headerSmall]}>
          <Ionicons
            name='person-add-outline'
            size={isSmallScreen ? 30 : 60}
            color='#48b6b0'
          />
          <Text style={[styles.title, isSmallScreen && styles.titleSmall]}>
            Create Account
          </Text>
          {/* <Text style={[styles.subtitle, isSmallScreen && styles.subtitleSmall]}>
          Join our family-focused community
        </Text> */}
        </View>

        <View style={styles.form}>
          {/* First Name Input */}
          <View style={styles.inputContainer}>
            <Text style={styles.label}>First Name *</Text>
            <View
              style={[
                styles.inputWrapper,
                errors.firstName && styles.inputError,
              ]}
            >
              <Ionicons
                name='person-outline'
                size={20}
                color='#666'
                style={styles.inputIcon}
              />
              <TextInput
                style={styles.input}
                value={formData.firstName}
                onChangeText={(text) => updateField('firstName', text)}
                placeholder='First name'
                autoCapitalize='words'
                autoCorrect={false}
                editable={!loading}
              />
            </View>
            {errors.firstName && (
              <Text style={styles.errorText}>{errors.firstName}</Text>
            )}
          </View>

          {/* Last Name Input */}
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Last Name *</Text>
            <View
              style={[
                styles.inputWrapper,
                errors.lastName && styles.inputError,
              ]}
            >
              <Ionicons
                name='person-outline'
                size={20}
                color='#666'
                style={styles.inputIcon}
              />
              <TextInput
                style={styles.input}
                value={formData.lastName}
                onChangeText={(text) => updateField('lastName', text)}
                placeholder='Last name'
                autoCapitalize='words'
                autoCorrect={false}
                editable={!loading}
              />
            </View>
            {errors.lastName && (
              <Text style={styles.errorText}>{errors.lastName}</Text>
            )}
          </View>

          {/* Email Input */}
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Email Address *</Text>
            <View
              style={[styles.inputWrapper, errors.email && styles.inputError]}
            >
              <Ionicons
                name='mail-outline'
                size={20}
                color='#666'
                style={styles.inputIcon}
              />
              <TextInput
                style={styles.input}
                value={formData.email}
                onChangeText={(text) => updateField('email', text)}
                placeholder='Enter your email'
                keyboardType='email-address'
                autoCapitalize='none'
                autoCorrect={false}
                editable={!loading}
              />
            </View>
            {errors.email && (
              <Text style={styles.errorText}>{errors.email}</Text>
            )}
          </View>

          {/* Phone Number Input */}
          {/* <View style={styles.inputContainer}>
            <Text style={styles.label}>Phone Number</Text>
            <View
              style={[
                styles.inputWrapper,
                errors.phoneNumber && styles.inputError,
              ]}
            >
              <Ionicons
                name='call-outline'
                size={20}
                color='#666'
                style={styles.inputIcon}
              />
              <TextInput
                style={styles.input}
                value={formData.phoneNumber}
                onChangeText={(text) => updateField('phoneNumber', text)}
                placeholder={
                  isSmallScreen
                    ? 'Phone (optional)'
                    : 'Enter your phone number (optional)'
                }
                keyboardType='phone-pad'
                autoCorrect={false}
                editable={!loading}
              />
            </View>
            {errors.phoneNumber && (
              <Text style={styles.errorText}>{errors.phoneNumber}</Text>
            )}
          </View> */}

          {/* Password Input */}
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Password *</Text>
            <View
              style={[
                styles.inputWrapper,
                errors.password && styles.inputError,
              ]}
            >
              <Ionicons
                name='lock-closed-outline'
                size={20}
                color='#666'
                style={styles.inputIcon}
              />
              <TextInput
                style={styles.input}
                value={formData.password}
                onChangeText={(text) => updateField('password', text)}
                placeholder={
                  isSmallScreen ? 'Password' : 'Create a strong password'
                }
                secureTextEntry={!showPassword}
                autoCapitalize='none'
                autoCorrect={false}
                editable={!loading}
              />
              <TouchableOpacity
                style={styles.eyeIcon}
                onPress={() => setShowPassword(!showPassword)}
                disabled={loading}
              >
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color='#666'
                />
              </TouchableOpacity>
            </View>
            {formData.password && (
              <View style={styles.passwordStrength}>
                <View
                  style={[
                    styles.strengthIndicator,
                    { backgroundColor: getPasswordStrengthColor() },
                  ]}
                />
                <Text style={styles.strengthText}>
                  {validatePasswordStrength(formData.password).isValid
                    ? 'Strong password'
                    : 'Weak password'}
                </Text>
              </View>
            )}
            {errors.password && (
              <Text style={styles.errorText}>{errors.password}</Text>
            )}
          </View>

          {/* Confirm Password Input */}
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Confirm Password *</Text>
            <View
              style={[
                styles.inputWrapper,
                errors.confirmPassword && styles.inputError,
              ]}
            >
              <Ionicons
                name='lock-closed-outline'
                size={20}
                color='#666'
                style={styles.inputIcon}
              />
              <TextInput
                style={styles.input}
                value={formData.confirmPassword}
                onChangeText={(text) => updateField('confirmPassword', text)}
                placeholder={
                  isSmallScreen ? 'Confirm password' : 'Confirm your password'
                }
                secureTextEntry={!showConfirmPassword}
                autoCapitalize='none'
                autoCorrect={false}
                editable={!loading}
              />
              <TouchableOpacity
                style={styles.eyeIcon}
                onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                disabled={loading}
              >
                <Ionicons
                  name={
                    showConfirmPassword ? 'eye-off-outline' : 'eye-outline'
                  }
                  size={20}
                  color='#666'
                />
              </TouchableOpacity>
            </View>
            {errors.confirmPassword && (
              <Text style={styles.errorText}>{errors.confirmPassword}</Text>
            )}
          </View>

          {/* Register Button */}
          <TouchableOpacity
            style={[
              styles.registerButton,
              loading && styles.registerButtonDisabled,
            ]}
            onPress={handleRegister}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color='white' size='small' />
            ) : (
              <Text style={styles.registerButtonText}>Create Account</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Sign In Link */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>Already have an account? </Text>
          <TouchableOpacity onPress={handleSignIn} disabled={loading}>
            <Text style={styles.signInText}>Sign In</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  keyboardContainer: {
    flex: 1,
  },
  progressContainer: {
    paddingHorizontal: 20,
    paddingTop: 10,
    backgroundColor: '#f5f5f5',
  },
  scrollView: {
    flex: 1,
  },
  scrollContainer: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 40,
  },
  scrollContainerSmall: {
    paddingTop: 10,
    paddingBottom: 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: 30,
  },
  headerSmall: {
    marginBottom: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 20,
  },
  titleSmall: {
    fontSize: 24,
    marginTop: 15,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginTop: 8,
    textAlign: 'center',
  },
  subtitleSmall: {
    fontSize: 14,
    marginTop: 6,
  },
  form: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },

  inputContainer: {
    marginBottom: 14,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    backgroundColor: '#f9f9f9',
  },
  inputError: {
    borderColor: '#FF6B6B',
  },
  inputIcon: {
    marginLeft: 12,
  },
  input: {
    flex: 1,
    height: 48,
    paddingHorizontal: 12,
    fontSize: 16,
    color: '#333',
  },
  eyeIcon: {
    padding: 12,
  },
  passwordStrength: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  strengthIndicator: {
    width: 60,
    height: 4,
    borderRadius: 2,
    marginRight: 8,
  },
  strengthText: {
    fontSize: 12,
    color: '#666',
  },
  errorText: {
    color: '#FF6B6B',
    fontSize: 14,
    marginTop: 4,
  },
  registerButton: {
    backgroundColor: '#48b6b0',
    borderRadius: 8,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16,
  },
  registerButtonDisabled: {
    backgroundColor: '#ccc',
  },
  registerButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 10,
  },
  footerText: {
    fontSize: 16,
    color: '#666',
  },
  signInText: {
    fontSize: 16,
    color: '#48b6b0',
    fontWeight: '600',
  },
});
