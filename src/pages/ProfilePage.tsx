import React, { useEffect, useState } from 'react';
import { Box, Typography, CircularProgress, Button, TextField, Paper, FormControlLabel, Switch, Alert, Snackbar, useTheme, useMediaQuery, Divider, Chip, Card, CardContent, Accordion, AccordionSummary, AccordionDetails, Dialog, DialogTitle, DialogContent, DialogActions, DialogContentText } from '@mui/material';
import { useAuth } from '../auth/AuthContext';
import { usePassphrase } from '../auth/PassphraseContext';
import { useThemeContext } from '../theme/ThemeContext';
import { useProfileManagement } from '../hooks/useProfileManagement';
import { useKeyGeneration } from '../hooks/useKeyGeneration';
import { useTranslation } from 'react-i18next';
import { type UserProfile } from '../firestore';
import { backendService } from '../backend/BackendService';
import { useNavigate } from 'react-router-dom';
import type { User } from '../backend/BackendInterface';
import BiometricSetup from '../components/BiometricSetup';
import HardwareKeySetup from '../components/HardwareKeySetup';
import DeviceCapabilityInfo from '../components/DeviceCapabilityInfo';
import DecryptedKeyWarningDialog from '../components/DecryptedKeyWarningDialog';
import DeleteAccountDialog from '../components/DeleteAccountDialog';
import ExportDataDialog from '../components/ExportDataDialog';
import KeyManagementSection from '../components/KeyManagementSection';
import KeyGenerationForm from '../components/KeyGenerationForm';
import JsonImport from '../components/JsonImport';
import { Email, Phone, Google, Add, Person, Security, VpnKey, Download, DeleteForever, ExpandMore, CheckCircle, Warning, Fingerprint, Info, Close, Storage } from '@mui/icons-material';
import { PhoneAuth } from '../components/PhoneAuth';
import PasswordStrengthIndicator from '../components/PasswordStrengthIndicator';
import PasswordRequirements from '../components/PasswordRequirements';
import { validatePasswordComplexity } from '../utils/passwordStrength';

