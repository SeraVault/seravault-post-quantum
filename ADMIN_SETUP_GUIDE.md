# Quick Admin Setup Guide

## Current Issue: CORS/Functions Not Found

The CORS error indicates that Firebase Functions aren't deployed yet. Here's how to fix it:

## Option 1: Deploy Firebase Functions (Recommended)

### 1. Initialize Firebase Functions

```bash
# From your project root directory
firebase init functions

# Select:
# - Use existing project (seravault-8c764)
# - JavaScript or TypeScript (your choice)
# - Install dependencies: Yes
```

### 2. Add the Admin Function

Copy the contents from `functions-example/set-admin-claim.js` to your `functions/index.js`:

```bash
# Copy the function code
cp functions-example/set-admin-claim.js functions/index.js

# Or manually copy and paste the contents
```

### 3. Update Bootstrap Email

Edit `functions/index.js` and change:
```javascript
const BOOTSTRAP_ADMIN_EMAIL = 'your-email@example.com'; // Change this!
```

Replace with your actual email address.

### 4. Install Dependencies

```bash
cd functions
npm install firebase-functions firebase-admin
cd ..
```

### 5. Deploy the Function

```bash
firebase deploy --only functions
```

### 6. Test the Admin Panel

1. Go to `http://localhost:5176/admin`
2. Enter your email (the bootstrap admin email)
3. Click "Set Admin Claim"
4. Log out and back in to see admin features

## Option 2: Use Manual Script (Quick Alternative)

If you don't want to set up Firebase Functions right now:

### 1. Install Firebase Admin SDK

```bash
npm install firebase-admin
```

### 2. Get Service Account Key

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project (seravault-8c764)
3. Go to Project Settings > Service Accounts
4. Click "Generate new private key"
5. Save the JSON file as `service-account-key.json` in your project root

### 3. Create Admin Script

Create `set-admin-script.js` in your project root:

```javascript
const admin = require('firebase-admin');
const serviceAccount = require('./service-account-key.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

async function setAdminClaim(email) {
  try {
    const user = await admin.auth().getUserByEmail(email);
    await admin.auth().setCustomUserClaims(user.uid, { admin: true });
    console.log(`✅ Successfully set admin claim for ${email}`);
    console.log('User needs to log out and back in to see changes.');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

// Replace with your email
const EMAIL = 'your-email@example.com';
setAdminClaim(EMAIL);
```

### 4. Run the Script

```bash
# Replace with your email
node set-admin-script.js
```

### 5. Clean Up

```bash
# Remove the script and service account key (security)
rm set-admin-script.js
rm service-account-key.json
```

## Verify Admin Status

After setting admin claims:

1. **Log out** from the app
2. **Log back in**
3. Check that you see admin features (like admin badge in template manager)
4. You can now use the admin panel to promote other users

## Security Notes

- 🔒 Only deploy functions to production after thorough testing
- 🔒 Remove the bootstrap admin email logic after first setup
- 🔒 Delete the `/admin` route before production deployment
- 🔒 Never commit service account keys to version control

## Troubleshooting

**Functions still not found?**
- Check `firebase deploy` output for errors
- Verify function name matches: `setAdminClaim`
- Check Firebase Console > Functions tab

**Permission denied?**
- Make sure you're using the bootstrap admin email
- Check that you're logged in with the correct account
- Verify the email in the functions code matches your account

**CORS errors?**
- Use `httpsCallable` functions (already implemented)
- Don't call functions directly via HTTP
- Make sure Functions are deployed, not just local emulator