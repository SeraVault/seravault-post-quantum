import {onDocumentUpdated, onDocumentCreated} from "firebase-functions/v2/firestore";
import {onRequest, HttpsError} from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import {FieldValue} from "firebase-admin/firestore";
import cors from "cors";

// Configure CORS for web clients
const corsHandler = cors({
  origin: [
    'http://localhost:5173',
    'http://localhost:3000', 
    'https://seravault-8c764.web.app',
    'https://seravault-8c764.firebaseapp.com'
  ],
  credentials: true
});

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

interface NotificationData {
  recipientId: string;
  senderId: string;
  senderDisplayName?: string;
  type: 'file_shared' | 'file_modified' | 'file_unshared' | 'contact_request' | 'contact_accepted' | 'file_share_request';
  title: string;
  message: string;
  fileId?: string;
  fileName?: string;
  contactRequestId?: string;
  isRead: boolean;
  createdAt: FieldValue;
  metadata?: {[key: string]: any};
}

/**
 * Create a notification securely on the server side
 */
async function createNotification(notificationData: Omit<NotificationData, 'createdAt'>): Promise<string> {
  try {
    const notification = {
      ...notificationData,
      createdAt: FieldValue.serverTimestamp(),
    };
    
    const docRef = await db.collection('notifications').add(notification);
    console.log(`✅ Notification created: ${docRef.id} for user ${notificationData.recipientId}`);
    return docRef.id;
  } catch (error) {
    console.error('❌ Error creating notification:', error);
    throw error;
  }
}

/**
 * Get user display name from user profile
 */
async function getUserDisplayName(userId: string): Promise<string> {
  try {
    const userDoc = await db.collection('users').doc(userId).get();
    if (userDoc.exists) {
      const userData = userDoc.data();
      return userData?.displayName || userData?.email || 'Unknown User';
    }
    return 'Unknown User';
  } catch (error) {
    console.error('Error fetching user display name:', error);
    return 'Unknown User';
  }
}

/**
 * Validate that user has access to a file
 */
async function validateFileAccess(fileId: string, userId: string): Promise<boolean> {
  try {
    const fileDoc = await db.collection('files').doc(fileId).get();
    if (!fileDoc.exists) {
      return false;
    }
    
    const fileData = fileDoc.data();
    if (!fileData) return false;
    
    // User must be owner or in sharedWith array
    return fileData.owner === userId || 
           (Array.isArray(fileData.sharedWith) && fileData.sharedWith.includes(userId));
  } catch (error) {
    console.error('Error validating file access:', error);
    return false;
  }
}

/**
 * Firestore Trigger: File sharing/unsharing notifications
 * Triggered when a file document is updated (sharedWith array changes)
 */
export const onFileShared = onDocumentUpdated("files/{fileId}", async (event) => {
  const beforeData = event.data?.before.data();
  const afterData = event.data?.after.data();
  const fileId = event.params.fileId;
  
  console.log(`📋 onFileShared triggered for file: ${fileId}`);
  
  if (!beforeData || !afterData) return;
  
  const beforeSharedWith: string[] = beforeData.sharedWith || [];
  const afterSharedWith: string[] = afterData.sharedWith || [];
  const ownerId = afterData.owner;
  
  // Get owner's display name
  const ownerDisplayName = await getUserDisplayName(ownerId);
  
  // Find newly added users (shared)
  const newlySharedUsers = afterSharedWith.filter(userId => !beforeSharedWith.includes(userId));
  
  // Find removed users (unshared)
  const unsharedUsers = beforeSharedWith.filter(userId => !afterSharedWith.includes(userId));
  
  // Create notifications for newly shared users
  for (const userId of newlySharedUsers) {
    // Don't notify the owner when they share with themselves
    if (userId === ownerId) continue;
    
    await createNotification({
      recipientId: userId,
      senderId: ownerId,
      senderDisplayName: ownerDisplayName,
      type: 'file_shared',
      title: 'New file shared with you',
      message: `${ownerDisplayName} shared a file with you`,
      fileId,
      isRead: false,
      metadata: {
        action: 'shared',
        timestamp: new Date().toISOString()
      }
    });
  }
  
  // Don't notify users when they're unshared - they'll simply lose access
  // This is cleaner UX and avoids notifying users about negative actions
  
  console.log(`📤 File sharing notifications processed: +${newlySharedUsers.length} shared, ${unsharedUsers.length} unshared (no notification)`);
});

