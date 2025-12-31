/**
 * Firebase implementation of the Backend interface
 * This can be swapped out with other backend implementations (Supabase, AWS, etc.)
 */

import { initializeApp } from "firebase/app";
import {
  getAuth,
  signInWithEmailAndPassword as firebaseSignIn,
  createUserWithEmailAndPassword as firebaseCreateUser,
  signInWithPopup,
  GoogleAuthProvider,
  signInWithPhoneNumber as firebaseSignInWithPhoneNumber,
  linkWithPhoneNumber as firebaseLinkWithPhoneNumber,
  RecaptchaVerifier,
  signOut as firebaseSignOut,
  onAuthStateChanged as firebaseOnAuthStateChanged,
  sendPasswordResetEmail as firebaseSendPasswordResetEmail,
  updatePassword as firebaseUpdatePassword,
  verifyBeforeUpdateEmail as firebaseVerifyBeforeUpdateEmail,
  reauthenticateWithCredential,
  EmailAuthProvider,
  linkWithCredential,
  unlink,
  setPersistence,
  indexedDBLocalPersistence,
  browserSessionPersistence,
  inMemoryPersistence,
} from 'firebase/auth';
import { 
  initializeFirestore, 
  persistentLocalCache, 
  persistentMultipleTabManager 
} from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getMessaging } from "firebase/messaging";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";

import {
  collection,
  doc,
  getDoc,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  onSnapshot,
  serverTimestamp,
  arrayUnion as firestoreArrayUnion,
  arrayRemove as firestoreArrayRemove,
  increment as firestoreIncrement,
  deleteField as firestoreDeleteField,
} from 'firebase/firestore';

import {
  ref,
  uploadBytes,
  getBytes,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage';

import {
  httpsCallable,
} from 'firebase/functions';

import {
  getToken,
  onMessage,
} from 'firebase/messaging';

import type {
  BackendInterface,
  User,
  UserProfile,
  FileRecord,
  FolderRecord,
  ContactRecord,
  ContactRequest,
  QueryConstraint,
  StorageFile,
} from './BackendInterface';

// Initialize Firebase
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

/**
 * Set auth persistence with multiple fallbacks for PWA compatibility
 * Order of preference:
 * 1. indexedDBLocalPersistence - Most reliable in regular browsers
 * 2. browserSessionPersistence - Fallback for browsers without IndexedDB
 * 3. inMemoryPersistence - Last resort
 */
const persistenceReady = (async () => {
  try {
    // Try IndexedDB first (this should work in PWAs if not cleared)
    await setPersistence(auth, indexedDBLocalPersistence);
    console.log('✅ Firebase auth persistence set to IndexedDB');
  } catch (indexedDBError) {
    console.warn('⚠️ IndexedDB persistence failed, trying session persistence:', indexedDBError);
    try {
      // Fall back to session persistence
      await setPersistence(auth, browserSessionPersistence);
      console.log('✅ Firebase auth persistence set to SESSION');
    } catch (sessionError) {
      console.error('❌ All persistence methods failed:', sessionError);
      // Continue with in-memory persistence (no persistence)
    }
  }
})();

const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
});
const storage = getStorage(app);
const functions = getFunctions(app, 'us-central1');

// Initialize messaging with error handling
let messaging: any = null;
try {
  messaging = getMessaging(app);
} catch (error) {
  console.log('Firebase Messaging not available:', error);
}

// Connect to Functions emulator if in dev mode
if (import.meta.env.DEV) {
  console.log('Using production Cloud Functions in development mode');
}

console.log('✅ Firebase initialized with offline persistence');

// Temporary exports for legacy services that haven't been migrated yet
// TODO: Remove these once all services use BackendService
export { auth as legacyAuth, db as legacyDb, storage as legacyStorage, messaging as legacyMessaging, functions as legacyFunctions };

export class FirebaseBackend implements BackendInterface {
  // ============================================================================
  // AUTHENTICATION
  // ============================================================================

  getAuthInstance(): any {
    return auth;
  }

  getCurrentUser(): User | null {
    const firebaseUser = auth.currentUser;
    if (!firebaseUser) return null;

    return {
      uid: firebaseUser.uid,
      email: firebaseUser.email,
      displayName: firebaseUser.displayName,
      phoneNumber: firebaseUser.phoneNumber,
      photoURL: firebaseUser.photoURL,
      emailVerified: firebaseUser.emailVerified,
    };
  }

  async signInWithEmailAndPassword(email: string, password: string): Promise<User> {
    // Wait for persistence to be set before signing in
    await persistenceReady;
    const result = await firebaseSignIn(auth, email, password);
    return {
      uid: result.user.uid,
      email: result.user.email,
      displayName: result.user.displayName,
      phoneNumber: result.user.phoneNumber,
      photoURL: result.user.photoURL,
      emailVerified: result.user.emailVerified,
    };
  }

