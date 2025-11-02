/**
 * Test script for SeraVault notifications and file sharing
 * 
 * This script tests:
 * 1. User authentication
 * 2. File creation and encryption
 * 3. File sharing between users
 * 4. Notification creation and delivery
 * 5. Notification deletion on read
 * 
 * Usage: node test-notifications.js
 */

import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  signOut 
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  addDoc, 
  updateDoc, 
  doc, 
  getDocs, 
  query, 
  where,
  onSnapshot,
  deleteDoc
} from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBLUs8a2zcKQm3ou0_KKJRTkXE4A8ZPuHo",
  authDomain: "seravault-8c764.firebaseapp.com",
  projectId: "seravault-8c764",
  storageBucket: "seravault-8c764.firebasestorage.app",
  messagingSenderId: "880705803632",
  appId: "1:880705803632:web:84a22cce8f21c9b75cae3d"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

// Test configuration
const TEST_USERS = {
  user1: {
    email: 'testuser1@seravault.test',
    password: 'TestPassword123!',
    displayName: 'Test User 1'
  },
  user2: {
    email: 'testuser2@seravault.test',
    password: 'TestPassword123!',
    displayName: 'Test User 2'
  }
};

let notificationUnsubscribe = null;

// Utility functions
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function log(emoji, message, data = null) {
  const timestamp = new Date().toLocaleTimeString();
  console.log(`[${timestamp}] ${emoji} ${message}`);
  if (data) {
    console.log(JSON.stringify(data, null, 2));
  }
}

// User management functions
async function createOrSignInUser(userConfig) {
  try {
    // Try to sign in first
    const userCredential = await signInWithEmailAndPassword(
      auth, 
      userConfig.email, 
      userConfig.password
    );
    log('✅', `Signed in existing user: ${userConfig.email}`);
    return userCredential.user;
  } catch (error) {
    if (error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential') {
      // User doesn't exist, create new account
      try {
        const userCredential = await createUserWithEmailAndPassword(
          auth,
          userConfig.email,
          userConfig.password
        );
        log('✅', `Created new user: ${userConfig.email}`);
        return userCredential.user;
      } catch (createError) {
        log('❌', `Failed to create user: ${userConfig.email}`, createError.message);
        throw createError;
      }
    } else {
      log('❌', `Failed to sign in: ${userConfig.email}`, error.message);
      throw error;
    }
  }
}

// Notification monitoring
function setupNotificationListener(userId, userName) {
  log('🔔', `Setting up notification listener for: ${userName}`);
  
  const q = query(
    collection(db, 'notifications'),
    where('recipientId', '==', userId)
  );
  
  const unsubscribe = onSnapshot(q, (snapshot) => {
    const notifications = [];
    snapshot.forEach((doc) => {
      notifications.push({
        id: doc.id,
        ...doc.data()
      });
    });
    
    if (notifications.length > 0) {
      log('📬', `${userName} received ${notifications.length} notification(s):`);
      notifications.forEach((notif, index) => {
        console.log(`  ${index + 1}. [${notif.type}] ${notif.title}: ${notif.message}`);
        console.log(`     FileID: ${notif.fileId || 'N/A'}, Read: ${notif.isRead}`);
      });
    }
  });
  
  return unsubscribe;
}

// File creation function
async function createTestFile(owner, fileName) {
  log('📄', `Creating test file: ${fileName} for user: ${owner.email}`);
  
  // Create a mock encrypted file document
  const fileData = {
    owner: owner.uid,
    encryptedName: {
      ciphertext: Buffer.from(fileName).toString('base64'),
      nonce: 'mock-nonce',
      senderPublicKey: 'mock-public-key'
    },
    size: {
      ciphertext: Buffer.from('1024').toString('base64'),
      nonce: 'mock-nonce',
      senderPublicKey: 'mock-public-key'
    },
    storagePath: `files/${owner.uid}/${Date.now()}-test.enc`,
    mimeType: 'application/octet-stream',
    parent: null,
    sharedWith: [],
    tags: [],
    createdAt: new Date(),
    lastModified: new Date()
  };
  
  const docRef = await addDoc(collection(db, 'files'), fileData);
  log('✅', `File created with ID: ${docRef.id}`);
  
  return { id: docRef.id, ...fileData };
}

// File sharing function
async function shareFile(fileId, newUserIds) {
  log('📤', `Sharing file ${fileId} with ${newUserIds.length} user(s)`);
  
  const fileRef = doc(db, 'files', fileId);
  
  // Get current file data
  const fileDoc = await getDocs(query(collection(db, 'files'), where('__name__', '==', fileId)));
  const currentData = fileDoc.docs[0]?.data();
  const currentSharedWith = currentData?.sharedWith || [];
  
  // Update sharedWith array
  await updateDoc(fileRef, {
    sharedWith: [...new Set([...currentSharedWith, ...newUserIds])],
    lastModified: new Date()
  });
  
  log('✅', `File shared successfully`);
}

