import React from 'react';
import { Container, Paper, Typography, TextField, Button, Alert } from '@mui/material';
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
  onGenerateKeys: () => void;
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
  return (
    <Container component="main" maxWidth="sm">
      <Paper elevation={3} sx={{ padding: 4, marginTop: 8, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <Typography component="h1" variant="h5">
          {(userProfile?.publicKey || userProfile?.encryptedPrivateKey || userProfile?.legacyEncryptedPrivateKey) ? 'Regenerate Your Secure Key Pair' : 'Create Your Secure Key Pair'}
        </Typography>
        <Typography variant="body1" sx={{ mt: 2, mb: 2 }}>
          {(userProfile?.publicKey || userProfile?.encryptedPrivateKey || userProfile?.legacyEncryptedPrivateKey)
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
          onChange={(e) => onDisplayNameChange(e.target.value)}
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
          onChange={(e) => onPassphraseChange(e.target.value)}
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
          onChange={(e) => onConfirmPassphraseChange(e.target.value)}
        />
        <Button
          type="submit"
          fullWidth
          variant="contained"
          sx={{ mt: 3, mb: 2 }}
          onClick={onGenerateKeys}
        >
          Generate Keys
        </Button>
      </Paper>
    </Container>
  );
};

export default KeyGenerationForm;