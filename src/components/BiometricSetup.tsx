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
} from '@mui/material';
import {
  Fingerprint,
  Security,
  PhoneAndroid,
  Warning,
  CheckCircle,
} from '@mui/icons-material';
import { useAuth } from '../auth/AuthContext';
import { usePassphrase } from '../auth/PassphraseContext';
import {
  getBiometricCapabilities,
  registerBiometric,
  authenticateWithBiometric,
  storeBiometricEncryptedKey,
  hasBiometricSetup,
  removeBiometricSetup,
  storeBiometricCredential,
} from '../utils/biometricAuth';

const BiometricSetup: React.FC = () => {
  const { user } = useAuth();
  const { privateKey } = usePassphrase();
  const [available, setAvailable] = useState(false);
  const [capabilities, setCapabilities] = useState<{
    available: boolean;
    type: string;
    supportsResidentKeys: boolean;
  }>({ available: false, type: 'none', supportsResidentKeys: false });
  const [isSetup, setIsSetup] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');

  useEffect(() => {
    const checkBiometricSupport = async () => {
      try {
        const caps = await getBiometricCapabilities();
        setCapabilities(caps);
        setAvailable(caps.available);
        
        if (user) {
          setIsSetup(hasBiometricSetup(user.uid));
        }
      } catch (err) {
        console.error('Error checking biometric support:', err);
        setAvailable(false);
      }
    };

    checkBiometricSupport();
  }, [user]);

  const handleSetupBiometric = async () => {
    if (!user || !privateKey) {
      setError('User must be logged in with private key unlocked');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      // Register biometric credential
      const { credentialId } = await registerBiometric(user.uid, user.displayName || user.email || 'User');
      
      // Store credential ID
      storeBiometricCredential(user.uid, credentialId);
      
      // Authenticate immediately to get signature for encryption
      const authResult = await authenticateWithBiometric(credentialId);
      
      if (authResult.success) {
        // Store encrypted private key using stable credential ID
        await storeBiometricEncryptedKey(privateKey, credentialId, user.uid);

        setIsSetup(true);
        setSuccess('Biometric authentication successfully set up! You can now use fingerprint/Face ID to unlock your private key.');
      } else {
        throw new Error('Failed to verify biometric authentication');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set up biometric authentication');
      console.error('Biometric setup error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveBiometric = async () => {
    if (!user) return;

    try {
      removeBiometricSetup(user.uid);
      setIsSetup(false);
      setSuccess('Biometric authentication removed successfully');
      setError('');
    } catch (err) {
      setError('Failed to remove biometric authentication');
    }
  };

  const handleTestBiometric = async () => {
    if (!user) return;

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const credentialId = localStorage.getItem(`biometric_credential_${user.uid}`);
      if (!credentialId) {
        throw new Error('No biometric credential found');
      }

      const authResult = await authenticateWithBiometric(credentialId);
      
      if (authResult.success) {
        setSuccess('Biometric authentication test successful! 🎉');
      } else {
        throw new Error('Authentication failed');
      }
    } catch (err) {
      setError(`Biometric test failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  if (!available) {
    return (
      <Card>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
            <Fingerprint color="disabled" />
            <Typography variant="h6" color="text.secondary">
              Biometric Authentication
            </Typography>
          </Box>
          <Alert severity="info" sx={{ mb: 2 }}>
            Biometric authentication (fingerprint/Face ID) is not available on this device or browser.
            This feature requires a modern mobile browser with WebAuthn support.
          </Alert>
          <Typography variant="body2" color="text.secondary">
            Supported on:
            • iOS Safari (iPhone/iPad with Touch ID or Face ID)
            • Chrome/Edge on Android (with fingerprint or face unlock)
            • Modern desktop browsers with Windows Hello or Touch ID
          </Typography>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
          <Fingerprint color={isSetup ? 'success' : 'primary'} />
          <Typography variant="h6">
            Biometric Authentication
          </Typography>
          {isSetup && <Chip icon={<CheckCircle />} label="Enabled" color="success" size="small" />}
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <PhoneAndroid fontSize="small" />
          <Typography variant="body2" color="text.secondary">
            {capabilities.type} • Device supported
          </Typography>
        </Box>

        <Typography variant="body2" sx={{ mb: 3 }}>
          Use your device's biometric authentication (fingerprint, Face ID, etc.) to quickly unlock 
          your private key instead of entering your passphrase every time.
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {success && (
          <Alert severity="success" sx={{ mb: 2 }}>
            {success}
          </Alert>
        )}

        {!privateKey && !isSetup && (
          <Alert severity="warning" sx={{ mb: 2 }} icon={<Warning />}>
            Your private key must be unlocked (enter your passphrase first) before setting up biometric authentication.
          </Alert>
        )}

        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          {!isSetup ? (
            <Button
              variant="contained"
              startIcon={<Security />}
              onClick={handleSetupBiometric}
              disabled={loading || !privateKey}
              sx={{ minWidth: '160px' }}
            >
              {loading ? 'Setting up...' : 'Setup Biometric Auth'}
            </Button>
          ) : (
            <>
              <Button
                variant="outlined"
                startIcon={<Fingerprint />}
                onClick={handleTestBiometric}
                disabled={loading}
              >
                {loading ? 'Testing...' : 'Test Biometric'}
              </Button>
              <Button
                variant="outlined"
                color="error"
                onClick={handleRemoveBiometric}
                disabled={loading}
              >
                Remove Biometric
              </Button>
            </>
          )}
        </Box>

        {isSetup && (
          <>
            <Divider sx={{ my: 2 }} />
            <Alert severity="info">
              <Typography variant="body2">
                <strong>Security Note:</strong> Your private key is encrypted with your biometric data and stored locally. 
                Biometric authentication only works on this device and cannot be transferred to other devices.
              </Typography>
            </Alert>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default BiometricSetup;