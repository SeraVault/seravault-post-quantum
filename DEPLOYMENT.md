# Seravault Firebase Deployment Guide

This guide explains how to deploy the Seravault application to Firebase.

## Prerequisites

1. **Firebase CLI**: Install and login to Firebase CLI
   ```bash
   npm install -g firebase-tools
   firebase login
   ```

2. **Node.js**: Ensure you have Node.js 18+ installed

3. **Project Setup**: Make sure you're in the project root directory

## Deployment Scripts

### Quick Deployment Commands

```bash
# Deploy everything (with confirmation)
npm run deploy

# Deploy with tests
npm run deploy:test

# Quick deploy (skip confirmation)
npm run deploy:quick

# Deploy specific services
npm run deploy:hosting     # Frontend only
npm run deploy:functions   # Cloud Functions only
npm run deploy:firestore   # Database rules only
npm run deploy:storage     # Storage rules only

# Run pre-deployment checks
npm run pre-deploy
```

### Manual Deployment

```bash
# Full deployment
./deploy.sh

# Deploy with options
./deploy.sh -t              # Run tests before deployment
./deploy.sh -s              # Skip confirmation prompt
./deploy.sh -l              # Run linter before deployment

# Deploy specific service
./deploy.sh hosting         # Frontend only
./deploy.sh functions       # Cloud Functions only
./deploy.sh firestore       # Firestore rules and indexes
./deploy.sh storage         # Storage rules

# Combine options
./deploy.sh -t -l hosting   # Test, lint, then deploy hosting
```

## What Gets Deployed

### Frontend (Hosting)
- React application built with Vite
- Static assets (CSS, JS, images)
- PWA files
- Output directory: `dist/`

### Cloud Functions
- Email notifications
- File processing
- Authentication helpers
- Source: `functions/src/`
- Built to: `functions/lib/`

### Firestore
- Security rules (`firestore.rules`)
- Database indexes (`firestore.indexes.json`)

### Storage
- File upload/download rules (`storage.rules`)

## Deployment Process

The deployment script follows these steps:

1. **Validation**: Check Firebase config and authentication
2. **Dependencies**: Install/update npm packages
3. **Testing** (optional): Run unit and e2e tests
4. **Linting** (optional): Check code quality
5. **Build**: Compile TypeScript and build React app
6. **Deploy**: Upload to Firebase services

## Environment Configuration

### Firebase Project
- **Production**: `seravault-8c764`
- The script automatically uses this project ID

### Environment Variables
Make sure these files are properly configured:
- `.env` (if needed, must be in `.gitignore`)
- `firebase.json`
- `firestore.rules`
- `storage.rules`

## Pre-Deployment Checklist

Run the pre-deployment check script:
```bash
npm run pre-deploy
```

This checks:
- Dependencies are installed
- TypeScript compiles without errors
- Firebase configuration is valid
- Security files are properly gitignored
- Build process works correctly

## Troubleshooting

### Common Issues

1. **Authentication Error**
   ```bash
   firebase login
   firebase use seravault-8c764
   ```

2. **Build Failures**
   - Check TypeScript errors: `npx tsc --noEmit`
   - Clear node_modules: `rm -rf node_modules && npm install`
   - Clear build cache: `rm -rf dist && npm run build`

3. **Functions Deployment Issues**
   - Check Node.js version in `functions/package.json`
   - Rebuild functions: `cd functions && npm run build`

4. **Permission Errors**
   - Make scripts executable: `chmod +x deploy.sh scripts/*.sh`

### Manual Steps

If the script fails, you can deploy manually:

```bash
# Build frontend
npm run build

# Build functions
cd functions && npm run build && cd ..

# Deploy all
firebase deploy

# Or deploy individually
firebase deploy --only hosting
firebase deploy --only functions
firebase deploy --only firestore
firebase deploy --only storage
```

## Production URLs

After successful deployment:
- **Web App**: https://seravault-8c764.web.app
- **Firebase Console**: https://console.firebase.google.com/project/seravault-8c764

## Monitoring

### Logs and Monitoring
- **Functions logs**: `firebase functions:log`
- **Hosting analytics**: Check Firebase Console
- **Performance**: Use Firebase Performance Monitoring

### Health Checks
- Verify app loads correctly
- Test user authentication
- Check file upload/download functionality
- Validate encryption/decryption features

## Rollback

If you need to rollback a deployment:

```bash
# View deployment history
firebase hosting:versions:list

# Rollback to previous version
firebase hosting:versions:restore <VERSION_ID>
```

## CI/CD Integration

For automated deployments, you can integrate these scripts with:
- GitHub Actions
- GitLab CI
- Jenkins
- Other CI/CD platforms

Example GitHub Action would use:
```yaml
- name: Deploy to Firebase
  run: ./deploy.sh -s -t
```

## Security Notes

- Never commit service account keys
- Ensure `.env` files are in `.gitignore`
- Review Firestore and Storage rules before deployment
- Test security rules in Firebase emulator
- Monitor usage and set up alerts for unusual activity