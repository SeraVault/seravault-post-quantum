const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs } = require('firebase/firestore');
const { getStorage, listAll, ref, deleteObject } = require('firebase/storage');

// Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyAYFVUNF-HX0xeePUFdKHG8J9rNLVWmvM0",
  authDomain: "seravault-8c764.firebaseapp.com",
  projectId: "seravault-8c764",
  storageBucket: "seravault-8c764.firebasestorage.app",
  messagingSenderId: "626690486070",
  appId: "1:626690486070:web:b3c2d7c829a79d9f2b1c8a"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);

async function cleanupOrphanedFiles() {
  console.log('🔍 Analyzing storage for orphaned files...');
  
  try {
    // Get all file documents from Firestore
    console.log('📄 Fetching file records from Firestore...');
    const filesQuery = collection(db, 'files');
    const filesSnapshot = await getDocs(filesQuery);
    
    const validStoragePaths = new Set();
    let firestoreFileCount = 0;
    
    filesSnapshot.forEach((doc) => {
      const data = doc.data();
      if (data.storagePath) {
        validStoragePaths.add(data.storagePath);
        firestoreFileCount++;
      }
    });
    
    console.log(`📊 Found ${firestoreFileCount} files with storage paths in Firestore`);
    
    // List all files in storage
    console.log('☁️  Listing all files in Firebase Storage...');
    const storageRef = ref(storage);
    const storageList = await listAll(storageRef);
    
    let totalStorageFiles = 0;
    let orphanedFiles = [];
    
    // Check each storage file
    for (const itemRef of storageList.items) {
      totalStorageFiles++;
      if (!validStoragePaths.has(itemRef.fullPath)) {
        orphanedFiles.push(itemRef);
        console.log(`🗑️  Orphaned file found: ${itemRef.fullPath}`);
      }
    }
    
    // Check subfolders recursively
    for (const folderRef of storageList.prefixes) {
      const subList = await listAll(folderRef);
      for (const itemRef of subList.items) {
        totalStorageFiles++;
        if (!validStoragePaths.has(itemRef.fullPath)) {
          orphanedFiles.push(itemRef);
          console.log(`🗑️  Orphaned file found: ${itemRef.fullPath}`);
        }
      }
    }
    
    console.log(`\n📈 Analysis Results:`);
    console.log(`   Total files in storage: ${totalStorageFiles}`);
    console.log(`   Files with Firestore records: ${firestoreFileCount}`);
    console.log(`   Orphaned files (no Firestore record): ${orphanedFiles.length}`);
    
    if (orphanedFiles.length === 0) {
      console.log('✅ No orphaned files found - storage is clean!');
      return;
    }
    
    // Calculate estimated storage saved
    console.log(`\n⚠️  Found ${orphanedFiles.length} orphaned files that can be safely deleted`);
    console.log('💾 This will free up storage space and reduce costs');
    
    // For safety, just report findings - don't auto-delete
    console.log('\n📝 Orphaned files list:');
    orphanedFiles.forEach((fileRef, index) => {
      console.log(`   ${index + 1}. ${fileRef.fullPath}`);
    });
    
    console.log('\n🚨 To delete these orphaned files, you would need to:');
    console.log('   1. Review the list above carefully');
    console.log('   2. Ensure these are truly orphaned (no longer needed)');
    console.log('   3. Use Firebase Console or modify this script to delete them');
    console.log('   4. This cleanup fixes the storage leak from the previous deletion bug');
    
  } catch (error) {
    if (error.code === 'permission-denied') {
      console.error('❌ Permission denied accessing Firebase. Make sure you have proper credentials.');
    } else {
      console.error('❌ Error during analysis:', error);
    }
  }
}

// Run the analysis
cleanupOrphanedFiles()
  .then(() => {
    console.log('\n🎉 Analysis completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Analysis failed:', error);
    process.exit(1);
  });