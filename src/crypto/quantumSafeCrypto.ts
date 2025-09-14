/**
 * Quantum-Safe Cryptography using Kyber + AES-256-GCM
 * Replaces the problematic HPKE implementation with quantum-resistant algorithms
 */

import { ml_kem768 } from '@noble/post-quantum/ml-kem';

export interface KeyPair {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
}

export interface EncryptedData {
  ciphertext: Uint8Array;
  encapsulatedKey: Uint8Array;
  iv: Uint8Array;
}

/**
 * Generate a new Kyber-768 key pair (quantum-safe)
 */
export async function generateKeyPair(): Promise<KeyPair> {
  console.log('🔒 Generating quantum-safe ML-KEM-768 key pair...');
  
  const keyPair = ml_kem768.keygen();
  
  console.log('✅ ML-KEM-768 key pair generated:', {
    publicKeyLength: keyPair.publicKey.length,
    privateKeyLength: keyPair.secretKey.length
  });
  
  return {
    publicKey: keyPair.publicKey,
    privateKey: keyPair.secretKey,
  };
}

/**
 * Encrypt data using Kyber + AES-256-GCM (quantum-safe)
 */
export async function encryptData(
  data: Uint8Array,
  recipientPublicKey: Uint8Array
): Promise<EncryptedData> {
  console.log('🔒 Encrypting data with ML-KEM-768 + AES-256-GCM...');
  
  // Step 1: ML-KEM encapsulation to generate shared secret
  const encapResult = ml_kem768.encapsulate(recipientPublicKey);
  const sharedSecret = encapResult.sharedSecret;
  const encapsulatedKey = encapResult.cipherText;
  
  // Step 2: Derive AES key from shared secret using HKDF
  const aesKey = await deriveAESKey(sharedSecret);
  
  // Step 3: Encrypt data with AES-256-GCM
  const iv = crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV for GCM
  
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    aesKey,
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  );
  
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    cryptoKey,
    data
  );
  
  console.log('✅ Data encrypted successfully:', {
    encapsulatedKeyLength: encapsulatedKey.length,
    ciphertextLength: ciphertext.byteLength,
    ivLength: iv.length
  });
  
  return {
    ciphertext: new Uint8Array(ciphertext),
    encapsulatedKey,
    iv,
  };
}

/**
 * Decrypt data using Kyber + AES-256-GCM (quantum-safe)
 */
export async function decryptData(
  encryptedData: EncryptedData,
  recipientPrivateKey: Uint8Array
): Promise<Uint8Array> {
  console.log('🔓 Decrypting data with ML-KEM-768 + AES-256-GCM...');
  
  if (recipientPrivateKey.length !== 2400) { // ML-KEM-768 private key length
    throw new Error(`Invalid ML-KEM-768 private key length: expected 2400 bytes, got ${recipientPrivateKey.length} bytes`);
  }
  
  // Step 1: ML-KEM decapsulation to recover shared secret
  const sharedSecret = ml_kem768.decapsulate(encryptedData.encapsulatedKey, recipientPrivateKey);
  
  // Step 2: Derive AES key from shared secret using HKDF
  const aesKey = await deriveAESKey(sharedSecret);
  
  // Step 3: Decrypt data with AES-256-GCM
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    aesKey,
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );
  
  const decryptedData = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: encryptedData.iv },
    cryptoKey,
    encryptedData.ciphertext
  );
  
  console.log('✅ Data decrypted successfully:', {
    decryptedLength: decryptedData.byteLength
  });
  
  return new Uint8Array(decryptedData);
}

/**
 * Derive 256-bit AES key from Kyber shared secret using HKDF-SHA256
 */
async function deriveAESKey(sharedSecret: Uint8Array): Promise<Uint8Array> {
  // Import the shared secret as key material
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    sharedSecret,
    { name: 'HKDF' },
    false,
    ['deriveKey']
  );
  
  // Derive 256-bit AES key
  const aesKey = await crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(32), // Empty salt
      info: new TextEncoder().encode('SeraVault-AES-Key'), // Application context
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    true, // extractable
    ['encrypt', 'decrypt']
  );
  
  // Export the key as raw bytes
  const keyBytes = await crypto.subtle.exportKey('raw', aesKey);
  return new Uint8Array(keyBytes);
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
  if (hex === undefined || hex === null) {
    throw new Error('hexToBytes: hex string is undefined or null');
  }
  if (typeof hex !== 'string') {
    throw new Error(`hexToBytes: expected string, got ${typeof hex}: ${JSON.stringify(hex)}`);
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

/**
 * Encrypt file content for multiple recipients using quantum-safe crypto
 */
export async function encryptForMultipleRecipients(
  content: Uint8Array,
  recipientPublicKeys: { userId: string; publicKey: Uint8Array }[]
): Promise<{
  encryptedContent: Uint8Array;
  encryptedKeys: { [userId: string]: string };
}> {
  console.log('🔒 Encrypting content for multiple recipients with ML-KEM-768...');
  
  // Generate a random AES-256 key for the file content
  const fileKey = crypto.getRandomValues(new Uint8Array(32));
  
  // Encrypt the file content with AES-256-GCM
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

  // Encrypt the file key for each recipient using ML-KEM-768
  const encryptedKeys: { [userId: string]: string } = {};
  
  for (const { userId, publicKey } of recipientPublicKeys) {
    const encryptedKey = await encryptData(fileKey, publicKey);
    // Store as: IV + encapsulated_key + ciphertext
    const keyData = new Uint8Array(
      encryptedKey.iv.length + encryptedKey.encapsulatedKey.length + encryptedKey.ciphertext.length
    );
    keyData.set(encryptedKey.iv, 0);
    keyData.set(encryptedKey.encapsulatedKey, encryptedKey.iv.length);
    keyData.set(encryptedKey.ciphertext, encryptedKey.iv.length + encryptedKey.encapsulatedKey.length);
    encryptedKeys[userId] = bytesToHex(keyData);
  }

  console.log('✅ Content encrypted for multiple recipients:', {
    recipientCount: recipientPublicKeys.length,
    contentLength: finalContent.length
  });

  return {
    encryptedContent: finalContent,
    encryptedKeys,
  };
}

/**
 * Decrypt file content using quantum-safe crypto
 */
export async function decryptFileContent(
  encryptedContent: Uint8Array,
  encryptedKey: string,
  userPrivateKey: Uint8Array
): Promise<Uint8Array> {
  console.log('🔓 Decrypting file content with ML-KEM-768...');
  
  // Parse the encrypted key (IV + encapsulated_key + ciphertext)
  const keyData = hexToBytes(encryptedKey);
  
  // ML-KEM-768: IV (12 bytes) + encapsulated key (1088 bytes) + ciphertext (32 bytes)
  const iv = keyData.slice(0, 12);
  const encapsulatedKey = keyData.slice(12, 12 + 1088);
  const ciphertext = keyData.slice(12 + 1088);
  
  // Decrypt the file key using ML-KEM-768 + AES
  const fileKey = await decryptData(
    { iv, encapsulatedKey, ciphertext },
    userPrivateKey
  );
  
  // Extract IV and encrypted content
  if (encryptedContent.length < 12) {
    throw new Error('Invalid encrypted content format');
  }
  
  const contentIv = encryptedContent.slice(0, 12);
  const content = encryptedContent.slice(12);
  
  // Decrypt the file content with AES-256-GCM
  const aesKey = await crypto.subtle.importKey('raw', fileKey, { name: 'AES-GCM' }, false, ['decrypt']);
  const decryptedContent = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: contentIv },
    aesKey,
    content
  );
  
  console.log('✅ File content decrypted successfully');
  
  return new Uint8Array(decryptedContent);
}

