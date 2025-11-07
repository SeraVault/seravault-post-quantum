import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Alert,
  Box,
  Typography,
  IconButton,
  InputAdornment,
  LinearProgress,
} from '@mui/material';
import { Visibility, VisibilityOff, Key } from '@mui/icons-material';
import { useAuth } from '../auth/AuthContext';
import { getUserProfile, updateUserProfile } from '../firestore';
import { decryptString, encryptString } from '../crypto/quantumSafeCrypto';

interface ChangePassphraseDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

const ChangePassphraseDialog: React.FC<ChangePassphraseDialogProps> = ({
  open,
  onClose,
  onSuccess,
}) => {
  const { user } = useAuth();
  
  const [currentPassphrase, setCurrentPassphrase] = useState('');
  const [newPassphrase, setNewPassphrase] = useState('');
  const [confirmNewPassphrase, setConfirmNewPassphrase] = useState('');
  
  const [showCurrentPassphrase, setShowCurrentPassphrase] = useState(false);
  const [showNewPassphrase, setShowNewPassphrase] = useState(false);
  const [showConfirmPassphrase, setShowConfirmPassphrase] = useState(false);
  
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleClose = () => {
    if (!loading) {
      setCurrentPassphrase('');
      setNewPassphrase('');
      setConfirmNewPassphrase('');
      setError(null);
      setShowCurrentPassphrase(false);
      setShowNewPassphrase(false);
      setShowConfirmPassphrase(false);
      onClose();
    }
  };

  const handleChangePassphrase = async () => {
    if (!user) {
      setError('No user logged in');
      return;
    }

    // Validate inputs
    if (!currentPassphrase) {
      setError('Please enter your current passphrase');
      return;
    }

    if (!newPassphrase) {
      setError('Please enter a new passphrase');
      return;
    }

    if (newPassphrase.length < 12) {
      setError('New passphrase must be at least 12 characters long');
      return;
    }

    if (newPassphrase !== confirmNewPassphrase) {
      setError('New passphrases do not match');
      return;
    }

    if (currentPassphrase === newPassphrase) {
      setError('New passphrase must be different from current passphrase');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Step 1: Get user profile
      console.log('🔑 Fetching user profile...');
      const profile = await getUserProfile(user.uid);
      if (!profile || !profile.encryptedPrivateKey) {
        throw new Error('User profile or encrypted private key not found');
      }

      // Step 2: Decrypt private key with current passphrase
      console.log('🔓 Decrypting private key with current passphrase...');
      let privateKeyHex: string;
      try {
        privateKeyHex = decryptString(profile.encryptedPrivateKey, currentPassphrase);
      } catch (decryptError) {
        console.error('❌ Failed to decrypt with current passphrase:', decryptError);
        throw new Error('Current passphrase is incorrect');
      }

      // Validate decrypted private key
      const isHex = /^[a-fA-F0-9]+$/.test(privateKeyHex);
      if (!isHex || privateKeyHex.length !== 4800) { // ML-KEM-768: 2400 bytes = 4800 hex chars
        throw new Error('Current passphrase is incorrect');
      }

      console.log('✅ Private key decrypted successfully');

      // Step 3: Re-encrypt private key with new passphrase
      console.log('🔒 Re-encrypting private key with new passphrase...');
      const newEncryptedPrivateKey = encryptString(privateKeyHex, newPassphrase);
      console.log('✅ Private key re-encrypted successfully');

      // Step 4: Verify we can decrypt with new passphrase
      console.log('🔍 Verifying new encryption...');
      try {
        const verifyDecrypt = decryptString(newEncryptedPrivateKey, newPassphrase);
        if (verifyDecrypt !== privateKeyHex) {
          throw new Error('Verification failed: decrypted key does not match');
        }
        console.log('✅ New passphrase verified successfully');
      } catch (verifyError) {
        console.error('❌ Verification failed:', verifyError);
        throw new Error('Failed to verify new passphrase. Please try again.');
      }

      // Step 5: Update Firestore profile
      console.log('💾 Updating user profile...');
      await updateUserProfile(user.uid, {
        encryptedPrivateKey: newEncryptedPrivateKey,
      });
      console.log('✅ Passphrase changed successfully');

      // Success!
      handleClose();
      if (onSuccess) {
        onSuccess();
      }
    } catch (err) {
      console.error('❌ Error changing passphrase:', err);
      setError(err instanceof Error ? err.message : 'Failed to change passphrase. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !loading) {
      handleChangePassphrase();
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Key />
          <Typography variant="h6">Change Passphrase</Typography>
        </Box>
      </DialogTitle>
      
      <DialogContent>
        {loading && <LinearProgress sx={{ mb: 2 }} />}
        
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Change the passphrase used to encrypt your private key. You will need to use the new
          passphrase the next time you unlock your keys.
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <TextField
          fullWidth
          label="Current Passphrase"
          type={showCurrentPassphrase ? 'text' : 'password'}
          value={currentPassphrase}
          onChange={(e) => setCurrentPassphrase(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={loading}
          autoFocus
          sx={{ mb: 2 }}
          InputProps={{
            endAdornment: (
              <InputAdornment position="end">
                <IconButton
                  onClick={() => setShowCurrentPassphrase(!showCurrentPassphrase)}
                  edge="end"
                  disabled={loading}
                >
                  {showCurrentPassphrase ? <VisibilityOff /> : <Visibility />}
                </IconButton>
              </InputAdornment>
            ),
          }}
        />

        <TextField
          fullWidth
          label="New Passphrase"
          type={showNewPassphrase ? 'text' : 'password'}
          value={newPassphrase}
          onChange={(e) => setNewPassphrase(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={loading}
          helperText="At least 12 characters"
          sx={{ mb: 2 }}
          InputProps={{
            endAdornment: (
              <InputAdornment position="end">
                <IconButton
                  onClick={() => setShowNewPassphrase(!showNewPassphrase)}
                  edge="end"
                  disabled={loading}
                >
                  {showNewPassphrase ? <VisibilityOff /> : <Visibility />}
                </IconButton>
              </InputAdornment>
            ),
          }}
        />

        <TextField
          fullWidth
          label="Confirm New Passphrase"
          type={showConfirmPassphrase ? 'text' : 'password'}
          value={confirmNewPassphrase}
          onChange={(e) => setConfirmNewPassphrase(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={loading}
          InputProps={{
            endAdornment: (
              <InputAdornment position="end">
                <IconButton
                  onClick={() => setShowConfirmPassphrase(!showConfirmPassphrase)}
                  edge="end"
                  disabled={loading}
                >
                  {showConfirmPassphrase ? <VisibilityOff /> : <Visibility />}
                </IconButton>
              </InputAdornment>
            ),
          }}
        />
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={handleClose} disabled={loading}>
          Cancel
        </Button>
        <Button
          onClick={handleChangePassphrase}
          variant="contained"
          disabled={loading || !currentPassphrase || !newPassphrase || !confirmNewPassphrase}
        >
          {loading ? 'Changing...' : 'Change Passphrase'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ChangePassphraseDialog;
