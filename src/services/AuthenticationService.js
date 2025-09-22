import {
  CognitoIdentityProviderClient,
  SignUpCommand,
  ConfirmSignUpCommand,
  InitiateAuthCommand,
  GlobalSignOutCommand,
  ForgotPasswordCommand,
  ConfirmForgotPasswordCommand,
  GetUserCommand,
  UpdateUserAttributesCommand,
  ChangePasswordCommand,
  ResendConfirmationCodeCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COGNITO_CONFIG } from '../config/aws-config';
import TokenStorageService from './TokenStorageService';
import { AuthErrorHandler } from './AuthErrorHandler';
import { withAuthNetworkHandling } from '../utils/networkUtils';

class AuthenticationService {
  static cognitoClient = new CognitoIdentityProviderClient({
    region: COGNITO_CONFIG.region,
  });

  /**
   * Register a new user with Cognito
   * @param {Object} userData - User registration data
   * @param {string} userData.firstName - User's first name
   * @param {string} userData.lastName - User's last name
   * @param {string} userData.email - User's email address
   * @param {string} userData.phoneNumber - User's phone number
   * @param {string} userData.password - User's password
   * @returns {Promise<Object>} Registration result
   */
  static async signUp(userData) {
    const { firstName, lastName, email, phoneNumber, password } = userData;

    const signUpOperation = async () => {
      const command = new SignUpCommand({
        ClientId: COGNITO_CONFIG.userPoolWebClientId,
        Username: email,
        Password: password,
        UserAttributes: [
          { Name: 'email', Value: email },
          { Name: 'given_name', Value: firstName },
          { Name: 'family_name', Value: lastName },
          ...(phoneNumber
            ? [{ Name: 'phone_number', Value: phoneNumber }]
            : []),
        ],
      });

      const response = await this.cognitoClient.send(command);

      return {
        success: true,
        userSub: response.UserSub,
        codeDeliveryDetails: response.CodeDeliveryDetails,
      };
    };

    return await AuthErrorHandler.executeWithErrorHandling(
      signUpOperation,
      'User Registration',
      { showAlert: false }
    );
  }

  /**
   * Confirm user registration with verification code
   * @param {string} email - User's email address
   * @param {string} confirmationCode - Verification code from email
   * @returns {Promise<Object>} Confirmation result
   */
  static async confirmSignUp(email, confirmationCode) {
    const confirmSignUpOperation = async () => {
      const command = new ConfirmSignUpCommand({
        ClientId: COGNITO_CONFIG.userPoolWebClientId,
        Username: email,
        ConfirmationCode: confirmationCode,
      });

      await this.cognitoClient.send(command);
      return { success: true };
    };

    return await AuthErrorHandler.executeWithErrorHandling(
      confirmSignUpOperation,
      'Email Verification',
      { showAlert: false }
    );
  }

  /**
   * Sign in user with email and password
   * @param {string} email - User's email address
   * @param {string} password - User's password
   * @returns {Promise<Object>} Authentication result with tokens
   */
  static async signIn(email, password) {
    const signInOperation = async () => {
      const command = new InitiateAuthCommand({
        ClientId: COGNITO_CONFIG.userPoolWebClientId,
        AuthFlow: 'USER_PASSWORD_AUTH',
        AuthParameters: {
          USERNAME: email,
          PASSWORD: password,
        },
      });

      const response = await this.cognitoClient.send(command);

      if (response.AuthenticationResult) {
        const tokens = {
          accessToken: response.AuthenticationResult.AccessToken,
          refreshToken: response.AuthenticationResult.RefreshToken,
          idToken: response.AuthenticationResult.IdToken,
          expiresIn: response.AuthenticationResult.ExpiresIn,
        };

        // Store tokens securely
        await TokenStorageService.storeTokens(tokens);

        // Get user profile
        const userProfile = await this._getUserProfileFromTokens(
          tokens.accessToken
        );

        return {
          success: true,
          tokens,
          user: userProfile,
        };
      } else {
        throw new Error('Authentication failed - no tokens received');
      }
    };

    return await AuthErrorHandler.executeWithErrorHandling(
      signInOperation,
      'User Login',
      { showAlert: false }
    );
  }

