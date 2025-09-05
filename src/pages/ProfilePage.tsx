import React, { useState, useEffect } from 'react';
import { Box, Typography, CircularProgress, Button, TextField, Paper, Container, Alert, Switch, FormControlLabel, Chip, LinearProgress } from '@mui/material';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { usePassphrase } from '../auth/PassphraseContext';
import { getUserProfile, createUserProfile, type UserProfile } from '../firestore';
import { generateKeyPair as generateHPKEKeyPair, bytesToHex, decryptString } from '../crypto/hpkeCrypto';
import { encryptString } from '../crypto/hpkeCrypto';
import AppLayout from '../components/AppLayout';
import BiometricSetup from '../components/BiometricSetup';
import DeviceCapabilityInfo from '../components/DeviceCapabilityInfo';
import DecryptedKeyWarningDialog from '../components/DecryptedKeyWarningDialog';
import KeyRegenerationWarningDialog from '../components/KeyRegenerationWarningDialog';
import { useThemeContext } from '../theme/ThemeContext';
import { migrateUserFiles } from '../services/keyMigration';
import { debugUserData, testCountFunction } from '../services/debugMigration';

const ProfilePage: React.FC = () => {
  const { user } = useAuth();
  const { setMode } = useThemeContext();
  const { privateKey } = usePassphrase();
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
  const [showKeyRegeneration, setShowKeyRegeneration] = useState(false);
  const [showDecryptedKeyWarning, setShowDecryptedKeyWarning] = useState(false);
  const [showRegenerationWarning, setShowRegenerationWarning] = useState(false);
  const [migrationProgress, setMigrationProgress] = useState<{ current: number; total: number } | null>(null);

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
      const { publicKey, privateKey } = await generateHPKEKeyPair();

      const encryptedPrivateKey = await encryptString(bytesToHex(privateKey), passphrase);

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

  // Detect current encryption method
  const getEncryptionMethod = (): 'HPKE' | 'ML-KEM768' | 'Legacy' => {
    if (!userProfile) return 'Legacy';
    
    // Check if public key is HPKE format (32 bytes = 64 hex chars) vs ML-KEM768 (1184 bytes = 2368 hex chars)
    if (userProfile.publicKey && userProfile.publicKey.length === 64) {
      return 'HPKE';
    } else if (userProfile.publicKey && userProfile.publicKey.length > 1000) {
      return 'ML-KEM768';
    }
    return 'Legacy';
  };

  const handleRegenerateKeys = async () => {
    if (!showKeyRegeneration) {
      setShowKeyRegeneration(true);
      return;
    }
    
    // Show the warning dialog first
    setShowRegenerationWarning(true);
  };

  const handleConfirmRegeneration = async (migrateFiles: boolean) => {
    setShowRegenerationWarning(false);
    
    if (!user) {
      setError('User not authenticated');
      return;
    }

    if (!displayName || !passphrase || passphrase !== confirmPassphrase) {
      setError('Please fill in all fields correctly');
      return;
    }

    try {
      setLoading(true);
      
      // Store old private key if we need to migrate
      let oldPrivateKey: string | null = null;
      if (migrateFiles && privateKey) {
        oldPrivateKey = privateKey;
      }

      // Generate new key pair
      const { publicKey, privateKey: newPrivateKey } = await generateHPKEKeyPair();
      const encryptedPrivateKey = await encryptString(bytesToHex(newPrivateKey), passphrase);

      // If migration is needed and we have the old key, migrate files
      if (migrateFiles && oldPrivateKey) {
        setMigrationProgress({ current: 0, total: 1 });
        
        try {
          const migrationResult = await migrateUserFiles(
            user.uid,
            oldPrivateKey,
            publicKey,
            (current, total) => setMigrationProgress({ current, total })
          );

          console.log(`Migration completed: ${migrationResult.success} files migrated, ${migrationResult.failed.length} failed`);
          
          if (migrationResult.failed.length > 0) {
            setError(`Key regenerated successfully, but ${migrationResult.failed.length} files could not be migrated. Check console for details.`);
          }
        } catch (migrationError) {
          console.error('Migration failed:', migrationError);
          setError('Key generation succeeded, but file migration failed. Some files may be inaccessible.');
        }
        
        setMigrationProgress(null);
      }

      // Save the new profile
      const newUserProfile: UserProfile = {
        displayName,
        email: user.email || '',
        theme,
        publicKey: bytesToHex(publicKey),
        encryptedPrivateKey,
      };

      await createUserProfile(user.uid, newUserProfile);
      setUserProfile(newUserProfile);
      
      // Reset form
      setShowKeyRegeneration(false);
      setPassphrase('');
      setConfirmPassphrase('');
      
      if (!migrateFiles || !oldPrivateKey) {
        setError(null);
      }
      
    } catch (err) {
      console.error(err);
      setError('Failed to regenerate keys. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleCancelRegeneration = () => {
    setShowKeyRegeneration(false);
    setPassphrase('');
    setConfirmPassphrase('');
    setError(null);
  };

  const handleDownloadKey = async () => {
    if (!userProfile?.encryptedPrivateKey) {
      setError('No private key available for download');
      return;
    }

    try {
      // Create a downloadable file containing the encrypted private key
      const keyData = {
        version: "1.0",
        keyType: "HPKE_X25519",
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
      link.download = `${userProfile.displayName.replace(/[^a-zA-Z0-9]/g, '_')}_hpke_key.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading key:', error);
      setError('Failed to download key file');
    }
  };

  const handleDownloadDecryptedKey = async () => {
    if (!privateKey) {
      setError('Private key is not currently decrypted. Please unlock your key first.');
      return;
    }

    if (!userProfile) {
      setError('User profile not available');
      return;
    }

    // Show React warning dialog
    setShowDecryptedKeyWarning(true);
  };

  const handleConfirmDecryptedKeyDownload = async () => {
    setShowDecryptedKeyWarning(false);
    
    if (!privateKey || !userProfile) return;

    try {
      // Create a downloadable file with the decrypted private key
      const keyData = {
        version: "1.0",
        keyType: "HPKE_X25519_DECRYPTED",
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
      link.download = `${userProfile.displayName.replace(/[^a-zA-Z0-9]/g, '_')}_hpke_private_key_DECRYPTED.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading decrypted key:', error);
      setError('Failed to download decrypted key file');
    }
  };

  // DEBUG: Temporary functions for testing
  const handleDebugUserData = async () => {
    if (user) {
      await debugUserData(user.uid);
    }
  };

  const handleTestCount = async () => {
    if (user) {
      await testCountFunction(user.uid);
    }
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

        {/* Encryption Status and Upgrade */}
        <Paper elevation={2} sx={{ p: 3, mb: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6">Encryption Settings</Typography>
            <Button 
              component={Link} 
              to="/security" 
              variant="outlined" 
              size="small"
            >
              Learn More About Security
            </Button>
          </Box>
          <Box sx={{ mb: 2 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Current encryption method:
            </Typography>
            <Chip 
              label={getEncryptionMethod()}
              color={getEncryptionMethod() === 'HPKE' ? 'success' : getEncryptionMethod() === 'ML-KEM768' ? 'warning' : 'error'}
              sx={{ mr: 1 }}
            />
            {getEncryptionMethod() === 'HPKE' && (
              <Typography variant="body2" color="success.main" sx={{ mt: 1 }}>
                ✓ You're using the latest HPKE encryption standard
              </Typography>
            )}
            {getEncryptionMethod() === 'ML-KEM768' && (
              <Typography variant="body2" color="warning.main" sx={{ mt: 1 }}>
                Consider upgrading to HPKE for better file sharing capabilities
              </Typography>
            )}
            {getEncryptionMethod() === 'Legacy' && (
              <Typography variant="body2" color="error.main" sx={{ mt: 1 }}>
                Your encryption keys need to be updated for security
              </Typography>
            )}
          </Box>
          
          <Box>
            {!showKeyRegeneration ? (
              <Button 
                variant="contained" 
                color={getEncryptionMethod() === 'HPKE' ? 'primary' : getEncryptionMethod() === 'Legacy' ? 'error' : 'warning'}
                onClick={() => setShowKeyRegeneration(true)}
              >
                {getEncryptionMethod() === 'HPKE' ? 'Regenerate HPKE Keys' : getEncryptionMethod() === 'Legacy' ? 'Generate New Keys' : 'Upgrade to HPKE'}
              </Button>
            ) : (
              <Box sx={{ p: 2, bgcolor: 'background.default', borderRadius: 1 }}>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  <strong>Important:</strong> {getEncryptionMethod() === 'HPKE' ? 'Regenerating your HPKE keys will replace your current encryption keys.' : 'Regenerating your keys will create new HPKE encryption keys.'} 
                  {' '}This will affect access to your existing files. You'll be prompted to choose how to handle them.
                </Typography>
                <TextField
                  margin="normal"
                  required
                  fullWidth
                  name="passphrase"
                  label="New Passphrase"
                  type="password"
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                  sx={{ mb: 1 }}
                />
                <TextField
                  margin="normal"
                  required
                  fullWidth
                  name="confirmPassphrase"
                  label="Confirm New Passphrase"
                  type="password"
                  value={confirmPassphrase}
                  onChange={(e) => setConfirmPassphrase(e.target.value)}
                  sx={{ mb: 2 }}
                />
                {migrationProgress ? (
                  <Box sx={{ mb: 2 }}>
                    <Typography variant="body2" sx={{ mb: 1 }}>
                      Migrating files: {migrationProgress.current} of {migrationProgress.total}
                    </Typography>
                    <LinearProgress 
                      variant="determinate" 
                      value={(migrationProgress.current / migrationProgress.total) * 100}
                      sx={{ height: 8, borderRadius: 4 }}
                    />
                  </Box>
                ) : null}
                
                <Box>
                  <Button 
                    variant="contained" 
                    onClick={handleRegenerateKeys}
                    sx={{ mr: 1 }}
                    disabled={!!migrationProgress}
                  >
                    {getEncryptionMethod() === 'HPKE' ? 'Regenerate HPKE Keys' : 'Generate HPKE Keys'}
                  </Button>
                  <Button 
                    variant="outlined"
                    onClick={handleCancelRegeneration}
                    disabled={!!migrationProgress}
                  >
                    Cancel
                  </Button>
                </Box>
              </Box>
            )}
          </Box>
        </Paper>

        {/* Key Management */}
        {getEncryptionMethod() === 'HPKE' && (
          <Paper elevation={2} sx={{ p: 3, mb: 3 }}>
            <Typography variant="h6" gutterBottom>Key Management</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Backup and manage your HPKE encryption keys
            </Typography>
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'start' }}>
              <Box>
                <Button
                  variant="outlined"
                  onClick={handleDownloadKey}
                  disabled={!userProfile?.encryptedPrivateKey}
                  sx={{ mb: 1 }}
                >
                  Download Key Backup
                </Button>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', maxWidth: 250 }}>
                  Downloads a JSON file containing your encrypted private key. Safe to store as backup.
                </Typography>
              </Box>
              
              <Box>
                <Button
                  variant="outlined"
                  color="warning"
                  onClick={handleDownloadDecryptedKey}
                  disabled={!privateKey}
                  sx={{ mb: 1 }}
                >
                  Download Decrypted Key
                </Button>
                <Typography variant="caption" color="warning.main" sx={{ display: 'block', maxWidth: 250 }}>
                  ⚠️ Downloads your private key in plain text. Only use if you understand the security risks.
                </Typography>
              </Box>
            </Box>
            
            {!privateKey && (
              <Alert severity="info" sx={{ mt: 2 }}>
                <Typography variant="body2">
                  To download your decrypted private key, you must first unlock your key using your passphrase, biometric authentication, or key file.
                </Typography>
              </Alert>
            )}
          </Paper>
        )}

        {/* DEBUG: Temporary debugging section */}
        {process.env.NODE_ENV === 'development' && (
          <Paper elevation={2} sx={{ p: 3, mb: 3, bgcolor: 'warning.light', border: '2px dashed orange' }}>
            <Typography variant="h6" gutterBottom>🔧 Debug Migration (Dev Only)</Typography>
            <Typography variant="body2" sx={{ mb: 2 }}>
              These buttons help debug the migration counting issue. Check browser console for output.
            </Typography>
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              <Button
                variant="outlined"
                onClick={handleDebugUserData}
                color="warning"
              >
                Analyze All User Data
              </Button>
              <Button
                variant="outlined"
                onClick={handleTestCount}
                color="warning"
              >
                Test Count Function
              </Button>
            </Box>
          </Paper>
        )}

        {/* Device Capability Information */}
        <DeviceCapabilityInfo />

        {/* Biometric Authentication Setup */}
        <BiometricSetup />

      </Box>
      
      <DecryptedKeyWarningDialog
        open={showDecryptedKeyWarning}
        onClose={() => setShowDecryptedKeyWarning(false)}
        onConfirm={handleConfirmDecryptedKeyDownload}
      />
      
      <KeyRegenerationWarningDialog
        open={showRegenerationWarning}
        onClose={() => setShowRegenerationWarning(false)}
        onConfirm={handleConfirmRegeneration}
        userId={user?.uid || ''}
      />
    </AppLayout>
  );
};

export default ProfilePage;
