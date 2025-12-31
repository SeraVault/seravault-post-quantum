import React, { useState } from 'react';
import { Box, Typography, Button, Paper, Alert, Snackbar } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { type UserProfile } from '../firestore';
import ChangePassphraseDialog from './ChangePassphraseDialog';

interface KeyManagementSectionProps {
  userProfile: UserProfile | null;
  privateKey: string | null;
  onDownloadKey: () => void;
  onDownloadDecryptedKey: () => void;
}

const KeyManagementSection: React.FC<KeyManagementSectionProps> = ({
  userProfile,
  privateKey,
  onDownloadKey,
  onDownloadDecryptedKey,
}) => {
  const { t } = useTranslation();
  const [changePassphraseOpen, setChangePassphraseOpen] = useState(false);
  const [successMessage, setSuccessMessage] = useState(false);

  // Check if user has encrypted private key (it's an object with ciphertext, salt, nonce)
  const hasEncryptedKey = Boolean(
    userProfile?.encryptedPrivateKey && 
    typeof userProfile.encryptedPrivateKey === 'object' &&
    'ciphertext' in userProfile.encryptedPrivateKey
  );

  return (
    <>
      <Paper elevation={2} sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>{t('profile.keyManagement', 'Key Management')}</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {t('profile.keyManagementDescription', 'Backup and manage your encryption keys')}
        </Typography>
        
        {!hasEncryptedKey && (
          <Alert severity="info" sx={{ mb: 2 }}>
            <Typography variant="body2">
              {t('profile.hardwareKeyInfo', "You're using hardware key authentication. Your private key is stored securely on your device and not protected by a passphrase. You can still download your decrypted key for backup purposes.")}
            </Typography>
          </Alert>
        )}
        
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'start' }}>
          <Box>
            <Button
              variant="outlined"
              onClick={onDownloadKey}
              disabled={!hasEncryptedKey}
              sx={{ mb: 1 }}
            >
              {t('profile.downloadKeyBackup', 'Download Key Backup')}
            </Button>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', maxWidth: 250 }}>
              {hasEncryptedKey 
                ? t('profile.downloadKeyBackupDesc', 'Downloads a JSON file containing your encrypted private key. Safe to store as backup.')
                : t('profile.notAvailableHardwareKey', 'Not available when using hardware key authentication only.')}
            </Typography>
          </Box>
          
          <Box>
            <Button
              variant="outlined"
              color="warning"
              onClick={onDownloadDecryptedKey}
              disabled={!privateKey}
              sx={{ mb: 1 }}
            >
              {t('profile.downloadDecryptedKey', 'Download Decrypted Key')}
            </Button>
            <Typography variant="caption" color="warning.main" sx={{ display: 'block', maxWidth: 250 }}>
              {t('profile.downloadDecryptedKeyWarning', '⚠️ Downloads your private key in plain text.')} {hasEncryptedKey 
                ? t('profile.downloadDecryptedKeySecurityRisk', 'Only use if you understand the security risks.') 
                : t('profile.downloadDecryptedKeyBackup', 'Use this to backup your key when using hardware authentication.')}
            </Typography>
          </Box>

          <Box>
            <Button
              variant="outlined"
              onClick={() => setChangePassphraseOpen(true)}
              disabled={!hasEncryptedKey}
              sx={{ mb: 1 }}
            >
              {t('profile.changePassphrase', 'Change Passphrase')}
            </Button>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', maxWidth: 250 }}>
              {hasEncryptedKey 
                ? t('profile.changePassphraseDesc', 'Update the passphrase used to encrypt your private key.')
                : t('profile.notAvailableHardwareKey', 'Not available when using hardware key authentication only.')}
            </Typography>
          </Box>
        </Box>
        
        {!privateKey && (
          <Alert severity="info" sx={{ mt: 2 }}>
            <Typography variant="body2">
              {t('profile.unlockKeyRequired', 'To download your decrypted private key, you must first unlock your key using your passphrase, biometric authentication, or key file.')}
            </Typography>
          </Alert>
        )}
      </Paper>

      <ChangePassphraseDialog
        open={changePassphraseOpen}
        onClose={() => setChangePassphraseOpen(false)}
        onSuccess={() => {
          setSuccessMessage(true);
          console.log('✅ Passphrase changed successfully');
        }}
      />

      <Snackbar
        open={successMessage}
        autoHideDuration={6000}
        onClose={() => setSuccessMessage(false)}
        message={t('profile.passphraseChangedSuccess', '✅ Passphrase changed successfully! Use your new passphrase the next time you unlock your keys.')}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </>
  );
};

export default KeyManagementSection;