  /**
   * Sign out current user
   * @returns {Promise<Object>} Sign out result
   */
  static async signOut() {
    const signOutOperation = async () => {
      const tokens = await TokenStorageService.getTokens();

      if (tokens && tokens.accessToken) {
        const command = new GlobalSignOutCommand({
          AccessToken: tokens.accessToken,
        });

        await this.cognitoClient.send(command);
      }

      return { success: true };
    };

    try {
      const result = await AuthErrorHandler.executeWithErrorHandling(
        signOutOperation,
        'User Logout',
        { showAlert: false }
      );

      // Always clear local tokens, even if remote sign out fails
      await TokenStorageService.clearTokens();
      return result;
    } catch (error) {
      // Even if Cognito sign out fails, clear local tokens
      await TokenStorageService.clearTokens();
      return { success: true }; // Consider local sign out successful
    }
  }

  /**
   * Initiate forgot password flow
   * @param {string} email - User's email address
   * @returns {Promise<Object>} Forgot password result
   */
  static async forgotPassword(email) {
    try {
      const command = new ForgotPasswordCommand({
        ClientId: COGNITO_CONFIG.userPoolWebClientId,
        Username: email,
      });

      const response = await this.cognitoClient.send(command);

      return {
        success: true,
        codeDeliveryDetails: response.CodeDeliveryDetails,
      };
    } catch (error) {
      const processedError = AuthErrorHandler.handleAuthError(error);
      AuthErrorHandler.logError(processedError, {
        operation: 'forgotPassword',
        email,
      });
      throw processedError;
    }
  }

  /**
   * Confirm forgot password with new password
   * @param {string} email - User's email address
   * @param {string} confirmationCode - Verification code from email
   * @param {string} newPassword - New password
   * @returns {Promise<Object>} Password reset result
   */
  static async confirmForgotPassword(email, confirmationCode, newPassword) {
    try {
      const command = new ConfirmForgotPasswordCommand({
        ClientId: COGNITO_CONFIG.userPoolWebClientId,
        Username: email,
        ConfirmationCode: confirmationCode,
        Password: newPassword,
      });

      await this.cognitoClient.send(command);

      return { success: true };
    } catch (error) {
      const processedError = AuthErrorHandler.handleAuthError(error);
      AuthErrorHandler.logError(processedError, {
        operation: 'confirmForgotPassword',
        email,
      });
      throw processedError;
    }
  }

  /**
   * Get current authenticated user
   * @returns {Promise<Object|null>} User profile or null if not authenticated
   */
  static async getCurrentUser() {
    try {
      const tokens = await TokenStorageService.getTokens();

      if (!tokens) {
        return null;
      }

      // Check if token is expired
      const isExpired = await TokenStorageService.areTokensExpired();
      if (isExpired) {
        // Try to refresh token
        const refreshed = await this.refreshTokens();
        if (!refreshed) {
          return null;
        }
        // Get updated tokens after refresh
        const updatedTokens = await TokenStorageService.getTokens();
        if (!updatedTokens) {
          return null;
        }
        tokens.accessToken = updatedTokens.accessToken;
      }

      const userProfile = await this._getUserProfileFromTokens(
        tokens.accessToken
      );
      return userProfile;
    } catch (error) {
      // Handle specific authentication errors
      if (
        error.name === 'NotAuthorizedException' ||
        error.message?.includes('Access Token has been revoked') ||
        error.message?.includes('Token is not valid')
      ) {
        // Clear invalid tokens and return null instead of throwing
        await TokenStorageService.clearTokens();
        return null;
      }

      console.error('Error getting current user:', error);
      return null;
    }
  }

  /**
   * Update user attributes
   * @param {Object} attributes - User attributes to update
   * @returns {Promise<Object>} Update result
   */
  static async updateUserAttributes(attributes) {
    try {
      const accessToken = await TokenStorageService.getValidAccessToken();

      if (!accessToken) {
        throw new Error('User not authenticated');
      }

      const userAttributes = Object.entries(attributes).map(([key, value]) => ({
        Name: key,
        Value: value,
      }));

      const command = new UpdateUserAttributesCommand({
        AccessToken: accessToken,
        UserAttributes: userAttributes,
      });

      await this.cognitoClient.send(command);

      // Update cached user profile
      const updatedProfile = await this._getUserProfileFromTokens(accessToken);

      return {
        success: true,
        user: updatedProfile,
      };
    } catch (error) {
      const processedError = AuthErrorHandler.handleAuthError(error);
      AuthErrorHandler.logError(processedError, {
        operation: 'updateUserAttributes',
      });
      throw processedError;
    }
  }

