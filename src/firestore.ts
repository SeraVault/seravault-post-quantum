import { doc, getDoc, setDoc, collection, addDoc, serverTimestamp, query, where, getDocs, FieldValue, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from './firebase';

export interface UserProfile {
  displayName: string;
  email: string;
  theme: 'light' | 'dark';
  publicKey?: string;
  // Post-quantum secure private key storage
  encryptedPrivateKey?: {
    ciphertext: string; // base64
    salt: string; // base64  
    nonce: string; // base64
  };
  // Legacy field - will be migrated
  legacyEncryptedPrivateKey?: string;
}

export interface Folder {
  id?: string;
  owner: string;
  name: string | { ciphertext: string; nonce: string }; // Encrypted (legacy string or new post-quantum format)
  parent: string | null;
  createdAt: FieldValue;
  encryptedKeys?: { [uid: string]: string }; // uid -> encrypted key exchange result (for post-quantum)
  sharedWith?: string[]; // Array of UIDs that have access
}

export interface Group {
  id?: string;
  owner: string;
  name: string; // Group name (not encrypted)
  description?: string;
  members: string[]; // Array of user UIDs
  createdAt: FieldValue;
  updatedAt: FieldValue;
}

export interface SharingHistory {
  id?: string;
  owner: string;
  sharedWith: string; // User UID or email
  sharedAt: FieldValue;
  type: 'user' | 'group';
}


export const getUserProfile = async (uid: string): Promise<UserProfile | null> => {
  const docRef = doc(db, 'users', uid);
  const docSnap = await getDoc(docRef);
  if (docSnap.exists()) {
    return docSnap.data() as UserProfile;
  } else {
    return null;
  }
};

export const getUserByEmail = async (email: string): Promise<{ id: string; profile: UserProfile } | null> => {
  const q = query(collection(db, 'users'), where('email', '==', email));
  const querySnapshot = await getDocs(q);
  if (querySnapshot.empty) {
    return null;
  }
  const doc = querySnapshot.docs[0];
  return { id: doc.id, profile: doc.data() as UserProfile };
};

export const createUserProfile = async (uid: string, data: UserProfile) => {
  const docRef = doc(db, 'users', uid);
  await setDoc(docRef, data);
};

export const createFolder = async (owner: string, name: string, parent: string | null) => {
  // Import encryption functions
  const { ml_kem768 } = await import('@noble/post-quantum/ml-kem');
  const { encryptMetadata } = await import('./crypto/postQuantumCrypto');
  
  // Get user's public key for encryption
  const userProfile = await getUserProfile(owner);
  if (!userProfile?.publicKey) {
    throw new Error('User public key not found. Cannot encrypt folder name.');
  }

  // Generate shared secret for encryption
  const hexToBytes = (hex: string) => {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
      bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
    }
    return bytes;
  };

  const publicKey = hexToBytes(userProfile.publicKey);
  const kemResult = ml_kem768.encapsulate(publicKey);
  
  if (!kemResult || !kemResult.sharedSecret) {
    throw new Error('Failed to generate encryption key for folder name.');
  }

  const { cipherText, sharedSecret } = kemResult;
  
  // Encrypt the folder name
  const { encryptedName, nonce } = encryptMetadata(
    { name: name, size: '0' }, // folders don't have size, but encryptMetadata expects it
    sharedSecret
  );

  const bytesToHex = (bytes: Uint8Array) =>
    bytes.reduce((str, byte) => str + byte.toString(16).padStart(2, '0'), '');

  const newFolder: Folder = {
    owner,
    name: { ciphertext: encryptedName, nonce: nonce },
    parent,
    encryptedKeys: { [owner]: bytesToHex(cipherText) },
    sharedWith: [owner],
    createdAt: serverTimestamp(),
  };
  await addDoc(collection(db, 'folders'), newFolder);
};

export const updateFolder = async (folderId: string, updates: Partial<Folder>) => {
  console.log('updateFolder called with:', { folderId, updates });
  try {
    const folderRef = doc(db, 'folders', folderId);
    await updateDoc(folderRef, updates);
    console.log('Folder updated successfully in Firestore');
  } catch (error) {
    console.error('Error updating folder in Firestore:', error);
    throw error;
  }
};

