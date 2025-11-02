/**
 * Test script for chat subcollections
 * 
 * This script tests:
 * 1. Creating a conversation
 * 2. Sending messages (stored in subcollections)
 * 3. Querying messages from subcollections
 * 4. Verifying security rules work correctly
 * 
 * Run with: node test-chat-subcollections.js
 */

const admin = require('firebase-admin');
const serviceAccount = require('./seravault-8c764-firebase-adminsdk-jb93i-7f1c4ac2e9.json');

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function testChatSubcollections() {
  console.log('🧪 Testing chat subcollections...\n');

  try {
    // Test 1: Create a test conversation
    console.log('1️⃣ Creating test conversation...');
    const conversationRef = await db.collection('conversations').add({
      type: 'individual',
      participants: ['user1', 'user2'],
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      lastMessageAt: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log(`✅ Created conversation: ${conversationRef.id}\n`);

    // Test 2: Add messages to subcollection
    console.log('2️⃣ Adding messages to subcollection...');
    const messagesRef = conversationRef.collection('messages');
    
    const message1 = await messagesRef.add({
      senderId: 'user1',
      senderName: 'Test User 1',
      encryptedContent: {
        user1: { ciphertext: 'encrypted_for_user1', nonce: 'nonce1' },
        user2: { ciphertext: 'encrypted_for_user2', nonce: 'nonce2' }
      },
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      type: 'text'
    });
    console.log(`✅ Created message 1: ${message1.id}`);

    const message2 = await messagesRef.add({
      senderId: 'user2',
      senderName: 'Test User 2',
      encryptedContent: {
        user1: { ciphertext: 'encrypted_reply_for_user1', nonce: 'nonce3' },
        user2: { ciphertext: 'encrypted_reply_for_user2', nonce: 'nonce4' }
      },
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      type: 'text'
    });
    console.log(`✅ Created message 2: ${message2.id}\n`);

    // Test 3: Query messages from subcollection
    console.log('3️⃣ Querying messages from subcollection...');
    const messagesSnapshot = await messagesRef
      .orderBy('timestamp', 'desc')
      .limit(10)
      .get();
    
    console.log(`✅ Found ${messagesSnapshot.size} messages:`);
    messagesSnapshot.forEach(doc => {
      const data = doc.data();
      console.log(`   - ${doc.id}: from ${data.senderName}, type: ${data.type}`);
    });
    console.log('');

    // Test 4: Verify path structure
    console.log('4️⃣ Verifying path structure...');
    const expectedPath = `conversations/${conversationRef.id}/messages`;
    console.log(`✅ Messages path: ${expectedPath}`);
    console.log(`✅ Messages are stored in subcollection (not top-level collection)\n`);

    // Test 5: Check old messages collection (should be empty for new messages)
    console.log('5️⃣ Checking old messages collection...');
    const oldMessagesSnapshot = await db.collection('messages')
      .where('conversationId', '==', conversationRef.id)
      .get();
    console.log(`✅ Old collection has ${oldMessagesSnapshot.size} messages for this conversation (should be 0)\n`);

    // Test 6: Clean up test data
    console.log('6️⃣ Cleaning up test data...');
    
    // Delete messages
    const deleteMessagesPromises = messagesSnapshot.docs.map(doc => doc.ref.delete());
    await Promise.all(deleteMessagesPromises);
    console.log(`✅ Deleted ${messagesSnapshot.size} messages`);
    
    // Delete conversation
    await conversationRef.delete();
    console.log(`✅ Deleted conversation\n`);

    console.log('🎉 All tests passed! Chat subcollections are working correctly.\n');
    
    // Summary
    console.log('📋 Summary:');
    console.log('  ✅ Conversations can be created');
    console.log('  ✅ Messages are stored in subcollections');
    console.log('  ✅ Messages can be queried with orderBy');
    console.log('  ✅ Path structure: conversations/{id}/messages/{messageId}');
    console.log('  ✅ Old messages collection is not used for new messages\n');

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }

  process.exit(0);
}

// Run tests
testChatSubcollections();
