import { createContext, useContext, useEffect, useState } from 'react';
import { backendService, type User } from '../backend/BackendService';
import { offlineFileCache } from '../services/offlineFileCache';
import { metadataCache } from '../services/metadataCache';
import { fileCacheService } from '../services/FileCacheService';
import { FCMService } from '../services/fcmService';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  logout: async () => {},
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const logout = async () => {
    try {
      // Unregister FCM token before logout
      if (user?.uid) {
        console.log('📵 Unregistering FCM token...');
        await FCMService.unregister(user.uid).catch(err => {
          console.warn('Failed to unregister FCM token:', err);
        });
      }
      
      // Dispatch session timeout event to clear all sensitive data in components
      window.dispatchEvent(new CustomEvent('sessionTimeout', {
        detail: { reason: 'user_logout' }
      }));
      
      // Clear all caches
      console.log('🧹 Clearing all caches on logout...');
      
      // Clear offline file cache (IndexedDB)
      await offlineFileCache.clearAll();
      
      // Clear metadata cache (IndexedDB + memory)
      metadataCache.clear();
      
      // Clear in-memory file cache
      fileCacheService.clearCache();
      
      console.log('✅ All caches cleared');
      
      await backendService.auth.signOut();
      
      // Clear any stored sensitive data
      localStorage.removeItem('encryptedPrivateKey');
      localStorage.removeItem('privateKeyExpiry');
      localStorage.removeItem('i18nextLng'); // Clear language preference
      sessionStorage.clear();
    } catch (error) {
      console.error('Logout error:', error);
      throw error;
    }
  };

  useEffect(() => {
    console.log('[AuthContext] Setting up auth state listener');
    const unsubscribe = backendService.auth.onAuthStateChanged(async (user) => {
      console.log('[AuthContext] Auth state changed:', user ? { uid: user.uid, email: user.email } : null);
      console.log('[AuthContext] Auth state change count:', (window as any).__authStateChangeCount = ((window as any).__authStateChangeCount || 0) + 1);

      // If user is null (logged out), set user and stop loading immediately
      if (!user) {
        setUser(null);
        setLoading(false);
        return;
      }

      // User is authenticated - wait for ID token before setting user
      // This prevents race conditions where Firestore queries start before auth is ready
      try {
        const authInstance = backendService.auth.getAuthInstance();
        if (authInstance.currentUser) {
          // Force refresh the ID token to ensure it's fresh and propagated
          // Setting forceRefresh=true ensures the token is sent to Firebase servers
          await authInstance.currentUser.getIdToken(true);
          console.log('[AuthContext] Auth token refreshed and propagated');
          
          // Additional small delay to ensure token reaches Firestore backend
          // Firebase's auth state is eventually consistent across services
          await new Promise(resolve => setTimeout(resolve, 150));
        }
      } catch (error) {
        console.error('[AuthContext] Failed to get ID token:', error);
        // Continue anyway - better to have partial functionality than block login
      }

      // Now it's safe to set the user - auth token is ready for Firestore
      setUser(user);
      setLoading(false);

      // Ensure user profile exists for OAuth sign-ins (Google, Apple, etc.)
      // Run this in the background without blocking
      const profileChecked = sessionStorage.getItem(`profile_checked_${user.uid}`);

      if (!profileChecked) {
        // Only check profile on first auth state change
        (async () => {
          try {
            const { ensureUserProfile } = await import('../firestore');
            await ensureUserProfile(user.uid, user.email, user.displayName);

            // Mark profile as checked for this session
            sessionStorage.setItem(`profile_checked_${user.uid}`, 'true');
          } catch (error) {
            console.error('Failed to ensure user profile:', error);
          }
        })();
      } else {
        console.log('[AuthContext] Profile already checked this session, skipping');
      }

      // Initialize FCM in the background without blocking
      if (FCMService.isSupported()) {
        const notificationsEnabled = localStorage.getItem(`notifications_${user.uid}`) !== 'false';

        if (notificationsEnabled) {
          console.log('🔔 Initializing FCM for user...');
          FCMService.initialize(user.uid).catch(error => {
            console.error('Failed to initialize FCM:', error);
          });
        } else {
          console.log('🔕 Notifications disabled by user preference');
        }
      }
    });

    return () => unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
