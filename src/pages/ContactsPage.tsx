import React, { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import ContactManager from '../components/ContactManager';
import CreationFAB from '../components/CreationFAB';
import { Container, Snackbar, Alert } from '@mui/material';
import { useAuth } from '../auth/AuthContext';

const ContactsPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [initialTab, setInitialTab] = useState<number>(0);
  const [inviteMessage, setInviteMessage] = useState<string>('');
  const [showInviteSnackbar, setShowInviteSnackbar] = useState(false);
  const { user } = useAuth();

  const handleInvitationAccept = useCallback(async (invitationId: string) => {
    try {
      const { doc, getDoc, updateDoc } = await import('firebase/firestore');
      const { db } = await import('../firebase');
      const contactService = await import('../services/contactService');
      
      // Load the invitation
      const inviteDoc = await getDoc(doc(db, 'userInvitations', invitationId));
      if (!inviteDoc.exists()) {
        setInviteMessage('Invitation not found or expired');
        setShowInviteSnackbar(true);
        searchParams.delete('invite');
        setSearchParams(searchParams, { replace: true });
        return;
      }
      
      const invitation = inviteDoc.data();
      
      // Check if invitation is still valid
      if (invitation.status !== 'pending') {
        setInviteMessage('This invitation has already been used');
        setShowInviteSnackbar(true);
        searchParams.delete('invite');
        setSearchParams(searchParams, { replace: true });
        return;
      }
      
      // Check if expired
      const expiresAt = invitation.expiresAt?.toDate();
      if (expiresAt && expiresAt < new Date()) {
        setInviteMessage('This invitation has expired');
        setShowInviteSnackbar(true);
        searchParams.delete('invite');
        setSearchParams(searchParams, { replace: true });
        return;
      }
      
      // Send contact request from the inviter to the new user
      await contactService.ContactService.sendContactRequest(
        invitation.fromUserId,
        user!.email!,
        invitation.message || `Accepted your invitation to connect on SeraVault`
      );
      
      // Mark invitation as accepted
      await updateDoc(doc(db, 'userInvitations', invitationId), {
        status: 'accepted',
        acceptedAt: new Date(),
        acceptedByUserId: user!.uid
      });
      
      setInviteMessage(`Connected with ${invitation.fromUserDisplayName}!`);
      setShowInviteSnackbar(true);
      setInitialTab(1); // Show requests tab
      
      // Remove the invite parameter
      searchParams.delete('invite');
      setSearchParams(searchParams, { replace: true });
      
    } catch (error) {
      console.error('Error accepting invitation:', error);
      setInviteMessage('Failed to accept invitation. Please try again.');
      setShowInviteSnackbar(true);
      searchParams.delete('invite');
      setSearchParams(searchParams, { replace: true });
    }
  }, [user, searchParams, setSearchParams]);

  useEffect(() => {
    const tabParam = searchParams.get('tab');
    const inviteParam = searchParams.get('invite');
    
    if (tabParam === 'requests') {
      setInitialTab(1); // Switch to requests tab
      // Remove the query parameter after processing
      searchParams.delete('tab');
      setSearchParams(searchParams, { replace: true });
    }
    
    // Handle invitation auto-accept
    if (inviteParam && user) {
      handleInvitationAccept(inviteParam);
    }
  }, [searchParams, setSearchParams, user, handleInvitationAccept]);

  return (
    <>
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <ContactManager initialTab={initialTab} />
      </Container>

      <CreationFAB
        onCreateFolder={() => {}} // Not applicable on contacts page
        onUploadFiles={() => {}} // Not applicable on contacts page
        onCreateForm={() => {
          // Navigate to vault and open form builder
          window.location.href = '/#form';
        }}
        onCreateChat={() => {
          // Navigate to vault and open chat dialog
          window.location.href = '/#chat';
        }}
      />

      <Snackbar
        open={showInviteSnackbar}
        autoHideDuration={6000}
        onClose={() => setShowInviteSnackbar(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert 
          onClose={() => setShowInviteSnackbar(false)} 
          severity={inviteMessage.includes('Failed') || inviteMessage.includes('expired') || inviteMessage.includes('not found') ? 'error' : 'success'}
          sx={{ width: '100%' }}
        >
          {inviteMessage}
        </Alert>
      </Snackbar>
    </>
  );
};

export default ContactsPage;