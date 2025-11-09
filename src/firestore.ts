import { backendService, type UserProfile as BackendUserProfile } from './backend/BackendService';
// Legacy imports for gradual migration
import { doc, getDoc, setDoc, collection, addDoc, serverTimestamp, query, where, getDocs, onSnapshot, FieldValue, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from './firebase';

export interface UserProfile {
  displayName: string;
  email: string;
  theme: 'light' | 'dark';
  language?: string; // User's preferred language code (e.g., 'en', 'fr', 'es')
  publicKey?: string;
  // Post-quantum secure private key storage
  encryptedPrivateKey?: {
    ciphertext: string; // base64
    salt: string; // base64  
    nonce: string; // base64
  };
  // Terms acceptance
  termsAcceptedAt?: string; // ISO timestamp when user accepted terms
  // UI preferences
  columnVisibility?: {
    type: boolean;
    size: boolean;
    shared: boolean;
    created: boolean;
    modified: boolean;
    owner: boolean;
  };
  // Security preferences
  showPrintWarning?: boolean; // Default: true, false = never show warning
}

export interface Folder {
  id?: string;
  owner: string;
  name: string | { ciphertext: string; nonce: string }; // Encrypted folder name
  parent: string | null;
  createdAt: FieldValue;
  encryptedKeys?: { [uid: string]: string }; // uid -> encrypted key exchange result (for post-quantum)
}

export interface Group {
  id?: string;
  owner: string;
  name: string | { ciphertext: string; nonce: string }; // Encrypted group name
  description?: string | { ciphertext: string; nonce: string }; // Encrypted description
  members: string[] | { ciphertext: string; nonce: string }; // Encrypted members array
  memberKeys?: { [uid: string]: string }; // Encrypted group keys for each member
  createdAt: FieldValue;
  updatedAt: FieldValue;
  isEncrypted?: boolean; // Flag to distinguish encrypted vs unencrypted groups
}


export const getUserProfile = async (uid: string): Promise<UserProfile | null> => {
  return await backendService.users.get(uid) as UserProfile | null;
};

export const getUserPublicProfile = async (uid: string): Promise<{ displayName: string; email: string; publicKey?: string } | null> => {
  const docRef = doc(db, 'users', uid);
  const docSnap = await getDoc(docRef);
  if (docSnap.exists()) {
    const data = docSnap.data() as UserProfile;
    // Return only public, non-sensitive fields
    return {
      displayName: data.displayName,
      email: data.email,
      publicKey: data.publicKey
    };
  } else {
    return null;
  }
};

export const getUserPublicKey = async (uid: string): Promise<string | null> => {
  const docRef = doc(db, 'users', uid);
  const docSnap = await getDoc(docRef);
  if (docSnap.exists()) {
    const data = docSnap.data() as UserProfile;
    return data.publicKey || null;
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

export const updateUserColumnVisibility = async (uid: string, columnVisibility: UserProfile['columnVisibility']) => {
  const docRef = doc(db, 'users', uid);
  await updateDoc(docRef, { columnVisibility });
};

export const createUserProfile = async (uid: string, data: UserProfile) => {
  console.log('🔄 createUserProfile: Starting Firestore write operation...', {
    uid,
    publicKeyLength: data.publicKey?.length || 0,
    hasEncryptedPrivateKey: !!data.encryptedPrivateKey,
    displayName: data.displayName
  });

  try {
    const docRef = doc(db, 'users', uid);
    await setDoc(docRef, data);
    
    console.log('✅ createUserProfile: Firestore write completed successfully');
    
    // Add a small delay to ensure Firestore consistency
    await new Promise(resolve => setTimeout(resolve, 100));
    
  } catch (error) {
    console.error('❌ createUserProfile: Firestore write failed:', error);
    throw new Error(`Failed to write user profile to Firestore: ${error instanceof Error ? error.message : String(error)}`);
  }
};

export const updateUserProfile = async (uid: string, updates: Partial<UserProfile>) => {
  await backendService.users.update(uid, updates);
};

export const createFolder = async (owner: string, name: string, parent: string | null, privateKeyHex: string) => {
  // Use centralized FolderEncryptionService
  const { FolderEncryptionService } = await import('./services/folderEncryption');
  
  // Encrypt folder for the owner
  const encryptionResult = await FolderEncryptionService.encryptFolderForUser(
    name,
    owner,
    privateKeyHex
  );

  // Create the folder document
  const folderDocument = FolderEncryptionService.createFolderDocument(
    owner,
    encryptionResult.encryptedMetadata,
    encryptionResult.encryptedKeys,
    parent
  );

  await addDoc(collection(db, 'folders'), folderDocument);
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
    const { encryptData, encryptMetadata } = await import('./crypto/quantumSafeCrypto');
    
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
    
    // Generate a random key for folder metadata encryption
    const metadataKey = crypto.getRandomValues(new Uint8Array(32));
    
    // Encrypt the metadata key using post-quantum encryption
    const encryptedKeyResult = await encryptData(metadataKey, publicKey);
    const encapsulatedKey = encryptedKeyResult.encapsulatedKey;
    const cipherText = encryptedKeyResult.ciphertext;
    
    // Combine encapsulated key and ciphertext for storage
    const combinedKeyData = new Uint8Array(encapsulatedKey.length + cipherText.length);
    combinedKeyData.set(encapsulatedKey, 0);
    combinedKeyData.set(cipherText, encapsulatedKey.length);
    
    const sharedSecret = metadataKey;
    
    // Encrypt the folder name
    const encryptedMetadata = await encryptMetadata(
      { name: newName, size: '0' }, // folders don't have size, but encryptMetadata expects it
      sharedSecret
    );


    // Update the folder with encrypted name and new key
    await updateFolder(folderId, {
      name: encryptedMetadata.name,
      encryptedKeys: { [userId]: bytesToHex(combinedKeyData) },
    });
  } catch (error) {
    console.error('Error renaming folder with encryption:', error);
    throw error;
  }
};

export const deleteFolder = async (folderId: string) => {
  try {
    console.log(`Starting deletion of folder: ${folderId}`);
    
    // Simplified approach: just delete the folder document directly
    // The frontend should have already verified this is empty or asked for confirmation
    const folderRef = doc(db, 'folders', folderId);
    await deleteDoc(folderRef);
    console.log(`Successfully deleted folder: ${folderId}`);
    
  } catch (error) {
    console.error(`Error deleting folder ${folderId}:`, error);
    if (error instanceof Error) {
      console.error(`Error message: ${error.message}`);
      console.error(`Error stack: ${error.stack}`);
    }
    throw error;
  }
};

// Group management functions
export const createGroup = async (owner: string, name: string, description: string, members: string[]) => {
  // Get owner's public key for encryption
  const ownerProfile = await getUserProfile(owner);
  if (!ownerProfile?.publicKey) {
    throw new Error('Owner public key not found. Cannot create encrypted group.');
  }

  // Get public keys for all members (including owner)
  const allMembers = [owner, ...members];
  const memberPublicKeys = [];
  
  for (const memberId of allMembers) {
    const profile = await getUserProfile(memberId);
    if (!profile?.publicKey) {
      console.warn(`Skipping member ${memberId}: no public key found`);
      continue;
    }
    memberPublicKeys.push({
      userId: memberId,
      publicKey: hexToBytes(profile.publicKey),
    });
  }

  if (memberPublicKeys.length === 0) {
    throw new Error('No valid public keys found for group members.');
  }

  // Generate a random group key for encrypting group data
  const groupKey = crypto.getRandomValues(new Uint8Array(32));
  
  // Encrypt group data with the group key
  const { encryptedGroupData, memberKeys } = await encryptGroupData(
    { name, description, members },
    groupKey,
    memberPublicKeys
  );

  const newGroup: Group = {
    owner,
    name: encryptedGroupData.name,
    description: encryptedGroupData.description,
    members: encryptedGroupData.members,
    memberKeys,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    isEncrypted: true,
  };
  
  const docRef = await addDoc(collection(db, 'groups'), newGroup);
  return docRef.id;
};

export const updateGroup = async (groupId: string, updates: Partial<Group>) => {
  console.log('updateGroup called with:', { groupId, updates });
  try {
    // Get the existing group to determine if it's encrypted
    const groupRef = doc(db, 'groups', groupId);
    const groupSnap = await getDoc(groupRef);
    
    if (!groupSnap.exists()) {
      throw new Error('Group not found');
    }
    
    const existingGroup = groupSnap.data() as Group;
    let finalUpdates = { ...updates };
    
    // If group is encrypted and we're updating name/description/members, encrypt them
    if (existingGroup.isEncrypted && (updates.name || updates.description || updates.members)) {
      const ownerProfile = await getUserProfile(existingGroup.owner);
      if (!ownerProfile?.publicKey) {
        throw new Error('Owner public key not found. Cannot update encrypted group.');
      }
      
      // Get current members or use existing ones
      const currentMembers = typeof existingGroup.members === 'string' 
        ? JSON.parse(existingGroup.members)
        : Array.isArray(existingGroup.members) 
          ? existingGroup.members
          : [];
      
      const updatedMembers = updates.members || currentMembers;
      const allMembers = [existingGroup.owner, ...updatedMembers];
      
      const memberPublicKeys = [];
      for (const memberId of allMembers) {
        const profile = await getUserProfile(memberId);
        if (profile?.publicKey) {
          const hexToBytes = (hex: string): Uint8Array => {
            const bytes = new Uint8Array(hex.length / 2);
            for (let i = 0; i < hex.length; i += 2) {
              bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
            }
            return bytes;
          };
          memberPublicKeys.push({
            userId: memberId,
            publicKey: hexToBytes(profile.publicKey),
          });
        }
      }
      
      // Generate new group key for security
      const groupKey = crypto.getRandomValues(new Uint8Array(32));
      
      const groupData = {
        name: typeof updates.name === 'string' ? updates.name : 
              (typeof existingGroup.name === 'object' ? '' : existingGroup.name as string),
        description: typeof updates.description === 'string' ? updates.description :
                    (typeof existingGroup.description === 'object' ? '' : existingGroup.description as string || ''),
        members: updatedMembers,
      };
      
      const { encryptedGroupData, memberKeys } = await encryptGroupData(
        groupData,
        groupKey,
        memberPublicKeys
      );
      
      finalUpdates = {
        name: encryptedGroupData.name,
        description: encryptedGroupData.description,
        members: encryptedGroupData.members,
        memberKeys,
      };
    }
    
    await updateDoc(groupRef, { ...finalUpdates, updatedAt: serverTimestamp() });
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

export const getUserGroups = async (uid: string, userPrivateKey?: Uint8Array): Promise<Group[]> => {
  const q = query(collection(db, 'groups'), where('owner', '==', uid));
  const querySnapshot = await getDocs(q);
  const groups = querySnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Group));
  
  // Decrypt encrypted groups if private key is provided
  const decryptedGroups = [];
  for (const group of groups) {
    if (group.isEncrypted) {
      try {
        const decrypted = await decryptGroupForUser(group, uid, userPrivateKey);
        decryptedGroups.push(decrypted);
      } catch (error) {
        console.error(`Failed to decrypt group ${group.id}:`, error);
        // Keep the group but mark it as undecryptable
        decryptedGroups.push({ 
          ...group, 
          name: userPrivateKey ? '[Encrypted - Cannot Decrypt]' : '[Encrypted - Login Required]', 
          members: [],
          description: userPrivateKey ? '[Encrypted - Cannot Decrypt]' : '[Encrypted - Login Required]'
        });
      }
    } else {
      decryptedGroups.push(group);
    }
  }
  
  return decryptedGroups;
};


// Folder sharing functions
export const getAllFoldersForUser = async (uid: string): Promise<Folder[]> => {
  const q = query(collection(db, 'folders'), where('owner', '==', uid));
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Folder));
};

