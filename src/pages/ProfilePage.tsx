import React, { useEffect, useState } from 'react';
import { Box, Typography, CircularProgress, Button, TextField, Paper, FormControlLabel, Switch, Alert } from '@mui/material';
import { useAuth } from '../auth/AuthContext';
import { usePassphrase } from '../auth/PassphraseContext';
import { useThemeContext } from '../theme/ThemeContext';
import { useProfileManagement } from '../hooks/useProfileManagement';
import { useKeyGeneration } from '../hooks/useKeyGeneration';
import { type UserProfile } from '../firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useNavigate } from 'react-router-dom';
import { type User as FirebaseUser } from 'firebase/auth';
import BiometricSetup from '../components/BiometricSetup';
import HardwareKeySetup from '../components/HardwareKeySetup';
import DeviceCapabilityInfo from '../components/DeviceCapabilityInfo';
import DecryptedKeyWarningDialog from '../components/DecryptedKeyWarningDialog';
import DeleteAccountDialog from '../components/DeleteAccountDialog';
import KeyManagementSection from '../components/KeyManagementSection';
import EncryptionStatusSection from '../components/EncryptionStatusSection';
import KeyGenerationForm from '../components/KeyGenerationForm';
import JsonImport from '../components/JsonImport';

const ProfilePage: React.FC = () => {
  const { user } = useAuth();
  const { setMode } = useThemeContext();
  const { privateKey } = usePassphrase();
  const navigate = useNavigate();
  const {
    userProfile,
    loading,
    editMode,
    displayName,
    theme,
    error,
    setUserProfile,
    setLoading,
    setEditMode,
    setDisplayName,
    setTheme,
    setError,
    fetchProfile,
    handleProfileUpdate,
  } = useProfileManagement();

  const {
    passphrase,
    confirmPassphrase,
    showDecryptedKeyWarning,
    setPassphrase,
    setConfirmPassphrase,
    setShowDecryptedKeyWarning,
    handleGenerateKeys,
    getEncryptionMethod,
    handleDownloadKey,
    handleDownloadDecryptedKey,
  } = useKeyGeneration();

  // Delete account state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletionProgress, setDeletionProgress] = useState<{
    step: string;
    current: number;
    total: number;
  } | null>(null);

  // Hardware key state
  const [hasHardwareKeysWithPrivateKey, setHasHardwareKeysWithPrivateKey] = useState(false);
  const [checkingHardwareKeys, setCheckingHardwareKeys] = useState(true);

  // Success handlers that update profile and refresh private key
  const handleKeyGenerationSuccess = (profile: UserProfile) => {
    setUserProfile(profile);
    // Key verification is already done in useKeyGeneration.handleConfirmRegeneration
    // No need to verify again here
  };

  useEffect(() => {
    fetchProfile(user);
  }, [user, fetchProfile]);
  
  // Check for hardware keys with stored private keys
  useEffect(() => {
    const checkHardwareKeys = async () => {
      if (!user) {
        setCheckingHardwareKeys(false);
        return;
      }

      try {
        const { getRegisteredHardwareKeys } = await import('../utils/hardwareKeyAuth');
        const hardwareKeys = await getRegisteredHardwareKeys(user.uid);
        // Check if user has ANY hardware keys registered
        const hasKeysWithPrivateKey = hardwareKeys.length > 0;
        setHasHardwareKeysWithPrivateKey(hasKeysWithPrivateKey);
      } catch (error) {
        console.error('Error checking hardware keys:', error);
        setHasHardwareKeysWithPrivateKey(false);
      } finally {
        setCheckingHardwareKeys(false);
      }
    };

    checkHardwareKeys();
  }, [user]);
  
  // Scroll to biometric section if navigated with hash
  useEffect(() => {
    if (window.location.hash === '#biometric') {
      setTimeout(() => {
        const element = document.getElementById('biometric');
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 300); // Small delay to ensure page is fully rendered
    }
  }, []);

  const handleConfirmDecryptedKeyDownload = async () => {
    if (!userProfile || !privateKey) return;
    
    try {
      const keyData = {
        version: "1.0",
        keyType: "ML-KEM-768 (DECRYPTED)",
        displayName: userProfile.displayName,
        email: userProfile.email,
        publicKey: userProfile.publicKey,
        privateKeyHex: privateKey,
        exportedAt: new Date().toISOString(),
        warning: "This file contains your private key in PLAIN TEXT. Store it securely and never share it."
      };

      const blob = new Blob([JSON.stringify(keyData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${userProfile.displayName.replace(/[^a-zA-Z0-9]/g, '_')}_mlkem768_decrypted_key.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      setShowDecryptedKeyWarning(false);
    } catch (error) {
      console.error('Error downloading decrypted key:', error);
      setError('Failed to download decrypted key file');
    }
  };

  // Handle account deletion
  const handleDeleteAccount = async () => {
    if (!user) return;

    try {
      // Call the Cloud Function to delete the account
      const functions = getFunctions();
      const deleteAccount = httpsCallable(functions, 'deleteUserAccount');
      
      setDeletionProgress({
        step: 'Deleting your account...',
        current: 1,
        total: 1
      });
      
      const result = await deleteAccount();
      
      console.log('Account deletion result:', result.data);
      
      // Account deleted successfully, redirect to login
      navigate('/login');
    } catch (error) {
      console.error('Failed to delete account:', error);
      setError(error instanceof Error ? error.message : 'Failed to delete account');
      setDeleteDialogOpen(false);
      setDeletionProgress(null);
    }
  };

  // Account deletion handler

  if (loading || checkingHardwareKeys) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <CircularProgress />
      </Box>
    );
  }

  // Show key generation form only if user truly has no way to access their keys
  const hasPassphraseProtectedKey = userProfile?.encryptedPrivateKey;
  const needsKeyGeneration = !userProfile || !userProfile.publicKey || (!hasPassphraseProtectedKey && !hasHardwareKeysWithPrivateKey);

  if (needsKeyGeneration) {
    return (
      <KeyGenerationForm
        userProfile={userProfile}
        displayName={displayName}
        passphrase={passphrase}
        confirmPassphrase={confirmPassphrase}
        error={error}
        onDisplayNameChange={setDisplayName}
        onPassphraseChange={setPassphrase}
        onConfirmPassphraseChange={setConfirmPassphrase}
        onGenerateKeys={(useHardwareStorage) => handleGenerateKeys(user, displayName, handleKeyGenerationSuccess, setError, setLoading, useHardwareStorage)}
      />
    );
  }

  const encryptionMethod = getEncryptionMethod(userProfile);

  return (
    <>
      <Box sx={{ maxWidth: 800, mx: 'auto' }}>
        <Typography variant="h4" gutterBottom>Profile</Typography>

        {/* Profile Information */}
        <Paper elevation={2} sx={{ p: 3, mb: 3 }}>
          <Typography variant="h6" gutterBottom>Account Information</Typography>
          {editMode ? (
            <Box>
              <TextField
                label="Display Name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                fullWidth
                margin="normal"
              />
              <FormControlLabel
                control={<Switch checked={theme === 'dark'} onChange={(e) => setTheme(e.target.checked ? 'dark' : 'light')} />}
                label="Dark Theme"
              />
              <Box sx={{ mt: 2 }}>
                <Button onClick={() => handleProfileUpdate(user, setMode)} variant="contained" sx={{ mr: 1 }}>Save</Button>
                <Button onClick={() => setEditMode(false)} variant="outlined">Cancel</Button>
              </Box>
            </Box>
          ) : (
            <Box>
              <Typography variant="body1" sx={{ mb: 1 }}><strong>Display Name:</strong> {userProfile.displayName}</Typography>
              <Typography variant="body1" sx={{ mb: 1 }}><strong>Email:</strong> {userProfile.email}</Typography>
              <Typography variant="body1" sx={{ mb: 2 }}><strong>Theme:</strong> {userProfile.theme}</Typography>
              <Button onClick={() => setEditMode(true)} variant="contained">Edit Profile</Button>
            </Box>
          )}
        </Paper>

        <EncryptionStatusSection encryptionMethod={encryptionMethod} />

        {/* Key Management */}
        <KeyManagementSection
          userProfile={userProfile}
          privateKey={privateKey}
          onDownloadKey={() => handleDownloadKey(userProfile, setError)}
          onDownloadDecryptedKey={() => setShowDecryptedKeyWarning(true)}
        />

        {/* Device Capability Information */}
        <DeviceCapabilityInfo />

        {/* Biometric Authentication Setup */}
        <Box id="biometric">
          <BiometricSetup />
        </Box>

        {/* Hardware Security Keys */}
        <HardwareKeySetup onEncryptedKeyChange={() => fetchProfile(user as FirebaseUser)} />

        {/* JSON Import */}
        <JsonImport />

        {/* Danger Zone - Delete Account */}
        <Paper elevation={2} sx={{ p: 3, mb: 3, border: '2px solid', borderColor: 'error.main' }}>
          <Typography variant="h6" gutterBottom color="error">
            Danger Zone
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Once you delete your account, there is no going back. All your data will be permanently deleted.
          </Typography>
          <Button 
            variant="outlined" 
            color="error"
            onClick={() => setDeleteDialogOpen(true)}
          >
            Delete My Account
          </Button>
        </Paper>

      </Box>
      
      <DecryptedKeyWarningDialog
        open={showDecryptedKeyWarning}
        onClose={() => setShowDecryptedKeyWarning(false)}
        onConfirm={handleConfirmDecryptedKeyDownload}
      />

      <DeleteAccountDialog
        open={deleteDialogOpen}
        userEmail={userProfile?.email || ''}
        onClose={() => {
          setDeleteDialogOpen(false);
          setDeletionProgress(null);
        }}
        onConfirm={handleDeleteAccount}
        progress={deletionProgress}
      />
      
      {/* KeyRegenerationWarningDialog hidden */}
      </>
  );
};

export default ProfilePage;