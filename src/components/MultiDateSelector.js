import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePickerModal from './DateTimePickerModal';

export default function MultiDateSelector({
  selectedDates = [],
  onDatesChange,
  maxDates = 10,
  minDate,
  maxDate,
  disabled = false,
}) {
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [pickerDate, setPickerDate] = useState(new Date());

  useEffect(() => {
    // Set initial picker date to today or first selected date
    if (selectedDates.length > 0) {
      setPickerDate(new Date(selectedDates[0]));
    } else {
      setPickerDate(new Date());
    }
  }, [selectedDates]);

  const formatDate = (date) => {
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatShortDate = (date) => {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  const isDateSelected = (date) => {
    return selectedDates.some(
      (selectedDate) =>
        selectedDate.toDateString() === date.toDateString()
    );
  };

  const handleDateConfirm = (selectedDate) => {
    try {
      if (!selectedDate || isNaN(selectedDate.getTime())) {
        Alert.alert('Invalid Date', 'Please select a valid date.');
        return;
      }

      // Check if date is already selected
      if (isDateSelected(selectedDate)) {
        Alert.alert(
          'Date Already Selected',
          'This date has already been selected. Please choose a different date.'
        );
        return;
      }

      // Check maximum dates limit
      if (selectedDates.length >= maxDates) {
        Alert.alert(
          'Maximum Dates Reached',
          `You can select up to ${maxDates} dates for a multi-date event.`
        );
        return;
      }

      // Add the new date and sort the array
      const newDates = [...selectedDates, selectedDate].sort(
        (a, b) => a.getTime() - b.getTime()
      );

      onDatesChange(newDates);
      setShowDatePicker(false);
    } catch (error) {
      console.error('Error adding date:', error);
      Alert.alert('Error', 'Failed to add date. Please try again.');
    }
  };

  const handleRemoveDate = (dateToRemove) => {
    try {
      const newDates = selectedDates.filter(
        (date) => date.toDateString() !== dateToRemove.toDateString()
      );
      onDatesChange(newDates);
    } catch (error) {
      console.error('Error removing date:', error);
      Alert.alert('Error', 'Failed to remove date. Please try again.');
    }
  };

  const handleClearAllDates = () => {
    Alert.alert(
      'Clear All Dates',
      'Are you sure you want to remove all selected dates?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: () => onDatesChange([]),
        },
      ]
    );
  };

  const validateDateSelection = () => {
    const errors = [];

    if (selectedDates.length === 0) {
      errors.push('Please select at least one date');
    }

    if (selectedDates.length > maxDates) {
      errors.push(`Cannot select more than ${maxDates} dates`);
    }

    // Check for invalid dates
    const invalidDates = selectedDates.filter(
      (date) => !date || isNaN(date.getTime())
    );
    if (invalidDates.length > 0) {
      errors.push('Some selected dates are invalid');
    }

    // Check date range constraints
    if (minDate || maxDate) {
      const outOfRangeDates = selectedDates.filter((date) => {
        if (minDate && date < minDate) return true;
        if (maxDate && date > maxDate) return true;
        return false;
      });
      if (outOfRangeDates.length > 0) {
        errors.push('Some dates are outside the allowed range');
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  };

  const getDateRangeText = () => {
    if (selectedDates.length === 0) {
      return 'No dates selected';
    }

    if (selectedDates.length === 1) {
      return formatDate(selectedDates[0]);
    }

    const sortedDates = [...selectedDates].sort(
      (a, b) => a.getTime() - b.getTime()
    );
    const firstDate = sortedDates[0];
    const lastDate = sortedDates[sortedDates.length - 1];

    return `${formatShortDate(firstDate)} - ${formatShortDate(lastDate)} (${selectedDates.length} dates)`;
  };

  return (
    <View style={styles.container}>
      {/* Header with date range summary */}
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <Ionicons name="calendar-outline" size={20} color="#48b6b0" />
          <View style={styles.headerText}>
            <Text style={styles.headerTitle}>Multiple Dates</Text>
            <Text style={styles.headerSubtitle}>{getDateRangeText()}</Text>
          </View>
        </View>
        {selectedDates.length > 0 && (
          <TouchableOpacity
            onPress={handleClearAllDates}
            style={styles.clearButton}
            disabled={disabled}
          >
            <Text style={styles.clearButtonText}>Clear All</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Selected dates list */}
      {selectedDates.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.selectedDatesContainer}
          contentContainerStyle={styles.selectedDatesContent}
        >
          {selectedDates
            .sort((a, b) => a.getTime() - b.getTime())
            .map((date, index) => (
              <View key={date.toISOString()} style={styles.selectedDateChip}>
                <Text style={styles.selectedDateText}>
                  {formatShortDate(date)}
                </Text>
                <TouchableOpacity
                  onPress={() => handleRemoveDate(date)}
                  style={styles.removeButton}
                  disabled={disabled}
                  accessible={true}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${formatDate(date)}`}
                  accessibilityHint="Tap to remove this date from selection"
                >
                  <Ionicons name="close-circle" size={18} color="#666" />
                </TouchableOpacity>
              </View>
            ))}
        </ScrollView>
      )}

      {/* Add date button */}
      <TouchableOpacity
        style={[
          styles.addDateButton,
          disabled && styles.disabledButton,
          selectedDates.length >= maxDates && styles.disabledButton,
        ]}
        onPress={() => setShowDatePicker(true)}
        disabled={disabled || selectedDates.length >= maxDates}
        accessible={true}
        accessibilityRole="button"
        accessibilityLabel="Add date"
        accessibilityHint="Tap to add another date to the selection"
      >
        <Ionicons
          name="add-circle-outline"
          size={20}
          color={
            disabled || selectedDates.length >= maxDates ? '#ccc' : '#48b6b0'
          }
        />
        <Text
          style={[
            styles.addDateButtonText,
            (disabled || selectedDates.length >= maxDates) &&
              styles.disabledButtonText,
          ]}
        >
          Add Date
        </Text>
        {selectedDates.length >= maxDates && (
          <Text style={styles.limitText}>({maxDates} max)</Text>
        )}
      </TouchableOpacity>

      {/* Validation info */}
      {selectedDates.length > 0 && (
        <View style={styles.infoContainer}>
          <Ionicons name="information-circle-outline" size={16} color="#666" />
          <Text style={styles.infoText}>
            {selectedDates.length} date{selectedDates.length !== 1 ? 's' : ''} selected
            {maxDates && ` (${maxDates} max)`}
          </Text>
        </View>
      )}

      {/* Date picker modal */}
      <DateTimePickerModal
        visible={showDatePicker}
        onCancel={() => setShowDatePicker(false)}
        onConfirm={handleDateConfirm}
        value={pickerDate}
        mode="date"
        title="Select Date"
        confirmText="Add Date"
        cancelText="Cancel"
        minimumDate={minDate}
        maximumDate={maxDate}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    padding: 16,
    marginVertical: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  headerText: {
    marginLeft: 12,
    flex: 1,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  clearButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  clearButtonText: {
    fontSize: 14,
    color: '#ff3b30',
    fontWeight: '500',
  },
  selectedDatesContainer: {
    marginBottom: 12,
  },
  selectedDatesContent: {
    paddingRight: 16,
  },
  selectedDateChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#48b6b0',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  selectedDateText: {
    fontSize: 14,
    color: 'white',
    fontWeight: '500',
    marginRight: 6,
  },
  removeButton: {
    padding: 2,
  },
  addDateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'white',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 2,
    borderColor: '#48b6b0',
    borderStyle: 'dashed',
  },
  disabledButton: {
    borderColor: '#ccc',
    backgroundColor: '#f5f5f5',
  },
  addDateButtonText: {
    fontSize: 16,
    color: '#48b6b0',
    fontWeight: '500',
    marginLeft: 8,
  },
  disabledButtonText: {
    color: '#ccc',
  },
  limitText: {
    fontSize: 12,
    color: '#666',
    marginLeft: 4,
  },
  infoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  infoText: {
    fontSize: 12,
    color: '#666',
    marginLeft: 6,
  },
});