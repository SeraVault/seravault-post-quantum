import { doc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Service to track active chat sessions
 * Used to prevent notifications when user has chat open
 */
export class ActiveChatSessionService {
  private static readonly COLLECTION_NAME = 'activeChatSessions';
  private static activeSessionId: string | null = null;

  /**
   * Mark a chat as actively open for the current user
   * This prevents notifications for messages in this chat
   */
  static async setActiveChatSession(userId: string, chatId: string): Promise<void> {
    try {
      // Clean up any previous session
      await this.clearActiveChatSession();

      // Create a unique session ID
      const sessionId = `${userId}_${chatId}_${Date.now()}`;
      this.activeSessionId = sessionId;

      const sessionRef = doc(db, this.COLLECTION_NAME, sessionId);
      await setDoc(sessionRef, {
        userId,
        chatId,
        timestamp: serverTimestamp()
      });

      console.log(`✅ Active chat session set: ${chatId} for user ${userId}`);
    } catch (error) {
      console.error('Error setting active chat session:', error);
    }
  }

  /**
   * Clear the active chat session
   * Should be called when user closes the chat or navigates away
   */
  static async clearActiveChatSession(): Promise<void> {
    if (!this.activeSessionId) return;

    try {
      const sessionRef = doc(db, this.COLLECTION_NAME, this.activeSessionId);
      await deleteDoc(sessionRef);
      console.log(`✅ Active chat session cleared: ${this.activeSessionId}`);
      this.activeSessionId = null;
    } catch (error) {
      console.error('Error clearing active chat session:', error);
    }
  }

  /**
   * Update the timestamp of the current active session
   * Call this periodically (e.g., every 2-3 minutes) to keep session alive
   */
  static async refreshActiveChatSession(): Promise<void> {
    if (!this.activeSessionId) return;

    try {
      const sessionRef = doc(db, this.COLLECTION_NAME, this.activeSessionId);
      await setDoc(sessionRef, {
        timestamp: serverTimestamp()
      }, { merge: true });

      console.log(`🔄 Active chat session refreshed: ${this.activeSessionId}`);
    } catch (error) {
      console.error('Error refreshing active chat session:', error);
    }
  }
}
