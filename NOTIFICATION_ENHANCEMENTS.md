# Native Push Notification Enhancements

## Overview
This document describes the native push notification enhancements added to SeraVault, expanding beyond chat messages to include contact requests and user invitations.

## Changes Made

### 1. Backend (Cloud Functions)

#### Updated `functions/src/index.ts`:

**Added notification types:**
- Added `user_invitation` to the `NotificationData` type
- Added `invitationId` field to notification metadata

**Enhanced `onContactRequest` trigger:**
- Now sends **FCM push notifications** in addition to in-app notifications
- Sends to all user's devices when they receive a contact request
- Includes automatic cleanup of invalid FCM tokens
- Respects user's contact notification preferences

**Enhanced `onUserInvitationCreated` trigger:**
- Checks if invited user already has an account
- If user exists:
  - Creates in-app notification
  - Sends FCM push notification to all their devices
  - Includes invitation link in notification data
- If user doesn't exist:
  - Only sends email (as before)
- Automatically cleans up invalid FCM tokens

**Chat message notifications:**
- Already implemented with check for open chat
- Only sends notifications when chat is NOT currently open in the app

### 2. Frontend

#### Updated `src/services/notificationService.ts`:
- Added `user_invitation` to Notification type
- Added `invitationId` field to notification interface

#### Updated `src/components/NotificationCenter.tsx`:
- Added handling for `user_invitation` notification clicks (navigates to contacts)
- Added icon for `user_invitation` notifications (PersonAdd with secondary color)
- Added handling for `chat_message` notification clicks (opens specific chat)

#### Updated `src/components/NotificationBell.tsx`:
- Added handling for `user_invitation` notification clicks
- Improved notification routing logic

### 3. Documentation

#### Updated `FCM_SETUP.md`:
- Added comprehensive list of notification types
- Added note about respecting user context (not sending if already viewing)
- Enhanced future enhancements section

## Notification Behavior

### Contact Requests
- **Trigger**: When a contact request document is created in `contactRequests/{requestId}`
- **In-app**: Creates notification in Firestore
- **Push**: Sends native browser notification to all user's devices
- **Click**: Opens contacts page with requests tab
- **Respects**: User's contact notification preferences

### User Invitations
- **Trigger**: When a user invitation is created in `userInvitations/{invitationId}`
- **Email**: Always sends invitation email to target address
- **If target is existing user**:
  - Creates in-app notification
  - Sends FCM push notification to all their devices
  - Includes invite link in notification data
- **If target is new user**: Email only (they'll sign up via link)
- **Click**: Opens contacts page

### Chat Messages
- **Trigger**: When a message is added to `files/{chatId}/messages/{messageId}`
- **Smart filtering**: Only notifies if chat is NOT currently open
- **Cleanup**: Removes previous unread notifications from same conversation
- **In-app**: Creates notification in Firestore
- **Push**: Sends native browser notification
- **Click**: Opens the specific chat conversation

## Testing

### Test Contact Request Notifications
1. User A sends contact request to User B
2. User B should receive:
   - In-app notification (bell icon badge)
   - Native browser notification (if app closed/minimized)
3. Click notification → Opens contacts page with requests tab

### Test User Invitation Notifications
1. **Scenario 1: Inviting existing user**
   - User A invites User B (who already has account)
   - User B receives:
     - Email with invitation link
     - In-app notification
     - Native browser notification (if app closed/minimized)
   - Click notification → Opens contacts page

2. **Scenario 2: Inviting new user**
   - User A invites new@email.com (no account)
   - New user receives:
     - Email with signup link only
   - After signup, new user can connect with User A

### Test Chat Message Notifications
1. User A and User B in a conversation
2. User A sends message
3. **If User B has chat open**: No notification
4. **If User B doesn't have chat open**: 
   - In-app notification
   - Native browser notification
5. Click notification → Opens the specific chat

## Security & Privacy

- FCM tokens stored per-user in Firestore (`users/{userId}/fcmTokens/{tokenId}`)
- Automatic cleanup of invalid/expired tokens
- Notification content does not include sensitive data
- Only participants receive notifications
- Respects user preferences
- Smart filtering prevents notification spam

## Browser Compatibility

| Browser | Desktop | Mobile (PWA) | Notifications |
|---------|---------|--------------|---------------|
| Chrome  | ✅      | ✅ (Android) | ✅            |
| Firefox | ✅      | ❌           | ✅            |
| Safari  | ✅      | ✅ (iOS 16.4+)| ✅           |
| Edge    | ✅      | ✅ (Android) | ✅            |

## Deployment

```bash
# 1. Deploy Cloud Functions with new notification logic
firebase deploy --only functions:onContactRequest,functions:onUserInvitationCreated

# 2. Build and deploy frontend with updated notification handling
npm run build
firebase deploy --only hosting:app

# 3. Verify Firestore rules allow fcmTokens subcollection (already in place)
firebase deploy --only firestore:rules
```

## Next Steps

Consider adding:
- Notification preferences UI (enable/disable specific types)
- Rich notifications with action buttons
- Notification history retention policies
- Analytics for notification engagement
