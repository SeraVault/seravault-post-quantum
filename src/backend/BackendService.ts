/**
 * Centralized backend service for Seravault
 * This is the main interface that components should use for all backend operations
 * Easily swappable for different backend implementations
 */

import type { BackendInterface } from './BackendInterface';
import { firebaseBackend } from './FirebaseBackend';

// This is where you can easily swap backends
// For example: import { supabaseBackend } from './SupabaseBackend';
const currentBackend: BackendInterface = firebaseBackend;

// ============================================================================
// CENTRALIZED BACKEND SERVICE
// ============================================================================

export class BackendService {
  private backend: BackendInterface;

  constructor(backend: BackendInterface) {
    this.backend = backend;
  }

  // ============================================================================
  // AUTHENTICATION SERVICES
  // ============================================================================

  auth = {
    getCurrentUser: () => this.backend.getCurrentUser(),
    signIn: (email: string, password: string) => this.backend.signInWithEmailAndPassword(email, password),
    signUp: (email: string, password: string) => this.backend.createUserWithEmailAndPassword(email, password),
    signOut: () => this.backend.signOut(),
    onAuthStateChanged: (callback: (user: any) => void) => this.backend.onAuthStateChanged(callback),
  };

  // ============================================================================
  // USER PROFILE SERVICES
  // ============================================================================

  users = {
    get: (userId: string) => this.backend.getUserProfile(userId),
    update: (userId: string, data: any) => this.backend.updateUserProfile(userId, data),
    create: (profile: any) => this.backend.createUserProfile(profile),
  };

  // ============================================================================
  // FILE SERVICES
  // ============================================================================

  files = {
    create: (file: any) => this.backend.createFile(file),
    get: (fileId: string) => this.backend.getFile(fileId),
    update: (fileId: string, data: any) => this.backend.updateFile(fileId, data),
    delete: (fileId: string) => this.backend.deleteFile(fileId),
    getUserFiles: (userId: string) => this.backend.getUserFiles(userId),
    getSharedFiles: (userId: string) => this.backend.getSharedFiles(userId),
    getFilesInFolder: (userId: string, folderId: string | null) => this.backend.getFilesInFolder(userId, folderId),
    subscribe: (userId: string, folderId: string | null, callback: (files: any[]) => void) =>
      this.backend.subscribeToUserFiles(userId, folderId, callback),
  };

  // ============================================================================
  // FOLDER SERVICES
  // ============================================================================

  folders = {
    create: (folder: any) => this.backend.createFolder(folder),
    get: (folderId: string) => this.backend.getFolder(folderId),
    update: (folderId: string, data: any) => this.backend.updateFolder(folderId, data),
    delete: (folderId: string) => this.backend.deleteFolder(folderId),
    getUserFolders: (userId: string) => this.backend.getUserFolders(userId),
    subscribe: (userId: string, callback: (folders: any[]) => void) =>
      this.backend.subscribeToUserFolders(userId, callback),
  };

  // ============================================================================
  // STORAGE SERVICES
  // ============================================================================

  storage = {
    upload: (path: string, data: Uint8Array, metadata?: any) => this.backend.uploadFile(path, data, metadata),
    download: (path: string) => this.backend.downloadFile(path),
    delete: (path: string) => this.backend.deleteStorageFile(path),
  };

  // ============================================================================
  // CONTACT SERVICES
  // ============================================================================

  contacts = {
    get: (contactId: string) => this.backend.getContact(contactId),
    create: (contact: any) => this.backend.createContact(contact),
    update: (contactId: string, data: any) => this.backend.updateContact(contactId, data),
    delete: (contactId: string) => this.backend.deleteContact(contactId),
    getUserContacts: (userId: string) => this.backend.getUserContacts(userId),
  };

  contactRequests = {
    create: (request: any) => this.backend.createContactRequest(request),
    get: (requestId: string) => this.backend.getContactRequest(requestId),
    update: (requestId: string, data: any) => this.backend.updateContactRequest(requestId, data),
    delete: (requestId: string) => this.backend.deleteContactRequest(requestId),
    getUserRequests: (userId: string) => this.backend.getUserContactRequests(userId),
  };

  // ============================================================================
  // ADVANCED QUERY SERVICES
  // ============================================================================

  query = {
    get: (collection: string, constraints: any[]) => this.backend.query(collection, constraints),
    subscribe: (collection: string, constraints: any[], callback: (data: any[]) => void) =>
      this.backend.subscribeToQuery(collection, constraints, callback),
  };

  // ============================================================================
  // BATCH OPERATIONS
  // ============================================================================

  batch = {
    update: (operations: any[]) => this.backend.batchUpdate(operations),
    delete: (operations: any[]) => this.backend.batchDelete(operations),
  };

  // ============================================================================
  // BACKEND SWITCHING
  // ============================================================================

  /**
   * Switch to a different backend implementation
   * Example: backendService.switchBackend(supabaseBackend);
   */
  switchBackend(newBackend: BackendInterface): void {
    this.backend = newBackend;
    console.log('🔄 Backend switched successfully');
  }

  /**
   * Get the current backend type for debugging
   */
  getCurrentBackendType(): string {
    return this.backend.constructor.name;
  }
}

// Export singleton instance
export const backendService = new BackendService(currentBackend);

// For debugging - expose backend info
if (typeof window !== 'undefined') {
  (window as any).backendService = backendService;
}

// Export types for components to use
export type {
  BackendInterface,
  User,
  UserProfile,
  FileRecord,
  FolderRecord,
  ContactRecord,
  ContactRequest,
} from './BackendInterface';