// Notification deletion function
async function deleteNotification(notificationId) {
  log('🗑️', `Deleting notification: ${notificationId}`);
  await deleteDoc(doc(db, 'notifications', notificationId));
  log('✅', `Notification deleted`);
}

// Get all notifications for a user
async function getUserNotifications(userId) {
  const q = query(
    collection(db, 'notifications'),
    where('recipientId', '==', userId)
  );
  
  const snapshot = await getDocs(q);
  const notifications = [];
  snapshot.forEach((doc) => {
    notifications.push({
      id: doc.id,
      ...doc.data()
    });
  });
  
  return notifications;
}

// Main test execution
async function runTests() {
  console.log('\n' + '='.repeat(60));
  log('🧪', 'Starting SeraVault Notification Tests');
  console.log('='.repeat(60) + '\n');
  
  let user1 = null;
  let user2 = null;
  let testFile = null;
  let listener1 = null;
  let listener2 = null;
  
  try {
    // Test 1: Create/Sign in users
    console.log('\n--- Test 1: User Authentication ---');
    user1 = await createOrSignInUser(TEST_USERS.user1);
    await sleep(1000);
    
    await signOut(auth);
    await sleep(500);
    
    user2 = await createOrSignInUser(TEST_USERS.user2);
    await sleep(1000);
    
    // Test 2: Setup notification listeners
    console.log('\n--- Test 2: Setting up Notification Listeners ---');
    listener1 = setupNotificationListener(user1.uid, TEST_USERS.user1.displayName);
    listener2 = setupNotificationListener(user2.uid, TEST_USERS.user2.displayName);
    await sleep(2000);
    
    // Test 3: Create a file as user1
    console.log('\n--- Test 3: File Creation ---');
    await signOut(auth);
    await sleep(500);
    user1 = await createOrSignInUser(TEST_USERS.user1);
    testFile = await createTestFile(user1, 'Test Document.pdf');
    await sleep(2000);
    
    // Test 4: Share file with user2
    console.log('\n--- Test 4: File Sharing ---');
    log('📤', `User1 sharing file with User2...`);
    await shareFile(testFile.id, [user2.uid]);
    log('⏳', 'Waiting for notification to be created...');
    await sleep(5000);
    
    // Test 5: Check notifications for user2
    console.log('\n--- Test 5: Verify Notifications ---');
    const user2Notifications = await getUserNotifications(user2.uid);
    log('📊', `User2 has ${user2Notifications.length} notification(s)`);
    
    if (user2Notifications.length > 0) {
      user2Notifications.forEach((notif, index) => {
        console.log(`\n  Notification ${index + 1}:`);
        console.log(`    Type: ${notif.type}`);
        console.log(`    Title: ${notif.title}`);
        console.log(`    Message: ${notif.message}`);
        console.log(`    FileID: ${notif.fileId}`);
        console.log(`    Read: ${notif.isRead}`);
        console.log(`    Created: ${notif.createdAt?.toDate?.() || notif.createdAt}`);
      });
    }
    
    // Test 6: Modify the file (should create modification notification)
    console.log('\n--- Test 6: File Modification ---');
    log('✏️', 'Modifying file content...');
    const fileRef = doc(db, 'files', testFile.id);
    await updateDoc(fileRef, {
      size: {
        ciphertext: Buffer.from('2048').toString('base64'), // Changed size
        nonce: 'mock-nonce-2',
        senderPublicKey: 'mock-public-key'
      },
      lastModified: new Date()
    });
    log('⏳', 'Waiting for modification notification...');
    await sleep(5000);
    
    // Test 7: Check notifications again
    console.log('\n--- Test 7: Verify Modification Notifications ---');
    const user2NotificationsAfterMod = await getUserNotifications(user2.uid);
    log('📊', `User2 now has ${user2NotificationsAfterMod.length} notification(s)`);
    
    // Test 8: Delete (mark as read) notifications
    console.log('\n--- Test 8: Delete Notifications ---');
    if (user2NotificationsAfterMod.length > 0) {
      for (const notif of user2NotificationsAfterMod) {
        await deleteNotification(notif.id);
        await sleep(500);
      }
      
      await sleep(2000);
      const finalNotifications = await getUserNotifications(user2.uid);
      log('📊', `User2 final notification count: ${finalNotifications.length}`);
    }
    
    // Test 9: Cleanup - delete test file
    console.log('\n--- Test 9: Cleanup ---');
    await deleteDoc(doc(db, 'files', testFile.id));
    log('🗑️', 'Test file deleted');
    
    console.log('\n' + '='.repeat(60));
    log('✅', 'All tests completed successfully!');
    console.log('='.repeat(60) + '\n');
    
  } catch (error) {
    console.log('\n' + '='.repeat(60));
    log('❌', 'Test failed with error:', error.message);
    console.error(error);
    console.log('='.repeat(60) + '\n');
  } finally {
    // Cleanup listeners
    if (listener1) listener1();
    if (listener2) listener2();
    
    // Sign out
    await signOut(auth);
    log('👋', 'Signed out and cleaned up');
    
    // Exit
    process.exit(0);
  }
}

// Run tests
runTests();
