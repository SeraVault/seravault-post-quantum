import React from 'react';
import { Box, Typography } from '@mui/material';
import { CheckCircle, RadioButtonUnchecked } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';

interface PassphraseRequirementsProps {
  passphrase: string;
}

const PassphraseRequirements: React.FC<PassphraseRequirementsProps> = ({ passphrase }) => {
  const { t } = useTranslation();
  
  const requirements = [
    { label: t('profile.passphraseRequirementMinLength', 'At least 12 characters'), test: (pwd: string) => pwd.length >= 12 },
    { label: t('profile.passphraseRequirementUppercase', 'One uppercase letter'), test: (pwd: string) => /[A-Z]/.test(pwd) },
    { label: t('profile.passphraseRequirementLowercase', 'One lowercase letter'), test: (pwd: string) => /[a-z]/.test(pwd) },
    { label: t('profile.passphraseRequirementNumber', 'One number'), test: (pwd: string) => /\d/.test(pwd) },
    { label: t('profile.passphraseRequirementSpecial', 'One special character'), test: (pwd: string) => /[^a-zA-Z\d]/.test(pwd) },
  ];

  if (!passphrase) return null;

  return (
    <Box sx={{ mb: 2 }}>
      <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
        {t('profile.passphraseRequirements', 'Passphrase Requirements:')}
      </Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        {requirements.map((req, index) => {
          const isMet = req.test(passphrase);
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

export default PassphraseRequirements;
