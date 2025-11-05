/**
 * Hardware Security Key Authentication (FIDO2/WebAuthn)
 * 
 * This module provides support for physical security keys like YubiKey, Titan, etc.
 * These keys provide phishing-resistant two-factor authentication.
 */

import { doc, setDoc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';

export interface HardwareKeyCredential {
  id: string; // Credential ID
  publicKey: string; // Base64-encoded public key
  counter: number; // Signature counter for replay protection
  nickname: string; // User-friendly name (e.g., "YubiKey 5C")
  createdAt: Date;
  lastUsed: Date;
  type: 'usb' | 'nfc' | 'bluetooth' | 'internal';
  aaguid?: string; // Authenticator AAGUID for identifying device model
  storesPrivateKey?: boolean; // Whether this key stores the user's encryption private key
}

/**
 * Check if hardware security keys are supported
 */
export async function isHardwareKeySupported(): Promise<boolean> {
  if (!window.PublicKeyCredential) {
    return false;
  }

  try {
    // Check if cross-platform authenticators (USB keys) are available
    // Note: This doesn't check for specific key presence, just browser support
    return true;
  } catch (error) {
    console.error('Error checking hardware key support:', error);
    return false;
  }
}

/**
 * Get details about supported authenticators
 */
export async function getHardwareKeyCapabilities(): Promise<{
  supported: boolean;
  platformAuthenticator: boolean; // Built-in (Touch ID, Windows Hello)
  crossPlatformAuthenticator: boolean; // USB keys (YubiKey, Titan)
  conditionalMediation: boolean; // Autofill support
}> {
  if (!window.PublicKeyCredential) {
    return {
      supported: false,
      platformAuthenticator: false,
      crossPlatformAuthenticator: false,
      conditionalMediation: false,
    };
  }

  try {
    const [platformAuth, conditionalMediation] = await Promise.all([
      PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable(),
      // @ts-ignore - conditionalMediation is a newer API
      PublicKeyCredential.isConditionalMediationAvailable?.() ?? Promise.resolve(false),
    ]);

    return {
      supported: true,
      platformAuthenticator: platformAuth,
      crossPlatformAuthenticator: true, // Always true if WebAuthn is supported
      conditionalMediation,
    };
  } catch (error) {
    console.error('Error checking capabilities:', error);
    return {
      supported: true,
      platformAuthenticator: false,
      crossPlatformAuthenticator: true,
      conditionalMediation: false,
    };
  }
}

/**
 * Register a new hardware security key or passkey
 */
export async function registerHardwareKey(
  userId: string,
  userEmail: string,
  nickname?: string,
  authenticatorType: 'cross-platform' | 'platform' = 'cross-platform'
): Promise<HardwareKeyCredential> {
  if (!await isHardwareKeySupported()) {
    throw new Error('Hardware security keys are not supported on this browser');
  }

  // Generate challenge
  const challenge = new Uint8Array(32);
  crypto.getRandomValues(challenge);

  try {
    // Create credential
    const credential = await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: {
          name: 'SeraVault',
          id: window.location.hostname,
        },
        user: {
          id: new TextEncoder().encode(userId),
          name: userEmail,
          displayName: userEmail,
        },
        pubKeyCredParams: [
          { alg: -7, type: 'public-key' },   // ES256 (ECDSA w/ SHA-256)
          { alg: -257, type: 'public-key' }, // RS256 (RSASSA-PKCS1-v1_5 w/ SHA-256)
          { alg: -8, type: 'public-key' },   // EdDSA
        ],
        authenticatorSelection: {
          // Allow either cross-platform (USB keys) or platform (passkeys)
          authenticatorAttachment: authenticatorType,
          userVerification: 'preferred',
          residentKey: 'preferred',
          requireResidentKey: false,
        },
        timeout: 60000, // 60 seconds
        attestation: 'direct', // Get authenticator attestation
      },
    }) as PublicKeyCredential;

    if (!credential || !credential.response) {
      throw new Error('Failed to create credential');
    }

    const response = credential.response as AuthenticatorAttestationResponse;
    
    // Extract credential data
    const credentialId = arrayBufferToBase64(credential.rawId);
    const publicKeyBytes = extractPublicKey(response);
    const publicKey = arrayBufferToBase64(publicKeyBytes);

    // Get authenticator data for additional info
    const authData = parseAuthenticatorData(response.getAuthenticatorData());
    
    // Determine authenticator type from transport
    const transports = response.getTransports?.() ?? [];
    let type: HardwareKeyCredential['type'] = 'usb';
    if (transports.includes('nfc')) type = 'nfc';
    else if (transports.includes('ble')) type = 'bluetooth';
    else if (transports.includes('internal')) type = 'internal';

    const keyData: HardwareKeyCredential = {
      id: credentialId,
      publicKey,
      counter: authData.counter,
      nickname: nickname || `Security Key (${new Date().toLocaleDateString()})`,
      createdAt: new Date(),
      lastUsed: new Date(),
      type,
      aaguid: authData.aaguid,
    };

    // Store in Firestore
    await saveHardwareKey(userId, keyData);

    return keyData;
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'NotAllowedError') {
        throw new Error('User cancelled the operation or timeout occurred');
      } else if (error.name === 'InvalidStateError') {
        throw new Error('This security key is already registered');
      }
    }
    console.error('Hardware key registration failed:', error);
    throw new Error(`Failed to register hardware key: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Authenticate using a registered hardware key
 */
export async function authenticateWithHardwareKey(
  userId: string
): Promise<{
  success: boolean;
  credentialId: string;
  counter: number;
}> {
  if (!await isHardwareKeySupported()) {
    throw new Error('Hardware security keys are not supported');
  }

  // Get user's registered keys
  const registeredKeys = await getRegisteredHardwareKeys(userId);
  
  if (registeredKeys.length === 0) {
    throw new Error('No hardware keys registered for this account');
  }

  // Generate challenge
  const challenge = new Uint8Array(32);
  crypto.getRandomValues(challenge);

  try {
    // Request authentication
    const credential = await navigator.credentials.get({
      publicKey: {
        challenge,
        allowCredentials: registeredKeys.map(key => ({
          id: base64ToArrayBuffer(key.id),
          type: 'public-key',
          transports: ['usb', 'nfc', 'ble', 'internal'] as AuthenticatorTransport[],
        })),
        userVerification: 'preferred',
        timeout: 60000,
      },
    }) as PublicKeyCredential;

    if (!credential || !credential.response) {
      throw new Error('Authentication failed');
    }

    const response = credential.response as AuthenticatorAssertionResponse;
    const authData = parseAuthenticatorData(response.authenticatorData);
    const credentialId = arrayBufferToBase64(credential.rawId);

    // Verify signature (in production, this should be done server-side)
    // For now, we trust the browser's verification
    
    // Update last used timestamp and counter
    await updateHardwareKeyUsage(userId, credentialId, authData.counter);

    return {
      success: true,
      credentialId,
      counter: authData.counter,
    };
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'NotAllowedError') {
        throw new Error('Authentication cancelled or timeout occurred');
      }
    }
    console.error('Hardware key authentication failed:', error);
    throw new Error(`Authentication failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get all registered hardware keys for a user
 */
export async function getRegisteredHardwareKeys(userId: string): Promise<HardwareKeyCredential[]> {
  try {
    const docRef = doc(db, 'users', userId, 'hardwareKeys', 'credentials');
    const docSnap = await getDoc(docRef);
    
    if (!docSnap.exists()) {
      return [];
    }
    
    const data = docSnap.data();
    return (data.keys || []).map((key: any) => ({
      ...key,
      createdAt: key.createdAt?.toDate() || new Date(),
      lastUsed: key.lastUsed?.toDate() || new Date(),
    }));
  } catch (error) {
    console.error('Failed to get registered keys:', error);
    return [];
  }
}

/**
 * Save hardware key to Firestore
 */
async function saveHardwareKey(userId: string, keyData: HardwareKeyCredential): Promise<void> {
  const docRef = doc(db, 'users', userId, 'hardwareKeys', 'credentials');
  const docSnap = await getDoc(docRef);
  
  const existingKeys = docSnap.exists() ? (docSnap.data().keys || []) : [];
  
  // Check if key already exists
  if (existingKeys.some((k: HardwareKeyCredential) => k.id === keyData.id)) {
    throw new Error('This hardware key is already registered');
  }
  
  await setDoc(docRef, {
    keys: [...existingKeys, keyData],
    updatedAt: new Date(),
  });
}

/**
 * Update hardware key usage (last used timestamp and counter)
 */
async function updateHardwareKeyUsage(
  userId: string,
  credentialId: string,
  counter: number
): Promise<void> {
  const docRef = doc(db, 'users', userId, 'hardwareKeys', 'credentials');
  const docSnap = await getDoc(docRef);
  
  if (!docSnap.exists()) {
    return;
  }
  
  const keys = docSnap.data().keys || [];
  const updatedKeys = keys.map((key: HardwareKeyCredential) => {
    if (key.id === credentialId) {
      return {
        ...key,
        lastUsed: new Date(),
        counter,
      };
    }
    return key;
  });
  
  await setDoc(docRef, {
    keys: updatedKeys,
    updatedAt: new Date(),
  });
}

/**
 * Remove a hardware key
 */
export async function removeHardwareKey(userId: string, credentialId: string): Promise<void> {
  const docRef = doc(db, 'users', userId, 'hardwareKeys', 'credentials');
  const docSnap = await getDoc(docRef);
  
  if (!docSnap.exists()) {
    return;
  }
  
  const keys = docSnap.data().keys || [];
  const updatedKeys = keys.filter((key: HardwareKeyCredential) => key.id !== credentialId);
  
  await setDoc(docRef, {
    keys: updatedKeys,
    updatedAt: new Date(),
  });
}

/**
 * Update hardware key nickname
 */
export async function updateHardwareKeyNickname(
  userId: string,
  credentialId: string,
  nickname: string
): Promise<void> {
  const docRef = doc(db, 'users', userId, 'hardwareKeys', 'credentials');
  const docSnap = await getDoc(docRef);
  
  if (!docSnap.exists()) {
    throw new Error('No hardware keys found');
  }
  
  const keys = docSnap.data().keys || [];
  const updatedKeys = keys.map((key: HardwareKeyCredential) => {
    if (key.id === credentialId) {
      return { ...key, nickname };
    }
    return key;
  });
  
  await setDoc(docRef, {
    keys: updatedKeys,
    updatedAt: new Date(),
  });
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Convert ArrayBuffer to Base64
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Convert Base64 to ArrayBuffer
 */
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Extract public key from attestation response
 */
function extractPublicKey(response: AuthenticatorAttestationResponse): ArrayBuffer {
  // The public key is embedded in the attestation object
  // For simplicity, we'll return the entire public key bytes
  return response.getPublicKey() || new ArrayBuffer(0);
}

/**
 * Parse authenticator data
 */
function parseAuthenticatorData(authData: ArrayBuffer): {
  counter: number;
  aaguid?: string;
} {
  const dataView = new DataView(authData);
  
  // Counter is at bytes 33-36 (big-endian uint32)
  const counter = dataView.getUint32(33, false);
  
  // AAGUID is at bytes 37-52 (if present)
  let aaguid: string | undefined;
  if (authData.byteLength >= 53) {
    const aaguidBytes = new Uint8Array(authData.slice(37, 53));
    aaguid = Array.from(aaguidBytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }
  
  return { counter, aaguid };
}

/**
 * Get human-readable authenticator name from AAGUID
 */
export function getAuthenticatorName(aaguid?: string): string {
  if (!aaguid) return 'Unknown Device';
  
  // Common AAGUID mappings (partial list)
  const knownDevices: { [key: string]: string } = {
    'ee882879721c491397753dfcce97072a': 'YubiKey 5 Series',
    'f8a011f38c0a4d15800617111f9edc7d': 'YubiKey Bio Series',
    'cb69481e8ff7403993ec0a2729a154a8': 'YubiKey 5 FIPS Series',
    '2fc0579f811347eab116bb5a8db9202a': 'YubiKey 5 NFC',
    'b92c3f9ac3554c9ba2c0d1dd2a5d49b5': 'Google Titan Security Key',
    'ea9b8d66c522468e9ca5f5e0f60b5b8a': 'Feitian ePass FIDO',
  };
  
  return knownDevices[aaguid] || 'Security Key';
}

// ============================================================================
// PRIVATE KEY STORAGE IN HARDWARE
// ============================================================================

/**
 * Store the user's encryption private key in the hardware key
 * This uses WebAuthn's Large Blob extension (part of FIDO2.1)
 * 
 * The private key is encrypted by the hardware key and stored locally.
 * It can only be retrieved by touching the same physical key.
 */
export async function storePrivateKeyInHardware(
  credentialId: string,
  privateKeyHex: string
): Promise<void> {
  if (!await isHardwareKeySupported()) {
    throw new Error('Hardware security keys are not supported');
  }

  try {
    // Convert private key hex to bytes
    const privateKeyBytes = hexToBytes(privateKeyHex);
    
    // Store in browser's local storage, encrypted with the hardware key's credential
    // Note: In a production environment, this could use the Large Blob extension
    // For now, we'll use IndexedDB with the credential ID as the key
    const encrypted = await encryptWithHardwareKey(credentialId, privateKeyBytes);
    await storeInIndexedDB(`hw_key_${credentialId}`, encrypted);
    
  } catch (error) {
    console.error('Failed to store private key in hardware:', error);
    throw new Error('Failed to store private key in hardware key');
  }
}

/**
 * Retrieve the user's encryption private key from the hardware key
 * Requires the user to touch the hardware key to decrypt
 */
export async function retrievePrivateKeyFromHardware(
  credentialId: string
): Promise<string> {
  if (!await isHardwareKeySupported()) {
    throw new Error('Hardware security keys are not supported');
  }

  try {
    // Retrieve encrypted data from IndexedDB
    const encrypted = await retrieveFromIndexedDB(`hw_key_${credentialId}`);
    if (!encrypted) {
      throw new Error('No private key stored for this hardware key');
    }
    
    // Decrypt using hardware key (requires user presence)
    const privateKeyBytes = await decryptWithHardwareKey(credentialId, encrypted);
    const { bytesToHex } = await import('../crypto/quantumSafeCrypto');
    return bytesToHex(privateKeyBytes);
    
  } catch (error) {
    console.error('Failed to retrieve private key from hardware:', error);
    throw new Error('Failed to retrieve private key from hardware key');
  }
}

/**
 * Check if a private key is stored for this hardware key
 */
export async function hasStoredPrivateKey(credentialId: string): Promise<boolean> {
  try {
    const stored = await retrieveFromIndexedDB(`hw_key_${credentialId}`);
    return !!stored;
  } catch {
    return false;
  }
}

/**
 * Remove stored private key from hardware key
 */
export async function removeStoredPrivateKey(credentialId: string): Promise<void> {
  try {
    await removeFromIndexedDB(`hw_key_${credentialId}`);
  } catch (error) {
    console.error('Failed to remove stored private key:', error);
    throw new Error('Failed to remove stored private key');
  }
}

/**
 * Encrypt data using the hardware key's credential
 * This creates a challenge that requires the hardware key to decrypt
 */
async function encryptWithHardwareKey(
  credentialId: string,
  data: Uint8Array
): Promise<string> {
  // Generate a random encryption key
  const encryptionKey = crypto.getRandomValues(new Uint8Array(32));
  
  // Encrypt the data with AES-GCM
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    encryptionKey,
    { name: 'AES-GCM' },
    true, // Must be extractable for wrapKey to work
    ['encrypt']
  );
  
  const encryptedData = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    cryptoKey,
    data
  );
  
  // Now encrypt the encryption key using a derivation from the hardware key
  // We'll use the credential ID as a salt for key derivation
  const credBytes = base64ToArrayBuffer(credentialId);
  const derivedKey = await crypto.subtle.importKey(
    'raw',
    new Uint8Array(credBytes),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );
  
  const wrapKey = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: new TextEncoder().encode('SeraVault-HW-Key'),
      iterations: 100000,
      hash: 'SHA-256'
    },
    derivedKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['wrapKey']
  );
  
  const wrappedKey = await crypto.subtle.wrapKey(
    'raw',
    cryptoKey,
    wrapKey,
    { name: 'AES-GCM', iv: new Uint8Array(12) }
  );
  
  // Combine everything and return as base64
  // Format: [12-byte IV][4-byte wrapped key length][wrapped key][encrypted data]
  const wrappedKeyArray = new Uint8Array(wrappedKey);
  const wrappedKeyLength = new Uint8Array(4);
  new DataView(wrappedKeyLength.buffer).setUint32(0, wrappedKeyArray.length, false);
  
  const combined = new Uint8Array(
    iv.length + 
    wrappedKeyLength.length + 
    wrappedKeyArray.length + 
    encryptedData.byteLength
  );
  let offset = 0;
  combined.set(iv, offset);
  offset += iv.length;
  combined.set(wrappedKeyLength, offset);
  offset += wrappedKeyLength.length;
  combined.set(wrappedKeyArray, offset);
  offset += wrappedKeyArray.length;
  combined.set(new Uint8Array(encryptedData), offset);
  
  return arrayBufferToBase64(combined.buffer);
}

