import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Platform,
  Image,
  TextInput,
  Alert,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// Calculate photo dimensions outside of StyleSheet
const { width: screenWidth } = Dimensions.get('window');
const PHOTO_SIZE = (screenWidth - 60) / 3; // 3 photos per row with margins
import DateTimePickerModal from './DateTimePickerModal';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import ChildrenDataService from '../services/ChildrenDataService';
import FamilyTimeService from '../services/FamilyTimeService';
import ChildFeelingSelector from './ChildFeelingSelector';
import Base64Image from './Base64Image';
// Removed BookDetectionModal - replaced with manual input
import {
  showErrorAlert,
  withErrorHandling,
  getUserFriendlyErrorMessage,
  validateFormData,
} from '../utils/errorUtils';

export default function AddFamilyTimeModal({
  visible,
  onClose,
  onActivityAdded,
  selectedChildren: initialSelectedChildren = [],
  editingActivity = null,
}) {
  const [children, setChildren] = useState([]);
  const [selectedChildren, setSelectedChildren] = useState([]);
  const [selectedActivityType, setSelectedActivityType] = useState(null);
  const [loading, setLoading] = useState(false);

  // Form fields state
  const [startTime, setStartTime] = useState(new Date());
  const [endTime, setEndTime] = useState(new Date(Date.now() + 60 * 60 * 1000)); // 1 hour later
  const [location, setLocation] = useState('');
  const [remarks, setRemarks] = useState('');
  const [photos, setPhotos] = useState([]);
  const [childrenFeelings, setChildrenFeelings] = useState({});

  // Date picker state
  const [showStartTimePicker, setShowStartTimePicker] = useState(false);
  const [showEndTimePicker, setShowEndTimePicker] = useState(false);

  // Form validation state
  const [validationErrors, setValidationErrors] = useState({});

  // Book information state (manual input)
  const [bookTitle, setBookTitle] = useState('');
  const [bookAuthor, setBookAuthor] = useState('');

  // Activity type configuration with icons and colors
  const activityTypes = [
    {
      id: 'Reading Time',
      name: 'Reading Time',
      icon: 'book-outline',
      color: '#4CAF50',
      description: 'Story time and reading activities',
    },
    {
      id: 'Sports',
      name: 'Sports',
      icon: 'fitness-outline',
      color: '#FF9800',
      description: 'Physical activities and sports',
    },
    {
      id: 'Adventure',
      name: 'Adventure',
      icon: 'map-outline',
      color: '#2196F3',
      description: 'Outdoor adventures and exploration',
    },
    {
      id: 'Important',
      name: 'Important',
      icon: 'star-outline',
      color: '#F44336',
      description: 'Special moments and milestones',
    },
  ];

  useEffect(() => {
    if (visible) {
      loadChildren();
    }
  }, [visible]);

  useEffect(() => {
    if (visible) {
      // Only call resetForm after children are loaded or if we don't need children data
      if (children.length > 0 || !editingActivity) {
        resetForm();
      }
    }
  }, [visible, editingActivity, children.length]);

  useEffect(() => {
    if (initialSelectedChildren.length > 0) {
      setSelectedChildren(initialSelectedChildren);
    }
  }, [initialSelectedChildren]);

  const loadChildren = async () => {
    try {
      const storedChildren = await ChildrenDataService.getChildren();
      setChildren(storedChildren);
    } catch (error) {
      console.error('Error loading children:', error);
    }
  };

  const resetForm = () => {
    try {
      if (editingActivity) {
        // Pre-fill form with editing activity data
        setSelectedActivityType(editingActivity.type || null);

        // Set participants as selected children - ensure children array exists
        if (Array.isArray(children) && children.length > 0) {
          const editingChildren = children.filter((child) => {
            return (
              child &&
              child.id &&
              editingActivity.participants &&
              Array.isArray(editingActivity.participants) &&
              editingActivity.participants.some(
                (p) => p && p.childId === child.id
              )
            );
          });
          setSelectedChildren(editingChildren);
        } else {
          setSelectedChildren([]);
        }

        // Set form fields with safe defaults
        try {
          setStartTime(
            editingActivity.startTime
              ? new Date(editingActivity.startTime)
              : new Date()
          );
          setEndTime(
            editingActivity.endTime
              ? new Date(editingActivity.endTime)
              : new Date(Date.now() + 60 * 60 * 1000)
          );
        } catch (dateError) {
          console.error('Error parsing dates:', dateError);
          const now = new Date();
          setStartTime(now);
          setEndTime(new Date(now.getTime() + 60 * 60 * 1000));
        }

        setLocation(editingActivity.location || '');
        setRemarks(editingActivity.remarks || '');

        // Set photos (convert URIs to photo objects)
        const editingPhotos = Array.isArray(editingActivity.photos)
          ? editingActivity.photos.map((uri, index) => ({
              id: `photo_${index}`,
              uri: uri,
            }))
          : [];
        setPhotos(editingPhotos);

        // Set children feelings
        const feelings = {};
        if (
          editingActivity.participants &&
          Array.isArray(editingActivity.participants)
        ) {
          editingActivity.participants.forEach((participant) => {
            if (participant && participant.childId && participant.feeling) {
              feelings[participant.childId] = participant.feeling;
            }
          });
        }
        setChildrenFeelings(feelings);

        // Set book info if it exists
        if (
          editingActivity.bookInfo &&
          typeof editingActivity.bookInfo === 'object'
        ) {
          setBookTitle(editingActivity.bookInfo.title || '');
          setBookAuthor(editingActivity.bookInfo.author || '');
        } else {
          setBookTitle('');
          setBookAuthor('');
        }
      } else {
        // Reset to default values for new activity
        setSelectedActivityType(null);
        if (!initialSelectedChildren || initialSelectedChildren.length === 0) {
          setSelectedChildren([]);
        }
        // Reset form fields
        const now = new Date();
        setStartTime(now);
        setEndTime(new Date(now.getTime() + 60 * 60 * 1000)); // 1 hour later
        setLocation('');
        setRemarks('');
        setPhotos([]);
        setChildrenFeelings({});
        setBookTitle('');
        setBookAuthor('');
      }

      // Always reset these UI states
      setValidationErrors({});
      setShowStartTimePicker(false);
      setShowEndTimePicker(false);
    } catch (error) {
      console.error('Error in resetForm:', error);
      // Fallback to safe defaults
      setSelectedActivityType(null);
      setSelectedChildren([]);
      const now = new Date();
      setStartTime(now);
      setEndTime(new Date(now.getTime() + 60 * 60 * 1000));
      setLocation('');
      setRemarks('');
      setPhotos([]);
      setChildrenFeelings({});
      setBookTitle('');
      setBookAuthor('');
      setValidationErrors({});
      setShowStartTimePicker(false);
      setShowEndTimePicker(false);
    }
  };

  const toggleChildSelection = (child) => {
    if (!child || !child.id) {
      console.error('Invalid child object passed to toggleChildSelection');
      return;
    }

    setSelectedChildren((prev) => {
      if (!Array.isArray(prev)) {
        console.error('selectedChildren is not an array');
        return [child];
      }

      const isSelected = prev.some((c) => c && c.id === child.id);
      if (isSelected) {
        // Remove child from selection and clear their feeling
        setChildrenFeelings((prevFeelings) => {
          const newFeelings = { ...prevFeelings };
          delete newFeelings[child.id];
          return newFeelings;
        });
        return prev.filter((c) => c && c.id !== child.id);
      } else {
        return [...prev, child];
      }
    });
  };

  const handleFeelingChange = (childId, feeling) => {
    setChildrenFeelings((prev) => ({
      ...prev,
      [childId]: feeling,
    }));
  };

  const getChildDisplayName = (child) => {
    return child.nickname || child.firstName || child.name;
  };

  const getGenderEmoji = (gender) => {
    return gender === 'girl' ? '👧' : '👦';
  };

  // Form validation functions
  const validateForm = () => {
    const errors = {};

    // Validate activity type selection
    if (!selectedActivityType) {
      errors.activityType = 'Please select an activity type';
    }

    // Validate child selection
    if (selectedChildren.length === 0) {
      errors.children = 'Please select at least one child';
    }

    const now = new Date();
    const endOfToday = new Date(new Date().setHours(23, 59, 59, 999));

    // Validate start time is before end time
    if (startTime >= endTime) {
      errors.time = 'Start time must be before end time';
    }

    // Validate end time is not in the future (cannot be greater than today)
    if (endTime > endOfToday) {
      errors.endTime =
        'End time cannot be in the future. Precious moments should be recorded after they happen.';
    }

    // Validate start time is not in the future (cannot be greater than today)
    if (startTime > now) {
      errors.startTime =
        'Start time cannot be in the future. Precious moments should be recorded after they happen.';
    }

    // Additional validation: if both times are valid individually, ensure start < end
    if (!errors.startTime && !errors.endTime && startTime >= endTime) {
      errors.time = 'Start time must be before end time';
    }

    // Validate remarks length
    if (remarks.length > 500) {
      errors.remarks = 'Remarks cannot exceed 500 characters';
    }

    // Validate location length
    if (location.length > 100) {
      errors.location = 'Location cannot exceed 100 characters';
    }

    // Validate photo count
    if (photos.length > 10) {
      errors.photos = 'Cannot add more than 10 photos';
    }

    // For Reading Time activities, encourage book info but don't require it
    if (selectedActivityType === 'Reading Time' && !bookTitle && !bookAuthor) {
      console.log(
        'Reading Time activity without book information - this is optional'
      );
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Date/Time picker handlers
  const handleStartTimeConfirm = (selectedDate) => {
    const now = new Date();

    // Validate start time is not in the future
    if (selectedDate > now) {
      Alert.alert(
        'Invalid Start Time',
        'Start time cannot be in the future. Precious moments should be recorded after they happen.',
        [{ text: 'OK' }]
      );
      setShowStartTimePicker(false);
      return;
    }

    setStartTime(selectedDate);

    // Auto-adjust end time if it's now before start time or if end time would be in the future
    if (selectedDate >= endTime) {
      const suggestedEndTime = new Date(
        selectedDate.getTime() + 60 * 60 * 1000
      ); // 1 hour later
      const maxEndTime = now; // Cannot be later than now

      // Use the earlier of suggested time or current time
      const newEndTime =
        suggestedEndTime > maxEndTime ? maxEndTime : suggestedEndTime;
      setEndTime(newEndTime);
    }

    // Clear validation errors
    if (validationErrors.time || validationErrors.startTime) {
      setValidationErrors((prev) => ({
        ...prev,
        time: undefined,
        startTime: undefined,
      }));
    }
    setShowStartTimePicker(false);
  };

  const handleStartTimeCancel = () => {
    setShowStartTimePicker(false);
  };

  const handleEndTimeConfirm = (selectedDate) => {
    const now = new Date();
    const endOfToday = new Date(new Date().setHours(23, 59, 59, 999));

    // Validate end time is not in the future of today
    if (selectedDate > endOfToday) {
      Alert.alert(
        'Invalid End Time',
        'End time cannot be in the future. Precious moments should be recorded after they happen.',
        [{ text: 'OK' }]
      );
      setShowEndTimePicker(false);
      return;
    }

    // Validate end time is after start time
    if (selectedDate <= startTime) {
      Alert.alert(
        'Invalid End Time',
        'End time must be after start time. Please select a later time.',
        [{ text: 'OK' }]
      );
      setShowEndTimePicker(false);
      return;
    }

    setEndTime(selectedDate);

    // Clear validation errors
    if (validationErrors.time || validationErrors.endTime) {
      setValidationErrors((prev) => ({
        ...prev,
        time: undefined,
        endTime: undefined,
      }));
    }
    setShowEndTimePicker(false);
  };

  const handleEndTimeCancel = () => {
    setShowEndTimePicker(false);
  };

  // Format time for display
  const formatTime = (date) => {
    return date.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  };

  const formatDate = (date) => {
    return date.toLocaleDateString([], {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  // Photo management functions
  const requestPermissions = async () => {
    const { status: cameraStatus } =
      await ImagePicker.requestCameraPermissionsAsync();
    const { status: mediaLibraryStatus } =
      await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (cameraStatus !== 'granted' || mediaLibraryStatus !== 'granted') {
      Alert.alert(
        'Permissions Required',
        'We need camera and photo library permissions to add photos to your family activities.',
        [{ text: 'OK' }]
      );
      return false;
    }
    return true;
  };

  const validatePhoto = (photo) => {
    // Check file size (limit to 5MB for better performance)
    const maxSize = 5 * 1024 * 1024; // 5MB in bytes
    if (photo.fileSize && photo.fileSize > maxSize) {
      throw new Error(
        'Photo is too large. Please select a photo smaller than 5MB.'
      );
    }

    // Check image dimensions - more aggressive limits for performance
    const maxDimension = 3000;
    if (photo.width > maxDimension || photo.height > maxDimension) {
      // We'll compress this image
      return false;
    }

    // Check aspect ratio to prevent extremely wide/tall images
    const aspectRatio = photo.width / photo.height;
    if (aspectRatio > 5 || aspectRatio < 0.2) {
      console.warn(
        'Unusual aspect ratio detected, will compress:',
        aspectRatio
      );
      return false;
    }

    return true;
  };

  const compressImage = async (uri) => {
    try {
      // Get image info first to determine optimal compression
      const imageInfo = await ImageManipulator.manipulateAsync(uri, [], {
        format: ImageManipulator.SaveFormat.JPEG,
      });

      // Calculate optimal dimensions and compression based on file size
      let targetWidth = 1200;
      let compressionQuality = 0.8;

      // For very large images, use more aggressive compression
      if (imageInfo.width > 2000 || imageInfo.height > 2000) {
        targetWidth = 800;
        compressionQuality = 0.7;
      }

      // Progressive compression for better performance
      const manipulatedImage = await ImageManipulator.manipulateAsync(
        uri,
        [
          { resize: { width: targetWidth } }, // Dynamic width based on original size
        ],
        {
          compress: compressionQuality,
          format: ImageManipulator.SaveFormat.JPEG,
        }
      );

      console.log(
        `Image compressed: ${imageInfo.width}x${imageInfo.height} -> ${targetWidth}px width, quality: ${compressionQuality}`
      );
      return manipulatedImage.uri;
    } catch (error) {
      console.error('Error compressing image:', error);
      return uri; // Return original if compression fails
    }
  };

  const addPhotoFromCamera = async () => {
    try {
      const hasPermissions = await requestPermissions();
      if (!hasPermissions) return;

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const photo = result.assets[0];
        await processAndAddPhoto(photo);
      }
    } catch (error) {
      console.error('Error taking photo:', error);
      Alert.alert('Error', 'Failed to take photo. Please try again.');
    }
  };

  const addPhotoFromGallery = async () => {
    try {
      const hasPermissions = await requestPermissions();
      if (!hasPermissions) return;

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
        allowsMultipleSelection: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        // Process multiple photos if selected
        for (const photo of result.assets) {
          await processAndAddPhoto(photo);
        }
      }
    } catch (error) {
      console.error('Error selecting photo:', error);
      Alert.alert('Error', 'Failed to select photo. Please try again.');
    }
  };

  const processAndAddPhoto = async (photo) => {
    try {
      // Show loading state for photo processing
      setLoading(true);

      // Validate photo
      const isValid = validatePhoto(photo);

      // Compress if needed or if image is larger than optimal size
      let finalUri = photo.uri;
      let needsCompression =
        !isValid || photo.width > 1200 || photo.height > 1200;

      if (needsCompression) {
        console.log('Compressing image for optimal performance...');
        finalUri = await compressImage(photo.uri);
      }

      // Get final image info after compression
      let finalWidth = photo.width;
      let finalHeight = photo.height;
      let finalFileSize = photo.fileSize;

      if (needsCompression) {
        // Estimate compressed dimensions and file size
        const compressionRatio = 1200 / Math.max(photo.width, photo.height);
        if (compressionRatio < 1) {
          finalWidth = Math.round(photo.width * compressionRatio);
          finalHeight = Math.round(photo.height * compressionRatio);
          finalFileSize = Math.round((photo.fileSize || 0) * 0.7); // Estimate 30% size reduction
        }
      }

      // Create photo object with optimized metadata
      const photoObject = {
        id: `photo_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        uri: finalUri,
        width: finalWidth,
        height: finalHeight,
        fileSize: finalFileSize,
        addedAt: new Date().toISOString(),
        compressed: needsCompression,
        originalUri: needsCompression ? photo.uri : null, // Keep reference to original if compressed
      };

      // Check if we're at the photo limit (max 8 photos for better performance)
      if (photos.length >= 8) {
        Alert.alert(
          'Photo Limit',
          'You can add up to 8 photos per activity for optimal performance.'
        );
        setLoading(false);
        return;
      }

      // Add photo directly for all activity types
      setPhotos((prev) => [...prev, photoObject]);

      setLoading(false);
    } catch (error) {
      console.error('Error processing photo:', error);
      setLoading(false);
      Alert.alert(
        'Error',
        error.message || 'Failed to process photo. Please try again.'
      );
    }
  };

  const showPhotoOptions = () => {
    Alert.alert('Add Photo', 'Choose how you want to add a photo', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Take Photo', onPress: addPhotoFromCamera },
      { text: 'Choose from Gallery', onPress: addPhotoFromGallery },
    ]);
  };

  const removePhoto = (photoId) => {
    Alert.alert('Remove Photo', 'Are you sure you want to remove this photo?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          setPhotos((prev) => prev.filter((photo) => photo.id !== photoId));
        },
      },
    ]);
  };

  const reorderPhotos = (fromIndex, toIndex) => {
    const newPhotos = [...photos];
    const [movedPhoto] = newPhotos.splice(fromIndex, 1);
    newPhotos.splice(toIndex, 0, movedPhoto);
    setPhotos(newPhotos);
  };

  const movePhotoLeft = (index) => {
    if (index > 0) {
      reorderPhotos(index, index - 1);
    }
  };

  const movePhotoRight = (index) => {
    if (index < photos.length - 1) {
      reorderPhotos(index, index + 1);
    }
  };

  // Book info helpers
  const clearBookInfo = () => {
    setBookTitle('');
    setBookAuthor('');
  };

  const hasBookInfo = () => {
    return bookTitle.trim() !== '' || bookAuthor.trim() !== '';
  };

  const handleNext = async () => {
    // Validate form data
    if (!validateForm()) {
      Alert.alert(
        'Validation Error',
        'Please fix the errors before continuing.'
      );
      return;
    }

    // Validate that all selected children have feelings assigned
    const missingFeelings = selectedChildren.filter(
      (child) => !childrenFeelings[child.id]
    );
    if (missingFeelings.length > 0) {
      Alert.alert(
        'Missing Feelings',
        `Please select feelings for: ${missingFeelings
          .map((child) => getChildDisplayName(child))
          .join(', ')}`
      );
      return;
    }

    const result = await withErrorHandling(
      async () => {
        console.log('Saving family time activity...');
        setLoading(true);

        // Create participants array with feelings
        const participants = selectedChildren.map((child) => ({
          childId: child.id,
          childName: getChildDisplayName(child),
          feeling: childrenFeelings[child.id],
        }));

        // Prepare activity data structure
        const activityData = {
          type: selectedActivityType,
          title: generateActivityTitle(selectedActivityType, selectedChildren),
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
          location: location.trim(),
          remarks: remarks.trim(),
          photos: photos.map((photo) => photo.uri), // Store only URIs for persistence
          participants: participants,
        };

        // Add book information for Reading Time activities
        if (selectedActivityType === 'Reading Time' && hasBookInfo()) {
          activityData.bookInfo = {
            title: bookTitle.trim(),
            author: bookAuthor.trim(),
            detectedByAI: false, // Manual input
            coverImageUri: '',
            confidence: 100, // Manual input is 100% confident
          };
        }

        // Save the activity using FamilyTimeService (create or update)
        let savedActivity;
        if (editingActivity) {
          savedActivity = await FamilyTimeService.updateActivity(
            editingActivity.id,
            activityData
          );
        } else {
          savedActivity = await FamilyTimeService.addActivity(activityData);
        }

        if (!savedActivity) {
          throw new Error('Activity save operation returned null');
        }

        return savedActivity;
      },
      {
        showErrors: false, // We'll handle errors manually
        maxRetries: 1,
        onError: (error) => {
          console.error('Error saving family time activity:', error);
        },
      }
    );

    setLoading(false);

    if (result.success && result.data) {
      // Show success feedback
      Alert.alert(
        'Success!',
        editingActivity
          ? 'Family time activity has been updated successfully.'
          : 'Family time activity has been saved successfully.',
        [
          {
            text: 'OK',
            onPress: () => {
              // Call the callback to notify parent component
              if (onActivityAdded) {
                onActivityAdded(result.data);
              }
              // Close the modal
              onClose();
            },
          },
        ]
      );
    } else if (result.error) {
      // Handle different types of errors
      const errorInfo = getUserFriendlyErrorMessage(result.error);

      Alert.alert(
        errorInfo.title,
        `Failed to ${editingActivity ? 'update' : 'save'} the activity: ${
          errorInfo.message
        }`,
        [
          { text: 'OK' },
          ...(errorInfo.canRetry
            ? [
                {
                  text: 'Try Again',
                  onPress: handleNext,
                },
              ]
            : []),
        ]
      );
    }
  };

  // Generate a descriptive title for the activity
  const generateActivityTitle = (activityType, children) => {
    const childNames = children.map((child) => getChildDisplayName(child));
    const childrenText =
      childNames.length === 1
        ? childNames[0]
        : childNames.length === 2
        ? `${childNames[0]} and ${childNames[1]}`
        : `${childNames.slice(0, -1).join(', ')} and ${
            childNames[childNames.length - 1]
          }`;

    switch (activityType) {
      case 'Reading Time':
        return `Reading Time with ${childrenText}`;
      case 'Sports':
        return `Sports Activity with ${childrenText}`;
      case 'Adventure':
        return `Adventure with ${childrenText}`;
      case 'Important':
        return `Special Moment with ${childrenText}`;
      default:
        return `Family Time with ${childrenText}`;
    }
  };

  const canProceed = selectedActivityType && selectedChildren.length > 0;

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
            <Text style={styles.cancelButton}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>
            {editingActivity ? 'Edit Precious Moment' : 'New Precious Moment'}
          </Text>
          <TouchableOpacity
            onPress={handleNext}
            disabled={!canProceed || loading}
          >
            <Text
              style={[
                styles.nextButton,
                (!canProceed || loading) && styles.disabledButton,
              ]}
            >
              {loading ? 'Saving...' : 'Save'}
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Child Selection */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Select Children</Text>
            <Text style={styles.sectionSubtitle}>
              Choose which children are participating in this activity
            </Text>

            {children.length === 0 ? (
              <View style={styles.emptyChildrenContainer}>
                <Ionicons name='person-add-outline' size={48} color='#ccc' />
                <Text style={styles.emptyChildrenText}>
                  No children available. Please add children in Settings first.
                </Text>
              </View>
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={[
                  styles.childSelector,
                  validationErrors.children && styles.errorBorder,
                ]}
              >
                {children.map((child) => {
                  const isSelected = selectedChildren.some(
                    (c) => c.id === child.id
                  );
                  return (
                    <TouchableOpacity
                      key={child.id}
                      style={[
                        styles.childOption,
                        isSelected && styles.selectedChildOption,
                        { borderColor: child.favourColor || '#48b6b0' },
                      ]}
                      onPress={() => {
                        toggleChildSelection(child);
                        // Clear children validation error
                        if (validationErrors.children) {
                          setValidationErrors((prev) => ({
                            ...prev,
                            children: undefined,
                          }));
                        }
                      }}
                    >
                      {child.photo ? (
                        <Base64Image
                          source={{ uri: child.photo }}
                          style={styles.childPhoto}
                        />
                      ) : (
                        <Text style={styles.childAvatar}>
                          {child.emoji || getGenderEmoji(child.gender)}
                        </Text>
                      )}
                      <Text
                        style={[
                          styles.childOptionText,
                          isSelected && styles.selectedChildOptionText,
                        ]}
                      >
                        {getChildDisplayName(child)}
                      </Text>
                      {isSelected && (
                        <View style={styles.selectedIndicator}>
                          <Ionicons name='checkmark' size={16} color='white' />
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}

            {validationErrors.children && (
              <Text style={styles.errorText}>{validationErrors.children}</Text>
            )}
          </View>

          {/* Activity Type Selection */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Activity Type</Text>
            <Text style={styles.sectionSubtitle}>
              What kind of activity is this?
            </Text>

            <View style={styles.activityTypeGrid}>
              {activityTypes.map((activityType) => {
                const isSelected = selectedActivityType === activityType.id;
                return (
                  <TouchableOpacity
                    key={activityType.id}
                    style={[
                      styles.activityTypeOption,
                      isSelected && styles.selectedActivityTypeOption,
                      { borderColor: activityType.color },
                      validationErrors.activityType && styles.errorBorder,
                    ]}
                    onPress={() => {
                      setSelectedActivityType(activityType.id);
                      // Clear activity type validation error
                      if (validationErrors.activityType) {
                        setValidationErrors((prev) => ({
                          ...prev,
                          activityType: undefined,
                        }));
                      }
                    }}
                  >
                    <View
                      style={[
                        styles.activityTypeIconContainer,
                        {
                          backgroundColor: isSelected
                            ? activityType.color
                            : '#f5f5f5',
                        },
                      ]}
                    >
                      <Ionicons
                        name={activityType.icon}
                        size={32}
                        color={isSelected ? 'white' : activityType.color}
                      />
                    </View>
                    <Text
                      style={[
                        styles.activityTypeName,
                        isSelected && { color: activityType.color },
                      ]}
                    >
                      {activityType.name}
                    </Text>
                    <Text style={styles.activityTypeDescription}>
                      {activityType.description}
                    </Text>
                    {isSelected && (
                      <View
                        style={[
                          styles.selectedActivityIndicator,
                          { backgroundColor: activityType.color },
                        ]}
                      >
                        <Ionicons name='checkmark' size={16} color='white' />
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            {validationErrors.activityType && (
              <Text style={styles.errorText}>
                {validationErrors.activityType}
              </Text>
            )}
          </View>

          {/* Activity Details Form */}
          {selectedActivityType && selectedChildren.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Activity Details</Text>
              <Text style={styles.sectionSubtitle}>
                Provide details about this {selectedActivityType.toLowerCase()}{' '}
                activity
              </Text>

              {/* Time Selection */}
              <View style={styles.formGroup}>
                <Text style={styles.fieldLabel}>Time</Text>
                <Text style={styles.fieldSubtitle}>
                  Record when this precious moment happened (cannot be in the
                  future)
                </Text>

                <View style={styles.timeRow}>
                  <View style={styles.timeField}>
                    <Text style={styles.timeLabel}>Start Time</Text>
                    <TouchableOpacity
                      style={[
                        styles.timeButton,
                        (validationErrors.time || validationErrors.startTime) &&
                          styles.errorInput,
                      ]}
                      onPress={() => setShowStartTimePicker(true)}
                    >
                      <Ionicons name='time-outline' size={20} color='#666' />
                      <View style={styles.timeTextContainer}>
                        <Text style={styles.timeText}>
                          {formatTime(startTime)}
                        </Text>
                        <Text style={styles.dateText}>
                          {formatDate(startTime)}
                        </Text>
                      </View>
                    </TouchableOpacity>
                    {validationErrors.startTime && (
                      <Text style={styles.errorText}>
                        {validationErrors.startTime}
                      </Text>
                    )}
                  </View>

                  <View style={styles.timeArrow}>
                    <Ionicons name='arrow-forward' size={20} color='#666' />
                  </View>

                  <View style={styles.timeField}>
                    <Text style={styles.timeLabel}>End Time</Text>
                    <TouchableOpacity
                      style={[
                        styles.timeButton,
                        (validationErrors.time || validationErrors.endTime) &&
                          styles.errorInput,
                      ]}
                      onPress={() => setShowEndTimePicker(true)}
                    >
                      <Ionicons name='time-outline' size={20} color='#666' />
                      <View style={styles.timeTextContainer}>
                        <Text style={styles.timeText}>
                          {formatTime(endTime)}
                        </Text>
                        <Text style={styles.dateText}>
                          {formatDate(endTime)}
                        </Text>
                      </View>
                    </TouchableOpacity>
                    {validationErrors.endTime && (
                      <Text style={styles.errorText}>
                        {validationErrors.endTime}
                      </Text>
                    )}
                  </View>
                </View>

                {validationErrors.time && (
                  <Text style={styles.errorText}>{validationErrors.time}</Text>
                )}
              </View>

              {/* Location Field */}
              <View style={styles.formGroup}>
                <Text style={styles.fieldLabel}>Location (Optional)</Text>
                <View
                  style={[
                    styles.inputContainer,
                    validationErrors.location && styles.errorInput,
                  ]}
                >
                  <Ionicons name='location-outline' size={20} color='#666' />
                  <TextInput
                    style={styles.textInput}
                    placeholder='Where did this activity take place?'
                    value={location}
                    onChangeText={(text) => {
                      setLocation(text);
                      // Clear location validation error
                      if (validationErrors.location) {
                        setValidationErrors((prev) => ({
                          ...prev,
                          location: undefined,
                        }));
                      }
                    }}
                    maxLength={100}
                  />
                </View>
                {validationErrors.location && (
                  <Text style={styles.errorText}>
                    {validationErrors.location}
                  </Text>
                )}
              </View>

              {/* Remarks Field */}
              <View style={styles.formGroup}>
                <Text style={styles.fieldLabel}>Remarks (Optional)</Text>
                <View
                  style={[
                    styles.inputContainer,
                    styles.remarksContainer,
                    validationErrors.remarks && styles.errorInput,
                  ]}
                >
                  <Ionicons
                    name='chatbubble-outline'
                    size={20}
                    color='#666'
                    style={styles.remarksIcon}
                  />
                  <TextInput
                    style={[styles.textInput, styles.remarksInput]}
                    placeholder='Add any notes or special memories about this activity...'
                    value={remarks}
                    onChangeText={setRemarks}
                    multiline
                    numberOfLines={3}
                    maxLength={500}
                    textAlignVertical='top'
                  />
                </View>
                <View style={styles.characterCount}>
                  <Text style={styles.characterCountText}>
                    {remarks.length}/500 characters
                  </Text>
                </View>
                {validationErrors.remarks && (
                  <Text style={styles.errorText}>
                    {validationErrors.remarks}
                  </Text>
                )}
              </View>

              {/* Photos Section */}
              <View style={styles.formGroup}>
                <Text style={styles.fieldLabel}>Photos (Optional)</Text>
                <Text style={styles.fieldSubtitle}>
                  Add up to 10 photos to capture this special moment
                </Text>

                {validationErrors.photos && (
                  <Text style={styles.errorText}>
                    {validationErrors.photos}
                  </Text>
                )}

                {/* Photo Grid */}
                <View style={styles.photoGrid}>
                  {photos.map((photo, index) => (
                    <TouchableOpacity
                      key={photo.id}
                      style={styles.photoContainer}
                      activeOpacity={0.8}
                    >
                      <Image
                        source={{ uri: photo.uri }}
                        style={styles.photoThumbnail}
                      />

                      {/* Photo Controls Overlay */}
                      <View style={styles.photoControls}>
                        {/* Reorder Controls */}
                        <View style={styles.reorderControls}>
                          {index > 0 && (
                            <TouchableOpacity
                              style={styles.reorderButton}
                              onPress={() => movePhotoLeft(index)}
                            >
                              <Ionicons
                                name='chevron-back'
                                size={16}
                                color='white'
                              />
                            </TouchableOpacity>
                          )}
                          {index < photos.length - 1 && (
                            <TouchableOpacity
                              style={styles.reorderButton}
                              onPress={() => movePhotoRight(index)}
                            >
                              <Ionicons
                                name='chevron-forward'
                                size={16}
                                color='white'
                              />
                            </TouchableOpacity>
                          )}
                        </View>

                        {/* Delete Button */}
                        <TouchableOpacity
                          style={styles.deletePhotoButton}
                          onPress={() => removePhoto(photo.id)}
                        >
                          <Ionicons name='close' size={16} color='white' />
                        </TouchableOpacity>
                      </View>

                      {/* Photo Index */}
                      <View style={styles.photoIndex}>
                        <Text style={styles.photoIndexText}>{index + 1}</Text>
                      </View>
                    </TouchableOpacity>
                  ))}

                  {/* Add Photo Button */}
                  {photos.length < 10 && (
                    <TouchableOpacity
                      style={styles.addPhotoButton}
                      onPress={showPhotoOptions}
                    >
                      <Ionicons
                        name='camera-outline'
                        size={32}
                        color='#48b6b0'
                      />
                      <Text style={styles.addPhotoText}>Add Photo</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* Photo Count */}
                {photos.length > 0 && (
                  <View style={styles.photoCount}>
                    <Text style={styles.photoCountText}>
                      {photos.length}/10 photos added
                    </Text>
                  </View>
                )}
              </View>

              {/* Book Information Input for Reading Time */}
              {selectedActivityType === 'Reading Time' && (
                <View style={styles.formGroup}>
                  <View style={styles.bookInfoHeader}>
                    <Ionicons name='book-outline' size={20} color='#4CAF50' />
                    <Text style={styles.fieldLabel}>
                      Book Information (Optional)
                    </Text>
                  </View>
                  <Text style={styles.fieldSubtitle}>
                    Add details about the book you read together
                  </Text>

                  {/* Book Title Input */}
                  <View style={styles.inputContainer}>
                    <Ionicons name='library-outline' size={20} color='#666' />
                    <TextInput
                      style={styles.textInput}
                      placeholder='Book title (e.g., The Very Hungry Caterpillar)'
                      value={bookTitle}
                      onChangeText={setBookTitle}
                      maxLength={100}
                    />
                    {bookTitle.length > 0 && (
                      <TouchableOpacity onPress={() => setBookTitle('')}>
                        <Ionicons name='close-circle' size={20} color='#ccc' />
                      </TouchableOpacity>
                    )}
                  </View>

                  {/* Book Author Input */}
                  <View style={styles.inputContainer}>
                    <Ionicons name='person-outline' size={20} color='#666' />
                    <TextInput
                      style={styles.textInput}
                      placeholder='Author name (e.g., Eric Carle)'
                      value={bookAuthor}
                      onChangeText={setBookAuthor}
                      maxLength={50}
                    />
                    {bookAuthor.length > 0 && (
                      <TouchableOpacity onPress={() => setBookAuthor('')}>
                        <Ionicons name='close-circle' size={20} color='#ccc' />
                      </TouchableOpacity>
                    )}
                  </View>

                  {/* Clear Book Info Button */}
                  {hasBookInfo() && (
                    <TouchableOpacity
                      style={styles.clearBookButton}
                      onPress={clearBookInfo}
                    >
                      <Ionicons name='trash-outline' size={16} color='#666' />
                      <Text style={styles.clearBookButtonText}>
                        Clear book information
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </View>
          )}

          {/* Child Feeling Selector */}
          {selectedChildren.length > 0 && (
            <ChildFeelingSelector
              selectedChildren={selectedChildren}
              childrenFeelings={childrenFeelings}
              onFeelingChange={handleFeelingChange}
            />
          )}

          {/* Selection Summary */}
          {(selectedChildren.length > 0 || selectedActivityType) && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Selection Summary</Text>

              {selectedChildren.length > 0 && (
                <View style={styles.summaryRow}>
                  <Ionicons name='people-outline' size={20} color='#666' />
                  <Text style={styles.summaryText}>
                    {selectedChildren.length} child
                    {selectedChildren.length > 1 ? 'ren' : ''} selected:{' '}
                    {selectedChildren
                      .map((child) => getChildDisplayName(child))
                      .join(', ')}
                  </Text>
                </View>
              )}

              {selectedActivityType && (
                <View style={styles.summaryRow}>
                  <Ionicons
                    name={
                      activityTypes.find((t) => t.id === selectedActivityType)
                        ?.icon
                    }
                    size={20}
                    color={
                      activityTypes.find((t) => t.id === selectedActivityType)
                        ?.color
                    }
                  />
                  <Text style={styles.summaryText}>
                    Activity type: {selectedActivityType}
                  </Text>
                </View>
              )}
            </View>
          )}
        </ScrollView>

        {/* Date/Time Picker Modals */}
        <DateTimePickerModal
          visible={showStartTimePicker}
          onClose={handleStartTimeCancel}
          onConfirm={handleStartTimeConfirm}
          initialValue={startTime}
          maximumDate={new Date()} // Cannot select future dates
          title='Select Start Time'
        />

        <DateTimePickerModal
          visible={showEndTimePicker}
          onClose={handleEndTimeCancel}
          onConfirm={handleEndTimeConfirm}
          initialValue={endTime}
          minimumDate={startTime} // Must be after start time
          maximumDate={new Date(new Date().setHours(23, 59, 59, 999))} // Last minute of today
          title='Select End Time'
        />

        {/* Book detection modal removed - now using manual input */}
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
  nextButton: {
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
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
  },

  // Child Selection Styles
  emptyChildrenContainer: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  emptyChildrenText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginTop: 12,
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
    position: 'relative',
  },
  selectedChildOption: {
    backgroundColor: '#E3F2FD',
    borderWidth: 3,
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
  selectedIndicator: {
    position: 'absolute',
    top: -5,
    right: -5,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#48b6b0',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Activity Type Styles
  activityTypeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  activityTypeOption: {
    width: '48%',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#ddd',
    backgroundColor: '#f9f9f9',
    marginBottom: 12,
    position: 'relative',
  },
  selectedActivityTypeOption: {
    backgroundColor: '#f8f9fa',
    borderWidth: 3,
  },
  activityTypeIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  activityTypeName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
    textAlign: 'center',
  },
  activityTypeDescription: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
    lineHeight: 16,
  },
  selectedActivityIndicator: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Summary Styles
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  summaryText: {
    fontSize: 14,
    color: '#333',
    marginLeft: 8,
    flex: 1,
  },

  // Form Styles
  formGroup: {
    marginBottom: 20,
  },
  fieldLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  fieldSubtitle: {
    fontSize: 12,
    color: '#666',
    marginBottom: 12,
    fontStyle: 'italic',
  },

  // Time Selection Styles
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  timeField: {
    flex: 1,
  },
  timeLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
    textAlign: 'center',
  },
  timeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#ddd',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  timeTextContainer: {
    marginLeft: 12,
    flex: 1,
  },
  timeText: {
    fontSize: 16,
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
    alignItems: 'center',
  },

  // Input Styles
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  textInput: {
    flex: 1,
    fontSize: 16,
    color: '#333',
    marginLeft: 8,
  },
  remarksContainer: {
    alignItems: 'flex-start',
    paddingVertical: 12,
  },
  remarksIcon: {
    marginTop: 2,
  },
  remarksInput: {
    minHeight: 60,
    textAlignVertical: 'top',
  },
  characterCount: {
    alignItems: 'flex-end',
    marginTop: 4,
  },
  characterCountText: {
    fontSize: 12,
    color: '#666',
  },

  // Error Styles
  errorInput: {
    borderColor: '#F44336',
    backgroundColor: '#FFEBEE',
  },
  errorBorder: {
    borderColor: '#F44336',
    borderWidth: 2,
  },
  errorText: {
    fontSize: 12,
    color: '#F44336',
    marginTop: 4,
  },

  // Photo Management Styles
  fieldSubtitle: {
    fontSize: 12,
    color: '#666',
    marginBottom: 12,
    marginTop: -4,
  },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
  },
  photoContainer: {
    width: PHOTO_SIZE,
    height: PHOTO_SIZE,
    marginRight: 8,
    marginBottom: 8,
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
  },
  photoThumbnail: {
    width: '100%',
    height: '100%',
    backgroundColor: '#f0f0f0',
  },
  photoControls: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'space-between',
    padding: 4,
  },
  reorderControls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  reorderButton: {
    backgroundColor: 'rgba(0, 122, 255, 0.8)',
    borderRadius: 12,
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deletePhotoButton: {
    backgroundColor: 'rgba(244, 67, 54, 0.8)',
    borderRadius: 12,
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'flex-end',
  },
  photoIndex: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 10,
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoIndexText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  addPhotoButton: {
    width: PHOTO_SIZE,
    height: PHOTO_SIZE,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#48b6b0',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    marginRight: 8,
    marginBottom: 8,
  },
  addPhotoText: {
    fontSize: 12,
    color: '#48b6b0',
    marginTop: 4,
    fontWeight: '500',
  },
  photoCount: {
    alignItems: 'flex-end',
    marginTop: 8,
  },
  photoCountText: {
    fontSize: 12,
    color: '#666',
  },

  // Book Information Styles
  bookInfoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  fieldSubtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
    lineHeight: 20,
  },
  clearBookButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    marginTop: 8,
    gap: 6,
  },
  clearBookButtonText: {
    fontSize: 14,
    color: '#666',
  },
  bookInfoContainer: {
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  bookInfoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  bookInfoTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginLeft: 6,
  },
  bookInfoContent: {
    marginLeft: 26,
  },
  bookInfoRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  bookInfoLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666',
    width: 80,
  },
  bookInfoValue: {
    fontSize: 14,
    color: '#333',
    flex: 1,
  },
});
