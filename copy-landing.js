#!/usr/bin/env node

// Script to copy landing page files to dist directory for deployment
// This ensures the landing page is served at the root and the app at /app

import { copyFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const landingDir = join(__dirname, 'landing');
const distDir = join(__dirname, 'dist');

// Files to copy from landing
const landingFiles = [
  'index.html',
  'styles.css',
  'script.js',
  'seravault_logo.svg',
  'favicon.ico',
  'security-whitepaper.html',
  'privacy-policy.html',
  'terms-of-service.html'
];

try {
  // Ensure dist directory exists
  if (!existsSync(distDir)) {
    console.log('⚠️  dist directory does not exist. Run "npm run build" first.');
    process.exit(1);
  }

  console.log('📄 Copying landing page files to dist...');

  // Copy each landing file
  let copiedCount = 0;
  landingFiles.forEach(file => {
    const src = join(landingDir, file);
    const dest = join(distDir, file);
    
    if (existsSync(src)) {
      copyFileSync(src, dest);
      console.log(`  ✅ Copied ${file}`);
      copiedCount++;
    } else {
      console.log(`  ⚠️  Skipped ${file} (not found)`);
    }
  });

  // Rename the built app's index.html to app.html (it will be served via rewrites)
  const appIndexSrc = join(distDir, 'index.html');
  const appIndexBak = join(distDir, 'app-index.html');
  
  if (existsSync(appIndexSrc)) {
    // Backup the app's index.html
    copyFileSync(appIndexSrc, appIndexBak);
    console.log('  ✅ Backed up app index.html to app-index.html');
  }

  // Copy landing index.html (this will be the root page)
  const landingIndexSrc = join(landingDir, 'index.html');
  const landingIndexDest = join(distDir, 'landing.html');
  
  if (existsSync(landingIndexSrc)) {
    copyFileSync(landingIndexSrc, landingIndexDest);
    // Also make it the main index
    copyFileSync(landingIndexSrc, join(distDir, 'index.html'));
    console.log('  ✅ Landing page set as root index.html');
  }

  // Restore app index for the /app route
  if (existsSync(appIndexBak)) {
    const appRouteIndex = join(distDir, 'app.html');
    copyFileSync(appIndexBak, appRouteIndex);
    console.log('  ✅ App index available at app.html');
  }

  console.log(`\n✅ Successfully copied ${copiedCount} landing page files to dist directory`);
  console.log('📦 Ready for deployment!');
  
} catch (error) {
  console.error('❌ Error copying landing page files:', error.message);
  process.exit(1);
}
