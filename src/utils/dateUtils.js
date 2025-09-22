/**
 * Utility functions for handling dates without timezone issues
 */

/**
 * Format a Date object to YYYY-MM-DD string using local time
 * This avoids timezone conversion issues when comparing dates
 * @param {Date} date - The date to format
 * @returns {string} - Date string in YYYY-MM-DD format
 */
export const formatLocalDateString = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Check if two dates are the same day (ignoring time)
 * @param {Date} date1 - First date
 * @param {Date} date2 - Second date
 * @returns {boolean} - True if same day
 */
export const isSameDay = (date1, date2) => {
  return formatLocalDateString(date1) === formatLocalDateString(date2);
};

/**
 * Check if a date is today
 * @param {Date} date - Date to check
 * @returns {boolean} - True if date is today
 */
export const isToday = (date) => {
  return isSameDay(date, new Date());
};

/**
 * Get the start of the week for a given date (Sunday = 0)
 * @param {Date} date - The date to get week start for
 * @returns {Date} - Start of the week
 */
export const getWeekStart = (date) => {
  if (!date) {
    date = new Date(); // Default to today if no date provided
  }
  const startOfWeek = new Date(date);
  const day = startOfWeek.getDay();
  const diff = startOfWeek.getDate() - day;
  startOfWeek.setDate(diff);
  return startOfWeek;
};

/**
 * Get an array of dates for a week starting from the given date
 * @param {Date} weekStart - Start of the week
 * @returns {Date[]} - Array of 7 dates
 */
export const getWeekDays = (weekStart) => {
  if (!weekStart) {
    weekStart = getWeekStart(new Date()); // Default to current week if no start provided
  }
  const weekDays = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + i);
    weekDays.push(date);
  }
  return weekDays;
};

/**
 * Parse a date string in YYYY-MM-DD format to a Date object
 * This ensures the date is created in local time, not UTC
 * @param {string} dateString - Date string in YYYY-MM-DD format
 * @returns {Date} - Date object in local time
 */
export const parseLocalDateString = (dateString) => {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day);
};