export const getAllFilesInFolder = async (folderId: string | null, userId: string): Promise<any[]> => {
  // Query files where the user has access (owner or shared) and is in the specified folder for this user
  const q = query(
    collection(db, 'files'),
    where('sharedWith', 'array-contains', userId)
  );
  const querySnapshot = await getDocs(q);
  
  // Filter files that are in the specified folder for this user
  return querySnapshot.docs
    .map(doc => ({ ...doc.data(), id: doc.id }))
    .filter((file: any) => {
      // Check if file has userFolders defined
      if (file.userFolders && typeof file.userFolders === 'object') {
        return file.userFolders[userId] === folderId;
      }
      // Fallback to legacy parent field for backward compatibility
      return file.parent === folderId;
    });
};

// Real-time version using onSnapshot for reactive updates
export const subscribeToFilesInFolder = (
  folderId: string | null, 
  userId: string, 
  onUpdate: (files: any[]) => void,
  onError?: (error: Error) => void
): (() => void) => {
  // Query files where the user has access (owner or shared)
  const q = query(
    collection(db, 'files'),
    where('sharedWith', 'array-contains', userId)
  );
  
  const unsubscribe = onSnapshot(q, 
    (querySnapshot) => {
      // Filter files that are in the specified folder for this user
      const files = querySnapshot.docs
        .map(doc => ({ ...doc.data(), id: doc.id }))
        .filter((file: any) => {
          // Check if file has userFolders defined
          if (file.userFolders && typeof file.userFolders === 'object') {
            return file.userFolders[userId] === folderId;
          }
          // Fallback to legacy parent field for backward compatibility
          return file.parent === folderId;
        });
      
      onUpdate(files);
    },
    (error) => {
      console.error('Error in files subscription:', error);
      if (onError) {
        onError(error);
      }
    }
  );
  
  return unsubscribe;
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

export const getAllFilesRecursively = async (folderId: string | null, userId: string): Promise<any[]> => {
  const allFiles: any[] = [];
  
  // Get files in current folder
  const files = await getAllFilesInFolder(folderId, userId);
  allFiles.push(...files);
  
  // Get subfolders owned by the user and recursively get their files
  const subfolders = await getSubfolders(folderId, userId);
  for (const subfolder of subfolders) {
    const subFiles = await getAllFilesRecursively(subfolder.id!, userId);
    allFiles.push(...subFiles);
  }
  
  return allFiles;
};

// Folders are now owner-only - sharing is handled at the file level
// This function is deprecated and will be removed
export const shareFolder = async (folderId: string, sharedWithUids: string[]) => {
  throw new Error('Folder sharing is no longer supported. Share individual files instead.');
};

// Folders are now owner-only - no sharing permissions
export const getFolderSharingPermissions = async (folderId: string | null): Promise<string[]> => {
  // Folders are no longer shared - always return empty array
  return [];
};

// Group encryption/decryption helper functions
const hexToBytes = (hex: string): Uint8Array => {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
};

const bytesToHex = (bytes: Uint8Array): string => {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
};

/**
 * Encrypt group data (name, description, members) with a group key
 * and encrypt the group key for each member using post-quantum encryption
 */
export const encryptGroupData = async (
  groupData: { name: string; description: string; members: string[] },
  groupKey: Uint8Array,
  memberPublicKeys: { userId: string; publicKey: Uint8Array }[]
): Promise<{
  encryptedGroupData: {
    name: { ciphertext: string; nonce: string };
    description: { ciphertext: string; nonce: string };
    members: { ciphertext: string; nonce: string };
  };
  memberKeys: { [userId: string]: string };
}> => {
  const { encryptData } = await import('./crypto/quantumSafeCrypto');
  
  // Generate nonces for AES-GCM encryption
  const nameNonce = crypto.getRandomValues(new Uint8Array(12));
  const descNonce = crypto.getRandomValues(new Uint8Array(12));
  const membersNonce = crypto.getRandomValues(new Uint8Array(12));
  
  // Import group key for AES-GCM
  const aesKey = await crypto.subtle.importKey(
    'raw',
    groupKey,
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  );
  
  // Encrypt name
  const nameData = new TextEncoder().encode(groupData.name);
  const encryptedName = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nameNonce },
    aesKey,
    nameData
  );
  
  // Encrypt description
  const descData = new TextEncoder().encode(groupData.description);
  const encryptedDesc = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: descNonce },
    aesKey,
    descData
  );
  
  // Encrypt members array (as JSON string)
  const membersData = new TextEncoder().encode(JSON.stringify(groupData.members));
  const encryptedMembers = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: membersNonce },
    aesKey,
    membersData
  );
  
  // Encrypt the group key for each member using ML-KEM-768
  const memberKeys: { [userId: string]: string } = {};
  
  for (const { userId, publicKey } of memberPublicKeys) {
    const encryptedKey = await encryptData(groupKey, publicKey);
    // Store as: IV + encapsulated_key + ciphertext (ML-KEM-768 format)
    const keyData = new Uint8Array(
      encryptedKey.iv.length + encryptedKey.encapsulatedKey.length + encryptedKey.ciphertext.length
    );
    keyData.set(encryptedKey.iv, 0);
    keyData.set(encryptedKey.encapsulatedKey, encryptedKey.iv.length);
    keyData.set(encryptedKey.ciphertext, encryptedKey.iv.length + encryptedKey.encapsulatedKey.length);
    memberKeys[userId] = bytesToHex(keyData);
  }
  
  return {
    encryptedGroupData: {
      name: {
        ciphertext: bytesToHex(new Uint8Array(encryptedName)),
        nonce: bytesToHex(nameNonce),
      },
      description: {
        ciphertext: bytesToHex(new Uint8Array(encryptedDesc)),
        nonce: bytesToHex(descNonce),
      },
      members: {
        ciphertext: bytesToHex(new Uint8Array(encryptedMembers)),
        nonce: bytesToHex(membersNonce),
      },
    },
    memberKeys,
  };
};

