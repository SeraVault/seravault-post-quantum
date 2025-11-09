import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext';
import { unlockPrivateKey } from '../services/keyManagement';
import { usePrivateKeyStorage } from '../utils/secureStorage';
import BiometricPassphraseDialog from '../components/BiometricPassphraseDialog';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Typography, Box } from '@mui/material';
import { Fingerprint } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { getRegisteredHardwareKeys } from '../utils/hardwareKeyAuth';
import { getUserProfile } from '../firestore';

interface PassphraseContextType {
  privateKey: string | null;
  setPrivateKey: (key: string | null) => void;
  clearPrivateKey: () => void;
  hasStoredKey: boolean;
  loading: boolean;
  requestUnlock: () => void;
  refreshPrivateKey: () => void;
}

const PassphraseContext = createContext<PassphraseContextType>({
  privateKey: null,
  setPrivateKey: () => {},
  clearPrivateKey: () => {},
  hasStoredKey: false,
  loading: false,
  requestUnlock: () => {},
  refreshPrivateKey: () => {},
});

const PassphraseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [privateKey, setPrivateKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [passphraseDialogOpen, setPassphraseDialogOpen] = useState(false);
  const [userDismissed, setUserDismissed] = useState(false);
  const [biometricPromptOpen, setBiometricPromptOpen] = useState(false);
  const {
    storePrivateKey,
    getStoredPrivateKey,
    clearStoredPrivateKey,
    hasStoredPrivateKey,
    onPrivateKeyTimeout,
    removePrivateKeyTimeoutCallback,
    clearAllUserKeys,
  } = usePrivateKeyStorage(user?.uid);

  useEffect(() => {
    const checkPrivateKey = async () => {
      if (!user) {
        setPrivateKey(null);
        clearAllUserKeys();
        setLoading(false);
        setUserDismissed(false);
        return;
      }
      
      if (user && !privateKey) {
        // Try to get from secure storage first - check this BEFORE setting loading
        const storedKey = getStoredPrivateKey();
        if (storedKey) {
          setPrivateKey(storedKey);
          setLoading(false);
          return;
        }
        
        setLoading(true);
        
        // Check if user has a profile with keys before showing unlock dialog
        try {
          const profile = await getUserProfile(user.uid);
          if (!profile || !profile.publicKey) {
            // User doesn't have a public key yet (likely on profile creation page)
            setLoading(false);
            return;
          }
          
          // Check if user has passphrase-protected keys OR hardware keys with stored private keys
          const hasPassphraseProtectedKey = profile.encryptedPrivateKey;
          let hasHardwareKeys = false;
          
          // Always check for hardware keys
          try {
            const { getRegisteredHardwareKeys } = await import('../utils/hardwareKeyAuth');
            const hardwareKeys = await getRegisteredHardwareKeys(user.uid);
            hasHardwareKeys = hardwareKeys.length > 0;
          } catch {
            // Silent error handling
          }
          
          // If user has neither passphrase-protected key nor hardware keys, they have no way to unlock
          if (!hasPassphraseProtectedKey && !hasHardwareKeys) {
            setLoading(false);
            return;
          }
        } catch {
          setLoading(false);
          return;
        }
        
        // If no stored key and user has keys, show passphrase dialog
        // Double-check we still don't have a private key before opening dialog
        if (!userDismissed && !privateKey) {
          setLoading(false);
          setPassphraseDialogOpen(true);
        } else {
          setLoading(false);
        }
      } else if (privateKey) {
        // We have a private key - ensure dialog is closed and loading is off
        setLoading(false);
        setPassphraseDialogOpen(false);
      }
    };
    checkPrivateKey();
  }, [user, privateKey, clearAllUserKeys, getStoredPrivateKey, userDismissed]);

  // Simple refresh function that can be called directly
  const refreshPrivateKey = () => {
    if (user) {
      const storedKey = getStoredPrivateKey();
      if (storedKey) {
        setPrivateKey(storedKey);
        setUserDismissed(false);
      } else {
        setPrivateKey(null);
        setPassphraseDialogOpen(true);
      }
    }
  };

  // Handle session timeout - clear decrypted data and show auth dialog
  useEffect(() => {
    if (!user || !privateKey) return;

    const handleTimeout = () => {
      // Clear the private key from state
      setPrivateKey(null);
      // Reset dismissal state and show passphrase dialog again
      setUserDismissed(false);
      setPassphraseDialogOpen(true);
      // Broadcast timeout event for other components to clean up
      window.dispatchEvent(new CustomEvent('sessionTimeout', {
        detail: { reason: 'privateKeyTimeout' }
      }));
    };

    // Register timeout callback
    onPrivateKeyTimeout(handleTimeout);

    // Cleanup on unmount or dependency change
    return () => {
      removePrivateKeyTimeoutCallback(handleTimeout);
    };
  }, [user, privateKey, onPrivateKeyTimeout, removePrivateKeyTimeoutCallback]);

  const clearPrivateKey = () => {
    setPrivateKey(null);
    clearStoredPrivateKey();
  };

  const handlePassphraseSubmit = async (passphraseOrPrivateKey: string, rememberChoice = false, method: 'passphrase' | 'biometric' | 'keyfile' | 'hardware' = 'passphrase') => {
    setLoading(true);
    
    if (!user) {
      setLoading(false);
      throw new Error('User not authenticated');
    }
    
    try {
      let decryptedPrivateKey: string;
      
      if (method === 'biometric' || method === 'keyfile' || method === 'hardware') {
        // Private key is already decrypted
        decryptedPrivateKey = passphraseOrPrivateKey;
      } else {
        // Use centralized key management to decrypt with passphrase
        const result = await unlockPrivateKey(user.uid, passphraseOrPrivateKey);
        decryptedPrivateKey = result.privateKey;
      }
      
      setPrivateKey(decryptedPrivateKey);
      storePrivateKey(decryptedPrivateKey, rememberChoice);
      setLoading(false);
      setPassphraseDialogOpen(false);
      setUserDismissed(true); // Mark as dismissed to prevent reopening
      
      // Check if we should prompt for biometric setup (only for passphrase method)
      if (method === 'passphrase') {
        try {
          // Import capabilities function to check for actual biometric hardware
          const { getHardwareKeyCapabilities } = await import('../utils/hardwareKeyAuth');
          const capabilities = await getHardwareKeyCapabilities();
          
          // Only prompt if platform authenticator (biometrics) is available
          if (capabilities.platformAuthenticator) {
            // Check if user already has biometric setup
            const existingKeys = await getRegisteredHardwareKeys(user.uid);
            if (existingKeys.length === 0) {
              // Show biometric setup prompt
              setBiometricPromptOpen(true);
            }
          }
        } catch {
          // Silent error handling
        }
      }
      
      // Metadata preloading is now handled by MetadataContext
    } catch (error) {
      setLoading(false);
      throw error; // Re-throw so dialog can handle the error
    }
  };

  const handleDialogClose = () => {
    setPassphraseDialogOpen(false);
    setUserDismissed(true);
  };

  const requestUnlock = () => {
    setUserDismissed(false);
    setPassphraseDialogOpen(true);
  };

  return (
    <PassphraseContext.Provider value={{ 
      privateKey, 
      setPrivateKey,
      clearPrivateKey,
      hasStoredKey: hasStoredPrivateKey(),
      loading,
      requestUnlock,
      refreshPrivateKey,
    }}>
      {children}
      <BiometricPassphraseDialog
        open={passphraseDialogOpen}
        onClose={handleDialogClose}
        onSubmit={handlePassphraseSubmit}
      />
      
      {/* Biometric Setup Prompt Dialog */}
      <Dialog open={biometricPromptOpen} onClose={() => setBiometricPromptOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Fingerprint />
            Enable Biometric Authentication?
          </Box>
        </DialogTitle>
        <DialogContent>
          <Typography variant="body1" gutterBottom>
            Your device supports biometric authentication (fingerprint, Face ID, etc.).
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Would you like to enable biometric authentication for faster and more secure access to your encrypted files?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBiometricPromptOpen(false)}>
            Maybe Later
          </Button>
          <Button 
            variant="contained" 
            onClick={() => {
              setBiometricPromptOpen(false);
              navigate('/profile#biometric');
            }}
            startIcon={<Fingerprint />}
          >
            Enable Now
          </Button>
        </DialogActions>
      </Dialog>
    </PassphraseContext.Provider>
  );
};

export const usePassphrase = () => useContext(PassphraseContext);
export { PassphraseProvider };
