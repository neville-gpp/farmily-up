import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import AuthenticationError from './AuthenticationError.js';

/**
 * AuthenticationStatePersistence handles authentication state caching, persistence,
 * and recovery across app lifecycle events (backgrounding/foregrounding)
 */
class AuthenticationStatePersistence {
  // Storage keys for persisted authentication state
  static STORAGE_KEYS = {
    AUTH_STATE: '@auth_state_cache',
    AUTH_METADATA: '@auth_metadata',
    LAST_ACTIVITY: '@auth_last_activity',
    SESSION_DATA: '@auth_session_data'
  };

  // Configuration constants
  static CACHE_EXPIRY_DURATION = 15 * 60 * 1000; // 15 minutes
  static BACKGROUND_GRACE_PERIOD = 30 * 60 * 1000; // 30 minutes
  static STALE_STATE_CLEANUP_INTERVAL = 60 * 60 * 1000; // 1 hour
  static MAX_BACKGROUND_DURATION = 24 * 60 * 60 * 1000; // 24 hours

  // Service state
  static _serviceState = {
    isInitialized: false,
    isListeningToAppState: false,
    appStateSubscription: null,
    cleanupIntervalId: null,
    lastAppState: 'active',
    backgroundTime: null,
    foregroundTime: null,
    persistenceEnabled: true,
    syncListeners: new Set(),
    lastSyncTime: null
  };

  // Cached authentication state
  static _cachedAuthState = {
    data: null,
    timestamp: null,
    isValid: false,
    source: null // 'memory', 'storage', 'fresh'
  };

  /**
   * Initialize the authentication state persistence service
   * @param {Object} options - Configuration options
   * @param {boolean} options.enablePersistence - Enable state persistence to storage
   * @param {boolean} options.enableAppStateMonitoring - Enable app state change monitoring
   * @param {number} options.cacheExpiryDuration - Cache expiry duration in milliseconds
   * @param {number} options.backgroundGracePeriod - Grace period for background state
   */
  static async initialize(options = {}) {
    try {
      // Initialize service

      // Apply configuration options
      if (options.cacheExpiryDuration) {
        this.CACHE_EXPIRY_DURATION = options.cacheExpiryDuration;
      }
      if (options.backgroundGracePeriod) {
        this.BACKGROUND_GRACE_PERIOD = options.backgroundGracePeriod;
      }

      // Initialize service state
      this._serviceState = {
        ...this._serviceState,
        isInitialized: true,
        persistenceEnabled: options.enablePersistence !== false,
        lastAppState: AppState.currentState || 'active'
      };

      // Load persisted authentication state
      if (this._serviceState.persistenceEnabled) {
        try {
          await this._loadPersistedState();
        } catch (error) {
          console.error('[AuthenticationStatePersistence] Error loading persisted state:', error);
          // Continue initialization even if loading fails
        }
      }

      // Start app state monitoring if enabled
      if (options.enableAppStateMonitoring !== false) {
        try {
          this._startAppStateMonitoring();
        } catch (error) {
          console.error('[AuthenticationStatePersistence] Error starting app state monitoring:', error);
          // Continue initialization even if monitoring fails
        }
      }

      // Start cleanup interval for stale state
      try {
        this._startStaleStateCleanup();
      } catch (error) {
        console.error('[AuthenticationStatePersistence] Error starting cleanup interval:', error);
        // Continue initialization even if cleanup fails
      }
    } catch (error) {
      console.error('[AuthenticationStatePersistence] Failed to initialize service:', error);
      throw new AuthenticationError(
        'Failed to initialize authentication state persistence',
        AuthenticationError.ERROR_CODES.UNKNOWN_ERROR,
        false,
        { operation: 'initialize', error: error.message }
      );
    }
  }

