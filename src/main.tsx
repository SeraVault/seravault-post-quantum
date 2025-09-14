import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom';
import App from './App.tsx'
import './index.css'
import CssBaseline from '@mui/material/CssBaseline';
import { AuthProvider } from './auth/AuthContext';
import { AppThemeProvider } from './theme/ThemeContext';

// PWA Service Worker Registration
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((registration) => {
        console.log('✅ SW registered: ', registration);
      })
      .catch((registrationError) => {
        console.log('❌ SW registration failed: ', registrationError);
      });
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      <AppThemeProvider>
        <CssBaseline />
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AppThemeProvider>
    </AuthProvider>
  </React.StrictMode>,
)