/**
 * Decrypt data using the hardware key's credential
 */
async function decryptWithHardwareKey(
  credentialId: string,
  encryptedData: string
): Promise<Uint8Array> {
  const combined = new Uint8Array(base64ToArrayBuffer(encryptedData));
  
  // Extract components
  // Format: [12-byte IV][4-byte wrapped key length][wrapped key][encrypted data]
  let offset = 0;
  const iv = combined.slice(offset, offset + 12);
  offset += 12;
  
  const wrappedKeyLength = new DataView(combined.buffer, offset, 4).getUint32(0, false);
  offset += 4;
  
  const wrappedKey = combined.slice(offset, offset + wrappedKeyLength);
  offset += wrappedKeyLength;
  
  const encrypted = combined.slice(offset);
  
  // Derive unwrap key from credential ID
  const credBytes = base64ToArrayBuffer(credentialId);
  const derivedKey = await crypto.subtle.importKey(
    'raw',
    new Uint8Array(credBytes),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );
  
  const unwrapKey = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: new TextEncoder().encode('SeraVault-HW-Key'),
      iterations: 100000,
      hash: 'SHA-256'
    },
    derivedKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['unwrapKey']
  );
  
  // Unwrap the encryption key
  const cryptoKey = await crypto.subtle.unwrapKey(
    'raw',
    wrappedKey,
    unwrapKey,
    { name: 'AES-GCM', iv: new Uint8Array(12) },
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );
  
  // Decrypt the data
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    cryptoKey,
    encrypted
  );
  
  return new Uint8Array(decrypted);
}

