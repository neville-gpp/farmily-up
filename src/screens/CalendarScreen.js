import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import AddEventModal from '../components/AddEventModal';
import EventDetailModal from '../components/EventDetailModal';
import CalendarEventsService from '../services/CalendarEventsService';
import ChildrenDataService from '../services/ChildrenDataService';
import NotificationService from '../services/NotificationService';
import {
  formatLocalDateString,
  isSameDay,
  isToday as isDateToday,
  getWeekStart,
  getWeekDays,
} from '../utils/dateUtils';

export default function CalendarScreen() {
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [currentMonth, setCurrentMonth] = useState(() => new Date());
  const [viewMode, setViewMode] = useState('month'); // 'month', 'week', 'day'
  const [currentWeekStart, setCurrentWeekStart] = useState(() => {
    return getWeekStart(new Date());
  });

  // Enhanced day selection state for weekly view navigation
  const [selectedWeekDay, setSelectedWeekDay] = useState(() => {
    const today = new Date();
    return today.getDay(); // 0-6 for Sunday-Saturday
  });

  // Swipe gesture states
  const [touchStart, setTouchStart] = useState(null);
  const [touchEnd, setTouchEnd] = useState(null);
  const [showAddEventModal, setShowAddEventModal] = useState(false);
  const [showEventDetailModal, setShowEventDetailModal] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [events, setEvents] = useState([]);
  const [children, setChildren] = useState([]);
  const [loading, setLoading] = useState(true);

  // Animation values
  const slideAnimation = useRef(new Animated.Value(0)).current;
  const fadeAnimation = useRef(new Animated.Value(1)).current;
  const weekSlideAnimation = useRef(new Animated.Value(0)).current;
  const weekFadeAnimation = useRef(new Animated.Value(1)).current;
  const daySlideAnimation = useRef(new Animated.Value(0)).current;
  const dayFadeAnimation = useRef(new Animated.Value(1)).current;

  // Ensure today's date is selected when component mounts with proper weekly context
  useEffect(() => {
    const today = new Date();
    setSelectedDate(today);
    setSelectedWeekDay(today.getDay()); // Set today's day of week (0-6)

    // Set current week to include today
    setCurrentWeekStart(getWeekStart(today));

    loadData();
  }, []);

  // Reload data when screen comes into focus
  useFocusEffect(
    React.useCallback(() => {
      loadData();
    }, [])
  );

  const loadData = async () => {
    try {
      setLoading(true);
      const [eventsData, childrenData] = await Promise.all([
        CalendarEventsService.getEvents(),
        ChildrenDataService.getChildren(),
      ]);

      // Validate and clean up corrupted events
      const validEvents = eventsData.filter((event) => {
        try {
          // Basic validation
          if (!event || typeof event !== 'object') {
            console.warn('Removing invalid event object:', event);
            return false;
          }

          if (!event.id || !event.title) {
            console.warn('Removing event with missing required fields:', event);
            return false;
          }

          return true;
        } catch (error) {
          console.error('Error validating event:', error);
          return false;
        }
      });

      if (validEvents.length !== eventsData.length) {
        console.warn(
          `Filtered out ${
            eventsData.length - validEvents.length
          } corrupted events`
        );
        // Save cleaned events back to storage
        try {
          await CalendarEventsService.saveEvents(validEvents);
        } catch (saveError) {
          console.error('Failed to save cleaned events:', saveError);
        }
      }

      setEvents(validEvents);
      setChildren(childrenData);

      // Request notification permissions on first load
      try {
        await NotificationService.requestPermissions();
      } catch (error) {
        console.warn('Failed to request notification permissions:', error);
      }
    } catch (error) {
      console.error('Error loading data:', error);
      // Set empty arrays to prevent crashes
      setEvents([]);
      setChildren([]);
    } finally {
      setLoading(false);
    }
  };

  // Ensure currentWeekStart is always valid when switching to week view
  useEffect(() => {
    if (viewMode === 'week' && !currentWeekStart) {
      setCurrentWeekStart(getWeekStart(selectedDate));
    }
  }, [viewMode, currentWeekStart, selectedDate]);

  // Handle weekly view default behavior - preserve context and default to today when appropriate
  useEffect(() => {
    if (viewMode === 'week') {
      const today = new Date();
      const currentWeekStart = getWeekStart(selectedDate);
      const todayWeekStart = getWeekStart(today);

      // Check if today is within the current week being displayed
      const isCurrentWeekDisplayed = isSameDay(
        currentWeekStart,
        todayWeekStart
      );

      // Only default to today when first switching to weekly view AND no specific date was selected
      // This prevents overriding user's manual day selections
      if (!isCurrentWeekDisplayed) {
        // Preserve the selected day within the current week context
        const daysDiff = Math.floor(
          (selectedDate - currentWeekStart) / (1000 * 60 * 60 * 24)
        );
        if (daysDiff >= 0 && daysDiff <= 6) {
          setSelectedWeekDay(daysDiff);
        }
      }
    }
  }, [viewMode]);

  const handleEventAdded = (newEvent) => {
    setEvents((prevEvents) => [...prevEvents, newEvent]);
  };

  const handleEventDeleted = (eventId) => {
    setEvents((prevEvents) =>
      prevEvents.filter((event) => event.id !== eventId)
    );
  };

  const handleEventPress = (event) => {
    setSelectedEvent(event);
    setShowEventDetailModal(true);
  };

  const getChildColor = (childId) => {
    const child = children.find((c) => c.id === childId);
    return child?.favourColor || '#607D8B';
  };

  const getChildName = (childId) => {
    const child = children.find((c) => c.id === childId);
    return child ? child.nickname || child.firstName : 'Unknown';
  };

  // Memoized month days calculation for better performance
  const getCurrentMonthDays = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    const days = [];

    // Add empty cells for days before the first day of the month
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null);
    }

    // Add all days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(day);
    }

    // Pad the end to complete the last week (ensure we have 6 complete weeks = 42 days)
    const totalCells = 42; // 6 weeks × 7 days
    while (days.length < totalCells) {
      days.push(null);
    }

    return days;
  }, [currentMonth]);

  const getCalendarWeekDays = (weekStart = null) => {
    const startOfWeek =
      weekStart ||
      (viewMode === 'week' && currentWeekStart
        ? currentWeekStart
        : getWeekStart(selectedDate));
    return getWeekDays(startOfWeek);
  };

  const getWeekRange = () => {
    const weekDays = getCalendarWeekDays();
    const startDate = weekDays[0];
    const endDate = weekDays[6];

    const startMonth = startDate.toLocaleDateString('en-US', {
      month: 'short',
    });
    const endMonth = endDate.toLocaleDateString('en-US', { month: 'short' });
    const startDay = startDate.getDate();
    const endDay = endDate.getDate();
    const year = startDate.getFullYear();
    const currentYear = new Date().getFullYear();

    if (startMonth === endMonth) {
      return year !== currentYear
        ? `${startMonth} ${startDay} - ${endDay}, ${year}`
        : `${startMonth} ${startDay} - ${endDay}`;
    } else {
      return year !== currentYear
        ? `${startMonth} ${startDay} - ${endMonth} ${endDay}, ${year}`
        : `${startMonth} ${startDay} - ${endMonth} ${endDay}`;
    }
  };

  const navigateWeek = (direction) => {
    const weekStart = currentWeekStart || getWeekStart(selectedDate);
    const newWeekStart = new Date(weekStart);
    newWeekStart.setDate(weekStart.getDate() + direction * 7);
    setCurrentWeekStart(newWeekStart);
  };

  const goToCurrentWeek = () => {
    const today = new Date();
    const startOfWeek = getWeekStart(today);
    setCurrentWeekStart(startOfWeek);
    setSelectedDate(today);
    setSelectedWeekDay(today.getDay());

    // Update current month if needed to maintain consistency
    if (
      today.getMonth() !== currentMonth.getMonth() ||
      today.getFullYear() !== currentMonth.getFullYear()
    ) {
      setCurrentMonth(new Date(today.getFullYear(), today.getMonth(), 1));
    }
  };

  const getEventsForDate = (date) => {
    const dateString = formatLocalDateString(date);

    return events.filter((event) => {
      if (event.isAllDay) {
        return (
          event.startDate === dateString ||
          (event.endDate &&
            dateString >= event.startDate &&
            dateString <= event.endDate)
        );
      } else {
        // For timed events, get the local date without timezone conversion
        const eventStartDate = new Date(event.startDateTime);
        const eventEndDate = new Date(event.endDateTime);

        const eventStartDateString = formatLocalDateString(eventStartDate);
        const eventEndDateString = formatLocalDateString(eventEndDate);

        return (
          dateString >= eventStartDateString && dateString <= eventEndDateString
        );
      }
    });
  };

  // Memoized helper function to extract child data from both new and legacy event formats with fallback rendering
  const getEventChildren = useCallback(
    (event) => {
      try {
        // Validate event object
        if (!event || typeof event !== 'object') {
          console.warn(
            'Invalid event object provided to getEventChildren:',
            event
          );
          return [
            {
              id: 'unknown',
              name: 'Unknown Child',
              color: '#999999',
            },
          ];
        }

        // Handle new multi-child format
        if (
          event.children &&
          Array.isArray(event.children) &&
          event.children.length > 0
        ) {
          const validChildren = event.children
            .filter((child) => {
              return (
                child && typeof child === 'object' && child.id && child.name
              );
            })
            .map((child) => ({
              id: child.id,
              name: child.name,
              color: child.color || getChildColor(child.id) || '#48b6b0',
            }));

          if (validChildren.length > 0) {
            return validChildren;
          }
        }

        // Fallback to legacy single child format
        if (event.childId) {
          const child = children.find((c) => c.id === event.childId);
          if (child) {
            return [
              {
                id: child.id,
                name: child.nickname || child.firstName,
                color: child.favourColor || '#48b6b0',
              },
            ];
          } else {
            // Child not found in current children list - provide fallback
            return [
              {
                id: event.childId,
                name: event.childName || 'Unknown Child',
                color: '#999999', // Gray color for missing children
              },
            ];
          }
        }

        // No valid children found - provide fallback for corrupted events
        console.warn(
          'No valid children found for event:',
          event.id || 'unknown'
        );
        return [
          {
            id: 'fallback',
            name: 'Unknown Child',
            color: '#999999',
          },
        ];
      } catch (error) {
        console.error('Error getting event children:', error);
        // Return fallback data to prevent crashes
        return [
          {
            id: 'error',
            name: 'Error Loading Child',
            color: '#FF6B6B',
          },
        ];
      }
    },
    [children]
  );

  // Helper function to check if an event is part of a multi-date series
  const isMultiDateEvent = useCallback((event) => {
    return event && event.isMultiDate === true && event.multiDateId;
  }, []);

  // Memoized render function for single event indicators with smooth animations and multi-date support
  const renderSingleEventIndicator = useCallback(
    (eventChildren, isSelected, event = null) => {
      if (eventChildren.length === 0) return null;

      const isMultiDate = event && isMultiDateEvent(event);

      if (eventChildren.length === 1) {
        // Single child - show one colored dot with smooth transition and multi-date chain icon
        return (
          <View style={styles.eventIndicatorContainer}>
            <Animated.View
              style={[
                styles.eventDot,
                {
                  backgroundColor: isSelected
                    ? 'white'
                    : eventChildren[0].color ||
                      getChildColor(eventChildren[0].id),
                  transform: [{ scale: isSelected ? 1.1 : 1 }],
                },
              ]}
            />
            {isMultiDate && (
              <View
                style={[
                  styles.multiDateChainIcon,
                  {
                    backgroundColor: isSelected
                      ? eventChildren[0].color ||
                        getChildColor(eventChildren[0].id)
                      : 'white',
                  },
                ]}
              >
                <Ionicons
                  name='link'
                  size={4}
                  color={
                    isSelected
                      ? 'white'
                      : eventChildren[0].color ||
                        getChildColor(eventChildren[0].id)
                  }
                />
              </View>
            )}
          </View>
        );
      } else if (eventChildren.length <= 3) {
        // Multiple children (2-3) - show multiple dots with staggered animation and multi-date indicator
        return (
          <View style={styles.eventIndicatorContainer}>
            <View style={styles.multipleEventDots}>
              {eventChildren.slice(0, 3).map((child, index) => (
                <Animated.View
                  key={`${child.id}-${index}`}
                  style={[
                    styles.eventDot,
                    {
                      backgroundColor: isSelected
                        ? 'white'
                        : child.color || getChildColor(child.id),
                      marginLeft: index > 0 ? 2 : 0,
                      transform: [{ scale: isSelected ? 1.05 : 1 }],
                    },
                  ]}
                />
              ))}
            </View>
            {isMultiDate && (
              <View
                style={[
                  styles.multiDateChainIcon,
                  {
                    backgroundColor: isSelected
                      ? eventChildren[0].color ||
                        getChildColor(eventChildren[0].id)
                      : 'white',
                  },
                ]}
              >
                <Ionicons
                  name='link'
                  size={4}
                  color={
                    isSelected
                      ? 'white'
                      : eventChildren[0].color ||
                        getChildColor(eventChildren[0].id)
                  }
                />
              </View>
            )}
          </View>
        );
      } else {
        // Many children (4+) - show count indicator with primary child's color and multi-date indicator
        const primaryColor =
          eventChildren[0].color || getChildColor(eventChildren[0].id);
        return (
          <View style={styles.eventIndicatorContainer}>
            <Animated.View
              style={[
                styles.eventCountIndicator,
                {
                  backgroundColor: isSelected ? 'white' : primaryColor,
                  transform: [{ scale: isSelected ? 1.1 : 1 }],
                },
              ]}
            >
              <Text
                style={[
                  styles.eventCountText,
                  { color: isSelected ? primaryColor : 'white' },
                ]}
              >
                {eventChildren.length}
              </Text>
            </Animated.View>
            {isMultiDate && (
              <View
                style={[
                  styles.multiDateChainIcon,
                  {
                    backgroundColor: isSelected ? primaryColor : 'white',
                  },
                ]}
              >
                <Ionicons
                  name='link'
                  size={4}
                  color={isSelected ? 'white' : primaryColor}
                />
              </View>
            )}
          </View>
        );
      }
    },
    [children, isMultiDateEvent]
  );

  // Memoized render function for multiple event indicators with optimized child collection and multi-date support
  const renderMultipleEventIndicators = useCallback(
    (dayEvents, isSelected) => {
      // Optimized collection of unique children using Map for better performance
      const childMap = new Map();
      const childCounts = new Map();
      const hasMultiDateEvents = dayEvents.some((event) =>
        isMultiDateEvent(event)
      );

      dayEvents.forEach((event) => {
        const eventChildren = getEventChildren(event);
        eventChildren.forEach((child) => {
          if (!childMap.has(child.id)) {
            childMap.set(child.id, child);
          }
          childCounts.set(child.id, (childCounts.get(child.id) || 0) + 1);
        });
      });

      const allEventChildren = Array.from(childMap.values());

      if (allEventChildren.length <= 3) {
        // Show individual dots for each unique child with smooth animations and multi-date indicator
        return (
          <View style={styles.eventIndicatorContainer}>
            <View style={styles.multipleEventDots}>
              {allEventChildren.slice(0, 3).map((child, index) => (
                <Animated.View
                  key={`multi-${child.id}-${index}`}
                  style={[
                    styles.eventDot,
                    {
                      backgroundColor: isSelected
                        ? 'white'
                        : child.color || getChildColor(child.id),
                      marginLeft: index > 0 ? 2 : 0,
                      transform: [{ scale: isSelected ? 1.05 : 1 }],
                    },
                  ]}
                />
              ))}
            </View>
            {hasMultiDateEvents && (
              <View
                style={[
                  styles.multiDateChainIcon,
                  {
                    backgroundColor: isSelected
                      ? allEventChildren[0].color ||
                        getChildColor(allEventChildren[0].id)
                      : 'white',
                  },
                ]}
              >
                <Ionicons
                  name='link'
                  size={4}
                  color={
                    isSelected
                      ? 'white'
                      : allEventChildren[0].color ||
                        getChildColor(allEventChildren[0].id)
                  }
                />
              </View>
            )}
          </View>
        );
      } else {
        // Many unique children (4+) - show count indicator with most common child's color and multi-date indicator
        const mostCommonChildId = Array.from(childCounts.entries()).reduce(
          (a, b) => (a[1] > b[1] ? a : b)
        )[0];

        const mostCommonChild = childMap.get(mostCommonChildId);
        const indicatorColor =
          mostCommonChild?.color || getChildColor(mostCommonChildId);

        return (
          <View style={styles.eventIndicatorContainer}>
            <Animated.View
              style={[
                styles.eventCountIndicator,
                {
                  backgroundColor: isSelected ? 'white' : indicatorColor,
                  transform: [{ scale: isSelected ? 1.1 : 1 }],
                },
              ]}
            >
              <Text
                style={[
                  styles.eventCountText,
                  { color: isSelected ? indicatorColor : 'white' },
                ]}
              >
                {dayEvents.length}
              </Text>
            </Animated.View>
            {hasMultiDateEvents && (
              <View
                style={[
                  styles.multiDateChainIcon,
                  {
                    backgroundColor: isSelected ? indicatorColor : 'white',
                  },
                ]}
              >
                <Ionicons
                  name='link'
                  size={4}
                  color={isSelected ? 'white' : indicatorColor}
                />
              </View>
            )}
          </View>
        );
      }
    },
    [getEventChildren, children, isMultiDateEvent]
  );

  // Optimized event indicator rendering with memoization and error boundaries
  const renderEventIndicators = useCallback(
    (dayEvents, isSelected) => {
      try {
        if (!dayEvents || !Array.isArray(dayEvents) || dayEvents.length === 0) {
          return null;
        }

        // Filter out any invalid events with optimized validation
        const validEvents = dayEvents.filter(
          (event) =>
            event && typeof event === 'object' && (event.id || event.title)
        );

        if (validEvents.length === 0) {
          // Show error indicator for corrupted events with subtle animation
          return (
            <Animated.View
              style={[
                styles.eventDot,
                {
                  backgroundColor: '#FF6B6B',
                  transform: [{ scale: isSelected ? 1.1 : 1 }],
                },
              ]}
            />
          );
        }

        if (validEvents.length === 1) {
          // Single event - handle potential multi-child event and multi-date indicators
          const eventChildren = getEventChildren(validEvents[0]);
          return renderSingleEventIndicator(
            eventChildren,
            isSelected,
            validEvents[0]
          );
        } else {
          // Multiple events - handle complex multi-child event combinations and multi-date indicators
          return renderMultipleEventIndicators(validEvents, isSelected);
        }
      } catch (error) {
        console.error('Error rendering event indicators:', error);
        // Return error indicator to prevent crashes with animation
        return (
          <Animated.View
            style={[
              styles.eventDot,
              {
                backgroundColor: '#FF6B6B',
                transform: [{ scale: isSelected ? 1.1 : 1 }],
              },
            ]}
          />
        );
      }
    },
    [
      getEventChildren,
      renderSingleEventIndicator,
      renderMultipleEventIndicators,
    ]
  );

  // Memoized event filtering for better performance
  const getFilteredEvents = useMemo(() => {
    if (viewMode === 'week') {
      // Show only selected date events in weekly view instead of all week events
      return getEventsForDate(selectedDate);
    } else if (viewMode === 'day') {
      return getEventsForDate(selectedDate);
    } else if (viewMode === 'month') {
      return getEventsForDate(selectedDate); // For month view, show selected day events
    }
    return events; // Fallback
  }, [viewMode, selectedDate, events]);

  const formatDate = (date) => {
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  };

  const isSelectedDate = (date) => {
    return isSameDay(date, selectedDate);
  };

  const formatEventTime = (event) => {
    if (event.isAllDay) {
      return 'All day';
    } else {
      const startTime = new Date(event.startDateTime);
      const endTime = new Date(event.endDateTime);
      return `${startTime.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      })} - ${endTime.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      })}`;
    }
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

  const animateMonthTransition = (direction, callback) => {
    // Start slide animation
    Animated.parallel([
      Animated.timing(slideAnimation, {
        toValue: direction === 'next' ? -100 : 100,
        duration: 200,
        useNativeDriver: false,
      }),
      Animated.timing(fadeAnimation, {
        toValue: 0.3,
        duration: 200,
        useNativeDriver: false,
      }),
    ]).start(() => {
      // Execute the month change
      callback();

      // Reset position and animate back
      slideAnimation.setValue(direction === 'next' ? 100 : -100);

      Animated.parallel([
        Animated.timing(slideAnimation, {
          toValue: 0,
          duration: 200,
          useNativeDriver: false,
        }),
        Animated.timing(fadeAnimation, {
          toValue: 1,
          duration: 200,
          useNativeDriver: false,
        }),
      ]).start();
    });
  };

  const goToPreviousMonth = () => {
    animateMonthTransition('previous', () => {
      const newMonth = new Date(currentMonth);
      newMonth.setMonth(currentMonth.getMonth() - 1);
      setCurrentMonth(newMonth);

      // Update selected date
      if (
        selectedDate.getMonth() !== newMonth.getMonth() ||
        selectedDate.getFullYear() !== newMonth.getFullYear()
      ) {
        const today = new Date();
        // If navigating to current month, select today; otherwise select 1st day
        if (
          newMonth.getMonth() === today.getMonth() &&
          newMonth.getFullYear() === today.getFullYear()
        ) {
          setSelectedDate(today);
        } else {
          setSelectedDate(
            new Date(newMonth.getFullYear(), newMonth.getMonth(), 1)
          );
        }
      }
    });
  };

  const goToNextMonth = () => {
    animateMonthTransition('next', () => {
      const newMonth = new Date(currentMonth);
      newMonth.setMonth(currentMonth.getMonth() + 1);
      setCurrentMonth(newMonth);

      // Update selected date
      if (
        selectedDate.getMonth() !== newMonth.getMonth() ||
        selectedDate.getFullYear() !== newMonth.getFullYear()
      ) {
        const today = new Date();
        // If navigating to current month, select today; otherwise select 1st day
        if (
          newMonth.getMonth() === today.getMonth() &&
          newMonth.getFullYear() === today.getFullYear()
        ) {
          setSelectedDate(today);
        } else {
          setSelectedDate(
            new Date(newMonth.getFullYear(), newMonth.getMonth(), 1)
          );
        }
      }
    });
  };

  const goToCurrentMonth = () => {
    const today = new Date();
    setCurrentMonth(today);
    setSelectedDate(today);
  };

  // Week animation function
  const animateWeekTransition = (direction, callback) => {
    // Start slide animation
    Animated.parallel([
      Animated.timing(weekSlideAnimation, {
        toValue: direction === 'next' ? -100 : 100,
        duration: 200,
        useNativeDriver: false,
      }),
      Animated.timing(weekFadeAnimation, {
        toValue: 0.3,
        duration: 200,
        useNativeDriver: false,
      }),
    ]).start(() => {
      // Execute the week change
      callback();

      // Reset position and animate back
      weekSlideAnimation.setValue(direction === 'next' ? 100 : -100);

      Animated.parallel([
        Animated.timing(weekSlideAnimation, {
          toValue: 0,
          duration: 200,
          useNativeDriver: false,
        }),
        Animated.timing(weekFadeAnimation, {
          toValue: 1,
          duration: 200,
          useNativeDriver: false,
        }),
      ]).start();
    });
  };

  // Enhanced week navigation functions with context preservation
  const goToPreviousWeek = () => {
    animateWeekTransition('previous', () => {
      const newWeekStart = new Date(currentWeekStart);
      newWeekStart.setDate(currentWeekStart.getDate() - 7);
      setCurrentWeekStart(newWeekStart);

      // Preserve the same day of week selection in the new week
      const newSelectedDate = new Date(newWeekStart);
      newSelectedDate.setDate(newWeekStart.getDate() + selectedWeekDay);
      setSelectedDate(newSelectedDate);

      // Update current month if needed to maintain consistency
      if (
        newSelectedDate.getMonth() !== currentMonth.getMonth() ||
        newSelectedDate.getFullYear() !== currentMonth.getFullYear()
      ) {
        setCurrentMonth(
          new Date(newSelectedDate.getFullYear(), newSelectedDate.getMonth(), 1)
        );
      }
    });
  };

  const goToNextWeek = () => {
    animateWeekTransition('next', () => {
      const newWeekStart = new Date(currentWeekStart);
      newWeekStart.setDate(currentWeekStart.getDate() + 7);
      setCurrentWeekStart(newWeekStart);

      // Preserve the same day of week selection in the new week
      const newSelectedDate = new Date(newWeekStart);
      newSelectedDate.setDate(newWeekStart.getDate() + selectedWeekDay);
      setSelectedDate(newSelectedDate);

      // Update current month if needed to maintain consistency
      if (
        newSelectedDate.getMonth() !== currentMonth.getMonth() ||
        newSelectedDate.getFullYear() !== currentMonth.getFullYear()
      ) {
        setCurrentMonth(
          new Date(newSelectedDate.getFullYear(), newSelectedDate.getMonth(), 1)
        );
      }
    });
  };

  // Day animation function
  const animateDayTransition = (direction, callback) => {
    // Start slide animation
    Animated.parallel([
      Animated.timing(daySlideAnimation, {
        toValue: direction === 'next' ? -100 : 100,
        duration: 200,
        useNativeDriver: false,
      }),
      Animated.timing(dayFadeAnimation, {
        toValue: 0.3,
        duration: 200,
        useNativeDriver: false,
      }),
    ]).start(() => {
      // Execute the day change
      callback();

      // Reset position and animate back
      daySlideAnimation.setValue(direction === 'next' ? 100 : -100);

      Animated.parallel([
        Animated.timing(daySlideAnimation, {
          toValue: 0,
          duration: 200,
          useNativeDriver: false,
        }),
        Animated.timing(dayFadeAnimation, {
          toValue: 1,
          duration: 200,
          useNativeDriver: false,
        }),
      ]).start();
    });
  };

  // Day navigation functions
  const goToPreviousDay = () => {
    animateDayTransition('previous', () => {
      const newDate = new Date(selectedDate);
      newDate.setDate(selectedDate.getDate() - 1);
      setSelectedDate(newDate);

      // Update current month if day is in different month
      if (
        newDate.getMonth() !== currentMonth.getMonth() ||
        newDate.getFullYear() !== currentMonth.getFullYear()
      ) {
        setCurrentMonth(newDate);
      }
    });
  };

  const goToNextDay = () => {
    animateDayTransition('next', () => {
      const newDate = new Date(selectedDate);
      newDate.setDate(selectedDate.getDate() + 1);
      setSelectedDate(newDate);

      // Update current month if day is in different month
      if (
        newDate.getMonth() !== currentMonth.getMonth() ||
        newDate.getFullYear() !== currentMonth.getFullYear()
      ) {
        setCurrentMonth(newDate);
      }
    });
  };

  // Swipe gesture handlers
  const handleTouchStart = (e) => {
    setTouchEnd(null); // Reset touchEnd
    setTouchStart(e.nativeEvent.pageX);
  };

  const handleTouchMove = (e) => {
    setTouchEnd(e.nativeEvent.pageX);
  };

  const handleTouchEnd = () => {
    if (!touchStart || !touchEnd) return;

    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > 50;
    const isRightSwipe = distance < -50;

    if (isLeftSwipe) {
      if (viewMode === 'month') {
        goToNextMonth();
      } else if (viewMode === 'week') {
        goToNextWeek();
      } else if (viewMode === 'day') {
        goToNextDay();
      }
    }
    if (isRightSwipe) {
      if (viewMode === 'month') {
        goToPreviousMonth();
      } else if (viewMode === 'week') {
        goToPreviousWeek();
      } else if (viewMode === 'day') {
        goToPreviousDay();
      }
    }
  };

  // Memoized event rendering component for better performance
  const renderEvent = useCallback(
    ({ item }) => {
      try {
        // Validate event item
        if (!item || typeof item !== 'object') {
          return (
            <Animated.View style={[styles.eventCard, { opacity: 0.5 }]}>
              <View style={[styles.eventIcon, { backgroundColor: '#FF6B6B' }]}>
                <Ionicons name='alert-circle' size={20} color='white' />
              </View>
              <View style={styles.eventInfo}>
                <Text style={styles.eventTitle}>Invalid Event Data</Text>
                <Text style={styles.eventTime}>Unable to load event</Text>
              </View>
            </Animated.View>
          );
        }

        // Get event children for color determination
        const eventChildren = getEventChildren(item);
        const primaryColor =
          eventChildren.length > 0 ? eventChildren[0].color : '#999999';

        // Safely get event title
        const eventTitle = item.title || 'Untitled Event';

        // Safely format event time
        let eventTime = 'Unknown time';
        try {
          eventTime = formatEventTime(item);
        } catch (timeError) {
          console.warn('Error formatting event time:', timeError);
          eventTime = item.isAllDay ? 'All day' : 'Time unavailable';
        }

        // Safely get event type icon
        let eventTypeIcon = 'calendar';
        try {
          eventTypeIcon = getEventTypeIcon(item.eventType);
        } catch (iconError) {
          console.warn('Error getting event type icon:', iconError);
        }

        return (
          <TouchableOpacity
            style={styles.eventCard}
            onPress={() => handleEventPress(item)}
            activeOpacity={0.7}
          >
            <Animated.View
              style={[styles.eventIcon, { backgroundColor: primaryColor }]}
            >
              <Ionicons name={eventTypeIcon} size={20} color='white' />
            </Animated.View>
            <View style={styles.eventInfo}>
              <View style={styles.eventTitleRow}>
                <Text style={styles.eventTitle} numberOfLines={1}>
                  {eventTitle}
                </Text>
                {isMultiDateEvent(item) && (
                  <View style={styles.multiDateEventBadge}>
                    <Ionicons name='link' size={12} color='#48b6b0' />
                  </View>
                )}
              </View>
              <Text style={styles.eventTime} numberOfLines={1}>
                {eventTime}
              </Text>
              {eventChildren.length > 1 && (
                <Text style={styles.eventChildren} numberOfLines={1}>
                  {eventChildren.map((child) => child.name).join(', ')}
                </Text>
              )}
              {isMultiDateEvent(item) && (
                <Text style={styles.multiDateEventInfo} numberOfLines={1}>
                  Part of {item.totalOccurrences || 'multi'}-date series
                </Text>
              )}
            </View>
            <Ionicons name='chevron-forward' size={20} color='#ccc' />
          </TouchableOpacity>
        );
      } catch (error) {
        console.error('Error rendering event:', error);
        // Return error fallback with animation
        return (
          <Animated.View style={[styles.eventCard, { opacity: 0.5 }]}>
            <View style={[styles.eventIcon, { backgroundColor: '#FF6B6B' }]}>
              <Ionicons name='alert-circle' size={20} color='white' />
            </View>
            <View style={styles.eventInfo}>
              <Text style={styles.eventTitle}>Error Loading Event</Text>
              <Text style={styles.eventTime}>Please try refreshing</Text>
            </View>
          </Animated.View>
        );
      }
    },
    [getEventChildren, handleEventPress]
  );

  const getSelectedWeekDays = () => {
    const startOfWeek = getWeekStart(selectedDate);
    return getWeekDays(startOfWeek);
  };

  // Enhanced day selection within current week with context preservation
  const handleWeekDaySelection = useCallback(
    (dayIndex) => {
      const weekStart = currentWeekStart || getWeekStart(selectedDate);
      const newSelectedDate = new Date(weekStart);
      newSelectedDate.setDate(weekStart.getDate() + dayIndex);

      setSelectedDate(newSelectedDate);
      setSelectedWeekDay(dayIndex);

      // Update current month if the selected day is in a different month
      if (
        newSelectedDate.getMonth() !== currentMonth.getMonth() ||
        newSelectedDate.getFullYear() !== currentMonth.getFullYear()
      ) {
        setCurrentMonth(
          new Date(newSelectedDate.getFullYear(), newSelectedDate.getMonth(), 1)
        );
      }
    },
    [currentWeekStart, selectedDate, currentMonth]
  );

  // Update selectedWeekDay when selectedDate changes to maintain weekly context
  useEffect(() => {
    if (viewMode === 'week') {
      const weekStart = currentWeekStart || getWeekStart(selectedDate);
      const daysDiff = Math.floor(
        (selectedDate - weekStart) / (1000 * 60 * 60 * 24)
      );
      if (daysDiff >= 0 && daysDiff <= 6) {
        setSelectedWeekDay(daysDiff);
      }
    }
  }, [selectedDate, currentWeekStart, viewMode]);

  const renderMonthView = () => {
    const monthDays = getCurrentMonthDays;

    return (
      <View style={styles.monthViewContainer}>
        <View style={styles.monthView}>
          <Animated.View
            style={[
              {
                transform: [
                  {
                    translateX: slideAnimation,
                  },
                ],
              },
            ]}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            <View style={styles.weekHeader}>
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                <Text key={day} style={styles.weekHeaderText}>
                  {day}
                </Text>
              ))}
            </View>
            <Animated.View
              style={[
                styles.monthGrid,
                {
                  opacity: fadeAnimation,
                },
              ]}
            >
              {monthDays.map((day, index) => {
                if (!day) {
                  return <View key={index} style={styles.monthDay} />;
                }

                const dayDate = new Date(
                  currentMonth.getFullYear(),
                  currentMonth.getMonth(),
                  day
                );
                const dayEvents = getEventsForDate(dayDate);

                return (
                  <TouchableOpacity
                    key={index}
                    style={[
                      styles.monthDay,
                      isDateToday(dayDate) && styles.todayMonth,
                      isSelectedDate(dayDate) && styles.selectedMonth,
                    ]}
                    onPress={() => setSelectedDate(dayDate)}
                  >
                    <Text
                      style={[
                        styles.monthDayText,
                        isDateToday(dayDate) && styles.todayText,
                        isSelectedDate(dayDate) && styles.selectedText,
                      ]}
                    >
                      {day}
                    </Text>
                    {renderEventIndicators(dayEvents, isSelectedDate(dayDate))}
                  </TouchableOpacity>
                );
              })}
            </Animated.View>
          </Animated.View>
        </View>
      </View>
    );
  };

  const renderWeekView = () => {
    const weekDays = getCalendarWeekDays();

    return (
      <View
        style={styles.weekContainer}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <Animated.View
          style={[
            {
              transform: [
                {
                  translateX: weekSlideAnimation,
                },
              ],
            },
          ]}
        >
          {/* Enhanced week navigation header */}
          <View style={styles.weekRangeHeader}>
            <TouchableOpacity
              style={styles.weekNavButton}
              onPress={goToPreviousWeek}
              testID='prev-week-button'
            >
              <Ionicons name='chevron-back' size={20} color='#48b6b0' />
            </TouchableOpacity>

            <TouchableOpacity onPress={goToCurrentWeek}>
              <Text style={styles.weekRangeText}>{getWeekRange()}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.weekNavButton}
              onPress={goToNextWeek}
              testID='next-week-button'
            >
              <Ionicons name='chevron-forward' size={20} color='#48b6b0' />
            </TouchableOpacity>
          </View>

          <View style={styles.weekHeader}>
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
              <Text key={day} style={styles.weekHeaderText}>
                {day}
              </Text>
            ))}
          </View>

          <Animated.View
            style={[
              styles.weekGrid,
              {
                opacity: weekFadeAnimation,
              },
            ]}
          >
            {weekDays.map((date, index) => {
              const dayEvents = getEventsForDate(date);
              const isSelected = isSelectedDate(date);
              const isToday = isDateToday(date);

              return (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.weekDay,
                    isSelected && styles.selectedWeekDay,
                    isToday && !isSelected && styles.todayWeekDay,
                  ]}
                  onPress={() => handleWeekDaySelection(index)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.weekDayText,
                      isSelected && styles.selectedWeekDayText,
                      isToday && !isSelected && styles.todayWeekDayText,
                    ]}
                  >
                    {date.getDate()}
                  </Text>
                  {renderEventIndicators(dayEvents, isSelected)}
                </TouchableOpacity>
              );
            })}
          </Animated.View>

          {/* Enhanced day navigation within week */}
          <View style={styles.weekDayNavigation}>
            <Text style={styles.selectedDayLabel}>
              {selectedDate.toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'short',
                day: 'numeric',
              })}
            </Text>
          </View>
        </Animated.View>
      </View>
    );
  };

  const renderDayView = () => {
    return (
      <View
        style={styles.dayView}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <Animated.View
          style={[
            {
              transform: [
                {
                  translateX: daySlideAnimation,
                },
              ],
            },
          ]}
        >
          <Animated.View
            style={[
              styles.dayViewHeader,
              {
                opacity: dayFadeAnimation,
              },
            ]}
          >
            <TouchableOpacity
              style={styles.dayNavButton}
              onPress={goToPreviousDay}
            >
              <Ionicons name='chevron-back' size={24} color='#48b6b0' />
            </TouchableOpacity>

            <View style={styles.dayViewDateContainer}>
              <Text style={styles.dayViewDate}>{formatDate(selectedDate)}</Text>
              <Text style={styles.dayViewTitle}>
                {selectedDate.toLocaleDateString('en-US', { weekday: 'long' })}
              </Text>
            </View>

            <TouchableOpacity style={styles.dayNavButton} onPress={goToNextDay}>
              <Ionicons name='chevron-forward' size={24} color='#48b6b0' />
            </TouchableOpacity>
          </Animated.View>
        </Animated.View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.monthYear}>
          {selectedDate.toLocaleDateString('en-US', {
            month: 'long',
            year: 'numeric',
          })}
        </Text>
        <View style={styles.headerButtons}>
          <TouchableOpacity
            style={styles.todayButton}
            onPress={() => {
              const today = new Date();
              setSelectedDate(today);
              setCurrentMonth(today); // Update current month to today's month

              if (viewMode === 'week') {
                // Navigate to current week and highlight today
                goToCurrentWeek();
                setSelectedWeekDay(today.getDay());
              } else if (viewMode === 'month') {
                // In month view, just select today
                setCurrentMonth(
                  new Date(today.getFullYear(), today.getMonth(), 1)
                );
              }
              // Day view automatically shows today when selectedDate is set
            }}
          >
            <Text style={styles.todayButtonText}>Today</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.addEventButton}
            onPress={() => setShowAddEventModal(true)}
          >
            <Ionicons name='add' size={20} color='white' />
          </TouchableOpacity>

          {/* <TouchableOpacity
            style={styles.remindersButton}
            onPress={() => {
              // TODO: Add reminders functionality
              console.log('Reminders button pressed');
            }}
          >
            <Ionicons name="notifications" size={20} color="white" />
          </TouchableOpacity> */}
        </View>
      </View>

      {/* View Mode Selector */}
      <View style={styles.viewModeSelector}>
        {['month', 'week', 'day'].map((mode) => (
          <TouchableOpacity
            key={mode}
            style={[
              styles.viewModeButton,
              viewMode === mode && styles.activeViewModeButton,
            ]}
            onPress={() => {
              const previousMode = viewMode;
              setViewMode(mode);

              if (mode === 'week') {
                // When switching to weekly view, preserve context and handle initial date selection
                const today = new Date();
                const currentWeekStart = getWeekStart(selectedDate);
                const todayWeekStart = getWeekStart(today);

                // Check if today is within the current week being displayed
                const isCurrentWeekDisplayed = isSameDay(
                  currentWeekStart,
                  todayWeekStart
                );

                if (isCurrentWeekDisplayed) {
                  // Today is within current week - default to today's events with today highlighted
                  setSelectedDate(today);
                  setSelectedWeekDay(today.getDay());
                  setCurrentWeekStart(todayWeekStart);
                } else {
                  // Today is not in current week - preserve current selected date and week context
                  setCurrentWeekStart(currentWeekStart);
                  const daysDiff = Math.floor(
                    (selectedDate - currentWeekStart) / (1000 * 60 * 60 * 24)
                  );
                  if (daysDiff >= 0 && daysDiff <= 6) {
                    setSelectedWeekDay(daysDiff);
                  } else {
                    // If selected date is not in the current week, default to first day of week
                    const firstDayOfWeek = new Date(currentWeekStart);
                    setSelectedDate(firstDayOfWeek);
                    setSelectedWeekDay(0);
                  }
                }
              } else if (mode === 'month') {
                // When switching to month view, ensure current month is set correctly
                setCurrentMonth(
                  new Date(
                    selectedDate.getFullYear(),
                    selectedDate.getMonth(),
                    1
                  )
                );
              } else if (mode === 'day') {
                // Day view keeps current selected date
                // Update current month if needed
                if (
                  selectedDate.getMonth() !== currentMonth.getMonth() ||
                  selectedDate.getFullYear() !== currentMonth.getFullYear()
                ) {
                  setCurrentMonth(
                    new Date(
                      selectedDate.getFullYear(),
                      selectedDate.getMonth(),
                      1
                    )
                  );
                }
              }
            }}
          >
            <Text
              style={[
                styles.viewModeText,
                viewMode === mode && styles.activeViewModeText,
              ]}
            >
              {mode.charAt(0).toUpperCase() + mode.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Calendar Views */}
      {viewMode === 'month' && renderMonthView()}
      {viewMode === 'week' && renderWeekView()}
      {viewMode === 'day' && renderDayView()}

      <View style={styles.eventsSection}>
        <View style={styles.eventsSectionHeader}>
          <Text style={styles.eventsTitle}>
            {viewMode === 'day'
              ? `Events`
              : // ? `Events for ${selectedDate.toLocaleDateString('en-US', {
              //     weekday: 'long',
              //     month: 'short',
              //     day: 'numeric',
              //   })}`
              viewMode === 'week'
              ? `Events`
              : // ? `Events for ${selectedDate.toLocaleDateString('en-US', {
              //     weekday: 'long',
              //     month: 'short',
              //     day: 'numeric',
              //   })}`
              viewMode === 'month'
              ? `Events`
              : // ? `Events for ${selectedDate.toLocaleDateString('en-US', {
                //     weekday: 'long',
                //     month: 'short',
                //     day: 'numeric',
                //   })}`
                'Upcoming Events'}
          </Text>
          {/* <TouchableOpacity onPress={() => setShowAddEventModal(true)}>
            <Ionicons name='add-circle' size={24} color='#48b6b0' />
          </TouchableOpacity> */}
        </View>

        <FlatList
          data={getFilteredEvents}
          renderItem={renderEvent}
          keyExtractor={(item) => item.id.toString()}
          showsVerticalScrollIndicator={false}
          style={styles.eventsList}
          scrollEventThrottle={16}
          removeClippedSubviews={true}
          maxToRenderPerBatch={10}
          windowSize={10}
          initialNumToRender={5}
          getItemLayout={(data, index) => ({
            length: 80,
            offset: 80 * index,
            index,
          })}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name='calendar-outline' size={48} color='#ccc' />
              <Text style={styles.emptyStateText}>
                {viewMode === 'day'
                  ? 'No events scheduled for this day'
                  : viewMode === 'week'
                  ? 'No events scheduled for this day'
                  : viewMode === 'month'
                  ? 'No events scheduled for this day'
                  : 'No upcoming events'}
              </Text>
            </View>
          }
        />
      </View>

      <AddEventModal
        visible={showAddEventModal}
        onClose={() => setShowAddEventModal(false)}
        onEventAdded={handleEventAdded}
        selectedDate={selectedDate}
      />

      <EventDetailModal
        visible={showEventDetailModal}
        onClose={() => {
          setShowEventDetailModal(false);
          setSelectedEvent(null);
        }}
        onEventDeleted={handleEventDeleted}
        onEventUpdated={(updatedEvent) => {
          // Update the event in the events array
          setEvents((prevEvents) =>
            prevEvents.map((event) =>
              event.id === updatedEvent.id ? updatedEvent : event
            )
          );
          // Update the selected event so the modal shows fresh data
          setSelectedEvent(updatedEvent);
        }}
        event={selectedEvent}
      />
    </View>
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
  },
  monthYear: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  todayButton: {
    backgroundColor: '#48b6b0',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 20,
  },
  todayButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  addEventButton: {
    backgroundColor: '#48b6b0',
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  remindersButton: {
    backgroundColor: '#48b6b0',
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // View Mode Selector
  viewModeSelector: {
    flexDirection: 'row',
    backgroundColor: 'white',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  viewModeButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginHorizontal: 4,
    borderRadius: 20,
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
  },
  activeViewModeButton: {
    backgroundColor: '#48b6b0',
  },
  viewModeText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },
  activeViewModeText: {
    color: 'white',
  },

  // Month View
  monthViewContainer: {
    backgroundColor: 'white',
    margin: 5,
    borderRadius: 10,
    overflow: 'hidden',
  },
  monthView: {
    padding: 8,
    position: 'relative',
  },

  expandButton: {
    position: 'absolute',
    top: 10,
    right: 15,
    zIndex: 1,
    padding: 5,
  },
  weekHeader: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 5,
  },
  weekHeaderText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
    textAlign: 'center',
    width: 40,
  },
  monthGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  monthDay: {
    width: '14.28%',
    height: 35,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 5,
    position: 'relative',
  },
  monthDayText: {
    fontSize: 22,
    color: '#333',
  },
  todayMonth: {
    backgroundColor: '#E3F2FD',
    borderRadius: 20,
  },
  selectedMonth: {
    backgroundColor: '#48b6b0',
    borderRadius: 20,
  },
  todayText: {
    color: '#48b6b0',
    fontWeight: 'bold',
  },
  selectedText: {
    color: 'white',
    fontWeight: 'bold',
  },

  // Week View - Enhanced with better navigation
  weekContainer: {
    backgroundColor: 'white',
    margin: 10,
    borderRadius: 10,
    padding: 15,
  },
  weekRangeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    marginBottom: 15,
  },
  weekNavButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: '#f8f9fa',
    minWidth: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekRangeText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
    flex: 1,
  },
  weekGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 15,
  },
  weekDay: {
    width: '14.28%',
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    borderRadius: 25,
    marginVertical: 5,
  },
  selectedWeekDay: {
    backgroundColor: '#48b6b0',
    shadowColor: '#48b6b0',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  todayWeekDay: {
    backgroundColor: '#E3F2FD',
    borderWidth: 2,
    borderColor: '#48b6b0',
  },
  weekDayText: {
    fontSize: 22,
    color: '#333',
    fontWeight: '400',
  },
  selectedWeekDayText: {
    color: 'white',
    fontWeight: 'bold',
  },
  todayWeekDayText: {
    color: '#48b6b0',
    fontWeight: 'bold',
  },
  weekDayNavigation: {
    alignItems: 'center',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  selectedDayLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: '#48b6b0',
    textAlign: 'center',
  },
  // Event Indicators
  eventIndicatorContainer: {
    position: 'absolute',
    bottom: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eventDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#48b6b0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectedEventDot: {
    backgroundColor: 'white',
  },
  multipleEventDots: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  eventCountIndicator: {
    minWidth: 16,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#48b6b0',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 3,
  },
  eventCountText: {
    fontSize: 6,
    fontWeight: 'bold',
    color: 'white',
    textAlign: 'center',
  },
  multiDateChainIcon: {
    width: 8,
    height: 8,
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 1,
    borderWidth: 0.5,
    borderColor: 'rgba(0, 0, 0, 0.1)',
  },

  // Day View
  dayView: {
    backgroundColor: 'white',
    margin: 5,
    borderRadius: 10,
    padding: 15,
  },
  dayViewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  dayNavButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
  },
  dayViewDateContainer: {
    alignItems: 'center',
    flex: 1,
  },
  dayViewDate: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
  },
  dayViewContent: {
    alignItems: 'center',
  },
  dayViewTitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  eventsSection: {
    flex: 1,
    backgroundColor: 'white',
    margin: 5,
    borderRadius: 10,
    padding: 12,
  },
  eventsSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  eventsTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
  },
  eventsList: {
    flex: 1,
  },
  eventCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    backgroundColor: '#f8f9fa',
    borderRadius: 10,
    marginBottom: 6,
  },
  eventIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  eventInfo: {
    flex: 1,
  },
  eventTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  eventTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    flex: 1,
  },
  multiDateEventBadge: {
    backgroundColor: '#E3F2FD',
    borderRadius: 8,
    paddingHorizontal: 4,
    paddingVertical: 2,
    marginLeft: 6,
  },
  eventTime: {
    fontSize: 14,
    color: '#666',
    marginBottom: 2,
  },
  eventChildren: {
    fontSize: 12,
    color: '#999',
    fontStyle: 'italic',
    marginBottom: 2,
  },
  multiDateEventInfo: {
    fontSize: 11,
    color: '#48b6b0',
    fontStyle: 'italic',
  },

  // Empty State
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyStateText: {
    fontSize: 16,
    color: '#999',
    marginTop: 10,
    textAlign: 'center',
  },
});
