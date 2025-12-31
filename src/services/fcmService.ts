import { backendService } from '../backend/BackendService';
import { legacyMessaging as messaging } from '../backend/FirebaseBackend';
import { deleteToken } from 'firebase/messaging';

// VAPID key from Firebase Console > Project Settings > Cloud Messaging > Web Push certificates
// You'll need to generate this in the Firebase Console and add it to your .env file
const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY;

export class FCMService {
  /**
   * Request notification permission from the user
   */
  static async requestPermission(): Promise<NotificationPermission> {
    if (!('Notification' in window)) {
      console.warn('This browser does not support notifications');
      return 'denied';
    }

    const permission = await backendService.messaging.requestPermission() as NotificationPermission;
    console.log('Notification permission:', permission);
    return permission;
  }

  /**
   * Get FCM token for this device
   */
  static async getToken(): Promise<string | null> {
    try {
      if (!VAPID_KEY) {
        console.error('VAPID key not configured. Please add VITE_FIREBASE_VAPID_KEY to your .env file');
        return null;
      }

      // Request permission first
      const permission = await this.requestPermission();
      if (permission !== 'granted') {
        console.log('Notification permission not granted');
        return null;
      }

      // Get the FCM token
      const token = await backendService.messaging.getToken();
      
      if (token) {
        console.log('✅ FCM token obtained:', token.substring(0, 20) + '...');
        return token;
      } else {
        console.log('No registration token available');
        return null;
      }
    } catch (error) {
      // Silently handle unsupported browser errors
      if ((error as {code?: string})?.code === 'messaging/unsupported-browser') {
        console.log('Push notifications not supported in this browser');
        return null;
      }
      console.error('Error getting FCM token:', error);
      return null;
    }
  }

  /**
   * Save FCM token to Firestore for this user
   */
  static async saveTokenToFirestore(userId: string, token: string): Promise<void> {
    try {
      const tokenPath = `users/${userId}/fcmTokens`;
      await backendService.documents.set(tokenPath, token, {
        token,
        createdAt: backendService.utils.serverTimestamp(),
        lastUsed: backendService.utils.serverTimestamp(),
      });
      console.log('✅ FCM token saved to Firestore');
    } catch (error) {
      console.error('Error saving FCM token to Firestore:', error);
      throw error;
    }
  }

  /**
   * Delete FCM token from Firestore
   */
  static async deleteTokenFromFirestore(userId: string, token: string): Promise<void> {
    try {
      await backendService.documents.delete(`users/${userId}/fcmTokens`, token);
      console.log('✅ FCM token deleted from Firestore');
    } catch (error) {
      console.error('Error deleting FCM token from Firestore:', error);
    }
  }

  /**
   * Initialize FCM for the current user
   */
  static async initialize(userId: string): Promise<string | null> {
    try {
      // Get FCM token
      const token = await this.getToken();
      
      if (token) {
        // Save token to Firestore
        await this.saveTokenToFirestore(userId, token);
        
        // Set up foreground message handler
        this.setupForegroundMessageHandler();
        
        return token;
      }
      
      return null;
    } catch (error) {
      console.error('Error initializing FCM:', error);
      return null;
    }
  }

  /**
   * Handle messages when app is in foreground
   */
  static setupForegroundMessageHandler(): void {
    try {
      // Check if messaging is supported
      if (!messaging) {
        return;
      }

      backendService.messaging.onMessage((payload: {notification?: {title?: string, body?: string, icon?: string}, data?: {conversationId?: string}}) => {
        console.log('📬 Foreground message received:', payload);
        
        // Show notification manually when app is in foreground
        if (payload.notification) {
          const { title, body, icon } = payload.notification;
          
          // Only show if browser supports notifications and permission is granted
          if ('Notification' in window && Notification.permission === 'granted') {
            const notification = new Notification(title || 'New message', {
              body: body || '',
              icon: icon || '/favicon.ico',
              badge: '/favicon.ico',
              tag: payload.data?.conversationId || 'default', // Prevents duplicate notifications
              data: payload.data,
            });

            // Handle notification click
            notification.onclick = (event) => {
              event.preventDefault();
              window.focus();
              
              // Navigate to chat if conversationId is provided
              if (payload.data?.conversationId) {
                window.location.href = `/?chat=${payload.data.conversationId}`;
              }
              
              notification.close();
            };
          }
        }
      });
    } catch (error) {
      // Silently handle unsupported browser errors
      if ((error as {code?: string})?.code === 'messaging/unsupported-browser') {
        return;
      }
      console.error('Error setting up foreground message handler:', error);
    }
  }

  /**
   * Unregister FCM for the current user
   */
  static async unregister(userId: string): Promise<void> {
    try {
      // Check if messaging is supported
      if (!messaging) {
        return;
      }

      // Get current token
      const token = await backendService.messaging.getToken();
      
      if (token) {
        // Delete from Firestore
        await this.deleteTokenFromFirestore(userId, token);
        
        // Delete the token from FCM
        await deleteToken(messaging);
        console.log('✅ FCM token unregistered');
      }
    } catch (error) {
      // Silently handle unsupported browser errors
      if ((error as {code?: string})?.code === 'messaging/unsupported-browser') {
        return;
      }
      console.error('Error unregistering FCM:', error);
    }
  }

  /**
   * Check if notifications are supported and enabled
   */
  static isSupported(): boolean {
    return 'Notification' in window && 'serviceWorker' in navigator;
  }

  /**
   * Get current notification permission status
   */
  static getPermissionStatus(): NotificationPermission {
    if (!('Notification' in window)) {
      return 'denied';
    }
    return Notification.permission;
  }
}
