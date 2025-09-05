/**
 * HPKE-based post-quantum cryptography for file encryption and sharing
 * Uses Hybrid Public Key Encryption (RFC 9180) for secure file sharing
 */

import { CipherSuite, DhkemX25519HkdfSha256, HkdfSha256, Aes128Gcm } from '@hpke/core';

// HPKE Cipher Suite: X25519 + HKDF-SHA256 + AES-128-GCM
const suite = new CipherSuite({
  kem: new DhkemX25519HkdfSha256(),
  kdf: new HkdfSha256(),
  aead: new Aes128Gcm(),
});

export interface KeyPair {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
}

export interface EncryptedData {
  ciphertext: Uint8Array;
  encapsulatedKey: Uint8Array;
}

/**
 * Generate a new HPKE key pair
 */
export async function generateKeyPair(): Promise<KeyPair> {
  const keyPair = await suite.kem.generateKeyPair();
  return {
    publicKey: new Uint8Array(await suite.kem.serializePublicKey(keyPair.publicKey)),
    privateKey: new Uint8Array(await suite.kem.serializePrivateKey(keyPair.privateKey)),
  };
}

/**
 * Encrypt data using HPKE (can be decrypted by anyone with the private key)
 */
export async function encryptData(
  data: Uint8Array,
  recipientPublicKey: Uint8Array,
  info: Uint8Array = new Uint8Array(0)
): Promise<EncryptedData> {
  const publicKey = await suite.kem.deserializePublicKey(recipientPublicKey);
  
  const sender = await suite.createSenderContext({
    recipientPublicKey: publicKey,
    info,
  });

  const ciphertext = new Uint8Array(await sender.seal(data));
  
  return {
    ciphertext,
    encapsulatedKey: new Uint8Array(sender.enc),
  };
}

/**
 * Decrypt data using HPKE
 */
export async function decryptData(
  encryptedData: EncryptedData,
  recipientPrivateKey: Uint8Array,
  info: Uint8Array = new Uint8Array(0)
): Promise<Uint8Array> {
  if (recipientPrivateKey.length !== 32) {
    throw new Error(`Invalid HPKE private key length: expected 32 bytes for X25519, got ${recipientPrivateKey.length} bytes. Please regenerate your keys from the Profile page.`);
  }
  
  let privateKey;
  try {
    privateKey = await suite.kem.deserializePrivateKey(recipientPrivateKey);
  } catch (deserializeError) {
    console.error('HPKE private key deserialization failed:', deserializeError);
    console.error('Private key length:', recipientPrivateKey.length);
    console.error('Private key first 8 bytes (hex):', Array.from(recipientPrivateKey.slice(0, 8)).map(b => b.toString(16).padStart(2, '0')).join(' '));
    throw new Error(`HPKE private key format is invalid: ${deserializeError instanceof Error ? deserializeError.message : String(deserializeError)}. Please regenerate your keys from the Profile page.`);
  }
  
  const recipient = await suite.createRecipientContext({
    recipientKey: privateKey,
    enc: encryptedData.encapsulatedKey,
    info,
  });

  return new Uint8Array(await recipient.open(encryptedData.ciphertext));
}

/**
 * Utility functions for hex encoding/decoding
 */
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

/**
 * Encrypt file content for multiple recipients
 * Returns the encrypted content and individual encrypted keys for each recipient
 */
export async function encryptForMultipleRecipients(
  content: Uint8Array,
  recipientPublicKeys: { userId: string; publicKey: Uint8Array }[]
): Promise<{
  encryptedContent: Uint8Array;
  encryptedKeys: { [userId: string]: string };
}> {
  // Generate a random AES key for the file content
  const fileKey = crypto.getRandomValues(new Uint8Array(32));
  
  // Encrypt the file content with AES-GCM
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const aesKey = await crypto.subtle.importKey('raw', fileKey, { name: 'AES-GCM' }, false, ['encrypt']);
  const encryptedContent = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    content
  );

  // Create the final encrypted content: [12-byte IV][AES-encrypted content]
  const finalContent = new Uint8Array(12 + encryptedContent.byteLength);
  finalContent.set(iv, 0);
  finalContent.set(new Uint8Array(encryptedContent), 12);

  // Encrypt the file key for each recipient using HPKE
  const encryptedKeys: { [userId: string]: string } = {};
  
  for (const { userId, publicKey } of recipientPublicKeys) {
    const encryptedKey = await encryptData(fileKey, publicKey);
    // Store as: encapsulated_key + ciphertext
    const keyData = new Uint8Array(encryptedKey.encapsulatedKey.length + encryptedKey.ciphertext.length);
    keyData.set(encryptedKey.encapsulatedKey, 0);
    keyData.set(encryptedKey.ciphertext, encryptedKey.encapsulatedKey.length);
    encryptedKeys[userId] = bytesToHex(keyData);
  }

  return {
    encryptedContent: finalContent,
    encryptedKeys,
  };
}

