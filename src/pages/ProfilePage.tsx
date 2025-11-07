import React, { useEffect } from 'react';
import { Box, Typography, CircularProgress, Button, TextField, Paper, FormControlLabel, Switch } from '@mui/material';
import { useAuth } from '../auth/AuthContext';
import { usePassphrase } from '../auth/PassphraseContext';
import { useThemeContext } from '../theme/ThemeContext';
import { useProfileManagement } from '../hooks/useProfileManagement';
import { useKeyGeneration } from '../hooks/useKeyGeneration';
import BiometricSetup from '../components/BiometricSetup';
import HardwareKeySetup from '../components/HardwareKeySetup';
import DeviceCapabilityInfo from '../components/DeviceCapabilityInfo';
import DecryptedKeyWarningDialog from '../components/DecryptedKeyWarningDialog';
import KeyRegenerationWarningDialog from '../components/KeyRegenerationWarningDialog';
import KeyManagementSection from '../components/KeyManagementSection';
import EncryptionStatusSection from '../components/EncryptionStatusSection';
import KeyGenerationForm from '../components/KeyGenerationForm';

const ProfilePage: React.FC = () => {
  const { user } = useAuth();
  const { setMode } = useThemeContext();
  const { privateKey, refreshPrivateKey } = usePassphrase();
  
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
  } = useKeyGeneration();
  
  // Success handlers that update profile and refresh private key
  const handleKeyGenerationSuccess = async (profile: any) => {
    setUserProfile(profile);
    refreshPrivateKey(); // Refresh the private key context
    
    // Wait a moment for the refresh to complete, then verify
    setTimeout(async () => {
      try {
        const currentPrivateKey = privateKey;
        if (currentPrivateKey && profile.publicKey) {
          const { verifyKeyPair } = await import('../services/keyManagement');
          const isValid = await verifyKeyPair(currentPrivateKey, profile.publicKey);
          if (isValid) {
            console.log('✅ ProfilePage: Post-refresh key verification PASSED');
          } else {
            console.error('❌ ProfilePage: Post-refresh key verification FAILED');
            console.error('❌ Context private key:', currentPrivateKey.substring(0, 16) + '...');
            console.error('❌ Profile public key:', profile.publicKey.substring(0, 16) + '...');
          }
        }
      } catch (error) {
        console.error('❌ ProfilePage: Post-refresh verification error:', error);
      }
    }, 100);
  };

  useEffect(() => {
    fetchProfile(user);
  }, [user, fetchProfile]);

  const handleConfirmDecryptedKeyDownload = async () => {
    setShowDecryptedKeyWarning(false);
    
    if (!privateKey || !userProfile) return;

    try {
      const encryptionMethod = getEncryptionMethod(userProfile);
      const keyData = {
        version: "1.0",
        keyType: encryptionMethod === 'ML-KEM768' ? "ML-KEM-768_DECRYPTED" : "Legacy_DECRYPTED",
        displayName: userProfile.displayName,
        email: userProfile.email,
        publicKey: userProfile.publicKey,
        privateKeyHex: privateKey,
        warning: "THIS FILE CONTAINS YOUR PRIVATE KEY IN PLAIN TEXT - KEEP SECURE!",
        exportedAt: new Date().toISOString()
      };

      const blob = new Blob([JSON.stringify(keyData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const keyTypeForFilename = encryptionMethod === 'ML-KEM768' ? 'mlkem768' : 'legacy';
      link.download = `${userProfile.displayName.replace(/[^a-zA-Z0-9]/g, '_')}_${keyTypeForFilename}_private_key_DECRYPTED.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading decrypted key:', error);
      setError('Failed to download decrypted key file');
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!userProfile || !userProfile.publicKey || (!userProfile.encryptedPrivateKey && !userProfile.legacyEncryptedPrivateKey)) {
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

        {/* Encryption Status and Upgrade */}
        <EncryptionStatusSection
          encryptionMethod={encryptionMethod}
          showKeyRegeneration={showKeyRegeneration}
          passphrase={passphrase}
          confirmPassphrase={confirmPassphrase}
          migrationProgress={migrationProgress}
          onSetShowKeyRegeneration={setShowKeyRegeneration}
          onSetPassphrase={setPassphrase}
          onSetConfirmPassphrase={setConfirmPassphrase}
          onRegenerateKeys={handleRegenerateKeys}
          onCancelRegeneration={handleCancelRegeneration}
        />

        {/* Key Management */}
        {(encryptionMethod === 'ML-KEM768' || encryptionMethod === 'HPKE') && (
          <KeyManagementSection
            userProfile={userProfile}
            privateKey={privateKey}
            onDownloadKey={() => handleDownloadKey(userProfile, setError)}
            onDownloadDecryptedKey={() => handleDownloadDecryptedKey(userProfile, privateKey, setError)}
          />
        )}

        {/* Device Capability Information */}
        <DeviceCapabilityInfo />

        {/* Biometric Authentication Setup */}
        <BiometricSetup />

        {/* Hardware Security Keys */}
        <HardwareKeySetup />

      </Box>
      
      <DecryptedKeyWarningDialog
        open={showDecryptedKeyWarning}
        onClose={() => setShowDecryptedKeyWarning(false)}
        onConfirm={handleConfirmDecryptedKeyDownload}
      />
      
      <KeyRegenerationWarningDialog
        open={showRegenerationWarning}
        onClose={() => setShowRegenerationWarning(false)}
        onConfirm={(migrateFiles) => handleConfirmRegeneration(
          migrateFiles,
          user,
          displayName,
          theme,
          privateKey,
          handleKeyGenerationSuccess,
          setError,
          setLoading
        )}
        userId={user?.uid || ''}
      />
      </>
  );
};

export default ProfilePage;