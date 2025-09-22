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
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import TextractService from '../services/TextractService';
import { 
  showErrorAlert, 
  withErrorHandling, 
  getUserFriendlyErrorMessage,
  validateFormData 
} from '../utils/errorUtils';

export default function BookDetectionModal({
  visible,
  onClose,
  onBookInfoConfirmed,
  imageUri,
}) {
  const [loading, setLoading] = useState(false);
  const [detectionResult, setDetectionResult] = useState(null);
  const [detectionError, setDetectionError] = useState(null);
  const [manualMode, setManualMode] = useState(false);
  
  // Form state for book information
  const [bookTitle, setBookTitle] = useState('');
  const [bookAuthor, setBookAuthor] = useState('');
  const [useDetectedInfo, setUseDetectedInfo] = useState(true);
  
  // Validation state
  const [validationErrors, setValidationErrors] = useState({});

  useEffect(() => {
    if (visible && imageUri) {
      resetState();
      performBookDetection();
    }
  }, [visible, imageUri]);

  const resetState = () => {
    setLoading(false);
    setDetectionResult(null);
    setDetectionError(null);
    setManualMode(false);
    setBookTitle('');
    setBookAuthor('');
    setUseDetectedInfo(true);
    setValidationErrors({});
  };

  const performBookDetection = async () => {
    if (!imageUri) {
      setDetectionError('No image provided for book detection');
      return;
    }

    const result = await withErrorHandling(
      async () => {
        console.log('=== BOOK DETECTION MODAL: Starting detection ===');
        console.log('Image URI:', imageUri);

        setLoading(true);
        setDetectionError(null);

        const textractService = new TextractService();
        const detectionResult = await textractService.detectBookInformation(imageUri);
        
        console.log('=== BOOK DETECTION MODAL: Detection result ===');
        console.log('Result:', detectionResult);

        if (detectionResult.success && detectionResult.bookInfo) {
          setDetectionResult(detectionResult);
          
          // Pre-fill form with detected information
          if (detectionResult.bookInfo.title) {
            setBookTitle(detectionResult.bookInfo.title);
          }
          if (detectionResult.bookInfo.author) {
            setBookAuthor(detectionResult.bookInfo.author);
          }
          
          console.log('=== BOOK DETECTION MODAL: Detection successful ===');
          console.log('Title:', detectionResult.bookInfo.title);
          console.log('Author:', detectionResult.bookInfo.author);
          console.log('Confidence:', detectionResult.confidence);
        } else {
          // Detection failed or no book info found
          const errorMessage = detectionResult.error || 'Could not detect book information from the image';
          setDetectionError(errorMessage);
          setManualMode(true);
          console.log('=== BOOK DETECTION MODAL: Detection failed ===');
          console.log('Error:', detectionResult.error);
        }
      },
      {
        showErrors: false, // We'll handle errors manually
        maxRetries: 1,
        requiresNetwork: true,
        onError: (error) => {
          console.error('=== BOOK DETECTION MODAL: Detection error ===');
          console.error('Error:', error);
          
          const errorInfo = getUserFriendlyErrorMessage(error);
          setDetectionError(errorInfo.message);
          setManualMode(true);
        }
      }
    );

    setLoading(false);

    if (!result.success && result.error) {
      // Additional error handling for specific cases
      const errorMessage = result.error.message?.toLowerCase() || '';
      
      if (errorMessage.includes('network') || errorMessage.includes('connection')) {
        setDetectionError('Network connection required for book detection. Please check your internet connection and try again.');
      } else if (errorMessage.includes('credentials') || errorMessage.includes('service')) {
        setDetectionError('Book detection service is temporarily unavailable. Please enter book information manually.');
      } else {
        setDetectionError('Could not detect book information from the image. You can enter the details manually.');
      }
      
      setManualMode(true);
    }
  };

  const validateForm = () => {
    const validationRules = {
      title: {
        required: true,
        minLength: 2,
        maxLength: 100,
        label: 'Book title'
      },
      author: {
        required: false,
        minLength: 2,
        maxLength: 50,
        label: 'Author name'
      }
    };

    const formData = {
      title: bookTitle.trim(),
      author: bookAuthor.trim()
    };

    const validation = validateFormData(formData, validationRules);
    setValidationErrors(validation.errors);
    
    return validation.isValid;
  };

  const handleConfirm = () => {
    if (!validateForm()) {
      Alert.alert('Validation Error', 'Please fix the errors before continuing.');
      return;
    }

    const bookInfo = {
      title: bookTitle.trim(),
      author: bookAuthor.trim() || null,
      detectedByAI: !manualMode && detectionResult && detectionResult.success,
      coverImageUri: imageUri,
      confidence: detectionResult?.confidence || 0,
      detectionTimestamp: new Date().toISOString(),
    };

    console.log('=== BOOK DETECTION MODAL: Confirming book info ===');
    console.log('Book info:', bookInfo);

    onBookInfoConfirmed(bookInfo);
  };

  const handleRetryDetection = () => {
    setManualMode(false);
    setDetectionError(null);
    performBookDetection();
  };

  const handleManualInput = () => {
    setManualMode(true);
    setUseDetectedInfo(false);
    // Clear any detected values to start fresh
    setBookTitle('');
    setBookAuthor('');
  };

  const handleUseDetected = () => {
    if (detectionResult && detectionResult.bookInfo) {
      setManualMode(false);
      setUseDetectedInfo(true);
      setBookTitle(detectionResult.bookInfo.title || '');
      setBookAuthor(detectionResult.bookInfo.author || '');
    }
  };

  const canConfirm = bookTitle.trim().length > 0;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.cancelButton}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Book Detection</Text>
          <TouchableOpacity 
            onPress={handleConfirm} 
            disabled={!canConfirm || loading}
          >
            <Text style={[
              styles.confirmButton, 
              (!canConfirm || loading) && styles.disabledButton
            ]}>
              Confirm
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Book Cover Image */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Book Cover</Text>
            {imageUri && (
              <View style={styles.imageContainer}>
                <Image source={{ uri: imageUri }} style={styles.bookCoverImage} />
              </View>
            )}
          </View>

          {/* Detection Status */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Detection Status</Text>
            
            {loading && (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#48b6b0" />
                <Text style={styles.loadingText}>
                  Analyzing book cover with AI...
                </Text>
                <Text style={styles.loadingSubtext}>
                  This may take a few seconds
                </Text>
              </View>
            )}

            {!loading && detectionResult && detectionResult.success && (
              <View style={styles.successContainer}>
                <View style={styles.statusHeader}>
                  <Ionicons name="checkmark-circle" size={24} color="#4CAF50" />
                  <Text style={styles.successTitle}>Book Information Detected!</Text>
                </View>
                <Text style={styles.successSubtext}>
                  AI successfully identified book information from the cover
                </Text>
                {detectionResult.confidence && (
                  <Text style={styles.confidenceText}>
                    Confidence: {Math.round(detectionResult.confidence)}%
                  </Text>
                )}
              </View>
            )}

            {!loading && detectionError && (
              <View style={styles.errorContainer}>
                <View style={styles.statusHeader}>
                  <Ionicons name="alert-circle" size={24} color="#F44336" />
                  <Text style={styles.errorTitle}>Detection Failed</Text>
                </View>
                <Text style={styles.errorText}>{detectionError}</Text>
                <TouchableOpacity 
                  style={styles.retryButton}
                  onPress={handleRetryDetection}
                >
                  <Ionicons name="refresh" size={16} color="#48b6b0" />
                  <Text style={styles.retryButtonText}>Try Again</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Book Information Form */}
          <View style={styles.section}>
            <View style={styles.formHeader}>
              <Text style={styles.sectionTitle}>Book Information</Text>
              
              {/* Mode Toggle Buttons */}
              {!loading && detectionResult && detectionResult.success && (
                <View style={styles.modeToggle}>
                  <TouchableOpacity
                    style={[
                      styles.modeButton,
                      useDetectedInfo && styles.activeModeButton
                    ]}
                    onPress={handleUseDetected}
                  >
                    <Ionicons 
                      name="sparkles" 
                      size={16} 
                      color={useDetectedInfo ? 'white' : '#48b6b0'} 
                    />
                    <Text style={[
                      styles.modeButtonText,
                      useDetectedInfo && styles.activeModeButtonText
                    ]}>
                      Use AI Detection
                    </Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity
                    style={[
                      styles.modeButton,
                      manualMode && styles.activeModeButton
                    ]}
                    onPress={handleManualInput}
                  >
                    <Ionicons 
                      name="create" 
                      size={16} 
                      color={manualMode ? 'white' : '#48b6b0'} 
                    />
                    <Text style={[
                      styles.modeButtonText,
                      manualMode && styles.activeModeButtonText
                    ]}>
                      Manual Input
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* Title Field */}
            <View style={styles.formGroup}>
              <Text style={styles.fieldLabel}>
                Book Title <Text style={styles.requiredAsterisk}>*</Text>
              </Text>
              <View style={[
                styles.inputContainer,
                validationErrors.title && styles.errorInput
              ]}>
                <Ionicons name="book-outline" size={20} color="#666" />
                <TextInput
                  style={styles.textInput}
                  placeholder="Enter the book title"
                  value={bookTitle}
                  onChangeText={(text) => {
                    setBookTitle(text);
                    // Clear validation error when user starts typing
                    if (validationErrors.title) {
                      setValidationErrors(prev => ({ ...prev, title: undefined }));
                    }
                  }}
                  maxLength={100}
                  editable={!loading}
                />
              </View>
              {validationErrors.title && (
                <Text style={styles.errorText}>{validationErrors.title}</Text>
              )}
            </View>

            {/* Author Field */}
            <View style={styles.formGroup}>
              <Text style={styles.fieldLabel}>Author (Optional)</Text>
              <View style={[
                styles.inputContainer,
                validationErrors.author && styles.errorInput
              ]}>
                <Ionicons name="person-outline" size={20} color="#666" />
                <TextInput
                  style={styles.textInput}
                  placeholder="Enter the author's name"
                  value={bookAuthor}
                  onChangeText={(text) => {
                    setBookAuthor(text);
                    // Clear validation error when user starts typing
                    if (validationErrors.author) {
                      setValidationErrors(prev => ({ ...prev, author: undefined }));
                    }
                  }}
                  maxLength={50}
                  editable={!loading}
                />
              </View>
              {validationErrors.author && (
                <Text style={styles.errorText}>{validationErrors.author}</Text>
              )}
            </View>

            {/* Detection Info Display */}
            {!loading && detectionResult && detectionResult.success && !manualMode && (
              <View style={styles.detectionInfo}>
                <View style={styles.detectionInfoHeader}>
                  <Ionicons name="information-circle" size={16} color="#48b6b0" />
                  <Text style={styles.detectionInfoTitle}>AI Detection Results</Text>
                </View>
                <Text style={styles.detectionInfoText}>
                  The information above was automatically detected from your book cover image. 
                  You can edit it if needed or switch to manual input.
                </Text>
              </View>
            )}

            {/* Manual Input Info */}
            {manualMode && (
              <View style={styles.manualInfo}>
                <View style={styles.manualInfoHeader}>
                  <Ionicons name="create" size={16} color="#FF9800" />
                  <Text style={styles.manualInfoTitle}>Manual Input Mode</Text>
                </View>
                <Text style={styles.manualInfoText}>
                  Please enter the book information manually. This will be saved 
                  as user-provided information.
                </Text>
              </View>
            )}
          </View>

          {/* Summary */}
          {bookTitle.trim() && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Summary</Text>
              <View style={styles.summaryContainer}>
                <View style={styles.summaryRow}>
                  <Ionicons name="book" size={20} color="#4CAF50" />
                  <Text style={styles.summaryText}>
                    <Text style={styles.summaryLabel}>Title: </Text>
                    {bookTitle.trim()}
                  </Text>
                </View>
                
                {bookAuthor.trim() && (
                  <View style={styles.summaryRow}>
                    <Ionicons name="person" size={20} color="#4CAF50" />
                    <Text style={styles.summaryText}>
                      <Text style={styles.summaryLabel}>Author: </Text>
                      {bookAuthor.trim()}
                    </Text>
                  </View>
                )}
                
                <View style={styles.summaryRow}>
                  <Ionicons 
                    name={manualMode ? "create" : "sparkles"} 
                    size={20} 
                    color="#666" 
                  />
                  <Text style={styles.summaryText}>
                    <Text style={styles.summaryLabel}>Source: </Text>
                    {manualMode ? 'Manual input' : 'AI detection'}
                  </Text>
                </View>
              </View>
            </View>
          )}
        </ScrollView>
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
  confirmButton: {
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
    marginBottom: 16,
  },
  
  // Image Styles
  imageContainer: {
    alignItems: 'center',
    marginBottom: 8,
  },
  bookCoverImage: {
    width: 200,
    height: 250,
    borderRadius: 8,
    resizeMode: 'cover',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  
  // Loading Styles
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  loadingText: {
    fontSize: 16,
    color: '#333',
    marginTop: 12,
    fontWeight: '500',
  },
  loadingSubtext: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  
  // Success Styles
  successContainer: {
    paddingVertical: 16,
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  successTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4CAF50',
    marginLeft: 8,
  },
  successSubtext: {
    fontSize: 14,
    color: '#666',
    marginLeft: 32,
  },
  confidenceText: {
    fontSize: 12,
    color: '#666',
    marginLeft: 32,
    marginTop: 4,
    fontStyle: 'italic',
  },
  
  // Error Styles
  errorContainer: {
    paddingVertical: 16,
  },
  errorTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#F44336',
    marginLeft: 8,
  },
  errorText: {
    fontSize: 14,
    color: '#F44336',
    marginLeft: 32,
    marginBottom: 12,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginLeft: 32,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#48b6b0',
  },
  retryButtonText: {
    fontSize: 14,
    color: '#48b6b0',
    marginLeft: 4,
    fontWeight: '500',
  },
  
  // Form Styles
  formHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  modeToggle: {
    flexDirection: 'row',
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    padding: 2,
  },
  modeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    marginHorizontal: 1,
  },
  activeModeButton: {
    backgroundColor: '#48b6b0',
  },
  modeButtonText: {
    fontSize: 12,
    color: '#48b6b0',
    marginLeft: 4,
    fontWeight: '500',
  },
  activeModeButtonText: {
    color: 'white',
  },
  formGroup: {
    marginBottom: 20,
  },
  fieldLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  requiredAsterisk: {
    color: '#F44336',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: 'white',
  },
  errorInput: {
    borderColor: '#F44336',
  },
  textInput: {
    flex: 1,
    fontSize: 16,
    color: '#333',
    marginLeft: 8,
  },
  
  // Info Styles
  detectionInfo: {
    backgroundColor: '#E3F2FD',
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
  },
  detectionInfoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  detectionInfoTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#48b6b0',
    marginLeft: 4,
  },
  detectionInfoText: {
    fontSize: 12,
    color: '#666',
    lineHeight: 16,
  },
  manualInfo: {
    backgroundColor: '#FFF3E0',
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
  },
  manualInfoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  manualInfoTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FF9800',
    marginLeft: 4,
  },
  manualInfoText: {
    fontSize: 12,
    color: '#666',
    lineHeight: 16,
  },
  
  // Summary Styles
  summaryContainer: {
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    padding: 16,
  },
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
  summaryLabel: {
    fontWeight: '600',
  },
});