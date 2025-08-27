/**
 * Biometric Authentication utilities for mobile devices
 * 
 * This module provides fingerprint/face ID authentication on supported devices
 * using the Web Authentication API (WebAuthn) which works on modern mobile browsers
 */

/**
 * Check if biometric authentication is available
 */
export async function isBiometricAvailable(): Promise<boolean> {
  // Check if WebAuthn is supported
  if (!window.PublicKeyCredential) {
    return false;
  }

  try {
    // Check if platform authenticator (biometric) is available
    const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    return available;
  } catch (error) {
    console.error('Error checking biometric availability:', error);
    return false;
  }
}

/**
 * Get device capabilities for biometric authentication
 */
export async function getBiometricCapabilities(): Promise<{
  available: boolean;
  type: string;
  supportsResidentKeys: boolean;
}> {
  const available = await isBiometricAvailable();
  
  if (!available) {
    return {
      available: false,
      type: 'none',
      supportsResidentKeys: false,
    };
  }

  // Detect likely biometric type based on user agent
  const userAgent = navigator.userAgent.toLowerCase();
  let type = 'biometric';
  
  if (userAgent.includes('iphone') || userAgent.includes('ipad')) {
    type = 'Face ID / Touch ID';
  } else if (userAgent.includes('android')) {
    type = 'Fingerprint / Face Unlock';
  }

  return {
    available: true,
    type,
    supportsResidentKeys: true,
  };
}

/**
 * Register biometric authentication for a user
 */
export async function registerBiometric(userId: string, userName: string): Promise<{
  credentialId: string;
  publicKey: ArrayBuffer;
}> {
  if (!await isBiometricAvailable()) {
    throw new Error('Biometric authentication not available on this device');
  }

  try {
    const credential = await navigator.credentials.create({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        rp: {
          name: 'SeraVault',
          id: window.location.hostname,
        },
        user: {
          id: new TextEncoder().encode(userId),
          name: userName,
          displayName: userName,
        },
        pubKeyCredParams: [
          { alg: -7, type: 'public-key' }, // ES256
          { alg: -257, type: 'public-key' }, // RS256
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required',
          residentKey: 'preferred',
        },
        timeout: 60000,
        attestation: 'direct',
      },
    }) as PublicKeyCredential;

    if (!credential || !credential.response) {
      throw new Error('Failed to create biometric credential');
    }

    const response = credential.response as AuthenticatorAttestationResponse;
    
    return {
      credentialId: Array.from(new Uint8Array(credential.rawId))
        .map(byte => byte.toString(16).padStart(2, '0'))
        .join(''),
      publicKey: response.getPublicKey()!,
    };
  } catch (error) {
    console.error('Biometric registration failed:', error);
    throw new Error(`Biometric registration failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Authenticate using biometrics
 */
export async function authenticateWithBiometric(credentialId: string): Promise<{
  success: boolean;
  signature: ArrayBuffer;
  authenticatorData: ArrayBuffer;
}> {
  if (!await isBiometricAvailable()) {
    throw new Error('Biometric authentication not available');
  }

  try {
    // Convert hex credential ID back to bytes
    const credentialIdBytes = new Uint8Array(
      credentialId.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16))
    );

    const credential = await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        allowCredentials: [{
          id: credentialIdBytes,
          type: 'public-key',
        }],
        userVerification: 'required',
        timeout: 60000,
      },
    }) as PublicKeyCredential;

    if (!credential || !credential.response) {
      throw new Error('Biometric authentication failed');
    }

    const response = credential.response as AuthenticatorAssertionResponse;

    return {
      success: true,
      signature: response.signature,
      authenticatorData: response.authenticatorData,
    };
  } catch (error) {
    console.error('Biometric authentication failed:', error);
    throw new Error(`Biometric authentication failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Store encrypted private key that can be unlocked with biometrics
 * This encrypts the private key with a key derived from the biometric credential
 */
export async function storeBiometricEncryptedKey(
  privateKey: string, 
  biometricSignature: ArrayBuffer,
  userId: string
): Promise<string> {
  try {
    // Derive encryption key from biometric signature
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      biometricSignature.slice(0, 32), // Use first 32 bytes of signature
      { name: 'PBKDF2' },
      false,
      ['deriveBits', 'deriveKey']
    );

    const salt = crypto.getRandomValues(new Uint8Array(16));
    const encryptionKey = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: 100000,
        hash: 'SHA-256',
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt']
    );

    // Encrypt the private key
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const privateKeyBytes = new TextEncoder().encode(privateKey);
    
    const encryptedData = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv },
      encryptionKey,
      privateKeyBytes
    );

    // Store the encrypted key with salt and IV
    const result = {
      encryptedKey: Array.from(new Uint8Array(encryptedData)).map(b => b.toString(16).padStart(2, '0')).join(''),
      salt: Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join(''),
      iv: Array.from(iv).map(b => b.toString(16).padStart(2, '0')).join(''),
      userId,
    };

    // Store in localStorage (could be moved to secure storage)
    localStorage.setItem(`biometric_key_${userId}`, JSON.stringify(result));
    
    return 'stored';
  } catch (error) {
    console.error('Failed to store biometric encrypted key:', error);
    throw new Error('Failed to encrypt key with biometric data');
  }
}

/**
 * Retrieve and decrypt private key using biometric authentication
 */
export async function retrieveBiometricEncryptedKey(
  biometricSignature: ArrayBuffer,
  userId: string
): Promise<string> {
  try {
    const storedData = localStorage.getItem(`biometric_key_${userId}`);
    if (!storedData) {
      throw new Error('No biometric encrypted key found');
    }

    const { encryptedKey, salt, iv } = JSON.parse(storedData);

    // Recreate encryption key from biometric signature
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      biometricSignature.slice(0, 32),
      { name: 'PBKDF2' },
      false,
      ['deriveBits', 'deriveKey']
    );

    const saltBytes = new Uint8Array(salt.match(/.{1,2}/g)!.map((byte: string) => parseInt(byte, 16)));
    const decryptionKey = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: saltBytes,
        iterations: 100000,
        hash: 'SHA-256',
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt']
    );

    // Decrypt the private key
    const ivBytes = new Uint8Array(iv.match(/.{1,2}/g)!.map((byte: string) => parseInt(byte, 16)));
    const encryptedBytes = new Uint8Array(encryptedKey.match(/.{1,2}/g)!.map((byte: string) => parseInt(byte, 16)));

    const decryptedData = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: ivBytes },
      decryptionKey,
      encryptedBytes
    );

    return new TextDecoder().decode(decryptedData);
  } catch (error) {
    console.error('Failed to retrieve biometric encrypted key:', error);
    throw new Error('Failed to decrypt key with biometric data');
  }
}

/**
 * Check if user has biometric authentication set up
 */
export function hasBiometricSetup(userId: string): boolean {
  return localStorage.getItem(`biometric_credential_${userId}`) !== null &&
         localStorage.getItem(`biometric_key_${userId}`) !== null;
}

/**
 * Remove biometric authentication data
 */
export function removeBiometricSetup(userId: string): void {
  localStorage.removeItem(`biometric_credential_${userId}`);
  localStorage.removeItem(`biometric_key_${userId}`);
}

/**
 * Store biometric credential ID for a user
 */
export function storeBiometricCredential(userId: string, credentialId: string): void {
  localStorage.setItem(`biometric_credential_${userId}`, credentialId);
}