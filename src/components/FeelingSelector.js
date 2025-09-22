import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import ParentFeelingService from '../services/ParentFeelingService';

/**
 * FeelingSelector Component
 * 
 * Displays three color-coded feeling categories for parents to track their emotional state.
 * Uses red/yellow/green color system for negative/positive/neutral feelings.
 * Integrates with ParentFeelingService to record selections with visual feedback.
 */
const FeelingSelector = ({ onFeelingSelected, selectedFeeling, disabled }) => {
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [isRecording, setIsRecording] = useState(false);

  // Enhanced 3-category feeling structure with color-coded design
  const feelingCategories = [
    {
      category: 'negative',
      color: '#FF6B6B', // Red
      selectedColor: '#E53E3E',
      feelings: ['Angry', 'Sad'],
      icon: 'sad-outline',
      accessibilityLabel: 'Select negative feelings category'
    },
    {
      category: 'neutral',
      color: '#6BCF7F', // Green  
      selectedColor: '#48BB78',
      feelings: ['Neutral', 'Calm'],
      icon: 'remove-circle-outline',
      accessibilityLabel: 'Select neutral feelings category'
    },
    {
      category: 'positive', 
      color: '#FFD93D', // Yellow
      selectedColor: '#F6D55C',
      feelings: ['Happy', 'Excited'],
      icon: 'happy-outline',
      accessibilityLabel: 'Select positive feelings category'
    },
    
  ];

  /**
   * Handle category selection with enhanced error handling and validation
   */
  const handleCategoryPress = async (category) => {
    if (isRecording || disabled) return; // Prevent multiple rapid taps or disabled state

    try {
      // Validate category object
      if (!category || typeof category !== 'object' || !category.category) {
        console.error('Invalid category object:', category);
        Alert.alert(
          'Error',
          'Invalid feeling category selection. Please try again.',
          [{ text: 'OK' }]
        );
        return;
      }

      setIsRecording(true);
      setSelectedCategory(category.category);

      // Select a representative feeling from the category for storage
      const representativeFeeling = category.feelings[0];

      // Add timeout to prevent hanging
      const recordingPromise = ParentFeelingService.recordFeelingWithCategory(
        representativeFeeling, 
        category.category,
        category.color
      );
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Recording timeout')), 10000)
      );

      const success = await Promise.race([recordingPromise, timeoutPromise]);

      if (success) {
        // Provide visual feedback for successful recording
        const feedbackTimeout = setTimeout(() => {
          setSelectedCategory(null);
          setIsRecording(false);
        }, 0);

        // Notify parent component if callback provided
        try {
          if (onFeelingSelected && typeof onFeelingSelected === 'function') {
            onFeelingSelected(representativeFeeling, category.category);
          }
        } catch (callbackError) {
          console.error('Error in onFeelingSelected callback:', callbackError);
          // Don't show error to user for callback issues
        }

        // Cleanup timeout if component unmounts
        return () => clearTimeout(feedbackTimeout);
      } else {
        // Handle recording failure
        setSelectedCategory(null);
        setIsRecording(false);
        Alert.alert(
          'Recording Failed',
          'Unable to record your feeling. This might be due to storage issues. Please try again or restart the app.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Try Again', onPress: () => handleCategoryPress(category) }
          ]
        );
      }
    } catch (error) {
      console.error('Error handling category selection:', error);
      setSelectedCategory(null);
      setIsRecording(false);
      
      let errorMessage = 'An unexpected error occurred. ';
      
      if (error.message === 'Recording timeout') {
        errorMessage += 'The recording is taking too long. Please check your device storage and try again.';
      } else if (error.message?.includes('storage')) {
        errorMessage += 'There may be an issue with app storage. Try restarting the app.';
      } else {
        errorMessage += 'Please try again or restart the app if the problem persists.';
      }
      
      Alert.alert(
        'Error',
        errorMessage,
        [{ text: 'OK' }]
      );
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>How are you feeling today?</Text>
      <View style={styles.categoriesGrid}>
        {feelingCategories.map((category) => {
          const isSelected = selectedCategory === category.category || 
                           (selectedFeeling && category.feelings.includes(selectedFeeling));
          const buttonStyle = [
            styles.categoryButton,
            {
              backgroundColor: isSelected ? category.selectedColor : category.color,
              transform: [{ scale: isSelected ? 1.05 : 1 }],
              opacity: disabled ? 0.6 : 1,
            }
          ];

          return (
            <TouchableOpacity
              key={category.category}
              style={buttonStyle}
              onPress={() => handleCategoryPress(category)}
              disabled={isRecording || disabled}
              accessible={true}
              accessibilityLabel={category.accessibilityLabel}
              accessibilityRole="button"
              accessibilityHint={`Records ${category.category} feelings category. Includes: ${category.feelings.join(', ')}`}
              activeOpacity={0.7}
            >
              <Ionicons
                name={category.icon}
                size={40}
                color="white"
                style={styles.categoryIcon}
              />
              <Text style={styles.categoryLabel}>
                {category.category.charAt(0).toUpperCase() + category.category.slice(1)}
              </Text>
              <Text style={styles.feelingsSubtext}>
                {category.feelings.join(' • ')}
              </Text>
              {/* {isSelected && (
                <View style={styles.selectedIndicator}>
                  <Ionicons name="checkmark-circle" size={24} color="white" />
                </View>
              )} */}
            </TouchableOpacity>
          );
        })}
      </View>
      {/* {selectedCategory && (
        <Text style={styles.feedbackText}>
          Feeling category recorded: {selectedCategory.charAt(0).toUpperCase() + selectedCategory.slice(1)}
        </Text>
      )} */}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 5,
    paddingVertical: 10,
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    marginHorizontal: 5,
    marginVertical: 10,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#2C3E50',
    textAlign: 'center',
    marginBottom: 20,
  },
  categoriesGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    width: '100%',
    marginBottom: 10,
  },
  categoryButton: {
    width: 110,
    height: 120,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.3,
    shadowRadius: 4.65,
    position: 'relative',
    minWidth: 44, // Ensure minimum touch target size for accessibility
    minHeight: 44,
    paddingHorizontal: 8,
    paddingVertical: 12,
  },
  categoryIcon: {
    marginBottom: 8,
  },
  categoryLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: 'white',
    textAlign: 'center',
    marginBottom: 4,
  },
  feelingsSubtext: {
    fontSize: 12,
    fontWeight: '400',
    color: 'rgba(255, 255, 255, 0.9)',
    textAlign: 'center',
    lineHeight: 12,
  },
  selectedIndicator: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 16,
    padding: 4,
  },
  feedbackText: {
    fontSize: 14,
    color: '#27AE60',
    textAlign: 'center',
    marginTop: 12,
    fontWeight: '500',
  },
});

export default FeelingSelector;