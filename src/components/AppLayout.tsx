import React, { useState } from 'react';
import { Box, Toolbar } from '@mui/material';
import TopBar from './TopBar';
import SideNav from './SideNav';

const drawerWidth = 240;

interface AppLayoutProps {
  children: React.ReactNode;
  currentFolder?: string | null;
  setCurrentFolder?: (folderId: string | null) => void;
}

const AppLayout: React.FC<AppLayoutProps> = ({ children, currentFolder, setCurrentFolder }) => {
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  return (
    <Box sx={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden' }}>
      <TopBar handleDrawerToggle={handleDrawerToggle} />
      {currentFolder !== undefined && setCurrentFolder && (
        <SideNav
          drawerWidth={drawerWidth}
          mobileOpen={mobileOpen}
          handleDrawerToggle={handleDrawerToggle}
          currentFolder={currentFolder}
          setCurrentFolder={setCurrentFolder}
        />
      )}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: 3,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        <Toolbar />
        {children}
      </Box>
    </Box>
  );
};

export default AppLayout;
