# Firebase Setup Instructions

## Firestore Permission Denied Error Fix

I've created the necessary Firebase configuration files to fix the "permission denied" error you're experiencing. Follow these steps to deploy the security rules:

## 1. Authenticate with Firebase CLI

```bash
firebase login
```

## 2. Initialize Firebase Project (if not already done)

```bash
firebase init
```

Select:
- Firestore
- Hosting (optional)
- Storage

Choose your existing project: `seravault-8c764`

## 3. Deploy Firestore Security Rules

```bash
firebase deploy --only firestore:rules
```

## 4. Deploy Storage Security Rules

```bash
firebase deploy --only storage
```

## 5. Deploy Firestore Indexes (if needed)

```bash
firebase deploy --only firestore:indexes
```

## Security Rules Explanation

### Firestore Rules (`firestore.rules`):
- **Users**: Can only read/write their own profile
- **Folders**: Can only access folders they own
- **Files**: Can read files they own or files shared with them; can only write/create files they own

### Storage Rules (`storage.rules`):
- **Files**: Only file owners can upload, read, and delete their files under `/files/{userId}/`

## Indexes Created

The following indexes have been configured for optimal query performance:
- Folders by owner and parent
- Files by owner and parent
- Files by sharedWith array and parent

## Alternative: Manual Setup via Firebase Console

If CLI deployment doesn't work, you can manually copy the rules:

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select your project: `seravault-8c764`
3. Go to Firestore Database → Rules
4. Copy the contents of `firestore.rules` and publish
5. Go to Storage → Rules
6. Copy the contents of `storage.rules` and publish

## Testing the Fix

After deploying the rules, the permission denied errors should be resolved and users will be able to:
- Create their user profiles
- Create folders and files
- Share files with other users
- Access only their own data and shared content

The error you saw (`Missing or insufficient permissions`) should no longer appear.