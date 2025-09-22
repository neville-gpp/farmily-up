/**
 * Greeting and Quote System Utilities
 * Provides time-based greeting logic and inspirational quote selection
 */

// Predefined inspirational quotes for parents
export const INSPIRATIONAL_QUOTES = [
  "The most beautiful thing in the world is to see your children smiling, and knowing that you are the reason behind that smile. — John Wooden",
  "Encourage and support your kids, because children are apt to live up to what you believe of them. — Lady Bird Johnson",
  "There is no such thing as a perfect parent. So just be a real one. — Sue Atkins",
  "Parenthood is a sacred privilege, a profound responsibility, and a boundless wellspring of unconditional love that knows no bounds. — Michael Josephson"
];

/**
 * Returns appropriate greeting based on current hour with error handling
 * Requirements: 1.1, 1.2, 1.3
 * @param {Date} currentTime - Current date/time object (defaults to now)
 * @returns {string} Time-based greeting message
 */
export const getTimeBasedGreeting = (currentTime = new Date()) => {
  try {
    // Validate input
    if (!currentTime || !(currentTime instanceof Date)) {
      console.warn('Invalid currentTime provided to getTimeBasedGreeting, using current time');
      currentTime = new Date();
    }
    
    // Check if date is valid
    if (isNaN(currentTime.getTime())) {
      console.error('Invalid date provided to getTimeBasedGreeting');
      return "Good Day!"; // Fallback greeting
    }
    
    const hour = currentTime.getHours();
    
    // Validate hour is within expected range
    if (hour < 0 || hour > 23) {
      console.error('Invalid hour from date:', hour);
      return "Good Day!"; // Fallback greeting
    }
    
    // Good Morning: 5:00 AM to 11:59 AM
    if (hour >= 5 && hour < 12) {
      return "Good Morning!";
    }
    
    // Good Afternoon: 12:00 PM to 5:59 PM
    if (hour >= 12 && hour < 18) {
      return "Good Afternoon!";
    }
    
    // Good Evening: 6:00 PM to 4:59 AM
    return "Good Evening!";
  } catch (error) {
    console.error('Error in getTimeBasedGreeting:', error);
    return "Good Day!"; // Fallback greeting
  }
};

/**
 * Randomly selects an inspirational quote from the predefined pool with error handling
 * Requirements: 1.4, 1.5
 * @returns {string} Randomly selected inspirational quote
 */
export const getRandomQuote = () => {
  try {
    // Validate quotes array exists and has content
    if (!INSPIRATIONAL_QUOTES || !Array.isArray(INSPIRATIONAL_QUOTES) || INSPIRATIONAL_QUOTES.length === 0) {
      console.error('INSPIRATIONAL_QUOTES is invalid or empty');
      return "Have a wonderful day with your children!"; // Fallback quote
    }
    
    // Generate random index with bounds checking
    const randomIndex = Math.floor(Math.random() * INSPIRATIONAL_QUOTES.length);
    
    // Validate index is within bounds
    if (randomIndex < 0 || randomIndex >= INSPIRATIONAL_QUOTES.length) {
      console.error('Generated invalid random index:', randomIndex);
      return INSPIRATIONAL_QUOTES[0]; // Return first quote as fallback
    }
    
    const selectedQuote = INSPIRATIONAL_QUOTES[randomIndex];
    
    // Validate selected quote
    if (!selectedQuote || typeof selectedQuote !== 'string') {
      console.error('Selected quote is invalid:', selectedQuote);
      return INSPIRATIONAL_QUOTES[0] || "Have a wonderful day with your children!";
    }
    
    return selectedQuote;
  } catch (error) {
    console.error('Error in getRandomQuote:', error);
    return "Have a wonderful day with your children!"; // Fallback quote
  }
};

/**
 * Helper function to get current hour for testing purposes
 * @param {Date} currentTime - Current date/time object (defaults to now)
 * @returns {number} Current hour (0-23)
 */
export const getCurrentHour = (currentTime = new Date()) => {
  return currentTime.getHours();
};

/**
 * Helper function to check if it's a new day since last greeting
 * Useful for quote rotation and greeting updates
 * @param {Date} lastGreetingTime - Previous greeting timestamp
 * @param {Date} currentTime - Current date/time object (defaults to now)
 * @returns {boolean} True if it's a new day
 */
export const isNewDay = (lastGreetingTime, currentTime = new Date()) => {
  if (!lastGreetingTime) return true;
  
  const lastDate = new Date(lastGreetingTime);
  const currentDate = new Date(currentTime);
  
  return (
    lastDate.getFullYear() !== currentDate.getFullYear() ||
    lastDate.getMonth() !== currentDate.getMonth() ||
    lastDate.getDate() !== currentDate.getDate()
  );
};

/**
 * Helper function to format time for display purposes
 * @param {Date} time - Time to format
 * @returns {string} Formatted time string
 */
export const formatTimeForDisplay = (time = new Date()) => {
  return time.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
};