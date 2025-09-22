import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { getTimeBasedGreeting, getRandomQuote } from '../utils/greetingUtils';
import CalendarEventsService from '../services/CalendarEventsService';
import ChildrenDataService from '../services/ChildrenDataService';
import { formatLocalDateString } from '../utils/dateUtils';
import FeelingSelector from '../components/FeelingSelector';
import DebugUtils from '../utils/debugUtils';

export default function HomeScreen() {
  // State for dynamic greeting and quote
  const [currentGreeting, setCurrentGreeting] = useState('');
  const [currentQuote, setCurrentQuote] = useState('');
  const [currentTime, setCurrentTime] = useState(new Date());
  
  // State for real data integration
  const [todaysEvents, setTodaysEvents] = useState([]);
  const [children, setChildren] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // State for feeling selector
  const [lastRecordedFeeling, setLastRecordedFeeling] = useState(null);
  const [error, setError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);
  const [lastSuccessfulLoad, setLastSuccessfulLoad] = useState(null);
  const [networkError, setNetworkError] = useState(false);

  // Initialize greeting and quote on component mount
  useEffect(() => {
    updateGreetingAndQuote();
    loadTodaysData();
  }, []);

  // Refresh data when screen comes into focus (handles navigation back from other screens)
  useFocusEffect(
    React.useCallback(() => {
      loadTodaysData();
    }, [])
  );

  // Load today's events and children data with comprehensive error handling
  const loadTodaysData = async (isRetry = false) => {
    try {
      setIsLoading(true);
      setError(null);
      setNetworkError(false);
      
      const today = new Date();
      
      // Validate date object
      if (isNaN(today.getTime())) {
        throw new Error('Invalid date object');
      }
      
      // Load events and children data with individual error handling
      let events = [];
      let childrenData = [];
      let eventsError = null;
      let childrenError = null;
      
      try {
        events = await CalendarEventsService.getEventsForDate(today);
        if (!Array.isArray(events)) {
          console.warn('Events data is not an array, using empty array');
          events = [];
        }
      } catch (error) {
        console.error('Failed to load events:', error);
        eventsError = error;
        events = [];
      }
      
      try {
        childrenData = await ChildrenDataService.getChildren();
        if (!Array.isArray(childrenData)) {
          console.warn('Children data is not an array, using empty array');
          childrenData = [];
        }
      } catch (error) {
        console.error('Failed to load children:', error);
        childrenError = error;
        childrenData = [];
      }
      
      // Debug logging (can be removed in production)
      if (__DEV__) {
        console.log('=== DEBUG: Data Loading ===');
        console.log('Events loaded:', events.length);
        console.log('Children loaded:', childrenData.length);
      }
      
      // Set children data even if events failed
      setChildren(childrenData);
      
      // Process events for display with error handling
      let processedEvents = [];
      try {
        processedEvents = processEventsForDisplay(events, childrenData);
      } catch (error) {
        console.error('Failed to process events for display:', error);
        processedEvents = [];
      }
      
      setTodaysEvents(processedEvents);
      setLastSuccessfulLoad(new Date());
      setRetryCount(0); // Reset retry count on success
      
      // Show partial error messages if some services failed
      if (eventsError && childrenError) {
        setError('Unable to load activities and children data. Some features may not work properly.');
      } else if (eventsError) {
        setError('Unable to load today\'s activities. Children profiles are available.');
      } else if (childrenError) {
        setError('Unable to load children data. Activities may show "Unknown Child".');
      }
      
    } catch (error) {
      console.error('Failed to load today\'s data:', error);
      
      // Increment retry count
      if (isRetry) {
        setRetryCount(prev => prev + 1);
      }
      
      // Determine error type and message
      let errorMessage = 'Unable to load today\'s data. ';
      
      if (error.message?.includes('Network')) {
        setNetworkError(true);
        errorMessage += 'Please check your connection and try again.';
      } else if (error.message?.includes('storage')) {
        errorMessage += 'There may be an issue with app storage. Try restarting the app.';
      } else if (error.message?.includes('Invalid date')) {
        errorMessage += 'There\'s an issue with the date. Please restart the app.';
      } else {
        errorMessage += 'Please try again or restart the app if the problem persists.';
      }
      
      setError(errorMessage);
      
      // Fallback to empty states
      setTodaysEvents([]);
      if (children.length === 0) {
        setChildren([]);
      }
      
    } finally {
      setIsLoading(false);
    }
  };

  // Handle feeling selection callback with error handling
  const handleFeelingSelected = (feelingType, category) => {
    try {
      if (!feelingType || typeof feelingType !== 'string') {
        console.warn('Invalid feeling type received:', feelingType);
        return;
      }
      
      // Display category if available, otherwise display feeling type
      const displayText = category ? 
        `${category.charAt(0).toUpperCase() + category.slice(1)} (${feelingType})` : 
        feelingType;
      
      setLastRecordedFeeling(displayText);
      
      // Clear the recorded feeling display after 3 seconds
      const timeoutId = setTimeout(() => {
        setLastRecordedFeeling(null);
      }, 3000);
      
      // Store timeout ID for cleanup if component unmounts
      return () => clearTimeout(timeoutId);
    } catch (error) {
      console.error('Error handling feeling selection:', error);
      Alert.alert(
        'Error',
        'Unable to process feeling selection. Please try again.',
        [{ text: 'OK' }]
      );
    }
  };

  // Process events for display with comprehensive error handling
  const processEventsForDisplay = (events, childrenData) => {
    try {
      // Validate inputs
      if (!Array.isArray(events)) {
        console.warn('Events is not an array:', events);
        return [];
      }
      
      if (!Array.isArray(childrenData)) {
        console.warn('Children data is not an array:', childrenData);
        childrenData = [];
      }
      
      // Filter out invalid events and process valid ones
      const processedEvents = events
        .filter(event => {
          // Validate required event properties
          if (!event || typeof event !== 'object') {
            console.warn('Invalid event object:', event);
            return false;
          }
          
          if (!event.id || !event.title) {
            console.warn('Event missing required properties (id, title):', event);
            return false;
          }
          
          // Validate date properties for timed events
          if (!event.isAllDay) {
            if (!event.startDateTime || !event.endDateTime) {
              console.warn('Timed event missing date properties:', event);
              return false;
            }
            
            // Check if dates are valid
            const startDate = new Date(event.startDateTime);
            const endDate = new Date(event.endDateTime);
            
            if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
              console.warn('Event has invalid dates:', event);
              return false;
            }
          }
          
          return true;
        })
        .map(event => {
          try {
            return {
              id: event.id,
              title: event.title || 'Untitled Event',
              time: formatEventTime(event),
              children: getChildrenNames(event, childrenData),
              isActive: isEventCurrentlyActive(event),
              startDateTime: event.startDateTime,
              endDateTime: event.endDateTime,
              isAllDay: event.isAllDay || false
            };
          } catch (error) {
            console.error('Error processing individual event:', event, error);
            // Return a safe fallback event
            return {
              id: event.id || 'unknown',
              title: event.title || 'Error Loading Event',
              time: 'Unknown Time',
              children: 'Unknown Child',
              isActive: false,
              startDateTime: event.startDateTime,
              endDateTime: event.endDateTime,
              isAllDay: event.isAllDay || false
            };
          }
        })
        .sort((a, b) => {
          try {
            // Sort chronologically by start time with proper handling of all-day events
            
            // Both are all-day events - sort by title alphabetically
            if (a.isAllDay && b.isAllDay) {
              return (a.title || '').localeCompare(b.title || '');
            }
            
            // All-day events come first
            if (a.isAllDay && !b.isAllDay) return -1;
            if (!a.isAllDay && b.isAllDay) return 1;
            
            // Both are timed events - sort by start time
            const aStart = new Date(a.startDateTime);
            const bStart = new Date(b.startDateTime);
            
            // Validate dates before comparison
            if (isNaN(aStart.getTime()) || isNaN(bStart.getTime())) {
              console.warn('Invalid dates in sorting:', a.startDateTime, b.startDateTime);
              return 0; // Keep original order if dates are invalid
            }
            
            // If start times are the same, sort by end time (shorter events first)
            if (aStart.getTime() === bStart.getTime()) {
              const aEnd = new Date(a.endDateTime);
              const bEnd = new Date(b.endDateTime);
              
              if (isNaN(aEnd.getTime()) || isNaN(bEnd.getTime())) {
                return 0;
              }
              
              return aEnd - bEnd;
            }
            
            return aStart - bStart;
          } catch (error) {
            console.error('Error in event sorting:', error);
            return 0; // Keep original order on error
          }
        });
      
      return processedEvents;
    } catch (error) {
      console.error('Error processing events for display:', error);
      return []; // Return empty array on any processing error
    }
  };

  // Format event time for display with error handling
  const formatEventTime = (event) => {
    try {
      if (!event) {
        return 'Unknown Time';
      }
      
      if (event.isAllDay) {
        return 'All Day';
      }
      
      if (!event.startDateTime || !event.endDateTime) {
        return 'Time Not Set';
      }
      
      const startTime = new Date(event.startDateTime);
      const endTime = new Date(event.endDateTime);
      
      // Validate dates
      if (isNaN(startTime.getTime()) || isNaN(endTime.getTime())) {
        console.warn('Invalid event times:', event.startDateTime, event.endDateTime);
        return 'Invalid Time';
      }
      
      const formatTime = (date) => {
        try {
          return date.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
          });
        } catch (error) {
          console.error('Error formatting time:', error);
          return 'Time Error';
        }
      };
      
      const formattedStart = formatTime(startTime);
      const formattedEnd = formatTime(endTime);
      
      if (formattedStart === 'Time Error' || formattedEnd === 'Time Error') {
        return 'Time Error';
      }
      
      return `${formattedStart} - ${formattedEnd}`;
    } catch (error) {
      console.error('Error formatting event time:', error);
      return 'Time Error';
    }
  };

  // Get child name by ID with proper field structure (firstName, lastName, nickname)
  const getChildName = (childId, childrenData) => {
    try {
      if (!childId) {
        return 'No Child Assigned';
      }
      
      if (!Array.isArray(childrenData)) {
        console.warn('Children data is not an array in getChildName');
        return 'Unknown Child';
      }
      
      const child = childrenData.find(c => c && c.id === childId);
      
      if (!child) {
        console.warn(`Child with ID "${childId}" not found in children data`);
        return 'Unknown Child';
      }
      
      // Use the same naming convention as other screens: nickname || firstName
      if (child.nickname && child.nickname.trim() !== '') {
        return child.nickname;
      }
      
      if (child.firstName && child.firstName.trim() !== '') {
        return child.firstName;
      }
      
      // Fallback if no name fields are set
      console.warn(`Child with ID "${childId}" has no name fields set`);
      return `Child ${childId.slice(-4)}`; // Show last 4 digits of ID as fallback
    } catch (error) {
      console.error('Error getting child name:', error);
      return 'Unknown Child';
    }
  };

  // Get children names for events (handles both new children array and legacy childId)
  const getChildrenNames = (event, childrenData) => {
    try {
      if (!event) {
        return 'No Child Assigned';
      }

      // Handle new format with children array
      if (event.children && Array.isArray(event.children) && event.children.length > 0) {
        const childNames = event.children.map(child => {
          if (child && child.name) {
            return child.name;
          }
          if (child && child.id) {
            return getChildName(child.id, childrenData);
          }
          return 'Unknown Child';
        }).filter(name => name !== 'Unknown Child');

        if (childNames.length === 0) {
          return 'Unknown Child';
        }

        // Format multiple children names
        if (childNames.length === 1) {
          return childNames[0];
        } else if (childNames.length === 2) {
          return `${childNames[0]}, ${childNames[1]}`;
        } else {
          return `${childNames[0]}, ${childNames.length - 1} others`;
        }
      }

      // Handle legacy format with single childId
      if (event.childId) {
        return getChildName(event.childId, childrenData);
      }

      return 'No Child Assigned';
    } catch (error) {
      console.error('Error getting children names:', error);
      return 'Unknown Child';
    }
  };

  // Check if event is currently active with error handling
  const isEventCurrentlyActive = (event) => {
    try {
      if (!event) {
        return false;
      }
      
      const now = new Date();
      
      // Validate current time
      if (isNaN(now.getTime())) {
        console.error('Invalid current time');
        return false;
      }
      
      if (event.isAllDay) {
        // For all-day events, check if it's the same day
        if (!event.startDateTime) {
          return false;
        }
        
        const eventDate = new Date(event.startDateTime);
        
        if (isNaN(eventDate.getTime())) {
          console.warn('Invalid all-day event date:', event.startDateTime);
          return false;
        }
        
        return (
          now.getFullYear() === eventDate.getFullYear() &&
          now.getMonth() === eventDate.getMonth() &&
          now.getDate() === eventDate.getDate()
        );
      }
      
      if (!event.startDateTime || !event.endDateTime) {
        return false;
      }
      
      const start = new Date(event.startDateTime);
      const end = new Date(event.endDateTime);
      
      // Validate event dates
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        console.warn('Invalid event dates:', event.startDateTime, event.endDateTime);
        return false;
      }
      
      // Check if start time is after end time (invalid event)
      if (start > end) {
        console.warn('Event start time is after end time:', event);
        return false;
      }
      
      return now >= start && now <= end;
    } catch (error) {
      console.error('Error checking if event is active:', error);
      return false;
    }
  };

  // Update greeting every minute and refresh event status more frequently with enhanced error handling
  useEffect(() => {
    let greetingInterval;
    let eventStatusInterval;
    
    try {
      greetingInterval = setInterval(() => {
        try {
          const now = new Date();
          
          // Validate current time
          if (isNaN(now.getTime())) {
            console.error('Invalid current time in interval');
            return;
          }
          
          const previousTime = currentTime;
          setCurrentTime(now);
          
          // Update greeting if hour has changed
          try {
            const newGreeting = getTimeBasedGreeting(now);
            if (newGreeting && newGreeting !== currentGreeting) {
              setCurrentGreeting(newGreeting);
            }
          } catch (greetingError) {
            console.error('Error updating greeting:', greetingError);
          }
          
          // Reload data if day has changed (after midnight transition)
          try {
            if (previousTime && formatLocalDateString(now) !== formatLocalDateString(previousTime)) {
              console.log('Day changed, reloading data');
              loadTodaysData();
            }
          } catch (dateError) {
            console.error('Error checking day change:', dateError);
          }
          
        } catch (error) {
          console.error('Error in greeting interval:', error);
        }
      }, 60000); // Check every minute

      // Update event active status more frequently (every 30 seconds)
      eventStatusInterval = setInterval(() => {
        try {
          if (Array.isArray(todaysEvents) && todaysEvents.length > 0) {
            const updatedEvents = todaysEvents.map(event => {
              try {
                return {
                  ...event,
                  isActive: isEventCurrentlyActive({
                    isAllDay: event.isAllDay,
                    startDateTime: event.startDateTime,
                    endDateTime: event.endDateTime
                  })
                };
              } catch (eventError) {
                console.error('Error updating individual event status:', eventError);
                return event; // Return original event if update fails
              }
            });
            
            // Only update state if active status has changed
            try {
              const hasActiveStatusChanged = updatedEvents.some((event, index) => {
                const originalEvent = todaysEvents[index];
                return originalEvent && event.isActive !== originalEvent.isActive;
              });
              
              if (hasActiveStatusChanged) {
                setTodaysEvents(updatedEvents);
              }
            } catch (comparisonError) {
              console.error('Error comparing event status changes:', comparisonError);
            }
          }
        } catch (error) {
          console.error('Error updating event status:', error);
        }
      }, 30000); // Check every 30 seconds

    } catch (error) {
      console.error('Error setting up intervals:', error);
    }

    return () => {
      try {
        if (greetingInterval) {
          clearInterval(greetingInterval);
        }
        if (eventStatusInterval) {
          clearInterval(eventStatusInterval);
        }
      } catch (error) {
        console.error('Error clearing intervals:', error);
      }
    };
  }, [currentGreeting, currentTime, todaysEvents]);

  // Function to update both greeting and quote with comprehensive error handling
  const updateGreetingAndQuote = () => {
    try {
      const now = new Date();
      
      // Validate current time
      if (isNaN(now.getTime())) {
        throw new Error('Invalid current time');
      }
      
      setCurrentTime(now);
      
      // Update greeting with fallback
      try {
        const greeting = getTimeBasedGreeting(now);
        setCurrentGreeting(greeting || 'Good Day!');
      } catch (greetingError) {
        console.error('Error getting time-based greeting:', greetingError);
        setCurrentGreeting('Good Day!');
      }
      
      // Update quote with fallback
      try {
        const quote = getRandomQuote();
        setCurrentQuote(quote || 'Have a wonderful day with your children!');
      } catch (quoteError) {
        console.error('Error getting random quote:', quoteError);
        setCurrentQuote('Have a wonderful day with your children!');
      }
      
    } catch (error) {
      console.error('Error updating greeting and quote:', error);
      // Fallback to default values
      setCurrentGreeting('Good Day!');
      setCurrentQuote('Have a wonderful day with your children!');
    }
  };

  // Enhanced retry function with exponential backoff
  const retryLoadData = async () => {
    try {
      if (retryCount >= 3) {
        Alert.alert(
          'Connection Issues',
          'Unable to load data after multiple attempts. Please check your device storage and restart the app if the problem persists.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Try Again', onPress: () => {
              setRetryCount(0);
              loadTodaysData(true);
            }}
          ]
        );
        return;
      }
      
      // Exponential backoff: wait longer between retries
      const delay = Math.pow(2, retryCount) * 1000; // 1s, 2s, 4s
      
      setTimeout(() => {
        loadTodaysData(true);
      }, delay);
      
    } catch (error) {
      console.error('Error in retry logic:', error);
      Alert.alert('Error', 'Unable to retry. Please restart the app.');
    }
  };

  // Debug function to inspect data and fix issues
  const debugDataIssues = async () => {
    try {
      console.log('=== STARTING DEBUG INSPECTION ===');
      
      // Inspect current data
      await DebugUtils.inspectCalendarEvents();
      const children = await DebugUtils.inspectChildren();
      
      // Check for children with missing names
      const childrenWithoutNames = children?.filter(child => !child.name || child.name.trim() === '') || [];
      
      // Check for orphaned events
      const orphanedEvents = await DebugUtils.findOrphanedEvents();
      
      if (childrenWithoutNames.length > 0) {
        Alert.alert(
          'Missing Child Names Found',
          `Found ${childrenWithoutNames.length} children without names. This is why "Unknown Child" is showing. Would you like to fix this?`,
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Fix Names', onPress: async () => {
              const success = await DebugUtils.repairChildrenNames();
              if (success) {
                Alert.alert('Success', 'Children names have been repaired. Reloading...', [
                  { text: 'OK', onPress: () => loadTodaysData() }
                ]);
              } else {
                Alert.alert('Error', 'Failed to repair children names');
              }
            }},
            { text: 'Create Sample Data', onPress: async () => {
              const success = await DebugUtils.createSampleData();
              if (success) {
                Alert.alert('Success', 'Sample data created. Reloading...', [
                  { text: 'OK', onPress: () => loadTodaysData() }
                ]);
              } else {
                Alert.alert('Error', 'Failed to create sample data');
              }
            }}
          ]
        );
      } else if (orphanedEvents.length > 0) {
        Alert.alert(
          'Data Issue Found',
          `Found ${orphanedEvents.length} events with missing child references. Would you like to create sample data to fix this?`,
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Create Sample Data', onPress: async () => {
              const success = await DebugUtils.createSampleData();
              if (success) {
                Alert.alert('Success', 'Sample data created. Reloading...', [
                  { text: 'OK', onPress: () => loadTodaysData() }
                ]);
              } else {
                Alert.alert('Error', 'Failed to create sample data');
              }
            }},
            { text: 'Clear All Data', style: 'destructive', onPress: async () => {
              const success = await DebugUtils.clearAllData();
              if (success) {
                Alert.alert('Data Cleared', 'All data has been cleared. Reloading...', [
                  { text: 'OK', onPress: () => loadTodaysData() }
                ]);
              }
            }}
          ]
        );
      } else {
        Alert.alert('Debug Complete', 'No data issues found. Check console for detailed logs.');
      }
      
    } catch (error) {
      console.error('Error in debug function:', error);
      Alert.alert('Debug Error', 'Failed to inspect data. Check console for details.');
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.greeting}>{currentGreeting}</Text>
        <Text style={styles.quote}>{currentQuote}</Text>
      </View>

      <FeelingSelector onFeelingSelected={handleFeelingSelected} />
      
      {lastRecordedFeeling && (
        <View style={styles.feelingFeedback}>
          <Ionicons name="checkmark-circle" size={20} color="#4CAF50" />
          <Text style={styles.feelingFeedbackText}>
            Feeling recorded: {lastRecordedFeeling}
          </Text>
        </View>
      )}

      {/* <View style={styles.section}>
        <Text style={styles.sectionTitle}>Your Children</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {children.length === 0 ? (
            <View style={styles.emptyChildrenContainer}>
              <Text style={styles.emptyChildrenText}>No children added yet</Text>
            </View>
          ) : (
            children.map((child) => (
              <TouchableOpacity key={child.id} style={styles.childCard}>
                <Text style={styles.avatar}>{child.avatar || '👶'}</Text>
                <Text style={styles.childName}>{child.name}</Text>
                <Text style={styles.childAge}>{child.age} years old</Text>
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      </View> */}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Today's Activities</Text>
        {error ? (
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle-outline" size={48} color="#FF6B6B" />
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity 
              style={styles.retryButton} 
              onPress={retryLoadData}
            >
              <Text style={styles.retryButtonText}>
                {retryCount > 0 ? `Try Again (${retryCount}/3)` : 'Try Again'}
              </Text>
            </TouchableOpacity>
            {lastSuccessfulLoad && (
              <Text style={styles.lastUpdateText}>
                Last updated: {lastSuccessfulLoad.toLocaleTimeString()}
              </Text>
            )}
          </View>
        ) : isLoading ? (
          <View style={styles.loadingContainer}>
            <Ionicons name="time-outline" size={32} color="#ccc" />
            <Text style={styles.loadingText}>Loading activities...</Text>
          </View>
        ) : todaysEvents.length === 0 ? (
          <View style={styles.emptyStateContainer}>
            <Ionicons name="calendar-outline" size={48} color="#ccc" />
            <Text style={styles.emptyStateText}>No activities scheduled for today</Text>
            <Text style={styles.emptyStateSubtext}>Enjoy your free time!</Text>
          </View>
        ) : (
          todaysEvents.map((event) => (
            <View key={event.id} style={[
              styles.activityCard,
              event.isActive && styles.activeActivityCard
            ]}>
              <View style={styles.activityInfo}>
                <Text style={styles.activityTitle}>{event.title}</Text>
                <Text style={styles.activityTime}>{event.time}</Text>
                <Text style={styles.activityChild}>{event.children}</Text>
              </View>
              <Ionicons
                name={event.isActive ? 'play-circle' : 'time-outline'}
                size={24}
                color={event.isActive ? '#4CAF50' : '#FF9800'}
              />
            </View>
          ))
        )}
      </View>

      {/* Debug button - remove this in production */}
      {/* <TouchableOpacity style={[styles.addButton, { backgroundColor: '#FF6B6B' }]} onPress={debugDataIssues}>
        <Ionicons name="bug" size={24} color="white" />
        <Text style={styles.addButtonText}>Debug Data Issues</Text>
      </TouchableOpacity> */}

      {/* <TouchableOpacity style={styles.addButton}>
        <Ionicons name="add" size={24} color="white" />
        <Text style={styles.addButtonText}>Add New Activity</Text>
      </TouchableOpacity> */}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    padding: 20,
    backgroundColor: 'white',
    marginBottom: 10,
  },
  greeting: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#333',
  },
  quote: {
    fontSize: 14,
    color: '#555',
    fontStyle: 'italic',
    lineHeight: 20,
    marginTop: 8,
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginTop: 5,
  },
  section: {
    backgroundColor: 'white',
    margin: 10,
    padding: 20,
    borderRadius: 10,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 15,
    color: '#333',
  },
  childCard: {
    alignItems: 'center',
    marginRight: 15,
    padding: 15,
    backgroundColor: '#f8f9fa',
    borderRadius: 10,
    minWidth: 100,
  },
  avatar: {
    fontSize: 40,
    marginBottom: 8,
  },
  childName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  childAge: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  activityCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    marginBottom: 10,
  },
  activityInfo: {
    flex: 1,
  },
  activityTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  activityTime: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  activityChild: {
    fontSize: 12,
    color: '#888',
    marginTop: 4,
    fontWeight: '500',
  },
  activeActivityCard: {
    backgroundColor: '#e8f5e8',
    borderLeftWidth: 4,
    borderLeftColor: '#4CAF50',
    shadowColor: '#4CAF50',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  loadingContainer: {
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    fontSize: 16,
    color: '#666',
    marginTop: 8,
  },
  emptyStateContainer: {
    alignItems: 'center',
    padding: 30,
  },
  emptyStateText: {
    fontSize: 16,
    color: '#666',
    marginTop: 12,
    fontWeight: '500',
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: '#888',
    marginTop: 4,
  },
  emptyChildrenContainer: {
    padding: 20,
    alignItems: 'center',
  },
  emptyChildrenText: {
    fontSize: 14,
    color: '#666',
    fontStyle: 'italic',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#48b6b0',
    margin: 20,
    padding: 15,
    borderRadius: 10,
  },
  addButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  feelingFeedback: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E8F5E8',
    marginHorizontal: 16,
    marginVertical: 8,
    padding: 12,
    borderRadius: 8,
    
    borderLeftColor: '#4CAF50',
  },
  feelingFeedbackText: {
    fontSize: 14,
    color: '#2E7D32',
    fontWeight: '500',
    marginLeft: 8,
  },
  errorContainer: {
    alignItems: 'center',
    padding: 30,
  },
  errorText: {
    fontSize: 16,
    color: '#FF6B6B',
    marginTop: 12,
    fontWeight: '500',
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: '#48b6b0',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 16,
  },
  retryButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  lastUpdateText: {
    fontSize: 12,
    color: '#888',
    textAlign: 'center',
    marginTop: 8,
    fontStyle: 'italic',
  },
});