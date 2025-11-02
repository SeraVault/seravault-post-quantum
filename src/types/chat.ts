import { FieldValue } from 'firebase/firestore';

/**
 * Chat message with quantum-safe encryption
 * Each message has its own unique nonce for security
 * Note: With subcollections, conversationId is in the path, not the document
 */
export interface ChatMessage {
  id?: string;
  conversationId?: string; // Optional - for backward compatibility during migration
  senderId: string;
  senderName?: string; // Cached sender name for display
  
  // Participants array no longer needed with subcollections (kept for migration)
  participants?: string[];
  
  // Encrypted content - each recipient gets their own encrypted version
  encryptedContent: {
    [recipientId: string]: {
      ciphertext: string;
      nonce: string; // Unique nonce per message per recipient
    };
  };
  
  // Message metadata
  timestamp: FieldValue | Date;
  edited?: boolean;
  editedAt?: Date;
  
  // Message type
  type: 'text' | 'file' | 'system';
  
  // For file messages
  fileMetadata?: {
    fileName: string;
    fileSize: number;
    mimeType: string;
    storagePath: string;
  };
  
  // Read receipts per user
  readBy?: {
    [userId: string]: Date;
  };
  
  // Reactions (optional future feature)
  reactions?: {
    [emoji: string]: string[]; // emoji -> array of userIds
  };
}

/**
 * Chat conversation (individual or group)
 */
export interface Conversation {
  id?: string;
  type: 'individual' | 'group';
  
  // Participants
  participants: string[]; // Array of user IDs
  
  // Group metadata (only for group chats)
  groupName?: string;
  groupDescription?: string;
  groupAvatar?: string;
  admins?: string[]; // User IDs with admin privileges
  
  // Conversation metadata
  createdAt: FieldValue | Date;
  createdBy: string;
  lastMessageAt?: Date;
  lastMessagePreview?: string; // Encrypted preview for each user
  
  // Encryption keys - each participant has encrypted conversation key
  encryptedKeys: {
    [userId: string]: string; // userId -> encrypted conversation key
  };
  
  // Per-user settings
  userSettings?: {
    [userId: string]: {
      muted?: boolean;
      archived?: boolean;
      pinnedAt?: Date;
      customName?: string; // User's custom name for this conversation
      lastRead?: Date;
    };
  };
  
  // Typing indicators (not persisted, used in real-time)
  typing?: {
    [userId: string]: Date;
  };
}

/**
 * User presence status
 */
export interface UserPresence {
  userId: string;
  status: 'online' | 'away' | 'offline';
  lastSeen: Date;
  currentlyTypingIn?: string; // conversationId if typing
}

/**
 * Chat notification
 */
export interface ChatNotification {
  id?: string;
  recipientId: string;
  conversationId: string;
  messageId: string;
  senderId: string;
  senderName: string;
  preview: string; // Encrypted message preview
  timestamp: FieldValue | Date;
  read: boolean;
}
