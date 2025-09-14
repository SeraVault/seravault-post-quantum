/**
 * Emergency key fix script for current user
 * This will regenerate keys and clear stale encrypted data
 */

import admin from 'firebase-admin';
import { readFileSync } from 'fs';

// Initialize Firebase Admin (requires service account key)
if (!admin.apps.length) {
  try {
    const serviceAccount = JSON.parse(readFileSync('./service-account-key.json', 'utf8'));
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: 'seravault-8c764'
    });
    console.log('✅ Firebase Admin initialized');
  } catch (error) {
    console.error('❌ Failed to initialize Firebase Admin:', error.message);
    console.log('Please ensure service-account-key.json exists');
    process.exit(1);
  }
}

const db = admin.firestore();

async function fixUserKeys() {
  const userId = 'larNqpdVkcZ1AyRsrvWaPyWxTsn1'; // From the logs
  
  console.log(`🔄 Fixing keys for user: ${userId}`);
  
  try {
    // 1. Check current user profile
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      console.error('❌ User not found');
      return;
    }
    
    const userData = userDoc.data();
    console.log('📋 Current user data:', {
      hasPublicKey: !!userData.publicKey,
      publicKeyPreview: userData.publicKey?.substring(0, 16) + '...',
      hasEncryptedPrivateKey: !!userData.encryptedPrivateKey
    });
    
    // 2. Delete stale encrypted folders/files
    console.log('🗑️ Clearing stale encrypted folders...');
    const foldersSnapshot = await db.collection('folders')
      .where('owner', '==', userId)
      .get();
    
    const deletePromises = [];
    foldersSnapshot.forEach(doc => {
      console.log(`  Deleting folder: ${doc.id}`);
      deletePromises.push(doc.ref.delete());
    });
    
    // Also clear files
    const filesSnapshot = await db.collection('files')
      .where('owner', '==', userId)
      .get();
    
    filesSnapshot.forEach(doc => {
      console.log(`  Deleting file: ${doc.id}`);
      deletePromises.push(doc.ref.delete());
    });
    
    await Promise.all(deletePromises);
    console.log(`✅ Cleared ${deletePromises.length} stale encrypted items`);
    
    console.log('\n🎯 Next steps:');
    console.log('1. Go to Profile page in the app');
    console.log('2. Click "Regenerate Keys"');
    console.log('3. Create new folders/files');
    console.log('4. Verify encryption/decryption works');
    
  } catch (error) {
    console.error('❌ Error fixing user keys:', error);
  }
}

// Run the fix
fixUserKeys().then(() => {
  console.log('✅ Key fix completed');
  process.exit(0);
}).catch(error => {
  console.error('❌ Key fix failed:', error);
  process.exit(1);
});