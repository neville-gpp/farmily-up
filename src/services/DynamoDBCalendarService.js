import { DynamoDBService } from './DynamoDBService';
import AuthenticationService from './AuthenticationService';
import { formatLocalDateString } from '../utils/dateUtils';
import NotificationService from './NotificationService';
import { DYNAMODB_TABLES } from '../config/aws-config.js';

/**
 * DynamoDB-enabled Calendar Events Service
 * Provides CRUD operations for calendar events using DynamoDB as the backend
 * Maintains compatibility with the existing CalendarEventsService interface
 */
class DynamoDBCalendarService {
  static TABLE_NAME = DYNAMODB_TABLES.CALENDAR_EVENTS;
  
  // GSI names for efficient querying
  static DATE_INDEX = 'userId-startDate-index';
  static CHILD_INDEX = 'userId-childId-index';
  
  // Required fields for event validation
  static REQUIRED_FIELDS = ['title', 'eventType'];
  
  // Valid event types
  static VALID_EVENT_TYPES = [
    'Personal', 'Medical', 'School', 'Sports', 'Social', 'Family', 'Other'
  ];
  
  // Valid occurrence types for multi-date events
  static VALID_OCCURRENCE_TYPES = ['single', 'first', 'middle', 'last'];

  /**
   * Get current authenticated user ID
   * @private
   * @returns {Promise<string>} User ID
   * @throws {Error} If user is not authenticated
   */
  static async _getCurrentUserId() {
    const user = await AuthenticationService.getCurrentUser();
    if (!user || !user.id) {
      throw new Error('User not authenticated');
    }
    return user.id;
  }

  /**
   * Validate event data before saving
   * @private
   * @param {Object} eventData - Event data to validate
   * @throws {Error} If validation fails
   */
  static _validateEventData(eventData) {
    // Check required fields
    DynamoDBService.validateRequiredFields(eventData, this.REQUIRED_FIELDS);
    
    // Validate title is not empty string
    if (typeof eventData.title !== 'string' || eventData.title.trim() === '') {
      throw new Error('Title must be a non-empty string');
    }
    
    // Validate event type
    if (!this.VALID_EVENT_TYPES.includes(eventData.eventType)) {
      throw new Error(`Event type must be one of: ${this.VALID_EVENT_TYPES.join(', ')}`);
    }
    
    // Validate children array if provided
    if (eventData.children) {
      if (!Array.isArray(eventData.children)) {
        throw new Error('Children must be an array');
      }
      
      eventData.children.forEach((child, index) => {
        if (!child || typeof child !== 'object') {
          throw new Error(`Child at index ${index} must be an object`);
        }
        if (!child.id || !child.name) {
          throw new Error(`Child at index ${index} must have id and name`);
        }
      });
    }
    
    // Validate date/time fields based on event type
    if (eventData.isAllDay) {
      if (!eventData.startDate) {
        throw new Error('All-day events must have a startDate');
      }
      
      // Validate date format (YYYY-MM-DD)
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(eventData.startDate)) {
        throw new Error('Start date must be in YYYY-MM-DD format');
      }
      
      if (eventData.endDate && !dateRegex.test(eventData.endDate)) {
        throw new Error('End date must be in YYYY-MM-DD format');
      }
    } else {
      if (!eventData.startDateTime || !eventData.endDateTime) {
        throw new Error('Timed events must have startDateTime and endDateTime');
      }
      
      // Validate date-time format
      const startDate = new Date(eventData.startDateTime);
      const endDate = new Date(eventData.endDateTime);
      
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        throw new Error('Invalid date-time format');
      }
      
