import React, { useState } from 'react';
import { Container, Paper, Typography, TextField, Button, Alert, Box, FormControlLabel, Checkbox, Divider, CircularProgress } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { type UserProfile } from '../firestore';
import PasswordStrengthIndicator from './PasswordStrengthIndicator';
import PassphraseRequirements from './PassphraseRequirements';

interface KeyGenerationFormProps {
  userProfile: UserProfile | null;
  displayName: string;
  passphrase: string;
  confirmPassphrase: string;
  error: string | null;
  loading?: boolean;
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
  loading = false,
  onDisplayNameChange,
  onPassphraseChange,
  onConfirmPassphraseChange,
  onGenerateKeys,
}) => {
  const { t } = useTranslation();
  const [useHardwareStorage, setUseHardwareStorage] = useState(false);
  
  return (
    <Container component="main" maxWidth="sm">
      <Paper elevation={3} sx={{ padding: 4, marginTop: 8, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <Typography component="h1" variant="h5">
          {(userProfile?.publicKey || userProfile?.encryptedPrivateKey) ? t('profile.regenerateKeyPair', 'Regenerate Your Secure Key Pair') : t('profile.createKeyPair', 'Create Your Secure Key Pair')}
        </Typography>
        
        <Alert severity="info" sx={{ mt: 2, width: '100%' }}>
          <Typography variant="body2">
            <strong>{t('profile.keysGeneratedOnDevice', 'Your keys are generated on YOUR device')}</strong> - {t('profile.keysNeverSentUnencrypted', 'they never travel to our servers unencrypted. This ensures maximum security and privacy.')}
          </Typography>
        </Alert>
        
        <Typography variant="body1" sx={{ mt: 2, mb: 2 }}>
          {(userProfile?.publicKey || userProfile?.encryptedPrivateKey)
            ? t('profile.needUpdatedKeys', 'Your account needs updated post-quantum secure keys. Please regenerate your key pair with a strong passphrase.')
            : t('profile.generateKeysIntro', 'To secure your documents, you need to generate a post-quantum secure key pair. Please enter a display name and choose your preferred key storage method below.')
          }
        </Typography>
        
        {!useHardwareStorage && (
          <Alert severity="warning" sx={{ mt: 2, mb: 2, width: '100%' }}>
            <Typography variant="body2" sx={{ fontWeight: 'bold', mb: 1 }}>
              {t('profile.strongPassphraseTitle', '🔒 Create a Strong Passphrase')}
            </Typography>
            <Typography variant="body2" sx={{ mb: 1 }}>
              {t('profile.strongPassphraseWarning', 'Your passphrase is the ONLY way to decrypt your private key. If you lose it, your data cannot be recovered.')}
            </Typography>
            <Typography variant="body2" component="div">
              <strong>{t('profile.goodPassphrases', 'Good passphrases:')}</strong>
              <ul style={{ margin: '4px 0', paddingLeft: '20px' }}>
                <li>{t('profile.goodPassphraseExample1', '"Coffee-Mountain-Bicycle-2024!" (random words + year)')}</li>
                <li>{t('profile.goodPassphraseExample2', '"MyDog&Spot!Loves2Run" (memorable phrase with numbers/symbols)')}</li>
                <li>{t('profile.goodPassphraseExample3', '"I♥Paris!Visited2019" (personal memory with substitutions)')}</li>
              </ul>
            </Typography>
            <Typography variant="body2" component="div">
              <strong>{t('profile.badPassphrases', 'Bad passphrases:')}</strong>
              <ul style={{ margin: '4px 0', paddingLeft: '20px' }}>
                <li>{t('profile.badPassphraseExample1', '"password123" (too common)')}</li>
                <li>{t('profile.badPassphraseExample2', '"MyName2024" (too predictable)')}</li>
                <li>{t('profile.badPassphraseExample3', 'Short phrases under 12 characters')}</li>
              </ul>
            </Typography>
          </Alert>
        )}
        
        {useHardwareStorage && (
          <Alert severity="info" sx={{ mt: 2, mb: 2, width: '100%' }}>
            <Typography variant="body2" sx={{ fontWeight: 'bold', mb: 1 }}>
              {t('profile.optionalBackupPassphraseTitle', '🔑 Optional Backup Passphrase')}
            </Typography>
            <Typography variant="body2">
              {t('profile.optionalBackupPassphraseDesc', 'With hardware key storage, you can optionally also set a passphrase as a backup method. This allows you to access your files even if you don\'t have your hardware key with you.')}
            </Typography>
          </Alert>
        )}
        
        {error && <Alert severity="error" sx={{ mt: 2, width: '100%' }}>{error}</Alert>}
        <TextField
          margin="normal"
          required
          fullWidth
          id="displayName"
          label={t('profile.displayName', 'Display Name')}
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
          label={useHardwareStorage ? t('profile.backupPassphraseOptional', 'Backup Passphrase (Optional)') : t('profile.passphrase', 'Passphrase')}
          type="password"
          id="passphrase"
          value={passphrase}
          onChange={(e) => onPassphraseChange(e.target.value)}
          helperText={useHardwareStorage ? t('profile.optionalBackupPassphraseHelper', 'Optional: Set a backup passphrase to access files without your hardware key') : ""}
        />
        {passphrase && <PasswordStrengthIndicator password={passphrase} label={t('profile.passphraseStrength', 'Passphrase Strength')} />}
        {passphrase && <PassphraseRequirements passphrase={passphrase} />}
        <TextField
          margin="normal"
          required={!useHardwareStorage}
          fullWidth
          name="confirmPassphrase"
          label={useHardwareStorage ? t('profile.confirmBackupPassphraseOptional', 'Confirm Backup Passphrase (Optional)') : t('profile.confirmPassphrase', 'Confirm Passphrase')}
          type="password"
          id="confirmPassphrase"
          value={confirmPassphrase}
          onChange={(e) => onConfirmPassphraseChange(e.target.value)}
          helperText={useHardwareStorage ? t('profile.recommendedBackupAccess', 'Recommended: Provides backup access if hardware key is unavailable') : ""}
        />
        
        <Divider sx={{ width: '100%', my: 3 }} />
        
        <Box sx={{ width: '100%', mb: 2 }}>
          <Typography variant="h6" gutterBottom>
            {t('profile.advancedSecurityOptions', 'Advanced Security Options')}
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
                  <strong>{t('profile.useHardwareKeyStorage', 'Store my private key in a hardware security key (YubiKey, etc.)')}</strong>
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {t('profile.hardwareKeyStorageDesc', 'Maximum paranoid mode: Your private key will be encrypted and stored in your browser, decryptable only by your physical hardware key. Without a backup passphrase, it will NEVER be sent to our servers. With a backup passphrase, only the passphrase-encrypted version is stored.')}
                </Typography>
              </Box>
            }
          />
          
          {useHardwareStorage && (
            <Alert severity="warning" sx={{ mt: 2 }}>
              <Typography variant="body2">
                <strong>{t('profile.criticalWarning', 'Critical Warning:')}</strong> {t('profile.hardwareKeysCannotBeCopied', 'Hardware keys cannot be copied or cloned.')} 
                {' '}{passphrase && passphrase.length >= 12 
                  ? t('profile.hardwareKeyLossWithPassphrase', 'If you lose all your hardware keys AND forget your backup passphrase, you will permanently lose access to your files. We strongly recommend registering at least one additional backup hardware key in Profile → Security.')
                  : t('profile.hardwareKeyLossWithoutPassphrase', 'Without a backup passphrase, losing your only hardware key means permanent data loss. We strongly recommend registering additional backup hardware keys immediately after signup (Profile → Security → Hardware Keys) while you still have access to this hardware key.')}
              </Typography>
            </Alert>
          )}
          
          {!useHardwareStorage && (
            <Alert severity="info" sx={{ mt: 2 }}>
              <Typography variant="body2">
                <strong>{t('profile.standardMode', 'Standard mode:')}</strong> {t('profile.standardModeDesc', 'Your private key will be encrypted with your passphrase and stored on our servers. You can add hardware key authentication later in your profile settings.')}
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
          disabled={loading}
          startIcon={loading ? <CircularProgress size={20} color="inherit" /> : undefined}
        >
          {loading 
            ? t('profile.generatingKeys', 'Generating Keys...')
            : useHardwareStorage 
              ? t('profile.generateKeysAndSetupHardware', 'Generate Keys & Set Up Hardware Key') 
              : t('profile.generateKeyPair', 'Generate Key Pair')
          }
        </Button>
      </Paper>
    </Container>
  );
};

export default KeyGenerationForm;