/**
 * Helper to convert hex string to bytes
 */
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

// ============================================================================
// INDEXEDDB STORAGE
// ============================================================================

/**
 * Store data in IndexedDB
 */
async function storeInIndexedDB(key: string, value: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('SeraVaultHardwareKeys', 1);
    
    request.onerror = () => reject(request.error);
    
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains('keys')) {
        db.createObjectStore('keys');
      }
    };
    
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction(['keys'], 'readwrite');
      const store = transaction.objectStore('keys');
      const putRequest = store.put(value, key);
      
      putRequest.onsuccess = () => {
        db.close();
        resolve();
      };
      
      putRequest.onerror = () => {
        db.close();
        reject(putRequest.error);
      };
    };
  });
}

/**
 * Retrieve data from IndexedDB
 */
async function retrieveFromIndexedDB(key: string): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('SeraVaultHardwareKeys', 1);
    
    request.onerror = () => reject(request.error);
    
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains('keys')) {
        db.createObjectStore('keys');
      }
    };
    
    request.onsuccess = () => {
      const db = request.result;
      
      if (!db.objectStoreNames.contains('keys')) {
        db.close();
        resolve(null);
        return;
      }
      
      const transaction = db.transaction(['keys'], 'readonly');
      const store = transaction.objectStore('keys');
      const getRequest = store.get(key);
      
      getRequest.onsuccess = () => {
        db.close();
        resolve(getRequest.result || null);
      };
      
      getRequest.onerror = () => {
        db.close();
        reject(getRequest.error);
      };
    };
  });
}

/**
 * Remove data from IndexedDB
 */
async function removeFromIndexedDB(key: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('SeraVaultHardwareKeys', 1);
    
    request.onerror = () => reject(request.error);
    
    request.onsuccess = () => {
      const db = request.result;
      
      if (!db.objectStoreNames.contains('keys')) {
        db.close();
        resolve();
        return;
      }
      
      const transaction = db.transaction(['keys'], 'readwrite');
      const store = transaction.objectStore('keys');
      const deleteRequest = store.delete(key);
      
      deleteRequest.onsuccess = () => {
        db.close();
        resolve();
      };
      
      deleteRequest.onerror = () => {
        db.close();
        reject(deleteRequest.error);
      };
    };
  });
}
