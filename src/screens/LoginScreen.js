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
import { useAuth } from '../context/AuthContext';
import LoadingOverlay from '../components/LoadingOverlay';
import MessageBanner from '../components/MessageBanner';
import ToastMessage from '../components/ToastMessage';
import AlertDialog from '../components/AlertDialog';
import useMessages from '../hooks/useMessages';

export default function LoginScreen({ navigation, route }) {
  const { signIn, loading: authLoading, error: authError, clearError } = useAuth();
  const {
    messages,
    showSuccess,
    showError,
    showToast,
    hideBanner,
    hideToast,
    hideAlert,
    clearAll,
  } = useMessages();
  
  // Get pre-filled email from route params (from registration flow)
  const preFilledEmail = route?.params?.email || '';
  
  const [email, setEmail] = useState(preFilledEmail);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({});
  
  // Use auth loading state
  const loading = authLoading;

  // Monitor route params changes and update email if needed
  React.useEffect(() => {
    const routeEmail = route?.params?.email;
    if (routeEmail && routeEmail !== email) {
      setEmail(routeEmail);
    }
  }, [route?.params?.email]);

  /**
   * Validate form inputs
   * @returns {boolean} True if form is valid
   */
  const validateForm = () => {
    const newErrors = {};

    // Email validation
    if (!email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      newErrors.email = 'Please enter a valid email address';
    }

    // Password validation
    if (!password) {
      newErrors.password = 'Password is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  /**
   * Handle login form submission
   */
  const handleLogin = async () => {
    if (!validateForm()) {
      return;
    }

    setErrors({});
    clearError(); // Clear any previous auth errors
    clearAll(); // Clear any previous messages

    try {
      const result = await signIn(email.trim().toLowerCase(), password);
      
      if (result.success) {
        // Show success message briefly before navigation
        showSuccess('Welcome back! Signing you in...', { 
          type: 'toast',
          duration: 2000 
        });
        
        // Navigation will be handled automatically by the authentication context
        console.log('Login successful');
      }
    } catch (error) {
      console.error('Login error:', error);
      
      // Handle specific error cases
      if (error.code === 'UserNotConfirmedException') {
        // Show info message and redirect to verification screen
        showToast('info', 'Please verify your email address to continue', {
          actionText: 'Verify',
          onActionPress: () => navigation.navigate('Verify', { email: email.trim().toLowerCase() }),
          duration: 6000,
        });
        return;
      }
      
      // Show error message using the new message system
      const errorMessage = error.message || 'Unable to sign in. Please check your credentials and try again.';
      
      if (error.code === 'NotAuthorizedException') {
        showError('Invalid email or password. Please try again.', {
          type: 'banner',
          autoHideDuration: 5000,
        });
      } else if (error.code === 'UserNotFoundException') {
        showError('No account found with this email address.', {
          type: 'banner',
          autoHideDuration: 5000,
        });
      } else if (error.code === 'TooManyRequestsException') {
        showError('Too many login attempts. Please wait before trying again.', {
          type: 'banner',
          autoHideDuration: 8000,
        });
      } else {
        showError(errorMessage, {
          type: 'banner',
          autoHideDuration: 5000,
        });
      }
    }
  };

  /**
   * Navigate to forgot password screen
   */
  const handleForgotPassword = () => {
    navigation.navigate('ForgotPassword');
  };

  /**
   * Navigate to registration screen
   */
  const handleSignUp = () => {
    navigation.navigate('Register');
  };

  /**
   * Clear field error when user starts typing
   */
  const clearFieldError = (field) => {
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: null }));
    }
    // Also clear auth errors when user starts typing
    if (authError) {
      clearError();
    }
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Loading Overlay */}
      <LoadingOverlay 
        visible={loading} 
        message="Signing you in..." 
      />

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
        actionText={messages.toast.actionText}
        onActionPress={messages.toast.onActionPress}
        duration={messages.toast.duration || 4000}
      />

      {/* Alert Dialog */}
      <AlertDialog
        type={messages.alert.type}
        title={messages.alert.title}
        message={messages.alert.message}
        visible={messages.alert.visible}
        buttons={messages.alert.buttons}
        onDismiss={hideAlert}
      />

      <ScrollView 
        contentContainerStyle={styles.scrollContainer}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Ionicons name="person-circle-outline" size={80} color="#48b6b0" />
          <Text style={styles.title}>Welcome Back</Text>
        </View>

        <View style={styles.form}>
          {/* Email Input */}
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

          {/* Password Input */}
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Password</Text>
            <View style={[styles.inputWrapper, errors.password && styles.inputError]}>
              <Ionicons name="lock-closed-outline" size={20} color="#666" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={(text) => {
                  setPassword(text);
                  clearFieldError('password');
                }}
                placeholder="Enter your password"
                secureTextEntry={!showPassword}
                autoCapitalize="none"
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
                  color="#666" 
                />
              </TouchableOpacity>
            </View>
            {errors.password && <Text style={styles.errorText}>{errors.password}</Text>}
          </View>

          {/* Login Button */}
          <TouchableOpacity
            style={[styles.loginButton, loading && styles.loginButtonDisabled]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="white" size="small" />
            ) : (
              <Text style={styles.loginButtonText}>Sign In</Text>
            )}
          </TouchableOpacity>

          {/* Forgot Password Link */}
          <TouchableOpacity
            style={styles.forgotPasswordButton}
            onPress={handleForgotPassword}
            disabled={loading}
          >
            <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
          </TouchableOpacity>
        </View>

        {/* Sign Up Link */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>Don't have an account? </Text>
          <TouchableOpacity onPress={handleSignUp} disabled={loading}>
            <Text style={styles.signUpText}>Sign Up</Text>
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
  },
  welcomeMessage: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#E8F5E8',
    borderRadius: 20,
  },
  welcomeText: {
    fontSize: 14,
    color: '#4CAF50',
    fontWeight: '500',
    marginLeft: 6,
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
  errorText: {
    color: '#FF6B6B',
    fontSize: 14,
    marginTop: 4,
  },
  loginButton: {
    backgroundColor: '#48b6b0',
    borderRadius: 8,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
  },
  loginButtonDisabled: {
    backgroundColor: '#ccc',
  },
  loginButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
  },
  forgotPasswordButton: {
    alignItems: 'center',
    marginTop: 16,
  },
  forgotPasswordText: {
    color: '#48b6b0',
    fontSize: 16,
    fontWeight: '500',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  footerText: {
    fontSize: 16,
    color: '#666',
  },
  signUpText: {
    fontSize: 16,
    color: '#48b6b0',
    fontWeight: '600',
  },
});