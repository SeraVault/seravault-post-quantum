import React from 'react';
import { Box, Typography, Button, Paper, Chip } from '@mui/material';
import { Link } from 'react-router-dom';

type EncryptionMethod = 'ML-KEM768';

interface EncryptionStatusSectionProps {
  encryptionMethod: EncryptionMethod;
}

const EncryptionStatusSection: React.FC<EncryptionStatusSectionProps> = ({ encryptionMethod }) => {
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
          color="success"
          sx={{ mr: 1 }}
        />
        <Typography variant="body2" color="success.main" sx={{ mt: 1 }}>
          ✓ You're using quantum-safe ML-KEM-768 encryption
        </Typography>
      </Box>
    </Paper>
  );
};

export default EncryptionStatusSection;