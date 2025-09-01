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
  IconButton,
} from '@mui/material';
import { Link } from 'react-router-dom';
import {
  Home,
  Share,
  Delete,
  Star,
  AccessTime,
  CloudSync,
  Security,
  Assignment,
  Info,
  ChevronLeft,
  ChevronRight,
  Person,
  ExitToApp
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import FolderTree from './FolderTree';
import { useFolders } from '../hooks/useFolders';
import { useRecents } from '../context/RecentsContext';
import { useAuth } from '../auth/AuthContext';
import { auth } from '../firebase';
import { signOut } from 'firebase/auth';

interface SideNavProps {
  drawerWidth: number;
  mobileOpen: boolean;
  desktopOpen?: boolean;
  handleDrawerToggle: () => void;
  currentFolder: string | null;
  setCurrentFolder: (folderId: string | null) => void;
  onOpenTemplateDesigner?: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

const SideNav: React.FC<SideNavProps> = ({
  drawerWidth,
  mobileOpen,
  desktopOpen = true,
  handleDrawerToggle,
  currentFolder: _, // Unused but required by interface
  setCurrentFolder,
  onOpenTemplateDesigner,
  collapsed = false,
  onToggleCollapse,
}) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { allFolders } = useFolders();
  const { isRecentsView, setIsRecentsView, isFavoritesView, setIsFavoritesView, isSharedView, setIsSharedView } = useRecents();
  const { user } = useAuth();

  const handleLogout = () => {
    signOut(auth);
  };


  const collapsedWidth = 64;
  const currentWidth = collapsed && !isMobile ? collapsedWidth : drawerWidth;

  const drawerContent = (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Toolbar sx={{ display: 'flex', justifyContent: collapsed && !isMobile ? 'center' : 'space-between' }}>
        {!collapsed && !isMobile && (
          <Typography variant="h6" sx={{ fontWeight: 600, color: 'primary.main' }}>
            SeraVault
          </Typography>
        )}
        {!isMobile && onToggleCollapse && (
          <IconButton
            onClick={onToggleCollapse}
            size="small"
            sx={{ 
              color: 'text.secondary',
              '&:hover': { backgroundColor: 'action.hover' }
            }}
          >
            {collapsed ? <ChevronRight /> : <ChevronLeft />}
          </IconButton>
        )}
      </Toolbar>
      
      {/* Quick Access Section */}
      {(!collapsed || isMobile) && (
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
      )}
      
      <List dense sx={{ px: 1 }}>
        <ListItemButton 
          onClick={() => {
            setCurrentFolder(null);
            setIsRecentsView(false);
            setIsFavoritesView(false);
            setIsSharedView(false);
          }}
          selected={!isRecentsView && !isFavoritesView && !isSharedView}
          sx={{
            borderRadius: 1,
            mx: 1,
            mb: 0.5,
            justifyContent: collapsed && !isMobile ? 'center' : 'flex-start',
            '&:hover': {
              backgroundColor: 'action.hover',
            }
          }}
          title={collapsed && !isMobile ? t('navigation.home') : undefined}
        >
          <ListItemIcon sx={{ minWidth: collapsed && !isMobile ? 'auto' : 32 }}>
            <Home fontSize="small" />
          </ListItemIcon>
          {(!collapsed || isMobile) && (
            <ListItemText 
              primary={t('navigation.home')} 
              primaryTypographyProps={{ fontSize: '14px' }}
            />
          )}
        </ListItemButton>
        
        <ListItemButton
          onClick={() => {
            setCurrentFolder(null);
            setIsRecentsView(false);
            setIsFavoritesView(true);
            setIsSharedView(false);
          }}
          selected={isFavoritesView}
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
          onClick={() => {
            setCurrentFolder(null);
            setIsRecentsView(true);
            setIsFavoritesView(false);
            setIsSharedView(false);
          }}
          selected={isRecentsView}
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
        
        {onOpenTemplateDesigner && (
          <ListItemButton
            onClick={() => {
              onOpenTemplateDesigner();
            }}
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
              <Assignment fontSize="small" />
            </ListItemIcon>
            <ListItemText 
              primary={t('navigation.templateDesigner', 'Template Designer')} 
              primaryTypographyProps={{ fontSize: '14px' }}
            />
          </ListItemButton>
        )}
      </List>
      
      <Divider sx={{ mx: 2, my: 1 }} />
      
      {/* SeraVault Section */}
      {(!collapsed || isMobile) && (
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
      )}
      
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
          onClick={() => {
            setCurrentFolder(null);
            setIsRecentsView(false);
            setIsFavoritesView(false);
            setIsSharedView(true);
          }}
          selected={isSharedView}
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

        <ListItemButton
          component={Link}
          to="/security"
          sx={{
            borderRadius: 1,
            mx: 1,
            mb: 0.5,
            justifyContent: collapsed && !isMobile ? 'center' : 'flex-start',
            '&:hover': {
              backgroundColor: 'action.hover',
            }
          }}
          title={collapsed && !isMobile ? t('navigation.about', 'About') : undefined}
        >
          <ListItemIcon sx={{ minWidth: collapsed && !isMobile ? 'auto' : 32 }}>
            <Info fontSize="small" />
          </ListItemIcon>
          {(!collapsed || isMobile) && (
            <ListItemText 
              primary={t('navigation.about', 'About')} 
              primaryTypographyProps={{ fontSize: '14px' }}
            />
          )}
        </ListItemButton>

        {/* User Actions - Profile and Logout */}
        {user && (
          <>
            <Divider sx={{ mx: 2, my: 1 }} />
            
            <ListItemButton
              component={Link}
              to="/profile"
              sx={{
                borderRadius: 1,
                mx: 1,
                mb: 0.5,
                justifyContent: collapsed && !isMobile ? 'center' : 'flex-start',
                '&:hover': {
                  backgroundColor: 'action.hover',
                }
              }}
              title={collapsed && !isMobile ? t('navigation.profile', 'Profile') : undefined}
            >
              <ListItemIcon sx={{ minWidth: collapsed && !isMobile ? 'auto' : 32 }}>
                <Person fontSize="small" />
              </ListItemIcon>
              {(!collapsed || isMobile) && (
                <ListItemText 
                  primary={t('navigation.profile', 'Profile')} 
                  primaryTypographyProps={{ fontSize: '14px' }}
                />
              )}
            </ListItemButton>
            
            <ListItemButton
              onClick={handleLogout}
              sx={{
                borderRadius: 1,
                mx: 1,
                mb: 0.5,
                justifyContent: collapsed && !isMobile ? 'center' : 'flex-start',
                '&:hover': {
                  backgroundColor: 'action.hover',
                },
                color: 'error.main'
              }}
              title={collapsed && !isMobile ? t('navigation.logout', 'Logout') : undefined}
            >
              <ListItemIcon sx={{ minWidth: collapsed && !isMobile ? 'auto' : 32 }}>
                <ExitToApp fontSize="small" color="error" />
              </ListItemIcon>
              {(!collapsed || isMobile) && (
                <ListItemText 
                  primary={t('navigation.logout', 'Logout')} 
                  primaryTypographyProps={{ fontSize: '14px', color: 'error.main' }}
                />
              )}
            </ListItemButton>
          </>
        )}
      </List>
      
      {/* Storage Info */}
      {(!collapsed || isMobile) && (
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
      )}
    </Box>
  );

  // For desktop, we need to conditionally render or hide the drawer
  if (!isMobile && !desktopOpen) {
    return null; // Hide drawer completely on desktop when hamburger is closed
  }

  return (
    <Drawer
      variant={isMobile ? 'temporary' : 'permanent'}
      open={isMobile ? mobileOpen : true}
      onClose={handleDrawerToggle}
      sx={{
        width: currentWidth,
        flexShrink: 0,
        transition: theme.transitions.create('width', {
          easing: theme.transitions.easing.sharp,
          duration: theme.transitions.duration.enteringScreen,
        }),
        [`& .MuiDrawer-paper`]: { 
          width: currentWidth, 
          boxSizing: 'border-box',
          position: isMobile ? 'fixed' : 'relative',
          height: '100%',
          borderRight: 1,
          borderColor: 'divider',
          backgroundColor: theme.palette.mode === 'dark' ? 'grey.900' : 'grey.50',
          overflowX: 'hidden',
          transition: theme.transitions.create('width', {
            easing: theme.transitions.easing.sharp,
            duration: theme.transitions.duration.enteringScreen,
          }),
          zIndex: isMobile ? theme.zIndex.drawer : 'auto',
        },
      }}
    >
      {drawerContent}
    </Drawer>
  );
};

export default SideNav;