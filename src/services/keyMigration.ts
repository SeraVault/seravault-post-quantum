import { collection, query, where, getDocs, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { decryptData, encryptData, hexToBytes, bytesToHex } from '../crypto/hpkeCrypto';

interface FileDocument {
  id: string;
  encryptedKeys: { [userId: string]: string };
  [key: string]: any;
}

/**
 * Count how many files and folders would be affected by key regeneration
 */
export async function countUserFiles(userId: string): Promise<number> {
  try {
    // Query for files owned by user
    const ownedFilesQuery = query(
      collection(db, 'files'),
      where('owner', '==', userId)
    );
    
    // Query for files shared with user
    const sharedFilesQuery = query(
      collection(db, 'files'), 
      where('sharedWith', 'array-contains', userId)
    );

    // Query for folders owned by user  
    const foldersQuery = query(
      collection(db, 'folders'),
      where('owner', '==', userId)
    );

    const [ownedSnapshot, sharedSnapshot, foldersSnapshot] = await Promise.all([
      getDocs(ownedFilesQuery),
      getDocs(sharedFilesQuery),
      getDocs(foldersQuery)
    ]);

    // Use Set to avoid counting duplicates
    const itemIds = new Set();
    
    // Count files
    ownedSnapshot.forEach(doc => {
      const data = doc.data();
      if (data.encryptedKeys && data.encryptedKeys[userId]) {
        itemIds.add(`file_${doc.id}`);
      }
    });
    
    sharedSnapshot.forEach(doc => {
      const data = doc.data();
      if (data.encryptedKeys && data.encryptedKeys[userId]) {
        itemIds.add(`file_${doc.id}`);
      }
    });

    // Count folders
    foldersSnapshot.forEach(doc => {
      const data = doc.data();
      if (data.encryptedKeys && data.encryptedKeys[userId]) {
        itemIds.add(`folder_${doc.id}`);
      }
    });

    console.log('=== DEBUG: Key Migration Count ===');
    console.log(`User ID: ${userId}`);
    console.log(`Owned files found: ${ownedSnapshot.size}`);
    console.log(`Shared files found: ${sharedSnapshot.size}`);
    console.log(`Folders found: ${foldersSnapshot.size}`);
    console.log(`Total encrypted items found: ${itemIds.size}`);
    
    // Debug individual items
    ownedSnapshot.forEach(doc => {
      const data = doc.data();
      console.log(`Owned file ${doc.id}:`, {
        hasEncryptedKeys: !!data.encryptedKeys,
        hasUserKey: !!(data.encryptedKeys && data.encryptedKeys[userId]),
        encryptedKeys: data.encryptedKeys
      });
    });
    
    foldersSnapshot.forEach(doc => {
      const data = doc.data();
      console.log(`Folder ${doc.id}:`, {
        hasEncryptedKeys: !!data.encryptedKeys,
        hasUserKey: !!(data.encryptedKeys && data.encryptedKeys[userId]),
        encryptedKeys: data.encryptedKeys
      });
    });
    
    return itemIds.size;
  } catch (error) {
    console.error('Error counting user files:', error);
    return 0;
  }
}

/**
 * Migrate all user's files and folders from old HPKE key to new HPKE key
 */
export async function migrateUserFiles(
  userId: string,
  oldPrivateKeyHex: string,
  newPublicKeyBytes: Uint8Array,
  onProgress?: (current: number, total: number) => void
): Promise<{ success: number; failed: string[] }> {
  const results = { success: 0, failed: [] as string[] };
  
  try {
    // Get all files that have encrypted keys for this user
    const ownedFilesQuery = query(
      collection(db, 'files'),
      where('owner', '==', userId)
    );
    
    const sharedFilesQuery = query(
      collection(db, 'files'),
      where('sharedWith', 'array-contains', userId)
    );

    // Get all folders that have encrypted keys for this user
    const foldersQuery = query(
      collection(db, 'folders'),
      where('owner', '==', userId)
    );

    const [ownedSnapshot, sharedSnapshot, foldersSnapshot] = await Promise.all([
      getDocs(ownedFilesQuery),
      getDocs(sharedFilesQuery),
      getDocs(foldersQuery)
    ]);

    // Combine all items, avoiding duplicates
    const itemsMap = new Map<string, { id: string; collection: string; data: any }>();
    
    // Add files
    ownedSnapshot.forEach(docSnapshot => {
      const data = docSnapshot.data();
      if (data.encryptedKeys && data.encryptedKeys[userId]) {
        itemsMap.set(`file_${docSnapshot.id}`, { 
          id: docSnapshot.id, 
          collection: 'files', 
          data: { id: docSnapshot.id, ...data } 
        });
      }
    });
    
    sharedSnapshot.forEach(docSnapshot => {
      const data = docSnapshot.data();
      if (data.encryptedKeys && data.encryptedKeys[userId]) {
        itemsMap.set(`file_${docSnapshot.id}`, { 
          id: docSnapshot.id, 
          collection: 'files', 
          data: { id: docSnapshot.id, ...data } 
        });
      }
    });

    // Add folders
    foldersSnapshot.forEach(docSnapshot => {
      const data = docSnapshot.data();
      if (data.encryptedKeys && data.encryptedKeys[userId]) {
        itemsMap.set(`folder_${docSnapshot.id}`, { 
          id: docSnapshot.id, 
          collection: 'folders', 
          data: { id: docSnapshot.id, ...data } 
        });
      }
    });

    const items = Array.from(itemsMap.values());
    const total = items.length;
    let current = 0;

    console.log(`Starting migration of ${total} items (files & folders) for user ${userId}`);

    for (const item of items) {
      try {
        // Decrypt the AES key with the old private key
        const userEncryptedKey = item.data.encryptedKeys[userId];
        const keyData = hexToBytes(userEncryptedKey);
        
        // HPKE encrypted keys: encapsulated_key (32 bytes) + ciphertext
        const encapsulatedKey = keyData.slice(0, 32);
        const ciphertext = keyData.slice(32);
        
        const oldPrivateKeyBytes = hexToBytes(oldPrivateKeyHex);
        const aesKey = await decryptData(
          { encapsulatedKey, ciphertext },
          oldPrivateKeyBytes
        );

        // Re-encrypt the AES key with the new public key
        const newEncryptedData = await encryptData(aesKey, newPublicKeyBytes);
        
        // Combine encapsulated key + ciphertext for storage
        const newKeyData = new Uint8Array(
          newEncryptedData.encapsulatedKey.length + newEncryptedData.ciphertext.length
        );
        newKeyData.set(newEncryptedData.encapsulatedKey, 0);
        newKeyData.set(newEncryptedData.ciphertext, newEncryptedData.encapsulatedKey.length);

        // Update the document
        const updatedEncryptedKeys = {
          ...item.data.encryptedKeys,
          [userId]: bytesToHex(newKeyData)
        };

        await updateDoc(doc(db, item.collection, item.id), {
          encryptedKeys: updatedEncryptedKeys
        });

        results.success++;
        current++;
        
        if (onProgress) {
          onProgress(current, total);
        }
        
        console.log(`Migrated ${item.collection.slice(0, -1)} ${item.id} (${current}/${total})`);

      } catch (error) {
        console.error(`Failed to migrate ${item.collection.slice(0, -1)} ${item.id}:`, error);
        results.failed.push(`${item.collection.slice(0, -1)}_${item.id}`);
        current++;
        
        if (onProgress) {
          onProgress(current, total);
        }
      }
    }

    console.log(`Migration completed: ${results.success} success, ${results.failed.length} failed`);
    return results;

  } catch (error) {
    console.error('Error during migration:', error);
    throw error;
  }
}

/**
 * Check if user has accessible files that would be lost
 */
export async function hasAccessibleFiles(userId: string): Promise<boolean> {
  const count = await countUserFiles(userId);
  return count > 0;
}