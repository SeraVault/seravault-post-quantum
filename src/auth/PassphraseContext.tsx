import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext';
import { getUserProfile } from '../firestore';
import { decryptString } from '../crypto/hpkeCrypto';
import { usePrivateKeyStorage } from '../utils/secureStorage';
import BiometricPassphraseDialog from '../components/BiometricPassphraseDialog';

interface PassphraseContextType {
  privateKey: string | null;
  clearPrivateKey: () => void;
  hasStoredKey: boolean;
  loading: boolean;
  requestUnlock: () => void;
}

const PassphraseContext = createContext<PassphraseContextType>({
  privateKey: null,
  clearPrivateKey: () => {},
  hasStoredKey: false,
  loading: false,
  requestUnlock: () => {},
});

export const usePassphrase = () => useContext(PassphraseContext);

export const PassphraseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [privateKey, setPrivateKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [passphraseDialogOpen, setPassphraseDialogOpen] = useState(false);
  const [userDismissed, setUserDismissed] = useState(false);
  const {
    storePrivateKey,
    getStoredPrivateKey,
    clearStoredPrivateKey,
    hasStoredPrivateKey,
    onPrivateKeyTimeout,
    removePrivateKeyTimeoutCallback,
  } = usePrivateKeyStorage();

  useEffect(() => {
    const checkPrivateKey = async () => {
      if (!user) {
        setLoading(false);
        setUserDismissed(false); // Reset dismissal when user logs out
        return;
      }
      
      if (user && !privateKey) {
        setLoading(true);
        
        // First try to get from secure storage
        const storedKey = getStoredPrivateKey();
        if (storedKey) {
          setPrivateKey(storedKey);
          setLoading(false);
          return;
        }
        
        try {
          // If not in storage, check if user has encrypted key and prompt for passphrase
          const profile = await getUserProfile(user.uid);
          if (profile) {
            if (profile.encryptedPrivateKey || profile.legacyEncryptedPrivateKey) {
              setLoading(false); // Stop loading, show passphrase dialog
              if (!userDismissed) {
                setPassphraseDialogOpen(true);
              }
            } else if (profile.publicKey) {
              // User has a profile but no private key - this shouldn't happen
              console.error('User profile exists but has no encrypted private key');
              // Redirect to profile page to regenerate keys
              window.location.href = '/profile';
            }
            // If no profile exists at all, user will be redirected by ProfilePage
          }
        } catch (error) {
          console.error('Error checking private key:', error);
          setLoading(false);
        }
      } else if (privateKey) {
        setLoading(false);
      }
    };
    checkPrivateKey();
  }, [user, privateKey]);

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

  const handlePassphraseSubmit = async (passphraseOrPrivateKey: string, rememberChoice = false, method: 'passphrase' | 'biometric' | 'keyfile' = 'passphrase') => {
    setLoading(true);
    // Dialog will stay open and show loading state while this executes
    
    if (user) {
      const profile = await getUserProfile(user.uid);
      if (profile) {
        try {
          let decryptedPrivateKey: string;
          
          if (method === 'biometric' || method === 'keyfile') {
            // Private key is already decrypted from biometric authentication or key file upload
            decryptedPrivateKey = passphraseOrPrivateKey;
          } else {
            // Decrypt using passphrase
            if (profile.encryptedPrivateKey && typeof profile.encryptedPrivateKey === 'object') {
              // New post-quantum format
              console.log('Decrypting private key using HPKE decryptString...');
              console.log('Encrypted private key object:', profile.encryptedPrivateKey);
              decryptedPrivateKey = await decryptString(profile.encryptedPrivateKey, passphraseOrPrivateKey);
              console.log('Decrypted private key length:', decryptedPrivateKey?.length || 0);
            } else if (profile.legacyEncryptedPrivateKey) {
              // Legacy AES format - migrate on next profile update
              const { AES, enc } = await import('crypto-js');
              decryptedPrivateKey = AES.decrypt(profile.legacyEncryptedPrivateKey, passphraseOrPrivateKey).toString(enc.Utf8);
            } else {
              throw new Error('No encrypted private key found. Please regenerate your keys from the Profile page.');
            }
          }
          
          setPrivateKey(decryptedPrivateKey);
          storePrivateKey(decryptedPrivateKey, rememberChoice);
          setLoading(false); // Explicitly set loading to false
          setPassphraseDialogOpen(false); // Close dialog on success
          setUserDismissed(false); // Reset dismissal state on successful unlock
        } catch (error) {
          console.error('Failed to decrypt private key:', error);
          setLoading(false);
          // Keep dialog open on error so user can see the error and try again
          throw error; // Re-throw so the dialog can handle the error
        }
      }
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
      clearPrivateKey,
      hasStoredKey: hasStoredPrivateKey(),
      loading,
      requestUnlock,
    }}>
      {children}
      <BiometricPassphraseDialog
        open={passphraseDialogOpen}
        onClose={handleDialogClose}
        onSubmit={handlePassphraseSubmit}
      />
    </PassphraseContext.Provider>
  );
};
