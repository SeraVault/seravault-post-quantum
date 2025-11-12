import { getFunctions, httpsCallable } from 'firebase/functions';

export interface StorageUsage {
  usedBytes: number;
  usedFormatted: string;
  totalBytes: number;
  totalFormatted: string;
  percentage: number;
}

// Default storage limit (15GB like Google Drive)
const DEFAULT_STORAGE_LIMIT_GB = 15;
const DEFAULT_STORAGE_LIMIT_BYTES = DEFAULT_STORAGE_LIMIT_GB * 1024 * 1024 * 1024;

/**
 * Format bytes to human readable format
 */
/**
 * Format bytes to human readable format
 */
function formatBytes(bytes: number): string {
  // Ensure we have a valid number
  if (typeof bytes !== 'number' || isNaN(bytes) || bytes < 0) {
    return '0 B';
  }
  
  if (bytes === 0) return '0 B';
  
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * Calculate storage usage for a user by calling the Cloud Function
 * Uses the calculateStorageUsage function which actually calculates from storage files
 */
export async function calculateStorageUsage(userId: string): Promise<StorageUsage> {
  try {
    const functions = getFunctions();
    const calculateStorageUsageFn = httpsCallable<void, { usedBytes: number; fileCount: number }>(
      functions,
      'calculateStorageUsage'
    );
    
    const result = await calculateStorageUsageFn();
    // Ensure we have a valid number, default to 0 if undefined/null/NaN
    const totalUsedBytes = typeof result.data.usedBytes === 'number' && !isNaN(result.data.usedBytes) 
      ? result.data.usedBytes 
      : 0;
    
    const percentage = Math.round((totalUsedBytes / DEFAULT_STORAGE_LIMIT_BYTES) * 100);
    
    const usage: StorageUsage = {
      usedBytes: totalUsedBytes,
      usedFormatted: formatBytes(totalUsedBytes),
      totalBytes: DEFAULT_STORAGE_LIMIT_BYTES,
      totalFormatted: formatBytes(DEFAULT_STORAGE_LIMIT_BYTES),
      percentage: Math.min(percentage, 100), // Cap at 100%
    };
    
    console.log('📊 Storage usage calculated:', usage);
    
    return usage;
    
  } catch (error) {
    console.error('Failed to calculate storage usage:', error);
    
    // Return default values on error
    return {
      usedBytes: 0,
      usedFormatted: formatBytes(0),
      totalBytes: DEFAULT_STORAGE_LIMIT_BYTES,
      totalFormatted: formatBytes(DEFAULT_STORAGE_LIMIT_BYTES),
      percentage: 0,
    };
  }
}

/**
 * Get cached storage usage or calculate fresh
 * Uses localStorage to cache results for 5 minutes
 */
export async function getStorageUsage(
  userId: string,
  forceRefresh = false
): Promise<StorageUsage> {
  const cacheKey = `simple_storage_usage_${userId}`;
  const cacheTimeout = 5 * 60 * 1000; // 5 minutes
  
  if (!forceRefresh) {
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const { data, timestamp } = JSON.parse(cached);
        if (Date.now() - timestamp < cacheTimeout) {
          return data;
        }
      }
    } catch (error) {
    }
  }
  
  // Calculate fresh usage
  const usage = await calculateStorageUsage(userId);
  
  // Cache the result
  try {
    localStorage.setItem(cacheKey, JSON.stringify({
      data: usage,
      timestamp: Date.now(),
    }));
  } catch (error) {
  }
  
  return usage;
}

/**
 * Clear storage usage cache for a user
 */
export function clearStorageUsageCache(userId: string): void {
  const cacheKey = `simple_storage_usage_${userId}`;
  localStorage.removeItem(cacheKey);
}

/**
 * Invalidate storage usage cache and notify listeners
 * Call this after file uploads, deletes, or other storage operations
 */
export function invalidateStorageUsage(userId: string): void {
  clearStorageUsageCache(userId);
  
  // Dispatch custom event to notify storage usage hooks
  window.dispatchEvent(new CustomEvent('seravault-simple-storage-invalidated', {
    detail: { userId }
  }));
  
}