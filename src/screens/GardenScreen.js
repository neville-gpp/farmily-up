import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { WebView } from 'react-native-webview';
import ChildrenDataService from '../services/ChildrenDataService';
import Base64Image from '../components/Base64Image';
import Base64ImageErrorBoundary from '../components/Base64ImageErrorBoundary';

export default function GardenScreen() {
  const [selectedChild, setSelectedChild] = useState(0);
  const [children, setChildren] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showHelloDialog, setShowHelloDialog] = useState(false);
  const [isThankYouFlower, setIsThankYouFlower] = useState(false);
  
  const [isAdultFlower, setIsAdultFlower] = useState(false);
  const [growthIndex, setGrowthIndex] = useState(0);
  const [growthLevel, setGrowthLevel] = useState(1);

  // Feeling counters state - now stores data for all children
  const [allChildrenFeelings, setAllChildrenFeelings] = useState({});

  const updateGrowthIndex = () => {
    const currentFeelings = getCurrentChildFeelings();
    const index = (currentFeelings.exciting * 3) + (currentFeelings.happy * 2) - currentFeelings.sad;
    setGrowthIndex(index);
  };

  useEffect(() => {
    loadChildren();
  }, []);

  useEffect(() => {
    if (growthIndex > 20) {
      setGrowthLevel(2);
      setIsAdultFlower(true);
    } else {
      setGrowthLevel(1);
      setIsAdultFlower(false);
    }
  }, [growthIndex]);

  useEffect(() => {
    updateGrowthIndex(); // Recalculate when selectedChild or allChildrenFeelings changes
  }, [selectedChild, allChildrenFeelings]);

  // Reload children data when screen comes into focus
  useFocusEffect(
    React.useCallback(() => {
      loadChildren();
    }, [])
  );

  const loadChildren = async () => {
    try {
      setLoading(true);
      const storedChildren = await ChildrenDataService.getChildren();
      
      // Validate children data
      const validChildren = storedChildren.filter(child => child && child.id);
      if (validChildren.length !== storedChildren.length) {
        console.warn(`[GardenScreen] Found ${storedChildren.length - validChildren.length} invalid children records`);
      }
      
      setChildren(validChildren);

      // Reset selected child index if it's out of bounds
      if (validChildren.length === 0) {
        console.log('[GardenScreen] No children found, resetting selectedChild to 0');
        setSelectedChild(0);
      } else if (selectedChild >= validChildren.length) {
        const newIndex = Math.max(0, validChildren.length - 1);
        console.log(`[GardenScreen] selectedChild ${selectedChild} out of bounds, resetting to ${newIndex}`);
        setSelectedChild(newIndex);
      }

      // Load feeling data
      await loadFeelingData();
    } catch (error) {
      console.error('[GardenScreen] Error loading children:', {
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      });
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
        const parsedFeelings = JSON.parse(storedFeelings);
        setAllChildrenFeelings(parsedFeelings);
      } else {
        console.log('[GardenScreen] No feeling data found, starting with empty state');
      }      
    } catch (error) {
      console.error('[GardenScreen] Error loading feeling data:', {
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      });
      // Set empty feelings data on error to prevent crashes
      setAllChildrenFeelings({});
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

  const getChildDisplayName = (child) => {
    return child.nickname || child.firstName;
  };

  const handlePhotoDisplayError = (childId, childName, error) => {
    console.error(`[GardenScreen] Photo display failed for child ${childId} (${childName}):`, {
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
      childrenCount: children.length,
      selectedChildIndex: selectedChild
    });
  };

  const validateChildSelection = (newIndex) => {
    if (newIndex < 0 || newIndex >= children.length) {
      console.warn(`[GardenScreen] Invalid child selection index ${newIndex}, children count: ${children.length}`);
      return false;
    }
    return true;
  };

  const handleFeelingTap = async (feeling) => {
    // Save feeling data for the current child
    const currentChild = children[selectedChild];
    if (!currentChild) return;

    const childId = currentChild.id;
    const currentDateTime = new Date().toISOString();
    
    const currentFeelings = allChildrenFeelings[childId] || {
      exciting: 0,
      happy: 0,
      sad: 0,
      records: []
    };

    const newCount = currentFeelings[feeling] + 1;
    
    // Create a new feeling record with datetime
    const newRecord = {
      feeling: feeling,
      datetime: currentDateTime,
      timestamp: Date.now(),
      date: new Date().toLocaleDateString(),
      time: new Date().toLocaleTimeString()
    };

    const updatedChildFeelings = {
      ...currentFeelings,
      [feeling]: newCount,
      records: [...(currentFeelings.records || []), newRecord]
    };

    const updatedAllFeelings = {
      ...allChildrenFeelings,
      [childId]: updatedChildFeelings,
    };

    setAllChildrenFeelings(updatedAllFeelings);
    await saveFeelingData(updatedAllFeelings);

    // Change to thank you flower
    setIsThankYouFlower(true);

    // Change back to baby flower after 5 seconds
    setTimeout(() => {
      setIsThankYouFlower(false);
    }, 5000);

    updateGrowthIndex();
  };

  const getYellowBabySVG = () => {
	if (isThankYouFlower) {
		return `
			<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
			  <rect x="1" y="8" width="45" height="18" rx="2" ry="2" fill="#fff" stroke="#0288D1" stroke-width="1"/>
			  <text x="22" y="20" font-family="Arial, sans-serif" font-size="8" fill="#0288D1" text-anchor="middle">Thank you!</text>
			  <circle cx="50" cy="33" r="8" fill="#FFEB99" stroke="#FFE066" stroke-width="0.3">
			    <animateTransform
			      attributeName="transform"
			      attributeType="XML"
			      type="rotate"
			      values="-5 50 50; 3 50 50; -5 50 50"
			      dur="3s"
			      repeatCount="indefinite"/>
			  </circle>
			  <circle cx="65" cy="42" r="8" fill="#FFEB99" stroke="#FFE066" stroke-width="0.3">
			    <animateTransform
			      attributeName="transform"
			      attributeType="XML"
			      type="rotate"
			      values="-5 50 50; 3 50 50; -5 50 50"
			      dur="3s"
			      repeatCount="indefinite"/>
			  </circle>
			  <circle cx="65" cy="60" r="8" fill="#FFEB99" stroke="#FFE066" stroke-width="0.3">
			    <animateTransform
			      attributeName="transform"
			      attributeType="XML"
			      type="rotate"
			      values="-5 50 50; 3 50 50; -5 50 50"
			      dur="3s"
			      repeatCount="indefinite"/>
			  </circle>
			  <circle cx="35" cy="58" r="8" fill="#FFEB99" stroke="#FFE066" stroke-width="0.3">
			    <animateTransform
			      attributeName="transform"
			      attributeType="XML"
			      type="rotate"
			      values="-5 50 50; 3 50 50; -5 50 50"
			      dur="3s"
			      repeatCount="indefinite"/>
			  </circle>
			  <circle cx="35" cy="41" r="8" fill="#FFEB99" stroke="#FFE066" stroke-width="0.3">
			    <animateTransform
			      attributeName="transform"
			      attributeType="XML"
			      type="rotate"
			      values="-5 50 50; 3 50 50; -5 50 50"
			      dur="3s"
			      repeatCount="indefinite"/>
			  </circle>
			  <ellipse cx="42" cy="78" rx="6" ry="4" fill="#81C784" transform="rotate(-150 42 78)"/>
			  <ellipse cx="58" cy="78" rx="6" ry="4" fill="#81C784" transform="rotate(150 58 78)"/>
			  <rect x="47" y="68" width="6" height="25" fill="#66BB6A" rx="3"/>
			  <circle cx="50" cy="67" r="8" fill="#FFEB99" stroke="#FFE066" stroke-width="0.3">
			    <animateTransform
			      attributeName="transform"
			      attributeType="XML"
			      type="rotate"
			      values="-5 50 50; 3 50 50; -5 50 50"
			      dur="3s"
			      repeatCount="indefinite"/>
			  </circle>
			  <circle cx="50" cy="50" r="13" fill="#FFB366">
			    <animateTransform
			      attributeName="transform"
			      attributeType="XML"
			      type="rotate"
			      values="-5 50 50; 3 50 50; -5 50 50"
			      dur="3s"
			      repeatCount="indefinite"/>
			  </circle>
			  <ellipse cx="50" cy="54" rx="9" ry="7" fill="#FF9642" opacity="0.3">
			    <animateTransform
			      attributeName="transform"
			      attributeType="XML"
			      type="rotate"
			      values="-5 50 50; 3 50 50; -5 50 50"
			      dur="3s"
			      repeatCount="indefinite"/>
			  </ellipse>
			  <circle cx="45" cy="46" r="3" fill="#333">
			    <animateTransform
			      attributeName="transform"
			      attributeType="XML"
			      type="rotate"
			      values="-5 50 50; 3 50 50; -5 50 50"
			      dur="3s"
			      repeatCount="indefinite"/>
			  </circle>
			  <circle cx="55" cy="46" r="3" fill="#333">
			    <animateTransform
			      attributeName="transform"
			      attributeType="XML"
			      type="rotate"
			      values="-5 50 50; 3 50 50; -5 50 50"
			      dur="3s"
			      repeatCount="indefinite"/>
			  </circle>
			  <circle cx="46.2" cy="45" r="1.2" fill="#FFF">
			    <animateTransform
			      attributeName="transform"
			      attributeType="XML"
			      type="rotate"
			      values="-5 50 50; 3 50 50; -5 50 50"
			      dur="3s"
			      repeatCount="indefinite"/>
			  </circle>
			  <circle cx="56.2" cy="45" r="1.2" fill="#FFF">
			    <animateTransform
			      attributeName="transform"
			      attributeType="XML"
			      type="rotate"
			      values="-5 50 50; 3 50 50; -5 50 50"
			      dur="3s"
			      repeatCount="indefinite"/>
			  </circle>
			  <circle cx="47" cy="46.5" r="0.4" fill="#FFF">
			    <animateTransform
			      attributeName="transform"
			      attributeType="XML"
			      type="rotate"
			      values="-5 50 50; 3 50 50; -5 50 50"
			      dur="3s"
			      repeatCount="indefinite"/>
			  </circle>
			  <circle cx="57" cy="46.5" r="0.4" fill="#FFF">
			    <animateTransform
			      attributeName="transform"
			      attributeType="XML"
			      type="rotate"
			      values="-5 50 50; 3 50 50; -5 50 50"
			      dur="3s"
			      repeatCount="indefinite"/>
			  </circle>
			  <path d="M 43 55 Q 50 61 57 55" stroke="#333" stroke-width="1.5" fill="none" stroke-linecap="round"/>  
			  <circle cx="39" cy="52" r="2.5" fill="#FFB6C1" opacity="0.6">
			    <animateTransform
			      attributeName="transform"
			      attributeType="XML"
			      type="rotate"
			      values="-5 50 50; 3 50 50; -5 50 50"
			      dur="3s"
			      repeatCount="indefinite"/>
			  </circle>
			  <circle cx="61" cy="52" r="2.5" fill="#FFB6C1" opacity="0.6">
			    <animateTransform
			      attributeName="transform"
			      attributeType="XML"
			      type="rotate"
			      values="-5 50 50; 3 50 50; -5 50 50"
			      dur="3s"
			      repeatCount="indefinite"/>
			  </circle>
			</svg>`;
	} else {
		return `
			<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
			  <circle cx="50" cy="33" r="8" fill="#FFEB99" stroke="#FFE066" stroke-width="0.3">
			    <animateTransform
			      attributeName="transform"
			      attributeType="XML"
			      type="rotate"
			      values="-5 50 50; 3 50 50; -5 50 50"
			      dur="3s"
			      repeatCount="indefinite"/>
			  </circle>
			  <circle cx="65" cy="42" r="8" fill="#FFEB99" stroke="#FFE066" stroke-width="0.3">
			    <animateTransform
			      attributeName="transform"
			      attributeType="XML"
			      type="rotate"
			      values="-5 50 50; 3 50 50; -5 50 50"
			      dur="3s"
			      repeatCount="indefinite"/>
			  </circle>
			  <circle cx="65" cy="60" r="8" fill="#FFEB99" stroke="#FFE066" stroke-width="0.3">
			    <animateTransform
			      attributeName="transform"
			      attributeType="XML"
			      type="rotate"
			      values="-5 50 50; 3 50 50; -5 50 50"
			      dur="3s"
			      repeatCount="indefinite"/>
			  </circle>
			  <circle cx="35" cy="58" r="8" fill="#FFEB99" stroke="#FFE066" stroke-width="0.3">
			    <animateTransform
			      attributeName="transform"
			      attributeType="XML"
			      type="rotate"
			      values="-5 50 50; 3 50 50; -5 50 50"
			      dur="3s"
			      repeatCount="indefinite"/>
			  </circle>
			  <circle cx="35" cy="41" r="8" fill="#FFEB99" stroke="#FFE066" stroke-width="0.3">
			    <animateTransform
			      attributeName="transform"
			      attributeType="XML"
			      type="rotate"
			      values="-5 50 50; 3 50 50; -5 50 50"
			      dur="3s"
			      repeatCount="indefinite"/>
			  </circle>
			  <ellipse cx="42" cy="78" rx="6" ry="4" fill="#81C784" transform="rotate(-150 42 78)"/>
			  <ellipse cx="58" cy="78" rx="6" ry="4" fill="#81C784" transform="rotate(150 58 78)"/>
			  <rect x="47" y="68" width="6" height="25" fill="#66BB6A" rx="3"/>
			  <circle cx="50" cy="67" r="8" fill="#FFEB99" stroke="#FFE066" stroke-width="0.3">
			    <animateTransform
			      attributeName="transform"
			      attributeType="XML"
			      type="rotate"
			      values="-5 50 50; 3 50 50; -5 50 50"
			      dur="3s"
			      repeatCount="indefinite"/>
			  </circle>
			  <circle cx="50" cy="50" r="13" fill="#FFB366">
			    <animateTransform
			      attributeName="transform"
			      attributeType="XML"
			      type="rotate"
			      values="-5 50 50; 3 50 50; -5 50 50"
			      dur="3s"
			      repeatCount="indefinite"/>
			  </circle>
			  <ellipse cx="50" cy="54" rx="9" ry="7" fill="#FF9642" opacity="0.3">
			    <animateTransform
			      attributeName="transform"
			      attributeType="XML"
			      type="rotate"
			      values="-5 50 50; 3 50 50; -5 50 50"
			      dur="3s"
			      repeatCount="indefinite"/>
			  </ellipse>
			  <circle cx="45" cy="46" r="3" fill="#333">
			    <animateTransform
			      attributeName="transform"
			      attributeType="XML"
			      type="rotate"
			      values="-5 50 50; 3 50 50; -5 50 50"
			      dur="3s"
			      repeatCount="indefinite"/>
			  </circle>
			  <circle cx="55" cy="46" r="3" fill="#333">
			    <animateTransform
			      attributeName="transform"
			      attributeType="XML"
			      type="rotate"
			      values="-5 50 50; 3 50 50; -5 50 50"
			      dur="3s"
			      repeatCount="indefinite"/>
			  </circle>
			  <circle cx="46.2" cy="45" r="1.2" fill="#FFF">
			    <animateTransform
			      attributeName="transform"
			      attributeType="XML"
			      type="rotate"
			      values="-5 50 50; 3 50 50; -5 50 50"
			      dur="3s"
			      repeatCount="indefinite"/>
			  </circle>
			  <circle cx="56.2" cy="45" r="1.2" fill="#FFF">
			    <animateTransform
			      attributeName="transform"
			      attributeType="XML"
			      type="rotate"
			      values="-5 50 50; 3 50 50; -5 50 50"
			      dur="3s"
			      repeatCount="indefinite"/>
			  </circle>
			  <circle cx="47" cy="46.5" r="0.4" fill="#FFF">
			    <animateTransform
			      attributeName="transform"
			      attributeType="XML"
			      type="rotate"
			      values="-5 50 50; 3 50 50; -5 50 50"
			      dur="3s"
			      repeatCount="indefinite"/>
			  </circle>
			  <circle cx="57" cy="46.5" r="0.4" fill="#FFF">
			    <animateTransform
			      attributeName="transform"
			      attributeType="XML"
			      type="rotate"
			      values="-5 50 50; 3 50 50; -5 50 50"
			      dur="3s"
			      repeatCount="indefinite"/>
			  </circle>
			  <path d="M 43 55 Q 50 61 57 55" stroke="#333" stroke-width="1.5" fill="none" stroke-linecap="round"/>  
			  <circle cx="39" cy="52" r="2.5" fill="#FFB6C1" opacity="0.6">
			    <animateTransform
			      attributeName="transform"
			      attributeType="XML"
			      type="rotate"
			      values="-5 50 50; 3 50 50; -5 50 50"
			      dur="3s"
			      repeatCount="indefinite"/>
			  </circle>
			  <circle cx="61" cy="52" r="2.5" fill="#FFB6C1" opacity="0.6">
			    <animateTransform
			      attributeName="transform"
			      attributeType="XML"
			      type="rotate"
			      values="-5 50 50; 3 50 50; -5 50 50"
			      dur="3s"
			      repeatCount="indefinite"/>
			  </circle>
			</svg>`;
	}
  }

  const getYellowAdultSVG = () => {
    if (isThankYouFlower) {
      return `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
          <rect x="1" y="8" width="45" height="18" rx="2" ry="2" fill="#fff" stroke="#0288D1" stroke-width="1"/>
          <text x="22" y="20" font-family="Arial, sans-serif" font-size="8" fill="#0288D1" text-anchor="middle">Thank you!</text>
          <style>
            /* Petal wobble animation */
            .petal {
              animation: wobble 3s ease-in-out infinite;
              transform-origin: center;
            }
            @keyframes wobble {
              0%, 100% { transform: rotate(0deg); }
              25% { transform: rotate(5deg); }
              75% { transform: rotate(-5deg); }
            }
            /* Cheek blush size animation */
            .blush {
              animation: sizePulse 2s ease-in-out infinite;
              transform-origin: center center;
            }
            @keyframes sizePulse {
              0%, 100% { transform: scale(1); }
              50% { transform: scale(1.3); }
            }
          </style>
          <circle class="petal" cx="50" cy="32" r="10" fill="#FFE066" stroke="#FFD93D" stroke-width="0.5"/>
          <circle class="petal" cx="68" cy="39" r="10" fill="#FFE066" stroke="#FFD93D" stroke-width="0.5" style="animation-delay: 0.2s;"/>
          <circle class="petal" cx="68" cy="61" r="10" fill="#FFE066" stroke="#FFD93D" stroke-width="0.5" style="animation-delay: 0.4s;"/>
          <circle class="petal" cx="32" cy="61" r="10" fill="#FFE066" stroke="#FFD93D" stroke-width="0.5" style="animation-delay: 0.6s;"/>
          <circle class="petal" cx="32" cy="39" r="10" fill="#FFE066" stroke="#FFD93D" stroke-width="0.5" style="animation-delay: 0.8s;"/>
          <ellipse cx="41" cy="82" rx="10" ry="6" fill="#66BB6A" transform="rotate(-150 41 82)"/>
          <ellipse cx="59" cy="82" rx="9" ry="5" fill="#66BB6A" transform="rotate(150 59 82)"/>
          <rect x="48" y="70" width="4" height="31" fill="#4CAF50" rx="2"/>
          <circle class="petal" cx="50" cy="68" r="10" fill="#FFE066" stroke="#FFD93D" stroke-width="0.5" style="animation-delay: 1s;"/>
          <circle cx="50" cy="50" r="16" fill="#FFA366"/>
          <ellipse cx="50" cy="54" rx="13" ry="10" fill="#FF8C42" opacity="0.3"/>
          <g>
            <circle cx="44" cy="46" r="3" fill="#333"/>
            <circle cx="45" cy="45" r="1.2" fill="#FFF"/>
            <circle cx="46" cy="46.5" r="0.4" fill="#FFF"/>
          </g>
          <g>
            <circle cx="56" cy="46" r="3" fill="#333"/>
            <circle cx="57" cy="45" r="1.2" fill="#FFF"/>
            <circle cx="58" cy="46.5" r="0.4" fill="#FFF"/>
          </g>
          <path d="M 43 55 Q 50 61 57 55" stroke="#333" stroke-width="2.5" fill="none" stroke-linecap="round"/>
          <circle class="blush" cx="38" cy="51" r="3.5" fill="#FFB6C1" opacity="0.5"/>
          <circle class="blush" cx="62" cy="51" r="3.5" fill="#FFB6C1" opacity="0.5" style="animation-delay: 0.5s;"/>
        </svg>`;
    } else {
      return `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
          <style>
            /* Petal wobble animation */
            .petal {
              animation: wobble 3s ease-in-out infinite;
              transform-origin: center;
            }
            @keyframes wobble {
              0%, 100% { transform: rotate(0deg); }
              25% { transform: rotate(5deg); }
              75% { transform: rotate(-5deg); }
            }
            /* Cheek blush size animation */
            .blush {
              animation: sizePulse 2s ease-in-out infinite;
              transform-origin: center center;
            }
            @keyframes sizePulse {
              0%, 100% { transform: scale(1); }
              50% { transform: scale(1.3); }
            }
          </style>
          <circle class="petal" cx="50" cy="32" r="10" fill="#FFE066" stroke="#FFD93D" stroke-width="0.5"/>
          <circle class="petal" cx="68" cy="39" r="10" fill="#FFE066" stroke="#FFD93D" stroke-width="0.5" style="animation-delay: 0.2s;"/>
          <circle class="petal" cx="68" cy="61" r="10" fill="#FFE066" stroke="#FFD93D" stroke-width="0.5" style="animation-delay: 0.4s;"/>
          <circle class="petal" cx="32" cy="61" r="10" fill="#FFE066" stroke="#FFD93D" stroke-width="0.5" style="animation-delay: 0.6s;"/>
          <circle class="petal" cx="32" cy="39" r="10" fill="#FFE066" stroke="#FFD93D" stroke-width="0.5" style="animation-delay: 0.8s;"/>
          <ellipse cx="41" cy="82" rx="10" ry="6" fill="#66BB6A" transform="rotate(-150 41 82)"/>
          <ellipse cx="59" cy="82" rx="9" ry="5" fill="#66BB6A" transform="rotate(150 59 82)"/>
          <rect x="48" y="70" width="4" height="31" fill="#4CAF50" rx="2"/>
          <circle class="petal" cx="50" cy="68" r="10" fill="#FFE066" stroke="#FFD93D" stroke-width="0.5" style="animation-delay: 1s;"/>
          <circle cx="50" cy="50" r="16" fill="#FFA366"/>
          <ellipse cx="50" cy="54" rx="13" ry="10" fill="#FF8C42" opacity="0.3"/>
          <g>
            <circle cx="44" cy="46" r="3" fill="#333"/>
            <circle cx="45" cy="45" r="1.2" fill="#FFF"/>
            <circle cx="46" cy="46.5" r="0.4" fill="#FFF"/>
          </g>
          <g>
            <circle cx="56" cy="46" r="3" fill="#333"/>
            <circle cx="57" cy="45" r="1.2" fill="#FFF"/>
            <circle cx="58" cy="46.5" r="0.4" fill="#FFF"/>
          </g>
          <path d="M 43 55 Q 50 61 57 55" stroke="#333" stroke-width="2.5" fill="none" stroke-linecap="round"/>
          <circle class="blush" cx="38" cy="51" r="3.5" fill="#FFB6C1" opacity="0.5"/>
          <circle class="blush" cx="62" cy="51" r="3.5" fill="#FFB6C1" opacity="0.5" style="animation-delay: 0.5s;"/>
        </svg>`;
    }
  }

  const getPinkBabySVG = () => {
    if (isThankYouFlower) {
      return `
        <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
          <rect x="1" y="8" width="45" height="18" rx="2" ry="2" fill="#fff" stroke="#0288D1" stroke-width="1"/>
          <text x="22" y="20" font-family="Arial, sans-serif" font-size="8" fill="#0288D1" text-anchor="middle">Thank you!</text>
          <circle cx="50" cy="33" r="8" fill="#dd66dd" stroke="#FFE066" stroke-width="0.3">
            <animateTransform
              attributeName="transform"
              attributeType="XML"
              type="rotate"
              values="-5 50 50; 3 50 50; -5 50 50"
              dur="3s"
              repeatCount="indefinite"/>
          </circle>
          <circle cx="65" cy="42" r="8" fill="#dd66dd" stroke="#FFE066" stroke-width="0.3">
            <animateTransform
              attributeName="transform"
              attributeType="XML"
              type="rotate"
              values="-5 50 50; 3 50 50; -5 50 50"
              dur="3s"
              repeatCount="indefinite"/>
          </circle>
          <circle cx="65" cy="60" r="8" fill="#dd66dd" stroke="#FFE066" stroke-width="0.3">
            <animateTransform
              attributeName="transform"
              attributeType="XML"
              type="rotate"
              values="-5 50 50; 3 50 50; -5 50 50"
              dur="3s"
              repeatCount="indefinite"/>
          </circle>
          <circle cx="35" cy="58" r="8" fill="#dd66dd" stroke="#FFE066" stroke-width="0.3">
            <animateTransform
              attributeName="transform"
              attributeType="XML"
              type="rotate"
              values="-5 50 50; 3 50 50; -5 50 50"
              dur="3s"
              repeatCount="indefinite"/>
          </circle>
          <circle cx="35" cy="41" r="8" fill="#dd66dd" stroke="#FFE066" stroke-width="0.3">
            <animateTransform
              attributeName="transform"
              attributeType="XML"
              type="rotate"
              values="-5 50 50; 3 50 50; -5 50 50"
              dur="3s"
              repeatCount="indefinite"/>
          </circle>
          <ellipse cx="42" cy="78" rx="6" ry="4" fill="#81C784" transform="rotate(-150 42 78)"/>
          <ellipse cx="58" cy="78" rx="6" ry="4" fill="#81C784" transform="rotate(150 58 78)"/>
          <rect x="47" y="68" width="6" height="25" fill="#66BB6A" rx="3"/>
          <circle cx="50" cy="67" r="8" fill="#dd66dd" stroke="#FFE066" stroke-width="0.3">
            <animateTransform
              attributeName="transform"
              attributeType="XML"
              type="rotate"
              values="-5 50 50; 3 50 50; -5 50 50"
              dur="3s"
              repeatCount="indefinite"/>
          </circle>
          <circle cx="50" cy="50" r="13" fill="#FFB366">
            <animateTransform
              attributeName="transform"
              attributeType="XML"
              type="rotate"
              values="-5 50 50; 3 50 50; -5 50 50"
              dur="3s"
              repeatCount="indefinite"/>
          </circle>
          <ellipse cx="50" cy="54" rx="9" ry="7" fill="#FF9642" opacity="0.3">
            <animateTransform
              attributeName="transform"
              attributeType="XML"
              type="rotate"
              values="-5 50 50; 3 50 50; -5 50 50"
              dur="3s"
              repeatCount="indefinite"/>
          </ellipse>
          <circle cx="45" cy="46" r="3" fill="#333">
            <animateTransform
              attributeName="transform"
              attributeType="XML"
              type="rotate"
              values="-5 50 50; 3 50 50; -5 50 50"
              dur="3s"
              repeatCount="indefinite"/>
          </circle>
          <circle cx="55" cy="46" r="3" fill="#333">
            <animateTransform
              attributeName="transform"
              attributeType="XML"
              type="rotate"
              values="-5 50 50; 3 50 50; -5 50 50"
              dur="3s"
              repeatCount="indefinite"/>
          </circle>
          <circle cx="46.2" cy="45" r="1.2" fill="#FFF">
            <animateTransform
              attributeName="transform"
              attributeType="XML"
              type="rotate"
              values="-5 50 50; 3 50 50; -5 50 50"
              dur="3s"
              repeatCount="indefinite"/>
          </circle>
          <circle cx="56.2" cy="45" r="1.2" fill="#FFF">
            <animateTransform
              attributeName="transform"
              attributeType="XML"
              type="rotate"
              values="-5 50 50; 3 50 50; -5 50 50"
              dur="3s"
              repeatCount="indefinite"/>
          </circle>
          <circle cx="47" cy="46.5" r="0.4" fill="#FFF">
            <animateTransform
              attributeName="transform"
              attributeType="XML"
              type="rotate"
              values="-5 50 50; 3 50 50; -5 50 50"
              dur="3s"
              repeatCount="indefinite"/>
          </circle>
          <circle cx="57" cy="46.5" r="0.4" fill="#FFF">
            <animateTransform
              attributeName="transform"
              attributeType="XML"
              type="rotate"
              values="-5 50 50; 3 50 50; -5 50 50"
              dur="3s"
              repeatCount="indefinite"/>
          </circle>
          <path d="M 43 55 Q 50 61 57 55" stroke="#333" stroke-width="1.5" fill="none" stroke-linecap="round"/>  
          <circle cx="39" cy="52" r="2.5" fill="#FFB6C1" opacity="0.6">
            <animateTransform
              attributeName="transform"
              attributeType="XML"
              type="rotate"
              values="-5 50 50; 3 50 50; -5 50 50"
              dur="3s"
              repeatCount="indefinite"/>
          </circle>
          <circle cx="61" cy="52" r="2.5" fill="#FFB6C1" opacity="0.6">
            <animateTransform
              attributeName="transform"
              attributeType="XML"
              type="rotate"
              values="-5 50 50; 3 50 50; -5 50 50"
              dur="3s"
              repeatCount="indefinite"/>
          </circle>
        </svg>`;
    } else {
      return `
        <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
          <circle cx="50" cy="33" r="8" fill="#dd66dd" stroke="#FFE066" stroke-width="0.3">
            <animateTransform
              attributeName="transform"
              attributeType="XML"
              type="rotate"
              values="-5 50 50; 3 50 50; -5 50 50"
              dur="3s"
              repeatCount="indefinite"/>
          </circle>
          <circle cx="65" cy="42" r="8" fill="#dd66dd" stroke="#FFE066" stroke-width="0.3">
            <animateTransform
              attributeName="transform"
              attributeType="XML"
              type="rotate"
              values="-5 50 50; 3 50 50; -5 50 50"
              dur="3s"
              repeatCount="indefinite"/>
          </circle>
          <circle cx="65" cy="60" r="8" fill="#dd66dd" stroke="#FFE066" stroke-width="0.3">
            <animateTransform
              attributeName="transform"
              attributeType="XML"
              type="rotate"
              values="-5 50 50; 3 50 50; -5 50 50"
              dur="3s"
              repeatCount="indefinite"/>
          </circle>
          <circle cx="35" cy="58" r="8" fill="#dd66dd" stroke="#FFE066" stroke-width="0.3">
            <animateTransform
              attributeName="transform"
              attributeType="XML"
              type="rotate"
              values="-5 50 50; 3 50 50; -5 50 50"
              dur="3s"
              repeatCount="indefinite"/>
          </circle>
          <circle cx="35" cy="41" r="8" fill="#dd66dd" stroke="#FFE066" stroke-width="0.3">
            <animateTransform
              attributeName="transform"
              attributeType="XML"
              type="rotate"
              values="-5 50 50; 3 50 50; -5 50 50"
              dur="3s"
              repeatCount="indefinite"/>
          </circle>
          <ellipse cx="42" cy="78" rx="6" ry="4" fill="#81C784" transform="rotate(-150 42 78)"/>
          <ellipse cx="58" cy="78" rx="6" ry="4" fill="#81C784" transform="rotate(150 58 78)"/>
          <rect x="47" y="68" width="6" height="25" fill="#66BB6A" rx="3"/>
          <circle cx="50" cy="67" r="8" fill="#dd66dd" stroke="#FFE066" stroke-width="0.3">
            <animateTransform
              attributeName="transform"
              attributeType="XML"
              type="rotate"
              values="-5 50 50; 3 50 50; -5 50 50"
              dur="3s"
              repeatCount="indefinite"/>
          </circle>
          <circle cx="50" cy="50" r="13" fill="#FFB366">
            <animateTransform
              attributeName="transform"
              attributeType="XML"
              type="rotate"
              values="-5 50 50; 3 50 50; -5 50 50"
              dur="3s"
              repeatCount="indefinite"/>
          </circle>
          <ellipse cx="50" cy="54" rx="9" ry="7" fill="#FF9642" opacity="0.3">
            <animateTransform
              attributeName="transform"
              attributeType="XML"
              type="rotate"
              values="-5 50 50; 3 50 50; -5 50 50"
              dur="3s"
              repeatCount="indefinite"/>
          </ellipse>
          <circle cx="45" cy="46" r="3" fill="#333">
            <animateTransform
              attributeName="transform"
              attributeType="XML"
              type="rotate"
              values="-5 50 50; 3 50 50; -5 50 50"
              dur="3s"
              repeatCount="indefinite"/>
          </circle>
          <circle cx="55" cy="46" r="3" fill="#333">
            <animateTransform
              attributeName="transform"
              attributeType="XML"
              type="rotate"
              values="-5 50 50; 3 50 50; -5 50 50"
              dur="3s"
              repeatCount="indefinite"/>
          </circle>
          <circle cx="46.2" cy="45" r="1.2" fill="#FFF">
            <animateTransform
              attributeName="transform"
              attributeType="XML"
              type="rotate"
              values="-5 50 50; 3 50 50; -5 50 50"
              dur="3s"
              repeatCount="indefinite"/>
          </circle>
          <circle cx="56.2" cy="45" r="1.2" fill="#FFF">
            <animateTransform
              attributeName="transform"
              attributeType="XML"
              type="rotate"
              values="-5 50 50; 3 50 50; -5 50 50"
              dur="3s"
              repeatCount="indefinite"/>
          </circle>
          <circle cx="47" cy="46.5" r="0.4" fill="#FFF">
            <animateTransform
              attributeName="transform"
              attributeType="XML"
              type="rotate"
              values="-5 50 50; 3 50 50; -5 50 50"
              dur="3s"
              repeatCount="indefinite"/>
          </circle>
          <circle cx="57" cy="46.5" r="0.4" fill="#FFF">
            <animateTransform
              attributeName="transform"
              attributeType="XML"
              type="rotate"
              values="-5 50 50; 3 50 50; -5 50 50"
              dur="3s"
              repeatCount="indefinite"/>
          </circle>
          
          <!-- Pacifier -->
          <!-- Pacifier shield (outer ring) -->
          <!--
          <ellipse cx="50" cy="56" rx="6" ry="4" fill="#87CEEB" stroke="#5F9EA0" stroke-width="0.8" opacity="0.9">
            <animateTransform
              attributeName="transform"
              attributeType="XML"
              type="rotate"
              values="-5 50 50; 3 50 50; -5 50 50"
              dur="3s"
              repeatCount="indefinite"/>
          </ellipse>
          -->
          <!-- Tiny baby smile -->
          <path d="M 43 55 Q 50 61 57 55" stroke="#333" stroke-width="1.5" fill="none" stroke-linecap="round"/>  

          <!-- Small blush (still visible around pacifier) -->
          <circle cx="39" cy="52" r="2.5" fill="#FFB6C1" opacity="0.6">
            <animateTransform
              attributeName="transform"
              attributeType="XML"
              type="rotate"
              values="-5 50 50; 3 50 50; -5 50 50"
              dur="3s"
              repeatCount="indefinite"/>
          </circle>
          <circle cx="61" cy="52" r="2.5" fill="#FFB6C1" opacity="0.6">
            <animateTransform
              attributeName="transform"
              attributeType="XML"
              type="rotate"
              values="-5 50 50; 3 50 50; -5 50 50"
              dur="3s"
              repeatCount="indefinite"/>
          </circle>
        </svg>`;
    }
  }

  const getPinkAdultSVG = () => {
    if (isThankYouFlower) {
      return `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
          <rect x="1" y="8" width="45" height="18" rx="2" ry="2" fill="#fff" stroke="#0288D1" stroke-width="1"/>
          <text x="22" y="20" font-family="Arial, sans-serif" font-size="8" fill="#0288D1" text-anchor="middle">Thank you!</text>
          <style>
            /* Petal wobble animation */
            .petal {
              animation: wobble 3s ease-in-out infinite;
              transform-origin: center;
            }
            @keyframes wobble {
              0%, 100% { transform: rotate(0deg); }
              25% { transform: rotate(5deg); }
              75% { transform: rotate(-5deg); }
            }
            /* Cheek blush size animation */
            .blush {
              animation: sizePulse 2s ease-in-out infinite;
              transform-origin: center center;
            }
            @keyframes sizePulse {
              0%, 100% { transform: scale(1); }
              50% { transform: scale(1.3); }
            }
          </style>
          <circle class="petal" cx="50" cy="32" r="10" fill="#dd66dd" stroke="#FFD93D" stroke-width="0.5"/>
          <circle class="petal" cx="68" cy="39" r="10" fill="#dd66dd" stroke="#FFD93D" stroke-width="0.5" style="animation-delay: 0.2s;"/>
          <circle class="petal" cx="68" cy="61" r="10" fill="#dd66dd" stroke="#FFD93D" stroke-width="0.5" style="animation-delay: 0.4s;"/>
          <circle class="petal" cx="32" cy="61" r="10" fill="#dd66dd" stroke="#FFD93D" stroke-width="0.5" style="animation-delay: 0.6s;"/>
          <circle class="petal" cx="32" cy="39" r="10" fill="#dd66dd" stroke="#FFD93D" stroke-width="0.5" style="animation-delay: 0.8s;"/>
          <ellipse cx="41" cy="82" rx="10" ry="6" fill="#66BB6A" transform="rotate(-150 41 82)"/>
          <ellipse cx="59" cy="82" rx="9" ry="5" fill="#66BB6A" transform="rotate(150 59 82)"/>
          <rect x="48" y="70" width="4" height="31" fill="#4CAF50" rx="2"/>
          <circle class="petal" cx="50" cy="68" r="10" fill="#dd66dd" stroke="#FFD93D" stroke-width="0.5" style="animation-delay: 1s;"/>
          <circle cx="50" cy="50" r="16" fill="#FFA366"/>
          <ellipse cx="50" cy="54" rx="13" ry="10" fill="#FF8C42" opacity="0.3"/>
          <g>
            <circle cx="44" cy="46" r="3" fill="#333"/>
            <circle cx="45" cy="45" r="1.2" fill="#FFF"/>
            <circle cx="46" cy="46.5" r="0.4" fill="#FFF"/>
          </g>
          <g>
            <circle cx="56" cy="46" r="3" fill="#333"/>
            <circle cx="57" cy="45" r="1.2" fill="#FFF"/>
            <circle cx="58" cy="46.5" r="0.4" fill="#FFF"/>
          </g>
          <path d="M 43 55 Q 50 61 57 55" stroke="#333" stroke-width="2.5" fill="none" stroke-linecap="round"/>
          <circle class="blush" cx="38" cy="51" r="3.5" fill="#FFB6C1" opacity="0.5"/>
          <circle class="blush" cx="62" cy="51" r="3.5" fill="#FFB6C1" opacity="0.5" style="animation-delay: 0.5s;"/>
        </svg>`;
    } else {
      return `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
          <style>
            /* Petal wobble animation */
            .petal {
              animation: wobble 3s ease-in-out infinite;
              transform-origin: center;
            }
            @keyframes wobble {
              0%, 100% { transform: rotate(0deg); }
              25% { transform: rotate(5deg); }
              75% { transform: rotate(-5deg); }
            }
            /* Cheek blush size animation */
            .blush {
              animation: sizePulse 2s ease-in-out infinite;
              transform-origin: center center;
            }
            @keyframes sizePulse {
              0%, 100% { transform: scale(1); }
              50% { transform: scale(1.3); }
            }
          </style>
          <circle class="petal" cx="50" cy="32" r="10" fill="#dd66dd" stroke="#FFD93D" stroke-width="0.5"/>
          <circle class="petal" cx="68" cy="39" r="10" fill="#dd66dd" stroke="#FFD93D" stroke-width="0.5" style="animation-delay: 0.2s;"/>
          <circle class="petal" cx="68" cy="61" r="10" fill="#dd66dd" stroke="#FFD93D" stroke-width="0.5" style="animation-delay: 0.4s;"/>
          <circle class="petal" cx="32" cy="61" r="10" fill="#dd66dd" stroke="#FFD93D" stroke-width="0.5" style="animation-delay: 0.6s;"/>
          <circle class="petal" cx="32" cy="39" r="10" fill="#dd66dd" stroke="#FFD93D" stroke-width="0.5" style="animation-delay: 0.8s;"/>
          <ellipse cx="41" cy="82" rx="10" ry="6" fill="#66BB6A" transform="rotate(-150 41 82)"/>
          <ellipse cx="59" cy="82" rx="9" ry="5" fill="#66BB6A" transform="rotate(150 59 82)"/>
          <rect x="48" y="70" width="4" height="31" fill="#4CAF50" rx="2"/>
          <circle class="petal" cx="50" cy="68" r="10" fill="#dd66dd" stroke="#FFD93D" stroke-width="0.5" style="animation-delay: 1s;"/>
          <circle cx="50" cy="50" r="16" fill="#FFA366"/>
          <ellipse cx="50" cy="54" rx="13" ry="10" fill="#FF8C42" opacity="0.3"/>
          <g>
            <circle cx="44" cy="46" r="3" fill="#333"/>
            <circle cx="45" cy="45" r="1.2" fill="#FFF"/>
            <circle cx="46" cy="46.5" r="0.4" fill="#FFF"/>
          </g>
          <g>
            <circle cx="56" cy="46" r="3" fill="#333"/>
            <circle cx="57" cy="45" r="1.2" fill="#FFF"/>
            <circle cx="58" cy="46.5" r="0.4" fill="#FFF"/>
          </g>
          <path d="M 43 55 Q 50 61 57 55" stroke="#333" stroke-width="2.5" fill="none" stroke-linecap="round"/>
          <circle class="blush" cx="38" cy="51" r="3.5" fill="#FFB6C1" opacity="0.5"/>
          <circle class="blush" cx="62" cy="51" r="3.5" fill="#FFB6C1" opacity="0.5" style="animation-delay: 0.5s;"/>
        </svg>`;
    }
  }

  const updateFeelingCount = async (feeling, increment = true) => {
    const currentChild = children[selectedChild];
    if (!currentChild) return;

    const childId = currentChild.id;
    const currentFeelings = allChildrenFeelings[childId] || {
      exciting: 0,
      happy: 0,
      sad: 0,
      records: []
    };

    const newCount = Math.max(
      0,
      currentFeelings[feeling] + (increment ? 1 : -1)
    );
    const updatedChildFeelings = {
      ...currentFeelings,
      [feeling]: newCount,
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
    if (!currentChild) return { exciting: 0, happy: 0, sad: 0, records: [] };
    return (
      allChildrenFeelings[currentChild.id] || {
        exciting: 0,
        happy: 0,
        sad: 0,
        records: []
      }
    );
  };

  // Statistical helper functions for reporting
  const getChildFeelingStatistics = (childId) => {
    const childFeelings = allChildrenFeelings[childId];
    if (!childFeelings || !childFeelings.records) return null;

    const records = childFeelings.records;
    const today = new Date().toLocaleDateString();
    const thisWeek = getWeekStart(new Date());
    const thisMonth = new Date().getMonth();
    const thisYear = new Date().getFullYear();

    return {
      total: {
        exciting: childFeelings.exciting || 0,
        happy: childFeelings.happy || 0,
        sad: childFeelings.sad || 0,
        all: records.length
      },
      today: getRecordsByDate(records, today),
      thisWeek: getRecordsByWeek(records, thisWeek),
      thisMonth: getRecordsByMonth(records, thisMonth, thisYear),
      thisYear: getRecordsByYear(records, thisYear),
      records: records
    };
  };

  const getRecordsByDate = (records, date) => {
    const dayRecords = records.filter(record => record.date === date);
    return {
      exciting: dayRecords.filter(r => r.feeling === 'exciting').length,
      happy: dayRecords.filter(r => r.feeling === 'happy').length,
      sad: dayRecords.filter(r => r.feeling === 'sad').length,
      all: dayRecords.length,
      records: dayRecords
    };
  };

  const getRecordsByWeek = (records, weekStart) => {
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    
    const weekRecords = records.filter(record => {
      const recordDate = new Date(record.datetime);
      return recordDate >= weekStart && recordDate <= weekEnd;
    });
    
    return {
      exciting: weekRecords.filter(r => r.feeling === 'exciting').length,
      happy: weekRecords.filter(r => r.feeling === 'happy').length,
      sad: weekRecords.filter(r => r.feeling === 'sad').length,
      all: weekRecords.length,
      records: weekRecords
    };
  };

  const getRecordsByMonth = (records, month, year) => {
    const monthRecords = records.filter(record => {
      const recordDate = new Date(record.datetime);
      return recordDate.getMonth() === month && recordDate.getFullYear() === year;
    });
    
    return {
      exciting: monthRecords.filter(r => r.feeling === 'exciting').length,
      happy: monthRecords.filter(r => r.feeling === 'happy').length,
      sad: monthRecords.filter(r => r.feeling === 'sad').length,
      all: monthRecords.length,
      records: monthRecords
    };
  };

  const getRecordsByYear = (records, year) => {
    const yearRecords = records.filter(record => {
      const recordDate = new Date(record.datetime);
      return recordDate.getFullYear() === year;
    });
    
    return {
      exciting: yearRecords.filter(r => r.feeling === 'exciting').length,
      happy: yearRecords.filter(r => r.feeling === 'happy').length,
      sad: yearRecords.filter(r => r.feeling === 'sad').length,
      all: yearRecords.length,
      records: yearRecords
    };
  };

  const getWeekStart = (date) => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day;
    return new Date(d.setDate(diff));
  };

  // Ensure we have a valid current child
  const currentChild = children[selectedChild];

  // Debug information for development
  const debugInfo = __DEV__ ? {
    childrenCount: children.length,
    selectedChildIndex: selectedChild,
    currentChildId: currentChild?.id,
    currentChildName: currentChild ? getChildDisplayName(currentChild) : 'None',
    hasPhoto: !!currentChild?.photo,
    photoLength: currentChild?.photo?.length || 0
  } : null;

  // If currentChild is undefined, show loading or empty state
  if (!currentChild && children.length > 0) {
    console.warn('[GardenScreen] currentChild is undefined but children exist:', {
      childrenCount: children.length,
      selectedChild,
      childrenIds: children.map(c => c.id)
    });
    return (
      <View style={[styles.container, styles.centerContent]}>
        <Text style={styles.loadingText}>Loading garden...</Text>
        {__DEV__ && (
          <Text style={styles.debugText}>
            Debug: selectedChild={selectedChild}, children={children.length}
          </Text>
        )}
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <ActivityIndicator size="large" color="#48b6b0" />
        <Text style={styles.loadingText}>Loading magical gardens...</Text>
      </View>
    );
  }

  if (children.length === 0) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <Ionicons name='flower-outline' size={64} color='#ccc' />
        <Text style={styles.emptyStateTitle}>No Magical Gardens Available</Text>
        <Text style={styles.emptyStateText}>
          Add children profiles in the Settings tab to create their magical
          gardens
        </Text>
      </View>
    );
  }

  // Additional safety check for currentChild
  if (!currentChild) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <Text style={styles.loadingText}>Loading garden...</Text>
      </View>
    );
  }
  
  return (
    <ScrollView style={styles.container}>
      {/* Child Selector */}
      <View style={styles.childSelector}>
        {children.map((child, index) => {
          const isSelected = selectedChild === index;
          const childId = child.id;
          
          return (
            <TouchableOpacity
              key={`child-${childId}`}
              style={[
                styles.childTab,
                isSelected && [
                  styles.selectedChildTab,
                  { borderBottomColor: child.favourColor },
                ],
              ]}
              onPress={() => {
                if (validateChildSelection(index)) {
                  console.log(`[GardenScreen] Child selector: Selected child ${childId} (${getChildDisplayName(child)}) at index ${index}`);
                  setSelectedChild(index);
                  updateGrowthIndex();
                } else {
                  console.error(`[GardenScreen] Failed to select child at invalid index ${index}`);
                }
              }}
            >
              {child.photo ? (
                <Base64ImageErrorBoundary
                  childId={childId}
                  childName={getChildDisplayName(child)}
                  childGender={child.gender}
                  style={styles.childTabPhoto}
                  showDebugInfo={__DEV__}
                  debugInfo={{
                    childIndex: index,
                    childId: childId,
                    photoLength: child.photo?.length || 0,
                    isSelected: isSelected
                  }}
                  onError={(error, errorInfo) => {
                    handlePhotoDisplayError(childId, getChildDisplayName(child), error);
                  }}
                >
                  <Base64Image
                    source={{ uri: child.photo }}
                    style={styles.childTabPhoto}
                    instanceId={`garden-child-${childId}`}
                    debugMode={__DEV__}
                  />
                </Base64ImageErrorBoundary>
              ) : (
                <Text style={styles.childAvatar}>
                  {getGenderEmoji(child.gender)}
                </Text>
              )}
              <Text
                style={[
                  styles.childTabName,
                  isSelected && [
                    styles.selectedChildTabName,
                    { color: child.favourColor },
                  ],
                ]}
              >
                {getChildDisplayName(child)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Magical Garden */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>          
          {getChildDisplayName(currentChild)}'s Magical Garden                              Lv: {growthLevel}
        </Text>
        <View style={styles.flowerContainer}>
          <View style={styles.flowerAnimationContainer}>
            <WebView
              source={{
                html: `
                  <!DOCTYPE html>
                  <html>
                    <head>
                      <meta name="viewport" content="width=device-width, initial-scale=1.0">
                      <style>
                        body { 
                          margin: 0; 
                          padding: 0; 
                          display: flex; 
                          justify-content: center; 
                          align-items: center; 
                          height: 100vh; 
                          background: linear-gradient(135deg, #e8f5e8 0%, #f0f8ff 100%);
                        }
                        svg { 
                          width: 550px; 
                          height: 550px; 
                        }
                      </style>
                    </head>
                    <body>
                      ${currentChild.gender === 'girl'
                        ? 
                          (isAdultFlower) ? getPinkAdultSVG() : getPinkBabySVG() 
                        : 
                          (isAdultFlower) ? getYellowAdultSVG() : getYellowBabySVG()
                      }
                      <!-- Tiny petals -->
                      <circle cx="50" cy="30" r="8" fill="#FFEB99" stroke="#FFE066" stroke-width="0.3">
                        <animateTransform
                          attributeName="transform"
                          attributeType="XML"
                          type="rotate"
                          values="-5 50 50; 3 50 50; -5 50 50"
                          dur="3s"
                          repeatCount="indefinite"/>
                      </circle>
                      <circle cx="65" cy="38" r="8" fill="#FFEB99" stroke="#FFE066" stroke-width="0.3">
                        <animateTransform
                          attributeName="transform"
                          attributeType="XML"
                          type="rotate"
                          values="-5 50 50; 3 50 50; -5 50 50"
                          dur="3s"
                          repeatCount="indefinite"/>
                      </circle>
                      <circle cx="65" cy="62" r="8" fill="#FFEB99" stroke="#FFE066" stroke-width="0.3">
                        <animateTransform
                          attributeName="transform"
                          attributeType="XML"
                          type="rotate"
                          values="-5 50 50; 3 50 50; -5 50 50"
                          dur="3s"
                          repeatCount="indefinite"/>
                      </circle>
                      <circle cx="35" cy="62" r="8" fill="#FFEB99" stroke="#FFE066" stroke-width="0.3">
                        <animateTransform
                          attributeName="transform"
                          attributeType="XML"
                          type="rotate"
                          values="-5 50 50; 3 50 50; -5 50 50"
                          dur="3s"
                          repeatCount="indefinite"/>
                      </circle>
                      <circle cx="35" cy="38" r="8" fill="#FFEB99" stroke="#FFE066" stroke-width="0.3">
                        <animateTransform
                          attributeName="transform"
                          attributeType="XML"
                          type="rotate"
                          values="-5 50 50; 3 50 50; -5 50 50"
                          dur="3s"
                          repeatCount="indefinite"/>
                      </circle>
                      
                      <!-- Small leaves (stay still) -->
                      <ellipse cx="42" cy="78" rx="6" ry="4" fill="#81C784" transform="rotate(-150 42 78)"/>
                      <ellipse cx="58" cy="78" rx="6" ry="4" fill="#81C784" transform="rotate(150 58 78)"/>
                      
                      <!-- Thin stem (stays still) -->
                      <rect x="47" y="68" width="6" height="25" fill="#66BB6A" rx="3"/>
                      
                      <!-- Bottom petal -->
                      <circle cx="50" cy="70" r="8" fill="#FFEB99" stroke="#FFE066" stroke-width="0.3">
                        <animateTransform
                          attributeName="transform"
                          attributeType="XML"
                          type="rotate"
                          values="-5 50 50; 3 50 50; -5 50 50"
                          dur="3s"
                          repeatCount="indefinite"/>
                      </circle>
                      
                      <!-- Small center face -->
                      <circle cx="50" cy="50" r="13" fill="#FFB366">
                        <animateTransform
                          attributeName="transform"
                          attributeType="XML"
                          type="rotate"
                          values="-5 50 50; 3 50 50; -5 50 50"
                          dur="3s"
                          repeatCount="indefinite"/>
                      </circle>
                      <ellipse cx="50" cy="54" rx="9" ry="7" fill="#FF9642" opacity="0.3">
                        <animateTransform
                          attributeName="transform"
                          attributeType="XML"
                          type="rotate"
                          values="-5 50 50; 3 50 50; -5 50 50"
                          dur="3s"
                          repeatCount="indefinite"/>
                      </ellipse>
                      
                      <!-- Baby eyes (big and innocent) -->
                      <circle cx="45" cy="46" r="3" fill="#333">
                        <animateTransform
                          attributeName="transform"
                          attributeType="XML"
                          type="rotate"
                          values="-5 50 50; 3 50 50; -5 50 50"
                          dur="3s"
                          repeatCount="indefinite"/>
                      </circle>
                      <circle cx="55" cy="46" r="3" fill="#333">
                        <animateTransform
                          attributeName="transform"
                          attributeType="XML"
                          type="rotate"
                          values="-5 50 50; 3 50 50; -5 50 50"
                          dur="3s"
                          repeatCount="indefinite"/>
                      </circle>
                      <circle cx="46.2" cy="45" r="1.2" fill="#FFF">
                        <animateTransform
                          attributeName="transform"
                          attributeType="XML"
                          type="rotate"
                          values="-5 50 50; 3 50 50; -5 50 50"
                          dur="3s"
                          repeatCount="indefinite"/>
                      </circle>
                      <circle cx="56.2" cy="45" r="1.2" fill="#FFF">
                        <animateTransform
                          attributeName="transform"
                          attributeType="XML"
                          type="rotate"
                          values="-5 50 50; 3 50 50; -5 50 50"
                          dur="3s"
                          repeatCount="indefinite"/>
                      </circle>
                      <circle cx="47" cy="46.5" r="0.4" fill="#FFF">
                        <animateTransform
                          attributeName="transform"
                          attributeType="XML"
                          type="rotate"
                          values="-5 50 50; 3 50 50; -5 50 50"
                          dur="3s"
                          repeatCount="indefinite"/>
                      </circle>
                      <circle cx="57" cy="46.5" r="0.4" fill="#FFF">
                        <animateTransform
                          attributeName="transform"
                          attributeType="XML"
                          type="rotate"
                          values="-5 50 50; 3 50 50; -5 50 50"
                          dur="3s"
                          repeatCount="indefinite"/>
                      </circle>
                      
                      <!-- Pacifier -->
                      <!-- Pacifier shield (outer ring) -->
                      <!--
                      <ellipse cx="50" cy="56" rx="6" ry="4" fill="#87CEEB" stroke="#5F9EA0" stroke-width="0.8" opacity="0.9">
                        <animateTransform
                          attributeName="transform"
                          attributeType="XML"
                          type="rotate"
                          values="-5 50 50; 3 50 50; -5 50 50"
                          dur="3s"
                          repeatCount="indefinite"/>
                      </ellipse>
                      -->
                      <!-- Tiny baby smile -->
                      <path d="M 43 55 Q 50 61 57 55" stroke="#333" stroke-width="1.5" fill="none" stroke-linecap="round"/>  

                      <!-- Small blush (still visible around pacifier) -->
                      <circle cx="39" cy="52" r="2.5" fill="#FFB6C1" opacity="0.6">
                        <animateTransform
                          attributeName="transform"
                          attributeType="XML"
                          type="rotate"
                          values="-5 50 50; 3 50 50; -5 50 50"
                          dur="3s"
                          repeatCount="indefinite"/>
                      </circle>
                      <circle cx="61" cy="52" r="2.5" fill="#FFB6C1" opacity="0.6">
                        <animateTransform
                          attributeName="transform"
                          attributeType="XML"
                          type="rotate"
                          values="-5 50 50; 3 50 50; -5 50 50"
                          dur="3s"
                          repeatCount="indefinite"/>
                      </circle>
                    </svg>
                    </body>
                  </html>
                `,
              }}
              style={styles.flowerAnimation}
              scrollEnabled={false}
              showsHorizontalScrollIndicator={false}
              showsVerticalScrollIndicator={false}
              javaScriptEnabled={true}
              domStorageEnabled={true}
              startInLoadingState={false}
              androidLayerType='hardware'
            />
          </View>
          <View style={styles.flowerInfo}>
            <Text style={styles.flowerText}>What is your feeling</Text>
          </View>

          {/* Feeling Buttons */}
          <View style={styles.gardenFeelingContainer}>
            <TouchableOpacity
              style={styles.gardenFeelingColumn}
              onPress={() => handleFeelingTap('exciting')}
            >
              <Ionicons name='star' size={32} color='#FFD700' />
              <Text style={styles.gardenFeelingLabel}>Exciting</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.gardenFeelingColumn}
              onPress={() => handleFeelingTap('happy')}
            >
              <Ionicons name='happy' size={32} color='#4CAF50' />
              <Text style={styles.gardenFeelingLabel}>Happy</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.gardenFeelingColumn}
              onPress={() => handleFeelingTap('sad')}
            >
              <Ionicons name='sad' size={32} color='#FF6B6B' />
              <Text style={styles.gardenFeelingLabel}>Sad</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
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
  debugText: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
    marginTop: 10,
    fontFamily: 'monospace',
  },
  debugPanel: {
    backgroundColor: '#f0f0f0',
    padding: 10,
    margin: 10,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  debugTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#666',
    marginBottom: 5,
    textAlign: 'center',
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
  section: {
    backgroundColor: 'white',
    margin: 10,
    padding: 10,
    borderRadius: 10,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
    color: '#333',
  },
  flowerContainer: {
    alignItems: 'center',
  },
  flowerAnimationContainer: {
    width: 350,
    height: 350,
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 25,
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
  flowerText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2e7d32',
    marginBottom: 5,
    textAlign: 'center',
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
});