/**
 * Decrypt group data for a specific user using their private key
 */
export const decryptGroupForUser = async (
  group: Group, 
  userId: string,
  userPrivateKey?: Uint8Array
): Promise<Group> => {
  if (!group.isEncrypted || !group.memberKeys?.[userId]) {
    // Return as-is if not encrypted or user doesn't have access
    return group;
  }
  
  if (!userPrivateKey) {
    // If no private key provided, return placeholder
    return {
      ...group,
      name: '[Encrypted - Login Required]',
      description: '[Encrypted - Login Required]',
      members: [],
    };
  }
  
  try {
    const { decryptData } = await import('./crypto/quantumSafeCrypto');
    
    // Decrypt the group key using ML-KEM-768 format
    const encryptedGroupKey = hexToBytes(group.memberKeys[userId]);
    
    // ML-KEM-768 format: IV (12) + encapsulated_key (1088) + ciphertext (variable)
    if (encryptedGroupKey.length < 12 + 1088) {
      console.error(`Invalid encrypted group key format. Expected at least ${12 + 1088} bytes, got ${encryptedGroupKey.length} bytes`);
      throw new Error('Invalid encrypted group key format');
    }
    
    const iv = encryptedGroupKey.slice(0, 12);
    const encapsulatedKey = encryptedGroupKey.slice(12, 12 + 1088);
    const ciphertext = encryptedGroupKey.slice(12 + 1088);
    
    
    const groupKey = await decryptData(
      { iv, encapsulatedKey, ciphertext },
      userPrivateKey
    );
    
    // Decrypt group data
    const decryptedGroup = await decryptGroupDataWithKey(group, groupKey);
    return decryptedGroup;
    
  } catch (error) {
    console.error('Error decrypting group:', error);
    throw error;
  }
};

