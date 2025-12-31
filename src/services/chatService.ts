import { 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  query, 
  where, 
  orderBy, 
  limit,
  getDocs,
  getDoc,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  writeBatch
} from 'firebase/firestore';
import { getStorage, ref, deleteObject } from 'firebase/storage';
import { legacyDb as db } from '../backend/FirebaseBackend';
import type { ChatMessage, Conversation, UserPresence } from '../types/chat';
import { encryptStringToMetadata, decryptMetadata, encryptData, decryptData, hexToBytes } from '../crypto/quantumSafeCrypto';

export class ChatService {
  /**
   * Create a new conversation (individual or group)
   * Now stores conversations in the 'files' collection with fileType: 'chat'
   */
  static async createConversation(
    currentUserId: string,
    participantIds: string[],
    type: 'individual' | 'group',
    userPrivateKey: string,
    groupName?: string,
    groupDescription?: string
  ): Promise<string> {
    // Generate a new conversation key (random 32 bytes)
    const conversationKey = crypto.getRandomValues(new Uint8Array(32));
    
    // Get public keys for all participants
    const { getUserPublicKey } = await import('../firestore');
    const encryptedKeys: { [userId: string]: string } = {};
    
    const allParticipants = [currentUserId, ...participantIds];
    
    for (const participantId of allParticipants) {
      const publicKey = await getUserPublicKey(participantId);
      if (!publicKey) {
        throw new Error(`Public key not found for user ${participantId}`);
      }
      
      // Encrypt conversation key for this participant
      const encrypted = await encryptData(conversationKey, hexToBytes(publicKey));
      const keyData = new Uint8Array([
        ...encrypted.iv,
        ...encrypted.encapsulatedKey,
        ...encrypted.ciphertext
      ]);
      const { bytesToHex } = await import('../crypto/quantumSafeCrypto');
      encryptedKeys[participantId] = bytesToHex(keyData);
    }
    
    // Determine default conversation name
    let conversationName = groupName || 'New Conversation';
    if (type === 'individual' && participantIds.length === 1) {
      // For individual chats, use the other participant's name
      const { getUserProfile } = await import('../firestore');
      const otherUser = await getUserProfile(participantIds[0]);
      if (otherUser) {
        conversationName = `Chat with ${otherUser.displayName}`;
      }
    }
    
    // Encrypt conversation name for each participant
    const encryptedName = await encryptStringToMetadata(conversationName, conversationKey);
    
    // Create per-user encrypted names (each user can customize the chat name)
    const userNames: { [uid: string]: { ciphertext: string; nonce: string } } = {};
    const userFolders: { [uid: string]: string | null } = {};
    for (const participantId of allParticipants) {
      userNames[participantId] = encryptedName;
      userFolders[participantId] = null; // All participants start in root folder
    }
    
    // Create conversation document as a file
    const conversationData: any = {
      // File system fields
      fileType: 'chat',
      owner: currentUserId,
      name: encryptedName, // Encrypted conversation name
      userNames, // Per-user names
      userFolders, // All participants in their root folders
      storagePath: '', // Not used for chats
      size: await encryptStringToMetadata('0', conversationKey), // Message count as encrypted metadata
      sharedWith: [...allParticipants], // Create a new array, not a reference
      encryptedKeys,
      createdAt: backendService.utils.serverTimestamp(),
      lastModified: backendService.utils.serverTimestamp(),
      
      // Chat-specific fields
      type,
      participants: [...allParticipants], // Create a new array, not a reference
      createdBy: currentUserId,
      lastMessageAt: serverTimestamp(),
    };
    
    if (type === 'group') {
      conversationData.groupName = groupName;
      conversationData.groupDescription = groupDescription;
      conversationData.admins = [currentUserId];
    }
    
    // Store in files collection instead of conversations collection
    const conversationRef = await addDoc(collection(db, 'files'), conversationData);
    return conversationRef.id;
  }
  