  async createUserWithEmailAndPassword(email: string, password: string): Promise<User> {
    // Wait for persistence to be set before signing up
    await persistenceReady;
    const credential = await firebaseCreateUser(auth, email, password);

    // Custom email verification will be sent separately via Cloud Function
    // (called from signup page with user's language preference)

    return {
      uid: credential.user.uid,
      email: credential.user.email,
      displayName: credential.user.displayName,
      phoneNumber: credential.user.phoneNumber,
      photoURL: credential.user.photoURL,
      emailVerified: false, // Always false for new signups
    };
  }

  async signInWithGoogle(): Promise<User> {
    // Wait for persistence to be set before signing in
    await persistenceReady;
    const provider = new GoogleAuthProvider();
    const credential = await signInWithPopup(auth, provider);
    return {
      uid: credential.user.uid,
      email: credential.user.email,
      displayName: credential.user.displayName,
      phoneNumber: credential.user.phoneNumber,
      photoURL: credential.user.photoURL,
      emailVerified: credential.user.emailVerified,
    };
  }

  async signInWithPhoneNumber(phoneNumber: string, appVerifier: any): Promise<any> {
    return await firebaseSignInWithPhoneNumber(auth, phoneNumber, appVerifier);
  }

  async linkWithPhoneNumber(phoneNumber: string, appVerifier: any): Promise<any> {
    if (!auth.currentUser) throw new Error('No user signed in');
    return await firebaseLinkWithPhoneNumber(auth.currentUser, phoneNumber, appVerifier);
  }

  async verifyPhoneCode(confirmationResult: any, code: string): Promise<User> {
    const credential = await confirmationResult.confirm(code);
    return {
      uid: credential.user.uid,
      email: credential.user.email,
      displayName: credential.user.displayName,
      phoneNumber: credential.user.phoneNumber,
      photoURL: credential.user.photoURL,
      emailVerified: credential.user.emailVerified,
    };
  }

  async sendPasswordResetEmail(email: string): Promise<void> {
    await firebaseSendPasswordResetEmail(auth, email);
  }

  async updatePassword(currentPassword: string, newPassword: string): Promise<void> {
    const user = auth.currentUser;
    if (!user || !user.email) {
      throw new Error('No authenticated user found');
    }

    // Reauthenticate first
    const credential = EmailAuthProvider.credential(user.email, currentPassword);
    await reauthenticateWithCredential(user, credential);

    // Update password
    await firebaseUpdatePassword(user, newPassword);
  }

  async updateEmail(currentPassword: string, newEmail: string): Promise<void> {
    const user = auth.currentUser;
    if (!user || !user.email) {
      throw new Error('No authenticated user found');
    }

    // Reauthenticate first
    const credential = EmailAuthProvider.credential(user.email, currentPassword);
    await reauthenticateWithCredential(user, credential);

    // Send verification email to new address
    await firebaseVerifyBeforeUpdateEmail(user, newEmail);
  }

  async linkEmailPassword(email: string, password: string): Promise<void> {
    const user = auth.currentUser;
    if (!user) {
      throw new Error('No authenticated user found');
    }

    const credential = EmailAuthProvider.credential(email, password);
    await linkWithCredential(user, credential);

    // Reload the user to get updated providerData
    await user.reload();

    // Only update the user profile email if user doesn't have one yet
    // (Don't overwrite Google email with the newly added email/password email)
    const userDoc = await getDoc(doc(db, 'users', user.uid));
    if (userDoc.exists()) {
      const userData = userDoc.data();
      if (!userData.email && !user.email) {
        // Only set email if both profile and auth don't have one
        await updateDoc(doc(db, 'users', user.uid), {
          email: email
        });
      }
    }
  }

  async unlinkProvider(providerId: string): Promise<void> {
    const user = auth.currentUser;
    if (!user) {
      throw new Error('No authenticated user found');
    }

    // Check if user has multiple providers
    if (!user.providerData || user.providerData.length <= 1) {
      throw new Error('Cannot remove the only authentication method. Add another method first.');
    }

    await unlink(user, providerId);
    await user.reload();
  }

  getLinkedProviders(): string[] {
    const user = auth.currentUser;
    if (!user || !user.providerData) {
      return [];
    }
    return user.providerData.map(p => p.providerId);
  }

  async sendEmailVerification(language?: string): Promise<void> {
    if (!auth.currentUser) {
      throw new Error('No user signed in');
    }
    
    // Get user's language preference from Firestore or use provided language
    let userLanguage = language;
    if (!userLanguage) {
      const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
      userLanguage = userDoc.exists() ? userDoc.data()?.language || 'en' : 'en';
    }
    
    // Call Cloud Function for custom verification email
    const sendVerification = httpsCallable(functions, 'sendCustomEmailVerification');
    await sendVerification({
      userId: auth.currentUser.uid,
      email: auth.currentUser.email,
      displayName: auth.currentUser.displayName || auth.currentUser.email,
      language: userLanguage,
    });
  }

