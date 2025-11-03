# Chat as Files Architecture

## Overview

Chat conversations are now stored in the `files` collection with `fileType: 'chat'`, allowing them to be organized in folders alongside regular files.

## Key Changes

### 1. Data Model (`src/types/chat.ts`)

The `Conversation` interface now includes all FileData fields:

```typescript
export interface Conversation {
  // File system fields
  fileType: 'chat';
  owner: string;
  name: string | { ciphertext: string; nonce: string };
  userFolders?: { [uid: string]: string | null };
  userNames?: { [uid: string]: { ciphertext: string; nonce: string } };
  createdAt: FieldValue | Date;
  lastModified?: Date | string;
  size: string | { ciphertext: string; nonce: string };
  storagePath?: string;
  encryptedKeys: { [uid: string]: string };
  sharedWith: string[];
  userFavorites?: { [uid: string]: boolean };
  userTags?: { [uid: string]: { ciphertext: string; nonce: string } };
  
  // Chat-specific fields
  type: 'individual' | 'group';
  participants: string[];
  // ... other chat fields
}
```

### 2. Storage Location

- **Before**: `conversations/{conversationId}`
- **After**: `files/{conversationId}` with `fileType: 'chat'`

- **Messages Before**: `conversations/{conversationId}/messages/{messageId}`
- **Messages After**: `files/{conversationId}/messages/{messageId}`

### 3. Service Layer (`src/services/chatService.ts`)

All chat operations updated to use the files collection:

- `createConversation()` - Creates chat file in files collection
- `getConversations()` - Queries files where fileType='chat'
- `subscribeToConversations()` - Real-time updates from files collection
- All message operations use `files/{id}/messages` path

### 4. Security Rules (`firestore.rules`)

- Added chat file validation in files create rules
- Added messages subcollection rules under files
- Validates that for chat files, `sharedWith` matches `participants`

### 5. Firestore Indexes (`firestore.indexes.json`)

Added composite index for querying chat files:

```json
{
  "collectionGroup": "files",
  "fields": [
    { "fieldPath": "fileType", "order": "ASCENDING" },
    { "fieldPath": "participants", "arrayConfig": "CONTAINS" },
    { "fieldPath": "lastMessageAt", "order": "DESCENDING" }
  ]
}
```

## Benefits

1. **Unified File Management**: Chats can be organized in folders like any other file
2. **Consistent Permissions**: Uses the same userFolders, userTags, userFavorites system
3. **Folder Organization**: Users can move chats into project folders, organize by topic, etc.
4. **Search Integration**: Chats appear in file search results
5. **Tagging**: Users can tag chats for better organization

## Usage

### Creating a Chat

Chats are created automatically with encrypted names:

```typescript
const conversationId = await ChatService.createConversation(
  currentUserId,
  [otherUserId],
  'individual',
  userPrivateKey
);
```

### Organizing Chats in Folders

Chats can be moved to folders using the same API as regular files:

```typescript
// Move chat to a folder
await updateFile(chatFileId, {
  userFolders: {
    [currentUserId]: folderId
  }
});
```

### Querying Chats

```typescript
// Get all chat files for current user
const chatsQuery = query(
  collection(db, 'files'),
  where('fileType', '==', 'chat'),
  where('participants', 'array-contains', currentUserId),
  orderBy('lastMessageAt', 'desc')
);
```

## Migration Notes

- Old conversations in `conversations` collection still work (backward compatible)
- New conversations are created in `files` collection
- Both storage paths are supported for messages
- Firestore rules support both `conversations` and `files` paths

## Next Steps

To fully integrate chat-as-files into the UI:

1. Update file table to display chat files with chat icon
2. Update FileViewer to open ChatPage when clicking chat file
3. Enable folder operations (move, copy) for chat files
4. Add chat filter to file manager
