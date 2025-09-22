import { useState, useEffect, useCallback } from 'react';
import AuthenticationStateManager from '../services/AuthenticationStateManager';
import AuthenticationStatePersistence from '../services/AuthenticationStatePersistence';

/**
 * React hook for accessing authentication state persistence features
 * Provides access to cached state, synchronization events, and recovery status
 */
export function useAuthenticationStatePersistence() {
  const [persistenceStatus, setPersistenceStatus] = useState({
    isInitialized: false,
    hasValidCache: false,
    lastSyncTime: null,
    cacheAge: null,
    backgroundDuration: null,
    recoveryStrategy: null
  });

  const [syncEvents, setSyncEvents] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  /**
   * Get current cached authentication state
   */
  const getCachedState = useCallback(async (allowStale = false) => {
    try {
      setIsLoading(true);
      const cachedState = await AuthenticationStatePersistence.getCachedAuthState(allowStale);
      return cachedState;
    } catch (error) {
      console.error('[useAuthenticationStatePersistence] Error getting cached state:', error);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Force synchronization of authentication state
   */
  const synchronizeState = useCallback(async (source = 'manual') => {
    try {
      setIsLoading(true);
      await AuthenticationStateManager.synchronizeWithPersistence(source);
      
      // Update persistence status
      const status = AuthenticationStatePersistence.getServiceStatus();
      setPersistenceStatus(prev => ({
        ...prev,
        lastSyncTime: Date.now(),
        hasValidCache: status.cachedState.hasData && status.cachedState.isValid
      }));
      
      return true;
    } catch (error) {
      console.error('[useAuthenticationStatePersistence] Error synchronizing state:', error);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Clear cached authentication state
   */
  const clearCache = useCallback(async (reason = 'manual') => {
    try {
      setIsLoading(true);
      await AuthenticationStatePersistence.clearCachedState(reason);
      
      // Update persistence status
      setPersistenceStatus(prev => ({
        ...prev,
        hasValidCache: false,
        cacheAge: null
      }));
      
      return true;
    } catch (error) {
      console.error('[useAuthenticationStatePersistence] Error clearing cache:', error);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Force cleanup of stale state
   */
  const cleanupStaleState = useCallback(async () => {
    try {
      setIsLoading(true);
      const cleanupCount = await AuthenticationStatePersistence.cleanupStaleState();
      
      // Update persistence status
      const status = AuthenticationStatePersistence.getServiceStatus();
      setPersistenceStatus(prev => ({
        ...prev,
        hasValidCache: status.cachedState.hasData && status.cachedState.isValid,
        cacheAge: status.cachedState.age
      }));
      
      return cleanupCount;
    } catch (error) {
      console.error('[useAuthenticationStatePersistence] Error cleaning up stale state:', error);
      return 0;
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Get comprehensive service status
   */
  const getServiceStatus = useCallback(() => {
    try {
      return AuthenticationStatePersistence.getServiceStatus();
    } catch (error) {
      console.error('[useAuthenticationStatePersistence] Error getting service status:', error);
      return null;
    }
  }, []);

  /**
   * Handle app foregrounding manually (for testing or manual recovery)
   */
  const handleAppForegrounding = useCallback(async () => {
    try {
      setIsLoading(true);
      const recoveryResult = await AuthenticationStateManager.handleAppForegrounding();
      
      // Update persistence status with recovery information
      setPersistenceStatus(prev => ({
        ...prev,
        recoveryStrategy: recoveryResult.strategy,
        backgroundDuration: recoveryResult.backgroundDuration,
        hasValidCache: recoveryResult.stateRecovered
      }));
      
      return recoveryResult;
    } catch (error) {
      console.error('[useAuthenticationStatePersistence] Error handling app foregrounding:', error);
      return {
        strategy: 'error',
        stateRecovered: false,
        authenticationValid: false,
        error: error.message
      };
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Set up sync event listener and status monitoring
  useEffect(() => {
    let unsubscribeSync = null;
    let statusUpdateInterval = null;

    const initializePersistenceHook = async () => {
      try {
        // Get initial service status
        const initialStatus = AuthenticationStatePersistence.getServiceStatus();
        setPersistenceStatus({
          isInitialized: initialStatus.serviceState.isInitialized,
          hasValidCache: initialStatus.cachedState.hasData && initialStatus.cachedState.isValid,
          lastSyncTime: initialStatus.serviceState.lastSyncTime,
          cacheAge: initialStatus.cachedState.age,
          backgroundDuration: null,
          recoveryStrategy: null
        });

        // Set up sync event listener
        unsubscribeSync = AuthenticationStateManager.addSyncListener((eventType, eventData) => {
          const timestamp = Date.now();
          
          // Add sync event to history (keep last 10 events)
          setSyncEvents(prev => {
            const newEvent = {
              id: `${eventType}_${timestamp}`,
              type: eventType,
              data: eventData,
              timestamp
            };
            
            return [newEvent, ...prev.slice(0, 9)];
          });

          // Update persistence status based on event
          if (eventType === 'state_synchronized' || eventType === 'state_cached') {
            setPersistenceStatus(prev => ({
              ...prev,
              lastSyncTime: timestamp,
              hasValidCache: true
            }));
          } else if (eventType === 'state_cleared') {
            setPersistenceStatus(prev => ({
              ...prev,
              hasValidCache: false,
              cacheAge: null
            }));
          } else if (eventType === 'app_foregrounded') {
            setPersistenceStatus(prev => ({
              ...prev,
              recoveryStrategy: eventData.strategy,
              backgroundDuration: eventData.backgroundDuration,
              hasValidCache: eventData.stateRecovered
            }));
          }
        });

        // Set up periodic status updates
        statusUpdateInterval = setInterval(() => {
          try {
            const status = AuthenticationStatePersistence.getServiceStatus();
            setPersistenceStatus(prev => ({
              ...prev,
              isInitialized: status.serviceState.isInitialized,
              hasValidCache: status.cachedState.hasData && status.cachedState.isValid,
              cacheAge: status.cachedState.age
            }));
          } catch (error) {
            console.error('[useAuthenticationStatePersistence] Error updating status:', error);
          }
        }, 30000); // Update every 30 seconds

      } catch (error) {
        console.error('[useAuthenticationStatePersistence] Error initializing hook:', error);
      }
    };

    initializePersistenceHook();

    // Cleanup
    return () => {
      if (unsubscribeSync) {
        unsubscribeSync();
      }
      if (statusUpdateInterval) {
        clearInterval(statusUpdateInterval);
      }
    };
  }, []);

  return {
    // Status
    persistenceStatus,
    syncEvents,
    isLoading,

    // Actions
    getCachedState,
    synchronizeState,
    clearCache,
    cleanupStaleState,
    getServiceStatus,
    handleAppForegrounding,

    // Computed values
    isCacheValid: persistenceStatus.hasValidCache,
    cacheAgeMinutes: persistenceStatus.cacheAge ? Math.round(persistenceStatus.cacheAge / 60000) : null,
    backgroundDurationMinutes: persistenceStatus.backgroundDuration ? Math.round(persistenceStatus.backgroundDuration / 60000) : null,
    recentSyncEvents: syncEvents.slice(0, 5) // Last 5 events
  };
}

export default useAuthenticationStatePersistence;