      if (endDate <= startDate) {
        throw new Error('End date-time must be after start date-time');
      }
    }
    
    // Validate multi-date event fields
    if (eventData.isMultiDate) {
      if (!eventData.multiDateId) {
        throw new Error('Multi-date events must have a multiDateId');
      }
      
      if (!this.VALID_OCCURRENCE_TYPES.includes(eventData.occurrenceType)) {
        throw new Error(`Occurrence type must be one of: ${this.VALID_OCCURRENCE_TYPES.join(', ')}`);
      }
      
      if (typeof eventData.occurrenceIndex !== 'number' || eventData.occurrenceIndex < 0) {
        throw new Error('Occurrence index must be a non-negative number');
      }
      
      if (typeof eventData.totalOccurrences !== 'number' || eventData.totalOccurrences < 1) {
        throw new Error('Total occurrences must be a positive number');
      }
    }
  }

  /**
   * Prepare event data for storage by applying defaults and sanitization
   * @private
   * @param {Object} eventData - Raw event data
   * @returns {Object} Sanitized event data with defaults applied
   */
  static _prepareEventData(eventData) {
    const preparedData = {
      ...eventData,
      // Sanitize string fields
      title: eventData.title?.trim() || '',
      description: eventData.description?.trim() || '',
      eventType: eventData.eventType || 'Personal',
      // Set default values
      isAllDay: eventData.isAllDay || false,
      isMultiDate: eventData.isMultiDate || false,
      // Ensure children array is properly formatted
      children: eventData.children || [],
      // Set reminders default
      reminders: eventData.reminders || []
    };
    
    // Handle multi-child support with backward compatibility
    if (eventData.selectedChildren && Array.isArray(eventData.selectedChildren)) {
      preparedData.children = eventData.selectedChildren.map(child => ({
        id: child.id,
        name: child.name,
        color: child.color || '#48b6b0'
      }));
      delete preparedData.selectedChildren;
    }
    
    // Set legacy fields for backward compatibility
    if (preparedData.children.length > 0) {
      preparedData.childId = preparedData.children[0].id;
      preparedData.childName = preparedData.children[0].name;
    }
    
    return preparedData;
  }

  /**
   * Generate a sort key for efficient date-based queries
   * @private
   * @param {Object} eventData - Event data
   * @returns {string} Sort key for date-based indexing
   */
  static _generateDateSortKey(eventData) {
    if (eventData.isAllDay) {
      return eventData.startDate;
    } else {
      // Use ISO date part for timed events
      return new Date(eventData.startDateTime).toISOString().split('T')[0];
    }
  }

  /**
   * Get all calendar events for the current user
   * @returns {Promise<Array>} Array of event objects
   */
  static async getEvents() {
    try {
      const userId = await this._getCurrentUserId();
      
      const result = await DynamoDBService.queryItems(
        this.TABLE_NAME,
        'userId = :userId',
        {
          ExpressionAttributeValues: {
            ':userId': userId
          },
          ScanIndexForward: true // Sort by eventId ascending
        }
      );
      
      return result.items || [];
    } catch (error) {
      console.error('Error loading calendar events:', error);
      return [];
    }
  }

  /**
   * Save events array to storage (for backward compatibility)
   * @param {Array} events - Array of event objects
   * @returns {Promise<boolean>} Success status
   */
  static async saveEvents(events) {
    try {
      if (!Array.isArray(events)) {
        throw new Error('Events must be an array');
      }
      
      const userId = await this._getCurrentUserId();
      
      // Get existing events to determine which ones to delete
      const existingEvents = await this.getEvents();
      const existingEventIds = existingEvents.map(event => event.eventId || event.id);
      const newEventIds = events.map(event => event.eventId || event.id).filter(Boolean);
      
      // Find events to delete (exist in DB but not in new array)
      const eventsToDelete = existingEventIds.filter(id => !newEventIds.includes(id));
      
      // Delete removed events
      for (const eventId of eventsToDelete) {
        await this._deleteEventById(userId, eventId);
      }
      
      // Save or update each event
      for (const eventData of events) {
        if (eventData.eventId || eventData.id) {
          // Update existing event
          await this._updateEventById(userId, eventData.eventId || eventData.id, eventData);
        } else {
          // Create new event
          await this._createEvent(userId, eventData);
        }
      }
      
      return true;
    } catch (error) {
      console.error('Error saving calendar events:', error);
      return false;
    }
  }

  /**
   * Add a new event
   * @param {Object} eventData - Event data to add
   * @returns {Promise<Object|null>} Created event object or null if failed
   */
  static async addEvent(eventData) {
    try {
      const userId = await this._getCurrentUserId();
      const createdEvent = await this._createEvent(userId, eventData);
      
      if (createdEvent) {
        // Schedule reminders for the new event
        try {
          await NotificationService.scheduleEventReminders(createdEvent);
        } catch (error) {
          console.warn('Failed to schedule reminders for event:', error);
        }
      }
      
      return createdEvent;
    } catch (error) {
      console.error('Error adding event:', error);
      return null;
    }
  }

  /**
   * Add multi-date event with linked occurrences
   * @param {Object} eventData - Event data
   * @param {Array} selectedDates - Array of date strings
   * @returns {Promise<Array|null>} Array of created event objects or null if failed
   */
  static async addMultiDateEvent(eventData, selectedDates) {
    try {
      if (!selectedDates || !Array.isArray(selectedDates) || selectedDates.length === 0) {
        throw new Error('Selected dates array is required for multi-date events');
      }

      const userId = await this._getCurrentUserId();
      const multiDateId = this.generateMultiDateId();
      const createdEvents = [];

      // Sort dates to ensure proper occurrence ordering
      const sortedDates = [...selectedDates].sort((a, b) => new Date(a) - new Date(b));

      for (let i = 0; i < sortedDates.length; i++) {
        const date = sortedDates[i];
        const occurrenceType = this.determineOccurrenceType(i, sortedDates.length);

        const occurrenceData = {
          ...eventData,
          // Multi-date specific fields
          isMultiDate: true,
          multiDateId: multiDateId,
          occurrenceType: occurrenceType,
          occurrenceIndex: i,
          totalOccurrences: sortedDates.length
        };

        // Set date-specific fields based on event type
        if (eventData.isAllDay) {
          occurrenceData.startDate = formatLocalDateString(new Date(date));
          occurrenceData.endDate = eventData.endDate || occurrenceData.startDate;
        } else {
          // For timed events, use the selected date but preserve the time
          const startDateTime = new Date(eventData.startDateTime);
          const endDateTime = new Date(eventData.endDateTime);
          
          const eventDate = new Date(date);
          startDateTime.setFullYear(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate());
          endDateTime.setFullYear(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate());
          
          occurrenceData.startDateTime = startDateTime.toISOString();
          occurrenceData.endDateTime = endDateTime.toISOString();
        }

        const createdEvent = await this._createEvent(userId, occurrenceData);
        if (createdEvent) {
          createdEvents.push(createdEvent);
        }
      }

      if (createdEvents.length > 0) {
        // Schedule reminders for all occurrences
        for (const event of createdEvents) {
          try {
            await NotificationService.scheduleEventReminders(event);
          } catch (error) {
            console.warn('Failed to schedule reminders for multi-date event occurrence:', error);
          }
        }
      }

      return createdEvents.length > 0 ? createdEvents : null;
    } catch (error) {
      console.error('Error adding multi-date event:', error);
      return null;
    }
  }

  /**
   * Update an existing event
   * @param {string} eventId - Event ID to update
   * @param {Object} updatedData - Updated event data
   * @returns {Promise<Object|null>} Updated event object or null if failed
   */
  static async updateEvent(eventId, updatedData) {
    try {
      const userId = await this._getCurrentUserId();
      const updatedEvent = await this._updateEventById(userId, eventId, updatedData);
      
      if (updatedEvent) {
        // Update reminders for the event
        try {
          await NotificationService.scheduleEventReminders(updatedEvent);
        } catch (error) {
          console.warn('Failed to update reminders for event:', error);
        }
      }
      
      return updatedEvent;
    } catch (error) {
      console.error('Error updating event:', error);
      return null;
    }
  }

  /**
   * Update a single occurrence of a multi-date event
   * @param {string} eventId - Event ID to update
   * @param {Object} updatedData - Updated event data
   * @returns {Promise<boolean>} Success status
   */
  static async updateMultiDateEventOccurrence(eventId, updatedData) {
    try {
      const userId = await this._getCurrentUserId();
      const event = await this.getEventById(eventId);
      
      if (!event) {
        return false;
      }
      
      // Verify this is a multi-date event
      if (!event.isMultiDate || !event.multiDateId) {
        throw new Error('Event is not a multi-date event');
      }

      const normalizedData = this.normalizeEventData(updatedData);
      
      // Preserve multi-date specific fields
      const updateData = {
        ...normalizedData,
        isMultiDate: event.isMultiDate,
        multiDateId: event.multiDateId,
        occurrenceType: event.occurrenceType,
        occurrenceIndex: event.occurrenceIndex,
        totalOccurrences: event.totalOccurrences
      };

      const updatedEvent = await this._updateEventById(userId, eventId, updateData);
      
      if (updatedEvent) {
        // Update reminders for this occurrence
        try {
          await NotificationService.scheduleEventReminders(updatedEvent);
        } catch (error) {
          console.warn('Failed to update reminders for event occurrence:', error);
        }
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Error updating multi-date event occurrence:', error);
      return false;
    }
  }

  /**
   * Update all occurrences of a multi-date event
   * @param {string} multiDateId - Multi-date event ID
   * @param {Object} updatedData - Updated event data
   * @returns {Promise<boolean>} Success status
   */
  static async updateAllMultiDateEventOccurrences(multiDateId, updatedData) {
    try {
      const userId = await this._getCurrentUserId();
      const occurrences = await this.getMultiDateEventOccurrences(multiDateId);

      if (occurrences.length === 0) {
        return false;
      }

      const normalizedData = this.normalizeEventData(updatedData);
      let updatedCount = 0;

      for (const occurrence of occurrences) {
        const updateData = {
          ...normalizedData,
          // Preserve multi-date specific fields and date/time fields
          isMultiDate: occurrence.isMultiDate,
          multiDateId: occurrence.multiDateId,
          occurrenceType: occurrence.occurrenceType,
          occurrenceIndex: occurrence.occurrenceIndex,
          totalOccurrences: occurrence.totalOccurrences,
          // Preserve date-specific fields (don't update dates when editing all)
          startDate: occurrence.startDate,
          endDate: occurrence.endDate,
          startDateTime: occurrence.startDateTime,
          endDateTime: occurrence.endDateTime
        };

        const updatedEvent = await this._updateEventById(userId, occurrence.eventId || occurrence.id, updateData);
        if (updatedEvent) {
          updatedCount++;
          
          // Update reminders for this occurrence
          try {
            await NotificationService.scheduleEventReminders(updatedEvent);
          } catch (error) {
            console.warn('Failed to update reminders for multi-date event occurrence:', error);
          }
        }
      }

      return updatedCount > 0;
    } catch (error) {
      console.error('Error updating all multi-date event occurrences:', error);
      return false;
    }
  }

  /**
   * Delete an event
   * @param {string} eventId - Event ID to delete
   * @returns {Promise<boolean>} Success status
   */
  static async deleteEvent(eventId) {
    try {
      // Cancel reminders for the event before deleting
      try {
        await NotificationService.cancelEventReminders(eventId);
      } catch (error) {
        console.warn('Failed to cancel reminders for deleted event:', error);
      }

      const userId = await this._getCurrentUserId();
      await this._deleteEventById(userId, eventId);
      return true;
    } catch (error) {
      console.error('Error deleting event:', error);
      return false;
    }
  }

  /**
   * Delete a single occurrence of a multi-date event
   * @param {string} eventId - Event ID to delete
   * @returns {Promise<boolean>} Success status
   */
  static async deleteMultiDateEventOccurrence(eventId) {
    try {
      const event = await this.getEventById(eventId);

      if (!event) {
        return false;
      }

      // Verify this is a multi-date event
      if (!event.isMultiDate || !event.multiDateId) {
        throw new Error('Event is not a multi-date event');
      }

      // Cancel reminders for this occurrence
      try {
        await NotificationService.cancelEventReminders(eventId);
      } catch (error) {
        console.warn('Failed to cancel reminders for deleted event occurrence:', error);
      }

      const userId = await this._getCurrentUserId();
      await this._deleteEventById(userId, eventId);

      // Update occurrence indices and types for remaining events
      const remainingOccurrences = await this.getMultiDateEventOccurrences(event.multiDateId);

      // Update occurrence metadata for remaining events
      for (let i = 0; i < remainingOccurrences.length; i++) {
        const occurrence = remainingOccurrences[i];
        const updateData = {
          occurrenceIndex: i,
          totalOccurrences: remainingOccurrences.length,
          occurrenceType: this.determineOccurrenceType(i, remainingOccurrences.length)
        };
        
        // If only one occurrence remains, it's no longer a multi-date event
        if (remainingOccurrences.length === 1) {
          updateData.isMultiDate = false;
          updateData.multiDateId = null;
          updateData.occurrenceIndex = null;
          updateData.totalOccurrences = null;
          updateData.occurrenceType = 'single';
        }

        await this._updateEventById(userId, occurrence.eventId || occurrence.id, updateData);
      }

      return true;
    } catch (error) {
      console.error('Error deleting multi-date event occurrence:', error);
      return false;
    }
  }

  /**
   * Delete all occurrences of a multi-date event
   * @param {string} multiDateId - Multi-date event ID
   * @returns {Promise<boolean>} Success status
   */
  static async deleteAllMultiDateEventOccurrences(multiDateId) {
    try {
      const occurrences = await this.getMultiDateEventOccurrences(multiDateId);

      if (occurrences.length === 0) {
        return false;
      }

      const userId = await this._getCurrentUserId();

      // Cancel reminders for all occurrences
      for (const occurrence of occurrences) {
        try {
          await NotificationService.cancelEventReminders(occurrence.eventId || occurrence.id);
        } catch (error) {
          console.warn('Failed to cancel reminders for deleted multi-date event occurrence:', error);
        }
        
        await this._deleteEventById(userId, occurrence.eventId || occurrence.id);
      }

      return true;
    } catch (error) {
      console.error('Error deleting all multi-date event occurrences:', error);
      return false;
    }
  }

  /**
   * Get a specific event by ID
   * @param {string} eventId - Event ID to retrieve
   * @returns {Promise<Object|null>} Event object or null if not found
   */
  static async getEventById(eventId) {
    try {
      const userId = await this._getCurrentUserId();
      
      const event = await DynamoDBService.getItem(
        this.TABLE_NAME,
        {
          userId: userId,
          eventId: eventId
        }
      );
      
      return event;
    } catch (error) {
      console.error('Error getting event by ID:', error);
      return null;
    }
  }

  /**
   * Get events for a specific date
   * @param {Date} date - Date to get events for
   * @returns {Promise<Array>} Array of events for the date
   */
  static async getEventsForDate(date) {
    try {
      const userId = await this._getCurrentUserId();
      const dateString = formatLocalDateString(date);

      // Query using the date index
      const result = await DynamoDBService.queryItems(
        this.TABLE_NAME,
        'userId = :userId AND begins_with(startDate, :dateString)',
        {
          IndexName: this.DATE_INDEX,
          ExpressionAttributeValues: {
            ':userId': userId,
            ':dateString': dateString
          }
        }
      );

      const events = result.items || [];

      // Filter events more precisely for the exact date
      return events.filter((event) => {
        if (event.isAllDay) {
          return event.startDate === dateString;
        } else {
          // For timed events, check if the date falls within the event duration
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

  /**
   * Get events for a specific child
   * @param {string} childId - Child ID to get events for
   * @returns {Promise<Array>} Array of events for the child
   */
  static async getEventsForChild(childId) {
    try {
      const userId = await this._getCurrentUserId();

      // Query using the child index
      const result = await DynamoDBService.queryItems(
        this.TABLE_NAME,
        'userId = :userId AND childId = :childId',
        {
          IndexName: this.CHILD_INDEX,
          ExpressionAttributeValues: {
            ':userId': userId,
            ':childId': childId
          }
        }
      );

      const events = result.items || [];

      // Also check events that have the child in the children array but different primary childId
      const allEvents = await this.getEvents();
      const additionalEvents = allEvents.filter(event => {
        if (events.some(e => e.eventId === event.eventId)) {
          return false; // Already included
        }
        
        // Check if child is in the children array
        if (event.children && event.children.length > 0) {
          return event.children.some(child => child.id === childId);
        }
        
        return false;
      });

      return [...events, ...additionalEvents];
    } catch (error) {
      console.error('Error getting events for child:', error);
      return [];
    }
  }

  /**
   * Get events within a date range
   * @param {Date} startDate - Start date of range
   * @param {Date} endDate - End date of range
   * @returns {Promise<Array>} Array of events in the range
   */
  static async getEventsInRange(startDate, endDate) {
    try {
      const userId = await this._getCurrentUserId();
      const startDateString = formatLocalDateString(startDate);
      const endDateString = formatLocalDateString(endDate);

      // Query using the date index with range
      const result = await DynamoDBService.queryItems(
        this.TABLE_NAME,
        'userId = :userId AND startDate BETWEEN :startDate AND :endDate',
        {
          IndexName: this.DATE_INDEX,
          ExpressionAttributeValues: {
            ':userId': userId,
            ':startDate': startDateString,
            ':endDate': endDateString
          }
        }
      );

      const events = result.items || [];

      // Filter events more precisely for the date range
      return events.filter((event) => {
        if (event.isAllDay) {
          return (
            event.startDate >= startDateString &&
            event.startDate <= endDateString
          );
        } else {
          // For timed events, check if they overlap with the date range
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

  // Private helper methods for internal operations

  /**
   * Create a new event in DynamoDB
   * @private
   * @param {string} userId - User ID
   * @param {Object} eventData - Event data
   * @returns {Promise<Object>} Created event object
   */
  static async _createEvent(userId, eventData) {
    // Validate and prepare data
    this._validateEventData(eventData);
    const preparedData = this._prepareEventData(eventData);
    
    // Generate unique event ID
    const eventId = DynamoDBService.generateId();
    
    // Create event item for DynamoDB
    const eventItem = {
      userId: userId,
      eventId: eventId,
      ...preparedData,
      // Add id field for backward compatibility with existing code
      id: eventId,
      // Add startDate field for GSI querying
      startDate: this._generateDateSortKey(preparedData)
    };
    
    const result = await DynamoDBService.putItem(this.TABLE_NAME, eventItem);
    
    if (result.success) {
      return result.item;
    } else {
      throw new Error('Failed to create event');
    }
  }

  /**
   * Update an existing event in DynamoDB
   * @private
   * @param {string} userId - User ID
   * @param {string} eventId - Event ID
   * @param {Object} updatedData - Updated event data
   * @returns {Promise<Object>} Updated event object
   */
  static async _updateEventById(userId, eventId, updatedData) {
    // Validate and prepare data (excluding system fields)
    const { userId: _, eventId: __, id: ___, ...dataToUpdate } = updatedData;
    
    // Only validate if we have required fields to update
    if (dataToUpdate.title || dataToUpdate.eventType) {
      this._validateEventData({ title: 'temp', eventType: 'Personal', ...dataToUpdate });
    }
    
    const preparedData = this._prepareEventData(dataToUpdate);
    
    // Update startDate for GSI if date fields are being updated
    if (preparedData.startDate || preparedData.startDateTime) {
      preparedData.startDate = this._generateDateSortKey(preparedData);
    }
    
    const result = await DynamoDBService.updateItem(
      this.TABLE_NAME,
      {
        userId: userId,
        eventId: eventId
      },
      preparedData,
      {
        // Ensure the event exists before updating
        ConditionExpression: 'attribute_exists(userId) AND attribute_exists(eventId)'
      }
    );
    
    if (result.success) {
      return result.item;
    } else {
      throw new Error('Failed to update event');
    }
  }

  /**
   * Delete an event from DynamoDB
   * @private
   * @param {string} userId - User ID
   * @param {string} eventId - Event ID
   * @returns {Promise<void>}
   */
  static async _deleteEventById(userId, eventId) {
    await DynamoDBService.deleteItem(
      this.TABLE_NAME,
      {
        userId: userId,
        eventId: eventId
      },
      {
        // Ensure the event exists before deleting
        ConditionExpression: 'attribute_exists(userId) AND attribute_exists(eventId)'
      }
    );
  }

  // Helper methods from original CalendarEventsService

  /**
   * Helper method to get children from an event (handles both legacy and new formats)
   * @param {Object} event - Event object
   * @returns {Array} Array of child objects
   */
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

  /**
   * Helper method to ensure backward compatibility when updating events
   * @param {Object} eventData - Event data to normalize
   * @returns {Object} Normalized event data
   */
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

  /**
   * Get all occurrences of a multi-date event
   * @param {string} multiDateId - Multi-date event ID
   * @returns {Promise<Array>} Array of event occurrences
   */
  static async getMultiDateEventOccurrences(multiDateId) {
    try {
      const userId = await this._getCurrentUserId();
      
      // Query all events and filter by multiDateId
      // Note: In a production system, you might want to create a GSI for multiDateId
      const allEvents = await this.getEvents();
      
      return allEvents
        .filter(event => event.multiDateId === multiDateId)
        .sort((a, b) => a.occurrenceIndex - b.occurrenceIndex);
    } catch (error) {
      console.error('Error getting multi-date event occurrences:', error);
      return [];
    }
  }

  /**
   * Check if an event is part of a multi-date series
   * @param {Object} event - Event object
   * @returns {boolean} True if event is multi-date
   */
  static isMultiDateEvent(event) {
    return event && event.isMultiDate === true && event.multiDateId;
  }

  /**
   * Get the next occurrence of a multi-date event
   * @param {string} eventId - Current event ID
   * @returns {Promise<Object|null>} Next occurrence or null
   */
  static async getNextMultiDateOccurrence(eventId) {
    try {
      const currentEvent = await this.getEventById(eventId);
      
      if (!currentEvent || !this.isMultiDateEvent(currentEvent)) {
        return null;
      }

      const allOccurrences = await this.getMultiDateEventOccurrences(currentEvent.multiDateId);
      const currentIndex = allOccurrences.findIndex(event => (event.eventId || event.id) === eventId);
      
      if (currentIndex === -1 || currentIndex === allOccurrences.length - 1) {
        return null; // No next occurrence
      }

      return allOccurrences[currentIndex + 1];
    } catch (error) {
      console.error('Error getting next multi-date occurrence:', error);
      return null;
    }
  }

  /**
   * Get the previous occurrence of a multi-date event
   * @param {string} eventId - Current event ID
   * @returns {Promise<Object|null>} Previous occurrence or null
   */
  static async getPreviousMultiDateOccurrence(eventId) {
    try {
      const currentEvent = await this.getEventById(eventId);
      
      if (!currentEvent || !this.isMultiDateEvent(currentEvent)) {
        return null;
      }

      const allOccurrences = await this.getMultiDateEventOccurrences(currentEvent.multiDateId);
      const currentIndex = allOccurrences.findIndex(event => (event.eventId || event.id) === eventId);
      
      if (currentIndex <= 0) {
        return null; // No previous occurrence
      }

      return allOccurrences[currentIndex - 1];
    } catch (error) {
      console.error('Error getting previous multi-date occurrence:', error);
      return null;
    }
  }

  // Utility methods

  /**
   * Helper function to generate multi-date event ID
   * @returns {string} Multi-date event ID
   */
  static generateMultiDateId() {
    return `multi_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Helper function to determine occurrence type based on position
   * @param {number} index - Occurrence index
   * @param {number} total - Total occurrences
   * @returns {string} Occurrence type
   */
  static determineOccurrenceType(index, total) {
    if (total === 1) return 'single';
    if (index === 0) return 'first';
    if (index === total - 1) return 'last';
    return 'middle';
  }

  /**
   * Helper function to validate multi-date event dates
   * @param {Array} dates - Array of date strings
   * @returns {Object} Validation result
   */
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

  /**
   * Method to validate and repair corrupted event data
   * @param {Object} event - Event to validate and repair
   * @returns {Object} Repaired event or null if irreparable
   */
  static validateAndRepairEvent(event) {
    try {
      if (!event || typeof event !== 'object') {
        console.warn('Invalid event object provided for validation');
        return null;
      }

      const repairedEvent = { ...event };

      // Ensure required fields exist
      if (!repairedEvent.eventId && !repairedEvent.id) {
        repairedEvent.eventId = DynamoDBService.generateId();
        repairedEvent.id = repairedEvent.eventId;
        console.warn('Event missing ID, generated new ID:', repairedEvent.eventId);
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

      // Add repair timestamp if corrupted
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

  /**
   * Method to clean up corrupted events from storage
   * @returns {Promise<Object>} Cleanup result
   */
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
          id: e.eventId || e.id,
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

export default DynamoDBCalendarService;