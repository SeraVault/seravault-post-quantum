import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext';
import { getUserProfile } from '../firestore';
import { decryptString } from '../crypto/postQuantumCrypto';
import { usePrivateKeyStorage } from '../utils/secureStorage';
import BiometricPassphraseDialog from '../components/BiometricPassphraseDialog';

interface PassphraseContextType {
  privateKey: string | null;
  clearPrivateKey: () => void;
  hasStoredKey: boolean;
  loading: boolean;
}

const PassphraseContext = createContext<PassphraseContextType>({
  privateKey: null,
  clearPrivateKey: () => {},
  hasStoredKey: false,
  loading: false,
});

export const usePassphrase = () => useContext(PassphraseContext);

export const PassphraseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [privateKey, setPrivateKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [passphraseDialogOpen, setPassphraseDialogOpen] = useState(false);
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
              setPassphraseDialogOpen(true);
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
  }, [user, privateKey, getStoredPrivateKey]);

  // Handle session timeout - clear decrypted data and show auth dialog
  useEffect(() => {
    if (!user || !privateKey) return;

    const handleTimeout = () => {
      console.log('Session timeout detected - clearing decrypted data');
      // Clear the private key from state
      setPrivateKey(null);
      // Show passphrase dialog again
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

  const handlePassphraseSubmit = async (passphraseOrPrivateKey: string, rememberChoice = false, method: 'passphrase' | 'biometric' = 'passphrase') => {
    setLoading(true);
    // Dialog will stay open and show loading state while this executes
    
    if (user) {
      const profile = await getUserProfile(user.uid);
      if (profile) {
        try {
          let decryptedPrivateKey: string;
          
          if (method === 'biometric') {
            // Private key is already decrypted from biometric authentication
            decryptedPrivateKey = passphraseOrPrivateKey;
          } else {
            // Decrypt using passphrase
            if (profile.encryptedPrivateKey && typeof profile.encryptedPrivateKey === 'object') {
              // New post-quantum format
              decryptedPrivateKey = decryptString(profile.encryptedPrivateKey, passphraseOrPrivateKey);
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
          setPassphraseDialogOpen(false); // Close dialog on success
          // Loading will be set to false in the useEffect when privateKey is set
        } catch (error) {
          console.error('Failed to decrypt private key:', error);
          setLoading(false);
          // Keep dialog open on error so user can see the error and try again
          throw error; // Re-throw so the dialog can handle the error
        }
      }
    }
  };

  return (
    <PassphraseContext.Provider value={{ 
      privateKey, 
      clearPrivateKey,
      hasStoredKey: hasStoredPrivateKey(),
      loading,
    }}>
      {children}
      <BiometricPassphraseDialog
        open={passphraseDialogOpen}
        onClose={() => setPassphraseDialogOpen(false)}
        onSubmit={handlePassphraseSubmit}
      />
    </PassphraseContext.Provider>
  );
};