/**
 * Firestore Trigger: File modification notifications
 * Triggered when a file document is updated (content changes)
 */
export const onFileModified = onDocumentUpdated("files/{fileId}", async (event) => {
  const beforeData = event.data?.before.data();
  const afterData = event.data?.after.data();
  const fileId = event.params.fileId;
  
  console.log(`📋 onFileModified triggered for file: ${fileId}`);
  
  if (!beforeData || !afterData) return;
  
  // Check if this is a sharing/unsharing event (sharedWith array changed)
  const beforeSharedWith: string[] = beforeData.sharedWith || [];
  const afterSharedWith: string[] = afterData.sharedWith || [];
  const sharingChanged = beforeSharedWith.length !== afterSharedWith.length ||
    beforeSharedWith.some(id => !afterSharedWith.includes(id)) ||
    afterSharedWith.some(id => !beforeSharedWith.includes(id));
  
  // If sharing changed at all, don't send modification notification (onFileShared handles it)
  // Even if content also changed, we only want one notification per action
  if (sharingChanged) {
    console.log(`🔄 Ignoring modification notification - sharing event (onFileShared handles it)`);
    return;
  }
  
  // Only notify on actual content modifications (ignore metadata-only updates)
  const contentFields = ['storagePath', 'size', 'encryptedName'];
  const hasContentChange = contentFields.some(field => {
    const before = beforeData[field];
    const after = afterData[field];
    
    // Handle encrypted fields
    if (typeof before === 'object' && before?.ciphertext) {
      return before.ciphertext !== after?.ciphertext;
    }
    
    return before !== after;
  });
  
  if (!hasContentChange) {
    console.log(`ℹ️ No content changes detected, skipping notification`);
    return;
  }
  
  const ownerId = afterData.owner;
  const sharedWith: string[] = afterData.sharedWith || [];
  
  // Get modifier's display name (for now assume it's the owner, could be enhanced)
  const modifierDisplayName = await getUserDisplayName(ownerId);
  
  // Notify all users with access except the modifier
  const usersToNotify = sharedWith.filter(userId => userId !== ownerId);
  
  for (const userId of usersToNotify) {
    await createNotification({
      recipientId: userId,
      senderId: ownerId,
      senderDisplayName: modifierDisplayName,
      type: 'file_modified',
      title: 'Shared file updated',
      message: `${modifierDisplayName} modified a shared file`,
      fileId,
      isRead: false,
      metadata: {
        action: 'modified',
        timestamp: new Date().toISOString()
      }
    });
  }
  
  console.log(`📝 File modification notifications sent to ${usersToNotify.length} users`);
});

/**
 * Firestore Trigger: Contact request notifications
 * Triggered when a contact request document is created
 */
export const onContactRequest = onDocumentCreated("contactRequests/{requestId}", async (event) => {
  const requestData = event.data?.data();
  const requestId = event.params.requestId;
  
  if (!requestData) return;
  
  const fromUserId = requestData.fromUserId;
  const toUserId = requestData.toUserId;
  const fromUserDisplayName = requestData.fromUserDisplayName;
  const message = requestData.message || '';
  
  // Check if recipient wants notifications for contact requests
  const recipientSettings = await db.collection('contactSettings').doc(toUserId).get();
  const settings = recipientSettings.data();
  
  if (settings && !settings.notifyOnContactRequest) {
    console.log(`📪 Contact request notification skipped - user ${toUserId} has notifications disabled`);
    return;
  }
  
  await createNotification({
    recipientId: toUserId,
    senderId: fromUserId,
    senderDisplayName: fromUserDisplayName,
    type: 'contact_request',
    title: 'New contact request',
    message: message 
      ? `${fromUserDisplayName} wants to connect with you: "${message}"`
      : `${fromUserDisplayName} wants to connect with you`,
    contactRequestId: requestId,
    isRead: false,
    metadata: {
      action: 'contact_request',
      timestamp: new Date().toISOString()
    }
  });
  
  console.log(`📨 Contact request notification sent to ${toUserId} from ${fromUserId}`);
});

