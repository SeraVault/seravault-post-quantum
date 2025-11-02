# SeraVault Chat Architecture & Scalability

## Current Issues Fixed

### 1. ✅ Missing Firestore Index
**Problem:** Query on `conversationId` + `timestamp DESC` failed
**Solution:** Added composite index with both ASC and DESC orderings

### 2. ✅ Expensive Security Rules
**Problem:** `canAccessConversation()` required reading conversation doc on every message query
**Solution:** Denormalize `participants` array to each message (like `sharedWith` in files)

### 3. ⚠️ Scalability Concerns
**Problem:** Single `messages` collection will grow infinitely
**Solution:** Multiple strategies below

## Updated Security Model

### Messages Work Like Files

**Files Security:**
```javascript
{
  owner: "user-id",
  sharedWith: ["user-1", "user-2", "user-3"],
  // ... file data
}
```

**Messages Security (Updated):**
```javascript
{
  conversationId: "conv-id",
  senderId: "user-id",
  participants: ["user-1", "user-2", "user-3"], // DENORMALIZED
  encryptedContent: {...},
  timestamp: Timestamp
}
```

### Benefits

1. **No Extra Reads**: Don't need to read conversation doc to check permissions
2. **Consistent Model**: Same pattern as files (easier to understand)
3. **Fast Queries**: Index on `conversationId` + `timestamp` works efficiently
4. **Scalable**: Can partition by conversation without breaking security

## Scalability Strategies

### Strategy 1: Time-Based Partitioning (Recommended for Most Apps)

**Structure:**
```
/messages-2024-11/{messageId}
/messages-2024-12/{messageId}
/messages-2025-01/{messageId}
```

**Pros:**
- ✅ Automatic archiving by month
- ✅ Easy to implement
- ✅ Clear data lifecycle
- ✅ Can delete old partitions

**Cons:**
- ❌ Need to query multiple collections for history
- ❌ Requires client-side logic to pick partition

**Implementation:**
```javascript
// Write to current month's partition
const partition = `messages-${new Date().toISOString().slice(0, 7)}`;
await addDoc(collection(db, partition), messageData);

// Query recent messages (current month)
const q = query(
  collection(db, partition),
  where('conversationId', '==', convId),
  orderBy('timestamp', 'desc'),
  limit(50)
);
```

**When to use:** 
- Message history older than 6 months rarely accessed
- Want automatic archiving
- Acceptable to load history from multiple partitions

---

### Strategy 2: Subcollections (Best for Isolation)

**Structure:**
```
/conversations/{convId}/messages/{messageId}
/conversations/{convId}/messages/{messageId}
```

**Pros:**
- ✅ Perfect isolation per conversation
- ✅ Easy to delete entire conversation
- ✅ Cleaner data model
- ✅ Each conversation can scale independently

**Cons:**
- ❌ Can't query across conversations easily
- ❌ Need conversation ID to access messages
- ❌ Harder to implement "all messages" queries

**Implementation:**
```javascript
// Write message
await addDoc(
  collection(db, 'conversations', convId, 'messages'),
  messageData
);

// Query messages for a conversation
const q = query(
  collection(db, 'conversations', convId, 'messages'),
  orderBy('timestamp', 'desc'),
  limit(50)
);
```

**When to use:**
- Conversations are independent
- Don't need cross-conversation queries
- Want strong isolation between chats

---

### Strategy 3: Hybrid (Subcollections + Partitioning)

**Structure:**
```
/conversations/{convId}/messages-2024-11/{messageId}
/conversations/{convId}/messages-2024-12/{messageId}
```

**Pros:**
- ✅ Best of both worlds
- ✅ Perfect isolation + automatic archiving
- ✅ Can delete old messages per conversation

**Cons:**
- ❌ Most complex to implement
- ❌ Need to manage both conversation and partition

**When to use:**
- Very high message volume per conversation
- Need both isolation and archiving
- Enterprise scale

---

### Strategy 4: Current Approach + Sharding (Keep Single Collection)

**Structure:**
```
/messages-shard-0/{messageId}  // conversationId hash % 10 == 0
/messages-shard-1/{messageId}  // conversationId hash % 10 == 1
...
/messages-shard-9/{messageId}  // conversationId hash % 10 == 9
```

**Pros:**
- ✅ Simple to implement
- ✅ Distributes load across shards
- ✅ Still works with current queries
- ✅ Can add more shards later

**Cons:**
- ❌ Need to calculate shard on every query
- ❌ All shards grow over time
- ❌ Doesn't help with old message archiving

**Implementation:**
```javascript
// Calculate shard
function getShardForConversation(convId) {
  const hash = convId.split('').reduce((acc, char) => 
    acc + char.charCodeAt(0), 0
  );
  return hash % 10;
}

// Write message
const shard = getShardForConversation(convId);
await addDoc(collection(db, `messages-shard-${shard}`), messageData);

// Query messages
const shard = getShardForConversation(convId);
const q = query(
  collection(db, `messages-shard-${shard}`),
  where('conversationId', '==', convId),
  orderBy('timestamp', 'desc'),
  limit(50)
);
```

**When to use:**
- Want minimal code changes
- Need to distribute load NOW
- Plan to migrate to better strategy later

---

## Recommended Strategy: Subcollections

