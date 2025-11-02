import React from 'react';
import { Routes, Route } from 'react-router-dom';
import './i18n'; // Initialize i18n
import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import ProfilePage from './pages/ProfilePage';
import CleanupPage from './pages/CleanupPage';
import SecurityPage from './pages/SecurityPage';
import ContactsPage from './pages/ContactsPage';
import ChatPage from './pages/ChatPage';
import FormTemplatesPage from './pages/FormTemplatesPage';
import ProtectedRoute from './auth/ProtectedRoute';
import ProfileCheck from './auth/ProfileCheck';
import { useAuth } from './auth/AuthContext';
import { usePassphrase } from './auth/PassphraseContext';
import { CircularProgress, Typography, useTheme, Dialog, DialogContent } from '@mui/material';
import { ClipboardProvider } from './context/ClipboardContext';
import { LoadingProvider, useGlobalLoading } from './context/LoadingContext';
import { RecentsProvider } from './context/RecentsContext';
import { MetadataProvider } from './context/MetadataContext';
// Import migration utility to make it available in console
import './utils/migrateFormTags';

// Global Loading Component
const GlobalLoadingSpinner: React.FC = () => {
  const theme = useTheme();
  const { loading: authLoading } = useAuth();
  const { loading: passphraseLoading, privateKey } = usePassphrase();
  const { isDataLoading } = useGlobalLoading();
  
  // Show loading for any of the stages
  const isLoading = authLoading || passphraseLoading || isDataLoading;
  
  // Debug the loading states (temporarily)
  if (isLoading) {
    console.log('Loading states:', { authLoading, passphraseLoading, isDataLoading, privateKey: !!privateKey });
  }
  
  if (!isLoading) return null;
  
  let loadingMessage = 'Loading...';
  
  if (authLoading) {
    loadingMessage = 'Authenticating...';
  } else if (passphraseLoading) {
    loadingMessage = 'Decrypting your vault...';
  } else if (isDataLoading) {
    loadingMessage = 'Loading your files...';
  }
  
  return (
    <Dialog
      open={isLoading}
      disableEscapeKeyDown
      PaperProps={{
        sx: {
          borderRadius: 2,
          minWidth: 300,
        }
      }}
    >
      <DialogContent sx={{ 
        textAlign: 'center',
        p: 4,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 2,
      }}>
        <CircularProgress 
          sx={{ 
            color: theme.palette.primary.main,
          }} 
          size={60} 
          thickness={4} 
        />
        <Typography 
          variant="h6" 
          sx={{ 
            color: theme.palette.text.primary,
            fontWeight: theme.typography.fontWeightMedium 
          }}
        >
          {loadingMessage}
        </Typography>
      </DialogContent>
    </Dialog>
  );
};

const App: React.FC = () => {
  return (
    <ClipboardProvider>
      <LoadingProvider>
        <RecentsProvider>
          <MetadataProvider>
            <GlobalLoadingSpinner />
            <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />
            <Route element={<ProtectedRoute />}>
              <Route element={<ProfileCheck />}>
                <Route path="/" element={<HomePage />} />
              </Route>
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="/contacts" element={<ContactsPage />} />
              <Route path="/chat" element={<ChatPage />} />
              <Route path="/templates" element={<FormTemplatesPage />} />
              <Route path="/cleanup" element={<CleanupPage />} />
              <Route path="/security" element={<SecurityPage />} />
            </Route>
          </Routes>
          </MetadataProvider>
        </RecentsProvider>
      </LoadingProvider>
    </ClipboardProvider>
  );
};

export default App;
