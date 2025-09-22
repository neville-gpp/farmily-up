import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Debug utilities for inspecting AsyncStorage data
 */
export class DebugUtils {
  
  /**
   * Get all calendar events from storage for debugging
   */
  static async inspectCalendarEvents() {
    try {
      const data = await AsyncStorage.getItem('calendar-tasks.json');
      if (!data) {
        console.log('No calendar events found in storage');
        return null;
      }
      
      const events = JSON.parse(data);
      console.log('=== CALENDAR EVENTS DEBUG ===');
      console.log(`Total events: ${events.length}`);
      
      events.forEach((event, index) => {
        console.log(`Event ${index}:`, {
          id: event.id,
          title: event.title,
          childId: event.childId,
          isAllDay: event.isAllDay,
          startDateTime: event.startDateTime,
          startDate: event.startDate
        });
      });
      
      return events;
    } catch (error) {
      console.error('Error inspecting calendar events:', error);
      return null;
    }
  }
  
  /**
   * Get all children from storage for debugging
   */
  static async inspectChildren() {
    try {
      const data = await AsyncStorage.getItem('children-profile.json');
      if (!data) {
        console.log('No children found in storage');
        return null;
      }
      
      const children = JSON.parse(data);
      console.log('=== CHILDREN DEBUG ===');
      console.log(`Total children: ${children.length}`);
      
      children.forEach((child, index) => {
        console.log(`Child ${index}:`, {
          id: child.id,
          name: child.name,
          age: child.age,
          avatar: child.avatar
        });
      });
      
      return children;
    } catch (error) {
      console.error('Error inspecting children:', error);
      return null;
    }
  }
  
  /**
   * Check for orphaned events (events with childId that don't match any children)
   */
  static async findOrphanedEvents() {
    try {
      const events = await this.inspectCalendarEvents();
      const children = await this.inspectChildren();
      
      if (!events || !children) {
        console.log('Cannot check for orphaned events - missing data');
        return [];
      }
      
      const childIds = children.map(child => child.id);
      const orphanedEvents = events.filter(event => 
        event.childId && !childIds.includes(event.childId)
      );
      
      console.log('=== ORPHANED EVENTS ===');
      console.log(`Found ${orphanedEvents.length} orphaned events`);
      
      orphanedEvents.forEach((event, index) => {
        console.log(`Orphaned Event ${index}:`, {
          id: event.id,
          title: event.title,
          childId: event.childId,
          message: `Child ID "${event.childId}" not found in children data`
        });
      });
      
      return orphanedEvents;
    } catch (error) {
      console.error('Error finding orphaned events:', error);
      return [];
    }
  }
  
  /**
   * Clear all AsyncStorage data (use with caution!)
   */
  static async clearAllData() {
    try {
      await AsyncStorage.multiRemove(['calendar-tasks.json', 'children-profile.json', 'parent-feeling.json']);
      console.log('All app data cleared');
      return true;
    } catch (error) {
      console.error('Error clearing data:', error);
      return false;
    }
  }
  
  /**
   * Repair children data by adding default names to children without names
   */
  static async repairChildrenNames() {
    try {
      const data = await AsyncStorage.getItem('children-profile.json');
      if (!data) {
        console.log('No children data to repair');
        return false;
      }
      
      const children = JSON.parse(data);
      let repairCount = 0;
      
      const repairedChildren = children.map((child, index) => {
        if (!child.name || child.name.trim() === '') {
          repairCount++;
          return {
            ...child,
            name: `Child ${index + 1}`,
            age: child.age || 5,
            avatar: child.avatar || (index % 2 === 0 ? '👧' : '👦'),
            updatedAt: new Date().toISOString()
          };
        }
        return child;
      });
      
      if (repairCount > 0) {
        await AsyncStorage.setItem('children-profile.json', JSON.stringify(repairedChildren));
        console.log(`Repaired ${repairCount} children with missing names`);
        return true;
      } else {
        console.log('No children needed name repair');
        return true;
      }
    } catch (error) {
      console.error('Error repairing children names:', error);
      return false;
    }
  }

  /**
   * Create sample data for testing
   */
  static async createSampleData() {
    try {
      // Create sample children
      const sampleChildren = [
        {
          id: 'child-1',
          name: 'Emma',
          age: 8,
          avatar: '👧',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        },
        {
          id: 'child-2', 
          name: 'Liam',
          age: 6,
          avatar: '👦',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      ];
      
      // Create sample events
      const today = new Date();
      const sampleEvents = [
        {
          id: 'event-1',
          title: 'Soccer Practice',
          childId: 'child-1',
          isAllDay: false,
          startDateTime: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 15, 0).toISOString(),
          endDateTime: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 16, 30).toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        },
        {
          id: 'event-2',
          title: 'Piano Lesson',
          childId: 'child-2',
          isAllDay: false,
          startDateTime: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 17, 0).toISOString(),
          endDateTime: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 18, 0).toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      ];
      
      await AsyncStorage.setItem('children-profile.json', JSON.stringify(sampleChildren));
      await AsyncStorage.setItem('calendar-tasks.json', JSON.stringify(sampleEvents));
      
      console.log('Sample data created successfully');
      return true;
    } catch (error) {
      console.error('Error creating sample data:', error);
      return false;
    }
  }
}

export default DebugUtils;