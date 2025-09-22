import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Image,
  FlatList,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import TextractService from '../services/TextractService';
import CalendarEventsService from '../services/CalendarEventsService';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function HolidayImportModal({
  visible,
  onClose,
  childId,
  childName,
}) {
  const [loading, setLoading] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [extractedText, setExtractedText] = useState([]);
  const [step, setStep] = useState('select'); // 'select', 'preview', 'processing', 'review'
  const [hasLocalData, setHasLocalData] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [tempDate, setTempDate] = useState(new Date());
  const [reminderDays, setReminderDays] = useState(90); // Default to 90 days before

  const requestPermissions = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Permission Required',
        'Please grant camera roll permissions to select images.'
      );
      return false;
    }
    return true;
  };

  const selectImageFromLibrary = async () => {
    const hasPermission = await requestPermissions();
    if (!hasPermission) return;

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setSelectedImage(result.assets[0]);
        setStep('preview');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to select image from library');
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Permission Required',
        'Please grant camera permissions to take photos.'
      );
      return;
    }

    try {
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: false,
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setSelectedImage(result.assets[0]);
        setStep('preview');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to take photo');
    }
  };

  const processImage = async (imageUri) => {
    setLoading(true);
    setStep('processing');

    try {
      console.log('=== TEXT EXTRACTION PROCESSING STARTED ===');
      console.log('Processing image for child:', childName);
      console.log('Image URI:', imageUri);

      // Extract text using Textract
      console.log('Calling TextractService.extractTextFromImage...');
      const textResult = await TextractService.extractTextFromImage(imageUri);

      console.log('=== TEXTRACT RESULT ===');
      console.log('Full text:', textResult.fullText);
      console.log('Lines:', textResult.lines);
      if (textResult.rawResponse) {
        console.log('Raw AWS Response:', textResult.rawResponse);
      }

      // Extract all text information
      console.log('Extracting all text information...');
      const textItems = TextractService.extractAllTextInfo(textResult.fullText);

      console.log('=== EXTRACTED TEXT ITEMS ===');
      console.log(`Found ${textItems.length} text items:`);
      textItems.forEach((item, index) => {
        console.log(`Text Item ${index + 1}:`);
        console.log(`  Content: ${item.content}`);
        console.log(`  Line Number: ${item.lineNumber}`);
        console.log(`  Original Text: ${item.originalText}`);
        console.log('---');
      });

      if (textItems.length === 0) {
        console.log('No text found in extracted content');
        Alert.alert(
          'No Text Found',
          'Could not extract any text from the image. Please try with a different image.'
        );
        resetModal();
        return;
      }

      setExtractedText(textItems);
      setStep('review');
      console.log('=== PROCESSING COMPLETED SUCCESSFULLY ===');
    } catch (error) {
      console.error('=== PROCESSING ERROR ===');
      console.error('Error details:', error);
      console.error('Error stack:', error.stack);
      Alert.alert(
        'Processing Error',
        `Failed to process the image: ${error.message}`
      );
      resetModal();
    } finally {
      setLoading(false);
    }
  };

  const toggleTextSelection = (textId) => {
    setExtractedText((prev) =>
      prev.map((textItem) =>
        textItem.id === textId
          ? { ...textItem, selected: !textItem.selected }
          : textItem
      )
    );
  };

  const selectAllText = () => {
    setExtractedText((prev) =>
      prev.map((textItem) => ({ ...textItem, selected: true }))
    );
  };

  const clearAllSelections = () => {
    setExtractedText((prev) =>
      prev.map((textItem) => ({ ...textItem, selected: false }))
    );
  };

  const formatDateForDisplay = (dateString) => {
    // Parse date string as local date to avoid timezone issues
    const [year, month, day] = dateString.split('-').map(Number);
    const date = new Date(year, month - 1, day); // month is 0-indexed
    return date.toLocaleDateString();
  };

  const handleEditDate = (item) => {
    setEditingItem(item);
    // Parse the current date
    const [year, month, day] = item.date.split('-').map(Number);
    const currentDate = new Date(year, month - 1, day);
    setTempDate(currentDate);
    setShowDatePicker(true);
  };

  const handleDateChange = (event, selectedDate) => {
    if (Platform.OS === 'android') {
      setShowDatePicker(false);
    }

    if (selectedDate && editingItem) {
      setTempDate(selectedDate);

      if (Platform.OS === 'android') {
        // On Android, immediately apply the change
        applyDateChange(selectedDate);
      }
    }
  };

  const applyDateChange = (newDate) => {
    if (!editingItem || !newDate) return;

    // Format date to YYYY-MM-DD
    const year = newDate.getFullYear();
    const month = String(newDate.getMonth() + 1).padStart(2, '0');
    const day = String(newDate.getDate()).padStart(2, '0');
    const formattedDate = `${year}-${month}-${day}`;

    // Update the item in the list
    setExtractedText((prev) =>
      prev.map((item) =>
        item.id === editingItem.id ? { ...item, date: formattedDate } : item
      )
    );

    setEditingItem(null);
    setShowDatePicker(false);
  };

  const cancelDateEdit = () => {
    setEditingItem(null);
    setShowDatePicker(false);
  };

  const saveSelectedText = async () => {
    const selectedText = extractedText.filter((t) => t.selected);

    if (selectedText.length === 0) {
      Alert.alert(
        'No Selection',
        'Please select at least one text item to save.'
      );
      return;
    }

    setLoading(true);

    try {
      console.log('=== SAVING SELECTED HOLIDAYS ===');
      console.log(`Processing ${selectedText.length} selected items`);

      const events = [];

      for (const item of selectedText) {
        if (item.date) {
          // Create holiday event with specific date
          const event = {
            id: `holiday_${Date.now()}_${Math.random()}`,
            title: item.content,
            eventType: 'Holiday',
            startDate: item.date, // Use startDate for all-day events
            endDate: item.date, // Same date for single-day holidays
            isAllDay: true, // Holidays are typically all-day events
            description: `Holiday imported from image for ${childName}${
              item.isMultiDate
                ? ` (Part ${item.dateIndex} of ${item.totalDates})`
                : ''
            }`,
            childId: childId,
            type: 'holiday',
            remindersEnabled: reminderDays > 0,
            reminders: reminderDays > 0 ? [`custom_${reminderDays}_days`] : [],
            isMultiDate: item.isMultiDate || false,
            originalEventId: item.originalEventId || null,
            dateIndex: item.dateIndex || null,
            totalDates: item.totalDates || null,
          };

          events.push(event);
          console.log(`Created holiday event: ${item.content} on ${item.date}`);
        } else {
          // Create note event for items without dates
          const event = {
            id: `note_${Date.now()}_${Math.random()}`,
            title: `Note: ${item.content}`,
            eventType: 'Personal',
            date:
              new Date().getFullYear() +
              '-' +
              String(new Date().getMonth() + 1).padStart(2, '0') +
              '-' +
              String(new Date().getDate()).padStart(2, '0'),
            time: '09:00',
            description: `Text extracted from image for ${childName}`,
            childId: childId,
            type: 'note',
            reminder: false,
          };

          events.push(event);
          console.log(`Created note event: ${item.content}`);
        }
      }

      // Save all events to calendar
      for (const event of events) {
        await CalendarEventsService.addEvent(event);
      }

      const holidayCount = events.filter((e) => e.type === 'holiday').length;
      const noteCount = events.filter((e) => e.type === 'note').length;

      Alert.alert(
        'Success',
        `Successfully imported ${holidayCount} holiday(s) to ${childName}'s calendar!`,
        [{ text: 'OK', onPress: () => handleClose() }]
      );

      console.log('=== IMPORT COMPLETED SUCCESSFULLY ===');
      console.log(`Total events created: ${events.length}`);
    } catch (error) {
      console.error('Import error:', error);
      Alert.alert('Error', 'Failed to import holidays to calendar.');
    } finally {
      setLoading(false);
    }
  };

  const resetModal = () => {
    setStep('select');
    setSelectedImage(null);
    setExtractedText([]);
    setLoading(false);
    setHasLocalData(false);
    setEditingItem(null);
    setShowDatePicker(false);
    setTempDate(new Date());
    setReminderDays(90);
  };

  const checkLocalData = async () => {
    try {
      const storedData = await AsyncStorage.getItem(
        'aws-textract-response.json'
      );
      setHasLocalData(!!storedData);
    } catch (error) {
      setHasLocalData(false);
    }
  };

  // Check for local data when modal becomes visible
  React.useEffect(() => {
    if (visible) {
      checkLocalData();
    }
  }, [visible]);

  const goBackToSelect = () => {
    setSelectedImage(null);
    setStep('select');
  };

  const proceedWithImage = () => {
    if (selectedImage) {
      processImage(selectedImage.uri);
    }
  };

  const useLocalData = async () => {
    setLoading(true);
    setStep('processing');

    try {
      console.log('=== USING LOCAL DEBUG DATA ===');
      console.log('Loading saved Textract response...');

      // Extract text using local data
      const textResult = await TextractService.extractTextFromLocalData();

      console.log('=== LOCAL TEXTRACT RESULT ===');
      console.log('Full text:', textResult.fullText);
      console.log('Lines:', textResult.lines);

      // Extract all text information
      console.log('Extracting all text information from local data...');
      const textItems = TextractService.extractAllTextInfo(textResult.fullText);

      console.log('=== EXTRACTED TEXT ITEMS FROM LOCAL DATA ===');
      console.log(`Found ${textItems.length} text items:`);
      textItems.forEach((item, index) => {
        console.log(`Text Item ${index + 1}:`);
        console.log(`  Content: ${item.content}`);
        console.log(`  Line Number: ${item.lineNumber}`);
        console.log(`  Original Text: ${item.originalText}`);
        console.log('---');
      });

      if (textItems.length === 0) {
        console.log('No text found in local data');
        Alert.alert(
          'No Text Found',
          'No text content found in local debug data.'
        );
        resetModal();
        return;
      }

      setExtractedText(textItems);
      setStep('review');
      console.log('=== LOCAL DATA PROCESSING COMPLETED SUCCESSFULLY ===');
    } catch (error) {
      console.error('=== LOCAL DATA PROCESSING ERROR ===');
      console.error('Error details:', error);
      console.error('Error stack:', error.stack);
      Alert.alert(
        'Local Data Error',
        `Failed to load local debug data: ${error.message}`
      );
      resetModal();
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    resetModal();
    onClose();
  };

  const renderTextItem = ({ item, index }) => (
    <TouchableOpacity
      style={[styles.textItem, item.selected && styles.selectedTextItem]}
      onPress={() => toggleTextSelection(item.id)}
      activeOpacity={0.7}
    >
      <View style={styles.textItemContent}>
        <View style={styles.itemNumber}>
          <Text style={styles.itemNumberText}>{index + 1}</Text>
        </View>
        <View style={styles.textInfo}>
          <Text style={styles.textContent} numberOfLines={3}>
            {item.content}
          </Text>
          <View style={styles.textMeta}>
            <View style={styles.dateContainer}>
              <Ionicons name='calendar-outline' size={12} color='#48b6b0' />
              <Text style={styles.dateText}>
                {item.date ? formatDateForDisplay(item.date) : 'No date found'}
                {item.isMultiDate && (
                  <Text style={styles.multiDateIndicator}>
                    {' '}
                    ({item.dateIndex}/{item.totalDates})
                  </Text>
                )}
              </Text>
            </View>
            <View style={styles.cardActions}>
              {item.date && (
                <TouchableOpacity
                  style={styles.editButton}
                  onPress={() => handleEditDate(item)}
                >
                  <Ionicons name='pencil' size={14} color='#48b6b0' />
                  <Text style={styles.editButtonText}>Edit</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <Modal
      visible={visible}
      animationType='slide'
      presentationStyle='pageSheet'
      onRequestClose={handleClose}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
            <Ionicons name='close' size={24} color='#48b6b0' />
          </TouchableOpacity>
          <Text style={styles.title}>Import School Holidays</Text>
          <Text style={styles.subtitle}>for {childName}</Text>
        </View>

        {/* Content */}
        <View style={styles.content}>
          {step === 'select' && (
            <ScrollView style={styles.scrollContent}>
              <View style={styles.selectStep}>
                <Text style={styles.stepDescription}>
                  Take or select a photo of a school holiday calendar to import
                </Text>

                <View style={styles.imageOptions}>
                  <TouchableOpacity
                    style={styles.imageOption}
                    onPress={takePhoto}
                  >
                    <Ionicons name='camera' size={48} color='#48b6b0' />
                    <Text style={styles.imageOptionText}>Take Photo</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.imageOption}
                    onPress={selectImageFromLibrary}
                  >
                    <Ionicons name='images' size={48} color='#48b6b0' />
                    <Text style={styles.imageOptionText}>From Library</Text>
                  </TouchableOpacity>

                  {/* <TouchableOpacity
                    style={[
                      styles.imageOption,
                      !hasLocalData && styles.imageOptionDisabled,
                    ]}
                    onPress={hasLocalData ? useLocalData : null}
                    disabled={!hasLocalData}
                  >
                    <Ionicons
                      name={hasLocalData ? 'folder' : 'folder-outline'}
                      size={48}
                      color={hasLocalData ? '#48b6b0' : '#ccc'}
                    />
                    <Text
                      style={[
                        styles.imageOptionText,
                        !hasLocalData && styles.imageOptionTextDisabled,
                      ]}
                    >
                      Local Data {hasLocalData ? '✓' : '(No data)'}
                    </Text>
                  </TouchableOpacity> */}
                </View>
              </View>
            </ScrollView>
          )}

          {step === 'preview' && (
            <>
              <ScrollView style={styles.scrollContent}>
                <View style={styles.previewStep}>
                  <Text style={styles.stepTitle}>Preview Selected Image</Text>
                  <Text style={styles.stepDescription}>
                    Review the image before processing. Make sure the text is
                    clear and readable.
                  </Text>

                  {selectedImage && (
                    <View style={styles.previewImageContainer}>
                      <Image
                        source={{ uri: selectedImage.uri }}
                        style={styles.previewImage}
                        resizeMode='contain'
                      />
                    </View>
                  )}
                </View>
              </ScrollView>

              <View style={styles.fixedBottomActions}>
                <TouchableOpacity
                  style={styles.previewBackButton}
                  onPress={goBackToSelect}
                >
                  <Ionicons name='arrow-back' size={20} color='#666' />
                  <Text style={styles.previewBackButtonText}>
                    Back
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.previewProceedButton}
                  onPress={proceedWithImage}
                >
                  <Text style={styles.previewProceedButtonText}>
                    Start
                  </Text>
                  <Ionicons name='arrow-forward' size={20} color='white' />
                </TouchableOpacity>
              </View>
            </>
          )}

          {step === 'processing' && (
            <ScrollView style={styles.scrollContent}>
              <View style={styles.processingStep}>
                {selectedImage && (
                  <Image
                    source={{ uri: selectedImage.uri }}
                    style={styles.selectedImage}
                  />
                )}
                <ActivityIndicator
                  size='large'
                  color='#48b6b0'
                  style={styles.loader}
                />
                <Text style={styles.processingText}>
                  {selectedImage
                    ? 'Processing image...'
                    : 'Loading local debug data...'}
                </Text>
                <Text style={styles.processingSubtext}>
                  {selectedImage
                    ? 'Detecting the school holidays from the image'
                    : 'Using saved Textract response for testing'}
                </Text>
              </View>
            </ScrollView>
          )}

          {step === 'review' && (
            <>
              <ScrollView style={styles.scrollContent}>
                <View style={styles.reviewStep}>
                  <View style={styles.headerSection}>
                    <Text style={styles.stepTitle}>
                      Detection Results
                    </Text>
                    <Text style={styles.stepDescription}>
                      Review and select the holiday you want to import
                    </Text>
                  </View>

                  <View style={styles.selectionControls}>
                    <TouchableOpacity
                      style={[styles.selectionButton, styles.selectAllButton]}
                      onPress={selectAllText}
                    >
                      <Ionicons
                        name='checkmark-done'
                        size={16}
                        color='#48b6b0'
                      />
                      <Text
                        style={[
                          styles.selectionButtonText,
                          styles.selectAllButtonText,
                        ]}
                      >
                        Select All ({extractedText.length})
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.selectionButton, styles.clearAllButton]}
                      onPress={clearAllSelections}
                    >
                      <Ionicons name='close-circle' size={16} color='#FF3B30' />
                      <Text
                        style={[
                          styles.selectionButtonText,
                          styles.clearAllButtonText,
                        ]}
                      >
                        Clear All
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {/* Event Reminder Section */}
                  <View style={styles.reminderSection}>
                    <View style={styles.reminderHeader}>
                      <Ionicons
                        name='notifications'
                        size={20}
                        color='#48b6b0'
                      />
                      <Text style={styles.reminderTitle}>
                        Holiday Event Reminder
                      </Text>
                    </View>
                    <Text style={styles.reminderDescription}>
                      Set how many days before each holiday you want to be
                      reminded
                    </Text>
                    <View style={styles.reminderOptions}>
                      {[
                        { value: 90, label: '90 days' },
                        { value: 30, label: '30 days' },
                        { value: 7, label: '1 week' },
                        { value: 0, label: 'None' },
                      ].map((option) => (
                        <TouchableOpacity
                          key={option.value}
                          style={[
                            styles.reminderOption,
                            reminderDays === option.value &&
                              styles.reminderOptionSelected,
                          ]}
                          onPress={() => setReminderDays(option.value)}
                        >
                          <Text
                            style={[
                              styles.reminderOptionText,
                              reminderDays === option.value &&
                                styles.reminderOptionTextSelected,
                            ]}
                          >
                            {option.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>

                  {extractedText.length > 0 ? (
                    <FlatList
                      data={extractedText}
                      renderItem={renderTextItem}
                      keyExtractor={(item) => item.id.toString()}
                      style={styles.textList}
                      scrollEnabled={false}
                      showsVerticalScrollIndicator={false}
                    />
                  ) : (
                    <View style={styles.emptyState}>
                      <Ionicons
                        name='document-text-outline'
                        size={48}
                        color='#ccc'
                      />
                      <Text style={styles.emptyStateTitle}>No Text Found</Text>
                      <Text style={styles.emptyStateDescription}>
                        No text content was extracted from the image. Try with a
                        different image or check image quality.
                      </Text>
                    </View>
                  )}
                </View>
              </ScrollView>

              <View style={styles.fixedBottomActions}>
                <TouchableOpacity
                  style={styles.backButton}
                  onPress={resetModal}
                >
                  <Ionicons name='arrow-back' size={18} color='#666' />
                  <Text style={styles.backButtonText}>Back</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.saveButton,
                    extractedText.some((t) => t.selected) &&
                      styles.saveButtonActive,
                  ]}
                  onPress={saveSelectedText}
                  disabled={!extractedText.some((t) => t.selected) || loading}
                >
                  {loading ? (
                    <ActivityIndicator size='small' color='white' />
                  ) : (
                    <>
                      <Ionicons name='save' size={18} color='white' />
                      <Text style={styles.saveButtonText}>
                        Import ({extractedText.filter((t) => t.selected).length}
                        )
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </View>

      {/* Date Picker Modal */}
      {showDatePicker && (
        <>
          {Platform.OS === 'ios' ? (
            <Modal
              visible={showDatePicker}
              transparent={true}
              animationType='slide'
            >
              <View style={styles.datePickerOverlay}>
                <View style={styles.datePickerContainer}>
                  <View style={styles.datePickerHeader}>
                    <TouchableOpacity onPress={cancelDateEdit}>
                      <Text style={styles.datePickerCancel}>Cancel</Text>
                    </TouchableOpacity>
                    <Text style={styles.datePickerTitle}>Edit Date</Text>
                    <TouchableOpacity onPress={() => applyDateChange(tempDate)}>
                      <Text style={styles.datePickerDone}>Done</Text>
                    </TouchableOpacity>
                  </View>
                  <DateTimePicker
                    value={tempDate}
                    mode='date'
                    display='spinner'
                    onChange={handleDateChange}
                    style={styles.datePicker}
                  />
                </View>
              </View>
            </Modal>
          ) : (
            <DateTimePicker
              value={tempDate}
              mode='date'
              display='default'
              onChange={handleDateChange}
            />
          )}
        </>
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: 'white',
    paddingTop: 60,
    paddingBottom: 20,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    alignItems: 'center',
  },
  closeButton: {
    position: 'absolute',
    top: 60,
    right: 20,
    padding: 10,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginTop: 4,
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    flex: 1,
    padding: 20,
  },
  fixedBottomActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 20,
    paddingBottom: 40,
    backgroundColor: 'white',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    gap: 12,
  },
  selectStep: {
    alignItems: 'center',
  },
  stepTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
    textAlign: 'center',
  },
  stepDescription: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 30,
    lineHeight: 22,
  },
  imageOptions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginTop: 10,
    flexWrap: 'wrap',
    gap: 50,
  },
  imageOption: {
    backgroundColor: 'white',
    padding: 50,
    borderRadius: 15,
    alignItems: 'center',
    minWidth: 300,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  imageOptionText: {
    fontSize: 16,
    color: '#333',
    marginTop: 10,
    textAlign: 'center',
  },
  imageOptionDisabled: {
    opacity: 0.5,
  },
  imageOptionTextDisabled: {
    color: '#999',
  },
  processingStep: {
    alignItems: 'center',
  },
  selectedImage: {
    width: 200,
    height: 150,
    borderRadius: 10,
    marginBottom: 20,
  },
  loader: {
    marginVertical: 20,
  },
  processingText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
    marginBottom: 10,
  },
  processingSubtext: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  reviewStep: {
    paddingBottom: 20,
  },
  headerSection: {
    marginBottom: 20,
  },
  reminderSection: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#e8e8e8',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  reminderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  reminderTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  reminderDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
    lineHeight: 20,
  },
  reminderOptions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 6,
  },
  reminderOption: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: '#f8f9fa',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    flex: 1,
    alignItems: 'center',
  },
  reminderOptionSelected: {
    backgroundColor: '#48b6b0',
    borderColor: '#48b6b0',
  },
  reminderOptionText: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
    textAlign: 'center',
  },
  reminderOptionTextSelected: {
    color: 'white',
    fontWeight: '600',
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  reviewImage: {
    width: '100%',
    height: 120,
    borderRadius: 10,
    marginBottom: 20,
  },
  selectionControls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
    gap: 12,
  },
  selectionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    flex: 1,
    gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  selectAllButton: {
    backgroundColor: '#e3f2fd',
    borderWidth: 1,
    borderColor: '#48b6b0',
  },
  clearAllButton: {
    backgroundColor: '#ffebee',
    borderWidth: 1,
    borderColor: '#FF3B30',
  },
  selectionButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  selectAllButtonText: {
    color: '#48b6b0',
  },
  clearAllButtonText: {
    color: '#FF3B30',
  },
  textList: {
    marginBottom: 0,
  },
  textItem: {
    backgroundColor: 'white',
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#e0e0e0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  selectedTextItem: {
    borderColor: '#48b6b0',
    backgroundColor: '#f8fbff',
    shadowColor: '#48b6b0',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  textItemContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 16,
  },
  itemNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#48b6b0',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    marginTop: 2,
  },
  itemNumberText: {
    fontSize: 14,
    fontWeight: '700',
    color: 'white',
  },

  textInfo: {
    flex: 1,
    marginRight: 8,
  },
  textContent: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
    lineHeight: 24,
    marginBottom: 8,
  },
  textMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dateText: {
    fontSize: 12,
    color: '#48b6b0',
    fontWeight: '600',
  },
  multiDateIndicator: {
    fontSize: 10,
    color: '#666',
    fontWeight: '400',
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f4ff',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#48b6b0',
    gap: 4,
  },
  editButtonText: {
    fontSize: 12,
    color: '#48b6b0',
    fontWeight: '600',
  },

  characterCount: {
    fontSize: 12,
    color: '#999',
    fontWeight: '400',
  },

  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 20,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#666',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyStateDescription: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    lineHeight: 20,
  },

  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f0f0f0',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 12,
    flex: 1,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  backButtonText: {
    fontSize: 16,
    color: '#333',
    fontWeight: '600',
    textAlign: 'center',
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ccc',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 12,
    flex: 1,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  saveButtonActive: {
    backgroundColor: '#48b6b0',
    shadowColor: '#48b6b0',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  saveButtonText: {
    fontSize: 16,
    color: 'white',
    fontWeight: '600',
    textAlign: 'center',
    flexShrink: 1,
  },
  optionButton: {
    alignItems: 'center',
    padding: 20,
    backgroundColor: 'white',
    borderRadius: 12,
    minWidth: 100,
    flex: 1,
    maxWidth: 110,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  previewStep: {
    flex: 1,
    alignItems: 'center',
  },
  previewImageContainer: {
    width: '100%',
    height: 400,
    backgroundColor: '#f8f8f8',
    borderRadius: 12,
    marginVertical: 20,
    padding: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  previewImage: {
    width: '100%',
    height: '100%',
    borderRadius: 8,
  },

  previewBackButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 12,
    flex: 0.45,
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  previewBackButtonText: {
    fontSize: 20,
    color: '#666',
    fontWeight: '600',
  },
  previewProceedButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#48b6b0',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 12,
    flex: 0.5,
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#48b6b0',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  previewProceedButtonText: {
    fontSize: 20,
    color: 'white',
    fontWeight: '600',
  },
  datePickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  datePickerContainer: {
    backgroundColor: 'white',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 40,
    alignItems: 'center',
  },
  datePickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    width: '100%',
  },
  datePickerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  datePickerCancel: {
    fontSize: 16,
    color: '#666',
  },
  datePickerDone: {
    fontSize: 16,
    color: '#48b6b0',
    fontWeight: '600',
  },
  datePicker: {
    height: 200,
    width: '100%',
    alignSelf: 'center',
  },
});
