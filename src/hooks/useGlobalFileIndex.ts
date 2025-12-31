import { useAuth } from '../auth/AuthContext';
import { usePassphrase } from '../auth/PassphraseContext';
import { backendService } from '../backend/BackendService';
import type { FileData } from '../files';
import { getOrDecryptMetadata, type CachedFileMetadata } from '../services/metadataCache';
import { isFormFile } from '../utils/formFiles';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { deepIndexService, type DeepIndexProgress } from '../services/deepIndexService';

export interface FileIndexEntry {
  fileId: string;
  rawFile: FileData;
  indexedFile: FileData;
  metadata: CachedFileMetadata;
  folderId: string | null;
  searchableName: string;
  searchableTags: string[];
  searchableFormText?: string;
}

export type { DeepIndexProgress };

interface GlobalFileIndexState {
  entries: FileIndexEntry[];
  isBuilding: boolean;
  refresh: (force?: boolean) => void;
  lastBuiltAt: number | null;
  deepIndexProgress: DeepIndexProgress;
  startDeepIndexing: () => Promise<void>;
  indexSingleForm: (fileId: string) => Promise<void>;
  hasDeepIndex: boolean;
}

const extractFileVersion = (file: any): string => {
  if (!file) {
    return 'unknown';
  }

  const candidate = file.lastModified || file.modifiedAt || file.updatedAt;

  if (candidate?.seconds !== undefined) {
    return `${candidate.seconds}-${candidate.nanoseconds ?? 0}`;
  }

  if (typeof candidate?.toMillis === 'function') {
    return `${candidate.toMillis()}`;
  }

  if (typeof candidate === 'number' || typeof candidate === 'string') {
    return `${candidate}`;
  }

  return `${file.id || 'unknown'}`;
};

