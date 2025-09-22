import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import TextractService from '../services/TextractService';

export default function TextractDemo() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const testTextract = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please grant camera roll permissions.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.Images,
        quality: 1,
      });

      if (!result.canceled && result.assets[0]) {
        setLoading(true);
        setResult(null);

        try {
          // Test text extraction
          const textResult = await TextractService.extractTextFromImage(result.assets[0].uri);
          
          // Test holiday extraction
          const holidays = TextractService.extractHolidayInfo(textResult.fullText);

          setResult({
            fullText: textResult.fullText,
            holidays: holidays,
            lines: textResult.lines,
          });

          Alert.alert(
            'Success!',
            `Extracted ${textResult.lines.length} lines of text and found ${holidays.length} potential holidays.`
          );
        } catch (error) {
          console.error('Textract test error:', error);
          Alert.alert('Error', `Failed to process image: ${error.message}`);
        } finally {
          setLoading(false);
        }
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to select image');
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>AWS Textract Demo</Text>
      <Text style={styles.subtitle}>Test holiday extraction from images</Text>

      <TouchableOpacity
        style={styles.testButton}
        onPress={testTextract}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator size="small" color="white" />
        ) : (
          <>
            <Ionicons name="camera" size={20} color="white" />
            <Text style={styles.testButtonText}>Test Textract</Text>
          </>
        )}
      </TouchableOpacity>

      {result && (
        <ScrollView style={styles.resultContainer}>
          <Text style={styles.resultTitle}>Extraction Results:</Text>
          
          <Text style={styles.sectionTitle}>Found Holidays ({result.holidays.length}):</Text>
          {result.holidays.map((holiday, index) => (
            <View key={index} style={styles.holidayItem}>
              <Text style={styles.holidayName}>{holiday.name}</Text>
              <Text style={styles.holidayDate}>{holiday.date || 'Date not parsed'}</Text>
              <Text style={styles.holidayOriginal}>"{holiday.originalText}"</Text>
            </View>
          ))}

          <Text style={styles.sectionTitle}>Full Extracted Text:</Text>
          <Text style={styles.fullText}>{result.fullText}</Text>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#f5f5f5',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 30,
  },
  testButton: {
    backgroundColor: '#48b6b0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 15,
    borderRadius: 10,
    marginBottom: 20,
  },
  testButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 10,
  },
  resultContainer: {
    flex: 1,
    backgroundColor: 'white',
    padding: 15,
    borderRadius: 10,
  },
  resultTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 15,
    marginBottom: 10,
    color: '#333',
  },
  holidayItem: {
    backgroundColor: '#f8f9fa',
    padding: 10,
    borderRadius: 8,
    marginBottom: 10,
  },
  holidayName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  holidayDate: {
    fontSize: 14,
    color: '#48b6b0',
    marginTop: 2,
  },
  holidayOriginal: {
    fontSize: 12,
    color: '#666',
    fontStyle: 'italic',
    marginTop: 2,
  },
  fullText: {
    fontSize: 14,
    color: '#333',
    lineHeight: 20,
  },
});