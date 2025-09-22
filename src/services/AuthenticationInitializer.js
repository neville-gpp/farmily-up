import AuthenticationStateManager from './AuthenticationStateManager';
import AuthenticationService from './AuthenticationService';
import TokenStorageService from './TokenStorageService';
import ProactiveTokenRefreshService from './ProactiveTokenRefreshService';
import AuthenticationStatePersistence from './AuthenticationStatePersistence';

/**
 * AuthenticationInitializer handles the initialization of the AuthenticationStateManager
 * with the required services to prevent circular dependencies
 */
class AuthenticationInitializer {
  static _initialized = false;

  /**
   * Initialize the AuthenticationStateManager and ProactiveTokenRefreshService with required services
   * This should be called early in the app lifecycle
   * @param {Object} options - Configuration options
   * @param {boolean} options.enableProactiveRefresh - Enable proactive token refresh (default: true)
   * @param {boolean} options.enableBackgroundRefresh - Enable background token monitoring (default: true)
   * @param {number} options.proactiveThreshold - Time before expiry to trigger proactive refresh (default: 10 minutes)
   * @param {number} options.backgroundInterval - Background check interval (default: 5 minutes)
   * @param {boolean} options.enableStatePersistence - Enable authentication state persistence (default: true)
   * @param {boolean} options.enableAppStateMonitoring - Enable app state change monitoring (default: true)
   * @param {number} options.cacheExpiryDuration - Cache expiry duration in milliseconds (default: 15 minutes)
   * @param {number} options.backgroundGracePeriod - Grace period for background state (default: 30 minutes)
   */
  static async initialize(options = {}) {
    if (this._initialized) {
      return;
    }

    try {
      // Initialize AuthenticationStatePersistence if enabled
      let persistenceService = null;
      if (options.enableStatePersistence !== false) {        
        const persistenceOptions = {
          enablePersistence: true,
          enableAppStateMonitoring: options.enableAppStateMonitoring !== false,
          cacheExpiryDuration: options.cacheExpiryDuration,
          backgroundGracePeriod: options.backgroundGracePeriod
        };

        await AuthenticationStatePersistence.initialize(persistenceOptions);
        persistenceService = AuthenticationStatePersistence;
      } else {
        console.log('[AuthenticationInitializer] AuthenticationStatePersistence disabled by configuration');
      }
      
      // Initialize AuthenticationStateManager with services
      AuthenticationStateManager.initialize(
        AuthenticationService,
        TokenStorageService,
        persistenceService
      );

      // Initialize ProactiveTokenRefreshService if enabled
      if (options.enableProactiveRefresh !== false) {        
        const proactiveOptions = {
          enableBackgroundRefresh: options.enableBackgroundRefresh !== false,
          proactiveThreshold: options.proactiveThreshold,
          backgroundInterval: options.backgroundInterval
        };

        ProactiveTokenRefreshService.initialize(proactiveOptions);
      } else {
        console.log('[AuthenticationInitializer] ProactiveTokenRefreshService disabled by configuration');
      }

      this._initialized = true;
    } catch (error) {
      console.error('[AuthenticationInitializer] Failed to initialize authentication services:', error);
      throw error;
    }
  }

  /**
   * Check if AuthenticationStateManager is initialized
   */
  static isInitialized() {
    return this._initialized;
  }

  /**
   * Shutdown authentication services
   */
  static async shutdown() {
    try {      
      // Shutdown ProactiveTokenRefreshService
      ProactiveTokenRefreshService.shutdown();
      
      // Shutdown AuthenticationStatePersistence
      await AuthenticationStatePersistence.shutdown();
      
      // Clear AuthenticationStateManager state
      await AuthenticationStateManager.clearAuthenticationState();
      
      this._initialized = false;      
    } catch (error) {
      console.error('[AuthenticationInitializer] Error during shutdown:', error);
    }
  }

  /**
   * Reset initialization state (for testing purposes)
   */
  static async reset() {
    await this.shutdown();
    console.log('[AuthenticationInitializer] Reset initialization state');
  }

  /**
   * Get initialization status and service statistics
   * @returns {Object} Initialization status and statistics
   */
  static getStatus() {
    return {
      initialized: this._initialized,
      authenticationStateManager: this._initialized ? AuthenticationStateManager.getAuthenticationStats() : null,
      proactiveTokenRefresh: this._initialized ? ProactiveTokenRefreshService.getServiceStats() : null,
      statePersistence: this._initialized ? AuthenticationStatePersistence.getServiceStatus() : null
    };
  }
}

export default AuthenticationInitializer;