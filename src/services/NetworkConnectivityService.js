import NetInfo from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Service for monitoring network connectivity and managing offline state
 */
class NetworkConnectivityService {
  static isOnline = true;
  static listeners = [];
  static unsubscribe = null;

  /**
   * Initialize network monitoring
   */
  static async initialize() {
    try {
      // Get initial network state
      const state = await NetInfo.fetch();
      this.isOnline = state.isConnected && state.isInternetReachable;

      // Subscribe to network state changes
      this.unsubscribe = NetInfo.addEventListener(state => {
        const wasOnline = this.isOnline;
        this.isOnline = state.isConnected && state.isInternetReachable;

        // Notify listeners of connectivity changes
        if (wasOnline !== this.isOnline) {
          this.notifyListeners(this.isOnline);
        }
      });

      // Store initial state
      await AsyncStorage.setItem('network_state', JSON.stringify({
        isOnline: this.isOnline,
        lastChecked: new Date().toISOString()
      }));

      return true;
    } catch (error) {
      console.error('Failed to initialize network monitoring:', error);
      return false;
    }
  }

  /**
   * Get current online status
   */
  static getOnlineStatus() {
    return this.isOnline;
  }

  /**
   * Check network connectivity manually
   */
  static async checkConnectivity() {
    try {
      const state = await NetInfo.fetch();
      const isOnline = state.isConnected && state.isInternetReachable;
      
      if (this.isOnline !== isOnline) {
        this.isOnline = isOnline;
        this.notifyListeners(isOnline);
      }

      // Update stored state
      await AsyncStorage.setItem('network_state', JSON.stringify({
        isOnline: this.isOnline,
        lastChecked: new Date().toISOString()
      }));

      return isOnline;
    } catch (error) {
      console.error('Failed to check connectivity:', error);
      return this.isOnline; // Return cached state on error
    }
  }

  /**
   * Add listener for connectivity changes
   */
  static addConnectivityListener(callback) {
    this.listeners.push(callback);
    
    // Return unsubscribe function
    return () => {
      this.listeners = this.listeners.filter(listener => listener !== callback);
    };
  }

  /**
   * Notify all listeners of connectivity changes
   */
  static notifyListeners(isOnline) {
    this.listeners.forEach(callback => {
      try {
        callback(isOnline);
      } catch (error) {
        console.error('Error in connectivity listener:', error);
      }
    });
  }

  /**
   * Get network state details
   */
  static async getNetworkDetails() {
    try {
      const state = await NetInfo.fetch();
      return {
        isConnected: state.isConnected,
        isInternetReachable: state.isInternetReachable,
        type: state.type,
        details: state.details
      };
    } catch (error) {
      console.error('Failed to get network details:', error);
      return null;
    }
  }

  /**
   * Cleanup network monitoring
   */
  static cleanup() {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.listeners = [];
  }
}

export default NetworkConnectivityService;