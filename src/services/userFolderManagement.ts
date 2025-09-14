import { updateFile, type FileData } from '../files';

/**
 * Get the folder ID for a specific user for a given file
 */
export const getUserFolderForFile = (file: FileData, userId: string): string | null => {
  // Use new userFolders structure if available
  if (file.userFolders && typeof file.userFolders === 'object' && userId in file.userFolders) {
    return file.userFolders[userId];
  }
  
  // Fallback to legacy parent field if user is owner
  if (file.owner === userId) {
    return file.parent;
  }
  
  // Default to root folder (null) for shared files without userFolders
  return null;
};

/**
 * Set the folder association for a specific user for a given file
 */
export const setUserFolderForFile = async (fileId: string, userId: string, folderId: string | null): Promise<void> => {
  const updatePath = `userFolders.${userId}`;
  const updateData = {
    [updatePath]: folderId
  };
  
  await updateFile(fileId, updateData);
};

/**
 * Move a file to a different folder for a specific user
 */
export const moveFileForUser = async (fileId: string, userId: string, targetFolderId: string | null): Promise<void> => {
  await setUserFolderForFile(fileId, userId, targetFolderId);
};

/**
 * Initialize userFolders structure for existing files during migration
 */
export const initializeUserFoldersForFile = async (file: FileData): Promise<void> => {
  if (!file.id || file.userFolders) {
    return; // Already has userFolders or no ID
  }
  
  const userFolders: { [uid: string]: string | null } = {};
  
  // Set owner's folder from legacy parent
  userFolders[file.owner] = file.parent;
  
  // Set all shared users to root folder by default
  file.sharedWith.forEach(uid => {
    if (uid !== file.owner) {
      userFolders[uid] = null;
    }
  });
  
  await updateFile(file.id, { userFolders });
};

/**
 * Add folder association for a newly shared user
 */
export const addUserFolderAssociation = async (fileId: string, userId: string, defaultFolderId: string | null = null): Promise<void> => {
  const updatePath = `userFolders.${userId}`;
  const updateData = {
    [updatePath]: defaultFolderId
  };
  
  await updateFile(fileId, updateData);
};

/**
 * Remove folder association when user access is revoked
 */
export const removeUserFolderAssociation = async (fileId: string, userId: string): Promise<void> => {
  const updatePath = `userFolders.${userId}`;
  const updateData = {
    [updatePath]: null // Set to null instead of deleting to maintain structure
  };
  
  await updateFile(fileId, updateData);
};