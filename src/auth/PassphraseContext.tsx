import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext';
import { unlockPrivateKey } from '../services/keyManagement';
import { usePrivateKeyStorage } from '../utils/secureStorage';
import BiometricPassphraseDialog from '../components/BiometricPassphraseDialog';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Typography, Box } from '@mui/material';
import { Fingerprint } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { isHardwareKeySupported, getRegisteredHardwareKeys } from '../utils/hardwareKeyAuth';
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
        setLoading(true);
        
        // Try to get from secure storage first
        const storedKey = getStoredPrivateKey();
        if (storedKey) {
          console.log('🔑 Found stored private key for user', user.uid);
          setPrivateKey(storedKey);
          setLoading(false);
          return;
        }
        
        // Check if user has a profile with keys before showing unlock dialog
        try {
          const profile = await getUserProfile(user.uid);
          if (!profile || !profile.publicKey) {
            // User doesn't have a public key yet (likely on profile creation page)
            console.log('🔑 User has no keys yet, skipping unlock dialog');
            setLoading(false);
            return;
          }
          
          // Check if user has passphrase-protected keys OR hardware keys with stored private keys
          const hasPassphraseProtectedKey = profile.encryptedPrivateKey || profile.legacyEncryptedPrivateKey;
          
          if (!hasPassphraseProtectedKey) {
            // No passphrase-protected key - check for hardware keys with stored private keys
            try {
              const { getRegisteredHardwareKeys } = await import('../utils/hardwareKeyAuth');
              const hardwareKeys = await getRegisteredHardwareKeys(user.uid);
              const hasHardwareKeyWithPrivateKey = hardwareKeys.some(k => k.storesPrivateKey);
              
              if (!hasHardwareKeyWithPrivateKey) {
                // User has no way to unlock their keys
                console.log('🔑 User has no keys yet, skipping unlock dialog');
                setLoading(false);
                return;
              }
              // User has hardware keys with stored private keys - they should use hardware authentication
              console.log('🔑 User has hardware keys with stored private keys');
            } catch (error) {
              console.error('Error checking hardware keys:', error);
              // If we can't check hardware keys, assume no keys
              setLoading(false);
              return;
            }
          }
        } catch (error) {
          console.error('Error checking user profile:', error);
          setLoading(false);
          return;
        }
        
        // If no stored key and user has keys, show passphrase dialog
        if (!userDismissed) {
          setLoading(false);
          setPassphraseDialogOpen(true);
        }
      } else if (privateKey) {
        setLoading(false);
      }
    };
    checkPrivateKey();
  }, [user, privateKey, clearAllUserKeys, getStoredPrivateKey, userDismissed]);

  // Simple refresh function that can be called directly
  const refreshPrivateKey = () => {
    if (user) {
      console.log('🔄 PassphraseContext: Refreshing private key for user', user.uid);
      const storedKey = getStoredPrivateKey();
      if (storedKey) {
        console.log('🔄 PassphraseContext: Found stored key, setting in context:', storedKey.substring(0, 16) + '...');
        setPrivateKey(storedKey);
        setUserDismissed(false);
      } else {
        console.log('🔄 PassphraseContext: No stored key found, clearing context and showing dialog');
        setPrivateKey(null);
        setPassphraseDialogOpen(true);
      }
    }
  };

  // Handle session timeout - clear decrypted data and show auth dialog
  useEffect(() => {
    if (!user || !privateKey) return;

    const handleTimeout = () => {
      console.log('Session timeout detected - clearing decrypted data');
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
      setUserDismissed(false);
      
      // Check if we should prompt for biometric setup (only for passphrase method)
      if (method === 'passphrase') {
        const biometricsSupported = await isHardwareKeySupported();
        if (biometricsSupported) {
          // Check if user already has biometric setup
          const existingKeys = await getRegisteredHardwareKeys(user.uid);
          if (existingKeys.length === 0) {
            // Show biometric setup prompt
            setBiometricPromptOpen(true);
          }
        }
      }
      
      // Metadata preloading is now handled by MetadataContext
    } catch (error) {
      console.error('Failed to unlock private key:', error);
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
