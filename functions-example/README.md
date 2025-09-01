# Firebase Functions for Admin Claims

This directory contains Firebase Functions to securely manage admin claims.

## Setup Instructions

### 1. Initialize Firebase Functions

If you haven't already initialized Firebase Functions in your project:

```bash
# From your project root
firebase init functions

# Choose JavaScript or TypeScript
# Choose to install dependencies
```

### 2. Install Dependencies

```bash
cd functions
npm install firebase-functions firebase-admin
```

### 3. Copy the Function

Copy the contents of `set-admin-claim.js` to your `functions/index.js` file (or create a separate file and require it).

### 4. Update Bootstrap Admin Email

In the function, change this line:
```javascript
const BOOTSTRAP_ADMIN_EMAIL = 'your-email@example.com'; // Change this!
```

Replace `'your-email@example.com'` with your actual email address. This allows the first admin to be created.

### 5. Deploy the Functions

```bash
# From project root
firebase deploy --only functions
```

### 6. Set First Admin

1. Go to your app at `/admin`
2. Enter your email address (the one you set as BOOTSTRAP_ADMIN_EMAIL)
3. Click "Set Admin Claim"
4. Log out and log back in

### 7. Remove Bootstrap Access (Optional)

After you've set yourself as admin, you can remove or comment out the bootstrap admin logic in the function for security.

## Security Notes

- **Bootstrap Admin**: Only the email specified in `BOOTSTRAP_ADMIN_EMAIL` can set the first admin claim
- **Admin Only**: After the first admin, only existing admins can promote other users
- **Self-Protection**: Admins cannot remove their own admin status
- **Audit Trail**: The function logs who promoted/removed admin status and when

## Usage

### Set Admin Claim
```javascript
const setAdminClaim = httpsCallable(functions, 'setAdminClaim');
const result = await setAdminClaim({ email: 'user@example.com' });
```

### Remove Admin Claim
```javascript
const removeAdminClaim = httpsCallable(functions, 'removeAdminClaim');
const result = await removeAdminClaim({ email: 'user@example.com' });
```

## Alternative: Manual Script

If you prefer not to use Firebase Functions, you can use the manual script approach:

1. Install Firebase Admin SDK locally:
   ```bash
   npm install firebase-admin
   ```

2. Download your service account key from Firebase Console

3. Create and run the script as shown in the admin panel instructions

## Cleanup

Remember to remove the `/admin` route and AdminPanel component before deploying to production!