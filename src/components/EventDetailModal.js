import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Alert,
  Platform,
  TextInput,
  Switch,
  Image,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePickerModal from './DateTimePickerModal';
import MultiDateSelector from './MultiDateSelector';
import CalendarEventsService from '../services/CalendarEventsService';
import ChildrenDataService from '../services/ChildrenDataService';
import Base64Image from './Base64Image';

export default function EventDetailModal({
  visible,
  onClose,
  onEventDeleted,
  onEventUpdated,
  event,
}) {
  const [children, setChildren] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [currentEvent, setCurrentEvent] = useState(null);

  // Edit form state - matching AddEventModal structure
  const [title, setTitle] = useState('');
  const [eventType, setEventType] = useState('Personal');
  const [isAllDay, setIsAllDay] = useState(false);
  const [startDate, setStartDate] = useState(new Date());
  const [endDate, setEndDate] = useState(new Date());
  const [startTime, setStartTime] = useState(new Date());
  const [endTime, setEndTime] = useState(() => {
    const time = new Date();
    time.setHours(time.getHours() + 1);
    return time;
  });
  const [selectedChildren, setSelectedChildren] = useState([]);

  // Multi-date states (for future multi-date editing support)
  const [isMultiDate, setIsMultiDate] = useState(false);
  const [selectedMultiDates, setSelectedMultiDates] = useState([]);

  // Reminder states
  const [remindersEnabled, setRemindersEnabled] = useState(false);
  const [selectedReminders, setSelectedReminders] = useState([]);
  const [customReminderTime, setCustomReminderTime] = useState(15);
  const [customReminderUnit, setCustomReminderUnit] = useState('minutes');

  // Date picker visibility - using DateTimePickerModal
  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);
  const [showStartTimePicker, setShowStartTimePicker] = useState(false);
  const [showEndTimePicker, setShowEndTimePicker] = useState(false);

  useEffect(() => {
    if (visible && event) {
      loadChildren();
      setIsEditing(false);
      setCurrentEvent(event);
    } else if (!visible) {
      setIsEditing(false);
      setCurrentEvent(null);
    }
  }, [visible, event]);

  useEffect(() => {
    if (event && visible) {
      setCurrentEvent(event);
    }
  }, [event, visible]);

  useEffect(() => {
    if (visible && currentEvent && children.length > 0) {
      populateEventData();
    }
  }, [visible, currentEvent, children]);

  useEffect(() => {
    if (currentEvent && children.length > 0 && !isEditing) {
      populateEventData();
    }
  }, [currentEvent, children, isEditing]);

  const loadChildren = async () => {
    try {
      const storedChildren = await ChildrenDataService.getChildren();
      setChildren(storedChildren);
    } catch (error) {
      console.error('Error loading children:', error);
    }
  };

  const populateEventData = async () => {
    if (!currentEvent) return;

    // Check if this is a legacy event that needs migration
    let eventToUse = currentEvent;
    if (currentEvent.childId && (!currentEvent.children || currentEvent.children.length === 0)) {
      try {
        const migratedEvent = await CalendarEventsService.migrateEventToMultiChild(currentEvent.id, children);
        if (migratedEvent) {
          eventToUse = migratedEvent;
          setCurrentEvent(migratedEvent);
        }
      } catch (error) {
        console.warn('Failed to migrate legacy event:', error);
      }
    }

    setTitle(eventToUse.title);
    setEventType(eventToUse.eventType || 'Personal');
    setIsAllDay(eventToUse.isAllDay);

    if (eventToUse.isAllDay) {
      const [startYear, startMonth, startDay] = eventToUse.startDate.split('-').map(Number);
      const startDateObj = new Date(startYear, startMonth - 1, startDay);

      let endDateObj;
      if (eventToUse.endDate) {
        const [endYear, endMonth, endDay] = eventToUse.endDate.split('-').map(Number);
        endDateObj = new Date(endYear, endMonth - 1, endDay);
      } else {
        endDateObj = new Date(startYear, startMonth - 1, startDay);
      }

      setStartDate(startDateObj);
      setEndDate(endDateObj);
    } else {
      const startDateTime = new Date(eventToUse.startDateTime);
      const endDateTime = new Date(eventToUse.endDateTime);

      const startDateOnly = new Date(
        startDateTime.getFullYear(),
        startDateTime.getMonth(),
        startDateTime.getDate()
      );
      const endDateOnly = new Date(
        endDateTime.getFullYear(),
        endDateTime.getMonth(),
        endDateTime.getDate()
      );

      setStartDate(startDateOnly);
      setEndDate(endDateOnly);
      setStartTime(startDateTime);
      setEndTime(endDateTime);
    }

    // Handle both multi-child and legacy single-child events
    const eventChildren = CalendarEventsService.getEventChildren(eventToUse);
    
    if (eventChildren.length > 0) {
      const childrenWithFullData = eventChildren.map(eventChild => {
        const fullChildData = children.find(c => c.id === eventChild.id);
        if (fullChildData) {
          // Use the full child data from the children list
          return {
            ...fullChildData,
            // Ensure we have the name field for validation
            name: fullChildData.nickname || fullChildData.firstName || fullChildData.name || eventChild.name,
            color: fullChildData.favourColor || fullChildData.color || eventChild.color || '#48b6b0'
          };
        } else {
          // Create a fallback child object with all necessary fields
          return {
            id: eventChild.id,
            name: eventChild.name || 'Unknown',
            nickname: eventChild.name || 'Unknown',
            firstName: eventChild.name || 'Unknown',
            favourColor: eventChild.color || '#48b6b0',
            color: eventChild.color || '#48b6b0'
          };
        }
      });
      
      setSelectedChildren(childrenWithFullData);
    } else {
      const child = children.find((c) => c.id === eventToUse.childId);
      if (child) {
        // Ensure the child object has all necessary fields
        const normalizedChild = {
          ...child,
          name: child.nickname || child.firstName || child.name || 'Unknown',
          color: child.favourColor || child.color || '#48b6b0'
        };
        setSelectedChildren([normalizedChild]);
      } else {
        setSelectedChildren([]);
      }
    }

    // Populate reminder data
    setRemindersEnabled(eventToUse.remindersEnabled || false);
    const reminders = eventToUse.reminders || [];
    setSelectedReminders(reminders);

    // Parse custom reminders to set custom reminder time and unit
    const customReminder = reminders.find((reminder) =>
      reminder.startsWith('custom_')
    );
    if (customReminder) {
      const parts = customReminder.split('_');
      if (parts.length === 3) {
        const time = parseInt(parts[1]);
        const unit = parts[2];
        if (!isNaN(time) && time > 0) {
          setCustomReminderTime(time);
          setCustomReminderUnit(unit);
        }
      }
    }

    // Set multi-date state (for future support)
    setIsMultiDate(eventToUse.isMultiDate || false);
    setSelectedMultiDates(eventToUse.selectedMultiDates || []);
  };

  const toggleChildSelection = (child) => {
    setSelectedChildren(prev => {
      const isSelected = prev.some(c => c.id === child.id);
      if (isSelected) {
        return prev.filter(c => c.id !== child.id);
      } else {
        // Ensure we create a properly structured child object with all necessary fields
        const childName = child.nickname || child.firstName || child.name || 'Unknown';
        return [...prev, {
          id: child.id,
          name: childName,
          nickname: child.nickname,
          firstName: child.firstName,
          favourColor: child.favourColor || child.color || '#48b6b0',
          color: child.favourColor || child.color || '#48b6b0'
        }];
      }
    });
  };

  const getGenderEmoji = (gender) => {
    return gender === 'girl' ? '👧' : '👦';
  };

  const getChildDisplayName = (child) => {
    return child.nickname || child.firstName;
  };

  const getEventTypeIcon = (eventType) => {
    switch (eventType) {
      case 'Birthday':
        return 'gift';
      case 'Holiday':
        return 'sunny';
      case 'Anniversary':
        return 'heart';
      case 'Personal':
      default:
        return 'calendar';
    }
  };

  const validateEventData = () => {
    const errors = [];

    // Title validation
    if (!title.trim()) {
      errors.push('Please enter an event title');
    } else if (title.trim().length < 2) {
      errors.push('Event title must be at least 2 characters long');
    } else if (title.trim().length > 100) {
      errors.push('Event title cannot exceed 100 characters');
    }

    // Multi-child selection validation
    if (selectedChildren.length === 0) {
      errors.push('Please select at least one child for this event');
    } else if (selectedChildren.length > 10) {
      errors.push('Cannot select more than 10 children for a single event');
    }

    // Validate selected children data integrity
    const invalidChildren = selectedChildren.filter(child => {
      if (!child || typeof child !== 'object') return true;
      if (!child.id || typeof child.id !== 'string') return true;
      
      // Check for at least one valid name field
      const hasValidName = (child.name && typeof child.name === 'string') ||
                          (child.nickname && typeof child.nickname === 'string') ||
                          (child.firstName && typeof child.firstName === 'string');
      
      return !hasValidName;
    });
    
    if (invalidChildren.length > 0) {
      console.warn('Invalid children found:', invalidChildren);
      console.warn('All selected children:', selectedChildren);
      errors.push('Some selected children have invalid data. Please reselect children.');
    }

    // Date and time validation
    if (!isAllDay) {
      try {
        // Create combined date-time objects for accurate comparison
        const startDateTime = new Date(startDate);
        startDateTime.setHours(startTime.getHours(), startTime.getMinutes(), 0, 0);
        
        const endDateTime = new Date(endDate);
        endDateTime.setHours(endTime.getHours(), endTime.getMinutes(), 0, 0);

        // Validate date-time objects
        if (isNaN(startDateTime.getTime()) || isNaN(endDateTime.getTime())) {
          errors.push('Invalid date or time selected. Please check your selections.');
        } else {
          // Time validation with detailed error messages
          if (startDateTime >= endDateTime) {
            const timeDiff = (endDateTime.getTime() - startDateTime.getTime()) / (1000 * 60); // minutes
            if (timeDiff === 0) {
              errors.push('End time must be different from start time');
            } else if (timeDiff < 0) {
              errors.push('End time must be after start time');
            }
          } else {
            // Minimum duration validation (15 minutes)
            const durationMinutes = (endDateTime.getTime() - startDateTime.getTime()) / (1000 * 60);
            if (durationMinutes < 15) {
              errors.push('Event duration must be at least 15 minutes');
            }

            // Maximum duration validation (48 hours for multi-day events, 24 hours for same-day)
            // const maxHours = startDate.toDateString() === endDate.toDateString() ? 24 : 48;
            // if (durationMinutes > maxHours * 60) {
            //   errors.push(`Event duration cannot exceed ${maxHours} hours`);
            // }
          }
        }
      } catch (dateTimeError) {
        errors.push('Error validating date and time. Please check your selections.');
      }
    }

    // Date validation
    if (startDate > endDate) {
      errors.push('End date must be on or after start date');
    }

    // Future date validation for events more than 5 years in the future
    const fiveYearsFromNow = new Date();
    fiveYearsFromNow.setFullYear(fiveYearsFromNow.getFullYear() + 5);
    if (startDate > fiveYearsFromNow) {
      errors.push('Event date cannot be more than 5 years in the future');
    }

    // Event type validation
    const validEventTypes = ['Personal', 'Birthday', 'Holiday', 'Anniversary'];
    if (!validEventTypes.includes(eventType)) {
      errors.push('Please select a valid event type');
    }

    // Multi-date validation
    if (isMultiDate) {
      if (selectedMultiDates.length === 0) {
        errors.push('Please select at least one date for the multi-date event');
      } else if (selectedMultiDates.length === 1) {
        errors.push('Multi-date events must have at least 2 dates. Use single date for one-day events.');
      } else if (selectedMultiDates.length > 10) {
        errors.push('Multi-date events cannot have more than 10 dates');
      }

      // Validate each selected date
      const invalidMultiDates = selectedMultiDates.filter(
        (date) => !date || isNaN(date.getTime())
      );
      if (invalidMultiDates.length > 0) {
        errors.push('Some selected dates for multi-date event are invalid');
      }

      // Check for reasonable date range (not more than 1 year span)
      if (selectedMultiDates.length >= 2) {
        const sortedDates = [...selectedMultiDates].sort((a, b) => a.getTime() - b.getTime());
        const firstDate = sortedDates[0];
        const lastDate = sortedDates[sortedDates.length - 1];
        const daysDifference = (lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24);
        
        if (daysDifference > 365) {
          errors.push('Multi-date events cannot span more than 1 year');
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  };

  const handleSave = async () => {
    const validation = validateEventData();
    
    if (!validation.isValid) {
      const errorMessage = validation.errors.length === 1 
        ? validation.errors[0]
        : `Please fix the following issues:\n\n• ${validation.errors.join('\n• ')}`;
      
      Alert.alert('Validation Error', errorMessage);
      return;
    }

    try {
      setLoading(true);

      // Validate children data before processing
      const validatedChildren = selectedChildren.map(child => {
        if (!child || !child.id) {
          throw new Error(`Invalid child data - missing ID: ${JSON.stringify(child)}`);
        }
        
        // Get the best available name
        const childName = child.name || child.nickname || child.firstName || 'Unknown';
        if (!childName || typeof childName !== 'string') {
          throw new Error(`Invalid child data - missing name: ${JSON.stringify(child)}`);
        }
        
        return {
          id: child.id,
          name: childName.trim(),
          color: child.color || child.favourColor || '#48b6b0' // Provide fallback color
        };
      });

      // Auto-add current custom reminder if it's not already in the list
      let finalReminders = selectedReminders;
      if (remindersEnabled && customReminderTime > 0) {
        const customId = `custom_${customReminderTime}_${customReminderUnit}`;
        if (!selectedReminders.includes(customId)) {
          // Remove any existing custom reminders and add the current one
          const filteredReminders = selectedReminders.filter(
            (reminder) => !reminder.startsWith('custom_')
          );
          finalReminders = [...filteredReminders, customId];
        }
      }

      const eventData = {
        title: title.trim(),
        eventType,
        isAllDay,
        selectedChildren: validatedChildren,
        remindersEnabled,
        reminders: remindersEnabled ? finalReminders : [],
        isMultiDate,
        selectedMultiDates: isMultiDate ? selectedMultiDates : [],
      };

      if (isAllDay) {
        // For all-day events, format date as YYYY-MM-DD without timezone conversion
        const formatDateString = (date) => {
          try {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
          } catch (dateError) {
            throw new Error(`Invalid date format: ${date}`);
          }
        };

        eventData.startDate = formatDateString(startDate);
        eventData.endDate = formatDateString(endDate);
      } else {
        try {
          // Combine date and time with error handling
          const startDateTime = new Date(startDate);
          startDateTime.setHours(
            startTime.getHours(),
            startTime.getMinutes(),
            0,
            0
          );

          const endDateTime = new Date(endDate);
          endDateTime.setHours(endTime.getHours(), endTime.getMinutes(), 0, 0);

          // Validate the combined date-time
          if (isNaN(startDateTime.getTime()) || isNaN(endDateTime.getTime())) {
            throw new Error('Invalid date-time combination');
          }

          eventData.startDateTime = startDateTime.toISOString();
          eventData.endDateTime = endDateTime.toISOString();
        } catch (dateTimeError) {
          throw new Error(`Failed to create event date-time: ${dateTimeError.message}`);
        }
      }

      console.log('Updating event with ID:', currentEvent.id);
      console.log('Event data:', eventData);
      
      const updatedEvent = await CalendarEventsService.updateEvent(currentEvent.id, eventData);

      console.log('Update result:', updatedEvent);

      if (updatedEvent) {
        Alert.alert('Success', 'Event updated successfully');
        onEventUpdated && onEventUpdated(updatedEvent);
        setIsEditing(false);
        setCurrentEvent(updatedEvent);
      } else {
        console.error('UpdateEvent returned null/false');
        Alert.alert('Error', 'Failed to update event. Please try again.');
      }
    } catch (error) {
      console.error('Error updating event:', error);
      
      // Provide specific error messages based on error type
      let errorMessage = 'Failed to update event. Please try again.';
      
      if (error.message.includes('Invalid child data')) {
        errorMessage = 'There was an issue with the selected children. Please reselect and try again.';
      } else if (error.message.includes('Invalid date')) {
        errorMessage = 'There was an issue with the selected dates or times. Please check and try again.';
      } else if (error.message.includes('network') || error.message.includes('connection')) {
        errorMessage = 'Network error. Please check your connection and try again.';
      } else if (error.message.includes('storage') || error.message.includes('AsyncStorage')) {
        errorMessage = 'Storage error. Please ensure you have enough device storage and try again.';
      }
      
      Alert.alert('Error', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    Alert.alert(
      'Delete Event',
      'Are you sure you want to delete this event? This action cannot be undone.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setLoading(true);
              await CalendarEventsService.deleteEvent(currentEvent.id);
              Alert.alert('Success', 'Event deleted successfully');
              onEventDeleted && onEventDeleted(currentEvent.id);
              onClose();
            } catch (error) {
              console.error('Error deleting event:', error);
              Alert.alert('Error', 'Failed to delete event. Please try again.');
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  const formatDate = (date) => {
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatTime = (time) => {
    return time.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const handleStartDateConfirm = (selectedDate) => {
    try {
      if (!selectedDate || isNaN(selectedDate.getTime())) {
        Alert.alert('Invalid Date', 'Please select a valid start date.');
        return;
      }

      setStartDate(selectedDate);
      
      // If end date is before start date, update it to match start date
      if (endDate < selectedDate) {
        setEndDate(selectedDate);
      }
      
      setShowStartDatePicker(false);
    } catch (error) {
      console.error('Error setting start date:', error);
      Alert.alert('Error', 'Failed to set start date. Please try again.');
    }
  };

  const handleEndDateConfirm = (selectedDate) => {
    try {
      if (!selectedDate || isNaN(selectedDate.getTime())) {
        Alert.alert('Invalid Date', 'Please select a valid end date.');
        return;
      }

      // Validate that end date is not before start date
      if (selectedDate < startDate) {
        Alert.alert(
          'Invalid Date Range', 
          'End date cannot be before start date. Please select a date on or after the start date.'
        );
        return;
      }

      setEndDate(selectedDate);
      setShowEndDatePicker(false);
    } catch (error) {
      console.error('Error setting end date:', error);
      Alert.alert('Error', 'Failed to set end date. Please try again.');
    }
  };

  const handleStartTimeConfirm = (selectedTime) => {
    try {
      if (!selectedTime || isNaN(selectedTime.getTime())) {
        Alert.alert('Invalid Time', 'Please select a valid start time.');
        return;
      }

      setStartTime(selectedTime);
      
      // Auto-adjust end time to be 1 hour after start time if end time is now before or equal to start time
      if (selectedTime >= endTime) {
        const newEndTime = new Date(selectedTime);
        newEndTime.setHours(selectedTime.getHours() + 1);
        
        // Handle day overflow - if adding an hour crosses midnight, set end time to 11:59 PM same day
        if (newEndTime.getDate() !== selectedTime.getDate()) {
          newEndTime.setDate(selectedTime.getDate());
          newEndTime.setHours(23, 59, 0, 0);
        }
        
        setEndTime(newEndTime);
      }
      
      setShowStartTimePicker(false);
    } catch (error) {
      console.error('Error setting start time:', error);
      Alert.alert('Error', 'Failed to set start time. Please try again.');
    }
  };

  const handleEndTimeConfirm = (selectedTime) => {
    try {
      if (!selectedTime || isNaN(selectedTime.getTime())) {
        Alert.alert('Invalid Time', 'Please select a valid end time.');
        return;
      }

      // Create combined date-time objects for proper comparison
      const startDateTime = new Date(startDate);
      startDateTime.setHours(startTime.getHours(), startTime.getMinutes(), 0, 0);
      
      const endDateTime = new Date(endDate);
      endDateTime.setHours(selectedTime.getHours(), selectedTime.getMinutes(), 0, 0);

      // Validate that end date-time is after start date-time
      if (endDateTime <= startDateTime) {
        Alert.alert(
          'Invalid Time Range', 
          'End time must be after start time. Please select a later time or adjust the end date.'
        );
        return;
      }

      // Check for reasonable duration (not more than 24 hours for same-day events)
      // const durationHours = (endDateTime.getTime() - startDateTime.getTime()) / (1000 * 60 * 60);
      // if (startDate.toDateString() === endDate.toDateString() && durationHours > 24) {
      //   Alert.alert(
      //     'Duration Too Long', 
      //     'Same-day event duration cannot exceed 24 hours. Please select an earlier end time or use an all-day event.'
      //   );
      //   return;
      // }

      // Check for minimum duration (15 minutes)
      const durationMinutes = (endDateTime.getTime() - startDateTime.getTime()) / (1000 * 60);
      if (durationMinutes < 15) {
        Alert.alert(
          'Duration Too Short', 
          'Event duration must be at least 15 minutes. Please select a later end time.'
        );
        return;
      }

      setEndTime(selectedTime);
      setShowEndTimePicker(false);
    } catch (error) {
      console.error('Error setting end time:', error);
      Alert.alert('Error', 'Failed to set end time. Please try again.');
    }
  };

  // Reminder helper functions
  const getReminderOptions = () => [
    {
      id: 'at_time',
      label: 'At time of event',
      description: 'When the event starts',
    },
    {
      id: '5_min',
      label: '5 minutes before',
      description: '5 minutes before the event',
    },
    {
      id: '15_min',
      label: '15 minutes before',
      description: '15 minutes before the event',
    },
    {
      id: '30_min',
      label: '30 minutes before',
      description: '30 minutes before the event',
    },
    {
      id: '1_hour',
      label: '1 hour before',
      description: '1 hour before the event',
    },
    {
      id: '1_day',
      label: '1 day before',
      description: '24 hours before the event',
    },
  ];

  const toggleReminder = (reminderId) => {
    setSelectedReminders((prev) => {
      if (prev.includes(reminderId)) {
        return prev.filter((id) => id !== reminderId);
      } else {
        return [...prev, reminderId];
      }
    });
  };

  const addCustomReminder = () => {
    if (customReminderTime > 0) {
      const customId = `custom_${customReminderTime}_${customReminderUnit}`;

      // Check if this custom reminder already exists
      if (!selectedReminders.includes(customId)) {
        setSelectedReminders((prev) => {
          // Remove any existing custom reminders first
          const filteredReminders = prev.filter(
            (reminder) => !reminder.startsWith('custom_')
          );
          // Then add the new custom reminder
          return [...filteredReminders, customId];
        });
      }
    }
  };

  const getReminderDisplayText = (reminders) => {
    if (!reminders || reminders.length === 0) return 'No reminders set';

    const reminderOptions = getReminderOptions();
    const displayTexts = reminders.map((reminderId) => {
      const option = reminderOptions.find((opt) => opt.id === reminderId);
      if (option) {
        return option.label;
      } else if (reminderId.startsWith('custom_')) {
        // Parse custom reminder
        const parts = reminderId.replace('custom_', '').split('_');
        return `${parts[0]} ${parts[1]} before`;
      }
      return reminderId;
    });

    return displayTexts.join(', ');
  };

  if (!currentEvent) {
    return null;
  }

  return (
    <Modal
      visible={visible}
      animationType='slide'
      presentationStyle='pageSheet'
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.cancelButton}>
              {isEditing ? 'Cancel' : 'Close'}
            </Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>
            {isEditing ? 'Edit Event' : 'Event Details'}
          </Text>
          {isEditing ? (
            <TouchableOpacity onPress={handleSave} disabled={loading}>
              <Text style={[styles.saveButton, loading && styles.disabledButton]}>
                {loading ? 'Saving...' : 'Save'}
              </Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={() => setIsEditing(true)}>
              <Text style={styles.editButton}>Edit</Text>
            </TouchableOpacity>
          )}
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {isEditing ? (
            // Edit Mode - Same layout as AddEventModal
            <>
              {/* Child Selection */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Children</Text>
                <Text style={styles.sectionSubtitle}>Select one or more children for this event</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.childSelector}
                >
                  {children.map((child) => {
                    const isSelected = selectedChildren.some(c => c.id === child.id);
                    return (
                      <TouchableOpacity
                        key={child.id}
                        style={[
                          styles.childOption,
                          isSelected && styles.selectedChildOption,
                          { borderColor: child.favourColor || '#48b6b0' },
                        ]}
                        onPress={() => toggleChildSelection(child)}
                        activeOpacity={0.8}
                        accessible={true}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: isSelected }}
                        accessibilityLabel={`${getChildDisplayName(child)} ${isSelected ? 'selected' : 'not selected'}`}
                        accessibilityHint="Tap to toggle selection for this child"
                      >
                        {isSelected && (
                          <Animated.View 
                            style={[
                              styles.checkmarkContainer,
                              {
                                transform: [{ scale: isSelected ? 1 : 0 }],
                              }
                            ]}
                          >
                            <Ionicons name="checkmark-circle" size={20} color={child.favourColor || '#48b6b0'} />
                          </Animated.View>
                        )}
                        {child.photo ? (
                          <Animated.View
                            style={{
                              transform: [{ scale: isSelected ? 1.05 : 1 }],
                            }}
                          >
                            <Base64Image
                              source={{ uri: child.photo }}
                              style={styles.childPhoto}
                            />
                          </Animated.View>
                        ) : (
                          <Animated.View
                            style={{
                              transform: [{ scale: isSelected ? 1.05 : 1 }],
                            }}
                          >
                            <Text style={styles.childAvatar}>
                              {getGenderEmoji(child.gender)}
                            </Text>
                          </Animated.View>
                        )}
                        <Text
                          style={[
                            styles.childOptionText,
                            isSelected && styles.selectedChildOptionText,
                          ]}
                        >
                          {getChildDisplayName(child)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>

              {/* Title */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Event Title</Text>
                <TextInput
                  style={styles.textInput}
                  value={title}
                  onChangeText={setTitle}
                  placeholder='Enter event title'
                />
              </View>

              {/* Event Type */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Event Type</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.eventTypeSelector}
                >
                  {['Personal', 'Birthday', 'Holiday', 'Anniversary'].map(
                    (type) => (
                      <TouchableOpacity
                        key={type}
                        style={[
                          styles.eventTypeOption,
                          eventType === type && styles.selectedEventTypeOption,
                        ]}
                        onPress={() => setEventType(type)}
                      >
                        <Ionicons
                          name={getEventTypeIcon(type)}
                          size={20}
                          color={eventType === type ? '#48b6b0' : '#666'}
                          style={styles.eventTypeIcon}
                        />
                        <Text
                          style={[
                            styles.eventTypeText,
                            eventType === type && styles.selectedEventTypeText,
                          ]}
                        >
                          {type}
                        </Text>
                      </TouchableOpacity>
                    )
                  )}
                </ScrollView>
              </View>

              {/* All Day Toggle */}
              <View style={styles.section}>
                <View style={styles.switchRow}>
                  <Text style={styles.sectionTitle}>All Day</Text>
                  <Switch
                    value={isAllDay}
                    onValueChange={setIsAllDay}
                    trackColor={{ false: '#767577', true: '#81b0ff' }}
                    thumbColor={isAllDay ? '#48b6b0' : '#f4f3f4'}
                  />
                </View>
              </View>

              {/* Multiple Dates Toggle */}
              {/* <View style={styles.section}>
                <View style={styles.switchRow}>
                  <View style={styles.switchLabelContainer}>
                    <Text style={styles.sectionTitle}>Multiple Dates</Text>
                    <Text style={styles.switchSubtitle}>
                      Create the same event on multiple dates
                    </Text>
                  </View>
                  <Switch
                    value={isMultiDate}
                    onValueChange={(value) => {
                      setIsMultiDate(value);
                      if (!value) {
                        setSelectedMultiDates([]);
                      }
                    }}
                    trackColor={{ false: '#767577', true: '#81b0ff' }}
                    thumbColor={isMultiDate ? '#48b6b0' : '#f4f3f4'}
                  />
                </View>
              </View> */}

              {/* Multi-Date Selector */}
              {isMultiDate ? (
                <View style={styles.section}>
                  <MultiDateSelector
                    selectedDates={selectedMultiDates}
                    onDatesChange={setSelectedMultiDates}
                    maxDates={10}
                    disabled={loading}
                  />
                </View>
              ) : (
                /* Date and Time Selection */
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>
                    {isAllDay ? 'Date' : 'Start Date & Time'}
                  </Text>

                  {/* Start Date */}
                  <TouchableOpacity
                    style={styles.dateTimeButton}
                    onPress={() => setShowStartDatePicker(true)}
                  >
                    <Ionicons name='calendar-outline' size={20} color='#48b6b0' />
                    <Text style={styles.dateTimeText}>{formatDate(startDate)}</Text>
                    <Ionicons name='chevron-forward' size={20} color='#ccc' />
                  </TouchableOpacity>

                  {/* Time Selection (if not all day) */}
                  {!isAllDay && (
                    <View style={styles.timeSection}>
                      {/* <Text style={styles.timeSectionTitle}>Time</Text> */}
                      <View style={styles.timeRow}>
                        <View style={styles.timeField}>
                          <Text style={styles.timeLabel}>Start Time</Text>
                          <TouchableOpacity
                            style={styles.timeButton}
                            onPress={() => setShowStartTimePicker(true)}
                            accessible={true}
                            accessibilityRole="button"
                            accessibilityLabel={`Start time: ${formatTime(startTime)}`}
                            accessibilityHint="Tap to change start time"
                          >
                            <Ionicons name='time-outline' size={20} color='#666' />
                            <View style={styles.timeTextContainer}>
                              <Text style={styles.timeText}>{formatTime(startTime)}</Text>
                              {/* <Text style={styles.dateText}>{formatDate(startTime)}</Text> */}
                            </View>
                          </TouchableOpacity>
                        </View>

                        <View style={styles.timeArrow}>
                          <Ionicons name='arrow-forward' size={20} color='#666' />
                        </View>

                        <View style={styles.timeField}>
                          <Text style={styles.timeLabel}>End Time</Text>
                          <TouchableOpacity
                            style={styles.timeButton}
                            onPress={() => setShowEndTimePicker(true)}
                            accessible={true}
                            accessibilityRole="button"
                            accessibilityLabel={`End time: ${formatTime(endTime)}`}
                            accessibilityHint="Tap to change end time"
                          >
                            <Ionicons name='time-outline' size={20} color='#666' />
                            <View style={styles.timeTextContainer}>
                              <Text style={styles.timeText}>{formatTime(endTime)}</Text>
                              {/* <Text style={styles.dateText}>{formatDate(endTime)}</Text> */}
                            </View>
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  )}

                  {/* End Date (if different from start date or all day) */}
                  {(isAllDay || startDate.toDateString() !== endDate.toDateString()) && (
                    <View style={styles.endDateSection}>
                      <Text style={styles.sectionTitle}>End Date</Text>
                      <TouchableOpacity
                        style={styles.dateTimeButton}
                        onPress={() => setShowEndDatePicker(true)}
                      >
                        <Ionicons name='calendar-outline' size={20} color='#48b6b0' />
                        <Text style={styles.dateTimeText}>{formatDate(endDate)}</Text>
                        <Ionicons name='chevron-forward' size={20} color='#ccc' />
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              )}

              {/* Reminders Section */}
              <View style={styles.section}>
                <View style={styles.switchRow}>
                  <Text style={styles.sectionTitle}>Reminders</Text>
                  <Switch
                    value={remindersEnabled}
                    onValueChange={setRemindersEnabled}
                    trackColor={{ false: '#767577', true: '#81b0ff' }}
                    thumbColor={remindersEnabled ? '#48b6b0' : '#f4f3f4'}
                  />
                </View>

                {remindersEnabled && (
                  <View style={styles.reminderOptions}>
                    {getReminderOptions().map((option) => (
                      <TouchableOpacity
                        key={option.id}
                        style={[
                          styles.reminderOption,
                          selectedReminders.includes(option.id) &&
                            styles.selectedReminderOption,
                        ]}
                        onPress={() => toggleReminder(option.id)}
                      >
                        <View style={styles.reminderOptionContent}>
                          <Text
                            style={[
                              styles.reminderOptionText,
                              selectedReminders.includes(option.id) &&
                                styles.selectedReminderOptionText,
                            ]}
                          >
                            {option.label}
                          </Text>
                          <Text style={styles.reminderOptionDescription}>
                            {option.description}
                          </Text>
                        </View>
                        {selectedReminders.includes(option.id) && (
                          <Ionicons name='checkmark' size={20} color='#48b6b0' />
                        )}
                      </TouchableOpacity>
                    ))}

                    {/* Custom Reminder */}
                    <View style={styles.customReminderSection}>
                      <Text style={styles.customReminderTitle}>Custom Reminder</Text>
                      <View style={styles.customReminderRow}>
                        <TextInput
                          style={styles.customReminderInput}
                          value={customReminderTime.toString()}
                          onChangeText={(text) => {
                            const num = parseInt(text) || 0;
                            setCustomReminderTime(Math.max(0, Math.min(999, num)));
                          }}
                          keyboardType='numeric'
                          placeholder='15'
                        />
                        <TouchableOpacity
                          style={styles.customReminderUnitButton}
                          onPress={() => {
                            const units = ['minutes', 'hours', 'days'];
                            const currentIndex = units.indexOf(customReminderUnit);
                            const nextIndex = (currentIndex + 1) % units.length;
                            setCustomReminderUnit(units[nextIndex]);
                          }}
                        >
                          <Text style={styles.customReminderUnitText}>
                            {customReminderUnit}
                          </Text>
                          <Ionicons name='chevron-down' size={16} color='#666' />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.addCustomReminderButton}
                          onPress={addCustomReminder}
                        >
                          <Text style={styles.addCustomReminderText}>Add</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                )}
              </View>

              {/* Delete Button */}
              <View style={styles.section}>
                <TouchableOpacity
                  style={styles.deleteButton}
                  onPress={handleDelete}
                  disabled={loading}
                >
                  <Ionicons name='trash-outline' size={20} color='#FF3B30' />
                  <Text style={styles.deleteButtonText}>Delete Event</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            // View Mode - Display event details
            <>
              {/* Event Title */}
              <View style={styles.section}>
                <Text style={styles.viewTitle}>{currentEvent.title}</Text>
                <Text style={styles.viewEventType}>
                  <Ionicons name={getEventTypeIcon(currentEvent.eventType)} size={16} color='#666' />
                  {' '}{currentEvent.eventType}
                </Text>
              </View>

              {/* Children */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Children</Text>
                <View style={styles.viewChildrenContainer}>
                  {CalendarEventsService.getEventChildren(currentEvent).map((child) => (
                    <View key={child.id} style={styles.viewChildItem}>
                      <View style={[styles.viewChildColor, { backgroundColor: child.color }]} />
                      <Text style={styles.viewChildName}>{child.name}</Text>
                    </View>
                  ))}
                </View>
              </View>

              {/* Date and Time */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>
                  {currentEvent.isAllDay ? 'Date' : 'Date & Time'}
                </Text>
                {currentEvent.isAllDay ? (
                  <View style={styles.viewDateContainer}>
                    <Ionicons name='calendar-outline' size={20} color='#48b6b0' />
                    <Text style={styles.viewDateText}>
                      {formatDate(new Date(currentEvent.startDate))}
                      {currentEvent.endDate && currentEvent.startDate !== currentEvent.endDate && 
                        ` - ${formatDate(new Date(currentEvent.endDate))}`
                      }
                    </Text>
                  </View>
                ) : (
                  <View style={styles.viewDateTimeContainer}>
                    <View style={styles.viewDateTimeRow}>
                      <Ionicons name='calendar-outline' size={20} color='#48b6b0' />
                      <Text style={styles.viewDateTimeText}>
                        {formatDate(new Date(currentEvent.startDateTime))} - {formatDate(new Date(currentEvent.endDateTime))}
                      </Text>
                    </View>
                    <View style={styles.viewDateTimeRow}>
                      <Ionicons name='time-outline' size={20} color='#666' />
                      <Text style={styles.viewDateTimeText}>
                        {formatTime(new Date(currentEvent.startDateTime))} - {formatTime(new Date(currentEvent.endDateTime))}
                      </Text>
                    </View>
                  </View>
                )}
              </View>

              {/* Reminders */}
              {currentEvent.remindersEnabled && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Reminders</Text>
                  <View style={styles.viewRemindersContainer}>
                    <Ionicons name='notifications-outline' size={20} color='#48b6b0' />
                    <Text style={styles.viewRemindersText}>
                      {getReminderDisplayText(currentEvent.reminders)}
                    </Text>
                  </View>
                </View>
              )}
            </>
          )}
        </ScrollView>

        {/* Date/Time Picker Modals */}
        <DateTimePickerModal
          visible={showStartDatePicker}
          mode="date"
          value={startDate}
          onConfirm={handleStartDateConfirm}
          onCancel={() => setShowStartDatePicker(false)}
          title="Select Start Date"
        />

        <DateTimePickerModal
          visible={showEndDatePicker}
          mode="date"
          value={endDate}
          onConfirm={handleEndDateConfirm}
          onCancel={() => setShowEndDatePicker(false)}
          title="Select End Date"
          minimumDate={startDate}
        />

        <DateTimePickerModal
          visible={showStartTimePicker}
          mode="time"
          value={startTime}
          onConfirm={handleStartTimeConfirm}
          onCancel={() => setShowStartTimePicker(false)}
          title="Select Start Time"
        />

        <DateTimePickerModal
          visible={showEndTimePicker}
          mode="time"
          value={endTime}
          onConfirm={handleEndTimeConfirm}
          onCancel={() => setShowEndTimePicker(false)}
          title="Select End Time"
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    paddingTop: Platform.OS === 'ios' ? 50 : 20,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  cancelButton: {
    fontSize: 16,
    color: '#48b6b0',
  },
  saveButton: {
    fontSize: 16,
    color: '#48b6b0',
    fontWeight: '600',
  },
  editButton: {
    fontSize: 16,
    color: '#48b6b0',
    fontWeight: '600',
  },
  disabledButton: {
    color: '#ccc',
  },
  content: {
    flex: 1,
  },
  section: {
    backgroundColor: 'white',
    marginVertical: 8,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#f9f9f9',
  },
  childSelector: {
    flexDirection: 'row',
  },
  childOption: {
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#ddd',
    backgroundColor: '#f9f9f9',
    marginRight: 12,
    minWidth: 80,
    maxWidth: 120,
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  selectedChildOption: {
    backgroundColor: '#E3F2FD',
    borderWidth: 3,
  },
  checkmarkContainer: {
    position: 'absolute',
    top: -5,
    right: -5,
    backgroundColor: 'white',
    borderRadius: 10,
    zIndex: 1,
  },
  childPhoto: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginBottom: 6,
  },
  childAvatar: {
    fontSize: 28,
    marginBottom: 6,
  },
  childOptionText: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
    textAlign: 'center',
  },
  selectedChildOptionText: {
    color: '#48b6b0',
    fontWeight: '600',
  },
  eventTypeSelector: {
    flexDirection: 'row',
  },
  eventTypeOption: {
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#ddd',
    backgroundColor: '#f9f9f9',
    marginRight: 12,
    minWidth: 80,
  },
  selectedEventTypeOption: {
    backgroundColor: '#E3F2FD',
    borderColor: '#48b6b0',
  },
  eventTypeIcon: {
    marginBottom: 6,
  },
  eventTypeText: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
    textAlign: 'center',
  },
  selectedEventTypeText: {
    color: '#48b6b0',
    fontWeight: '600',
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  switchLabelContainer: {
    flex: 1,
    marginRight: 16,
  },
  switchSubtitle: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  dateTimeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    marginBottom: 8,
  },
  dateTimeText: {
    flex: 1,
    fontSize: 16,
    color: '#333',
    marginLeft: 12,
  },
  endDateSection: {
    marginTop: 16,
  },
  multiDayButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    backgroundColor: '#f0f8ff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#48b6b0',
  },
  multiDayButtonText: {
    fontSize: 16,
    color: '#48b6b0',
    fontWeight: '500',
  },

  // Reminder styles
  reminderOptions: {
    marginTop: 16,
  },
  reminderSubtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
  },
  reminderOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    backgroundColor: '#f9f9f9',
    marginBottom: 8,
  },
  selectedReminderOption: {
    borderColor: '#48b6b0',
    backgroundColor: '#f0f8ff',
  },
  reminderOptionContent: {
    flex: 1,
  },
  reminderOptionText: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
  selectedReminderOptionText: {
    color: '#48b6b0',
  },
  reminderOptionDescription: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  customReminderSection: {
    marginTop: 16,
    padding: 12,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  customReminderTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  customReminderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  customReminderInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 6,
    padding: 8,
    fontSize: 16,
    backgroundColor: 'white',
    width: 60,
    textAlign: 'center',
  },
  customReminderUnitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 6,
    padding: 8,
    backgroundColor: 'white',
    marginLeft: 8,
    minWidth: 80,
  },
  customReminderUnitText: {
    fontSize: 14,
    color: '#333',
    marginRight: 4,
  },
  addCustomReminderButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#48b6b0',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    marginLeft: 8,
  },
  addCustomReminderText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '500',
  },

  // Time Selection Styles - Consistent with AddEventModal
  timeSection: {
    backgroundColor: '#f8f9fa',
    marginTop: 16,
    borderRadius: 12,
    marginHorizontal: 4,
    paddingVertical: 8,
  },
  timeSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
    paddingHorizontal: 16,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 12,
  },
  timeField: {
    flex: 1,
  },
  timeLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 8,
    textAlign: 'center',
    fontWeight: '500',
  },
  timeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
    minHeight: 56,
  },
  timeTextContainer: {
    marginLeft: 3,
    flex: 1,
  },
  timeText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
  },
  dateText: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  timeArrow: {
    paddingHorizontal: 16,
    paddingTop: 20, // Offset for the label
  },

  // Delete Button
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    backgroundColor: '#fff5f5',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ffebee',
  },
  deleteButtonText: {
    fontSize: 16,
    color: '#FF3B30',
    fontWeight: '600',
    marginLeft: 8,
  },

  // View Mode Styles
  viewTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  viewEventType: {
    fontSize: 16,
    color: '#666',
    flexDirection: 'row',
    alignItems: 'center',
  },
  viewChildrenContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  viewChildItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f9f9f9',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  viewChildColor: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 8,
  },
  viewChildName: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },
  viewDateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  viewDateText: {
    fontSize: 16,
    color: '#333',
    marginLeft: 12,
  },
  viewDateTimeContainer: {
    padding: 12,
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  viewDateTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  viewDateTimeText: {
    fontSize: 16,
    color: '#333',
    marginLeft: 12,
  },
  viewRemindersContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  viewRemindersText: {
    fontSize: 16,
    color: '#333',
    marginLeft: 12,
    flex: 1,
  },
});