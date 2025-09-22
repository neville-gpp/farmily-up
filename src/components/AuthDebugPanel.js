import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import {
  getAuthDebugInfo,
  testTokenRefresh,
  clearRefreshFailures,
  formatAuthDebugInfo,
} from '../utils/authDebugUtils';

/**
 * Debug panel for monitoring authentication status
 * Add this component temporarily to any screen to debug auth issues
 */
const AuthDebugPanel = ({ visible = true }) => {
  const [debugInfo, setDebugInfo] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);
  const { refreshTokens } = useAuth();

  // Auto-refresh debug info every 10 seconds
  useEffect(() => {
    if (!visible) return;

    const updateDebugInfo = async () => {
      try {
        const info = await getAuthDebugInfo();
        setDebugInfo(info);
        setLastUpdate(new Date().toLocaleTimeString());
      } catch (error) {
        console.error('Error updating debug info:', error);
      }
    };

    updateDebugInfo();
    const interval = setInterval(updateDebugInfo, 10000);

    return () => clearInterval(interval);
  }, [visible]);

  const handleTestRefresh = async () => {
    setIsRefreshing(true);
    try {
      const result = await testTokenRefresh();
      Alert.alert(
        'Token Refresh Test',
        `Result: ${result.success ? 'Success' : 'Failed'}\n${result.error || 'Check console for details'}`,
        [{ text: 'OK' }]
      );
    } catch (error) {
      Alert.alert('Error', error.message);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleClearFailures = async () => {
    try {
      const success = await clearRefreshFailures();
      Alert.alert(
        'Clear Failures',
        success ? 'Refresh failure tracking cleared' : 'Failed to clear failures'
      );
    } catch (error) {
      Alert.alert('Error', error.message);
    }
  };

  const handleForceRefresh = async () => {
    setIsRefreshing(true);
    try {
      const result = await refreshTokens();
      Alert.alert(
        'Force Refresh',
        `Result: ${result ? 'Success' : 'Failed'}`
      );
    } catch (error) {
      Alert.alert('Error', error.message);
    } finally {
      setIsRefreshing(false);
    }
  };

  if (!visible || !debugInfo) {
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Auth Debug Panel</Text>
        <Text style={styles.lastUpdate}>Last Update: {lastUpdate}</Text>
      </View>

      <ScrollView style={styles.content}>
        <Text style={styles.debugText}>
          {formatAuthDebugInfo(debugInfo)}
        </Text>

        {debugInfo.refresh && debugInfo.refresh.failureCount > 0 && (
          <View style={styles.warningBox}>
            <Text style={styles.warningText}>
              ⚠️ {debugInfo.refresh.failureCount} refresh failures detected
            </Text>
          </View>
        )}

        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={[styles.button, styles.testButton]}
            onPress={handleTestRefresh}
            disabled={isRefreshing}
          >
            <Text style={styles.buttonText}>
              {isRefreshing ? 'Testing...' : 'Test Refresh'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.forceButton]}
            onPress={handleForceRefresh}
            disabled={isRefreshing}
          >
            <Text style={styles.buttonText}>Force Refresh</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.clearButton]}
            onPress={handleClearFailures}
          >
            <Text style={styles.buttonText}>Clear Failures</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.rawDataContainer}>
          <Text style={styles.rawDataTitle}>Raw Debug Data:</Text>
          <Text style={styles.rawDataText}>
            {JSON.stringify(debugInfo, null, 2)}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#f0f0f0',
    borderWidth: 2,
    borderColor: '#007AFF',
    borderRadius: 8,
    margin: 10,
    maxHeight: 400,
  },
  header: {
    backgroundColor: '#007AFF',
    padding: 10,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
  },
  title: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  lastUpdate: {
    color: 'white',
    fontSize: 12,
    opacity: 0.8,
  },
  content: {
    padding: 10,
  },
  debugText: {
    fontFamily: 'monospace',
    fontSize: 12,
    backgroundColor: 'white',
    padding: 10,
    borderRadius: 4,
    marginBottom: 10,
  },
  warningBox: {
    backgroundColor: '#fff3cd',
    borderColor: '#ffeaa7',
    borderWidth: 1,
    borderRadius: 4,
    padding: 8,
    marginBottom: 10,
  },
  warningText: {
    color: '#856404',
    fontSize: 12,
    fontWeight: 'bold',
  },
  buttonContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  button: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 4,
    minWidth: 80,
  },
  testButton: {
    backgroundColor: '#28a745',
  },
  forceButton: {
    backgroundColor: '#ffc107',
  },
  clearButton: {
    backgroundColor: '#dc3545',
  },
  buttonText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  rawDataContainer: {
    marginTop: 10,
  },
  rawDataTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  rawDataText: {
    fontFamily: 'monospace',
    fontSize: 10,
    backgroundColor: 'white',
    padding: 8,
    borderRadius: 4,
    maxHeight: 200,
  },
});

export default AuthDebugPanel;