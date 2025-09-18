import { collection, query, where, getDocs } from 'firebase/firestore';
import { ref, getMetadata } from 'firebase/storage';
import { db, storage } from '../firebase';

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
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * Calculate total storage usage for a user based on actual Firebase Storage file sizes
 * Much simpler - no decryption needed, just gets the real encrypted file sizes
 */
export async function calculateStorageUsage(userId: string): Promise<StorageUsage> {
  try {
    
    // Query only files owned by this user
    const filesQuery = query(
      collection(db, 'files'), 
      where('owner', '==', userId)
    );
    
    const filesSnapshot = await getDocs(filesQuery);
    let totalUsedBytes = 0;
    let processedFiles = 0;
    let failedFiles = 0;
    
    
    // Process each file owned by the user
    for (const fileDoc of filesSnapshot.docs) {
      const fileData = fileDoc.data();
      
      if (!fileData.storagePath) {
        continue;
      }
      
      try {
        // Get file metadata from Firebase Storage
        const storageRef = ref(storage, fileData.storagePath);
        const metadata = await getMetadata(storageRef);
        
        const fileSize = metadata.size || 0;
        totalUsedBytes += fileSize;
        processedFiles++;
        
        
      } catch (error) {
        failedFiles++;
        // Continue processing other files
      }
    }
    
    const percentage = Math.round((totalUsedBytes / DEFAULT_STORAGE_LIMIT_BYTES) * 100);
    
    const usage: StorageUsage = {
      usedBytes: totalUsedBytes,
      usedFormatted: formatBytes(totalUsedBytes),
      totalBytes: DEFAULT_STORAGE_LIMIT_BYTES,
      totalFormatted: formatBytes(DEFAULT_STORAGE_LIMIT_BYTES),
      percentage: Math.min(percentage, 100), // Cap at 100%
    };
    
    
    return usage;
    
  } catch (error) {
    
    // Return default values on error
    return {
      usedBytes: 0,
      usedFormatted: '0 B',
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