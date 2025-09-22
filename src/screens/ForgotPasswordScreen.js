import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AuthenticationService from '../services/AuthenticationService';

export default function ForgotPasswordScreen({ navigation }) {
  const [step, setStep] = useState(1); // 1: Email, 2: Code & New Password
  const [email, setEmail] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errors, setErrors] = useState({});

  /**
   * Clear field error when user starts typing
   */
  const clearFieldError = (field) => {
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: null }));
    }
  };

  /**
   * Validate email format
   */
  const validateEmail = (email) => {
    return /\S+@\S+\.\S+/.test(email);
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
    if (!requirements.minLength) failedRequirements.push('at least 8 characters');
    if (!requirements.hasUppercase) failedRequirements.push('one uppercase letter');
    if (!requirements.hasLowercase) failedRequirements.push('one lowercase letter');
    if (!requirements.hasNumber) failedRequirements.push('one number');
    if (!requirements.hasSpecialChar) failedRequirements.push('one special character');

    return {
      isValid: failedRequirements.length === 0,
      requirements: failedRequirements,
    };
  };

  /**
   * Validate step 1 form (email)
   */
  const validateStep1 = () => {
    const newErrors = {};

    if (!email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!validateEmail(email)) {
      newErrors.email = 'Please enter a valid email address';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  /**
   * Validate step 2 form (code and new password)
   */
  const validateStep2 = () => {
    const newErrors = {};

    // Verification code validation
    if (!verificationCode.trim()) {
      newErrors.verificationCode = 'Verification code is required';
    } else if (!/^\d{6}$/.test(verificationCode)) {
      newErrors.verificationCode = 'Verification code must be 6 digits';
    }

    // New password validation
    if (!newPassword) {
      newErrors.newPassword = 'New password is required';
    } else {
      const passwordValidation = validatePasswordStrength(newPassword);
      if (!passwordValidation.isValid) {
        newErrors.newPassword = `Password must contain ${passwordValidation.requirements.join(', ')}`;
      }
    }

    // Confirm password validation
    if (!confirmPassword) {
      newErrors.confirmPassword = 'Please confirm your new password';
    } else if (newPassword !== confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  /**
   * Handle sending reset code (Step 1)
   */
  const handleSendCode = async () => {
    if (!validateStep1()) {
      return;
    }

    setLoading(true);
    setErrors({});

    try {
      const result = await AuthenticationService.forgotPassword(email.trim().toLowerCase());
      
      if (result.success) {
        Alert.alert(
          'Reset Code Sent',
          'Please check your email for a password reset code.',
          [
            {
              text: 'OK',
              onPress: () => setStep(2)
            }
          ]
        );
      }
    } catch (error) {
      console.error('Send reset code error:', error);
      
      if (error.code === 'UserNotFoundException') {
        setErrors({ email: 'No account found with this email address' });
      } else if (error.code === 'LimitExceededException') {
        Alert.alert(
          'Too Many Requests',
          'You have requested too many password resets. Please wait before trying again.',
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert(
          'Error',
          error.message || 'Unable to send reset code. Please try again.',
          [{ text: 'OK' }]
        );
      }
    } finally {
      setLoading(false);
    }
  };

  /**
   * Handle password reset (Step 2)
   */
  const handleResetPassword = async () => {
    if (!validateStep2()) {
      return;
    }

    setLoading(true);
    setErrors({});

    try {
      const result = await AuthenticationService.confirmForgotPassword(
        email.trim().toLowerCase(),
        verificationCode.trim(),
        newPassword
      );
      
      if (result.success) {
        Alert.alert(
          'Password Reset Successful',
          'Your password has been reset successfully. You can now sign in with your new password.',
          [
            {
              text: 'Sign In',
              onPress: () => navigation.navigate('Login')
            }
          ]
        );
      }
    } catch (error) {
      console.error('Reset password error:', error);
      
      if (error.code === 'CodeMismatchException') {
        setErrors({ verificationCode: 'Invalid verification code' });
      } else if (error.code === 'ExpiredCodeException') {
        setErrors({ verificationCode: 'Verification code has expired' });
      } else if (error.code === 'InvalidPasswordException') {
        setErrors({ newPassword: 'Password does not meet requirements' });
      } else {
        Alert.alert(
          'Reset Failed',
          error.message || 'Unable to reset password. Please try again.',
          [{ text: 'OK' }]
        );
      }
    } finally {
      setLoading(false);
    }
  };

  /**
   * Navigate back to login screen
   */
  const handleBackToLogin = () => {
    navigation.navigate('Login');
  };

  /**
   * Go back to step 1
   */
  const handleBackToStep1 = () => {
    setStep(1);
    setVerificationCode('');
    setNewPassword('');
    setConfirmPassword('');
    setErrors({});
  };

  /**
   * Get password strength indicator color
   */
  const getPasswordStrengthColor = () => {
    if (!newPassword) return '#ddd';
    
    const validation = validatePasswordStrength(newPassword);
    if (validation.isValid) return '#4CAF50';
    
    const strength = 5 - validation.requirements.length;
    if (strength >= 3) return '#FF9800';
    return '#FF6B6B';
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView 
        contentContainerStyle={styles.scrollContainer}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Ionicons 
            name={step === 1 ? 'key-outline' : 'lock-open-outline'} 
            size={80} 
            color="#48b6b0" 
          />
          <Text style={styles.title}>
            {step === 1 ? 'Reset Password' : 'Create New Password'}
          </Text>
          <Text style={styles.subtitle}>
            {step === 1 
              ? 'Enter your email to receive a reset code'
              : 'Enter the code and your new password'
            }
          </Text>
        </View>

        <View style={styles.form}>
          {step === 1 ? (
            // Step 1: Email Input
            <>
              <View style={styles.inputContainer}>
                <Text style={styles.label}>Email Address</Text>
                <View style={[styles.inputWrapper, errors.email && styles.inputError]}>
                  <Ionicons name="mail-outline" size={20} color="#666" style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    value={email}
                    onChangeText={(text) => {
                      setEmail(text);
                      clearFieldError('email');
                    }}
                    placeholder="Enter your email"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!loading}
                  />
                </View>
                {errors.email && <Text style={styles.errorText}>{errors.email}</Text>}
              </View>

              <TouchableOpacity
                style={[styles.primaryButton, loading && styles.primaryButtonDisabled]}
                onPress={handleSendCode}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="white" size="small" />
                ) : (
                  <Text style={styles.primaryButtonText}>Send Reset Code</Text>
                )}
              </TouchableOpacity>
            </>
          ) : (
            // Step 2: Code and New Password
            <>
              <View style={styles.emailDisplay}>
                <Text style={styles.emailDisplayText}>Reset code sent to:</Text>
                <Text style={styles.emailDisplayValue}>{email}</Text>
              </View>

              {/* Verification Code Input */}
              <View style={styles.inputContainer}>
                <Text style={styles.label}>Verification Code</Text>
                <View style={[styles.inputWrapper, errors.verificationCode && styles.inputError]}>
                  <Ionicons name="key-outline" size={20} color="#666" style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    value={verificationCode}
                    onChangeText={(text) => {
                      const numericText = text.replace(/[^0-9]/g, '').slice(0, 6);
                      setVerificationCode(numericText);
                      clearFieldError('verificationCode');
                    }}
                    placeholder="Enter 6-digit code"
                    keyboardType="numeric"
                    maxLength={6}
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!loading}
                  />
                </View>
                {errors.verificationCode && <Text style={styles.errorText}>{errors.verificationCode}</Text>}
              </View>

              {/* New Password Input */}
              <View style={styles.inputContainer}>
                <Text style={styles.label}>New Password</Text>
                <View style={[styles.inputWrapper, errors.newPassword && styles.inputError]}>
                  <Ionicons name="lock-closed-outline" size={20} color="#666" style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    value={newPassword}
                    onChangeText={(text) => {
                      setNewPassword(text);
                      clearFieldError('newPassword');
                    }}
                    placeholder="Create a strong password"
                    secureTextEntry={!showNewPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!loading}
                  />
                  <TouchableOpacity
                    style={styles.eyeIcon}
                    onPress={() => setShowNewPassword(!showNewPassword)}
                    disabled={loading}
                  >
                    <Ionicons 
                      name={showNewPassword ? 'eye-off-outline' : 'eye-outline'} 
                      size={20} 
                      color="#666" 
                    />
                  </TouchableOpacity>
                </View>
                {newPassword && (
                  <View style={styles.passwordStrength}>
                    <View 
                      style={[
                        styles.strengthIndicator, 
                        { backgroundColor: getPasswordStrengthColor() }
                      ]} 
                    />
                    <Text style={styles.strengthText}>
                      {validatePasswordStrength(newPassword).isValid ? 'Strong password' : 'Weak password'}
                    </Text>
                  </View>
                )}
                {errors.newPassword && <Text style={styles.errorText}>{errors.newPassword}</Text>}
              </View>

              {/* Confirm Password Input */}
              <View style={styles.inputContainer}>
                <Text style={styles.label}>Confirm New Password</Text>
                <View style={[styles.inputWrapper, errors.confirmPassword && styles.inputError]}>
                  <Ionicons name="lock-closed-outline" size={20} color="#666" style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    value={confirmPassword}
                    onChangeText={(text) => {
                      setConfirmPassword(text);
                      clearFieldError('confirmPassword');
                    }}
                    placeholder="Confirm your new password"
                    secureTextEntry={!showConfirmPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!loading}
                  />
                  <TouchableOpacity
                    style={styles.eyeIcon}
                    onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                    disabled={loading}
                  >
                    <Ionicons 
                      name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'} 
                      size={20} 
                      color="#666" 
                    />
                  </TouchableOpacity>
                </View>
                {errors.confirmPassword && <Text style={styles.errorText}>{errors.confirmPassword}</Text>}
              </View>

              <TouchableOpacity
                style={[styles.primaryButton, loading && styles.primaryButtonDisabled]}
                onPress={handleResetPassword}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="white" size="small" />
                ) : (
                  <Text style={styles.primaryButtonText}>Reset Password</Text>
                )}
              </TouchableOpacity>

              {/* Back to Step 1 */}
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={handleBackToStep1}
                disabled={loading}
              >
                <Text style={styles.secondaryButtonText}>← Change Email</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* Back to Login Link */}
        <View style={styles.footer}>
          <TouchableOpacity onPress={handleBackToLogin} disabled={loading}>
            <Text style={styles.backToLoginText}>← Back to Sign In</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 20,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginTop: 8,
    textAlign: 'center',
  },
  form: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 24,
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
  emailDisplay: {
    backgroundColor: '#f0f8ff',
    padding: 16,
    borderRadius: 8,
    marginBottom: 20,
    borderLeftWidth: 4,
    borderLeftColor: '#48b6b0',
  },
  emailDisplayText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  emailDisplayValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#48b6b0',
  },
  inputContainer: {
    marginBottom: 20,
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
    height: 50,
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
  primaryButton: {
    backgroundColor: '#48b6b0',
    borderRadius: 8,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
  },
  primaryButtonDisabled: {
    backgroundColor: '#ccc',
  },
  primaryButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
  },
  secondaryButton: {
    alignItems: 'center',
    marginTop: 16,
  },
  secondaryButtonText: {
    color: '#48b6b0',
    fontSize: 16,
    fontWeight: '500',
  },
  footer: {
    alignItems: 'center',
  },
  backToLoginText: {
    fontSize: 16,
    color: '#48b6b0',
    fontWeight: '500',
  },
});