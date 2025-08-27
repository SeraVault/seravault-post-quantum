import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../auth/AuthContext';
import { usePassphrase } from '../auth/PassphraseContext';
import { type Folder as FolderData, getUserProfile } from '../firestore';
import { decryptString, base64ToBytes, decryptSymmetric, hexToBytes } from '../crypto/postQuantumCrypto';
import { ml_kem768 } from '@noble/post-quantum/ml-kem';

export const useFolders = () => {
  const { user } = useAuth();
  const { privateKey } = usePassphrase();
  const [allFolders, setAllFolders] = useState<FolderData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Cache for decrypted folder names to avoid re-decrypting unchanged folders
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

    const q = query(collection(db, 'folders'), where('owner', '==', user.uid));
    const unsubscribe = onSnapshot(
      q,
      async (querySnapshot) => {
        try {
          const newCache = new Map(decryptedNamesCache);
          
          const foldersData = await Promise.all(querySnapshot.docs.map(async (doc) => {
            const data = doc.data() as FolderData;
            
            // Create a cache key based on folder content that would change if the name changes
            const cacheKey = typeof data.name === 'object' && 'ciphertext' in data.name 
              ? `${doc.id}-${data.name.ciphertext}-${data.name.nonce}`
              : `${doc.id}-${data.name}`;
            
            // Check if we already have this decrypted
            if (newCache.has(cacheKey)) {
              return { ...data, id: doc.id, name: newCache.get(cacheKey)! };
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
                  
                  const encryptedKeyBytes = hexToBytes(userEncryptedKey);
                  const privateKeyBytes = hexToBytes(privateKey);
                  const sharedSecret = ml_kem768.decapsulate(encryptedKeyBytes, privateKeyBytes);
                  
                  // Decrypt the folder name (folders don't have size, so decrypt name directly)
                  const nonce = base64ToBytes(data.name.nonce);
                  const encryptedNameBytes = base64ToBytes(data.name.ciphertext);
                  const nameBytes = decryptSymmetric(encryptedNameBytes, sharedSecret, nonce);
                  const folderName = new TextDecoder().decode(nameBytes);
                  
                  decryptedName = folderName;
                } catch (pqError) {
                  console.error(`Post-quantum decryption failed for folder ${doc.id}:`, pqError);
                  throw pqError;
                }
              } else if (typeof data.name === 'object' && 'ciphertext' in data.name) {
                // Old post-quantum format without encryptedKeys (direct decryption)
                try {
                  decryptedName = decryptString(data.name as any, privateKey);
                } catch (oldPqError) {
                  console.error(`Old post-quantum decryption failed for folder ${doc.id}:`, oldPqError);
                  throw oldPqError;
                }
              } else if (typeof data.name === 'string') {
                // Legacy AES format - dynamic import only when needed
                const { AES, enc } = await import('crypto-js');
                decryptedName = AES.decrypt(data.name, privateKey).toString(enc.Utf8);
              } else {
                console.error(`Invalid folder name format for ${doc.id}:`, data.name);
                throw new Error('Invalid folder name format');
              }
              
              // Cache the decrypted name
              newCache.set(cacheKey, decryptedName);
              
              return { ...data, id: doc.id, name: decryptedName };
            } catch (decryptError) {
              console.error(`Error decrypting folder name for ${doc.id}:`, decryptError);
              const errorName = '[Decryption Error]';
              newCache.set(cacheKey, errorName);
              return { ...data, id: doc.id, name: errorName };
            }
          }));
          
          // Update cache and folders
          setDecryptedNamesCache(newCache);
          setAllFolders(foldersData);
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

    return () => unsubscribe();
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