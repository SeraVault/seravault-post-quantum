# SeraVault Notification Testing

## ⚠️ Important: Encryption Keys Required

SeraVault uses **post-quantum encryption (Kyber-1024)**. Each user MUST have encryption keys before creating or sharing files.

### Why Keys Matter
- All file metadata is **encrypted** (names, sizes, etc.)
- Files are encrypted with user's public key
- Shared files require recipient's public key
- **Without keys → Cannot test file sharing**

### Solutions

**Option 1: Use `test-notifications-with-keys.js`** ⭐ RECOMMENDED
- Automatically generates mock keys for test users
- Works for testing notifications end-to-end
- No manual setup required

**Option 2: Generate Real Keys via App**
- Sign up users through SeraVault app
- Complete key generation flow with real passphrases
- Use `test-share-simple.js` for manual testing

## Test Scripts

### ⭐ `test-notifications-with-keys.js` - RECOMMENDED

**Automated test suite with automatic key generation**

```bash
node test-notifications-with-keys.js
```

**Features:**
- ✅ Creates 2 test users automatically
- ✅ **Generates encryption keys** for both users
- ✅ Creates encrypted test file
- ✅ Tests file sharing → notification delivery
- ✅ Tests file modification → notification delivery  
- ✅ Verifies exactly 1 notification per event (no duplicates)
- ✅ Tests notification deletion
- ✅ Cleans up test files

**Test Users:**
- `testuser1@seravault.test` / Password: `TestPassword123!`
- `testuser2@seravault.test` / Password: `TestPassword123!`

### `test-notifications.js` - Basic Version

⚠️ **Requires users to already have keys**

Same as above but expects keys exist. Only use if testing with real users who generated keys through the app.

```bash
node test-notifications.js
```

### `test-share-simple.js` - Manual CLI Tool

⚠️ **Requires users to already have keys**

Command-line interface for manual testing:

```bash
# Create a file (requires user to have keys)
node test-share-simple.js create-file user@test.com Password123! "Doc.pdf"

# Share a file with another user
node test-share-simple.js share <file-id> <target-user-id>

# List all notifications for a user
node test-share-simple.js list-notifications <user-id>
```

## Quick Start

```bash
# Run the full automated test
node test-notifications-with-keys.js
```

Expected output:
```
[time] 🧪 Starting SeraVault Notification Tests (with Key Generation)
[time] ✅ Created new user: testuser1@seravault.test
[time] 🔐 Generating keys for user: abc123
[time] ✅ Keys generated and stored
[time] 📄 Creating test file: Test Document.pdf
[time] 📤 User1 sharing file with User2...
[time] 📬 Test User 2 received 1 notification(s):
[time]   1. [file_shared] New file shared with you: Test Document.pdf
[time] ✅ PASS: Exactly 1 file_shared notification received
[time] ✅ All tests completed successfully!
```

## Expected Behaviors

### ✅ File Shared Notification
- **When:** User A shares file with User B
- **Result:** User B gets **exactly 1** notification
- **Type:** `file_shared`
- **Message:** "User A shared a file with you"

### ✅ File Modified Notification  
- **When:** User A modifies shared file content
- **Result:** User B gets **exactly 1** notification
- **Type:** `file_modified`
- **Message:** "User A modified a shared file"
- **Note:** Only fires on real content changes (not metadata)

### ✅ No Duplicate Notifications
- Both `onFileShared` and `onFileModified` Cloud Functions trigger
- But only ONE creates a notification
- Check logs for: `🔄 Ignoring modification notification`

### ✅ File Unshared (Silent)
- **When:** User A removes User B from shared file
- **Result:** **No notification sent**
- **Reason:** Better UX - user silently loses access

### ✅ Notification Deletion
- **When:** User clicks notification
- **Result:** Notification is **deleted** (not marked read)
- **Effect:** Disappears from UI, badge count decreases

## Debugging

### Firebase Console Checks

**1. Firestore → `userKeys` collection**
```
Should have documents for each user:
- {userId}: { publicKey, createdAt, algorithm: 'mock-kyber-1024' }
```

**2. Firestore → `files` collection**
```
Test files should have:
- encryptedName: { ciphertext, nonce, senderPublicKey }
- sharedWith: [array of user IDs]
```

**3. Firestore → `notifications` collection**
```
Active notifications:
- recipientId, fileId, type, message, isRead
Should be deleted when clicked
```

**4. Functions → Logs**
```
Look for:
📋 onFileShared triggered for file: xyz
📋 onFileModified triggered for file: xyz
🔄 Ignoring modification notification - sharing event
📤 File sharing notifications processed: +1 shared
```

### Common Issues

**"Keys not found" error:**
- Run `test-notifications-with-keys.js` which generates keys automatically
- Or generate keys through app for real users

**No notifications appear:**
- Check Functions logs for errors
- Verify `onFileShared` triggered
- Check Firestore rules allow notification creation

**Duplicate notifications:**
- Should see "Ignoring modification notification" in logs
- If not, check `onFileModified` has sharing detection logic

**Notifications don't delete:**
- Check HTTP function `markNotificationAsRead` is deployed
- Check Firestore rules allow deletion by recipientId

## Cleanup

**Automatic (test script does this):**
- ✅ Test files deleted
- ✅ Test notifications deleted

**Manual (if needed):**
```
Firebase Console → Authentication
- Delete: testuser1@seravault.test, testuser2@seravault.test

Firebase Console → Firestore → userKeys
- Delete test user key documents
```

## How It Works

### Encryption Flow

1. **Key Generation:**
   - User signs up
   - Kyber-1024 key pair generated
   - Public key → Firestore `userKeys/{userId}`
   - Private key → Encrypted with passphrase → Local storage

2. **File Creation:**
   ```javascript
   {
     encryptedName: encrypt("filename.pdf", ownerPublicKey),
     size: encrypt("1024", ownerPublicKey),
     sharedWith: []
   }
   ```

3. **File Sharing:**
   ```javascript
   // Update sharedWith array
   updateDoc(fileRef, {
     sharedWith: [...current, recipientUserId]
   })
   // Triggers onFileShared Cloud Function
   // Creates notification for recipient
   ```

4. **Notification:**
   ```javascript
   {
     recipientId: "user-b-uid",
     fileId: "shared-file-id",
     type: "file_shared",
     message: "User A shared a file with you"
   }
   ```

5. **Click Notification:**
   - Call HTTP function `markNotificationAsRead`
   - Delete notification from Firestore
   - Navigate to file viewer

## Advanced Testing

### Test Real Keys from App

1. Sign up 2 users through SeraVault app
2. Generate real Kyber keys for both
3. Create file as User 1
4. Share with User 2 using:
   ```bash
   node test-share-simple.js share <file-id> <user2-uid>
   ```
5. Check User 2's notifications in app

### Test Modification Flow

After sharing a file:
```javascript
const fileRef = doc(db, 'files', fileId);
await updateDoc(fileRef, {
  size: newEncryptedSize,  // Content change
  lastModified: new Date()
});
// Should create file_modified notification
```

### Verify No Duplicate When Sharing

```javascript
// This should NOT create 2 notifications:
await updateDoc(fileRef, {
  sharedWith: [...current, newUser],  // Sharing change
  size: newSize,  // Content also changes
  lastModified: new Date()
});
// Should only get file_shared (onFileModified suppressed)
```

## Next Steps

1. ✅ Run `node test-notifications-with-keys.js`
2. ✅ Verify all PASS indicators in output
3. ✅ Check Firestore Console for correct data structure
4. ✅ Test in app UI with real users
5. ✅ Verify notifications appear and delete correctly
