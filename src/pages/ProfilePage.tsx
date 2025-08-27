import React, { useState, useEffect } from 'react';
import { Box, Typography, CircularProgress, Button, TextField, Paper, Container, Alert, Switch, FormControlLabel } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { getUserProfile, createUserProfile, type UserProfile } from '../firestore';
import { generateKeyPair, encryptString, bytesToHex } from '../crypto/postQuantumCrypto';
import AppLayout from '../components/AppLayout';
import BiometricSetup from '../components/BiometricSetup';
import DeviceCapabilityInfo from '../components/DeviceCapabilityInfo';
import { useThemeContext } from '../theme/ThemeContext';

const ProfilePage: React.FC = () => {
  const { user } = useAuth();
  const { setMode } = useThemeContext();
  const navigate = useNavigate();
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [passphrase, setPassphrase] = useState('');
  const [confirmPassphrase, setConfirmPassphrase] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [currentFolder, setCurrentFolder] = useState<string | null>(null);

  // Handle folder navigation by redirecting to main documents page
  const handleFolderNavigation = (folderId: string | null) => {
    navigate(`/?folder=${folderId || ''}`);
  };

  useEffect(() => {
    const fetchProfile = async () => {
      if (user) {
        const profile = await getUserProfile(user.uid);
        setUserProfile(profile);
        if (profile) {
          setDisplayName(profile.displayName);
          setTheme(profile.theme);
        } else if (user.displayName) {
          setDisplayName(user.displayName);
        }
      }
      setLoading(false);
    };
    fetchProfile();
  }, [user]);

  const handleGenerateKeys = async () => {
    setError(null);
    if (passphrase !== confirmPassphrase) {
      setError('Passphrases do not match');
      return;
    }
    if (!user) {
      setError('User not authenticated');
      return;
    }
    if (!displayName) {
      setError('Display name is required');
      return;
    }

    try {
      setLoading(true);
      const { publicKey, privateKey } = generateKeyPair();

      const encryptedPrivateKey = encryptString(bytesToHex(privateKey), passphrase);

      const newUserProfile: UserProfile = {
        displayName,
        email: user.email || '',
        theme: 'light',
        publicKey: bytesToHex(publicKey),
        encryptedPrivateKey,
      };

      await createUserProfile(user.uid, newUserProfile);
      setUserProfile(newUserProfile);
    } catch (err) {
      console.error(err);
      setError('Failed to generate keys. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleProfileUpdate = async () => {
    if (!user || !userProfile) {
      return;
    }
    const updatedProfile: UserProfile = {
      ...userProfile,
      displayName,
      theme,
    };
    await createUserProfile(user.uid, updatedProfile);
    setUserProfile(updatedProfile);
    setMode(theme);
    setEditMode(false);
  };

  if (loading) {
    return (
      <AppLayout>
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
          <CircularProgress />
        </Box>
      </AppLayout>
    );
  }

  if (!userProfile || !userProfile.publicKey || (!userProfile.encryptedPrivateKey && !userProfile.legacyEncryptedPrivateKey)) {
    return (
      <AppLayout currentFolder={currentFolder} setCurrentFolder={handleFolderNavigation}>
        <Container component="main" maxWidth="sm">
          <Paper elevation={3} sx={{ padding: 4, marginTop: 8, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <Typography component="h1" variant="h5">
              {userProfile ? 'Regenerate Your Secure Key Pair' : 'Create Your Secure Key Pair'}
            </Typography>
            <Typography variant="body1" sx={{ mt: 2, mb: 2 }}>
              {userProfile 
                ? 'Your account needs updated post-quantum secure keys. Please regenerate your key pair with a strong passphrase.'
                : 'To secure your documents, you need to generate a post-quantum secure key pair. Please enter a display name and a strong passphrase to encrypt your private key.'
              }
            </Typography>
            {error && <Alert severity="error" sx={{ mt: 2, width: '100%' }}>{error}</Alert>}
            <TextField
              margin="normal"
              required
              fullWidth
              id="displayName"
              label="Display Name"
              name="displayName"
              autoFocus
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
            <TextField
              margin="normal"
              required
              fullWidth
              name="passphrase"
              label="Passphrase"
              type="password"
              id="passphrase"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
            />
            <TextField
              margin="normal"
              required
              fullWidth
              name="confirmPassphrase"
              label="Confirm Passphrase"
              type="password"
              id="confirmPassphrase"
              value={confirmPassphrase}
              onChange={(e) => setConfirmPassphrase(e.target.value)}
            />
            <Button
              type="submit"
              fullWidth
              variant="contained"
              sx={{ mt: 3, mb: 2 }}
              onClick={handleGenerateKeys}
            >
              Generate Keys
            </Button>
          </Paper>
        </Container>
      </AppLayout>
    );
  }

  return (
    <AppLayout currentFolder={currentFolder} setCurrentFolder={handleFolderNavigation}>
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
                <Button onClick={handleProfileUpdate} variant="contained" sx={{ mr: 1 }}>Save</Button>
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

        {/* Device Capability Information */}
        <DeviceCapabilityInfo />

        {/* Biometric Authentication Setup */}
        <BiometricSetup />
      </Box>
    </AppLayout>
  );
};

export default ProfilePage;
