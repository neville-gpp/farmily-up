import 'react-native-get-random-values';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Import AWS SDK components with error handling
let TextractClient, AnalyzeDocumentCommand;
try {
  const textractModule = require('@aws-sdk/client-textract');
  TextractClient = textractModule.TextractClient;
  AnalyzeDocumentCommand = textractModule.AnalyzeDocumentCommand;
} catch (error) {
  console.error('Failed to import AWS Textract SDK:', error);
  throw new Error('AWS Textract SDK not available. Please check your installation.');
}

class TextractService {
  constructor() {
    // Initialize AWS Textract client
    const configuredRegion = process.env.EXPO_PUBLIC_AWS_REGION || 'ap-east-1';
    const accessKeyId = process.env.EXPO_PUBLIC_AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.EXPO_PUBLIC_AWS_SECRET_ACCESS_KEY;

    if (!accessKeyId || !secretAccessKey) {
      console.error('❌ AWS credentials not properly configured');
      throw new Error('AWS credentials are required for Textract service');
    }

    // Textract region fallback - some regions don't support Textract
    const textractSupportedRegions = [
      'us-east-1', 'us-east-2', 'us-west-1', 'us-west-2',
      'eu-west-1', 'eu-west-2', 'eu-west-3', 'eu-central-1',
      'ap-southeast-1', 'ap-southeast-2', 'ap-northeast-1', 'ap-northeast-2',
      'ca-central-1'
    ];

    let region = configuredRegion;
    if (!textractSupportedRegions.includes(configuredRegion)) {
      console.warn(`⚠️ Region ${configuredRegion} may not support Textract. Falling back to us-east-1`);
      region = 'us-east-1';
    }

    // Verify AWS SDK is available
    if (!TextractClient || !AnalyzeDocumentCommand) {
      throw new Error('AWS Textract SDK components not available');
    }

    try {
      this.client = new TextractClient({
        region: region,
        credentials: {
          accessKeyId: accessKeyId,
          secretAccessKey: secretAccessKey,
        },
      });
    } catch (error) {
      throw new Error(`Failed to initialize AWS Textract client: ${error.message}`);
    }

    // Cache for Textract results to avoid redundant API calls
    this.textractCache = new Map();
    this.cacheExpiry = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
    
    // Debouncing for rapid successive calls
    this.pendingRequests = new Map();
    this.debounceDelay = 1000; // 1 second debounce

    // Store the region being used for diagnostics
    this.region = region;
    
    // Flag to enable mock mode if AWS SDK fails
    this.mockMode = false;
  }

  /**
   * Create a mock Textract response for testing/fallback
   */
  createMockTextractResponse() {
    return {
      Blocks: [
        {
          BlockType: 'PAGE',
          Id: 'mock-page-1',
          Confidence: 99.0,
          Geometry: {
            BoundingBox: {
              Width: 1.0,
              Height: 1.0,
              Left: 0.0,
              Top: 0.0
            }
          }
        },
        {
          BlockType: 'LINE',
          Id: 'mock-line-1',
          Text: 'Mock text extracted from image',
          Confidence: 95.0,
          Geometry: {
            BoundingBox: {
              Width: 0.8,
              Height: 0.1,
              Left: 0.1,
              Top: 0.1
            }
          }
        }
      ],
      DocumentMetadata: {
        Pages: 1
      }
    };
  }

  /**
   * Test AWS connectivity and credentials
   */
  async testConnectivity() {
    try {      
      // Test basic network connectivity
      const testResponse = await fetch('https://httpbin.org/get', { 
        method: 'GET',
        timeout: 5000 
      });
      
      if (!testResponse.ok) {
        throw new Error('Basic network connectivity test failed');
      }
      
      // Test AWS endpoint connectivity
      const textractEndpoint = `https://textract.${this.region}.amazonaws.com`;
      
      const endpointResponse = await fetch(textractEndpoint, {
        method: 'POST',
        timeout: 10000,
        headers: {
          'Content-Type': 'application/x-amz-json-1.1'
        }
      });
      
      return true;
      
    } catch (error) {
      console.error('❌ Connectivity test failed:', error.message);
      return false;
    }
  }

  /**
   * Generate cache key for image URI (React Native compatible)
   */
  generateCacheKey(imageUri) {
    try {
      // Create a simple hash-like key from the image URI
      const fileName = imageUri.split('/').pop() || 'unknown';
      const timestamp = Date.now().toString().slice(-6);
      
      // Simple string hash for consistency
      let hash = 0;
      for (let i = 0; i < imageUri.length; i++) {
        const char = imageUri.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
      }
      
      return `textract_${Math.abs(hash).toString(36)}_${fileName}_${timestamp}`;
    } catch (error) {
      return `textract_${Math.random().toString(36).substr(2, 9)}`;
    }
  }

  /**
   * Get cached Textract result
   */
  async getCachedResult(cacheKey) {
    try {
      const cachedData = await AsyncStorage.getItem(`textract_cache_${cacheKey}`);
      if (cachedData) {
        const parsed = JSON.parse(cachedData);
        const now = Date.now();
        
        // Check if cache is still valid
        if (now - parsed.timestamp < this.cacheExpiry) {
          console.log('=== USING CACHED TEXTRACT RESULT ===');
          console.log('Cache key:', cacheKey);
          console.log('Cached at:', new Date(parsed.timestamp).toISOString());
          return parsed.result;
        } else {
          // Remove expired cache
          await AsyncStorage.removeItem(`textract_cache_${cacheKey}`);
          console.log('Cache expired, removed:', cacheKey);
        }
      }
    } catch (error) {
      console.warn('Error reading cache:', error);
    }
    return null;
  }

  /**
   * Cache Textract result
   */
  async setCachedResult(cacheKey, result) {
    try {
      const cacheData = {
        timestamp: Date.now(),
        result: result
      };
      await AsyncStorage.setItem(`textract_cache_${cacheKey}`, JSON.stringify(cacheData));
      console.log('=== CACHED TEXTRACT RESULT ===');
      console.log('Cache key:', cacheKey);
    } catch (error) {
      console.warn('Error caching result:', error);
    }
  }

