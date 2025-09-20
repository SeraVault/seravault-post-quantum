import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { usePassphrase } from '../auth/PassphraseContext';
import AppLayout from '../components/AppLayout';
import ContactManager from '../components/ContactManager';
import { Paper } from '@mui/material';

const ContactsPage: React.FC = () => {
  const navigate = useNavigate();
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [matchAllTags, setMatchAllTags] = useState(false);
  const [files] = useState<any[]>([]);
  
  // Get user context
  const { user } = useAuth();
  const { privateKey } = usePassphrase();

  // This check is redundant since we're inside ProtectedRoute
  // The ProtectedRoute component already handles authentication

  if (!user) {
    return null; // Loading state, ProtectedRoute will handle redirect
  }

  return (
    <AppLayout 
      currentFolder={null}
      setCurrentFolder={() => {}}
      // Tag filtering props for SideNav
      files={files}
      userId={user?.uid}
      userPrivateKey={privateKey}
      selectedTags={selectedTags}
      onTagSelectionChange={setSelectedTags}
      matchAllTags={matchAllTags}
      onMatchModeChange={setMatchAllTags}
    >
      <Paper elevation={1} sx={{ p: 0, overflow: 'hidden', height: '100%' }}>
        <ContactManager />
      </Paper>
    </AppLayout>
  );
};

export default ContactsPage;