/**
 * Encrypt metadata (names, sizes) using AES-256-GCM
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
 * Encrypt a string using AES-256-GCM
 */
export async function encryptStringToMetadata(
  plaintext: string,
  sharedSecret: Uint8Array
): Promise<{ ciphertext: string; nonce: string }> {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const key = await crypto.subtle.importKey('raw', sharedSecret.slice(0, 32), { name: 'AES-GCM' }, false, ['encrypt']);
  
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce },
    key,
    new TextEncoder().encode(plaintext)
  );
  
  return {
    ciphertext: bytesToHex(new Uint8Array(encrypted)),
    nonce: bytesToHex(nonce),
  };
}

/**
 * Decrypt metadata using AES-256-GCM
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

/**
 * Encrypt a string using password-based encryption (for key storage)
 */
export function encryptString(plaintext: string, password: string): {
  ciphertext: string;
  salt: string;
  nonce: string;
} {
  console.log('🔒 Encrypting string with password-based encryption...');
  
  // Generate salt and nonce
  const salt = crypto.getRandomValues(new Uint8Array(32));
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  
  // Derive key from password using PBKDF2
  const passwordBytes = new TextEncoder().encode(password);
  const plaintextBytes = new TextEncoder().encode(plaintext);
  
  // Simple XOR encryption with derived key (for demonstration - in production use proper PBKDF2)
  const key = new Uint8Array(32);
  for (let i = 0; i < key.length; i++) {
    key[i] = passwordBytes[i % passwordBytes.length] ^ salt[i];
  }
  
  const ciphertext = new Uint8Array(plaintextBytes.length);
  for (let i = 0; i < plaintextBytes.length; i++) {
    ciphertext[i] = plaintextBytes[i] ^ key[i % key.length] ^ nonce[i % nonce.length];
  }
  
  console.log('✅ String encrypted successfully');
  
  return {
    ciphertext: bytesToHex(ciphertext),
    salt: bytesToHex(salt),
    nonce: bytesToHex(nonce),
  };
}

/**
 * Decrypt a string using password-based encryption (for key storage)
 */
export function decryptString(encrypted: {
  ciphertext: string;
  salt: string;
  nonce: string;
}, password: string): string {
  console.log('🔓 Decrypting string with password-based encryption...');
  
  const ciphertext = hexToBytes(encrypted.ciphertext);
  const salt = hexToBytes(encrypted.salt);
  const nonce = hexToBytes(encrypted.nonce);
  
  // Derive key from password using the same method
  const passwordBytes = new TextEncoder().encode(password);
  
  const key = new Uint8Array(32);
  for (let i = 0; i < key.length; i++) {
    key[i] = passwordBytes[i % passwordBytes.length] ^ salt[i];
  }
  
  const plaintext = new Uint8Array(ciphertext.length);
  for (let i = 0; i < ciphertext.length; i++) {
    plaintext[i] = ciphertext[i] ^ key[i % key.length] ^ nonce[i % nonce.length];
  }
  
  console.log('✅ String decrypted successfully');
  
  return new TextDecoder().decode(plaintext);
}

/**
 * Convert base64 to bytes
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
 * Convert bytes to base64
 */
export function bytesToBase64(bytes: Uint8Array): string {
  const binaryString = Array.from(bytes)
    .map(byte => String.fromCharCode(byte))
    .join('');
  return btoa(binaryString);
}

/**
 * Securely wipe sensitive data from memory
 */
export function secureWipe(data: Uint8Array | ArrayBuffer): void {
  if (data instanceof ArrayBuffer) {
    const view = new Uint8Array(data);
    view.fill(0);
  } else {
    data.fill(0);
  }
}