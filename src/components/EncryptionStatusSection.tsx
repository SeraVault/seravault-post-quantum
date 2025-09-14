import React from 'react';
import { Box, Typography, Button, Paper, TextField, Chip, LinearProgress } from '@mui/material';
import { Link } from 'react-router-dom';

type EncryptionMethod = 'ML-KEM768' | 'Legacy';

interface EncryptionStatusSectionProps {
  encryptionMethod: EncryptionMethod;
  showKeyRegeneration: boolean;
  passphrase: string;
  confirmPassphrase: string;
  migrationProgress: { current: number; total: number } | null;
  onSetShowKeyRegeneration: (show: boolean) => void;
  onSetPassphrase: (passphrase: string) => void;
  onSetConfirmPassphrase: (confirmPassphrase: string) => void;
  onRegenerateKeys: () => void;
  onCancelRegeneration: () => void;
}

const EncryptionStatusSection: React.FC<EncryptionStatusSectionProps> = ({
  encryptionMethod,
  showKeyRegeneration,
  passphrase,
  confirmPassphrase,
  migrationProgress,
  onSetShowKeyRegeneration,
  onSetPassphrase,
  onSetConfirmPassphrase,
  onRegenerateKeys,
  onCancelRegeneration,
}) => {
  return (
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
          label={encryptionMethod}
          color={encryptionMethod === 'ML-KEM768' ? 'success' : 'error'}
          sx={{ mr: 1 }}
        />
        {encryptionMethod === 'ML-KEM768' && (
          <Typography variant="body2" color="success.main" sx={{ mt: 1 }}>
            ✓ You're using quantum-safe ML-KEM-768 encryption
          </Typography>
        )}
        {encryptionMethod === 'Legacy' && (
          <Typography variant="body2" color="error.main" sx={{ mt: 1 }}>
            Your encryption keys need to be updated for security
          </Typography>
        )}
      </Box>
      
      <Box>
        {!showKeyRegeneration ? (
          <Button 
            variant="contained" 
            color={encryptionMethod === 'ML-KEM768' ? 'primary' : 'error'}
            onClick={() => onSetShowKeyRegeneration(true)}
          >
            {encryptionMethod === 'ML-KEM768' ? 'Regenerate Quantum-Safe Keys' : 'Generate Quantum-Safe Keys'}
          </Button>
        ) : (
          <Box sx={{ p: 2, bgcolor: 'background.default', borderRadius: 1 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              <strong>Important:</strong> {encryptionMethod === 'ML-KEM768' ? 'Regenerating your quantum-safe keys will replace your current encryption keys.' : 'Regenerating your keys will create new quantum-safe ML-KEM-768 encryption keys.'} 
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
              onChange={(e) => onSetPassphrase(e.target.value)}
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
              onChange={(e) => onSetConfirmPassphrase(e.target.value)}
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
                onClick={onRegenerateKeys}
                sx={{ mr: 1 }}
                disabled={!!migrationProgress}
              >
                {encryptionMethod === 'ML-KEM768' ? 'Regenerate Quantum-Safe Keys' : 'Generate Quantum-Safe Keys'}
              </Button>
              <Button 
                variant="outlined"
                onClick={onCancelRegeneration}
                disabled={!!migrationProgress}
              >
                Cancel
              </Button>
            </Box>
          </Box>
        )}
      </Box>
    </Paper>
  );
};

export default EncryptionStatusSection;