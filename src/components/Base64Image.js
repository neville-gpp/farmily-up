import { useState, useEffect, useRef } from 'react';
import { Image, ActivityIndicator, View } from 'react-native';
import ImageUtils from '../utils/imageUtils';

/**
 * Generate a unique instance ID for component isolation
 */
const generateInstanceId = () => {
  return `base64img_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
};

/**
 * Custom Image component that handles both base64 and regular URIs
 * Automatically decodes base64 images to temporary files for display
 * Each component instance is isolated to prevent photo mixing issues
 */
const Base64Image = ({ 
  source, 
  style, 
  instanceId = null,
  debugMode = false,
  onProcessingStateChange = null,
  ...props 
}) => {
  const [displayUri, setDisplayUri] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [processingState, setProcessingState] = useState('idle');
  
  // Use provided instanceId or generate a unique one
  const componentInstanceId = useRef(instanceId || generateInstanceId());
  const currentOperationId = useRef(null);
  const isMountedRef = useRef(true);

  // Helper function to update processing state and notify parent
  const updateProcessingState = (newState, errorMessage = null) => {
    setProcessingState(newState);
    if (onProcessingStateChange) {
      onProcessingStateChange({
        instanceId: componentInstanceId.current,
        state: newState,
        error: errorMessage,
        timestamp: Date.now()
      });
    }
  };

  useEffect(() => {
    // Mark component as mounted
    isMountedRef.current = true;
    
    const processImage = async () => {
      if (!source || !source.uri) {
        if (isMountedRef.current) {
          setDisplayUri(null);
          updateProcessingState('idle');
        }
        return;
      }

      const uri = source.uri;
      const operationId = `${componentInstanceId.current}_${Date.now()}`;
      currentOperationId.current = operationId;

      // If it's already a regular URI, use it directly
      if (!ImageUtils.isValidBase64Image(uri)) {
        if (isMountedRef.current && currentOperationId.current === operationId) {
          setDisplayUri(uri);
          updateProcessingState('complete');
        }
        return;
      }

      // If it's a base64 image, decode it
      try {
        if (isMountedRef.current && currentOperationId.current === operationId) {
          setLoading(true);
          setError(false);
          updateProcessingState('processing');
        }

        const decodedUri = await ImageUtils.decodeBase64ToUri(uri, componentInstanceId.current);
        
        // Check if this operation is still current and component is mounted
        if (isMountedRef.current && currentOperationId.current === operationId) {
          setDisplayUri(decodedUri);
          updateProcessingState('complete');
          
        } else {
          // Operation was cancelled or component unmounted, clean up the file
          if (decodedUri && decodedUri.startsWith('file://')) {
            ImageUtils.cleanupTempFile(decodedUri).catch(err => {
              console.warn(`[Base64Image:${componentInstanceId.current}] Error cleaning up cancelled operation file:`, err);
            });
          }
          
          if (debugMode) {
            console.log(`[Base64Image:${componentInstanceId.current}] Operation ${operationId} was cancelled`);
          }
        }
      } catch (err) {
        const errorMessage = `Error decoding base64 image: ${err.message}`;
        console.error(`[Base64Image:${componentInstanceId.current}] ${errorMessage}`);
        
        if (isMountedRef.current && currentOperationId.current === operationId) {
          setError(true);
          updateProcessingState('error', errorMessage);
          // Fallback to original URI
          setDisplayUri(uri);
        }
      } finally {
        if (isMountedRef.current && currentOperationId.current === operationId) {
          setLoading(false);
        }
      }
    };

    processImage();

    // Cleanup function to remove temporary files for this instance
    return () => {
      // Mark component as unmounted
      isMountedRef.current = false;
      
      // Cancel any ongoing operations
      currentOperationId.current = null;
      
      // Clean up all temporary files for this instance
      ImageUtils.cleanupInstanceFiles(componentInstanceId.current).catch(err => {
        console.warn(`[Base64Image:${componentInstanceId.current}] Error cleaning up instance files:`, err);
      });
    };
  }, [source?.uri, debugMode]);

  if (loading) {
    return (
      <View style={[style, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="small" color="#48b6b0" />
      </View>
    );
  }

  if (!displayUri) {
    return null;
  }

  return (
    <Image
      {...props}
      source={{ uri: displayUri }}
      style={style}
      onError={(errorEvent) => {
        const errorMessage = `Error loading image: ${displayUri}`;
        console.warn(`[Base64Image:${componentInstanceId.current}] ${errorMessage}`, errorEvent.nativeEvent);
        setError(true);
        updateProcessingState('error', errorMessage);
      }}
      onLoad={() => {
        if (debugMode) {
          //console.log(`[Base64Image:${componentInstanceId.current}] Image loaded successfully: ${displayUri}`);
        }
      }}
    />
  );
};

// Add display name for debugging
Base64Image.displayName = 'Base64Image';

export default Base64Image;