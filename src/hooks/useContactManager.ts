import { useState, useEffect } from 'react';
import { useAuth } from '../auth/AuthContext';
import { ContactService, type Contact, type ContactRequest } from '../services/contactService';

export interface UseContactManagerReturn {
  contacts: Contact[];
  contactRequests: ContactRequest[];
  loading: boolean;
  error: string | null;
  refreshContacts: () => Promise<void>;
  sendContactRequest: (email: string, message?: string) => Promise<void>;
  acceptContactRequest: (requestId: string) => Promise<void>;
  declineContactRequest: (requestId: string) => Promise<void>;
  blockUser: (userId: string) => Promise<void>;
  removeContact: (userId: string) => Promise<void>;
  checkFileSharingPermission: (targetUserId: string) => Promise<{
    allowed: boolean;
    requiresApproval: boolean;
    reason?: string;
  }>;
}

export const useContactManager = (): UseContactManagerReturn => {
  const { user } = useAuth();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactRequests, setContactRequests] = useState<ContactRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshContacts = async () => {
    if (!user) return;
    
    try {
      setLoading(true);
      setError(null);
      
      const [contactsData, requestsData] = await Promise.all([
        ContactService.getUserContacts(user.uid),
        ContactService.getPendingContactRequests(user.uid)
      ]);

      setContacts(contactsData);
      setContactRequests(requestsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load contacts');
    } finally {
      setLoading(false);
    }
  };

  // Load contacts and subscribe to real-time updates
  useEffect(() => {
    if (!user) return;

    refreshContacts();

    // Subscribe to real-time contact requests
    const unsubscribe = ContactService.subscribeToContactRequests(
      user.uid,
      (requests) => {
        setContactRequests(requests);
      }
    );

    return unsubscribe;
  }, [user]);

  const sendContactRequest = async (email: string, message?: string) => {
    if (!user) throw new Error('User not authenticated');
    
    try {
      await ContactService.sendContactRequest(user.uid, email, message);
      setError(null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to send contact request';
      setError(errorMessage);
      throw new Error(errorMessage);
    }
  };

  const acceptContactRequest = async (requestId: string) => {
    if (!user) throw new Error('User not authenticated');
    
    try {
      await ContactService.acceptContactRequest(requestId, user.uid);
      await refreshContacts(); // Refresh to show new contact
      setError(null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to accept request';
      setError(errorMessage);
      throw new Error(errorMessage);
    }
  };

  const declineContactRequest = async (requestId: string) => {
    if (!user) throw new Error('User not authenticated');
    
    try {
      await ContactService.declineContactRequest(requestId, user.uid);
      setError(null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to decline request';
      setError(errorMessage);
      throw new Error(errorMessage);
    }
  };

  const blockUser = async (userId: string) => {
    if (!user) throw new Error('User not authenticated');
    
    try {
      await ContactService.blockUser(user.uid, userId);
      await refreshContacts(); // Refresh to update contacts list
      setError(null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to block user';
      setError(errorMessage);
      throw new Error(errorMessage);
    }
  };

  const removeContact = async (userId: string) => {
    if (!user) throw new Error('User not authenticated');
    
    try {
      await ContactService.removeContact(user.uid, userId);
      await refreshContacts(); // Refresh to update contacts list
      setError(null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to remove contact';
      setError(errorMessage);
      throw new Error(errorMessage);
    }
  };

  const checkFileSharingPermission = async (targetUserId: string) => {
    if (!user) throw new Error('User not authenticated');
    
    try {
      return await ContactService.checkFileSharingPermission(user.uid, targetUserId);
    } catch (err) {
      console.error('Error checking file sharing permission:', err);
      return {
        allowed: false,
        requiresApproval: false,
        reason: 'Error checking permissions'
      };
    }
  };

  return {
    contacts,
    contactRequests,
    loading,
    error,
    refreshContacts,
    sendContactRequest,
    acceptContactRequest,
    declineContactRequest,
    blockUser,
    removeContact,
    checkFileSharingPermission,
  };
};