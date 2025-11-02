import { createContext, useContext, useEffect, useState } from 'react';
import { backendService, type User } from '../backend/BackendService';
import { offlineFileCache } from '../services/offlineFileCache';
import { metadataCache } from '../services/metadataCache';
import { fileCacheService } from '../services/FileCacheService';

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
      sessionStorage.clear();
    } catch (error) {
      console.error('Logout error:', error);
      throw error;
    }
  };

  useEffect(() => {
    const unsubscribe = backendService.auth.onAuthStateChanged((user) => {
      setUser(user);
      setLoading(false);
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