  async reloadUser(): Promise<void> {
    if (!auth.currentUser) {
      throw new Error('No user signed in');
    }
    // Reload from Firestore to get custom emailVerified field
    const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
    if (userDoc.exists()) {
      const userData = userDoc.data();
      // Update the user object with emailVerified status
      (auth.currentUser as any).emailVerified = userData?.emailVerified || false;
    }
  }

  async signOut(): Promise<void> {
    await firebaseSignOut(auth);
  }

  onAuthStateChanged(callback: (user: User | null) => void): () => void {
    return firebaseOnAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        callback({
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName: firebaseUser.displayName,
          phoneNumber: firebaseUser.phoneNumber,
          photoURL: firebaseUser.photoURL,
          emailVerified: firebaseUser.emailVerified,
        });
      } else {
        callback(null);
      }
    });
  }

  // ============================================================================
  // USER PROFILES
  // ============================================================================

  async getUserProfile(userId: string): Promise<UserProfile | null> {
    const docRef = doc(db, 'users', userId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) return null;

    return { uid: userId, ...docSnap.data() } as UserProfile;
  }

  async updateUserProfile(userId: string, data: Partial<UserProfile>): Promise<void> {
    const docRef = doc(db, 'users', userId);
    await updateDoc(docRef, {
      ...data,
      lastModified: serverTimestamp(),
    });
  }

  async createUserProfile(profile: UserProfile): Promise<void> {
    const docRef = doc(db, 'users', profile.uid);
    await setDoc(docRef, {
      ...profile,
      createdAt: serverTimestamp(),
      lastModified: serverTimestamp(),
    });
  }

  // ============================================================================
  // FILES
  // ============================================================================

  async createFile(file: Omit<FileRecord, 'id' | 'createdAt' | 'lastModified'>): Promise<string> {
    const docRef = doc(collection(db, 'files'));
    const fileData = {
      ...file,
      createdAt: serverTimestamp(),
      lastModified: serverTimestamp(),
    };
    
    console.log('FirebaseBackend.createFile - Data being sent to Firestore:', {
      docId: docRef.id,
      owner: fileData.owner,
      hasName: !!fileData.name,
      hasSize: !!fileData.size,
      hasStoragePath: !!fileData.storagePath,
      hasEncryptedKeys: !!fileData.encryptedKeys,
      encryptedKeysCount: fileData.encryptedKeys ? Object.keys(fileData.encryptedKeys).length : 0,
      encryptedKeysUserIds: fileData.encryptedKeys ? Object.keys(fileData.encryptedKeys) : [],
      sharedWith: fileData.sharedWith,
      hasCreatedAt: !!fileData.createdAt,
      createdAtType: typeof fileData.createdAt,
    });
    
    await setDoc(docRef, fileData);
    return docRef.id;
  }

  async getFile(fileId: string, forceServerFetch = false): Promise<FileRecord | null> {
    const docRef = doc(db, 'files', fileId);
    
    if (forceServerFetch) {
      try {
        // Try server fetch first to get latest data
        const docSnap = await getDoc(docRef, { source: 'server' });
        if (!docSnap.exists()) return null;
        return { id: fileId, ...docSnap.data() } as FileRecord;
      } catch (error) {
        // Fall back to cache if offline or server fetch fails
        console.log(`Server fetch failed for ${fileId}, falling back to cache:`, error);
        const docSnap = await getDoc(docRef, { source: 'cache' });
        if (!docSnap.exists()) return null;
        return { id: fileId, ...docSnap.data() } as FileRecord;
      }
    }
    
    // Default behavior: let Firestore decide (cache first, then server)
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) return null;
    return { id: fileId, ...docSnap.data() } as FileRecord;
  }

  async updateFile(fileId: string, data: Partial<FileRecord>): Promise<void> {
    const docRef = doc(db, 'files', fileId);
    await updateDoc(docRef, {
      ...data,
      lastModified: serverTimestamp(),
    });
  }

  async deleteFile(fileId: string): Promise<void> {
    const docRef = doc(db, 'files', fileId);
    await deleteDoc(docRef);
  }

  async getUserFiles(userId: string): Promise<FileRecord[]> {
    try {
      const q = query(collection(db, 'files'), where('owner', '==', userId));
      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FileRecord));
    } catch (error) {
      console.warn('Error fetching user files (might be empty):', error);
      return [];
    }
  }

  async getSharedFiles(userId: string): Promise<FileRecord[]> {
    try {
      const q = query(collection(db, 'files'), where('sharedWith', 'array-contains', userId));
      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FileRecord));
    } catch (error) {
      console.warn('Error fetching shared files (might be empty):', error);
      return [];
    }
  }

  async getFilesInFolder(userId: string, folderId: string | null): Promise<FileRecord[]> {
    const baseQuery = collection(db, 'files');
    let q;

    if (folderId) {
      // Get files in specific folder that user has access to
      q = query(
        baseQuery,
        where('sharedWith', 'array-contains', userId),
        where('parent', '==', folderId)
      );
    } else {
      // Get files in root folder (null parent) that user has access to
      q = query(
        baseQuery,
        where('sharedWith', 'array-contains', userId),
        where('parent', '==', null)
      );
    }

    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as Record<string, unknown>) } as FileRecord));
  }

  subscribeToUserFiles(userId: string, folderId: string | null, callback: (files: FileRecord[]) => void): () => void {
    // Firebase doesn't support OR queries across different fields easily
    // So we need to create two separate subscriptions and merge the results
    const allFiles = new Map<string, FileRecord>();
    let ownedUnsubscribe: (() => void) | null = null;
    let sharedUnsubscribe: (() => void) | null = null;
    let ownedReady = false;
    let sharedReady = false;
    let callbackTimeout: NodeJS.Timeout | null = null;

    const updateCallback = (source: string) => {
      // Clear any pending callback
      if (callbackTimeout) {
        clearTimeout(callbackTimeout);
      }

      // Debounce the callback to wait for both subscriptions to update
      // This prevents race conditions where owned and shared fire separately
      callbackTimeout = setTimeout(() => {
        // Filter files by user's folder association
        // Files can be in a folder via either 'parent' (legacy/owned) or 'userFolders[userId]' (per-user)
        const allFilesArray = Array.from(allFiles.values());
        const mergedFiles = allFilesArray.filter((file) => {
          const userFolder = file.userFolders?.[userId];
          const fileFolder = userFolder !== undefined ? userFolder : file.parent;
          return fileFolder === folderId;
        });

        const chatCount = mergedFiles.filter((f: any) => f.fileType === 'chat').length;
        const formCount = mergedFiles.filter((f: any) => (f as any).name?.endsWith?.('.form')).length;
        const totalCount = allFilesArray.length;
        console.log(`📡 Real-time subscription (${source}): ${mergedFiles.length}/${totalCount} files in folder ${folderId || 'root'} (${chatCount} chats, ${formCount} forms) | owned=${ownedReady}, shared=${sharedReady}`);
        callback(mergedFiles);
      }, 50); // 50ms debounce
    };

    // Subscribe to ALL owned files (we'll filter by folder client-side)
    const ownedQuery = query(collection(db, 'files'), where('owner', '==', userId));

    ownedUnsubscribe = onSnapshot(ownedQuery, (querySnapshot) => {
      console.log(`🔵 Owned files snapshot: ${querySnapshot.size} docs, ${querySnapshot.docChanges().length} changes`);
      // Update owned files in the map
      querySnapshot.docChanges().forEach((change) => {
        const fileData = { id: change.doc.id, ...change.doc.data() } as FileRecord;
        const isChat = (fileData as any).fileType === 'chat';
        const isAttachment = (fileData as any).fileType === 'attachment';
        const isForm = (fileData as any).name?.endsWith?.('.form') || false;
        console.log(`📄 Owned file ${change.type}: ${change.doc.id}${isChat ? ' (CHAT)' : ''}${isForm ? ' (FORM)' : ''}${isAttachment ? ' (ATTACHMENT - HIDDEN)' : ''}`);
        if (change.type === 'removed' || isAttachment) {
          allFiles.delete(change.doc.id);
        } else {
          allFiles.set(change.doc.id, fileData);
        }
      });
      ownedReady = true;
      updateCallback('OWNED');
    }, (error: any) => {
      // Mark as ready even on error so UI doesn't hang
      ownedReady = true;
      updateCallback('OWNED_ERROR');
      console.warn('Error in owned files subscription:', error);
    });

    // Subscribe to ALL shared files (we'll filter by folder client-side)
    const sharedQuery = query(collection(db, 'files'), where('sharedWith', 'array-contains', userId));

    sharedUnsubscribe = onSnapshot(sharedQuery, (querySnapshot) => {
      console.log(`🟢 Shared files snapshot: ${querySnapshot.size} docs, ${querySnapshot.docChanges().length} changes`);
      // Update shared files in the map
      querySnapshot.docChanges().forEach((change) => {
        const fileData = { id: change.doc.id, ...change.doc.data() } as FileRecord;
        const isChat = (fileData as any).fileType === 'chat';
        const isAttachment = (fileData as any).fileType === 'attachment';
        const isForm = (fileData as any).name?.endsWith?.('.form') || false;
        console.log(`📄 Shared file ${change.type}: ${change.doc.id}${isChat ? ' (CHAT)' : ''}${isForm ? ' (FORM)' : ''}${isAttachment ? ' (ATTACHMENT - HIDDEN)' : ''}`);
        if (change.type === 'removed' || isAttachment) {
          allFiles.delete(change.doc.id);
        } else {
          allFiles.set(change.doc.id, fileData);
        }
      });
      sharedReady = true;
      updateCallback('SHARED');
    }, (error: any) => {
      // Mark as ready even on error so UI doesn't hang
      sharedReady = true;
      updateCallback('SHARED_ERROR');
      
      // Silently ignore permission-denied errors - user may not have shared files yet
      if (error?.code !== 'permission-denied') {
        console.warn('Error in shared files subscription:', error);
      }
    });

    // Return cleanup function that unsubscribes from both
    return () => {
      if (callbackTimeout) {
        clearTimeout(callbackTimeout);
      }
      if (ownedUnsubscribe) ownedUnsubscribe();
      if (sharedUnsubscribe) sharedUnsubscribe();
    };
  }

  subscribeToAllUserFiles(userId: string, callback: (files: FileRecord[]) => void): () => void {
    const allFiles = new Map<string, FileRecord>();
    let ownedUnsubscribe: (() => void) | null = null;
    let sharedUnsubscribe: (() => void) | null = null;
    let ownedReady = false;
    let sharedReady = false;
    let callbackTimeout: NodeJS.Timeout | null = null;

    const emit = (source: string) => {
      if (callbackTimeout) {
        clearTimeout(callbackTimeout);
      }

      callbackTimeout = setTimeout(() => {
        const mergedFiles = Array.from(allFiles.values());
        const chatCount = mergedFiles.filter((f: any) => f.fileType === 'chat').length;
        const formCount = mergedFiles.filter((f: any) => (f as any).name?.endsWith?.('.form')).length;
        console.log(`📡 Global file subscription (${source}): ${mergedFiles.length} files (${chatCount} chats, ${formCount} forms) | owned=${ownedReady}, shared=${sharedReady}`);
        callback(mergedFiles);
      }, 50);
    };

    const ownedQuery = query(collection(db, 'files'), where('owner', '==', userId));
    ownedUnsubscribe = onSnapshot(ownedQuery, (querySnapshot) => {
      querySnapshot.docChanges().forEach((change) => {
        const fileData = { id: change.doc.id, ...change.doc.data() } as FileRecord;
        const isAttachment = (fileData as any).fileType === 'attachment';
        if (change.type === 'removed' || isAttachment) {
          allFiles.delete(change.doc.id);
        } else {
          allFiles.set(change.doc.id, fileData);
        }
      });
      ownedReady = true;
      emit('OWNED_GLOBAL');
    }, (error: any) => {
      ownedReady = true;
      emit('OWNED_GLOBAL_ERROR');
      console.warn('Error in global owned files subscription:', error);
    });

    const sharedQuery = query(collection(db, 'files'), where('sharedWith', 'array-contains', userId));
    sharedUnsubscribe = onSnapshot(sharedQuery, (querySnapshot) => {
      querySnapshot.docChanges().forEach((change) => {
        const fileData = { id: change.doc.id, ...change.doc.data() } as FileRecord;
        const isAttachment = (fileData as any).fileType === 'attachment';
        if (change.type === 'removed' || isAttachment) {
          allFiles.delete(change.doc.id);
        } else {
          allFiles.set(change.doc.id, fileData);
        }
      });
      sharedReady = true;
      emit('SHARED_GLOBAL');
    }, (error: any) => {
      sharedReady = true;
      emit('SHARED_GLOBAL_ERROR');
      if (error?.code !== 'permission-denied') {
        console.warn('Error in global shared files subscription:', error);
      }
    });

    return () => {
      if (callbackTimeout) {
        clearTimeout(callbackTimeout);
      }
      if (ownedUnsubscribe) ownedUnsubscribe();
      if (sharedUnsubscribe) sharedUnsubscribe();
    };
  }

  // ============================================================================
  // FOLDERS
  // ============================================================================

  async createFolder(folder: Omit<FolderRecord, 'id' | 'createdAt' | 'lastModified'>): Promise<string> {
    const docRef = doc(collection(db, 'folders'));
    await setDoc(docRef, {
      ...folder,
      createdAt: serverTimestamp(),
      lastModified: serverTimestamp(),
    });
    return docRef.id;
  }

  async getFolder(folderId: string): Promise<FolderRecord | null> {
    const docRef = doc(db, 'folders', folderId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) return null;

    return { id: folderId, ...docSnap.data() } as FolderRecord;
  }

  async updateFolder(folderId: string, data: Partial<FolderRecord>): Promise<void> {
    const docRef = doc(db, 'folders', folderId);
    await updateDoc(docRef, {
      ...data,
      lastModified: serverTimestamp(),
    });
  }

  async deleteFolder(folderId: string): Promise<void> {
    const docRef = doc(db, 'folders', folderId);
    await deleteDoc(docRef);
  }

  async getUserFolders(userId: string): Promise<FolderRecord[]> {
    const q = query(collection(db, 'folders'), where('owner', '==', userId));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FolderRecord));
  }

  subscribeToUserFolders(userId: string, callback: (folders: FolderRecord[]) => void): () => void {
    const q = query(collection(db, 'folders'), where('owner', '==', userId));
    let debounceTimer: NodeJS.Timeout | null = null;
    
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      // Clear any pending callback
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      
      // Debounce to prevent excessive re-renders on rapid changes
      debounceTimer = setTimeout(() => {
        const folders = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FolderRecord));
        callback(folders);
      }, 100); // 100ms debounce
    }, (error) => {
      console.warn('Error in subscribeToUserFolders:', error);
      callback([]);
    });
    
    return () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      unsubscribe();
    };
  }

  // ============================================================================
  // STORAGE
  // ============================================================================

  async uploadFile(path: string, data: Uint8Array, metadata?: any): Promise<void> {
    const storageRef = ref(storage, path);
    await uploadBytes(storageRef, data, metadata);
  }

  async downloadFile(path: string): Promise<Uint8Array> {
    const storageRef = ref(storage, path);
    const bytes = await getBytes(storageRef);
    return new Uint8Array(bytes);
  }

  async getFileDownloadURL(path: string): Promise<string> {
    const storageRef = ref(storage, path);
    return await getDownloadURL(storageRef);
  }

  async deleteStorageFile(path: string): Promise<void> {
    const storageRef = ref(storage, path);
    await deleteObject(storageRef);
  }

  // ============================================================================
  // CONTACTS
  // ============================================================================

  async getContact(contactId: string): Promise<ContactRecord | null> {
    const docRef = doc(db, 'contacts', contactId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) return null;

    return { id: contactId, ...docSnap.data() } as ContactRecord;
  }

  async createContact(contact: Omit<ContactRecord, 'id' | 'createdAt' | 'lastInteractionAt'>): Promise<string> {
    const docRef = doc(collection(db, 'contacts'));
    await setDoc(docRef, {
      ...contact,
      createdAt: serverTimestamp(),
      lastInteractionAt: serverTimestamp(),
    });
    return docRef.id;
  }

  async updateContact(contactId: string, data: Partial<ContactRecord>): Promise<void> {
    const docRef = doc(db, 'contacts', contactId);
    await updateDoc(docRef, {
      ...data,
      lastInteractionAt: serverTimestamp(),
    });
  }

  async deleteContact(contactId: string): Promise<void> {
    const docRef = doc(db, 'contacts', contactId);
    await deleteDoc(docRef);
  }

  async getUserContacts(userId: string): Promise<ContactRecord[]> {
    // Query for contacts where user is either userId1 or userId2
    const q1 = query(collection(db, 'contacts'), where('userId1', '==', userId));
    const q2 = query(collection(db, 'contacts'), where('userId2', '==', userId));

    const [snap1, snap2] = await Promise.all([getDocs(q1), getDocs(q2)]);

    const contacts = [
      ...snap1.docs.map(doc => ({ id: doc.id, ...doc.data() } as ContactRecord)),
      ...snap2.docs.map(doc => ({ id: doc.id, ...doc.data() } as ContactRecord)),
    ];

    return contacts;
  }

  // Contact requests
  async createContactRequest(request: Omit<ContactRequest, 'id' | 'createdAt'>): Promise<string> {
    const docRef = doc(collection(db, 'contactRequests'));
    await setDoc(docRef, {
      ...request,
      createdAt: serverTimestamp(),
    });
    return docRef.id;
  }

  async getContactRequest(requestId: string): Promise<ContactRequest | null> {
    const docRef = doc(db, 'contactRequests', requestId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) return null;

    return { id: requestId, ...docSnap.data() } as ContactRequest;
  }

  async updateContactRequest(requestId: string, data: Partial<ContactRequest>): Promise<void> {
    const docRef = doc(db, 'contactRequests', requestId);
    await updateDoc(docRef, data);
  }

  async deleteContactRequest(requestId: string): Promise<void> {
    const docRef = doc(db, 'contactRequests', requestId);
    await deleteDoc(docRef);
  }

  async getUserContactRequests(userId: string): Promise<ContactRequest[]> {
    // Get requests sent to this user
    const q = query(collection(db, 'contactRequests'), where('toUserId', '==', userId));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ContactRequest));
  }

  // ============================================================================
  // ADVANCED QUERIES
  // ============================================================================

  async query(collectionName: string, constraints: QueryConstraint[]): Promise<any[]> {
    let q = collection(db, collectionName);
    let queryRef: any = q;

    for (const constraint of constraints) {
      switch (constraint.type) {
        case 'where':
          queryRef = query(queryRef, where(constraint.field!, constraint.operator!, constraint.value));
          break;
        case 'orderBy':
          queryRef = query(queryRef, orderBy(constraint.field!, constraint.direction));
          break;
        case 'limit':
          queryRef = query(queryRef, limit(constraint.limitValue!));
          break;
        case 'startAfter':
          // startAfter can receive a document snapshot or field values
          if (constraint.startAfter) {
            // If it's a document with createdAt, use that field value for pagination
            const lastValue = constraint.startAfter.createdAt;
            queryRef = query(queryRef, startAfter(lastValue));
          }
          break;
      }
    }

    const querySnapshot = await getDocs(queryRef);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as Record<string, unknown>) }));
  }

  subscribeToQuery(collectionName: string, constraints: QueryConstraint[], callback: (data: any[]) => void): () => void {
    let q = collection(db, collectionName);
    let queryRef: any = q;

    for (const constraint of constraints) {
      switch (constraint.type) {
        case 'where':
          queryRef = query(queryRef, where(constraint.field, constraint.operator!, constraint.value));
          break;
        case 'orderBy':
          queryRef = query(queryRef, orderBy(constraint.field, constraint.direction));
          break;
        case 'limit':
          queryRef = query(queryRef, limit(constraint.limitValue!));
          break;
      }
    }

    return onSnapshot(queryRef, (querySnapshot: any) => {
      const data = querySnapshot.docs.map((doc: any) => ({ id: doc.id, ...(doc.data() as Record<string, unknown>) }));
      callback(data);
    }, (error: any) => {
      console.warn('Error in subscribePath:', error);
      callback([]);
    });
  }

  /**
   * Query documents with support for subcollections and nested paths
   */
  async queryPath(path: string, constraints: QueryConstraint[]): Promise<any[]> {
    // Split path into segments (e.g., 'customers/uid/subscriptions' -> ['customers', 'uid', 'subscriptions'])
    const segments = path.split('/');
    
    // Build collection reference from path segments
    let collectionRef;
    if (segments.length === 1) {
      // Simple collection
      collectionRef = collection(db, segments[0]);
    } else {
      // Nested collection - use doc() for even indices, collection() for odd
      collectionRef = collection(db, ...segments as [string, ...string[]]);
    }

    let queryRef: any = collectionRef;

    // Apply constraints
    for (const constraint of constraints) {
      switch (constraint.type) {
        case 'where':
          queryRef = query(queryRef, where(constraint.field, constraint.operator!, constraint.value));
          break;
        case 'orderBy':
          queryRef = query(queryRef, orderBy(constraint.field, constraint.direction));
          break;
        case 'limit':
          queryRef = query(queryRef, limit(constraint.limitValue!));
          break;
      }
    }

    const querySnapshot = await getDocs(queryRef);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as Record<string, unknown>) }));
  }

  /**
   * Subscribe to query with support for subcollections and nested paths
   */
  subscribeToQueryPath(path: string, constraints: QueryConstraint[], callback: (data: any[]) => void): () => void {
    // Split path into segments
    const segments = path.split('/');
    
    // Build collection reference from path segments
    let collectionRef;
    if (segments.length === 1) {
      collectionRef = collection(db, segments[0]);
    } else {
      collectionRef = collection(db, ...segments as [string, ...string[]]);
    }

    let queryRef: any = collectionRef;

    // Apply constraints
    for (const constraint of constraints) {
      switch (constraint.type) {
        case 'where':
          queryRef = query(queryRef, where(constraint.field, constraint.operator!, constraint.value));
          break;
        case 'orderBy':
          queryRef = query(queryRef, orderBy(constraint.field, constraint.direction));
          break;
        case 'limit':
          queryRef = query(queryRef, limit(constraint.limitValue!));
          break;
      }
    }

    let debounceTimer: NodeJS.Timeout | null = null;
    
    const unsubscribe = onSnapshot(queryRef, (querySnapshot) => {
      // Clear any pending callback
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      
      // Debounce to batch rapid changes
      debounceTimer = setTimeout(() => {
        const data = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        callback(data);
      }, 100); // 100ms debounce
    }, (error) => {
      console.warn('Error in subscribeToPath:', error);
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      callback([]);
    });
    
    return () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      unsubscribe();
    };
  }

  // ============================================================================
  // BATCH OPERATIONS
  // ============================================================================

  async batchUpdate(operations: Array<{ collection: string; id: string; data: Partial<any> }>): Promise<void> {
    const promises = operations.map(op => {
      const docRef = doc(db, op.collection, op.id);
      return updateDoc(docRef, op.data);
    });

    await Promise.all(promises);
  }

  async batchDelete(operations: Array<{ collection: string; id: string }>): Promise<void> {
    const promises = operations.map(op => {
      const docRef = doc(db, op.collection, op.id);
      return deleteDoc(docRef);
    });

    await Promise.all(promises);
  }

  // ============================================================================
  // CLOUD FUNCTIONS
  // ============================================================================

  async callFunction<TRequest = unknown, TResponse = unknown>(
    functionName: string,
    data?: TRequest
  ): Promise<TResponse> {
    const callable = httpsCallable<TRequest, TResponse>(functions, functionName);
    const result = await callable(data);
    return result.data;
  }

  // ============================================================================
  // MESSAGING / PUSH NOTIFICATIONS
  // ============================================================================

  async getMessagingToken(): Promise<string | null> {
    try {
      const token = await getToken(messaging, {
        vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
      });
      return token || null;
    } catch (error) {
      console.error('Error getting messaging token:', error);
      return null;
    }
  }

  onMessageReceived(callback: (payload: unknown) => void): () => void {
    return onMessage(messaging, (payload) => {
      callback(payload);
    });
  }

  async requestNotificationPermission(): Promise<string> {
    try {
      const permission = await Notification.requestPermission();
      return permission;
    } catch (error) {
      console.error('Error requesting notification permission:', error);
      return 'denied';
    }
  }

  // ============================================================================
  // REALTIME UPDATES
  // ============================================================================

  subscribeToDocument(
    collectionName: string,
    documentId: string,
    callback: (data: unknown | null) => void
  ): () => void {
    const docRef = doc(db, collectionName, documentId);
    return onSnapshot(docRef, (docSnapshot) => {
      if (docSnapshot.exists()) {
        callback({ id: docSnapshot.id, ...docSnapshot.data() });
      } else {
        callback(null);
      }
    }, (error) => {
      console.warn('Error in subscribeToDocument:', error);
      callback(null);
    });
  }

  subscribeToDocumentPath(
    path: string,
    callback: (data: unknown | null) => void
  ): () => void {
    const parts = path.split('/');
    if (parts.length % 2 !== 0) {
      throw new Error(`Invalid document path: ${path}. Path must have even number of segments (collection/doc/.../collection/doc)`);
    }
    
    const docRef = doc(db, path);
    return onSnapshot(docRef, (docSnapshot) => {
      if (docSnapshot.exists()) {
        callback({ id: docSnapshot.id, ...docSnapshot.data() });
      } else {
        callback(null);
      }
    }, (error) => {
      console.warn('Error in subscribeToDocumentPath:', error);
      callback(null);
    });
  }

  // ============================================================================
  // DOCUMENT OPERATIONS
  // ============================================================================

  async getDocument(collectionName: string, documentId: string): Promise<any | null> {
    const docRef = doc(db, collectionName, documentId);
    const docSnap = await getDoc(docRef);
    
    if (!docSnap.exists()) return null;
    
    return { id: docSnap.id, ...docSnap.data() };
  }

  async setDocument(collectionName: string, documentId: string, data: any, options?: { merge?: boolean }): Promise<void> {
    const docRef = doc(db, collectionName, documentId);
    await setDoc(docRef, data, options || {});
  }

  async addDocument(collectionName: string, data: any): Promise<string> {
    const colRef = collection(db, collectionName);
    const docRef = await addDoc(colRef, data);
    return docRef.id;
  }

  async updateDocument(collectionName: string, documentId: string, data: Partial<any>): Promise<void> {
    const docRef = doc(db, collectionName, documentId);
    await updateDoc(docRef, data);
  }

  async deleteDocument(collectionName: string, documentId: string): Promise<void> {
    const docRef = doc(db, collectionName, documentId);
    await deleteDoc(docRef);
  }

  // ============================================================================
  // UTILITIES
  // ============================================================================

  getServerTimestamp(): unknown {
    return serverTimestamp();
  }

  arrayUnion(...elements: unknown[]): unknown {
    return firestoreArrayUnion(...elements);
  }

  arrayRemove(...elements: unknown[]): unknown {
    return firestoreArrayRemove(...elements);
  }

  increment(n: number): unknown {
    return firestoreIncrement(n);
  }

  deleteField(): unknown {
    return firestoreDeleteField();
  }
}

// Export singleton instance
export const firebaseBackend = new FirebaseBackend();