/**
 * Firestore Trigger: Contact acceptance notifications
 * Triggered when a contact request is accepted (status changes to 'accepted')
 */
export const onContactAccepted = onDocumentUpdated("contactRequests/{requestId}", async (event) => {
  const beforeData = event.data?.before.data();
  const afterData = event.data?.after.data();
  const requestId = event.params.requestId;
  
  if (!beforeData || !afterData) return;
  
  // Check if status changed from 'pending' to 'accepted'
  if (beforeData.status === 'pending' && afterData.status === 'accepted') {
    const fromUserId = afterData.fromUserId;
    const toUserId = afterData.toUserId;
    const toUserDisplayName = afterData.toUserDisplayName;
    
    // Notify the original sender that their request was accepted
    await createNotification({
      recipientId: fromUserId,
      senderId: toUserId,
      senderDisplayName: toUserDisplayName,
      type: 'contact_accepted',
      title: 'Contact request accepted',
      message: `${toUserDisplayName} accepted your contact request`,
      contactRequestId: requestId,
      isRead: false,
      metadata: {
        action: 'contact_accepted',
        timestamp: new Date().toISOString()
      }
    });
    
    console.log(`✅ Contact acceptance notification sent to ${fromUserId} from ${toUserId}`);
  }
});

/**
 * Firestore Trigger: File sharing from unknown users
 * Enhanced to check contact status and create approval notifications
 */
export const onUnknownFileShare = onDocumentUpdated("files/{fileId}", async (event) => {
  const beforeData = event.data?.before.data();
  const afterData = event.data?.after.data();
  const fileId = event.params.fileId;
  
  if (!beforeData || !afterData) return;
  
  const beforeSharedWith: string[] = beforeData.sharedWith || [];
  const afterSharedWith: string[] = afterData.sharedWith || [];
  const ownerId = afterData.owner;
  
  // Get owner's display name
  const ownerDisplayName = await getUserDisplayName(ownerId);
  
  // Find newly added users (shared)
  const newlySharedUsers = afterSharedWith.filter(userId => !beforeSharedWith.includes(userId));
  
  // Check each newly shared user to see if they are connected to the owner
  for (const userId of newlySharedUsers) {
    // Don't notify the owner
    if (userId === ownerId) continue;
    
    // Check if users are connected contacts
    const contactId = [ownerId, userId].sort().join('_');
    const contactDoc = await db.collection('contacts').doc(contactId).get();
    const contact = contactDoc.data();
    
    // If users are not connected or contact is blocked, create approval notification
    if (!contact || contact.status !== 'accepted') {
      // Get recipient's settings
      const recipientSettings = await db.collection('contactSettings').doc(userId).get();
      const settings = recipientSettings.data();
      
      // Check if user allows notifications from unknown users
      if (settings && !settings.notifyOnFileShareFromUnknown) {
        console.log(`📪 File share approval notification skipped - user ${userId} has notifications disabled`);
        continue;
      }
      
      // Check if user blocks unknown users entirely
      if (settings && settings.blockUnknownUsers) {
        console.log(`🚫 File sharing blocked - user ${userId} blocks unknown users`);
        continue;
      }
      
      await createNotification({
        recipientId: userId,
        senderId: ownerId,
        senderDisplayName: ownerDisplayName,
        type: 'file_share_request',
        title: 'File sharing request from unknown user',
        message: `${ownerDisplayName} (not in your contacts) wants to share a file with you`,
        fileId,
        isRead: false,
        metadata: {
          action: 'file_share_request_unknown',
          timestamp: new Date().toISOString(),
          requiresApproval: true
        }
      });
      
      console.log(`🔔 File share approval notification sent to ${userId} from unknown user ${ownerId}`);
    }
  }
});

