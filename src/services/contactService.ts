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
import { db, auth } from '../firebase';
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
  toUserId: string;
  toUserEmail: string;
  toUserDisplayName: string;
  message?: string;
  status: 'pending' | 'accepted' | 'declined' | 'expired';
  createdAt: FieldValue;
  respondedAt?: FieldValue;
  expiresAt: FieldValue; // 30 days from creation
  triggerEvent?: {
    type: 'file_share_attempt';
    fileId: string;
    fileName: string;
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

export interface UserInvitation {
  id?: string;
  fromUserId: string;
  fromUserEmail: string;
  fromUserDisplayName: string;
  toEmail: string; // Email of person being invited (not yet a user)
  message?: string;
  status: 'pending' | 'accepted' | 'declined' | 'expired';
  createdAt: FieldValue;
  expiresAt: FieldValue;
  triggerEvent?: {
    type: 'file_share_attempt';
    fileId: string;
    fileName?: string;
  };
}

export class ContactService {
  private static readonly CONTACTS_COLLECTION = 'contacts';
  private static readonly CONTACT_REQUESTS_COLLECTION = 'contactRequests';
  private static readonly CONTACT_SETTINGS_COLLECTION = 'contactSettings';
  private static readonly USER_INVITATIONS_COLLECTION = 'userInvitations';
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
   * Send contact request
   */
  static async sendContactRequest(
    fromUserId: string, 
    toUserEmail: string, 
    message?: string,
    triggerEvent?: ContactRequest['triggerEvent']
  ): Promise<string> {
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

      // Create expiry date (30 days from now) as Firestore Timestamp
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + this.REQUEST_EXPIRY_DAYS);

      // Try with minimal data first to debug
      contactRequest = {
        fromUserId,
        fromUserEmail: fromUserProfile.email,
        fromUserDisplayName: fromUserProfile.displayName || 'Unknown',
        toUserId,
        toUserEmail: targetUser.profile.email,
        toUserDisplayName: targetUser.profile.displayName || 'Unknown',
        status: 'pending' as const,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + (30 * 24 * 60 * 60 * 1000)) // 30 days from now
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

      // Check if request has expired
      if (request.expiresAt && new Date() > (request.expiresAt as any).toDate()) {
        await updateDoc(requestRef, {
          status: 'expired',
          respondedAt: serverTimestamp()
        });
        throw new Error('Contact request has expired');
      }

      // Create or update contact relationship
      const contactId = this.createContactId(request.fromUserId, request.toUserId);
      const [userId1, userId2] = [request.fromUserId, request.toUserId].sort();

      const contact: Omit<Contact, 'id'> = {
        userId1,
        userId2,
        user1Email: userId1 === request.fromUserId ? request.fromUserEmail : request.toUserEmail,
        user2Email: userId2 === request.fromUserId ? request.fromUserEmail : request.toUserEmail,
        user1DisplayName: userId1 === request.fromUserId ? request.fromUserDisplayName : request.toUserDisplayName,
        user2DisplayName: userId2 === request.fromUserId ? request.fromUserDisplayName : request.toUserDisplayName,
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
        
        // Check if request has expired
        if (data.expiresAt && new Date() > (data.expiresAt as any).toDate()) {
          // Mark as expired (you might want to do this in a background job)
          updateDoc(doc.ref, { status: 'expired' });
          return;
        }

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

    return onSnapshot(q, (querySnapshot) => {
      const requests: ContactRequest[] = [];
      
      querySnapshot.forEach((doc) => {
        const data = doc.data() as ContactRequest;
        
        // Check if request has expired
        if (data.expiresAt && new Date() > (data.expiresAt as any).toDate()) {
          updateDoc(doc.ref, { status: 'expired' });
          return;
        }

        requests.push({ id: doc.id, ...data });
      });

      callback(requests);
    });
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
    const q = query(
      collection(db, this.CONTACT_REQUESTS_COLLECTION),
      where('fromUserId', '==', userId),
      where('status', '==', 'sent'),
      orderBy('createdAt', 'desc')
    );

    return onSnapshot(q, (querySnapshot) => {
      const requests: ContactRequest[] = [];
      
      querySnapshot.forEach((doc) => {
        const data = doc.data() as ContactRequest;
        requests.push({ id: doc.id, ...data });
      });

      callback(requests);
    });
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
    triggerEvent?: UserInvitation['triggerEvent']
  ): Promise<string> {
    try {
      console.log(`📧 Creating invitation for ${toEmail} from ${fromUserId}`);
      
      // Get sender's profile
      const fromUserProfile = await getUserProfile(fromUserId);
      if (!fromUserProfile) {
        throw new Error('Sender profile not found');
      }

      // Check if invitation already exists
      const existingInvitationQuery = query(
        collection(db, this.USER_INVITATIONS_COLLECTION),
        where('fromUserId', '==', fromUserId),
        where('toEmail', '==', toEmail),
        where('status', '==', 'pending')
      );
      
      const existingSnapshot = await getDocs(existingInvitationQuery);
      if (!existingSnapshot.empty) {
        throw new Error('Invitation already sent to this email');
      }

      // Create invitation
      const invitation: Omit<UserInvitation, 'id'> = {
        fromUserId,
        fromUserEmail: fromUserProfile.email,
        fromUserDisplayName: fromUserProfile.displayName,
        toEmail,
        status: 'pending',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + (30 * 24 * 60 * 60 * 1000)), // 30 days
        ...(message && { message }),
        ...(triggerEvent && { triggerEvent })
      };

      const docRef = doc(collection(db, this.USER_INVITATIONS_COLLECTION));
      await setDoc(docRef, invitation);

      console.log(`📧 Invitation created for ${toEmail} from ${fromUserId}`);
      
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
   * Generate mailto link for invitation
   */
  static generateInvitationMailtoLink(
    invitationId: string,
    invitation: Omit<UserInvitation, 'id'>,
    baseUrl: string = 'https://seravault-8c764.web.app'
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
}