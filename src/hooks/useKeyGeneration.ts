import { useState } from 'react';
import { type User } from 'firebase/auth';
import { createUserWithKeys, regenerateUserKeys } from '../services/keyManagement';
import { type UserProfile } from '../firestore';
import { migrateUserFiles } from '../services/keyMigration';
import { validatePassphraseComplexity } from '../utils/passwordStrength';

export type EncryptionMethod = 'ML-KEM768';

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
    setLoading: (loading: boolean) => void,
    useHardwareStorage?: boolean,
    loginPassword?: string
  ) => Promise<void>;
  handleRegenerateKeys: () => void;
  handleConfirmRegeneration: (
    migrateFiles: boolean,
    user: User | null,
    displayName: string,
    theme: 'light' | 'dark',
    privateKey: string | null,
    setPrivateKeyInContext: (key: string | null) => void,
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
    setLoading: (loading: boolean) => void,
    useHardwareStorage = false,
    loginPassword?: string
  ) => {
    // Passphrase validation - only required for standard (non-hardware) storage
    // With hardware storage, passphrase is optional (for backup access)
    if (!useHardwareStorage) {
      if (passphrase !== confirmPassphrase) {
        onError('Passphrases do not match');
        return;
      }
      const validationErrors = validatePassphraseComplexity(passphrase);
      if (validationErrors.length > 0) {
        onError(validationErrors.join(' '));
        return;
      }
    } else {
      // Hardware mode: if passphrase is provided, validate it
      if (passphrase || confirmPassphrase) {
        if (passphrase !== confirmPassphrase) {
          onError('Passphrases do not match');
          return;
        }
        if (passphrase.length > 0) {
          const validationErrors = validatePassphraseComplexity(passphrase);
          if (validationErrors.length > 0) {
            onError('Backup passphrase: ' + validationErrors.join(' '));
            return;
          }
        }
      }
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
      
      // Determine if we should create an encrypted private key backup
      const hasPassphrase = passphrase && passphrase.length >= 12;
      
      // Use centralized key management
      const { profile, privateKey } = await createUserWithKeys(
        user.uid,
        displayName,
        user.email || '',
        hasPassphrase ? passphrase : '' // Empty string if no passphrase (hardware-only mode)
      );
      
      if (useHardwareStorage) {
        // Store private key in hardware key
        const { registerHardwareKey, storePrivateKeyInHardware } = await import('../utils/hardwareKeyAuth');
        
        try {
          // Register the hardware key
          const { keyData: credential, signature } = await registerHardwareKey(user.uid, user.email || '', 'Primary Security Key');
          
          // Store the private key in the hardware key (pass signature to avoid double-prompt)
          await storePrivateKeyInHardware(credential.id, privateKey, user.uid, signature);
          
          console.log('✅ Private key stored in hardware key');
          
          // If no passphrase was provided, remove the encryptedPrivateKey from profile
          if (!hasPassphrase) {
            const { updateUserProfile } = await import('../firestore');
            const { deleteField } = await import('firebase/firestore');
            await updateUserProfile(user.uid, {
              encryptedPrivateKey: deleteField() as any
            });
            console.log('✅ Hardware-only mode: No passphrase backup stored');
          } else {
            console.log('✅ Hardware + Passphrase mode: Both methods available');
          }
          
          // Small delay to ensure credential is fully persisted before showing unlock dialog
          await new Promise(resolve => setTimeout(resolve, 200));
        } catch (hardwareError) {
          console.error('Hardware key setup failed:', hardwareError);
          onError('Hardware key setup failed. Please try again or use standard mode.');
          setLoading(false);
          return;
        }
      } else {
        // Store private key in secure storage (standard mode)
        const { usePrivateKeyStorage } = await import('../utils/secureStorage');
        const { storePrivateKey } = usePrivateKeyStorage(user.uid);
        storePrivateKey(privateKey, true); // Default to remember for convenience
      }
      
      // Create a form with the user's credentials for safekeeping
      try {
        console.log('🔄 Starting credentials form creation...');
        const { saveFormAsFile, createBlankForm } = await import('../utils/formFiles');
        const { legacyAuth: auth } = await import('../backend/FirebaseBackend');
        const i18n = (await import('../i18n')).default;
        const currentUser = auth.currentUser;
        
        console.log('Current user:', currentUser?.email || currentUser?.phoneNumber);
        
        if (currentUser && (currentUser.email || currentUser.phoneNumber)) {
          const t = i18n.t.bind(i18n);
          
          // Use email if available, otherwise phone number
          const userIdentifier = currentUser.email || currentUser.phoneNumber || 'User';
          
          // Create a blank form
          const formData = createBlankForm(
            t('profile.accountCredentialsFormName', 'SeraVault Account Credentials'),
            currentUser.displayName || userIdentifier
          );
          
          console.log('✅ Blank form created');
          
          // Customize the form metadata
          formData.metadata.category = t('profile.accountCategory', 'Account');
          formData.metadata.icon = 'Key';
          formData.metadata.color = '#42a5f5';
          
          // Add fields with translated labels
          formData.schema.fields = [
            {
              id: 'service',
              type: 'text',
              label: t('profile.serviceLabel', 'Service'),
              required: true,
              sensitive: false
            },
            {
              id: 'username',
              type: 'text',
              label: t('profile.usernameLabel', 'Username/Email/Phone'),
              required: true,
              sensitive: false
            },
            {
              id: 'password',
              type: 'password',
              label: t('profile.passwordLabel', 'Login Password'),
              placeholder: t('profile.passwordPlaceholder', 'Enter your login password here'),
              required: false,
              sensitive: true
            },
            {
              id: 'passphrase',
              type: 'password',
              label: t('profile.passphraseLabel', 'Encryption Passphrase'),
              required: false,
              sensitive: true
            }
          ];
          
          console.log('✅ Form fields configured');
          
          // Set the field values
          formData.data = {
            service: 'SeraVault',
            username: userIdentifier,
            password: loginPassword || '', // Use the login password from signup
            passphrase: hasPassphrase ? passphrase : ''
          };

          console.log('✅ Form data populated (passphrase included:', !!hasPassphrase, ')');
          console.log('📝 About to save form to Firestore...');

          // Save the form as a file
          const fileId = await saveFormAsFile(
            formData,
            user.uid,
            privateKey,
            null // root folder
          );
          
          console.log('✅ Created credentials form with ID:', fileId);
          console.log('📂 Form should appear in your root folder after page refresh');
        } else {
          console.warn('⚠️ Cannot create credentials form: No current user or email');
        }
      } catch (formError) {
        console.error('❌ Failed to create credentials form:', formError);
        console.error('Error details:', {
          message: formError instanceof Error ? formError.message : String(formError),
          stack: formError instanceof Error ? formError.stack : undefined
        });
        // Don't fail the entire process if form creation fails
      }
      
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
    setPrivateKeyInContext: (key: string | null) => void,
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
      
      // CRITICAL: Clear all existing cached keys before regeneration
      const { usePrivateKeyStorage } = await import('../utils/secureStorage');
      const { clearStoredPrivateKey, storePrivateKey } = usePrivateKeyStorage(user.uid);
      clearStoredPrivateKey(); // Clear old cached keys first
      
      // CRITICAL: Clear all hardware keys and biometric data
      // The old private key stored in hardware is incompatible with new keys
      try {
        const { getRegisteredHardwareKeys, removeHardwareKey, removeStoredPrivateKey: removeHWStoredKey } = await import('../utils/hardwareKeyAuth');
        const hardwareKeys = await getRegisteredHardwareKeys(user.uid);
        
        console.log(`🔄 Key regeneration: Removing ${hardwareKeys.length} hardware key(s)...`);
        
        for (const key of hardwareKeys) {
          try {
            // Remove stored private key from IndexedDB
            await removeHWStoredKey(key.id);
            // Remove hardware key registration
            await removeHardwareKey(user.uid, key.id);
            console.log(`✅ Removed hardware key: ${key.nickname || key.id}`);
          } catch (keyError) {
            console.warn(`⚠️ Failed to remove hardware key ${key.id}:`, keyError);
          }
        }
        
        console.log('✅ Key regeneration: Cleared all hardware keys and biometric data');
      } catch (hwKeyError) {
        console.warn('⚠️ Key regeneration: Error clearing hardware keys:', hwKeyError);
        // Continue with regeneration even if hardware key cleanup fails
      }
      
      console.log('🔄 Key regeneration: Cleared old cached keys, generating new key pair...');
      
      // Generate new key pair FIRST (before migration)
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
      
      // Handle file migration AFTER generating new keys
      if (migrateFiles && privateKey && profile.publicKey) {
        setMigrationProgress({ current: 0, total: 1 });
        
        try {
          const { hexToBytes } = await import('../crypto/quantumSafeCrypto');
          const newPublicKeyBytes = hexToBytes(profile.publicKey);
          
          const migrationResult = await migrateUserFiles(
            user.uid,
            privateKey, // OLD private key (to decrypt)
            newPublicKeyBytes, // NEW public key (to re-encrypt)
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
      
      // Store new private key with user's remember preference
      const rememberChoice = localStorage.getItem(`rememberPrivateKey_${user.uid}`) === 'true';
      storePrivateKey(newPrivateKey, rememberChoice);
      
      console.log('🔄 Key regeneration: New private key stored in secure storage');
      
      // CRITICAL: Update the context with the new private key immediately
      setPrivateKeyInContext(newPrivateKey);
      console.log('🔄 Key regeneration: Private key context updated');
      
      // CRITICAL: Verify the key pair immediately after storage
      try {
        const { verifyKeyPair } = await import('../services/keyManagement');
        const isValid = await verifyKeyPair(newPrivateKey, profile.publicKey || '');
        if (isValid) {
          console.log('✅ Key regeneration: Key pair verification PASSED - public and private keys match');
        } else {
          console.error('❌ Key regeneration: Key pair verification FAILED - public and private keys DO NOT match!');
          console.error('❌ Private key used:', newPrivateKey.substring(0, 16) + '...');
          console.error('❌ Public key used:', profile.publicKey?.substring(0, 16) + '...');
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
    // All users should have ML-KEM-768 keys
    // ML-KEM-768 public keys are 1184 bytes = 2368 hex characters
    return 'ML-KEM768';
  };

  const handleDownloadKey = async (userProfile: UserProfile, onError: (error: string) => void) => {
    if (!userProfile?.encryptedPrivateKey) {
      onError('No private key available for download');
      return;
    }

    try {
      const keyData = {
        version: "1.0",
        keyType: "ML-KEM-768",
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
      link.download = `${userProfile.displayName.replace(/[^a-zA-Z0-9]/g, '_')}_mlkem768_key.json`;
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