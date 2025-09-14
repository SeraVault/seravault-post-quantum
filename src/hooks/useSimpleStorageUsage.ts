import { useState, useEffect, useCallback } from 'react';
import { getStorageUsage, clearStorageUsageCache, type StorageUsage } from '../services/simpleStorageUsage';
import { useAuth } from '../auth/AuthContext';

export interface UseStorageUsageReturn {
  usage: StorageUsage | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  clearCache: () => void;
}

/**
 * Hook to manage storage usage calculation and caching
 * No private key needed - just gets real encrypted file sizes from Firebase Storage
 */
export function useSimpleStorageUsage(): UseStorageUsageReturn {
  const { user } = useAuth();
  const [usage, setUsage] = useState<StorageUsage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Calculate storage usage
  const calculateUsage = useCallback(async (forceRefresh = false) => {
    if (!user) {
      setUsage(null);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      console.log(`📊 ${forceRefresh ? 'Force refreshing' : 'Loading'} storage usage for user ${user.uid}`);
      const result = await getStorageUsage(user.uid, forceRefresh);
      setUsage(result);
      setError(null);
    } catch (err) {
      console.error('❌ Error getting storage usage:', err);
      setError(err instanceof Error ? err.message : 'Failed to calculate storage usage');
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Refresh storage usage (force recalculation)
  const refresh = useCallback(async () => {
    await calculateUsage(true);
  }, [calculateUsage]);

  // Clear cache
  const clearCache = useCallback(() => {
    if (user) {
      clearStorageUsageCache(user.uid);
      console.log('🗑️ Storage usage cache cleared');
    }
  }, [user]);

  // Load usage on mount and when dependencies change
  useEffect(() => {
    calculateUsage(false);
  }, [calculateUsage]);

  // Refresh storage when files are modified (listen to custom events)
  useEffect(() => {
    const handleStorageInvalidation = () => {
      console.log('📊 Simple storage invalidation event received, refreshing usage...');
      calculateUsage(true);
    };

    // Listen for storage invalidation events
    window.addEventListener('seravault-simple-storage-invalidated', handleStorageInvalidation);
    
    return () => {
      window.removeEventListener('seravault-simple-storage-invalidated', handleStorageInvalidation);
    };
  }, [calculateUsage]);

  return {
    usage,
    loading,
    error,
    refresh,
    clearCache,
  };
}