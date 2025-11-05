# Deploying SeraVault to Firebase

This guide explains how to deploy both the landing page and the React app to Firebase Hosting.

## Architecture

- **Landing Page**: Served at the root (`/`) - marketing site from `landing/` folder
- **React App**: Served at `/app` - main application
- **Legal Pages**: Served at `/privacy-policy.html`, `/terms-of-service.html`, `/security-whitepaper.html`

## Prerequisites

1. **Firebase CLI** installed globally:
   ```bash
   npm install -g firebase-tools
   ```

2. **Login to Firebase**:
   ```bash
   firebase login
   ```

3. **Initialize your project** (if not already done):
   ```bash
   firebase use seravault-8c764
   ```

## Deployment Options

### Option 1: Full Deployment (Recommended)

Deploy everything (app, landing page, functions, firestore rules, storage rules):

```bash
npm run deploy
```

Or use the script directly:
```bash
./deploy.sh
```

### Option 2: Deploy Only Hosting (Landing + App)

If you only want to update the website:

```bash
npm run deploy:hosting
```

Or:
```bash
./deploy.sh hosting
```

### Option 3: Quick Deploy (Skip Confirmation)

```bash
npm run deploy:quick
```

### Option 4: Deploy with Tests

Run all tests before deploying:

```bash
npm run deploy:test
```

Or:
```bash
./deploy.sh -t
```

### Option 5: Deploy Individual Services

```bash
# Deploy only Cloud Functions
npm run deploy:functions

# Deploy only Firestore rules
npm run deploy:firestore

# Deploy only Storage rules
npm run deploy:storage
```

## Build Process

The build process automatically:

1. **Builds the React app** (`vite build`)
2. **Copies PDF.js worker** to public directory
3. **Copies landing page files** to dist directory
4. **Renames app index.html** to `app-index.html`
5. **Sets landing index.html** as root

### Manual Build

```bash
npm run build
```

This creates a `dist/` folder with:
- `index.html` - Landing page (root)
- `app-index.html` - React app
- All React app assets (`assets/`, JavaScript, CSS)
- Landing page files (CSS, JS, images)
- Legal pages (privacy, terms, whitepaper)

## Routing Configuration

Firebase Hosting is configured in `firebase.json` to route:

| URL | Serves |
|-----|--------|
| `/` | Landing page (`index.html`) |
| `/app` | React app (`app-index.html`) |
| `/login` | React app (for React Router) |
| `/signup` | React app (for React Router) |
| `/settings` | React app (for React Router) |
| `/chat` | React app (for React Router) |
| `/privacy-policy.html` | Privacy policy |
| `/terms-of-service.html` | Terms of service |
| `/security-whitepaper.html` | Security whitepaper |

## Deployment Script Options

The `deploy.sh` script supports several flags:

```bash
./deploy.sh [OPTIONS] [SERVICE]

OPTIONS:
  -h, --help          Show help message
  -t, --test          Run tests before deployment
  -s, --skip-confirm  Skip deployment confirmation
  -l, --lint          Run linter before deployment

SERVICE (optional):
  hosting             Deploy only the React app
  functions           Deploy only Cloud Functions
  firestore           Deploy only Firestore rules and indexes
  storage             Deploy only Storage rules
```

### Examples

```bash
# Deploy everything with confirmation
./deploy.sh

# Deploy only hosting without confirmation
./deploy.sh -s hosting

# Run tests and deploy everything
./deploy.sh -t

# Run linter, then deploy functions
./deploy.sh -l functions
```

## Verifying Deployment

After deployment, verify:

1. **Landing page**: `https://seravault-8c764.web.app/`
2. **React app**: `https://seravault-8c764.web.app/app`
3. **Privacy policy**: `https://seravault-8c764.web.app/privacy-policy.html`
4. **Terms of service**: `https://seravault-8c764.web.app/terms-of-service.html`
5. **Security whitepaper**: `https://seravault-8c764.web.app/security-whitepaper.html`

## Troubleshooting

### Build fails

```bash
# Clean and rebuild
rm -rf dist node_modules
npm install
npm run build
```

### Landing page not showing

Verify `copy-landing.js` ran successfully:
```bash
node copy-landing.js
```

Check `dist/` folder contains:
- `index.html` (landing page)
- `app-index.html` (React app)
- `styles.css`, `script.js`, `seravault_logo.svg`

### App routes return 404

Check `firebase.json` rewrites are correct. All app routes should point to `app-index.html`.

### CORS issues with Firebase Storage

Run:
```bash
gsutil cors set cors.json gs://seravault-8c764.firebasestorage.app
```

This is automatically done during deployment.

## Custom Domain Setup

To use a custom domain (e.g., `seravault.com`):

1. **Add domain in Firebase Console**:
   - Go to Hosting → Add custom domain
   - Follow DNS verification steps

2. **Update DNS records**:
   - Add A records provided by Firebase
   - Wait for propagation (can take up to 24 hours)

3. **Deploy**:
   ```bash
   npm run deploy
   ```

## CI/CD (GitHub Actions)

For automated deployments, create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Firebase

on:
  push:
    branches:
      - main

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          
      - name: Install dependencies
        run: npm ci
        
      - name: Build
        run: npm run build
        
      - name: Deploy to Firebase
        uses: w9jds/firebase-action@master
        with:
          args: deploy --only hosting
        env:
          FIREBASE_TOKEN: ${{ secrets.FIREBASE_TOKEN }}
```

Get your Firebase token:
```bash
firebase login:ci
```

Add it to GitHub repository secrets as `FIREBASE_TOKEN`.

## Production Checklist

Before deploying to production:

- [ ] Update environment variables in `.env.production`
- [ ] Test the build locally: `npm run build && npm run preview`
- [ ] Run all tests: `npm run test:all`
- [ ] Update Firebase security rules
- [ ] Configure CORS for Storage
- [ ] Set up custom domain (optional)
- [ ] Enable Firebase Analytics
- [ ] Configure Firebase App Check
- [ ] Set up monitoring and alerts
- [ ] Review Privacy Policy and Terms of Service
- [ ] Test all routes on deployed site

## Rollback

If you need to rollback:

```bash
# View deployment history
firebase hosting:channel:list

# Rollback to previous version
firebase hosting:rollback
```

## Support

For issues:
- Check Firebase Console for error logs
- Review Cloud Functions logs: `firebase functions:log`
- Check Firestore rules: https://console.firebase.google.com/project/seravault-8c764/firestore/rules
- Verify storage rules: https://console.firebase.google.com/project/seravault-8c764/storage/rules
