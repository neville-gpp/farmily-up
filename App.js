import './src/utils/polyfills';
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { AuthProvider, useAuth } from './src/context/AuthContext';
import AuthStack from './src/navigation/AuthStack';
import SessionWarningModal from './src/components/SessionWarningModal';

import HomeScreen from './src/screens/HomeScreen';
import CalendarScreen from './src/screens/CalendarScreen';
import GardenScreen from './src/screens/GardenScreen';
import FamilyTimeScreen from './src/screens/FamilyTimeScreen';
import ChildProfileScreen from './src/screens/ChildProfileScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import ManageChildrenScreen from './src/screens/ManageChildrenScreen';

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

function SettingsStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen 
        name="SettingsMain" 
        component={SettingsScreen} 
        options={{ headerShown: false }}
      />
      <Stack.Screen 
        name="ManageChildren" 
        component={ManageChildrenScreen} 
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
}

function AppTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName;

          if (route.name === 'Home') {
            iconName = focused ? 'home' : 'home-outline';
          } else if (route.name === 'Calendar') {
            iconName = focused ? 'calendar' : 'calendar-outline';
          } else if (route.name === 'Garden') {
            iconName = focused ? 'flower' : 'flower-outline';
          } else if (route.name === 'Farmily Time') {
            iconName = focused ? 'people' : 'people-outline';
          } else if (route.name === 'Child Profile') {
            iconName = focused ? 'person' : 'person-outline';
          } else if (route.name === 'Settings') {
            iconName = focused ? 'settings' : 'settings-outline';
          }

          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: '#48b6b0',
        tabBarInactiveTintColor: 'gray',
        headerStyle: {
          backgroundColor: '#48b6b0',
        },
        headerTintColor: '#fff',
        headerTitleStyle: {
          fontSize: '22',
          fontWeight: 'bold',
        },
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Calendar" component={CalendarScreen} />
      <Tab.Screen name="Garden" component={GardenScreen} />
      <Tab.Screen name="Farmily Time" component={FamilyTimeScreen} />
      <Tab.Screen name="Child Profile" component={ChildProfileScreen} />
      <Tab.Screen name="Settings" component={SettingsStack} />
    </Tab.Navigator>
  );
}

function LoadingScreen() {
  return (
    <View style={styles.loadingContainer}>
      <ActivityIndicator size="large" color="#48b6b0" />
    </View>
  );
}

function AppNavigator() {
  const { isAuthenticated, loading, isInitialized } = useAuth();

  // Show loading screen while initializing authentication
  if (!isInitialized || loading) {
    return <LoadingScreen />;
  }

  // Show authentication stack if user is not authenticated
  if (!isAuthenticated) {
    return <AuthStack />;
  }

  // Show main app tabs if user is authenticated
  return (
    <>
      <AppTabs />
      <SessionWarningModal />
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <NavigationContainer>
        <AppNavigator />
      </NavigationContainer>
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
});