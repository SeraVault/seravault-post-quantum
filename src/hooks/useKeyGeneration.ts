import { useState } from 'react';
import { type User } from 'firebase/auth';
import { createUserWithKeys, regenerateUserKeys } from '../services/keyManagement';
import { type UserProfile } from '../firestore';
import { migrateUserFiles } from '../services/keyMigration';

export type EncryptionMethod = 'ML-KEM768' | 'Legacy';

export interface UseKeyGenerationReturn {
  passphrase: string;
  confirmPassphrase: string;
  showKeyRegeneration: boolean;
  showDecryptedKeyWarning: boolean;
  showRegenerationWarning: boolean;
  migrationProgress: { current: number; total: number } | null;
  setPassphrase: (passphrase: string) => void;
  setConfirmPassphrase: (confirmPassphrase: string) => void;
  setShowKeyRegeneration: (show: boolean) => void;
  setShowDecryptedKeyWarning: (show: boolean) => void;
  setShowRegenerationWarning: (show: boolean) => void;
  handleGenerateKeys: (
    user: User | null,
    displayName: string,
    onSuccess: (profile: UserProfile) => void,
    onError: (error: string) => void,
    setLoading: (loading: boolean) => void
  ) => Promise<void>;
  handleRegenerateKeys: () => void;
  handleConfirmRegeneration: (
    migrateFiles: boolean,
    user: User | null,
    displayName: string,
    theme: 'light' | 'dark',
    privateKey: string | null,
    onSuccess: (profile: UserProfile) => void,
    onError: (error: string) => void,
    setLoading: (loading: boolean) => void
  ) => Promise<void>;
  handleCancelRegeneration: () => void;
  getEncryptionMethod: (userProfile: UserProfile | null) => EncryptionMethod;
  handleDownloadKey: (userProfile: UserProfile, onError: (error: string) => void) => Promise<void>;
  handleDownloadDecryptedKey: (
    userProfile: UserProfile,
    privateKey: string | null,
    onError: (error: string) => void
  ) => Promise<void>;
}

