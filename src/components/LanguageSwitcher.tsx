import React from 'react';
import {
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Box,
  Typography,
} from '@mui/material';
import {
  Language as LanguageIcon,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';

interface Language {
  code: string;
  name: string;
  nativeName: string;
  flag: string;
}

const languages: Language[] = [
  { code: 'en', name: 'English', nativeName: 'English', flag: '🇺🇸' },
  { code: 'fr', name: 'French', nativeName: 'Français', flag: '🇫🇷' },
  { code: 'es', name: 'Spanish', nativeName: 'Español', flag: '🇪🇸' },
];

interface LanguageSwitcherProps {
  variant?: 'select' | 'compact';
  showIcon?: boolean;
}

const LanguageSwitcher: React.FC<LanguageSwitcherProps> = ({ 
  variant = 'select', 
  showIcon = true 
}) => {
  const { i18n } = useTranslation();

  const handleLanguageChange = (languageCode: string) => {
    i18n.changeLanguage(languageCode);
  };

  const currentLanguage = languages.find(lang => lang.code === i18n.language) || languages[0];

  if (variant === 'compact') {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        {showIcon && <LanguageIcon sx={{ fontSize: 20, color: 'text.secondary' }} />}
        <FormControl size="small" variant="outlined" sx={{ minWidth: 120 }}>
          <Select
            value={i18n.language}
            onChange={(e) => handleLanguageChange(e.target.value)}
            displayEmpty
            sx={{ 
              '& .MuiSelect-select': {
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                py: 1,
              }
            }}
          >
            {languages.map((language) => (
              <MenuItem 
                key={language.code} 
                value={language.code}
                sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
              >
                <span>{language.flag}</span>
                <Typography variant="body2">{language.nativeName}</Typography>
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      {showIcon && <LanguageIcon sx={{ fontSize: 20, color: 'text.secondary' }} />}
      <FormControl fullWidth variant="outlined">
        <InputLabel>Language</InputLabel>
        <Select
          value={i18n.language}
          onChange={(e) => handleLanguageChange(e.target.value)}
          label="Language"
          sx={{ 
            '& .MuiSelect-select': {
              display: 'flex',
              alignItems: 'center',
              gap: 1,
            }
          }}
        >
          {languages.map((language) => (
            <MenuItem 
              key={language.code} 
              value={language.code}
              sx={{ display: 'flex', alignItems: 'center', gap: 2 }}
            >
              <span style={{ fontSize: '1.2em' }}>{language.flag}</span>
              <Box>
                <Typography variant="body1">{language.name}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {language.nativeName}
                </Typography>
              </Box>
            </MenuItem>
          ))}
        </Select>
      </FormControl>
    </Box>
  );
};

export default LanguageSwitcher;