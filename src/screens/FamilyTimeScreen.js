import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  RefreshControl,
  FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import ChildrenDataService from '../services/ChildrenDataService';
import FamilyTimeService from '../services/FamilyTimeService';
import AddFamilyTimeModal from '../components/AddFamilyTimeModal';
import FamilyTimeActivityCard from '../components/FamilyTimeActivityCard';
import ErrorBoundary from '../components/ErrorBoundary';
import { 
  showErrorAlert, 
  withErrorHandling, 
  createLoadingManager,
  getUserFriendlyErrorMessage 
} from '../utils/errorUtils';

function FamilyTimeScreen() {
  const [children, setChildren] = useState([]);
  const [selectedChildren, setSelectedChildren] = useState([]);
  const [activities, setActivities] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingActivities, setIsLoadingActivities] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingActivity, setEditingActivity] = useState(null);
  const [error, setError] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Pagination state for performance optimization
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMoreActivities, setHasMoreActivities] = useState(true);
  const ACTIVITIES_PER_PAGE = 10;

  // Create loading manager for different operations
  const loadingManager = createLoadingManager();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async (showRefreshIndicator = false, resetPagination = true) => {
    const result = await withErrorHandling(
      async () => {
        
        if (showRefreshIndicator) {
          setIsRefreshing(true);
        } else {
          setIsLoading(true);
        }
        
        setError(null);

        // Reset pagination when loading fresh data
        if (resetPagination) {
          setCurrentPage(1);
          setHasMoreActivities(true);
        }

        const [childrenData, activitiesData] = await Promise.all([
          ChildrenDataService.getChildren(),
          FamilyTimeService.getRecentActivities(ACTIVITIES_PER_PAGE) // Load first page only
        ]);

        setChildren(Array.isArray(childrenData) ? childrenData : []);
        setActivities(Array.isArray(activitiesData) ? activitiesData : []);
        
        // Check if there are more activities to load
        if (activitiesData.length < ACTIVITIES_PER_PAGE) {
          setHasMoreActivities(false);
        }
        
        console.log(`Loaded ${childrenData.length} children and ${activitiesData.length} activities (page 1)`);
      },
      {
        showErrors: false, // We'll handle errors manually
        maxRetries: 2,
        onError: (error) => {
          console.error('Error loading Family Time data:', error);
          setError(error);
        },
        onRetry: () => {
          console.log('Retrying data load...');
        }
      }
    );

    if (showRefreshIndicator) {
      setIsRefreshing(false);
    } else {
      setIsLoading(false);
    }

    if (!result.success && result.error) {
      const errorInfo = getUserFriendlyErrorMessage(result.error);
      showErrorAlert(result.error, () => loadData(showRefreshIndicator, resetPagination));
    }
  };

  const loadActivities = async () => {
    const result = await withErrorHandling(
      async () => {
        console.log('Reloading activities...');
        setIsLoadingActivities(true);
        setError(null);

        const activitiesData = await FamilyTimeService.getActivitiesSorted(false);
        setActivities(Array.isArray(activitiesData) ? activitiesData : []);
        
        console.log(`Reloaded ${activitiesData.length} activities`);
      },
      {
        showErrors: false,
        maxRetries: 1,
        onError: (error) => {
          console.error('Error reloading activities:', error);
          setError(error);
        }
      }
    );

    setIsLoadingActivities(false);

    if (!result.success && result.error) {
      showErrorAlert(result.error, loadActivities);
    }
  };

  const handleRefresh = () => {
    loadData(true, true);
  };

  const loadMoreActivities = useCallback(async () => {
    if (isLoadingMore || !hasMoreActivities) {
      return;
    }

    const result = await withErrorHandling(
      async () => {
        console.log(`Loading more activities (page ${currentPage + 1})...`);
        setIsLoadingMore(true);

        // Get all activities and slice for pagination
        const allActivities = await FamilyTimeService.getActivitiesSorted(false);
        const startIndex = currentPage * ACTIVITIES_PER_PAGE;
        const endIndex = startIndex + ACTIVITIES_PER_PAGE;
        const newActivities = allActivities.slice(startIndex, endIndex);

        if (newActivities.length > 0) {
          setActivities(prev => [...prev, ...newActivities]);
          setCurrentPage(prev => prev + 1);
          
          // Check if there are more activities
          if (endIndex >= allActivities.length) {
            setHasMoreActivities(false);
          }
          
          console.log(`Loaded ${newActivities.length} more activities`);
        } else {
          setHasMoreActivities(false);
        }
      },
      {
        showErrors: false,
        maxRetries: 1,
        onError: (error) => {
          console.error('Error loading more activities:', error);
        }
      }
    );

    setIsLoadingMore(false);

    if (!result.success && result.error) {
      showErrorAlert(result.error, loadMoreActivities);
    }
  }, [currentPage, hasMoreActivities, isLoadingMore]);

  const toggleChildSelection = (child) => {
    if (!child || !child.id) {
      console.error('Invalid child object passed to toggleChildSelection');
      return;
    }
    
    setSelectedChildren(prev => {
      if (!Array.isArray(prev)) {
        console.error('selectedChildren is not an array');
        return [child];
      }
      
      const isSelected = prev.some(c => c && c.id === child.id);
      if (isSelected) {
        return prev.filter(c => c && c.id !== child.id);
      } else {
        return [...prev, child];
      }
    });
  };

  const handleAddActivity = () => {
    setEditingActivity(null);
    setShowAddModal(true);
  };

  const handleActivitySaved = async (savedActivity) => {
    if (editingActivity) {
      // Update existing activity in the list
      setActivities(prev => prev.map(activity => 
        activity.id === savedActivity.id ? savedActivity : activity
      ));
    } else {
      // Add new activity to the beginning of the list (newest first)
      setActivities(prev => [savedActivity, ...prev]);
    }
    
    // Optionally reload all activities to ensure consistency
    try {
      const updatedActivities = await FamilyTimeService.getActivitiesSorted(false);
      setActivities(updatedActivities);
    } catch (error) {
      console.error('Error reloading activities:', error);
      // Keep the local update if reload fails
    }
  };

  const handleEditActivity = (activity) => {
    setEditingActivity(activity);
    setShowAddModal(true);
  };

  const handleDeleteActivity = (activity) => {
    Alert.alert(
      'Delete Activity',
      `Are you sure you want to delete "${activity.title}"?`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const result = await withErrorHandling(
              async () => {
                console.log('Deleting activity:', activity.id);
                loadingManager.setLoading('delete', true);
                
                await FamilyTimeService.deleteActivity(activity.id);
                
                // Update local state immediately for better UX
                setActivities(prev => Array.isArray(prev) ? prev.filter(a => a && a.id !== activity.id) : []);
                
                console.log('Activity deleted successfully');
              },
              {
                showErrors: false,
                maxRetries: 1,
                onError: (error) => {
                  console.error('Error deleting activity:', error);
                }
              }
            );

            loadingManager.setLoading('delete', false);

            if (!result.success) {
              // Reload activities to ensure consistency
              loadActivities();
              
              const errorInfo = getUserFriendlyErrorMessage(result.error);
              Alert.alert(
                errorInfo.title,
                `Failed to delete activity: ${errorInfo.message}`,
                [
                  { text: 'OK' },
                  ...(errorInfo.canRetry ? [{
                    text: 'Try Again',
                    onPress: () => handleDeleteActivity(activity)
                  }] : [])
                ]
              );
            }
          },
        },
      ]
    );
  };

  const handleActivityPress = (activity) => {
    // For now, just edit the activity when pressed
    handleEditActivity(activity);
  };

  const renderChildSelector = () => {
    if (children.length === 0) {
      return (
        <View style={styles.emptyChildrenContainer}>
          <Ionicons name="person-add-outline" size={48} color="#ccc" />
          <Text style={styles.emptyChildrenText}>
            No children added yet. Please add children in Settings first.
          </Text>
        </View>
      );
    }

    return (
      <View style={styles.childSelectorContainer}>
        <Text style={styles.sectionTitle}>Select Children</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.childScrollView}>
          {children.map((child) => {
            const isSelected = Array.isArray(selectedChildren) && selectedChildren.some(c => c && c.id === child.id);
            return (
              <TouchableOpacity
                key={child.id}
                style={[
                  styles.childOption,
                  isSelected && styles.childOptionSelected,
                  { borderColor: child.favourColor || '#48b6b0' }
                ]}
                onPress={() => toggleChildSelection(child)}
              >
                <Text style={styles.childAvatar}>{child.emoji}</Text>
                <Text style={[
                  styles.childName,
                  isSelected && styles.childNameSelected
                ]}>
                  {child.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
    );
  };

  // Memoized activity card renderer for performance
  const renderActivityCard = useCallback(({ item: activity, index }) => (
    <View style={[
      styles.activityCardContainer,
      index === 0 && styles.firstActivityCard,
      index === activities.length - 1 && styles.lastActivityCard
    ]}>
      <FamilyTimeActivityCard
        activity={activity}
        onPress={handleActivityPress}
        onEdit={handleEditActivity}
        onDelete={handleDeleteActivity}
      />
    </View>
  ), [activities.length]);

  // Memoized key extractor for FlatList performance
  const keyExtractor = useCallback((item) => item.id, []);

  // Memoized header component for FlatList
  const renderListHeader = useCallback(() => {
    return (
      <View>
        {/* {renderChildSelector()} */}
        {isLoadingActivities ? (
          <View style={styles.activitiesContainer}>
            <Text style={styles.sectionTitle}>Family Time Activities</Text>
            <View style={styles.loadingActivitiesContainer}>
              <ActivityIndicator size="small" color="#48b6b0" />
              <Text style={styles.loadingActivitiesText}>Loading activities...</Text>
            </View>
          </View>
        ) : (
          <View style={styles.activitiesHeaderContainer}>
            <Text style={styles.sectionTitle}>
              Family Time Activities ({activities.length}{hasMoreActivities ? '+' : ''})
            </Text>
          </View>
        )}
      </View>
    );
  }, [children, selectedChildren, isLoadingActivities, activities.length, hasMoreActivities]);

  // Memoized footer component for load more
  const renderFooter = useCallback(() => {
    if (!hasMoreActivities && activities.length > 0) {
      return (
        <View style={styles.endOfListContainer}>
          <Text style={styles.endOfListText}>You've reached the end of your activities</Text>
        </View>
      );
    }

    if (isLoadingMore) {
      return (
        <View style={styles.loadMoreContainer}>
          <ActivityIndicator size="small" color="#48b6b0" />
          <Text style={styles.loadMoreText}>Loading more activities...</Text>
        </View>
      );
    }

    return null;
  }, [hasMoreActivities, isLoadingMore, activities.length]);



  // Error state
  if (error && !isLoading && !isRefreshing) {
    const errorInfo = getUserFriendlyErrorMessage(error);
    return (
      <View style={styles.errorContainer}>
        <Ionicons name={errorInfo.icon} size={64} color="#F44336" />
        <Text style={styles.errorTitle}>{errorInfo.title}</Text>
        <Text style={styles.errorMessage}>{errorInfo.message}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => loadData()}>
          <Ionicons name="refresh" size={20} color="white" />
          <Text style={styles.retryButtonText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#48b6b0" />
        <Text style={styles.loadingText}>Loading Family Time...</Text>
        <Text style={styles.loadingSubtext}>Please wait while we load your activities</Text>
      </View>
    );
  }

  return (
    <ErrorBoundary onReload={() => loadData()}>
      <View style={styles.container}>
        {activities.length === 0 && !isLoadingActivities ? (
          // Show empty state centered on screen
          <ScrollView 
            style={styles.scrollView} 
            contentContainerStyle={styles.scrollViewContent}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={handleRefresh}
                colors={['#48b6b0']}
                tintColor="#48b6b0"
              />
            }
          >
            <View style={styles.centerContent}>
              <Ionicons name="calendar-outline" size={48} color="#ccc" />
              <Text style={styles.emptyStateTitle}>No farmily time activities yet.</Text>
              <Text style={styles.emptyStateText}>
                Create your first precious moment!
              </Text>
            </View>
          </ScrollView>
        ) : (
          // Use FlatList with header for activities
          <FlatList
            data={activities}
            renderItem={renderActivityCard}
            keyExtractor={keyExtractor}
            onEndReached={loadMoreActivities}
            onEndReachedThreshold={0.1}
            ListHeaderComponent={renderListHeader}
            ListFooterComponent={renderFooter}
            showsVerticalScrollIndicator={false}
            removeClippedSubviews={true}
            maxToRenderPerBatch={5}
            windowSize={10}
            initialNumToRender={5}
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={handleRefresh}
                colors={['#48b6b0']}
                tintColor="#48b6b0"
              />
            }
            contentContainerStyle={styles.flatListContent}
          />
        )}
        
        <TouchableOpacity 
          style={[
            styles.addButton,
            loadingManager.isAnyLoading() && styles.disabledAddButton
          ]} 
          onPress={handleAddActivity}
          disabled={loadingManager.isAnyLoading()}
        >
          {loadingManager.isLoading('add') ? (
            <ActivityIndicator size={20} color="white" />
          ) : (
            <Ionicons name="add" size={24} color="white" />
          )}
        </TouchableOpacity>

        <AddFamilyTimeModal
          visible={showAddModal}
          onClose={() => {
            setShowAddModal(false);
            setEditingActivity(null);
          }}
          onActivityAdded={handleActivitySaved}
          selectedChildren={selectedChildren}
          editingActivity={editingActivity}
        />
      </View>
    </ErrorBoundary>
  );
}

// Export the component wrapped with ErrorBoundary
export default function FamilyTimeScreenWithErrorBoundary() {
  return (
    <ErrorBoundary>
      <FamilyTimeScreen />
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
    minHeight: '100%',
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666',
    fontWeight: '500',
  },
  loadingSubtext: {
    marginTop: 4,
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    padding: 20,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 8,
  },
  errorMessage: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 24,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#48b6b0',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    gap: 8,
  },
  retryButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  disabledAddButton: {
    opacity: 0.6,
  },
  scrollView: {
    flex: 1,
  },
  scrollViewContent: {
    flexGrow: 1,
  },
  childSelectorContainer: {
    backgroundColor: 'white',
    margin: 16,
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  childScrollView: {
    flexDirection: 'row',
  },
  childOption: {
    alignItems: 'center',
    padding: 12,
    marginRight: 12,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#ddd',
    backgroundColor: '#f9f9f9',
    minWidth: 80,
  },
  childOptionSelected: {
    backgroundColor: '#e3f2fd',
    borderWidth: 3,
  },
  childAvatar: {
    fontSize: 32,
    marginBottom: 4,
  },
  childName: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
  },
  childNameSelected: {
    color: '#48b6b0',
    fontWeight: 'bold',
  },
  emptyChildrenContainer: {
    backgroundColor: 'white',
    margin: 16,
    padding: 32,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  emptyChildrenText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginTop: 12,
  },
  activitiesContainer: {
    backgroundColor: 'white',
    margin: 16,
    marginTop: 0,
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  emptyActivitiesContainer: {
    backgroundColor: 'white',
    margin: 16,
    marginTop: 32,
    padding: 32,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  emptyActivitiesText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginTop: 12,
  },
  loadingActivitiesContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  loadingActivitiesText: {
    marginLeft: 10,
    fontSize: 14,
    color: '#666',
  },
  addButton: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#48b6b0',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  loadMoreContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  loadMoreText: {
    marginLeft: 8,
    fontSize: 14,
    color: '#666',
  },
  endOfListContainer: {
    alignItems: 'center',
    padding: 20,
  },
  endOfListText: {
    fontSize: 14,
    color: '#999',
    fontStyle: 'italic',
  },
  flatListContent: {
    paddingBottom: 100, // Space for floating add button
  },
  activitiesHeaderContainer: {
    backgroundColor: 'white',
    margin: 16,
    marginTop: 0,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  activityCardContainer: {
    backgroundColor: 'white',
    marginHorizontal: 16,
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  firstActivityCard: {
    // First card doesn't need top border radius since header has it
  },
  lastActivityCard: {
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
    paddingBottom: 16,
  },
});