const ProfilePage: React.FC = () => {
  const { user } = useAuth();
  const { setMode } = useThemeContext();
  const { privateKey } = usePassphrase();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const muiTheme = useTheme();
  const isMobile = useMediaQuery(muiTheme.breakpoints.down('sm'));
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

  // Export data state
  const [exportDialogOpen, setExportDialogOpen] = useState(false);

  // Hardware key state
  const [hasHardwareKeysWithPrivateKey, setHasHardwareKeysWithPrivateKey] = useState(false);
  const [checkingHardwareKeys, setCheckingHardwareKeys] = useState(true);

  // Authentication methods state
  const [linkedProviders, setLinkedProviders] = useState<string[]>([]);
  const [showPhoneUpdate, setShowPhoneUpdate] = useState(false);
  const [showPhoneAdd, setShowPhoneAdd] = useState(false);
  const [showEmailPasswordAdd, setShowEmailPasswordAdd] = useState(false);
  const [showEmailUpdate, setShowEmailUpdate] = useState(false);
  const [showPasswordUpdate, setShowPasswordUpdate] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [authMethodsLoading, setAuthMethodsLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [confirmUnlinkProvider, setConfirmUnlinkProvider] = useState<string | null>(null);

  // Success handlers that update profile and refresh private key
  const handleKeyGenerationSuccess = (profile: UserProfile) => {
    setUserProfile(profile);
    // Key verification is already done in useKeyGeneration.handleConfirmRegeneration
    // No need to verify again here
    
    // Re-check hardware keys after generation
    const recheckHardwareKeys = async () => {
      if (!user) return;
      try {
        const { getRegisteredHardwareKeys } = await import('../utils/hardwareKeyAuth');
        const hardwareKeys = await getRegisteredHardwareKeys(user.uid);
        setHasHardwareKeysWithPrivateKey(hardwareKeys.length > 0);
      } catch (error) {
        console.error('Error rechecking hardware keys:', error);
      }
    };
    recheckHardwareKeys();
    
    // Check for pending invitation from signup (no longer checking pendingSubscriptionPlan)
    const pendingInvitation = localStorage.getItem('pendingInvitation');
    
    console.log('[ProfilePage] Key generation success - checking pending actions:', {
      pendingInvitation
    });
    
    if (pendingInvitation) {
      console.log('[ProfilePage] Redirecting to contacts with invitation:', pendingInvitation);
      localStorage.removeItem('pendingInvitation');
      navigate('/contacts?invite=' + pendingInvitation);
    } else {
      console.log('[ProfilePage] No pending actions, navigating to home (/)');
      // Force a small delay to ensure Firestore writes have propagated locally
      setTimeout(() => {
        console.log('[ProfilePage] Executing navigation to /');
        navigate('/');
      }, 500);
    }
    // If no pending actions, stay on profile page
  };

  useEffect(() => {
    if (user) {
      fetchProfile(user as User);
    }
  }, [user, fetchProfile]);
  
  // Load linked authentication providers
  useEffect(() => {
    const loadLinkedProviders = async () => {
      if (!user) return;
      
      try {
        const providers = backendService.auth.getLinkedProviders();
        setLinkedProviders(providers);
      } catch (err) {
        console.error('Error loading linked providers:', err);
      }
    };
    
    loadLinkedProviders();
  }, [user]);
  
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

  // Handle data export
  const handleExportData = async (saveToDirectory: boolean) => {
    if (!user || !privateKey) {
      throw new Error(t('profile.unlockKeyRequired', 'Please unlock your private key first'));
    }

    const { exportAllUserData } = await import('../services/dataExport');
    
    await exportAllUserData(user.uid, privateKey, {
      saveToDirectory,
      onProgress: (progress) => {
        console.log('Export progress:', progress);
        // Could add UI progress indicator here if needed
      }
    });
  };

  // Handle account deletion
  const handleDeleteAccount = async () => {
    if (!user) return;

    try {
      // Call the Cloud Function to delete the account
      setDeletionProgress({
        step: t('profile.deletingAccount', 'Deleting your account...'),
        current: 1,
        total: 1
      });
      
      const result = await backendService.functions.call<Record<string, never>, { success: boolean; message: string }>('deleteUserAccount', {});
      
      console.log('Account deletion result:', result.data);
      
      // Clear all local storage including language preference
      localStorage.clear();
      sessionStorage.clear();
      
      // Account deleted successfully, redirect to login
      navigate('/login');
    } catch (error) {
      console.error('Failed to delete account:', error);
      setError(error instanceof Error ? error.message : 'Failed to delete account');
      setDeleteDialogOpen(false);
      setDeletionProgress(null);
    }
  };

  // Handle phone number update
  const handlePhoneUpdate = async () => {
    setShowPhoneUpdate(false);
    setError(null);
    
    // Reload linked providers after update
    const providers = backendService.auth.getLinkedProviders();
    setLinkedProviders(providers);
  };

  // Handle phone number add
  const handlePhoneAdd = async () => {
    setShowPhoneAdd(false);
    setError(null);
    
    // Reload linked providers after add
    const providers = backendService.auth.getLinkedProviders();
    setLinkedProviders(providers);
  };

  // Handle unlinking authentication method
  const handleUnlinkProvider = async (providerId: string) => {
    try {
      setAuthMethodsLoading(true);
      setError(null);
      setConfirmUnlinkProvider(null);

      await backendService.auth.unlinkProvider(providerId);
      
      // Reload linked providers
      const providers = backendService.auth.getLinkedProviders();
      setLinkedProviders(providers);
      
      setSuccessMessage(t('profile.authMethodRemoved', 'Authentication method removed successfully'));
    } catch (err: unknown) {
      console.error('Error unlinking provider:', err);
      const error = err as { code?: string; message?: string };
      setError(error.message || t('profile.failedToRemoveAuth', 'Failed to remove authentication method. Make sure you have at least one other method linked.'));
    } finally {
      setAuthMethodsLoading(false);
    }
  };

  // Handle adding email/password to phone-only account
  const handleAddEmailPassword = async () => {
    if (!newEmail || !newEmail.trim()) {
      setError(t('profile.emailRequired', 'Email is required'));
      return;
    }

    // Better email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newEmail)) {
      setError(t('profile.validEmailRequired', 'Please enter a valid email address'));
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setError(t('profile.passwordsDoNotMatch', 'Passwords do not match'));
      return;
    }

    // Use full password complexity validation like signup
    const validationErrors = validatePasswordComplexity(newPassword);
    if (validationErrors.length > 0) {
      setError(validationErrors.join(' '));
      return;
    }

    try {
      setAuthMethodsLoading(true);
      setError(null);

      await backendService.auth.linkEmailPassword(newEmail, newPassword);
      console.log('Email/password linked successfully');
      
      // Refresh the profile
      if (fetchProfile && user) {
        await fetchProfile(user as User);
      }
      
      // Update linked providers list
      const providers = backendService.auth.getLinkedProviders();
      setLinkedProviders(providers);
      
      setShowEmailPasswordAdd(false);
      setNewEmail('');
      setNewPassword('');
      setConfirmNewPassword('');
    } catch (err: unknown) {
      console.error('Error linking email/password:', err);
      const error = err as { code?: string; message?: string };
      if (error.code === 'auth/email-already-in-use') {
        setError(t('profile.emailAlreadyInUse', 'This email is already registered. Please use a different email.'));
      } else if (error.code === 'auth/invalid-email') {
        setError(t('profile.invalidEmail', 'Invalid email address'));
      } else if (error.code === 'auth/weak-password') {
        setError(t('profile.weakPasswordError', 'New password is too weak. Use at least 8 characters with mixed case, numbers, and symbols.'));
      } else if (error.code === 'auth/requires-recent-login') {
        setError(t('profile.requiresRecentLogin', 'For security, please sign out and sign in again before adding email/password.'));
      } else if (error.code === 'auth/provider-already-linked') {
        setError(t('profile.providerAlreadyLinked', 'Email/password authentication is already linked to this account.'));
      } else {
        setError(error.message || t('common.error', 'Failed to add email/password authentication. Please try again.'));
      }
    } finally {
      setAuthMethodsLoading(false);
    }
  };

  // Handle updating email address
  const handleUpdateEmail = async () => {
    if (!newEmail || !newEmail.trim()) {
      setError(t('profile.emailRequired', 'Email is required'));
      return;
    }

    // Better email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newEmail)) {
      setError(t('profile.validEmailRequired', 'Please enter a valid email address'));
      return;
    }

    if (!currentPassword) {
      setError(t('profile.currentPasswordRequired', 'Current password is required to update email'));
      return;
    }

    try {
      setAuthMethodsLoading(true);
      setError(null);

      await backendService.auth.updateEmail(currentPassword, newEmail);
      
      setSuccessMessage(t('profile.verificationEmailSent', 'Verification email sent! Please check your new email address and click the link to complete the change.'));
      
      setShowEmailUpdate(false);
      setNewEmail('');
      setCurrentPassword('');
    } catch (err: unknown) {
      console.error('Error updating email:', err);
      const error = err as { code?: string; message?: string };
      if (error.code === 'auth/invalid-credential' || error.code === 'auth/wrong-password') {
        setError(t('profile.currentPasswordIncorrect', 'Current password is incorrect'));
      } else if (error.code === 'auth/email-already-in-use') {
        setError(t('profile.emailAlreadyInUse', 'This email is already registered. Please use a different email.'));
      } else if (error.code === 'auth/invalid-email') {
        setError(t('profile.invalidEmail', 'Invalid email address'));
      } else if (error.code === 'auth/requires-recent-login') {
        setError(t('profile.requiresRecentLogin', 'For security, please sign out and sign in again before updating your email.'));
      } else {
        setError(error.message || t('common.error', 'Failed to update email. Please try again.'));
      }
    } finally {
      setAuthMethodsLoading(false);
    }
  };

  // Handle updating password
  const handleUpdatePassword = async () => {
    if (!currentPassword) {
      setError(t('profile.currentPasswordRequired', 'Current password is required'));
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setError(t('profile.newPasswordsDoNotMatch', 'New passwords do not match'));
      return;
    }

    // Use full password complexity validation like signup
    const validationErrors = validatePasswordComplexity(newPassword);
    if (validationErrors.length > 0) {
      setError(validationErrors.join(' '));
      return;
    }

    if (newPassword === currentPassword) {
      setError(t('profile.newPasswordMustDiffer', 'New password must be different from current password'));
      return;
    }

    try {
      setAuthMethodsLoading(true);
      setError(null);

      await backendService.auth.updatePassword(currentPassword, newPassword);
      
      setSuccessMessage(t('profile.passwordUpdatedSuccess', 'Password updated successfully!'));
      
      setShowPasswordUpdate(false);
      setNewPassword('');
      setConfirmNewPassword('');
      setCurrentPassword('');
    } catch (err: unknown) {
      console.error('Error updating password:', err);
      const error = err as { code?: string; message?: string };
      if (error.code === 'auth/invalid-credential' || error.code === 'auth/wrong-password') {
        setError(t('profile.currentPasswordIncorrect', 'Current password is incorrect'));
      } else if (error.code === 'auth/weak-password') {
        setError(t('profile.weakPasswordError', 'New password is too weak. Use at least 8 characters with mixed case, numbers, and symbols.'));
      } else if (error.code === 'auth/requires-recent-login') {
        setError(t('profile.requiresRecentLoginPassword', 'For security, please sign out and sign in again before updating your password.'));
      } else {
        setError(error.message || t('common.error', 'Failed to update password. Please try again.'));
      }
    } finally {
      setAuthMethodsLoading(false);
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
  const hasPassphraseProtectedKey = !!userProfile?.encryptedPrivateKey;
  const hasHardwareKeyAccess = hasHardwareKeysWithPrivateKey;
  
  // User needs key generation if:
  // 1. No user profile exists, OR
  // 2. No public key exists (no keys at all), OR
  // 3. Has public key but no way to unlock it (no passphrase AND no hardware key)
  const needsKeyGeneration = !userProfile || !userProfile.publicKey || (!hasPassphraseProtectedKey && !hasHardwareKeyAccess);

  if (needsKeyGeneration) {
    return (
      <KeyGenerationForm
        userProfile={userProfile}
        displayName={displayName}
        passphrase={passphrase}
        confirmPassphrase={confirmPassphrase}
        error={error}
        loading={loading}
        onDisplayNameChange={setDisplayName}
        onPassphraseChange={setPassphrase}
        onConfirmPassphraseChange={setConfirmPassphrase}
        onGenerateKeys={(useHardwareStorage) => handleGenerateKeys(user, displayName, handleKeyGenerationSuccess, setError, setLoading, useHardwareStorage)}
      />
    );
  }

  return (
    <>
      <Box sx={{ maxWidth: 900, mx: 'auto', px: isMobile ? 2 : 3, py: isMobile ? 2 : 3 }}>
        {/* Page Header */}
        <Box sx={{ mb: 4 }}>
          <Typography variant={isMobile ? "h4" : "h3"} gutterBottom fontWeight="600">
            {t('profile.title', 'Profile')}
          </Typography>
          <Typography variant="body1" color="text.secondary">
            {t('profile.subtitle', 'Manage your account, security settings, and encryption keys')}
          </Typography>
        </Box>

        {/* Profile Information */}
        <Card elevation={3} sx={{ mb: 3, overflow: 'visible' }}>
          <CardContent sx={{ p: isMobile ? 2 : 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
              <Person sx={{ mr: 1.5, color: 'primary.main', fontSize: 28 }} />
              <Typography variant="h5" fontWeight="600">
                {t('profile.accountSettings', 'Account Information')}
              </Typography>
            </Box>
            <Divider sx={{ mb: 3 }} />
            
            {editMode ? (
              <Box>
                <TextField
                  label={t('profile.displayName', 'Display Name')}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  fullWidth
                  margin="normal"
                />
                <FormControlLabel
                  control={<Switch checked={theme === 'dark'} onChange={(e) => setTheme(e.target.checked ? 'dark' : 'light')} />}
                  label={t('common.darkTheme', 'Dark Theme')}
                  sx={{ mt: 2, mb: 2 }}
                />
                <Box sx={{ mt: 3, display: 'flex', gap: 1 }}>
                  <Button onClick={() => handleProfileUpdate(user, setMode)} variant="contained" size="large">
                    {t('common.save', 'Save')}
                  </Button>
                  <Button onClick={() => setEditMode(false)} variant="outlined" size="large">
                    {t('common.cancel', 'Cancel')}
                  </Button>
                </Box>
              </Box>
            ) : (
              <Box>
                <Box sx={{ mb: 2.5 }}>
                  <Typography variant="caption" color="text.secondary" textTransform="uppercase" fontWeight="600">
                    {t('profile.displayName', 'Display Name')}
                  </Typography>
                  <Typography variant="h6" sx={{ mt: 0.5 }}>
                    {userProfile.displayName}
                  </Typography>
                </Box>
                <Box sx={{ mb: 2.5 }}>
                  <Typography variant="caption" color="text.secondary" textTransform="uppercase" fontWeight="600">
                    {t('profile.emailAddress', 'Email')}
                  </Typography>
                  <Typography variant="h6" sx={{ mt: 0.5 }}>
                    {userProfile.email}
                  </Typography>
                </Box>
                <Box sx={{ mb: 3 }}>
                  <Typography variant="caption" color="text.secondary" textTransform="uppercase" fontWeight="600">
                    {t('profile.theme', 'Theme')}
                  </Typography>
                  <Box sx={{ mt: 0.5 }}>
                    <Chip 
                      label={userProfile.theme === 'dark' ? t('common.darkTheme', 'Dark') : t('common.lightTheme', 'Light')}
                      color="primary"
                      variant="outlined"
                    />
                  </Box>
                </Box>
                <Button onClick={() => setEditMode(true)} variant="contained" size="large">
                  {t('profile.editProfile', 'Edit Profile')}
                </Button>
              </Box>
            )}
          </CardContent>
        </Card>

        {/* Authentication Methods */}
        <Card elevation={3} sx={{ mb: 3, overflow: 'visible' }}>
          <CardContent sx={{ p: isMobile ? 2 : 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
              <Security sx={{ mr: 1.5, color: 'primary.main', fontSize: 28 }} />
              <Typography variant="h5" fontWeight="600">
                {t('profile.authenticationMethods', 'Authentication Methods')}
              </Typography>
            </Box>
            <Divider sx={{ mb: 3 }} />
            
            <Alert severity="info" icon={<Info />} sx={{ mb: 3 }}>
              <Typography variant="body2">
                {t('profile.authenticationMethodsDesc', 'Manage how you sign in to your account. We recommend having at least two methods for account recovery.')}
              </Typography>
            </Alert>
          
          {/* Current linked providers */}
          <Box sx={{ mb: 2 }}>
            {linkedProviders.includes('password') && (
              <Box sx={{ 
                display: 'flex', 
                alignItems: 'center', 
                mb: 2, 
                p: isMobile ? 1.5 : 2, 
                bgcolor: 'success.light', 
                color: 'success.contrastText',
                borderRadius: 2,
                border: '1px solid',
                borderColor: 'success.main'
              }}>
                <Email sx={{ mr: isMobile ? 1 : 2, fontSize: isMobile ? 28 : 32 }} />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
                    <Typography variant="body1" fontWeight="bold" sx={{ fontSize: isMobile ? '0.875rem' : '1rem' }}>
                      {t('profile.emailAndPassword', 'Email & Password')}
                    </Typography>
                    <CheckCircle sx={{ ml: 1, fontSize: 18 }} />
                  </Box>
                  <Typography variant="body2" sx={{ opacity: 0.9, fontSize: isMobile ? '0.75rem' : '0.875rem', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {backendService.auth.getAuthInstance().currentUser?.providerData?.find((p: any) => p.providerId === 'password')?.email || user?.email}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 0.5, ml: isMobile ? 0.5 : 1 }}>
                  <Button 
                    size="small" 
                    variant="outlined" 
                    onClick={() => setShowEmailUpdate(true)}
                    sx={{ 
                      fontSize: isMobile ? '0.7rem' : '0.8125rem',
                      px: isMobile ? 0.75 : 1,
                      py: isMobile ? 0.25 : 0.5,
                      minWidth: isMobile ? 'auto' : '64px',
                      borderColor: 'success.contrastText',
                      color: 'success.contrastText',
                      '&:hover': {
                        borderColor: 'success.contrastText',
                        bgcolor: 'rgba(255, 255, 255, 0.1)'
                      }
                    }}
                  >
                    {isMobile ? t('common.edit', 'Edit') : t('profile.updateEmail', 'Update Email')}
                  </Button>
                  <Button 
                    size="small" 
                    variant="outlined"
                    onClick={() => setShowPasswordUpdate(true)}
                    sx={{ 
                      fontSize: isMobile ? '0.7rem' : '0.8125rem',
                      px: isMobile ? 0.75 : 1,
                      py: isMobile ? 0.25 : 0.5,
                      minWidth: isMobile ? 'auto' : '64px',
                      borderColor: 'success.contrastText',
                      color: 'success.contrastText',
                      '&:hover': {
                        borderColor: 'success.contrastText',
                        bgcolor: 'rgba(255, 255, 255, 0.1)'
                      }
                    }}
                  >
                    {isMobile ? t('common.password', 'Pass') : t('profile.updatePassword', 'Update Password')}
                  </Button>
                  {linkedProviders.length > 1 && (
                    <Button 
                      size="small" 
                      variant="contained"
                      startIcon={!isMobile && <Close />}
                      onClick={() => setConfirmUnlinkProvider('password')}
                      sx={{ 
                        fontSize: isMobile ? '0.7rem' : '0.8125rem',
                        px: isMobile ? 0.75 : 1,
                        py: isMobile ? 0.25 : 0.5,
                        minWidth: isMobile ? 'auto' : '64px',
                        bgcolor: 'error.main',
                        color: 'white',
                        '&:hover': {
                          bgcolor: 'error.dark'
                        }
                      }}
                    >
                      {isMobile ? <Close fontSize="small" /> : t('common.remove', 'Remove')}
                    </Button>
                  )}
                </Box>
              </Box>
            )}
            
            {linkedProviders.includes('phone') && (
              <Box sx={{ 
                display: 'flex', 
                alignItems: 'center', 
                mb: 2, 
                p: isMobile ? 1.5 : 2, 
                bgcolor: 'success.light',
                color: 'success.contrastText',
                borderRadius: 2,
                border: '1px solid',
                borderColor: 'success.main'
              }}>
                <Phone sx={{ mr: isMobile ? 1 : 2, fontSize: isMobile ? 28 : 32 }} />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
                    <Typography variant="body1" fontWeight="bold" sx={{ fontSize: isMobile ? '0.875rem' : '1rem' }}>
                      {t('profile.phoneNumber', 'Phone Number')}
                    </Typography>
                    <CheckCircle sx={{ ml: 1, fontSize: 18 }} />
                  </Box>
                  <Typography variant="body2" sx={{ opacity: 0.9, fontSize: isMobile ? '0.75rem' : '0.875rem', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user?.phoneNumber}</Typography>
                </Box>
                <Box sx={{ display: 'flex', gap: 0.5, ml: isMobile ? 0.5 : 1 }}>
                  <Button 
                    size="small" 
                    variant="outlined" 
                    onClick={() => setShowPhoneUpdate(true)}
                    sx={{ 
                      fontSize: isMobile ? '0.7rem' : '0.8125rem',
                      px: isMobile ? 0.75 : 1,
                      py: isMobile ? 0.25 : 0.5,
                      minWidth: isMobile ? 'auto' : '64px',
                      borderColor: 'success.contrastText',
                      color: 'success.contrastText',
                      '&:hover': {
                        borderColor: 'success.contrastText',
                        bgcolor: 'rgba(255, 255, 255, 0.1)'
                      }
                    }}
                  >
                    {isMobile ? t('common.edit', 'Edit') : t('profile.update', 'Update')}
                  </Button>
                  {linkedProviders.length > 1 && (
                    <Button 
                      size="small" 
                      variant="contained"
                      startIcon={!isMobile && <Close />}
                      onClick={() => setConfirmUnlinkProvider('phone')}
                      sx={{ 
                        fontSize: isMobile ? '0.7rem' : '0.8125rem',
                        px: isMobile ? 0.75 : 1,
                        py: isMobile ? 0.25 : 0.5,
                        minWidth: isMobile ? 'auto' : '64px',
                        bgcolor: 'error.main',
                        color: 'white',
                        '&:hover': {
                          bgcolor: 'error.dark'
                        }
                      }}
                    >
                      {isMobile ? <Close fontSize="small" /> : t('common.remove', 'Remove')}
                    </Button>
                  )}
                </Box>
              </Box>
            )}
            
            {linkedProviders.includes('google.com') && (
              <Box sx={{ 
                display: 'flex', 
                alignItems: 'center', 
                mb: 2, 
                p: isMobile ? 1.5 : 2, 
                bgcolor: 'success.light',
                color: 'success.contrastText',
                borderRadius: 2,
                border: '1px solid',
                borderColor: 'success.main'
              }}>
                <Google sx={{ mr: isMobile ? 1 : 2, fontSize: isMobile ? 28 : 32 }} />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
                    <Typography variant="body1" fontWeight="bold" sx={{ fontSize: isMobile ? '0.875rem' : '1rem' }}>
                      {t('profile.google', 'Google')}
                    </Typography>
                    <CheckCircle sx={{ ml: 1, fontSize: 18 }} />
                  </Box>
                  <Typography variant="body2" sx={{ opacity: 0.9, fontSize: isMobile ? '0.75rem' : '0.875rem', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {backendService.auth.getAuthInstance().currentUser?.providerData?.find((p: any) => p.providerId === 'google.com')?.email || user?.email}
                  </Typography>
                </Box>
              </Box>
            )}
          </Box>

          {/* Recovery Methods Recommendations */}
          <Box sx={{ mb: 3 }}>
            <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 2 }}>
              {t('profile.addRecoveryMethods', 'Add Recovery Methods')}
            </Typography>
            
            {/* Add phone if user doesn't have it */}
            {!linkedProviders.includes('phone') && !showPhoneAdd && (
              <Alert severity="info" icon={<Info />} sx={{ mb: 2 }}>
                <Typography variant="body2" fontWeight="bold" sx={{ mb: 0.5 }}>
                  {t('profile.addPhoneNumber', 'Add Phone Number for Recovery')}
                </Typography>
                <Typography variant="body2" sx={{ mb: 1.5 }}>
                  {t('profile.addPhoneNumberDesc', 'Add a phone number to recover your account if you lose access to your email.')}
                </Typography>
                <Button 
                  size="small" 
                  variant="contained" 
                  startIcon={<Add />}
                  onClick={() => setShowPhoneAdd(true)}
                >
                  {t('profile.addPhoneNumber', 'Add Phone Number')}
                </Button>
              </Alert>
            )}

            {/* Add email/password if phone-only user */}
            {linkedProviders.includes('phone') && !linkedProviders.includes('password') && !showEmailPasswordAdd && (
              <Alert severity="warning" icon={<Warning />} sx={{ mb: 2 }}>
                <Typography variant="body2" fontWeight="bold" sx={{ mb: 0.5 }}>
                  {t('profile.addBackupAuthMethod', 'Add Email & Password for Recovery')}
                </Typography>
                <Typography variant="body2" sx={{ mb: 1.5 }}>
                  {t('profile.addBackupAuthMethodDesc', "You're currently using phone authentication only. Add email and password as a backup in case you lose access to your phone number.")}
                </Typography>
                <Button 
                  size="small" 
                  variant="contained" 
                  startIcon={<Add />}
                  onClick={() => setShowEmailPasswordAdd(true)}
                >
                  {t('profile.addEmailAndPassword', 'Add Email & Password')}
                </Button>
              </Alert>
            )}
          </Box>

          {/* Phone Add Form */}
          {showPhoneAdd && (
            <Box sx={{ mt: 2, p: 3, bgcolor: 'background.paper', borderRadius: 2, border: '2px solid', borderColor: 'primary.main' }}>
              <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
                {t('profile.addPhoneNumberTitle', 'Add Phone Number')}
              </Typography>
              
              <Alert severity="info" sx={{ mb: 2 }}>
                <Typography variant="body2">
                  {t('profile.addPhoneNumberInfo', "You'll need to verify your phone number with an SMS code.")}
                </Typography>
              </Alert>

              <PhoneAuth 
                onSuccess={handlePhoneAdd}
                onError={(err) => setError(err)}
                mode="link"
              />

              <Button
                variant="text"
                onClick={() => {
                  setShowPhoneAdd(false);
                  setError(null);
                }}
                sx={{ mt: 1 }}
              >
                {t('common.cancel', 'Cancel')}
              </Button>
            </Box>
          )}

          {/* Email/Password Add Form */}
          {showEmailPasswordAdd && (
            <Box sx={{ mt: 2, p: 3, bgcolor: 'background.paper', borderRadius: 2, border: '2px solid', borderColor: 'primary.main' }}>
              <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
                {t('profile.addEmailPasswordAuth', 'Add Email & Password Authentication')}
              </Typography>
              
              {error && (
                <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
                  {error}
                </Alert>
              )}
              
              <TextField
                fullWidth
                label={t('auth.email', 'Email Address')}
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                disabled={authMethodsLoading}
                sx={{ mb: 2 }}
              />

              <TextField
                fullWidth
                label={t('auth.password', 'Password')}
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                disabled={authMethodsLoading}
                sx={{ mb: 1 }}
              />

              {newPassword && (
                <>
                  <PasswordStrengthIndicator password={newPassword} />
                  <PasswordRequirements password={newPassword} />
                </>
              )}

              <TextField
                fullWidth
                label={t('auth.confirmPassword', 'Confirm Password')}
                type="password"
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
                disabled={authMethodsLoading}
                sx={{ mb: 2 }}
              />

              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button
                  variant="contained"
                  onClick={handleAddEmailPassword}
                  disabled={authMethodsLoading || !newEmail || !newPassword || !confirmNewPassword}
                >
                  {authMethodsLoading ? t('profile.adding', 'Adding...') : t('profile.addAuthentication', 'Add Authentication')}
                </Button>
                <Button
                  variant="outlined"
                  onClick={() => {
                    setShowEmailPasswordAdd(false);
                    setNewEmail('');
                    setNewPassword('');
                    setConfirmNewPassword('');
                    setError(null);
                  }}
                  disabled={authMethodsLoading}
                >
                  {t('common.cancel', 'Cancel')}
                </Button>
              </Box>
            </Box>
          )}

          {/* Email Update Form */}
          {showEmailUpdate && (
            <Box sx={{ mt: 2, p: 3, bgcolor: 'background.paper', borderRadius: 2, border: '2px solid', borderColor: 'primary.main' }}>
              <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
                {t('profile.updateEmailTitle', 'Update Email Address')}
              </Typography>
              
              {error && (
                <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
                  {error}
                </Alert>
              )}
              
              <Alert severity="info" sx={{ mb: 2 }}>
                <Typography variant="body2">
                  {t('profile.updateEmailInfo', "A verification email will be sent to your new address. You'll need to click the link to complete the change.")}
                </Typography>
              </Alert>

              <TextField
                fullWidth
                label={t('profile.newEmailAddress', 'New Email Address')}
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                disabled={authMethodsLoading}
                sx={{ mb: 2 }}
              />

              <TextField
                fullWidth
                label={t('profile.currentPassword', 'Current Password')}
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                disabled={authMethodsLoading}
                helperText={t('profile.currentPasswordHelper', 'Required to verify your identity')}
                sx={{ mb: 2 }}
              />

              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button
                  variant="contained"
                  onClick={handleUpdateEmail}
                  disabled={authMethodsLoading || !newEmail || !currentPassword}
                >
                  {authMethodsLoading ? t('profile.updating', 'Updating...') : t('profile.updateEmailAction', 'Update Email')}
                </Button>
                <Button
                  variant="outlined"
                  onClick={() => {
                    setShowEmailUpdate(false);
                    setNewEmail('');
                    setCurrentPassword('');
                    setError(null);
                  }}
                  disabled={authMethodsLoading}
                >
                  {t('common.cancel', 'Cancel')}
                </Button>
              </Box>
            </Box>
          )}

          {/* Password Update Form */}
          {showPasswordUpdate && (
            <Box sx={{ mt: 2, p: 3, bgcolor: 'background.paper', borderRadius: 2, border: '2px solid', borderColor: 'primary.main' }}>
              <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
                {t('profile.updatePasswordTitle', 'Update Password')}
              </Typography>
              
              {error && (
                <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
                  {error}
                </Alert>
              )}
              
              <TextField
                fullWidth
                label={t('profile.currentPassword', 'Current Password')}
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                disabled={authMethodsLoading}
                sx={{ mb: 2 }}
              />

              <TextField
                fullWidth
                label={t('profile.newPassword', 'New Password')}
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                disabled={authMethodsLoading}
                sx={{ mb: 1 }}
              />

              {newPassword && (
                <>
                  <PasswordStrengthIndicator password={newPassword} />
                  <PasswordRequirements password={newPassword} />
                </>
              )}

              <TextField
                fullWidth
                label={t('profile.confirmNewPassword', 'Confirm New Password')}
                type="password"
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
                disabled={authMethodsLoading}
                sx={{ mb: 2 }}
              />

              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button
                  variant="contained"
                  onClick={handleUpdatePassword}
                  disabled={authMethodsLoading || !currentPassword || !newPassword || !confirmNewPassword}
                >
                  {authMethodsLoading ? t('profile.updating', 'Updating...') : t('profile.updatePasswordAction', 'Update Password')}
                </Button>
                <Button
                  variant="outlined"
                  onClick={() => {
                    setShowPasswordUpdate(false);
                    setNewPassword('');
                    setConfirmNewPassword('');
                    setCurrentPassword('');
                    setError(null);
                  }}
                  disabled={authMethodsLoading}
                >
                  {t('common.cancel', 'Cancel')}
                </Button>
              </Box>
            </Box>
          )}

          {/* Phone Update Form */}
          {showPhoneUpdate && (
            <Box sx={{ mt: 2, p: 3, bgcolor: 'background.paper', borderRadius: 2, border: '2px solid', borderColor: 'primary.main' }}>
              <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
                {t('profile.updatePhoneNumberTitle', 'Update Phone Number')}
              </Typography>
              
              <Alert severity="info" sx={{ mb: 2 }}>
                <Typography variant="body2">
                  {t('profile.updatePhoneNumberInfo', "You'll need to verify your new phone number with an SMS code.")}
                </Typography>
              </Alert>

              <PhoneAuth 
                onSuccess={handlePhoneUpdate}
                onError={(err) => setError(err)}
                mode="link"
              />

              <Button
                variant="text"
                onClick={() => {
                  setShowPhoneUpdate(false);
                  setError(null);
                }}
                sx={{ mt: 1 }}
              >
                {t('common.cancel', 'Cancel')}
              </Button>
            </Box>
          )}
          </CardContent>
        </Card>

        {/* Unlock Methods Section */}
        <Card elevation={3} sx={{ mb: 3, overflow: 'visible' }}>
          <CardContent sx={{ p: isMobile ? 2 : 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
              <Security sx={{ mr: 1.5, color: 'primary.main', fontSize: 28 }} />
              <Typography variant="h5" fontWeight="600">
                {t('profile.unlockMethods', 'Unlock Methods')}
              </Typography>
            </Box>
            <Divider sx={{ mb: 3 }} />

            <Alert severity="info" icon={<Info />} sx={{ mb: 3 }}>
              <Typography variant="body2">
                {t('profile.unlockMethodsDesc', 'Set up different ways to unlock your encrypted data. You can use passphrases, device biometrics, or physical security keys.')}
              </Typography>
            </Alert>

            {/* Device Capability Information */}
            <Accordion sx={{ mb: 2, boxShadow: 'none', border: '1px solid', borderColor: 'divider' }}>
              <AccordionSummary expandIcon={<ExpandMore />}>
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <Info sx={{ mr: 1.5, color: 'info.main' }} />
                  <Typography variant="subtitle1" fontWeight="600">
                    {t('profile.deviceCapabilities', 'Device Capabilities')}
                  </Typography>
                </Box>
              </AccordionSummary>
              <AccordionDetails>
                <DeviceCapabilityInfo />
              </AccordionDetails>
            </Accordion>

            {/* Quick Biometric Unlock (Local) */}
            <Accordion defaultExpanded sx={{ mb: 2, boxShadow: 'none', border: '1px solid', borderColor: 'divider' }}>
              <AccordionSummary expandIcon={<ExpandMore />}>
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <Fingerprint sx={{ mr: 1.5, color: 'primary.main' }} />
                  <Typography variant="subtitle1" fontWeight="600">
                    {t('profile.quickBiometricUnlock', 'Quick Biometric Unlock (This Device Only)')}
                  </Typography>
                </Box>
              </AccordionSummary>
              <AccordionDetails>
                <Box id="biometric">
                  <Alert severity="info" sx={{ mb: 2, fontSize: '0.875rem' }}>
                    <Typography variant="body2" fontWeight="600" gutterBottom>
                      {t('profile.quickBiometricInfo', 'Fast unlock for this device')}
                    </Typography>
                    <Typography variant="body2">
                      {t('profile.quickBiometricDesc', 'Store your encrypted key locally on this device only. Use fingerprint or Face ID to unlock quickly without typing your passphrase. This is device-specific and not synced.')}
                    </Typography>
                  </Alert>
                  <BiometricSetup />
                </Box>
              </AccordionDetails>
            </Accordion>

            {/* Physical Keys & Device Passkeys */}
            <Accordion defaultExpanded sx={{ mb: 2, boxShadow: 'none', border: '1px solid', borderColor: 'divider' }}>
              <AccordionSummary expandIcon={<ExpandMore />}>
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <Security sx={{ mr: 1.5, color: 'primary.main' }} />
                  <Typography variant="subtitle1" fontWeight="600">
                    {t('profile.securityKeysAndPasskeys', 'Physical Security Keys & Device Passkeys')}
                  </Typography>
                </Box>
              </AccordionSummary>
              <AccordionDetails>
                <Alert severity="info" sx={{ mb: 2, fontSize: '0.875rem' }}>
                  <Typography variant="body2" fontWeight="600" gutterBottom>
                    {t('profile.securityKeysInfo', 'Advanced unlock methods for multiple devices')}
                  </Typography>
                  <Box component="ul" sx={{ mt: 1, mb: 0, pl: 2 }}>
                    <li>
                      <Typography variant="body2" component="span" fontWeight="600">
                        Physical Security Keys:{' '}
                      </Typography>
                      <Typography variant="body2" component="span">
                        YubiKey, Google Titan, or similar USB/NFC devices you insert or tap
                      </Typography>
                    </li>
                    <li>
                      <Typography variant="body2" component="span" fontWeight="600">
                        Device Passkeys:{' '}
                      </Typography>
                      <Typography variant="body2" component="span">
                        Built-in biometrics (Face ID, Touch ID, Windows Hello) that sync via iCloud or Google
                      </Typography>
                    </li>
                  </Box>
                </Alert>
                <HardwareKeySetup onEncryptedKeyChange={() => {
                  if (user) fetchProfile(user as User);
                }} />
              </AccordionDetails>
            </Accordion>
          </CardContent>
        </Card>

        {/* Encryption Key Management Section */}
        <Card elevation={3} sx={{ mb: 3, overflow: 'visible' }}>
          <CardContent sx={{ p: isMobile ? 2 : 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
              <VpnKey sx={{ mr: 1.5, color: 'warning.main', fontSize: 28 }} />
              <Typography variant="h5" fontWeight="600">
                {t('profile.encryptionKeyManagement', 'Encryption Key Management')}
              </Typography>
            </Box>
            <Divider sx={{ mb: 3 }} />

            <Alert severity="warning" icon={<Warning />} sx={{ mb: 3 }}>
              <Typography variant="body2">
                {t('profile.keyManagementWarning', 'Manage your encryption keys carefully. Losing access to your keys means permanent data loss.')}
              </Typography>
            </Alert>

            <KeyManagementSection
              userProfile={userProfile}
              privateKey={privateKey}
              onDownloadKey={() => handleDownloadKey(userProfile, setError)}
              onDownloadDecryptedKey={() => setShowDecryptedKeyWarning(true)}
            />
          </CardContent>
        </Card>

        {/* JSON Import */}
        <Card elevation={3} sx={{ mb: 3, overflow: 'visible' }}>
          <CardContent sx={{ p: isMobile ? 2 : 3 }}>
            <JsonImport />
          </CardContent>
        </Card>

        {/* Storage Maintenance */}
        <Card elevation={3} sx={{ mb: 3, overflow: 'visible' }}>
          <CardContent sx={{ p: isMobile ? 2 : 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
              <Storage sx={{ mr: 1.5, color: 'info.main', fontSize: 28 }} />
              <Typography variant="h6" fontWeight="600">
                {t('profile.storageMaintenance', 'Storage Maintenance')}
              </Typography>
            </Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {t('profile.storageMaintenanceDesc', 'Clean up orphaned files and optimize your storage space. Remove attachment files that are no longer associated with forms and fix files with invalid metadata.')}
            </Typography>
            <Button
              variant="outlined"
              color="primary"
              onClick={() => navigate('/cleanup')}
              startIcon={<Storage />}
            >
              {t('profile.openStorageMaintenance', 'Open Storage Maintenance')}
            </Button>
          </CardContent>
        </Card>

        {/* Danger Zone - Export & Delete */}
        <Card elevation={3} sx={{ mb: 3, overflow: 'visible', border: '3px solid', borderColor: 'error.main' }}>
          <CardContent sx={{ p: isMobile ? 2 : 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
              <DeleteForever sx={{ mr: 1.5, color: 'error.main', fontSize: 28 }} />
              <Typography variant="h5" fontWeight="600" color="error">
                {t('profile.dangerZone', 'Danger Zone')}
              </Typography>
            </Box>
            <Divider sx={{ mb: 3 }} />
          
          {/* Export All Data */}
          <Box sx={{ mb: 3, pb: 3, borderBottom: '1px solid', borderColor: 'divider' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
              <Download sx={{ mr: 1, color: 'warning.main' }} />
              <Typography variant="h6" fontWeight="bold">
                {t('profile.exportAllData', 'Export All Data (Unencrypted)')}
              </Typography>
            </Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1, ml: 4 }}>
              {t('profile.exportDataDesc', 'Download all your files and data in unencrypted format. Files will be decrypted and saved in a ZIP file.')}
            </Typography>
            <Typography variant="body2" color="warning.main" fontWeight="500" sx={{ mb: 2, ml: 4 }}>
              {t('profile.exportReimportNote', '⚠️ You can re-import this ZIP file later - it will be re-encrypted with your passphrase.')}
            </Typography>
            <Box sx={{ ml: 4 }}>
              <Button 
                variant="contained" 
                color="warning"
                startIcon={<Download />}
                onClick={() => setExportDialogOpen(true)}
                disabled={!privateKey}
                size="large"
              >
                {t('profile.exportAllData', 'Export All Data (Unencrypted)')}
              </Button>
              {!privateKey && (
                <Typography variant="caption" color="error" display="block" sx={{ mt: 1 }}>
                  {t('profile.unlockKeyRequired', 'Please unlock your private key first')}
                </Typography>
              )}
            </Box>
          </Box>

          {/* Delete Account */}
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
              <DeleteForever sx={{ mr: 1, color: 'error.main' }} />
              <Typography variant="h6" fontWeight="bold" color="error">
                {t('profile.deleteAccount', 'Delete My Account')}
              </Typography>
            </Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2, ml: 4 }}>
              {t('profile.deleteWarning', 'Once you delete your account, there is no going back. All your data will be permanently deleted.')}
            </Typography>
            <Box sx={{ ml: 4 }}>
              <Button 
                variant="contained" 
                color="error"
                startIcon={<DeleteForever />}
                onClick={() => setDeleteDialogOpen(true)}
                size="large"
              >
                {t('profile.deleteAccount', 'Delete My Account')}
              </Button>
            </Box>
          </Box>
          </CardContent>
        </Card>

      </Box>
      
      <ExportDataDialog
        open={exportDialogOpen}
        onClose={() => setExportDialogOpen(false)}
        onConfirm={handleExportData}
      />
      
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
      
      {/* Success Snackbar */}
      <Snackbar
        open={!!successMessage}
        autoHideDuration={6000}
        onClose={() => setSuccessMessage('')}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={() => setSuccessMessage('')} severity="success" sx={{ width: '100%' }}>
          {successMessage}
        </Alert>
      </Snackbar>
      
      {/* Error Snackbar */}
      <Snackbar
        open={!!error && !showEmailPasswordAdd && !showEmailUpdate && !showPasswordUpdate}
        autoHideDuration={8000}
        onClose={() => setError(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={() => setError(null)} severity="error" sx={{ width: '100%' }}>
          {error}
        </Alert>
      </Snackbar>
      
      {/* Confirm Unlink Provider Dialog */}
      <Dialog
        open={!!confirmUnlinkProvider}
        onClose={() => setConfirmUnlinkProvider(null)}
      >
        <DialogTitle>{t('profile.removeAuthMethod', 'Remove Authentication Method')}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {confirmUnlinkProvider === 'password' && t('profile.confirmRemoveEmailPassword', 'Are you sure you want to remove email/password authentication? You will still be able to sign in with your other authentication methods.')}
            {confirmUnlinkProvider === 'phone' && t('profile.confirmRemovePhone', 'Are you sure you want to remove phone authentication? You will still be able to sign in with your other authentication methods.')}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmUnlinkProvider(null)}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button 
            onClick={() => confirmUnlinkProvider && handleUnlinkProvider(confirmUnlinkProvider)} 
            color="error"
            variant="contained"
            disabled={authMethodsLoading}
          >
            {authMethodsLoading ? t('profile.removing', 'Removing...') : t('common.remove', 'Remove')}
          </Button>
        </DialogActions>
      </Dialog>
      
      {/* KeyRegenerationWarningDialog hidden */}
      </>
  );
};

export default ProfilePage;