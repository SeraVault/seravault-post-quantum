import React, { useState } from 'react';
import { Box, Toolbar } from '@mui/material';
import TopBar from './TopBar';
import SideNav from './SideNav';

const drawerWidth = 240;

interface AppLayoutProps {
  children: React.ReactNode;
  currentFolder?: string | null;
  setCurrentFolder?: (folderId: string | null) => void;
  onOpenTemplateDesigner?: () => void;
  // Tag filtering props
  files?: any[];
  userId?: string;
  userPrivateKey?: string;
  selectedTags?: string[];
  onTagSelectionChange?: (tags: string[]) => void;
  matchAllTags?: boolean;
  onMatchModeChange?: (matchAll: boolean) => void;
}

const AppLayout: React.FC<AppLayoutProps> = ({ 
  children, 
  currentFolder, 
  setCurrentFolder, 
  onOpenTemplateDesigner,
  // Tag filtering props
  files,
  userId,
  userPrivateKey,
  selectedTags,
  onTagSelectionChange,
  matchAllTags,
  onMatchModeChange
}) => {
  const [mobileOpen, setMobileOpen] = useState(false); // For mobile drawer overlay
  const [desktopOpen, setDesktopOpen] = useState(true); // For desktop drawer visibility
  const [collapsed, setCollapsed] = useState(false);

  const handleDrawerToggle = () => {
    // Toggle mobile drawer for mobile, desktop drawer for desktop
    const isMobile = window.innerWidth < 600; // Same breakpoint as theme.breakpoints.down('sm')
    if (isMobile) {
      setMobileOpen(!mobileOpen);
    } else {
      setDesktopOpen(!desktopOpen);
    }
  };

  const handleToggleCollapse = () => {
    setCollapsed(!collapsed);
  };

  return (
    <Box sx={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden' }}>
      <TopBar handleDrawerToggle={handleDrawerToggle} />
      {currentFolder !== undefined && setCurrentFolder && (
        <SideNav
          drawerWidth={drawerWidth}
          mobileOpen={mobileOpen}
          desktopOpen={desktopOpen}
          handleDrawerToggle={handleDrawerToggle}
          currentFolder={currentFolder}
          setCurrentFolder={setCurrentFolder}
          onOpenTemplateDesigner={onOpenTemplateDesigner}
          collapsed={collapsed}
          onToggleCollapse={handleToggleCollapse}
          // Tag filtering props
          files={files}
          userId={userId}
          userPrivateKey={userPrivateKey}
          selectedTags={selectedTags}
          onTagSelectionChange={onTagSelectionChange}
          matchAllTags={matchAllTags}
          onMatchModeChange={onMatchModeChange}
        />
      )}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: 3,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'auto',
          position: 'relative',
          minHeight: 0,
        }}
      >
        <Toolbar />
        <Box sx={{ flexGrow: 1, overflow: 'auto' }}>
          {children}
        </Box>
      </Box>
    </Box>
  );
};

export default AppLayout;
