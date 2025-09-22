import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  Image,
  Modal,
  Dimensions,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { Ionicons } from '@expo/vector-icons';
import ChildrenDataService from '../services/ChildrenDataService';
import ImageUtils from '../utils/imageUtils';
import Base64Image from '../components/Base64Image';

export default function ManageChildrenScreen({ navigation }) {
  const [children, setChildren] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingChild, setEditingChild] = useState(null);
  const firstNameRef = useRef(null);
  const [formData, setFormData] = useState({
    nickname: '',
    firstName: '',
    lastName: '',
    gender: 'boy',
    favourColor: '#E91E63',
    birthday: '',
    primarySchool: '',
    secondarySchool: '',
    favourCartoons: [],
    customCartoons: [],
    favourSports: [],
    customSports: [],
    hobbies: [],
    customHobbies: [],
    photo: null,
  });
  const [showImageResizer, setShowImageResizer] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [imageSize, setImageSize] = useState({ width: 200, height: 200 });

  const colorOptions = [
    '#E91E63', // Pink
    '#2196F3', // Blue
    '#4CAF50', // Green
    '#FF9800', // Orange
    '#9C27B0', // Purple
    '#F44336', // Red
    '#00BCD4', // Cyan
    '#795548', // Brown
  ];

  const cartoonOptions = [
    'Mickey Mouse',
    'Frozen',
    'Spider-Man',
    'Princess',
    'Cars',
    'Toy Story',
    'Peppa Pig',
    'Paw Patrol',
    'Pokemon',
    'Minecraft',
  ];

  const sportOptions = [
    'Football',
    'Basketball',
    'Soccer',
    'Tennis',
    'Swimming',
    'Baseball',
    'Volleyball',
    'Badminton',
    'Cricket',
    'Rugby',
  ];

  const hobbyOptions = [
    'Reading',
    'Drawing',
    'Painting',
    'Music',
    'Dancing',
    'Cooking',
    'Gardening',
    'Photography',
    'Writing',
    'Crafts',
    'Board Games',
    'Video Games',
  ];

  useEffect(() => {
    loadChildren();
  }, []);

  const loadChildren = async () => {
    try {
      // Get storage status for debugging
      const storageStatus = await ChildrenDataService.getStorageStatus();      
      const storedChildren = await ChildrenDataService.getChildren();
      setChildren(storedChildren);
    } catch (error) {
      console.error('Error details:', error.message);
    }
  };

  const openAddForm = () => {
    setEditingChild(null);
    setFormData({
      nickname: '',
      firstName: '',
      lastName: '',
      gender: 'boy',
      favourColor: '#E91E63',
      birthday: '',
      primarySchool: '',
      secondarySchool: '',
      favourCartoons: [],
      customCartoons: [],
      favourSports: [],
      customSports: [],
      hobbies: [],
      customHobbies: [],
      photo: null,
    });
    setShowForm(true);

    // Force focus after a short delay
    setTimeout(() => {
      if (firstNameRef.current) {
        firstNameRef.current.focus();
      }
    }, 100);
  };

  const openEditForm = (child) => {
    setEditingChild(child);
    setFormData({
      nickname: child.nickname || '',
      firstName: child.firstName,
      lastName: child.lastName,
      gender: child.gender,
      favourColor: child.favourColor,
      birthday: child.birthday,
      primarySchool: child.primarySchool || '',
      secondarySchool: child.secondarySchool || '',
      favourCartoons: child.favourCartoons || [],
      customCartoons: child.customCartoons || [],
      favourSports: child.favourSports || [],
      customSports: child.customSports || [],
      hobbies: child.hobbies || [],
      customHobbies: child.customHobbies || [],
      photo: child.photo || null,
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!formData.firstName.trim()) {
      Alert.alert('Error', 'First name is required');
      return;
    }

    try {
      // Get storage status for debugging
      const storageStatus = await ChildrenDataService.getStorageStatus();
      
      let success;
      if (editingChild) {
        success = await ChildrenDataService.updateChild(
          editingChild.id,
          formData
        );
      } else {
        const newChild = await ChildrenDataService.addChild(formData);
        success = newChild !== null;
      }

      if (success) {
        await loadChildren();
        setShowForm(false);
        Alert.alert(
          'Success',
          editingChild
            ? 'Child updated successfully'
            : 'Child added successfully'
        );
      } else {
        Alert.alert('Error', 'Failed to save child data');
      }
    } catch (error) {
      console.error('Error details:', error.message);
      console.error('Error stack:', error.stack);
      Alert.alert('Error', `Failed to save child data: ${error.message}`);
    }
  };

  const handleDelete = (childToDelete) => {
    Alert.alert(
      'Delete Child',
      `Are you sure you want to delete ${childToDelete.firstName}'s profile?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const success = await ChildrenDataService.deleteChild(
                childToDelete.id
              );
              if (success) {
                await loadChildren();
                Alert.alert('Success', 'Child deleted successfully');
              } else {
                Alert.alert('Error', 'Failed to delete child');
              }
            } catch (error) {
              console.error('Error deleting child:', error);
              Alert.alert('Error', 'Failed to delete child');
            }
          },
        },
      ]
    );
  };

  const getGenderEmoji = (gender) => {
    return gender === 'girl' ? '👧' : '👦';
  };

  const calculateAge = (birthday) => {
    if (!birthday) return '';

    try {
      const [day, month, year] = birthday
        .split('/')
        .map((num) => parseInt(num));
      if (!day || !month || !year) return '';

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

      return age >= 0 ? age : '';
    } catch (error) {
      return '';
    }
  };

  const requestPermissions = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Permission needed',
        'Please grant camera roll permissions to select photos.'
      );
      return false;
    }
    return true;
  };

  const selectPhoto = async () => {
    const hasPermission = await requestPermissions();
    if (!hasPermission) return;

    Alert.alert('Select Photo', 'Choose how you want to select a photo', [
      { text: 'Camera', onPress: () => openCamera() },
      { text: 'Photo Library', onPress: () => openImagePicker() },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const openCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Permission needed',
        'Please grant camera permissions to take photos.'
      );
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setSelectedImage(result.assets[0].uri);
      setShowImageResizer(true);
    }
  };

  const openImagePicker = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setSelectedImage(result.assets[0].uri);
      setShowImageResizer(true);
    }
  };

  const resizeImage = async () => {
    if (!selectedImage) return;

    try {
      const manipulatedImage = await ImageManipulator.manipulateAsync(
        selectedImage,
        [{ resize: { width: imageSize.width, height: imageSize.height } }],
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
      );

      // Convert the resized image to base64
      const base64Image = await ImageUtils.encodeImageToBase64(manipulatedImage.uri);
      
      // Compress if too large (max 5MB)
      const compressedBase64 = await ImageUtils.compressBase64Image(base64Image, 5 * 1024 * 1024);

      setFormData({ ...formData, photo: compressedBase64 });
      setShowImageResizer(false);
      setSelectedImage(null);

      console.log('Image encoded to base64, size:', ImageUtils.getBase64ImageSize(compressedBase64), 'bytes');
    } catch (error) {
      console.error('Error processing image:', error);
      Alert.alert('Error', 'Failed to process image');
    }
  };

  const removePhoto = () => {
    setFormData({ ...formData, photo: null });
  };

  const toggleCartoonSelection = (cartoon) => {
    const currentCartoons = [...formData.favourCartoons];
    const index = currentCartoons.indexOf(cartoon);

    if (index > -1) {
      currentCartoons.splice(index, 1);
    } else {
      currentCartoons.push(cartoon);
    }

    setFormData({ ...formData, favourCartoons: currentCartoons });
  };

  const toggleSportSelection = (sport) => {
    const currentSports = [...formData.favourSports];
    const index = currentSports.indexOf(sport);

    if (index > -1) {
      currentSports.splice(index, 1);
    } else {
      currentSports.push(sport);
    }

    setFormData({ ...formData, favourSports: currentSports });
  };

  const addCustomCartoon = (cartoon) => {
    if (cartoon.trim() && !formData.customCartoons.includes(cartoon.trim())) {
      setFormData({
        ...formData,
        customCartoons: [...formData.customCartoons, cartoon.trim()],
      });
    }
  };

  const removeCustomCartoon = (cartoon) => {
    setFormData({
      ...formData,
      customCartoons: formData.customCartoons.filter((c) => c !== cartoon),
    });
  };

  const addCustomSport = (sport) => {
    if (sport.trim() && !formData.customSports.includes(sport.trim())) {
      setFormData({
        ...formData,
        customSports: [...formData.customSports, sport.trim()],
      });
    }
  };

  const removeCustomSport = (sport) => {
    setFormData({
      ...formData,
      customSports: formData.customSports.filter((s) => s !== sport),
    });
  };

  const toggleHobbySelection = (hobby) => {
    const currentHobbies = [...formData.hobbies];
    const index = currentHobbies.indexOf(hobby);

    if (index > -1) {
      currentHobbies.splice(index, 1);
    } else {
      currentHobbies.push(hobby);
    }

    setFormData({ ...formData, hobbies: currentHobbies });
  };

  const addCustomHobby = (hobby) => {
    if (hobby.trim() && !formData.customHobbies.includes(hobby.trim())) {
      setFormData({
        ...formData,
        customHobbies: [...formData.customHobbies, hobby.trim()],
      });
    }
  };

  const removeCustomHobby = (hobby) => {
    setFormData({
      ...formData,
      customHobbies: formData.customHobbies.filter((h) => h !== hobby),
    });
  };

  if (showForm) {
    return (
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setShowForm(false)}>
            <Ionicons name='arrow-back' size={24} color='#48b6b0' />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>
            {editingChild ? 'Edit Child' : 'Add New Child'}
          </Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView
          style={styles.formContainer}
          keyboardShouldPersistTaps='handled'
          showsVerticalScrollIndicator={false}
        >
          {/* Photo */}
          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>Photo</Text>
            <View style={styles.photoContainer}>
              {formData.photo ? (
                <View style={styles.photoPreview}>
                  <Base64Image
                    source={{ uri: formData.photo }}
                    style={styles.photoImage}
                  />
                  <TouchableOpacity
                    style={styles.removePhotoButton}
                    onPress={removePhoto}
                  >
                    <Ionicons name='close-circle' size={24} color='#FF3B30' />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.photoPlaceholder}
                  onPress={selectPhoto}
                >
                  <Ionicons name='camera' size={40} color='#666' />
                  <Text style={styles.photoPlaceholderText}>Add Photo</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* First Name */}
          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>First Name *</Text>
            <TextInput
              ref={firstNameRef}
              style={styles.formInput}
              value={formData.firstName}
              onChangeText={(text) =>
                setFormData({ ...formData, firstName: text })
              }
              placeholder='Enter first name'
              autoCorrect={false}
              autoCapitalize='words'
              showSoftInputOnFocus={true}
              editable={true}
              selectTextOnFocus={true}
            />
          </View>

          {/* Last Name */}
          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>Last Name</Text>
            <TextInput
              style={styles.formInput}
              value={formData.lastName}
              onChangeText={(text) =>
                setFormData({ ...formData, lastName: text })
              }
              placeholder='Enter last name'
              autoCorrect={false}
              autoCapitalize='words'
            />
          </View>

          {/* Nickname */}
          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>Nickname</Text>
            <TextInput
              style={styles.formInput}
              value={formData.nickname}
              onChangeText={(text) =>
                setFormData({ ...formData, nickname: text })
              }
              placeholder='Enter nickname (optional)'
              autoCorrect={false}
              autoCapitalize='words'
              showSoftInputOnFocus={true}
              editable={true}
              selectTextOnFocus={true}
            />
          </View>

          {/* Gender */}
          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>Gender</Text>
            <View style={styles.genderContainer}>
              <TouchableOpacity
                style={[
                  styles.genderButton,
                  formData.gender === 'boy' && styles.genderButtonActive,
                ]}
                onPress={() => setFormData({ ...formData, gender: 'boy' })}
              >
                <Text style={styles.genderEmoji}>👦</Text>
                <Text
                  style={[
                    styles.genderText,
                    formData.gender === 'boy' && styles.genderTextActive,
                  ]}
                >
                  Boy
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.genderButton,
                  formData.gender === 'girl' && styles.genderButtonActive,
                ]}
                onPress={() => setFormData({ ...formData, gender: 'girl' })}
              >
                <Text style={styles.genderEmoji}>👧</Text>
                <Text
                  style={[
                    styles.genderText,
                    formData.gender === 'girl' && styles.genderTextActive,
                  ]}
                >
                  Girl
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Birthday */}
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Birthday</Text>
              <TextInput
                style={styles.formInput}
                value={formData.birthday}
                onChangeText={(text) => {

                  let cleaned = text.replace(/[^0-9/]/g, '');

                  if (cleaned.length <= 10) {
                    if (cleaned.length >= 2 && cleaned[2] !== '/') {
                      cleaned = cleaned.slice(0, 2) + '/' + cleaned.slice(2);
                    }
                    if (cleaned.length >= 5 && cleaned[5] !== '/') {
                      cleaned = cleaned.slice(0, 5) + '/' + cleaned.slice(5);
                    }
                  }

                  setFormData({ ...formData, birthday: cleaned });
                }}
                placeholder='DD/MM/YYYY'
                keyboardType='numeric'
                autoCorrect={false}
                maxLength={10}
              />
              {formData.birthday && calculateAge(formData.birthday) !== '' && (
                <Text style={styles.ageDisplay}>
                  Current Age: {calculateAge(formData.birthday)} years old
                </Text>
              )}
            </View>

          {/* Primary School */}
          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>Primary School</Text>
            <TextInput
              style={styles.formInput}
              value={formData.primarySchool}
              onChangeText={(text) =>
                setFormData({ ...formData, primarySchool: text })
              }
              placeholder='Enter primary school name'
              autoCorrect={false}
              autoCapitalize='words'
            />
          </View>

          {/* Secondary School */}
          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>Secondary School</Text>
            <TextInput
              style={styles.formInput}
              value={formData.secondarySchool}
              onChangeText={(text) =>
                setFormData({ ...formData, secondarySchool: text })
              }
              placeholder='Enter secondary school name'
              autoCorrect={false}
              autoCapitalize='words'
            />
          </View>

          {/* Favourite Color */}
          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>Favourite Color</Text>
            <View style={styles.colorOptionsContainer}>
              {colorOptions.map((color, index) => (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.colorOption,
                    { backgroundColor: color },
                    formData.favourColor === color &&
                      styles.selectedColorOption,
                  ]}
                  onPress={() =>
                    setFormData({ ...formData, favourColor: color })
                  }
                >
                  {formData.favourColor === color && (
                    <Ionicons name='checkmark' size={16} color='white' />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Favourite Cartoon Characters */}
          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>
              Favourite Cartoon Characters (Multiple Selection)
            </Text>
            <View style={styles.cartoonContainer}>
              {cartoonOptions.map((cartoon, index) => (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.cartoonOption,
                    formData.favourCartoons.includes(cartoon) &&
                      styles.cartoonOptionActive,
                  ]}
                  onPress={() => toggleCartoonSelection(cartoon)}
                >
                  <Text
                    style={[
                      styles.cartoonText,
                      formData.favourCartoons.includes(cartoon) &&
                        styles.cartoonTextActive,
                    ]}
                  >
                    {cartoon}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Selected Cartoons Display */}
            {(formData.favourCartoons.length > 0 ||
              formData.customCartoons.length > 0) && (
              <View style={styles.selectedItemsContainer}>
                <Text style={styles.selectedItemsLabel}>Selected:</Text>
                <View style={styles.selectedItemsList}>
                  {formData.favourCartoons.map((cartoon, index) => (
                    <View key={index} style={styles.selectedItem}>
                      <Text style={styles.selectedItemText}>{cartoon}</Text>
                      <TouchableOpacity
                        onPress={() => toggleCartoonSelection(cartoon)}
                      >
                        <Ionicons
                          name='close-circle'
                          size={16}
                          color='#FF3B30'
                        />
                      </TouchableOpacity>
                    </View>
                  ))}
                  {formData.customCartoons.map((cartoon, index) => (
                    <View key={`custom-${index}`} style={styles.selectedItem}>
                      <Text style={styles.selectedItemText}>{cartoon}</Text>
                      <TouchableOpacity
                        onPress={() => removeCustomCartoon(cartoon)}
                      >
                        <Ionicons
                          name='close-circle'
                          size={16}
                          color='#FF3B30'
                        />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Custom Cartoon Input */}
            <View style={styles.customCartoonContainer}>
              <Text style={styles.customCartoonLabel}>
                Add custom character:
              </Text>
              <View style={styles.customInputContainer}>
                <TextInput
                  style={[styles.formInput, styles.customCartoonInput]}
                  placeholder='Enter custom cartoon character'
                  autoCorrect={false}
                  autoCapitalize='words'
                  onSubmitEditing={(event) => {
                    addCustomCartoon(event.nativeEvent.text);
                    event.target.clear();
                  }}
                />
              </View>
            </View>
          </View>

          {/* Favourite Sports */}
          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>
              Favourite Sports (Multiple Selection)
            </Text>
            <View style={styles.cartoonContainer}>
              {sportOptions.map((sport, index) => (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.cartoonOption,
                    formData.favourSports.includes(sport) &&
                      styles.cartoonOptionActive,
                  ]}
                  onPress={() => toggleSportSelection(sport)}
                >
                  <Text
                    style={[
                      styles.cartoonText,
                      formData.favourSports.includes(sport) &&
                        styles.cartoonTextActive,
                    ]}
                  >
                    {sport}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Selected Sports Display */}
            {(formData.favourSports.length > 0 ||
              formData.customSports.length > 0) && (
              <View style={styles.selectedItemsContainer}>
                <Text style={styles.selectedItemsLabel}>Selected:</Text>
                <View style={styles.selectedItemsList}>
                  {formData.favourSports.map((sport, index) => (
                    <View key={index} style={styles.selectedItem}>
                      <Text style={styles.selectedItemText}>{sport}</Text>
                      <TouchableOpacity
                        onPress={() => toggleSportSelection(sport)}
                      >
                        <Ionicons
                          name='close-circle'
                          size={16}
                          color='#FF3B30'
                        />
                      </TouchableOpacity>
                    </View>
                  ))}
                  {formData.customSports.map((sport, index) => (
                    <View key={`custom-${index}`} style={styles.selectedItem}>
                      <Text style={styles.selectedItemText}>{sport}</Text>
                      <TouchableOpacity
                        onPress={() => removeCustomSport(sport)}
                      >
                        <Ionicons
                          name='close-circle'
                          size={16}
                          color='#FF3B30'
                        />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Custom Sport Input */}
            <View style={styles.customCartoonContainer}>
              <Text style={styles.customCartoonLabel}>Add custom sport:</Text>
              <View style={styles.customInputContainer}>
                <TextInput
                  style={[styles.formInput, styles.customCartoonInput]}
                  placeholder='Enter custom sport'
                  autoCorrect={false}
                  autoCapitalize='words'
                  onSubmitEditing={(event) => {
                    addCustomSport(event.nativeEvent.text);
                    event.target.clear();
                  }}
                />
              </View>
            </View>
          </View>

          {/* Hobbies */}
          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>Hobbies (Multiple Selection)</Text>
            <View style={styles.cartoonContainer}>
              {hobbyOptions.map((hobby, index) => (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.cartoonOption,
                    formData.hobbies.includes(hobby) &&
                      styles.cartoonOptionActive,
                  ]}
                  onPress={() => toggleHobbySelection(hobby)}
                >
                  <Text
                    style={[
                      styles.cartoonText,
                      formData.hobbies.includes(hobby) &&
                        styles.cartoonTextActive,
                    ]}
                  >
                    {hobby}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Selected Hobbies Display */}
            {(formData.hobbies.length > 0 ||
              formData.customHobbies.length > 0) && (
              <View style={styles.selectedItemsContainer}>
                <Text style={styles.selectedItemsLabel}>Selected:</Text>
                <View style={styles.selectedItemsList}>
                  {formData.hobbies.map((hobby, index) => (
                    <View key={index} style={styles.selectedItem}>
                      <Text style={styles.selectedItemText}>{hobby}</Text>
                      <TouchableOpacity
                        onPress={() => toggleHobbySelection(hobby)}
                      >
                        <Ionicons
                          name='close-circle'
                          size={16}
                          color='#FF3B30'
                        />
                      </TouchableOpacity>
                    </View>
                  ))}
                  {formData.customHobbies.map((hobby, index) => (
                    <View key={`custom-${index}`} style={styles.selectedItem}>
                      <Text style={styles.selectedItemText}>{hobby}</Text>
                      <TouchableOpacity
                        onPress={() => removeCustomHobby(hobby)}
                      >
                        <Ionicons
                          name='close-circle'
                          size={16}
                          color='#FF3B30'
                        />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Custom Hobby Input */}
            <View style={styles.customCartoonContainer}>
              <Text style={styles.customCartoonLabel}>Add custom hobby:</Text>
              <View style={styles.customInputContainer}>
                <TextInput
                  style={[styles.formInput, styles.customCartoonInput]}
                  placeholder='Enter custom hobby'
                  autoCorrect={false}
                  autoCapitalize='words'
                  onSubmitEditing={(event) => {
                    addCustomHobby(event.nativeEvent.text);
                    event.target.clear();
                  }}
                />
              </View>
            </View>
          </View>
        </ScrollView>

        <View style={styles.formActions}>
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={() => setShowForm(false)}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
            <Text style={styles.saveButtonText}>
              {editingChild ? 'Update' : 'Add Child'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Image Resizer Modal */}
        <Modal
          visible={showImageResizer}
          transparent={true}
          animationType='slide'
          onRequestClose={() => setShowImageResizer(false)}
        >
          <View style={styles.resizerOverlay}>
            <View style={styles.resizerContainer}>
              <View style={styles.resizerHeader}>
                <Text style={styles.resizerTitle}>Resize Image</Text>
                <TouchableOpacity onPress={() => setShowImageResizer(false)}>
                  <Ionicons name='close' size={24} color='#666' />
                </TouchableOpacity>
              </View>

              {selectedImage && (
                <View style={styles.resizerContent}>
                  <Image
                    source={{ uri: selectedImage }}
                    style={[
                      styles.previewImage,
                      { width: imageSize.width, height: imageSize.height },
                    ]}
                    resizeMode='cover'
                  />

                  <View style={styles.sizeControls}>
                    <Text style={styles.sizeLabel}>
                      Width: {imageSize.width}px
                    </Text>
                    <View style={styles.sliderContainer}>
                      <TouchableOpacity
                        style={styles.sizeButton}
                        onPress={() =>
                          setImageSize((prev) => ({
                            ...prev,
                            width: Math.max(100, prev.width - 20),
                          }))
                        }
                      >
                        <Text style={styles.sizeButtonText}>-</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.sizeButton}
                        onPress={() =>
                          setImageSize((prev) => ({
                            ...prev,
                            width: Math.min(400, prev.width + 20),
                          }))
                        }
                      >
                        <Text style={styles.sizeButtonText}>+</Text>
                      </TouchableOpacity>
                    </View>

                    <Text style={styles.sizeLabel}>
                      Height: {imageSize.height}px
                    </Text>
                    <View style={styles.sliderContainer}>
                      <TouchableOpacity
                        style={styles.sizeButton}
                        onPress={() =>
                          setImageSize((prev) => ({
                            ...prev,
                            height: Math.max(100, prev.height - 20),
                          }))
                        }
                      >
                        <Text style={styles.sizeButtonText}>-</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.sizeButton}
                        onPress={() =>
                          setImageSize((prev) => ({
                            ...prev,
                            height: Math.min(400, prev.height + 20),
                          }))
                        }
                      >
                        <Text style={styles.sizeButtonText}>+</Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  <View style={styles.resizerActions}>
                    <TouchableOpacity
                      style={styles.resizerCancelButton}
                      onPress={() => setShowImageResizer(false)}
                    >
                      <Text style={styles.resizerCancelText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.resizerSaveButton}
                      onPress={resizeImage}
                    >
                      <Text style={styles.resizerSaveText}>Apply</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          </View>
        </Modal>
      </KeyboardAvoidingView>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name='arrow-back' size={24} color='#48b6b0' />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Manage Children</Text>
        <TouchableOpacity onPress={openAddForm}>
          <Ionicons name='add' size={24} color='#48b6b0' />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content}>
        {children.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name='people-outline' size={64} color='#ccc' />
            <Text style={styles.emptyStateTitle}>No Children Added</Text>
            <Text style={styles.emptyStateText}>
              Tap the + button to add your first child's profile
            </Text>
          </View>
        ) : (
          <View style={styles.childrenList}>
            {children.map((child) => (
              <TouchableOpacity
                key={child.id}
                style={styles.childCard}
                onPress={() => openEditForm(child)}
                activeOpacity={0.7}
              >
                <View style={styles.childHeader}>
                  <View style={styles.childInfo}>
                    {child.photo ? (
                      <Base64Image
                        source={{ uri: child.photo }}
                        style={styles.childPhoto}
                      />
                    ) : (
                      <Text style={styles.childEmoji}>
                        {getGenderEmoji(child.gender)}
                      </Text>
                    )}
                    <View style={styles.childDetails}>
                      <Text style={styles.childName}>
                        {`${child.firstName} ${child.lastName}${
                          child.nickname ? ` (${child.nickname})` : ''
                        }`}
                      </Text>
                      <Text style={styles.childMeta}>
                        Cartoons:{' '}
                        {[
                          ...(child.favourCartoons || []),
                          ...(child.customCartoons || []),
                        ].join(', ') || 'Not specified'}
                      </Text>
                      <Text style={styles.childMeta}>
                        Sports:{' '}
                        {[
                          ...(child.favourSports || []),
                          ...(child.customSports || []),
                        ].join(', ') || 'Not specified'}
                      </Text>
                      <Text style={styles.childMeta}>
                        Hobbies:{' '}
                        {[
                          ...(child.hobbies || []),
                          ...(child.customHobbies || []),
                        ].join(', ') || 'Not specified'}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.childActions}>
                    <View
                      style={[
                        styles.colorIndicator,
                        { backgroundColor: child.favourColor },
                      ]}
                    />
                    <TouchableOpacity
                      style={styles.actionButton}
                      onPress={(e) => {
                        e.stopPropagation();
                        handleDelete(child);
                      }}
                    >
                      <Ionicons
                        name='trash-outline'
                        size={20}
                        color='#FF3B30'
                      />
                    </TouchableOpacity>
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>
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
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    paddingTop: Platform.OS === 'ios' ? 50 : 20,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  content: {
    flex: 1,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
    paddingHorizontal: 40,
  },
  emptyStateTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 20,
    marginBottom: 10,
  },
  emptyStateText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 24,
  },
  childrenList: {
    padding: 20,
  },
  childCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  childHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  childInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  childEmoji: {
    fontSize: 40,
    marginRight: 16,
  },
  childPhoto: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: 16,
  },
  photoContainer: {
    alignItems: 'center',
    marginVertical: 10,
  },
  photoPreview: {
    position: 'relative',
    alignItems: 'center',
  },
  photoImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 2,
    borderColor: '#ddd',
  },
  removePhotoButton: {
    position: 'absolute',
    top: -5,
    right: -5,
    backgroundColor: 'white',
    borderRadius: 12,
  },
  photoPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 2,
    borderColor: '#ddd',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f9f9f9',
  },
  photoPlaceholderText: {
    fontSize: 12,
    color: '#666',
    marginTop: 5,
  },
  resizerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  resizerContainer: {
    backgroundColor: 'white',
    borderRadius: 12,
    width: '90%',
    maxHeight: '80%',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  resizerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  resizerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  resizerContent: {
    padding: 20,
    alignItems: 'center',
  },
  previewImage: {
    borderRadius: 8,
    marginBottom: 20,
  },
  sizeControls: {
    width: '100%',
    marginBottom: 20,
  },
  sizeLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 10,
    textAlign: 'center',
  },
  sliderContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 15,
  },
  sizeButton: {
    backgroundColor: '#48b6b0',
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 20,
  },
  sizeButtonText: {
    color: 'white',
    fontSize: 20,
    fontWeight: 'bold',
  },
  resizerActions: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  resizerCancelButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    alignItems: 'center',
  },
  resizerCancelText: {
    fontSize: 16,
    color: '#666',
  },
  resizerSaveButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#48b6b0',
    alignItems: 'center',
  },
  resizerSaveText: {
    fontSize: 16,
    color: 'white',
    fontWeight: '600',
  },
  childDetails: {
    flex: 1,
  },
  childName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  childMeta: {
    fontSize: 14,
    color: '#666',
    marginBottom: 2,
  },
  childActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  colorIndicator: {
    width: 24,
    height: 24,
    borderRadius: 12,
    marginRight: 12,
    borderWidth: 2,
    borderColor: 'white',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.22,
    shadowRadius: 2.22,
    elevation: 3,
  },
  actionButton: {
    padding: 8,
    marginLeft: 4,
  },
  formContainer: {
    flex: 1,
  },
  formGroup: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    backgroundColor: 'white',
  },
  formLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  formInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#f9f9f9',
  },
  ageDisplay: {
    marginTop: 8,
    fontSize: 14,
    color: '#48b6b0',
    fontWeight: '600',
    backgroundColor: '#E3F2FD',
    padding: 8,
    borderRadius: 6,
    textAlign: 'center',
  },
  genderContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  genderButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#ddd',
    backgroundColor: '#f9f9f9',
  },
  genderButtonActive: {
    borderColor: '#48b6b0',
    backgroundColor: '#E3F2FD',
  },
  genderEmoji: {
    fontSize: 20,
    marginRight: 8,
  },
  genderText: {
    fontSize: 16,
    color: '#666',
  },
  genderTextActive: {
    color: '#48b6b0',
    fontWeight: '600',
  },
  colorOptionsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  colorOption: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.22,
    shadowRadius: 2.22,
  },
  selectedColorOption: {
    borderWidth: 3,
    borderColor: '#fff',
    elevation: 4,
    shadowOpacity: 0.3,
  },
  cartoonContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  cartoonOption: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#ddd',
    backgroundColor: '#f9f9f9',
  },
  cartoonOptionActive: {
    borderColor: '#48b6b0',
    backgroundColor: '#E3F2FD',
  },
  cartoonText: {
    fontSize: 14,
    color: '#666',
  },
  cartoonTextActive: {
    color: '#48b6b0',
    fontWeight: '600',
  },
  customCartoonContainer: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  customCartoonLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  customCartoonInput: {
    marginTop: 0,
  },
  customCartoonInputActive: {
    borderColor: '#48b6b0',
    backgroundColor: '#E3F2FD',
  },
  formActions: {
    flexDirection: 'row',
    padding: 20,
    gap: 12,
    backgroundColor: 'white',
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  cancelButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    color: '#666',
  },
  saveButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#48b6b0',
    alignItems: 'center',
  },
  saveButtonText: {
    fontSize: 16,
    color: 'white',
    fontWeight: '600',
  },
  selectedItemsContainer: {
    marginTop: 15,
    padding: 10,
    backgroundColor: '#f0f8ff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#48b6b0',
  },
  selectedItemsLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#48b6b0',
    marginBottom: 8,
  },
  selectedItemsList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  selectedItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#48b6b0',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 15,
    gap: 5,
  },
  selectedItemText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '500',
  },
  customInputContainer: {
    marginTop: 5,
  },
});
