import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import ProgressIndicator from '../components/ProgressIndicator';

export default function CompleteScreen({ navigation, route }) {
  // Get email from route params (passed from verification)
  const email = route?.params?.email || '';
  const [isRedirecting, setIsRedirecting] = useState(false);

  /**
   * Navigate to login screen immediately
   */
  const handleContinueToLogin = () => {
    try {
      navigation.replace('Login', { email });
    } catch (error) {
      try {
        navigation.navigate('Login', { email });
      } catch (fallbackError) {
        navigation.navigate('Login');
      }
    }
  };

  const screenHeight = Dimensions.get('window').height;
  const isSmallScreen = screenHeight < 700;

  return (
    <SafeAreaView style={styles.container}>
      {/* Progress Indicator */}
      <View style={styles.progressContainer}>
        <ProgressIndicator
          currentStep={3}
          totalSteps={3}
          stepLabels={['Register', 'Verify', 'Complete']}
        />
      </View>

      <View style={styles.content}>
        {/* Success Icon and Animation */}
        <View
          style={[
            styles.successContainer,
            isSmallScreen && styles.successContainerSmall,
          ]}
        >
          <View style={styles.successIconContainer}>
            <Ionicons
              name='checkmark-circle'
              size={isSmallScreen ? 80 : 100}
              color='#4CAF50'
            />
          </View>

          <Text style={[styles.title, isSmallScreen && styles.titleSmall]}>
            Account Created Successfully!
          </Text>

          <Text
            style={[styles.subtitle, isSmallScreen && styles.subtitleSmall]}
          >
            Welcome to Farmily UP!
          </Text>
        </View>

        {/* Features Preview */}
        <View
          style={[
            styles.featuresContainer,
            isSmallScreen && styles.featuresContainerSmall,
          ]}
        >
          <View style={styles.featureItem}>
            <Ionicons name='happy-outline' size={24} color='#48b6b0' />
            <Text style={styles.featureText}>Track daily feeling</Text>
          </View>

          <View style={styles.featureItem}>
            <Ionicons name='calendar-outline' size={24} color='#48b6b0' />
            <Text style={styles.featureText}>Track daily activities</Text>
          </View>

          <View style={styles.featureItem}>
            <Ionicons name='people-outline' size={24} color='#48b6b0' />
            <Text style={styles.featureText}>Manage family events</Text>
          </View>

          <View style={styles.featureItem}>
            <Ionicons name='flower-outline' size={24} color='#48b6b0' />
            <Text style={styles.featureText}>Grow the magical plant</Text>
          </View>
        </View>

        {/* Continue Button */}
        <TouchableOpacity
          style={styles.continueButton}
          onPress={handleContinueToLogin}
        >
          <Text style={styles.continueButtonText}>Continue</Text>
          <Ionicons
            name='arrow-forward'
            size={20}
            color='white'
            style={styles.buttonIcon}
          />
        </TouchableOpacity>



        {/* Auto-redirect Notice */}
        <View style={styles.redirectContainer}>
          {isRedirecting && (
            <Ionicons
              name='reload'
              size={16}
              color='#48b6b0'
              style={styles.redirectIcon}
            />
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  progressContainer: {
    paddingHorizontal: 20,
    paddingTop: 10,
    backgroundColor: '#f5f5f5',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  successContainer: {
    alignItems: 'center',
    marginBottom: 40,
  },
  successContainerSmall: {
    marginBottom: 30,
  },
  successIconContainer: {
    marginBottom: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
    marginBottom: 12,
  },
  titleSmall: {
    fontSize: 24,
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 20,
  },
  subtitleSmall: {
    fontSize: 14,
    lineHeight: 20,
    paddingHorizontal: 10,
  },
  featuresContainer: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 20,
    marginBottom: 30,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  featuresContainerSmall: {
    padding: 16,
    marginBottom: 25,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  featureText: {
    fontSize: 16,
    color: '#333',
    marginLeft: 12,
    fontWeight: '500',
  },
  continueButton: {
    backgroundColor: '#48b6b0',
    borderRadius: 8,
    height: 48,
    paddingHorizontal: 24,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    width: '100%',
  },
  continueButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
    marginRight: 8,
  },
  buttonIcon: {
    marginLeft: 4,
  },

  redirectContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  redirectIcon: {
    marginRight: 6,
  },
  autoRedirectText: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    fontStyle: 'italic',
  },
});
