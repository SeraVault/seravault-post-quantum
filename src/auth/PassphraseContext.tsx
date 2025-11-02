import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext';
import { unlockPrivateKey } from '../services/keyManagement';
import { usePrivateKeyStorage } from '../utils/secureStorage';
import BiometricPassphraseDialog from '../components/BiometricPassphraseDialog';

interface PassphraseContextType {
  privateKey: string | null;
  clearPrivateKey: () => void;
  hasStoredKey: boolean;
  loading: boolean;
  requestUnlock: () => void;
  refreshPrivateKey: () => void;
}

const PassphraseContext = createContext<PassphraseContextType>({
  privateKey: null,
  clearPrivateKey: () => {},
  hasStoredKey: false,
  loading: false,
  requestUnlock: () => {},
  refreshPrivateKey: () => {},
});

const PassphraseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
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
        
        // If no stored key, show passphrase dialog
        if (!userDismissed) {
          setLoading(false);
          setPassphraseDialogOpen(true);
        }
      } else if (privateKey) {
        setLoading(false);
      }
    };
    checkPrivateKey();
  }, [user, privateKey]);

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
    </PassphraseContext.Provider>
  );
};

export const usePassphrase = () => useContext(PassphraseContext);
export { PassphraseProvider };
