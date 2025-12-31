/**
 * Account Deletion Service
 * Handles complete user account deletion including all associated data
 */

import { deleteUser } from 'firebase/auth';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  writeBatch,
  doc,
  deleteDoc,
  deleteField
} from 'firebase/firestore';
import { ref, listAll, deleteObject } from 'firebase/storage';
import type { StorageReference } from 'firebase/storage';
import { legacyDb as db, legacyStorage as storage } from '../backend/FirebaseBackend';
import type { User } from 'firebase/auth';

interface DeletionProgress {
  step: string;
  current: number;
  total: number;
}

/**
 * Delete all user data from Firestore and Storage, then delete the auth account
 */
export async function deleteUserAccount(
  user: User,
  onProgress?: (progress: DeletionProgress) => void
): Promise<void> {
  if (!user) {
    throw new Error('No user provided for deletion');
  }

  const userId = user.uid;

  const updateProgress = (step: string, current: number, total: number) => {
    if (onProgress) {
      onProgress({ step, current, total });
    }
  };

  try {
    // Step 1: Delete user's files from Storage
    updateProgress('Deleting storage files', 0, 100);
    await deleteUserStorageFiles(userId, (current, total) => {
      updateProgress('Deleting storage files', current, total);
    });

    // Step 2: Delete user's files from Firestore
    updateProgress('Deleting file records', 0, 100);
    await deleteUserFiles(userId);

    // Step 3: Delete user's folders
    updateProgress('Deleting folders', 0, 100);
    await deleteUserFolders(userId);

    // Step 4: Delete user's contacts and contact requests
    updateProgress('Deleting contacts', 0, 100);
    await deleteUserContacts(userId);

    // Step 5: Delete user's groups
    updateProgress('Deleting groups', 0, 100);
    await deleteUserGroups(userId);

    // Step 6: Delete user's notifications
    updateProgress('Deleting notifications', 0, 100);
    await deleteUserNotifications(userId);

    // Step 7: Delete user's conversations/chats
    updateProgress('Deleting conversations', 0, 100);
    await deleteUserConversations(userId);

    // Step 8: Remove user from shared files
    updateProgress('Cleaning up shared files', 0, 100);
    await removeUserFromSharedFiles(userId);

    // Step 9: Remove user from shared folders (TODO: implement when folder sharing is added)
    // updateProgress('Cleaning up shared folders', 0, 100);
    // await removeUserFromSharedFolders(userId);

    // Step 10: Delete user profile
    updateProgress('Deleting user profile', 0, 1);
    await deleteUserProfile(userId);

    // Step 11: Delete authentication account
    updateProgress('Deleting authentication account', 0, 1);
    await deleteUser(user);

    updateProgress('Account deletion complete', 1, 1);
  } catch (error) {
    console.error('Error deleting user account:', error);
    throw new Error(`Failed to delete account: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Delete all files owned by the user from Storage
 */
async function deleteUserStorageFiles(
  userId: string,
  onProgress?: (current: number, total: number) => void
): Promise<void> {
  try {
    const userStorageRef = ref(storage, `users/${userId}`);
    const fileList = await listAll(userStorageRef);
    
    const total = fileList.items.length;
    let current = 0;

    if (onProgress) onProgress(current, total);

    // Delete all files in batches
    const deletePromises = fileList.items.map(async (itemRef) => {
      await deleteObject(itemRef);
      current++;
      if (onProgress) onProgress(current, total);
    });

    await Promise.all(deletePromises);

    // Delete all files in subfolders
    for (const folderRef of fileList.prefixes) {
      await deleteFolderRecursive(folderRef);
    }
  } catch (error) {
    console.error('Error deleting storage files:', error);
    // Continue with deletion even if storage cleanup fails
  }
}

/**
 * Recursively delete a folder and its contents
 */
async function deleteFolderRecursive(folderRef: StorageReference): Promise<void> {
  const fileList = await listAll(folderRef);
  
  const deletePromises = fileList.items.map((itemRef) => deleteObject(itemRef));
  await Promise.all(deletePromises);

  for (const subfolderRef of fileList.prefixes) {
    await deleteFolderRecursive(subfolderRef);
  }
}

/**
 * Delete all file records owned by the user from Firestore
 */
async function deleteUserFiles(userId: string): Promise<void> {
  const filesQuery = query(
    collection(db, 'files'),
    where('owner', '==', userId)
  );

  const snapshot = await getDocs(filesQuery);
  
  // Delete in batches of 500 (Firestore limit)
  const batches = [];
  let batch = writeBatch(db);
  let count = 0;

  snapshot.docs.forEach((document) => {
    batch.delete(document.ref);
    count++;

    if (count === 500) {
      batches.push(batch.commit());
      batch = writeBatch(db);
      count = 0;
    }
  });

  if (count > 0) {
    batches.push(batch.commit());
  }

  await Promise.all(batches);
}

/**
 * Delete all folders owned by the user
 */
async function deleteUserFolders(userId: string): Promise<void> {
  const foldersQuery = query(
    collection(db, 'folders'),
    where('owner', '==', userId)
  );

  const snapshot = await getDocs(foldersQuery);
  
  const batches = [];
  let batch = writeBatch(db);
  let count = 0;

  snapshot.docs.forEach((document) => {
    batch.delete(document.ref);
    count++;

    if (count === 500) {
      batches.push(batch.commit());
      batch = writeBatch(db);
      count = 0;
    }
  });

  if (count > 0) {
    batches.push(batch.commit());
  }

  await Promise.all(batches);
}

/**
 * Delete all contacts where user is involved
 */
async function deleteUserContacts(userId: string): Promise<void> {
  // Delete contacts where user is userId1
  const contacts1Query = query(
    collection(db, 'contacts'),
    where('userId1', '==', userId)
  );

  // Delete contacts where user is userId2
  const contacts2Query = query(
    collection(db, 'contacts'),
    where('userId2', '==', userId)
  );

  const [snapshot1, snapshot2] = await Promise.all([
    getDocs(contacts1Query),
    getDocs(contacts2Query)
  ]);

  const batches = [];
  let batch = writeBatch(db);
  let count = 0;

  [...snapshot1.docs, ...snapshot2.docs].forEach((document) => {
    batch.delete(document.ref);
    count++;

    if (count === 500) {
      batches.push(batch.commit());
      batch = writeBatch(db);
      count = 0;
    }
  });

  if (count > 0) {
    batches.push(batch.commit());
  }

  await Promise.all(batches);

  // Delete contact requests
  const fromRequestsQuery = query(
    collection(db, 'contactRequests'),
    where('fromUserId', '==', userId)
  );

  const toRequestsQuery = query(
    collection(db, 'contactRequests'),
    where('toUserId', '==', userId)
  );

  const [fromSnapshot, toSnapshot] = await Promise.all([
    getDocs(fromRequestsQuery),
    getDocs(toRequestsQuery)
  ]);

  const requestBatches = [];
  let requestBatch = writeBatch(db);
  let requestCount = 0;

  [...fromSnapshot.docs, ...toSnapshot.docs].forEach((document) => {
    requestBatch.delete(document.ref);
    requestCount++;

    if (requestCount === 500) {
      requestBatches.push(requestBatch.commit());
      requestBatch = writeBatch(db);
      requestCount = 0;
    }
  });

  if (requestCount > 0) {
    requestBatches.push(requestBatch.commit());
  }

  await Promise.all(requestBatches);
}

/**
 * Delete all groups owned by the user
 */
async function deleteUserGroups(userId: string): Promise<void> {
  const groupsQuery = query(
    collection(db, 'groups'),
    where('ownerId', '==', userId)
  );

  const snapshot = await getDocs(groupsQuery);
  
  const batches = [];
  let batch = writeBatch(db);
  let count = 0;

  snapshot.docs.forEach((document) => {
    batch.delete(document.ref);
    count++;

    if (count === 500) {
      batches.push(batch.commit());
      batch = writeBatch(db);
      count = 0;
    }
  });

  if (count > 0) {
    batches.push(batch.commit());
  }

  await Promise.all(batches);
}

/**
 * Delete all notifications for the user
 */
async function deleteUserNotifications(userId: string): Promise<void> {
  const notificationsQuery = query(
    collection(db, 'notifications'),
    where('userId', '==', userId)
  );

  const snapshot = await getDocs(notificationsQuery);
  
  const batches = [];
  let batch = writeBatch(db);
  let count = 0;

  snapshot.docs.forEach((document) => {
    batch.delete(document.ref);
    count++;

    if (count === 500) {
      batches.push(batch.commit());
      batch = writeBatch(db);
      count = 0;
    }
  });

  if (count > 0) {
    batches.push(batch.commit());
  }

  await Promise.all(batches);
}

/**
 * Delete all conversations where user is a participant
 */
async function deleteUserConversations(userId: string): Promise<void> {
  const conversationsQuery = query(
    collection(db, 'conversations'),
    where('participants', 'array-contains', userId)
  );

  const snapshot = await getDocs(conversationsQuery);
  
  const batches = [];
  let batch = writeBatch(db);
  let count = 0;

  snapshot.docs.forEach((document) => {
    batch.delete(document.ref);
    count++;

    if (count === 500) {
      batches.push(batch.commit());
      batch = writeBatch(db);
      count = 0;
    }
  });

  if (count > 0) {
    batches.push(batch.commit());
  }

  await Promise.all(batches);
}

/**
 * Remove user from sharedWith arrays in files they don't own
 */
async function removeUserFromSharedFiles(userId: string): Promise<void> {
  const sharedFilesQuery = query(
    collection(db, 'files'),
    where('sharedWith', 'array-contains', userId)
  );

  const snapshot = await getDocs(sharedFilesQuery);
  
  const batches = [];
  let batch = writeBatch(db);
  let count = 0;

  snapshot.docs.forEach((document) => {
    const data = document.data();
    const sharedWith = (data.sharedWith || []).filter((uid: string) => uid !== userId);
    const encryptedKeys = { ...data.encryptedKeys };
    delete encryptedKeys[userId];

    batch.update(document.ref, { 
      sharedWith,
      encryptedKeys,
      [`userFavorites.${userId}`]: null,
      [`userFolders.${userId}`]: null,
      [`userTags.${userId}`]: null,
      [`userNames.${userId}`]: null
    });
    count++;

    if (count === 500) {
      batches.push(batch.commit());
      batch = writeBatch(db);
      count = 0;
    }
  });

  if (count > 0) {
    batches.push(batch.commit());
  }

  await Promise.all(batches);
}

/**
 * Delete user profile document
 */
async function deleteUserProfile(userId: string): Promise<void> {
  const profileRef = doc(db, 'users', userId);
  await deleteDoc(profileRef);
}
