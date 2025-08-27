/**
 * Post-Quantum Cryptography Implementation
 * 
 * This module provides quantum-resistant cryptographic operations using:
 * - ML-KEM768 for key encapsulation/exchange
 * - ChaCha20-Poly1305 for symmetric encryption (quantum-resistant)
 * - BLAKE3 for hashing (quantum-resistant)
 * - Proper key derivation with salt and stretching
 */

import { ml_kem768 } from '@noble/post-quantum/ml-kem';
import { chacha20poly1305 } from '@noble/ciphers/chacha';
import { blake3 } from '@noble/hashes/blake3';
import { pbkdf2 } from '@noble/hashes/pbkdf2';
import { randomBytes } from '@noble/hashes/utils';

// Constants for quantum-resistant crypto
const SALT_LENGTH = 32;
const KEY_LENGTH = 32; // 256 bits
const NONCE_LENGTH = 12;
const PBKDF2_ITERATIONS = 100000; // High iteration count for key stretching

/**
 * Generate a cryptographically secure random salt
 */
export function generateSalt(): Uint8Array {
  return randomBytes(SALT_LENGTH);
}

/**
 * Generate a cryptographically secure random nonce
 */
export function generateNonce(): Uint8Array {
  return randomBytes(NONCE_LENGTH);
}

/**
 * Derive a key from a passphrase using quantum-resistant PBKDF2 with BLAKE3
 */
export function deriveKey(passphrase: string, salt: Uint8Array): Uint8Array {
  const passphraseBytes = new TextEncoder().encode(passphrase);
  return pbkdf2(blake3, passphraseBytes, salt, {
    c: PBKDF2_ITERATIONS,
    dkLen: KEY_LENGTH,
  });
}

/**
 * Encrypt data using ChaCha20-Poly1305 (quantum-resistant symmetric encryption)
 */
export function encryptSymmetric(data: Uint8Array, key: Uint8Array, nonce?: Uint8Array): {
  ciphertext: Uint8Array;
  nonce: Uint8Array;
} {
  if (!nonce) {
    nonce = generateNonce();
  }
  
  const cipher = chacha20poly1305(key, nonce);
  const ciphertext = cipher.encrypt(data);
  
  return { ciphertext, nonce };
}

/**
 * Decrypt data using ChaCha20-Poly1305
 */
export function decryptSymmetric(ciphertext: Uint8Array, key: Uint8Array, nonce: Uint8Array): Uint8Array {
  const cipher = chacha20poly1305(key, nonce);
  return cipher.decrypt(ciphertext);
}

/**
 * Encrypt a string using quantum-resistant methods
 */
export function encryptString(plaintext: string, passphrase: string): {
  ciphertext: string; // base64
  salt: string; // base64
  nonce: string; // base64
} {
  const salt = generateSalt();
  const key = deriveKey(passphrase, salt);
  const plaintextBytes = new TextEncoder().encode(plaintext);
  
  const { ciphertext, nonce } = encryptSymmetric(plaintextBytes, key);
  
  return {
    ciphertext: bytesToBase64(ciphertext),
    salt: bytesToBase64(salt),
    nonce: bytesToBase64(nonce),
  };
}

/**
 * Decrypt a string using quantum-resistant methods
 */
export function decryptString(encryptedData: {
  ciphertext: string;
  salt: string;
  nonce: string;
}, passphrase: string): string {
  const salt = base64ToBytes(encryptedData.salt);
  const nonce = base64ToBytes(encryptedData.nonce);
  const ciphertext = base64ToBytes(encryptedData.ciphertext);
  
  const key = deriveKey(passphrase, salt);
  const plaintextBytes = decryptSymmetric(ciphertext, key, nonce);
  
  return new TextDecoder().decode(plaintextBytes);
}

/**
 * Generate ML-KEM768 post-quantum key pair
 */
export function generateKeyPair(): {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
} {
  const keys = ml_kem768.keygen();
  return {
    publicKey: keys.publicKey,
    privateKey: keys.secretKey,
  };
}

/**
 * Encapsulate a key using ML-KEM768
 */
export async function encapsulateKey(publicKey: Uint8Array): Promise<{
  cipherText: Uint8Array;
  sharedSecret: Uint8Array;
}> {
  return ml_kem768.encapsulate(publicKey);
}

/**
 * Decapsulate a key using ML-KEM768
 */
export async function decapsulateKey(cipherText: Uint8Array, privateKey: Uint8Array): Promise<Uint8Array> {
  return ml_kem768.decapsulate(cipherText, privateKey);
}

/**
 * Create a quantum-resistant hash of data using BLAKE3
 */
export function hash(data: Uint8Array): Uint8Array {
  return blake3(data);
}

/**
 * Create a quantum-resistant hash of a string using BLAKE3
 */
export function hashString(text: string): string {
  const data = new TextEncoder().encode(text);
  const hashBytes = blake3(data);
  return bytesToHex(hashBytes);
}

// Utility functions for encoding/decoding
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

export function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

export function bytesToBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

export function base64ToBytes(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Securely wipe sensitive data from memory (best effort)
 */
export function secureWipe(data: Uint8Array): void {
  // Overwrite with random data multiple times
  for (let i = 0; i < 3; i++) {
    crypto.getRandomValues(data);
  }
  // Final overwrite with zeros
  data.fill(0);
}

/**
 * Encrypt file metadata using post-quantum crypto
 */
export function encryptMetadata(metadata: { name: string; size: string }, sharedSecret: Uint8Array): {
  encryptedName: string;
  encryptedSize: string;
  nonce: string;
} {
  const nonce = generateNonce();
  
  const nameBytes = new TextEncoder().encode(metadata.name);
  const sizeBytes = new TextEncoder().encode(metadata.size);
  
  const { ciphertext: encryptedNameBytes } = encryptSymmetric(nameBytes, sharedSecret, nonce);
  const { ciphertext: encryptedSizeBytes } = encryptSymmetric(sizeBytes, sharedSecret, nonce);
  
  return {
    encryptedName: bytesToBase64(encryptedNameBytes),
    encryptedSize: bytesToBase64(encryptedSizeBytes),
    nonce: bytesToBase64(nonce),
  };
}

/**
 * Decrypt file metadata using post-quantum crypto
 */
export function decryptMetadata(encryptedMetadata: {
  encryptedName: string;
  encryptedSize: string;
  nonce: string;
}, sharedSecret: Uint8Array): {
  name: string;
  size: string;
} {
  const nonce = base64ToBytes(encryptedMetadata.nonce);
  const encryptedNameBytes = base64ToBytes(encryptedMetadata.encryptedName);
  const encryptedSizeBytes = base64ToBytes(encryptedMetadata.encryptedSize);
  
  const nameBytes = decryptSymmetric(encryptedNameBytes, sharedSecret, nonce);
  const sizeBytes = decryptSymmetric(encryptedSizeBytes, sharedSecret, nonce);
  
  return {
    name: new TextDecoder().decode(nameBytes),
    size: new TextDecoder().decode(sizeBytes),
  };
}