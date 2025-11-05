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

- **Current**: `files/{chatId}` with `fileType: 'chat'`
- **Messages**: `files/{chatId}/messages/{messageId}`

Chats are fully integrated into the files collection, with no separate conversations collection.

### 3. Service Layer (`src/services/chatService.ts`)

All chat operations updated to use the files collection:

- `createConversation()` - Creates chat file in files collection
- `getConversations()` - Queries files where fileType='chat'
- `subscribeToConversations()` - Real-time updates from files collection
- All message operations use `files/{id}/messages` path

### 4. Security Rules (`firestore.rules`)

- Chat file validation in files create rules
- Messages subcollection rules under `files/{fileId}/messages`
- Validates that for chat files, `sharedWith` matches `participants`
- All chat security handled through unified files collection rules

### 5. Firestore Indexes (`firestore.indexes.json`)

Composite index for querying chat files:

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

**Note**: The old `conversations` collection index has been removed.

## Benefits

1. **Unified File Management**: Chats can be organized in folders like any other file
2. **Consistent Permissions**: Uses the same `userFolders`, `userTags`, `userFavorites` system
3. **Folder Organization**: Each user can independently organize chats in their own folders
4. **Search Integration**: Chats appear in file search results
5. **Tagging**: Users can tag chats for better organization
6. **Real-time Updates**: Dual subscription system (owned + shared) with debounce ensures immediate display

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

**Migration Complete** - The old `conversations` collection has been fully deprecated and removed:
- All new chats created in `files` collection
- Security rules for `conversations` collection removed
- Firestore index for `conversations` collection removed
- All chat functionality now uses unified `files` collection architecture

## Implementation Status

✅ **Completed Features**:

1. File table displays chat files with chat icon
2. FileViewer opens ChatPage when clicking chat file
3. Folder operations (move, organize) work for chat files
4. Chat filter available in file manager
5. Per-user folder organization via `userFolders` map
6. Real-time subscription system with 50ms debounce to prevent race conditions
7. Full security rules integration
8. All deprecated code removed and deployed
