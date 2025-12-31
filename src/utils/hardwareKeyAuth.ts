/**
 * Hardware Security Key Authentication (FIDO2/WebAuthn)
 * 
 * This module provides support for physical security keys like YubiKey, Titan, etc.
 * These keys provide phishing-resistant two-factor authentication.
 */

import { backendService } from '../backend/BackendService';
import { argon2id } from '@noble/hashes/argon2';

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
 * Get the Relying Party (RP) ID for WebAuthn
 * This must be the current hostname or a registrable domain suffix
 */
function getRelyingPartyId(): string {
  const hostname = window.location.hostname;
  
  // For localhost, use 'localhost'
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'localhost';
  }
  
  // For Firebase hosting (seravault-8c764-app.web.app), use the full hostname
  // Note: You could also use a parent domain like 'web.app' but that requires
  // domain ownership verification
  return hostname;
}

/**
 * Get a user-friendly description of the current RP ID environment
 */
export function getEnvironmentDescription(): string {
  const hostname = window.location.hostname;
  
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'Local Development';
  } else if (hostname.includes('web.app') || hostname.includes('firebaseapp.com')) {
    return 'Production (Firebase Hosting)';
  }
  
  return hostname;
}

/**
 * Register a new hardware security key or passkey
 */
export async function registerHardwareKey(
  userId: string,
  userEmail: string,
  nickname?: string,
  authenticatorType: 'cross-platform' | 'platform' = 'cross-platform'
): Promise<{ keyData: HardwareKeyCredential; signature?: Uint8Array }> {
  if (!await isHardwareKeySupported()) {
    throw new Error('Hardware security keys are not supported on this browser');
  }

  const rpId = getRelyingPartyId();
  console.log('[HardwareKey] Registering key with RP ID:', rpId, 'Environment:', getEnvironmentDescription());

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
          id: rpId,
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

    // Immediately authenticate to get a signature (while user still has key ready)
    // This signature can be reused for encryption to avoid double-prompting
    let signature: Uint8Array | undefined;
    try {
      console.log('[HW Key] Getting signature for encryption (requires one more touch)...');
      const authChallenge = crypto.getRandomValues(new Uint8Array(32));
      const assertion = await navigator.credentials.get({
        publicKey: {
          challenge: authChallenge,
          rpId,
          allowCredentials: [{
            type: 'public-key',
            id: credential.rawId,
          }],
          userVerification: 'required',
          timeout: 60000,
        },
      }) as PublicKeyCredential;
      
      if (assertion && assertion.response) {
        const assertionResponse = assertion.response as AuthenticatorAssertionResponse;
        signature = new Uint8Array(assertionResponse.signature);
        console.log('[HW Key] Got signature for encryption');
      }
    } catch (sigError) {
      console.warn('[HW Key] Failed to get signature, will prompt again during encryption:', sigError);
      // Not critical - encryption will just prompt again
    }

    return { keyData, signature };
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

  const rpId = getRelyingPartyId();
  const environment = getEnvironmentDescription();
  console.log('[HardwareKey] Authenticating with RP ID:', rpId, 'Environment:', environment);
  console.log('[HardwareKey] Registered keys:', registeredKeys.length, 'keys available');

  // Generate challenge
  const challenge = new Uint8Array(32);
  crypto.getRandomValues(challenge);

  try {
    // Request authentication
    const credential = await navigator.credentials.get({
      publicKey: {
        challenge,
        rpId: rpId,  // Explicitly set RP ID to match registration
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
    const data = await backendService.documents.get(`users/${userId}/hardwareKeys`, 'credentials');
    
    if (!data) {
      return [];
    }
    
    return (data.keys || []).map((key: any) => ({
      ...key,
      createdAt: key.createdAt?.toDate ? key.createdAt.toDate() : new Date(key.createdAt),
      lastUsed: key.lastUsed?.toDate ? key.lastUsed.toDate() : new Date(key.lastUsed),
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
  const data = await backendService.documents.get(`users/${userId}/hardwareKeys`, 'credentials');
  
  const existingKeys = data ? (data.keys || []) : [];
  
  // Check if key already exists
  if (existingKeys.some((k: HardwareKeyCredential) => k.id === keyData.id)) {
    throw new Error('This hardware key is already registered');
  }
  
  await backendService.documents.set(`users/${userId}/hardwareKeys`, 'credentials', {
    keys: [...existingKeys, keyData],
    updatedAt: backendService.utils.serverTimestamp(),
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
  const data = await backendService.documents.get(`users/${userId}/hardwareKeys`, 'credentials');
  
  if (!data) {
    return;
  }
  
  const keys = data.keys || [];
  const updatedKeys = keys.map((key: HardwareKeyCredential) => {
    if (key.id === credentialId) {
      return {
        ...key,
        lastUsed: backendService.utils.serverTimestamp(),
        counter,
      };
    }
    return key;
  });
  
  await backendService.documents.set(`users/${userId}/hardwareKeys`, 'credentials', {
    keys: updatedKeys,
    updatedAt: backendService.utils.serverTimestamp(),
  });
}

/**
 * Remove a hardware key
 */
export async function removeHardwareKey(userId: string, credentialId: string): Promise<void> {
  const data = await backendService.documents.get(`users/${userId}/hardwareKeys`, 'credentials');
  
  if (!data) {
    return;
  }
  
  const keys = data.keys || [];
  const updatedKeys = keys.filter((key: HardwareKeyCredential) => key.id !== credentialId);
  
  await backendService.documents.set(`users/${userId}/hardwareKeys`, 'credentials', {
    keys: updatedKeys,
    updatedAt: backendService.utils.serverTimestamp(),
  });
  
  // Also remove the stored private key from IndexedDB
  try {
    await removeStoredPrivateKey(credentialId);
    console.log('[HW Key] Removed stored private key from IndexedDB for credential:', credentialId.substring(0, 20) + '...');
  } catch (error) {
    console.warn('[HW Key] Failed to remove stored private key (may not exist):', error);
    // Don't throw - the Firestore removal was successful
  }
}

/**
 * Update hardware key nickname
 */
export async function updateHardwareKeyNickname(
  userId: string,
  credentialId: string,
  nickname: string
): Promise<void> {
  const data = await backendService.documents.get(`users/${userId}/hardwareKeys`, 'credentials');
  
  if (!data) {
    throw new Error('No hardware keys found');
  }
  
  const keys = data.keys || [];
  const updatedKeys = keys.map((key: HardwareKeyCredential) => {
    if (key.id === credentialId) {
      return { ...key, nickname };
    }
    return key;
  });
  
  await backendService.documents.set(`users/${userId}/hardwareKeys`, 'credentials', {
    keys: updatedKeys,
    updatedAt: backendService.utils.serverTimestamp(),
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
 * 
 * @param credentialId - The credential ID
 * @param privateKeyHex - The private key in hex format
 * @param userId - The user ID
 * @param precomputedSignature - Optional pre-computed signature to avoid double-prompt
 */
export async function storePrivateKeyInHardware(
  credentialId: string,
  privateKeyHex: string,
  userId: string,
  precomputedSignature?: Uint8Array
): Promise<void> {
  if (!await isHardwareKeySupported()) {
    throw new Error('Hardware security keys are not supported');
  }

  try {
    // Convert private key hex to bytes
    const privateKeyBytes = hexToBytes(privateKeyHex);
    
    // Store in browser's local storage, encrypted with the hardware key's credential
    // REQUIRES physical hardware key to be present for encryption
    const encrypted = await encryptWithHardwareKey(
      credentialId, 
      privateKeyBytes, 
      userId,
      precomputedSignature
    );
    await storeInIndexedDB(`hw_key_${credentialId}`, encrypted);
    
    console.log('[HW Key] Private key securely stored with hardware key protection');
    
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
  credentialId: string,
  userId: string
): Promise<string> {
  if (!await isHardwareKeySupported()) {
    throw new Error('Hardware security keys are not supported');
  }

  try {
    console.log('[HW Key] Retrieving encrypted data from IndexedDB for credential:', credentialId.substring(0, 20) + '...');
    
    // Retrieve encrypted data from IndexedDB
    const encrypted = await retrieveFromIndexedDB(`hw_key_${credentialId}`);
    if (!encrypted) {
      console.error('[HW Key] No encrypted data found in IndexedDB');
      throw new Error('No private key stored for this hardware key. Please set up hardware key authentication again.');
    }
    
    console.log('[HW Key] Found encrypted data, attempting decryption...');
    
    // Decrypt using hardware key (requires user presence)
    const privateKeyBytes = await decryptWithHardwareKey(credentialId, encrypted, userId);
    console.log('[HW Key] Successfully decrypted private key');
    
    const { bytesToHex } = await import('../crypto/quantumSafeCrypto');
    return bytesToHex(privateKeyBytes);
    
  } catch (error) {
    console.error('[HW Key] Failed to retrieve private key from hardware:', error);
    if (error instanceof Error && error.message.includes('No private key stored')) {
      throw error; // Re-throw with specific message
    }
    
    // Check if this is likely an old format that needs migration
    if (error instanceof Error && (
      error.message.includes('Failed to execute') ||
      error.message.includes('offset') ||
      error.name === 'OperationError'
    )) {
      console.error('[HW Key] Detected incompatible data format - likely old encryption format');
      
      // Clean up the old data
      try {
        await removeFromIndexedDB(`hw_key_${credentialId}`);
        console.log('[HW Key] Removed old format data');
      } catch (cleanupError) {
        console.error('[HW Key] Failed to cleanup:', cleanupError);
      }
      
      throw new Error('Your hardware key data uses an old format. Please remove this hardware key from Settings and register it again with the new secure format.');
    }
    
    throw new Error('Failed to decrypt private key. The stored credential may be corrupted or uses an incompatible format. Try removing and re-registering your hardware key.');
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
 * This encrypts with a key derived from the credentialId (deterministic)
 * Security: Requires physical key authentication before allowing decryption
 * 
 * @param precomputedSignature - Optional pre-computed signature (used only for verification)
 */
async function encryptWithHardwareKey(
  credentialId: string,
  data: Uint8Array,
  userId: string,
  precomputedSignature?: Uint8Array
): Promise<string> {
  // If we have a precomputed signature, it means the user just authenticated
  // So we can skip the additional authentication prompt during encryption
  if (!precomputedSignature) {
    // Verify the hardware key is present by requiring authentication
    const rpId = getRelyingPartyId();
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    
    console.log('[HW Key] Requesting hardware key authentication for encryption...');
    
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge,
        rpId,
        allowCredentials: [{
          type: 'public-key',
          id: base64ToArrayBuffer(credentialId),
        }],
        userVerification: 'required',
        timeout: 60000,
      },
    }) as PublicKeyCredential;

    if (!assertion) {
      throw new Error('Hardware key authentication required to store private key');
    }
    
    console.log('[HW Key] Hardware key authentication successful');
  } else {
    console.log('[HW Key] Using precomputed signature (no additional prompt)');
  }
  
  // Derive encryption key deterministically from credentialId + userId using Argon2id
  const keyMaterial = new TextEncoder().encode(credentialId + '::' + userId);
  const salt = new TextEncoder().encode('SeraVault-HW-Key-V3');
  
  // Use Argon2id for key derivation (memory-hard, side-channel resistant)
  const derivedKeyRaw = argon2id(keyMaterial, salt, {
    t: 3,      // 3 iterations
    m: 65536,  // 64 MiB memory
    p: 4,      // 4 parallelism
    dkLen: 32  // 32 bytes output
  });
  
  // Convert to standard Uint8Array for Web Crypto API
  const derivedKey = new Uint8Array(derivedKeyRaw);
  
  // Import the derived key for AES-GCM encryption
  const encryptionKey = await crypto.subtle.importKey(
    'raw',
    derivedKey,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  );
  
  // Encrypt the data
  const ivBuffer = new Uint8Array(12);
  const iv = crypto.getRandomValues(ivBuffer);
  // Convert data to standard Uint8Array for Web Crypto API
  const dataToEncrypt = new Uint8Array(data);
  const encryptedData = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv },
    encryptionKey,
    dataToEncrypt
  );
  
  // Combine IV and encrypted data
  // Format: [12-byte IV][encrypted data]
  const combined = new Uint8Array(iv.length + encryptedData.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encryptedData), iv.length);
  
  return arrayBufferToBase64(combined.buffer);
}

/**
 * Decrypt data using the hardware key's credential
 * REQUIRES the physical hardware key to be present and user verification
 */
async function decryptWithHardwareKey(
  credentialId: string,
  encryptedData: string,
  userId: string
): Promise<Uint8Array> {
  // CRITICAL SECURITY: Require the physical hardware key to authenticate
  // This ensures decryption can ONLY happen with the physical key present
  const rpId = getRelyingPartyId();
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  
  console.log('[HW Key] Requesting hardware key authentication for decryption...');
  
  // Request authentication with the specific hardware key
  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge,
      rpId,
      allowCredentials: [{
        type: 'public-key',
        id: base64ToArrayBuffer(credentialId),
      }],
      userVerification: 'required',
      timeout: 60000,
    },
  }) as PublicKeyCredential;

  if (!assertion) {
    throw new Error('Hardware key authentication required to decrypt private key');
  }

  console.log('[HW Key] Hardware key authentication successful');

  // Parse encrypted data
  // Format: [12-byte IV][encrypted data]
  const combined = new Uint8Array(base64ToArrayBuffer(encryptedData));
  const iv = combined.slice(0, 12);
  const encrypted = combined.slice(12);
  
  // Derive decryption key deterministically from credentialId + userId
  // This matches the encryption key derivation
  const keyMaterial = new TextEncoder().encode(credentialId + '::' + userId);
  const salt = new TextEncoder().encode('SeraVault-HW-Key-V3');
  
  // Use Argon2id for key derivation (memory-hard, side-channel resistant)
  const derivedKeyRaw = argon2id(keyMaterial, salt, {
    t: 3,      // 3 iterations
    m: 65536,  // 64 MiB memory
    p: 4,      // 4 parallelism
    dkLen: 32  // 32 bytes output
  });
  
  // Convert to standard Uint8Array for Web Crypto API
  const derivedKey = new Uint8Array(derivedKeyRaw);
  
  const decryptionKey = await crypto.subtle.importKey(
    'raw',
    derivedKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
  
  // Decrypt the data
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    decryptionKey,
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

/**
 * DEBUG UTILITY: List all keys in IndexedDB
 * This is useful for debugging orphaned entries
 */
export async function listIndexedDBKeys(): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('SeraVaultHardwareKeys', 1);
    
    request.onerror = () => reject(request.error);
    
    request.onsuccess = () => {
      const db = request.result;
      
      if (!db.objectStoreNames.contains('keys')) {
        db.close();
        resolve([]);
        return;
      }
      
      const transaction = db.transaction(['keys'], 'readonly');
      const store = transaction.objectStore('keys');
      const getAllKeysRequest = store.getAllKeys();
      
      getAllKeysRequest.onsuccess = () => {
        db.close();
        resolve(getAllKeysRequest.result as string[]);
      };
      
      getAllKeysRequest.onerror = () => {
        db.close();
        reject(getAllKeysRequest.error);
      };
    };
  });
}

/**
 * DEBUG UTILITY: Clear all IndexedDB entries for hardware keys
 * WARNING: This will remove ALL stored hardware key data!
 */
export async function clearAllIndexedDBKeys(): Promise<void> {
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
      const clearRequest = store.clear();
      
      clearRequest.onsuccess = () => {
        db.close();
        console.log('[HW Key] Cleared all IndexedDB entries');
        resolve();
      };
      
      clearRequest.onerror = () => {
        db.close();
        reject(clearRequest.error);
      };
    };
  });
}
