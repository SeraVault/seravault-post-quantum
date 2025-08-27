import React from 'react';
import { Box, IconButton, Tooltip, Typography } from '@mui/material';
import { Security, SecurityOutlined } from '@mui/icons-material';
import { usePassphrase } from '../auth/PassphraseContext';
import { secureStorage } from '../utils/secureStorage';

const SecurityStatusIndicator: React.FC = () => {
  const { privateKey, clearPrivateKey } = usePassphrase();

  if (!privateKey) {
    return null;
  }

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
};

export default SecurityStatusIndicator;