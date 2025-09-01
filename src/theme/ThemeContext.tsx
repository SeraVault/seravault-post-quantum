import React, { createContext, useContext, useState, useMemo, useEffect } from 'react';
import { createTheme, ThemeProvider as MuiThemeProvider } from '@mui/material/styles';
import { useAuth } from '../auth/AuthContext';
import { getUserProfile, updateUserProfile } from '../firestore';

interface ThemeContextType {
  toggleTheme: () => void;
  mode: 'light' | 'dark';
  setMode: (mode: 'light' | 'dark') => void;
}

const ThemeContext = createContext<ThemeContextType>({
  toggleTheme: () => {},
  mode: 'light',
  setMode: () => {},
});

export const useThemeContext = () => useContext(ThemeContext);

export const AppThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [mode, setMode] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const fetchTheme = async () => {
      if (user) {
        const profile = await getUserProfile(user.uid);
        if (profile) {
          setMode(profile.theme);
        }
      }
    };
    fetchTheme();
  }, [user]);

  const theme = useMemo(
    () =>
      createTheme({
        palette: {
          mode,
        },
      }),
    [mode]
  );

  const toggleTheme = async () => {
    const newMode = mode === 'light' ? 'dark' : 'light';
    setMode(newMode);
    
    // Update user profile if logged in
    if (user) {
      try {
        await updateUserProfile(user.uid, { theme: newMode });
      } catch (error) {
        console.error('Failed to update theme preference:', error);
      }
    }
  };

  return (
    <ThemeContext.Provider value={{ toggleTheme, mode, setMode }}>
      <MuiThemeProvider theme={theme}>{children}</MuiThemeProvider>
    </ThemeContext.Provider>
  );
};
