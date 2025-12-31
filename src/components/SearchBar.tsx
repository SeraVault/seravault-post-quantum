import React, { useState } from 'react';
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
  const [inputValue, setInputValue] = useState(searchQuery);
  
  const defaultPlaceholder = placeholder || t('search.searchPlaceholder');

  const handleClear = () => {
    setInputValue('');
    onSearchChange('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      onSearchChange(inputValue);
    } else if (e.key === 'Escape') {
      handleClear();
    }
  };

  // Sync input value when searchQuery is cleared externally
  React.useEffect(() => {
    if (searchQuery === '') {
      setInputValue('');
    }
  }, [searchQuery]);

  // Auto-reset search when user deletes all characters
  React.useEffect(() => {
    if (inputValue.trim() === '' && searchQuery !== '') {
      onSearchChange('');
    }
  }, [inputValue, searchQuery, onSearchChange]);

  return (
    <TextField
      placeholder={defaultPlaceholder}
      variant="outlined"
      size="small"
      value={inputValue}
      onChange={(e) => setInputValue(e.target.value)}
      onKeyDown={handleKeyDown}
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
        endAdornment: inputValue && (
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