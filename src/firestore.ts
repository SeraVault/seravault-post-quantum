import { backendService, type UserProfile as BackendUserProfile } from './backend/BackendService';
// Type-only import for FieldValue compatibility
import type { FieldValue } from 'firebase/firestore';
// Firebase imports for legacy functions not yet migrated
import { collection, query, where, getDocs, updateDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { legacyDb as db } from './backend/FirebaseBackend';

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
  // Email verification (custom system)
  emailVerified?: boolean; // Whether email has been verified
  emailVerifiedAt?: FieldValue | Date; // When email was verified
  // Storage tracking (maintained by Cloud Functions)
  storageUsed?: number; // Total bytes used by this user
  storageUpdatedAt?: FieldValue | Date; // When storage was last updated
  storageLimit?: number; // Custom storage limit for this user (optional)
  // Storage quota warning tracking (for downgraded users)
  downgradedAt?: FieldValue | Date; // When user was downgraded to free plan
  lastQuotaWarningAt?: FieldValue | Date; // When last quota warning was sent
  lastQuotaWarningLevel?: number; // Level of last warning sent (1, 2, or 3)
  quotaEnforcedAt?: FieldValue | Date; // When files were deleted due to quota enforcement
  // Terms acceptance
  termsAcceptedAt?: string; // ISO timestamp when user accepted terms
  // Pending subscription (before key generation)
  pendingPlan?: string; // Plan ID (e.g., 'personal', 'family', 'professional')
  pendingPlanTimestamp?: FieldValue | Date; // When plan selection was made
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
  // Recent files (synced across devices)
  recentItems?: Array<{
    id: string;
    type: 'file' | 'form';
    parent: string | null;
    accessedAt: string;
  }>;
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
  const profile = await backendService.users.get(uid) as UserProfile | null;
  if (profile) {
    // Return only public, non-sensitive fields
    return {
      displayName: profile.displayName,
      email: profile.email,
      publicKey: profile.publicKey
    };
  } else {
    return null;
  }
};

export const getUserPublicKey = async (uid: string): Promise<string | null> => {
  const profile = await backendService.users.get(uid) as UserProfile | null;
  return profile?.publicKey || null;
};

export const getUserByEmail = async (email: string): Promise<{ id: string; profile: UserProfile } | null> => {
  // Try both normalized (lowercase) and original email for backward compatibility
  const normalizedEmail = email.toLowerCase();
  
  // First try with normalized email (for new users)
  let results = await backendService.query.get('users', [
    { type: 'where', field: 'email', operator: '==', value: normalizedEmail }
  ]);
  
  if (results.length > 0) {
    return { id: results[0].id, profile: results[0] as UserProfile };
  }
  
  // If not found, try with original casing (for existing users)
  if (email !== normalizedEmail) {
    results = await backendService.query.get('users', [
      { type: 'where', field: 'email', operator: '==', value: email }
    ]);
    
    if (results.length > 0) {
      return { id: results[0].id, profile: results[0] as UserProfile };
    }
  }
  
  return null;
};

export const updateUserColumnVisibility = async (uid: string, columnVisibility: UserProfile['columnVisibility']) => {
  await backendService.users.update(uid, { columnVisibility });
};

export const createUserProfile = async (uid: string, data: UserProfile) => {
  console.log('🔄 createUserProfile: Starting Firestore write operation...', {
    uid,
    publicKeyLength: data.publicKey?.length || 0,
    hasEncryptedPrivateKey: !!data.encryptedPrivateKey,
    displayName: data.displayName
  });

  try {
    // Normalize email to lowercase for case-insensitive matching
    const normalizedData = {
      ...data,
      email: data.email.toLowerCase()
    };
    
    // Use merge: true to preserve existing fields like termsAcceptedAt, columnVisibility, etc.
    await backendService.documents.set('users', uid, normalizedData, { merge: true });
    
    console.log('✅ createUserProfile: Firestore write completed successfully');
    
    // Add a small delay to ensure Firestore consistency
    await new Promise(resolve => setTimeout(resolve, 100));
    
  } catch (error) {
    console.error('❌ createUserProfile: Failed to create user profile:', error);
    throw error;
  }
};

/**
 * Ensures a user profile exists for OAuth sign-ins (Google, Apple, etc.)
 * Creates a basic profile if one doesn't exist, preserving any existing data
 * Uses retry logic to handle auth token propagation delays
 */
