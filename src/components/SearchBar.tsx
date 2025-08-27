import React from 'react';
import { TextField, InputAdornment, IconButton, useTheme, useMediaQuery } from '@mui/material';
import { Search, Clear } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';

interface SearchBarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  placeholder?: string;
}

const SearchBar: React.FC<SearchBarProps> = ({
  searchQuery,
  onSearchChange,
  placeholder,
}) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  
  const defaultPlaceholder = placeholder || t('search.searchPlaceholder');

  const handleClear = () => {
    onSearchChange('');
  };

  return (
    <TextField
      placeholder={defaultPlaceholder}
      variant="outlined"
      size="small"
      value={searchQuery}
      onChange={(e) => onSearchChange(e.target.value)}
      sx={{ 
        minWidth: isMobile ? '100%' : '250px',
        maxWidth: isMobile ? '100%' : '300px'
      }}
      InputProps={{
        startAdornment: (
          <InputAdornment position="start">
            <Search color="action" />
          </InputAdornment>
        ),
        endAdornment: searchQuery && (
          <InputAdornment position="end">
            <IconButton 
              size="small" 
              onClick={handleClear}
              edge="end"
            >
              <Clear />
            </IconButton>
          </InputAdornment>
        ),
      }}
    />
  );
};

export default SearchBar;