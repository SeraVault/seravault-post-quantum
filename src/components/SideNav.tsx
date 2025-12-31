import React, { useEffect, useState } from 'react';
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
import { useNavigate } from 'react-router-dom';
import {
  Home,
  Share,
  Star,
  AccessTime,
  Security,
  ChevronLeft,
  ChevronRight,
  People,
  HelpOutline,
  Email,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthContext';
import FolderTree from './FolderTree';
import { useFolders } from '../hooks/useFolders';
import { useRecents } from '../context/RecentsContext';
import { updateFolder } from '../firestore';
import type { FileData } from '../files';
import type { FileTypeFilterValue } from '../utils/fileTypeFilters';
import FileTypeFilterTree from './FileTypeFilterTree';

interface SideNavProps {
  drawerWidth: number;
  mobileOpen: boolean;
  desktopOpen?: boolean;
  handleDrawerToggle: () => void;
  currentFolder: string | null;
  setCurrentFolder: (folderId: string | null) => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  userId?: string; // Used in handleMoveItem
  files?: FileData[];
  userPrivateKey?: string;
  selectedTags?: string[];
  onTagSelectionChange?: (tags: string[]) => void;
  matchAllTags?: boolean;
  onMatchModeChange?: (matchAll: boolean) => void;
  fileTypeFilter?: FileTypeFilterValue;
  onFileTypeFilterChange?: (value: FileTypeFilterValue) => void;
}

const SideNav: React.FC<SideNavProps> = ({
  drawerWidth,
  mobileOpen,
  desktopOpen = true,
  handleDrawerToggle,
  setCurrentFolder,
  collapsed = false,
  onToggleCollapse,
  userId,
  files = [],
  fileTypeFilter = 'all',
  onFileTypeFilterChange,
}) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { user } = useAuth();
  const { allFolders } = useFolders();
  const { isRecentsView, setIsRecentsView, isFavoritesView, setIsFavoritesView, isSharedView, setIsSharedView } = useRecents();
  // Root folder drop zone state
  const [isRootDropZone, setIsRootDropZone] = useState(false);

  // Helper function to handle navigation and close mobile drawer
  const handleNavigateAndClose = (path: string) => {
    navigate(path);
    if (isMobile) {
      handleDrawerToggle();
    }
  };

  // Helper function to preload route on hover
  const handlePreloadRoute = (path: string) => {
    // Preload the route by creating a prefetch link
    const routeMap: { [key: string]: () => Promise<unknown> } = {
      '/profile': () => import('../pages/ProfilePage'),
      '/contacts': () => import('../pages/ContactsPage'),
      '/templates': () => import('../pages/FormTemplatesPage'),
      '/cleanup': () => import('../pages/CleanupPage'),
      '/security': () => import('../pages/SecurityPage'),
    };
    
    const preloadFn = routeMap[path];
    if (preloadFn) {
      preloadFn().catch(() => {
        // Silently fail - will load on click if preload fails
      });
    }
  };

  // Helper function for view navigation (home with query params)
  const handleViewNavigateAndClose = (path: string) => {
    navigate(path);
    if (isMobile) {
      handleDrawerToggle();
    }
  };

  // Handle folder clicks - reset all view states and set folder
  const handleFolderClick = (folderId: string | null) => {
    // Navigate to HomePage with folder parameter using client-side navigation
    const folderParam = folderId ? `?folder=${folderId}` : '';
    navigate(`/${folderParam}`, { replace: false });

    // Close mobile drawer if open
    if (isMobile) {
      handleDrawerToggle();
    }

    // Also update local state for when we're already on HomePage
    // setCurrentFolder(folderId); // Redundant, navigation is handled by navigate(). HomePage reads folder from URL.
    setIsRecentsView(false);
    setIsFavoritesView(false);
    setIsSharedView(false);
  };

  // Handle moving items (files or folders) to different folders
  const handleMoveItem = async (itemId: string, itemType: 'file' | 'folder', targetFolderId: string | null) => {
    if (!userId) return;
    
    try {
      console.log('🔄 SideNav handleMoveItem called:', { itemId, itemType, targetFolderId });
      
      if (itemType === 'folder') {
        console.log('📁 Updating folder parent...');
        await updateFolder(itemId, { parent: targetFolderId });
        console.log('✅ Folder moved successfully');
      } else if (itemType === 'file') {
        console.log('📄 Moving file for user...');
        // Use per-user folder management instead of updating parent directly
        const { moveFileForUser } = await import('../services/userFolderManagement');
        await moveFileForUser(itemId, userId, targetFolderId);
        console.log('✅ File moved successfully');
      } else {
        console.warn('❌ Unknown item type:', itemType);
      }
    } catch (error) {
      console.error('❌ Error moving item:', error);
      // You could add a toast notification here
    }
  };

  // Root folder drop handlers
  const handleRootDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setIsRootDropZone(true);
  };

  const handleRootDragLeave = (e: React.DragEvent) => {
    // Only set dragOver to false if we're actually leaving this element
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;
    
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
      setIsRootDropZone(false);
    }
  };

  const handleRootDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsRootDropZone(false);
    
    console.log('🎯 Root folder drop event triggered');
    console.log('🎯 Event dataTransfer types:', Array.from(e.dataTransfer.types));
    console.log('🎯 Raw drag data:', e.dataTransfer.getData('application/json'));
    
    try {
      const dragData = e.dataTransfer.getData('application/json');
      if (!dragData) {
        console.warn('❌ No drag data found');
        return;
      }
      
      const data = JSON.parse(dragData);
      console.log('🎯 Parsed drag data:', data);
      console.log('🎯 Moving to root folder (null parent)');
      
      if (handleMoveItem && data.id) {
        console.log('✅ Calling handleMoveItem with root target');
        handleMoveItem(data.id, data.type, null); // null = root folder
      } else {
        console.warn('❌ handleMoveItem not available or no item ID');
      }
    } catch (error) {
      console.error('❌ Error handling root drop:', error);
    }
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
            handleViewNavigateAndClose('/');
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
            handleViewNavigateAndClose('/?view=favorites');
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
            handleViewNavigateAndClose('/?view=recents');
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
          onClick={() => {
            handleViewNavigateAndClose('/');
            setCurrentFolder(null);
            setIsRecentsView(false);
            setIsFavoritesView(false);
            setIsSharedView(false);
          }}
          onDragOver={handleRootDragOver}
          onDragLeave={handleRootDragLeave}
          onDrop={handleRootDrop}
          sx={{
            borderRadius: 1,
            mx: 1,
            mb: 0.5,
            backgroundColor: isRootDropZone ? 'primary.light' : 'transparent',
            border: isRootDropZone ? '2px dashed' : '2px solid transparent',
            borderColor: isRootDropZone ? 'primary.main' : 'transparent',
            '&:hover': {
              backgroundColor: isRootDropZone ? 'primary.light' : 'action.hover',
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
        
        <Box sx={{ mx: 1 }}>
          <FolderTree 
            folders={allFolders} 
            onFolderClick={handleFolderClick}
            onMoveItem={handleMoveItem}
          />
        </Box>

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
              {t('navigation.fileTypes.title', 'File Types')}
            </Typography>
          </Box>
        )}
        <FileTypeFilterTree
          files={files}
          selectedType={fileTypeFilter}
          onSelectType={(value) => onFileTypeFilterChange?.(value)}
          collapsed={collapsed && !isMobile}
          isMobile={isMobile}
        />
        
        <ListItemButton
          onClick={() => {
            handleViewNavigateAndClose('/?view=shared');
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
          onClick={() => handleNavigateAndClose('/contacts')}
          onMouseEnter={() => handlePreloadRoute('/contacts')}
          sx={{
            borderRadius: 1,
            mx: 1,
            mb: 0.5,
            justifyContent: collapsed && !isMobile ? 'center' : 'flex-start',
            '&:hover': {
              backgroundColor: 'action.hover',
            }
          }}
          title={collapsed && !isMobile ? t('navigation.contacts', 'Contacts') : undefined}
        >
          <ListItemIcon sx={{ minWidth: collapsed && !isMobile ? 'auto' : 32 }}>
            <People fontSize="small" />
          </ListItemIcon>
          {(!collapsed || isMobile) && (
            <ListItemText 
              primary={t('navigation.contacts', 'Contacts')} 
              primaryTypographyProps={{ fontSize: '14px' }}
            />
          )}
        </ListItemButton>

        <ListItemButton
          onClick={() => handleNavigateAndClose('/help')}
          onMouseEnter={() => handlePreloadRoute('/help')}
          sx={{
            borderRadius: 1,
            mx: 1,
            mb: 0.5,
            justifyContent: collapsed && !isMobile ? 'center' : 'flex-start',
            '&:hover': {
              backgroundColor: 'action.hover',
            }
          }}
          title={collapsed && !isMobile ? t('navigation.help', 'Help') : undefined}
        >
          <ListItemIcon sx={{ minWidth: collapsed && !isMobile ? 'auto' : 32 }}>
            <HelpOutline fontSize="small" />
          </ListItemIcon>
          {(!collapsed || isMobile) && (
            <ListItemText 
              primary={t('navigation.help', 'Help') } 
              primaryTypographyProps={{ fontSize: '14px' }}
            />
          )}
        </ListItemButton>

        <ListItemButton
          onClick={() => handleNavigateAndClose('/support')}
          onMouseEnter={() => handlePreloadRoute('/support')}
          sx={{
            borderRadius: 1,
            mx: 1,
            mb: 0.5,
            justifyContent: collapsed && !isMobile ? 'center' : 'flex-start',
            '&:hover': {
              backgroundColor: 'action.hover',
            }
          }}
          title={collapsed && !isMobile ? t('navigation.support', 'Support') : undefined}
        >
          <ListItemIcon sx={{ minWidth: collapsed && !isMobile ? 'auto' : 32 }}>
            <Email fontSize="small" />
          </ListItemIcon>
          {(!collapsed || isMobile) && (
            <ListItemText 
              primary={t('navigation.support', 'Support') } 
              primaryTypographyProps={{ fontSize: '14px' }}
            />
          )}
        </ListItemButton>

      </List>
      
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
