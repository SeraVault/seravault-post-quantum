import React, { useState, useEffect } from 'react';
import {
  Avatar,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  IconButton,
  Divider,
} from '@mui/material';
import {
  AccountCircle as ProfileIcon,
  Logout as LogoutIcon,
  Brightness4,
  Brightness7,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useThemeContext } from '../theme/ThemeContext';
import { useTranslation } from 'react-i18next';
import { getUserProfile } from '../firestore';

/* Language definitions - temporarily disabled
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
*/

const UserAvatar: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { mode, toggleTheme } = useThemeContext();
  const { i18n } = useTranslation();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);

  // Load user's language preference on login
  useEffect(() => {
    const loadUserLanguage = async () => {
      if (user) {
        const profile = await getUserProfile(user.uid);
        if (profile?.language && profile.language !== i18n.language) {
          i18n.changeLanguage(profile.language);
        }
      }
    };
    loadUserLanguage();
  }, [user, i18n]);

  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleProfile = () => {
    handleClose();
    navigate('/profile');
  };

  const handleLogout = async () => {
    handleClose();
    await logout();
  };

  const handleThemeToggle = () => {
    toggleTheme();
    handleClose();
  };

  /* Language change handler - temporarily disabled
  const handleLanguageChange = async (languageCode: string) => {
    i18n.changeLanguage(languageCode);
    // Don't close the menu when changing language - let user see the change

    // Save to user profile if logged in
    if (user) {
      try {
        await updateUserProfile(user.uid, { language: languageCode });
      } catch (error) {
        console.error('Failed to update language preference:', error);
      }
    }
  };
  */

  if (!user) return null;

  // Get first letter of display name or email
  const displayName = user.displayName || user.email || 'U';
  const avatarLetter = displayName.charAt(0).toUpperCase();
  // const currentLanguage = languages.find(lang => lang.code === i18n.language) || languages[0];

  return (
    <>
      <IconButton
        onClick={handleClick}
        size="small"
        sx={{ ml: { xs: 0.5, sm: 2 } }}
        aria-controls={open ? 'account-menu' : undefined}
        aria-haspopup="true"
        aria-expanded={open ? 'true' : undefined}
      >
        <Avatar 
          sx={{ 
            width: 32, 
            height: 32, 
            bgcolor: 'primary.main',
            fontSize: '0.875rem',
            fontWeight: 600
          }}
        >
          {avatarLetter}
        </Avatar>
      </IconButton>
      <Menu
        anchorEl={anchorEl}
        id="account-menu"
        open={open}
        onClose={handleClose}
        onClick={handleClose}
        PaperProps={{
          elevation: 3,
          sx: {
            mt: 1.5,
            minWidth: 180,
            '& .MuiAvatar-root': {
              width: 32,
              height: 32,
              ml: -0.5,
              mr: 1,
            },
          },
        }}
        transformOrigin={{ horizontal: 'right', vertical: 'top' }}
        anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
      >
        <MenuItem onClick={handleProfile}>
          <ListItemIcon>
            <ProfileIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Profile</ListItemText>
        </MenuItem>
        <Divider />
        <MenuItem onClick={handleThemeToggle}>
          <ListItemIcon>
            {mode === 'light' ? <Brightness4 fontSize="small" /> : <Brightness7 fontSize="small" />}
          </ListItemIcon>
          <ListItemText>
            {mode === 'light' ? 'Dark Theme' : 'Light Theme'}
          </ListItemText>
        </MenuItem>
        {/* Language selection temporarily disabled
        <MenuItem sx={{ py: 1 }}>
          <ListItemIcon>
            <LanguageIcon fontSize="small" />
          </ListItemIcon>
          <Box sx={{ flex: 1 }}>
            <Typography variant="body2" sx={{ fontWeight: 500, mb: 1 }}>
              Language
            </Typography>
            <FormControl size="small" fullWidth>
              <Select
                value={i18n.language}
                onChange={(e) => handleLanguageChange(e.target.value)}
                sx={{
                  '& .MuiSelect-select': {
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    py: 0.5
                  }
                }}
                MenuProps={{
                  PaperProps: {
                    sx: {
                      mt: 0.5
                    }
                  }
                }}
              >
                {languages.map((language) => (
                  <MenuItem key={language.code} value={language.code}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <span style={{ fontSize: '16px' }}>{language.flag}</span>
                      <Typography variant="body2">
                        {language.nativeName}
                      </Typography>
                    </Box>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
        </MenuItem>
        */}
        <Divider />
        <MenuItem onClick={handleLogout}>
          <ListItemIcon>
            <LogoutIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Logout</ListItemText>
        </MenuItem>
      </Menu>
    </>
  );
};

export default UserAvatar;