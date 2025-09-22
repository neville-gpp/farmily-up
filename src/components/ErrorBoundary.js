import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: 0,
    };
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    // Log error details
    console.error('=== ERROR BOUNDARY CAUGHT ERROR ===');
    console.error('Error:', error);
    console.error('Error Info:', errorInfo);
    console.error('Component Stack:', errorInfo.componentStack);

    this.setState({
      error: error,
      errorInfo: errorInfo,
    });

    // You could also log the error to a crash reporting service here
    this.logErrorToService(error, errorInfo);
  }

  logErrorToService = (error, errorInfo) => {
    // In a real app, you would send this to a crash reporting service
    // For now, we'll just log it locally
    try {
      const errorReport = {
        timestamp: new Date().toISOString(),
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack,
        },
        errorInfo: errorInfo,
        userAgent: navigator.userAgent || 'React Native',
        retryCount: this.state.retryCount,
      };

      console.log('=== ERROR REPORT ===');
      console.log(JSON.stringify(errorReport, null, 2));
    } catch (loggingError) {
      console.error('Failed to log error:', loggingError);
    }
  };

  handleRetry = () => {
    this.setState(prevState => ({
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: prevState.retryCount + 1,
    }));
  };

  handleReload = () => {
    // Reset the error boundary and force a complete reload
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: 0,
    });

    // If there's a parent reload function, call it
    if (this.props.onReload) {
      this.props.onReload();
    }
  };

  render() {
    if (this.state.hasError) {
      // Render custom error UI
      const { error } = this.state;
      const isNetworkError = error?.message?.includes('network') || 
                           error?.message?.includes('fetch') ||
                           error?.message?.includes('timeout');
      const isStorageError = error?.message?.includes('AsyncStorage') ||
                           error?.message?.includes('storage');
      const isValidationError = error?.message?.includes('validation') ||
                              error?.message?.includes('required');

      return (
        <View style={styles.container}>
          <ScrollView contentContainerStyle={styles.content}>
            <View style={styles.iconContainer}>
              <Ionicons 
                name={isNetworkError ? "wifi-outline" : "alert-circle-outline"} 
                size={64} 
                color="#F44336" 
              />
            </View>

            <Text style={styles.title}>
              {isNetworkError ? 'Connection Problem' : 'Something went wrong'}
            </Text>

            <Text style={styles.message}>
              {isNetworkError 
                ? 'Please check your internet connection and try again.'
                : isStorageError
                ? 'There was a problem saving your data. Please try again.'
                : isValidationError
                ? 'Please check your input and try again.'
                : 'An unexpected error occurred. We apologize for the inconvenience.'
              }
            </Text>

            {/* Error details for development */}
            {__DEV__ && error && (
              <View style={styles.errorDetails}>
                <Text style={styles.errorDetailsTitle}>Error Details (Development)</Text>
                <Text style={styles.errorDetailsText}>
                  {error.name}: {error.message}
                </Text>
                {error.stack && (
                  <ScrollView style={styles.stackTrace} horizontal>
                    <Text style={styles.stackTraceText}>{error.stack}</Text>
                  </ScrollView>
                )}
              </View>
            )}

            <View style={styles.actions}>
              <TouchableOpacity style={styles.retryButton} onPress={this.handleRetry}>
                <Ionicons name="refresh" size={20} color="white" />
                <Text style={styles.retryButtonText}>Try Again</Text>
              </TouchableOpacity>

              {this.state.retryCount > 2 && (
                <TouchableOpacity style={styles.reloadButton} onPress={this.handleReload}>
                  <Ionicons name="reload" size={20} color="#48b6b0" />
                  <Text style={styles.reloadButtonText}>Reload App</Text>
                </TouchableOpacity>
              )}
            </View>

            {this.state.retryCount > 0 && (
              <Text style={styles.retryCount}>
                Retry attempts: {this.state.retryCount}
              </Text>
            )}
          </ScrollView>
        </View>
      );
    }

    // No error, render children normally
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  iconContainer: {
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
    marginBottom: 12,
  },
  message: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 30,
    paddingHorizontal: 20,
  },
  errorDetails: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
    marginBottom: 20,
    width: '100%',
    borderLeftWidth: 4,
    borderLeftColor: '#F44336',
  },
  errorDetailsTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#F44336',
    marginBottom: 8,
  },
  errorDetailsText: {
    fontSize: 12,
    color: '#666',
    marginBottom: 8,
  },
  stackTrace: {
    maxHeight: 100,
    backgroundColor: '#f9f9f9',
    borderRadius: 4,
    padding: 8,
  },
  stackTraceText: {
    fontSize: 10,
    color: '#666',
    fontFamily: 'monospace',
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#48b6b0',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    gap: 8,
  },
  retryButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  reloadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#48b6b0',
    gap: 8,
  },
  reloadButtonText: {
    color: '#48b6b0',
    fontSize: 16,
    fontWeight: '600',
  },
  retryCount: {
    fontSize: 12,
    color: '#999',
    marginTop: 16,
    textAlign: 'center',
  },
});

export default ErrorBoundary;