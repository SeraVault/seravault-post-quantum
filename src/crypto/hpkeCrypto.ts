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
  const privateKey = await suite.kem.deserializePrivateKey(recipientPrivateKey);
  
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
 * Decrypt metadata using shared secret
 */
export async function decryptMetadata(
  encryptedField: string | { ciphertext: string; nonce: string },
  sharedSecret: Uint8Array
): Promise<string> {
  // Handle legacy string format
  if (typeof encryptedField === 'string') {
    return encryptedField; // Return as-is for legacy data
  }
  
  const nonce = hexToBytes(encryptedField.nonce);
  const ciphertext = hexToBytes(encryptedField.ciphertext);
  const key = await crypto.subtle.importKey('raw', sharedSecret.slice(0, 32), { name: 'AES-GCM' }, false, ['decrypt']);
  
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: nonce },
    key,
    ciphertext
  );
  
  return new TextDecoder().decode(decrypted);
}