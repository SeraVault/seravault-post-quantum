import { useState, useEffect } from 'react';
import { backendService } from '../backend/BackendService';
import { useAuth } from '../auth/AuthContext';
import { usePassphrase } from '../auth/PassphraseContext';
import { type Folder as FolderData, getUserProfile } from '../firestore';
import { decryptString, base64ToBytes } from '../crypto/quantumSafeCrypto';
import { decryptData, decryptSymmetric, hexToBytes } from '../crypto/quantumSafeCrypto';

export const useFolders = () => {
  const { user } = useAuth();
  const { privateKey } = usePassphrase();
  const [allFolders, setAllFolders] = useState<FolderData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Cache for decrypted folder names to avoid re-decrypting unchanged folders
  // SECURITY: Only stored in memory, never in localStorage to prevent exposure of decrypted data
  const [decryptedNamesCache, setDecryptedNamesCache] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    if (!user || !privateKey) {
      setAllFolders([]);
      setDecryptedNamesCache(new Map()); // Clear cache
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    setDecryptedNamesCache(new Map()); // Clear cache when user/key changes

    // Add small delay to allow auth token to propagate to Firestore
    let unsubscribe: (() => void) | null = null;
    const setupListener = setTimeout(() => {
      unsubscribe = backendService.folders.subscribe(
        user.uid,
        async (folders) => {
        const startTime = Date.now();
        console.log('🔧 useFolders subscription callback received:', { 
          size: folders.length,
          isEmpty: folders.length === 0
        });

        // Early exit if no folders to process
        if (folders.length === 0) {
          console.log('✅ useFolders: No folders found, skipping decryption');
          setAllFolders([]);
          setDecryptedNamesCache(new Map());
          setLoading(false);
          return;
        }
        
        try {
          const newCache = new Map(decryptedNamesCache);
          
          const foldersData = await Promise.all(folders.map(async (data) => {
            // Create a cache key based on folder content that would change if the name changes
            const cacheKey = typeof data.name === 'object' && 'ciphertext' in data.name 
              ? `${data.id}-${data.name.ciphertext}-${data.name.nonce}`
              : `${data.id}-${data.name}`;
            
            // Check if we already have this decrypted
            if (newCache.has(cacheKey)) {
              return { ...data, name: newCache.get(cacheKey)! };
            }
            
            try {
              // Try different decryption methods based on format
              let decryptedName: string;
              
              if (typeof data.name === 'object' && 'ciphertext' in data.name && data.encryptedKeys) {
                // New post-quantum encrypted format with encryptedKeys
                try {
                  // Get the encrypted key for this user
                  const userEncryptedKey = data.encryptedKeys[user?.uid || ''];
                  if (!userEncryptedKey) {
                    throw new Error('No encrypted key found for user');
                  }

                  // DEBUG: Log key information for troubleshooting
                  console.log('🔧 useFolders DEBUG - Decrypting folder with private key:', {
                    folderId: data.id,
                    userId: user?.uid,
                    privateKeyLength: privateKey.length,
                    privateKeyPreview: privateKey.substring(0, 16) + '...',
                    privateKeyFull: privateKey, // Remove this in production
                    userEncryptedKeyLength: userEncryptedKey.length,
                    userEncryptedKeyPreview: userEncryptedKey.substring(0, 32) + '...'
                  });
                  
                  const privateKeyBytes = hexToBytes(privateKey);
                  const keyData = hexToBytes(userEncryptedKey);
                  
                  // Quantum-safe encrypted keys contain: IV (12 bytes) + encapsulated_key (1088 bytes) + ciphertext
                  const iv = keyData.slice(0, 12);
                  const encapsulatedKey = keyData.slice(12, 12 + 1088);
                  const ciphertext = keyData.slice(12 + 1088);
                  
                  const sharedSecret = await decryptData(
                    { iv, encapsulatedKey, ciphertext },
                    privateKeyBytes
                  );
                  
                  // Decrypt the folder name (folders don't have size, so decrypt name directly)
                  const nonce = hexToBytes(data.name.nonce);
                  const encryptedNameBytes = hexToBytes(data.name.ciphertext);
                  const nameBytes = await decryptSymmetric(encryptedNameBytes, sharedSecret, nonce);
                  const folderName = new TextDecoder().decode(nameBytes);
                  
                  decryptedName = folderName;
                } catch (pqError) {
                  console.error(`Post-quantum decryption failed for folder ${data.id}:`, pqError);
                  throw pqError;
                }
              } else if (typeof data.name === 'object' && 'ciphertext' in data.name) {
                // Old post-quantum format without encryptedKeys (direct decryption)
                try {
                  decryptedName = decryptString(data.name as any, privateKey);
                } catch (oldPqError) {
                  console.error(`Old post-quantum decryption failed for folder ${data.id}:`, oldPqError);
                  throw oldPqError;
                }
              } else if (typeof data.name === 'string') {
                // Legacy AES format - dynamic import only when needed
                const { AES, enc } = await import('crypto-js');
                decryptedName = AES.decrypt(data.name, privateKey).toString(enc.Utf8);
              } else {
                console.error(`Invalid folder name format for ${data.id}:`, data.name);
                throw new Error('Invalid folder name format');
              }
              
              // Cache the decrypted name
              newCache.set(cacheKey, decryptedName);
              
              return { ...data, name: decryptedName };
            } catch (decryptError) {
              console.error(`Error decrypting folder name for ${data.id}:`, decryptError);
              const errorName = '[Decryption Error]';
              newCache.set(cacheKey, errorName);
              return { ...data, name: errorName };
            }
          }));
          
          // Update cache and folders
          setDecryptedNamesCache(newCache);
          setAllFolders(foldersData);
          
          const endTime = Date.now();
          console.log('Folders processing completed:', {
            totalTimeMs: endTime - startTime,
            foldersCount: foldersData.length,
            cacheHits: newCache.size - decryptedNamesCache.size
          });
          
          setLoading(false);
        } catch (error) {
          console.error('Error processing folders:', error);
          setError('Failed to load folders');
          setLoading(false);
        }
      },
      (error) => {
        console.error('Error fetching folders:', error);
        setError('Failed to fetch folders');
        setLoading(false);
      }
    );
    }, 100);

    return () => {
      clearTimeout(setupListener);
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [user, privateKey]);

  // Helper function to get folders by parent
  const getFoldersByParent = (parentId: string | null): FolderData[] => {
    return allFolders.filter(folder => folder.parent === parentId);
  };

  // Helper function to get folder by id
  const getFolderById = (folderId: string): FolderData | undefined => {
    return allFolders.find(folder => folder.id === folderId);
  };

  // Helper function to build breadcrumb path
  const buildFolderPath = (currentFolderId: string | null): { id: string | null; name: string }[] => {
    if (!currentFolderId) {
      return [{ id: null, name: 'Home' }];
    }

    const path: { id: string | null; name: string }[] = [];
    let current: string | null = currentFolderId;

    while (current) {
      const folder = getFolderById(current);
      if (folder) {
        path.unshift({ 
          id: folder.id || null, 
          name: typeof folder.name === 'string' ? folder.name : '[Encrypted]'
        });
        current = folder.parent;
      } else {
        break;
      }
    }

    path.unshift({ id: null, name: 'Home' });
    return path;
  };

  return {
    allFolders,
    loading,
    error,
    getFoldersByParent,
    getFolderById,
    buildFolderPath,
  };
};