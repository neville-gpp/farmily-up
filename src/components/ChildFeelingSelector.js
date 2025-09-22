import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Base64Image from './Base64Image';

export default function ChildFeelingSelector({
  selectedChildren = [],
  childrenFeelings = {},
  onFeelingChange,
}) {
  // Feeling options configuration
  const feelingOptions = [
    {
      id: 'Exciting',
      name: 'Exciting',
      emoji: '🤩',
      color: '#FFD700', // Gold
      backgroundColor: '#FFF9C4',
      borderColor: '#FFD700',
    },
    {
      id: 'Happy',
      name: 'Happy',
      emoji: '😊',
      color: '#4CAF50', // Green
      backgroundColor: '#E8F5E8',
      borderColor: '#4CAF50',
    },
    {
      id: 'Sad',
      name: 'Sad',
      emoji: '😢',
      color: '#2196F3', // Blue
      backgroundColor: '#E3F2FD',
      borderColor: '#2196F3',
    },
  ];

  const getChildDisplayName = (child) => {
    return child.nickname || child.firstName || child.name;
  };

  const getGenderEmoji = (gender) => {
    return gender === 'girl' ? '👧' : '👦';
  };

  const handleFeelingSelect = (childId, feeling) => {
    if (onFeelingChange) {
      onFeelingChange(childId, feeling);
    }
  };

  const getSelectedFeeling = (childId) => {
    return childrenFeelings[childId] || null;
  };

  if (selectedChildren.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>How did each child feel?</Text>
      <Text style={styles.sectionSubtitle}>
        Select the emotion that best describes how each child felt during this activity
      </Text>

      {selectedChildren.map((child) => {
        const selectedFeeling = getSelectedFeeling(child.id);
        
        return (
          <View key={child.id} style={styles.childFeelingContainer}>
            {/* Child Header */}
            <View style={styles.childHeader}>
              <View style={styles.childInfo}>
                {child.photo ? (
                  <Base64Image
                    source={{ uri: child.photo }}
                    style={[
                      styles.childPhoto,
                      { borderColor: child.favourColor || '#48b6b0' }
                    ]}
                  />
                ) : (
                  <View style={[
                    styles.childAvatarContainer,
                    { borderColor: child.favourColor || '#48b6b0' }
                  ]}>
                    <Text style={styles.childAvatar}>
                      {child.emoji || getGenderEmoji(child.gender)}
                    </Text>
                  </View>
                )}
                <Text style={styles.childName}>
                  {getChildDisplayName(child)}
                </Text>
              </View>
              
              {/* Selected Feeling Indicator */}
              {selectedFeeling && (
                <View style={styles.selectedFeelingIndicator}>
                  <Text style={styles.selectedFeelingEmoji}>
                    {feelingOptions.find(f => f.id === selectedFeeling)?.emoji}
                  </Text>
                  <Text style={styles.selectedFeelingText}>
                    {selectedFeeling}
                  </Text>
                </View>
              )}
            </View>

            {/* Feeling Options */}
            <View style={styles.feelingOptions}>
              {feelingOptions.map((feeling) => {
                const isSelected = selectedFeeling === feeling.id;
                
                return (
                  <TouchableOpacity
                    key={feeling.id}
                    style={[
                      styles.feelingOption,
                      isSelected && styles.selectedFeelingOption,
                      isSelected && {
                        backgroundColor: feeling.backgroundColor,
                        borderColor: feeling.borderColor,
                      }
                    ]}
                    onPress={() => handleFeelingSelect(child.id, feeling.id)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.feelingEmoji}>{feeling.emoji}</Text>
                    <Text style={[
                      styles.feelingName,
                      isSelected && { color: feeling.color, fontWeight: '600' }
                    ]}>
                      {feeling.name}
                    </Text>
                    
                    {isSelected && (
                      <View style={[
                        styles.selectedCheckmark,
                        { backgroundColor: feeling.color }
                      ]}>
                        <Ionicons name="checkmark" size={12} color="white" />
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        );
      })}

      {/* Summary */}
      <View style={styles.summary}>
        <Text style={styles.summaryTitle}>Feeling Summary</Text>
        {selectedChildren.map((child) => {
          const feeling = getSelectedFeeling(child.id);
          const feelingConfig = feelingOptions.find(f => f.id === feeling);
          
          return (
            <View key={child.id} style={styles.summaryRow}>
              <Text style={styles.summaryChildName}>
                {getChildDisplayName(child)}:
              </Text>
              {feeling && feelingConfig ? (
                <View style={styles.summaryFeeling}>
                  <Text style={styles.summaryFeelingEmoji}>
                    {feelingConfig.emoji}
                  </Text>
                  <Text style={[
                    styles.summaryFeelingText,
                    { color: feelingConfig.color }
                  ]}>
                    {feeling}
                  </Text>
                </View>
              ) : (
                <Text style={styles.summaryNoFeeling}>Not selected</Text>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'white',
    marginVertical: 8,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 20,
    lineHeight: 20,
  },
  
  // Child Container Styles
  childFeelingContainer: {
    marginBottom: 24,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  childHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  childInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  childPhoto: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    marginRight: 12,
  },
  childAvatarContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f9f9f9',
    marginRight: 12,
  },
  childAvatar: {
    fontSize: 20,
  },
  childName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  
  // Selected Feeling Indicator
  selectedFeelingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  selectedFeelingEmoji: {
    fontSize: 16,
    marginRight: 6,
  },
  selectedFeelingText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
  },
  
  // Feeling Options
  feelingOptions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  feelingOption: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 8,
    marginHorizontal: 4,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#e0e0e0',
    backgroundColor: '#f9f9f9',
    position: 'relative',
  },
  selectedFeelingOption: {
    borderWidth: 3,
    transform: [{ scale: 1.02 }],
  },
  feelingEmoji: {
    fontSize: 32,
    marginBottom: 8,
  },
  feelingName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666',
    textAlign: 'center',
  },
  selectedCheckmark: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  
  // Summary Styles
  summary: {
    marginTop: 8,
    padding: 16,
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  summaryChildName: {
    fontSize: 14,
    color: '#666',
    flex: 1,
  },
  summaryFeeling: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  summaryFeelingEmoji: {
    fontSize: 16,
    marginRight: 6,
  },
  summaryFeelingText: {
    fontSize: 14,
    fontWeight: '600',
  },
  summaryNoFeeling: {
    fontSize: 14,
    color: '#999',
    fontStyle: 'italic',
  },
});