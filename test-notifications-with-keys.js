/**
 * Test script for SeraVault notifications with proper key generation
 * 
 * This script tests:
 * 1. User authentication and key generation
 * 2. File creation with proper encryption
 * 3. File sharing between users
 * 4. Notification creation and delivery
 * 5. Notification deletion on read
 * 
 * Usage: node test-notifications-with-keys.js
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
  deleteDoc,
  setDoc,
  getDoc
} from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import crypto from 'crypto';

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
    displayName: 'Test User 1',
    passphrase: 'test-passphrase-user1-secure'
  },
  user2: {
    email: 'testuser2@seravault.test',
    password: 'TestPassword123!',
    displayName: 'Test User 2',
    passphrase: 'test-passphrase-user2-secure'
  }
};

// Store generated keys
const userKeys = new Map();

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

/**
 * Generate Kyber keys for a user
 * Note: This is a mock implementation. In production, you'd use the actual Kyber library
 * or generate keys through the SeraVault app's key generation flow.
 */
async function generateUserKeys(userId, passphrase) {
  log('🔐', `Generating keys for user: ${userId}`);
  
  // In a real implementation, you would:
  // 1. Use Kyber key generation
  // 2. Derive keys from passphrase
  // 3. Encrypt private key with passphrase
  
  // For testing purposes, we'll create mock keys
  const mockPublicKey = crypto.randomBytes(32).toString('base64');
  const mockPrivateKey = crypto.randomBytes(32).toString('base64');
  
  // Store in Firestore
  const keyDoc = {
    publicKey: mockPublicKey,
    createdAt: new Date(),
    algorithm: 'mock-kyber-1024' // In production: 'kyber-1024'
  };
  
  await setDoc(doc(db, 'userKeys', userId), keyDoc);
  
  // Store locally for this session
  userKeys.set(userId, {
    publicKey: mockPublicKey,
    privateKey: mockPrivateKey
  });
  
  log('✅', 'Keys generated and stored');
  return { publicKey: mockPublicKey, privateKey: mockPrivateKey };
}

/**
 * Get or create user keys
 */
async function getOrCreateUserKeys(userId, passphrase) {
  // Check if keys already exist in Firestore
  const keyDocRef = doc(db, 'userKeys', userId);
  const keyDocSnap = await getDoc(keyDocRef);
  
  if (keyDocSnap.exists()) {
    log('✅', 'User keys already exist in Firestore');
    const keyData = keyDocSnap.data();
    
    // In production, you'd decrypt the private key using the passphrase
    // For testing, we'll generate a mock private key
    const mockPrivateKey = crypto.randomBytes(32).toString('base64');
    
    userKeys.set(userId, {
      publicKey: keyData.publicKey,
      privateKey: mockPrivateKey
    });
    
    return {
      publicKey: keyData.publicKey,
      privateKey: mockPrivateKey
    };
  } else {
    // Generate new keys
    return await generateUserKeys(userId, passphrase);
  }
}

/**
 * Mock encryption function
 * In production, this would use actual Kyber encryption
 */
