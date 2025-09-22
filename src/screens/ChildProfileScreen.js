import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Switch,
  Alert,
  Modal,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import ChildrenDataService from '../services/ChildrenDataService';
import FamilyTimeService from '../services/FamilyTimeService';
import HolidayImportModal from '../components/HolidayImportModal';
import Base64Image from '../components/Base64Image';
import { useRequireAuth } from '../hooks/useAuthenticationGuard';

export default function ChildProfileScreen() {
  const navigation = useNavigation();

  // Authentication guard with enhanced error handling
  const {
    isAuthenticated,
    isLoading: authLoading,
    error: authError,
    userId,
    isRefreshing: authRefreshing,
    canRetry: canRetryAuth,
    retry: retryAuth,
    shouldShowContent,
    shouldShowLoading: shouldShowAuthLoading,
    shouldShowError: shouldShowAuthError,
    shouldShowRetry: shouldShowAuthRetry,
    getErrorMessage,
    isRecoverableError,
  } = useRequireAuth({
    redirectOnUnauthenticated: true,
    maxRetryAttempts: 3,
    retryDelay: 1000,
    enableProactiveRefresh: true,
  });

  const [selectedChild, setSelectedChild] = useState(0);
  const [children, setChildren] = useState([]);
  const [loading, setLoading] = useState(true);
  const [familyTimeStatsLoading, setFamilyTimeStatsLoading] = useState(false);
  const [familyTimeStatsError, setFamilyTimeStatsError] = useState(null);
  const [holidayImportModalVisible, setHolidayImportModalVisible] =
    useState(false);
  const [feelingStatsModalVisible, setFeelingStatsModalVisible] =
    useState(false);
  const [familyTimeDetailsVisible, setFamilyTimeDetailsVisible] =
    useState(false);
  const [familyTimeStatsModalVisible, setFamilyTimeStatsModalVisible] =
    useState(false);

  // Feeling counters state - now stores data for all children
  const [allChildrenFeelings, setAllChildrenFeelings] = useState({});

  // Family Time statistics state
  const [familyTimeStats, setFamilyTimeStats] = useState({});
  const [recentActivities, setRecentActivities] = useState([]);

  useEffect(() => {
    loadChildren();
  }, []);

  // Reload family time stats when selected child changes or authentication state changes
  useEffect(() => {
    if (children.length > 0 && isAuthenticated && !authLoading) {
      // Clear any previous authentication errors
      if (familyTimeStatsError && familyTimeStatsError.isAuthError) {
        setFamilyTimeStatsError(null);
      }
      loadFamilyTimeStats();
    } else if (!isAuthenticated) {
      setFamilyTimeStats({});
      setRecentActivities([]);
    }
  }, [selectedChild, isAuthenticated, authLoading, userId]);

  // Reload children data when screen comes into focus
  useFocusEffect(
    React.useCallback(() => {
      loadChildren();
    }, [])
  );

  // Handle tab focus for authentication and family time stats
  useFocusEffect(
    React.useCallback(() => {
      // Add a small delay to ensure authentication state is properly updated
      const focusTimeout = setTimeout(() => {
        // If authenticated and we have children, load family time stats
        if (isAuthenticated && !authLoading && children.length > 0) {
          // Clear any previous authentication errors since we're now authenticated
          if (familyTimeStatsError && familyTimeStatsError.isAuthError) {
            setFamilyTimeStatsError(null);
          }
          loadFamilyTimeStats();
        } else if (!isAuthenticated && !authLoading) {
          setFamilyTimeStats({});
          setRecentActivities([]);
        }
      }, 100); // Small delay to ensure state is updated

      return () => {
        clearTimeout(focusTimeout);
      };
    }, [
      isAuthenticated,
      authLoading,
      children.length,
      userId,
      familyTimeStatsError,
    ])
  );

  const loadChildren = async () => {
    try {
      setLoading(true);
      const storedChildren = await ChildrenDataService.getChildren();
      setChildren(storedChildren);

      // Reset selected child index if it's out of bounds
      if (storedChildren.length === 0) {
        setSelectedChild(0);
      } else if (selectedChild >= storedChildren.length) {
        setSelectedChild(Math.max(0, storedChildren.length - 1));
      }

      // Load feeling data
      await loadFeelingData();

      // Load family time statistics
      await loadFamilyTimeStats();
    } catch (error) {
      console.error('Error loading children:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadFeelingData = async () => {
    try {
      const storedFeelings = await AsyncStorage.getItem(
        'children-feeling.json'
      );
      if (storedFeelings) {
        setAllChildrenFeelings(JSON.parse(storedFeelings));
      }
    } catch (error) {
      console.error('Error loading feeling data:', error);
    }
  };

  const loadFamilyTimeStats = async (isRetry = false) => {
    try {
      // Only proceed if authenticated
      if (!isAuthenticated) {
        console.log(
          '[ChildProfileScreen] Skipping family time stats loading - not authenticated',
          {
            isAuthenticated,
            authLoading,
            userId,
            shouldShowContent,
          }
        );
        setFamilyTimeStats({});
        setRecentActivities([]);
        return;
      }

      if (!isRetry) {
        setFamilyTimeStatsLoading(true);
        setFamilyTimeStatsError(null);
      }

      // Get the current children list
      const currentChildren = await ChildrenDataService.getChildren();

      if (!currentChildren || currentChildren.length === 0) {
        setFamilyTimeStats({});
        setRecentActivities([]);
        return;
      }

      const statsPromises = currentChildren.map(async (child) => {
        try {
          const stats = await FamilyTimeService.getChildActivityStats(child.id);
          return { childId: child.id, stats };
        } catch (error) {
          console.error(`Error loading stats for child ${child.id}:`, error);

          // Check if this is an authentication error
          if (error.message && error.message.includes('not authenticated')) {
            throw error; // Re-throw authentication errors to be handled at the top level
          }

          return { childId: child.id, stats: null };
        }
      });

      const allStats = await Promise.all(statsPromises);
      const statsMap = {};

      if (allStats && Array.isArray(allStats)) {
        allStats.forEach((result) => {
          if (result && result.childId) {
            statsMap[result.childId] = result.stats || {
              totalActivities: 0,
              activityTypeBreakdown: {
                'Reading Time': 0,
                Sports: 0,
                Adventure: 0,
                Important: 0,
              },
              emotionPatterns: {
                Exciting: 0,
                Happy: 0,
                Sad: 0,
              },
              totalDuration: 0,
            };
          }
        });
      }

      setFamilyTimeStats(statsMap);

      // Load recent activities for enhanced statistics
      try {
        const activities = await FamilyTimeService.getRecentActivities(50); // Get more for better analysis
        setRecentActivities(activities || []);
      } catch (error) {
        console.error('Error loading recent activities:', error);

        // Check if this is an authentication error
        if (error.message && error.message.includes('not authenticated')) {
          throw error; // Re-throw authentication errors to be handled at the top level
        }

        setRecentActivities([]);
      }

      // Clear any previous errors on successful load
      setFamilyTimeStatsError(null);
    } catch (error) {
      console.error('Error loading family time stats:', error);

      // Set appropriate error state
      const errorMessage =
        error.message && error.message.includes('not authenticated')
          ? 'Authentication required to load family time statistics'
          : 'Failed to load family time statistics';

      setFamilyTimeStatsError({
        message: errorMessage,
        isAuthError:
          error.message && error.message.includes('not authenticated'),
        canRetry: true,
      });

      setFamilyTimeStats({});
      setRecentActivities([]);
    } finally {
      setFamilyTimeStatsLoading(false);
    }
  };

  // Retry function for family time stats loading
  const retryFamilyTimeStats = async () => {
    console.log('[ChildProfileScreen] Retrying family time stats loading...');

    // If this is an authentication error, first try to retry authentication
    if (familyTimeStatsError && familyTimeStatsError.isAuthError) {
      console.log(
        '[ChildProfileScreen] Authentication error detected, retrying authentication first'
      );
      try {
        const authSuccess = await retryAuth();
        if (authSuccess) {
          await loadFamilyTimeStats(true);
        } else {
          console.log('[ChildProfileScreen] Authentication retry failed');
        }
      } catch (error) {
        console.error(
          '[ChildProfileScreen] Error during authentication retry:',
          error
        );
      }
    } else {
      // Regular retry for non-authentication errors
      await loadFamilyTimeStats(true);
    }
  };

  const saveFeelingData = async (updatedFeelings) => {
    try {
      await AsyncStorage.setItem(
        'children-feeling.json',
        JSON.stringify(updatedFeelings)
      );
    } catch (error) {
      console.error('Error saving feeling data:', error);
    }
  };

  const getGenderEmoji = (gender) => {
    return gender === 'girl' ? '👧' : '👦';
  };

  const calculateAge = (birthday) => {
    if (!birthday) return 'Age not set';

    try {
      const [day, month, year] = birthday
        .split('/')
        .map((num) => parseInt(num));
      if (!day || !month || !year) return 'Age not set';

      const birthDate = new Date(year, month - 1, day);
      const today = new Date();

      let age = today.getFullYear() - birthDate.getFullYear();
      const monthDiff = today.getMonth() - birthDate.getMonth();

      if (
        monthDiff < 0 ||
        (monthDiff === 0 && today.getDate() < birthDate.getDate())
      ) {
        age--;
      }

      return age >= 0 ? age : 'Age not set';
    } catch (error) {
      return 'Age not set';
    }
  };

  const getChildDisplayName = (child) => {
    return child.nickname || child.firstName;
  };

  const getChildFullName = (child) => {
    return `${child.firstName} ${child.lastName}`;
  };

  const updateFeelingCount = async (feeling, increment = true) => {
    const currentChild = children[selectedChild];
    if (!currentChild) return;

    const childId = currentChild.id;
    const currentFeelings = allChildrenFeelings[childId] || {
      exciting: 0,
      happy: 0,
      sad: 0,
      records: [],
    };

    const newCount = Math.max(
      0,
      currentFeelings[feeling] + (increment ? 1 : -1)
    );

    // Update records array to maintain consistency
    let updatedRecords = [...(currentFeelings.records || [])];

    if (increment) {
      // Add a new record when incrementing
      updatedRecords.push({
        feeling: feeling,
        datetime: new Date().toISOString(),
        value: 1,
      });
    } else {
      // Remove the most recent record of this feeling type when decrementing
      const lastIndex = updatedRecords
        .map((r) => r.feeling)
        .lastIndexOf(feeling);
      if (lastIndex !== -1) {
        updatedRecords.splice(lastIndex, 1);
      }
    }

    const updatedChildFeelings = {
      ...currentFeelings,
      [feeling]: newCount,
      records: updatedRecords,
    };

    const updatedAllFeelings = {
      ...allChildrenFeelings,
      [childId]: updatedChildFeelings,
    };

    setAllChildrenFeelings(updatedAllFeelings);
    await saveFeelingData(updatedAllFeelings);
  };

  const getCurrentChildFeelings = () => {
    const currentChild = children[selectedChild];
    if (!currentChild) return { exciting: 0, happy: 0, sad: 0 };

    return (
      allChildrenFeelings[currentChild.id] || {
        exciting: 0,
        happy: 0,
        sad: 0,
      }
    );
  };

  const getCurrentChildFamilyTimeStats = () => {
    const currentChild = children[selectedChild];
    if (!currentChild) {
      return {
        totalActivities: 0,
        activityTypeBreakdown: {
          'Reading Time': 0,
          Sports: 0,
          Adventure: 0,
          Important: 0,
        },
        emotionPatterns: {
          Exciting: 0,
          Happy: 0,
          Sad: 0,
        },
        totalDuration: 0,
      };
    }

    const stats = familyTimeStats[currentChild.id];
    if (!stats) {
      return {
        totalActivities: 0,
        activityTypeBreakdown: {
          'Reading Time': 0,
          Sports: 0,
          Adventure: 0,
          Important: 0,
        },
        emotionPatterns: {
          Exciting: 0,
          Happy: 0,
          Sad: 0,
        },
        totalDuration: 0,
      };
    }

    return stats;
  };

  // Enhanced statistics calculation
  const getEnhancedFamilyTimeStats = () => {
    const currentChild = children[selectedChild];
    if (!currentChild || !recentActivities) {
      return {
        weeklyAverage: 0,
        averageDuration: 0,
        thisWeekActivities: 0,
        weeklyTrend: 0,
        recentActivities: [],
        longestActivity: 0,
        shortestActivity: 0,
        mostActiveDay: null,
        favoriteActivity: null,
        thisMonthActivities: 0,
        lastMonthActivities: 0,
        thisMonthDuration: 0,
        lastMonthDuration: 0,
        monthlyTrend: 0,
      };
    }

    const childActivities = recentActivities.filter(
      (activity) =>
        activity.participants &&
        activity.participants.some((p) => p.childId === currentChild.id)
    );

    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const twoMonthsAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

    // This week activities
    const thisWeekActivities = childActivities.filter(
      (activity) => new Date(activity.startTime) >= oneWeekAgo
    ).length;

    // Last week activities
    const lastWeekActivities = childActivities.filter((activity) => {
      const activityDate = new Date(activity.startTime);
      return activityDate >= twoWeeksAgo && activityDate < oneWeekAgo;
    }).length;

    // This month activities
    const thisMonthActivities = childActivities.filter(
      (activity) => new Date(activity.startTime) >= oneMonthAgo
    ).length;

    // Last month activities
    const lastMonthActivities = childActivities.filter((activity) => {
      const activityDate = new Date(activity.startTime);
      return activityDate >= twoMonthsAgo && activityDate < oneMonthAgo;
    }).length;

    // Calculate durations
    const durations = childActivities.map((activity) =>
      calculateActivityDuration(activity)
    );
    const totalDuration = durations.reduce(
      (sum, duration) => sum + duration,
      0
    );
    const averageDuration =
      childActivities.length > 0 ? totalDuration / childActivities.length : 0;

    const thisMonthDuration = childActivities
      .filter((activity) => new Date(activity.startTime) >= oneMonthAgo)
      .reduce((sum, activity) => sum + calculateActivityDuration(activity), 0);

    const lastMonthDuration = childActivities
      .filter((activity) => {
        const activityDate = new Date(activity.startTime);
        return activityDate >= twoMonthsAgo && activityDate < oneMonthAgo;
      })
      .reduce((sum, activity) => sum + calculateActivityDuration(activity), 0);

    // Weekly average (over last 4 weeks)
    const fourWeeksAgo = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);
    const lastFourWeeksActivities = childActivities.filter(
      (activity) => new Date(activity.startTime) >= fourWeeksAgo
    ).length;
    const weeklyAverage = lastFourWeeksActivities / 4;

    // Most active day
    const dayCount = {};
    childActivities.forEach((activity) => {
      const day = new Date(activity.startTime).toLocaleDateString('en-US', {
        weekday: 'long',
      });
      dayCount[day] = (dayCount[day] || 0) + 1;
    });
    const mostActiveDay = Object.keys(dayCount).reduce(
      (a, b) => (dayCount[a] > dayCount[b] ? a : b),
      null
    );

    // Favorite activity type
    const typeCount = {};
    childActivities.forEach((activity) => {
      typeCount[activity.type] = (typeCount[activity.type] || 0) + 1;
    });
    const favoriteActivity = Object.keys(typeCount).reduce(
      (a, b) => (typeCount[a] > typeCount[b] ? a : b),
      null
    );

    return {
      weeklyAverage,
      averageDuration,
      thisWeekActivities,
      weeklyTrend: thisWeekActivities - lastWeekActivities,
      recentActivities: childActivities.sort(
        (a, b) => new Date(b.startTime) - new Date(a.startTime)
      ),
      longestActivity: durations.length > 0 ? Math.max(...durations) : 0,
      shortestActivity: durations.length > 0 ? Math.min(...durations) : 0,
      mostActiveDay,
      favoriteActivity,
      thisMonthActivities,
      lastMonthActivities,
      thisMonthDuration,
      lastMonthDuration,
      monthlyTrend: thisMonthActivities - lastMonthActivities,
    };
  };

  // Helper functions for enhanced statistics
  const calculateActivityDuration = (activity) => {
    const startTime = new Date(activity.startTime);
    const endTime = new Date(activity.endTime);
    return Math.round((endTime - startTime) / (1000 * 60)); // minutes
  };

  const formatActivityDate = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;

    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    });
  };

  const getEmotionPercentage = (emotion, stats) => {
    const total = Object.values(stats.emotionPatterns).reduce(
      (sum, count) => sum + count,
      0
    );
    if (total === 0) return 0;
    return Math.round((stats.emotionPatterns[emotion] / total) * 100);
  };

  const getEmotionInsight = (emotionPatterns) => {
    const total = Object.values(emotionPatterns).reduce(
      (sum, count) => sum + count,
      0
    );
    if (total === 0) return 'No emotional data yet';

    const positiveEmotions =
      (emotionPatterns.Exciting || 0) + (emotionPatterns.Happy || 0);
    const positivePercentage = Math.round((positiveEmotions / total) * 100);

    if (positivePercentage >= 80)
      return `${positivePercentage}% positive experiences - Excellent!`;
    if (positivePercentage >= 60)
      return `${positivePercentage}% positive experiences - Great!`;
    if (positivePercentage >= 40)
      return `${positivePercentage}% positive experiences - Good balance`;
    return `${positivePercentage}% positive experiences - Room for improvement`;
  };

  // Statistical functions for monthly comparison
  const getMonthlyFeelingCounts = (feeling) => {
    const currentChild = children[selectedChild];
    if (!currentChild) return { thisMonth: 0, lastMonth: 0 };

    const childFeelings = allChildrenFeelings[currentChild.id];
    if (!childFeelings || !childFeelings.records)
      return { thisMonth: 0, lastMonth: 0 };

    const now = new Date();
    const thisMonth = now.getMonth();
    const thisYear = now.getFullYear();

    // Calculate last month (handle year boundary)
    let lastMonth = thisMonth - 1;
    let lastMonthYear = thisYear;
    if (lastMonth < 0) {
      lastMonth = 11;
      lastMonthYear = thisYear - 1;
    }

    const records = childFeelings.records || [];

    const thisMonthCount = records.filter((record) => {
      const recordDate = new Date(record.datetime);
      return (
        recordDate.getMonth() === thisMonth &&
        recordDate.getFullYear() === thisYear &&
        record.feeling === feeling
      );
    }).length;

    const lastMonthCount = records.filter((record) => {
      const recordDate = new Date(record.datetime);
      return (
        recordDate.getMonth() === lastMonth &&
        recordDate.getFullYear() === lastMonthYear &&
        record.feeling === feeling
      );
    }).length;

    return { thisMonth: thisMonthCount, lastMonth: lastMonthCount };
  };

  const getFormattedFeelingCount = (feeling) => {
    const { thisMonth, lastMonth } = getMonthlyFeelingCounts(feeling);
    return `${thisMonth} / ${lastMonth}`;
  };

  const updateFeelingValue = async (feeling, newValue) => {
    const currentChild = children[selectedChild];
    if (!currentChild) return;

    const childId = currentChild.id;
    const currentFeelings = allChildrenFeelings[childId] || {
      exciting: 0,
      happy: 0,
      sad: 0,
      records: [],
    };

    const sanitizedValue = Math.max(0, newValue); // Ensure non-negative
    const currentValue = currentFeelings[feeling] || 0;
    const difference = sanitizedValue - currentValue;

    // Update records array to match the new value
    let updatedRecords = [...(currentFeelings.records || [])];

    if (difference > 0) {
      // Add records for the increase
      for (let i = 0; i < difference; i++) {
        updatedRecords.push({
          feeling: feeling,
          datetime: new Date().toISOString(),
          value: 1,
        });
      }
    } else if (difference < 0) {
      // Remove records for the decrease (remove most recent ones of this feeling type)
      const recordsToRemove = Math.abs(difference);
      for (let i = 0; i < recordsToRemove; i++) {
        const lastIndex = updatedRecords
          .map((r) => r.feeling)
          .lastIndexOf(feeling);
        if (lastIndex !== -1) {
          updatedRecords.splice(lastIndex, 1);
        }
      }
    }

    const updatedChildFeelings = {
      ...currentFeelings,
      [feeling]: sanitizedValue,
      records: updatedRecords,
    };

    const updatedAllFeelings = {
      ...allChildrenFeelings,
      [childId]: updatedChildFeelings,
    };

    setAllChildrenFeelings(updatedAllFeelings);
    await saveFeelingData(updatedAllFeelings);
  };

  const resetAllChildFeelingData = () => {
    const currentChild = children[selectedChild];
    if (!currentChild) return;

    Alert.alert(
      'Reset All Feeling Data',
      `Are you sure you want to reset all feeling data for ${getChildDisplayName(
        currentChild
      )}? This will delete all records and cannot be undone.`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Reset All',
          style: 'destructive',
          onPress: async () => {
            const childId = currentChild.id;
            const updatedAllFeelings = {
              ...allChildrenFeelings,
              [childId]: {
                exciting: 0,
                happy: 0,
                sad: 0,
                records: [],
              },
            };
            setAllChildrenFeelings(updatedAllFeelings);
            await saveFeelingData(updatedAllFeelings);
          },
        },
      ]
    );
  };

  const getTotalFeelings = () => {
    const currentChild = children[selectedChild];
    if (!currentChild) return 0;

    const childFeelings = allChildrenFeelings[currentChild.id];
    if (!childFeelings) return 0;

    // If records exist, use them for total count (more accurate)
    if (childFeelings.records && childFeelings.records.length > 0) {
      return childFeelings.records.length;
    }

    // Fallback to direct counters if no records
    return (
      (childFeelings.exciting || 0) +
      (childFeelings.happy || 0) +
      (childFeelings.sad || 0)
    );
  };

  const getFeelingPercentage = (feeling) => {
    const currentChild = children[selectedChild];
    if (!currentChild) return 0;

    const childFeelings = allChildrenFeelings[currentChild.id];
    if (!childFeelings) return 0;

    const total = getTotalFeelings();
    if (total === 0) return 0;

    let feelingCount = 0;

    // If records exist, count from records (more accurate)
    if (childFeelings.records && childFeelings.records.length > 0) {
      feelingCount = childFeelings.records.filter(
        (record) => record.feeling === feeling
      ).length;
    } else {
      // Fallback to direct counters
      feelingCount = childFeelings[feeling] || 0;
    }

    return Math.round((feelingCount / total) * 100);
  };

  const resetChildFeelings = () => {
    const currentChild = children[selectedChild];
    if (!currentChild) return;

    Alert.alert(
      'Reset Feelings',
      `Are you sure you want to reset all feeling counters for ${getChildDisplayName(
        currentChild
      )}?`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            const childId = currentChild.id;
            const resetFeelings = {
              exciting: 0,
              happy: 0,
              sad: 0,
            };

            const updatedAllFeelings = {
              ...allChildrenFeelings,
              [childId]: resetFeelings,
            };

            setAllChildrenFeelings(updatedAllFeelings);
            await saveFeelingData(updatedAllFeelings);
          },
        },
      ]
    );
  };

  const formatDuration = (minutes) => {
    if (minutes < 60) {
      return `${minutes}m`;
    }
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return remainingMinutes > 0
      ? `${hours}h ${remainingMinutes}m`
      : `${hours}h`;
  };

  const getActivityTypeIcon = (type) => {
    const iconMap = {
      'Reading Time': 'book-outline',
      Sports: 'fitness-outline',
      Adventure: 'map-outline',
      Important: 'star-outline',
    };
    return iconMap[type] || 'ellipse-outline';
  };

  const getActivityTypeColor = (type) => {
    const colorMap = {
      'Reading Time': '#4CAF50',
      Sports: '#FF9800',
      Adventure: '#2196F3',
      Important: '#F44336',
    };
    return colorMap[type] || '#666';
  };

  const getChildInterests = (child) => {
    const interests = [];

    // Add hobbies
    if (child.hobbies && child.hobbies.length > 0) {
      interests.push(...child.hobbies);
    }
    if (child.customHobbies && child.customHobbies.length > 0) {
      interests.push(...child.customHobbies);
    }

    // Add sports
    if (child.favourSports && child.favourSports.length > 0) {
      interests.push(...child.favourSports);
    }
    if (child.customSports && child.customSports.length > 0) {
      interests.push(...child.customSports);
    }

    // Add cartoons as interests
    if (child.favourCartoons && child.favourCartoons.length > 0) {
      interests.push(...child.favourCartoons);
    }
    if (child.customCartoons && child.customCartoons.length > 0) {
      interests.push(...child.customCartoons);
    }

    return interests.length > 0 ? interests : ['No interests added'];
  };

  // Ensure we have a valid current child
  const currentChild = children[selectedChild];

  // If currentChild is undefined, show loading or empty state
  if (!currentChild && children.length > 0) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <Text style={styles.loadingText}>Loading child profile...</Text>
      </View>
    );
  }

  const renderStatBar = (label, value, color) => (
    <View style={styles.statItem}>
      <Text style={styles.statLabel}>{label}</Text>
      <View style={styles.statBarContainer}>
        <View
          style={[
            styles.statBar,
            { width: `${value}%`, backgroundColor: color },
          ]}
        />
      </View>
      <Text style={styles.statValue}>{value}%</Text>
    </View>
  );

  // Show authentication loading state
  if (shouldShowAuthLoading) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <ActivityIndicator size='large' color='#48b6b0' />
        <Text style={styles.loadingText}>Authenticating...</Text>
        {authRefreshing && (
          <Text style={styles.subLoadingText}>
            Refreshing authentication...
          </Text>
        )}
      </View>
    );
  }

  // Show authentication error state
  if (shouldShowAuthError) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <Ionicons name='alert-circle-outline' size={64} color='#FF6B6B' />
        <Text style={styles.errorTitle}>Authentication Error</Text>
        <Text style={styles.errorMessage}>{getErrorMessage()}</Text>
        {shouldShowAuthRetry && (
          <TouchableOpacity style={styles.retryButton} onPress={retryAuth}>
            <Ionicons name='refresh-outline' size={20} color='#fff' />
            <Text style={styles.retryButtonText}>Retry Authentication</Text>
          </TouchableOpacity>
        )}
        {isRecoverableError() && (
          <Text style={styles.errorHint}>
            This error can be recovered. Please try again.
          </Text>
        )}
      </View>
    );
  }

  // Only show content if authenticated
  if (!shouldShowContent) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <Text style={styles.loadingText}>Waiting for authentication...</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <ActivityIndicator size='large' color='#48b6b0' />
        <Text style={styles.loadingText}>Loading children profiles...</Text>
      </View>
    );
  }

  if (children.length === 0) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <Ionicons name='people-outline' size={64} color='#ccc' />
        <Text style={styles.emptyStateTitle}>No Children Added</Text>
        <Text style={styles.emptyStateText}>
          Add children profiles in the Manage Children tab to view them here
        </Text>
      </View>
    );
  }

  // Additional safety check for currentChild
  if (!currentChild) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <Text style={styles.loadingText}>Loading child profile...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {/* Child Selector */}
      <View style={styles.childSelector}>
        {children.map((child, index) => (
          <TouchableOpacity
            key={child.id}
            style={[
              styles.childTab,
              selectedChild === index && [
                styles.selectedChildTab,
                { borderBottomColor: child.favourColor },
              ],
            ]}
            onPress={() => setSelectedChild(index)}
          >
            {child.photo ? (
              <Base64Image
                source={{ uri: child.photo }}
                style={styles.childTabPhoto}
              />
            ) : (
              <Text style={styles.childAvatar}>
                {getGenderEmoji(child.gender)}
              </Text>
            )}
            <Text
              style={[
                styles.childTabName,
                selectedChild === index && [
                  styles.selectedChildTabName,
                  { color: child.favourColor },
                ],
              ]}
            >
              {getChildDisplayName(child)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Profile Header */}
      {/* <View style={styles.profileHeader}>
        <View style={styles.avatarContainer}>
          {currentChild.photo ? (
            <Image
              source={{ uri: currentChild.photo }}
              style={styles.profilePhoto}
            />
          ) : (
            <Text style={styles.profileAvatar}>
              {getGenderEmoji(currentChild.gender)}
            </Text>
          )}
        </View>
        <View style={styles.profileInfo}>
          <Text style={styles.profileName}>
            {getChildFullName(currentChild)}
          </Text>
          <Text style={styles.profileDetails}>
            {calculateAge(currentChild.birthday)} years old
            {currentChild.birthday && ` • Born ${currentChild.birthday}`}
          </Text>
          <Text style={styles.profileSchool}>
            {currentChild.primarySchool ||
              currentChild.secondarySchool ||
              'School not specified'}
          </Text>
        </View>
        <TouchableOpacity style={styles.editButton}>
          <Ionicons name='create-outline' size={20} color='#48b6b0' />
        </TouchableOpacity>
      </View> */}

      {/* Feeling */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Feeling Garden</Text>
          <TouchableOpacity
            style={styles.detailButton}
            onPress={() => setFeelingStatsModalVisible(true)}
          >
            <Ionicons name='analytics' size={20} color='#48b6b0' />
          </TouchableOpacity>
        </View>
        <View style={styles.feelingContainer}>
          <TouchableOpacity
            style={styles.feelingColumn}
            onPress={() => updateFeelingCount('exciting')}
          >
            <Ionicons name='star' size={32} color='#FFD700' />
            <Text style={styles.feelingLabel}>Exciting</Text>
            <View style={styles.feelingCountContainer}>
              <Text style={styles.feelingCountLarge}>
                {getMonthlyFeelingCounts('exciting').thisMonth}
              </Text>
              <Text style={styles.feelingCountSmall}>
                / {getMonthlyFeelingCounts('exciting').lastMonth}
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.feelingColumn}
            onPress={() => updateFeelingCount('happy')}
          >
            <Ionicons name='happy' size={32} color='#4CAF50' />
            <Text style={styles.feelingLabel}>Happy</Text>
            <View style={styles.feelingCountContainer}>
              <Text style={styles.feelingCountLarge}>
                {getMonthlyFeelingCounts('happy').thisMonth}
              </Text>
              <Text style={styles.feelingCountSmall}>
                / {getMonthlyFeelingCounts('happy').lastMonth}
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.feelingColumn}
            onPress={() => updateFeelingCount('sad')}
          >
            <Ionicons name='sad' size={32} color='#FF6B6B' />
            <Text style={styles.feelingLabel}>Sad</Text>
            <View style={styles.feelingCountContainer}>
              <Text style={styles.feelingCountLarge}>
                {getMonthlyFeelingCounts('sad').thisMonth}
              </Text>
              <Text style={styles.feelingCountSmall}>
                / {getMonthlyFeelingCounts('sad').lastMonth}
              </Text>
            </View>
          </TouchableOpacity>
        </View>
        {/* <Text style={styles.feelingSubtitle}>This Month / Last Month</Text> */}
      </View>

      {/* Family Time */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Farmily Time</Text>
          <TouchableOpacity
            style={styles.detailButton}
            onPress={() => setFamilyTimeStatsModalVisible(true)}
          >
            <Ionicons name='analytics' size={20} color='#48b6b0' />
          </TouchableOpacity>
        </View>

        {(() => {
          // Show loading state for family time stats
          if (familyTimeStatsLoading) {
            return (
              <View style={styles.familyTimeLoadingState}>
                <ActivityIndicator size='small' color='#48b6b0' />
                <Text style={styles.familyTimeLoadingText}>
                  Loading family time statistics...
                </Text>
              </View>
            );
          }

          // Show error state for family time stats
          if (familyTimeStatsError) {
            return (
              <View style={styles.familyTimeErrorState}>
                <Ionicons
                  name={
                    familyTimeStatsError.isAuthError
                      ? 'lock-closed-outline'
                      : 'alert-circle-outline'
                  }
                  size={48}
                  color='#FF6B6B'
                />
                <Text style={styles.familyTimeErrorTitle}>
                  {familyTimeStatsError.isAuthError
                    ? 'Authentication Required'
                    : 'Loading Error'}
                </Text>
                <Text style={styles.familyTimeErrorText}>
                  {familyTimeStatsError.message}
                </Text>
                {familyTimeStatsError.canRetry && (
                  <TouchableOpacity
                    style={styles.familyTimeRetryButton}
                    onPress={retryFamilyTimeStats}
                  >
                    <Ionicons name='refresh-outline' size={16} color='#fff' />
                    <Text style={styles.familyTimeRetryButtonText}>Retry</Text>
                  </TouchableOpacity>
                )}
                {familyTimeStatsError.isAuthError && (
                  <TouchableOpacity
                    style={styles.familyTimeAuthRetryButton}
                    onPress={retryAuth}
                  >
                    <Ionicons name='key-outline' size={16} color='#fff' />
                    <Text style={styles.familyTimeRetryButtonText}>
                      Re-authenticate
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          }

          const stats = getCurrentChildFamilyTimeStats();
          const enhancedStats = getEnhancedFamilyTimeStats();

          if (!stats || stats.totalActivities === 0) {
            return (
              <View style={styles.familyTimeEmptyState}>
                <Ionicons name='calendar-outline' size={48} color='#ccc' />
                <Text style={styles.familyTimeEmptyTitle}>
                  No Family Time Activities
                </Text>
                <Text style={styles.familyTimeEmptyText}>
                  {getChildDisplayName(currentChild)} hasn't participated in any
                  family time activities yet.
                </Text>
              </View>
            );
          }

          return (
            <View>
              {/* Enhanced Summary Stats */}
              <View style={styles.familyTimeSummary}>
                <View style={styles.familyTimeSummaryItem}>
                  <Text style={styles.familyTimeSummaryNumber}>
                    {stats.totalActivities}
                  </Text>
                  <Text style={styles.familyTimeSummaryLabel}>
                    Total Activities
                  </Text>
                  {enhancedStats.weeklyAverage > 0 && (
                    <Text style={styles.familyTimeSummarySubtext}>
                      ~{enhancedStats.weeklyAverage.toFixed(1)}/week
                    </Text>
                  )}
                </View>
                <View style={styles.familyTimeSummaryDivider} />
                <View style={styles.familyTimeSummaryItem}>
                  <Text style={styles.familyTimeSummaryNumber}>
                    {formatDuration(stats.totalDuration)}
                  </Text>
                  <Text style={styles.familyTimeSummaryLabel}>Total Time</Text>
                  {enhancedStats.averageDuration > 0 && (
                    <Text style={styles.familyTimeSummarySubtext}>
                      ~{formatDuration(enhancedStats.averageDuration)} avg
                    </Text>
                  )}
                </View>
                <View style={styles.familyTimeSummaryDivider} />
                <View style={styles.familyTimeSummaryItem}>
                  <Text style={styles.familyTimeSummaryNumber}>
                    {enhancedStats.thisWeekActivities}
                  </Text>
                  <Text style={styles.familyTimeSummaryLabel}>This Week</Text>
                  {enhancedStats.weeklyTrend !== 0 && (
                    <Text
                      style={[
                        styles.familyTimeSummarySubtext,
                        {
                          color:
                            enhancedStats.weeklyTrend > 0
                              ? '#4CAF50'
                              : '#FF6B6B',
                        },
                      ]}
                    >
                      {enhancedStats.weeklyTrend > 0 ? '+' : ''}
                      {enhancedStats.weeklyTrend}
                    </Text>
                  )}
                </View>
              </View>
            </View>
          );
        })()}
      </View>

      {/* Interests */}
      {/* <View style={styles.section}>
        <Text style={styles.sectionTitle}>Interests & Hobbies</Text>
        <View style={styles.interestsContainer}>
          {getChildInterests(currentChild).map((interest, index) => (
            <View key={index} style={styles.interestTag}>
              <Text style={styles.interestText}>{interest}</Text>
            </View>
          ))}
        </View>
      </View> */}

      {/* Holiday Import */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Calendar</Text>
        <TouchableOpacity
          style={styles.holidayImportButton}
          onPress={() => setHolidayImportModalVisible(true)}
        >
          <View style={styles.holidayImportContent}>
            <Ionicons name='camera' size={24} color='#48b6b0' />
            <View style={styles.holidayImportText}>
              <Text style={styles.holidayImportTitle}>
                Import School Holidays
              </Text>
              <Text style={styles.holidayImportSubtitle}>
                Take/Select a photo of a school holiday calendar to import
              </Text>
            </View>
          </View>
        </TouchableOpacity>
      </View>

      {/* Holiday Import Modal */}
      {currentChild && (
        <HolidayImportModal
          visible={holidayImportModalVisible}
          onClose={() => setHolidayImportModalVisible(false)}
          childId={currentChild.id}
          childName={getChildDisplayName(currentChild)}
        />
      )}

      {/* Enhanced Feeling Statistics Modal */}
      {currentChild && (
        <Modal
          visible={feelingStatsModalVisible}
          animationType='slide'
          presentationStyle='pageSheet'
          onRequestClose={() => setFeelingStatsModalVisible(false)}
        >
          <View style={styles.statsModalContainer}>
            {/* Enhanced Header */}
            <View style={styles.statsModalHeader}>
              <View
                style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}
              >
                <Ionicons
                  name='analytics'
                  size={24}
                  color='#48b6b0'
                  style={{ marginRight: 12 }}
                />
                <Text style={styles.statsModalTitle}>
                  {/* {getChildDisplayName(currentChild)}'s Feeling Statistics */}
                  Feeling Garden Statistics

                </Text>
              </View>
              <TouchableOpacity
                style={styles.statsModalCloseButton}
                onPress={() => setFeelingStatsModalVisible(false)}
                activeOpacity={0.7}
              >
                <Ionicons name='close' size={20} color='#6c757d' />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.statsModalContent}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 40 }}
            >
              {/* Quick Summary Overview */}
              <View
                style={[
                  styles.statsSection,
                  { marginBottom: 16, backgroundColor: '#f8f9ff' },
                ]}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 16,
                  }}
                >
                  <Ionicons
                    name='pie-chart'
                    size={24}
                    color='#48b6b0'
                    style={{ marginRight: 8 }}
                  />
                  <Text style={[styles.statsSectionTitle, { marginBottom: 0 }]}>
                    Quick Overview
                  </Text>
                </View>
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-around',
                    alignItems: 'center',
                  }}
                >
                  <View style={{ alignItems: 'center' }}>
                    <Text
                      style={{
                        fontSize: 32,
                        fontWeight: '800',
                        color: '#48b6b0',
                        marginBottom: 4,
                      }}
                    >
                      {getTotalFeelings()}
                    </Text>
                    <Text
                      style={{
                        fontSize: 14,
                        color: '#6c757d',
                        fontWeight: '600',
                      }}
                    >
                      Total Feelings
                    </Text>
                  </View>
                  <View
                    style={{ width: 1, height: 40, backgroundColor: '#e9ecef' }}
                  />
                  <View style={{ alignItems: 'center' }}>
                    <Text
                      style={{
                        fontSize: 20,
                        fontWeight: '700',
                        color: '#f57c00',
                        marginBottom: 2,
                      }}
                    >
                      {getFeelingPercentage('exciting')}%
                    </Text>
                    <Text style={{ fontSize: 12, color: '#6c757d' }}>
                      Exciting
                    </Text>
                  </View>
                  <View style={{ alignItems: 'center' }}>
                    <Text
                      style={{
                        fontSize: 20,
                        fontWeight: '700',
                        color: '#2e7d32',
                        marginBottom: 2,
                      }}
                    >
                      {getFeelingPercentage('happy')}%
                    </Text>
                    <Text style={{ fontSize: 12, color: '#6c757d' }}>
                      Happy
                    </Text>
                  </View>
                  <View style={{ alignItems: 'center' }}>
                    <Text
                      style={{
                        fontSize: 20,
                        fontWeight: '700',
                        color: '#c62828',
                        marginBottom: 2,
                      }}
                    >
                      {getFeelingPercentage('sad')}%
                    </Text>
                    <Text style={{ fontSize: 12, color: '#6c757d' }}>Sad</Text>
                  </View>
                </View>
              </View>

              {/* Enhanced Summary Cards with Trend Indicators */}
              <View style={styles.statsSummaryContainer}>
                <View style={styles.statsSummaryCard}>
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginBottom: 16,
                    }}
                  >
                    <Ionicons
                      name='calendar'
                      size={20}
                      color='#48b6b0'
                      style={{ marginRight: 8 }}
                    />
                    <Text style={styles.statsSummaryTitle}>This Month</Text>
                  </View>
                  <View style={styles.statsSummaryRow}>
                    <Text style={styles.statsSummaryLabel}>⭐ Exciting</Text>
                    <View
                      style={{ flexDirection: 'row', alignItems: 'center' }}
                    >
                      <Text style={styles.statsSummaryValue}>
                        {getMonthlyFeelingCounts('exciting').thisMonth}
                      </Text>
                      {getMonthlyFeelingCounts('exciting').thisMonth >
                        getMonthlyFeelingCounts('exciting').lastMonth}
                    </View>
                  </View>
                  <View style={styles.statsSummaryRow}>
                    <Text style={styles.statsSummaryLabel}>😊 Happy</Text>
                    <View
                      style={{ flexDirection: 'row', alignItems: 'center' }}
                    >
                      <Text style={styles.statsSummaryValue}>
                        {getMonthlyFeelingCounts('happy').thisMonth}
                      </Text>
                      {getMonthlyFeelingCounts('happy').thisMonth >
                        getMonthlyFeelingCounts('happy').lastMonth}
                    </View>
                  </View>
                  <View style={styles.statsSummaryRow}>
                    <Text style={styles.statsSummaryLabel}>😢 Sad</Text>
                    <View
                      style={{ flexDirection: 'row', alignItems: 'center' }}
                    >
                      <Text style={styles.statsSummaryValue}>
                        {getMonthlyFeelingCounts('sad').thisMonth}
                      </Text>
                      {getMonthlyFeelingCounts('sad').thisMonth <
                        getMonthlyFeelingCounts('sad').lastMonth && (
                        <Ionicons
                          name='trending-down'
                          size={16}
                          color='#28a745'
                          style={{ marginLeft: 6 }}
                        />
                      )}
                    </View>
                  </View>
                </View>

                <View style={styles.statsSummaryCard}>
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginBottom: 16,
                    }}
                  >
                    <Ionicons
                      name='time'
                      size={20}
                      color='#6c757d'
                      style={{ marginRight: 8 }}
                    />
                    <Text style={styles.statsSummaryTitle}>Last Month</Text>
                  </View>
                  <View style={styles.statsSummaryRow}>
                    <Text style={styles.statsSummaryLabel}>⭐ Exciting</Text>
                    <Text style={styles.statsSummaryValue}>
                      {getMonthlyFeelingCounts('exciting').lastMonth}
                    </Text>
                  </View>
                  <View style={styles.statsSummaryRow}>
                    <Text style={styles.statsSummaryLabel}>😊 Happy</Text>
                    <Text style={styles.statsSummaryValue}>
                      {getMonthlyFeelingCounts('happy').lastMonth}
                    </Text>
                  </View>
                  <View style={styles.statsSummaryRow}>
                    <Text style={styles.statsSummaryLabel}>😢 Sad</Text>
                    <Text style={styles.statsSummaryValue}>
                      {getMonthlyFeelingCounts('sad').lastMonth}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Enhanced Manual Update Section */}
              <View style={styles.statsSection}>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 20,
                  }}
                >
                  <Ionicons
                    name='create'
                    size={24}
                    color='#48b6b0'
                    style={{ marginRight: 8 }}
                  />
                  <Text style={styles.statsSectionTitle}>Manual Update</Text>
                </View>
                <View style={styles.statsUpdateContainer}>
                  {/* Exciting Update Row */}
                  <View
                    style={[
                      styles.statsUpdateRow,
                      {
                        backgroundColor: '#fff8e1',
                        padding: 16,
                        borderRadius: 12,
                      },
                    ]}
                  >
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        flex: 1,
                      }}
                    >
                      <View
                        style={{
                          backgroundColor: '#FFD700',
                          padding: 6,
                          borderRadius: 12,
                          marginRight: 12,
                        }}
                      >
                        <Ionicons name='star' size={20} color='white' />
                      </View>
                      <Text style={styles.statsUpdateLabel}>Exciting</Text>
                    </View>
                    <View style={styles.statsUpdateControls}>
                      <TouchableOpacity
                        style={[
                          styles.statsUpdateButton,
                          {
                            backgroundColor: '#ffebee',
                            borderColor: '#ffcdd2',
                          },
                        ]}
                        onPress={() => updateFeelingCount('exciting', false)}
                        activeOpacity={0.7}
                      >
                        <Ionicons name='remove' size={20} color='#d32f2f' />
                      </TouchableOpacity>
                      <TextInput
                        style={[
                          styles.statsUpdateInput,
                          { borderColor: '#f57c00' },
                        ]}
                        value={getCurrentChildFeelings().exciting.toString()}
                        onChangeText={(value) =>
                          updateFeelingValue('exciting', parseInt(value) || 0)
                        }
                        keyboardType='numeric'
                        selectTextOnFocus={true}
                      />
                      <TouchableOpacity
                        style={[
                          styles.statsUpdateButton,
                          {
                            backgroundColor: '#e8f5e8',
                            borderColor: '#c8e6c9',
                          },
                        ]}
                        onPress={() => updateFeelingCount('exciting', true)}
                        activeOpacity={0.7}
                      >
                        <Ionicons name='add' size={20} color='#2e7d32' />
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* Happy Update Row */}
                  <View
                    style={[
                      styles.statsUpdateRow,
                      {
                        backgroundColor: '#e8f5e8',
                        padding: 16,
                        borderRadius: 12,
                      },
                    ]}
                  >
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        flex: 1,
                      }}
                    >
                      <View
                        style={{
                          backgroundColor: '#4CAF50',
                          padding: 6,
                          borderRadius: 12,
                          marginRight: 12,
                        }}
                      >
                        <Ionicons name='happy' size={20} color='white' />
                      </View>
                      <Text style={styles.statsUpdateLabel}>Happy</Text>
                    </View>
                    <View style={styles.statsUpdateControls}>
                      <TouchableOpacity
                        style={[
                          styles.statsUpdateButton,
                          {
                            backgroundColor: '#ffebee',
                            borderColor: '#ffcdd2',
                          },
                        ]}
                        onPress={() => updateFeelingCount('happy', false)}
                        activeOpacity={0.7}
                      >
                        <Ionicons name='remove' size={20} color='#d32f2f' />
                      </TouchableOpacity>
                      <TextInput
                        style={[
                          styles.statsUpdateInput,
                          { borderColor: '#2e7d32' },
                        ]}
                        value={getCurrentChildFeelings().happy.toString()}
                        onChangeText={(value) =>
                          updateFeelingValue('happy', parseInt(value) || 0)
                        }
                        keyboardType='numeric'
                        selectTextOnFocus={true}
                      />
                      <TouchableOpacity
                        style={[
                          styles.statsUpdateButton,
                          {
                            backgroundColor: '#e8f5e8',
                            borderColor: '#c8e6c9',
                          },
                        ]}
                        onPress={() => updateFeelingCount('happy', true)}
                        activeOpacity={0.7}
                      >
                        <Ionicons name='add' size={20} color='#2e7d32' />
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* Sad Update Row */}
                  <View
                    style={[
                      styles.statsUpdateRow,
                      {
                        backgroundColor: '#ffebee',
                        padding: 16,
                        borderRadius: 12,
                      },
                    ]}
                  >
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        flex: 1,
                      }}
                    >
                      <View
                        style={{
                          backgroundColor: '#FF6B6B',
                          padding: 6,
                          borderRadius: 12,
                          marginRight: 12,
                        }}
                      >
                        <Ionicons name='sad' size={20} color='white' />
                      </View>
                      <Text style={styles.statsUpdateLabel}>Sad</Text>
                    </View>
                    <View style={styles.statsUpdateControls}>
                      <TouchableOpacity
                        style={[
                          styles.statsUpdateButton,
                          {
                            backgroundColor: '#ffebee',
                            borderColor: '#ffcdd2',
                          },
                        ]}
                        onPress={() => updateFeelingCount('sad', false)}
                        activeOpacity={0.7}
                      >
                        <Ionicons name='remove' size={20} color='#d32f2f' />
                      </TouchableOpacity>
                      <TextInput
                        style={[
                          styles.statsUpdateInput,
                          { borderColor: '#c62828' },
                        ]}
                        value={getCurrentChildFeelings().sad.toString()}
                        onChangeText={(value) =>
                          updateFeelingValue('sad', parseInt(value) || 0)
                        }
                        keyboardType='numeric'
                        selectTextOnFocus={true}
                      />
                      <TouchableOpacity
                        style={[
                          styles.statsUpdateButton,
                          {
                            backgroundColor: '#e8f5e8',
                            borderColor: '#c8e6c9',
                          },
                        ]}
                        onPress={() => updateFeelingCount('sad', true)}
                        activeOpacity={0.7}
                      >
                        <Ionicons name='add' size={20} color='#2e7d32' />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              </View>

              {/* Enhanced Reset Section */}
              <View style={styles.statsSection}>

                <TouchableOpacity
                  style={styles.statsResetAllButton}
                  onPress={() => resetAllChildFeelingData()}
                  activeOpacity={0.8}
                >
                  <Ionicons name='trash' size={20} color='#FFF' />
                  <Text style={styles.statsResetAllText}>
                    Reset All Feeling Data
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </Modal>
      )}

      {/* Enhanced Family Time Statistics Modal */}
      {currentChild && (
        <Modal
          visible={familyTimeStatsModalVisible}
          animationType='slide'
          presentationStyle='pageSheet'
          onRequestClose={() => setFamilyTimeStatsModalVisible(false)}
        >
          <View style={styles.statsModalContainer}>
            {/* Enhanced Header */}
            <View style={styles.statsModalHeader}>
              <View
                style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}
              >
                <Ionicons
                  name='analytics'
                  size={24}
                  color='#48b6b0'
                  style={{ marginRight: 12 }}
                />
                <Text style={styles.statsModalTitle}>
                  {/* {getChildDisplayName(currentChild)}'s Farmily Time Statistics */}
                  Farmily Time Statistics
                </Text>
              </View>
              <TouchableOpacity
                style={styles.statsModalCloseButton}
                onPress={() => setFamilyTimeStatsModalVisible(false)}
                activeOpacity={0.7}
              >
                <Ionicons name='close' size={20} color='#6c757d' />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.statsModalContent}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 40 }}
            >
              {(() => {
                const stats = getCurrentChildFamilyTimeStats();
                const enhancedStats = getEnhancedFamilyTimeStats();

                if (!stats || stats.totalActivities === 0) {
                  return (
                    <View style={styles.familyTimeEmptyState}>
                      <Ionicons
                        name='calendar-outline'
                        size={48}
                        color='#ccc'
                      />
                      <Text style={styles.familyTimeEmptyTitle}>
                        No Farmily Time Activities
                      </Text>
                      <Text style={styles.familyTimeEmptyText}>
                        {getChildDisplayName(currentChild)} hasn't participated
                        in any family time activities yet.
                      </Text>
                    </View>
                  );
                }

                return (
                  <View>
                    {/* Activity Type Breakdown with Enhanced Info */}
                    <View style={styles.familyTimeBreakdown}>
                      <Text style={styles.familyTimeBreakdownTitle}>
                        Activity Types
                      </Text>
                      <View style={styles.familyTimeTypeGrid}>
                        {stats.activityTypeBreakdown &&
                          Object.entries(stats.activityTypeBreakdown).map(
                            ([type, count]) => {
                              const percentage =
                                stats.totalActivities > 0
                                  ? (
                                      (count / stats.totalActivities) *
                                      100
                                    ).toFixed(0)
                                  : 0;
                              return (
                                <View
                                  key={type}
                                  style={styles.familyTimeTypeItem}
                                >
                                  <View
                                    style={[
                                      styles.familyTimeTypeIcon,
                                      {
                                        backgroundColor:
                                          getActivityTypeColor(type),
                                      },
                                    ]}
                                  >
                                    <Ionicons
                                      name={getActivityTypeIcon(type)}
                                      size={16}
                                      color='white'
                                    />
                                  </View>
                                  <Text style={styles.familyTimeTypeCount}>
                                    {count || 0}
                                  </Text>
                                  <Text style={styles.familyTimeTypeLabel}>
                                    {type}
                                  </Text>
                                  <Text style={styles.familyTimeTypePercentage}>
                                    {percentage}%
                                  </Text>
                                </View>
                              );
                            }
                          )}
                      </View>
                    </View>

                    {/* Enhanced Emotion Patterns */}
                    <View style={styles.familyTimeEmotions}>
                      <Text style={styles.familyTimeBreakdownTitle}>
                        Emotional Experience
                      </Text>
                      <View style={styles.familyTimeEmotionGrid}>
                        <View style={styles.familyTimeEmotionItem}>
                          <Ionicons name='star' size={24} color='#FFD700' />
                          <Text style={styles.familyTimeEmotionCount}>
                            {stats.emotionPatterns?.Exciting || 0}
                          </Text>
                          <Text style={styles.familyTimeEmotionLabel}>
                            Exciting
                          </Text>
                          <View
                            style={[
                              styles.emotionBar,
                              {
                                width: `${getEmotionPercentage(
                                  'Exciting',
                                  stats
                                )}%`,
                                backgroundColor: '#FFD700',
                              },
                            ]}
                          />
                        </View>
                        <View style={styles.familyTimeEmotionItem}>
                          <Ionicons name='happy' size={24} color='#4CAF50' />
                          <Text style={styles.familyTimeEmotionCount}>
                            {stats.emotionPatterns?.Happy || 0}
                          </Text>
                          <Text style={styles.familyTimeEmotionLabel}>
                            Happy
                          </Text>
                          <View
                            style={[
                              styles.emotionBar,
                              {
                                width: `${getEmotionPercentage(
                                  'Happy',
                                  stats
                                )}%`,
                                backgroundColor: '#4CAF50',
                              },
                            ]}
                          />
                        </View>
                        <View style={styles.familyTimeEmotionItem}>
                          <Ionicons name='sad' size={24} color='#FF6B6B' />
                          <Text style={styles.familyTimeEmotionCount}>
                            {stats.emotionPatterns?.Sad || 0}
                          </Text>
                          <Text style={styles.familyTimeEmotionLabel}>Sad</Text>
                          <View
                            style={[
                              styles.emotionBar,
                              {
                                width: `${getEmotionPercentage('Sad', stats)}%`,
                                backgroundColor: '#FF6B6B',
                              },
                            ]}
                          />
                        </View>
                      </View>
                      <Text style={styles.emotionInsight}>
                        {getEmotionInsight(stats.emotionPatterns)}
                      </Text>
                    </View>

                    {/* Expandable Detailed Statistics */}
                    <View style={styles.familyTimeDetails}>
                      {/* Recent Activities */}
                      <View style={styles.recentActivitiesSection}>
                        <Text style={styles.familyTimeBreakdownTitle}>
                          Recent Activities
                        </Text>
                        {enhancedStats.recentActivities.length > 0 ? (
                          enhancedStats.recentActivities
                            .slice(0, 5)
                            .map((activity, index) => (
                              <View
                                key={activity.id || index}
                                style={styles.recentActivityItem}
                              >
                                <View style={styles.recentActivityHeader}>
                                  <View
                                    style={[
                                      styles.activityTypeIndicator,
                                      {
                                        backgroundColor: getActivityTypeColor(
                                          activity.type
                                        ),
                                      },
                                    ]}
                                  />
                                  <Text style={styles.recentActivityType}>
                                    {activity.type}
                                  </Text>
                                  <Text style={styles.recentActivityDate}>
                                    {formatActivityDate(activity.startTime)}
                                  </Text>
                                </View>
                                <Text style={styles.recentActivityDuration}>
                                  {formatDuration(
                                    calculateActivityDuration(activity)
                                  )}{' '}
                                  • {activity.location || 'No location'}
                                </Text>
                                {activity.remarks && (
                                  <Text
                                    style={styles.recentActivityRemarks}
                                    numberOfLines={2}
                                  >
                                    "{activity.remarks}"
                                  </Text>
                                )}
                                <View style={styles.recentActivityFeelings}>
                                  {activity.participants
                                    .filter(
                                      (p) => p.childId === currentChild.id
                                    )
                                    .map((participant, pIndex) => (
                                      <View
                                        key={pIndex}
                                        style={styles.feelingChip}
                                      >
                                        <Text style={styles.feelingChipText}>
                                          {participant.feeling}
                                        </Text>
                                      </View>
                                    ))}
                                </View>
                              </View>
                            ))
                        ) : (
                          <Text style={styles.noRecentActivities}>
                            No recent activities found
                          </Text>
                        )}
                      </View>

                      {/* Time Analysis */}
                      <View style={styles.timeAnalysisSection}>
                        <Text style={styles.familyTimeBreakdownTitle}>
                          Time Analysis
                        </Text>
                        <View style={styles.timeAnalysisGrid}>
                          <View style={styles.timeAnalysisItem}>
                            <Text style={styles.timeAnalysisLabel}>
                              Longest Activity
                            </Text>
                            <Text style={styles.timeAnalysisValue}>
                              {formatDuration(enhancedStats.longestActivity)}
                            </Text>
                          </View>
                          <View style={styles.timeAnalysisItem}>
                            <Text style={styles.timeAnalysisLabel}>
                              Shortest Activity
                            </Text>
                            <Text style={styles.timeAnalysisValue}>
                              {formatDuration(enhancedStats.shortestActivity)}
                            </Text>
                          </View>
                          <View style={styles.timeAnalysisItem}>
                            <Text style={styles.timeAnalysisLabel}>
                              Most Active Day
                            </Text>
                            <Text style={styles.timeAnalysisValue}>
                              {enhancedStats.mostActiveDay || 'N/A'}
                            </Text>
                          </View>
                          <View style={styles.timeAnalysisItem}>
                            <Text style={styles.timeAnalysisLabel}>
                              Favorite Activity
                            </Text>
                            <Text style={styles.timeAnalysisValue}>
                              {enhancedStats.favoriteActivity || 'N/A'}
                            </Text>
                          </View>
                        </View>
                      </View>

                      {/* Monthly Comparison */}
                      <View style={styles.monthlyComparisonSection}>
                        <Text style={styles.familyTimeBreakdownTitle}>
                          Monthly Comparison
                        </Text>
                        <View style={styles.monthlyComparisonGrid}>
                          <View style={styles.monthlyComparisonItem}>
                            <Text style={styles.monthlyComparisonLabel}>
                              This Month
                            </Text>
                            <Text style={styles.monthlyComparisonValue}>
                              {enhancedStats.thisMonthActivities} activities
                            </Text>
                            <Text style={styles.monthlyComparisonTime}>
                              {formatDuration(enhancedStats.thisMonthDuration)}
                            </Text>
                          </View>
                          <View style={styles.monthlyComparisonDivider} />
                          <View style={styles.monthlyComparisonItem}>
                            <Text style={styles.monthlyComparisonLabel}>
                              Last Month
                            </Text>
                            <Text style={styles.monthlyComparisonValue}>
                              {enhancedStats.lastMonthActivities} activities
                            </Text>
                            <Text style={styles.monthlyComparisonTime}>
                              {formatDuration(enhancedStats.lastMonthDuration)}
                            </Text>
                          </View>
                        </View>
                        {enhancedStats.monthlyTrend !== 0 && (
                          <Text
                            style={[
                              styles.monthlyTrendText,
                              {
                                color:
                                  enhancedStats.monthlyTrend > 0
                                    ? '#4CAF50'
                                    : '#FF6B6B',
                              },
                            ]}
                          >
                            {enhancedStats.monthlyTrend > 0 ? '↗' : '↘'}
                            {Math.abs(enhancedStats.monthlyTrend)} activities vs
                            last month
                          </Text>
                        )}
                      </View>
                    </View>
                  </View>
                );
              })()}
            </ScrollView>
          </View>
        </Modal>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  centerContent: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  loadingText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  subLoadingText: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    marginTop: 8,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FF6B6B',
    marginTop: 20,
    marginBottom: 10,
    textAlign: 'center',
  },
  errorMessage: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 20,
  },
  errorHint: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    marginTop: 10,
    fontStyle: 'italic',
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#48b6b0',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 10,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
    marginLeft: 8,
  },
  emptyStateTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 20,
    marginBottom: 10,
    textAlign: 'center',
  },
  emptyStateText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 24,
  },
  childSelector: {
    flexDirection: 'row',
    backgroundColor: 'white',
    paddingVertical: 10,
  },
  childTab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 15,
  },
  selectedChildTab: {
    borderBottomWidth: 3,
    borderBottomColor: '#48b6b0',
  },
  childAvatar: {
    fontSize: 24,
    marginBottom: 5,
  },
  childTabPhoto: {
    width: 30,
    height: 30,
    borderRadius: 15,
    marginBottom: 5,
  },
  childTabName: {
    fontSize: 14,
    color: '#666',
  },
  selectedChildTabName: {
    color: '#48b6b0',
    fontWeight: '600',
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    padding: 20,
    marginTop: 10,
  },
  avatarContainer: {
    marginRight: 15,
  },
  profileAvatar: {
    fontSize: 60,
  },
  profilePhoto: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
  },
  profileDetails: {
    fontSize: 16,
    color: '#666',
    marginTop: 2,
  },
  profileSchool: {
    fontSize: 14,
    color: '#999',
    marginTop: 2,
  },
  editButton: {
    padding: 10,
  },
  section: {
    backgroundColor: 'white',
    margin: 10,
    padding: 20,
    borderRadius: 10,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 5,
    color: '#333',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 5,
  },
  detailButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: '#f0f8ff',
    borderWidth: 1,
    borderColor: '#b3d9ff',
  },
  resetButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: '#ffebee',
    borderWidth: 1,
    borderColor: '#ffcdd2',
  },
  statItem: {
    marginBottom: 5,
  },
  statLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 5,
  },
  statBarContainer: {
    height: 8,
    backgroundColor: '#e0e0e0',
    borderRadius: 4,
    marginBottom: 5,
  },
  statBar: {
    height: '100%',
    borderRadius: 4,
  },
  statValue: {
    fontSize: 12,
    color: '#333',
    textAlign: 'right',
  },
  interestsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  interestTag: {
    backgroundColor: '#e3f2fd',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 15,
    marginRight: 8,
    marginBottom: 8,
  },
  interestText: {
    color: '#1976d2',
    fontSize: 14,
  },
  feelingContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 10,
  },
  feelingColumn: {
    alignItems: 'center',
    flex: 1,
    paddingVertical: 15,
    borderRadius: 10,
    backgroundColor: '#f8f9fa',
    marginHorizontal: 5,
  },
  feelingLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginTop: 8,
    marginBottom: 4,
  },
  feelingCount: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#48b6b0',
  },
  feelingCountContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
  },
  feelingCountLarge: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#48b6b0',
  },
  feelingCountSmall: {
    fontSize: 18,
    fontWeight: '500',
    color: '#666',
    marginLeft: 2,
  },
  feelingSubtitle: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
    marginTop: 10,
    fontStyle: 'italic',
  },

  flowerAnimationContainer: {
    width: 350,
    height: 350,
    borderRadius: 30,
    overflow: 'hidden',
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 8,
  },
  flowerAnimation: {
    width: '100%',
    height: '100%',
    backgroundColor: 'transparent',
  },
  flowerInfo: {
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  gardenFeelingContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 15,
    paddingHorizontal: 10,
    marginTop: 10,
  },
  gardenFeelingColumn: {
    alignItems: 'center',
    flex: 1,
    paddingVertical: 12,
    borderRadius: 15,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    marginHorizontal: 5,
    borderWidth: 1,
    borderColor: 'rgba(46, 125, 50, 0.2)',
  },
  gardenFeelingLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2e7d32',
    marginTop: 6,
    marginBottom: 3,
  },
  gardenFeelingCount: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1b5e20',
  },
  flowerPlaceholder: {
    alignItems: 'center',
    paddingVertical: 25,
    backgroundColor: 'linear-gradient(135deg, #e8f5e8 0%, #f0f8ff 100%)',
    borderRadius: 20,
    width: '100%',
    borderWidth: 2,
    borderColor: '#e1f5fe',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  flowerIconContainer: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 15,
  },
  sparkleIcon1: {
    position: 'absolute',
    top: -10,
    right: -15,
  },
  sparkleIcon2: {
    position: 'absolute',
    bottom: -5,
    left: -20,
  },
  flowerText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2e7d32',
    marginBottom: 5,
    textAlign: 'center',
  },
  flowerSubtext: {
    fontSize: 14,
    color: '#666',
    marginBottom: 15,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  flowerStats: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 20,
  },
  flowerStat: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 15,
  },
  flowerStatText: {
    fontSize: 12,
    color: '#555',
    marginLeft: 5,
    fontWeight: '500',
  },
  achievementItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  achievementIcon: {
    fontSize: 24,
    marginRight: 15,
  },
  achievementInfo: {
    flex: 1,
  },
  achievementTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  achievementDate: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  infoText: {
    fontSize: 14,
    color: '#333',
    marginLeft: 10,
  },
  settingItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  settingText: {
    fontSize: 16,
    color: '#333',
  },
  holidayImportButton: {
    backgroundColor: '#f8f9fa',
    borderRadius: 10,
    padding: 15,
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  holidayImportContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  holidayImportText: {
    flex: 1,
    marginLeft: 15,
  },
  holidayImportTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 2,
  },
  holidayImportSubtitle: {
    fontSize: 14,
    color: '#666',
    lineHeight: 18,
  },

  // Enhanced Statistics Modal Styles
  statsModalContainer: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  statsModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statsModalTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#2c3e50',
    flex: 1,
  },
  statsModalCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f8f9fa',
    justifyContent: 'center',
    alignItems: 'center',
  },
  statsModalContent: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
    backgroundColor: 'white',
  },

  // Enhanced Summary Cards
  statsSummaryContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  statsSummaryCard: {
    flex: 1,
    backgroundColor: 'white',
    padding: 20,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#f1f3f4',
  },
  statsSummaryTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2c3e50',
    marginBottom: 16,
    textAlign: 'center',
  },
  statsSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingVertical: 4,
  },
  statsSummaryLabel: {
    fontSize: 16,
    color: '#495057',
    fontWeight: '500',
  },
  statsSummaryValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#48b6b0',
  },

  // Enhanced All Time Statistics
  statsSection: {
    backgroundColor: 'white',
    padding: 24,
    borderRadius: 16,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#f1f3f4',
  },
  statsSectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#2c3e50',
    marginBottom: 20,
    textAlign: 'center',
  },

  // Enhanced Update Controls
  statsUpdateContainer: {
    gap: 20,
  },
  statsUpdateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  statsUpdateLabel: {
    fontSize: 18,
    color: '#2c3e50',
    fontWeight: '600',
    flex: 1,
  },
  statsUpdateControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  statsUpdateButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#f8f9fa',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#e9ecef',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  statsUpdateInput: {
    width: 80,
    height: 44,
    borderWidth: 2,
    borderColor: '#e9ecef',
    borderRadius: 12,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '600',
    backgroundColor: 'white',
    color: '#2c3e50',
  },

  // Enhanced Reset Button
  statsResetAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#dc3545',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    gap: 12,
    shadowColor: '#dc3545',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  statsResetAllText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '700',
  },

  // Family Time Statistics Styles
  familyTimeEmptyState: {
    alignItems: 'center',
    paddingVertical: 30,
  },
  familyTimeEmptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginTop: 15,
    marginBottom: 8,
  },
  familyTimeEmptyText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
  },
  familyTimeLoadingState: {
    alignItems: 'center',
    paddingVertical: 30,
  },
  familyTimeLoadingText: {
    fontSize: 14,
    color: '#666',
    marginTop: 10,
  },
  familyTimeErrorState: {
    alignItems: 'center',
    paddingVertical: 30,
  },
  familyTimeErrorTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FF6B6B',
    marginTop: 15,
    marginBottom: 8,
  },
  familyTimeErrorText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 15,
  },
  familyTimeRetryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#48b6b0',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 10,
  },
  familyTimeAuthRetryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF6B6B',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 10,
  },
  familyTimeRetryButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
    marginLeft: 6,
  },
  familyTimeSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    paddingVertical: 20,
    marginBottom: 20,
  },
  familyTimeSummaryItem: {
    alignItems: 'center',
    flex: 1,
  },
  familyTimeSummaryNumber: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#48b6b0',
    marginBottom: 4,
  },
  familyTimeSummaryLabel: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  familyTimeSummaryDivider: {
    width: 1,
    height: 40,
    backgroundColor: '#e9ecef',
    marginHorizontal: 20,
  },
  familyTimeBreakdown: {
    marginBottom: 20,
  },
  familyTimeBreakdownTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  familyTimeTypeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  familyTimeTypeItem: {
    alignItems: 'center',
    width: '48%',
    backgroundColor: '#f8f9fa',
    borderRadius: 10,
    paddingVertical: 15,
    paddingHorizontal: 10,
    marginBottom: 10,
  },
  familyTimeTypeIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  familyTimeTypeCount: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  familyTimeTypeLabel: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
    fontWeight: '500',
  },
  familyTimeEmotions: {
    marginTop: 10,
  },
  familyTimeEmotionGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 10,
  },
  familyTimeEmotionItem: {
    alignItems: 'center',
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#f8f9fa',
    marginHorizontal: 4,
  },
  familyTimeEmotionCount: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 6,
    marginBottom: 4,
  },
  familyTimeEmotionLabel: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },

  // Enhanced Family Time Styles
  familyTimeSummarySubtext: {
    fontSize: 11,
    color: '#999',
    marginTop: 2,
    fontStyle: 'italic',
  },
  familyTimeTypePercentage: {
    fontSize: 10,
    color: '#999',
    marginTop: 2,
  },
  emotionBar: {
    height: 3,
    borderRadius: 1.5,
    marginTop: 4,
    alignSelf: 'stretch',
    marginHorizontal: 8,
  },
  emotionInsight: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
    marginTop: 12,
    fontStyle: 'italic',
  },
  startActivityButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f0f8ff',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    marginTop: 15,
  },
  startActivityText: {
    fontSize: 14,
    color: '#48b6b0',
    fontWeight: '500',
    marginLeft: 8,
  },
  familyTimeDetails: {
    marginTop: 20,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#e9ecef',
  },
  recentActivitiesSection: {
    marginBottom: 25,
  },
  recentActivityItem: {
    backgroundColor: '#f8f9fa',
    borderRadius: 10,
    padding: 15,
    marginBottom: 12,
  },
  recentActivityHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  activityTypeIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 10,
  },
  recentActivityType: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    flex: 1,
  },
  recentActivityDate: {
    fontSize: 12,
    color: '#666',
  },
  recentActivityDuration: {
    fontSize: 12,
    color: '#666',
    marginBottom: 6,
  },
  recentActivityRemarks: {
    fontSize: 12,
    color: '#555',
    fontStyle: 'italic',
    marginBottom: 8,
  },
  recentActivityFeelings: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  feelingChip: {
    backgroundColor: '#e3f2fd',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginRight: 6,
    marginBottom: 4,
  },
  feelingChipText: {
    fontSize: 10,
    color: '#1976d2',
    fontWeight: '500',
  },
  noRecentActivities: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    fontStyle: 'italic',
    paddingVertical: 20,
  },
  timeAnalysisSection: {
    marginBottom: 25,
  },
  timeAnalysisGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  timeAnalysisItem: {
    width: '48%',
    backgroundColor: '#f8f9fa',
    borderRadius: 10,
    padding: 15,
    marginBottom: 10,
    alignItems: 'center',
  },
  timeAnalysisLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 6,
    textAlign: 'center',
  },
  timeAnalysisValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
  },
  monthlyComparisonSection: {
    marginBottom: 20,
  },
  monthlyComparisonGrid: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    paddingVertical: 20,
    marginBottom: 10,
  },
  monthlyComparisonItem: {
    alignItems: 'center',
    flex: 1,
  },
  monthlyComparisonLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 6,
  },
  monthlyComparisonValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  monthlyComparisonTime: {
    fontSize: 12,
    color: '#666',
  },
  monthlyComparisonDivider: {
    width: 1,
    height: 40,
    backgroundColor: '#e9ecef',
    marginHorizontal: 20,
  },
  monthlyTrendText: {
    fontSize: 12,
    textAlign: 'center',
    fontWeight: '500',
  },
});
