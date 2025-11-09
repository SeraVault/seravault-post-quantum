import React, { useState } from 'react';
import { Container, Paper, Typography, TextField, Button, Alert, Box, FormControlLabel, Checkbox, Divider } from '@mui/material';
import { type UserProfile } from '../firestore';

interface KeyGenerationFormProps {
  userProfile: UserProfile | null;
  displayName: string;
  passphrase: string;
  confirmPassphrase: string;
  error: string | null;
  onDisplayNameChange: (name: string) => void;
  onPassphraseChange: (passphrase: string) => void;
  onConfirmPassphraseChange: (confirmPassphrase: string) => void;
  onGenerateKeys: (useHardwareStorage: boolean) => void;
}

const KeyGenerationForm: React.FC<KeyGenerationFormProps> = ({
  userProfile,
  displayName,
  passphrase,
  confirmPassphrase,
  error,
  onDisplayNameChange,
  onPassphraseChange,
  onConfirmPassphraseChange,
  onGenerateKeys,
}) => {
  const [useHardwareStorage, setUseHardwareStorage] = useState(false);
  
  return (
    <Container component="main" maxWidth="sm">
      <Paper elevation={3} sx={{ padding: 4, marginTop: 8, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <Typography component="h1" variant="h5">
          {(userProfile?.publicKey || userProfile?.encryptedPrivateKey) ? 'Regenerate Your Secure Key Pair' : 'Create Your Secure Key Pair'}
        </Typography>
        
        <Alert severity="info" sx={{ mt: 2, width: '100%' }}>
          <Typography variant="body2">
            <strong>Your keys are generated on YOUR device</strong> - they never travel to our servers unencrypted.
            This ensures maximum security and privacy.
          </Typography>
        </Alert>
        
        <Typography variant="body1" sx={{ mt: 2, mb: 2 }}>
          {(userProfile?.publicKey || userProfile?.encryptedPrivateKey)
            ? 'Your account needs updated post-quantum secure keys. Please regenerate your key pair with a strong passphrase.'
            : 'To secure your documents, you need to generate a post-quantum secure key pair. Please enter a display name and choose your preferred key storage method below.'
          }
        </Typography>
        
        {!useHardwareStorage && (
          <Alert severity="warning" sx={{ mt: 2, mb: 2, width: '100%' }}>
            <Typography variant="body2" sx={{ fontWeight: 'bold', mb: 1 }}>
              🔒 Create a Strong Passphrase
            </Typography>
            <Typography variant="body2" sx={{ mb: 1 }}>
              Your passphrase is the ONLY way to decrypt your private key. If you lose it, your data cannot be recovered.
            </Typography>
            <Typography variant="body2" component="div">
              <strong>Good passphrases:</strong>
              <ul style={{ margin: '4px 0', paddingLeft: '20px' }}>
                <li>"Coffee-Mountain-Bicycle-2024!" (random words + year)</li>
                <li>"MyDog&Spot!Loves2Run" (memorable phrase with numbers/symbols)</li>
                <li>"I♥Paris!Visited2019" (personal memory with substitutions)</li>
              </ul>
            </Typography>
            <Typography variant="body2" component="div">
              <strong>Bad passphrases:</strong>
              <ul style={{ margin: '4px 0', paddingLeft: '20px' }}>
                <li>"password123" (too common)</li>
                <li>"MyName2024" (too predictable)</li>
                <li>Short phrases under 12 characters</li>
              </ul>
            </Typography>
          </Alert>
        )}
        
        {useHardwareStorage && (
          <Alert severity="info" sx={{ mt: 2, mb: 2, width: '100%' }}>
            <Typography variant="body2" sx={{ fontWeight: 'bold', mb: 1 }}>
              🔑 Optional Backup Passphrase
            </Typography>
            <Typography variant="body2">
              With hardware key storage, you can optionally also set a passphrase as a backup method. 
              This allows you to access your files even if you don't have your hardware key with you.
            </Typography>
          </Alert>
        )}
        
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
          onChange={(e) => onDisplayNameChange(e.target.value)}
        />
        <TextField
          margin="normal"
          required={!useHardwareStorage}
          fullWidth
          name="passphrase"
          label={useHardwareStorage ? "Backup Passphrase (Optional)" : "Passphrase"}
          type="password"
          id="passphrase"
          value={passphrase}
          onChange={(e) => onPassphraseChange(e.target.value)}
          helperText={useHardwareStorage ? "Optional: Set a backup passphrase to access files without your hardware key" : ""}
        />
        <TextField
          margin="normal"
          required={!useHardwareStorage}
          fullWidth
          name="confirmPassphrase"
          label={useHardwareStorage ? "Confirm Backup Passphrase (Optional)" : "Confirm Passphrase"}
          type="password"
          id="confirmPassphrase"
          value={confirmPassphrase}
          onChange={(e) => onConfirmPassphraseChange(e.target.value)}
          helperText={useHardwareStorage ? "Recommended: Provides backup access if hardware key is unavailable" : ""}
        />
        
        <Divider sx={{ width: '100%', my: 3 }} />
        
        <Box sx={{ width: '100%', mb: 2 }}>
          <Typography variant="h6" gutterBottom>
            Advanced Security Options
          </Typography>
          
          <FormControlLabel
            control={
              <Checkbox 
                checked={useHardwareStorage}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUseHardwareStorage(e.target.checked)}
              />
            }
            label={
              <Box>
                <Typography variant="body2">
                  <strong>Store my private key in a hardware security key (YubiKey, etc.)</strong>
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Maximum paranoid mode: Your private key will be encrypted and stored in your browser, 
                  decryptable only by your physical hardware key. It will NEVER be sent to our servers, 
                  even in encrypted form.
                </Typography>
              </Box>
            }
          />
          
          {useHardwareStorage && (
            <Alert severity="warning" sx={{ mt: 2 }}>
              <Typography variant="body2">
                <strong>Important:</strong> You'll need your hardware key every time you access your files
                {passphrase && passphrase.length >= 12 ? ' (or your backup passphrase)' : ''}. 
                We recommend {passphrase && passphrase.length >= 12 ? 'also ' : ''}registering at least 2 hardware keys 
                {passphrase && passphrase.length >= 12 ? ' in addition to your passphrase backup' : ' or setting a backup passphrase'} 
                to avoid losing access to your data.
              </Typography>
            </Alert>
          )}
          
          {!useHardwareStorage && (
            <Alert severity="info" sx={{ mt: 2 }}>
              <Typography variant="body2">
                <strong>Standard mode:</strong> Your private key will be encrypted with your passphrase 
                and stored on our servers. You can add hardware key authentication later in your profile settings.
              </Typography>
            </Alert>
          )}
        </Box>
        
        <Button
          type="submit"
          fullWidth
          variant="contained"
          sx={{ mt: 3, mb: 2 }}
          onClick={() => onGenerateKeys(useHardwareStorage)}
        >
          {useHardwareStorage ? 'Generate Keys & Set Up Hardware Key' : 'Generate Keys'}
        </Button>
      </Paper>
    </Container>
  );
};

export default KeyGenerationForm;