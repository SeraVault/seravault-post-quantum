/**
 * Firebase implementation of the Backend interface
 * This can be swapped out with other backend implementations (Supabase, AWS, etc.)
 */

import { auth, db, storage } from '../firebase';
import {
  signInWithEmailAndPassword as firebaseSignIn,
  createUserWithEmailAndPassword as firebaseCreateUser,
  signOut as firebaseSignOut,
  onAuthStateChanged as firebaseOnAuthStateChanged,
} from 'firebase/auth';

import {
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';

import {
  ref,
  uploadBytes,
  getBytes,
  deleteObject,
} from 'firebase/storage';

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

export class FirebaseBackend implements BackendInterface {
  // ============================================================================
  // AUTHENTICATION
  // ============================================================================

  getCurrentUser(): User | null {
    const firebaseUser = auth.currentUser;
    if (!firebaseUser) return null;

    return {
      uid: firebaseUser.uid,
      email: firebaseUser.email,
      displayName: firebaseUser.displayName,
      photoURL: firebaseUser.photoURL,
      emailVerified: firebaseUser.emailVerified,
    };
  }

  async signInWithEmailAndPassword(email: string, password: string): Promise<User> {
    const result = await firebaseSignIn(auth, email, password);
    return {
      uid: result.user.uid,
      email: result.user.email,
      displayName: result.user.displayName,
      photoURL: result.user.photoURL,
      emailVerified: result.user.emailVerified,
    };
  }

  async createUserWithEmailAndPassword(email: string, password: string): Promise<User> {
    const result = await firebaseCreateUser(auth, email, password);
    return {
      uid: result.user.uid,
      email: result.user.email,
      displayName: result.user.displayName,
      photoURL: result.user.photoURL,
      emailVerified: result.user.emailVerified,
    };
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
    await setDoc(docRef, {
      ...file,
      createdAt: serverTimestamp(),
      lastModified: serverTimestamp(),
    });
    return docRef.id;
  }

  async getFile(fileId: string): Promise<FileRecord | null> {
    const docRef = doc(db, 'files', fileId);
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
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FileRecord));
  }

  subscribeToUserFiles(userId: string, folderId: string | null, callback: (files: FileRecord[]) => void): () => void {
    // Firebase doesn't support OR queries across different fields easily
    // So we need to create two separate subscriptions and merge the results
    const allFiles = new Map<string, FileRecord>();
    let ownedUnsubscribe: (() => void) | null = null;
    let sharedUnsubscribe: (() => void) | null = null;

    const updateCallback = () => {
      const mergedFiles = Array.from(allFiles.values());
      console.log(`📡 Real-time subscription: ${mergedFiles.length} total files in folder ${folderId || 'root'}`);
      callback(mergedFiles);
    };

    // Subscribe to owned files
    const ownedQuery = folderId
      ? query(collection(db, 'files'), where('owner', '==', userId), where('parent', '==', folderId))
      : query(collection(db, 'files'), where('owner', '==', userId), where('parent', '==', null));

    ownedUnsubscribe = onSnapshot(ownedQuery, (querySnapshot) => {
      // Update owned files in the map
      querySnapshot.docChanges().forEach((change) => {
        const fileData = { id: change.doc.id, ...change.doc.data() } as FileRecord;
        if (change.type === 'removed') {
          allFiles.delete(change.doc.id);
        } else {
          allFiles.set(change.doc.id, fileData);
        }
      });
      updateCallback();
    }, (error) => {
      console.warn('Error in owned files subscription:', error);
    });

    // Subscribe to shared files (different from owned)
    const sharedQuery = folderId
      ? query(collection(db, 'files'), where('sharedWith', 'array-contains', userId), where('parent', '==', folderId))
      : query(collection(db, 'files'), where('sharedWith', 'array-contains', userId), where('parent', '==', null));

    sharedUnsubscribe = onSnapshot(sharedQuery, (querySnapshot) => {
      // Update shared files in the map
      querySnapshot.docChanges().forEach((change) => {
        const fileData = { id: change.doc.id, ...change.doc.data() } as FileRecord;
        if (change.type === 'removed') {
          allFiles.delete(change.doc.id);
        } else {
          allFiles.set(change.doc.id, fileData);
        }
      });
      updateCallback();
    }, (error) => {
      console.warn('Error in shared files subscription:', error);
    });

    // Return cleanup function that unsubscribes from both
    return () => {
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
    return onSnapshot(q, (querySnapshot) => {
      const folders = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FolderRecord));
      callback(folders);
    });
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
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
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

    return onSnapshot(queryRef, (querySnapshot) => {
      const data = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      callback(data);
    });
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
}

// Export singleton instance
export const firebaseBackend = new FirebaseBackend();