  /**
   * Get cached authentication state with automatic validation
   * @param {boolean} allowStale - Allow stale cache data
   * @returns {Promise<Object|null>} Cached authentication state or null
   */
  static async getCachedAuthState(allowStale = false) {
    try {
      console.log('[AuthenticationStatePersistence] Getting cached auth state', { allowStale });

      // Check memory cache first
      if (this._cachedAuthState.data && this._isCacheValid(this._cachedAuthState, allowStale)) {
        console.log('[AuthenticationStatePersistence] Returning valid memory cache');
        this._cachedAuthState.source = 'memory';
        return {
          ...this._cachedAuthState.data,
          _cacheInfo: {
            source: 'memory',
            timestamp: this._cachedAuthState.timestamp,
            age: Date.now() - this._cachedAuthState.timestamp
          }
        };
      }

      // Try to load from storage if persistence is enabled
      if (this._serviceState.persistenceEnabled) {
        const storedState = await this._loadFromStorage();
        if (storedState && this._isCacheValid(storedState, allowStale)) {
          console.log('[AuthenticationStatePersistence] Returning valid storage cache');
          
          // Update memory cache
          this._cachedAuthState = {
            data: storedState.data,
            timestamp: storedState.timestamp,
            isValid: true,
            source: 'storage'
          };

          return {
            ...storedState.data,
            _cacheInfo: {
              source: 'storage',
              timestamp: storedState.timestamp,
              age: Date.now() - storedState.timestamp
            }
          };
        }
      }

      console.log('[AuthenticationStatePersistence] No valid cached state available');
      return null;

    } catch (error) {
      console.error('[AuthenticationStatePersistence] Error getting cached auth state:', error);
      return null;
    }
  }

  /**
   * Cache authentication state in memory and storage
   * @param {Object} authState - Authentication state to cache
   * @param {Object} metadata - Additional metadata about the state
   */
  static async cacheAuthState(authState, metadata = {}) {
    try {
      const timestamp = Date.now();
      const cacheData = {
        data: {
          isAuthenticated: authState.isAuthenticated,
          userId: authState.userId,
          lastCheck: authState.lastCheck,
          error: authState.error ? {
            message: authState.error.message,
            code: authState.error.code,
            recoverable: authState.error.recoverable
          } : null,
          sessionInfo: {
            startTime: metadata.sessionStartTime || timestamp,
            lastActivity: timestamp,
            backgroundTime: this._serviceState.backgroundTime,
            foregroundTime: this._serviceState.foregroundTime
          }
        },
        timestamp,
        metadata: {
          appState: AppState.currentState,
          source: 'fresh',
          ...metadata
        }
      };

      console.log('[AuthenticationStatePersistence] Caching auth state', {
        isAuthenticated: authState.isAuthenticated,
        hasUserId: !!authState.userId,
        timestamp: new Date(timestamp).toISOString()
      });

      // Update memory cache
      this._cachedAuthState = {
        data: cacheData.data,
        timestamp,
        isValid: true,
        source: 'fresh'
      };

      // Persist to storage if enabled
      if (this._serviceState.persistenceEnabled) {
        await this._saveToStorage(cacheData);
      }

      // Update last activity timestamp
      await this._updateLastActivity(timestamp);

      // Notify sync listeners
      this._notifySyncListeners('state_cached', cacheData.data);

    } catch (error) {
      console.error('[AuthenticationStatePersistence] Error caching auth state:', error);
    }
  }

  /**
   * Clear cached authentication state
   * @param {string} reason - Reason for clearing cache
   */
  static async clearCachedState(reason = 'manual') {
    try {
      console.log('[AuthenticationStatePersistence] Clearing cached auth state', { reason });

      // Clear memory cache
      this._cachedAuthState = {
        data: null,
        timestamp: null,
        isValid: false,
        source: null
      };

      // Clear storage if persistence is enabled
      if (this._serviceState.persistenceEnabled) {
        await Promise.all([
          AsyncStorage.removeItem(this.STORAGE_KEYS.AUTH_STATE),
          AsyncStorage.removeItem(this.STORAGE_KEYS.AUTH_METADATA),
          AsyncStorage.removeItem(this.STORAGE_KEYS.SESSION_DATA)
        ]);
      }

      // Notify sync listeners
      this._notifySyncListeners('state_cleared', { reason });

    } catch (error) {
      console.error('[AuthenticationStatePersistence] Error clearing cached state:', error);
    }
  }

  /**
   * Handle app backgrounding - persist current state and prepare for recovery
   */
  static async handleAppBackgrounding() {
    try {
      const backgroundTime = Date.now();

      this._serviceState.backgroundTime = backgroundTime;
      this._serviceState.lastAppState = 'background';

      // Cache current cached state with background metadata if available
      if (this._cachedAuthState.data) {
        await this.cacheAuthState(this._cachedAuthState.data, {
          backgroundTime,
          appState: 'background',
          source: 'background_persist'
        });
      }

      // Update session data
      await this._updateSessionData({
        backgroundTime,
        lastAppState: 'background'
      });

    } catch (error) {
      console.error('[AuthenticationStatePersistence] Error handling app backgrounding:', error);
    }
  }