  /**
   * Get decrypted conversation key for current user
   */
  static async getConversationKey(
    conversationId: string,
    currentUserId: string,
    userPrivateKey: string
  ): Promise<Uint8Array> {
    const conversationRef = doc(db, 'files', conversationId);
    const conversationSnap = await getDoc(conversationRef);
    
    if (!conversationSnap.exists()) {
      throw new Error('Conversation not found');
    }
    
    const conversation = conversationSnap.data() as Conversation;
    const encryptedKey = conversation.encryptedKeys[currentUserId];
    
    if (!encryptedKey) {
      throw new Error('No access to this conversation');
    }
    
    // Decrypt conversation key
    const keyData = hexToBytes(encryptedKey);
    const iv = keyData.slice(0, 12);
    const encapsulatedKey = keyData.slice(12, 12 + 1088);
    const ciphertext = keyData.slice(12 + 1088);
    const privateKeyBytes = hexToBytes(userPrivateKey);
    
    const decryptedKey = await decryptData({ iv, encapsulatedKey, ciphertext }, privateKeyBytes);
    return decryptedKey;
  }
  
  /**
   * Send a message in a conversation
   */
  static async sendMessage(
    conversationId: string,
    currentUserId: string,
    userPrivateKey: string,
    content: string,
    type: 'text' | 'file' = 'text',
    fileMetadata?: ChatMessage['fileMetadata']
  ): Promise<string> {
    // Get conversation to find participants
    const conversationRef = doc(db, 'files', conversationId);
    const conversationSnap = await getDoc(conversationRef);
    
    if (!conversationSnap.exists()) {
      throw new Error('Conversation not found');
    }
    
    const conversation = conversationSnap.data() as Conversation;
    
    // Get conversation key
    const conversationKey = await this.getConversationKey(conversationId, currentUserId, userPrivateKey);
    
    // Encrypt message content for each participant with unique nonce
    const encryptedContent: ChatMessage['encryptedContent'] = {};
    
    for (const participantId of conversation.participants) {
      // Each recipient gets the same content but with a unique nonce
      const encrypted = await encryptStringToMetadata(content, conversationKey);
      encryptedContent[participantId] = encrypted;
    }
    
    // Create message document (conversationId is in the path, not the document)
    const messageData: Partial<ChatMessage> = {
      senderId: currentUserId,
      encryptedContent,
      timestamp: backendService.utils.serverTimestamp(),
      type,
    };
    
    if (fileMetadata) {
      messageData.fileMetadata = fileMetadata;
    }
    
    // Use subcollection path: files/{conversationId}/messages
    const messagesCollectionRef = collection(db, 'files', conversationId, 'messages');
    const messageRef = await addDoc(messagesCollectionRef, messageData);
    
    // Update conversation's last message timestamp
    await updateDoc(conversationRef, {
      lastMessageAt: backendService.utils.serverTimestamp(),
      lastModified: backendService.utils.serverTimestamp()
    });
    
    return messageRef.id;
  }
  
  /**
   * Get decrypted messages for a conversation
   */
  static async getMessages(
    conversationId: string,
    currentUserId: string,
    userPrivateKey: string,
    limitCount: number = 50
  ): Promise<ChatMessage[]> {
    const conversationKey = await this.getConversationKey(conversationId, currentUserId, userPrivateKey);
    
    // Use subcollection path: files/{conversationId}/messages
    const messagesCollectionRef = collection(db, 'files', conversationId, 'messages');
    const messagesQuery = query(
      messagesCollectionRef,
      orderBy('timestamp', 'desc'),
      limit(limitCount)
    );
    
    const messagesSnap = await getDocs(messagesQuery);
    const messages: ChatMessage[] = [];
    
    for (const messageDoc of messagesSnap.docs) {
      const messageData = { id: messageDoc.id, ...messageDoc.data() } as ChatMessage;
      
      // Decrypt message content for current user
      if (messageData.encryptedContent[currentUserId]) {
        try {
          const decryptedContent = await decryptMetadata(
            messageData.encryptedContent[currentUserId],
            conversationKey
          );
          
          // Add decrypted content as a temporary property
          (messageData as any).content = decryptedContent;
          messages.push(messageData);
        } catch (error) {
          console.error('Failed to decrypt message:', messageData.id, error);
          // Still add the message but without content
          (messageData as any).content = '[Encrypted]';
          messages.push(messageData);
        }
      }
    }
    
    return messages.reverse(); // Return in chronological order
  }
  
