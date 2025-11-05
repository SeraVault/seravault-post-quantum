# Multi-Site Deployment Guide

This guide explains how to deploy the SeraVault landing page and app to **separate URLs** using Firebase Hosting's multi-site feature.

## 🎯 Goal

Deploy two separate sites from one Firebase project:
- **Landing Page**: `https://seravault.web.app` (or custom domain `seravault.com`)
- **App**: `https://seravault-app.web.app` (or custom domain `app.seravault.com`)

## 📋 Prerequisites

- Firebase CLI installed (`npm install -g firebase-tools`)
- Logged into Firebase (`firebase login`)
- A Firebase project created

## 🚀 Quick Setup (Automated)

### Step 1: Create Hosting Sites

Run these commands to create two hosting sites in your Firebase project:

```bash
# Get your project ID
firebase use

# Create the landing site (main site)
firebase hosting:sites:create seravault-firebase

# Create the app site
firebase hosting:sites:create seravault-firebase-app
```

**Note:** Replace `seravault-firebase` with your actual Firebase project ID.

### Step 2: Apply Hosting Targets

Link your local targets to the Firebase sites:

```bash
firebase target:apply hosting landing seravault-firebase
firebase target:apply hosting app seravault-firebase-app
```

### Step 3: Update Configuration

Replace your `firebase.json` with the multi-site version:

```bash
cp firebase.multisite.json firebase.json
```

### Step 4: Update package.json Scripts

Add these scripts to your `package.json`:

```json
{
  "scripts": {
    "build:landing": "./build-landing.sh",
    "build:app": "node copy-pdf-worker.js && tsc -b && vite build",
    "build:all": "npm run build:landing && npm run build:app",
    "deploy:landing": "npm run build:landing && firebase deploy --only hosting:landing",
    "deploy:app": "npm run build:app && firebase deploy --only hosting:app",
    "deploy:both": "npm run build:all && firebase deploy --only hosting"
  }
}
```

### Step 5: Deploy!

```bash
# Deploy landing page only
npm run deploy:landing

# Deploy app only
npm run deploy:app

# Deploy both
npm run deploy:both
```

## 🌐 Your Sites

After deployment, your sites will be available at:

- **Landing**: `https://seravault-firebase.web.app`
- **App**: `https://seravault-firebase-app.web.app`

## 🔧 Manual Setup (If You Prefer)

### 1. Create Two Hosting Sites

```bash
# List existing sites
firebase hosting:sites:list

# Create new sites (if needed)
firebase hosting:sites:create <site-id>
```

### 2. Configure firebase.json

Your `firebase.json` should have an array of hosting configs:

```json
{
  "hosting": [
    {
      "target": "landing",
      "public": "dist-landing",
      "ignore": ["firebase.json", "**/.*", "**/node_modules/**"]
    },
    {
      "target": "app",
      "public": "dist",
      "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
      "rewrites": [
        { "source": "**", "destination": "/index.html" }
      ]
    }
  ]
}
```

### 3. Set Up Targets

Create a `.firebaserc` file (or update existing):

```json
{
  "projects": {
    "default": "seravault-firebase"
  },
  "targets": {
    "seravault-firebase": {
      "hosting": {
        "landing": ["seravault-firebase"],
        "app": ["seravault-firebase-app"]
      }
    }
  }
}
```

## 🎨 Custom Domains

### Add Custom Domain to Landing Site

```bash
# In Firebase Console or CLI
firebase hosting:channel:deploy production --only landing
# Then add custom domain in Firebase Console
```

Common setup:
- Landing: `seravault.com` or `www.seravault.com`
- App: `app.seravault.com`

### DNS Configuration

For `seravault.com` → Landing:
```
A     @           151.101.1.195
A     @           151.101.65.195
```

For `app.seravault.com` → App:
```
A     app         151.101.1.195
A     app         151.101.65.195
```

*Note: Use the actual IP addresses provided by Firebase Console*

## 📁 Directory Structure

```
seravault-firebase/
├── landing/              # Landing page source
│   ├── index.html
│   ├── styles.css
│   └── script.js
├── src/                  # App source
├── dist-landing/         # Built landing page (auto-generated)
├── dist/                 # Built app (auto-generated)
├── build-landing.sh      # Landing build script
└── firebase.json         # Multi-site config
```

## 🔄 Deployment Workflow

### Development
```bash
npm run dev               # Run app in dev mode
# Open landing/index.html in browser for landing page
```

### Production
```bash
# Build both
npm run build:all

# Deploy both
npm run deploy:both

# Or deploy individually
npm run deploy:landing
npm run deploy:app
```

## 🐛 Troubleshooting

### "Site not found" error
Make sure you've created the hosting sites:
```bash
firebase hosting:sites:list
```

### "Target not configured" error
Apply the targets:
```bash
firebase target:apply hosting landing <your-landing-site-id>
firebase target:apply hosting app <your-app-site-id>
```

### Landing page shows 404
Check that `dist-landing/` was created and contains files:
```bash
ls -la dist-landing/
```

### App shows landing page
Make sure `firebase.json` has correct `public` directories:
- Landing: `"public": "dist-landing"`
- App: `"public": "dist"`

## 📊 Monitoring

View deployment status:
```bash
firebase hosting:channel:list
```

Check site URLs:
```bash
firebase hosting:sites:list
```

## 💡 Benefits of Multi-Site Setup

✅ **Separate URLs**: Clean separation between marketing and app
✅ **Same Project**: Shared Firebase Auth, Firestore, Functions
✅ **Independent Deploys**: Update landing without rebuilding app
✅ **Custom Domains**: Different domains for each site
✅ **Shared Billing**: Single Firebase project billing

## 🔗 Useful Commands

```bash
# List all hosting sites
firebase hosting:sites:list

# Deploy specific target
firebase deploy --only hosting:landing
firebase deploy --only hosting:app

# Preview before deploying
firebase hosting:channel:deploy preview --only landing

# Check deployment status
firebase hosting:channel:list

# Delete a site (careful!)
firebase hosting:sites:delete <site-id>
```

## 📚 Resources

- [Firebase Multi-Site Hosting Docs](https://firebase.google.com/docs/hosting/multisites)
- [Firebase CLI Reference](https://firebase.google.com/docs/cli)
- [Custom Domain Setup](https://firebase.google.com/docs/hosting/custom-domain)