  /**
   * Handle app foregrounding - recover state and validate authentication
   * @returns {Promise<Object>} Recovery result with state and recommendations
   */
  static async handleAppForegrounding() {
    try {
      const foregroundTime = Date.now();
      const backgroundDuration = this._serviceState.backgroundTime 
        ? foregroundTime - this._serviceState.backgroundTime 
        : 0;

      console.log('[AuthenticationStatePersistence] App foregrounding', {
        foregroundTime: new Date(foregroundTime).toISOString(),
        backgroundDuration,
        backgroundDurationMinutes: Math.round(backgroundDuration / 60000)
      });

      this._serviceState.foregroundTime = foregroundTime;
      this._serviceState.lastAppState = 'active';

      // Determine recovery strategy based on background duration
      const recoveryStrategy = this._determineRecoveryStrategy(backgroundDuration);
      
      console.log('[AuthenticationStatePersistence] Recovery strategy determined', {
        strategy: recoveryStrategy.type,
        reason: recoveryStrategy.reason
      });

      let recoveryResult = {
        strategy: recoveryStrategy.type,
        backgroundDuration,
        stateRecovered: false,
        authenticationValid: false,
        recommendedAction: recoveryStrategy.action,
        cachedState: null
      };

      // Execute recovery strategy
      switch (recoveryStrategy.type) {
        case 'use_cache':
          recoveryResult = await this._recoverFromCache(recoveryResult);
          break;

        case 'validate_and_refresh':
          recoveryResult = await this._validateAndRefresh(recoveryResult);
          break;

        case 'force_reauth':
          recoveryResult = await this._forceReauthentication(recoveryResult);
          break;

        default:
          console.warn('[AuthenticationStatePersistence] Unknown recovery strategy:', recoveryStrategy.type);
          recoveryResult.recommendedAction = 'validate_authentication';
      }

      // Update session data
      await this._updateSessionData({
        foregroundTime,
        lastAppState: 'active',
        recoveryStrategy: recoveryStrategy.type,
        recoveryResult: recoveryResult.stateRecovered
      });

      // Notify sync listeners
      this._notifySyncListeners('app_foregrounded', recoveryResult);

      console.log('[AuthenticationStatePersistence] App foregrounding handled', recoveryResult);
      return recoveryResult;

    } catch (error) {
      console.error('[AuthenticationStatePersistence] Error handling app foregrounding:', error);
      return {
        strategy: 'error',
        backgroundDuration: 0,
        stateRecovered: false,
        authenticationValid: false,
        recommendedAction: 'validate_authentication',
        error: error.message
      };
    }
  }

  /**
   * Synchronize authentication state across app components
   * @param {Object} authState - Current authentication state
   * @param {string} source - Source of the state update
   */
  static async synchronizeState(authState, source = 'unknown') {
    try {
      console.log('[AuthenticationStatePersistence] Synchronizing auth state', {
        source,
        isAuthenticated: authState.isAuthenticated,
        hasUserId: !!authState.userId
      });

      // Cache the synchronized state
      await this.cacheAuthState(authState, {
        source: `sync_${source}`,
        syncTime: Date.now()
      });

      // Update last sync time
      this._serviceState.lastSyncTime = Date.now();

      // Notify all sync listeners
      this._notifySyncListeners('state_synchronized', {
        authState,
        source,
        syncTime: this._serviceState.lastSyncTime
      });

      console.log('[AuthenticationStatePersistence] State synchronization complete');

    } catch (error) {
      console.error('[AuthenticationStatePersistence] Error synchronizing state:', error);
    }
  }

  /**
   * Add a listener for authentication state synchronization events
   * @param {Function} listener - Listener function
   * @returns {Function} Unsubscribe function
   */
  static addSyncListener(listener) {
    this._serviceState.syncListeners.add(listener);
    
    console.log('[AuthenticationStatePersistence] Added sync listener', {
      totalListeners: this._serviceState.syncListeners.size
    });

    // Return unsubscribe function
    return () => {
      this._serviceState.syncListeners.delete(listener);
      console.log('[AuthenticationStatePersistence] Removed sync listener', {
        totalListeners: this._serviceState.syncListeners.size
      });
    };
  }