  /**
   * Subscribe to real-time messages
   */
  static subscribeToMessages(
    conversationId: string,
    currentUserId: string,
    userPrivateKey: string,
    onUpdate: (messages: ChatMessage[]) => void,
    limitCount: number = 50
  ): () => void {
    // Use subcollection path: files/{conversationId}/messages
    const messagesCollectionRef = collection(db, 'files', conversationId, 'messages');
    const messagesQuery = query(
      messagesCollectionRef,
      orderBy('timestamp', 'desc'),
      limit(limitCount)
    );
    
    let debounceTimer: NodeJS.Timeout | null = null;
    let isProcessing = false;
    
    const unsubscribe = onSnapshot(messagesQuery, async (snapshot) => {
      // Clear any pending callback
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      
      // Debounce to batch rapid message changes (especially during bulk sends)
      debounceTimer = setTimeout(async () => {
        // Prevent concurrent processing
        if (isProcessing) return;
        isProcessing = true;
        
        try {
          const conversationKey = await this.getConversationKey(conversationId, currentUserId, userPrivateKey);
          const messages: ChatMessage[] = [];
          
          for (const messageDoc of snapshot.docs) {
            const messageData = { id: messageDoc.id, ...messageDoc.data() } as ChatMessage;
            
            // Decrypt message content for current user
            if (messageData.encryptedContent[currentUserId]) {
              try {
                const decryptedContent = await decryptMetadata(
                  messageData.encryptedContent[currentUserId],
                  conversationKey
                );
                
                (messageData as any).content = decryptedContent;
                messages.push(messageData);
              } catch (error) {
                console.error('Failed to decrypt message:', messageData.id, error);
                (messageData as any).content = '[Encrypted]';
                messages.push(messageData);
              }
            }
          }
          
          onUpdate(messages.reverse());
        } catch (error) {
          console.error('Error in message subscription:', error);
        } finally {
          isProcessing = false;
        }
      }, 150); // 150ms debounce for chat messages
    }, (error) => {
      console.warn('Error in subscribeToMessages:', error);
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      onUpdate([]);
    });
    
    return () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      unsubscribe();
    };
  }
  
  /**
   * Get all conversations for current user
   */
  static async getConversations(currentUserId: string): Promise<Conversation[]> {
    // Query files collection for chat type files
    const conversationsQuery = query(
      collection(db, 'files'),
      where('fileType', '==', 'chat'),
      where('participants', 'array-contains', currentUserId),
      orderBy('lastMessageAt', 'desc')
    );
    
    const conversationsSnap = await getDocs(conversationsQuery);
    return conversationsSnap.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as Conversation[];
  }
  
  /**
   * Get a single conversation by ID
   */
  static async getConversation(conversationId: string): Promise<Conversation | null> {
    const conversationDoc = await getDoc(doc(db, 'files', conversationId));
    
    if (!conversationDoc.exists()) {
      return null;
    }
    
    return {
      id: conversationDoc.id,
      ...conversationDoc.data()
    } as Conversation;
  }
  
  /**
   * Subscribe to real-time conversations
   */
  static subscribeToConversations(
    currentUserId: string,
    onUpdate: (conversations: Conversation[]) => void
  ): () => void {
    // Query files collection for chat type files
    const conversationsQuery = query(
      collection(db, 'files'),
      where('fileType', '==', 'chat'),
      where('participants', 'array-contains', currentUserId),
      orderBy('lastMessageAt', 'desc')
    );
    
    let debounceTimer: NodeJS.Timeout | null = null;
    
    const unsubscribe = onSnapshot(conversationsQuery, (snapshot) => {
      // Clear any pending callback
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      
      // Debounce to batch rapid conversation updates
      debounceTimer = setTimeout(() => {
        const conversations = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Conversation[];
        
        onUpdate(conversations);
      }, 200); // 200ms debounce for conversations list
    }, (error) => {
      console.warn('Error in subscribeToConversations:', error);
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      onUpdate([]);
    });
    
    return () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      unsubscribe();
    };
  }
  
  /**
   * Mark message as read
   */
  static async markMessageAsRead(
    conversationId: string,
    messageId: string,
    currentUserId: string
  ): Promise<void> {
    // Use subcollection path: files/{conversationId}/messages/{messageId}
    const messageRef = doc(db, 'files', conversationId, 'messages', messageId);
    await updateDoc(messageRef, {
      [`readBy.${currentUserId}`]: new Date()
    });
  }
  
  /**
   * Mark all messages in conversation as read
   */
  static async markConversationAsRead(
    conversationId: string,
    currentUserId: string
  ): Promise<void> {
    // Use subcollection path: files/{conversationId}/messages
    const messagesCollectionRef = collection(db, 'files', conversationId, 'messages');
    const messagesQuery = query(
      messagesCollectionRef,
      where(`readBy.${currentUserId}`, '==', null)
    );
    
    const messagesSnap = await getDocs(messagesQuery);
    const batch = writeBatch(db);
    
    messagesSnap.docs.forEach(messageDoc => {
      batch.update(messageDoc.ref, {
        [`readBy.${currentUserId}`]: new Date()
      });
    });
    
    await batch.commit();
  }
  
  /**
   * Update typing indicator
   */
  static async updateTypingIndicator(
    conversationId: string,
    currentUserId: string,
    isTyping: boolean
  ): Promise<void> {
    const conversationRef = doc(db, 'files', conversationId);
    
    if (isTyping) {
      await updateDoc(conversationRef, {
        [`typing.${currentUserId}`]: new Date()
      });
    } else {
      await updateDoc(conversationRef, {
        [`typing.${currentUserId}`]: null
      });
    }
  }
  
  /**
   * Add participants to group chat
   */
  static async addParticipants(
    conversationId: string,
    currentUserId: string,
    userPrivateKey: string,
    newParticipantIds: string[]
  ): Promise<void> {
    const conversationRef = doc(db, 'files', conversationId);
    const conversationSnap = await getDoc(conversationRef);
    
    if (!conversationSnap.exists()) {
      throw new Error('Conversation not found');
    }
    
    const conversation = conversationSnap.data() as Conversation;
    
    // Check if user is admin
    if (conversation.type === 'group' && !conversation.admins?.includes(currentUserId)) {
      throw new Error('Only admins can add participants');
    }
    
    // Get conversation key
    const conversationKey = await this.getConversationKey(conversationId, currentUserId, userPrivateKey);
    
    // Encrypt conversation key for new participants
    const { getUserPublicKey } = await import('../firestore');
    const newEncryptedKeys: { [userId: string]: string } = {};
    
    for (const participantId of newParticipantIds) {
      const publicKey = await getUserPublicKey(participantId);
      if (!publicKey) {
        throw new Error(`Public key not found for user ${participantId}`);
      }
      
      const encrypted = await encryptData(conversationKey, hexToBytes(publicKey));
      const keyData = new Uint8Array([
        ...encrypted.iv,
        ...encrypted.encapsulatedKey,
        ...encrypted.ciphertext
      ]);
      const { bytesToHex } = await import('../crypto/quantumSafeCrypto');
      newEncryptedKeys[participantId] = bytesToHex(keyData);
    }
    
    // Update conversation
    const updatedParticipants = [...new Set([...conversation.participants, ...newParticipantIds])];
    const updatedEncryptedKeys = { ...conversation.encryptedKeys, ...newEncryptedKeys };
    
    await updateDoc(conversationRef, {
      participants: updatedParticipants,
      encryptedKeys: updatedEncryptedKeys
    });
  }
  
  /**
   * Delete a message
   */
  static async deleteMessage(
    conversationId: string,
    messageId: string,
    currentUserId: string
  ): Promise<void> {
    // Use subcollection path: files/{conversationId}/messages/{messageId}
    const messageRef = doc(db, 'files', conversationId, 'messages', messageId);
    const messageSnap = await getDoc(messageRef);
    
    if (!messageSnap.exists()) {
      throw new Error('Message not found');
    }
    
    const message = messageSnap.data() as ChatMessage;
    
    // Only sender can delete
    if (message.senderId !== currentUserId) {
      throw new Error('Only sender can delete this message');
    }
    
    // If message has a file attachment, delete from storage
    if (message.type === 'file' && message.fileMetadata?.storagePath) {
      try {
        const storage = getStorage();
        const fileRef = ref(storage, message.fileMetadata.storagePath);
        await deleteObject(fileRef);
        console.log('Deleted file attachment from storage:', message.fileMetadata.storagePath);
      } catch (error) {
        console.error('Failed to delete file attachment from storage:', error);
        // Continue with message deletion even if storage delete fails
      }
    }
    
    await deleteDoc(messageRef);
  }
  
  /**
   * Leave a conversation
   */
  static async leaveConversation(
    conversationId: string,
    currentUserId: string
  ): Promise<void> {
    const conversationRef = doc(db, 'files', conversationId);
    const conversationSnap = await getDoc(conversationRef);
    
    if (!conversationSnap.exists()) {
      throw new Error('Conversation not found');
    }
    
    const conversation = conversationSnap.data() as Conversation;
    
    // Remove user from participants
    const updatedParticipants = conversation.participants.filter(id => id !== currentUserId);
    
    if (updatedParticipants.length === 0) {
      // Delete conversation if no participants left
      await deleteDoc(conversationRef);
    } else {
      await updateDoc(conversationRef, {
        participants: updatedParticipants
      });
    }
  }

  /**
   * Add emoji reaction to a message
   */
  static async addReaction(
    conversationId: string,
    messageId: string,
    currentUserId: string,
    emoji: string
  ): Promise<void> {
    const messageRef = doc(db, 'files', conversationId, 'messages', messageId);
    const messageDoc = await getDoc(messageRef);
    
    if (!messageDoc.exists()) {
      throw new Error('Message not found');
    }

    const messageData = messageDoc.data() as ChatMessage;
    const reactions = messageData.reactions || {};
    
    // Initialize emoji array if it doesn't exist
    if (!reactions[emoji]) {
      reactions[emoji] = [];
    }
    
    // Add user to emoji reactions if not already there
    if (!reactions[emoji].includes(currentUserId)) {
      reactions[emoji].push(currentUserId);
    }

    await updateDoc(messageRef, { reactions });
  }

  /**
   * Remove emoji reaction from a message
   */
  static async removeReaction(
    conversationId: string,
    messageId: string,
    currentUserId: string,
    emoji: string
  ): Promise<void> {
    const messageRef = doc(db, 'files', conversationId, 'messages', messageId);
    const messageDoc = await getDoc(messageRef);
    
    if (!messageDoc.exists()) {
      throw new Error('Message not found');
    }

    const messageData = messageDoc.data() as ChatMessage;
    const reactions = messageData.reactions || {};
    
    if (reactions[emoji]) {
      // Remove user from emoji reactions
      reactions[emoji] = reactions[emoji].filter(id => id !== currentUserId);
      
      // Remove emoji key if no users left
      if (reactions[emoji].length === 0) {
        delete reactions[emoji];
      }
    }

    await updateDoc(messageRef, { reactions });
  }

  /**
   * Toggle emoji reaction (add if not present, remove if present)
   */
  static async toggleReaction(
    conversationId: string,
    messageId: string,
    currentUserId: string,
    emoji: string
  ): Promise<void> {
    const messageRef = doc(db, 'files', conversationId, 'messages', messageId);
    const messageDoc = await getDoc(messageRef);
    
    if (!messageDoc.exists()) {
      throw new Error('Message not found');
    }

    const messageData = messageDoc.data() as ChatMessage;
    const reactions = messageData.reactions || {};
    
    if (reactions[emoji]?.includes(currentUserId)) {
      // User already reacted, remove it
      await this.removeReaction(conversationId, messageId, currentUserId, emoji);
    } else {
      // Add reaction
      await this.addReaction(conversationId, messageId, currentUserId, emoji);
    }
  }
}
