import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Debug function to analyze all user data and encryption structures
 */
export async function debugUserData(userId: string): Promise<void> {
  console.log('=== COMPREHENSIVE USER DATA ANALYSIS ===');
  console.log(`Analyzing data for user: ${userId}`);
  
  try {
    // Check Files Collection
    console.log('\n--- FILES COLLECTION ---');
    const allFilesQuery = query(collection(db, 'files'));
    const allFilesSnapshot = await getDocs(allFilesQuery);
    console.log(`Total files in database: ${allFilesSnapshot.size}`);
    
    const userFilesQuery = query(
      collection(db, 'files'),
      where('owner', '==', userId)
    );
    const userFilesSnapshot = await getDocs(userFilesQuery);
    console.log(`Files owned by user: ${userFilesSnapshot.size}`);
    
    userFilesSnapshot.forEach((doc, index) => {
      const data = doc.data();
      console.log(`File ${index + 1} (${doc.id}):`, {
        owner: data.owner,
        name: data.name,
        hasEncryptedKeys: !!data.encryptedKeys,
        encryptedKeysStructure: data.encryptedKeys ? Object.keys(data.encryptedKeys) : [],
        hasUserKey: !!(data.encryptedKeys && data.encryptedKeys[userId]),
        sharedWith: data.sharedWith || [],
        allFields: Object.keys(data)
      });
    });

    // Check shared files
    try {
      const sharedFilesQuery = query(
        collection(db, 'files'),
        where('sharedWith', 'array-contains', userId)
      );
      const sharedFilesSnapshot = await getDocs(sharedFilesQuery);
      console.log(`Files shared with user: ${sharedFilesSnapshot.size}`);
      
      sharedFilesSnapshot.forEach((doc, index) => {
        const data = doc.data();
        console.log(`Shared file ${index + 1} (${doc.id}):`, {
          owner: data.owner,
          name: data.name,
          hasEncryptedKeys: !!data.encryptedKeys,
          encryptedKeysStructure: data.encryptedKeys ? Object.keys(data.encryptedKeys) : [],
          hasUserKey: !!(data.encryptedKeys && data.encryptedKeys[userId]),
          sharedWith: data.sharedWith || []
        });
      });
    } catch (sharedError) {
      console.log('Error querying shared files (might be normal):', sharedError);
    }

    // Check Folders Collection
    console.log('\n--- FOLDERS COLLECTION ---');
    const userFoldersQuery = query(
      collection(db, 'folders'),
      where('owner', '==', userId)
    );
    const userFoldersSnapshot = await getDocs(userFoldersQuery);
    console.log(`Folders owned by user: ${userFoldersSnapshot.size}`);
    
    userFoldersSnapshot.forEach((doc, index) => {
      const data = doc.data();
      console.log(`Folder ${index + 1} (${doc.id}):`, {
        owner: data.owner,
        name: data.name,
        hasEncryptedKeys: !!data.encryptedKeys,
        encryptedKeysStructure: data.encryptedKeys ? Object.keys(data.encryptedKeys) : [],
        hasUserKey: !!(data.encryptedKeys && data.encryptedKeys[userId]),
        parent: data.parent,
        allFields: Object.keys(data)
      });
    });

    // Check Groups Collection (if it exists)
    console.log('\n--- GROUPS COLLECTION ---');
    try {
      const userGroupsQuery = query(
        collection(db, 'groups'),
        where('owner', '==', userId)
      );
      const userGroupsSnapshot = await getDocs(userGroupsQuery);
      console.log(`Groups owned by user: ${userGroupsSnapshot.size}`);
      
      userGroupsSnapshot.forEach((doc, index) => {
        const data = doc.data();
        console.log(`Group ${index + 1} (${doc.id}):`, {
          owner: data.owner,
          name: data.name,
          isEncrypted: data.isEncrypted,
          hasEncryptedKeys: !!data.encryptedKeys,
          allFields: Object.keys(data)
        });
      });
    } catch (groupsError) {
      console.log('Groups collection not accessible or doesn\'t exist:', groupsError);
    }

    // Summary
    console.log('\n--- SUMMARY ---');
    let totalEncryptedItems = 0;
    
    // Count files with user's encrypted keys
    userFilesSnapshot.forEach(doc => {
      const data = doc.data();
      if (data.encryptedKeys && data.encryptedKeys[userId]) {
        totalEncryptedItems++;
      }
    });
    
    // Count folders with user's encrypted keys  
    userFoldersSnapshot.forEach(doc => {
      const data = doc.data();
      if (data.encryptedKeys && data.encryptedKeys[userId]) {
        totalEncryptedItems++;
      }
    });
    
    console.log(`Total encrypted items that would be affected: ${totalEncryptedItems}`);
    console.log('=== END ANALYSIS ===');
    
  } catch (error) {
    console.error('Error during debug analysis:', error);
  }
}

/**
 * Test the counting function directly
 */
export async function testCountFunction(userId: string): Promise<number> {
  const { countUserFiles } = await import('./keyMigration');
  console.log('\n=== TESTING COUNT FUNCTION ===');
  const count = await countUserFiles(userId);
  console.log(`Count function returned: ${count}`);
  return count;
}