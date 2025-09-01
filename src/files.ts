import { collection, addDoc, serverTimestamp, doc, updateDoc, FieldValue, deleteDoc } from 'firebase/firestore';
import { db } from './firebase';
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
  const docRef = doc(db, 'files', fileId);
  await deleteDoc(docRef);
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