import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Alert,
  Chip,
  Divider,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  CircularProgress,
  FormControlLabel,
  Checkbox,
  RadioGroup,
  Radio,
  FormControl,
  FormLabel,
} from '@mui/material';
import {
  VpnKey,
  Delete as DeleteIcon,
  Edit as EditIcon,
  Security,
  Usb as UsbIcon,
  Nfc as NfcIcon,
  Bluetooth as BluetoothIcon,
  CheckCircle,
  Warning,
  Help as HelpIcon,
  Fingerprint,
} from '@mui/icons-material';
import AuthenticationMethodsHelp from './AuthenticationMethodsHelp';
import RemovePassphraseKeyDialog from './RemovePassphraseKeyDialog';
import { useAuth } from '../auth/AuthContext';
import { usePassphrase } from '../auth/PassphraseContext';
import {
  getHardwareKeyCapabilities,
  registerHardwareKey,
  getRegisteredHardwareKeys,
  removeHardwareKey,
  updateHardwareKeyNickname,
  getAuthenticatorName,
  storePrivateKeyInHardware,
  type HardwareKeyCredential,
} from '../utils/hardwareKeyAuth';

interface HardwareKeySetupProps {
  onEncryptedKeyChange?: () => void;
}

const HardwareKeySetup: React.FC<HardwareKeySetupProps> = ({ onEncryptedKeyChange }) => {
  const { user } = useAuth();
  const { privateKey } = usePassphrase();
  const [capabilities, setCapabilities] = useState<{
    supported: boolean;
    platformAuthenticator: boolean;
    crossPlatformAuthenticator: boolean;
    conditionalMediation: boolean;
  } | null>(null);
  const [registeredKeys, setRegisteredKeys] = useState<HardwareKeyCredential[]>([]);
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [hasEncryptedKey, setHasEncryptedKey] = useState(false);
  
  // Dialog states
  const [nicknameDialogOpen, setNicknameDialogOpen] = useState(false);
  const [newKeyNickname, setNewKeyNickname] = useState('');
  const [storePrivateKeyOption, setStorePrivateKeyOption] = useState(false);
  const [removePassphraseKeyDialogOpen, setRemovePassphraseKeyDialogOpen] = useState(false);
  const [restorePassphraseKeyDialogOpen, setRestorePassphraseKeyDialogOpen] = useState(false);
  const [newPassphrase, setNewPassphrase] = useState('');
  const [confirmNewPassphrase, setConfirmNewPassphrase] = useState('');
  const [authenticatorType, setAuthenticatorType] = useState<'cross-platform' | 'platform'>('cross-platform');
  const [helpDialogOpen, setHelpDialogOpen] = useState(false);
  const [editingKey, setEditingKey] = useState<HardwareKeyCredential | null>(null);
  const [editNickname, setEditNickname] = useState('');

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setError(null);
      try {
        const caps = await getHardwareKeyCapabilities();
        setCapabilities(caps);

        if (user) {
          const keys = await getRegisteredHardwareKeys(user.uid);
          setRegisteredKeys(keys);
          
          // Check if user has encrypted private key
          const { doc, getDoc } = await import('firebase/firestore');
          const { db } = await import('../firebase');
          const userDoc = await getDoc(doc(db, 'users', user.uid));
          const userData = userDoc.data();
          const hasKey = !!(userData?.encryptedPrivateKey?.ciphertext);
          setHasEncryptedKey(hasKey);
          console.log('HardwareKeySetup: hasEncryptedKey =', hasKey, 'privateKey =', !!privateKey, 'registeredKeys =', keys.length);
        }
      } catch (err) {
        setError('Failed to load hardware key settings');
        console.error('Error loading hardware keys:', err);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [user, privateKey]);

  const handleRegisterKey = async () => {
    if (!user) return;

    setRegistering(true);
    setError(null);
    setSuccess(null);

    try {
      const nickname = newKeyNickname.trim() || undefined;
      const newKey = await registerHardwareKey(user.uid, user.email || '', nickname, authenticatorType);
      
      // If user wants to store private key in hardware
      if (storePrivateKeyOption && privateKey) {
        try {
          await storePrivateKeyInHardware(newKey.id, privateKey);
          newKey.storesPrivateKey = true;
          const authTypeLabel = authenticatorType === 'cross-platform' ? 'Hardware key' : 'Passkey';
          
          // Add the new key to the list immediately
          setRegisteredKeys([...registeredKeys, newKey]);
          setNicknameDialogOpen(false);
          setNewKeyNickname('');
          setStorePrivateKeyOption(false);
          setAuthenticatorType('cross-platform');
          
          // Now show dialog asking if they want to remove passphrase-protected key
          setRemovePassphraseKeyDialogOpen(true);
          setSuccess(`${authTypeLabel} registered and private key stored securely!`);
        } catch (storeError) {
          // Key registered but private key storage failed
          const authTypeLabel = authenticatorType === 'cross-platform' ? 'Hardware key' : 'Passkey';
          setError(`${authTypeLabel} registered, but failed to store private key. You will still need to enter your passphrase.`);
          console.error('Failed to store private key:', storeError);
          setRegisteredKeys([...registeredKeys, newKey]);
          setNicknameDialogOpen(false);
        }
      } else {
        const authTypeLabel = authenticatorType === 'cross-platform' ? 'Hardware security key' : 'Passkey';
        setSuccess(`${authTypeLabel} registered successfully!`);
        setRegisteredKeys([...registeredKeys, newKey]);
        setNicknameDialogOpen(false);
        setNewKeyNickname('');
        setStorePrivateKeyOption(false);
        setAuthenticatorType('cross-platform');
      }
    } catch (err) {
      let errorMessage = err instanceof Error ? err.message : 'Failed to register authentication method';
      
      // Add helpful context for common WebAuthn errors
      if (errorMessage.includes('NotAllowedError') || errorMessage.includes('cancelled')) {
        errorMessage = 'Registration cancelled. Please try again and touch your security key when prompted.';
      } else if (errorMessage.includes('InvalidStateError') || errorMessage.includes('already registered')) {
        errorMessage = 'This security key is already registered. Use a different key or remove the existing one first.';
      } else if (errorMessage.includes('NotSupportedError')) {
        errorMessage = 'Your browser or device doesn\'t support this type of authentication method.';
      }
      
      // Add environment info for debugging
      import('../utils/hardwareKeyAuth').then(({ getEnvironmentDescription }) => {
        const env = getEnvironmentDescription();
        console.error('[HardwareKey] Registration failed in environment:', env);
        console.error('[HardwareKey] Error:', err);
      });
      
      setError(errorMessage);
    } finally {
      setRegistering(false);
    }
  };

  const handleRemoveKey = async (credentialId: string) => {
    if (!user) return;
    if (!confirm('Are you sure you want to remove this hardware key? You will need another authentication method to access your account.')) {
      return;
    }

    try {
      await removeHardwareKey(user.uid, credentialId);
      setRegisteredKeys(registeredKeys.filter(k => k.id !== credentialId));
      setSuccess('Hardware key removed successfully');
    } catch (error) {
      console.error('Failed to remove hardware key:', error);
      setError('Failed to remove hardware key');
    }
  };

  const handleEditNickname = (key: HardwareKeyCredential) => {
    setEditingKey(key);
    setEditNickname(key.nickname);
  };

  const handleSaveNickname = async () => {
    if (!user || !editingKey) return;

    try {
      await updateHardwareKeyNickname(user.uid, editingKey.id, editNickname);
      setRegisteredKeys(registeredKeys.map(k => 
        k.id === editingKey.id ? { ...k, nickname: editNickname } : k
      ));
      setEditingKey(null);
      setSuccess('Nickname updated successfully');
    } catch (error) {
      console.error('Failed to update nickname:', error);
      setError('Failed to update nickname');
    }
  };

  const handleRemovePassphraseKey = async () => {
    if (!user) return;
    
    try {
      // Import firestore and update user profile
      const { doc, updateDoc } = await import('firebase/firestore');
      const { db } = await import('../firebase');
      
      const userDocRef = doc(db, 'users', user.uid);
      await updateDoc(userDocRef, {
        encryptedPrivateKey: null,
      });
      
      setHasEncryptedKey(false);
      setSuccess('Passphrase-protected key removed. Your private key now only exists in your hardware keys!');
      onEncryptedKeyChange?.();
    } catch (error) {
      console.error('Failed to remove passphrase key:', error);
      throw new Error('Failed to remove passphrase-protected key from server');
    }
  };

  const handleRestorePassphraseKey = async () => {
    if (!user || !privateKey) {
      setError('You must be logged in and have your private key unlocked');
      return;
    }

    if (!newPassphrase || newPassphrase.length < 8) {
      setError('Passphrase must be at least 8 characters long');
      return;
    }

    if (newPassphrase !== confirmNewPassphrase) {
      setError('Passphrases do not match');
      return;
    }

    try {
      // Encrypt the private key with the new passphrase
      const { encryptString } = await import('../crypto/quantumSafeCrypto');
      const encryptedPrivateKey = encryptString(privateKey, newPassphrase);

      // Store in Firestore
      const { doc, updateDoc } = await import('firebase/firestore');
      const { db } = await import('../firebase');
      
      const userDocRef = doc(db, 'users', user.uid);
      await updateDoc(userDocRef, {
        encryptedPrivateKey: encryptedPrivateKey,
      });

      setHasEncryptedKey(true);
      setSuccess('Passphrase-protected key restored! You can now use both hardware keys and passphrase to unlock.');
      setRestorePassphraseKeyDialogOpen(false);
      setNewPassphrase('');
      setConfirmNewPassphrase('');
      onEncryptedKeyChange?.();
    } catch (error) {
      console.error('Failed to restore passphrase key:', error);
      setError('Failed to restore passphrase-protected key');
    }
  };

  const getKeyTypeIcon = (type: HardwareKeyCredential['type']) => {
    switch (type) {
      case 'usb': return <UsbIcon />;
      case 'nfc': return <NfcIcon />;
      case 'bluetooth': return <BluetoothIcon />;
      default: return <VpnKey />;
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent>
          <Box display="flex" justifyContent="center" alignItems="center" p={3}>
            <CircularProgress />
          </Box>
        </CardContent>
      </Card>
    );
  }

  if (!capabilities?.supported) {
    return (
      <Card>
        <CardContent>
          <Box display="flex" alignItems="flex-start" gap={2} mb={2}>
            <Warning color="warning" />
            <Box>
              <Typography variant="h6">Hardware Keys Not Supported</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Your browser doesn't support hardware security keys (WebAuthn/FIDO2).
                Please use a modern browser like Chrome, Firefox, Edge, or Safari.
              </Typography>
            </Box>
          </Box>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent>
        <Box display="flex" alignItems="center" gap={2} mb={2}>
          <Security color="primary" fontSize="large" />
          <Box>
            <Typography variant="h6">Hardware Security Keys</Typography>
            <Typography variant="body2" color="text.secondary">
              Add physical security keys (YubiKey, Titan, etc.) for phishing-resistant authentication
            </Typography>
          </Box>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {success && (
          <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess(null)}>
            {success}
          </Alert>
        )}

        <Box display="flex" gap={1} mb={2} flexWrap="wrap">
          <Chip 
            icon={<CheckCircle />} 
            label="Phishing-Resistant" 
            color="success" 
            size="small" 
          />
          <Chip 
            icon={<VpnKey />} 
            label="Hardware-Based" 
            color="primary" 
            size="small" 
          />
          {capabilities.crossPlatformAuthenticator && (
            <Chip 
              icon={<UsbIcon />} 
              label="USB Keys Supported" 
              size="small" 
            />
          )}
        </Box>

        <Divider sx={{ my: 2 }} />

        {registeredKeys.length === 0 ? (
          <Box textAlign="center" py={3}>
            <VpnKey sx={{ fontSize: 60, color: 'text.disabled', mb: 2 }} />
            <Typography variant="body1" color="text.secondary" gutterBottom>
              No hardware keys registered
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Add a security key to enable phishing-resistant two-factor authentication
            </Typography>
            <Button
              variant="contained"
              startIcon={<VpnKey />}
              onClick={() => setNicknameDialogOpen(true)}
            >
              Register Security Key
            </Button>
          </Box>
        ) : (
          <>
            <Typography variant="subtitle2" gutterBottom>
              Registered Keys ({registeredKeys.length})
            </Typography>
            <List>
              {registeredKeys.map((key) => (
                <ListItem key={key.id} divider>
                  <Box display="flex" alignItems="center" gap={2} width="100%">
                    {getKeyTypeIcon(key.type)}
                    <ListItemText
                      primary={
                        <Box display="flex" alignItems="center" gap={1}>
                          <span>{key.nickname}</span>
                          {key.storesPrivateKey && (
                            <Chip 
                              label="Stores Private Key" 
                              size="small" 
                              color="success"
                              icon={<Security />}
                            />
                          )}
                        </Box>
                      }
                      secondary={
                        <>
                          {getAuthenticatorName(key.aaguid)}
                          {' • '}
                          Added {key.createdAt.toLocaleDateString()}
                          {' • '}
                          Last used {key.lastUsed.toLocaleDateString()}
                        </>
                      }
                    />
                  </Box>
                  <ListItemSecondaryAction>
                    <IconButton
                      edge="end"
                      aria-label="edit"
                      onClick={() => handleEditNickname(key)}
                      sx={{ mr: 1 }}
                    >
                      <EditIcon />
                    </IconButton>
                    <IconButton
                      edge="end"
                      aria-label="delete"
                      onClick={() => handleRemoveKey(key.id)}
                      color="error"
                    >
                      <DeleteIcon />
                    </IconButton>
                  </ListItemSecondaryAction>
                </ListItem>
              ))}
            </List>
            <Box mt={2} display="flex" flexDirection="column" gap={1}>
              <Button
                variant="outlined"
                startIcon={<VpnKey />}
                onClick={() => setNicknameDialogOpen(true)}
                fullWidth
              >
                Add Another Security Key
              </Button>
              
              {/* Show restore button when user has privateKey unlocked but no passphrase backup */}
              {!hasEncryptedKey && privateKey && (
                <Button
                  variant="outlined"
                  color="success"
                  startIcon={<Security />}
                  onClick={() => setRestorePassphraseKeyDialogOpen(true)}
                  fullWidth
                >
                  Add Passphrase Protection
                </Button>
              )}
            </Box>
          </>
        )}

        <Alert severity="info" sx={{ mt: 2 }}>
          <Typography variant="body2">
            <strong>How it works:</strong>
          </Typography>
          <Typography variant="body2" component="ul" sx={{ mt: 1, pl: 2, mb: 0 }}>
            <li>Insert your security key (USB, NFC, or Bluetooth) or use device biometrics</li>
            <li>Touch the key when your browser prompts you</li>
            <li>The key will be registered and can be used for authentication</li>
            <li><strong>Optional:</strong> Store your private key in the hardware for maximum security (no passphrase needed, but requires backup keys)</li>
          </Typography>
        </Alert>
      </CardContent>

      {/* Register New Key Dialog */}
      <Dialog open={nicknameDialogOpen} onClose={() => !registering && setNicknameDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          <Box display="flex" alignItems="center" justifyContent="space-between">
            <span>Register Authentication Method</span>
            <IconButton 
              onClick={() => setHelpDialogOpen(true)} 
              size="small"
              sx={{ ml: 1 }}
              title="Learn about authentication options"
            >
              <HelpIcon />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent>
          <FormControl component="fieldset" sx={{ mb: 3, width: '100%' }}>
            <FormLabel component="legend" sx={{ mb: 1 }}>
              <Typography variant="subtitle2">Choose Authentication Type</Typography>
            </FormLabel>
            <RadioGroup
              value={authenticatorType}
              onChange={(e) => setAuthenticatorType(e.target.value as 'cross-platform' | 'platform')}
            >
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                <Box 
                  sx={{ 
                    p: 2, 
                    border: '1px solid',
                    borderColor: authenticatorType === 'cross-platform' ? 'primary.main' : 'divider',
                    borderRadius: 1,
                    bgcolor: authenticatorType === 'cross-platform' ? 'action.selected' : 'transparent',
                    cursor: 'pointer',
                  }}
                  onClick={() => setAuthenticatorType('cross-platform')}
                >
                  <FormControlLabel
                    value="cross-platform"
                    control={<Radio />}
                    label={
                      <Box>
                        <Box display="flex" alignItems="center" gap={1} mb={0.5}>
                          <UsbIcon fontSize="small" />
                          <Typography variant="body1" fontWeight="medium">
                            Hardware Security Key
                          </Typography>
                          <Chip label="Secure" size="small" color="success" />
                        </Box>
                        <Typography variant="body2" color="text.secondary">
                          Physical USB, NFC, or Bluetooth security key (e.g., YubiKey, Titan Key)
                        </Typography>
                      </Box>
                    }
                  />
                </Box>
                
                <Box 
                  sx={{ 
                    p: 2, 
                    border: '1px solid',
                    borderColor: authenticatorType === 'platform' ? 'primary.main' : 'divider',
                    borderRadius: 1,
                    bgcolor: authenticatorType === 'platform' ? 'action.selected' : 'transparent',
                    cursor: 'pointer',
                  }}
                  onClick={() => setAuthenticatorType('platform')}
                >
                  <FormControlLabel
                    value="platform"
                    control={<Radio />}
                    label={
                      <Box>
                        <Box display="flex" alignItems="center" gap={1} mb={0.5}>
                          <Fingerprint fontSize="small" />
                          <Typography variant="body1" fontWeight="medium">
                            Passkey (Platform Authenticator)
                          </Typography>
                          <Chip label="Modern" size="small" color="info" />
                        </Box>
                        <Typography variant="body2" color="text.secondary">
                          Built-in fingerprint, face recognition, or device PIN
                        </Typography>
                      </Box>
                    }
                  />
                </Box>
              </Box>
            </RadioGroup>
          </FormControl>

          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Give your {authenticatorType === 'cross-platform' ? 'security key' : 'passkey'} a nickname to help you identify it later.
          </Typography>
          <TextField
            autoFocus
            fullWidth
            label="Nickname (optional)"
            placeholder={authenticatorType === 'cross-platform' ? "e.g., YubiKey 5C, Titan Key" : "e.g., My Laptop, iPhone Fingerprint"}
            value={newKeyNickname}
            onChange={(e) => setNewKeyNickname(e.target.value)}
            disabled={registering}
            helperText="Leave empty for automatic naming"
            sx={{ mb: 3 }}
          />
          
          <Divider sx={{ my: 2 }} />
          
          <Alert severity="info" sx={{ mb: 2 }}>
            <Typography variant="subtitle2" gutterBottom>
              🔐 Maximum Security Option
            </Typography>
            <Typography variant="body2">
              Store your encryption private key <strong>inside the {authenticatorType === 'cross-platform' ? 'hardware key' : 'passkey'}</strong> instead of on our servers.
            </Typography>
          </Alert>
          
          <FormControlLabel
            control={
              <Checkbox 
                checked={storePrivateKeyOption}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setStorePrivateKeyOption(e.target.checked)}
                disabled={registering || !privateKey}
              />
            }
            label={
              <Box>
                <Typography variant="body2">
                  <strong>Store my private key in the {authenticatorType === 'cross-platform' ? 'hardware key' : 'passkey'}</strong>
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {privateKey 
                    ? "No passphrase needed! Private key never touches our servers. (Recommended for paranoid users)"
                    : "Unlock your private key with your passphrase first to enable this option"
                  }
                </Typography>
              </Box>
            }
          />
          
          {storePrivateKeyOption && (
            <Alert severity="warning" sx={{ mt: 2 }}>
              <Typography variant="body2" fontWeight="bold" gutterBottom>
                Important: Hardware Backup Recommendation
              </Typography>
              <Typography variant="body2">
                After registration, you'll be prompted to remove the passphrase-protected key from the server.
                <strong> We strongly recommend having at least 2-3 hardware keys</strong> registered before doing so.
                Losing your only {authenticatorType === 'cross-platform' ? 'hardware key' : 'device'} would mean permanent data loss!
              </Typography>
            </Alert>
          )}
          
          {registering && (
            <Box display="flex" alignItems="center" gap={2} mt={2}>
              <CircularProgress size={20} />
              <Typography variant="body2" color="text.secondary">
                {authenticatorType === 'cross-platform' 
                  ? 'Please insert and touch your security key...'
                  : 'Please authenticate using your device (fingerprint, face, or PIN)...'
                }
              </Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNicknameDialogOpen(false)} disabled={registering}>
            Cancel
          </Button>
          <Button 
            onClick={handleRegisterKey} 
            variant="contained" 
            disabled={registering}
            startIcon={registering ? <CircularProgress size={16} /> : <VpnKey />}
          >
            {registering ? 'Registering...' : 'Register Key'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit Nickname Dialog */}
      <Dialog open={!!editingKey} onClose={() => setEditingKey(null)}>
        <DialogTitle>Edit Key Nickname</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            label="Nickname"
            value={editNickname}
            onChange={(e) => setEditNickname(e.target.value)}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditingKey(null)}>Cancel</Button>
          <Button onClick={handleSaveNickname} variant="contained">
            Save
          </Button>
        </DialogActions>
      </Dialog>

      {/* Help Dialog */}
      <AuthenticationMethodsHelp 
        open={helpDialogOpen} 
        onClose={() => setHelpDialogOpen(false)} 
      />

      {/* Remove Passphrase Key Dialog */}
      <RemovePassphraseKeyDialog
        open={removePassphraseKeyDialogOpen}
        onClose={() => setRemovePassphraseKeyDialogOpen(false)}
        onConfirm={handleRemovePassphraseKey}
        hardwareKeyCount={registeredKeys.filter(k => k.storesPrivateKey).length}
        authenticatorType={authenticatorType}
      />

      {/* Restore Passphrase Key Dialog */}
      <Dialog 
        open={restorePassphraseKeyDialogOpen} 
        onClose={() => {
          setRestorePassphraseKeyDialogOpen(false);
          setNewPassphrase('');
          setConfirmNewPassphrase('');
          setError(null);
        }}
        maxWidth="sm" 
        fullWidth
      >
        <DialogTitle>Restore Passphrase Protection</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Create a passphrase to encrypt your private key. This allows you to unlock your account using either your hardware key or your passphrase.
          </Typography>
          
          {error && (
            <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
              {error}
            </Alert>
          )}

          <TextField
            label="New Passphrase"
            type="password"
            value={newPassphrase}
            onChange={(e) => setNewPassphrase(e.target.value)}
            fullWidth
            margin="normal"
            helperText="At least 8 characters"
          />
          
          <TextField
            label="Confirm Passphrase"
            type="password"
            value={confirmNewPassphrase}
            onChange={(e) => setConfirmNewPassphrase(e.target.value)}
            fullWidth
            margin="normal"
          />
        </DialogContent>
        <DialogActions>
          <Button 
            onClick={() => {
              setRestorePassphraseKeyDialogOpen(false);
              setNewPassphrase('');
              setConfirmNewPassphrase('');
              setError(null);
            }}
          >
            Cancel
          </Button>
          <Button 
            onClick={handleRestorePassphraseKey}
            variant="contained"
            color="success"
            disabled={!newPassphrase || !confirmNewPassphrase}
          >
            Restore Protection
          </Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
};

export default HardwareKeySetup;
