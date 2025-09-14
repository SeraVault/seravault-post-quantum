import { collection, addDoc, serverTimestamp, doc, updateDoc, FieldValue, deleteDoc, getDoc } from 'firebase/firestore';
import { deleteObject, ref } from 'firebase/storage';
import { db, storage } from './firebase';
import { getFolderSharingPermissions } from './firestore';
import { invalidateStorageUsage } from './services/simpleStorageUsage';

export interface FileData {
  id?: string;
  owner: string;
  name: string | { ciphertext: string; nonce: string }; // Encrypted (legacy string or new metadata format) - owner's original name
  parent: string | null; // Deprecated - kept for backward compatibility
  userFolders?: { [uid: string]: string | null }; // Per-user folder associations (uid -> folderId or null)
  userNames?: { [uid: string]: { ciphertext: string; nonce: string } }; // Per-user file names (uid -> encrypted name)
  createdAt: FieldValue;
  lastModified?: Date | string; // Date when file was last modified (unencrypted)
  size: string | { ciphertext: string; nonce: string }; // Encrypted (legacy string or new metadata format)
  storagePath: string;
  encryptedKeys: { [uid: string]: string }; // uid -> encrypted key exchange result
  sharedWith: string[]; // Array of UIDs that have access
  isFavorite?: boolean; // Deprecated - kept for backward compatibility
  userFavorites?: { [uid: string]: boolean }; // Per-user favorite status (uid -> isFavorite)
  userTags?: { [uid: string]: { ciphertext: string; nonce: string } }; // Per-user encrypted tags
}

export const createFile = async (fileData: Omit<FileData, 'createdAt'>) => {
  const newFile: FileData = {
    ...fileData,
    createdAt: serverTimestamp(),
  };
  await addDoc(collection(db, 'files'), newFile);
  
  // Invalidate storage usage cache for the file owner
  invalidateStorageUsage(fileData.owner);
};

export const updateFile = async (fileId: string, data: Partial<FileData>) => {
  try {
    const docRef = doc(db, 'files', fileId);
    await updateDoc(docRef, data);
  } catch (error) {
    console.error('Error updating file in Firestore:', error);
    throw error;
  }
};

export const deleteFile = async (fileId: string) => {
  try {
    const docRef = doc(db, 'files', fileId);
    
    // First get the file document to retrieve the storage path and owner
    const fileDoc = await getDoc(docRef);
    let fileOwner: string | undefined;
    
    if (fileDoc.exists()) {
      const fileData = fileDoc.data() as FileData;
      fileOwner = fileData.owner;
      
      // Delete from Firebase Storage if storage path exists
      if (fileData.storagePath) {
        try {
          await deleteObject(ref(storage, fileData.storagePath));
        } catch (storageError: any) {
          // Don't fail the entire operation if storage deletion fails
          // File might have already been deleted or path might be invalid
          console.warn(`Failed to delete file from storage ${fileData.storagePath}:`, storageError);
        }
      }
    }
    
    // Delete the Firestore document
    await deleteDoc(docRef);
    
    // Invalidate storage usage cache for the file owner
    if (fileOwner) {
      invalidateStorageUsage(fileOwner);
    }
    
  } catch (error) {
    console.error(`Error deleting file ${fileId}:`, error);
    throw error;
  }
};

export const createFileWithSharing = async (fileData: Omit<FileData, 'createdAt'>) => {
  
  try {
    // Initialize userFolders if not provided
    if (!fileData.userFolders) {
      fileData.userFolders = {};
      // Set owner's folder from legacy parent field for backward compatibility
      if (fileData.parent !== undefined) {
        fileData.userFolders[fileData.owner] = fileData.parent;
      }
    }
    
    // Initialize sharedWith if not provided
    if (!fileData.sharedWith) {
      fileData.sharedWith = [];
    }
    
    // Ensure all users in sharedWith have folder associations (default to null)
    fileData.sharedWith.forEach(uid => {
      if (!(uid in fileData.userFolders!)) {
        fileData.userFolders![uid] = null;
      }
    });
    
    // Get folder sharing permissions from owner's folder if file is in a folder
    const ownerFolder = fileData.userFolders[fileData.owner];
    const folderSharedWith = ownerFolder 
      ? await getFolderSharingPermissions(ownerFolder)
      : [];
    
    // Merge folder sharing with existing file sharing
    const allSharedWith = Array.from(new Set([
      ...fileData.sharedWith,
      ...folderSharedWith
    ]));
    
    // Add folder associations for newly shared users
    allSharedWith.forEach(uid => {
      if (!(uid in fileData.userFolders!)) {
        fileData.userFolders![uid] = null;
      }
    });
    
    const newFile: FileData = {
      ...fileData,
      sharedWith: allSharedWith,
      createdAt: serverTimestamp(),
    };
    
    const docRef = await addDoc(collection(db, 'files'), newFile);
    
    // Invalidate storage usage cache for the file owner
    invalidateStorageUsage(fileData.owner);
    
    return docRef.id;
  } catch (error) {
    console.error('Error creating file with sharing:', error);
    throw error;
  }
};