export const useKeyGeneration = (): UseKeyGenerationReturn => {
  console.log('🚨🚨🚨 USEKEY GENERATION HOOK INITIALIZED 🚨🚨🚨');
  const [passphrase, setPassphrase] = useState('');
  const [confirmPassphrase, setConfirmPassphrase] = useState('');
  const [showKeyRegeneration, setShowKeyRegeneration] = useState(false);
  const [showDecryptedKeyWarning, setShowDecryptedKeyWarning] = useState(false);
  const [showRegenerationWarning, setShowRegenerationWarning] = useState(false);
  const [migrationProgress, setMigrationProgress] = useState<{ current: number; total: number } | null>(null);

  const handleGenerateKeys = async (
    user: User | null,
    displayName: string,
    onSuccess: (profile: UserProfile) => void,
    onError: (error: string) => void,
    setLoading: (loading: boolean) => void
  ) => {
    if (passphrase !== confirmPassphrase) {
      onError('Passphrases do not match');
      return;
    }
    if (!user) {
      onError('User not authenticated');
      return;
    }
    if (!displayName) {
      onError('Display name is required');
      return;
    }

    try {
      setLoading(true);
      
      // Use centralized key management
      const { profile, privateKey } = await createUserWithKeys(
        user.uid,
        displayName,
        user.email || '',
        passphrase
      );
      
      // Store private key in secure storage
      const { usePrivateKeyStorage } = await import('../utils/secureStorage');
      const { storePrivateKey } = usePrivateKeyStorage(user.uid);
      storePrivateKey(privateKey, true); // Default to remember for convenience
      
      console.log('✅ Key generation completed successfully');
      onSuccess(profile);
    } catch (err) {
      console.error('Key generation failed:', err);
      onError('Failed to generate keys. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegenerateKeys = () => {
    console.log('🚨🚨🚨 HANDLE REGENERATE KEYS CALLED 🚨🚨🚨', { showKeyRegeneration });
    if (!showKeyRegeneration) {
      setShowKeyRegeneration(true);
      return;
    }
    setShowRegenerationWarning(true);
  };

  const handleConfirmRegeneration = async (
    migrateFiles: boolean,
    user: User | null,
    displayName: string,
    theme: 'light' | 'dark',
    privateKey: string | null,
    onSuccess: (profile: UserProfile) => void,
    onError: (error: string) => void,
    setLoading: (loading: boolean) => void
  ) => {
    setShowRegenerationWarning(false);
    
    if (!user) {
      onError('User not authenticated');
      return;
    }

    if (!displayName || !passphrase || passphrase !== confirmPassphrase) {
      onError('Please fill in all fields correctly');
      return;
    }

    try {
      setLoading(true);
      
      // Handle file migration if requested
      if (migrateFiles && privateKey) {
        setMigrationProgress({ current: 0, total: 1 });
        
        try {
          // We'll need to get the new public key for migration
          const { generateKeyPair } = await import('../crypto/quantumSafeCrypto');
          const tempKeyPair = await generateKeyPair();
          
          const migrationResult = await migrateUserFiles(
            user.uid,
            privateKey,
            tempKeyPair.publicKey,
            (current, total) => setMigrationProgress({ current, total })
          );

          console.log(`Migration completed: ${migrationResult.success} files migrated, ${migrationResult.failed.length} failed`);
          
          if (migrationResult.failed.length > 0) {
            onError(`Key regenerated successfully, but ${migrationResult.failed.length} files could not be migrated. Check console for details.`);
          }
        } catch (migrationError) {
          console.error('Migration failed:', migrationError);
          onError('Key generation succeeded, but file migration failed. Some files may be inaccessible.');
        }
        
        setMigrationProgress(null);
      }

      // CRITICAL: Clear all existing cached keys before regeneration
      const { usePrivateKeyStorage } = await import('../utils/secureStorage');
      const { clearStoredPrivateKey, storePrivateKey } = usePrivateKeyStorage(user.uid);
      clearStoredPrivateKey(); // Clear old cached keys first
      
      console.log('🔄 Key regeneration: Cleared old cached keys, generating new key pair...');
      
      // Use centralized key management for regeneration
      const { profile, privateKey: newPrivateKey } = await regenerateUserKeys(
        user.uid,
        displayName,
        user.email || '',
        passphrase,
        theme
      );
      
      console.log('🔄 Key regeneration: New key pair generated:', {
        publicKeyPreview: profile.publicKey?.substring(0, 16) + '...',
        privateKeyPreview: newPrivateKey.substring(0, 16) + '...',
        publicKeyLength: profile.publicKey?.length,
        privateKeyLength: newPrivateKey.length
      });
      
      // Store new private key with user's remember preference
      const rememberChoice = localStorage.getItem(`rememberPrivateKey_${user.uid}`) === 'true';
      storePrivateKey(newPrivateKey, rememberChoice);
      
      console.log('🔄 Key regeneration: New private key stored in secure storage');
      
      // CRITICAL: Verify the key pair immediately after storage
      try {
        const { verifyKeyPair } = await import('../services/keyManagement');
        const isValid = await verifyKeyPair(newPrivateKey, profile.publicKey || '');
        if (isValid) {
          console.log('✅ Key regeneration: Key pair verification PASSED - public and private keys match');
        } else {
          console.error('❌ Key regeneration: Key pair verification FAILED - public and private keys DO NOT match!');
          throw new Error('Generated key pair verification failed - keys do not match');
        }
      } catch (verificationError) {
        console.error('❌ Key regeneration: Key pair verification error:', verificationError);
        throw new Error(`Key pair verification failed: ${verificationError instanceof Error ? verificationError.message : String(verificationError)}`);
      }
      
      console.log('✅ Key regeneration completed successfully');
      onSuccess(profile);
      
      setShowKeyRegeneration(false);
      setPassphrase('');
      setConfirmPassphrase('');
      
      if (!migrateFiles || !privateKey) {
        onError('');
      }
      
    } catch (err) {
      console.error('Key regeneration failed:', err);
      onError('Failed to regenerate keys. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleCancelRegeneration = () => {
    setShowKeyRegeneration(false);
    setPassphrase('');
    setConfirmPassphrase('');
  };

  const getEncryptionMethod = (userProfile: UserProfile | null): EncryptionMethod => {
    if (!userProfile || !userProfile.publicKey) return 'Legacy';
    
    // ML-KEM-768 public keys are 1184 bytes = 2368 hex characters
    if (userProfile.publicKey.length === 2368) {
      return 'ML-KEM768';
    }
    return 'Legacy';
  };

  const handleDownloadKey = async (userProfile: UserProfile, onError: (error: string) => void) => {
    if (!userProfile?.encryptedPrivateKey) {
      onError('No private key available for download');
      return;
    }

    try {
      const encryptionMethod = getEncryptionMethod(userProfile);
      const keyData = {
        version: "1.0",
        keyType: encryptionMethod === 'ML-KEM768' ? "ML-KEM-768" : "Legacy",
        displayName: userProfile.displayName,
        email: userProfile.email,
        publicKey: userProfile.publicKey,
        encryptedPrivateKey: userProfile.encryptedPrivateKey,
        exportedAt: new Date().toISOString()
      };

      const blob = new Blob([JSON.stringify(keyData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const keyTypeForFilename = encryptionMethod === 'ML-KEM768' ? 'mlkem768' : 'legacy';
      link.download = `${userProfile.displayName.replace(/[^a-zA-Z0-9]/g, '_')}_${keyTypeForFilename}_key.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading key:', error);
      onError('Failed to download key file');
    }
  };

  const handleDownloadDecryptedKey = async (
    userProfile: UserProfile,
    privateKey: string | null,
    onError: (error: string) => void
  ) => {
    if (!privateKey) {
      onError('Private key is not currently decrypted. Please unlock your key first.');
      return;
    }

    if (!userProfile) {
      onError('User profile not available');
      return;
    }

    setShowDecryptedKeyWarning(true);
  };

  return {
    passphrase,
    confirmPassphrase,
    showKeyRegeneration,
    showDecryptedKeyWarning,
    showRegenerationWarning,
    migrationProgress,
    setPassphrase,
    setConfirmPassphrase,
    setShowKeyRegeneration,
    setShowDecryptedKeyWarning,
    setShowRegenerationWarning,
    handleGenerateKeys,
    handleRegenerateKeys,
    handleConfirmRegeneration,
    handleCancelRegeneration,
    getEncryptionMethod,
    handleDownloadKey,
    handleDownloadDecryptedKey,
  };
};