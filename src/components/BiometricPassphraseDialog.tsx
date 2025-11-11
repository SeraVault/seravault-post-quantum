import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  FormControlLabel,
  Checkbox,
  Alert,
  Typography,
  Box,
  Tabs,
  Tab,
  CircularProgress,
} from '@mui/material';
import { Security, Timer, Fingerprint, VpnKey, Logout, Upload, Key } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import {
  isBiometricAvailable,
  authenticateWithBiometric,
  retrieveBiometricEncryptedKey,
  hasBiometricSetup,
} from '../utils/biometricAuth';
import {
  getRegisteredHardwareKeys,
  retrievePrivateKeyFromHardware,
  hasStoredPrivateKey,
} from '../utils/hardwareKeyAuth';

interface BiometricPassphraseDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (privateKey: string, rememberChoice: boolean, method: 'passphrase' | 'biometric' | 'keyfile' | 'hardware') => Promise<void>;
}

const BiometricPassphraseDialog: React.FC<BiometricPassphraseDialogProps> = ({
  open,
  onClose,
  onSubmit,
}) => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState(0);
  const [passphrase, setPassphrase] = useState('');
  const [rememberChoice, setRememberChoice] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [hasBiometric, setHasBiometric] = useState(false);
  const [selectedKeyFile, setSelectedKeyFile] = useState<File | null>(null);
  const [keyFilePassphrase, setKeyFilePassphrase] = useState('');
  const [hasHardwareKeys, setHasHardwareKeys] = useState(false);
  const [hardwareKeysWithStorage, setHardwareKeysWithStorage] = useState<string[]>([]);

  useEffect(() => {
    const checkBiometric = async () => {
      if (user) {
        const available = await isBiometricAvailable();
        const setup = hasBiometricSetup(user.uid);
        setBiometricAvailable(available);
        setHasBiometric(setup);
        
        // Check for hardware keys - add a small delay to ensure credentials are persisted
        try {
          // Small delay to allow browser credential store to sync
          await new Promise(resolve => setTimeout(resolve, 100));
          
          const keys = await getRegisteredHardwareKeys(user.uid);
          setHasHardwareKeys(keys.length > 0);
          
          // Check which keys have stored private keys
          const keysWithStorage: string[] = [];
          for (const key of keys) {
            const hasStorage = await hasStoredPrivateKey(key.id);
            if (hasStorage) {
              keysWithStorage.push(key.id);
            }
          }
          setHardwareKeysWithStorage(keysWithStorage);
          
          // Default to hardware key tab if available
          if (keys.length > 0) {
            // Set active tab to hardware key (adjust index based on biometric availability)
            const hardwareTabIndex = (available && setup) ? 2 : 1;
            setActiveTab(hardwareTabIndex);
          } else if (available && setup) {
            // Otherwise, default to biometric tab if available
            setActiveTab(1);
          }
        } catch (error) {
          console.error('Error checking hardware keys:', error);
          setHasHardwareKeys(false);
          setHardwareKeysWithStorage([]);
        }
      }
    };

    if (open) {
      checkBiometric();
      setError(null);
      setPassphrase('');
      setRememberChoice(false);
      setSelectedKeyFile(null);
      setKeyFilePassphrase('');
    }
  }, [open, user]);

  const handlePassphraseSubmit = async () => {
    if (!passphrase.trim()) {
      setError('Please enter your passphrase');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      // The parent component will handle the actual decryption and validation
      await onSubmit(passphrase, rememberChoice, 'passphrase');
      setPassphrase('');
      setRememberChoice(false);
    } catch (err) {
      setError('Incorrect passphrase. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleBiometricAuth = async () => {
    if (!user) return;

    try {
      setLoading(true);
      setError(null);

      const credentialId = localStorage.getItem(`biometric_credential_${user.uid}`);
      if (!credentialId) {
        throw new Error('Biometric credential not found. Please set up biometric authentication first.');
      }

      // Authenticate with biometric
      const authResult = await authenticateWithBiometric(credentialId);
      
      if (!authResult.success) {
        throw new Error('Biometric authentication failed');
      }

      // Retrieve encrypted private key using credential ID
      const privateKey = await retrieveBiometricEncryptedKey(credentialId, user.uid);

      // Submit the decrypted private key
      await onSubmit(privateKey, true, 'biometric'); // Always remember for biometric
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Biometric authentication failed';
      if (errorMessage.includes('not found') || errorMessage.includes('set up')) {
        setError('Biometric authentication not set up. Please use your passphrase or set up biometric authentication in your Profile.');
      } else if (errorMessage.includes('canceled') || errorMessage.includes('aborted')) {
        setError('Biometric authentication was canceled. Please try again or use your passphrase.');
      } else {
        setError(`Biometric authentication failed: ${errorMessage}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleHardwareKeyAuth = async () => {
    if (!user) return;

    try {
      setLoading(true);
      setError(null);

      // Get all registered hardware keys
      const keys = await getRegisteredHardwareKeys(user.uid);
      if (keys.length === 0) {
        throw new Error('No hardware keys registered. Please set up a hardware key in your Profile.');
      }
      
      // Try to use the first available hardware key
      const credentialId = keys[0].id;
      
      // This will prompt the user to touch their hardware key
      const privateKey = await retrievePrivateKeyFromHardware(credentialId);

      // Submit the decrypted private key
      await onSubmit(privateKey, true, 'hardware');
    } catch (error) {
      console.error('Hardware key authentication error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Hardware key authentication failed';
      setError(`${errorMessage}. Make sure your key is inserted and touch it when prompted.`);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyFileUpload = async () => {
    console.log('handleKeyFileUpload called', { selectedKeyFile, keyFilePassphrase });
    
    if (!selectedKeyFile) {
      setError('Please select a key file');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      console.log('Reading key file...');
      // Read the key file
      const fileContent = await selectedKeyFile.text();
      console.log('File content length:', fileContent.length);
      let privateKeyHex: string;

      // Try to parse as JSON first (encrypted key file)
      try {
        const keyData = JSON.parse(fileContent);
        console.log('Parsed as JSON:', keyData);
        
        // Check for encrypted key file format
        if (keyData.encryptedPrivateKey && keyData.keyType) {
          if (!keyData.keyType.includes('ML-KEM-768')) {
            throw new Error('Invalid or unsupported key file format. Only ML-KEM-768 keys are supported.');
          }

          if (!keyFilePassphrase.trim()) {
            setError('This is an encrypted key file. Please enter the passphrase.');
            setLoading(false);
            return;
          }

          // Import decrypt function and decrypt the private key
          console.log('Decrypting with passphrase...');
          const { decryptString } = await import('../crypto/quantumSafeCrypto');
          privateKeyHex = await decryptString(keyData.encryptedPrivateKey, keyFilePassphrase);
          console.log('Decrypted successfully');
        }
        // Check for decrypted key file format
        else if (keyData.privateKeyHex && (keyData.keyType.includes('DECRYPTED') || keyData.keyType.includes('ML-KEM-768'))) {
          privateKeyHex = keyData.privateKeyHex;
          console.log('Using decrypted key from file');
          // Validate it's a proper hex string
          if (!/^[a-fA-F0-9]{64}$/.test(privateKeyHex)) {
            throw new Error('Invalid private key format in decrypted key file');
          }
        }
        else {
          throw new Error('Invalid key file structure');
        }
      } catch (jsonError) {
        console.log('Not JSON, trying as plain text:', jsonError);
        // If JSON parsing fails, treat as plain text private key
        const trimmedContent = fileContent.trim();
        
        // Validate it looks like a hex private key (64 characters)
        if (/^[a-fA-F0-9]{64}$/.test(trimmedContent)) {
          privateKeyHex = trimmedContent;
          console.log('Using plain text key');
        } else {
          throw new Error('Invalid file format. Please provide either an encrypted key file (JSON), a decrypted key file (JSON), or a plain text private key (64 hex characters).');
        }
      }
      
      console.log('Calling onSubmit with key length:', privateKeyHex!.length);
      // Submit the decrypted private key
      await onSubmit(privateKeyHex!, rememberChoice, 'keyfile');
      console.log('onSubmit completed successfully');
      setSelectedKeyFile(null);
      setKeyFilePassphrase('');
      setRememberChoice(false);
    } catch (err) {
      console.error('Key file error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Key file processing failed';
      if (errorMessage.includes('decrypt') && keyFilePassphrase.trim()) {
        setError('Incorrect passphrase for encrypted key file. Please try again.');
      } else {
        setError(errorMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && !loading && activeTab === 0) {
      handlePassphraseSubmit();
    }
  };

  const handleLogout = async () => {
    try {
      setLoading(true);
      onClose(); // Close the dialog first
      await logout(); // Then logout
    } catch (error) {
      console.error('Logout error:', error);
      setError('Failed to log out. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Security />
          Unlock Your Private Key
        </Box>
      </DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Your passphrase{(biometricAvailable && hasBiometric) ? ' or biometric authentication' : ''} is required to decrypt your private key and access your encrypted files.
        </Typography>

        {!biometricAvailable && (
          <Alert severity="info" sx={{ mb: 2 }}>
            <Typography variant="body2">
              🔐 <strong>Passphrase Authentication</strong><br />
              Biometric authentication is not available on this device. You can still securely access your files using your passphrase.
              {/mobile|android|iphone|ipad/i.test(navigator.userAgent) && (
                <span> For biometric access, try using Safari on iOS or Chrome on Android.</span>
              )}
            </Typography>
          </Alert>
        )}

        {biometricAvailable && !hasBiometric && (
          <Alert severity="info" sx={{ mb: 2 }}>
            <Typography variant="body2">
              👆 <strong>Biometric Available</strong><br />
              Your device supports biometric authentication! Visit your Profile page to set up fingerprint/Face ID login for faster access.
            </Typography>
          </Alert>
        )}

        <Box sx={{ mb: 2 }}>
          <Tabs value={activeTab} onChange={(_, value) => setActiveTab(value)} centered>
            <Tab icon={<VpnKey />} label="Passphrase" />
            {(biometricAvailable && hasBiometric) && <Tab icon={<Fingerprint />} label="Biometric" />}
            {hasHardwareKeys && <Tab icon={<Key />} label="Hardware Key" />}
            <Tab icon={<Upload />} label="Key File" />
          </Tabs>
        </Box>
        
        {error && (
          <Alert 
            severity="error" 
            sx={{ mb: 2 }}
            action={
              error.includes('set up') ? (
                <Button
                  color="inherit"
                  size="small"
                  onClick={() => {
                    onClose();
                    navigate('/profile');
                  }}
                >
                  Go to Profile
                </Button>
              ) : undefined
            }
          >
            {error}
          </Alert>
        )}

        {/* Passphrase Tab */}
        {activeTab === 0 && (
          <Box>
            <TextField
              autoFocus
              margin="dense"
              label="Passphrase"
              type="password"
              fullWidth
              variant="outlined"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              onKeyPress={handleKeyPress}
              disabled={loading}
              sx={{ mb: 2 }}
            />
            
            <FormControlLabel
              control={
                <Checkbox
                  checked={rememberChoice}
                  onChange={(e) => setRememberChoice(e.target.checked)}
                  disabled={loading}
                />
              }
              label={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Timer fontSize="small" />
                  <Typography variant="body2">
                    Keep unlocked longer (1 hour vs 15 minutes)
                  </Typography>
                </Box>
              }
            />
          </Box>
        )}

        {/* Biometric Tab */}
        {activeTab === 1 && (biometricAvailable && hasBiometric) && (
          <Box sx={{ textAlign: 'center', py: 3 }}>
            <Fingerprint sx={{ fontSize: 64, color: 'primary.main', mb: 2 }} />
            <Typography variant="h6" gutterBottom>
              Use Biometric Authentication
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Touch the fingerprint sensor or look at your device to unlock your private key.
            </Typography>
            
            <Button
              variant="contained"
              size="large"
              startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <Fingerprint />}
              onClick={handleBiometricAuth}
              disabled={loading}
              sx={{ minWidth: 180 }}
            >
              {loading ? 'Authenticating...' : 'Authenticate'}
            </Button>
          </Box>
        )}

        {/* Hardware Key Tab */}
        {(() => {
          let hardwareTabIndex = 1;
          if (biometricAvailable && hasBiometric) hardwareTabIndex = 2;
          return activeTab === hardwareTabIndex && hasHardwareKeys;
        })() && (
          <Box sx={{ textAlign: 'center', py: 3 }}>
            <Key sx={{ fontSize: 64, color: 'primary.main', mb: 2 }} />
            <Typography variant="h6" gutterBottom>
              Use Hardware Security Key
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Insert your hardware security key (YubiKey, etc.) and touch it when prompted to unlock your private key.
            </Typography>
            
            <Button
              variant="contained"
              size="large"
              startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <Key />}
              onClick={handleHardwareKeyAuth}
              disabled={loading}
              sx={{ minWidth: 180 }}
            >
              {loading ? 'Touch Your Key...' : 'Unlock with Hardware Key'}
            </Button>
            
            <Alert severity="info" sx={{ mt: 3, textAlign: 'left' }}>
              <Typography variant="body2">
                <strong>Paranoid Mode Active:</strong> Your private key is stored in your browser, 
                encrypted with your hardware key. It has never been sent to our servers.
              </Typography>
            </Alert>
          </Box>
        )}

        {/* Key File Tab */}
        {(() => {
          let keyFileTabIndex = 1;
          if (biometricAvailable && hasBiometric) keyFileTabIndex++;
          if (hardwareKeysWithStorage.length > 0) keyFileTabIndex++;
          return activeTab === keyFileTabIndex;
        })() && (
          <Box>
            <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Upload />
              Upload Key File
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Select one of the following:
              <br />• Encrypted key backup (.json) - requires passphrase
              <br />• Decrypted key backup (.json) - no passphrase needed
              <br />• Plain text private key file (64 hex characters)
            </Typography>
            
            <input
              accept=".json,.txt,.key,application/json,text/plain"
              style={{ display: 'none' }}
              id="key-file-input"
              type="file"
              onChange={(e) => setSelectedKeyFile(e.target.files?.[0] || null)}
            />
            <label htmlFor="key-file-input">
              <Button
                variant="outlined"
                component="span"
                startIcon={<Upload />}
                disabled={loading}
                sx={{ mb: 2 }}
              >
                {selectedKeyFile ? `Selected: ${selectedKeyFile.name}` : 'Choose Key File'}
              </Button>
            </label>
            
            {selectedKeyFile && (
              <>
                <TextField
                  margin="dense"
                  label="Passphrase (if encrypted)"
                  type="password"
                  fullWidth
                  variant="outlined"
                  value={keyFilePassphrase}
                  onChange={(e) => setKeyFilePassphrase(e.target.value)}
                  disabled={loading}
                  sx={{ mb: 2 }}
                  helperText="Only required for encrypted key files. Leave empty for decrypted keys or plain text files."
                />
                
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={rememberChoice}
                      onChange={(e) => setRememberChoice(e.target.checked)}
                      disabled={loading}
                    />
                  }
                  label={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <Timer fontSize="small" />
                      <Typography variant="body2">
                        Keep unlocked longer (1 hour vs 15 minutes)
                      </Typography>
                    </Box>
                  }
                />
              </>
            )}
          </Box>
        )}
        
        <Alert severity="info" sx={{ mt: 2 }}>
          <Typography variant="body2">
            <strong>Security Note:</strong> Your decrypted private key will be stored securely in memory only. 
            It will be automatically cleared when you close the browser, switch tabs for extended periods, 
            or after the timeout expires.
          </Typography>
        </Alert>
      </DialogContent>
      <DialogActions sx={{ justifyContent: 'space-between' }}>
        <Button 
          onClick={handleLogout} 
          disabled={loading}
          startIcon={<Logout />}
          color="error"
          variant="outlined"
        >
          Logout
        </Button>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          {/* Show unlock button based on which tab is active */}
          {activeTab === 0 && (
            // Passphrase tab
            <Button 
              onClick={handlePassphraseSubmit} 
              variant="contained" 
              disabled={loading || !passphrase.trim()}
            >
              {loading ? 'Decrypting...' : 'Unlock'}
            </Button>
          )}
          {(() => {
            // Calculate the key file tab index
            let keyFileTabIndex = 1;
            if (biometricAvailable && hasBiometric) keyFileTabIndex++;
            if (hardwareKeysWithStorage.length > 0) keyFileTabIndex++;
            
            // Show key file unlock button only on the key file tab
            return activeTab === keyFileTabIndex && (
              <Button 
                onClick={handleKeyFileUpload} 
                variant="contained" 
                disabled={loading || !selectedKeyFile}
              >
                {loading ? 'Processing...' : 'Unlock with Key File'}
              </Button>
            );
          })()}
        </Box>
      </DialogActions>
    </Dialog>
  );
};

export default BiometricPassphraseDialog;