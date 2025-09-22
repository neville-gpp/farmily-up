import { useState, useCallback } from 'react';

/**
 * useMessages Hook
 * 
 * A custom hook for managing success and error messages across authentication flows.
 * Provides consistent message handling with automatic cleanup and state management.
 * 
 * @returns {Object} Message state and control functions
 */
export default function useMessages() {
  const [messages, setMessages] = useState({
    banner: {
      visible: false,
      type: 'info',
      message: '',
    },
    toast: {
      visible: false,
      type: 'info',
      message: '',
      actionText: '',
      onActionPress: null,
    },
    alert: {
      visible: false,
      type: 'info',
      title: '',
      message: '',
      buttons: [],
    },
  });

  /**
   * Show a banner message at the top of the screen
   */
  const showBanner = useCallback((type, message, options = {}) => {
    setMessages(prev => ({
      ...prev,
      banner: {
        visible: true,
        type,
        message,
        ...options,
      },
    }));
  }, []);

  /**
   * Hide the banner message
   */
  const hideBanner = useCallback(() => {
    setMessages(prev => ({
      ...prev,
      banner: {
        ...prev.banner,
        visible: false,
      },
    }));
  }, []);

  /**
   * Show a toast message at the bottom of the screen
   */
  const showToast = useCallback((type, message, options = {}) => {
    setMessages(prev => ({
      ...prev,
      toast: {
        visible: true,
        type,
        message,
        actionText: options.actionText || '',
        onActionPress: options.onActionPress || null,
        ...options,
      },
    }));
  }, []);

  /**
   * Hide the toast message
   */
  const hideToast = useCallback(() => {
    setMessages(prev => ({
      ...prev,
      toast: {
        ...prev.toast,
        visible: false,
      },
    }));
  }, []);

  /**
   * Show an alert dialog
   */
  const showAlert = useCallback((type, title, message, buttons = []) => {
    setMessages(prev => ({
      ...prev,
      alert: {
        visible: true,
        type,
        title,
        message,
        buttons,
      },
    }));
  }, []);

  /**
   * Hide the alert dialog
   */
  const hideAlert = useCallback(() => {
    setMessages(prev => ({
      ...prev,
      alert: {
        ...prev.alert,
        visible: false,
      },
    }));
  }, []);

  /**
   * Clear all messages
   */
  const clearAll = useCallback(() => {
    setMessages({
      banner: {
        visible: false,
        type: 'info',
        message: '',
      },
      toast: {
        visible: false,
        type: 'info',
        message: '',
        actionText: '',
        onActionPress: null,
      },
      alert: {
        visible: false,
        type: 'info',
        title: '',
        message: '',
        buttons: [],
      },
    });
  }, []);

  /**
   * Convenience methods for different message types
   */
  const showSuccess = useCallback((message, options = {}) => {
    if (options.type === 'banner') {
      showBanner('success', message, options);
    } else if (options.type === 'alert') {
      showAlert('success', options.title || 'Success', message, options.buttons);
    } else {
      showToast('success', message, options);
    }
  }, [showBanner, showToast, showAlert]);

  const showError = useCallback((message, options = {}) => {
    if (options.type === 'banner') {
      showBanner('error', message, options);
    } else if (options.type === 'alert') {
      showAlert('error', options.title || 'Error', message, options.buttons);
    } else {
      showToast('error', message, options);
    }
  }, [showBanner, showToast, showAlert]);

  const showWarning = useCallback((message, options = {}) => {
    if (options.type === 'banner') {
      showBanner('warning', message, options);
    } else if (options.type === 'alert') {
      showAlert('warning', options.title || 'Warning', message, options.buttons);
    } else {
      showToast('warning', message, options);
    }
  }, [showBanner, showToast, showAlert]);

  const showInfo = useCallback((message, options = {}) => {
    if (options.type === 'banner') {
      showBanner('info', message, options);
    } else if (options.type === 'alert') {
      showAlert('info', options.title || 'Information', message, options.buttons);
    } else {
      showToast('info', message, options);
    }
  }, [showBanner, showToast, showAlert]);

  return {
    // State
    messages,
    
    // Control functions
    showBanner,
    hideBanner,
    showToast,
    hideToast,
    showAlert,
    hideAlert,
    clearAll,
    
    // Convenience functions
    showSuccess,
    showError,
    showWarning,
    showInfo,
  };
}