import React, { useState, useEffect } from 'react';
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

export default function VerifyScreen({ navigation, route }) {
  const { email } = route.params || {};
  const { messages, hideBanner, hideToast } = useMessages();

  const [verificationCode, setVerificationCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [error, setError] = useState('');

  // Start cooldown timer for resend functionality
  useEffect(() => {
    let timer;
    if (resendCooldown > 0) {
      timer = setTimeout(() => {
        setResendCooldown(resendCooldown - 1);
      }, 1000);
    }
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  /**
   * Validate verification code format
   */
  const validateCode = (code) => {
    // Cognito verification codes are typically 6 digits
    return /^\d{6}$/.test(code);
  };

  /**
   * Handle verification code submission
   */
  const handleVerify = async () => {
    if (!verificationCode.trim()) {
      setError('Please enter the verification code');
      return;
    }

    if (!validateCode(verificationCode)) {
      setError('Verification code must be 6 digits');
      return;
    }

    if (!email) {
      Alert.alert(
        'Error',
        'Email address is missing. Please go back and try again.'
      );
      return;
    }

    setLoading(true);
    setError('');

    try {
      const result = await AuthenticationService.confirmSignUp(
        email,
        verificationCode.trim()
      );

      if (result.success) {
        // Navigate to Complete screen to show success and completion
        // Pass the email so it can be pre-filled in the login screen
        navigation.navigate('Complete', { email });
      }
    } catch (error) {
      console.error('Verification error:', error);

      // Handle specific error cases
      if (error.code === 'CodeMismatchException') {
        setError('Invalid verification code. Please check and try again.');
      } else if (error.code === 'ExpiredCodeException') {
        setError('Verification code has expired. Please request a new one.');
      } else if (error.code === 'LimitExceededException') {
        setError('Too many attempts. Please wait before trying again.');
      } else {
        setError(error.message || 'Verification failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  /**
   * Handle resend verification code
   */
  const handleResendCode = async () => {
    if (resendCooldown > 0) {
      return;
    }

    if (!email) {
      Alert.alert(
        'Error',
        'Email address is missing. Please go back and try again.'
      );
      return;
    }

    setResendLoading(true);
    setError('');

    try {
      const result = await AuthenticationService.resendConfirmationCode(email);

      if (result.success) {
        Alert.alert(
          'Code Sent',
          'A new verification code has been sent to your email address.',
          [{ text: 'OK' }]
        );

        // Start cooldown timer (60 seconds)
        setResendCooldown(60);

        // Clear the current code input
        setVerificationCode('');
      }
    } catch (error) {
      console.error('Resend code error:', error);

      if (error.code === 'LimitExceededException') {
        setError(
          'Too many requests. Please wait before requesting another code.'
        );
        setResendCooldown(300); // 5 minute cooldown for rate limiting
      } else {
        Alert.alert(
          'Resend Failed',
          error.message ||
            'Unable to resend verification code. Please try again.',
          [{ text: 'OK' }]
        );
      }
    } finally {
      setResendLoading(false);
    }
  };

  /**
   * Navigate back to login screen
   */
  const handleBackToLogin = () => {
    navigation.navigate('Login');
  };

  /**
   * Clear error when user starts typing
   */
  const handleCodeChange = (text) => {
    // Only allow numeric input and limit to 6 digits
    const numericText = text.replace(/[^0-9]/g, '').slice(0, 6);
    setVerificationCode(numericText);

    if (error) {
      setError('');
    }
  };

  const screenHeight = Dimensions.get('window').height;
  const isSmallScreen = screenHeight < 700;

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.keyboardContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        {/* Loading Overlay */}
        <LoadingOverlay
          visible={loading || resendLoading}
          message={
            loading ? 'Verifying your account...' : 'Sending new code...'
          }
        />

        {/* Progress Indicator */}
        <View style={styles.progressContainer}>
          <ProgressIndicator
            currentStep={2}
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
              name='mail-open-outline'
              size={isSmallScreen ? 60 : 80}
              color='#48b6b0'
            />
            <Text style={[styles.title, isSmallScreen && styles.titleSmall]}>
              Verify Your Email
            </Text>
            <Text
              style={[styles.subtitle, isSmallScreen && styles.subtitleSmall]}
            >
              We've sent a verification code to{isSmallScreen ? ' ' : '\n'}
              <Text style={styles.emailText}>{email}</Text>
            </Text>
          </View>

          <View style={styles.form}>
            {/* Verification Code Input */}
            <View style={styles.inputContainer}>
              <Text style={styles.label}>Verification Code</Text>
              <View style={[styles.inputWrapper, error && styles.inputError]}>
                <Ionicons
                  name='key-outline'
                  size={20}
                  color='#666'
                  style={styles.inputIcon}
                />
                <TextInput
                  style={[styles.input, isSmallScreen && styles.inputSmall]}
                  value={verificationCode}
                  onChangeText={handleCodeChange}
                  placeholder={
                    isSmallScreen ? '6-digit code' : 'Enter 6-digit code'
                  }
                  keyboardType='numeric'
                  maxLength={6}
                  autoCapitalize='none'
                  autoCorrect={false}
                  editable={!loading}
                  textAlign='center'
                />
              </View>
              {error && <Text style={styles.errorText}>{error}</Text>}
            </View>

            {/* Verify Button */}
            <TouchableOpacity
              style={[
                styles.verifyButton,
                loading && styles.verifyButtonDisabled,
              ]}
              onPress={handleVerify}
              disabled={loading || !verificationCode}
            >
              {loading ? (
                <ActivityIndicator color='white' size='small' />
              ) : (
                <Text style={styles.verifyButtonText}>Verify Account</Text>
              )}
            </TouchableOpacity>

            {/* Resend Code Section */}
            <View style={styles.resendSection}>
              <Text
                style={[
                  styles.resendText,
                  isSmallScreen && styles.resendTextSmall,
                ]}
              >
                {isSmallScreen
                  ? "Didn't receive it?"
                  : "Didn't receive the code?"}
              </Text>
              <TouchableOpacity
                style={[
                  styles.resendButton,
                  (resendLoading || resendCooldown > 0) &&
                    styles.resendButtonDisabled,
                ]}
                onPress={handleResendCode}
                disabled={resendLoading || resendCooldown > 0}
              >
                {resendLoading ? (
                  <ActivityIndicator color='#48b6b0' size='small' />
                ) : (
                  <Text
                    style={[
                      styles.resendButtonText,
                      resendCooldown > 0 && styles.resendButtonTextDisabled,
                    ]}
                  >
                    {resendCooldown > 0
                      ? `Resend (${resendCooldown}s)`
                      : 'Resend Code'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>

          {/* Help Section */}
          {/* <View style={styles.helpSection}>
          <View style={styles.helpItem}>
            <Ionicons name="information-circle-outline" size={18} color="#666" />
            <Text style={[styles.helpText, isSmallScreen && styles.helpTextSmall]}>
              {isSmallScreen ? 'Check spam folder if not received' : 'Check your spam folder if you don\'t see the email'}
            </Text>
          </View>
          <View style={[styles.helpItem, isSmallScreen && { marginBottom: 0 }]}>
            <Ionicons name="time-outline" size={18} color="#666" />
            <Text style={[styles.helpText, isSmallScreen && styles.helpTextSmall]}>
              {isSmallScreen ? 'Codes expire after 24 hours' : 'Verification codes expire after 24 hours'}
            </Text>
          </View>
        </View> */}

          {/* Back to Login Link */}
          <View style={styles.footer}>
            <TouchableOpacity onPress={handleBackToLogin} disabled={loading}>
              <Text style={styles.backToLoginText}>← Back to Sign In</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
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
    marginBottom: 40,
  },
  headerSmall: {
    marginBottom: 25,
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
    marginTop: 12,
    textAlign: 'center',
    lineHeight: 22,
  },
  subtitleSmall: {
    fontSize: 14,
    marginTop: 8,
    lineHeight: 20,
  },
  emailText: {
    fontWeight: '600',
    color: '#48b6b0',
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
    marginBottom: 16,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
    textAlign: 'center',
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
    height: 60,
    paddingHorizontal: 12,
    fontSize: 24,
    color: '#333',
    fontWeight: '600',
    letterSpacing: 4,
  },
  inputSmall: {
    height: 50,
    fontSize: 20,
    letterSpacing: 3,
  },
  errorText: {
    color: '#FF6B6B',
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },
  verifyButton: {
    backgroundColor: '#48b6b0',
    borderRadius: 8,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  verifyButtonDisabled: {
    backgroundColor: '#ccc',
  },
  verifyButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
  },
  resendSection: {
    alignItems: 'center',
    marginTop: 20,
  },
  resendText: {
    fontSize: 16,
    color: '#666',
    marginBottom: 8,
  },
  resendTextSmall: {
    fontSize: 14,
    marginBottom: 6,
  },
  resendButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  resendButtonDisabled: {
    opacity: 0.5,
  },
  resendButtonText: {
    color: '#48b6b0',
    fontSize: 16,
    fontWeight: '600',
  },
  resendButtonTextDisabled: {
    color: '#999',
  },
  helpSection: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  helpItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  helpText: {
    fontSize: 14,
    color: '#666',
    marginLeft: 12,
    flex: 1,
  },
  helpTextSmall: {
    fontSize: 13,
    marginLeft: 10,
  },
  footer: {
    alignItems: 'center',
    paddingTop: 10,
  },
  backToLoginText: {
    fontSize: 16,
    color: '#48b6b0',
    fontWeight: '500',
  },
});
