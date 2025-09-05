#!/usr/bin/env node

// Script to copy PDF.js worker file to public directory
// Run this after npm install to ensure the worker is available locally

import { copyFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const workerSrc = join(__dirname, 'node_modules/pdfjs-dist/build/pdf.worker.min.mjs');
const workerDest = join(__dirname, 'public/pdf.worker.min.mjs');

try {
  if (existsSync(workerSrc)) {
    copyFileSync(workerSrc, workerDest);
    console.log('✅ PDF worker file copied successfully to public directory');
  } else {
    console.error('❌ PDF worker source file not found. Please run "npm install" first.');
    process.exit(1);
  }
} catch (error) {
  console.error('❌ Error copying PDF worker file:', error.message);
  process.exit(1);
}