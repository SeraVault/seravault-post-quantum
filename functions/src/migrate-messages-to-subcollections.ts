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

import {onCall, HttpsError} from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";

const db = admin.firestore();

interface OldMessage {
  id: string;
  conversationId: string;
  senderId: string;
  senderName?: string;
  encryptedContent: {
    [recipientId: string]: {
      ciphertext: string;
      nonce: string;
    };
  };
  timestamp: admin.firestore.Timestamp;
  type: 'text' | 'file' | 'system';
  fileMetadata?: {
    fileName: string;
    fileSize: number;
    mimeType: string;
    storagePath: string;
  };
  readBy?: {
    [userId: string]: admin.firestore.Timestamp;
  };
  reactions?: {
    [emoji: string]: string[];
  };
  edited?: boolean;
  editedAt?: admin.firestore.Timestamp;
  // Old fields no longer needed
  participants?: string[];
}

interface MigrationStats {
  totalMessages: number;
  migratedMessages: number;
  failedMessages: number;
  errors: string[];
}

export const migrateMessagesToSubcollections = onCall(
  async (request) => {
    // Require authentication
    if (!request.auth) {
      throw new HttpsError(
        'unauthenticated',
        'Must be authenticated to run migration'
      );
    }

    // Optional: Check if user is admin
    // const isAdmin = request.auth.token.admin === true;
    // if (!isAdmin) {
    //   throw new HttpsError(
    //     'permission-denied',
    //     'Must be admin to run migration'
    //   );
    // }

    const stats: MigrationStats = {
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
          const oldMessage = messageDoc.data() as OldMessage;
          
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
          const newMessageData: any = {
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
        } catch (error) {
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
    } catch (error) {
      logger.error('❌ Migration failed:', error);
      throw new HttpsError(
        'internal',
        'Migration failed'
      );
    }
  }
);

/**
 * HTTP function to verify migration (count messages in both places)
 */
export const verifyMessageMigration = onCall(
  async (request) => {
    if (!request.auth) {
      throw new HttpsError(
        'unauthenticated',
        'Must be authenticated'
      );
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
    } catch (error) {
      throw new HttpsError(
        'internal',
        'Verification failed'
      );
    }
  }
);

/**
 * DANGER: Delete old messages collection after verifying migration
 * Only run this after confirming the migration was successful
 */
export const deleteOldMessagesCollection = onCall(
  async (request) => {
    if (!request.auth) {
      throw new HttpsError(
        'unauthenticated',
        'Must be authenticated'
      );
    }

    // Require explicit confirmation
    if (request.data?.confirmation !== 'DELETE_OLD_MESSAGES') {
      throw new HttpsError(
        'failed-precondition',
        'Must provide confirmation: "DELETE_OLD_MESSAGES"'
      );
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
    } catch (error) {
      logger.error('❌ Deletion failed:', error);
      throw new HttpsError(
        'internal',
        'Deletion failed'
      );
    }
  }
);
