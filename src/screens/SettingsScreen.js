import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  TextInput,
  ActivityIndicator,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useRequireAuth } from '../hooks/useAuthenticationGuard';

export default function SettingsScreen({ navigation }) {
  const {
    user,
    updateUserProfile,
    changePassword,
    signOut,
    loading,
    error,
    clearError,
  } = useAuth();

  // Authentication guard
  const { shouldShowContent, shouldShowLoading } = useRequireAuth();

  // App settings state - MUST be called before any conditional returns
  const [notifications, setNotifications] = useState(true);
  const [darkMode, setDarkMode] = useState(false);
  const [biometrics, setBiometrics] = useState(false);
  const [autoSync, setAutoSync] = useState(true);

  // Profile editing state - MUST be called before any conditional returns
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phoneNumber: '',
  });
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState(null);
  const [profileSuccess, setProfileSuccess] = useState(false);

  // Password change state - MUST be called before any conditional returns
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [showPasswords, setShowPasswords] = useState({
    current: false,
    new: false,
    confirm: false,
  });

  // Logout functionality state - MUST be called before any conditional returns
  const [logoutLoading, setLogoutLoading] = useState(false);

  // Initialize profile form with user data - MUST be called before any conditional returns
  useEffect(() => {
    if (user) {
      setProfileForm({
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        email: user.email || '',
        phoneNumber: user.phoneNumber || '',
      });
    }
  }, [user]);

  // Show loading screen if authentication is being checked
  if (shouldShowLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size='large' color='#48b6b0' />
        <Text style={styles.loadingText}>Loading settings...</Text>
      </View>
    );
  }

  // Don't render content if not authenticated (redirect will happen automatically)
  if (!shouldShowContent) {
    return null;
  }

  // Profile management handlers
  const handleEditProfile = () => {
    console.log('Edit profile button clicked');
    setIsEditingProfile(true);
    setProfileError(null);
    setProfileSuccess(false);
    clearError();
  };

  const handleCancelEdit = () => {
    console.log('Canceling edit profile');
    // Reset form to original values
    if (user) {
      setProfileForm({
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        email: user.email || '',
        phoneNumber: user.phoneNumber || '',
      });
    }
    setIsEditingProfile(false);
    setProfileError(null);
    setProfileSuccess(false);
  };

  const handleSaveProfile = async () => {
    try {
      setProfileLoading(true);
      setProfileError(null);
      setProfileSuccess(false);

      // Validate required fields
      if (!profileForm.firstName.trim()) {
        throw new Error('First name is required');
      }
      if (!profileForm.lastName.trim()) {
        throw new Error('Last name is required');
      }
      if (!profileForm.email.trim()) {
        throw new Error('Email is required');
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(profileForm.email)) {
        throw new Error('Please enter a valid email address');
      }

      // Prepare attributes for Cognito
      const attributes = {
        given_name: profileForm.firstName.trim(),
        family_name: profileForm.lastName.trim(),
        email: profileForm.email.trim(),
      };

      // Add phone number if provided
      if (profileForm.phoneNumber.trim()) {
        // Basic phone number validation (should start with + for international format)
        const phoneRegex = /^\++?[\d\-\(\)]+$/;
        if (!phoneRegex.test(profileForm.phoneNumber)) {
          throw new Error(
            'Please enter a valid phone number\nFormat: +1234567890'
          );
        }
        attributes.phone_number = profileForm.phoneNumber.trim();
      }

      await updateUserProfile(attributes);

      setProfileSuccess(true);
      setIsEditingProfile(false);

      // Clear success message after 3 seconds
      setTimeout(() => {
        setProfileSuccess(false);
      }, 3000);
    } catch (error) {
      setProfileError(error.message);
    } finally {
      setProfileLoading(false);
    }
  };

  // Logout functionality
  const handleLogout = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: performLogout,
        },
      ]
    );
  };

  const performLogout = async () => {
    try {
      setLogoutLoading(true);

      // Sign out from authentication service
      await signOut();

      // Clear any local app data if needed
      // Note: The AuthContext and AuthenticationService will handle
      // clearing tokens and user data automatically
    } catch (error) {
      console.error('Logout error:', error);
      // Even if logout fails, the AuthContext will clear local state
      Alert.alert(
        'Logout',
        'There was an issue logging out, but you have been signed out locally.',
        [{ text: 'OK' }]
      );
    } finally {
      setLogoutLoading(false);
    }
  };

  // Password change handlers
  const handleChangePassword = () => {
    // Close the profile edit modal first
    setIsEditingProfile(false);

    // Then open the password change modal
    setIsChangingPassword(true);
    setPasswordError(null);
    setPasswordSuccess(false);
    setPasswordForm({
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    });
    clearError();
  };

  const handleCancelPasswordChange = () => {
    setIsChangingPassword(false);
    setPasswordError(null);
    setPasswordSuccess(false);
    setPasswordForm({
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    });

    // Return to profile edit modal
    setIsEditingProfile(true);
  };

  const validatePassword = (password) => {
    const minLength = 8;
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumbers = /\d/.test(password);
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);

    if (password.length < minLength) {
      return 'Password must be at least 8 characters long';
    }
    if (!hasUpperCase) {
      return 'Password must contain at least one uppercase letter';
    }
    if (!hasLowerCase) {
      return 'Password must contain at least one lowercase letter';
    }
    if (!hasNumbers) {
      return 'Password must contain at least one number';
    }
    if (!hasSpecialChar) {
      return 'Password must contain at least one special character';
    }
    return null;
  };

  const handleSavePassword = async () => {
    try {
      setPasswordLoading(true);
      setPasswordError(null);
      setPasswordSuccess(false);

      // Validate required fields
      if (!passwordForm.currentPassword) {
        throw new Error('Current password is required');
      }
      if (!passwordForm.newPassword) {
        throw new Error('New password is required');
      }
      if (!passwordForm.confirmPassword) {
        throw new Error('Please confirm your new password');
      }

      // Validate password strength
      const passwordValidation = validatePassword(passwordForm.newPassword);
      if (passwordValidation) {
        throw new Error(passwordValidation);
      }

      // Check if passwords match
      if (passwordForm.newPassword !== passwordForm.confirmPassword) {
        throw new Error('New passwords do not match');
      }

      // Check if new password is different from current
      if (passwordForm.currentPassword === passwordForm.newPassword) {
        throw new Error('New password must be different from current password');
      }

      await changePassword(
        passwordForm.currentPassword,
        passwordForm.newPassword
      );

      // Show success alert dialog
      Alert.alert(
        'Password Changed Successfully',
        'Your password has been updated successfully. Please use your new password for future logins.',
        [{ text: 'OK' }]
      );

      setPasswordSuccess(true);
      setIsChangingPassword(false);
      setPasswordForm({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      });

      // Return to profile edit modal after successful password change
      setIsEditingProfile(true);

      // Clear success message after 3 seconds
      setTimeout(() => {
        setPasswordSuccess(false);
      }, 3000);
    } catch (error) {
      console.log('Password change error object:', error);
      console.log('Error message:', error.message);
      console.log('Error code:', error.code);

      setPasswordError(error.message);

      // Show alert for authentication errors to make them more
      if (
        error.userMessage.includes('Invalid email or password') ||
        error.userMessage.includes('Incorrect username or password') ||
        error.userMessage.includes('NotAuthorizedException') ||
        error.code === 'NotAuthorizedException'
      ) {
        Alert.alert(
          'Password Change Failed',
          'The current password you entered is incorrect. Please try again.',
          [{ text: 'OK' }]
        );
      } else if (
        error.userMessage.includes('password') &&
        !error.userMessage.includes('required')
      ) {
        // Show alert for other password-related errors
        Alert.alert('Password Change Failed', error.userMessage, [
          { text: 'OK' },
        ]);
      } else {
        // Show alert for any other errors to ensure user sees feedback
        Alert.alert(
          'Password Change Failed',
          error.userMessage ||
            'An unexpected error occurred. Please try again.',
          [{ text: 'OK' }]
        );
      }
    } finally {
      setPasswordLoading(false);
    }
  };

  const togglePasswordVisibility = (field) => {
    setShowPasswords((prev) => ({
      ...prev,
      [field]: !prev[field],
    }));
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'This action cannot be undone. All your data will be permanently deleted.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => console.log('Delete Account'),
        },
      ]
    );
  };

  const SettingItem = ({
    icon,
    title,
    subtitle,
    onPress,
    rightComponent,
    showArrow = true,
  }) => (
    <TouchableOpacity style={styles.settingItem} onPress={onPress}>
      <View style={styles.settingLeft}>
        <Ionicons
          name={icon}
          size={24}
          color='#666'
          style={styles.settingIcon}
        />
        <View>
          <Text style={styles.settingTitle}>{title}</Text>
          {subtitle && <Text style={styles.settingSubtitle}>{subtitle}</Text>}
        </View>
      </View>
      <View style={styles.settingRight}>
        {rightComponent}
        {showArrow && (
          <Ionicons name='chevron-forward' size={20} color='#ccc' />
        )}
      </View>
    </TouchableOpacity>
  );

  const SectionHeader = ({ title }) => (
    <Text style={styles.sectionHeader}>{title}</Text>
  );

  return (
    <ScrollView style={styles.container}>
      {/* Profile Section */}
      <View style={styles.profileSection}>
        <View style={styles.profileAvatar}>
          <Text style={styles.profileAvatarText}>
            {user?.firstName ? user.firstName.charAt(0).toUpperCase() : '👤'}
          </Text>
        </View>
        <View style={styles.profileInfo}>
          <Text style={styles.profileName}>
            {user ? `${user.firstName} ${user.lastName}` : 'Loading...'}
          </Text>
          <Text style={styles.profileEmail}>{user?.email || 'Loading...'}</Text>
          {user?.phoneNumber && (
            <Text style={styles.profilePhone}>{user.phoneNumber}</Text>
          )}
        </View>
        <TouchableOpacity
          style={[
            styles.editProfileButton,
            (!user || isEditingProfile) && styles.disabledButton,
          ]}
          onPress={() => {
            console.log(
              'Button pressed, user:',
              !!user,
              'isEditingProfile:',
              isEditingProfile
            );
            if (!user) {
              console.log('No user available');
              return;
            }
            if (isEditingProfile) {
              console.log('Already editing profile');
              return;
            }
            handleEditProfile();
          }}
          disabled={!user}
        >
          <Ionicons
            name='create-outline'
            size={20}
            color={!user ? '#ccc' : '#48b6b0'}
          />
        </TouchableOpacity>
      </View>

      {/* Profile Edit Modal */}
      <Modal
        visible={isEditingProfile}
        animationType='slide'
        presentationStyle='pageSheet'
        onRequestClose={handleCancelEdit}
      >
        <KeyboardAvoidingView
          style={styles.modalContainer}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modalHeader}>
            <TouchableOpacity
              style={styles.modalCloseButton}
              onPress={handleCancelEdit}
              disabled={profileLoading}
            >
              <Ionicons name='close' size={24} color='#666' />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Edit Profile</Text>
            <View style={styles.modalHeaderSpacer} />
          </View>

          <ScrollView
            style={styles.modalContent}
            keyboardShouldPersistTaps='handled'
          >
            {/* Success Message */}
            {profileSuccess && (
              <View style={styles.successMessage}>
                <Ionicons name='checkmark-circle' size={20} color='#4CAF50' />
                <Text style={styles.successText}>
                  Profile updated successfully!
                </Text>
              </View>
            )}

            {/* Error Message */}
            {(profileError || error) && (
              <View style={styles.errorMessage}>
                <Ionicons name='alert-circle' size={20} color='#FF3B30' />
                <Text style={styles.errorText}>{profileError || error}</Text>
              </View>
            )}

            {/* Form Fields */}
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>First Name *</Text>
              <TextInput
                style={styles.formInput}
                value={profileForm.firstName}
                onChangeText={(text) =>
                  setProfileForm((prev) => ({ ...prev, firstName: text }))
                }
                placeholder='Enter your first name'
                editable={!profileLoading}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Last Name *</Text>
              <TextInput
                style={styles.formInput}
                value={profileForm.lastName}
                onChangeText={(text) =>
                  setProfileForm((prev) => ({ ...prev, lastName: text }))
                }
                placeholder='Enter your last name'
                editable={!profileLoading}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Email *</Text>
              <TextInput
                style={styles.formInput}
                value={profileForm.email}
                onChangeText={(text) =>
                  setProfileForm((prev) => ({ ...prev, email: text }))
                }
                placeholder='Enter your email'
                keyboardType='email-address'
                autoCapitalize='none'
                editable={!profileLoading}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Phone Number</Text>
              <TextInput
                style={styles.formInput}
                value={profileForm.phoneNumber}
                onChangeText={(text) =>
                  setProfileForm((prev) => ({ ...prev, phoneNumber: text }))
                }
                placeholder='Enter your phone number'
                keyboardType='phone-pad'
                editable={!profileLoading}
              />
            </View>

            {/* Change Password Button */}
            <TouchableOpacity
              style={styles.changePasswordButton}
              onPress={handleChangePassword}
              disabled={profileLoading || isChangingPassword}
            >
              <Ionicons name='lock-closed-outline' size={20} color='#48b6b0' />
              <Text style={styles.changePasswordButtonText}>
                Change Password
              </Text>
              <Ionicons name='chevron-forward' size={16} color='#ccc' />
            </TouchableOpacity>
          </ScrollView>

          {/* Modal Action Buttons */}
          <View style={styles.modalFooter}>
            <TouchableOpacity
              style={[styles.modalButton, styles.modalCancelButton]}
              onPress={handleCancelEdit}
              disabled={profileLoading}
            >
              <Text style={styles.modalCancelButtonText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.modalButton, styles.modalSaveButton]}
              onPress={handleSaveProfile}
              disabled={profileLoading}
            >
              {profileLoading ? (
                <ActivityIndicator size='small' color='white' />
              ) : (
                <Text style={styles.modalSaveButtonText}>Update</Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Password Change Success Message */}
      {passwordSuccess && (
        <View style={styles.successBanner}>
          <Ionicons name='checkmark-circle' size={20} color='#4CAF50' />
          <Text style={styles.successBannerText}>
            Password changed successfully!
          </Text>
        </View>
      )}

      {/* Password Change Modal */}
      <Modal
        visible={isChangingPassword}
        animationType='slide'
        presentationStyle='pageSheet'
        onRequestClose={handleCancelPasswordChange}
      >
        <KeyboardAvoidingView
          style={styles.modalContainer}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modalHeader}>
            <TouchableOpacity
              style={styles.modalCloseButton}
              onPress={handleCancelPasswordChange}
              disabled={passwordLoading}
            >
              <Ionicons name='close' size={24} color='#666' />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Change Password</Text>
            <View style={styles.modalHeaderSpacer} />
          </View>

          <ScrollView
            style={styles.modalContent}
            keyboardShouldPersistTaps='handled'
          >
            {/* Success Message */}
            {passwordSuccess && (
              <View style={styles.successMessage}>
                <Ionicons name='checkmark-circle' size={20} color='#4CAF50' />
                <Text style={styles.successText}>
                  Password updated successfully!
                </Text>
              </View>
            )}

            {/* Error Message */}
            {(passwordError || error) && (
              <View style={styles.errorMessage}>
                <Ionicons name='alert-circle' size={20} color='#FF3B30' />
                <Text style={styles.errorText}>{passwordError || error}</Text>
              </View>
            )}

            {/* Current Password */}
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Current Password *</Text>
              <View style={styles.passwordInputContainer}>
                <TextInput
                  style={styles.passwordInput}
                  value={passwordForm.currentPassword}
                  onChangeText={(text) =>
                    setPasswordForm((prev) => ({
                      ...prev,
                      currentPassword: text,
                    }))
                  }
                  placeholder='Enter your current password'
                  secureTextEntry={!showPasswords.current}
                  editable={!passwordLoading}
                />
                <TouchableOpacity
                  style={styles.passwordToggle}
                  onPress={() => togglePasswordVisibility('current')}
                >
                  <Ionicons
                    name={showPasswords.current ? 'eye-off' : 'eye'}
                    size={20}
                    color='#666'
                  />
                </TouchableOpacity>
              </View>
            </View>

            {/* New Password */}
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>New Password *</Text>
              <View style={styles.passwordInputContainer}>
                <TextInput
                  style={styles.passwordInput}
                  value={passwordForm.newPassword}
                  onChangeText={(text) =>
                    setPasswordForm((prev) => ({ ...prev, newPassword: text }))
                  }
                  placeholder='Enter your new password'
                  secureTextEntry={!showPasswords.new}
                  editable={!passwordLoading}
                />
                <TouchableOpacity
                  style={styles.passwordToggle}
                  onPress={() => togglePasswordVisibility('new')}
                >
                  <Ionicons
                    name={showPasswords.new ? 'eye-off' : 'eye'}
                    size={20}
                    color='#666'
                  />
                </TouchableOpacity>
              </View>
              <Text style={styles.passwordHint}>
                Password must be at least 8 characters with uppercase,
                lowercase, number, and special character
              </Text>
            </View>

            {/* Confirm New Password */}
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Confirm New Password *</Text>
              <View style={styles.passwordInputContainer}>
                <TextInput
                  style={styles.passwordInput}
                  value={passwordForm.confirmPassword}
                  onChangeText={(text) =>
                    setPasswordForm((prev) => ({
                      ...prev,
                      confirmPassword: text,
                    }))
                  }
                  placeholder='Confirm your new password'
                  secureTextEntry={!showPasswords.confirm}
                  editable={!passwordLoading}
                />
                <TouchableOpacity
                  style={styles.passwordToggle}
                  onPress={() => togglePasswordVisibility('confirm')}
                >
                  <Ionicons
                    name={showPasswords.confirm ? 'eye-off' : 'eye'}
                    size={20}
                    color='#666'
                  />
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>

          {/* Modal Action Buttons */}
          <View style={styles.modalFooter}>
            <TouchableOpacity
              style={[styles.modalButton, styles.modalCancelButton]}
              onPress={handleCancelPasswordChange}
              disabled={passwordLoading}
            >
              <Text style={styles.modalCancelButtonText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.modalButton, styles.modalSaveButton]}
              onPress={handleSavePassword}
              disabled={passwordLoading}
            >
              {passwordLoading ? (
                <ActivityIndicator size='small' color='white' />
              ) : (
                <Text style={styles.modalSaveButtonText}>Change Password</Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Account Settings */}
      <SectionHeader title='Account' />
      <View style={styles.section}>
        <SettingItem
          icon='people-outline'
          title='Manage Children'
          subtitle='Add or edit child profiles'
          onPress={() => navigation.navigate('ManageChildren')}
        />
      </View>

      {/* App Settings */}
      {/* <SectionHeader title="App Settings" />
      <View style={styles.section}>
        <SettingItem
          icon="notifications-outline"
          title="Notifications"
          subtitle="Manage notification preferences"
          rightComponent={
            <Switch
              value={notifications}
              onValueChange={setNotifications}
              trackColor={{ false: '#767577', true: '#81b0ff' }}
              thumbColor={notifications ? '#48b6b0' : '#f4f3f4'}
            />
          }
          showArrow={false}
        />
        <SettingItem
          icon="moon-outline"
          title="Dark Mode"
          subtitle="Switch to dark theme"
          rightComponent={
            <Switch
              value={darkMode}
              onValueChange={setDarkMode}
              trackColor={{ false: '#767577', true: '#81b0ff' }}
              thumbColor={darkMode ? '#48b6b0' : '#f4f3f4'}
            />
          }
          showArrow={false}
        />
        <SettingItem
          icon="finger-print-outline"
          title="Biometric Login"
          subtitle="Use fingerprint or face ID"
          rightComponent={
            <Switch
              value={biometrics}
              onValueChange={setBiometrics}
              trackColor={{ false: '#767577', true: '#81b0ff' }}
              thumbColor={biometrics ? '#48b6b0' : '#f4f3f4'}
            />
          }
          showArrow={false}
        />
        <SettingItem
          icon="sync-outline"
          title="Auto Sync"
          subtitle="Automatically sync data"
          rightComponent={
            <Switch
              value={autoSync}
              onValueChange={setAutoSync}
              trackColor={{ false: '#767577', true: '#81b0ff' }}
              thumbColor={autoSync ? '#48b6b0' : '#f4f3f4'}
            />
          }
          showArrow={false}
        />
      </View> */}

      {/* Data & Storage */}
      {/* <SectionHeader title="Data & Storage" />
      <View style={styles.section}>
        <SettingItem
          icon="cloud-outline"
          title="Backup & Sync"
          subtitle="Manage your data backup"
          onPress={() => console.log('Backup & Sync')}
        />
        <SettingItem
          icon="download-outline"
          title="Export Data"
          subtitle="Download your family data"
          onPress={() => console.log('Export Data')}
        />
        <SettingItem
          icon="trash-outline"
          title="Clear Cache"
          subtitle="Free up storage space"
          onPress={() => console.log('Clear Cache')}
        />
      </View> */}

      {/* Support */}
      {/* <SectionHeader title="Support" />
      <View style={styles.section}>
        <SettingItem
          icon="help-circle-outline"
          title="Help Center"
          subtitle="Get help and support"
          onPress={() => console.log('Help Center')}
        />
        <SettingItem
          icon="chatbubble-outline"
          title="Contact Us"
          subtitle="Send feedback or report issues"
          onPress={() => console.log('Contact Us')}
        />
        <SettingItem
          icon="star-outline"
          title="Rate App"
          subtitle="Rate us on the App Store"
          onPress={() => console.log('Rate App')}
        />
        <SettingItem
          icon="document-text-outline"
          title="Terms & Privacy"
          subtitle="Read our terms and privacy policy"
          onPress={() => console.log('Terms & Privacy')}
        />
      </View> */}

      <SectionHeader title='' />
      
      {/* Account Actions */}
      {/* <SectionHeader title='Account Actions' /> */}
      <View style={styles.section}>
        <TouchableOpacity
          style={styles.dangerItem}
          onPress={handleLogout}
          disabled={logoutLoading}
        >
          {logoutLoading ? (
            <ActivityIndicator size={24} color='#FF3B30' />
          ) : (
            <Ionicons name='log-out-outline' size={24} color='#FF3B30' />
          )}
          <Text
            style={[styles.dangerText, logoutLoading && styles.disabledText]}
          >
            {logoutLoading ? 'Logging out...' : 'Logout'}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>Farmily UP (AWS AI Hackathon)</Text>
        <Text style={styles.footerText}>Copyright© 2025 Neville Leung@GalantPP All Rights Reserved.</Text>
        <Text style={styles.footerText}> </Text>
        <Text style={styles.footerText}>Made with ❤️ for family</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  profileSection: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    padding: 20,
    marginBottom: 20,
  },
  profileAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
  },
  profileAvatarText: {
    fontSize: 24,
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  profileEmail: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  profilePhone: {
    fontSize: 12,
    color: '#999',
    marginTop: 1,
  },
  editProfileButton: {
    padding: 10,
  },
  disabledButton: {
    opacity: 0.5,
  },
  sectionHeader: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
    marginLeft: 20,
    marginTop: 20,
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  section: {
    backgroundColor: 'white',
    marginBottom: 10,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  settingIcon: {
    marginRight: 15,
  },
  settingTitle: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
  settingSubtitle: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  settingRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dangerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  dangerText: {
    fontSize: 16,
    color: '#FF3B30',
    marginLeft: 15,
    fontWeight: '500',
  },
  disabledText: {
    color: '#999',
  },
  footer: {
    alignItems: 'center',
    padding: 30,
  },
  footerText: {
    fontSize: 12,
    color: '#999',
    marginBottom: 5,
  },

  successMessage: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E8',
    padding: 12,
    borderRadius: 8,
    marginBottom: 15,
  },
  successText: {
    color: '#4CAF50',
    marginLeft: 8,
    fontSize: 14,
    fontWeight: '500',
  },
  errorMessage: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFEBEE',
    padding: 12,
    borderRadius: 8,
    marginBottom: 15,
  },
  errorText: {
    color: '#FF3B30',
    marginLeft: 8,
    fontSize: 14,
    fontWeight: '500',
  },
  formGroup: {
    marginBottom: 20,
  },
  formLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  formInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#f9f9f9',
  },

  // Password change styles
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E8',
    padding: 15,
    margin: 20,
    borderRadius: 8,
  },
  successBannerText: {
    color: '#4CAF50',
    marginLeft: 8,
    fontSize: 16,
    fontWeight: '500',
  },
  passwordInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    backgroundColor: '#f9f9f9',
  },
  passwordInput: {
    flex: 1,
    padding: 12,
    fontSize: 16,
  },
  passwordToggle: {
    padding: 12,
  },
  passwordHint: {
    fontSize: 12,
    color: '#666',
    marginTop: 5,
    fontStyle: 'italic',
  },
  // Change Password button in profile form
  changePasswordButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 15,
    marginTop: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    backgroundColor: '#f9f9f9',
  },
  changePasswordButtonText: {
    flex: 1,
    fontSize: 16,
    color: '#48b6b0',
    fontWeight: '500',
    marginLeft: 10,
  },
  // Modal styles
  modalContainer: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  modalCloseButton: {
    padding: 5,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  modalHeaderSpacer: {
    width: 34, // Same width as close button for centering
  },
  modalContent: {
    flex: 1,
    padding: 20,
  },
  modalFooter: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 20,
    paddingBottom: 40,
    backgroundColor: 'white',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  modalButton: {
    flex: 1,
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 5,
  },
  modalCancelButton: {
    backgroundColor: '#f0f0f0',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  modalCancelButtonText: {
    color: '#666',
    fontSize: 16,
    fontWeight: '600',
  },
  modalSaveButton: {
    backgroundColor: '#48b6b0',
  },
  modalSaveButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});
