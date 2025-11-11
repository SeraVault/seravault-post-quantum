# Sent Invitations Feature

## Overview

Added a new feature to track and manage user invitations sent to non-registered users. Users can now see pending invitations, resend them, or cancel them.

## New Features

### 1. Sent Invitations Tab

A new tab in the Contact Manager displays all sent invitations with:

- **Status badges** (Pending, Accepted, Declined, Expired)
- **Invitation details** (Email, message, sent date)
- **Actions** for pending invitations:
  - **Resend** - Sends a new email and extends expiry by 30 days
  - **Cancel** - Deletes the invitation

### 2. Service Methods

Added to `ContactService`:

**`getSentInvitations(userId: string)`**
- Fetches all invitations sent by the user
- Returns array ordered by creation date (newest first)

**`cancelInvitation(invitationId: string)`**
- Deletes a pending invitation
- Only works for invitations with status 'pending'

**`resendInvitation(invitationId: string)`**
- Updates the invitation timestamp
- Extends expiry date by 30 days
- Triggers new email via Cloud Function (automatically via Firestore trigger)

### 3. UI Updates

#### Contact Manager Tabs:
1. Contacts - Existing contacts list
2. Requests - Incoming contact requests
3. **Invitations (NEW)** - Sent invitations to non-users
4. Groups - Contact groups

#### Invitations Tab UI:
- Empty state when no invitations sent
- List of invitations with:
  - Avatar icon (warning for pending, grey for accepted/declined)
  - Recipient email
  - Status chip (color-coded)
  - Sent date
  - Optional message preview
  - Action buttons (resend/cancel) for pending invitations

## Technical Implementation

### Backend Changes

**`src/services/contactService.ts`:**
```typescript
// New methods added
static async getSentInvitations(userId: string): Promise<UserInvitation[]>
static async cancelInvitation(invitationId: string): Promise<void>
static async resendInvitation(invitationId: string): Promise<void>
```

### Frontend Changes

**`src/components/ContactManager.tsx`:**
- Added `sentInvitations` state
- Added tab index 2 for "Invitations"
- Implemented invitation management handlers
- Added real-time updates for invitation list

### Firestore Structure

Invitations are stored in the `userInvitations` collection:

```typescript
{
  id: string; // Document ID
  fromUserId: string; // Sender's user ID
  fromUserEmail: string;
  fromUserDisplayName: string;
  toEmail: string; // Recipient email (not yet registered)
  message?: string; // Optional personal message
  status: 'pending' | 'accepted' | 'declined' | 'expired';
  createdAt: FieldValue; // Timestamp
  expiresAt: FieldValue; // 30 days from creation
  triggerEvent?: {
    type: 'file_share_attempt';
    fileId: string;
    fileName?: string;
  };
}
```

## User Workflows

### Viewing Sent Invitations

1. User goes to Contacts page
2. Clicks "Invitations" tab
3. Sees list of all sent invitations with status

### Resending an Invitation

1. User finds pending invitation in list
2. Clicks resend icon (envelope)
3. System updates timestamp and extends expiry
4. Cloud Function automatically sends new email
5. List updates to show new send date

### Canceling an Invitation

1. User finds pending invitation in list
2. Clicks cancel icon (X)
3. Confirmation prompt (future enhancement)
4. Invitation is deleted
5. Removed from list

## Benefits

- ✅ **Visibility** - Users can see who they've invited
- ✅ **Management** - Cancel unwanted invitations
- ✅ **Follow-up** - Resend to people who haven't responded
- ✅ **Status tracking** - Know if invitations were accepted/expired
- ✅ **Prevents duplicates** - See existing invitations before sending new ones

## Future Enhancements

Consider adding:
- Confirmation dialog before canceling invitation
- Bulk actions (cancel multiple, resend multiple)
- Search/filter invitations by email or status
- Invitation analytics (open rate, acceptance rate)
- Custom expiry periods
- Reminder emails (automatic after X days)
