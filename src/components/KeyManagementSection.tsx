import React, { useState } from 'react';
import { Box, Typography, Button, Paper, Alert, Snackbar } from '@mui/material';
import { type UserProfile } from '../firestore';
import ChangePassphraseDialog from './ChangePassphraseDialog';

interface KeyManagementSectionProps {
  userProfile: UserProfile;
  privateKey: string | null;
  onDownloadKey: () => void;
  onDownloadDecryptedKey: () => void;
}

const KeyManagementSection: React.FC<KeyManagementSectionProps> = ({
  userProfile,
  privateKey,
  onDownloadKey,
  onDownloadDecryptedKey,
}) => {
  const [changePassphraseOpen, setChangePassphraseOpen] = useState(false);
  const [successMessage, setSuccessMessage] = useState(false);

  return (
    <>
      <Paper elevation={2} sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>Key Management</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Backup and manage your encryption keys
        </Typography>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'start' }}>
          <Box>
            <Button
              variant="outlined"
              onClick={onDownloadKey}
              disabled={!userProfile?.encryptedPrivateKey}
              sx={{ mb: 1 }}
            >
              Download Key Backup
            </Button>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', maxWidth: 250 }}>
              Downloads a JSON file containing your encrypted private key. Safe to store as backup.
            </Typography>
          </Box>
          
          <Box>
            <Button
              variant="outlined"
              color="warning"
              onClick={onDownloadDecryptedKey}
              disabled={!privateKey}
              sx={{ mb: 1 }}
            >
              Download Decrypted Key
            </Button>
            <Typography variant="caption" color="warning.main" sx={{ display: 'block', maxWidth: 250 }}>
              ⚠️ Downloads your private key in plain text. Only use if you understand the security risks.
            </Typography>
          </Box>

          <Box>
            <Button
              variant="outlined"
              onClick={() => setChangePassphraseOpen(true)}
              disabled={!userProfile?.encryptedPrivateKey}
              sx={{ mb: 1 }}
            >
              Change Passphrase
            </Button>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', maxWidth: 250 }}>
              Update the passphrase used to encrypt your private key.
            </Typography>
          </Box>
        </Box>
        
        {!privateKey && (
          <Alert severity="info" sx={{ mt: 2 }}>
            <Typography variant="body2">
              To download your decrypted private key, you must first unlock your key using your passphrase, biometric authentication, or key file.
            </Typography>
          </Alert>
        )}
      </Paper>

      <ChangePassphraseDialog
        open={changePassphraseOpen}
        onClose={() => setChangePassphraseOpen(false)}
        onSuccess={() => {
          setSuccessMessage(true);
          console.log('✅ Passphrase changed successfully');
        }}
      />

      <Snackbar
        open={successMessage}
        autoHideDuration={6000}
        onClose={() => setSuccessMessage(false)}
        message="✅ Passphrase changed successfully! Use your new passphrase the next time you unlock your keys."
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </>
  );
};

export default KeyManagementSection;