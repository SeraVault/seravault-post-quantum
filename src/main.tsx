import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom';
import App from './App.tsx'
import './index.css'
import CssBaseline from '@mui/material/CssBaseline';
import { AuthProvider } from './auth/AuthContext';
import { AppThemeProvider } from './theme/ThemeContext';
import { cleanupObsoleteCaches } from './services/cacheCleanup';
import { registerServiceWorkerUpdateHandler } from './utils/serviceWorkerUpdate';

console.warn('🚀 SeraVault App Starting - Image Upload System v2.0 - Build:', new Date().toISOString());

// Filter out Firestore permission-denied console warnings
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;

console.warn = function(...args: any[]) {
  try {
    const message = args[0];
    // Suppress Firestore permission-denied snapshot listener errors
    if (typeof message === 'string' && 
        message.includes('@firebase/firestore') && 
        message.includes('permission-denied')) {
      return;
    }
    originalConsoleWarn.apply(console, args);
  } catch (e) {
    // If console override fails, use original
    originalConsoleWarn.apply(console, args);
  }
};

// Add error logging to help debug mobile issues
console.error = function(...args: any[]) {
  try {
    originalConsoleError.apply(console, args);
    // Store critical errors for debugging
    if (typeof args[0] === 'string' && args[0].includes('Error')) {
      try {
        localStorage.setItem('last_error', JSON.stringify({
          message: args[0],
          timestamp: new Date().toISOString()
        }));
      } catch (e) {
        // Ignore localStorage errors
      }
    }
  } catch (e) {
    originalConsoleError.apply(console, args);
  }
};

// Global error handlers for uncaught promise rejections
window.addEventListener('unhandledrejection', (event) => {
  // Silently suppress Firebase permission-denied errors as they're handled by onSnapshot error callbacks
  if (event.reason?.code === 'permission-denied' && event.reason?.message?.includes('Missing or insufficient permissions')) {
    event.preventDefault();
    return;
  }
  
  // Silently suppress Firebase messaging unsupported browser errors
  if (event.reason?.code === 'messaging/unsupported-browser') {
    event.preventDefault();
    return;
  }
  
  console.error('❌ Unhandled Promise Rejection:', {
    reason: event.reason,
    promise: event.promise,
    stack: event.reason?.stack,
    message: event.reason?.message,
    code: event.reason?.code,
    details: event.reason
  });
  
  // Check if it's a Firebase error
  if (event.reason?.code) {
    console.error('🔥 Firebase Error Code:', event.reason.code);
    console.error('🔥 Firebase Error Message:', event.reason.message);
    
    // Log full stack trace to help identify source
    if (event.reason?.stack) {
      console.error('🔥 Full Stack Trace:', event.reason.stack);
    }
  }
  
  // Try to identify which collection/query is failing
  const stackStr = event.reason?.stack || '';
  if (stackStr.includes('contacts')) console.error('💡 Likely related to: CONTACTS collection');
  if (stackStr.includes('folders')) console.error('💡 Likely related to: FOLDERS collection');
  if (stackStr.includes('files')) console.error('💡 Likely related to: FILES collection');
  if (stackStr.includes('users')) console.error('💡 Likely related to: USERS collection');
  if (stackStr.includes('notifications')) console.error('💡 Likely related to: NOTIFICATIONS collection');
  if (stackStr.includes('invitations')) console.error('💡 Likely related to: INVITATIONS collection');
  
  // Prevent default browser behavior
  event.preventDefault();
});

// Global error handler for uncaught errors
window.addEventListener('error', (event) => {
  console.error('❌ Uncaught Error:', {
    message: event.message,
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
    error: event.error,
    stack: event.error?.stack
  });
});

// Cleanup obsolete cache databases from previous versions
cleanupObsoleteCaches();

// PWA Service Worker Registration
// Register service worker for PWA capabilities and offline support
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      // Version checking is now handled in index.html before any JS loads
      // Just set the version here for reference
      const APP_VERSION = '1.0.147';
      localStorage.setItem('app_version', APP_VERSION);
      
      const registration = await navigator.serviceWorker.register('/sw.js');
      console.log('✅ SW registered: ', registration);
        // Initialize update handler
        registerServiceWorkerUpdateHandler();
        
        // Check for updates periodically (every 5 minutes)
        setInterval(() => {
          registration.update();
        }, 300000);
        
        // Listen for new service worker becoming active
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'activated' && !navigator.serviceWorker.controller) {
                console.log('✅ Service Worker installed for the first time');
              } else if (newWorker.state === 'activated') {
                console.log('🔄 New version available - will activate on next load');
              }
            });
          }
        });
      } catch (registrationError) {
        console.log('❌ SW registration failed: ', registrationError);
      }
  });

  // Clean up any old service workers from previous implementations
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    registrations.forEach((registration) => {
      // Keep the current sw.js but unregister any others
      if (registration.active && !registration.active.scriptURL.endsWith('/sw.js')) {
        registration.unregister();
        console.log('🗑️ Cleaned up old service worker:', registration.active.scriptURL);
      }
    });
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      <AppThemeProvider>
        <CssBaseline />
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AppThemeProvider>
    </AuthProvider>
  </React.StrictMode>,
)
