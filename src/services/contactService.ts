import { 
  collection, 
  query, 
  where, 
  orderBy, 
  limit, 
  getDocs,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  onSnapshot,
  FieldValue,
  or,
  and,
  Timestamp
} from 'firebase/firestore';
import { legacyDb as db, legacyAuth as auth } from '../backend/FirebaseBackend';
import { getUserByEmail, getUserProfile } from '../firestore';

export interface Contact {
  id?: string;
  userId1: string; // First user ID (lexicographically smaller)
  userId2: string; // Second user ID (lexicographically larger)
  user1Email: string;
  user2Email: string;
  user1DisplayName: string;
  user2DisplayName: string;
  status: 'pending' | 'accepted' | 'blocked';
  initiatorUserId: string; // Who sent the contact request
  createdAt: FieldValue;
  acceptedAt?: FieldValue;
  blockedAt?: FieldValue;
  blockedByUserId?: string; // Who blocked the contact
  lastInteractionAt: FieldValue; // Last time users interacted (file sharing, etc)
  metadata?: {
    autoAccepted?: boolean; // If contact was auto-accepted due to domain settings
    sharedFilesCount?: number; // Number of files shared between users
    [key: string]: any;
  };
}

export interface ContactRequest {
  id?: string;
  fromUserId: string;
  fromUserEmail: string;
  fromUserDisplayName: string;
  
  // For registered users - both toUserId and toUserDisplayName will be set
  // For invitations - only toEmail is set initially
  toUserId?: string;
  toUserDisplayName?: string;
  
  // Always set - normalized lowercase email (primary query field)
  toEmail: string;
  
  message?: string;
  status: 'pending' | 'accepted' | 'declined' | 'expired';
  createdAt: FieldValue;
  respondedAt?: FieldValue;
  expiresAt?: FieldValue; // Set by Cloud Function on creation (30 days)
  
  // Indicates if this was sent to a non-registered user
  isInvitation?: boolean;
  
  // Set when a non-user signs up and accepts
  acceptedByUserId?: string;
  acceptedAt?: FieldValue;
  
  triggerEvent?: {
    type: 'file_share_attempt';
    fileId: string;
    fileName?: string;
  };
}

export interface ContactSettings {
  userId: string;
  autoAcceptDomains: string[]; // Auto-accept requests from these email domains
  autoAcceptFromContacts: boolean; // Auto-accept from existing contacts' contacts
  allowFileShareFromUnknown: boolean; // Allow files from unknown users (with prompt)
  blockUnknownUsers: boolean; // Block all interactions from unknown users
  notifyOnContactRequest: boolean;
  notifyOnFileShareFromUnknown: boolean;
  updatedAt: FieldValue;
}

// Type alias for backward compatibility - UserInvitation is now just a ContactRequest
export type UserInvitation = ContactRequest;

export class ContactService {
  private static readonly CONTACTS_COLLECTION = 'contacts';
  private static readonly CONTACT_REQUESTS_COLLECTION = 'contactRequests';
  private static readonly CONTACT_SETTINGS_COLLECTION = 'contactSettings';
  private static readonly REQUEST_EXPIRY_DAYS = 30;

  /**
   * Create a standardized contact ID from two user IDs
   * Ensures consistent ordering regardless of who initiates
   */
  private static createContactId(userId1: string, userId2: string): string {
    const [smallerId, largerId] = [userId1, userId2].sort();
    return `${smallerId}_${largerId}`;
  }

