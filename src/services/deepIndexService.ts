/**
 * Deep Index Service - In-memory indexing for form contents
 * 
 * This service runs independently of component lifecycle, allowing
 * indexing to continue even when users navigate to different pages.
 * 
 * SECURITY: Index data remains in memory only (not persisted to disk)
 * to avoid storing decrypted sensitive data unencrypted on the drive.
 * Users will need to re-index after app restart.
 */

import type { FileData } from '../files';
import type { CachedFileMetadata } from './metadataCache';
import { FileAccessService } from './fileAccess';
import { FileEncryptionService } from './fileEncryption';
import { isFormFile } from '../utils/formFiles';

export interface DeepIndexProgress {
  isIndexing: boolean;
  total: number;
  processed: number;
  currentFile?: string;
}

type ProgressListener = (progress: DeepIndexProgress) => void;

class DeepIndexService {
  private formTextCache: Map<string, string> = new Map();
  private indexingPromise: Promise<void> | null = null;
  private progressListeners: Set<ProgressListener> = new Set();
  private currentProgress: DeepIndexProgress = {
    isIndexing: false,
    total: 0,
    processed: 0,
  };
  private shouldCancel = false;

  /**
   * Register a listener for progress updates
   */
  addProgressListener(listener: ProgressListener): () => void {
    this.progressListeners.add(listener);
    // Immediately notify with current progress
    console.log('👂 New listener registered, notifying with current progress:', this.currentProgress);
    listener({ ...this.currentProgress });
    
    // Return unsubscribe function
    return () => {
      this.progressListeners.delete(listener);
    };
  }

  /**
   * Notify all listeners of progress changes
   */
  private notifyProgress(progress: DeepIndexProgress): void {
    // Create a new object to ensure React detects the change
    this.currentProgress = { ...progress };
    console.log('🔔 Notifying progress to', this.progressListeners.size, 'listeners:', this.currentProgress);
    this.progressListeners.forEach(listener => {
      try {
        listener({ ...this.currentProgress });
      } catch (error) {
        console.error('Error in progress listener:', error);
      }
    });
  }

  /**
   * Get current indexing progress
   */
  getProgress(): DeepIndexProgress {
    return { ...this.currentProgress };
  }

  /**
   * Check if a form file is already indexed
   */
  hasCache(fileId: string, fileVersion: string): boolean {
    const cacheKey = `${fileId}:${fileVersion}`;
    return this.formTextCache.has(cacheKey);
  }

  /**
   * Get cached search text for a file
   */
  getCache(fileId: string, fileVersion: string): string | undefined {
    const cacheKey = `${fileId}:${fileVersion}`;
    return this.formTextCache.get(cacheKey);
  }

  /**
   * Set cached search text for a file
   */
  setCache(fileId: string, fileVersion: string, searchText: string): void {
    const cacheKey = `${fileId}:${fileVersion}`;
    this.formTextCache.set(cacheKey, searchText);
  }

  /**
   * Clear all cached search text
   */
  clearCache(): void {
    this.formTextCache.clear();
  }

  /**
   * Invalidate cache entries for a specific file
   */
  invalidateFileCache(fileId: string): void {
    const keysToDelete: string[] = [];
    this.formTextCache.forEach((_, key) => {
      if (key.startsWith(`${fileId}:`)) {
        keysToDelete.push(key);
      }
    });
    keysToDelete.forEach(key => this.formTextCache.delete(key));
  }

  /**
   * Check if any forms are indexed
   */
  hasAnyIndex(): boolean {
    return this.formTextCache.size > 0;
  }

  /**
   * Get cache size
   */
  getCacheSize(): number {
    return this.formTextCache.size;
  }

  /**
   * Extract file version for cache key
   */
  private extractFileVersion(file: FileData): string {
    if (!file) {
      return 'unknown';
    }

    const candidate = file.lastModified || file.modifiedAt;

    if (candidate && typeof candidate === 'object' && 'seconds' in candidate) {
      const timestamp = candidate as { seconds: number; nanoseconds?: number };
      return `${timestamp.seconds}-${timestamp.nanoseconds ?? 0}`;
    }

    if (candidate && typeof candidate === 'object' && 'toMillis' in candidate) {
      const timestamp = candidate as { toMillis: () => number };
      return `${timestamp.toMillis()}`;
    }

    if (typeof candidate === 'number' || typeof candidate === 'string') {
      return `${candidate}`;
    }

    return `${file.id || 'unknown'}`;
  }