  /**
   * Force cleanup of stale authentication state
   */
  static async cleanupStaleState() {
    try {
      console.log('[AuthenticationStatePersistence] Starting stale state cleanup');

      const now = Date.now();
      let cleanupCount = 0;

      // Check and clean memory cache
      if (this._cachedAuthState.timestamp && 
          (now - this._cachedAuthState.timestamp) > this.CACHE_EXPIRY_DURATION * 2) {
        console.log('[AuthenticationStatePersistence] Cleaning stale memory cache');
        this._cachedAuthState = {
          data: null,
          timestamp: null,
          isValid: false,
          source: null
        };
        cleanupCount++;
      }

      // Check and clean storage cache if persistence is enabled
      if (this._serviceState.persistenceEnabled) {
        const storedState = await this._loadFromStorage();
        if (storedState && 
            (now - storedState.timestamp) > this.CACHE_EXPIRY_DURATION * 2) {
          console.log('[AuthenticationStatePersistence] Cleaning stale storage cache');
          await AsyncStorage.removeItem(this.STORAGE_KEYS.AUTH_STATE);
          cleanupCount++;
        }

        // Clean old session data
        const sessionData = await this._loadSessionData();
        if (sessionData && sessionData.backgroundTime && 
            (now - sessionData.backgroundTime) > this.MAX_BACKGROUND_DURATION) {
          console.log('[AuthenticationStatePersistence] Cleaning old session data');
          await AsyncStorage.removeItem(this.STORAGE_KEYS.SESSION_DATA);
          cleanupCount++;
        }
      }

      console.log('[AuthenticationStatePersistence] Stale state cleanup complete', {
        itemsCleaned: cleanupCount
      });

      return cleanupCount;

    } catch (error) {
      console.error('[AuthenticationStatePersistence] Error during stale state cleanup:', error);
      return 0;
    }
  }

  /**
   * Get comprehensive service status and statistics
   * @returns {Object} Service status and statistics
   */
  static getServiceStatus() {
    return {
      serviceState: {
        isInitialized: this._serviceState.isInitialized,
        persistenceEnabled: this._serviceState.persistenceEnabled,
        isListeningToAppState: this._serviceState.isListeningToAppState,
        lastAppState: this._serviceState.lastAppState,
        backgroundTime: this._serviceState.backgroundTime,
        foregroundTime: this._serviceState.foregroundTime,
        lastSyncTime: this._serviceState.lastSyncTime,
        syncListenersCount: this._serviceState.syncListeners.size
      },
      cachedState: {
        hasData: !!this._cachedAuthState.data,
        timestamp: this._cachedAuthState.timestamp,
        isValid: this._cachedAuthState.isValid,
        source: this._cachedAuthState.source,
        age: this._cachedAuthState.timestamp ? Date.now() - this._cachedAuthState.timestamp : null
      },
      configuration: {
        cacheExpiryDuration: this.CACHE_EXPIRY_DURATION,
        backgroundGracePeriod: this.BACKGROUND_GRACE_PERIOD,
        staleStateCleanupInterval: this.STALE_STATE_CLEANUP_INTERVAL,
        maxBackgroundDuration: this.MAX_BACKGROUND_DURATION
      }
    };
  }

  /**
   * Shutdown the service and clean up resources
   */
  static async shutdown() {
    try {
      console.log('[AuthenticationStatePersistence] Shutting down service');

      // Stop app state monitoring
      this._stopAppStateMonitoring();

      // Stop cleanup interval
      if (this._serviceState.cleanupIntervalId) {
        clearInterval(this._serviceState.cleanupIntervalId);
        this._serviceState.cleanupIntervalId = null;
      }

      // Clear sync listeners
      this._serviceState.syncListeners.clear();

      // Reset service state
      this._serviceState.isInitialized = false;

    } catch (error) {
      console.error('[AuthenticationStatePersistence] Error during shutdown:', error);
    }
  }

  // Private methods

  /**
   * Load persisted authentication state from storage
   * @private
   */
  static async _loadPersistedState() {
    try {
      const storedState = await this._loadFromStorage();
      if (storedState && this._isCacheValid(storedState)) {
        this._cachedAuthState = {
          data: storedState.data,
          timestamp: storedState.timestamp,
          isValid: true,
          source: 'storage'
        };
      } else {
        console.log('[AuthenticationStatePersistence] No valid persisted state found');
      }
    } catch (error) {
      console.error('[AuthenticationStatePersistence] Error loading persisted state:', error);
    }
  }

