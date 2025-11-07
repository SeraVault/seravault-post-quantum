# Account Deletion Implementation

## Overview
Implemented secure server-side account deletion using Firebase Cloud Functions to ensure complete data removal with proper authorization.

## Architecture

### Server-Side Implementation (Cloud Function)
**Location:** `functions/src/index.ts`

**Function Name:** `deleteUserAccount`
**Type:** Callable Cloud Function (HTTPS)
**Authentication:** Required - user must be authenticated

### What Gets Deleted

The Cloud Function performs comprehensive data deletion in the following order:

1. **Storage Files** - All user files in Firebase Storage (`users/{userId}/`)
2. **File Records** - All file documents where `ownerId === userId`
3. **Folders** - All folder documents where `ownerId === userId`
4. **Contacts** - All contact documents where `userId === userId`
5. **Contact Requests** - Both sent and received contact requests
6. **Groups** - All groups where `ownerId === userId`
7. **Notifications** - All notifications where `recipientId === userId`
8. **Conversations** - All conversations where user is in `participants` array
9. **Shared Files Cleanup** - Removes user from `sharedWith` arrays in all files
10. **FCM Tokens** - All push notification tokens in subcollection
11. **User Profile** - The user's profile document
12. **Firebase Auth** - The authentication account

### Client-Side Integration
**Location:** `src/pages/ProfilePage.tsx`

The profile page now includes:
- "Danger Zone" section with red-bordered warning
- "Delete Account" button
- Confirmation dialog requiring:
  - Checkbox acknowledgment
  - Typing "DELETE" to confirm
- Progress indicator during deletion
- Automatic redirect to login after successful deletion

### Security Features

1. **Authentication Required** - Function checks `request.auth` and rejects unauthenticated requests
2. **Server-Side Execution** - All deletion logic runs with Firebase Admin privileges
3. **Comprehensive Cleanup** - Removes user from shared resources to prevent orphaned references
4. **Error Handling** - Individual deletion steps are wrapped in try-catch to continue on partial failures
5. **Logging** - Detailed console logs for debugging and audit trails

### CORS Configuration

The Cloud Function is configured to accept requests from:
- `http://localhost:5173` (dev)
- `http://localhost:3000` (dev)
- `https://seravault-8c764.web.app` (prod)
- `https://seravault-8c764.firebaseapp.com` (prod)

## API Response

The function returns:
```typescript
{
  success: true,
  message: 'Account successfully deleted',
  results: {
    storageFiles: number,
    fileRecords: number,
    folders: number,
    contacts: number,
    contactRequests: number,
    groups: number,
    notifications: number,
    conversations: number,
    sharedFilesCleaned: number,
    profile: boolean,
    auth: boolean
  }
}
```

## Deployment

```bash
# Deploy only the account deletion function
firebase deploy --only functions:deleteUserAccount

# Or deploy all functions
firebase deploy --only functions

# Deploy hosting with updated UI
firebase deploy --only hosting
```

## Usage

Users can delete their account from the Profile page:
1. Navigate to Profile
2. Scroll to "Danger Zone" section
3. Click "Delete Account"
4. Check the confirmation box
5. Type "DELETE" in the text field
6. Click "Confirm Delete"
7. Wait for deletion to complete
8. Automatic redirect to login page

## Error Handling

- If authentication fails: `unauthenticated` error
- If deletion fails: `internal` error with details
- Individual step failures are logged but don't stop the process
- If final auth deletion fails, the entire operation fails

## Security Considerations

- **No client-side deletion** - All operations run server-side with Admin SDK
- **Transaction safety** - Uses batched writes where possible
- **Audit trail** - Console logging for all operations
- **No cascade failures** - Individual deletions wrapped in try-catch
- **Authorization** - Function verifies user identity before deletion

## Future Enhancements

Possible improvements:
1. Add soft delete with grace period
2. Send confirmation email before deletion
3. Export user data before deletion
4. More granular progress reporting
5. Schedule deletion for background processing
6. Add deletion analytics/metrics