/**
 * Decrypt group data using the group key
 */
export const decryptGroupDataWithKey = async (group: Group, groupKey: Uint8Array): Promise<Group> => {
  if (!group.isEncrypted) {
    return group;
  }
  
  const aesKey = await crypto.subtle.importKey(
    'raw',
    groupKey,
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );
  
  // Decrypt name
  let name = '';
  if (typeof group.name === 'object') {
    const nameNonce = hexToBytes(group.name.nonce);
    const nameCiphertext = hexToBytes(group.name.ciphertext);
    const decryptedName = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: nameNonce },
      aesKey,
      nameCiphertext
    );
    name = new TextDecoder().decode(decryptedName);
  }
  
  // Decrypt description
  let description = '';
  if (typeof group.description === 'object') {
    const descNonce = hexToBytes(group.description.nonce);
    const descCiphertext = hexToBytes(group.description.ciphertext);
    const decryptedDesc = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: descNonce },
      aesKey,
      descCiphertext
    );
    description = new TextDecoder().decode(decryptedDesc);
  }
  
  // Decrypt members
  let members: string[] = [];
  if (typeof group.members === 'object' && 'nonce' in group.members && 'ciphertext' in group.members) {
    const membersNonce = hexToBytes(group.members.nonce);
    const membersCiphertext = hexToBytes(group.members.ciphertext);
    const decryptedMembers = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: membersNonce },
      aesKey,
      membersCiphertext
    );
    members = JSON.parse(new TextDecoder().decode(decryptedMembers));
  } else if (Array.isArray(group.members)) {
    members = group.members;
  }
  
  return {
    ...group,
    name,
    description,
    members,
  };
};

