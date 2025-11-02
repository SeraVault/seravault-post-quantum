/**
 * In-Memory File Cache Service
 * 
 * Stores decrypted file content in memory for fast access during the session.
 * This is a L1 cache - data is lost on page refresh.
 * For persistent storage, see offlineFileCache.ts
 */

interface CachedFile {
  id: string;
  content: ArrayBuffer;
  timestamp: number;
  name: string;
  isForm: boolean;
}

class FileCacheService {
  private cache = new Map<string, CachedFile>();
  private readonly MAX_CACHE_SIZE = 50 * 1024 * 1024; // 50MB in-memory limit
  private currentSize = 0;

  async getFile(fileId: string): Promise<CachedFile | undefined> {
    return this.cache.get(fileId);
  }

  async saveFile(fileId: string, content: ArrayBuffer, timestamp: number, name: string, isForm: boolean): Promise<void> {
    const fileSize = content.byteLength;
    
    // Simple LRU: if cache is full, remove oldest entry
    if (this.currentSize + fileSize > this.MAX_CACHE_SIZE) {
      this.evictOldest();
    }

    this.cache.set(fileId, { id: fileId, content, timestamp, name, isForm });
    this.currentSize += fileSize;
    console.log(`⚡ Cached decrypted file in memory: ${fileId} (${name}) - ${(fileSize / 1024).toFixed(2)} KB`);
  }

  async getFileTimestamp(fileId: string): Promise<number | undefined> {
    return this.cache.get(fileId)?.timestamp;
  }

  async clearCache(): Promise<void> {
    this.cache.clear();
    this.currentSize = 0;
    console.log('⚡ In-memory file cache cleared.');
  }

  private evictOldest(): void {
    // Remove oldest entry (first in Map)
    const firstKey = this.cache.keys().next().value;
    if (firstKey) {
      const file = this.cache.get(firstKey);
      if (file) {
        this.currentSize -= file.content.byteLength;
        this.cache.delete(firstKey);
        console.log(`�️ Evicted ${firstKey} from memory cache`);
      }
    }
  }

  getStats(): { count: number; size: number } {
    return {
      count: this.cache.size,
      size: this.currentSize
    };
  }
}

export const fileCacheService = new FileCacheService();
