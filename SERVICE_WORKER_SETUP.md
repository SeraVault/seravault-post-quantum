# Secure Service Worker Configuration

## Overview

The `firebase-messaging-sw.js` file is now **automatically generated** from environment variables during the build process. This prevents committing sensitive Firebase configuration to git.

## Setup

### 1. Ensure Environment Variables

Make sure your `.env` file contains all required Firebase config variables:

```bash
# Firebase Configuration (from Firebase Console > Project Settings > General)
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id

# VAPID Key for Push Notifications (from Firebase Console > Project Settings > Cloud Messaging)
VITE_FIREBASE_VAPID_KEY=your_vapid_public_key

# App URLs
VITE_APP_URL=https://your-project-app.web.app
VITE_LANDING_URL=https://your-project.web.app
```

### Getting Your VAPID Key

For push notifications to work, you need a VAPID key:

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Click ⚙️ → **Project Settings** → **Cloud Messaging** tab
4. Under **Web Push certificates**, click **Generate key pair** (if not already generated)
5. Copy the public key (starts with `B...`)
6. Add it to `.env` as `VITE_FIREBASE_VAPID_KEY`

### 2. Generate Service Worker

The service worker is automatically generated when you build:

```bash
npm run build
```

Or generate it manually:

```bash
node scripts/generate-sw-config.cjs
```

### 3. Verify Gitignore

The generated `public/firebase-messaging-sw.js` file is excluded from git via `.gitignore`:

```
# Firebase Service Worker (auto-generated from environment variables)
public/firebase-messaging-sw.js
```

## Development

During development, the service worker needs to be generated once:

```bash
# Generate service worker before starting dev server
node scripts/generate-sw-config.cjs
npm run dev
```

## Deployment

### Local Deploy

```bash
npm run build  # Generates SW automatically
firebase deploy --only hosting:app
```

### CI/CD

Ensure your CI/CD pipeline:
1. Sets the required `VITE_FIREBASE_*` environment variables
2. Runs `npm run build` (which generates the SW automatically)
3. Deploys to Firebase Hosting

## Security Benefits

✅ **No credentials in git** - Firebase config comes from environment variables
✅ **Environment-specific** - Different configs for dev/staging/production
✅ **Automated generation** - No manual editing required
✅ **Build-time injection** - Config injected during build process

## Troubleshooting

### Missing Environment Variables

If you see this error:
```
❌ Missing required environment variables:
   - VITE_FIREBASE_API_KEY
```

Solution: Add the missing variables to your `.env` file.

### Service Worker Not Found

If push notifications don't work, ensure:
1. Service worker was generated: `ls -la public/firebase-messaging-sw.js`
2. Generate it: `node scripts/generate-sw-config.cjs`
3. Clear browser cache and reload

### Invalid Configuration

If the service worker fails to initialize:
1. Check environment variables are correct
2. Regenerate: `node scripts/generate-sw-config.cjs`
3. Check browser console for errors

## Files

- `scripts/generate-sw-config.cjs` - Generator script
- `public/firebase-messaging-sw.js` - Generated file (gitignored)
- `.env` - Contains Firebase configuration
- `.gitignore` - Excludes generated service worker

## Migration from Old Setup

The old `firebase-messaging-sw.js` with hardcoded config has been replaced. Simply:

1. Run `node scripts/generate-sw-config.cjs`
2. Commit the updated `.gitignore` and `scripts/generate-sw-config.cjs`
3. **Do not** commit `public/firebase-messaging-sw.js`