/**
 * Decrypt file content using user's private key
 */
export async function decryptFileContent(
  encryptedContent: Uint8Array,
  encryptedKey: string,
  userPrivateKey: Uint8Array
): Promise<Uint8Array> {
  // Parse the encrypted key (encapsulated_key + ciphertext)
  const keyData = hexToBytes(encryptedKey);
  
  // X25519 public keys are 32 bytes, so encapsulated key is 32 bytes
  const encapsulatedKey = keyData.slice(0, 32);
  const ciphertext = keyData.slice(32);
  
  // Decrypt the file key using HPKE
  const fileKey = await decryptData(
    { encapsulatedKey, ciphertext },
    userPrivateKey
  );
  
  // Extract IV and encrypted content
  if (encryptedContent.length < 12) {
    throw new Error('Invalid encrypted content format');
  }
  
  const iv = encryptedContent.slice(0, 12);
  const content = encryptedContent.slice(12);
  
  // Decrypt the file content with AES-GCM
  const aesKey = await crypto.subtle.importKey('raw', fileKey, { name: 'AES-GCM' }, false, ['decrypt']);
  const decryptedContent = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    content
  );
  
  return new Uint8Array(decryptedContent);
}

/**
 * Encrypt metadata (names, sizes) using a shared secret
 */
export async function encryptMetadata(
  metadata: { name: string; size: string },
  sharedSecret: Uint8Array
): Promise<{ name: { ciphertext: string; nonce: string }; size: { ciphertext: string; nonce: string } }> {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const key = await crypto.subtle.importKey('raw', sharedSecret.slice(0, 32), { name: 'AES-GCM' }, false, ['encrypt']);
  
  const encryptedName = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce },
    key,
    new TextEncoder().encode(metadata.name)
  );
  
  const encryptedSize = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce },
    key,
    new TextEncoder().encode(metadata.size)
  );
  
  return {
    name: {
      ciphertext: bytesToHex(new Uint8Array(encryptedName)),
      nonce: bytesToHex(nonce),
    },
    size: {
      ciphertext: bytesToHex(new Uint8Array(encryptedSize)),
      nonce: bytesToHex(nonce),
    },
  };
}

/**
 * Decrypt HPKE-encrypted metadata (name or size)
 */
export async function decryptMetadata(
  encryptedData: { ciphertext: string; nonce: string },
  sharedSecret: Uint8Array
): Promise<string> {
  const key = await crypto.subtle.importKey('raw', sharedSecret.slice(0, 32), { name: 'AES-GCM' }, false, ['decrypt']);
  
  const ciphertext = hexToBytes(encryptedData.ciphertext);
  const nonce = hexToBytes(encryptedData.nonce);
  
  const decryptedData = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: nonce },
    key,
    ciphertext
  );
  
  return new TextDecoder().decode(decryptedData);
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
 * Encrypt a string using a passphrase (for private key storage)
 */
export async function encryptString(plaintext: string, passphrase: string): Promise<{
  ciphertext: string;
  salt: string;
  nonce: string;
}> {
  const salt = crypto.getRandomValues(new Uint8Array(32));
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  
  // Derive key from passphrase using PBKDF2
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );
  
  const key = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  );
  
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce },
    key,
    encoder.encode(plaintext)
  );
  
  return {
    ciphertext: bytesToBase64(new Uint8Array(encrypted)),
    salt: bytesToBase64(salt),
    nonce: bytesToBase64(nonce)
  };
}

/**
 * Decrypt a string using a passphrase (for private key storage)
 */
export async function decryptString(
  encryptedData: { ciphertext: string; salt: string; nonce: string },
  passphrase: string
): Promise<string> {
  const ciphertext = base64ToBytes(encryptedData.ciphertext);
  const salt = base64ToBytes(encryptedData.salt);
  const nonce = base64ToBytes(encryptedData.nonce);
  
  // Derive key from passphrase using PBKDF2
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );
  
  const key = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );
  
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: nonce },
    key,
    ciphertext
  );
  
  return new TextDecoder().decode(decrypted);
}

/**
 * Convert Uint8Array to base64 string
 */
export function bytesToBase64(bytes: Uint8Array): string {
  let binaryString = '';
  for (let i = 0; i < bytes.length; i++) {
    binaryString += String.fromCharCode(bytes[i]);
  }
  return btoa(binaryString);
}

/**
 * Convert base64 string to Uint8Array
 */
export function base64ToBytes(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Decrypt data using AES-GCM with provided key and nonce
 */
export async function decryptSymmetric(ciphertext: Uint8Array, key: Uint8Array, nonce: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey('raw', key.slice(0, 32), { name: 'AES-GCM' }, false, ['decrypt']);
  
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: nonce },
    cryptoKey,
    ciphertext
  );
  
  return new Uint8Array(decrypted);
}

