// @ts-nocheck
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  limit, 
  onSnapshot, 
  getDocs,
  FieldValue
} from 'firebase/firestore';
import { legacyDb as db, legacyAuth as auth } from '../backend/FirebaseBackend';

export interface Notification {
  id?: string;
  recipientId: string; // User ID who receives the notification
  senderId: string; // User ID who triggered the notification
  senderDisplayName?: string; // Cached sender display name for performance
  type: 'file_shared' | 'file_modified' | 'file_unshared' | 'contact_request' | 'contact_accepted' | 'file_share_request' | 'chat_message' | 'user_invitation';
  title: string; // Short notification title
  message: string; // Detailed notification message
  fileId?: string; // Related file ID (if applicable)
  fileName?: string; // Cached file name for performance
  folderId?: string; // Related folder ID (if applicable)
  folderName?: string; // Cached folder name for performance
  contactRequestId?: string; // Related contact request ID (if applicable)
  conversationId?: string; // Related chat conversation ID (if applicable)
  messageId?: string; // Related message ID (if applicable)
  invitationId?: string; // Related user invitation ID (if applicable)
  isRead: boolean;
  createdAt: FieldValue;
  readAt?: FieldValue;
  metadata?: Record<string, unknown>; // Additional context data
}

export class NotificationService {
  private static readonly COLLECTION_NAME = 'notifications';
  
  // HTTP Function URLs
  private static readonly FUNCTIONS_BASE_URL = import.meta.env.VITE_FUNCTIONS_BASE_URL || 'https://us-central1-seravault-8c764.cloudfunctions.net';

  // NOTE: File notifications are now handled automatically by Cloud Functions
  // when file documents are updated (sharedWith array changes or content modifications)
  // No need for manual notification creation from client side

  /**
   * Get notifications for a specific user
   */
  static async getUserNotifications(userId: string, limitCount: number = 50): Promise<Notification[]> {
    try {
      // Use simpler query until Firestore index is created
      const q = query(
        collection(db, this.COLLECTION_NAME),
        where('recipientId', '==', userId),
        limit(limitCount)
      );
      
      const querySnapshot = await getDocs(q);
      const notifications: Notification[] = [];
      
      querySnapshot.forEach((doc) => {
        notifications.push({
          id: doc.id,
          ...doc.data() as Omit<Notification, 'id'>
        });
      });
      
      console.log(`📬 Retrieved ${notifications.length} notifications for user: ${userId}`);
      return notifications;
    } catch (error) {
      console.error('❌ Error fetching user notifications:', error);
      throw error;
    }
  }

  /**
   * Subscribe to real-time notifications for a user
   */
  static subscribeToUserNotifications(
    userId: string,
    callback: (notifications: Notification[]) => void,
    limitCount: number = 100
  ): () => void {
    console.log(`🔔 Setting up notification subscription for user: ${userId}`);
    try {
      // Query only unread notifications, ordered by creation time (newest first)
      const q = query(
        collection(db, this.COLLECTION_NAME),
        where('recipientId', '==', userId),
        where('isRead', '==', false),
        orderBy('createdAt', 'desc'),
        limit(limitCount)
      );
      
      let debounceTimer: NodeJS.Timeout | null = null;
      
      const unsubscribe = onSnapshot(q, (querySnapshot) => {
        // Clear any pending callback
        if (debounceTimer) {
          clearTimeout(debounceTimer);
        }
        
        // Debounce to batch rapid notification changes
        debounceTimer = setTimeout(() => {
          const notifications: Notification[] = [];
          
          querySnapshot.forEach((doc) => {
            const data = doc.data();
            notifications.push({
              id: doc.id,
              ...data as Omit<Notification, 'id'>
            });
          });
          
          // No need to sort - already ordered by Firestore query
          console.log(`📬 Real-time update: ${notifications.length} unread notifications`);
          callback(notifications);
        }, 200); // 200ms debounce for notifications
    }, (error) => {
      console.error('❌ Error in real-time notification subscription:', error);
      callback([]);
    });
    
    console.log('✅ Notification subscription set up successfully');
    
    return () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      unsubscribe();
    };
  } catch (error) {
    console.error('❌ Error setting up notification subscription:', error);
    return () => {};
  }
}  /**
   * Mark a specific notification as read (via HTTP Function)
   */
  static async markAsRead(notificationId: string): Promise<void> {
    console.log(`🔄 Attempting to mark notification as read: ${notificationId}`);
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        throw new Error('User not authenticated');
      }
      
      const token = await currentUser.getIdToken();
      console.log('📞 Calling HTTP Function markNotificationAsRead...');
      
      const response = await fetch(`${this.FUNCTIONS_BASE_URL}/markNotificationAsRead`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        credentials: 'include',
        body: JSON.stringify({ notificationId })
      });
      
      console.log('📨 HTTP Function response status:', response.status);
      
      if (!response.ok) {
        const error = await response.json();
        console.error('❌ HTTP Function returned error:', error);
        throw new Error(error.error || 'Failed to mark notification as read');
      }
      
      const data = await response.json();
      console.log('📨 HTTP Function response data:', data);
      
      if (data.success) {
        console.log(`✅ Notification ${notificationId} marked as read successfully`);
      } else {
        console.error('❌ HTTP Function returned failure:', data);
        throw new Error('Failed to mark notification as read');
      }
    } catch (error) {
      console.error('❌ Error marking notification as read:', error);
      throw error;
    }
  }

  /**
   * Mark all notifications as read for current user (via HTTP Function)
   */
  static async markAllAsRead(userId: string): Promise<number> {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        throw new Error('User not authenticated');
      }
      
      const token = await currentUser.getIdToken();
      console.log('📞 Calling HTTP Function markAllNotificationsAsRead...');
      
      const response = await fetch(`${this.FUNCTIONS_BASE_URL}/markAllNotificationsAsRead`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        credentials: 'include',
        body: JSON.stringify({})
      });
      
      console.log('📨 HTTP Function response status:', response.status);
      
      if (!response.ok) {
        const error = await response.json();
        console.error('❌ HTTP Function returned error:', error);
        throw new Error(error.error || 'Failed to mark all notifications as read');
      }
      
      const data = await response.json();
      console.log('📨 HTTP Function response data:', data);
      
      if (data.success) {
        console.log(`✅ Marked ${data.updated} notifications as read for user: ${userId}`);
        return data.updated;
      } else {
        throw new Error('Failed to mark all notifications as read');
      }
    } catch (error) {
      console.error('❌ Error marking all notifications as read:', error);
      throw error;
    }
  }

  /**
   * Get count of unread notifications for a user
   */
  static async getUnreadCount(userId: string): Promise<number> {
    try {
      const q = query(
        collection(db, this.COLLECTION_NAME),
        where('recipientId', '==', userId),
        where('isRead', '==', false)
      );
      
      const querySnapshot = await getDocs(q);
      const count = querySnapshot.size;
      
      console.log(`📊 Unread notifications for user ${userId}: ${count}`);
      return count;
    } catch (error) {
      console.error('❌ Error fetching unread notification count:', error);
      throw error;
    }
  }
}