/**
 * In-memory cache for decrypted file metadata to speed up search and filtering
 */

import type { FileData } from '../files';

export interface CachedFileMetadata {
  id: string;
  decryptedName: string;
  decryptedSize: string;
  tags: string[];
  lastModified: number; // timestamp for cache invalidation
}

export interface CachedFolderMetadata {
  id: string;
  decryptedName: string;
  lastModified: number; // timestamp for cache invalidation
}

export type CachedMetadata = CachedFileMetadata | CachedFolderMetadata;

class MetadataCache {
  private cache = new Map<string, CachedMetadata>();
  private readonly CACHE_TTL_SHORT = 15 * 60 * 1000; // 15 minutes - matches passphrase timeout
  private readonly CACHE_TTL_LONG = 60 * 60 * 1000; // 60 minutes - matches extended passphrase timeout
  private currentTTL = this.CACHE_TTL_SHORT; // Default to short timeout

  /**
   * Set cache timeout to match passphrase timeout preference
   */
  setTimeoutPreference(rememberLonger: boolean): void {
    this.currentTTL = rememberLonger ? this.CACHE_TTL_LONG : this.CACHE_TTL_SHORT;
  }

  /**
   * Get cached metadata for a file or folder
   */
  get(itemId: string): CachedMetadata | null {
    const cached = this.cache.get(itemId);
    if (!cached) return null;

    // Check if cache entry is expired using current TTL
    if (Date.now() - cached.lastModified > this.currentTTL) {
      this.cache.delete(itemId);
      return null;
    }

    return cached;
  }

  /**
   * Set cached metadata for a file or folder
   */
  set(itemId: string, metadata: Omit<CachedMetadata, 'id' | 'lastModified'>): void {
    this.cache.set(itemId, {
      id: itemId,
      ...metadata,
      lastModified: Date.now(),
    });
  }

  /**
   * Invalidate cache for a specific file
   */
  invalidate(fileId: string): void {
    this.cache.delete(fileId);
  }

  /**
   * Invalidate cache for multiple files
   */
  invalidateMultiple(fileIds: string[]): void {
    for (const fileId of fileIds) {
      this.cache.delete(fileId);
    }
  }

  /**
   * Invalidate cache based on file modification time
   */
  invalidateIfModified(fileId: string, lastModified: number): void {
    const cached = this.cache.get(fileId);
    if (cached && cached.lastModified < lastModified) {
      this.cache.delete(fileId);
    }
  }

  /**
   * Clear entire cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Clean up expired entries
   */
  cleanup(): void {
    const now = Date.now();
    for (const [fileId, metadata] of this.cache.entries()) {
      if (now - metadata.lastModified > this.currentTTL) {
        this.cache.delete(fileId);
      }
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): { size: number; hitRate: number } {
    return {
      size: this.cache.size,
      hitRate: 0, // TODO: Track hit rate if needed
    };
  }

  /**
   * Get all cached file metadata for building complete file lists
   */
  getAllCachedFileMetadata(): Map<string, CachedFileMetadata> {
    const fileMetadata = new Map<string, CachedFileMetadata>();
    const now = Date.now();

    for (const [itemId, metadata] of this.cache.entries()) {
      // Check if not expired and is file metadata (has tags field)
      if (
        (now - metadata.lastModified <= this.currentTTL) &&
        'tags' in metadata
      ) {
        fileMetadata.set(itemId, metadata as CachedFileMetadata);
      }
    }

    return fileMetadata;
  }

  /**
   * Build FileData objects instantly from cache for specific file IDs
   */
  buildFileDataFromCache(fileIds: string[], originalFiles: any[]): FileData[] {
    const result: FileData[] = [];
    const now = Date.now();

    for (const originalFile of originalFiles) {
      if (!fileIds.includes(originalFile.id)) continue;

      const cached = this.cache.get(originalFile.id);
      if (cached && 'tags' in cached && (now - cached.lastModified <= this.currentTTL)) {
        // Use cached metadata - instant performance!
        result.push({
          ...originalFile,
          name: cached.decryptedName,
          size: cached.decryptedSize,
        });
      } else {
        // Fallback to original data if not cached
        result.push(originalFile);
      }
    }

    return result;
  }

  /**
   * Batch get multiple cached entries
   */
  getBatch(itemIds: string[]): Map<string, CachedMetadata> {
    const result = new Map<string, CachedMetadata>();
    const now = Date.now();

    for (const itemId of itemIds) {
      const cached = this.cache.get(itemId);
      if (cached && (now - cached.lastModified <= this.currentTTL)) {
        result.set(itemId, cached);
      }
    }

    return result;
  }

  /**
   * Batch set multiple entries
   */
  setBatch(entries: Array<{ fileId: string; metadata: Omit<CachedFileMetadata, 'id' | 'lastModified'> }>): void {
    const now = Date.now();
    for (const { fileId, metadata } of entries) {
      this.cache.set(fileId, {
        id: fileId,
        ...metadata,
        lastModified: now,
      });
    }
  }
}

// Export singleton instance
export const metadataCache = new MetadataCache();

// Cleanup expired entries every 5 minutes (more frequent than TTL for efficiency)
// This ensures memory doesn't grow indefinitely with expired entries
setInterval(() => {
  const beforeSize = metadataCache.getStats().size;
  metadataCache.cleanup();
  const afterSize = metadataCache.getStats().size;

  if (beforeSize !== afterSize) {
    console.log(`🧹 Cache cleanup: ${beforeSize - afterSize} expired entries removed, ${afterSize} remaining`);
  }
}, 5 * 60 * 1000);

// Folder metadata caching can be added later if needed

/**
 * Helper function to get or decrypt and cache file metadata
 */
export const getOrDecryptMetadata = async (
  file: FileData,
  userId: string,
  privateKey: string
): Promise<CachedFileMetadata> => {
  // Check cache first
  const cached = metadataCache.get(file.id!);
  if (cached) {
    return cached;
  }

  // Cache miss - decrypt and cache the metadata
  try {
    // Get user's personalized file name
    const { getUserFileName } = await import('./userNamesManagement');
    const decryptedName = await getUserFileName(file, userId, privateKey);

    // Decrypt file size
    const { FileEncryptionService } = await import('./fileEncryption');
    const userEncryptedKey = file.encryptedKeys[userId];
    const { size: decryptedSize } = await FileEncryptionService.decryptFileMetadata(
      file.name as { ciphertext: string; nonce: string },
      file.size as { ciphertext: string; nonce: string },
      userEncryptedKey,
      privateKey
    );

    // Get user tags
    const { getUserTags } = await import('./userTagsManagement');
    const tags = await getUserTags(file, userId, privateKey);

    const metadata: Omit<CachedFileMetadata, 'id' | 'lastModified'> = {
      decryptedName,
      decryptedSize,
      tags,
    };

    // Cache the result
    metadataCache.set(file.id!, metadata);

    return {
      id: file.id!,
      ...metadata,
      lastModified: Date.now(),
    };
  } catch (error) {
    console.error('Error decrypting file metadata:', error);
    const fallbackMetadata: Omit<CachedFileMetadata, 'id' | 'lastModified'> = {
      decryptedName: '[Encrypted File]',
      decryptedSize: '',
      tags: [],
    };

    // Cache the fallback to avoid repeated failures
    metadataCache.set(file.id!, fallbackMetadata);

    return {
      id: file.id!,
      ...fallbackMetadata,
      lastModified: Date.now(),
    };
  }
};