  /**
   * Build searchable text from form content
   */
  private async buildFormSearchText(
    file: FileData,
    userId: string,
    privateKey: string,
    forceRefresh = false
  ): Promise<string | undefined> {
    try {
      let contentBuffer: Uint8Array | ArrayBuffer;
      
      if (forceRefresh) {
        // Force fresh download from storage, bypassing all caches
        const { getFile } = await import('../storage');
        const encryptedContent = await getFile(file.storagePath);
        
        const userEncryptedKey = file.encryptedKeys[userId];
        if (!userEncryptedKey) {
          throw new Error('No access key found for this file');
        }
        
        contentBuffer = await FileEncryptionService.decryptFile(
          new Uint8Array(encryptedContent),
          userEncryptedKey,
          privateKey
        );
      } else {
        // Use normal loading with caching
        contentBuffer = await FileAccessService.loadFileContent(file, userId, privateKey);
      }
      
      const decoded = new TextDecoder().decode(new Uint8Array(contentBuffer));
      const formData = JSON.parse(decoded);

      const parts: string[] = [];

      const addValue = (value: unknown) => {
        if (!value) return;
        if (Array.isArray(value)) {
          value.forEach(addValue);
          return;
        }
        if (typeof value === 'object' && value !== null) {
          Object.values(value).forEach(addValue);
          return;
        }
        const str = String(value).trim();
        if (str && str !== '[object Object]') {
          parts.push(str.toLowerCase());
        }
      };

      if (formData.title) {
        parts.push(formData.title.toLowerCase());
      }

      if (Array.isArray(formData.fields)) {
        formData.fields.forEach((field: Record<string, unknown>) => {
          if (field.label && typeof field.label === 'string') {
            parts.push(field.label.toLowerCase());
          }
          if (field.value !== undefined && field.value !== null) {
            addValue(field.value);
          }
        });
      }

      return parts.length > 0 ? parts.join(' ') : undefined;
    } catch (error) {
      console.warn('Failed to build form search text:', error);
      return undefined;
    }
  }

  /**
   * Start deep indexing of form files
   * Returns immediately if indexing is already in progress
   */
  async startIndexing(
    formFiles: Array<{ file: FileData; metadata: CachedFileMetadata }>,
    userId: string,
    privateKey: string
  ): Promise<void> {
    // If already indexing, return the existing promise
    if (this.indexingPromise) {
      console.log('⏳ Deep indexing already in progress, returning existing promise');
      return this.indexingPromise;
    }

    // Filter out already-indexed files
    const filesToIndex = formFiles.filter(({ file }) => {
      const version = this.extractFileVersion(file);
      return !this.hasCache(file.id!, version);
    });

    if (filesToIndex.length === 0) {
      console.log('✅ All forms already indexed');
      this.notifyProgress({
        isIndexing: false,
        total: 0,
        processed: 0,
      });
      return;
    }

    console.log(`🔍 Starting deep indexing of ${filesToIndex.length} form files...`);
    
    this.shouldCancel = false;
    
    // Create and store the indexing promise
    this.indexingPromise = this.performIndexing(filesToIndex, userId, privateKey);
    
    // Wait for completion
    try {
      await this.indexingPromise;
    } finally {
      this.indexingPromise = null;
    }
  }

  /**
   * Perform the actual indexing work
   */
  private async performIndexing(
    filesToIndex: Array<{ file: FileData; metadata: CachedFileMetadata }>,
    userId: string,
    privateKey: string
  ): Promise<void> {
    const total = filesToIndex.length;
    let processed = 0;

    this.notifyProgress({
      isIndexing: true,
      total,
      processed: 0,
    });

    for (const { file, metadata } of filesToIndex) {
      // Check for cancellation
      if (this.shouldCancel) {
        console.log('🛑 Deep indexing cancelled');
        break;
      }

      try {
        this.notifyProgress({
          isIndexing: true,
          total,
          processed,
          currentFile: metadata.decryptedName,
        });

        const version = this.extractFileVersion(file);
        const searchText = await this.buildFormSearchText(file, userId, privateKey);
        
        if (searchText) {
          this.setCache(file.id!, version, searchText);
          console.log(`✅ Indexed: ${metadata.decryptedName}`);
        }

        processed++;
        
        // Small delay to keep UI responsive
        await new Promise(resolve => setTimeout(resolve, 10));
      } catch (error) {
        console.warn(`Failed to index form ${file.id}:`, error);
        processed++;
      }
    }

    this.notifyProgress({
      isIndexing: false,
      total,
      processed,
    });

    console.log(`✅ Deep indexing complete: ${processed}/${total} forms indexed`);
  }

  /**
   * Cancel ongoing indexing
   */
  cancelIndexing(): void {
    if (this.currentProgress.isIndexing) {
      console.log('🛑 Cancelling deep indexing...');
      this.shouldCancel = true;
    }
  }

  /**
   * Index a single form file
   */
  async indexSingleForm(
    file: FileData,
    metadata: CachedFileMetadata,
    userId: string,
    privateKey: string,
    forceRefresh = false
  ): Promise<string | undefined> {
    if (!isFormFile(metadata.decryptedName)) {
      return undefined;
    }

    const version = this.extractFileVersion(file);

    // Check if already indexed with current version
    if (this.hasCache(file.id!, version) && !forceRefresh) {
      console.log(`✅ Form ${file.id} already indexed with current version`);
      return this.getCache(file.id!, version);
    }

    console.log(`🔍 Auto-indexing form: ${metadata.decryptedName}`);
    const searchText = await this.buildFormSearchText(file, userId, privateKey, forceRefresh);
    
    if (searchText) {
      this.setCache(file.id!, version, searchText);
      console.log(`✅ Form indexed: ${metadata.decryptedName}`);
    }

    return searchText;
  }
}

// Singleton instance
export const deepIndexService = new DeepIndexService();