export const ensureUserProfile = async (uid: string, email: string | null, displayName: string | null) => {
  console.log('🔍 ensureUserProfile: Checking if profile exists...', { uid, email, displayName });
  
  const maxRetries = 3;
  const retryDelays = [100, 500, 1000]; // Exponential backoff in ms
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const profile = await backendService.documents.get('users', uid);
      
      if (!profile) {
        console.log(`📝 ensureUserProfile: Creating new profile for OAuth user (attempt ${attempt + 1})...`);
        
        const profileData: Partial<UserProfile> = {
          email: email ? email.toLowerCase() : 'unknown@example.com', // Normalize email
          displayName: displayName || email?.split('@')[0] || 'User',
          theme: 'dark',
          language: 'en',
          columnVisibility: {
            type: true,
            size: true,
            shared: true,
            created: true,
            modified: true,
            owner: true,
          },
          showPrintWarning: true,
        };
        
        await backendService.documents.set('users', uid, profileData);
        console.log('✅ ensureUserProfile: Profile created successfully');
        return; // Success, exit early
      } else {
        console.log('✅ ensureUserProfile: Profile already exists');
        return; // Success, exit early
      }
    } catch (error: unknown) {
      const isPermissionError = error instanceof Error && 
        error.message.includes('Missing or insufficient permissions');
      
      // If it's a permission error and we have retries left, wait and retry
      if (isPermissionError && attempt < maxRetries) {
        const delay = retryDelays[attempt];
        console.warn(`⚠️ ensureUserProfile: Permission error on attempt ${attempt + 1}, retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      // If it's the last attempt or not a permission error, throw
      console.error('❌ ensureUserProfile: Error ensuring profile exists:', error);
      throw error;
    }
  }
};

export const updateUserProfile = async (uid: string, updates: Partial<UserProfile>) => {
  // Normalize email if it's being updated
  const normalizedUpdates = updates.email 
    ? { ...updates, email: updates.email.toLowerCase() }
    : updates;
  await backendService.users.update(uid, normalizedUpdates);
};

export const updateUserRecents = async (uid: string, recentItems: UserProfile['recentItems']) => {
  await backendService.documents.update('users', uid, { recentItems });
};

export const getUserRecents = async (uid: string): Promise<UserProfile['recentItems']> => {
  const profile = await getUserProfile(uid);
  return profile?.recentItems || [];
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

  await backendService.documents.add('folders', folderDocument);
};

export const updateFolder = async (folderId: string, updates: Partial<Folder>) => {
  console.log('updateFolder called with:', { folderId, updates });
  try {
    await backendService.documents.update('folders', folderId, updates);
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
    await backendService.documents.delete('folders', folderId);
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
    createdAt: backendService.utils.serverTimestamp(),
    updatedAt: backendService.utils.serverTimestamp(),
    isEncrypted: true,
  };
  
  const docId = await backendService.documents.add('groups', newGroup);
  return docId;
};

export const updateGroup = async (groupId: string, updates: Partial<Group>) => {
  console.log('updateGroup called with:', { groupId, updates });
  try {
    // Get the existing group to determine if it's encrypted
    const existingGroup = await backendService.documents.get('groups', groupId) as Group | null;
    
    if (!existingGroup) {
      throw new Error('Group not found');
    }
    
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
    
    await backendService.documents.update('groups', groupId, { 
      ...finalUpdates, 
      updatedAt: backendService.utils.serverTimestamp() 
    });
    console.log('Group updated successfully in Firestore');
  } catch (error) {
    console.error('Error updating group in Firestore:', error);
    throw error;
  }
};

export const deleteGroup = async (groupId: string) => {
  await backendService.documents.delete('groups', groupId);
};

export const getUserGroups = async (uid: string, userPrivateKey?: Uint8Array): Promise<Group[]> => {
  console.log('🔍 getUserGroups called for uid:', uid, 'hasPrivateKey:', !!userPrivateKey);
  const q = query(collection(db, 'groups'), where('owner', '==', uid));
  console.log('📋 Query constructed for groups collection');
  
  let querySnapshot;
  try {
    console.log('⏳ Executing getDocs for groups...');
    querySnapshot = await getDocs(q);
    console.log('✅ getDocs succeeded, found', querySnapshot.docs.length, 'groups');
  } catch (error: any) {
    console.error('❌ getDocs failed for groups:', error);
    console.error('❌ Error code:', error?.code, 'Message:', error?.message);
    if (error?.code === 'permission-denied') {
      console.warn('⚠️ Permission denied fetching user groups, returning empty array');
      return [];
    }
    throw error;
  }
  
  const groups = querySnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Group));
  console.log('📦 Mapped groups:', groups.length);
  
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
    const group = await backendService.documents.get('groups', groupId);
    
    if (!group) {
      throw new Error('Group not found');
    }
    
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
    await backendService.documents.update('groups', groupId, {
      name: encryptedGroupData.name,
      description: encryptedGroupData.description,
      members: encryptedGroupData.members,
      memberKeys,
      isEncrypted: true,
      updatedAt: backendService.utils.serverTimestamp(),
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

/**
 * Subscribe to real-time updates of a user's profile
 */
export const subscribeToUserProfile = (uid: string, callback: (profile: UserProfile | null) => void): () => void => {
  return backendService.realtime.subscribeToDocument('users', uid, (data) => {
    if (data && typeof data === 'object') {
      callback({ uid, ...data } as unknown as UserProfile);
    } else {
      callback(null);
    }
  });
};