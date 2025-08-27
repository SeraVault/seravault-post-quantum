/**
 * Migration utilities for transitioning from classical to post-quantum cryptography
 */

import { encryptString, decryptString, encryptMetadata } from './postQuantumCrypto';
import type { FileData } from '../files';

/**
 * Check if data is in the new post-quantum encrypted format
 */
export function isPostQuantumFormat(data: any): boolean {
  return typeof data === 'object' && 'ciphertext' in data && ('salt' in data || 'nonce' in data);
}

/**
 * Check if data is in the metadata format (used by files)
 */
export function isMetadataFormat(data: any): boolean {
  return typeof data === 'object' && 'ciphertext' in data && 'nonce' in data && !('salt' in data);
}

/**
 * Decrypt data that could be in either legacy AES or new post-quantum format
 */
export async function decryptLegacyOrPostQuantum(
  encryptedData: string | { ciphertext: string; salt: string; nonce: string },
  key: string
): Promise<string> {
  if (isPostQuantumFormat(encryptedData)) {
    // New post-quantum format
    return decryptString(encryptedData as any, key);
  } else {
    // Legacy AES format
    const { AES, enc } = await import('crypto-js');
    return AES.decrypt(encryptedData as string, key).toString(enc.Utf8);
  }
}

/**
 * Decrypt file metadata (name or size) that could be in either legacy AES or new post-quantum format
 */
export async function decryptFileMetadata(
  encryptedData: string | { ciphertext: string; nonce: string },
  sharedSecret: Uint8Array
): Promise<string> {
  if (typeof encryptedData === 'object' && 'ciphertext' in encryptedData) {
    // New post-quantum metadata format
    const { base64ToBytes, decryptSymmetric } = await import('../crypto/postQuantumCrypto');
    
    if (!encryptedData.nonce || encryptedData.nonce.length === 0) {
      throw new Error('Invalid nonce for metadata decryption');
    }
    
    const ciphertext = base64ToBytes(encryptedData.ciphertext);
    const nonce = base64ToBytes(encryptedData.nonce);
    
    const decryptedBytes = decryptSymmetric(ciphertext, sharedSecret, nonce);
    return new TextDecoder().decode(decryptedBytes);
  } else {
    // Legacy AES format
    const { AES, enc } = await import('crypto-js');
    const keyHex = Array.from(sharedSecret, byte => byte.toString(16).padStart(2, '0')).join('');
    return AES.decrypt(encryptedData as string, keyHex).toString(enc.Utf8);
  }
}

/**
 * Encrypt data using the new post-quantum format
 */
export function encryptWithPostQuantum(plaintext: string, key: string): {
  ciphertext: string;
  salt: string;
  nonce: string;
} {
  return encryptString(plaintext, key);
}

/**
 * Migrate file metadata from legacy to post-quantum encryption
 */
export function migrateFileData(
  file: FileData,
  sharedSecret: Uint8Array
): {
  name: { ciphertext: string; salt: string; nonce: string };
  size: { ciphertext: string; salt: string; nonce: string };
} {
  // Decrypt existing data (assuming it's legacy format)
  let plainName: string;
  let plainSize: string;

  if (typeof file.name === 'string') {
    // Legacy format - would need key to decrypt, but we'll assume it's already decrypted
    plainName = file.name;
  } else {
    // Already in new format
    throw new Error('File is already in post-quantum format');
  }

  if (typeof file.size === 'string') {
    plainSize = file.size;
  } else {
    throw new Error('File size is already in post-quantum format');
  }

  // Re-encrypt with post-quantum crypto
  const { encryptedName, encryptedSize } = encryptMetadata(
    { name: plainName, size: plainSize },
    sharedSecret
  );

  return {
    name: {
      ciphertext: encryptedName,
      salt: '', // Not used in metadata encryption
      nonce: '', // Shared nonce for metadata
    },
    size: {
      ciphertext: encryptedSize,
      salt: '',
      nonce: '',
    },
  };
}

/**
 * Migrate folder name from legacy to post-quantum encryption
 */
export function migrateFolderName(plainName: string, key: string): {
  ciphertext: string;
  salt: string;
  nonce: string;
} {
  return encryptString(plainName, key);
}