**Why:**
1. Best matches SeraVault's security model (conversations → participants → messages)
2. Clean data model with strong isolation
3. Easy to implement group chats
4. Natural fit with end-to-end encryption (each conversation has its own encryption context)
5. Firestore handles scaling within subcollections well

**Migration Path:**
1. Update Firestore rules to allow subcollections
2. Update client code to write to subcollections
3. Create Cloud Function to migrate existing messages
4. Update indexes for subcollections

## Updated Firestore Rules for Subcollections

```javascript
// Conversations - participants have access
match /conversations/{conversationId} {
  allow read: if request.auth != null &&
    request.auth.uid in resource.data.participants;
    
  // Subcollection: messages
  match /messages/{messageId} {
    function isParticipant() {
      return request.auth.uid in get(/databases/$(database)/documents/conversations/$(conversationId)).data.participants;
    }
    
    // Read/List: participants only
    allow read, list: if request.auth != null && isParticipant();
    
    // Create: sender must be participant
    allow create: if request.auth != null &&
      request.resource.data.senderId == request.auth.uid &&
      isParticipant();
      
    // Update/Delete: sender only
    allow update, delete: if request.auth != null &&
      request.auth.uid == resource.data.senderId &&
      isParticipant();
  }
}
```

## Message Data Structure

### Current (Updated):
```javascript
{
  id: "message-id",
  conversationId: "conv-id",
  senderId: "user-id",
  participants: ["user-1", "user-2"],  // NEW: Denormalized for security
  encryptedContent: {
    ciphertext: "...",
    nonce: "...",
    senderPublicKey: "..."
  },
  type: "text" | "file" | "system",
  timestamp: Timestamp,
  readBy: {
    "user-1": Timestamp,
    "user-2": Timestamp
  },
  // Optional
  editedAt: Timestamp,
  deleted: boolean,
  replyTo: "message-id"
}
```

### With Subcollections (Recommended):
```javascript
// /conversations/{convId}/messages/{messageId}
{
  id: "message-id",
  // conversationId NOT NEEDED (implicit from path)
  // participants NOT NEEDED (inherited from parent conversation)
  senderId: "user-id",
  encryptedContent: {
    ciphertext: "...",
    nonce: "...",
    senderPublicKey: "..."
  },
  type: "text" | "file" | "system",
  timestamp: Timestamp,
  readBy: {
    "user-1": Timestamp,
    "user-2": Timestamp
  }
}
```

## Performance Considerations

### Single Collection (Current)
- **✅ Good for**: < 1M total messages
- **✅ Good for**: Cross-conversation search
- **❌ Bad for**: > 10M messages (slow queries)
- **❌ Bad for**: Very active chats (hotspots)

### Subcollections (Recommended)
- **✅ Good for**: Unlimited messages (scales per conversation)
- **✅ Good for**: Privacy/isolation
- **✅ Good for**: Deletion (delete conversation = delete all messages)
- **❌ Bad for**: Cross-conversation queries (rare in chat apps)

### Time-Based Partitions
- **✅ Good for**: Archiving old messages
- **✅ Good for**: Deleting old data
- **❌ Bad for**: Accessing old messages (multiple queries)

## Indexes Needed

### Current Approach (Single Collection):
```json
{
  "collectionGroup": "messages",
  "fields": [
    {"fieldPath": "conversationId", "order": "ASCENDING"},
    {"fieldPath": "timestamp", "order": "DESCENDING"}
  ]
}
```

### Subcollection Approach:
```json
{
  "collectionGroup": "messages",
  "fields": [
    {"fieldPath": "timestamp", "order": "DESCENDING"}
  ]
}
```
Note: Simpler index because conversationId is implicit in subcollection path

## Migration Script

If you want to migrate to subcollections:

```javascript
// Run this as a Cloud Function or Admin SDK script
async function migrateToSubcollections() {
  const messagesSnapshot = await db.collection('messages').get();
  
  const batch = db.batch();
  let count = 0;
  
  for (const doc of messagesSnapshot.docs) {
    const data = doc.data();
    const newRef = db
      .collection('conversations')
      .doc(data.conversationId)
      .collection('messages')
      .doc(doc.id);
    
    // Remove conversationId and participants (inherited from parent)
    const { conversationId, participants, ...newData } = data;
    
    batch.set(newRef, newData);
    count++;
    
    // Firestore batch limit is 500
    if (count % 500 === 0) {
      await batch.commit();
      batch = db.batch();
    }
  }
  
  if (count % 500 !== 0) {
    await batch.commit();
  }
  
  console.log(`Migrated ${count} messages to subcollections`);
}
```

## Recommendations

### For Current Scale (< 100K messages):
1. ✅ Deploy the updated Firestore rules (denormalized participants)
2. ✅ Deploy the updated indexes (both ASC and DESC)
3. ✅ Update client code to include `participants` array in new messages
4. ⏸️ Keep single collection for now

### For Future Scale (> 1M messages):
1. Migrate to subcollections
2. Update Firestore rules for subcollection security
3. Update client code to query subcollections
4. Optionally add time-based archiving

### For Enterprise Scale (> 10M messages):
1. Use subcollections + time-based partitioning
2. Implement message archiving to Cloud Storage
3. Add pagination with cursor-based queries
4. Consider caching layer (Redis/Memcached)
