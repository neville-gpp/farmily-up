import React from 'react';
import {
  View,
  Text,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

/**
 * ProgressIndicator Component
 * 
 * A multi-step progress indicator for authentication flows like registration,
 * verification, and password reset processes.
 * 
 * @param {number} currentStep - Current step (1-based)
 * @param {number} totalSteps - Total number of steps
 * @param {Array} stepLabels - Array of step labels
 * @param {string} activeColor - Color for active/completed steps
 * @param {string} inactiveColor - Color for inactive steps
 */
export default function ProgressIndicator({
  currentStep = 1,
  totalSteps = 3,
  stepLabels = [],
  activeColor = '#48b6b0',
  inactiveColor = '#ddd',
}) {
  const renderStep = (stepNumber) => {
    const isActive = stepNumber <= currentStep;
    const isCompleted = stepNumber < currentStep;
    
    return (
      <View key={stepNumber} style={styles.stepContainer}>
        <View style={[
          styles.stepCircle,
          {
            backgroundColor: isActive ? activeColor : inactiveColor,
            borderColor: isActive ? activeColor : inactiveColor,
          }
        ]}>
          {isCompleted ? (
            <Ionicons name="checkmark" size={16} color="white" />
          ) : (
            <Text style={[
              styles.stepNumber,
              { color: isActive ? 'white' : '#999' }
            ]}>
              {stepNumber}
            </Text>
          )}
        </View>
        
        {stepLabels[stepNumber - 1] && (
          <Text style={[
            styles.stepLabel,
            { color: isActive ? activeColor : '#999' }
          ]}>
            {stepLabels[stepNumber - 1]}
          </Text>
        )}
        
        {stepNumber < totalSteps && (
          <View style={[
            styles.stepConnector,
            { backgroundColor: stepNumber < currentStep ? activeColor : inactiveColor }
          ]} />
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.progressBar}>
        {Array.from({ length: totalSteps }, (_, index) => renderStep(index + 1))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 20,
    paddingHorizontal: 16,
  },
  progressBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepContainer: {
    alignItems: 'center',
    flex: 1,
    position: 'relative',
  },
  stepCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'white',
  },
  stepNumber: {
    fontSize: 14,
    fontWeight: '600',
  },
  stepLabel: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 8,
    textAlign: 'center',
    maxWidth: 80,
  },
  stepConnector: {
    position: 'absolute',
    top: 15,
    left: '50%',
    right: '-50%',
    height: 2,
    zIndex: -1,
  },
});