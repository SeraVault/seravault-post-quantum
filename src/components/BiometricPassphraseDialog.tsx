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
import { Security, Timer, Fingerprint, VpnKey, Logout, Upload } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import {
  isBiometricAvailable,
  authenticateWithBiometric,
  retrieveBiometricEncryptedKey,
  hasBiometricSetup,
} from '../utils/biometricAuth';

interface BiometricPassphraseDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (privateKey: string, rememberChoice: boolean, method: 'passphrase' | 'biometric' | 'keyfile') => Promise<void>;
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

  useEffect(() => {
    const checkBiometric = async () => {
      if (user) {
        const available = await isBiometricAvailable();
        const setup = hasBiometricSetup(user.uid);
        setBiometricAvailable(available);
        setHasBiometric(setup);
        
        // Default to biometric tab if available and set up
        if (available && setup) {
          setActiveTab(1);
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

      // Retrieve encrypted private key
      const privateKey = await retrieveBiometricEncryptedKey(authResult.signature, user.uid);
      
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

  const handleKeyFileUpload = async () => {
    if (!selectedKeyFile) {
      setError('Please select a key file');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Read the key file
      const fileContent = await selectedKeyFile.text();
      let privateKeyHex: string;

      // Try to parse as JSON first (encrypted key file)
      try {
        const keyData = JSON.parse(fileContent);
        
        // Check for encrypted key file format
        if (keyData.encryptedPrivateKey && keyData.keyType) {
          if (keyData.keyType !== 'HPKE_X25519') {
            throw new Error('Invalid or unsupported key file format');
          }

          if (!keyFilePassphrase.trim()) {
            setError('This is an encrypted key file. Please enter the passphrase.');
            return;
          }

          // Import decrypt function and decrypt the private key
          const { decryptString } = await import('../crypto/hpkeCrypto');
          privateKeyHex = await decryptString(keyData.encryptedPrivateKey, keyFilePassphrase);
        }
        // Check for decrypted key file format
        else if (keyData.privateKeyHex && keyData.keyType === 'HPKE_X25519_DECRYPTED') {
          privateKeyHex = keyData.privateKeyHex;
          // Validate it's a proper hex string
          if (!/^[a-fA-F0-9]{64}$/.test(privateKeyHex)) {
            throw new Error('Invalid private key format in decrypted key file');
          }
        }
        else {
          throw new Error('Invalid key file structure');
        }
      } catch (jsonError) {
        // If JSON parsing fails, treat as plain text private key
        const trimmedContent = fileContent.trim();
        
        // Validate it looks like a hex private key (64 characters)
        if (/^[a-fA-F0-9]{64}$/.test(trimmedContent)) {
          privateKeyHex = trimmedContent;
        } else {
          throw new Error('Invalid file format. Please provide either an encrypted key file (JSON), a decrypted key file (JSON), or a plain text private key (64 hex characters).');
        }
      }
      
      // Submit the decrypted private key
      await onSubmit(privateKeyHex, rememberChoice, 'keyfile');
      setSelectedKeyFile(null);
      setKeyFilePassphrase('');
      setRememberChoice(false);
    } catch (err) {
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

        {/* Key File Tab */}
        {((activeTab === 1 && !(biometricAvailable && hasBiometric)) || (activeTab === 2 && (biometricAvailable && hasBiometric))) && (
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
          {activeTab === 0 && (
            <Button 
              onClick={handlePassphraseSubmit} 
              variant="contained" 
              disabled={loading || !passphrase.trim()}
            >
              {loading ? 'Decrypting...' : 'Unlock'}
            </Button>
          )}
          {((activeTab === 1 && !(biometricAvailable && hasBiometric)) || (activeTab === 2 && (biometricAvailable && hasBiometric))) && (
            <Button 
              onClick={handleKeyFileUpload} 
              variant="contained" 
              disabled={loading || !selectedKeyFile}
            >
              {loading ? 'Processing...' : 'Unlock with Key File'}
            </Button>
          )}
        </Box>
      </DialogActions>
    </Dialog>
  );
};

export default BiometricPassphraseDialog;