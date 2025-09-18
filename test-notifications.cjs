const admin = require('firebase-admin');

// Initialize Firebase Admin SDK (use service account if you have one)
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

async function checkNotifications() {
  try {
    console.log('🔍 Checking notifications collection...');
    
    const notifications = await db.collection('notifications')
      .orderBy('createdAt', 'desc')
      .limit(10)
      .get();
    
    console.log(`📊 Found ${notifications.size} notifications`);
    
    notifications.forEach((doc) => {
      const data = doc.data();
      console.log(`📬 Notification ${doc.id}:`);
      console.log(`  - Type: ${data.type}`);
      console.log(`  - Recipient: ${data.recipientId}`);
      console.log(`  - Sender: ${data.senderId}`);
      console.log(`  - Title: ${data.title}`);
      console.log(`  - Read: ${data.isRead}`);
      console.log(`  - Created: ${data.createdAt?.toDate?.() || 'Unknown'}`);
      console.log('---');
    });
    
  } catch (error) {
    console.error('❌ Error checking notifications:', error);
  }
}

checkNotifications();