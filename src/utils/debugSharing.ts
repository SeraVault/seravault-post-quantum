import { db } from '../firebase';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';

export const debugSharedFilesForUser = async (userId: string) => {
  console.log(`🔍 Debug: Checking shared files for user ${userId}`);
  
  try {
    // Try to get user profile first
    const userDoc = await getDoc(doc(db, 'users', userId));
    if (!userDoc.exists()) {
      console.error('❌ User document does not exist');
      return;
    }
    
    const userProfile = userDoc.data();
    console.log('✅ User profile found:', {
      email: userProfile.email,
      displayName: userProfile.displayName,
      hasPublicKey: !!userProfile.publicKey
    });
    
    // Query for files where user is in sharedWith array
    const sharedQuery = query(
      collection(db, 'files'),
      where('sharedWith', 'array-contains', userId)
    );
    
    const sharedSnapshot = await getDocs(sharedQuery);
    console.log(`📊 Found ${sharedSnapshot.size} files shared with user`);
    
    sharedSnapshot.docs.forEach((doc, index) => {
      const fileData = doc.data();
      console.log(`📄 Shared file ${index + 1}:`, {
        id: doc.id,
        name: fileData.name,
        owner: fileData.owner,
        sharedWith: fileData.sharedWith,
        hasEncryptedKey: !!fileData.encryptedKeys[userId]
      });
    });
    
  } catch (error) {
    console.error('❌ Error debugging shared files:', error);
  }
};

export const debugAllUsersWithEmail = async (email: string) => {
  console.log(`🔍 Debug: Finding all users with email ${email}`);
  
  try {
    const usersQuery = query(
      collection(db, 'users'),
      where('email', '==', email)
    );
    
    const snapshot = await getDocs(usersQuery);
    console.log(`👥 Found ${snapshot.size} users with email ${email}`);
    
    snapshot.docs.forEach((doc, index) => {
      const userData = doc.data();
      console.log(`👤 User ${index + 1}:`, {
        id: doc.id,
        email: userData.email,
        displayName: userData.displayName,
        hasPublicKey: !!userData.publicKey
      });
    });
    
  } catch (error) {
    console.error('❌ Error debugging users:', error);
  }
};