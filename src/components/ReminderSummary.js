import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import NotificationService from '../services/NotificationService';

export default function ReminderSummary({ events, onReminderPress }) {
  const [upcomingReminders, setUpcomingReminders] = useState([]);

  useEffect(() => {
    calculateUpcomingReminders();
  }, [events]);

  const calculateUpcomingReminders = () => {
    const now = new Date();
    const next24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const reminders = [];

    events.forEach(event => {
      if (event.remindersEnabled && event.reminders && event.reminders.length > 0) {
        const eventDateTime = NotificationService.getEventDateTime(event);
        
        if (eventDateTime && eventDateTime > now) {
          event.reminders.forEach(reminderId => {
            const reminderTime = NotificationService.calculateReminderTime(eventDateTime, reminderId);
            
            if (reminderTime && reminderTime > now && reminderTime <= next24Hours) {
              reminders.push({
                event,
                reminderId,
                reminderTime,
                eventDateTime,
              });
            }
          });
        }
      }
    });

    // Sort by reminder time
    reminders.sort((a, b) => a.reminderTime - b.reminderTime);
    setUpcomingReminders(reminders.slice(0, 5)); // Show only next 5 reminders
  };

  const formatReminderTime = (reminderTime) => {
    const now = new Date();
    const diffMs = reminderTime - now;
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

    if (diffMins < 60) {
      return `in ${diffMins} min${diffMins !== 1 ? 's' : ''}`;
    } else if (diffHours < 24) {
      return `in ${diffHours} hour${diffHours !== 1 ? 's' : ''}`;
    } else {
      return reminderTime.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
    }
  };

  const getReminderTypeText = (reminderId) => {
    switch (reminderId) {
      case 'at_time': return 'Event starts';
      case '5_min': return '5 min reminder';
      case '15_min': return '15 min reminder';
      case '30_min': return '30 min reminder';
      case '1_hour': return '1 hour reminder';
      case '1_day': return '1 day reminder';
      default:
        if (reminderId.startsWith('custom_')) {
          const parts = reminderId.replace('custom_', '').split('_');
          return `${parts[0]} ${parts[1]} reminder`;
        }
        return 'Reminder';
    }
  };

  if (upcomingReminders.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Ionicons name="notifications" size={20} color="#48b6b0" />
        <Text style={styles.headerText}>Upcoming Reminders</Text>
      </View>
      
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        style={styles.remindersList}
      >
        {upcomingReminders.map((reminder, index) => (
          <TouchableOpacity
            key={`${reminder.event.id}-${reminder.reminderId}-${index}`}
            style={styles.reminderCard}
            onPress={() => onReminderPress && onReminderPress(reminder.event)}
          >
            <View style={styles.reminderHeader}>
              <Text style={styles.reminderTime}>
                {formatReminderTime(reminder.reminderTime)}
              </Text>
              <Text style={styles.reminderType}>
                {getReminderTypeText(reminder.reminderId)}
              </Text>
            </View>
            
            <Text style={styles.eventTitle} numberOfLines={2}>
              {reminder.event.title}
            </Text>
            
            <Text style={styles.eventTime}>
              {reminder.eventDateTime.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
                hour12: true
              })}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'white',
    margin: 10,
    borderRadius: 10,
    padding: 15,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginLeft: 8,
  },
  remindersList: {
    flexDirection: 'row',
  },
  reminderCard: {
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 12,
    marginRight: 12,
    minWidth: 160,
    maxWidth: 200,
    borderLeftWidth: 3,
    borderLeftColor: '#48b6b0',
  },
  reminderHeader: {
    marginBottom: 8,
  },
  reminderTime: {
    fontSize: 12,
    fontWeight: '600',
    color: '#48b6b0',
    marginBottom: 2,
  },
  reminderType: {
    fontSize: 10,
    color: '#666',
    textTransform: 'uppercase',
  },
  eventTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    marginBottom: 4,
  },
  eventTime: {
    fontSize: 12,
    color: '#666',
  },
});