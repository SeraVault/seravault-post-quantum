import {onDocumentUpdated, onDocumentCreated, onDocumentDeleted} from "firebase-functions/v2/firestore";
import {onRequest, onCall, HttpsError} from "firebase-functions/v2/https";
import {onSchedule} from "firebase-functions/v2/scheduler";
import {defineSecret} from "firebase-functions/params";
import * as admin from "firebase-admin";
import {FieldValue} from "firebase-admin/firestore";
import cors from "cors";
import * as nodemailer from "nodemailer";
import {renderEmailTemplate} from "./emailTemplates";
import Stripe from 'stripe';
import {getI18n} from "./i18n";

// Define secrets for email credentials
const emailUser = defineSecret('EMAIL_USER');
const emailPassword = defineSecret('EMAIL_PASSWORD');
const stripeSecretKey = defineSecret('STRIPE_SECRET_KEY');

// CORS allowed origins - centralized list
const CORS_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:3000',
  'https://www.seravault.com',
  'https://seravault.com',
  'https://app.seravault.com',
  'https://seravault-8c764.web.app',
  'https://seravault-8c764-app.web.app',
  'https://seravault-8c764.firebaseapp.com'
];

// Configure CORS for web clients
const corsHandler = cors({
  origin: CORS_ORIGINS,
  credentials: true
});

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

// Helper to create email transporter (called at runtime with secret values)
function createEmailTransporter() {
  return nodemailer.createTransport({
    service: 'gmail', // or 'SendGrid', 'Mailgun', etc.
    auth: {
      user: emailUser.value(),
      pass: emailPassword.value(),
    },
  });
}

// Helper to send emails
async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  console.log(`📧 sendEmail called for ${to}`);
  try {
    // In development, just log the email
    if (process.env.FUNCTIONS_EMULATOR === 'true') {
      console.log('📧 [DEV MODE] Would send email:');
      console.log(`To: ${to}`);
      console.log(`Subject: ${subject}`);
      console.log(`Body: ${html}`);
      return;
    }

    // Check if secrets are available
    if (!emailUser.value() || !emailPassword.value()) {
      console.error('❌ Email secrets are missing! Check EMAIL_USER and EMAIL_PASSWORD.');
      throw new Error('Email configuration missing');
    }

    const transporter = createEmailTransporter();
    await transporter.sendMail({
      from: '"SeraVault" <noreply@seravault.app>',
      to,
      subject,
      html,
    });
    console.log(`✅ Email sent to ${to}`);
  } catch (error) {
    console.error(`❌ Error sending email to ${to}:`, error);
    throw error;
  }
}

