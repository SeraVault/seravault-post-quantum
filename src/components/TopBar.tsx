import React from 'react';
import { AppBar, Toolbar, Button, Box, IconButton } from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import SecurityStatusIndicator from './SecurityStatusIndicator';
import UserAvatar from './UserAvatar';
import NotificationBell from './NotificationBell';

interface TopBarProps {
  handleDrawerToggle: () => void;
}

const TopBar: React.FC<TopBarProps> = ({ handleDrawerToggle }) => {
  const { user } = useAuth();

  return (
    <AppBar position="fixed" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}>
      <Toolbar>
        <IconButton
          color="inherit"
          aria-label="open drawer"
          edge="start"
          onClick={handleDrawerToggle}
          sx={{ mr: 2 }}
        >
          <MenuIcon />
        </IconButton>
        <Box 
          component={Link} 
          to="/" 
          sx={{ 
            flexGrow: 1, 
            display: 'flex', 
            alignItems: 'center',
            textDecoration: 'none',
            gap: 1
          }}
        >
          <img 
            src="/seravault_logo.svg" 
            alt="SeraVault" 
            style={{ height: '32px', width: 'auto' }}
          />
        </Box>
        {user ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <SecurityStatusIndicator />
            <NotificationBell />
            <UserAvatar />
          </Box>
        ) : (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Button color="inherit" component={Link} to="/login">
              Login
            </Button>
            <Button color="inherit" component={Link} to="/signup">
              Sign Up
            </Button>
          </Box>
        )}
      </Toolbar>
    </AppBar>
  );
};

export default TopBar;