  /**
   * Load authentication state from AsyncStorage
   * @private
   */
  static async _loadFromStorage() {
    try {
      const [stateData, metadataData] = await Promise.all([
        AsyncStorage.getItem(this.STORAGE_KEYS.AUTH_STATE),
        AsyncStorage.getItem(this.STORAGE_KEYS.AUTH_METADATA)
      ]);

      if (!stateData) {
        return null;
      }

      const parsedState = JSON.parse(stateData);
      const parsedMetadata = metadataData ? JSON.parse(metadataData) : {};

      return {
        data: parsedState,
        timestamp: parsedMetadata.timestamp || Date.now(),
        metadata: parsedMetadata
      };

    } catch (error) {
      console.error('[AuthenticationStatePersistence] Error loading from storage:', error);
      return null;
    }
  }

  /**
   * Save authentication state to AsyncStorage
   * @private
   */
  static async _saveToStorage(cacheData) {
    try {
      await Promise.all([
        AsyncStorage.setItem(this.STORAGE_KEYS.AUTH_STATE, JSON.stringify(cacheData.data)),
        AsyncStorage.setItem(this.STORAGE_KEYS.AUTH_METADATA, JSON.stringify({
          timestamp: cacheData.timestamp,
          ...cacheData.metadata
        }))
      ]);
    } catch (error) {
      console.error('[AuthenticationStatePersistence] Error saving to storage:', error);
    }
  }

  /**
   * Check if cached state is valid
   * @private
   */
  static _isCacheValid(cachedState, allowStale = false) {
    if (!cachedState || !cachedState.timestamp) {
      return false;
    }

    const age = Date.now() - cachedState.timestamp;
    const maxAge = allowStale ? this.CACHE_EXPIRY_DURATION * 2 : this.CACHE_EXPIRY_DURATION;
    
    return age <= maxAge;
  }

  /**
   * Start monitoring app state changes
   * @private
   */
  static _startAppStateMonitoring() {
    if (this._serviceState.isListeningToAppState) {
      return;
    }

    try {
      this._serviceState.appStateSubscription = AppState.addEventListener(
        'change',
        this._handleAppStateChange.bind(this)
      );

      this._serviceState.isListeningToAppState = true;
    } catch (error) {
      console.error('[AuthenticationStatePersistence] Error setting up app state listener:', error);
      // Don't throw, just log the error
    }
  }

  /**
   * Stop monitoring app state changes
   * @private
   */
  static _stopAppStateMonitoring() {
    if (!this._serviceState.isListeningToAppState) {
      return;
    }
    
    if (this._serviceState.appStateSubscription) {
      this._serviceState.appStateSubscription.remove();
      this._serviceState.appStateSubscription = null;
    }

    this._serviceState.isListeningToAppState = false;
  }

  /**
   * Handle app state changes
   * @private
   */
  static async _handleAppStateChange(nextAppState) {
    try {
      const previousAppState = this._serviceState.lastAppState;
      
      if (previousAppState === 'active' && nextAppState.match(/inactive|background/)) {
        // App is going to background
        await this.handleAppBackgrounding();
      } else if (previousAppState.match(/inactive|background/) && nextAppState === 'active') {
        // App is coming to foreground
        await this.handleAppForegrounding();
      }

      this._serviceState.lastAppState = nextAppState;

    } catch (error) {
      console.error('[AuthenticationStatePersistence] Error handling app state change:', error);
    }
  }

  /**
   * Start cleanup interval for stale state
   * @private
   */
  static _startStaleStateCleanup() {
    if (this._serviceState.cleanupIntervalId) {
      return;
    }
    
    this._serviceState.cleanupIntervalId = setInterval(
      () => this.cleanupStaleState(),
      this.STALE_STATE_CLEANUP_INTERVAL
    );
  }

  /**
   * Update last activity timestamp
   * @private
   */
  static async _updateLastActivity(timestamp) {
    try {
      if (this._serviceState.persistenceEnabled) {
        await AsyncStorage.setItem(
          this.STORAGE_KEYS.LAST_ACTIVITY, 
          timestamp.toString()
        );
      }
    } catch (error) {
      console.error('[AuthenticationStatePersistence] Error updating last activity:', error);
    }
  }

  /**
   * Update session data
   * @private
   */
  static async _updateSessionData(sessionData) {
    try {
      if (this._serviceState.persistenceEnabled) {
        const existingData = await this._loadSessionData() || {};
        const updatedData = { ...existingData, ...sessionData, timestamp: Date.now() };
        
        await AsyncStorage.setItem(
          this.STORAGE_KEYS.SESSION_DATA,
          JSON.stringify(updatedData)
        );
      }
    } catch (error) {
      console.error('[AuthenticationStatePersistence] Error updating session data:', error);
    }
  }