  /**
   * Get contact relationship between two users
   */
  static async getContactRelationship(userId1: string, userId2: string): Promise<Contact | null> {
    const contactId = this.createContactId(userId1, userId2);
    const docRef = doc(db, this.CONTACTS_COLLECTION, contactId);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      return { id: docSnap.id, ...docSnap.data() } as Contact;
    }
    return null;
  }

  /**
   * Check if two users are connected contacts
   */
  static async areUsersConnected(userId1: string, userId2: string): Promise<boolean> {
    const contact = await this.getContactRelationship(userId1, userId2);
    return contact?.status === 'accepted';
  }

  /**
   * Get all contacts for a user
   */
  static async getUserContacts(userId: string): Promise<Contact[]> {
    try {
      console.log(`🔍 Fetching contacts for user: ${userId}`);
      
      // Query where user is either userId1 or userId2
      const q1 = query(
        collection(db, this.CONTACTS_COLLECTION),
        where('userId1', '==', userId),
        where('status', '==', 'accepted')
      );
      
      const q2 = query(
        collection(db, this.CONTACTS_COLLECTION),
        where('userId2', '==', userId),
        where('status', '==', 'accepted')
      );

      console.log('📋 Executing contact queries...');
      const [snapshot1, snapshot2] = await Promise.all([
        getDocs(q1),
        getDocs(q2)
      ]);

      const contacts: Contact[] = [];
      
      snapshot1.forEach((doc) => {
        console.log(`📝 Found contact (userId1): ${doc.id}`);
        contacts.push({ id: doc.id, ...doc.data() } as Contact);
      });
      
      snapshot2.forEach((doc) => {
        console.log(`📝 Found contact (userId2): ${doc.id}`);
        contacts.push({ id: doc.id, ...doc.data() } as Contact);
      });

      console.log(`✅ Found ${contacts.length} contacts for user ${userId}`);
      return contacts;
    } catch (error) {
      console.error('Error fetching user contacts:', error);
      throw error;
    }
  }

  /**
   * Subscribe to real-time contact updates
   * Returns unsubscribe function
   */
  static subscribeToContacts(
    userId: string,
    callback: (contacts: Contact[]) => void
  ): () => void {
    // Query where user is userId1
    const q1 = query(
      collection(db, this.CONTACTS_COLLECTION),
      where('userId1', '==', userId),
      where('status', '==', 'accepted')
    );
    
    // Query where user is userId2
    const q2 = query(
      collection(db, this.CONTACTS_COLLECTION),
      where('userId2', '==', userId),
      where('status', '==', 'accepted')
    );

    const contacts = new Map<string, Contact>();
    let unsubscribed = false;
    let unsubscribe1: (() => void) | null = null;
    let unsubscribe2: (() => void) | null = null;
    let debounceTimer: NodeJS.Timeout | null = null;

    const updateCallback = () => {
      // Clear any pending callback
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      
      // Debounce to batch rapid contact changes from both queries
      debounceTimer = setTimeout(() => {
        if (!unsubscribed) {
          callback(Array.from(contacts.values()));
        }
      }, 150); // 150ms debounce
    };

    // Subscribe to first query
    unsubscribe1 = onSnapshot(q1, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added' || change.type === 'modified') {
          contacts.set(change.doc.id, { id: change.doc.id, ...change.doc.data() } as Contact);
        } else if (change.type === 'removed') {
          contacts.delete(change.doc.id);
        }
      });
      updateCallback();
    });

    // Subscribe to second query
    unsubscribe2 = onSnapshot(q2, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added' || change.type === 'modified') {
          contacts.set(change.doc.id, { id: change.doc.id, ...change.doc.data() } as Contact);
        } else if (change.type === 'removed') {
          contacts.delete(change.doc.id);
        }
      });
      updateCallback();
    });

    // Return combined unsubscribe function
    return () => {
      unsubscribed = true;
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      if (unsubscribe1) unsubscribe1();
      if (unsubscribe2) unsubscribe2();
    };
  }

  /**
   * Send contact request
   */
  static async sendContactRequest(
    fromUserId: string, 
    toUserEmail: string, 
    message?: string,
    triggerEvent?: ContactRequest['triggerEvent']
  ): Promise<string | { invitationId: string; invitationData: Omit<UserInvitation, 'id'> }> {
    console.log('🚀 sendContactRequest called with:', {
      fromUserId,
      toUserEmail,
      message,
      triggerEvent,
      currentAuthUser: auth.currentUser?.uid
    });
    
    let contactRequest: Omit<ContactRequest, 'id'> | null = null;
    
    try {
      // Find the target user by email
      console.log(`🔍 Step 1: Looking up user by email: ${toUserEmail}`);
      const targetUser = await getUserByEmail(toUserEmail);
      if (!targetUser) {
        // User doesn't exist - create an invitation instead
        console.log(`📧 User ${toUserEmail} not found - creating invitation`);
        return this.sendUserInvitation(fromUserId, toUserEmail, message, triggerEvent);
      }
      console.log(`✅ Step 1: Found target user: ${targetUser.id}`);

      const toUserId = targetUser.id;
      
      // Check if users are already connected
      console.log(`🔍 Step 2: Checking existing contact relationship between ${fromUserId} and ${toUserId}`);
      const existingContact = await this.getContactRelationship(fromUserId, toUserId);
      if (existingContact) {
        if (existingContact.status === 'accepted') {
          throw new Error('Users are already connected');
        } else if (existingContact.status === 'blocked') {
          throw new Error('Cannot send contact request to blocked user');
        } else if (existingContact.status === 'pending') {
          throw new Error('Contact request already pending');
        }
      }
      console.log(`✅ Step 2: No existing contact relationship found`);

      // Get user profiles for display names
      console.log(`🔍 Step 3: Getting user profiles`);
      const [fromUserProfile, toUserProfile] = await Promise.all([
        getUserProfile(fromUserId),
        getUserProfile(toUserId)
      ]);

      if (!fromUserProfile || !toUserProfile) {
        throw new Error('User profile not found');
      }
      console.log(`✅ Step 3: Got user profiles`);

      // Check if there's already a pending request
      console.log(`🔍 Step 4: Checking for existing pending requests`);
      const existingRequestQuery = query(
        collection(db, this.CONTACT_REQUESTS_COLLECTION),
        where('fromUserId', '==', fromUserId),
        where('toUserId', '==', toUserId),
        where('status', '==', 'pending')
      );
      
      const existingRequestSnapshot = await getDocs(existingRequestQuery);
      if (!existingRequestSnapshot.empty) {
        throw new Error('Contact request already sent');
      }
      console.log(`✅ Step 4: No existing pending requests found`);

      // Try with minimal data first to debug
      contactRequest = {
        fromUserId,
        fromUserEmail: fromUserProfile.email,
        fromUserDisplayName: fromUserProfile.displayName || 'Unknown',
        toUserId,
        toEmail: targetUser.profile.email.toLowerCase(),
        toUserDisplayName: targetUser.profile.displayName || 'Unknown',
        isInvitation: false, // This is a request to a registered user
        status: 'pending' as const,
        createdAt: serverTimestamp()
      };

      console.log('📝 Contact request data to be saved:', contactRequest);
      
      // Check authentication status
      const currentUser = auth.currentUser;
      console.log('🔐 Auth check before Firestore write:', {
        isAuthenticated: !!currentUser,
        uid: currentUser?.uid,
        emailVerified: currentUser?.emailVerified,
        tokenResult: currentUser ? 'getting token...' : 'no user'
      });
      
      if (!currentUser) {
        throw new Error('User not authenticated');
      }
      
      // Get a fresh token to make sure it's valid
      try {
        const token = await currentUser.getIdToken();
        console.log('🎟️ Got fresh auth token, length:', token.length);
      } catch (tokenError) {
        console.error('❌ Failed to get auth token:', tokenError);
        throw new Error('Failed to get authentication token');
      }
      
      const docRef = doc(collection(db, this.CONTACT_REQUESTS_COLLECTION));
      console.log(`🔥 Attempting to save to Firestore with docRef: ${docRef.id}`);
      
      await setDoc(docRef, contactRequest);

      console.log(`📨 Contact request sent from ${fromUserId} to ${toUserId}`);
      return docRef.id;
    } catch (error) {
      console.error('Error sending contact request:', error);
      if (contactRequest) {
        console.error('Contact request data that failed:', contactRequest);
      }
      console.error('Current user:', auth.currentUser?.uid);
      throw error;
    }
  }

  /**
   * Accept contact request
   */
  static async acceptContactRequest(requestId: string, acceptingUserId: string): Promise<void> {
    try {
      const requestRef = doc(db, this.CONTACT_REQUESTS_COLLECTION, requestId);
      const requestSnap = await getDoc(requestRef);
      
      if (!requestSnap.exists()) {
        throw new Error('Contact request not found');
      }

      const request = requestSnap.data() as ContactRequest;
      
      // Verify the accepting user is the recipient
      if (request.toUserId !== acceptingUserId) {
        throw new Error('Not authorized to accept this request');
      }

      if (request.status !== 'pending') {
        throw new Error('Request is no longer pending');
      }

      // Create or update contact relationship
      const contactId = this.createContactId(request.fromUserId, request.toUserId!);
      const [userId1, userId2] = [request.fromUserId, request.toUserId!].sort();

      const contact: Omit<Contact, 'id'> = {
        userId1,
        userId2,
        user1Email: userId1 === request.fromUserId ? request.fromUserEmail : request.toEmail,
        user2Email: userId2 === request.fromUserId ? request.fromUserEmail : request.toEmail,
        user1DisplayName: userId1 === request.fromUserId ? request.fromUserDisplayName : (request.toUserDisplayName || 'Unknown'),
        user2DisplayName: userId2 === request.fromUserId ? request.fromUserDisplayName : (request.toUserDisplayName || 'Unknown'),
        status: 'accepted',
        initiatorUserId: request.fromUserId,
        createdAt: request.createdAt,
        acceptedAt: serverTimestamp(),
        lastInteractionAt: serverTimestamp(),
        metadata: {
          sharedFilesCount: 0
        }
      };

      console.log('🔍 Attempting to create contact with ID:', contactId);
      console.log('🔍 Contact data:', contact);
      console.log('🔍 Current user:', acceptingUserId);

      // Update request status and create contact relationship
      await Promise.all([
        updateDoc(requestRef, {
          status: 'accepted',
          respondedAt: serverTimestamp()
        }),
        setDoc(doc(db, this.CONTACTS_COLLECTION, contactId), contact)
      ]);

      console.log(`✅ Contact request accepted: ${request.fromUserId} <-> ${request.toUserId}`);
    } catch (error) {
      console.error('Error accepting contact request:', error);
      throw error;
    }
  }

  /**
   * Decline contact request
   */
  static async declineContactRequest(requestId: string, decliningUserId: string): Promise<void> {
    try {
      const requestRef = doc(db, this.CONTACT_REQUESTS_COLLECTION, requestId);
      const requestSnap = await getDoc(requestRef);
      
      if (!requestSnap.exists()) {
        throw new Error('Contact request not found');
      }

      const request = requestSnap.data() as ContactRequest;
      
      // Verify the declining user is the recipient
      if (request.toUserId !== decliningUserId) {
        throw new Error('Not authorized to decline this request');
      }

      if (request.status !== 'pending') {
        throw new Error('Request is no longer pending');
      }

      await updateDoc(requestRef, {
        status: 'declined',
        respondedAt: serverTimestamp()
      });

      console.log(`❌ Contact request declined: ${request.fromUserId} -> ${request.toUserId}`);
    } catch (error) {
      console.error('Error declining contact request:', error);
      throw error;
    }
  }

  /**
   * Cancel a sent contact request (for the sender to withdraw it)
   */
  static async cancelContactRequest(requestId: string): Promise<void> {
    try {
      const user = auth.currentUser;
      if (!user) {
        throw new Error('Not authenticated');
      }

      const requestRef = doc(db, this.CONTACT_REQUESTS_COLLECTION, requestId);
      const requestSnap = await getDoc(requestRef);
      
      if (!requestSnap.exists()) {
        throw new Error('Contact request not found');
      }

      const request = requestSnap.data() as ContactRequest;
      
      // Verify the canceling user is the sender
      if (request.fromUserId !== user.uid) {
        throw new Error('Not authorized to cancel this request');
      }

      if (request.status !== 'pending') {
        throw new Error('Request is no longer pending');
      }

      // Delete the request
      await deleteDoc(requestRef);

      console.log(`🚫 Contact request canceled: ${request.fromUserId} -> ${request.toUserId}`);
    } catch (error) {
      console.error('Error canceling contact request:', error);
      throw error;
    }
  }

  /**
   * Block a user
   */
  static async blockUser(blockingUserId: string, blockedUserId: string): Promise<void> {
    try {
      const contactId = this.createContactId(blockingUserId, blockedUserId);
      const [userId1, userId2] = [blockingUserId, blockedUserId].sort();

      // Get user profiles
      const [blockingUserProfile, blockedUserProfile] = await Promise.all([
        getUserProfile(blockingUserId),
        getUserProfile(blockedUserId)
      ]);

      if (!blockingUserProfile || !blockedUserProfile) {
        throw new Error('User profile not found');
      }

      const contact: Omit<Contact, 'id'> = {
        userId1,
        userId2,
        user1Email: userId1 === blockingUserId ? blockingUserProfile.email : blockedUserProfile.email,
        user2Email: userId2 === blockingUserId ? blockingUserProfile.email : blockedUserProfile.email,
        user1DisplayName: userId1 === blockingUserId ? blockingUserProfile.displayName : blockedUserProfile.displayName,
        user2DisplayName: userId2 === blockingUserId ? blockingUserProfile.displayName : blockedUserProfile.displayName,
        status: 'blocked',
        initiatorUserId: blockingUserId,
        createdAt: serverTimestamp(),
        blockedAt: serverTimestamp(),
        blockedByUserId: blockingUserId,
        lastInteractionAt: serverTimestamp()
      };

      await setDoc(doc(db, this.CONTACTS_COLLECTION, contactId), contact);
      console.log(`🚫 User blocked: ${blockingUserId} blocked ${blockedUserId}`);
    } catch (error) {
      console.error('Error blocking user:', error);
      throw error;
    }
  }

  /**
   * Unblock a user
   */
  static async unblockUser(unblockingUserId: string, unblockedUserId: string): Promise<void> {
    try {
      const contactId = this.createContactId(unblockingUserId, unblockedUserId);
      const contactRef = doc(db, this.CONTACTS_COLLECTION, contactId);
      
      await deleteDoc(contactRef);
      console.log(`✅ User unblocked: ${unblockingUserId} unblocked ${unblockedUserId}`);
    } catch (error) {
      console.error('Error unblocking user:', error);
      throw error;
    }
  }

  /**
   * Get pending contact requests for a user
   */
  static async getPendingContactRequests(userId: string): Promise<ContactRequest[]> {
    try {
      const q = query(
        collection(db, this.CONTACT_REQUESTS_COLLECTION),
        where('toUserId', '==', userId),
        where('status', '==', 'pending'),
        orderBy('createdAt', 'desc')
      );

      const querySnapshot = await getDocs(q);
      const requests: ContactRequest[] = [];

      querySnapshot.forEach((doc) => {
        const data = doc.data() as ContactRequest;
        requests.push({ id: doc.id, ...data });
      });

      return requests;
    } catch (error) {
      console.error('Error fetching pending contact requests:', error);
      throw error;
    }
  }

  /**
   * Subscribe to real-time contact requests for a user
   */
  static subscribeToContactRequests(
    userId: string,
    callback: (requests: ContactRequest[]) => void
  ): () => void {
    const q = query(
      collection(db, this.CONTACT_REQUESTS_COLLECTION),
      where('toUserId', '==', userId),
      where('status', '==', 'pending'),
      orderBy('createdAt', 'desc')
    );

    let debounceTimer: NodeJS.Timeout | null = null;
    
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      // Clear any pending callback
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      
      // Debounce to batch rapid contact request changes
      debounceTimer = setTimeout(() => {
        const requests: ContactRequest[] = [];
        
        querySnapshot.forEach((doc) => {
          const data = doc.data() as ContactRequest;
          requests.push({ id: doc.id, ...data });
        });

        callback(requests);
      }, 150); // 150ms debounce
    });
    
    return () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      unsubscribe();
    };
  }

  /**
   * Get sent contact requests (outgoing) for a user
   */
  static async getSentContactRequests(userId: string): Promise<ContactRequest[]> {
    try {
      const q = query(
        collection(db, this.CONTACT_REQUESTS_COLLECTION),
        where('fromUserId', '==', userId),
        where('status', '==', 'sent'),
        orderBy('createdAt', 'desc')
      );

      const querySnapshot = await getDocs(q);
      const requests: ContactRequest[] = [];

      querySnapshot.forEach((doc) => {
        const data = doc.data() as ContactRequest;
        requests.push({ id: doc.id, ...data });
      });

      return requests;
    } catch (error) {
      console.error('Error fetching sent contact requests:', error);
      throw error;
    }
  }

  /**
   * Subscribe to real-time sent contact requests for a user
   */
  static subscribeToSentContactRequests(
    userId: string,
    callback: (requests: ContactRequest[]) => void
  ): () => void {
    console.log(`📤 Setting up real-time subscription for sent contact requests from user: ${userId}`);
    
    const q = query(
      collection(db, this.CONTACT_REQUESTS_COLLECTION),
      where('fromUserId', '==', userId),
      orderBy('createdAt', 'desc')
    );
    
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      console.log(`📤 Sent requests snapshot received: ${querySnapshot.docs.length} requests`);
      
      const requests: ContactRequest[] = [];
      
      querySnapshot.forEach((doc) => {
        const data = doc.data() as ContactRequest;
        requests.push({ id: doc.id, ...data });
      });

      console.log(`📤 Parsed sent requests:`, requests);
      callback(requests);
    });
    
    return unsubscribe;
  }

  /**
   * Get or create contact settings for a user
   */
  static async getContactSettings(userId: string): Promise<ContactSettings> {
    try {
      const docRef = doc(db, this.CONTACT_SETTINGS_COLLECTION, userId);
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        return docSnap.data() as ContactSettings;
      }

      // Create default settings
      const defaultSettings: ContactSettings = {
        userId,
        autoAcceptDomains: [],
        autoAcceptFromContacts: false,
        allowFileShareFromUnknown: true,
        blockUnknownUsers: false,
        notifyOnContactRequest: true,
        notifyOnFileShareFromUnknown: true,
        updatedAt: serverTimestamp()
      };

      await setDoc(docRef, defaultSettings);
      return defaultSettings;
    } catch (error) {
      console.error('Error fetching contact settings:', error);
      throw error;
    }
  }

  /**
   * Update contact settings
   */
  static async updateContactSettings(userId: string, updates: Partial<ContactSettings>): Promise<void> {
    try {
      const docRef = doc(db, this.CONTACT_SETTINGS_COLLECTION, userId);
      await updateDoc(docRef, {
        ...updates,
        updatedAt: serverTimestamp()
      });
      
      console.log(`⚙️ Contact settings updated for user ${userId}`);
    } catch (error) {
      console.error('Error updating contact settings:', error);
      throw error;
    }
  }

  /**
   * Check if file sharing should be allowed between users
   * Returns: { allowed: boolean, requiresApproval: boolean, reason?: string }
   */
  static async checkFileSharingPermission(
    fromUserId: string, 
    toUserId: string
  ): Promise<{ allowed: boolean; requiresApproval: boolean; reason?: string }> {
    try {
      // Get contact relationship
      const contact = await this.getContactRelationship(fromUserId, toUserId);
      
      // If users are connected, allow sharing
      if (contact?.status === 'accepted') {
        return { allowed: true, requiresApproval: false };
      }

      // If users are blocked, deny sharing
      if (contact?.status === 'blocked') {
        return { 
          allowed: false, 
          requiresApproval: false, 
          reason: 'User has been blocked' 
        };
      }

      // Get recipient's contact settings
      const settings = await this.getContactSettings(toUserId);

      // If recipient blocks unknown users, deny
      if (settings.blockUnknownUsers) {
        return { 
          allowed: false, 
          requiresApproval: false, 
          reason: 'User does not accept files from unknown contacts' 
        };
      }

      // If recipient allows files from unknown users, allow with approval prompt
      if (settings.allowFileShareFromUnknown) {
        return { allowed: true, requiresApproval: true };
      }

      // Default: deny sharing
      return { 
        allowed: false, 
        requiresApproval: false, 
        reason: 'User only accepts files from contacts' 
      };
    } catch (error) {
      console.error('Error checking file sharing permission:', error);
      return { 
        allowed: false, 
        requiresApproval: false, 
        reason: 'Error checking permissions' 
      };
    }
  }

  /**
   * Update last interaction time between users
   */
  static async updateLastInteraction(userId1: string, userId2: string): Promise<void> {
    try {
      const contact = await this.getContactRelationship(userId1, userId2);
      if (contact) {
        const contactRef = doc(db, this.CONTACTS_COLLECTION, contact.id!);
        await updateDoc(contactRef, {
          lastInteractionAt: serverTimestamp(),
          'metadata.sharedFilesCount': (contact.metadata?.sharedFilesCount || 0) + 1
        });
      }
    } catch (error) {
      console.error('Error updating last interaction:', error);
      // Don't throw - this is not critical
    }
  }

  /**
   * Remove a contact relationship (unfriend)
   */
  static async removeContact(userId: string, contactUserId: string): Promise<void> {
    try {
      const contact = await this.getContactRelationship(userId, contactUserId);
      if (!contact || contact.status !== 'accepted') {
        throw new Error('Contact relationship not found');
      }

      const contactRef = doc(db, this.CONTACTS_COLLECTION, contact.id!);
      await deleteDoc(contactRef);
      
      console.log(`🗑️ Contact removed: ${userId} removed ${contactUserId}`);
    } catch (error) {
      console.error('Error removing contact:', error);
      throw error;
    }
  }

  /**
   * Send invitation to non-existing user
   */
  static async sendUserInvitation(
    fromUserId: string,
    toEmail: string,
    message?: string,
    triggerEvent?: ContactRequest['triggerEvent']
  ): Promise<{ invitationId: string; invitationData: Omit<ContactRequest, 'id'> }> {
    try {
      // Normalize email to lowercase for consistent querying
      const normalizedToEmail = toEmail.toLowerCase();
      console.log(`📧 Creating invitation for ${normalizedToEmail} (original: ${toEmail}) from ${fromUserId}`);
      
      // Get sender's profile
      const fromUserProfile = await getUserProfile(fromUserId);
      if (!fromUserProfile) {
        throw new Error('Sender profile not found');
      }

      // Check if invitation already exists (using normalized email)
      const existingInvitationQuery = query(
        collection(db, this.CONTACT_REQUESTS_COLLECTION),
        where('fromUserId', '==', fromUserId),
        where('toEmail', '==', normalizedToEmail),
        where('status', '==', 'pending')
      );
      
      const existingSnapshot = await getDocs(existingInvitationQuery);
      if (!existingSnapshot.empty) {
        throw new Error('Invitation already sent to this email');
      }

      // Create invitation with normalized email (expiration will be set by Cloud Function)
      const invitation: Omit<ContactRequest, 'id'> = {
        fromUserId,
        fromUserEmail: fromUserProfile.email,
        fromUserDisplayName: fromUserProfile.displayName,
        toEmail: normalizedToEmail,
        isInvitation: true, // Mark as invitation to non-registered user
        status: 'pending',
        createdAt: serverTimestamp(),
        // expiresAt will be set by Cloud Function
        ...(message && { message }),
        ...(triggerEvent && { triggerEvent })
      };

      const docRef = doc(collection(db, this.CONTACT_REQUESTS_COLLECTION));
      await setDoc(docRef, invitation);

      console.log(`📧 Invitation created for ${normalizedToEmail} from ${fromUserId}`);
      
      // Return invitation data for client-side mailto link
      const result = {
        invitationId: docRef.id,
        invitationData: invitation
      };
      
      console.log('📧 Returning invitation result:', result);
      return result;
    } catch (error) {
      console.error('Error sending user invitation:', error);
      throw error;
    }
  }

  /**
   * Get invitations sent by the current user
   */
  static async getSentInvitations(userId: string): Promise<UserInvitation[]> {
    try {
      const invitationsQuery = query(
        collection(db, this.CONTACT_REQUESTS_COLLECTION),
        where('fromUserId', '==', userId),
        orderBy('createdAt', 'desc')
      );
      
      const snapshot = await getDocs(invitationsQuery);
      
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as UserInvitation));
    } catch (error) {
      console.error('Error fetching sent invitations:', error);
      throw error;
    }
  }

  /**
   * Subscribe to real-time updates for sent invitations
   */
  static subscribeToSentInvitations(
    userId: string,
    callback: (invitations: UserInvitation[]) => void
  ): () => void {
    console.log(`📧 Setting up real-time subscription for invitations from user: ${userId}`);
    
    const invitationsQuery = query(
      collection(db, this.CONTACT_REQUESTS_COLLECTION),
      where('fromUserId', '==', userId),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(
      invitationsQuery,
      (snapshot) => {
        console.log(`📧 Invitations snapshot received: ${snapshot.docs.length} invitations`);
        const invitations = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as UserInvitation));
        console.log('📧 Parsed invitations:', invitations);
        callback(invitations);
      },
      (error) => {
        console.error('❌ Error in sent invitations subscription:', error);
      }
    );

    return unsubscribe;
  }

  /**
   * Cancel/delete a pending invitation
   */
  static async cancelInvitation(invitationId: string): Promise<void> {
    try {
      const invitationRef = doc(db, this.CONTACT_REQUESTS_COLLECTION, invitationId);
      const invitationSnap = await getDoc(invitationRef);
      
      if (!invitationSnap.exists()) {
        throw new Error('Invitation not found');
      }
      
      const invitation = invitationSnap.data() as UserInvitation;
      
      // Only allow canceling pending invitations
      if (invitation.status !== 'pending') {
        throw new Error(`Cannot cancel invitation with status: ${invitation.status}`);
      }
      
      await deleteDoc(invitationRef);
      console.log(`🗑️ Invitation ${invitationId} cancelled`);
    } catch (error) {
      console.error('Error cancelling invitation:', error);
      throw error;
    }
  }

  /**
   * Resend invitation email (updates createdAt and extends expiry)
   */
  static async resendInvitation(invitationId: string): Promise<void> {
    try {
      const invitationRef = doc(db, this.CONTACT_REQUESTS_COLLECTION, invitationId);
      const invitationSnap = await getDoc(invitationRef);
      
      if (!invitationSnap.exists()) {
        throw new Error('Invitation not found');
      }
      
      const invitation = invitationSnap.data() as UserInvitation;
      
      // Only allow resending pending invitations
      if (invitation.status !== 'pending') {
        throw new Error(`Cannot resend invitation with status: ${invitation.status}`);
      }
      
      // Update timestamp and extend expiry
      await updateDoc(invitationRef, {
        createdAt: serverTimestamp(),
        expiresAt: new Date(Date.now() + (30 * 24 * 60 * 60 * 1000))
      });
      
      console.log(`📧 Invitation ${invitationId} resent`);
    } catch (error) {
      console.error('Error resending invitation:', error);
      throw error;
    }
  }

  /**
   * Generate mailto link for invitation
   */
  static generateInvitationMailtoLink(
    invitationId: string,
    invitation: Omit<UserInvitation, 'id'>,
    baseUrl: string = import.meta.env.VITE_APP_URL || 'https://seravault-8c764-app.web.app'
  ): string {
    const inviteLink = `${baseUrl}/signup?invite=${invitationId}`;
    
    const subject = encodeURIComponent(`${invitation.fromUserDisplayName} invited you to SeraVault`);
    
    const body = encodeURIComponent(`Hi there!

${invitation.fromUserDisplayName} (${invitation.fromUserEmail}) has invited you to connect on SeraVault, a secure file sharing platform with end-to-end encryption.

${invitation.message ? `Personal message: "${invitation.message}"` : ''}

To accept this invitation and create your account, click the link below:
${inviteLink}

SeraVault Features:
• End-to-end encrypted file storage and sharing
• Secure contact management 
• Zero-knowledge architecture - even we can't see your files

This invitation will expire in 30 days.

Best regards,
${invitation.fromUserDisplayName}

---
This invitation was sent through SeraVault. If you don't want to receive these invitations, please contact the sender directly.`);

    return `mailto:${invitation.toEmail}?subject=${subject}&body=${body}`;
  }

  /**
   * Subscribe to incoming invitations for an email address
   */
  static subscribeToIncomingInvitations(
    email: string,
    callback: (invitations: UserInvitation[]) => void
  ): () => void {
    const normalizedEmail = email.toLowerCase();
    console.warn(`🔍 [INVITATION SUB] Subscribing to invitations for email: "${normalizedEmail}" (original: "${email}")`);
    
    const q = query(
      collection(db, this.CONTACT_REQUESTS_COLLECTION),
      where('toEmail', '==', normalizedEmail),
      where('status', '==', 'pending'),
      orderBy('createdAt', 'desc')
    );

    let unsubscribe: (() => void) | null = null;
    
    unsubscribe = onSnapshot(q, (snapshot) => {
      console.warn(`📨 [INVITATION SUB] Snapshot SUCCESS for "${normalizedEmail}": ${snapshot.docs.length} docs`);
      if (snapshot.docs.length > 0) {
        snapshot.docs.forEach(doc => {
          const data = doc.data();
          console.warn(`  📧 Invitation ${doc.id}: toEmail="${data.toEmail}", status="${data.status}", from="${data.fromUserDisplayName}"`);
        });
      } else {
        console.warn(`  ℹ️ No pending invitations found for "${normalizedEmail}"`);
      }
      const invitations = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as UserInvitation));
      callback(invitations);
    }, (error) => {
      console.error(`❌ [INVITATION SUB] Error subscribing for "${normalizedEmail}":`, error.code, error.message);
      // Call callback with empty array to prevent UI from breaking
      callback([]);
      // If it's a permission error, unsubscribe to stop retries
      if (error.code === 'permission-denied' && unsubscribe) {
        console.error('🛑 Permission denied - stopping invitation subscription to prevent retry loop');
        unsubscribe();
      }
    });
    
    return unsubscribe;
  }

  /**
   * Accept an invitation
   */
  static async acceptInvitation(invitationId: string, userId: string): Promise<void> {
    try {
      const invitationRef = doc(db, this.CONTACT_REQUESTS_COLLECTION, invitationId);
      await updateDoc(invitationRef, {
        status: 'accepted',
        acceptedAt: serverTimestamp(),
        acceptedByUserId: userId
      });
      console.log(`✅ Invitation ${invitationId} accepted by user ${userId}`);
    } catch (error) {
      console.error('Error accepting invitation:', error);
      throw error;
    }
  }

  /**
   * Respond to a contact request (accept/decline)
   */
  static async respondToContactRequest(requestId: string, status: 'accepted' | 'declined'): Promise<void> {
    try {
      const requestRef = doc(db, this.CONTACT_REQUESTS_COLLECTION, requestId);
      await updateDoc(requestRef, {
        status,
        respondedAt: serverTimestamp()
      });
      console.log(`✅ Contact request ${requestId} ${status}`);
    } catch (error) {
      console.error(`Error responding to contact request ${requestId}:`, error);
      throw error;
    }
  }
}