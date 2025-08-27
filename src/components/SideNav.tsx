import React from 'react';
import { 
  Drawer, 
  Toolbar, 
  List, 
  ListItemText, 
  ListItemButton, 
  useTheme, 
  useMediaQuery,
  Box,
  Typography,
  Divider,
  ListItemIcon,
  Avatar
} from '@mui/material';
import {
  Home,
  Folder,
  Share,
  Delete,
  Star,
  AccessTime,
  CloudSync,
  Security
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import FolderTree from './FolderTree';
import { useFolders } from '../hooks/useFolders';

interface SideNavProps {
  drawerWidth: number;
  mobileOpen: boolean;
  handleDrawerToggle: () => void;
  currentFolder: string | null;
  setCurrentFolder: (folderId: string | null) => void;
}

const SideNav: React.FC<SideNavProps> = ({
  drawerWidth,
  mobileOpen,
  handleDrawerToggle,
  currentFolder: _, // Unused but required by interface
  setCurrentFolder,
}) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { allFolders } = useFolders();


  const drawerContent = (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Toolbar />
      
      {/* Quick Access Section */}
      <Box sx={{ px: 2, pt: 2, pb: 1 }}>
        <Typography 
          variant="caption" 
          sx={{ 
            fontWeight: 600, 
            color: 'text.secondary',
            fontSize: '11px',
            textTransform: 'uppercase',
            letterSpacing: '0.5px'
          }}
        >
          {t('navigation.quickAccess', 'Quick Access')}
        </Typography>
      </Box>
      
      <List dense sx={{ px: 1 }}>
        <ListItemButton 
          onClick={() => setCurrentFolder(null)}
          sx={{
            borderRadius: 1,
            mx: 1,
            mb: 0.5,
            '&:hover': {
              backgroundColor: 'action.hover',
            }
          }}
        >
          <ListItemIcon sx={{ minWidth: 32 }}>
            <Home fontSize="small" />
          </ListItemIcon>
          <ListItemText 
            primary={t('navigation.home')} 
            primaryTypographyProps={{ fontSize: '14px' }}
          />
        </ListItemButton>
        
        <ListItemButton
          sx={{
            borderRadius: 1,
            mx: 1,
            mb: 0.5,
            '&:hover': {
              backgroundColor: 'action.hover',
            }
          }}
        >
          <ListItemIcon sx={{ minWidth: 32 }}>
            <Star fontSize="small" />
          </ListItemIcon>
          <ListItemText 
            primary={t('navigation.favorites', 'Favorites')} 
            primaryTypographyProps={{ fontSize: '14px' }}
          />
        </ListItemButton>
        
        <ListItemButton
          sx={{
            borderRadius: 1,
            mx: 1,
            mb: 0.5,
            '&:hover': {
              backgroundColor: 'action.hover',
            }
          }}
        >
          <ListItemIcon sx={{ minWidth: 32 }}>
            <AccessTime fontSize="small" />
          </ListItemIcon>
          <ListItemText 
            primary={t('navigation.recent', 'Recent')} 
            primaryTypographyProps={{ fontSize: '14px' }}
          />
        </ListItemButton>
      </List>
      
      <Divider sx={{ mx: 2, my: 1 }} />
      
      {/* SeraVault Section */}
      <Box sx={{ px: 2, pt: 1, pb: 1 }}>
        <Typography 
          variant="caption" 
          sx={{ 
            fontWeight: 600, 
            color: 'text.secondary',
            fontSize: '11px',
            textTransform: 'uppercase',
            letterSpacing: '0.5px'
          }}
        >
          SeraVault
        </Typography>
      </Box>
      
      <List dense sx={{ px: 1, flexGrow: 1 }}>
        <ListItemButton 
          onClick={() => setCurrentFolder(null)}
          sx={{
            borderRadius: 1,
            mx: 1,
            mb: 0.5,
            '&:hover': {
              backgroundColor: 'action.hover',
            }
          }}
        >
          <ListItemIcon sx={{ minWidth: 32 }}>
            <Security fontSize="small" />
          </ListItemIcon>
          <ListItemText 
            primary={t('navigation.allFiles', 'All Files')} 
            primaryTypographyProps={{ fontSize: '14px' }}
          />
        </ListItemButton>
        
        <Box sx={{ ml: 1 }}>
          <FolderTree folders={allFolders} onFolderClick={setCurrentFolder} />
        </Box>
        
        <ListItemButton
          sx={{
            borderRadius: 1,
            mx: 1,
            mb: 0.5,
            '&:hover': {
              backgroundColor: 'action.hover',
            }
          }}
        >
          <ListItemIcon sx={{ minWidth: 32 }}>
            <Share fontSize="small" />
          </ListItemIcon>
          <ListItemText 
            primary={t('navigation.shared')} 
            primaryTypographyProps={{ fontSize: '14px' }}
          />
        </ListItemButton>
        
        <ListItemButton
          sx={{
            borderRadius: 1,
            mx: 1,
            mb: 0.5,
            '&:hover': {
              backgroundColor: 'action.hover',
            }
          }}
        >
          <ListItemIcon sx={{ minWidth: 32 }}>
            <Delete fontSize="small" />
          </ListItemIcon>
          <ListItemText 
            primary="Trash" 
            primaryTypographyProps={{ fontSize: '14px' }}
          />
        </ListItemButton>
      </List>
      
      {/* Storage Info */}
      <Box sx={{ px: 2, py: 1, borderTop: 1, borderColor: 'divider' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
          <CloudSync fontSize="small" sx={{ mr: 1, color: 'text.secondary' }} />
          <Typography variant="caption" color="text.secondary">
            Storage: 2.1 GB of 15 GB used
          </Typography>
        </Box>
        <Box 
          sx={{ 
            height: 4, 
            backgroundColor: 'grey.300',
            borderRadius: 2,
            overflow: 'hidden'
          }}
        >
          <Box 
            sx={{ 
              height: '100%', 
              width: '14%',
              backgroundColor: 'primary.main',
              borderRadius: 2
            }} 
          />
        </Box>
      </Box>
    </Box>
  );

  return (
    <Drawer
      variant={isMobile ? 'temporary' : 'permanent'}
      open={isMobile ? mobileOpen : true}
      onClose={handleDrawerToggle}
      sx={{
        width: drawerWidth,
        flexShrink: 0,
        [`& .MuiDrawer-paper`]: { 
          width: drawerWidth, 
          boxSizing: 'border-box',
          position: 'relative',
          height: '100%',
          borderRight: 1,
          borderColor: 'divider',
          backgroundColor: theme.palette.mode === 'dark' ? 'grey.900' : 'grey.50',
          overflowX: 'hidden'
        },
      }}
    >
      {drawerContent}
    </Drawer>
  );
};

export default SideNav;