#!/bin/bash

# Build script for landing page only
# Creates a separate dist-landing folder for the landing page

echo "🏗️  Building landing page..."

# Create dist-landing directory
mkdir -p dist-landing

# Copy landing page files
echo "📄 Copying landing page files..."
cp landing/index.html dist-landing/
cp landing/styles.css dist-landing/
cp landing/script.js dist-landing/
cp landing/security-whitepaper.html dist-landing/
cp landing/privacy-policy.html dist-landing/
cp landing/terms-of-service.html dist-landing/

# Copy assets (logo and favicon)
echo "🖼️  Copying assets..."
cp public/seravault_logo.svg dist-landing/ 2>/dev/null || echo "⚠️  seravault_logo.svg not found"
cp public/favicon.ico dist-landing/ 2>/dev/null || echo "⚠️  favicon.ico not found"

echo "✅ Landing page built successfully in dist-landing/"