  /**
   * Change user password
   * @param {string} previousPassword - Current password
   * @param {string} proposedPassword - New password
   * @returns {Promise<Object>} Password change result
   */
  static async changePassword(previousPassword, proposedPassword) {
    try {
      const accessToken = await TokenStorageService.getValidAccessToken();

      if (!accessToken) {
        throw new Error('User not authenticated');
      }

      const command = new ChangePasswordCommand({
        AccessToken: accessToken,
        PreviousPassword: previousPassword,
        ProposedPassword: proposedPassword,
      });

      await this.cognitoClient.send(command);

      return { success: true };
    } catch (error) {
      const processedError = AuthErrorHandler.handleAuthError(error);
      AuthErrorHandler.logError(processedError, {
        operation: 'changePassword',
      });
      throw processedError;
    }
  }

  /**
   * Resend confirmation code
   * @param {string} email - User's email address
   * @returns {Promise<Object>} Resend result
   */
  static async resendConfirmationCode(email) {
    try {
      const command = new ResendConfirmationCodeCommand({
        ClientId: COGNITO_CONFIG.userPoolWebClientId,
        Username: email,
      });

      const response = await this.cognitoClient.send(command);

      return {
        success: true,
        codeDeliveryDetails: response.CodeDeliveryDetails,
      };
    } catch (error) {
      const processedError = AuthErrorHandler.handleAuthError(error);
      AuthErrorHandler.logError(processedError, {
        operation: 'resendConfirmationCode',
        email,
      });
      throw processedError;
    }
  }

  /**
   * Check if user is authenticated
   * @returns {Promise<boolean>} Authentication status
   */
  static async isAuthenticated() {
    try {
      const tokens = await TokenStorageService.getTokens();

      if (!tokens) {
        return false;
      }

      const isExpired = await TokenStorageService.areTokensExpired();
      if (isExpired) {
        const refreshed = await this.refreshTokens();
        return refreshed;
      }

      // For basic authentication check, just verify tokens exist and aren't expired
      // The actual token validation will happen when getCurrentUser() is called
      return true;
    } catch (error) {
      console.error('Error checking authentication status:', error);
      return false;
    }
  }

  /**
   * Get stored tokens
   * @returns {Promise<Object|null>} Stored tokens or null
   */
  static async getTokens() {
    return await TokenStorageService.getTokens();
  }

  /**
   * Refresh authentication tokens
   * @returns {Promise<boolean>} Success status
   */
  static async refreshTokens() {
    try {
      // Check if refresh is allowed (not in cooldown)
      const canRefresh = await TokenStorageService.canRefresh();
      if (!canRefresh) {
        return false;
      }

      const tokens = await TokenStorageService.getTokens();

      if (!tokens || !tokens.refreshToken) {
        return false;
      }

      // Update last refresh timestamp
      await TokenStorageService.updateLastRefresh();

      const refreshOperation = async () => {
        const command = new InitiateAuthCommand({
          ClientId: COGNITO_CONFIG.userPoolWebClientId,
          AuthFlow: 'REFRESH_TOKEN_AUTH',
          AuthParameters: {
            REFRESH_TOKEN: tokens.refreshToken,
          },
        });

        return await this.cognitoClient.send(command);
      };

      const response = await withAuthNetworkHandling(
        refreshOperation,
        'Token Refresh'
      );

      if (
        response.success &&
        response.data &&
        response.data.AuthenticationResult
      ) {
        const newTokens = {
          accessToken: response.data.AuthenticationResult.AccessToken,
          refreshToken: tokens.refreshToken, // Refresh token doesn't change
          idToken: response.data.AuthenticationResult.IdToken,
          expiresIn: response.data.AuthenticationResult.ExpiresIn,
        };

        await TokenStorageService.storeTokens(newTokens);
        return true;
      }

      // Handle network response wrapper
      if (!response.success && response.error) {
        throw response.error;
      }

      return false;
    } catch (error) {
      console.error('Error refreshing tokens:', error);

      // Record the refresh failure
      await TokenStorageService.recordRefreshFailure();

      // Only clear tokens for specific error types that indicate invalid refresh token
      const shouldClearTokens = this._shouldClearTokensOnRefreshError(error);

      if (shouldClearTokens) {
        await TokenStorageService.clearTokens();
      }

      return false;
    }
  }

