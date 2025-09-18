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
import { httpsCallable } from 'firebase/functions';
import { db, functions, auth } from '../firebase';

export interface Notification {
  id?: string;
  recipientId: string; // User ID who receives the notification
  senderId: string; // User ID who triggered the notification
  senderDisplayName?: string; // Cached sender display name for performance
  type: 'file_shared' | 'file_modified' | 'file_unshared';
  title: string; // Short notification title
  message: string; // Detailed notification message
  fileId?: string; // Related file ID (if applicable)
  fileName?: string; // Cached file name for performance
  folderId?: string; // Related folder ID (if applicable)
  folderName?: string; // Cached folder name for performance
  isRead: boolean;
  createdAt: FieldValue;
  readAt?: FieldValue;
  metadata?: {
    [key: string]: any; // Additional context data
  };
}

export class NotificationService {
  private static readonly COLLECTION_NAME = 'notifications';
  
  // HTTP Function URLs
  private static readonly FUNCTIONS_BASE_URL = 'https://us-central1-seravault-8c764.cloudfunctions.net';

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
    limitCount: number = 50
  ): () => void {
    console.log(`🔔 Setting up notification subscription for user: ${userId}`);
    try {
      // Use simpler query until Firestore index is created
      const q = query(
        collection(db, this.COLLECTION_NAME),
        where('recipientId', '==', userId),
        limit(limitCount)
      );
      
      const unsubscribe = onSnapshot(q, (querySnapshot) => {
        const notifications: Notification[] = [];
        
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          notifications.push({
            id: doc.id,
            ...data as Omit<Notification, 'id'>
          });
          console.log(`📝 Notification found:`, {
            id: doc.id,
            type: data.type,
            title: data.title,
            isRead: data.isRead
          });
        });
        
        // Sort notifications by createdAt descending (newest first) since we can't use orderBy yet
        notifications.sort((a, b) => {
          const aTime = a.createdAt && typeof a.createdAt === 'object' && 'toDate' in a.createdAt 
            ? a.createdAt.toDate().getTime() 
            : 0;
          const bTime = b.createdAt && typeof b.createdAt === 'object' && 'toDate' in b.createdAt 
            ? b.createdAt.toDate().getTime() 
            : 0;
          return bTime - aTime;
        });
        
        console.log(`📬 Real-time update: ${notifications.length} notifications for user: ${userId}`);
        callback(notifications);
      }, (error) => {
        console.error('❌ Error in real-time notification subscription:', error);
        callback([]);
      });
      
      console.log('✅ Notification subscription set up successfully');
      return unsubscribe;
    } catch (error) {
      console.error('❌ Error setting up notification subscription:', error);
      return () => {};
    }
  }

  /**
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