/**
 * HTTP Function: Mark notification as read
 * Provides secure server-side validation with CORS support
 */
export const markNotificationAsRead = onRequest(async (req, res) => {
  return corsHandler(req, res, async () => {
    try {
      // Handle preflight OPTIONS request
      if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
      }
      
      if (req.method !== 'POST') {
        res.status(405).json({error: 'Method not allowed'});
        return;
      }

      const {notificationId} = req.body;
      
      // Get the Firebase auth token from Authorization header
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({error: 'Unauthorized: Missing or invalid auth token'});
        return;
      }
      
      const token = authHeader.split('Bearer ')[1];
      let uid: string;
      
      try {
        const decodedToken = await admin.auth().verifyIdToken(token);
        uid = decodedToken.uid;
      } catch (error) {
        console.error('Error verifying auth token:', error);
        res.status(401).json({error: 'Unauthorized: Invalid auth token'});
        return;
      }
      
      if (!notificationId) {
        res.status(400).json({error: 'notificationId is required'});
        return;
      }
      
      // Verify notification belongs to the authenticated user
      const notificationDoc = await db.collection('notifications').doc(notificationId).get();
      
      if (!notificationDoc.exists) {
        res.status(404).json({error: 'Notification not found'});
        return;
      }
      
      const notificationData = notificationDoc.data();
      if (notificationData?.recipientId !== uid) {
        res.status(403).json({error: 'You can only delete your own notifications'});
        return;
      }
      
      // Delete the notification instead of marking as read
      await notificationDoc.ref.delete();
      
      console.log(`🗑️ Notification ${notificationId} deleted by user ${uid}`);
      res.status(200).json({success: true});
      
    } catch (error) {
      console.error('Error marking notification as read:', error);
      res.status(500).json({error: 'Internal server error'});
    }
  });
});

/**
 * HTTP Function: Mark all notifications as read for user
 */
export const markAllNotificationsAsRead = onRequest(async (req, res) => {
  return corsHandler(req, res, async () => {
    try {
      // Handle preflight OPTIONS request
      if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
      }
      
      if (req.method !== 'POST') {
        res.status(405).json({error: 'Method not allowed'});
        return;
      }
      
      // Get the Firebase auth token from Authorization header
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({error: 'Unauthorized: Missing or invalid auth token'});
        return;
      }
      
      const token = authHeader.split('Bearer ')[1];
      let uid: string;
      
      try {
        const decodedToken = await admin.auth().verifyIdToken(token);
        uid = decodedToken.uid;
      } catch (error) {
        console.error('Error verifying auth token:', error);
        res.status(401).json({error: 'Unauthorized: Invalid auth token'});
        return;
      }
      
      // Get all unread notifications for user
      const unreadNotifications = await db.collection('notifications')
        .where('recipientId', '==', uid)
        .where('isRead', '==', false)
        .get();
      
      if (unreadNotifications.empty) {
        res.status(200).json({success: true, deleted: 0});
        return;
      }
      
      // Batch delete all unread notifications
      const batch = db.batch();
      let count = 0;
      
      unreadNotifications.docs.forEach((doc) => {
        batch.delete(doc.ref);
        count++;
      });
      
      await batch.commit();
      
      console.log(`🗑️ Deleted ${count} notifications for user ${uid}`);
      res.status(200).json({success: true, deleted: count});
      
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
      res.status(500).json({error: 'Internal server error'});
    }
  });
});

// Log invitation creation for tracking (no email sending)
export const onUserInvitationCreated = onDocumentCreated(
  "userInvitations/{invitationId}",
  async (event) => {
    try {
      const invitation = event.data?.data();
      if (!invitation) return;

      console.log(`📧 Invitation created for ${invitation.toEmail} from ${invitation.fromUserDisplayName} (${invitation.fromUserEmail})`);
      console.log(`🔗 Invitation ID: ${event.params.invitationId}`);
      
      // Log for audit/analytics purposes - no actual email sending
      
    } catch (error) {
      console.error('Error logging invitation creation:', error);
    }
  }
);