  /**
   * Clear expired cache entries
   */
  async clearExpiredCache() {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const textractKeys = keys.filter(key => key.startsWith('textract_cache_'));
      const now = Date.now();
      
      for (const key of textractKeys) {
        try {
          const cachedData = await AsyncStorage.getItem(key);
          if (cachedData) {
            const parsed = JSON.parse(cachedData);
            if (now - parsed.timestamp >= this.cacheExpiry) {
              await AsyncStorage.removeItem(key);
              console.log('Removed expired cache:', key);
            }
          }
        } catch (error) {
          // Remove corrupted cache entries
          await AsyncStorage.removeItem(key);
        }
      }
    } catch (error) {
      console.warn('Error clearing expired cache:', error);
    }
  }

  /**
   * Debounced Textract call to prevent rapid successive requests
   */
  async debouncedTextractCall(imageUri, cacheKey) {
    // Check if there's already a pending request for this image
    if (this.pendingRequests.has(cacheKey)) {
      console.log('=== DEBOUNCING TEXTRACT REQUEST ===');
      console.log('Waiting for existing request:', cacheKey);
      return await this.pendingRequests.get(cacheKey);
    }

    // Create new request promise
    const requestPromise = this.performTextractCall(imageUri, cacheKey);
    this.pendingRequests.set(cacheKey, requestPromise);

    try {
      const result = await requestPromise;
      return result;
    } finally {
      // Clean up pending request
      this.pendingRequests.delete(cacheKey);
    }
  }

  /**
   * Perform actual Textract API call
   */
  async performTextractCall(imageUri, cacheKey) {
    try {
      console.log('=== PERFORMING TEXTRACT API CALL ===');
      console.log('Image URI:', imageUri);
      console.log('Cache key:', cacheKey);

      // Test connectivity first
      console.log('🌐 Testing connectivity...');
      const connectivityOk = await this.testConnectivity();
      if (!connectivityOk) {
        throw new Error('Network connectivity issue detected. Please check your internet connection and AWS configuration.');
      }

      // Convert image to bytes
      console.log('📷 Converting image to bytes...');
      const response = await fetch(imageUri);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
      }
      
      const arrayBuffer = await response.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);

      console.log(`📊 Image size: ${bytes.length} bytes`);

      // Validate image size (AWS Textract has limits)
      const maxSize = 10 * 1024 * 1024; // 10MB limit for Textract
      if (bytes.length > maxSize) {
        throw new Error(`Image too large: ${bytes.length} bytes. Maximum allowed: ${maxSize} bytes`);
      }

      if (bytes.length === 0) {
        throw new Error('Image data is empty');
      }

      // Create Textract command with optimized parameters
      console.log('🔧 Creating Textract command...');
      let command;
      try {
        command = new AnalyzeDocumentCommand({
          Document: {
            Bytes: bytes,
          },
          FeatureTypes: ['TABLES', 'FORMS'], // Only request needed features
        });
        console.log('✅ Textract command created successfully');
      } catch (error) {
        console.error('❌ Failed to create Textract command:', error);
        throw new Error(`Failed to create Textract command: ${error.message}`);
      }

      console.log('☁️ Calling AWS Textract API...');
      
      // Call AWS Textract with enhanced error handling
      let result;
      try {
        result = await this.client.send(command);
        console.log('✅ Textract API call successful');
      } catch (sdkError) {
        console.error('❌ AWS SDK error:', sdkError);
        
        // Check for specific AWS SDK errors
        if (sdkError.name === 'TypeError' && sdkError.message.includes('requestHandler.handle is not a function')) {
          console.error('🔧 AWS SDK configuration issue detected');
          console.error('This is likely due to React Native compatibility issues with the AWS SDK');
          throw new Error('AWS SDK configuration error: Request handler not properly configured for React Native environment. Consider using a different AWS region or implementing a fallback mechanism.');
        }
        
        // Check for other common AWS SDK errors
        if (sdkError.code === 'NetworkingError' || sdkError.code === 'UnknownEndpoint') {
          throw new Error(`AWS service error: ${sdkError.message}. Try using a different AWS region.`);
        }
        
        throw sdkError;
      }

      console.log('✅ Textract API call successful');

      // Cache the result for future use
      await this.setCachedResult(cacheKey, result);

      return result;
    } catch (error) {
      console.error('=== TEXTRACT API CALL FAILED ===');
      console.error('Error:', error);
      
      // Enhanced error reporting
      if (error.name === 'TypeError' && error.message.includes('Network request failed')) {
        console.error('=== NETWORK ERROR DETAILS ===');
        console.error('This appears to be a network connectivity issue.');
        console.error('Possible causes:');
        console.error('1. No internet connection');
        console.error('2. AWS service endpoint unreachable');
        console.error('3. Firewall blocking AWS requests');
        console.error('4. Invalid AWS credentials');
        
        throw new Error('Network connectivity issue: Unable to reach AWS Textract service. Please check your internet connection and AWS credentials.');
      }
      
      if (error.code) {
        console.error('AWS Error Code:', error.code);
        console.error('AWS Error Message:', error.message);
      }
      
      throw error;
    }
  }

  /**
   * Convert image URI to base64 (simplified version)
   */
  async imageUriToBase64(uri) {
    try {
      const response = await fetch(uri);
      const blob = await response.blob();

      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const base64 = reader.result.split(',')[1];
          resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (error) {
      throw new Error(`Failed to convert image to base64: ${error.message}`);
    }
  }

  /**
   * Extract text from image using AWS Textract with caching and debouncing
   */
  async extractTextFromImage(imageUri) {
    try {
      console.log('=== OPTIMIZED AWS TEXTRACT SERVICE CALLED ===');
      console.log('Image URI:', imageUri);

      // Generate cache key for this image
      const cacheKey = this.generateCacheKey(imageUri);

      // Check cache first
      const cachedResult = await this.getCachedResult(cacheKey);
      if (cachedResult) {
        // Process cached result
        const textBlocks = cachedResult.Blocks?.filter((block) => block.BlockType === 'LINE') || [];
        const allText = textBlocks.map((block) => block.Text).join('\n');
        
        console.log('=== USING CACHED TEXTRACT RESULT ===');
        console.log(`Found ${textBlocks.length} cached text blocks`);
        
        return {
          fullText: allText,
          lines: textBlocks.map((block) => block.Text),
          rawResponse: cachedResult,
          fromCache: true,
        };
      }

      // Clear expired cache entries periodically
      if (Math.random() < 0.1) { // 10% chance to clean cache
        this.clearExpiredCache();
      }

      console.log('AWS Region:', process.env.EXPO_PUBLIC_AWS_REGION);
      console.log(
        'AWS Access Key ID:',
        process.env.EXPO_PUBLIC_AWS_ACCESS_KEY_ID ? 'Set' : 'Not set'
      );

      // Use debounced call to prevent rapid successive requests
      const result = await this.debouncedTextractCall(imageUri, cacheKey);

      // Save response to local storage for debugging
      await this.saveTextractResponseLocally(result);

      // Extract text blocks
      const textBlocks =
        result.Blocks?.filter((block) => block.BlockType === 'LINE') || [];
      console.log('=== EXTRACTED TEXT BLOCKS ===');
      console.log(`Found ${textBlocks.length} text blocks`);

      textBlocks.forEach((block, index) => {
        console.log(`Block ${index + 1}:`);
        console.log(`  ID: ${block.Id}`);
        console.log(`  Text: "${block.Text}"`);
        console.log(`  Confidence: ${block.Confidence}%`);
        if (block.Geometry?.BoundingBox) {
          console.log(`  Bounding Box:`, block.Geometry.BoundingBox);
        }
        console.log('---');
      });

      // Combine all text
      const allText = textBlocks.map((block) => block.Text).join('\n');
      console.log('=== COMBINED EXTRACTED TEXT ===');
      console.log(allText);
      console.log('=== END TEXTRACT RESPONSE ===');

      return {
        fullText: allText,
        lines: textBlocks.map((block) => block.Text),
        rawResponse: result,
        fromCache: false,
      };
    } catch (error) {
      console.error('=== AWS TEXTRACT ERROR ===');
      console.error('Error type:', error.constructor.name);
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);

      if (error.name === 'CredentialsProviderError') {
        throw new Error(
          'AWS credentials not configured properly. Please check your .env file.'
        );
      } else if (error.name === 'AccessDeniedException') {
        throw new Error(
          'AWS access denied. Please check your IAM permissions for Textract.'
        );
      } else if (error.name === 'InvalidParameterException') {
        throw new Error(
          'Invalid image format. Please use a supported image format (JPEG, PNG).'
        );
      } else if (error.name === 'ThrottlingException') {
        throw new Error(
          'AWS Textract rate limit exceeded. Please try again in a moment.'
        );
      } else if (error.message.includes('requestHandler.handle is not a function')) {
        console.warn('🔧 AWS SDK compatibility issue detected. Using mock response for testing.');
        console.warn('This is likely due to React Native environment incompatibility with AWS SDK.');
        
        // Use mock response as fallback
        const mockResponse = this.createMockTextractResponse();
        const textBlocks = mockResponse.Blocks?.filter((block) => block.BlockType === 'LINE') || [];
        const allText = textBlocks.map((block) => block.Text).join('\n');
        
        return {
          fullText: allText,
          lines: textBlocks.map((block) => block.Text),
          rawResponse: mockResponse,
          fromCache: false,
          mockMode: true,
          warning: 'Using mock data due to AWS SDK compatibility issues'
        };
      } else {
        throw new Error(`AWS Textract failed: ${error.message}`);
      }
    }
  }

  /**
   * Save Textract response to local storage for debugging
   */
  async saveTextractResponseLocally(response) {
    try {
      const responseData = {
        timestamp: new Date().toISOString(),
        response: response,
      };

      await AsyncStorage.setItem(
        'aws-textract-response.json',
        JSON.stringify(responseData, null, 2)
      );
      console.log('=== TEXTRACT RESPONSE SAVED LOCALLY ===');
      console.log('Saved to: aws-textract-response.json');
    } catch (error) {
      console.error('Failed to save Textract response locally:', error);
    }
  }

  /**
   * Load Textract response from local storage
   */
  async loadTextractResponseLocally() {
    try {
      const storedData = await AsyncStorage.getItem(
        'aws-textract-response.json'
      );
      if (storedData) {
        const responseData = JSON.parse(storedData);
        console.log('=== LOADED LOCAL TEXTRACT RESPONSE ===');
        console.log('Timestamp:', responseData.timestamp);
        return responseData.response;
      } else {
        throw new Error('No local Textract response found');
      }
    } catch (error) {
      console.error('Failed to load local Textract response:', error);
      throw new Error(
        'No local debug data available. Please process an image first to generate debug data.'
      );
    }
  }

  /**
   * Extract text from local Textract response (for debugging)
   */
  async extractTextFromLocalData() {
    try {
      console.log('=== USING LOCAL TEXTRACT DATA ===');

      // Load the saved response
      const result = await this.loadTextractResponseLocally();

      // Extract text blocks (same logic as real AWS response)
      const textBlocks =
        result.Blocks?.filter((block) => block.BlockType === 'LINE') || [];
      console.log('=== EXTRACTED TEXT BLOCKS FROM LOCAL DATA ===');
      console.log(`Found ${textBlocks.length} text blocks`);

      textBlocks.forEach((block, index) => {
        console.log(`Block ${index + 1}:`);
        console.log(`  ID: ${block.Id}`);
        console.log(`  Text: "${block.Text}"`);
        console.log(`  Confidence: ${block.Confidence}%`);
        if (block.Geometry?.BoundingBox) {
          console.log(`  Bounding Box:`, block.Geometry.BoundingBox);
        }
        console.log('---');
      });

      // Combine all text
      const allText = textBlocks.map((block) => block.Text).join('\n');
      console.log('=== COMBINED EXTRACTED TEXT FROM LOCAL DATA ===');
      console.log(allText);
      console.log('=== END LOCAL DATA PROCESSING ===');

      return {
        fullText: allText,
        lines: textBlocks.map((block) => block.Text),
        rawResponse: result,
      };
    } catch (error) {
      console.error('=== LOCAL DATA PROCESSING ERROR ===');
      console.error('Error details:', error);
      throw error;
    }
  }

  /**
   * Extract all text information without filtering
   */
  extractAllTextInfo(text) {
    const textItems = [];
    const lines = text.split('\n');

    // First pass: extract academic year from entire text
    const globalAcademicYear = this.extractYearRange(text);
    console.log('=== GLOBAL ACADEMIC YEAR CONTEXT ===');
    console.log('Detected academic year:', globalAcademicYear);

    lines.forEach((line, index) => {
      const trimmedLine = line.trim();

      // Skip empty lines
      if (!trimmedLine) {
        return;
      }

      // Extract dates from this line
      const extractedDates = this.extractDateFromText(trimmedLine);

      if (extractedDates && extractedDates.length > 0) {
        // Handle multiple dates - create separate items for each date
        if (extractedDates.length > 1) {
          console.log(`=== MULTI-DATE EVENT: ${trimmedLine} ===`);
          console.log(`Creating ${extractedDates.length} separate events`);

          extractedDates.forEach((date, dateIndex) => {
            const textItem = {
              id: Date.now() + Math.random() + index + dateIndex,
              content: trimmedLine,
              lineNumber: index + 1,
              originalText: line,
              selected: false,
              date: date,
              isMultiDate: true,
              dateIndex: dateIndex + 1,
              totalDates: extractedDates.length,
              originalEventId: `event_${index}_${Date.now()}`,
            };

            textItems.push(textItem);
          });
        } else {
          // Single date event
          const textItem = {
            id: Date.now() + Math.random() + index,
            content: trimmedLine,
            lineNumber: index + 1,
            originalText: line,
            selected: false,
            date: extractedDates[0],
            isMultiDate: false,
          };

          textItems.push(textItem);
        }
      } else {
        // No date found - skip this item (don't add to holiday list)
        console.log(`Skipping item without date: "${trimmedLine}"`);
      }
    });

    console.log('=== HOLIDAY EXTRACTION SUMMARY ===');
    console.log(`Total holidays created: ${textItems.length}`);
    console.log(`All items have valid dates: ${textItems.every((item) => item.date)}`);
    console.log(
      `Multi-date events: ${
        textItems.filter((item) => item.isMultiDate).length
      }`
    );

    return textItems;
  }

  /**
   * Format date to YYYY-MM-DD in local timezone (avoiding timezone issues)
   */
  formatDateToLocal(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Extract academic year range from text
   */
  extractYearRange(text) {
    const yearPatterns = [
      /(\d{4})-(\d{4})/g, // 2025-2026
      /(\d{4})\/(\d{4})/g, // 2025/2026
      /(\d{4})\s+to\s+(\d{4})/gi, // 2025 to 2026
    ];

    for (const pattern of yearPatterns) {
      const matches = [...text.matchAll(pattern)];
      for (const match of matches) {
        const startYear = parseInt(match[1]);
        const endYear = parseInt(match[2]);

        // Validate year range
        if (
          startYear >= 2020 &&
          startYear <= 2050 &&
          endYear >= 2020 &&
          endYear <= 2050 &&
          endYear === startYear + 1
        ) {
          return { startYear, endYear };
        }
      }
    }

    return null;
  }

  /**
   * Determine year from academic year context
   */
  determineYearFromAcademicYear(month, academicYearRange) {
    if (!academicYearRange) {
      // When no academic year is specified, use smart year logic
      const currentYear = new Date().getFullYear();
      const currentMonth = new Date().getMonth() + 1; // 0-indexed to 1-indexed
      
      // If we're in the second half of the year (July-Dec) and the month is Jan-July,
      // assume it's the next year
      if (currentMonth >= 7 && month >= 1 && month <= 7) {
        return currentYear + 1;
      }
      
      return currentYear;
    }

    if (month >= 8 && month <= 12) {
      return academicYearRange.startYear; // Aug-Dec
    }
    if (month >= 1 && month <= 7) {
      return academicYearRange.endYear; // Jan-Jul
    }

    return academicYearRange.startYear;
  }

  /**
   * Check if date is weekend
   */
  isWeekend(date) {
    const day = date.getDay();
    return day === 0 || day === 6; // Sunday or Saturday
  }

  /**
   * Validate date components and create date object
   */
  validateAndCreateDate(day, month, year) {
    // Validate ranges
    if (
      day < 1 ||
      day > 31 ||
      month < 1 ||
      month > 12 ||
      year < 2020 ||
      year > 2050
    ) {
      return null;
    }

    try {
      const date = new Date(year, month - 1, day);

      // Check for date overflow (e.g., Feb 30 becomes Mar 2)
      if (
        date.getDate() !== day ||
        date.getMonth() !== month - 1 ||
        date.getFullYear() !== year
      ) {
        return null;
      }

      return date;
    } catch (error) {
      return null;
    }
  }

  /**
   * Generate date range excluding weekends
   */
  generateDateRange(startDate, endDate, excludeWeekends = false) {
    const dates = [];
    const current = new Date(startDate);

    while (current <= endDate) {
      if (!excludeWeekends || !this.isWeekend(current)) {
        dates.push(new Date(current));
      }
      current.setDate(current.getDate() + 1);
    }

    return dates;
  }

  /**
   * Extract complex day ranges like "1-2 and 4-5/12" or "27-28/10"
   */
  extractComplexDayRanges(text, academicYear) {
    const extractedDates = [];

    // Pattern 1: Complex ranges with "and" - "1-2 and 4-5/12"
    const complexPattern = /((?:\d{1,2}-\d{1,2}(?:\s+and\s+)?)+)\/(\d{1,2})/gi;
    const complexMatches = [...text.matchAll(complexPattern)];

    if (complexMatches.length > 0) {
      console.log(
        'Found complex day range patterns with "and":',
        complexMatches.length
      );

      for (const match of complexMatches) {
        const rangesPart = match[1]; // "1-2 and 4-5"
        const month = parseInt(match[2]); // 12
        const year = this.determineYearFromAcademicYear(month, academicYear);

        console.log(`Processing complex range: "${rangesPart}/${month}"`);

        // Extract individual ranges from the ranges part
        const individualRanges = rangesPart.split(/\s+and\s+/i);

        for (const range of individualRanges) {
          const rangeMatch = range.match(/(\d{1,2})-(\d{1,2})/);
          if (rangeMatch) {
            const startDay = parseInt(rangeMatch[1]);
            const endDay = parseInt(rangeMatch[2]);

            console.log(
              `  Processing sub-range: ${startDay}-${endDay}/${month}`
            );

            for (let day = startDay; day <= endDay; day++) {
              const date = this.validateAndCreateDate(day, month, year);
              if (date) {
                extractedDates.push(date);
                console.log(
                  `    Created date: ${this.formatDateToLocal(date)}`
                );
              }
            }
          }
        }
      }

      return extractedDates;
    }

    // Pattern 2: Simple day ranges - "27-28/10" (but NOT cross-month like "22/12-1/1")
    // First, exclude any text that contains cross-month patterns
    const crossMonthPattern = /\d{1,2}\/\d{1,2}-\d{1,2}\/\d{1,2}/g;
    const hasCrossMonthPattern = crossMonthPattern.test(text);
    
    if (!hasCrossMonthPattern) {
      const simpleDayRangePattern = /(\d{1,2})-(\d{1,2})\/(\d{1,2})/g;
      const simpleDayRangeMatches = [...text.matchAll(simpleDayRangePattern)];

      if (simpleDayRangeMatches.length > 0) {
        console.log(
          'Found simple day range patterns:',
          simpleDayRangeMatches.length
        );

        for (const match of simpleDayRangeMatches) {
          const startDay = parseInt(match[1]);
          const endDay = parseInt(match[2]);
          const month = parseInt(match[3]);
          const year = this.determineYearFromAcademicYear(month, academicYear);

          console.log(`Processing simple range: ${startDay}-${endDay}/${month}`);

          for (let day = startDay; day <= endDay; day++) {
            const date = this.validateAndCreateDate(day, month, year);
            if (date) {
              extractedDates.push(date);
              console.log(`  Created date: ${this.formatDateToLocal(date)}`);
            }
          }
        }
      }
    } else {
      console.log('Skipping simple day range processing - cross-month pattern detected');
    }

    return extractedDates;
  }

  /**
   * Extract dates using priority system
   */
  extractDateFromText(text) {
    console.log('=== PROCESSING TEXT FOR DATES ===');
    console.log('Text:', text);

    // Step 1: Extract academic year context
    const academicYear = this.extractYearRange(text);
    console.log('Academic Year:', academicYear);

    const extractedDates = [];

    // Priority 1: Cross-Month Ranges (22/12-1/1)
    const crossMonthPattern = /(\d{1,2})\/(\d{1,2})-(\d{1,2})\/(\d{1,2})/g;
    const crossMonthMatches = [...text.matchAll(crossMonthPattern)];

    console.log(`=== CROSS-MONTH PATTERN MATCHING ===`);
    console.log(`Text: "${text}"`);
    console.log(`Pattern: ${crossMonthPattern}`);
    console.log(`Matches found: ${crossMonthMatches.length}`);

    if (crossMonthMatches.length > 0) {
      console.log(
        'Cross-month matches:',
        crossMonthMatches.map((m) => m[0])
      );
      console.log('Found cross-month patterns:', crossMonthMatches.length);

      for (const match of crossMonthMatches) {
        const startDay = parseInt(match[1]);
        const startMonth = parseInt(match[2]);
        const endDay = parseInt(match[3]);
        const endMonth = parseInt(match[4]);

        // Special handling for cross-month ranges
        let startYear, endYear;
        
        if (academicYear) {
          startYear = this.determineYearFromAcademicYear(startMonth, academicYear);
          endYear = this.determineYearFromAcademicYear(endMonth, academicYear);
        } else {
          // When no academic year, handle cross-month logic
          const currentYear = new Date().getFullYear();
          startYear = currentYear;
          
          // If end month is earlier than start month, it's next year
          if (endMonth < startMonth) {
            endYear = currentYear + 1;
          } else {
            endYear = currentYear;
          }
          
          console.log(`No academic year detected. Using smart year logic:`);
          console.log(`Start: ${startDay}/${startMonth}/${startYear}`);
          console.log(`End: ${endDay}/${endMonth}/${endYear}`);
        }

        const startDate = this.validateAndCreateDate(
          startDay,
          startMonth,
          startYear
        );
        const endDate = this.validateAndCreateDate(endDay, endMonth, endYear);

        if (startDate && endDate) {
          console.log(`=== CROSS-MONTH RANGE PROCESSING ===`);
          console.log(
            `Start: ${startDay}/${startMonth}/${startYear} (${this.formatDateToLocal(
              startDate
            )})`
          );
          console.log(
            `End: ${endDay}/${endMonth}/${endYear} (${this.formatDateToLocal(
              endDate
            )})`
          );

          const dateRange = this.generateDateRange(startDate, endDate, true); // Exclude weekends
          extractedDates.push(...dateRange);

          console.log(
            `Generated ${dateRange.length} dates (excluding weekends):`
          );
          dateRange.forEach((date, index) => {
            const dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][
              date.getDay()
            ];
            console.log(
              `  ${index + 1}. ${this.formatDateToLocal(date)} (${dayName})`
            );
          });

          console.log(
            `Cross-month range: ${startDay}/${startMonth}-${endDay}/${endMonth} generated ${dateRange.length} dates`
          );
        } else {
          console.log(`=== CROSS-MONTH RANGE ERROR ===`);
          console.log(`Start date validation: ${startDate ? 'OK' : 'FAILED'}`);
          console.log(`End date validation: ${endDate ? 'OK' : 'FAILED'}`);
          if (!startDate)
            console.log(
              `Invalid start: ${startDay}/${startMonth}/${startYear}`
            );
          if (!endDate)
            console.log(`Invalid end: ${endDay}/${endMonth}/${endYear}`);
        }
      }

      if (extractedDates.length > 0) {
        return extractedDates.map((date) => this.formatDateToLocal(date));
      }
    }

    // Priority 2: Day Ranges (27-28/10, 1-2 and 4-5/12)
    const complexDayRanges = this.extractComplexDayRanges(text, academicYear);

    if (complexDayRanges.length > 0) {
      console.log('Found complex day range patterns:', complexDayRanges.length);
      extractedDates.push(...complexDayRanges);

      if (extractedDates.length > 0) {
        return extractedDates.map((date) => this.formatDateToLocal(date));
      }
    }

    // Priority 3: Complete Dates (20/9, 27/9, 29/9)
    // Only if no day ranges detected
    const completePattern = /(\d{1,2})\/(\d{1,2})/g;
    const completeMatches = [...text.matchAll(completePattern)];

    if (completeMatches.length > 0) {
      console.log('Found complete date patterns:', completeMatches.length);

      for (const match of completeMatches) {
        const day = parseInt(match[1]);
        const month = parseInt(match[2]);
        const year = this.determineYearFromAcademicYear(month, academicYear);

        const date = this.validateAndCreateDate(day, month, year);
        if (date) {
          extractedDates.push(date);
        }
      }

      console.log(`Complete dates: found ${extractedDates.length} valid dates`);

      if (extractedDates.length > 0) {
        return extractedDates.map((date) => this.formatDateToLocal(date));
      }
    }

    // Fallback: Try other date formats
    const fallbackPatterns = [
      // Month Day, Year patterns
      /(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})/gi,
      // Day Month Year patterns
      /(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/gi,
    ];

    for (const pattern of fallbackPatterns) {
      const matches = [...text.matchAll(pattern)];
      for (const match of matches) {
        const parsedDate = this.parseDate(match[0]);
        if (parsedDate) {
          console.log('Fallback pattern matched:', match[0]);
          return [parsedDate];
        }
      }
    }

    console.log('No dates found in text');
    return null;
  }

  /**
   * Extract holiday information from text
   */
  extractHolidayInfo(text) {
    const holidays = [];
    const lines = text.split('\n');

    // Common holiday patterns
    const holidayPatterns = [
      // Date patterns: DD/MM/YYYY, MM/DD/YYYY, DD-MM-YYYY, etc.
      /(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/g,
      // Month Day, Year patterns
      /(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{2,4}/gi,
      // Day Month Year patterns
      /\d{1,2}\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{2,4}/gi,
      // Date ranges like 23/12/2024 - 3/1/2025
      /(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})\s*[-–—]\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/g,
    ];

    // Common holiday keywords
    const holidayKeywords = [
      'holiday',
      'vacation',
      'break',
      'day off',
      'festival',
      'celebration',
      'christmas',
      'easter',
      'thanksgiving',
      'new year',
      'birthday',
      'anniversary',
      'memorial',
      'independence',
      'labor day',
      'mothers day',
      'fathers day',
      'valentines',
      'halloween',
      'spring break',
      'summer break',
      'winter break',
      'school holiday',
      'public holiday',
      'bank holiday',
      'teacher',
      'development',
      'training',
    ];

    lines.forEach((line, index) => {
      const lowerLine = line.toLowerCase();

      // Skip header lines or lines that are just years
      if (
        lowerLine.includes('calendar') ||
        /^\d{4}[-\/]\d{4}$/.test(line.trim())
      ) {
        return;
      }

      // Check if line contains holiday keywords or dates
      const hasHolidayKeyword = holidayKeywords.some((keyword) =>
        lowerLine.includes(keyword)
      );

      const hasDate = holidayPatterns.some((pattern) => pattern.test(line));

      if (hasHolidayKeyword || hasDate) {
        // Try to extract dates from this line
        const extractedDates = this.extractDatesFromLine(line);

        if (extractedDates.length > 0) {
          extractedDates.forEach((dateInfo) => {
            const holiday = {
              id: Date.now() + Math.random(),
              name: this.extractHolidayName(line),
              date: dateInfo.date,
              originalText: line.trim(),
              selected: false,
              isDateRange: dateInfo.isRange,
              endDate: dateInfo.endDate,
            };

            // Avoid duplicates
            if (
              !holidays.some(
                (h) => h.date === holiday.date && h.name === holiday.name
              )
            ) {
              holidays.push(holiday);
            }
          });
        } else {
          // Add holiday without specific date
          const holiday = {
            id: Date.now() + Math.random(),
            name: this.extractHolidayName(line),
            date: null,
            originalText: line.trim(),
            selected: false,
            isDateRange: false,
          };
          holidays.push(holiday);
        }
      }
    });

    return holidays;
  }

  /**
   * Extract dates from a single line
   */
  extractDatesFromLine(line) {
    const dates = [];

    // Check for date ranges first (e.g., "23/12/2024 - 3/1/2025")
    const rangePattern =
      /(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})\s*[-–—]\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/g;
    const rangeMatches = [...line.matchAll(rangePattern)];

    if (rangeMatches.length > 0) {
      rangeMatches.forEach((match) => {
        const startDate = this.parseDate(match[1]);
        const endDate = this.parseDate(match[2]);
        if (startDate) {
          dates.push({
            date: startDate,
            endDate: endDate,
            isRange: true,
          });
        }
      });
      return dates;
    }

    // Check for single dates
    const singleDatePatterns = [
      /(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/g,
      /(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{2,4}/gi,
      /\d{1,2}\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{2,4}/gi,
    ];

    singleDatePatterns.forEach((pattern) => {
      const matches = [...line.matchAll(pattern)];
      matches.forEach((match) => {
        const date = this.parseDate(match[0]);
        if (date) {
          dates.push({
            date: date,
            isRange: false,
          });
        }
      });
    });

    return dates;
  }

  /**
   * Extract holiday name from text line
   */
  extractHolidayName(line) {
    // Remove common date patterns to get the holiday name
    let name = line
      .replace(
        /\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}(\s*[-–—]\s*\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})?/g,
        ''
      )
      .replace(
        /(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{2,4}/gi,
        ''
      )
      .replace(
        /\d{1,2}\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{2,4}/gi,
        ''
      )
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // If name is empty or too short, use original line
    if (!name || name.length < 3) {
      name = line.trim();
    }

    // Capitalize first letter of each word
    return name.replace(/\b\w/g, (l) => l.toUpperCase());
  }

  /**
   * Parse date string to standardized format
   */
  parseDate(dateString) {
    try {
      // Handle different date formats
      let date;

      // Try parsing as DD/MM/YYYY
      if (dateString.includes('/')) {
        const parts = dateString.split('/');
        if (parts.length === 3) {
          const day = parseInt(parts[0]);
          const month = parseInt(parts[1]);
          const year = parseInt(parts[2]);

          // Validate ranges
          if (
            day >= 1 &&
            day <= 31 &&
            month >= 1 &&
            month <= 12 &&
            year >= 2020 &&
            year <= 2030
          ) {
            date = new Date(year, month - 1, day);
          }
        }
      }
      // Try parsing as DD-MM-YYYY
      else if (dateString.includes('-')) {
        const parts = dateString.split('-');
        if (parts.length === 3) {
          const day = parseInt(parts[0]);
          const month = parseInt(parts[1]);
          const year = parseInt(parts[2]);

          if (
            day >= 1 &&
            day <= 31 &&
            month >= 1 &&
            month <= 12 &&
            year >= 2020 &&
            year <= 2030
          ) {
            date = new Date(year, month - 1, day);
          }
        }
      }
      // Try parsing natural language dates
      else {
        date = new Date(dateString);
      }

      // Validate date
      if (date && !isNaN(date.getTime())) {
        return this.formatDateToLocal(date); // Return YYYY-MM-DD format in local timezone
      }
    } catch (error) {
      console.warn('Failed to parse date:', dateString);
    }

    return null;
  }

  /**
   * Detect book information from image using AWS Textract with enhanced error handling and caching
   * @param {string} imageUri - URI of the book cover image
   * @returns {Promise<Object>} - Book detection result with title, author, and confidence
   */
  async detectBookInformation(imageUri) {
    const { 
      retryWithBackoff, 
      checkNetworkConnectivity, 
      logError 
    } = await import('../utils/errorUtils');

    const operation = async () => {
      try {
        console.log('=== OPTIMIZED BOOK DETECTION STARTED ===');
        console.log('Image URI:', imageUri);

        // Validate input
        if (!imageUri || typeof imageUri !== 'string') {
          throw new Error('Valid image URI is required for book detection');
        }

        // Check network connectivity before making AWS call
        const hasNetwork = await checkNetworkConnectivity();
        if (!hasNetwork) {
          throw new Error('No network connection available for book detection');
        }

        // Extract text from the book cover image
        const textResult = await this.extractTextFromImage(imageUri);
        
        if (!textResult || !textResult.fullText) {
          return {
            success: false,
            error: 'No text detected in the image',
            bookInfo: null,
            confidence: 0
          };
        }

        console.log('=== RAW TEXT EXTRACTED FOR BOOK DETECTION ===');
        console.log('Full text:', textResult.fullText);

        // Parse book information from extracted text
        const bookInfo = this.parseBookInformation(textResult.fullText);
        
        if (!bookInfo || (!bookInfo.title && !bookInfo.author)) {
          return {
            success: false,
            error: 'Could not identify book title or author from the image',
            bookInfo: null,
            confidence: 0
          };
        }

        console.log('=== BOOK DETECTION SUCCESSFUL ===');
        console.log('Detected book info:', bookInfo);

        return {
          success: true,
          bookInfo: {
            title: bookInfo.title || '',
            author: bookInfo.author || '',
            detectedByAI: true,
            coverImageUri: imageUri,
            confidence: bookInfo.confidence || 0,
            detectionTimestamp: new Date().toISOString(),
          },
          confidence: bookInfo.confidence || 0,
          error: null
        };

      } catch (error) {
        console.error('=== BOOK DETECTION ERROR ===');
        console.error('Error:', error);

        // Log error with context
        logError(error, { 
          context: 'detectBookInformation', 
          imageUri: imageUri ? 'provided' : 'missing',
          errorType: error.name || 'Unknown'
        });

        // Return structured error response
        return {
          success: false,
          error: this.getBookDetectionErrorMessage(error),
          bookInfo: null,
          confidence: 0
        };
      }
    };

    try {
      // Use retry mechanism for network-related errors
      return await retryWithBackoff(operation, 2, 2000);
    } catch (error) {
      console.error('Book detection failed after retries:', error);
      
      return {
        success: false,
        error: 'Book detection service is temporarily unavailable. Please try again later or enter book information manually.',
        bookInfo: null,
        confidence: 0
      };
    }
  }

  /**
   * Get user-friendly error message for book detection failures
   */
  getBookDetectionErrorMessage(error) {
    const errorMessage = error.message?.toLowerCase() || '';
    
    if (errorMessage.includes('network') || errorMessage.includes('connection')) {
      return 'Network connection required for book detection. Please check your internet connection.';
    }
    
    if (errorMessage.includes('credentials') || errorMessage.includes('access')) {
      return 'Book detection service is temporarily unavailable. Please try again later.';
    }
    
    if (errorMessage.includes('invalid') || errorMessage.includes('format')) {
      return 'Invalid image format. Please use a clear photo of the book cover.';
    }
    
    if (errorMessage.includes('no text')) {
      return 'No text found in the image. Please ensure the book cover is clearly visible and try again.';
    }
    
    return 'Could not detect book information from the image. You can enter the details manually.';
  }

  /**
   * Parse book information from extracted text with enhanced error handling
   */
  parseBookInformation(extractedText) {
    try {
      if (!extractedText || typeof extractedText !== 'string') {
        return null;
      }

      console.log('=== PARSING BOOK INFORMATION ===');
      console.log('Text to parse:', extractedText);

      const lines = extractedText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
      
      if (lines.length === 0) {
        return null;
      }

      let title = '';
      let author = '';
      let confidence = 0;

      // Enhanced parsing logic
      const titlePatterns = [
        // Look for lines that might be titles (longer, capitalized)
        /^[A-Z][A-Za-z\s]{3,50}$/,
        // Look for quoted text (often titles)
        /"([^"]{3,50})"/,
        // Look for text in title case
        /^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*$/
      ];

      const authorPatterns = [
        // Look for "by Author Name" patterns
        /(?:by|BY)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i,
        // Look for author-like names (First Last, First Middle Last)
        /^([A-Z][a-z]+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)$/,
        // Look for lines with common author indicators
        /(?:author|written by|created by)[\s:]+([A-Z][a-z\s]+)/i
      ];

      // Try to find title
      for (const line of lines) {
        for (const pattern of titlePatterns) {
          const match = line.match(pattern);
          if (match) {
            const potentialTitle = match[1] || match[0];
            if (potentialTitle.length >= 3 && potentialTitle.length <= 50) {
              title = potentialTitle.trim();
              confidence += 30;
              break;
            }
          }
        }
        if (title) break;
      }

      // Try to find author
      for (const line of lines) {
        for (const pattern of authorPatterns) {
          const match = line.match(pattern);
          if (match && match[1]) {
            const potentialAuthor = match[1].trim();
            if (potentialAuthor.length >= 3 && potentialAuthor.length <= 30) {
              author = potentialAuthor;
              confidence += 30;
              break;
            }
          }
        }
        if (author) break;
      }

      // Fallback: use first few lines as title if no pattern match
      if (!title && lines.length > 0) {
        const firstLine = lines[0];
        if (firstLine.length >= 3 && firstLine.length <= 50) {
          title = firstLine;
          confidence += 10;
        }
      }

      // Additional confidence based on text quality
      if (title && author) {
        confidence += 20;
      }

      const result = {
        title: title || null,
        author: author || null,
        confidence: Math.min(confidence, 100)
      };

      console.log('=== PARSED BOOK INFORMATION ===');
      console.log('Title:', result.title);
      console.log('Author:', result.author);
      console.log('Confidence:', result.confidence);

      return result;

    } catch (error) {
      console.error('Error parsing book information:', error);
      return null;
    }
  }

  /**
   * Legacy method for backward compatibility
   * This method processes extracted text and identifies book information
   */
  processBookDetectionResult(textResult, imageUri) {
    try {
      console.log('=== PROCESSING BOOK DETECTION RESULT ===');
      console.log('Full text:', textResult.fullText);
      console.log('Lines:', textResult.lines);

      // Parse the extracted text to identify book information
      const bookInfo = this.parseBookInformation(textResult.fullText, textResult.lines);

      console.log('=== BOOK DETECTION RESULT ===');
      console.log('Title:', bookInfo.title);
      console.log('Author:', bookInfo.author);
      console.log('Confidence:', bookInfo.confidence);
      console.log('Detection method:', bookInfo.detectionMethod);

      return {
        success: true,
        bookInfo: {
          title: bookInfo.title,
          author: bookInfo.author,
          detectedByAI: true,
          coverImageUri: imageUri
        },
        confidence: bookInfo.confidence,
        detectionMethod: bookInfo.detectionMethod,
        rawText: textResult.fullText,
        extractedLines: textResult.lines
      };

    } catch (error) {
      console.error('=== BOOK DETECTION ERROR ===');
      console.error('Error type:', error.constructor.name);
      console.error('Error message:', error.message);

      // Provide specific error handling for different failure scenarios
      let errorMessage = 'Book detection failed';
      let errorCode = 'UNKNOWN_ERROR';

      if (error.name === 'CredentialsProviderError') {
        errorMessage = 'AWS credentials not configured properly';
        errorCode = 'CREDENTIALS_ERROR';
      } else if (error.name === 'AccessDeniedException') {
        errorMessage = 'AWS access denied. Check Textract permissions';
        errorCode = 'ACCESS_DENIED';
      } else if (error.name === 'InvalidParameterException') {
        errorMessage = 'Invalid image format. Use JPEG or PNG';
        errorCode = 'INVALID_IMAGE';
      } else if (error.message.includes('No text detected')) {
        errorMessage = 'No text found in the image. Try a clearer photo';
        errorCode = 'NO_TEXT_DETECTED';
      } else if (error.message.includes('Network')) {
        errorMessage = 'Network error. Check your internet connection';
        errorCode = 'NETWORK_ERROR';
      } else {
        errorMessage = `Book detection failed: ${error.message}`;
        errorCode = 'TEXTRACT_ERROR';
      }

      return {
        success: false,
        error: errorMessage,
        errorCode: errorCode,
        originalError: error.message
      };
    }
  }

  /**
   * Parse extracted text to identify book title and author
   * @param {string} fullText - Complete extracted text from image
   * @param {Array<string>} lines - Array of individual text lines
   * @returns {Object} - Parsed book information with confidence scoring
   */
  parseBookInformation(fullText, lines = []) {
    console.log('=== PARSING BOOK INFORMATION ===');
    console.log('Full text length:', fullText.length);
    console.log('Number of lines:', lines.length);

    const result = {
      title: '',
      author: '',
      confidence: 0,
      detectionMethod: 'unknown'
    };

    // Clean and prepare text for analysis
    const cleanedLines = lines
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .filter(line => !this.isNoiseText(line));

    console.log('Cleaned lines:', cleanedLines);

    if (cleanedLines.length === 0) {
      console.log('No valid text lines found after cleaning');
      return result;
    }

    // Strategy 1: Look for common author indicators
    const authorResult = this.findAuthorInText(cleanedLines);
    if (authorResult.found) {
      result.author = authorResult.author;
      result.confidence += 30;
      result.detectionMethod = 'author_pattern';
      console.log(`Found author using pattern: "${result.author}"`);
    }

    // Strategy 2: Find title (usually the largest/most prominent text)
    const titleResult = this.findTitleInText(cleanedLines, result.author);
    if (titleResult.found) {
      result.title = titleResult.title;
      result.confidence += 40;
      if (result.detectionMethod === 'author_pattern') {
        result.detectionMethod = 'title_and_author_pattern';
      } else {
        result.detectionMethod = 'title_pattern';
      }
      console.log(`Found title: "${result.title}"`);
    }

    // Strategy 3: Fallback - use heuristics for title/author assignment
    if (!result.title && !result.author && cleanedLines.length > 0) {
      const fallbackResult = this.fallbackTitleAuthorDetection(cleanedLines);
      result.title = fallbackResult.title;
      result.author = fallbackResult.author;
      result.confidence += 20;
      result.detectionMethod = 'heuristic_fallback';
      console.log(`Fallback detection - Title: "${result.title}", Author: "${result.author}"`);
    }

    // Boost confidence if both title and author are found
    if (result.title && result.author) {
      result.confidence += 20;
    }

    // Cap confidence at 100
    result.confidence = Math.min(result.confidence, 100);

    console.log('=== FINAL BOOK PARSING RESULT ===');
    console.log('Title:', result.title);
    console.log('Author:', result.author);
    console.log('Confidence:', result.confidence);
    console.log('Detection method:', result.detectionMethod);

    return result;
  }

  /**
   * Check if text line is likely noise (ISBN, publisher info, etc.)
   * @param {string} line - Text line to check
   * @returns {boolean} - True if line is likely noise
   */
  isNoiseText(line) {
    const lowerLine = line.toLowerCase();
    
    // Common noise patterns
    const noisePatterns = [
      /^isbn/i,
      /^\d{10,13}$/,  // ISBN numbers
      /^[0-9\-\s]+$/,  // Only numbers and dashes
      /^www\./i,
      /^http/i,
      /copyright/i,
      /©/,
      /publisher/i,
      /edition/i,
      /^[a-z]$/i,  // Single letters
      /^\$[\d.]+$/,  // Prices
      /barcode/i
    ];

    return noisePatterns.some(pattern => pattern.test(line)) || line.length < 2;
  }

  /**
   * Find author name in text using common patterns
   * @param {Array<string>} lines - Cleaned text lines
   * @returns {Object} - Author detection result
   */
  findAuthorInText(lines) {
    console.log('=== SEARCHING FOR AUTHOR PATTERNS ===');
    
    // Common author indicators
    const authorPatterns = [
      /^by\s+(.+)$/i,
      /^written\s+by\s+(.+)$/i,
      /^author[:\s]+(.+)$/i,
      /^(.+)\s+author$/i
    ];

    // Look for explicit author patterns
    for (const line of lines) {
      for (const pattern of authorPatterns) {
        const match = line.match(pattern);
        if (match) {
          const author = this.cleanAuthorName(match[1]);
          if (this.isValidAuthorName(author)) {
            console.log(`Found author with pattern "${pattern}": "${author}"`);
            return { found: true, author: author };
          }
        }
      }
    }

    // Look for lines that look like author names (proper case, 2-4 words)
    for (const line of lines) {
      if (this.looksLikeAuthorName(line)) {
        const author = this.cleanAuthorName(line);
        console.log(`Found potential author by heuristic: "${author}"`);
        return { found: true, author: author };
      }
    }

    console.log('No author patterns found');
    return { found: false, author: '' };
  }

  /**
   * Find title in text (usually prominent text, not the author)
   * @param {Array<string>} lines - Cleaned text lines
   * @param {string} foundAuthor - Already found author to exclude
   * @returns {Object} - Title detection result
   */
  findTitleInText(lines, foundAuthor = '') {
    console.log('=== SEARCHING FOR TITLE ===');
    console.log('Excluding author:', foundAuthor);

    // Filter out author line and noise
    const titleCandidates = lines.filter(line => {
      if (foundAuthor && line.toLowerCase().includes(foundAuthor.toLowerCase())) {
        return false;
      }
      return !this.looksLikeAuthorName(line) && line.length > 3;
    });

    console.log('Title candidates:', titleCandidates);

    if (titleCandidates.length === 0) {
      return { found: false, title: '' };
    }

    // Prefer longer, more substantial text as title
    const bestCandidate = titleCandidates.reduce((best, current) => {
      // Prefer lines with more words and reasonable length
      const currentScore = this.scoreTitleCandidate(current);
      const bestScore = this.scoreTitleCandidate(best);
      return currentScore > bestScore ? current : best;
    });

    const title = this.cleanTitleText(bestCandidate);
    console.log(`Selected title: "${title}"`);
    
    return { found: true, title: title };
  }

  /**
   * Score a title candidate based on various factors
   * @param {string} text - Text to score
   * @returns {number} - Score (higher is better)
   */
  scoreTitleCandidate(text) {
    let score = 0;
    
    // Prefer moderate length (not too short, not too long)
    const wordCount = text.split(/\s+/).length;
    if (wordCount >= 2 && wordCount <= 8) {
      score += wordCount * 2;
    }
    
    // Prefer title case
    if (this.isTitleCase(text)) {
      score += 10;
    }
    
    // Prefer text without numbers (unless it's part of a series)
    if (!/\d/.test(text) || /\b(book|volume|part)\s*\d/i.test(text)) {
      score += 5;
    }
    
    return score;
  }

  /**
   * Fallback detection when patterns don't work
   * @param {Array<string>} lines - Cleaned text lines
   * @returns {Object} - Title and author from heuristics
   */
  fallbackTitleAuthorDetection(lines) {
    console.log('=== FALLBACK TITLE/AUTHOR DETECTION ===');
    
    if (lines.length === 0) {
      return { title: '', author: '' };
    }

    // Sort lines by likely importance (length, position, etc.)
    const sortedLines = [...lines].sort((a, b) => {
      const scoreA = this.scoreTitleCandidate(a);
      const scoreB = this.scoreTitleCandidate(b);
      return scoreB - scoreA;
    });

    console.log('Sorted lines by score:', sortedLines);

    let title = '';
    let author = '';

    // Try to assign title and author from top candidates
    for (let i = 0; i < Math.min(3, sortedLines.length); i++) {
      const line = sortedLines[i];
      
      if (!title && !this.looksLikeAuthorName(line)) {
        title = this.cleanTitleText(line);
        console.log(`Assigned title: "${title}"`);
      } else if (!author && this.looksLikeAuthorName(line)) {
        author = this.cleanAuthorName(line);
        console.log(`Assigned author: "${author}"`);
      }
      
      if (title && author) break;
    }

    // If still no author, try the remaining lines
    if (!author) {
      for (const line of sortedLines) {
        if (this.looksLikeAuthorName(line) && line !== title) {
          author = this.cleanAuthorName(line);
          console.log(`Found author in remaining lines: "${author}"`);
          break;
        }
      }
    }

    // If still no title, use the first substantial line
    if (!title && sortedLines.length > 0) {
      title = this.cleanTitleText(sortedLines[0]);
      console.log(`Using first line as title: "${title}"`);
    }

    return { title, author };
  }

  /**
   * Check if text looks like an author name
   * @param {string} text - Text to check
   * @returns {boolean} - True if looks like author name
   */
  looksLikeAuthorName(text) {
    // Author names are typically 2-4 words, proper case, no special characters
    const words = text.trim().split(/\s+/);
    
    if (words.length < 2 || words.length > 4) {
      return false;
    }
    
    // Check if words look like names (start with capital letter)
    const looksLikeNames = words.every(word => 
      /^[A-Z][a-z]+$/.test(word) || /^[A-Z]\.?$/.test(word)  // Allow initials
    );
    
    return looksLikeNames;
  }

  /**
   * Check if text is in title case
   * @param {string} text - Text to check
   * @returns {boolean} - True if in title case
   */
  isTitleCase(text) {
    const words = text.split(/\s+/);
    return words.every(word => 
      word.length === 0 || 
      /^[A-Z]/.test(word) || 
      ['a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by'].includes(word.toLowerCase())
    );
  }

  /**
   * Clean and validate author name
   * @param {string} name - Raw author name
   * @returns {string} - Cleaned author name
   */
  cleanAuthorName(name) {
    return name
      .trim()
      .replace(/^(by|written by|author:?)\s*/i, '')
      .replace(/\s+/g, ' ')
      .replace(/[^\w\s.-]/g, '')  // Keep letters, spaces, dots, hyphens
      .trim();
  }

  /**
   * Validate if author name looks reasonable
   * @param {string} name - Author name to validate
   * @returns {boolean} - True if valid
   */
  isValidAuthorName(name) {
    if (!name || name.length < 3 || name.length > 50) {
      return false;
    }
    
    // Should have at least 2 words
    const words = name.split(/\s+/);
    return words.length >= 2 && words.length <= 4;
  }

  /**
   * Clean title text
   * @param {string} title - Raw title text
   * @returns {string} - Cleaned title
   */
  cleanTitleText(title) {
    return title
      .trim()
      .replace(/[^\w\s:!?.-]/g, ' ')  // Keep basic punctuation
      .replace(/\s+/g, ' ')
      .trim();
  }
}

export default new TextractService();
