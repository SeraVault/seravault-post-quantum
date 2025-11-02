/**
 * Simple test script for file sharing and notifications
 * 
 * Usage: 
 *   node test-share-simple.js share <file-id> <user-email>
 *   node test-share-simple.js list-notifications <user-email>
 *   node test-share-simple.js create-file <owner-email> <file-name>
 */

import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  addDoc, 
  updateDoc, 
  doc, 
  getDocs, 
  query, 
  where,
  getDoc
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyBLUs8a2zcKQm3ou0_KKJRTkXE4A8ZPuHo",
  authDomain: "seravault-8c764.firebaseapp.com",
  projectId: "seravault-8c764",
  storageBucket: "seravault-8c764.firebasestorage.app",
  messagingSenderId: "880705803632",
  appId: "1:880705803632:web:84a22cce8f21c9b75cae3d"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

async function getUserByEmail(email) {
  // Note: This requires admin access to list users
  // For testing, we'll need to know the UIDs beforehand
  console.log(`⚠️  Looking up user by email: ${email}`);
  console.log(`    You may need to provide the UID directly instead`);
  throw new Error('User lookup by email requires admin SDK. Please provide UID instead.');
}

async function createFile(ownerEmail, password, fileName) {
  console.log(`📄 Creating file for: ${ownerEmail}`);
  
  const userCred = await signInWithEmailAndPassword(auth, ownerEmail, password);
  const owner = userCred.user;
  
  const fileData = {
    owner: owner.uid,
    encryptedName: {
      ciphertext: Buffer.from(fileName).toString('base64'),
      nonce: 'test-nonce-' + Date.now(),
      senderPublicKey: 'test-public-key'
    },
    size: {
      ciphertext: Buffer.from('1024').toString('base64'),
      nonce: 'test-nonce-' + Date.now(),
      senderPublicKey: 'test-public-key'
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
  console.log(`✅ File created with ID: ${docRef.id}`);
  console.log(`   Owner: ${owner.email} (${owner.uid})`);
  
  return docRef.id;
}

async function shareFile(fileId, targetUserId) {
  console.log(`📤 Sharing file ${fileId} with user ${targetUserId}`);
  
  const fileRef = doc(db, 'files', fileId);
  const fileSnap = await getDoc(fileRef);
  
  if (!fileSnap.exists()) {
    throw new Error(`File ${fileId} not found`);
  }
  
  const currentData = fileSnap.data();
  const currentSharedWith = currentData.sharedWith || [];
  
  if (currentSharedWith.includes(targetUserId)) {
    console.log(`⚠️  User ${targetUserId} already has access to this file`);
    return;
  }
  
  await updateDoc(fileRef, {
    sharedWith: [...currentSharedWith, targetUserId],
    lastModified: new Date()
  });
  
  console.log(`✅ File shared successfully`);
  console.log(`   SharedWith: [${[...currentSharedWith, targetUserId].join(', ')}]`);
}

async function listNotifications(userId) {
  console.log(`📬 Fetching notifications for user: ${userId}`);
  
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
  
  console.log(`\nFound ${notifications.length} notification(s):\n`);
  
  notifications.forEach((notif, index) => {
    console.log(`${index + 1}. [${notif.type}] ${notif.title}`);
    console.log(`   Message: ${notif.message}`);
    console.log(`   FileID: ${notif.fileId || 'N/A'}`);
    console.log(`   Read: ${notif.isRead}`);
    console.log(`   Created: ${notif.createdAt?.toDate?.() || notif.createdAt}`);
    console.log('');
  });
}

// Command-line interface
const command = process.argv[2];
const args = process.argv.slice(3);

async function main() {
  try {
    switch (command) {
      case 'create-file':
        if (args.length < 3) {
          console.log('Usage: node test-share-simple.js create-file <email> <password> <file-name>');
          process.exit(1);
        }
        const fileId = await createFile(args[0], args[1], args[2]);
        console.log(`\n📋 To share this file, run:`);
        console.log(`   node test-share-simple.js share ${fileId} <target-user-id>`);
        break;
        
      case 'share':
        if (args.length < 2) {
          console.log('Usage: node test-share-simple.js share <file-id> <target-user-id>');
          process.exit(1);
        }
        await shareFile(args[0], args[1]);
        break;
        
      case 'list-notifications':
        if (args.length < 1) {
          console.log('Usage: node test-share-simple.js list-notifications <user-id>');
          process.exit(1);
        }
        await listNotifications(args[0]);
        break;
        
      default:
        console.log('Available commands:');
        console.log('  create-file <email> <password> <file-name>    - Create a test file');
        console.log('  share <file-id> <target-user-id>               - Share a file');
        console.log('  list-notifications <user-id>                   - List notifications');
        process.exit(1);
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  }
}

main();
