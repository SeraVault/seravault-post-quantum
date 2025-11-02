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
import { db } from '../firebase';
import type { ChatMessage, Conversation, UserPresence } from '../types/chat';
import { encryptStringToMetadata, decryptMetadata, encryptData, decryptData, hexToBytes } from '../crypto/quantumSafeCrypto';

export class ChatService {
  /**
   * Create a new conversation (individual or group)
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
    
    for (const participantId of [currentUserId, ...participantIds]) {
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
    
    // Create conversation document
    const conversationData: any = {
      type,
      participants: [currentUserId, ...participantIds],
      createdAt: serverTimestamp(),
      createdBy: currentUserId,
      lastMessageAt: serverTimestamp(),
      encryptedKeys,
    };
    
    if (type === 'group') {
      conversationData.groupName = groupName;
      conversationData.groupDescription = groupDescription;
      conversationData.admins = [currentUserId];
    }
    
    const conversationRef = await addDoc(collection(db, 'conversations'), conversationData);
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
    const conversationRef = doc(db, 'conversations', conversationId);
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
    const conversationRef = doc(db, 'conversations', conversationId);
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
    
    // Get sender name for caching
    const { getUserProfile } = await import('../firestore');
    const senderProfile = await getUserProfile(currentUserId);
    const senderName = senderProfile?.displayName || 'Unknown User';
    
    // Create message document
    const messageData: Partial<ChatMessage> = {
      conversationId,
      senderId: currentUserId,
      senderName,
      encryptedContent,
      timestamp: serverTimestamp(),
      type,
    };
    
    if (fileMetadata) {
      messageData.fileMetadata = fileMetadata;
    }
    
    const messageRef = await addDoc(collection(db, 'messages'), messageData);
    
    // Update conversation's last message timestamp
    await updateDoc(conversationRef, {
      lastMessageAt: serverTimestamp()
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
    
    const messagesQuery = query(
      collection(db, 'messages'),
      where('conversationId', '==', conversationId),
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
    const messagesQuery = query(
      collection(db, 'messages'),
      where('conversationId', '==', conversationId),
      orderBy('timestamp', 'desc'),
      limit(limitCount)
    );
    
    const unsubscribe = onSnapshot(messagesQuery, async (snapshot) => {
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
      }
    });
    
    return unsubscribe;
  }
  
  /**
   * Get all conversations for current user
   */
  static async getConversations(currentUserId: string): Promise<Conversation[]> {
    const conversationsQuery = query(
      collection(db, 'conversations'),
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
   * Subscribe to real-time conversations
   */
  static subscribeToConversations(
    currentUserId: string,
    onUpdate: (conversations: Conversation[]) => void
  ): () => void {
    const conversationsQuery = query(
      collection(db, 'conversations'),
      where('participants', 'array-contains', currentUserId),
      orderBy('lastMessageAt', 'desc')
    );
    
    const unsubscribe = onSnapshot(conversationsQuery, (snapshot) => {
      const conversations = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Conversation[];
      
      onUpdate(conversations);
    });
    
    return unsubscribe;
  }
  
  /**
   * Mark message as read
   */
  static async markMessageAsRead(
    messageId: string,
    currentUserId: string
  ): Promise<void> {
    const messageRef = doc(db, 'messages', messageId);
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
    const messagesQuery = query(
      collection(db, 'messages'),
      where('conversationId', '==', conversationId),
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
    const conversationRef = doc(db, 'conversations', conversationId);
    
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
    const conversationRef = doc(db, 'conversations', conversationId);
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
    messageId: string,
    currentUserId: string
  ): Promise<void> {
    const messageRef = doc(db, 'messages', messageId);
    const messageSnap = await getDoc(messageRef);
    
    if (!messageSnap.exists()) {
      throw new Error('Message not found');
    }
    
    const message = messageSnap.data() as ChatMessage;
    
    // Only sender can delete
    if (message.senderId !== currentUserId) {
      throw new Error('Only sender can delete this message');
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
    const conversationRef = doc(db, 'conversations', conversationId);
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
}
