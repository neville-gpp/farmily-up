import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Platform,
  Alert,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';

export default function DateTimePickerModal({
  visible,
  mode = 'datetime',
  value,
  onConfirm,
  onCancel,
  minimumDate,
  maximumDate,
  title = 'Select Date & Time',
  confirmText = 'OK',
  cancelText = 'Cancel',
  // Legacy support for existing usage
  onClose,
  initialValue,
}) {
  // Support both new and legacy prop names
  const initialDate = value || initialValue || new Date();
  const handleCancel = onCancel || onClose;
  
  const [selectedDate, setSelectedDate] = useState(initialDate);

  // Update selectedDate when value prop changes
  useEffect(() => {
    if (value && value !== selectedDate) {
      setSelectedDate(value);
    }
  }, [value]);

  // Validation helper function
  const validateDate = useCallback((date) => {
    if (!date || isNaN(date.getTime())) {
      return { isValid: false, error: 'Invalid date selected' };
    }
    
    if (minimumDate && date < minimumDate) {
      return { 
        isValid: false, 
        error: `Date must be after ${minimumDate.toLocaleDateString()}` 
      };
    }
    
    if (maximumDate && date > maximumDate) {
      return { 
        isValid: false, 
        error: `Date must be before ${maximumDate.toLocaleDateString()}` 
      };
    }
    
    return { isValid: true };
  }, [minimumDate, maximumDate]);

  const handleDateChange = useCallback((event, date) => {
    if (Platform.OS === 'android') {
      // On Android, the picker closes automatically
      if (event.type === 'set' && date) {
        const validation = validateDate(date);
        if (validation.isValid) {
          setSelectedDate(date);
          onConfirm(date);
        } else {
          // Show validation error on Android
          Alert.alert('Invalid Date', validation.error);
        }
      } else if (event.type === 'dismissed') {
        handleCancel();
      }
    } else {
      // On iOS, update the selected date
      if (date) {
        const validation = validateDate(date);
        if (validation.isValid) {
          setSelectedDate(date);
        }
        // On iOS, we don't show alerts during picker interaction
        // as it would be too disruptive
      }
    }
  }, [onConfirm, handleCancel, validateDate]);

  const handleConfirm = useCallback(() => {
    // Final validation before confirming
    const validation = validateDate(selectedDate);
    if (!validation.isValid) {
      Alert.alert('Invalid Date', validation.error);
      return;
    }
    onConfirm(selectedDate);
  }, [onConfirm, selectedDate, validateDate]);

  const handleCancelAction = useCallback(() => {
    setSelectedDate(initialDate);
    handleCancel();
  }, [initialDate, handleCancel]);

  const formatDateTime = useMemo(() => {
    try {
      const options = {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      };

      // Add time formatting based on mode
      if (mode === 'time') {
        return selectedDate.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true
        });
      } else if (mode === 'datetime') {
        return selectedDate.toLocaleDateString('en-US', {
          ...options,
          hour: 'numeric',
          minute: '2-digit',
          hour12: true
        });
      } else {
        // date mode
        return selectedDate.toLocaleDateString('en-US', options);
      }
    } catch (error) {
      console.error('Error formatting date:', error);
      return 'Invalid Date';
    }
  }, [selectedDate, mode]);

  // Get appropriate title based on mode if not provided
  const modalTitle = useMemo(() => {
    if (title !== 'Select Date & Time') {
      return title; // Use custom title
    }
    
    switch (mode) {
      case 'date':
        return 'Select Date';
      case 'time':
        return 'Select Time';
      case 'datetime':
      default:
        return 'Select Date & Time';
    }
  }, [title, mode]);

  // On Android, the picker is handled by the system
  if (Platform.OS === 'android' && visible) {
    return (
      <DateTimePicker
        value={selectedDate}
        mode={mode}
        display="default"
        onChange={handleDateChange}
        minimumDate={minimumDate}
        maximumDate={maximumDate}
      />
    );
  }

  // Don't render anything if not visible
  if (!visible) {
    return null;
  }

  // On iOS, show custom modal with picker
  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={handleCancelAction}
    >
      <View style={styles.overlay}>
        <View style={styles.modalContainer}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity 
              onPress={handleCancelAction} 
              style={styles.cancelButton}
              accessible={true}
              accessibilityRole="button"
              accessibilityLabel="Cancel date selection"
            >
              <Text style={styles.cancelButtonText}>{cancelText}</Text>
            </TouchableOpacity>
            
            <Text style={styles.title}>{modalTitle}</Text>
            
            <TouchableOpacity 
              onPress={handleConfirm} 
              style={styles.confirmButton}
              accessible={true}
              accessibilityRole="button"
              accessibilityLabel="Confirm selected date and time"
            >
              <Text style={styles.confirmButtonText}>{confirmText}</Text>
            </TouchableOpacity>
          </View>

          {/* Selected Date Display */}
          <View style={styles.selectedDateContainer}>
            <Ionicons 
              name={mode === 'time' ? 'time-outline' : 'calendar-outline'} 
              size={24} 
              color="#48b6b0" 
            />
            <Text style={styles.selectedDateText}>
              {formatDateTime}
            </Text>
          </View>

          {/* Date Time Picker */}
          <View style={styles.pickerContainer}>
            <DateTimePicker
              value={selectedDate}
              mode={mode}
              display="spinner"
              onChange={handleDateChange}
              style={styles.picker}
              textColor="#000"
              minimumDate={minimumDate}
              maximumDate={maximumDate}
            />
          </View>

          {/* Action Buttons */}
          <View style={styles.buttonRow}>
            <TouchableOpacity 
              style={styles.actionButton} 
              onPress={handleCancelAction}
            >
              <Ionicons name="close-outline" size={20} color="#666" />
              <Text style={styles.actionButtonText}>{cancelText}</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.actionButton, styles.confirmActionButton]} 
              onPress={handleConfirm}
            >
              <Ionicons name="checkmark-outline" size={20} color="white" />
              <Text style={[styles.actionButtonText, styles.confirmActionButtonText]}>
                {confirmText}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContainer: {
    backgroundColor: 'white',
    borderRadius: 16,
    width: '100%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
    flex: 1,
  },
  cancelButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  cancelButtonText: {
    fontSize: 16,
    color: '#666',
  },
  confirmButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  confirmButtonText: {
    fontSize: 16,
    color: '#48b6b0',
    fontWeight: '600',
  },
  selectedDateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    backgroundColor: '#f8f9fa',
    marginHorizontal: 20,
    marginTop: 16,
    borderRadius: 12,
    gap: 12,
  },
  selectedDateText: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
    textAlign: 'center',
  },
  pickerContainer: {
    alignItems: 'center',
    paddingVertical: 20,
    paddingHorizontal: 20,
  },
  picker: {
    width: '100%',
    height: 200,
  },
  buttonRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingBottom: 20,
    gap: 12,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: '#f5f5f5',
    gap: 8,
  },
  confirmActionButton: {
    backgroundColor: '#48b6b0',
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },
  confirmActionButtonText: {
    color: 'white',
  },
});