  /**
   * Determine if tokens should be cleared based on refresh error type
   * @private
   * @param {Error} error - The refresh error
   * @returns {boolean} True if tokens should be cleared
   */
  static _shouldClearTokensOnRefreshError(error) {
    const errorMessage = error.message?.toLowerCase() || '';
    const errorCode = error.code?.toLowerCase() || '';
    const errorName = error.name?.toLowerCase() || '';

    // Clear tokens for authentication/authorization errors (invalid refresh token)
    const authErrors = [
      'notauthorizedexception',
      'usernotfoundexception',
      'tokenexpiredexception',
      'invalidtokenexception',
      'unauthorized',
      'forbidden',
      'invalid_grant',
      'access_denied',
    ];

    const hasAuthError = authErrors.some(
      (authError) =>
        errorMessage.includes(authError) ||
        errorCode.includes(authError) ||
        errorName.includes(authError)
    );

    if (hasAuthError) {
      return true;
    }

    // Don't clear tokens for network/temporary errors
    const temporaryErrors = [
      'network',
      'timeout',
      'connection',
      'fetch',
      'throttling',
      'rate limit',
      'service unavailable',
      'server error',
    ];

    const hasTemporaryError = temporaryErrors.some(
      (tempError) =>
        errorMessage.includes(tempError) || errorCode.includes(tempError)
    );

    if (hasTemporaryError) {
      return false;
    }

    // Default to not clearing tokens for unknown errors
    return false;
  }

  /**
   * Clear all stored tokens and user data
   * @returns {Promise<void>}
   */
  static async clearTokens() {
    return await TokenStorageService.clearTokens();
  }

  // Private helper methods

  /**
   * Get user profile from access token
   * @private
   */
  static async _getUserProfileFromTokens(accessToken) {
    try {
      const command = new GetUserCommand({
        AccessToken: accessToken,
      });

      const response = await this.cognitoClient.send(command);

      const userProfile = {
        id: response.Username,
        email: this._getAttributeValue(response.UserAttributes, 'email'),
        firstName: this._getAttributeValue(
          response.UserAttributes,
          'given_name'
        ),
        lastName: this._getAttributeValue(
          response.UserAttributes,
          'family_name'
        ),
        phoneNumber: this._getAttributeValue(
          response.UserAttributes,
          'phone_number'
        ),
        isEmailVerified:
          this._getAttributeValue(response.UserAttributes, 'email_verified') ===
          'true',
        createdAt: new Date().toISOString(), // Cognito doesn't provide creation date in GetUser
        updatedAt: new Date().toISOString(),
      };

      // Cache user profile
      await TokenStorageService.storeUserProfile(userProfile);

      return userProfile;
    } catch (error) {
      // Handle specific authentication errors for revoked/invalid tokens
      if (
        error.name === 'NotAuthorizedException' ||
        error.message?.includes('Access Token has been revoked') ||
        error.message?.includes('Token is not valid')
      ) {
        // Clear invalid tokens and throw a more specific error
        await TokenStorageService.clearTokens();
        const authError = new Error(
          'Authentication token is invalid or has been revoked'
        );
        authError.name = 'NotAuthorizedException';
        throw authError;
      }

      console.error('Error getting user profile:', error);
      throw error;
    }
  }

  /**
   * Get attribute value from Cognito user attributes array
   * @private
   */
  static _getAttributeValue(attributes, name) {
    const attribute = attributes?.find((attr) => attr.Name === name);
    return attribute?.Value || '';
  }
}

export default AuthenticationService;
