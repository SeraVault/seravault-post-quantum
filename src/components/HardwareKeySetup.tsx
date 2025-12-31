import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { validatePassphraseComplexity } from '../utils/passwordStrength';
import PassphraseRequirements from './PassphraseRequirements';
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
  const { t } = useTranslation();
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
          const { backendService } = await import('../backend/BackendService');
          const userData = await backendService.documents.get('users', user.uid);
          const hasKey = !!(userData?.encryptedPrivateKey?.ciphertext);
          setHasEncryptedKey(hasKey);
          console.log('HardwareKeySetup: hasEncryptedKey =', hasKey, 'privateKey =', !!privateKey, 'registeredKeys =', keys.length, 'keys with private key =', keys.filter(k => k.storesPrivateKey).length);
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
      const { keyData: newKey, signature } = await registerHardwareKey(user.uid, user.email || '', nickname, authenticatorType);
      
      // Always store private key in hardware if available
      if (privateKey) {
        try {
          // Pass the signature to avoid double-prompting
          await storePrivateKeyInHardware(newKey.id, privateKey, user.uid, signature);
          newKey.storesPrivateKey = true;
          const authTypeLabel = authenticatorType === 'cross-platform' ? 'Hardware key' : 'Passkey';
          
          // Add the new key to the list immediately
          setRegisteredKeys([...registeredKeys, newKey]);
          setNicknameDialogOpen(false);
          setNewKeyNickname('');
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
      // Import backendService and update user profile
      const { backendService } = await import('../backend/BackendService');
      
      await backendService.documents.update('users', user.uid, {
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

    const validationErrors = validatePassphraseComplexity(newPassphrase);
    if (validationErrors.length > 0) {
      setError(validationErrors.join(' '));
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
      const { backendService } = await import('../backend/BackendService');
      
      await backendService.documents.update('users', user.uid, {
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
              <Typography variant="h6">{t('profile.hardwareKeysNotSupported', 'Hardware Keys Not Supported')}</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                {t('profile.hardwareKeysNotSupportedDesc', "Your browser doesn't support hardware security keys (WebAuthn/FIDO2). Please use a modern browser like Chrome, Firefox, Edge, or Safari.")}
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
            <Typography variant="h6">{t('profile.hardwareSecurityKeys', 'Hardware Security Keys')}</Typography>
            <Typography variant="body2" color="text.secondary">
              {t('profile.hardwareSecurityKeysDesc', 'Add physical security keys (YubiKey, Titan, etc.) for phishing-resistant authentication')}
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
            label={t('profile.phishingResistant', 'Phishing-Resistant')} 
            color="success" 
            size="small" 
          />
          <Chip 
            icon={<VpnKey />} 
            label={t('profile.hardwareBased', 'Hardware-Based')} 
            color="primary" 
            size="small" 
          />
          {capabilities.crossPlatformAuthenticator && (
            <Chip 
              icon={<UsbIcon />} 
              label={t('profile.usbKeysSupported', 'USB Keys Supported')} 
              size="small" 
            />
          )}
        </Box>

        <Divider sx={{ my: 2 }} />

        {/* Show info when user has both passphrase and hardware keys */}
        {hasEncryptedKey && registeredKeys.length > 0 && (
          <Alert severity="info" sx={{ mb: 2 }}>
            <Typography variant="body2" sx={{ fontWeight: 'bold', mb: 0.5 }}>
              {t('profile.dualAuthenticationMode', '🔐 Dual Authentication Mode')}
            </Typography>
            <Typography variant="body2">
              {t('profile.dualAuthenticationDesc', 'You have both passphrase protection and hardware keys set up. You can unlock using either method. For maximum security, you can remove the passphrase-protected copy from our servers if you have multiple backup hardware keys.')}
            </Typography>
          </Alert>
        )}

        {registeredKeys.length === 0 ? (
          <Box textAlign="center" py={3}>
            <VpnKey sx={{ fontSize: 60, color: 'text.disabled', mb: 2 }} />
            <Typography variant="body1" color="text.secondary" gutterBottom>
              {t('profile.noHardwareKeys', 'No hardware keys registered')}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {t('profile.addSecurityKeyDesc', 'Add a security key to enable phishing-resistant two-factor authentication')}
            </Typography>
            <Button
              variant="contained"
              startIcon={<VpnKey />}
              onClick={() => setNicknameDialogOpen(true)}
            >
              {t('profile.registerSecurityKey', 'Register Security Key')}
            </Button>
          </Box>
        ) : (
          <>
            <Typography variant="subtitle2" gutterBottom>
              {t('profile.registeredKeys', 'Registered Keys')} ({registeredKeys.length})
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
                              label={t('profile.storesPrivateKey', 'Stores Private Key')} 
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
                {t('profile.addAnotherSecurityKey', 'Add Another Security Key')}
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
                  {t('profile.addPassphraseProtection', 'Add Passphrase Protection')}
                </Button>
              )}
              
              {/* Show remove button when user has both passphrase encryption AND hardware keys */}
              {hasEncryptedKey && registeredKeys.length > 0 && (
                <Button
                  variant="outlined"
                  color="warning"
                  startIcon={<Security />}
                  onClick={() => setRemovePassphraseKeyDialogOpen(true)}
                  fullWidth
                >
                  {t('profile.removePassphraseProtection', 'Remove Passphrase Protection')}
                </Button>
              )}
            </Box>
          </>
        )}

        <Alert severity="info" sx={{ mt: 2 }}>
          <Typography variant="body2">
            <strong>{t('profile.howItWorks', 'How it works:')}</strong>
          </Typography>
          <Typography variant="body2" component="ul" sx={{ mt: 1, pl: 2, mb: 0 }}>
            <li>{t('profile.howItWorksStep1', 'Insert your security key (USB, NFC, or Bluetooth) or use device biometrics')}</li>
            <li>{t('profile.howItWorksStep2', 'Touch the key when your browser prompts you')}</li>
            <li>{t('profile.howItWorksStep3', 'The key will be registered and can be used for authentication')}</li>
            <li><strong>{t('profile.optional', 'Optional:')}</strong> {t('profile.howItWorksStep4', 'Store your private key in the hardware for maximum security (no passphrase needed, but requires backup keys)')}</li>
          </Typography>
        </Alert>
      </CardContent>

      {/* Register New Key Dialog */}
      <Dialog open={nicknameDialogOpen} onClose={() => !registering && setNicknameDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          <Box display="flex" alignItems="center" justifyContent="space-between">
            <span>{t('profile.registerAuthenticationMethod', 'Register Authentication Method')}</span>
            <IconButton 
              onClick={() => setHelpDialogOpen(true)} 
              size="small"
              sx={{ ml: 1 }}
              title={t('profile.learnAboutAuthOptions', 'Learn about authentication options')}
            >
              <HelpIcon />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent>
          <FormControl component="fieldset" sx={{ mb: 3, width: '100%' }}>
            <FormLabel component="legend" sx={{ mb: 1 }}>
              <Typography variant="subtitle2">{t('profile.chooseAuthenticationType', 'Choose Authentication Type')}</Typography>
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
                            {t('profile.hardwareSecurityKey', 'Hardware Security Key')}
                          </Typography>
                          <Chip label={t('profile.secure', 'Secure')} size="small" color="success" />
                        </Box>
                        <Typography variant="body2" color="text.secondary">
                          {t('profile.hardwareSecurityKeyDesc', 'Physical USB, NFC, or Bluetooth security key (e.g., YubiKey, Titan Key)')}
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
                            {t('profile.passkeyPlatformAuthenticator', 'Passkey (Platform Authenticator)')}
                          </Typography>
                          <Chip label={t('profile.modern', 'Modern')} size="small" color="info" />
                        </Box>
                        <Typography variant="body2" color="text.secondary">
                          {t('profile.passkeyDesc', 'Built-in fingerprint, face recognition, or device PIN')}
                        </Typography>
                      </Box>
                    }
                  />
                </Box>
              </Box>
            </RadioGroup>
          </FormControl>

          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {authenticatorType === 'cross-platform' 
              ? t('profile.giveSecurityKeyNickname', 'Give your security key a nickname to help you identify it later.')
              : t('profile.givePasskeyNickname', 'Give your passkey a nickname to help you identify it later.')
            }
          </Typography>
          <TextField
            autoFocus
            fullWidth
            label={t('profile.nicknameOptional', 'Nickname (optional)')}
            placeholder={authenticatorType === 'cross-platform' 
              ? t('profile.securityKeyPlaceholder', 'e.g., YubiKey 5C, Titan Key')
              : t('profile.passkeyPlaceholder', 'e.g., My Laptop, iPhone Fingerprint')
            }
            value={newKeyNickname}
            onChange={(e) => setNewKeyNickname(e.target.value)}
            disabled={registering}
            helperText={t('profile.leaveEmptyAutoNaming', 'Leave empty for automatic naming')}
            sx={{ mb: 3 }}
          />
          
          <Divider sx={{ my: 2 }} />
          
          <Alert severity="info" sx={{ mb: 2 }}>
            <Typography variant="subtitle2" gutterBottom>
              {t('profile.automaticPrivateKeyStorage', '🔐 Automatic Private Key Storage')}
            </Typography>
            <Typography variant="body2">
              {authenticatorType === 'cross-platform'
                ? t('profile.privateKeyStoredInHardware', 'Your encryption private key will be stored inside the hardware key. No passphrase needed! Your private key never touches our servers.')
                : t('profile.privateKeyStoredInPasskey', 'Your encryption private key will be stored inside the passkey. No passphrase needed! Your private key never touches our servers.')
              }
            </Typography>
          </Alert>
          
          {!privateKey && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              <Typography variant="body2" fontWeight="bold">
                {t('profile.privateKeyNotAvailable', 'Private Key Not Available')}
              </Typography>
              <Typography variant="body2">
                {t('profile.privateKeyNotAvailableDesc', 'You must unlock your private key with your passphrase before registering a hardware key. The hardware key stores your private key locally for future unlocks.')}
              </Typography>
            </Alert>
          )}
          
          <Alert severity="warning" sx={{ mt: 2 }}>
            <Typography variant="body2" fontWeight="bold" gutterBottom>
              {t('profile.hardwareBackupRecommendation', 'Important: Hardware Backup Recommendation')}
            </Typography>
            <Typography variant="body2">
              {authenticatorType === 'cross-platform'
                ? t('profile.hardwareBackupWarning', "After registration, you'll be prompted to remove the passphrase-protected key from the server. We strongly recommend having at least 2-3 hardware keys registered before doing so. Losing your only hardware key would mean permanent data loss!")
                : t('profile.deviceBackupWarning', "After registration, you'll be prompted to remove the passphrase-protected key from the server. We strongly recommend having at least 2-3 hardware keys registered before doing so. Losing your only device would mean permanent data loss!")
              }
            </Typography>
          </Alert>
          
          {registering && (
            <Box display="flex" alignItems="center" gap={2} mt={2}>
              <CircularProgress size={20} />
              <Typography variant="body2" color="text.secondary">
                {authenticatorType === 'cross-platform' 
                  ? t('profile.pleaseTouchSecurityKey', 'Please insert and touch your security key...')
                  : t('profile.pleaseAuthenticateDevice', 'Please authenticate using your device (fingerprint, face, or PIN)...')
                }
              </Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNicknameDialogOpen(false)} disabled={registering}>
            {t('profile.cancel', 'Cancel')}
          </Button>
          <Button 
            onClick={handleRegisterKey} 
            variant="contained" 
            disabled={registering || !privateKey}
            startIcon={registering ? <CircularProgress size={16} /> : <VpnKey />}
          >
            {registering ? t('profile.registering', 'Registering...') : t('profile.registerKey', 'Register Key')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit Nickname Dialog */}
      <Dialog open={!!editingKey} onClose={() => setEditingKey(null)}>
        <DialogTitle>{t('profile.editKeyNickname', 'Edit Key Nickname')}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            label={t('profile.nickname', 'Nickname')}
            value={editNickname}
            onChange={(e) => setEditNickname(e.target.value)}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditingKey(null)}>{t('profile.cancel', 'Cancel')}</Button>
          <Button onClick={handleSaveNickname} variant="contained">
            {t('profile.save', 'Save')}
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
        hardwareKeyCount={registeredKeys.length}
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
        <DialogTitle>{t('profile.restorePassphraseProtection', 'Restore Passphrase Protection')}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {t('profile.restorePassphraseDesc', 'Create a passphrase to encrypt your private key. This allows you to unlock your account using either your hardware key or your passphrase.')}
          </Typography>
          
          <Alert severity="warning" sx={{ mb: 2 }}>
            <Typography variant="body2" sx={{ fontWeight: 'bold', mb: 0.5 }}>
              {t('profile.chooseStrongPassphrase', '🔒 Choose a Strong Passphrase')}
            </Typography>
            <Typography variant="body2" sx={{ fontSize: '0.875rem' }}>
              {t('profile.passphraseProtectsPrivateKey', 'Your passphrase protects your private key. Use 12+ characters with a mix of words, numbers, and symbols.')}
            </Typography>
            <Typography variant="body2" sx={{ fontSize: '0.875rem', mt: 0.5 }}>
              <strong>{t('profile.examples', 'Examples:')}</strong> {t('profile.passphraseExamples', '"Coffee-Mountain-2024!", "MyDog&Spot!Runs"')}
            </Typography>
          </Alert>
          
          {error && (
            <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
              {error}
            </Alert>
          )}

          <TextField
            label={t('profile.newPassphrase', 'New Passphrase')}
            type="password"
            value={newPassphrase}
            onChange={(e) => setNewPassphrase(e.target.value)}
            fullWidth
            margin="normal"
            helperText={t('profile.atLeast12CharsRecommended', 'At least 12 characters recommended')}
          />
          
          {newPassphrase && <PassphraseRequirements passphrase={newPassphrase} />}
          
          <TextField
            label={t('profile.confirmPassphrase', 'Confirm Passphrase')}
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
            {t('profile.cancel', 'Cancel')}
          </Button>
          <Button 
            onClick={handleRestorePassphraseKey}
            variant="contained"
            color="success"
            disabled={!newPassphrase || !confirmNewPassphrase}
          >
            {t('profile.restoreProtection', 'Restore Protection')}
          </Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
};

export default HardwareKeySetup;
