import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// Configure notification behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

class NotificationService {
  // Request notification permissions
  static async requestPermissions() {
    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      
      if (finalStatus !== 'granted') {
        console.warn('Failed to get push token for push notification!');
        return false;
      }
      
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'default',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#FF231F7C',
        });
      }
      
      return true;
    } catch (error) {
      console.error('Error requesting notification permissions:', error);
      return false;
    }
  }

  // Schedule reminders for an event
  static async scheduleEventReminders(event) {
    try {
      // First, cancel any existing reminders for this event
      await this.cancelEventReminders(event.id);
      
      if (!event.remindersEnabled || !event.reminders || event.reminders.length === 0) {
        return [];
      }

      const scheduledNotifications = [];
      const eventDateTime = this.getEventDateTime(event);
      
      if (!eventDateTime) {
        console.warn('Could not determine event date/time for reminders');
        return [];
      }

      for (const reminderId of event.reminders) {
        const reminderTime = this.calculateReminderTime(eventDateTime, reminderId);
        
        if (reminderTime && reminderTime > new Date()) {
          const notificationId = await Notifications.scheduleNotificationAsync({
            content: {
              title: `Reminder: ${event.title}`,
              body: this.getReminderMessage(event, reminderId),
              data: {
                eventId: event.id,
                reminderId: reminderId,
                type: 'event_reminder'
              },
            },
            trigger: {
              date: reminderTime,
            },
          });
          
          scheduledNotifications.push({
            notificationId,
            reminderId,
            scheduledTime: reminderTime,
          });
        }
      }
      
      return scheduledNotifications;
    } catch (error) {
      console.error('Error scheduling event reminders:', error);
      return [];
    }
  }

  // Cancel all reminders for an event
  static async cancelEventReminders(eventId) {
    try {
      const scheduledNotifications = await Notifications.getAllScheduledNotificationsAsync();
      
      const eventNotifications = scheduledNotifications.filter(
        notification => notification.content.data?.eventId === eventId
      );
      
      for (const notification of eventNotifications) {
        await Notifications.cancelScheduledNotificationAsync(notification.identifier);
      }
      
      return eventNotifications.length;
    } catch (error) {
      console.error('Error canceling event reminders:', error);
      return 0;
    }
  }

  // Get the event date/time for reminder calculation
  static getEventDateTime(event) {
    if (event.isAllDay) {
      // For all-day events, use 9 AM on the start date as the reference time
      const [year, month, day] = event.startDate.split('-').map(Number);
      const eventDate = new Date(year, month - 1, day, 9, 0, 0);
      return eventDate;
    } else {
      return new Date(event.startDateTime);
    }
  }

  // Calculate the reminder time based on the reminder ID
  static calculateReminderTime(eventDateTime, reminderId) {
    const reminderTime = new Date(eventDateTime);
    
    switch (reminderId) {
      case 'at_time':
        return reminderTime;
      case '5_min':
        reminderTime.setMinutes(reminderTime.getMinutes() - 5);
        return reminderTime;
      case '15_min':
        reminderTime.setMinutes(reminderTime.getMinutes() - 15);
        return reminderTime;
      case '30_min':
        reminderTime.setMinutes(reminderTime.getMinutes() - 30);
        return reminderTime;
      case '1_hour':
        reminderTime.setHours(reminderTime.getHours() - 1);
        return reminderTime;
      case '1_day':
        reminderTime.setDate(reminderTime.getDate() - 1);
        return reminderTime;
      default:
        // Handle custom reminders
        if (reminderId.startsWith('custom_')) {
          const parts = reminderId.replace('custom_', '').split('_');
          const amount = parseInt(parts[0]);
          const unit = parts[1];
          
          switch (unit) {
            case 'minutes':
              reminderTime.setMinutes(reminderTime.getMinutes() - amount);
              break;
            case 'hours':
              reminderTime.setHours(reminderTime.getHours() - amount);
              break;
            case 'days':
              reminderTime.setDate(reminderTime.getDate() - amount);
              break;
          }
          
          return reminderTime;
        }
        return null;
    }
  }

  // Get the reminder message text
  static getReminderMessage(event, reminderId) {
    const childName = event.childName || 'your child';
    const eventTime = this.formatEventTime(event);
    
    switch (reminderId) {
      case 'at_time':
        return `${childName}'s event "${event.title}" is starting now! ${eventTime}`;
      case '5_min':
        return `${childName}'s event "${event.title}" starts in 5 minutes. ${eventTime}`;
      case '15_min':
        return `${childName}'s event "${event.title}" starts in 15 minutes. ${eventTime}`;
      case '30_min':
        return `${childName}'s event "${event.title}" starts in 30 minutes. ${eventTime}`;
      case '1_hour':
        return `${childName}'s event "${event.title}" starts in 1 hour. ${eventTime}`;
      case '1_day':
        return `Don't forget: ${childName}'s event "${event.title}" is tomorrow. ${eventTime}`;
      default:
        if (reminderId.startsWith('custom_')) {
          const parts = reminderId.replace('custom_', '').split('_');
          const amount = parts[0];
          const unit = parts[1];
          return `${childName}'s event "${event.title}" starts in ${amount} ${unit}. ${eventTime}`;
        }
        return `Reminder: ${childName}'s event "${event.title}" ${eventTime}`;
    }
  }

  // Format event time for display in notifications
  static formatEventTime(event) {
    if (event.isAllDay) {
      return 'All day event';
    } else {
      const startTime = new Date(event.startDateTime);
      return startTime.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
    }
  }

  // Get all scheduled notifications (for debugging)
  static async getScheduledNotifications() {
    try {
      return await Notifications.getAllScheduledNotificationsAsync();
    } catch (error) {
      console.error('Error getting scheduled notifications:', error);
      return [];
    }
  }

  // Cancel all notifications
  static async cancelAllNotifications() {
    try {
      await Notifications.cancelAllScheduledNotificationsAsync();
      return true;
    } catch (error) {
      console.error('Error canceling all notifications:', error);
      return false;
    }
  }
}

export default NotificationService;