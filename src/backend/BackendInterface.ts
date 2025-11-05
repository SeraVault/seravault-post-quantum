/**
 * Backend abstraction layer for Seravault
 * This interface defines all backend operations to allow easy swapping of Firebase with other backends
 */

// ============================================================================
// DATA TYPES
// ============================================================================

export interface User {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL?: string | null;
  emailVerified: boolean;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  publicKey: string;
  encryptedPrivateKey: { ciphertext: string; salt: string; nonce: string };
  createdAt: string;
  lastModified: string;
  keyVersion: number;
  theme: 'light' | 'dark';
  termsAcceptedAt?: string; // ISO timestamp when user accepted terms
  columnVisibility?: {
    type: boolean;
    size: boolean;
    shared: boolean;
    created: boolean;
    modified: boolean;
    owner: boolean;
  };
  showPrintWarning?: boolean;
}

export interface FileRecord {
  id?: string;
  owner: string;
  name: { ciphertext: string; nonce: string } | string;
  size: { ciphertext: string; nonce: string } | string;
  storagePath: string;
  encryptedKeys: { [uid: string]: string };
  sharedWith: string[];
  parent?: string | null;
  createdAt: any;
  lastModified: any;
  userFavorites?: { [uid: string]: boolean };
  userFolders?: { [uid: string]: string };
  userTags?: { [uid: string]: { ciphertext: string; nonce: string } };
  userNames?: { [uid: string]: { ciphertext: string; nonce: string } };
}

export interface FolderRecord {
  id?: string;
  owner: string;
  name: { ciphertext: string; nonce: string } | string;
  parent?: string | null;
  encryptedKeys?: { [uid: string]: string };
  createdAt: any;
  lastModified: any;
}

export interface ContactRecord {
  id?: string;
  userId1: string;
  userId2: string;
  user1Email: string;
  user2Email: string;
  user1DisplayName: string;
  user2DisplayName: string;
  status: 'pending' | 'accepted' | 'blocked';
  initiatorUserId: string;
  createdAt: any;
  lastInteractionAt: any;
  acceptedAt?: any;
  blockedAt?: any;
  blockedByUserId?: string;
  metadata?: any;
}

export interface ContactRequest {
  id?: string;
  fromUserId: string;
  fromUserEmail: string;
  fromUserDisplayName: string;
  toUserId?: string;
  toUserEmail: string;
  status: 'pending' | 'accepted' | 'declined' | 'cancelled';
  message?: string;
  createdAt: any;
  respondedAt?: any;
}

export interface QueryConstraint {
  type: 'where' | 'orderBy' | 'limit';
  field: string;
  operator?: '==' | '!=' | '<' | '<=' | '>' | '>=' | 'array-contains' | 'in' | 'not-in' | 'array-contains-any';
  value?: any;
  direction?: 'asc' | 'desc';
  limitValue?: number;
}

export interface StorageFile {
  data: Uint8Array;
  metadata?: {
    contentType?: string;
    customMetadata?: { [key: string]: string };
  };
}

// ============================================================================
// BACKEND INTERFACE
// ============================================================================

export interface BackendInterface {
  // ============================================================================
  // AUTHENTICATION
  // ============================================================================

  getCurrentUser(): User | null;
  signInWithEmailAndPassword(email: string, password: string): Promise<User>;
  createUserWithEmailAndPassword(email: string, password: string): Promise<User>;
  signOut(): Promise<void>;
  onAuthStateChanged(callback: (user: User | null) => void): () => void;

  // ============================================================================
  // USER PROFILES
  // ============================================================================

  getUserProfile(userId: string): Promise<UserProfile | null>;
  updateUserProfile(userId: string, data: Partial<UserProfile>): Promise<void>;
  createUserProfile(profile: UserProfile): Promise<void>;

  // ============================================================================
  // FILES
  // ============================================================================

  // File CRUD operations
  createFile(file: Omit<FileRecord, 'id' | 'createdAt' | 'lastModified'>): Promise<string>;
  getFile(fileId: string): Promise<FileRecord | null>;
  updateFile(fileId: string, data: Partial<FileRecord>): Promise<void>;
  deleteFile(fileId: string): Promise<void>;

  // File queries
  getUserFiles(userId: string): Promise<FileRecord[]>;
  getSharedFiles(userId: string): Promise<FileRecord[]>;
  getFilesInFolder(userId: string, folderId: string | null): Promise<FileRecord[]>;

  // Real-time subscriptions
  subscribeToUserFiles(userId: string, folderId: string | null, callback: (files: FileRecord[]) => void): () => void;

  // ============================================================================
  // FOLDERS
  // ============================================================================

  createFolder(folder: Omit<FolderRecord, 'id' | 'createdAt' | 'lastModified'>): Promise<string>;
  getFolder(folderId: string): Promise<FolderRecord | null>;
  updateFolder(folderId: string, data: Partial<FolderRecord>): Promise<void>;
  deleteFolder(folderId: string): Promise<void>;
  getUserFolders(userId: string): Promise<FolderRecord[]>;
  subscribeToUserFolders(userId: string, callback: (folders: FolderRecord[]) => void): () => void;

  // ============================================================================
  // STORAGE
  // ============================================================================

  uploadFile(path: string, data: Uint8Array, metadata?: any): Promise<void>;
  downloadFile(path: string): Promise<Uint8Array>;
  deleteStorageFile(path: string): Promise<void>;

  // ============================================================================
  // CONTACTS
  // ============================================================================

  getContact(contactId: string): Promise<ContactRecord | null>;
  createContact(contact: Omit<ContactRecord, 'id' | 'createdAt' | 'lastInteractionAt'>): Promise<string>;
  updateContact(contactId: string, data: Partial<ContactRecord>): Promise<void>;
  deleteContact(contactId: string): Promise<void>;
  getUserContacts(userId: string): Promise<ContactRecord[]>;

  // Contact requests
  createContactRequest(request: Omit<ContactRequest, 'id' | 'createdAt'>): Promise<string>;
  getContactRequest(requestId: string): Promise<ContactRequest | null>;
  updateContactRequest(requestId: string, data: Partial<ContactRequest>): Promise<void>;
  deleteContactRequest(requestId: string): Promise<void>;
  getUserContactRequests(userId: string): Promise<ContactRequest[]>;

  // ============================================================================
  // ADVANCED QUERIES
  // ============================================================================

  query(collection: string, constraints: QueryConstraint[]): Promise<any[]>;
  subscribeToQuery(collection: string, constraints: QueryConstraint[], callback: (data: any[]) => void): () => void;

  // ============================================================================
  // BATCH OPERATIONS
  // ============================================================================

  batchUpdate(operations: Array<{
    collection: string;
    id: string;
    data: Partial<any>;
  }>): Promise<void>;

  batchDelete(operations: Array<{
    collection: string;
    id: string;
  }>): Promise<void>;
}