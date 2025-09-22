import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

class Base64ImageErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // Log the error for debugging
    console.error('Base64Image Error Boundary caught an error:', {
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      childId: this.props.childId,
      debugInfo: this.props.debugInfo
    });

    // Report error if callback provided
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  render() {
    if (this.state.hasError) {
      // Render fallback UI
      const { fallbackComponent, childGender, childName } = this.props;
      
      if (fallbackComponent) {
        return fallbackComponent;
      }

      // Default fallback: emoji avatar
      const genderEmoji = childGender === 'girl' ? '👧' : '👦';
      
      return (
        <View style={[styles.fallbackContainer, this.props.style]}>
          <Text style={styles.fallbackEmoji}>{genderEmoji}</Text>
          {this.props.showDebugInfo && (
            <Text style={styles.debugText}>
              Photo failed for {childName}
            </Text>
          )}
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  fallbackContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
  },
  fallbackEmoji: {
    fontSize: 24,
    textAlign: 'center',
  },
  debugText: {
    fontSize: 10,
    color: '#666',
    marginTop: 2,
    textAlign: 'center',
  },
});

export default Base64ImageErrorBoundary;