export const useGlobalFileIndex = (): GlobalFileIndexState => {
  const { user } = useAuth();
  const { privateKey } = usePassphrase();
  const [rawFiles, setRawFiles] = useState<FileData[]>([]);
  const [entries, setEntries] = useState<FileIndexEntry[]>([]);
  const [isBuilding, setIsBuilding] = useState(false);
  const [lastBuiltAt, setLastBuiltAt] = useState<number | null>(null);
  const [buildTrigger, setBuildTrigger] = useState(0);
  const subscriptionRef = useRef<null | (() => void)>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [deepIndexProgress, setDeepIndexProgress] = useState<DeepIndexProgress>(() => 
    deepIndexService.getProgress()
  );
  const [hasDeepIndex, setHasDeepIndex] = useState(() => 
    deepIndexService.hasAnyIndex()
  );

  // Subscribe to deep indexing progress updates
  useEffect(() => {
    const unsubscribe = deepIndexService.addProgressListener((progress) => {
      console.log('📊 Progress update received:', progress);
      setDeepIndexProgress({ ...progress }); // Create new object to ensure React detects the change
      setHasDeepIndex(deepIndexService.hasAnyIndex());
    });

    return unsubscribe;
  }, []);

  // Subscribe to all accessible files for the authenticated user
  useEffect(() => {
    if (!user) {
      setRawFiles([]);
      if (subscriptionRef.current) {
        subscriptionRef.current();
        subscriptionRef.current = null;
      }
      return;
    }

    subscriptionRef.current?.();
    subscriptionRef.current = backendService.files.subscribeAll(user.uid, (files) => {
      setRawFiles(files as FileData[]);
    });

    return () => {
      subscriptionRef.current?.();
      subscriptionRef.current = null;
    };
  }, [user?.uid]);

  // Debounce build requests when snapshots arrive rapidly
  useEffect(() => {
    if (!user || !privateKey) {
      setEntries([]);
      return;
    }

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      setBuildTrigger((prev) => prev + 1);
    }, 250);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, [rawFiles, user?.uid, privateKey]);

  useEffect(() => {
    if (!user || !privateKey) {
      setEntries([]);
      setIsBuilding(false);
      return;
    }

    let isCancelled = false;

    const buildIndex = async () => {
      if (rawFiles.length === 0) {
        setEntries([]);
        setLastBuiltAt(Date.now());
        setIsBuilding(false);
        return;
      }

      setIsBuilding(true);
      const nextEntries: FileIndexEntry[] = [];

      for (const file of rawFiles) {
        if (!file?.id) {
          continue;
        }

        try {
          const metadata = await getOrDecryptMetadata(file, user.uid, privateKey);
          const folderId = file.userFolders?.[user.uid] ?? file.parent ?? null;

          let searchableFormText: string | undefined;
          
          // OPTIMIZATION: Form content indexing is opt-in via startDeepIndexing()
          // By default, only file names/titles are indexed for fast performance
          // Users can trigger deep indexing to search within form field contents
          if (isFormFile(metadata.decryptedName)) {
            const version = extractFileVersion(file);
            
            // Check if we have cached search text from deep indexing
            if (deepIndexService.hasCache(file.id!, version)) {
              searchableFormText = deepIndexService.getCache(file.id!, version);
              console.log(`📝 Found cached search text for ${metadata.decryptedName}: ${searchableFormText?.substring(0, 50)}...`);
            } else {
              console.log(`⚠️ No cached search text for form: ${metadata.decryptedName}`);
            }
          }

          const indexedFile: FileData = {
            ...file,
            name: metadata.decryptedName,
            size: metadata.decryptedSize, // Now includes attachment sizes from save time
          };

          nextEntries.push({
            fileId: file.id!,
            rawFile: file,
            indexedFile,
            metadata,
            folderId,
            searchableName: metadata.decryptedName.toLowerCase(),
            searchableTags: metadata.tags.map((tag) => tag.toLowerCase()),
            searchableFormText,
          });
        } catch (error) {
          console.warn('Skipping file from search index due to metadata error:', file.id, error);
        }
      }

      if (!isCancelled) {
        setEntries(nextEntries);
        setIsBuilding(false);
        setLastBuiltAt(Date.now());
        // Update hasDeepIndex after rebuild to ensure it reflects current cache state
        setHasDeepIndex(deepIndexService.hasAnyIndex());
      }
    };

    buildIndex().catch((error) => {
      console.error('Failed to build global file index:', error);
      if (!isCancelled) {
        setIsBuilding(false);
      }
    });

    return () => {
      isCancelled = true;
    };
  }, [buildTrigger, rawFiles, user?.uid, privateKey]);

  const refresh = useCallback(
    (force = false) => {
      if (force) {
        deepIndexService.clearCache();
        setHasDeepIndex(false);
      }
      setBuildTrigger((prev) => prev + 1);
    },
    []
  );

  // Deep indexing function - decrypt form contents for full-text search
  const startDeepIndexing = useCallback(async () => {
    if (!user || !privateKey) {
      return;
    }

    // Prepare files to index with their metadata
    const formFilesToIndex = rawFiles
      .filter(file => file?.id)
      .map(file => {
        const entry = entries.find(e => e.fileId === file.id);
        return entry && isFormFile(entry.metadata.decryptedName) 
          ? { file, metadata: entry.metadata }
          : null;
      })
      .filter((item): item is { file: FileData; metadata: CachedFileMetadata } => item !== null);

    // Start indexing in the background service
    await deepIndexService.startIndexing(formFilesToIndex, user.uid, privateKey);
    
    // Update hasDeepIndex immediately after indexing completes
    setHasDeepIndex(deepIndexService.hasAnyIndex());
    
    // Trigger rebuild to include new searchable text in entries
    setBuildTrigger(prev => prev + 1);
  }, [user, privateKey, rawFiles, entries]);

  // Index a single form file (used after saving/updating forms)
  const indexSingleForm = useCallback(async (fileId: string) => {
    console.log(`🎯 indexSingleForm called for: ${fileId}`);
    
    if (!user || !privateKey) {
      console.log('❌ No user or privateKey, aborting auto-index');
      return;
    }

    console.log(`✓ User and privateKey available, proceeding with auto-index for ${fileId}`);

    // Invalidate any existing cache entries for this fileId
    deepIndexService.invalidateFileCache(fileId);

    // Wait for the file to appear in rawFiles and entries (with timeout)
    const maxAttempts = 10;
    const delayMs = 500;
    
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const file = rawFiles.find(f => f.id === fileId);
        const entry = entries.find(e => e.fileId === fileId);
        
        // If both are found, proceed with indexing
        if (file && entry) {
          const searchText = await deepIndexService.indexSingleForm(
            file, 
            entry.metadata, 
            user.uid, 
            privateKey, 
            true // Force refresh
          );
          
          if (searchText) {
            // Update just this entry in the index (no full rebuild needed)
            setEntries(prev => prev.map(e => 
              e.fileId === fileId 
                ? { ...e, searchableFormText: searchText }
                : e
            ));
            setHasDeepIndex(true);
          }
          return; // Success, exit
        }
        
        // File not found yet, wait and retry
        if (attempt < maxAttempts - 1) {
          console.log(`⏳ Waiting for file ${fileId} to appear in index (attempt ${attempt + 1}/${maxAttempts})...`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      } catch (error) {
        console.warn(`Failed to index form ${fileId}:`, error);
        return;
      }
    }
    
    // Fallback: If still not found, try fetching directly from backend
    console.log(`⚠️ File ${fileId} not in subscription yet, trying direct server fetch...`);
    try {
      const file = await backendService.files.get(fileId, true);
      if (!file) {
        console.log(`❌ File ${fileId} not found in backend`);
        return;
      }
      
      const metadata = await getOrDecryptMetadata(file, user.uid, privateKey);
      
      const searchText = await deepIndexService.indexSingleForm(
        file, 
        metadata, 
        user.uid, 
        privateKey, 
        true
      );
      
      if (searchText) {
        // Check if entry exists in current index
        const existingEntry = entries.find(e => e.fileId === fileId);
        if (existingEntry) {
          // Update existing entry with new search text
          setEntries(prev => prev.map(e => 
            e.fileId === fileId 
              ? { ...e, searchableFormText: searchText }
              : e
          ));
        } else {
          // Entry not in index yet, trigger a full rebuild to include it
          console.log(`📋 Entry not found in index, triggering rebuild`);
          setBuildTrigger(prev => prev + 1);
        }
        setHasDeepIndex(true);
      }
    } catch (fallbackError) {
      console.warn(`Failed to index form ${fileId} via direct fetch:`, fallbackError);
    }
  }, [user, privateKey, rawFiles, entries]);

  return useMemo(
    () => ({ 
      entries, 
      isBuilding, 
      refresh, 
      lastBuiltAt,
      deepIndexProgress,
      startDeepIndexing,
      indexSingleForm,
      hasDeepIndex,
    }),
    [entries, isBuilding, refresh, lastBuiltAt, deepIndexProgress, startDeepIndexing, indexSingleForm, hasDeepIndex]
  );
};