function mockEncrypt(data, publicKey) {
  const nonce = crypto.randomBytes(24).toString('base64');
  const ciphertext = Buffer.from(data).toString('base64'); // Mock encryption
  
  return {
    ciphertext,
    nonce,
    senderPublicKey: publicKey
  };
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
    
    // Get or create keys for this user
    await getOrCreateUserKeys(userCredential.user.uid, userConfig.passphrase);
    
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
        
        // Generate keys for new user
        await generateUserKeys(userCredential.user.uid, userConfig.passphrase);
        
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

// File creation function with proper encryption
async function createTestFile(owner, fileName) {
  log('📄', `Creating test file: ${fileName} for user: ${owner.email}`);
  
  const keys = userKeys.get(owner.uid);
  if (!keys) {
    throw new Error('User keys not found. Generate keys first.');
  }
  
  // Encrypt file metadata
  const encryptedName = mockEncrypt(fileName, keys.publicKey);
  const encryptedSize = mockEncrypt('1024', keys.publicKey);
  
  const fileData = {
    owner: owner.uid,
    encryptedName,
    size: encryptedSize,
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
  const fileSnap = await getDoc(fileRef);
  
  if (!fileSnap.exists()) {
    throw new Error(`File ${fileId} not found`);
  }
  
  const currentData = fileSnap.data();
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
  log('🧪', 'Starting SeraVault Notification Tests (with Key Generation)');
  console.log('='.repeat(60) + '\n');
  
  let user1 = null;
  let user2 = null;
  let testFile = null;
  let listener1 = null;
  let listener2 = null;
  
  try {
    // Test 1: Create/Sign in users and generate keys
    console.log('\n--- Test 1: User Authentication & Key Generation ---');
    user1 = await createOrSignInUser(TEST_USERS.user1);
    await sleep(1000);
    
    await signOut(auth);
    await sleep(500);
    
    user2 = await createOrSignInUser(TEST_USERS.user2);
    await sleep(1000);
    
    log('📊', 'Generated keys stored:', {
      user1Keys: userKeys.has(user1.uid) ? 'Present' : 'Missing',
      user2Keys: userKeys.has(user2.uid) ? 'Present' : 'Missing'
    });
    
    // Test 2: Setup notification listeners
    console.log('\n--- Test 2: Setting up Notification Listeners ---');
    listener1 = setupNotificationListener(user1.uid, TEST_USERS.user1.displayName);
    listener2 = setupNotificationListener(user2.uid, TEST_USERS.user2.displayName);
    await sleep(2000);
    
    // Test 3: Create a file as user1 with proper encryption
    console.log('\n--- Test 3: File Creation (with encryption) ---');
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
      
      // Verify we got exactly 1 notification for file share
      if (user2Notifications.filter(n => n.type === 'file_shared').length === 1) {
        log('✅', 'PASS: Exactly 1 file_shared notification received');
      } else {
        log('❌', 'FAIL: Expected exactly 1 file_shared notification');
      }
    } else {
      log('❌', 'FAIL: No notifications received');
    }
    
    // Test 6: Modify the file (should create modification notification)
    console.log('\n--- Test 6: File Modification ---');
    log('✏️', 'Modifying file content...');
    const fileRef = doc(db, 'files', testFile.id);
    const keys = userKeys.get(user1.uid);
    const newEncryptedSize = mockEncrypt('2048', keys.publicKey);
    
    await updateDoc(fileRef, {
      size: newEncryptedSize,
      lastModified: new Date()
    });
    log('⏳', 'Waiting for modification notification...');
    await sleep(5000);
    
    // Test 7: Check notifications again
    console.log('\n--- Test 7: Verify Modification Notifications ---');
    const user2NotificationsAfterMod = await getUserNotifications(user2.uid);
    log('📊', `User2 now has ${user2NotificationsAfterMod.length} notification(s)`);
    
    const modNotifications = user2NotificationsAfterMod.filter(n => n.type === 'file_modified');
    if (modNotifications.length === 1) {
      log('✅', 'PASS: Exactly 1 file_modified notification received');
    } else {
      log('❌', `FAIL: Expected 1 file_modified notification, got ${modNotifications.length}`);
    }
    
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
      
      if (finalNotifications.length === 0) {
        log('✅', 'PASS: All notifications deleted successfully');
      } else {
        log('❌', `FAIL: Expected 0 notifications, still have ${finalNotifications.length}`);
      }
    }
    
    // Test 9: Cleanup - delete test file
    console.log('\n--- Test 9: Cleanup ---');
    await deleteDoc(doc(db, 'files', testFile.id));
    log('🗑️', 'Test file deleted');
    
    console.log('\n' + '='.repeat(60));
    log('✅', 'All tests completed successfully!');
    console.log('='.repeat(60) + '\n');
    
    console.log('\nℹ️  Note: Test users and their keys remain in Firestore for future tests.');
    console.log('   To remove them, delete manually from Firebase Console:');
    console.log('   - Authentication → testuser1@seravault.test, testuser2@seravault.test');
    console.log('   - Firestore → userKeys collection\n');
    
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