interface NotificationData {
  recipientId: string;
  senderId: string;
  senderDisplayName?: string;
  type: 'file_shared' | 'file_modified' | 'file_unshared' | 'contact_request' | 'contact_accepted' | 'file_share_request' | 'chat_message' | 'user_invitation';
  title: string;
  message: string;
  fileId?: string;
  fileName?: string;
  contactRequestId?: string;
  conversationId?: string;
  messageId?: string;
  invitationId?: string;
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
 * Get user's language preference from their profile
 */
async function getUserLanguage(userId: string): Promise<string> {
  try {
    const userDoc = await db.collection('users').doc(userId).get();
    if (userDoc.exists) {
      const userData = userDoc.data();
      return userData?.language || 'en';
    }
    return 'en';
  } catch (error) {
    console.error('Error fetching user language:', error);
    return 'en';
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
    
    // Get recipient's language preference
    const userLanguage = await getUserLanguage(userId);
    const t = await getI18n(userLanguage);
    
    await createNotification({
      recipientId: userId,
      senderId: ownerId,
      senderDisplayName: ownerDisplayName,
      type: 'file_shared',
      title: t('fileShared.title'),
      message: t('fileShared.message', { senderName: ownerDisplayName }),
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
    // Get recipient's language preference
    const userLanguage = await getUserLanguage(userId);
    const t = await getI18n(userLanguage);
    
    await createNotification({
      recipientId: userId,
      senderId: ownerId,
      senderDisplayName: modifierDisplayName,
      type: 'file_modified',
      title: t('fileModified.title'),
      message: t('fileModified.message', { senderName: modifierDisplayName }),
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
export const onContactRequest = onDocumentCreated({
  document: "contactRequests/{requestId}",
  secrets: [emailUser, emailPassword], // Bind secrets to this function for email sending
}, async (event) => {
  const requestData = event.data?.data();
  const requestId = event.params.requestId;
  
  if (!requestData) return;
  
  // Skip if this is an invitation (not a request to a registered user)
  // Invitations are handled by onContactRequestCreated function
  if (requestData.isInvitation === true || !requestData.toUserId) {
    console.log('⏭️ Skipping invitation - handled by onContactRequestCreated');
    return;
  }
  
  const fromUserId = requestData.fromUserId;
  const toUserId = requestData.toUserId;
  const fromUserDisplayName = requestData.fromUserDisplayName;
  const fromUserEmail = requestData.fromUserEmail;
  const toUserEmail = requestData.toUserEmail;
  const message = requestData.message || '';
  
  // Check if recipient wants notifications for contact requests
  const recipientSettings = await db.collection('contactSettings').doc(toUserId).get();
  const settings = recipientSettings.data();
  
  if (settings && !settings.notifyOnContactRequest) {
    console.log(`📪 Contact request notification skipped - user ${toUserId} has notifications disabled`);
    return;
  }
  
  // Get recipient's language preference for in-app notification
  const recipientLanguage = await getUserLanguage(toUserId);
  const t = await getI18n(recipientLanguage);
  
  const notificationTitle = t('contactRequest.title');
  const notificationMessage = message 
    ? t('contactRequest.messageWithText', { senderName: fromUserDisplayName, message })
    : t('contactRequest.messageWithoutText', { senderName: fromUserDisplayName });
  
  // Create in-app notification
  await createNotification({
    recipientId: toUserId,
    senderId: fromUserId,
    senderDisplayName: fromUserDisplayName,
    type: 'contact_request',
    title: notificationTitle,
    message: notificationMessage,
    contactRequestId: requestId,
    isRead: false,
    metadata: {
      action: 'contact_request',
      timestamp: new Date().toISOString()
    }
  });
  
  console.log(`📨 Contact request notification sent to ${toUserId} from ${fromUserId}`);
  
  // Send email notification to the recipient
  try {
    console.log(`📧 Attempting to send email to user ${toUserId}`);
    console.log(`🔑 Secrets check - User: ${!!emailUser.value()}, Pass: ${!!emailPassword.value()}`);
    
    const recipientDoc = await db.collection('users').doc(toUserId).get();
    console.log(`🔍 Recipient doc exists: ${recipientDoc.exists}`);
    
    let recipientEmail = toUserEmail;
    let recipientLanguage = 'en';

    if (recipientDoc.exists) {
      const recipientData = recipientDoc.data();
      if (recipientData?.email) {
        recipientEmail = recipientData.email;
      }
      recipientLanguage = recipientData?.language || 'en';
    } else {
      console.warn(`⚠️ Recipient ${toUserId} not found in users collection. Using provided email from request data.`);
    }
      
    console.log(`📧 Recipient email: ${recipientEmail}`);
    
    if (recipientEmail) {
      // Generate contact accept link
      const baseUrl = process.env.APP_URL || 'https://seravault-8c764-app.web.app';
      const contactLink = `${baseUrl}/contacts?request=${requestId}`;
      
      // Email subjects by language
      const subjects: { [key: string]: string } = {
        en: `${fromUserDisplayName} wants to connect on SeraVault`,
        fr: `${fromUserDisplayName} souhaite se connecter sur SeraVault`,
        es: `${fromUserDisplayName} quiere conectarse en SeraVault`
      };
      const subject = subjects[recipientLanguage] || subjects.en;
      
      // Render email template with recipient's language
      const html = renderEmailTemplate('contact-request-email', {
        fromUserDisplayName: fromUserDisplayName,
        fromUserEmail: fromUserEmail,
        contactLink: contactLink,
        message: message,
        hasMessage: !!message,
      }, recipientLanguage);
      
      await sendEmail(recipientEmail, subject, html);
      console.log(`✅ Contact request email sent to ${recipientEmail}`);
    } else {
      console.error(`❌ No email address found for recipient ${toUserId}`);
    }
  } catch (error) {
    console.error('❌ Error sending contact request email:', error);
    // Don't fail the entire function if email fails
  }
  
  // Send FCM push notification to all user's devices
  try {
    const fcmTokensSnapshot = await db.collection('users')
      .doc(toUserId)
      .collection('fcmTokens')
      .get();
    
    if (!fcmTokensSnapshot.empty) {
      const tokens = fcmTokensSnapshot.docs.map(doc => doc.data().token);
      console.log(`📱 Found ${tokens.length} FCM tokens for user ${toUserId}`);
      
      const fcmMessage = {
        notification: {
          title: notificationTitle,
          body: notificationMessage,
          icon: '/favicon.ico',
        },
        data: {
          type: 'contact_request',
          contactRequestId: requestId,
          senderId: fromUserId,
          senderName: fromUserDisplayName,
        },
        tokens: tokens,
      };
      
      const response = await admin.messaging().sendEachForMulticast(fcmMessage);
      console.log(`📱 Sent contact request FCM to ${response.successCount}/${tokens.length} devices`);
      
      // Log detailed error information
      if (response.failureCount > 0) {
        console.error(`❌ FCM failures: ${response.failureCount}/${tokens.length}`);
        const tokensToDelete: string[] = [];
        
        response.responses.forEach((resp, idx) => {
          if (!resp.success) {
            console.error(`❌ FCM error for token ${idx}:`, {
              code: resp.error?.code,
              message: resp.error?.message,
              token: tokens[idx].substring(0, 20) + '...',
            });
            
            if (resp.error?.code === 'messaging/invalid-registration-token' ||
                resp.error?.code === 'messaging/registration-token-not-registered') {
              tokensToDelete.push(tokens[idx]);
            }
          }
        });
        
        if (tokensToDelete.length > 0) {
          const deleteBatch = db.batch();
          tokensToDelete.forEach(token => {
            const tokenRef = db.collection('users')
              .doc(toUserId)
              .collection('fcmTokens')
              .doc(token);
            deleteBatch.delete(tokenRef);
          });
          await deleteBatch.commit();
          console.log(`🗑️ Cleaned up ${tokensToDelete.length} invalid FCM tokens`);
        }
      }
    } else {
      console.log(`📵 No FCM tokens found for user ${toUserId}`);
    }
  } catch (error) {
    console.error('❌ Error sending contact request FCM:', error);
  }
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
    
    // Get recipient's language preference
    const recipientLanguage = await getUserLanguage(fromUserId);
    const t = await getI18n(recipientLanguage);
    
    // Notify the original sender that their request was accepted
    await createNotification({
      recipientId: fromUserId,
      senderId: toUserId,
      senderDisplayName: toUserDisplayName,
      type: 'contact_accepted',
      title: t('contactAccepted.title'),
      message: t('contactAccepted.message', { senderName: toUserDisplayName }),
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
      
      // Get recipient's language preference
      const userLanguage = await getUserLanguage(userId);
      const t = await getI18n(userLanguage);
      
      await createNotification({
        recipientId: userId,
        senderId: ownerId,
        senderDisplayName: ownerDisplayName,
        type: 'file_share_request',
        title: t('fileShareRequest.title'),
        message: t('fileShareRequest.message', { senderName: ownerDisplayName }),
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

// Send invitation email when userInvitation is created
/**
 * Cloud Function triggered when a new contact request is created
 * Handles both registered user requests and email invitations (unified collection)
 * Sets expiration date and sends notification emails
 */
export const onContactRequestCreated = onDocumentCreated(
  {
    document: "contactRequests/{requestId}",
    secrets: [emailUser, emailPassword],
  },
  async (event) => {
    try {
      const request = event.data?.data();
      if (!request || !event.data) return;

      const requestId = event.params.requestId;
      
      console.log(`📧 Contact request created for ${request.toEmail} from ${request.fromUserDisplayName}`);
      console.log(`📝 Is invitation: ${request.isInvitation || false}`);
      console.log(`🔗 Request ID: ${requestId}`);
      
      // Only send email if this is an invitation (not a request to registered user)
      if (!request.isInvitation) {
        console.log('✅ Request to registered user - notification handled by onContactRequest function');
        return;
      }
      
      // Fetch sender's language preference
      let senderLanguage = 'en';
      try {
        const senderDoc = await db.collection('users').doc(request.fromUserId).get();
        if (senderDoc.exists) {
          const senderData = senderDoc.data();
          senderLanguage = senderData?.language || 'en';
          console.log(`📝 Using sender's language: ${senderLanguage}`);
        }
      } catch (error) {
        console.warn('Could not fetch sender language, using default:', error);
      }
      
      // Generate invitation link
      const baseUrl = process.env.APP_URL || 'https://seravault-8c764-app.web.app';
      const inviteLink = `${baseUrl}/signup?invite=${requestId}`;
      
      // Email subjects by language
      const subjects: { [key: string]: string } = {
        en: `${request.fromUserDisplayName} invited you to SeraVault`,
        fr: `${request.fromUserDisplayName} vous a invité sur SeraVault`,
        es: `${request.fromUserDisplayName} te ha invitado a SeraVault`,
        de: `${request.fromUserDisplayName} hat Sie zu SeraVault eingeladen`
      };
      const subject = subjects[senderLanguage] || subjects.en;
      
      // Render email template
      const html = renderEmailTemplate('invitation-email', {
        fromUserDisplayName: request.fromUserDisplayName,
        fromUserEmail: request.fromUserEmail,
        inviteLink: inviteLink,
        message: request.message || '',
        hasMessage: !!request.message,
      }, senderLanguage);
      
      await sendEmail(request.toEmail, subject, html);
      
      console.log(`✅ Invitation email sent to ${request.toEmail}`);
    } catch (error) {
      console.error('Error in onContactRequestCreated:', error);
    }
  }
);

/**
 * Legacy function for userInvitations collection (will be deprecated)
 * Keep for backward compatibility during migration
 */
export const onUserInvitationCreated = onDocumentCreated(
  {
    document: "userInvitations/{invitationId}",
    secrets: [emailUser, emailPassword], // Bind secrets to this function
  },
  async (event) => {
    try {
      const invitation = event.data?.data();
      if (!invitation) return;

      const invitationId = event.params.invitationId;
      
      console.log(`📧 Invitation created for ${invitation.toEmail} from ${invitation.fromUserDisplayName} (${invitation.fromUserEmail})`);
      console.log(`🔗 Invitation ID: ${invitationId}`);
      console.log(`🔑 Secrets check - User: ${!!emailUser.value()}, Pass: ${!!emailPassword.value()}`);
      
      // Fetch sender's language preference
      let senderLanguage = 'en'; // Default to English
      try {
        const senderDoc = await db.collection('users').doc(invitation.fromUserId).get();
        if (senderDoc.exists) {
          const senderData = senderDoc.data();
          senderLanguage = senderData?.language || 'en';
          console.log(`📝 Using sender's language: ${senderLanguage}`);
        }
      } catch (error) {
        console.warn('Could not fetch sender language, using default:', error);
      }
      
      // Generate invitation link - use the app hosting target, not the landing page
      const baseUrl = process.env.APP_URL || 'https://seravault-8c764-app.web.app';
      const inviteLink = `${baseUrl}/signup?invite=${invitationId}`;
      
      // Email subjects by language
      const subjects: { [key: string]: string } = {
        en: `${invitation.fromUserDisplayName} invited you to SeraVault`,
        fr: `${invitation.fromUserDisplayName} vous a invité sur SeraVault`,
        es: `${invitation.fromUserDisplayName} te ha invitado a SeraVault`,
        de: `${invitation.fromUserDisplayName} hat Sie zu SeraVault eingeladen`
      };
      const subject = subjects[senderLanguage] || subjects.en;
      
      // Render email template with sender's language
      const html = renderEmailTemplate('invitation-email', {
        fromUserDisplayName: invitation.fromUserDisplayName,
        fromUserEmail: invitation.fromUserEmail,
        inviteLink: inviteLink,
        message: invitation.message || '',
        // For {{#if message}} conditional
        hasMessage: !!invitation.message,
      }, senderLanguage);
      
      // Send the email
      await sendEmail(invitation.toEmail, subject, html);
      
      console.log(`✅ Invitation email sent to ${invitation.toEmail}`);
      
      // Check if the invited user already has an account
      try {
        const existingUsers = await db.collection('users')
          .where('email', '==', invitation.toEmail)
          .limit(1)
          .get();
        
        if (!existingUsers.empty) {
          // User exists - send them an in-app notification and FCM push notification
          const existingUser = existingUsers.docs[0];
          const userId = existingUser.id;
          
          // Get existing user's language preference
          const existingUserLanguage = await getUserLanguage(userId);
          const t = await getI18n(existingUserLanguage);
          
          const notificationTitle = t('userInvitation.title', { senderName: invitation.fromUserDisplayName });
          const notificationMessage = invitation.message 
            ? t('userInvitation.messageWithText', { message: invitation.message })
            : t('userInvitation.messageWithoutText');
          
          // Create in-app notification
          await createNotification({
            recipientId: userId,
            senderId: invitation.fromUserId,
            senderDisplayName: invitation.fromUserDisplayName,
            type: 'user_invitation',
            title: notificationTitle,
            message: notificationMessage,
            invitationId: invitationId,
            isRead: false,
            metadata: {
              action: 'user_invitation',
              inviteLink: inviteLink,
              timestamp: new Date().toISOString()
            }
          });
          
          console.log(`📲 In-app notification created for existing user ${userId}`);
          
          // Send FCM push notification
          const fcmTokensSnapshot = await db.collection('users')
            .doc(userId)
            .collection('fcmTokens')
            .get();
          
          if (!fcmTokensSnapshot.empty) {
            const tokens = fcmTokensSnapshot.docs.map(doc => doc.data().token);
            
            const fcmMessage = {
              notification: {
                title: notificationTitle,
                body: notificationMessage,
                icon: '/favicon.ico',
              },
              data: {
                type: 'user_invitation',
                invitationId: invitationId,
                senderId: invitation.fromUserId,
                senderName: invitation.fromUserDisplayName,
                inviteLink: inviteLink,
              },
              tokens: tokens,
            };
            
            const response = await admin.messaging().sendEachForMulticast(fcmMessage);
            console.log(`📱 Sent invitation FCM to ${response.successCount}/${tokens.length} devices`);
            
            // Clean up invalid tokens
            if (response.failureCount > 0) {
              const tokensToDelete: string[] = [];
              response.responses.forEach((resp, idx) => {
                if (!resp.success && 
                    (resp.error?.code === 'messaging/invalid-registration-token' ||
                     resp.error?.code === 'messaging/registration-token-not-registered')) {
                  tokensToDelete.push(tokens[idx]);
                }
              });
              
              if (tokensToDelete.length > 0) {
                const deleteBatch = db.batch();
                tokensToDelete.forEach(token => {
                  const tokenRef = db.collection('users')
                    .doc(userId)
                    .collection('fcmTokens')
                    .doc(token);
                  deleteBatch.delete(tokenRef);
                });
                await deleteBatch.commit();
                console.log(`🗑️ Cleaned up ${tokensToDelete.length} invalid FCM tokens`);
              }
            }
          } else {
            console.log(`📵 No FCM tokens found for user ${userId}`);
          }
        } else {
          console.log(`📧 User with email ${invitation.toEmail} not found - email only sent`);
        }
      } catch (error) {
        console.error('⚠️ Error checking for existing user:', error);
      }
      
    } catch (error) {
      console.error('Error sending invitation email:', error);
      // Don't throw - we don't want to fail the invitation creation if email fails
    }
  }
);

/**
 * Firestore Trigger: Invitation Accepted
 * Automatically creates a contact connection when an invitation is accepted
 */
export const onInvitationAccepted = onDocumentUpdated("userInvitations/{invitationId}", async (event) => {
  const beforeData = event.data?.before.data();
  const afterData = event.data?.after.data();
  const invitationId = event.params.invitationId;

  if (!beforeData || !afterData) return;

  // Check if status changed to accepted
  if (beforeData.status !== 'accepted' && afterData.status === 'accepted') {
    const inviterId = afterData.fromUserId;
    const inviteeId = afterData.acceptedByUserId;

    if (!inviterId || !inviteeId) {
      console.error(`❌ Invitation ${invitationId} accepted but missing user IDs`);
      return;
    }

    console.log(`🤝 Invitation accepted: ${inviterId} invited ${inviteeId}`);

    try {
      // 1. Get user profiles to ensure we have correct display names
      const [inviterDoc, inviteeDoc] = await Promise.all([
        db.collection('users').doc(inviterId).get(),
        db.collection('users').doc(inviteeId).get()
      ]);

      const inviterData = inviterDoc.data();
      const inviteeData = inviteeDoc.data();

      const inviterEmail = inviterData?.email || afterData.fromUserEmail;
      const inviterName = inviterData?.displayName || afterData.fromUserDisplayName;
      
      const inviteeEmail = inviteeData?.email || afterData.toEmail;
      const inviteeName = inviteeData?.displayName || inviteeEmail;

      // 2. Create Contact ID (lexicographically sorted)
      const [userId1, userId2] = [inviterId, inviteeId].sort();
      const contactId = `${userId1}_${userId2}`;

      // 3. Create Contact Document
      const contactData = {
        userId1,
        userId2,
        user1Email: userId1 === inviterId ? inviterEmail : inviteeEmail,
        user2Email: userId2 === inviterId ? inviterEmail : inviteeEmail,
        user1DisplayName: userId1 === inviterId ? inviterName : inviteeName,
        user2DisplayName: userId2 === inviterId ? inviterName : inviteeName,
        status: 'accepted',
        initiatorUserId: inviterId, // The inviter initiated the connection via invitation
        createdAt: FieldValue.serverTimestamp(),
        acceptedAt: FieldValue.serverTimestamp(),
        lastInteractionAt: FieldValue.serverTimestamp(),
        metadata: {
          source: 'invitation',
          invitationId: invitationId,
          autoAccepted: true
        }
      };

      await db.collection('contacts').doc(contactId).set(contactData);
      console.log(`✅ Auto-created contact connection: ${contactId}`);

      // 4. Notify the inviter that their invitation was accepted
      // Get inviter's language preference
      const inviterLanguage = await getUserLanguage(inviterId);
      const t = await getI18n(inviterLanguage);
      
      await createNotification({
        recipientId: inviterId,
        senderId: inviteeId,
        senderDisplayName: inviteeName,
        type: 'contact_accepted',
        title: t('invitationAccepted.title'),
        message: t('invitationAccepted.message', { senderName: inviteeName }),
        invitationId: invitationId,
        isRead: false,
        metadata: {
          action: 'invitation_accepted',
          timestamp: new Date().toISOString()
        }
      });

    } catch (error) {
      console.error('❌ Error processing accepted invitation:', error);
    }
  }
});

/**
 * Firestore Trigger: Chat message notifications
 * Sends notifications to participants when new messages are added
 * - Only notifies users who don't have the chat open
 * - Removes previous unread notifications from the same conversation to avoid overwhelming
 */
export const onChatMessageCreated = onDocumentCreated(
  "files/{chatId}/messages/{messageId}",
  async (event) => {
    try {
      const messageData = event.data?.data();
      const chatId = event.params.chatId;
      const messageId = event.params.messageId;
      
      if (!messageData) return;
      
      const senderId = messageData.senderId;
      
      // Get sender's display name from their profile
      let senderName = 'Someone';
      try {
        const senderDoc = await db.collection('users').doc(senderId).get();
        if (senderDoc.exists) {
          const senderData = senderDoc.data();
          senderName = senderData?.displayName || senderData?.email || 'Someone';
        }
      } catch (error) {
        console.error(`⚠️ Failed to fetch sender name:`, error);
      }
      
      // Get the chat document to find all participants
      const chatDoc = await db.collection('files').doc(chatId).get();
      if (!chatDoc.exists) {
        console.log(`⚠️ Chat ${chatId} not found`);
        return;
      }
      
      const chatData = chatDoc.data();
      if (!chatData || chatData.fileType !== 'chat') {
        console.log(`⚠️ Document ${chatId} is not a chat`);
        return;
      }
      
      const participants: string[] = chatData.participants || [];
      const chatType = chatData.type || 'individual';
      
      // Get active chat sessions to check who has the chat open
      // Simplified query to avoid index requirement - get all sessions and filter by time in code
      const activeSessionsSnapshot = await db.collection('activeChatSessions')
        .where('chatId', '==', chatId)
        .get();
      
      // Filter sessions to only those active within last 5 minutes
      const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
      const usersWithChatOpen = new Set<string>();
      
      activeSessionsSnapshot.docs.forEach(doc => {
        const sessionData = doc.data();
        const sessionTimestamp = sessionData.timestamp?.toDate?.()?.getTime() || 0;
        if (sessionTimestamp > fiveMinutesAgo) {
          usersWithChatOpen.add(sessionData.userId);
        }
      });
      
      console.log(`💬 New message in chat ${chatId} from ${senderName}`);
      console.log(`👥 Participants: ${participants.length}, Active: ${usersWithChatOpen.size}`);
      
      // Notify each participant (except the sender and those with chat open)
      for (const participantId of participants) {
        // Skip the sender
        if (participantId === senderId) continue;
        
        // Skip if user has chat open
        if (usersWithChatOpen.has(participantId)) {
          console.log(`⏭️ Skipping notification for ${participantId} - chat is open`);
          continue;
        }
        
        // Remove previous unread chat notifications from this conversation
        const previousNotifications = await db.collection('notifications')
          .where('recipientId', '==', participantId)
          .where('conversationId', '==', chatId)
          .where('type', '==', 'chat_message')
          .where('isRead', '==', false)
          .get();
        
        // Delete previous notifications
        const batch = db.batch();
        previousNotifications.docs.forEach(doc => {
          batch.delete(doc.ref);
        });
        
        if (!previousNotifications.empty) {
          await batch.commit();
          console.log(`🗑️ Removed ${previousNotifications.size} previous notifications for ${participantId}`);
        }
        
        // Get recipient's language preference
        const participantLanguage = await getUserLanguage(participantId);
        const t = await getI18n(participantLanguage);
        
        // Create new notification
        const notificationTitle = chatType === 'group' 
          ? t('chatMessage.groupTitle')
          : t('chatMessage.individualTitle', { senderName });
        
        const notificationMessage = chatType === 'group'
          ? t('chatMessage.groupMessage', { senderName })
          : t('chatMessage.individualMessage');
        
        await createNotification({
          recipientId: participantId,
          senderId: senderId,
          senderDisplayName: senderName,
          type: 'chat_message',
          title: notificationTitle,
          message: notificationMessage,
          conversationId: chatId,
          messageId: messageId,
          isRead: false,
          metadata: {
            chatType: chatType,
            timestamp: new Date().toISOString()
          }
        });
        
        console.log(`✅ Chat notification created for ${participantId}`);
        
        // Send FCM push notification to all user's devices
        try {
          const fcmTokensSnapshot = await db.collection('users')
            .doc(participantId)
            .collection('fcmTokens')
            .get();
          
          if (!fcmTokensSnapshot.empty) {
            const tokens = fcmTokensSnapshot.docs.map(doc => doc.data().token);
            
            // Send to all tokens
            const fcmMessage = {
              notification: {
                title: notificationTitle,
                body: notificationMessage,
                icon: '/favicon.ico',
              },
              data: {
                type: 'chat_message',
                conversationId: chatId,
                messageId: messageId,
                senderId: senderId,
                senderName: senderName,
              },
              tokens: tokens,
            };
            
            const response = await admin.messaging().sendEachForMulticast(fcmMessage);
            console.log(`📱 Sent FCM to ${response.successCount}/${tokens.length} devices for ${participantId}`);
            
            // Clean up invalid tokens
            if (response.failureCount > 0) {
              const tokensToDelete: string[] = [];
              response.responses.forEach((resp, idx) => {
                if (!resp.success && 
                    (resp.error?.code === 'messaging/invalid-registration-token' ||
                     resp.error?.code === 'messaging/registration-token-not-registered')) {
                  tokensToDelete.push(tokens[idx]);
                }
              });
              
              // Delete invalid tokens
              const deleteBatch = db.batch();
              tokensToDelete.forEach(token => {
                const tokenRef = db.collection('users')
                  .doc(participantId)
                  .collection('fcmTokens')
                  .doc(token);
                deleteBatch.delete(tokenRef);
              });
              
              if (tokensToDelete.length > 0) {
                await deleteBatch.commit();
                console.log(`🗑️ Cleaned up ${tokensToDelete.length} invalid FCM tokens`);
              }
            }
          } else {
            console.log(`📵 No FCM tokens found for ${participantId}`);
          }
        } catch (fcmError) {
          console.error(`❌ Error sending FCM to ${participantId}:`, fcmError);
          // Don't fail the whole function if FCM fails
        }
      }
      
    } catch (error) {
      console.error('❌ Error creating chat notification:', error);
    }
  }
);

/**
 * Callable Cloud Function to delete a user's account and all associated data.
 * This function performs server-side deletion with elevated privileges to ensure
 * complete data removal including cleanup of shared files references.
 */
export const deleteUserAccount = onCall(
  {
    cors: CORS_ORIGINS
  },
  async (request) => {
    // Verify the user is authenticated
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated to delete their account');
    }

    const userId = request.auth.uid;
    console.log(`🗑️ Starting account deletion for user: ${userId}`);

    try {
      const results = {
        storageFiles: 0,
        fileRecords: 0,
        folders: 0,
        contacts: 0,
        contactRequests: 0,
        groups: 0,
        notifications: 0,
        conversations: 0,
        sharedFilesCleaned: 0,
        profile: false,
        auth: false
      };

      // 1. Delete user's storage files and folder
      try {
        const bucket = admin.storage().bucket();
        const [files] = await bucket.getFiles({prefix: `files/${userId}/`});
        
        console.log(`Found ${files.length} storage files to delete`);
        
        // Delete all files in batches to avoid timeout
        const deletePromises = files.map(file => 
          file.delete().catch(err => {
            console.error(`Failed to delete ${file.name}:`, err);
            return null;
          })
        );
        
        await Promise.all(deletePromises);
        results.storageFiles = files.length;
        
        console.log(`✅ Deleted ${results.storageFiles} storage files from files/${userId}/`);
      } catch (error) {
        console.error('❌ Error deleting storage files:', error);
      }

      // 2. Delete file records
      try {
        const filesSnapshot = await db.collection('files')
          .where('owner', '==', userId)
          .get();
        
        const batch = db.batch();
        let batchCount = 0;

        // Process files - use recursive delete for chats to clean subcollections (messages)
        for (const doc of filesSnapshot.docs) {
          const data = doc.data();
          if (data.fileType === 'chat') {
            try {
              await db.recursiveDelete(doc.ref);
              results.fileRecords++;
            } catch (e) {
              console.error(`Failed to delete chat ${doc.id}:`, e);
            }
          } else {
            batch.delete(doc.ref);
            batchCount++;
            results.fileRecords++;
          }
        }
        
        if (batchCount > 0) {
          await batch.commit();
        }
        console.log(`✅ Deleted ${results.fileRecords} file records`);
      } catch (error) {
        console.error('❌ Error deleting file records:', error);
      }

      // 3. Delete folders
      try {
        const foldersSnapshot = await db.collection('folders')
          .where('owner', '==', userId)
          .get();
        
        const batch = db.batch();
        foldersSnapshot.docs.forEach(doc => {
          batch.delete(doc.ref);
          results.folders++;
        });
        
        if (results.folders > 0) {
          await batch.commit();
        }
        console.log(`✅ Deleted ${results.folders} folders`);
      } catch (error) {
        console.error('❌ Error deleting folders:', error);
      }

      // 3b. Delete custom form templates
      try {
        const templatesSnapshot = await db.collection('formTemplates')
          .where('author', '==', userId)
          .get();
        
        const batch = db.batch();
        let templatesDeleted = 0;
        templatesSnapshot.docs.forEach(doc => {
          batch.delete(doc.ref);
          templatesDeleted++;
        });
        
        if (templatesDeleted > 0) {
          await batch.commit();
        }
        console.log(`✅ Deleted ${templatesDeleted} custom form templates`);
      } catch (error) {
        console.error('❌ Error deleting form templates:', error);
      }

      // 4. Delete contacts (user's contact list)
      try {
        const contactsSnapshot = await db.collection('contacts')
          .where(admin.firestore.Filter.or(
            admin.firestore.Filter.where('userId1', '==', userId),
            admin.firestore.Filter.where('userId2', '==', userId)
          ))
          .get();
        
        const batch = db.batch();
        contactsSnapshot.docs.forEach(doc => {
          batch.delete(doc.ref);
          results.contacts++;
        });
        
        // Also delete contact settings
        const settingsRef = db.collection('contactSettings').doc(userId);
        batch.delete(settingsRef);
        
        if (results.contacts > 0) {
          await batch.commit();
        } else {
          // Commit just the settings deletion if no contacts
          await settingsRef.delete();
        }
        console.log(`✅ Deleted ${results.contacts} contacts and contact settings`);
      } catch (error) {
        console.error('❌ Error deleting contacts:', error);
      }

      // 4b. Remove user from other users' contact lists
      try {
        const otherUsersContactsSnapshot = await db.collection('contacts')
          .where('contactId', '==', userId)
          .get();
        
        const batch = db.batch();
        let otherContactsRemoved = 0;
        otherUsersContactsSnapshot.docs.forEach(doc => {
          batch.delete(doc.ref);
          otherContactsRemoved++;
        });
        
        if (otherContactsRemoved > 0) {
          await batch.commit();
        }
        console.log(`✅ Removed user from ${otherContactsRemoved} other users' contact lists`);
      } catch (error) {
        console.error('❌ Error removing user from other contact lists:', error);
      }

      // 5. Delete contact requests (sent and received)
      try {
        const sentRequests = await db.collection('contactRequests')
          .where('fromUserId', '==', userId)
          .get();
        
        const receivedRequests = await db.collection('contactRequests')
          .where('toUserId', '==', userId)
          .get();
        
        const batch = db.batch();
        [...sentRequests.docs, ...receivedRequests.docs].forEach(doc => {
          batch.delete(doc.ref);
          results.contactRequests++;
        });
        
        if (results.contactRequests > 0) {
          await batch.commit();
        }
        console.log(`✅ Deleted ${results.contactRequests} contact requests`);
      } catch (error) {
        console.error('❌ Error deleting contact requests:', error);
      }

      // 6. Delete groups
      try {
        const groupsSnapshot = await db.collection('groups')
          .where('owner', '==', userId)
          .get();
        
        const batch = db.batch();
        groupsSnapshot.docs.forEach(doc => {
          batch.delete(doc.ref);
          results.groups++;
        });
        
        if (results.groups > 0) {
          await batch.commit();
        }
        console.log(`✅ Deleted ${results.groups} groups`);
      } catch (error) {
        console.error('❌ Error deleting groups:', error);
      }

      // 7. Delete notifications
      try {
        const notificationsSnapshot = await db.collection('notifications')
          .where('recipientId', '==', userId)
          .get();
        
        const batch = db.batch();
        notificationsSnapshot.docs.forEach(doc => {
          batch.delete(doc.ref);
          results.notifications++;
        });
        
        if (results.notifications > 0) {
          await batch.commit();
        }
        console.log(`✅ Deleted ${results.notifications} notifications`);
      } catch (error) {
        console.error('❌ Error deleting notifications:', error);
      }

      // 8. Delete conversations
      try {
        const conversationsSnapshot = await db.collection('conversations')
          .where('participants', 'array-contains', userId)
          .get();
        
        // Use recursive delete to ensure messages subcollection is removed
        for (const doc of conversationsSnapshot.docs) {
          try {
            await db.recursiveDelete(doc.ref);
            results.conversations++;
          } catch (e) {
            console.error(`Failed to delete conversation ${doc.id}:`, e);
          }
        }
        
        console.log(`✅ Deleted ${results.conversations} conversations`);
      } catch (error) {
        console.error('❌ Error deleting conversations:', error);
      }

      // 9. Remove user from sharedWith arrays AND encryptedKeys in files
      try {
        const sharedFilesSnapshot = await db.collection('files')
          .where('sharedWith', 'array-contains', userId)
          .get();
        
        const batch = db.batch();
        sharedFilesSnapshot.docs.forEach(doc => {
          const data = doc.data();
          const updates: any = {
            sharedWith: FieldValue.arrayRemove(userId)
          };
          
          // Remove user's encryption key from encryptedKeys object
          if (data.encryptedKeys && data.encryptedKeys[userId]) {
            updates[`encryptedKeys.${userId}`] = FieldValue.delete();
          }
          
          batch.update(doc.ref, updates);
          results.sharedFilesCleaned++;
        });
        
        if (results.sharedFilesCleaned > 0) {
          await batch.commit();
        }
        console.log(`✅ Cleaned user from ${results.sharedFilesCleaned} shared files (sharedWith + encryptedKeys)`);
      } catch (error) {
        console.error('❌ Error cleaning shared files:', error);
      }

      // 9b. Remove user's encryptedKeys from conversations
      try {
        const conversationKeysSnapshot = await db.collection('conversations')
          .get();
        
        const batch = db.batch();
        let conversationKeysCleaned = 0;
        
        conversationKeysSnapshot.docs.forEach(doc => {
          const data = doc.data();
          if (data.encryptedKeys && data.encryptedKeys[userId]) {
            batch.update(doc.ref, {
              [`encryptedKeys.${userId}`]: FieldValue.delete()
            });
            conversationKeysCleaned++;
          }
        });
        
        if (conversationKeysCleaned > 0) {
          await batch.commit();
        }
        console.log(`✅ Removed user's encryption keys from ${conversationKeysCleaned} conversations`);
      } catch (error) {
        console.error('❌ Error cleaning conversation keys:', error);
      }

      // 9c. Delete user invitations (sent and received)
      try {
        const sentInvitations = await db.collection('userInvitations')
          .where('fromUserId', '==', userId)
          .get();
        
        const receivedInvitations = await db.collection('userInvitations')
          .where('toEmail', '==', request.auth?.token.email || '')
          .get();
        
        const batch = db.batch();
        let invitationsDeleted = 0;
        
        [...sentInvitations.docs, ...receivedInvitations.docs].forEach(doc => {
          batch.delete(doc.ref);
          invitationsDeleted++;
        });
        
        if (invitationsDeleted > 0) {
          await batch.commit();
        }
        console.log(`✅ Deleted ${invitationsDeleted} user invitations`);
      } catch (error) {
        console.error('❌ Error deleting user invitations:', error);
      }

      // 10. Cancel Stripe subscriptions and delete customer
      try {
        const customerDoc = await db.collection('customers').doc(userId).get();
        
        if (customerDoc.exists) {
          const customerData = customerDoc.data();
          const stripeCustomerId = customerData?.stripeId;
          
          if (stripeCustomerId) {
            const stripe = new Stripe(stripeSecretKey.value(), {
              apiVersion: '2024-12-18'
            });
            
            // Get all active subscriptions for this customer
            const subscriptions = await stripe.subscriptions.list({
              customer: stripeCustomerId,
              status: 'active'
            });
            
            // Cancel each active subscription
            for (const subscription of subscriptions.data) {
              await stripe.subscriptions.cancel(subscription.id);
              console.log(`✅ Cancelled Stripe subscription: ${subscription.id}`);
            }
            
            // Delete the Stripe customer
            await stripe.customers.del(stripeCustomerId);
            console.log(`✅ Deleted Stripe customer: ${stripeCustomerId}`);
          }
          
          // Delete the Firestore customer document and its subcollections
          const batch = db.batch();
          
          // Delete checkout_sessions subcollection
          const checkoutSessionsSnapshot = await db.collection('customers')
            .doc(userId)
            .collection('checkout_sessions')
            .get();
          checkoutSessionsSnapshot.docs.forEach(doc => {
            batch.delete(doc.ref);
          });
          
          // Delete subscriptions subcollection
          const subscriptionsSnapshot = await db.collection('customers')
            .doc(userId)
            .collection('subscriptions')
            .get();
          subscriptionsSnapshot.docs.forEach(doc => {
            batch.delete(doc.ref);
          });
          
          // Delete payments subcollection
          const paymentsSnapshot = await db.collection('customers')
            .doc(userId)
            .collection('payments')
            .get();
          paymentsSnapshot.docs.forEach(doc => {
            batch.delete(doc.ref);
          });

          // Delete invoices subcollection
          const invoicesSnapshot = await db.collection('customers')
            .doc(userId)
            .collection('invoices')
            .get();
          invoicesSnapshot.docs.forEach(doc => {
            batch.delete(doc.ref);
          });

          // Delete payment_methods subcollection
          const paymentMethodsSnapshot = await db.collection('customers')
            .doc(userId)
            .collection('payment_methods')
            .get();
          paymentMethodsSnapshot.docs.forEach(doc => {
            batch.delete(doc.ref);
          });
          
          await batch.commit();
          
          // Delete the customer document
          await customerDoc.ref.delete();
          console.log('✅ Deleted Stripe customer data from Firestore');
        }
      } catch (error) {
        console.error('❌ Error deleting Stripe customer:', error);
        // Don't throw - continue with other deletions
      }

      // 11. Delete user profile document
      try {
        await db.collection('users').doc(userId).delete();
        results.profile = true;
        console.log('✅ Deleted user profile');
      } catch (error) {
        console.error('❌ Error deleting user profile:', error);
      }

      // 12. Delete FCM tokens subcollection
      try {
        const tokensSnapshot = await db.collection('users')
          .doc(userId)
          .collection('fcmTokens')
          .get();
        
        const batch = db.batch();
        tokensSnapshot.docs.forEach(doc => {
          batch.delete(doc.ref);
        });
        
        if (tokensSnapshot.size > 0) {
          await batch.commit();
        }
        console.log(`✅ Deleted ${tokensSnapshot.size} FCM tokens`);
      } catch (error) {
        console.error('❌ Error deleting FCM tokens:', error);
      }

      // 13. Delete Firebase Auth account
      try {
        await admin.auth().deleteUser(userId);
        results.auth = true;
        console.log('✅ Deleted Firebase Auth account');
      } catch (error) {
        console.error('❌ Error deleting auth account:', error);
        throw new HttpsError('internal', 'Failed to delete authentication account');
      }

      console.log(`✅ Account deletion completed for user: ${userId}`);
      return {
        success: true,
        message: 'Account successfully deleted',
        results
      };

    } catch (error) {
      console.error('❌ Account deletion failed:', error);
      throw new HttpsError(
        'internal',
        error instanceof Error ? error.message : 'Failed to delete account'
      );
    }
  }
);

/**
 * Calculate storage usage for a user
 * Much faster than client-side calculation since it runs server-side
 * Includes regular files, form files, and chat file attachments
 */
export const calculateStorageUsage = onCall(
  { 
    cors: CORS_ORIGINS
  },
  async (request) => {
    const userId = request.auth?.uid;
    
    if (!userId) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    try {
      // Get all files owned by the user (includes regular files and form files)
      const filesSnapshot = await db.collection('files')
        .where('owner', '==', userId)
        .select('storagePath')  // Only fetch the storagePath field for efficiency
        .get();

      const fileStoragePaths: string[] = [];

      for (const doc of filesSnapshot.docs) {
        const storagePath = doc.data().storagePath;
        if (storagePath) {
          fileStoragePaths.push(storagePath);
        }
      }

      // Get all conversations where user is a participant (to find chat file attachments)
      const conversationsSnapshot = await db.collection('files')
        .where('fileType', '==', 'chat')
        .where('participants', 'array-contains', userId)
        .get();

      // For each conversation, get messages with file attachments
      const chatFilePromises = conversationsSnapshot.docs.map(async (convDoc) => {
        const messagesSnapshot = await db.collection('files')
          .doc(convDoc.id)
          .collection('messages')
          .where('type', '==', 'file')
          .get();

        const storagePaths: string[] = [];
        for (const msgDoc of messagesSnapshot.docs) {
          const fileMetadata = msgDoc.data().fileMetadata;
          // Only count files uploaded by this user (they own the storage)
          if (fileMetadata?.storagePath && msgDoc.data().senderId === userId) {
            storagePaths.push(fileMetadata.storagePath);
          }
        }
        return storagePaths;
      });

      const chatFilePaths = (await Promise.all(chatFilePromises)).flat();
      const allStoragePaths = [...fileStoragePaths, ...chatFilePaths];

      console.log(`📊 User ${userId}: Found ${fileStoragePaths.length} regular files + ${chatFilePaths.length} chat attachments = ${allStoragePaths.length} total`);

      // Get file sizes from storage metadata
      const bucket = admin.storage().bucket();
      const sizePromises = allStoragePaths.map(async (storagePath) => {
        try {
          const file = bucket.file(storagePath);
          const [metadata] = await file.getMetadata();
          return parseInt(metadata.size as string) || 0;
        } catch (error) {
          console.warn(`Failed to get size for ${storagePath}:`, error);
          return 0;
        }
      });

      const sizes = await Promise.all(sizePromises);
      const totalBytes = sizes.reduce((sum, size) => sum + size, 0);

      return {
        usedBytes: totalBytes,
        fileCount: allStoragePaths.length,
      };

    } catch (error) {
      console.error('Failed to calculate storage usage:', error);
      throw new HttpsError(
        'internal',
        error instanceof Error ? error.message : 'Failed to calculate storage usage'
      );
    }
  }
);

/**
 * Update user storage usage when a file is created
 * Maintains a running total in the user's profile
 * ALSO ENFORCES QUOTA - deletes file if it exceeds the user's plan limit
 */
export const updateStorageOnFileCreate = onDocumentCreated(
  {
    document: "files/{fileId}",
    region: "us-central1",
  },
  async (event) => {
    try {
      const fileData = event.data?.data();
      if (!fileData) return;

      const owner = fileData.owner;
      const storagePath = fileData.storagePath;
      const fileId = event.params.fileId;

      // Only process files with actual storage (skip conversation records, etc.)
      if (!owner || !storagePath) return;

      // Get file size from Storage metadata
      const bucket = admin.storage().bucket();
      const file = bucket.file(storagePath);

      const [metadata] = await file.getMetadata();
      const fileSize = typeof metadata.size === 'number' ? metadata.size : parseInt(metadata.size || '0');

      if (fileSize === 0) return;

      // Update user's storage usage atomically (informational only)
      const userRef = db.collection('users').doc(owner);
      await userRef.set(
        {
          storageUsed: FieldValue.increment(fileSize),
          storageUpdatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      console.log(`✅ Added ${fileSize} bytes to user ${owner} storage (file created).`);
    } catch (error) {
      console.error('Error updating storage on file create:', error);
      // Don't throw - we don't want to fail the file creation
    }
  }
);

/**
 * Update user storage usage when a file is updated
 * Handles storage path changes (file content updates)
 */
export const updateStorageOnFileUpdate = onDocumentUpdated(
  {
    document: "files/{fileId}",
    region: "us-central1",
  },
  async (event) => {
    try {
      const beforeData = event.data?.before.data();
      const afterData = event.data?.after.data();
      
      if (!beforeData || !afterData) return;

      const owner = afterData.owner;
      if (!owner) return;

      const oldStoragePath = beforeData.storagePath;
      const newStoragePath = afterData.storagePath;

      // Only update if storage path changed (content was updated)
      if (oldStoragePath === newStoragePath) return;

      const bucket = admin.storage().bucket();
      
      // Get old file size
      let oldSize = 0;
      if (oldStoragePath) {
        try {
          const oldFile = bucket.file(oldStoragePath);
          const [oldMetadata] = await oldFile.getMetadata();
          oldSize = typeof oldMetadata.size === 'number' ? oldMetadata.size : parseInt(oldMetadata.size || '0');
        } catch (error) {
          console.warn(`Could not get old file size for ${oldStoragePath}:`, error);
        }
      }

      // Get new file size
      let newSize = 0;
      if (newStoragePath) {
        try {
          const newFile = bucket.file(newStoragePath);
          const [newMetadata] = await newFile.getMetadata();
          newSize = typeof newMetadata.size === 'number' ? newMetadata.size : parseInt(newMetadata.size || '0');
        } catch (error) {
          console.warn(`Could not get new file size for ${newStoragePath}:`, error);
        }
      }

      const sizeDelta = newSize - oldSize;
      if (sizeDelta === 0) return;

      // Update user's storage usage atomically
      const userRef = db.collection('users').doc(owner);
      await userRef.set(
        {
          storageUsed: FieldValue.increment(sizeDelta),
          storageUpdatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      console.log(`✅ Updated user ${owner} storage by ${sizeDelta} bytes (file updated)`);
    } catch (error) {
      console.error('Error updating storage on file update:', error);
      // Don't throw - we don't want to fail the file update
    }
  }
);

/**
 * Update user storage usage when a file is deleted
 * Decrements the storage usage
 */
export const updateStorageOnFileDelete = onDocumentUpdated(
  {
    document: "files/{fileId}",
    region: "us-central1",
  },
  async (event) => {
    try {
      const beforeData = event.data?.before.data();
      const afterData = event.data?.after.data();
      
      // Check if this is a deletion (document still exists but marked for deletion)
      // Or handle actual document deletion with onDocumentDeleted if needed
      if (!beforeData || afterData) return;

      const owner = beforeData.owner;
      const storagePath = beforeData.storagePath;

      if (!owner || !storagePath) return;

      // Get file size from Storage metadata
      const bucket = admin.storage().bucket();
      const file = bucket.file(storagePath);
      
      try {
        const [metadata] = await file.getMetadata();
        const fileSize = typeof metadata.size === 'number' ? metadata.size : parseInt(metadata.size || '0');

        if (fileSize === 0) return;

        // Update user's storage usage atomically
        const userRef = db.collection('users').doc(owner);
        await userRef.set(
          {
            storageUsed: FieldValue.increment(-fileSize),
            storageUpdatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );

        console.log(`✅ Removed ${fileSize} bytes from user ${owner} storage (file deleted)`);
      } catch (error) {
        // File might already be deleted from storage, that's okay
        console.warn(`Could not get file size for ${storagePath}:`, error);
      }
    } catch (error) {
      console.error('Error updating storage on file delete:', error);
      // Don't throw - we don't want to fail the file deletion
    }
  }
);

/**
 * Update user storage usage when a file document is actually deleted
 * This handles the case where the Firestore document is deleted (not just updated)
 */
export const decrementStorageOnFileDelete = onDocumentDeleted(
  {
    document: "files/{fileId}",
    region: "us-central1",
  },
  async (event) => {
    try {
      const deletedData = event.data?.data();
      
      if (!deletedData) {
        console.warn('No data found in deleted file document');
        return;
      }

      const owner = deletedData.owner;
      const storagePath = deletedData.storagePath;

      if (!owner || !storagePath) {
        console.warn('Missing owner or storagePath in deleted file');
        return;
      }

      // Get file size from Storage metadata
      const bucket = admin.storage().bucket();
      const file = bucket.file(storagePath);
      
      try {
        const [metadata] = await file.getMetadata();
        const fileSize = typeof metadata.size === 'number' ? metadata.size : parseInt(metadata.size || '0');

        if (fileSize === 0) {
          console.log('File size is 0, skipping storage decrement');
          return;
        }

        // Update user's storage usage atomically
        const userRef = db.collection('users').doc(owner);
        await userRef.set(
          {
            storageUsed: FieldValue.increment(-fileSize),
            storageUpdatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );

        console.log(`✅ Removed ${fileSize} bytes from user ${owner} storage after file deletion (fileId: ${event.params.fileId})`);
      } catch (error) {
        // File might already be deleted from storage, that's okay
        // This can happen if the storage file was deleted before the Firestore document
        console.warn(`Could not get file size for ${storagePath} (may already be deleted):`, error);
        // We still want to log this as a deletion event
        console.log(`File document deleted for user ${owner}, but storage file already gone`);
      }
    } catch (error) {
      console.error('Error updating storage on file document delete:', error);
      // Don't throw - we don't want to fail the file deletion
    }
  }
);

/**
 * Calculate the size of a Firestore document in bytes
 */
function calculateDocumentSize(data: any): number {
  // Firebase calculates document size as:
  // - Each field name: length in bytes
  // - Each field value: depends on type
  // - Document name: 16 bytes
  // - Plus overhead for indexing
  
  let size = 32; // Base overhead (document name + metadata)
  
  function calculateFieldSize(key: string, value: any): number {
    let fieldSize = key.length; // Field name size
    
    if (value === null || value === undefined) {
      fieldSize += 1;
    } else if (typeof value === 'boolean') {
      fieldSize += 1;
    } else if (typeof value === 'number') {
      fieldSize += 8;
    } else if (typeof value === 'string') {
      fieldSize += value.length + 1;
    } else if (value instanceof Date) {
      fieldSize += 8;
    } else if (Array.isArray(value)) {
      value.forEach((item, index) => {
        fieldSize += calculateFieldSize(index.toString(), item);
      });
    } else if (typeof value === 'object') {
      Object.entries(value).forEach(([nestedKey, nestedValue]) => {
        fieldSize += calculateFieldSize(nestedKey, nestedValue);
      });
    } else {
      // Unknown type, estimate as string
      fieldSize += JSON.stringify(value).length;
    }
    
    return fieldSize;
  }
  
  if (data && typeof data === 'object') {
    Object.entries(data).forEach(([key, value]) => {
      size += calculateFieldSize(key, value);
    });
  }
  
  return size;
}

/**
 * Update user Firestore document usage when a file document is created
 */
export const updateFirestoreOnFileCreate = onDocumentCreated(
  {
    document: "files/{fileId}",
    region: "us-central1",
  },
  async (event) => {
    try {
      const fileData = event.data?.data();
      if (!fileData) return;

      const owner = fileData.owner;
      if (!owner) return;

      // Calculate document size
      const docSize = calculateDocumentSize(fileData);

      // Update user's Firestore usage atomically
      const userRef = db.collection('users').doc(owner);
      await userRef.set(
        {
          firestoreUsed: FieldValue.increment(docSize),
          firestoreUpdatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      console.log(`✅ Added ${docSize} bytes to user ${owner} Firestore usage (file doc created)`);
    } catch (error) {
      console.error('Error updating Firestore usage on file create:', error);
    }
  }
);

/**
 * Update user Firestore document usage when a file document is updated
 */
export const updateFirestoreOnFileUpdate = onDocumentUpdated(
  {
    document: "files/{fileId}",
    region: "us-central1",
  },
  async (event) => {
    try {
      const beforeData = event.data?.before.data();
      const afterData = event.data?.after.data();
      
      if (!beforeData || !afterData) return;

      const owner = afterData.owner;
      if (!owner) return;

      // Calculate size difference
      const oldSize = calculateDocumentSize(beforeData);
      const newSize = calculateDocumentSize(afterData);
      const sizeDelta = newSize - oldSize;

      if (sizeDelta === 0) return;

      // Update user's Firestore usage atomically
      const userRef = db.collection('users').doc(owner);
      await userRef.set(
        {
          firestoreUsed: FieldValue.increment(sizeDelta),
          firestoreUpdatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      console.log(`✅ Updated user ${owner} Firestore usage by ${sizeDelta} bytes (file doc updated)`);
    } catch (error) {
      console.error('Error updating Firestore usage on file update:', error);
    }
  }
);

/**
 * Update user Firestore document usage when a file document is deleted
 */
export const updateFirestoreOnFileDelete = onDocumentUpdated(
  {
    document: "files/{fileId}",
    region: "us-central1",
  },
  async (event) => {
    try {
      const beforeData = event.data?.before.data();
      const afterData = event.data?.after.data();
      
      // Check if document was actually deleted
      if (!beforeData || afterData) return;

      const owner = beforeData.owner;
      if (!owner) return;

      // Calculate document size
      const docSize = calculateDocumentSize(beforeData);

      // Update user's Firestore usage atomically
      const userRef = db.collection('users').doc(owner);
      await userRef.set(
        {
          firestoreUsed: FieldValue.increment(-docSize),
          firestoreUpdatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      console.log(`✅ Removed ${docSize} bytes from user ${owner} Firestore usage (file doc deleted)`);
    } catch (error) {
      console.error('Error updating Firestore usage on file delete:', error);
    }
  }
);

/**
 * Get user's current storage usage from their profile
 * Much faster than calculating from scratch
 */
export const getUserStorageUsage = onCall(
  {
    region: "us-central1",
    cors: CORS_ORIGINS,
  },
  async (request) => {
    try {
      // Get authenticated user
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated');
      }

      const userId = request.auth.uid;
      const userRef = db.collection('users').doc(userId);
      const userDoc = await userRef.get();

      // Get storage usage (files in Firebase Storage)
      const storageUsedRaw = userDoc.data()?.storageUsed;
      const storageUsed = typeof storageUsedRaw === 'number' && !isNaN(storageUsedRaw) ? storageUsedRaw : 0;
      const storageUpdatedAt = userDoc.data()?.storageUpdatedAt;

      // Get Firestore document usage
      const firestoreUsedRaw = userDoc.data()?.firestoreUsed;
      const firestoreUsed = typeof firestoreUsedRaw === 'number' && !isNaN(firestoreUsedRaw) ? firestoreUsedRaw : 0;
      const firestoreUpdatedAt = userDoc.data()?.firestoreUpdatedAt;

      // Count files for verification
      const filesSnapshot = await db
        .collection('files')
        .where('owner', '==', userId)
        .select('storagePath')
        .get();

      return {
        storageUsedBytes: storageUsed, // Firebase Storage (actual files)
        firestoreUsedBytes: firestoreUsed, // Firestore documents (metadata, forms with base64 images)
        totalUsedBytes: storageUsed + firestoreUsed, // Combined usage
        fileCount: filesSnapshot.size,
        storageLastUpdated: storageUpdatedAt,
        firestoreLastUpdated: firestoreUpdatedAt,
      };
    } catch (error) {
      console.error('Failed to get user storage usage:', error);
      throw new HttpsError(
        'internal',
        error instanceof Error ? error.message : 'Failed to get storage usage'
      );
    }
  }
);

/**
 * Calculate total size for form files (form JSON + attachments)
 * Called via Cloud Function to update encryptedMetadata.size after file creation
 */
export const calculateFormTotalSize = onCall(
  {
    region: "us-central1",
    cors: CORS_ORIGINS,
  },
  async (request) => {
    try {
      // Get authenticated user
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated');
      }

      const userId = request.auth.uid;
      const { fileId, formData } = request.data;

      if (!fileId || !formData) {
        throw new HttpsError('invalid-argument', 'fileId and formData are required');
      }

      // Verify user has access to this file
      const fileRef = db.collection('files').doc(fileId);
      const fileDoc = await fileRef.get();

      if (!fileDoc.exists) {
        throw new HttpsError('not-found', 'File not found');
      }

      const fileData = fileDoc.data();
      if (fileData?.owner !== userId && !fileData?.sharedWith?.includes(userId)) {
        throw new HttpsError('permission-denied', 'User does not have access to this file');
      }

      // Calculate JSON size from storage
      const storagePath = fileData.storagePath;
      if (!storagePath) {
        throw new HttpsError('invalid-argument', 'File has no storage path');
      }

      const bucket = admin.storage().bucket();
      const file = bucket.file(storagePath);
      const [metadata] = await file.getMetadata();
      const formJsonSize = typeof metadata.size === 'number' ? metadata.size : parseInt(metadata.size || '0');

      // Calculate total attachment sizes
      let totalAttachmentSize = 0;
      if (formData.attachments && typeof formData.attachments === 'object') {
        for (const attachment of Object.values(formData.attachments)) {
          const attachmentData = attachment as any;
          if (attachmentData.size && typeof attachmentData.size === 'number') {
            totalAttachmentSize += attachmentData.size;
          }
        }
      }

      const totalSize = formJsonSize + totalAttachmentSize;

      console.log(`📊 Form size calculation for ${fileId}: JSON=${formJsonSize}, Attachments=${totalAttachmentSize}, Total=${totalSize}`);

      return {
        formJsonSize,
        totalAttachmentSize,
        totalSize,
        attachmentCount: formData.attachments ? Object.keys(formData.attachments).length : 0
      };
    } catch (error) {
      console.error('Failed to calculate form total size:', error);
      throw new HttpsError(
        'internal',
        error instanceof Error ? error.message : 'Failed to calculate form size'
      );
    }
  }
);

/**
 * Creates a Stripe SetupIntent for updating payment methods
 * Returns a client secret for use with Stripe Elements
 */
export const createSetupIntent = onCall(
  { secrets: [stripeSecretKey] },
  async (request) => {
    // Verify user is authenticated
    if (!request.auth) {
      throw new HttpsError(
        'unauthenticated',
        'User must be authenticated to update payment method'
      );
    }

    const uid = request.auth.uid;

    try {
      // Initialize Stripe
      const stripe = new Stripe(stripeSecretKey.value(), {
        apiVersion: '2024-12-18',
      });

      // Get the customer document from Firestore
      const customerDoc = await db.collection('customers').doc(uid).get();
      
      if (!customerDoc.exists) {
        throw new HttpsError(
          'not-found',
          'No customer record found. Please create a subscription first.'
        );
      }

      const customerData = customerDoc.data();
      const stripeCustomerId = customerData?.stripeId;

      if (!stripeCustomerId) {
        throw new HttpsError(
          'not-found',
          'No Stripe customer ID found.'
        );
      }

      // Create a SetupIntent
      const setupIntent = await stripe.setupIntents.create({
        customer: stripeCustomerId,
        payment_method_types: ['card'],
        usage: 'off_session', // Allow charging later without customer present
      });

      console.log('SetupIntent created:', setupIntent.id);

      return { 
        clientSecret: setupIntent.client_secret,
      };
    } catch (error) {
      console.error('Error creating setup intent:', error);
      
      if (error instanceof HttpsError) {
        throw error;
      }
      
      throw new HttpsError(
        'internal',
        `Failed to create setup intent: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
);

/**
 * Preview the upcoming invoice for a subscription change
 * Shows proration amounts without actually making the change
 */
export const previewSubscriptionChange = onCall(
  { 
    secrets: [stripeSecretKey],
    invoker: 'public',
    cors: CORS_ORIGINS
  },
  async (request) => {
    try {
      // Verify authentication
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated');
      }

      const userId = request.auth.uid;
      const { subscriptionId, newPriceId } = request.data as {
        subscriptionId: string;
        newPriceId: string;
      };

      if (!subscriptionId || !newPriceId) {
        throw new HttpsError(
          'invalid-argument',
          'subscriptionId and newPriceId are required'
        );
      }

      console.log('Previewing subscription change:', { userId, subscriptionId, newPriceId });

      // Initialize Stripe
      const stripe = new Stripe(stripeSecretKey.value(), {
        apiVersion: '2024-12-18',
      });

      // First, check if we have this subscription in Firestore (from the Stripe extension)
      const subscriptionDoc = await db
        .collection('customers')
        .doc(userId)
        .collection('subscriptions')
        .doc(subscriptionId)
        .get();
      
      const firestoreSubData = subscriptionDoc.data();
      console.log('Firestore subscription data:', {
        exists: subscriptionDoc.exists,
        current_period_start: firestoreSubData?.current_period_start,
        current_period_end: firestoreSubData?.current_period_end,
        status: firestoreSubData?.status
      });

      // Get the subscription from Stripe with expanded data
      const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
        expand: ['items.data.price', 'latest_invoice']
      });
      
      // Cast to access all properties
      const subData = subscription as any;
      
      // Log to understand the structure
      console.log('Subscription billing info:', {
        billing_cycle_anchor: subData.billing_cycle_anchor,
        start_date: subData.start_date,
        created: subData.created,
        plan: subData.plan,
        items_data: subData.items?.data?.[0],
        latest_invoice: typeof subData.latest_invoice
      });
      
      // Verify the subscription belongs to this user's customer
      const customerDoc = await db.collection('customers').doc(userId).get();
      const customerData = customerDoc.data();
      
      if (!customerData?.stripeId || customerData.stripeId !== subscription.customer) {
        throw new HttpsError(
          'permission-denied',
          'Subscription does not belong to this user'
        );
      }

      // Use subscriptions.update preview mode to calculate proration
      // Stripe calculates proration automatically but we need to show it to the user
      const currentPrice = subscription.items.data[0].price;
      const currentAmount = (currentPrice.unit_amount || 0) / 100;
      const currentPriceData = currentPrice as any;
      const currentInterval = currentPriceData.recurring?.interval || 'month';
      
      // Get the new price details
      const newPrice = await stripe.prices.retrieve(newPriceId);
      const newAmount = (newPrice.unit_amount || 0) / 100;
      const newPriceData = newPrice as any;
      const newInterval = newPriceData.recurring?.interval || 'month';
      
      // Calculate monthly equivalents for comparison
      const currentMonthlyAmount = currentInterval === 'year' ? currentAmount / 12 : currentAmount;
      const newMonthlyAmount = newInterval === 'year' ? newAmount / 12 : newAmount;
      
      // Check if this is just a billing interval change (monthly to yearly or vice versa)
      // Compare the product IDs to determine if it's the same plan tier
      const currentProductId = currentPrice.product;
      const newProductId = newPrice.product;
      
      // Get product names to check if they're the same plan tier
      const currentProduct = await stripe.products.retrieve(currentProductId as string);
      const newProduct = await stripe.products.retrieve(newProductId as string);
      
      // Extract base plan names (remove " - Monthly" or " - Yearly" suffix)
      const currentBaseName = currentProduct.name.replace(/\s*-\s*(Monthly|Yearly|Montly)$/i, '').trim();
      const newBaseName = newProduct.name.replace(/\s*-\s*(Monthly|Yearly|Montly)$/i, '').trim();
      
      // If it's the same plan tier but different interval, it's an interval change (allowed)
      const isIntervalChangeOnly = currentBaseName === newBaseName && currentInterval !== newInterval;
      
      // Validate that this is an upgrade or interval change
      // Only reject if it's a different plan tier with lower monthly equivalent price
      if (!isIntervalChangeOnly && newMonthlyAmount < currentMonthlyAmount - 0.01) {
        throw new HttpsError(
          'invalid-argument',
          'If you want to downgrade your plan, please contact us for assistance.'
        );
      }
      
      console.log('Price comparison:', {
        currentAmount,
        currentInterval,
        currentMonthlyAmount,
        newAmount,
        newInterval,
        newMonthlyAmount,
        isIntervalChangeOnly
      });
      
      // Calculate proration based on remaining time in billing period
      const now = Math.floor(Date.now() / 1000);
      
      // Try to get period from Firestore first, then fall back to Stripe data
      let periodStart: number;
      let periodEnd: number;
      
      if (firestoreSubData?.current_period_start && firestoreSubData?.current_period_end) {
        // Use Firestore data (from Stripe extension)
        periodStart = firestoreSubData.current_period_start.seconds || firestoreSubData.current_period_start;
        periodEnd = firestoreSubData.current_period_end.seconds || firestoreSubData.current_period_end;
      } else if (subData.current_period_start && subData.current_period_end) {
        // Use Stripe API data directly
        periodStart = subData.current_period_start;
        periodEnd = subData.current_period_end;
      } else {
        // Calculate from billing cycle anchor and interval
        const billingCycleAnchor = subData.billing_cycle_anchor || subData.start_date || subData.created;
        const price = subscription.items.data[0].price;
        const priceData = price as any;
        const interval = priceData.recurring?.interval || 'month';
        const intervalCount = priceData.recurring?.interval_count || 1;
        
        // Calculate periods based on interval
        const msPerDay = 86400;
        let periodLength: number;
        
        switch (interval) {
          case 'day':
            periodLength = msPerDay * intervalCount;
            break;
          case 'week':
            periodLength = msPerDay * 7 * intervalCount;
            break;
          case 'month':
            periodLength = msPerDay * 30 * intervalCount; // Approximation
            break;
          case 'year':
            periodLength = msPerDay * 365 * intervalCount;
            break;
          default:
            periodLength = msPerDay * 30; // Default to month
        }
        
        // Find which period we're currently in
        const periodsSinceAnchor = Math.floor((now - billingCycleAnchor) / periodLength);
        periodStart = billingCycleAnchor + (periodsSinceAnchor * periodLength);
        periodEnd = periodStart + periodLength;
      }
      
      const totalPeriod = periodEnd - periodStart;
      const remainingTime = Math.max(0, periodEnd - now);
      
      console.log('Proration calculation:', {
        now,
        periodStart,
        periodEnd,
        totalPeriod,
        remainingTime,
        currentAmount,
        newAmount,
        isIntervalChangeOnly
      });
      
      // Helper function to safely round and ensure valid number
      const safeRound = (value: number): number => {
        if (!isFinite(value) || isNaN(value)) return 0;
        return Math.round(value * 100) / 100;
      };
      
      // For interval changes, calculate the credit but the charge is the full new amount
      // since we're resetting the billing cycle
      if (isIntervalChangeOnly) {
        // Calculate credit for unused time on old plan
        const remainingFraction = totalPeriod > 0 ? remainingTime / totalPeriod : 0;
        const prorationCredit = currentAmount * remainingFraction;
        
        // Full charge for new interval period
        const prorationCharge = newAmount;
        
        // Net amount (new amount minus credit for unused time)
        const immediateCharge = prorationCharge - prorationCredit;
        
        return {
          success: true,
          preview: {
            currentAmount: safeRound(currentAmount),
            newAmount: safeRound(newAmount),
            prorationCredit: safeRound(prorationCredit),
            prorationCharge: safeRound(prorationCharge),
            immediateCharge: safeRound(immediateCharge),
            currency: currentPrice.currency || 'usd',
            currentPeriodEnd: periodEnd,
            daysRemaining: Math.max(0, Math.ceil(remainingTime / 86400)),
            isIntervalChange: true,
            message: `Switching from ${currentInterval}ly to ${newInterval}ly billing. You'll receive credit for unused time and be charged for the ${newInterval}ly plan.`
          },
        };
      }
      
      // Validate calculations to prevent NaN
      const remainingFraction = totalPeriod > 0 ? remainingTime / totalPeriod : 0;
      
      // Credit for unused time on old plan
      const prorationCredit = currentAmount * remainingFraction;
      
      // Charge for remaining time on new plan
      const prorationCharge = newAmount * remainingFraction;
      
      // Net amount due now (positive means charge, negative means credit)
      const immediateCharge = prorationCharge - prorationCredit;

      return {
        success: true,
        preview: {
          currentAmount: safeRound(currentAmount),
          newAmount: safeRound(newAmount),
          prorationCredit: safeRound(prorationCredit),
          prorationCharge: safeRound(prorationCharge),
          immediateCharge: safeRound(immediateCharge),
          currency: currentPrice.currency || 'usd',
          currentPeriodEnd: periodEnd,
          daysRemaining: Math.max(0, Math.ceil(remainingTime / 86400)),
        },
      };
    } catch (error) {
      console.error('Error previewing subscription change:', error);
      
      if (error instanceof HttpsError) {
        throw error;
      }
      
      throw new HttpsError(
        'internal',
        `Failed to preview subscription change: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
);

/**
 * Updates a Stripe subscription to a new price
 * Handles proration automatically
 */
export const updateSubscription = onCall(
  { 
    secrets: [stripeSecretKey],
    invoker: 'public',
    cors: CORS_ORIGINS
  },
  async (request) => {
    try {
      // Verify authentication
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated');
      }

      const userId = request.auth.uid;
      const { subscriptionId, newPriceId } = request.data as {
        subscriptionId: string;
        newPriceId: string;
      };

      if (!subscriptionId || !newPriceId) {
        throw new HttpsError(
          'invalid-argument',
          'subscriptionId and newPriceId are required'
        );
      }

      console.log('Updating subscription:', { userId, subscriptionId, newPriceId });

      // Initialize Stripe
      const stripe = new Stripe(stripeSecretKey.value(), {
        apiVersion: '2024-12-18',
      });

      // Get the subscription from Stripe
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      
      // Verify the subscription belongs to this user's customer
      const customerDoc = await db.collection('customers').doc(userId).get();
      const customerData = customerDoc.data();
      
      if (!customerData?.stripeId || customerData.stripeId !== subscription.customer) {
        throw new HttpsError(
          'permission-denied',
          'Subscription does not belong to this user'
        );
      }

      // Get current and new prices to validate upgrade
      const currentPrice = subscription.items.data[0].price;
      const currentAmount = (currentPrice.unit_amount || 0) / 100;
      const currentPriceData = currentPrice as any;
      const currentInterval = currentPriceData.recurring?.interval || 'month';
      
      const newPrice = await stripe.prices.retrieve(newPriceId);
      const newAmount = (newPrice.unit_amount || 0) / 100;
      const newPriceData = newPrice as any;
      const newInterval = newPriceData.recurring?.interval || 'month';
      
      // Calculate monthly equivalents for comparison
      const currentMonthlyAmount = currentInterval === 'year' ? currentAmount / 12 : currentAmount;
      const newMonthlyAmount = newInterval === 'year' ? newAmount / 12 : newAmount;
      
      // Check if this is just a billing interval change (monthly to yearly or vice versa)
      // Use product IDs to determine if it's the same plan tier
      const currentProductId = currentPrice.product as string;
      const newProductId = newPrice.product as string;
      
      // Define product pairs (monthly/yearly versions of same plan)
      const productPairs: Record<string, string> = {
        'prod_TR15HSKx04OdMw': 'prod_TR15IKLHIrjMuV', // Basic
        'prod_TR15IKLHIrjMuV': 'prod_TR15HSKx04OdMw',
        'prod_TR1627kmnbkDyW': 'prod_TR16A9oqnsUA1A', // Personal
        'prod_TR16A9oqnsUA1A': 'prod_TR1627kmnbDyW',
        'prod_TR17Ke2wBkbvXM': 'prod_TR17FxpMWZAnHa', // Professional
        'prod_TR17FxpMWZAnHa': 'prod_TR17Ke2wBkbvXM',
      };
      
      // Check if the new product is the monthly/yearly pair of the current product
      const isIntervalChangeOnly = productPairs[currentProductId] === newProductId && currentInterval !== newInterval;
      
      // Validate that this is an upgrade or interval change
      // Only reject if it's a different plan tier with lower monthly equivalent price
      if (!isIntervalChangeOnly && newMonthlyAmount < currentMonthlyAmount - 0.01) {
        throw new HttpsError(
          'invalid-argument',
          'If you want to downgrade your plan, please contact us for assistance.'
        );
      }

      console.log('Updating subscription:', { 
        from: `${currentPrice.currency} ${currentAmount}/${currentInterval}`,
        to: `${newPrice.currency} ${newAmount}/${newInterval}`,
        isIntervalChangeOnly
      });

      // For interval changes on the same plan tier, reset the billing cycle to avoid weird prorations
      // For actual upgrades, keep the billing cycle and invoice immediately
      const updateParams: any = {
        items: [{
          id: subscription.items.data[0].id,
          price: newPriceId,
        }],
      };
      
      if (isIntervalChangeOnly) {
        // Switching billing frequency on same plan - reset billing cycle and apply credit
        updateParams.proration_behavior = 'create_prorations';
        updateParams.billing_cycle_anchor = 'now';
      } else {
        // Actual upgrade - charge prorated amount immediately
        updateParams.proration_behavior = 'always_invoice';
        updateParams.billing_cycle_anchor = 'unchanged';
      }

      // Update the subscription with the new price
      const updatedSubscription = await stripe.subscriptions.update(subscriptionId, updateParams);

      console.log('Subscription updated:', updatedSubscription.id);

      // The webhook will automatically update Firestore
      // Return basic success info
      return {
        success: true,
        subscriptionId: updatedSubscription.id,
        message: isIntervalChangeOnly 
          ? 'Billing interval updated successfully. Your next charge will be on the new schedule.'
          : 'Subscription updated successfully. You will be charged immediately for the prorated amount.',
      };
    } catch (error) {
      console.error('Error updating subscription:', error);
      
      if (error instanceof HttpsError) {
        throw error;
      }
      
      throw new HttpsError(
        'internal',
        `Failed to update subscription: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
);

/**
 * Sync Stripe products and prices to Firestore
 * This function fetches all products and their prices from Stripe and stores them in Firestore
 */
export const syncStripeProducts = onCall(
  {
    secrets: [stripeSecretKey],
    cors: CORS_ORIGINS
  },
  async (request) => {
    try {
      console.log('🔄 Starting Stripe product sync...');
      
      // Initialize Stripe with secret key
      const stripe = new Stripe(stripeSecretKey.value(), {
        apiVersion: '2024-12-18',
      });
      
      const db = admin.firestore();
      const productsRef = db.collection('products');
      
      // Fetch all active products from Stripe
      const products = await stripe.products.list({
        active: true,
        expand: ['data.default_price'],
        limit: 100
      });
      
      console.log(`📦 Found ${products.data.length} active products in Stripe`);
      
      let syncedCount = 0;
      
      for (const product of products.data) {
        // Fetch all prices for this product
        const prices = await stripe.prices.list({
          product: product.id,
          active: true,
          limit: 100
        });
        
        console.log(`💰 Product ${product.name}: ${prices.data.length} prices`);
        
        // Store product in Firestore
        const productData: any = {
          active: product.active,
          name: product.name,
          description: product.description || '',
          role: product.metadata?.firebaseRole || null,
          images: product.images || [],
          metadata: product.metadata || {},
          tax_code: product.tax_code || null,
          updated: FieldValue.serverTimestamp()
        };
        
        await productsRef.doc(product.id).set(productData, { merge: true });
        
        // Store prices as subcollection
        const pricesRef = productsRef.doc(product.id).collection('prices');
        
        for (const price of prices.data) {
          const priceData: any = {
            active: price.active,
            currency: price.currency,
            type: price.type,
            unit_amount: price.unit_amount,
            interval: price.recurring?.interval || null,
            interval_count: price.recurring?.interval_count || null,
            trial_period_days: price.recurring?.trial_period_days || null,
            description: price.nickname || '',
            metadata: price.metadata || {},
            tax_behavior: price.tax_behavior || null,
            updated: FieldValue.serverTimestamp()
          };
          
          await pricesRef.doc(price.id).set(priceData, { merge: true });
        }
        
        syncedCount++;
      }
      
      console.log(`✅ Successfully synced ${syncedCount} products with their prices`);
      
      return {
        success: true,
        message: `Synced ${syncedCount} products from Stripe`,
        productsCount: syncedCount
      };
    } catch (error) {
      console.error('❌ Error syncing Stripe products:', error);
      
      throw new HttpsError(
        'internal',
        `Failed to sync Stripe products: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
);

/**
 * Get customer balance from Stripe
 * Shows any credits or outstanding balance on the customer's account
 */
export const getCustomerBalance = onCall(
  { 
    secrets: [stripeSecretKey],
    invoker: 'public',
    cors: CORS_ORIGINS
  },
  async (request) => {
    try {
      // Verify authentication
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated');
      }

      const userId = request.auth.uid;

      console.log('Getting customer balance for user:', userId);

      // Get the customer's Stripe ID from Firestore
      const customerDoc = await db.collection('customers').doc(userId).get();
      const customerData = customerDoc.data();

      if (!customerData?.stripeId) {
        // No Stripe customer yet, return zero balance
        return {
          balance: 0,
          currency: 'usd'
        };
      }

      // Initialize Stripe
      const stripe = new Stripe(stripeSecretKey.value(), {
        apiVersion: '2024-12-18',
      });

      // Retrieve customer from Stripe
      const customer = await stripe.customers.retrieve(customerData.stripeId);

      if (customer.deleted) {
        throw new HttpsError('not-found', 'Customer has been deleted');
      }

      // Stripe balance is in cents and negative means customer has credit
      // Positive means customer owes money
      const balanceInCents = customer.balance || 0;
      const balanceInDollars = balanceInCents / 100;

      console.log('Customer balance:', {
        stripeId: customerData.stripeId,
        balanceInCents,
        balanceInDollars,
        currency: customer.currency || 'usd'
      });

      return {
        balance: balanceInDollars,
        currency: customer.currency || 'usd'
      };
    } catch (error) {
      console.error('❌ Error getting customer balance:', error);
      
      throw new HttpsError(
        'internal',
        `Failed to get customer balance: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
);

/**
 * Send support email for subscribed users
 * This keeps the admin email address hidden from clients
 */
export const sendSupportEmail = onRequest(
  {
    secrets: [emailUser, emailPassword]
  },
  async (req, res) => {
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
        let userId: string;
        let userEmail: string | undefined;
        
        try {
          const decodedToken = await admin.auth().verifyIdToken(token);
          userId = decodedToken.uid;
          userEmail = decodedToken.email;
        } catch (error) {
          console.error('Error verifying auth token:', error);
          res.status(401).json({error: 'Unauthorized: Invalid auth token'});
          return;
        }

        const { subject, message, userName } = req.body as {
          subject: string;
          message: string;
          userEmail?: string;
          userName?: string;
        };

        // Validate input
        if (!subject || !message) {
          res.status(400).json({error: 'Subject and message are required'});
          return;
        }

        // Check if user has an active subscription
        const customerDoc = await db.collection('customers').doc(userId).get();
        
        if (!customerDoc.exists) {
          res.status(403).json({
            error: 'Support email is only available for subscribed users. Please upgrade your plan to access email support.'
          });
          return;
        }

        const customerData = customerDoc.data();
        
        // Check for active subscription
        const subscriptionsSnapshot = await db
          .collection('customers')
          .doc(userId)
          .collection('subscriptions')
          .where('status', 'in', ['active', 'trialing'])
          .limit(1)
          .get();

        if (subscriptionsSnapshot.empty) {
          res.status(403).json({
            error: 'Support email is only available for active subscribers. Please subscribe to a plan to access email support.'
          });
          return;
        }

        // Get user profile for additional context
        const userProfile = await db.collection('users').doc(userId).get();
        const displayName = userName || userProfile.data()?.displayName || 'User';
        const email = userEmail || 'no-email@seravault.com';

      // Prepare email content
      const emailHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #1976d2; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
            .user-info { background: white; padding: 15px; margin: 20px 0; border-left: 4px solid #1976d2; }
            .message-content { background: white; padding: 20px; margin: 20px 0; border: 1px solid #ddd; border-radius: 4px; }
            .footer { margin-top: 20px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h2>🔐 SeraVault Support Request</h2>
            </div>
            <div class="content">
              <div class="user-info">
                <h3>User Information</h3>
                <p><strong>Name:</strong> ${displayName}</p>
                <p><strong>Email:</strong> ${email}</p>
                <p><strong>User ID:</strong> ${userId}</p>
                <p><strong>Customer ID:</strong> ${customerData?.stripeId || 'N/A'}</p>
              </div>
              
              <div class="message-content">
                <h3>Subject: ${subject}</h3>
                <p>${message.replace(/\n/g, '<br>')}</p>
              </div>
              
              <div class="footer">
                <p>This message was sent from a subscribed SeraVault user via the in-app support system.</p>
                <p>Reply directly to this email to respond to the user at: ${email}</p>
              </div>
            </div>
          </div>
        </body>
        </html>
      `;

      // Send email to admin (hidden from client)
      const adminEmail = 'admin@seravault.com';
      await sendEmail(
        adminEmail,
        `[SeraVault Support] ${subject}`,
        emailHtml
      );

      console.log(`✅ Support email sent from ${email} (${userId})`);

      // Send confirmation to user
      const confirmationHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #1976d2; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
            .message { background: white; padding: 20px; margin: 20px 0; border-radius: 4px; }
            .footer { margin-top: 20px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666; text-align: center; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h2>✅ Support Request Received</h2>
            </div>
            <div class="content">
              <div class="message">
                <p>Hi ${displayName},</p>
                <p>Thank you for contacting SeraVault support. We've received your message:</p>
                <p><strong>Subject:</strong> ${subject}</p>
                <p>Our team will review your request and respond as soon as possible, typically within 24-48 hours.</p>
                <p>You'll receive a reply at this email address: <strong>${email}</strong></p>
              </div>
              <div class="footer">
                <p>© 2025 SeraVault - Secure Document Storage</p>
                <p><a href="https://www.seravault.com">www.seravault.com</a></p>
              </div>
            </div>
          </div>
        </body>
        </html>
      `;

        await sendEmail(
          email,
          'SeraVault Support - We received your message',
          confirmationHtml
        );

        console.log(`✅ Support email confirmation sent to ${email}`);

        res.status(200).json({
          success: true,
          message: 'Support email sent successfully. You will receive a confirmation email shortly.'
        });
      } catch (error) {
        console.error('❌ Error sending support email:', error);
        res.status(500).json({
          error: `Failed to send support email: ${error instanceof Error ? error.message : 'Unknown error'}`
        });
      }
    });
  }
);

/**
 * Send sales inquiry email (Public endpoint)
 * Allows potential enterprise customers to contact sales without exposing the email address
 */
export const sendSalesInquiry = onRequest(
  {
    secrets: [emailUser, emailPassword]
  },
  async (req, res) => {
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

        const { name, email, company, message } = req.body as {
          name: string;
          email: string;
          company?: string;
          message: string;
        };

        // Basic validation
        if (!name || !email || !message) {
          res.status(400).json({error: 'Name, email, and message are required'});
          return;
        }

        // Email validation regex
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
          res.status(400).json({error: 'Invalid email address'});
          return;
        }

        // Construct email content
        const subject = `New Enterprise Sales Inquiry from ${name}`;
        const html = `
          <h2>New Sales Inquiry</h2>
          <p><strong>Name:</strong> ${name}</p>
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>Company:</strong> ${company || 'Not provided'}</p>
          <p><strong>Message:</strong></p>
          <p>${message.replace(/\n/g, '<br>')}</p>
        `;

        // Send email to sales team (using the configured email user for now, or a specific sales alias if available)
        // For now, we'll send it to the same address as the sender (admin) or a hardcoded sales address if we had one.
        // Since we don't have a separate SALES_EMAIL secret, we'll send it to the EMAIL_USER (admin).
        const targetEmail = emailUser.value(); 

        await sendEmail(targetEmail, subject, html);

        res.status(200).json({success: true, message: 'Inquiry sent successfully'});
      } catch (error) {
        console.error('Error sending sales inquiry:', error);
        res.status(500).json({error: 'Failed to send inquiry'});
      }
    });
  }
);

/**
 * Callable Cloud Function to remove/block a contact
 * Deletes contact document, pending requests, and removes user from shared files
 */
export const removeContact = onCall(
  {
    cors: CORS_ORIGINS
  },
  async (request) => {
    // Verify the user is authenticated
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated to remove a contact');
    }

    const userId = request.auth.uid;
    const { contactUserId } = request.data as { contactUserId: string };

    if (!contactUserId) {
      throw new HttpsError('invalid-argument', 'contactUserId is required');
    }

    if (userId === contactUserId) {
      throw new HttpsError('invalid-argument', 'Cannot remove yourself as a contact');
    }

    console.log(`🚫 Removing contact: ${userId} removing ${contactUserId}`);

    try {
      const results = {
        contactDeleted: false,
        requestsDeleted: 0,
        filesUnshared: 0,
      };

      // 1. Delete the contact document
      const [userId1, userId2] = [userId, contactUserId].sort();
      const contactId = `${userId1}_${userId2}`;
      const contactRef = db.collection('contacts').doc(contactId);
      
      const contactDoc = await contactRef.get();
      if (contactDoc.exists) {
        await contactRef.delete();
        results.contactDeleted = true;
        console.log(`✅ Deleted contact document: ${contactId}`);
      }

      // 2. Delete any pending contact requests between these users (both directions)
      const batch1 = db.batch();
      let batchCount1 = 0;

      const requests1 = await db.collection('contactRequests')
        .where('fromUserId', '==', userId)
        .where('toUserId', '==', contactUserId)
        .get();

      const requests2 = await db.collection('contactRequests')
        .where('fromUserId', '==', contactUserId)
        .where('toUserId', '==', userId)
        .get();

      [...requests1.docs, ...requests2.docs].forEach(doc => {
        batch1.delete(doc.ref);
        batchCount1++;
        results.requestsDeleted++;
      });

      if (batchCount1 > 0) {
        await batch1.commit();
        console.log(`✅ Deleted ${results.requestsDeleted} contact requests`);
      }

      // 3. Remove blocked user from all files shared by the removing user
      const sharedFilesQuery = await db.collection('files')
        .where('userId', '==', userId)
        .where('sharedWith', 'array-contains', contactUserId)
        .get();

      if (!sharedFilesQuery.empty) {
        // Process in batches of 500 (Firestore batch limit)
        const batches = [];
        let batch = db.batch();
        let count = 0;

        sharedFilesQuery.docs.forEach((doc) => {
          const data = doc.data();
          const sharedWith = (data.sharedWith || []).filter((uid: string) => uid !== contactUserId);
          const encryptedKeys = { ...data.encryptedKeys };
          delete encryptedKeys[contactUserId];

          batch.update(doc.ref, { 
            sharedWith,
            encryptedKeys,
            [`userFavorites.${contactUserId}`]: FieldValue.delete(),
            [`userFolders.${contactUserId}`]: FieldValue.delete(),
            [`userTags.${contactUserId}`]: FieldValue.delete(),
            [`userNames.${contactUserId}`]: FieldValue.delete(),
          });
          
          count++;
          results.filesUnshared++;

          // Commit batch every 500 operations
          if (count === 500) {
            batches.push(batch.commit());
            batch = db.batch();
            count = 0;
          }
        });

        // Commit remaining operations
        if (count > 0) {
          batches.push(batch.commit());
        }

        await Promise.all(batches);
        console.log(`✅ Removed contact from ${results.filesUnshared} shared files`);
      }

      console.log(`✅ Contact removal completed: ${userId} removed ${contactUserId}`);
      return {
        success: true,
        message: 'Contact successfully removed',
        results
      };

    } catch (error) {
      console.error('❌ Contact removal failed:', error);
      throw new HttpsError(
        'internal',
        error instanceof Error ? error.message : 'Failed to remove contact'
      );
    }
  }
);

/**
 * IMPORTANT: Automatic User Data Cleanup on Console Deletion
 * 
 * Firebase Functions v2 does NOT support auth deletion triggers (onUserDeleted).
 * 
 * To clean up user data when deleting from Firebase Console:
 * 
 * Option 1 (Recommended): Install the "Delete User Data" Firebase Extension
 *   - Run: firebase ext:install firebase/delete-user-data
 *   - Configure it to delete collections: users, files, folders, contacts, etc.
 * 
 * Option 2: Use a script to delete users programmatically
 *   - Call the deleteUserAccount cloud function via Admin SDK
 *   - This ensures proper cleanup before auth deletion
 * 
 * Option 3: Manual cleanup
 *   - Always use the "Delete Account" button in the app (calls deleteUserAccount)
 *   - Never delete users directly from Firebase Console
 */

// ============================================================================
// EMAIL VERIFICATION (Custom Multi-Language)
// ============================================================================

/**
 * Send custom email verification
 * Called from frontend after user signup
 */
export const sendCustomEmailVerification = onCall(
  {
    secrets: [emailUser, emailPassword],
    cors: CORS_ORIGINS,
  },
  async (request) => {
    const {userId, email, displayName, language = 'en'} = request.data;

    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    if (request.auth.uid !== userId) {
      throw new HttpsError('permission-denied', 'Can only send verification for own account');
    }

    try {
      // Generate verification token (24 hour expiry)
      const token = admin.firestore().collection('_').doc().id; // Generate unique ID
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

      // Store token in Firestore
      await db.collection('emailVerifications').doc(token).set({
        userId,
        email,
        createdAt: FieldValue.serverTimestamp(),
        expiresAt,
        verified: false,
      });

      // Generate verification link
      const verificationLink = `https://app.seravault.com/verify-email?token=${token}`;

      // Determine template based on language
      let templateName = 'email-verification';
      if (language === 'es') templateName = 'email-verification-es';
      else if (language === 'fr') templateName = 'email-verification-fr';
      else if (language === 'de') templateName = 'email-verification-de';

      // Render email from template
      const emailHtml = renderEmailTemplate(templateName, {
        displayName: displayName || email,
        verificationLink,
      });

      // Send email
      const transporter = createEmailTransporter();
      await transporter.sendMail({
        from: `"SeraVault" <${emailUser.value()}>`,
        to: email,
        subject: language === 'es' ? 'Verifica tu correo electrónico - SeraVault' :
                 language === 'fr' ? 'Vérifiez votre e-mail - SeraVault' :
                 language === 'de' ? 'Verifizieren Sie Ihre E-Mail - SeraVault' :
                 'Verify Your Email - SeraVault',
        html: emailHtml,
      });

      console.log(`✅ Verification email sent to ${email} (${language})`);
      return {success: true, message: 'Verification email sent'};

    } catch (error) {
      console.error('❌ Error sending verification email:', error);
      throw new HttpsError('internal', 'Failed to send verification email');
    }
  }
);

/**
 * Verify email token
 * Called when user clicks verification link
 */
export const verifyEmailToken = onCall(
  {
    cors: CORS_ORIGINS,
  },
  async (request) => {
    const {token} = request.data;

    if (!token) {
      throw new HttpsError('invalid-argument', 'Token is required');
    }

    try {
      // Get token document
      const tokenDoc = await db.collection('emailVerifications').doc(token).get();

      if (!tokenDoc.exists) {
        throw new HttpsError('not-found', 'Invalid or expired verification token');
      }

      const tokenData = tokenDoc.data()!;

      // Check if already verified
      if (tokenData.verified) {
        throw new HttpsError('already-exists', 'Email already verified');
      }

      // Check expiration
      const now = new Date();
      const expiresAt = tokenData.expiresAt.toDate();
      if (now > expiresAt) {
        throw new HttpsError('deadline-exceeded', 'Verification token has expired');
      }

      // Mark token as verified
      await tokenDoc.ref.update({
        verified: true,
        verifiedAt: FieldValue.serverTimestamp(),
      });

      // Update user's emailVerified custom claim
      await admin.auth().setCustomUserClaims(tokenData.userId, {emailVerified: true});

      // Update user profile in Firestore
      await db.collection('users').doc(tokenData.userId).update({
        emailVerified: true,
        emailVerifiedAt: FieldValue.serverTimestamp(),
      });

      console.log(`✅ Email verified for user ${tokenData.userId}`);
      return {
        success: true,
        message: 'Email verified successfully',
        userId: tokenData.userId,
      };

    } catch (error) {
      console.error('❌ Error verifying email token:', error);
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError('internal', 'Failed to verify email');
    }
  }
);
