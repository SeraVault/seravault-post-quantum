#!/bin/bash

# Build script for landing page with environment variable substitution
# Creates dist-landing folder and replaces environment variables

echo "🏗️  Building landing page with environment variables..."

# Load environment variables
if [ -f .env ]; then
  export $(cat .env | grep -v '^#' | xargs)
else
  echo "⚠️  No .env file found, using defaults"
  export VITE_APP_URL="https://seravault-8c764-app.web.app"
  export VITE_LANDING_URL="https://seravault-8c764.web.app"
fi

echo "📦 App URL: $VITE_APP_URL"
echo "📦 Landing URL: $VITE_LANDING_URL"

# Create dist-landing directory
mkdir -p dist-landing

# Copy and process HTML files with environment variable substitution
echo "📄 Processing HTML files..."
for file in landing/*.html; do
  filename=$(basename "$file")
  sed "s|{{VITE_APP_URL}}|${VITE_APP_URL}|g" "$file" | \
  sed "s|{{VITE_LANDING_URL}}|${VITE_LANDING_URL}|g" | \
  sed "s|{{VITE_FIREBASE_API_KEY}}|${VITE_FIREBASE_API_KEY}|g" | \
  sed "s|{{VITE_FIREBASE_AUTH_DOMAIN}}|${VITE_FIREBASE_AUTH_DOMAIN}|g" | \
  sed "s|{{VITE_FIREBASE_PROJECT_ID}}|${VITE_FIREBASE_PROJECT_ID}|g" | \
  sed "s|{{VITE_FIREBASE_STORAGE_BUCKET}}|${VITE_FIREBASE_STORAGE_BUCKET}|g" | \
  sed "s|{{VITE_FIREBASE_MESSAGING_SENDER_ID}}|${VITE_FIREBASE_MESSAGING_SENDER_ID}|g" | \
  sed "s|{{VITE_FIREBASE_APP_ID}}|${VITE_FIREBASE_APP_ID}|g" > "dist-landing/$filename"
  echo "  ✅ Processed $filename"
done

# Copy CSS and JS files
echo "📄 Copying CSS and JS files..."
cp landing/styles.css dist-landing/ 2>/dev/null && echo "  ✅ Copied styles.css" || echo "  ⚠️  styles.css not found"
cp landing/script.js dist-landing/ 2>/dev/null && echo "  ✅ Copied script.js" || echo "  ⚠️  script.js not found"

# Copy assets (logo and favicon)
echo "🖼️  Copying assets..."
cp public/seravault_logo.svg dist-landing/ 2>/dev/null && echo "  ✅ Copied seravault_logo.svg" || echo "  ⚠️  seravault_logo.svg not found"
cp public/favicon.ico dist-landing/ 2>/dev/null && echo "  ✅ Copied favicon.ico" || echo "  ⚠️  favicon.ico not found"

echo "✅ Landing page built successfully in dist-landing/"
echo "🔗 App URL configured as: $VITE_APP_URL"