  /**
   * Load session data
   * @private
   */
  static async _loadSessionData() {
    try {
      if (!this._serviceState.persistenceEnabled) {
        return null;
      }

      const sessionDataStr = await AsyncStorage.getItem(this.STORAGE_KEYS.SESSION_DATA);
      return sessionDataStr ? JSON.parse(sessionDataStr) : null;
    } catch (error) {
      console.error('[AuthenticationStatePersistence] Error loading session data:', error);
      return null;
    }
  }

  /**
   * Determine recovery strategy based on background duration
   * @private
   */
  static _determineRecoveryStrategy(backgroundDuration) {
    if (backgroundDuration <= this.BACKGROUND_GRACE_PERIOD) {
      return {
        type: 'use_cache',
        reason: 'short_background_duration',
        action: 'use_cached_state'
      };
    } else if (backgroundDuration <= this.MAX_BACKGROUND_DURATION) {
      return {
        type: 'validate_and_refresh',
        reason: 'medium_background_duration',
        action: 'validate_and_refresh_tokens'
      };
    } else {
      return {
        type: 'force_reauth',
        reason: 'long_background_duration',
        action: 'force_reauthentication'
      };
    }
  }

  /**
   * Recover authentication state from cache
   * @private
   */
  static async _recoverFromCache(recoveryResult) {
    try {
      const cachedState = await this.getCachedAuthState(true); // Allow stale cache
      
      if (cachedState) {
        console.log('[AuthenticationStatePersistence] Recovering from cached state');
        
        // Synchronize the cached state with AuthenticationStateManager
        await this.synchronizeState(cachedState, 'cache_recovery');
        
        recoveryResult.stateRecovered = true;
        recoveryResult.authenticationValid = cachedState.isAuthenticated;
        recoveryResult.cachedState = cachedState;
        recoveryResult.recommendedAction = 'continue_normal_operation';
      } else {
        console.log('[AuthenticationStatePersistence] No cached state available for recovery');
        recoveryResult.recommendedAction = 'validate_authentication';
      }

      return recoveryResult;
    } catch (error) {
      console.error('[AuthenticationStatePersistence] Error recovering from cache:', error);
      recoveryResult.recommendedAction = 'validate_authentication';
      return recoveryResult;
    }
  }

  /**
   * Validate authentication and refresh tokens if needed
   * @private
   */
  static async _validateAndRefresh(recoveryResult) {
    try {
      console.log('[AuthenticationStatePersistence] Validating authentication and refreshing if needed');
      
      // This method will be called by AuthenticationStateManager
      // For now, just indicate that validation is needed
      recoveryResult.stateRecovered = false;
      recoveryResult.authenticationValid = false;
      recoveryResult.recommendedAction = 'validate_and_refresh_tokens';

      return recoveryResult;
    } catch (error) {
      console.error('[AuthenticationStatePersistence] Error validating and refreshing:', error);
      recoveryResult.recommendedAction = 'prompt_reauthentication';
      return recoveryResult;
    }
  }

  /**
   * Force reauthentication by clearing all state
   * @private
   */
  static async _forceReauthentication(recoveryResult) {
    try {
      console.log('[AuthenticationStatePersistence] Forcing reauthentication');
      
      // Clear all cached state
      await this.clearCachedState('force_reauth');

      recoveryResult.stateRecovered = false;
      recoveryResult.authenticationValid = false;
      recoveryResult.recommendedAction = 'force_reauthentication';

      return recoveryResult;
    } catch (error) {
      console.error('[AuthenticationStatePersistence] Error forcing reauthentication:', error);
      recoveryResult.recommendedAction = 'force_reauthentication';
      return recoveryResult;
    }
  }

  /**
   * Notify all sync listeners of state changes
   * @private
   */
  static _notifySyncListeners(eventType, eventData) {
    try {
      for (const listener of this._serviceState.syncListeners) {
        try {
          listener(eventType, eventData);
        } catch (error) {
          console.error('[AuthenticationStatePersistence] Error in sync listener:', error);
        }
      }
    } catch (error) {
      console.error('[AuthenticationStatePersistence] Error notifying sync listeners:', error);
    }
  }
}

export default AuthenticationStatePersistence;