"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.onChatMessageCreated = exports.onUserInvitationCreated = exports.markAllNotificationsAsRead = exports.markNotificationAsRead = exports.onUnknownFileShare = exports.onContactAccepted = exports.onContactRequest = exports.onFileModified = exports.onFileShared = void 0;
const firestore_1 = require("firebase-functions/v2/firestore");
const https_1 = require("firebase-functions/v2/https");
const admin = __importStar(require("firebase-admin"));
const firestore_2 = require("firebase-admin/firestore");
const cors_1 = __importDefault(require("cors"));
// Configure CORS for web clients
const corsHandler = (0, cors_1.default)({
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
/**
 * Create a notification securely on the server side
 */
async function createNotification(notificationData) {
    try {
        const notification = Object.assign(Object.assign({}, notificationData), { createdAt: firestore_2.FieldValue.serverTimestamp() });
        const docRef = await db.collection('notifications').add(notification);
        console.log(`✅ Notification created: ${docRef.id} for user ${notificationData.recipientId}`);
        return docRef.id;
    }
    catch (error) {
        console.error('❌ Error creating notification:', error);
        throw error;
    }
}
/**
 * Get user display name from user profile
 */
async function getUserDisplayName(userId) {
    try {
        const userDoc = await db.collection('users').doc(userId).get();
        if (userDoc.exists) {
            const userData = userDoc.data();
            return (userData === null || userData === void 0 ? void 0 : userData.displayName) || (userData === null || userData === void 0 ? void 0 : userData.email) || 'Unknown User';
        }
        return 'Unknown User';
    }
    catch (error) {
        console.error('Error fetching user display name:', error);
        return 'Unknown User';
    }
}
/**
 * Validate that user has access to a file
 */
async function validateFileAccess(fileId, userId) {
    try {
        const fileDoc = await db.collection('files').doc(fileId).get();
        if (!fileDoc.exists) {
            return false;
        }
        const fileData = fileDoc.data();
        if (!fileData)
            return false;
        // User must be owner or in sharedWith array
        return fileData.owner === userId ||
            (Array.isArray(fileData.sharedWith) && fileData.sharedWith.includes(userId));
    }
    catch (error) {
        console.error('Error validating file access:', error);
        return false;
    }
}
/**
 * Firestore Trigger: File sharing/unsharing notifications
 * Triggered when a file document is updated (sharedWith array changes)
 */
exports.onFileShared = (0, firestore_1.onDocumentUpdated)("files/{fileId}", async (event) => {
    var _a, _b;
    const beforeData = (_a = event.data) === null || _a === void 0 ? void 0 : _a.before.data();
    const afterData = (_b = event.data) === null || _b === void 0 ? void 0 : _b.after.data();
    const fileId = event.params.fileId;
    console.log(`📋 onFileShared triggered for file: ${fileId}`);
    if (!beforeData || !afterData)
        return;
    const beforeSharedWith = beforeData.sharedWith || [];
    const afterSharedWith = afterData.sharedWith || [];
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
        if (userId === ownerId)
            continue;
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
exports.onFileModified = (0, firestore_1.onDocumentUpdated)("files/{fileId}", async (event) => {
    var _a, _b;
    const beforeData = (_a = event.data) === null || _a === void 0 ? void 0 : _a.before.data();
    const afterData = (_b = event.data) === null || _b === void 0 ? void 0 : _b.after.data();
    const fileId = event.params.fileId;
    console.log(`📋 onFileModified triggered for file: ${fileId}`);
    if (!beforeData || !afterData)
        return;
    // Check if this is a sharing/unsharing event (sharedWith array changed)
    const beforeSharedWith = beforeData.sharedWith || [];
    const afterSharedWith = afterData.sharedWith || [];
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
        if (typeof before === 'object' && (before === null || before === void 0 ? void 0 : before.ciphertext)) {
            return before.ciphertext !== (after === null || after === void 0 ? void 0 : after.ciphertext);
        }
        return before !== after;
    });
    if (!hasContentChange) {
        console.log(`ℹ️ No content changes detected, skipping notification`);
        return;
    }
    const ownerId = afterData.owner;
    const sharedWith = afterData.sharedWith || [];
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
exports.onContactRequest = (0, firestore_1.onDocumentCreated)("contactRequests/{requestId}", async (event) => {
    var _a;
    const requestData = (_a = event.data) === null || _a === void 0 ? void 0 : _a.data();
    const requestId = event.params.requestId;
    if (!requestData)
        return;
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
exports.onContactAccepted = (0, firestore_1.onDocumentUpdated)("contactRequests/{requestId}", async (event) => {
    var _a, _b;
    const beforeData = (_a = event.data) === null || _a === void 0 ? void 0 : _a.before.data();
    const afterData = (_b = event.data) === null || _b === void 0 ? void 0 : _b.after.data();
    const requestId = event.params.requestId;
    if (!beforeData || !afterData)
        return;
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
exports.onUnknownFileShare = (0, firestore_1.onDocumentUpdated)("files/{fileId}", async (event) => {
    var _a, _b;
    const beforeData = (_a = event.data) === null || _a === void 0 ? void 0 : _a.before.data();
    const afterData = (_b = event.data) === null || _b === void 0 ? void 0 : _b.after.data();
    const fileId = event.params.fileId;
    if (!beforeData || !afterData)
        return;
    const beforeSharedWith = beforeData.sharedWith || [];
    const afterSharedWith = afterData.sharedWith || [];
    const ownerId = afterData.owner;
    // Get owner's display name
    const ownerDisplayName = await getUserDisplayName(ownerId);
    // Find newly added users (shared)
    const newlySharedUsers = afterSharedWith.filter(userId => !beforeSharedWith.includes(userId));
    // Check each newly shared user to see if they are connected to the owner
    for (const userId of newlySharedUsers) {
        // Don't notify the owner
        if (userId === ownerId)
            continue;
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
exports.markNotificationAsRead = (0, https_1.onRequest)(async (req, res) => {
    return corsHandler(req, res, async () => {
        try {
            // Handle preflight OPTIONS request
            if (req.method === 'OPTIONS') {
                res.status(204).send('');
                return;
            }
            if (req.method !== 'POST') {
                res.status(405).json({ error: 'Method not allowed' });
                return;
            }
            const { notificationId } = req.body;
            // Get the Firebase auth token from Authorization header
            const authHeader = req.headers.authorization;
            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                res.status(401).json({ error: 'Unauthorized: Missing or invalid auth token' });
                return;
            }
            const token = authHeader.split('Bearer ')[1];
            let uid;
            try {
                const decodedToken = await admin.auth().verifyIdToken(token);
                uid = decodedToken.uid;
            }
            catch (error) {
                console.error('Error verifying auth token:', error);
                res.status(401).json({ error: 'Unauthorized: Invalid auth token' });
                return;
            }
            if (!notificationId) {
                res.status(400).json({ error: 'notificationId is required' });
                return;
            }
            // Verify notification belongs to the authenticated user
            const notificationDoc = await db.collection('notifications').doc(notificationId).get();
            if (!notificationDoc.exists) {
                res.status(404).json({ error: 'Notification not found' });
                return;
            }
            const notificationData = notificationDoc.data();
            if ((notificationData === null || notificationData === void 0 ? void 0 : notificationData.recipientId) !== uid) {
                res.status(403).json({ error: 'You can only delete your own notifications' });
                return;
            }
            // Delete the notification instead of marking as read
            await notificationDoc.ref.delete();
            console.log(`🗑️ Notification ${notificationId} deleted by user ${uid}`);
            res.status(200).json({ success: true });
        }
        catch (error) {
            console.error('Error marking notification as read:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });
});
/**
 * HTTP Function: Mark all notifications as read for user
 */
exports.markAllNotificationsAsRead = (0, https_1.onRequest)(async (req, res) => {
    return corsHandler(req, res, async () => {
        try {
            // Handle preflight OPTIONS request
            if (req.method === 'OPTIONS') {
                res.status(204).send('');
                return;
            }
            if (req.method !== 'POST') {
                res.status(405).json({ error: 'Method not allowed' });
                return;
            }
            // Get the Firebase auth token from Authorization header
            const authHeader = req.headers.authorization;
            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                res.status(401).json({ error: 'Unauthorized: Missing or invalid auth token' });
                return;
            }
            const token = authHeader.split('Bearer ')[1];
            let uid;
            try {
                const decodedToken = await admin.auth().verifyIdToken(token);
                uid = decodedToken.uid;
            }
            catch (error) {
                console.error('Error verifying auth token:', error);
                res.status(401).json({ error: 'Unauthorized: Invalid auth token' });
                return;
            }
            // Get all unread notifications for user
            const unreadNotifications = await db.collection('notifications')
                .where('recipientId', '==', uid)
                .where('isRead', '==', false)
                .get();
            if (unreadNotifications.empty) {
                res.status(200).json({ success: true, deleted: 0 });
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
            res.status(200).json({ success: true, deleted: count });
        }
        catch (error) {
            console.error('Error marking all notifications as read:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });
});
// Log invitation creation for tracking (no email sending)
exports.onUserInvitationCreated = (0, firestore_1.onDocumentCreated)("userInvitations/{invitationId}", async (event) => {
    var _a;
    try {
        const invitation = (_a = event.data) === null || _a === void 0 ? void 0 : _a.data();
        if (!invitation)
            return;
        console.log(`📧 Invitation created for ${invitation.toEmail} from ${invitation.fromUserDisplayName} (${invitation.fromUserEmail})`);
        console.log(`🔗 Invitation ID: ${event.params.invitationId}`);
        // Log for audit/analytics purposes - no actual email sending
    }
    catch (error) {
        console.error('Error logging invitation creation:', error);
    }
});
/**
 * Firestore Trigger: Chat message notifications
 * Sends notifications to participants when new messages are added
 * - Only notifies users who don't have the chat open
 * - Removes previous unread notifications from the same conversation to avoid overwhelming
 */
exports.onChatMessageCreated = (0, firestore_1.onDocumentCreated)("files/{chatId}/messages/{messageId}", async (event) => {
    var _a;
    try {
        const messageData = (_a = event.data) === null || _a === void 0 ? void 0 : _a.data();
        const chatId = event.params.chatId;
        const messageId = event.params.messageId;
        if (!messageData)
            return;
        const senderId = messageData.senderId;
        const senderName = messageData.senderName || 'Someone';
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
        const participants = chatData.participants || [];
        const chatType = chatData.type || 'individual';
        // Get active chat sessions to check who has the chat open
        // Simplified query to avoid index requirement - get all sessions and filter by time in code
        const activeSessionsSnapshot = await db.collection('activeChatSessions')
            .where('chatId', '==', chatId)
            .get();
        // Filter sessions to only those active within last 5 minutes
        const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
        const usersWithChatOpen = new Set();
        activeSessionsSnapshot.docs.forEach(doc => {
            var _a, _b, _c;
            const sessionData = doc.data();
            const sessionTimestamp = ((_c = (_b = (_a = sessionData.timestamp) === null || _a === void 0 ? void 0 : _a.toDate) === null || _b === void 0 ? void 0 : _b.call(_a)) === null || _c === void 0 ? void 0 : _c.getTime()) || 0;
            if (sessionTimestamp > fiveMinutesAgo) {
                usersWithChatOpen.add(sessionData.userId);
            }
        });
        console.log(`💬 New message in chat ${chatId} from ${senderName}`);
        console.log(`👥 Participants: ${participants.length}, Active: ${usersWithChatOpen.size}`);
        // Notify each participant (except the sender and those with chat open)
        for (const participantId of participants) {
            // Skip the sender
            if (participantId === senderId)
                continue;
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
            // Create new notification
            const notificationTitle = chatType === 'group'
                ? `New message in group chat`
                : `New message from ${senderName}`;
            const notificationMessage = chatType === 'group'
                ? `${senderName} sent a message`
                : `Click to view message`;
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
        }
    }
    catch (error) {
        console.error('❌ Error creating chat notification:', error);
    }
});
//# sourceMappingURL=index.js.map