/**
 * Migrate existing unencrypted groups to encrypted format
 * This function can be called to upgrade legacy groups
 */
export const migrateGroupToEncrypted = async (groupId: string): Promise<void> => {
  try {
    const groupRef = doc(db, 'groups', groupId);
    const groupSnap = await getDoc(groupRef);
    
    if (!groupSnap.exists()) {
      throw new Error('Group not found');
    }
    
    const group = groupSnap.data() as Group;
    
    // Skip if already encrypted
    if (group.isEncrypted) {
      console.log(`Group ${groupId} is already encrypted`);
      return;
    }
    
    // Get owner's public key
    const ownerProfile = await getUserProfile(group.owner);
    if (!ownerProfile?.publicKey) {
      throw new Error('Owner public key not found. Cannot encrypt group.');
    }
    
    // Get public keys for all members (including owner)
    const allMembers = [group.owner, ...group.members as string[]];
    const memberPublicKeys = [];
    
    for (const memberId of allMembers) {
      const profile = await getUserProfile(memberId);
      if (profile?.publicKey) {
        memberPublicKeys.push({
          userId: memberId,
          publicKey: hexToBytes(profile.publicKey),
        });
      }
    }
    
    if (memberPublicKeys.length === 0) {
      throw new Error('No valid public keys found for group members.');
    }
    
    // Generate group key and encrypt data
    const groupKey = crypto.getRandomValues(new Uint8Array(32));
    
    const { encryptedGroupData, memberKeys } = await encryptGroupData(
      {
        name: group.name as string,
        description: group.description as string || '',
        members: group.members as string[],
      },
      groupKey,
      memberPublicKeys
    );
    
    // Update the group with encrypted data
    await updateDoc(groupRef, {
      name: encryptedGroupData.name,
      description: encryptedGroupData.description,
      members: encryptedGroupData.members,
      memberKeys,
      isEncrypted: true,
      updatedAt: serverTimestamp(),
    });
    
    console.log(`Successfully migrated group ${groupId} to encrypted format`);
    
  } catch (error) {
    console.error(`Failed to migrate group ${groupId}:`, error);
    throw error;
  }
};

/**
 * Migrate all unencrypted groups for a user
 */
export const migrateAllUserGroupsToEncrypted = async (userId: string): Promise<void> => {
  try {
    const q = query(
      collection(db, 'groups'), 
      where('owner', '==', userId),
      where('isEncrypted', '!=', true)
    );
    const querySnapshot = await getDocs(q);
    
    for (const doc of querySnapshot.docs) {
      try {
        await migrateGroupToEncrypted(doc.id);
      } catch (error) {
        console.error(`Failed to migrate group ${doc.id}:`, error);
        // Continue with next group instead of stopping
      }
    }
    
    console.log(`Migration completed for user ${userId}`);
  } catch (error) {
    console.error(`Failed to migrate groups for user ${userId}:`, error);
    throw error;
  }
};