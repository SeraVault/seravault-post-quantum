"use strict";
/**
 * Migration script to move messages from /messages collection
 * to /conversations/{conversationId}/messages subcollections
 *
 * This is a one-time migration script. Run it after deploying the new
 * Firestore rules and indexes that support subcollections.
 *
 * Usage:
 * 1. Deploy this as a callable function
 * 2. Call it from the Firebase Console or a test script
 * 3. It will migrate all messages in batches
 * 4. After successful migration, you can delete the old /messages collection
 */
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteOldMessagesCollection = exports.verifyMessageMigration = exports.migrateMessagesToSubcollections = void 0;
const https_1 = require("firebase-functions/v2/https");
const admin = __importStar(require("firebase-admin"));
const logger = __importStar(require("firebase-functions/logger"));
const db = admin.firestore();
exports.migrateMessagesToSubcollections = (0, https_1.onCall)(async (request) => {
    // Require authentication
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'Must be authenticated to run migration');
    }
    // Optional: Check if user is admin
    // const isAdmin = request.auth.token.admin === true;
    // if (!isAdmin) {
    //   throw new HttpsError(
    //     'permission-denied',
    //     'Must be admin to run migration'
    //   );
    // }
    const stats = {
        totalMessages: 0,
        migratedMessages: 0,
        failedMessages: 0,
        errors: [],
    };
    try {
        logger.info('🚀 Starting message migration to subcollections');
        // Get all messages from the old collection
        const messagesSnapshot = await db.collection('messages').get();
        stats.totalMessages = messagesSnapshot.size;
        logger.info(`📊 Found ${stats.totalMessages} messages to migrate`);
        // Process in batches of 500 (Firestore batch limit)
        const batchSize = 500;
        let batch = db.batch();
        let batchCount = 0;
        for (const messageDoc of messagesSnapshot.docs) {
            try {
                const oldMessage = messageDoc.data();
                if (!oldMessage.conversationId) {
                    stats.errors.push(`Message ${messageDoc.id} has no conversationId`);
                    stats.failedMessages++;
                    continue;
                }
                // Create new message document in subcollection
                const newMessageRef = db
                    .collection('conversations')
                    .doc(oldMessage.conversationId)
                    .collection('messages')
                    .doc(messageDoc.id); // Keep the same ID
                // Remove old fields that are no longer needed
                const newMessageData = {
                    senderId: oldMessage.senderId,
                    senderName: oldMessage.senderName,
                    encryptedContent: oldMessage.encryptedContent,
                    timestamp: oldMessage.timestamp,
                    type: oldMessage.type,
                };
                // Add optional fields if they exist
                if (oldMessage.fileMetadata) {
                    newMessageData.fileMetadata = oldMessage.fileMetadata;
                }
                if (oldMessage.readBy) {
                    newMessageData.readBy = oldMessage.readBy;
                }
                if (oldMessage.reactions) {
                    newMessageData.reactions = oldMessage.reactions;
                }
                if (oldMessage.edited) {
                    newMessageData.edited = oldMessage.edited;
                }
                if (oldMessage.editedAt) {
                    newMessageData.editedAt = oldMessage.editedAt;
                }
                // Add to batch
                batch.set(newMessageRef, newMessageData);
                batchCount++;
                stats.migratedMessages++;
                // Commit batch if we've reached the limit
                if (batchCount >= batchSize) {
                    await batch.commit();
                    logger.info(`✅ Committed batch of ${batchCount} messages`);
                    batch = db.batch();
                    batchCount = 0;
                }
            }
            catch (error) {
                const errorMsg = `Failed to migrate message ${messageDoc.id}: ${error}`;
                logger.error(errorMsg);
                stats.errors.push(errorMsg);
                stats.failedMessages++;
            }
        }
        // Commit remaining messages
        if (batchCount > 0) {
            await batch.commit();
            logger.info(`✅ Committed final batch of ${batchCount} messages`);
        }
        logger.info('🎉 Migration completed', stats);
        return {
            success: true,
            stats,
            message: `Migrated ${stats.migratedMessages} of ${stats.totalMessages} messages. ${stats.failedMessages} failed.`,
        };
    }
    catch (error) {
        logger.error('❌ Migration failed:', error);
        throw new https_1.HttpsError('internal', 'Migration failed');
    }
});
/**
 * HTTP function to verify migration (count messages in both places)
 */
exports.verifyMessageMigration = (0, https_1.onCall)(async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'Must be authenticated');
    }
    try {
        // Count old messages
        const oldMessagesSnapshot = await db.collection('messages').get();
        const oldCount = oldMessagesSnapshot.size;
        // Count messages in subcollections (need to query all conversations)
        const conversationsSnapshot = await db.collection('conversations').get();
        let newCount = 0;
        for (const convDoc of conversationsSnapshot.docs) {
            const messagesSnapshot = await db
                .collection('conversations')
                .doc(convDoc.id)
                .collection('messages')
                .get();
            newCount += messagesSnapshot.size;
        }
        logger.info(`📊 Old collection: ${oldCount} messages`);
        logger.info(`📊 New subcollections: ${newCount} messages`);
        return {
            oldCollection: oldCount,
            newSubcollections: newCount,
            migrationComplete: oldCount === newCount && oldCount > 0,
        };
    }
    catch (error) {
        throw new https_1.HttpsError('internal', 'Verification failed');
    }
});
/**
 * DANGER: Delete old messages collection after verifying migration
 * Only run this after confirming the migration was successful
 */
exports.deleteOldMessagesCollection = (0, https_1.onCall)(async (request) => {
    var _a;
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'Must be authenticated');
    }
    // Require explicit confirmation
    if (((_a = request.data) === null || _a === void 0 ? void 0 : _a.confirmation) !== 'DELETE_OLD_MESSAGES') {
        throw new https_1.HttpsError('failed-precondition', 'Must provide confirmation: "DELETE_OLD_MESSAGES"');
    }
    try {
        logger.info('🗑️ Starting deletion of old messages collection');
        const messagesSnapshot = await db.collection('messages').get();
        const totalToDelete = messagesSnapshot.size;
        logger.info(`📊 Found ${totalToDelete} messages to delete`);
        // Delete in batches
        const batchSize = 500;
        let batch = db.batch();
        let batchCount = 0;
        let deletedCount = 0;
        for (const messageDoc of messagesSnapshot.docs) {
            batch.delete(messageDoc.ref);
            batchCount++;
            deletedCount++;
            if (batchCount >= batchSize) {
                await batch.commit();
                logger.info(`🗑️ Deleted batch of ${batchCount} messages`);
                batch = db.batch();
                batchCount = 0;
            }
        }
        // Delete remaining
        if (batchCount > 0) {
            await batch.commit();
            logger.info(`🗑️ Deleted final batch of ${batchCount} messages`);
        }
        logger.info(`✅ Deleted ${deletedCount} old messages`);
        return {
            success: true,
            deletedCount,
            message: `Deleted ${deletedCount} messages from old collection`,
        };
    }
    catch (error) {
        logger.error('❌ Deletion failed:', error);
        throw new https_1.HttpsError('internal', 'Deletion failed');
    }
});
//# sourceMappingURL=migrate-messages-to-subcollections.js.map