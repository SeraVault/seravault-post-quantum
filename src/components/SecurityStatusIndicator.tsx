import React, { useState } from 'react';
import { Box, IconButton, Tooltip, Typography } from '@mui/material';
import { Security, SecurityOutlined, LockOutlined } from '@mui/icons-material';
import { usePassphrase } from '../auth/PassphraseContext';
import { useAuth } from '../auth/AuthContext';
import { secureStorage } from '../utils/secureStorage';
import BiometricPassphraseDialog from './BiometricPassphraseDialog';

const SecurityStatusIndicator: React.FC = () => {
  const { privateKey, clearPrivateKey, requestUnlock } = usePassphrase();
  const { user } = useAuth();

  if (!user) {
    return null;
  }

  if (privateKey) {
    // Key is unlocked - show green indicator with timer and lock button
    const timeRemaining = secureStorage.getTimeUntilExpiration('privateKey');
    const minutesRemaining = Math.ceil(timeRemaining / (1000 * 60));

    return (
      <Tooltip title={`🔓 Private key unlocked • ${minutesRemaining} minutes remaining • Keys auto-expire for security`}>
        <Box sx={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: 1,
          backgroundColor: 'rgba(76, 175, 80, 0.15)',
          padding: '4px 8px',
          borderRadius: '16px',
          border: '1px solid rgba(76, 175, 80, 0.3)',
          cursor: 'default',
        }}>
          <Security sx={{ color: '#66bb6a', fontSize: '16px' }} />
          <Typography 
            variant="caption" 
            sx={{ 
              color: '#ffffff', 
              fontWeight: 'bold',
              fontSize: '0.8rem',
              textShadow: '0 1px 2px rgba(0,0,0,0.5)',
              minWidth: '20px',
            }}
          >
            {`${minutesRemaining}m`}
          </Typography>
          
          <Tooltip title="🔒 Lock private key now">
            <IconButton 
              size="small" 
              onClick={clearPrivateKey}
              sx={{ 
                color: 'rgba(255, 255, 255, 0.8)',
                padding: '2px',
                '&:hover': {
                  color: '#ffffff',
                  backgroundColor: 'rgba(255, 255, 255, 0.1)',
                },
              }}
            >
              <SecurityOutlined fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      </Tooltip>
    );
  } else {
    // Key is locked - show red indicator with unlock button
    return (
      <Tooltip title="🔒 Private key is locked • Click to unlock and access encrypted files">
        <Box sx={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: 1,
          backgroundColor: 'rgba(244, 67, 54, 0.15)',
          padding: '4px 8px',
          borderRadius: '16px',
          border: '1px solid rgba(244, 67, 54, 0.3)',
          cursor: 'pointer',
        }}
        onClick={requestUnlock}
        >
          <LockOutlined sx={{ color: '#f44336', fontSize: '16px' }} />
          <Typography 
            variant="caption" 
            sx={{ 
              color: '#ffffff', 
              fontWeight: 'bold',
              fontSize: '0.8rem',
              textShadow: '0 1px 2px rgba(0,0,0,0.5)',
            }}
          >
            Locked
          </Typography>
        </Box>
      </Tooltip>
    );
  }
};

export default SecurityStatusIndicator;