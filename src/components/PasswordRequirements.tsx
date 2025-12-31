import React from 'react';
import { Box, Typography } from '@mui/material';
import { CheckCircle, RadioButtonUnchecked } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';

interface PasswordRequirementsProps {
  password: string;
}

const PasswordRequirements: React.FC<PasswordRequirementsProps> = ({ password }) => {
  const { t } = useTranslation();
  
  const requirements = [
    { label: t('signup.requirementMinLength', 'At least 8 characters'), test: (pwd: string) => pwd.length >= 8 },
    { label: t('signup.requirementUppercase', 'One uppercase letter'), test: (pwd: string) => /[A-Z]/.test(pwd) },
    { label: t('signup.requirementLowercase', 'One lowercase letter'), test: (pwd: string) => /[a-z]/.test(pwd) },
    { label: t('signup.requirementNumber', 'One number'), test: (pwd: string) => /\d/.test(pwd) },
    { label: t('signup.requirementSpecial', 'One special character'), test: (pwd: string) => /[^a-zA-Z\d]/.test(pwd) },
  ];

  if (!password) return null;

  return (
    <Box sx={{ mb: 2 }}>
      <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
        {t('signup.passwordRequirements', 'Password Requirements:')}
      </Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        {requirements.map((req, index) => {
          const isMet = req.test(password);
          return (
            <Box 
              key={index} 
              sx={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: 0.75,
              }}
            >
              {isMet ? (
                <CheckCircle sx={{ fontSize: 16, color: 'success.main' }} />
              ) : (
                <RadioButtonUnchecked sx={{ fontSize: 16, color: 'text.disabled' }} />
              )}
              <Typography 
                variant="caption" 
                sx={{ 
                  color: isMet ? 'success.main' : 'text.secondary',
                  fontWeight: isMet ? 600 : 400,
                }}
              >
                {req.label}
              </Typography>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
};

export default PasswordRequirements;
