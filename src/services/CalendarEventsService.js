import AsyncStorage from '@react-native-async-storage/async-storage';
import { formatLocalDateString } from '../utils/dateUtils';
import NotificationService from './NotificationService';
import DataNamespacing from '../utils/dataNamespacing';

const CALENDAR_EVENTS_STORAGE_KEY = 'calendar-tasks.json';

class CalendarEventsService {
  // Get all calendar events from storage
  static async getEvents() {
    try {
      return await DataNamespacing.getUserData(CALENDAR_EVENTS_STORAGE_KEY, []);
    } catch (error) {
      console.error('Error loading calendar events:', error);
      return [];
    }
  }

  // Save events array to storage
  static async saveEvents(events) {
    try {
      return await DataNamespacing.setUserData(CALENDAR_EVENTS_STORAGE_KEY, events);
    } catch (error) {
      console.error('Error saving calendar events:', error);
      return false;
    }
  }

  // Add a new event
  static async addEvent(eventData) {
    try {
      const events = await this.getEvents();
      const newEvent = {
        id: Date.now().toString(),
        ...eventData,
        // Handle multi-child support with backward compatibility
        children: eventData.selectedChildren || eventData.children || [],
        // Maintain legacy fields for compatibility
        childId: eventData.selectedChildren?.[0]?.id || eventData.childId,
        childName: eventData.selectedChildren?.[0]?.name || eventData.childName,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      
      // Clean up selectedChildren from the stored event data
      delete newEvent.selectedChildren;
      
      events.push(newEvent);
      const success = await this.saveEvents(events);

      if (success) {
        // Schedule reminders for the new event
        try {
          await NotificationService.scheduleEventReminders(newEvent);
        } catch (error) {
          console.warn('Failed to schedule reminders for event:', error);
        }
        return newEvent;
      }

      return null;
    } catch (error) {
      console.error('Error adding event:', error);
      return null;
    }
  }

  // Add multi-date event with linked occurrences
  static async addMultiDateEvent(eventData, selectedDates) {
    try {
      if (!selectedDates || !Array.isArray(selectedDates) || selectedDates.length === 0) {
        throw new Error('Selected dates array is required for multi-date events');
      }

      const events = await this.getEvents();
      const multiDateId = `multi_${Date.now()}`;
      const createdEvents = [];

      // Sort dates to ensure proper occurrence ordering
      const sortedDates = [...selectedDates].sort((a, b) => new Date(a) - new Date(b));

      for (let i = 0; i < sortedDates.length; i++) {
        const date = sortedDates[i];
        let occurrenceType = 'single';
        
        if (sortedDates.length > 1) {
          if (i === 0) occurrenceType = 'first';
          else if (i === sortedDates.length - 1) occurrenceType = 'last';
          else occurrenceType = 'middle';
        }

        const eventId = `${multiDateId}_${i}`;
        const occurrence = {
          id: eventId,
          ...eventData,
          // Multi-date specific fields
          isMultiDate: true,
          multiDateId: multiDateId,
          occurrenceType: occurrenceType,
          occurrenceIndex: i,
          totalOccurrences: sortedDates.length,
          // Handle multi-child support with backward compatibility
          children: eventData.selectedChildren || eventData.children || [],
          // Maintain legacy fields for compatibility
          childId: eventData.selectedChildren?.[0]?.id || eventData.childId,
          childName: eventData.selectedChildren?.[0]?.name || eventData.childName,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        // Set date-specific fields based on event type
        if (eventData.isAllDay) {
          occurrence.startDate = formatLocalDateString(new Date(date));
          occurrence.endDate = eventData.endDate || occurrence.startDate;
        } else {
          // For timed events, use the selected date but preserve the time
          const startDateTime = new Date(eventData.startDateTime);
          const endDateTime = new Date(eventData.endDateTime);
          
          const eventDate = new Date(date);
          startDateTime.setFullYear(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate());
          endDateTime.setFullYear(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate());
          
          occurrence.startDateTime = startDateTime.toISOString();
          occurrence.endDateTime = endDateTime.toISOString();
        }

        // Clean up selectedChildren from the stored event data
        delete occurrence.selectedChildren;
        
        events.push(occurrence);
        createdEvents.push(occurrence);
      }

      const success = await this.saveEvents(events);

      if (success) {
        // Schedule reminders for all occurrences
        for (const event of createdEvents) {
          try {
            await NotificationService.scheduleEventReminders(event);
          } catch (error) {
            console.warn('Failed to schedule reminders for multi-date event occurrence:', error);
          }
        }
        return createdEvents;
      }

      return null;
    } catch (error) {
      console.error('Error adding multi-date event:', error);
      return null;
    }
  }

  // Update an existing event
  static async updateEvent(eventId, updatedData) {
    try {
      console.log('CalendarEventsService.updateEvent called with:', { eventId, updatedData });
      
      const events = await this.getEvents();
      console.log('Found', events.length, 'events in storage');
      
      const eventIndex = events.findIndex((event) => event.id === eventId);
      console.log('Event index:', eventIndex);

      if (eventIndex === -1) {
        console.error('Event not found with ID:', eventId);
        return null;
      }

      // Normalize the updated data to handle multi-child format
      const normalizedData = this.normalizeEventData(updatedData);

      const updatedEvent = {
        ...events[eventIndex],
        ...normalizedData,
        updatedAt: new Date().toISOString(),
      };

      events[eventIndex] = updatedEvent;
      console.log('Attempting to save updated event:', updatedEvent);
      
      const success = await this.saveEvents(events);
      console.log('Save operation success:', success);

      if (success) {
        // Update reminders for the event
        try {
          await NotificationService.scheduleEventReminders(updatedEvent);
        } catch (error) {
          console.warn('Failed to update reminders for event:', error);
        }
        console.log('Returning updated event:', updatedEvent);
        return updatedEvent;
      }

      console.error('Save operation failed');
      return null;
    } catch (error) {
      console.error('Error updating event:', error);
      return null;
    }
  }

  // Update a single occurrence of a multi-date event
  static async updateMultiDateEventOccurrence(eventId, updatedData) {
    try {
      const events = await this.getEvents();
      const eventIndex = events.findIndex((event) => event.id === eventId);

      if (eventIndex === -1) {
        return false;
      }

      const originalEvent = events[eventIndex];
      
      // Verify this is a multi-date event
      if (!originalEvent.isMultiDate || !originalEvent.multiDateId) {
        throw new Error('Event is not a multi-date event');
      }

      // Normalize the updated data to handle multi-child format
      const normalizedData = this.normalizeEventData(updatedData);

      const updatedEvent = {
        ...originalEvent,
        ...normalizedData,
        // Preserve multi-date specific fields
        isMultiDate: originalEvent.isMultiDate,
        multiDateId: originalEvent.multiDateId,
        occurrenceType: originalEvent.occurrenceType,
        occurrenceIndex: originalEvent.occurrenceIndex,
        totalOccurrences: originalEvent.totalOccurrences,
        updatedAt: new Date().toISOString(),
      };

      events[eventIndex] = updatedEvent;
      const success = await this.saveEvents(events);

      if (success) {
        // Update reminders for this occurrence
        try {
          await NotificationService.scheduleEventReminders(updatedEvent);
        } catch (error) {
          console.warn('Failed to update reminders for event occurrence:', error);
        }
      }

      return success;
    } catch (error) {
      console.error('Error updating multi-date event occurrence:', error);
      return false;
    }
  }

  // Update all occurrences of a multi-date event
  static async updateAllMultiDateEventOccurrences(multiDateId, updatedData) {
    try {
      const events = await this.getEvents();
      const multiDateEvents = events.filter(event => event.multiDateId === multiDateId);

      if (multiDateEvents.length === 0) {
        return false;
      }

      // Normalize the updated data to handle multi-child format
      const normalizedData = this.normalizeEventData(updatedData);

      let updatedCount = 0;
      
      for (let i = 0; i < events.length; i++) {
        if (events[i].multiDateId === multiDateId) {
          const originalEvent = events[i];
          
          events[i] = {
            ...originalEvent,
            ...normalizedData,
            // Preserve multi-date specific fields and date/time fields
            isMultiDate: originalEvent.isMultiDate,
            multiDateId: originalEvent.multiDateId,
            occurrenceType: originalEvent.occurrenceType,
            occurrenceIndex: originalEvent.occurrenceIndex,
            totalOccurrences: originalEvent.totalOccurrences,
            // Preserve date-specific fields (don't update dates when editing all)
            startDate: originalEvent.startDate,
            endDate: originalEvent.endDate,
            startDateTime: originalEvent.startDateTime,
            endDateTime: originalEvent.endDateTime,
            updatedAt: new Date().toISOString(),
          };
          updatedCount++;
        }
      }

      const success = await this.saveEvents(events);

      if (success) {
        // Update reminders for all occurrences
        const updatedEvents = events.filter(event => event.multiDateId === multiDateId);
        for (const event of updatedEvents) {
          try {
            await NotificationService.scheduleEventReminders(event);
          } catch (error) {
            console.warn('Failed to update reminders for multi-date event occurrence:', error);
          }
        }
      }

      return success;
    } catch (error) {
      console.error('Error updating all multi-date event occurrences:', error);
      return false;
    }
  }

  // Delete an event
  static async deleteEvent(eventId) {
    try {
      // Cancel reminders for the event before deleting
      try {
        await NotificationService.cancelEventReminders(eventId);
      } catch (error) {
        console.warn('Failed to cancel reminders for deleted event:', error);
      }

      const events = await this.getEvents();
      const filteredEvents = events.filter((event) => event.id !== eventId);
      return await this.saveEvents(filteredEvents);
    } catch (error) {
      console.error('Error deleting event:', error);
      return false;
    }
  }

  // Delete a single occurrence of a multi-date event
  static async deleteMultiDateEventOccurrence(eventId) {
    try {
      const events = await this.getEvents();
      const eventToDelete = events.find(event => event.id === eventId);

      if (!eventToDelete) {
        return false;
      }

      // Verify this is a multi-date event
      if (!eventToDelete.isMultiDate || !eventToDelete.multiDateId) {
        throw new Error('Event is not a multi-date event');
      }

      // Cancel reminders for this occurrence
      try {
        await NotificationService.cancelEventReminders(eventId);
      } catch (error) {
        console.warn('Failed to cancel reminders for deleted event occurrence:', error);
      }

      // Remove this occurrence
      const filteredEvents = events.filter(event => event.id !== eventId);

      // Update occurrence indices and types for remaining events
      const remainingOccurrences = filteredEvents
        .filter(event => event.multiDateId === eventToDelete.multiDateId)
        .sort((a, b) => a.occurrenceIndex - b.occurrenceIndex);

      // Update occurrence metadata for remaining events
      for (let i = 0; i < remainingOccurrences.length; i++) {
        const event = remainingOccurrences[i];
        event.occurrenceIndex = i;
        event.totalOccurrences = remainingOccurrences.length;
        
        // Update occurrence type
        if (remainingOccurrences.length === 1) {
          event.occurrenceType = 'single';
          // If only one occurrence remains, it's no longer a multi-date event
          event.isMultiDate = false;
          delete event.multiDateId;
          delete event.occurrenceIndex;
          delete event.totalOccurrences;
        } else {
          if (i === 0) event.occurrenceType = 'first';
          else if (i === remainingOccurrences.length - 1) event.occurrenceType = 'last';
          else event.occurrenceType = 'middle';
        }
        
        event.updatedAt = new Date().toISOString();
      }

      return await this.saveEvents(filteredEvents);
    } catch (error) {
      console.error('Error deleting multi-date event occurrence:', error);
      return false;
    }
  }

  // Delete all occurrences of a multi-date event
  static async deleteAllMultiDateEventOccurrences(multiDateId) {
    try {
      const events = await this.getEvents();
      const multiDateEvents = events.filter(event => event.multiDateId === multiDateId);

      if (multiDateEvents.length === 0) {
        return false;
      }

      // Cancel reminders for all occurrences
      for (const event of multiDateEvents) {
        try {
          await NotificationService.cancelEventReminders(event.id);
        } catch (error) {
          console.warn('Failed to cancel reminders for deleted multi-date event occurrence:', error);
        }
      }

      // Remove all occurrences
      const filteredEvents = events.filter(event => event.multiDateId !== multiDateId);
      return await this.saveEvents(filteredEvents);
    } catch (error) {
      console.error('Error deleting all multi-date event occurrences:', error);
      return false;
    }
  }

  // Get a specific event by ID
  static async getEventById(eventId) {
    try {
      const events = await this.getEvents();
      return events.find((event) => event.id === eventId) || null;
    } catch (error) {
      console.error('Error getting event by ID:', error);
      return null;
    }
  }

  // Get events for a specific date
  static async getEventsForDate(date) {
    try {
      const events = await this.getEvents();
      const dateString = formatLocalDateString(date);

      return events.filter((event) => {
        if (event.isAllDay) {
          return event.startDate === dateString;
        } else {
          // For timed events, get the local date without timezone conversion
          const eventStartDate = new Date(event.startDateTime);
          const eventEndDate = new Date(event.endDateTime);

          const eventStartDateString = formatLocalDateString(eventStartDate);
          const eventEndDateString = formatLocalDateString(eventEndDate);

          return (
            dateString >= eventStartDateString &&
            dateString <= eventEndDateString
          );
        }
      });
    } catch (error) {
      console.error('Error getting events for date:', error);
      return [];
    }
  }

  // Get events for a specific child
  static async getEventsForChild(childId) {
    try {
      const events = await this.getEvents();
      return events.filter((event) => {
        // Check both new children array and legacy childId field
        if (event.children && event.children.length > 0) {
          return event.children.some(child => child.id === childId);
        }
        // Fallback to legacy childId field
        return event.childId === childId;
      });
    } catch (error) {
      console.error('Error getting events for child:', error);
      return [];
    }
  }

  // Get events within a date range
  static async getEventsInRange(startDate, endDate) {
    try {
      const events = await this.getEvents();
      const startDateString = formatLocalDateString(startDate);
      const endDateString = formatLocalDateString(endDate);

      return events.filter((event) => {
        if (event.isAllDay) {
          return (
            event.startDate >= startDateString &&
            event.startDate <= endDateString
          );
        } else {
          // For timed events, get the local date without timezone conversion
          const eventStartDate = new Date(event.startDateTime);
          const eventEndDate = new Date(event.endDateTime);

          const eventStartDateString = formatLocalDateString(eventStartDate);
          const eventEndDateString = formatLocalDateString(eventEndDate);

          return (
            eventStartDateString <= endDateString &&
            eventEndDateString >= startDateString
          );
        }
      });
    } catch (error) {
      console.error('Error getting events in range:', error);
      return [];
    }
  }

  // Helper method to get children from an event (handles both legacy and new formats)
  static getEventChildren(event) {
    try {
      // Validate event object
      if (!event || typeof event !== 'object') {
        console.warn('Invalid event object provided to getEventChildren:', event);
        return [];
      }

      // Return new format children array if available and valid
      if (event.children && Array.isArray(event.children) && event.children.length > 0) {
        // Validate and sanitize children data
        const validChildren = event.children.filter(child => {
          if (!child || typeof child !== 'object') {
            console.warn('Invalid child object in event children:', child);
            return false;
          }
          return child.id && child.name;
        }).map(child => ({
          id: child.id,
          name: child.name,
          color: child.color || '#48b6b0' // Provide fallback color
        }));

        if (validChildren.length > 0) {
          return validChildren;
        }
      }
      
      // Fallback to legacy single child format
      if (event.childId) {
        return [{
          id: event.childId,
          name: event.childName || 'Unknown Child',
          color: '#48b6b0' // Default color for legacy events
        }];
      }
      
      // Return empty array if no valid children found
      console.warn('No valid children found for event:', event.id || 'unknown');
      return [];
    } catch (error) {
      console.error('Error getting event children:', error);
      return [];
    }
  }

  // Helper method to convert legacy event to new multi-child format
  static convertLegacyEventToMultiChild(event, childrenData = []) {
    // If already has children array, return as-is
    if (event.children && event.children.length > 0) {
      return event;
    }

    // Convert legacy single child to children array
    if (event.childId) {
      const childData = childrenData.find(child => child.id === event.childId);
      const convertedEvent = {
        ...event,
        children: [{
          id: event.childId,
          name: event.childName || childData?.nickname || childData?.firstName || 'Unknown Child',
          color: childData?.favourColor || '#48b6b0'
        }]
      };
      return convertedEvent;
    }

    return event;
  }

  // Migration method to handle legacy events when they are edited
  static async migrateEventToMultiChild(eventId, childrenData = []) {
    try {
      const events = await this.getEvents();
      const eventIndex = events.findIndex(event => event.id === eventId);
      
      if (eventIndex === -1) {
        console.warn(`Event with ID ${eventId} not found for migration`);
        return null;
      }

      const event = events[eventIndex];
      
      // Validate event data before migration
      if (!event || typeof event !== 'object') {
        console.error('Invalid event data found during migration:', event);
        return null;
      }
      
      // Only migrate if it's a legacy event (has childId but no children array)
      if (event.childId && (!event.children || event.children.length === 0)) {
        try {
          const migratedEvent = this.convertLegacyEventToMultiChild(event, childrenData);
          
          // Validate migrated event
          if (!migratedEvent || !migratedEvent.children || migratedEvent.children.length === 0) {
            console.error('Migration failed - no valid children after conversion');
            return event; // Return original event if migration fails
          }
          
          // Update the event in storage
          events[eventIndex] = {
            ...migratedEvent,
            updatedAt: new Date().toISOString()
          };
          
          const success = await this.saveEvents(events);
          if (!success) {
            console.error('Failed to save migrated event to storage');
            return event; // Return original event if save fails
          }
          
          console.log(`Successfully migrated event ${eventId} to multi-child format`);
          return events[eventIndex];
        } catch (migrationError) {
          console.error('Error during event migration process:', migrationError);
          return event; // Return original event if migration process fails
        }
      }
      
      return event; // Return unchanged if already migrated or no migration needed
    } catch (error) {
      console.error('Error migrating event to multi-child format:', error);
      return null;
    }
  }

  // Helper method to ensure backward compatibility when updating events
  static normalizeEventData(eventData) {
    try {
      const normalized = { ...eventData };

      // If selectedChildren is provided, convert to children array and set legacy fields
      if (eventData.selectedChildren && Array.isArray(eventData.selectedChildren) && eventData.selectedChildren.length > 0) {
        // Validate and sanitize selected children
        const validChildren = eventData.selectedChildren.filter(child => 
          child && typeof child === 'object' && child.id && child.name
        ).map(child => ({
          id: child.id,
          name: child.name,
          color: child.color || '#48b6b0'
        }));

        if (validChildren.length > 0) {
          normalized.children = validChildren;
          normalized.childId = validChildren[0].id;
          normalized.childName = validChildren[0].name;
        }
        delete normalized.selectedChildren;
      }

      // If children array exists but no legacy fields, set them from first child
      if (normalized.children && Array.isArray(normalized.children) && normalized.children.length > 0 && !normalized.childId) {
        const firstValidChild = normalized.children.find(child => 
          child && typeof child === 'object' && child.id && child.name
        );
        
        if (firstValidChild) {
          normalized.childId = firstValidChild.id;
          normalized.childName = firstValidChild.name;
        }
      }

      return normalized;
    } catch (error) {
      console.error('Error normalizing event data:', error);
      return eventData; // Return original data if normalization fails
    }
  }

  // Method to validate and repair corrupted event data
  static validateAndRepairEvent(event) {
    try {
      if (!event || typeof event !== 'object') {
        console.warn('Invalid event object provided for validation');
        return null;
      }

      const repairedEvent = { ...event };

      // Ensure required fields exist
      if (!repairedEvent.id) {
        repairedEvent.id = Date.now().toString() + '_repaired';
        console.warn('Event missing ID, generated new ID:', repairedEvent.id);
      }

      if (!repairedEvent.title || typeof repairedEvent.title !== 'string') {
        repairedEvent.title = 'Untitled Event';
        console.warn('Event missing or invalid title, set to default');
      }

      if (!repairedEvent.eventType || typeof repairedEvent.eventType !== 'string') {
        repairedEvent.eventType = 'Personal';
        console.warn('Event missing or invalid eventType, set to Personal');
      }

      // Validate and repair children data
      const eventChildren = this.getEventChildren(repairedEvent);
      if (eventChildren.length === 0) {
        console.warn('Event has no valid children, marking as corrupted');
        repairedEvent._corrupted = true;
        repairedEvent._corruptionReason = 'No valid children found';
      } else {
        // Update children array with validated data
        repairedEvent.children = eventChildren;
        if (!repairedEvent.childId && eventChildren.length > 0) {
          repairedEvent.childId = eventChildren[0].id;
          repairedEvent.childName = eventChildren[0].name;
        }
      }

      // Validate multi-date event fields
      if (repairedEvent.isMultiDate) {
        if (!repairedEvent.multiDateId) {
          console.warn('Multi-date event missing multiDateId');
          repairedEvent._corrupted = true;
          repairedEvent._corruptionReason = 'Multi-date event missing multiDateId';
        }
        
        if (typeof repairedEvent.occurrenceIndex !== 'number' || repairedEvent.occurrenceIndex < 0) {
          console.warn('Multi-date event has invalid occurrenceIndex');
          repairedEvent._corrupted = true;
          repairedEvent._corruptionReason = 'Invalid occurrence index';
        }
        
        if (typeof repairedEvent.totalOccurrences !== 'number' || repairedEvent.totalOccurrences < 1) {
          console.warn('Multi-date event has invalid totalOccurrences');
          repairedEvent._corrupted = true;
          repairedEvent._corruptionReason = 'Invalid total occurrences';
        }
        
        const validOccurrenceTypes = ['single', 'first', 'middle', 'last'];
        if (!validOccurrenceTypes.includes(repairedEvent.occurrenceType)) {
          console.warn('Multi-date event has invalid occurrenceType');
          repairedEvent._corrupted = true;
          repairedEvent._corruptionReason = 'Invalid occurrence type';
        }
      }

      // Validate date/time fields
      if (repairedEvent.isAllDay) {
        if (!repairedEvent.startDate) {
          console.warn('All-day event missing startDate');
          repairedEvent._corrupted = true;
          repairedEvent._corruptionReason = 'Missing start date';
        }
      } else {
        if (!repairedEvent.startDateTime || !repairedEvent.endDateTime) {
          console.warn('Timed event missing date-time fields');
          repairedEvent._corrupted = true;
          repairedEvent._corruptionReason = 'Missing date-time fields';
        } else {
          // Validate date-time format
          const startDate = new Date(repairedEvent.startDateTime);
          const endDate = new Date(repairedEvent.endDateTime);
          
          if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
            console.warn('Event has invalid date-time format');
            repairedEvent._corrupted = true;
            repairedEvent._corruptionReason = 'Invalid date-time format';
          }
        }
      }

      // Add repair timestamp
      if (repairedEvent._corrupted) {
        repairedEvent._repairedAt = new Date().toISOString();
      }

      return repairedEvent;
    } catch (error) {
      console.error('Error validating and repairing event:', error);
      return {
        ...event,
        _corrupted: true,
        _corruptionReason: 'Validation error: ' + error.message,
        _repairedAt: new Date().toISOString()
      };
    }
  }

  // Get all occurrences of a multi-date event
  static async getMultiDateEventOccurrences(multiDateId) {
    try {
      const events = await this.getEvents();
      return events
        .filter(event => event.multiDateId === multiDateId)
        .sort((a, b) => a.occurrenceIndex - b.occurrenceIndex);
    } catch (error) {
      console.error('Error getting multi-date event occurrences:', error);
      return [];
    }
  }

  // Check if an event is part of a multi-date series
  static isMultiDateEvent(event) {
    return event && event.isMultiDate === true && event.multiDateId;
  }

  // Get the next occurrence of a multi-date event
  static async getNextMultiDateOccurrence(eventId) {
    try {
      const events = await this.getEvents();
      const currentEvent = events.find(event => event.id === eventId);
      
      if (!currentEvent || !this.isMultiDateEvent(currentEvent)) {
        return null;
      }

      const allOccurrences = events
        .filter(event => event.multiDateId === currentEvent.multiDateId)
        .sort((a, b) => a.occurrenceIndex - b.occurrenceIndex);

      const currentIndex = allOccurrences.findIndex(event => event.id === eventId);
      
      if (currentIndex === -1 || currentIndex === allOccurrences.length - 1) {
        return null; // No next occurrence
      }

      return allOccurrences[currentIndex + 1];
    } catch (error) {
      console.error('Error getting next multi-date occurrence:', error);
      return null;
    }
  }

  // Get the previous occurrence of a multi-date event
  static async getPreviousMultiDateOccurrence(eventId) {
    try {
      const events = await this.getEvents();
      const currentEvent = events.find(event => event.id === eventId);
      
      if (!currentEvent || !this.isMultiDateEvent(currentEvent)) {
        return null;
      }

      const allOccurrences = events
        .filter(event => event.multiDateId === currentEvent.multiDateId)
        .sort((a, b) => a.occurrenceIndex - b.occurrenceIndex);

      const currentIndex = allOccurrences.findIndex(event => event.id === eventId);
      
      if (currentIndex <= 0) {
        return null; // No previous occurrence
      }

      return allOccurrences[currentIndex - 1];
    } catch (error) {
      console.error('Error getting previous multi-date occurrence:', error);
      return null;
    }
  }

  // Validate multi-date event data integrity
  static async validateMultiDateEventIntegrity(multiDateId) {
    try {
      const occurrences = await this.getMultiDateEventOccurrences(multiDateId);
      
      if (occurrences.length === 0) {
        return { valid: false, errors: ['No occurrences found'] };
      }

      const errors = [];
      
      // Check occurrence indices are sequential
      for (let i = 0; i < occurrences.length; i++) {
        if (occurrences[i].occurrenceIndex !== i) {
          errors.push(`Occurrence index mismatch at position ${i}`);
        }
      }

      // Check total occurrences count
      const expectedTotal = occurrences.length;
      for (const occurrence of occurrences) {
        if (occurrence.totalOccurrences !== expectedTotal) {
          errors.push(`Total occurrences mismatch for occurrence ${occurrence.id}`);
        }
      }

      // Check occurrence types
      if (occurrences.length === 1) {
        if (occurrences[0].occurrenceType !== 'single') {
          errors.push('Single occurrence should have type "single"');
        }
      } else {
        if (occurrences[0].occurrenceType !== 'first') {
          errors.push('First occurrence should have type "first"');
        }
        if (occurrences[occurrences.length - 1].occurrenceType !== 'last') {
          errors.push('Last occurrence should have type "last"');
        }
        for (let i = 1; i < occurrences.length - 1; i++) {
          if (occurrences[i].occurrenceType !== 'middle') {
            errors.push(`Middle occurrence ${i} should have type "middle"`);
          }
        }
      }

      return {
        valid: errors.length === 0,
        errors: errors,
        occurrenceCount: occurrences.length
      };
    } catch (error) {
      console.error('Error validating multi-date event integrity:', error);
      return {
        valid: false,
        errors: ['Validation error: ' + error.message],
        occurrenceCount: 0
      };
    }
  }

  // Repair multi-date event integrity issues
  static async repairMultiDateEventIntegrity(multiDateId) {
    try {
      const events = await this.getEvents();
      const occurrences = events
        .filter(event => event.multiDateId === multiDateId)
        .sort((a, b) => {
          // Sort by date first, then by occurrence index as fallback
          const dateA = event.isAllDay ? new Date(a.startDate) : new Date(a.startDateTime);
          const dateB = event.isAllDay ? new Date(b.startDate) : new Date(b.startDateTime);
          return dateA - dateB || a.occurrenceIndex - b.occurrenceIndex;
        });

      if (occurrences.length === 0) {
        return false;
      }

      // Update occurrence metadata
      for (let i = 0; i < occurrences.length; i++) {
        const occurrence = occurrences[i];
        occurrence.occurrenceIndex = i;
        occurrence.totalOccurrences = occurrences.length;
        
        if (occurrences.length === 1) {
          occurrence.occurrenceType = 'single';
        } else {
          if (i === 0) occurrence.occurrenceType = 'first';
          else if (i === occurrences.length - 1) occurrence.occurrenceType = 'last';
          else occurrence.occurrenceType = 'middle';
        }
        
        occurrence.updatedAt = new Date().toISOString();
      }

      return await this.saveEvents(events);
    } catch (error) {
      console.error('Error repairing multi-date event integrity:', error);
      return false;
    }
  }

  // Data migration for existing events to support multi-date fields
  static async migrateEventsToMultiDateSupport() {
    try {
      const events = await this.getEvents();
      let migratedCount = 0;
      let alreadyMigratedCount = 0;

      const migratedEvents = events.map(event => {
        // Check if event already has multi-date fields
        if (event.hasOwnProperty('isMultiDate')) {
          alreadyMigratedCount++;
          return event;
        }

        // Add multi-date fields to existing events
        const migratedEvent = {
          ...event,
          // Default values for new multi-date fields
          isMultiDate: false,
          // multiDateId and occurrenceType are undefined for single events
          // occurrenceIndex and totalOccurrences are undefined for single events
        };

        migratedCount++;
        return migratedEvent;
      });

      if (migratedCount > 0) {
        const success = await this.saveEvents(migratedEvents);
        if (success) {
          console.log(`Successfully migrated ${migratedCount} events to support multi-date fields`);
          return {
            success: true,
            migratedCount,
            alreadyMigratedCount,
            totalEvents: events.length
          };
        } else {
          console.error('Failed to save migrated events');
          return {
            success: false,
            error: 'Failed to save migrated events',
            migratedCount: 0,
            alreadyMigratedCount,
            totalEvents: events.length
          };
        }
      }

      console.log(`All ${events.length} events already support multi-date fields`);
      return {
        success: true,
        migratedCount: 0,
        alreadyMigratedCount,
        totalEvents: events.length
      };
    } catch (error) {
      console.error('Error migrating events to multi-date support:', error);
      return {
        success: false,
        error: error.message,
        migratedCount: 0,
        alreadyMigratedCount: 0,
        totalEvents: 0
      };
    }
  }

  // Validate multi-date event data structure
  static validateMultiDateEventData(eventData) {
    const errors = [];

    if (!eventData || typeof eventData !== 'object') {
      errors.push('Event data must be an object');
      return { valid: false, errors };
    }

    // If isMultiDate is true, validate required multi-date fields
    if (eventData.isMultiDate === true) {
      if (!eventData.multiDateId || typeof eventData.multiDateId !== 'string') {
        errors.push('Multi-date events must have a valid multiDateId string');
      }

      if (typeof eventData.occurrenceIndex !== 'number' || eventData.occurrenceIndex < 0) {
        errors.push('Multi-date events must have a valid occurrenceIndex (number >= 0)');
      }

      if (typeof eventData.totalOccurrences !== 'number' || eventData.totalOccurrences < 1) {
        errors.push('Multi-date events must have a valid totalOccurrences (number >= 1)');
      }

      const validOccurrenceTypes = ['single', 'first', 'middle', 'last'];
      if (!validOccurrenceTypes.includes(eventData.occurrenceType)) {
        errors.push('Multi-date events must have a valid occurrenceType (single, first, middle, or last)');
      }

      // Validate occurrence type matches position
      if (eventData.totalOccurrences === 1 && eventData.occurrenceType !== 'single') {
        errors.push('Single occurrence events must have occurrenceType "single"');
      }

      if (eventData.totalOccurrences > 1) {
        if (eventData.occurrenceIndex === 0 && eventData.occurrenceType !== 'first') {
          errors.push('First occurrence must have occurrenceType "first"');
        }
        if (eventData.occurrenceIndex === eventData.totalOccurrences - 1 && eventData.occurrenceType !== 'last') {
          errors.push('Last occurrence must have occurrenceType "last"');
        }
        if (eventData.occurrenceIndex > 0 && eventData.occurrenceIndex < eventData.totalOccurrences - 1 && eventData.occurrenceType !== 'middle') {
          errors.push('Middle occurrences must have occurrenceType "middle"');
        }
      }
    } else if (eventData.isMultiDate === false) {
      // Single events should not have multi-date fields
      if (eventData.multiDateId !== undefined) {
        errors.push('Single events should not have multiDateId field');
      }
      if (eventData.occurrenceIndex !== undefined) {
        errors.push('Single events should not have occurrenceIndex field');
      }
      if (eventData.totalOccurrences !== undefined) {
        errors.push('Single events should not have totalOccurrences field');
      }
      if (eventData.occurrenceType !== undefined) {
        errors.push('Single events should not have occurrenceType field');
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  // Helper function to generate multi-date event ID
  static generateMultiDateId() {
    return `multi_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Helper function to determine occurrence type based on position
  static determineOccurrenceType(index, total) {
    if (total === 1) return 'single';
    if (index === 0) return 'first';
    if (index === total - 1) return 'last';
    return 'middle';
  }

  // Helper function to validate multi-date event dates
  static validateMultiDateEventDates(dates) {
    const errors = [];

    if (!Array.isArray(dates)) {
      errors.push('Dates must be provided as an array');
      return { valid: false, errors };
    }

    if (dates.length === 0) {
      errors.push('At least one date must be provided');
      return { valid: false, errors };
    }

    // Validate each date
    const validDates = [];
    dates.forEach((date, index) => {
      const dateObj = new Date(date);
      if (isNaN(dateObj.getTime())) {
        errors.push(`Invalid date at index ${index}: ${date}`);
      } else {
        validDates.push(dateObj);
      }
    });

    // Check for duplicate dates
    const uniqueDates = new Set(validDates.map(date => date.toDateString()));
    if (uniqueDates.size !== validDates.length) {
      errors.push('Duplicate dates are not allowed in multi-date events');
    }

    return {
      valid: errors.length === 0,
      errors,
      validDates: validDates.sort((a, b) => a - b)
    };
  }

  // Method to clean up corrupted events from storage
  static async cleanupCorruptedEvents() {
    try {
      const events = await this.getEvents();
      const validEvents = [];
      const corruptedEvents = [];

      events.forEach(event => {
        const repairedEvent = this.validateAndRepairEvent(event);
        if (repairedEvent) {
          if (repairedEvent._corrupted) {
            corruptedEvents.push(repairedEvent);
          } else {
            validEvents.push(repairedEvent);
          }
        }
      });

      if (corruptedEvents.length > 0) {
        console.warn(`Found ${corruptedEvents.length} corrupted events:`, corruptedEvents.map(e => ({
          id: e.id,
          title: e.title,
          reason: e._corruptionReason
        })));

        // Save only valid events
        await this.saveEvents(validEvents);
        
        return {
          cleaned: corruptedEvents.length,
          remaining: validEvents.length,
          corruptedEvents: corruptedEvents
        };
      }

      return {
        cleaned: 0,
        remaining: validEvents.length,
        corruptedEvents: []
      };
    } catch (error) {
      console.error('Error cleaning up corrupted events:', error);
      return {
        cleaned: 0,
        remaining: 0,
        corruptedEvents: [],
        error: error.message
      };
    }
  }
}

export default CalendarEventsService;
