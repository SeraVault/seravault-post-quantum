#!/bin/bash

# SeraVault Multi-Site Deployment Setup Guide
# This script helps you set up separate URLs for landing page and app

echo "=========================================="
echo "SeraVault Multi-Site Setup"
echo "=========================================="
echo ""

# Get the Firebase project ID - use simple approach
PROJECT_ID="seravault-8c764"

echo "📦 Using Firebase Project: $PROJECT_ID"
echo ""
echo "This setup will create TWO hosting sites:"
echo "  1. Landing Page: ${PROJECT_ID}.web.app"
echo "  2. App: ${PROJECT_ID}-app.web.app"
echo ""

# Check if sites already exist
echo "Checking existing hosting sites..."
EXISTING_SITES=$(firebase hosting:sites:list --json 2>/dev/null | grep -o '"name": *"[^"]*"' | cut -d'"' -f4)

if echo "$EXISTING_SITES" | grep -q "${PROJECT_ID}-app"; then
  echo "✅ App site '${PROJECT_ID}-app' already exists"
  APP_SITE_EXISTS=true
else
  echo "⚠️  App site '${PROJECT_ID}-app' does not exist"
  APP_SITE_EXISTS=false
fi

echo ""
echo "----------------------------------------"
echo "STEP 1: Create hosting sites"
echo "----------------------------------------"
echo ""

if [ "$APP_SITE_EXISTS" = false ]; then
  echo "Creating app site: ${PROJECT_ID}-app"
  firebase hosting:sites:create "${PROJECT_ID}-app"
  if [ $? -ne 0 ]; then
    echo "❌ Failed to create app site. You may need to create it manually in Firebase Console."
    echo "   Visit: https://console.firebase.google.com/project/${PROJECT_ID}/hosting/sites"
    exit 1
  fi
  echo "✅ Created app site"
else
  echo "✅ App site already exists, skipping creation"
fi

echo ""
echo "----------------------------------------"
echo "STEP 2: Apply hosting targets"
echo "----------------------------------------"
echo ""

echo "Setting up hosting targets..."
firebase target:apply hosting landing "${PROJECT_ID}"
firebase target:apply hosting app "${PROJECT_ID}-app"

if [ $? -eq 0 ]; then
  echo "✅ Hosting targets configured successfully"
else
  echo "❌ Failed to configure hosting targets"
  exit 1
fi

echo ""
echo "----------------------------------------"
echo "STEP 3: Update firebase.json"
echo "----------------------------------------"
echo ""

if [ -f "firebase.json" ] && [ ! -f "firebase.json.backup" ]; then
  cp firebase.json firebase.json.backup
  echo "✅ Backed up firebase.json to firebase.json.backup"
fi

cp firebase.multisite.json firebase.json
echo "✅ Updated firebase.json with multi-site configuration"

echo ""
echo "----------------------------------------"
echo "STEP 4: Update package.json scripts"
echo "----------------------------------------"
echo ""

echo "Adding deployment scripts to package.json..."

# Check if scripts need to be added (this is informational)
if grep -q "deploy:landing" package.json; then
  echo "✅ Deployment scripts already exist in package.json"
else
  echo "⚠️  You'll need to manually add these scripts to package.json:"
  echo '  "build:landing": "./build-landing.sh",'
  echo '  "deploy:landing": "npm run build:landing && firebase deploy --only hosting:landing",'
  echo '  "deploy:app": "npm run build:deploy && firebase deploy --only hosting:app",'
  echo '  "deploy:both": "npm run build:landing && npm run build:deploy && firebase deploy --only hosting"'
fi

echo ""
echo "=========================================="
echo "✅ Multi-Site Setup Complete!"
echo "=========================================="
echo ""
echo "Your sites will be available at:"
echo "  Landing: https://${PROJECT_ID}.web.app"
echo "  App:     https://${PROJECT_ID}-app.web.app"
echo ""
echo "To deploy:"
echo "  ./build-landing.sh          # Build landing page"
echo "  npm run build:deploy        # Build app"
echo "  firebase deploy --only hosting:landing   # Deploy landing only"
echo "  firebase deploy --only hosting:app       # Deploy app only"
echo "  firebase deploy --only hosting           # Deploy both"
echo ""
echo "To add custom domains, visit:"
echo "  https://console.firebase.google.com/project/${PROJECT_ID}/hosting/sites"
echo ""