export const renameFolderWithEncryption = async (folderId: string, newName: string, userId: string) => {
  try {
    // Import encryption functions
    const { ml_kem768 } = await import('@noble/post-quantum/ml-kem');
    const { encryptMetadata } = await import('./crypto/postQuantumCrypto');
    
    // Get user's public key for encryption
    const userProfile = await getUserProfile(userId);
    if (!userProfile?.publicKey) {
      throw new Error('User public key not found. Cannot encrypt folder name.');
    }

    // Generate shared secret for encryption
    const hexToBytes = (hex: string) => {
      const bytes = new Uint8Array(hex.length / 2);
      for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
      }
      return bytes;
    };

    const publicKey = hexToBytes(userProfile.publicKey);
    const kemResult = ml_kem768.encapsulate(publicKey);
    
    if (!kemResult || !kemResult.sharedSecret) {
      throw new Error('Failed to generate encryption key for folder name.');
    }

    const { cipherText, sharedSecret } = kemResult;
    
    // Encrypt the folder name
    const { encryptedName, nonce } = encryptMetadata(
      { name: newName, size: '0' }, // folders don't have size, but encryptMetadata expects it
      sharedSecret
    );

    const bytesToHex = (bytes: Uint8Array) =>
      bytes.reduce((str, byte) => str + byte.toString(16).padStart(2, '0'), '');

    // Update the folder with encrypted name and new key
    await updateFolder(folderId, {
      name: { ciphertext: encryptedName, nonce: nonce },
      encryptedKeys: { [userId]: bytesToHex(cipherText) },
    });
  } catch (error) {
    console.error('Error renaming folder with encryption:', error);
    throw error;
  }
};

export const deleteFolder = async (folderId: string) => {
  const folderRef = doc(db, 'folders', folderId);
  await deleteDoc(folderRef);
};

// Group management functions
export const createGroup = async (owner: string, name: string, description: string, members: string[]) => {
  const newGroup: Group = {
    owner,
    name,
    description,
    members,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  const docRef = await addDoc(collection(db, 'groups'), newGroup);
  return docRef.id;
};

export const updateGroup = async (groupId: string, updates: Partial<Group>) => {
  console.log('updateGroup called with:', { groupId, updates });
  try {
    const groupRef = doc(db, 'groups', groupId);
    await updateDoc(groupRef, { ...updates, updatedAt: serverTimestamp() });
    console.log('Group updated successfully in Firestore');
  } catch (error) {
    console.error('Error updating group in Firestore:', error);
    throw error;
  }
};

export const deleteGroup = async (groupId: string) => {
  const groupRef = doc(db, 'groups', groupId);
  await deleteDoc(groupRef);
};

export const getUserGroups = async (uid: string): Promise<Group[]> => {
  const q = query(collection(db, 'groups'), where('owner', '==', uid));
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Group));
};

// Sharing history functions
export const addSharingHistory = async (owner: string, sharedWith: string, type: 'user' | 'group') => {
  const historyEntry: SharingHistory = {
    owner,
    sharedWith,
    sharedAt: serverTimestamp(),
    type,
  };
  await addDoc(collection(db, 'sharingHistory'), historyEntry);
};

export const getSharingHistory = async (uid: string): Promise<SharingHistory[]> => {
  const q = query(
    collection(db, 'sharingHistory'), 
    where('owner', '==', uid)
  );
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as SharingHistory));
};

// Folder sharing functions
export const getAllFoldersForUser = async (uid: string): Promise<Folder[]> => {
  const q = query(collection(db, 'folders'), where('owner', '==', uid));
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Folder));
};

export const getAllFilesInFolder = async (folderId: string | null, ownerUid: string): Promise<any[]> => {
  const q = query(
    collection(db, 'files'),
    where('owner', '==', ownerUid),
    where('parent', '==', folderId)
  );
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
};

export const getSubfolders = async (parentId: string | null, ownerUid: string): Promise<Folder[]> => {
  const q = query(
    collection(db, 'folders'),
    where('owner', '==', ownerUid),
    where('parent', '==', parentId)
  );
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Folder));
};

export const getAllFilesRecursively = async (folderId: string | null, ownerUid: string): Promise<any[]> => {
  const allFiles: any[] = [];
  
  // Get files in current folder
  const files = await getAllFilesInFolder(folderId, ownerUid);
  allFiles.push(...files);
  
  // Get subfolders and recursively get their files
  const subfolders = await getSubfolders(folderId, ownerUid);
  for (const subfolder of subfolders) {
    const subFiles = await getAllFilesRecursively(subfolder.id!, ownerUid);
    allFiles.push(...subFiles);
  }
  
  return allFiles;
};

export const shareFolder = async (folderId: string, sharedWithUids: string[]) => {
  console.log('Sharing folder:', { folderId, sharedWithUids });
  try {
    // Update folder to include shared users
    const folderRef = doc(db, 'folders', folderId);
    await updateDoc(folderRef, {
      sharedWith: sharedWithUids
    });
    console.log('Folder sharing updated successfully');
  } catch (error) {
    console.error('Error sharing folder:', error);
    throw error;
  }
};

// Helper function to get folder sharing permissions
export const getFolderSharingPermissions = async (folderId: string | null): Promise<string[]> => {
  if (!folderId) return [];
  
  try {
    const folderRef = doc(db, 'folders', folderId);
    const folderSnap = await getDoc(folderRef);
    
    if (folderSnap.exists()) {
      const folderData = folderSnap.data() as Folder;
      return folderData.sharedWith || [];
    }
  } catch (error) {
    console.error('Error getting folder permissions:', error);
  }
  
  return [];
};