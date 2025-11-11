# Firebase Cloud Messaging (Push Notifications) Setup Guide

This guide explains how to enable native push notifications for SeraVault using Firebase Cloud Messaging (FCM).

## Overview

SeraVault now supports native push notifications that work:
- ✅ On desktop browsers (Chrome, Firefox, Edge, Safari)
- ✅ On Android when installed as PWA
- ✅ On iOS when installed as PWA (iOS 16.4+)
- ✅ Even when the app is closed or in the background

## Setup Steps

### 1. Generate VAPID Key

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Go to **Project Settings** (gear icon) > **Cloud Messaging** tab
4. Scroll to **Web Push certificates** section
5. Click **Generate key pair**
6. Copy the generated key

### 2. Add VAPID Key to Environment Variables

Add the VAPID key to your `.env` file:

```bash
VITE_FIREBASE_VAPID_KEY=YOUR_GENERATED_VAPID_KEY_HERE
```

**Important:** Add this to both:
- `.env` (for local development)
- Your hosting environment variables (for production)

### 3. Update Service Worker Configuration

Open `public/firebase-messaging-sw.js` and replace the placeholder Firebase config with your actual values:

```javascript
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};
```

You can find these values in your Firebase project settings.

### 4. Deploy Firestore Security Rules

Deploy the updated Firestore rules that include FCM token storage:

```bash
firebase deploy --only firestore:rules
```

### 5. Deploy Cloud Functions

Deploy the updated Cloud Function that sends FCM messages:

```bash
firebase deploy --only functions
```

Or deploy everything:

```bash
npm run deploy
```

### 6. Build and Deploy the App

```bash
npm run build
firebase deploy --only hosting:app
```

## How It Works

### Architecture

1. **User Login**: When a user logs in, the app requests notification permission
2. **Token Generation**: FCM generates a unique token for the device
3. **Token Storage**: Token is saved to Firestore at `users/{userId}/fcmTokens/{tokenId}`
4. **Message Trigger**: When a chat message is created, the Cloud Function triggers
5. **Token Retrieval**: Function gets all FCM tokens for the recipient
6. **Push Notification**: FCM sends push notification to all user's devices
7. **Notification Click**: Clicking notification opens app to the specific chat

### Files Modified/Created

- **`src/services/fcmService.ts`** - FCM service for token management
- **`public/firebase-messaging-sw.js`** - Service worker for background notifications
- **`src/components/NotificationSettings.tsx`** - UI component for notification settings
- **`src/auth/AuthContext.tsx`** - Initialize FCM on user login
- **`functions/src/index.ts`** - Updated Cloud Function to send FCM messages
- **`firestore.rules`** - Added rules for fcmTokens subcollection

### User Experience

1. User goes to Security page
2. Sees "Push Notifications" card
3. Toggles notifications on
4. Browser asks for permission
5. Once granted, user receives push notifications for:
   - New chat messages (when chat is not open)
   - Only from conversations they're part of
   - Previous unread notifications are removed to avoid spam

### Notification Behavior

- **Foreground** (app open): Shows in-app notification
- **Background** (app minimized): Shows browser notification
- **Closed** (app not running): Shows browser notification
- **Click**: Opens app and navigates to the specific chat

## Testing

### Test Push Notifications

1. Open SeraVault in one browser (User A)
2. Open SeraVault in another browser/incognito (User B)
3. Enable notifications for both users
4. Close the tab for User B
5. Send a chat message from User A to User B
6. User B should receive a browser notification

### Verify Token Storage

Check Firestore console:
```
users/{userId}/fcmTokens/{tokenId}
```

Should contain:
- `token`: FCM token string
- `createdAt`: Timestamp
- `lastUsed`: Timestamp

### Check Cloud Function Logs

```bash
firebase functions:log --only onChatMessageCreated
```

Look for:
- `📱 Sent FCM to X/Y devices`
- `📵 No FCM tokens found` (if user hasn't enabled notifications)
- `❌ Error sending FCM` (if there are issues)

## Troubleshooting

### Notifications Not Received

1. **Check browser permission**: Ensure notifications are allowed in browser settings
2. **Check VAPID key**: Verify it's correctly set in `.env`
3. **Check token storage**: Verify tokens exist in Firestore
4. **Check Cloud Function logs**: Look for errors
5. **Try re-enabling**: Toggle notifications off and on again

### Service Worker Not Updating

1. Close all tabs with the app
2. Clear service worker:
   - Chrome: DevTools > Application > Service Workers > Unregister
   - Firefox: about:serviceworkers > Unregister
3. Hard refresh (Ctrl+Shift+R)

### Invalid Token Errors

The Cloud Function automatically cleans up invalid tokens. If you see these errors, they're expected when:
- User clears browser data
- User switches browsers
- Token expires (rare)

## Security Notes

- FCM tokens are stored per-user in Firestore
- Tokens are automatically cleaned up when invalid
- Users can disable notifications anytime
- Notification content does not include sensitive message data
- Only chat participants receive notifications

## Browser Support

| Browser | Desktop | Mobile (PWA) |
|---------|---------|--------------|
| Chrome  | ✅      | ✅ (Android) |
| Firefox | ✅      | ❌           |
| Safari  | ✅      | ✅ (iOS 16.4+)|
| Edge    | ✅      | ✅ (Android) |

## Limitations

- iOS Safari requires the app to be installed as PWA (Add to Home Screen)
- Service worker requires HTTPS (works on localhost for dev)
- Some browsers may have different notification UI
- Battery optimization on mobile may delay notifications

## Future Enhancements

Possible improvements:
- Notification preferences (per-chat, DND hours, etc.)
- Rich notifications with message preview (with encryption considerations)
- Notification grouping for multiple messages
- Badge count on app icon
- Vibration patterns
- Custom notification sounds
- Notification action buttons (reply, dismiss, etc.)

## Notification Types

SeraVault sends native push notifications for:

- **Chat Messages** (`chat_message`) - New messages in conversations (only when chat is not already open)
- **Contact Requests** (`contact_request`) - When someone wants to connect with you
- **Contact Accepted** (`contact_accepted`) - When someone accepts your contact request
- **User Invitations** (`user_invitation`) - When someone invites you to join SeraVault (if you already have an account)
- **File Sharing** - File shared, modified, or unshared notifications (in-app only currently)

All notifications respect user preferences and only send when the relevant content is not already being viewed.

## Resources

- [Firebase Cloud Messaging Docs](https://firebase.google.com/docs/cloud-messaging)
- [Web Push Notifications Guide](https://web.dev/push-notifications-overview/)
- [Service Worker API](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)
