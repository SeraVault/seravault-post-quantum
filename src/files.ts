import { collection, addDoc, serverTimestamp, doc, updateDoc, FieldValue, deleteDoc, getDoc } from 'firebase/firestore';
import { deleteObject, ref } from 'firebase/storage';
import { db, storage } from './firebase';
import { getFolderSharingPermissions } from './firestore';

export interface FileData {
  id?: string;
  owner: string;
  name: string | { ciphertext: string; nonce: string }; // Encrypted (legacy string or new metadata format)
  parent: string | null;
  createdAt: FieldValue;
  size: string | { ciphertext: string; nonce: string }; // Encrypted (legacy string or new metadata format)
  storagePath: string;
  encryptedKeys: { [uid: string]: string }; // uid -> encrypted key exchange result
  sharedWith: string[]; // Array of UIDs that have access
  isFavorite?: boolean; // User's favorite status
}

export const createFile = async (fileData: Omit<FileData, 'createdAt'>) => {
  const newFile: FileData = {
    ...fileData,
    createdAt: serverTimestamp(),
  };
  await addDoc(collection(db, 'files'), newFile);
};

export const updateFile = async (fileId: string, data: Partial<FileData>) => {
  console.log('updateFile called with:', { fileId, data });
  try {
    const docRef = doc(db, 'files', fileId);
    await updateDoc(docRef, data);
    console.log('File updated successfully in Firestore');
  } catch (error) {
    console.error('Error updating file in Firestore:', error);
    throw error;
  }
};

export const deleteFile = async (fileId: string) => {
  try {
    const docRef = doc(db, 'files', fileId);
    
    // First get the file document to retrieve the storage path
    const fileDoc = await getDoc(docRef);
    if (fileDoc.exists()) {
      const fileData = fileDoc.data() as FileData;
      
      // Delete from Firebase Storage if storage path exists
      if (fileData.storagePath) {
        try {
          await deleteObject(ref(storage, fileData.storagePath));
          console.log(`Successfully deleted file from storage: ${fileData.storagePath}`);
        } catch (storageError: any) {
          // Don't fail the entire operation if storage deletion fails
          // File might have already been deleted or path might be invalid
          console.warn(`Failed to delete file from storage ${fileData.storagePath}:`, storageError);
        }
      }
    }
    
    // Delete the Firestore document
    await deleteDoc(docRef);
    console.log(`Successfully deleted file document: ${fileId}`);
    
  } catch (error) {
    console.error(`Error deleting file ${fileId}:`, error);
    throw error;
  }
};

export const createFileWithSharing = async (fileData: Omit<FileData, 'createdAt'>) => {
  console.log('Creating file with automatic sharing inheritance:', fileData);
  
  try {
    // Get folder sharing permissions if file is in a folder
    const folderSharedWith = fileData.parent 
      ? await getFolderSharingPermissions(fileData.parent)
      : [];
    
    // Merge folder sharing with existing file sharing
    const allSharedWith = Array.from(new Set([
      ...fileData.sharedWith,
      ...folderSharedWith
    ]));
    
    const newFile: FileData = {
      ...fileData,
      sharedWith: allSharedWith,
      createdAt: serverTimestamp(),
    };
    
    const docRef = await addDoc(collection(db, 'files'), newFile);
    console.log('File created with inherited sharing:', { fileId: docRef.id, sharedWith: allSharedWith });
    return docRef.id;
  } catch (error) {
    console.error('Error creating file with sharing:', error);
    throw error;
  }
};