/**
 * Utility script to clean up files with invalid metadata format
 * This removes files that were uploaded before the nonce fix
 */

import { collection, getDocs, deleteDoc, doc, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { deleteObject, ref } from 'firebase/storage';
import { storage } from '../firebase';

export interface FileToDelete {
  id: string;
  storagePath: string;
  owner: string;
  name: any;
  size: any;
}

/**
 * Check if a file has invalid metadata (empty nonce or old format)
 */
function hasInvalidMetadata(fileData: any): boolean {
  const name = fileData.name;
  const size = fileData.size;
  
  // If it's an object but has empty nonce, it's invalid
  if (typeof name === 'object' && name.nonce === '') {
    return true;
  }
  
  if (typeof size === 'object' && size.nonce === '') {
    return true;
  }
  
  // If it has the old salt format, it's also invalid for files
  if (typeof name === 'object' && 'salt' in name) {
    return true;
  }
  
  if (typeof size === 'object' && 'salt' in size) {
    return true;
  }
  
  return false;
}

/**
 * Get all files with invalid metadata
 */
export async function getFilesWithInvalidMetadata(userUid: string): Promise<FileToDelete[]> {
  const filesRef = collection(db, 'files');
  const q = query(filesRef, where('owner', '==', userUid));
  const querySnapshot = await getDocs(q);
  
  const invalidFiles: FileToDelete[] = [];
  
  querySnapshot.forEach((doc) => {
    const data = doc.data();
    
    if (hasInvalidMetadata(data)) {
      invalidFiles.push({
        id: doc.id,
        storagePath: data.storagePath,
        owner: data.owner,
        name: data.name,
        size: data.size,
      });
    }
  });
  
  return invalidFiles;
}

/**
 * Delete a single file from both Firestore and Storage
 */
export async function deleteFile(file: FileToDelete): Promise<void> {
  try {
    // Delete from Firestore
    await deleteDoc(doc(db, 'files', file.id));
    
    // Delete from Storage
    if (file.storagePath) {
      const storageRef = ref(storage, file.storagePath);
      await deleteObject(storageRef);
    }
    
    console.log(`Successfully deleted file ${file.id} (${file.storagePath})`);
  } catch (error) {
    console.error(`Failed to delete file ${file.id}:`, error);
    throw error;
  }
}

/**
 * Delete all files with invalid metadata for a user
 */
export async function cleanupInvalidFiles(userUid: string): Promise<void> {
  console.log(`Starting cleanup for user ${userUid}...`);
  
  const invalidFiles = await getFilesWithInvalidMetadata(userUid);
  
  if (invalidFiles.length === 0) {
    console.log('No files with invalid metadata found.');
    return;
  }
  
  console.log(`Found ${invalidFiles.length} files with invalid metadata:`);
  invalidFiles.forEach((file, index) => {
    console.log(`  ${index + 1}. ${file.id} - Name type: ${typeof file.name}, Size type: ${typeof file.size}`);
  });
  
  console.log('Deleting files...');
  
  for (const file of invalidFiles) {
    try {
      await deleteFile(file);
    } catch (error) {
      console.error(`Failed to delete file ${file.id}, continuing...`);
    }
  }
  
  console.log(`Cleanup completed. Deleted ${invalidFiles.length} files.`);
}

/**
 * Get count of files with invalid metadata (for checking before cleanup)
 */
export async function countInvalidFiles(userUid: string): Promise<number> {
  const invalidFiles = await getFilesWithInvalidMetadata(userUid);
  return invalidFiles.length;
}