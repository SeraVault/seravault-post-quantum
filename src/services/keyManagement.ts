/**
 * Centralized Key Management Service
 * Handles all key generation, encryption, decryption, and storage operations
 * Eliminates the need for complex event listeners and timing dependencies
 */

import { generateKeyPair, bytesToHex, hexToBytes, encryptData, decryptData } from '../crypto/quantumSafeCrypto';
import { encryptString, decryptString } from '../crypto/quantumSafeCrypto';
import { createUserProfile, getUserProfile, type UserProfile } from '../firestore';

export interface KeyPair {
  publicKey: string;
  privateKey: string;
}

export interface EncryptedKeyPair {
  publicKey: string;
  encryptedPrivateKey: {
    ciphertext: string;
    salt: string;
    nonce: string;
  };
}

/**
 * Generate a new HPKE key pair and encrypt the private key with PBKDF2
 */
export async function generateAndEncryptKeyPair(passphrase: string): Promise<EncryptedKeyPair> {
  console.log('🔒 Generating new quantum-safe ML-KEM-768 key pair...');
  const { publicKey, privateKey } = await generateKeyPair();
  const publicKeyHex = bytesToHex(publicKey);
  const privateKeyHex = bytesToHex(privateKey);
  
  console.log('✅ Generated quantum-safe ML-KEM-768 key pair:', {
    publicKeyLength: publicKey.length,
    privateKeyLength: privateKey.length,
    publicKeyHexLength: publicKeyHex.length,
    privateKeyHexLength: privateKeyHex.length
  });
  
  // Test the generated key pair with quantum-safe crypto
  console.log('🔒 Testing quantum-safe ML-KEM-768 key pair...');
  try {
    const testData = new TextEncoder().encode('mlkem_test_data');
    
    const encrypted = await encryptData(testData, publicKey);
    const decrypted = await decryptData(encrypted, privateKey);
    const decryptedText = new TextDecoder().decode(decrypted);
    
    if (decryptedText === 'mlkem_test_data') {
      console.log('✅ Quantum-safe ML-KEM-768 key pair works correctly!');
    } else {
      console.error('❌ Quantum-safe ML-KEM-768 key pair FAILED test!');
      throw new Error('Quantum-safe ML-KEM-768 key pair failed verification');
    }
  } catch (keyTestError) {
    console.error('❌ Quantum-safe ML-KEM-768 key pair test failed:', keyTestError);
    throw new Error(`Quantum-safe ML-KEM-768 key pair is invalid: ${keyTestError instanceof Error ? keyTestError.message : String(keyTestError)}`);
  }
  
  console.log('🔑 Encrypting private key with PBKDF2...');
  const encryptedPrivateKey = await encryptString(privateKeyHex, passphrase);
  
  return {
    publicKey: publicKeyHex,
    encryptedPrivateKey
  };
}

/**
 * Decrypt a PBKDF2 encrypted private key
 */
export async function decryptPrivateKey(
  encryptedPrivateKey: { ciphertext: string; salt: string; nonce: string },
  passphrase: string
): Promise<string> {
  console.log('🔓 Decrypting private key from PBKDF2...');
  const decryptedHex = await decryptString(encryptedPrivateKey, passphrase);
  console.log('🔓 Private key decrypted, length:', decryptedHex.length);
  console.log('🔓 Decrypted private key preview:', decryptedHex.substring(0, 16) + '...');
  return decryptedHex;
}

/**
 * Verify that a private key matches a public key by testing encryption/decryption
 */
export async function verifyKeyPair(privateKeyHex: string, publicKeyHex: string): Promise<boolean> {
  try {
    console.log('🔍 Verifying quantum-safe key pair compatibility...');
    
    const privateKeyBytes = hexToBytes(privateKeyHex);
    const publicKeyBytes = hexToBytes(publicKeyHex);
    
    console.log('🔍 Key lengths:', {
      privateKeyBytes: privateKeyBytes.length,
      publicKeyBytes: publicKeyBytes.length,
      expectedPrivateKey: 2400, // ML-KEM-768
      expectedPublicKey: 1184   // ML-KEM-768
    });
    
    // Test encryption/decryption to verify key pair compatibility
    const testData = new TextEncoder().encode(`quantum_test_${Date.now()}`);
    
    console.log('🔍 Testing ML-KEM-768 encryption with public key...');
    // Encrypt with public key
    const encrypted = await encryptData(testData, publicKeyBytes);
    console.log('🔍 ML-KEM-768 encryption successful:', {
      ciphertextLength: encrypted.ciphertext.length,
      encapsulatedKeyLength: encrypted.encapsulatedKey.length,
      ivLength: encrypted.iv.length
    });
    
    console.log('🔍 Testing ML-KEM-768 decryption with private key...');
    // Try to decrypt with private key
    const decrypted = await decryptData(encrypted, privateKeyBytes);
    console.log('🔍 ML-KEM-768 decryption successful, length:', decrypted.length);
    
    // Verify the data matches
    const decryptedText = new TextDecoder().decode(decrypted);
    const originalText = new TextDecoder().decode(testData);
    
    const matches = decryptedText === originalText;
    console.log('🔍 ML-KEM-768 key pair verification:', matches ? '✅ SUCCESS' : '❌ FAILED');
    
    return matches;
  } catch (error) {
    console.error('🔍 ML-KEM-768 key pair verification failed:', error);
    console.error('🔍 Error details:', {
      name: error instanceof Error ? error.name : 'Unknown',
      message: error instanceof Error ? error.message : String(error)
    });
    return false;
  }
}

/**
 * Create new user profile with generated keys
 */
export async function createUserWithKeys(
  userId: string,
  displayName: string,
  email: string,
  passphrase: string,
  theme: 'light' | 'dark' = 'light'
): Promise<{ profile: UserProfile; privateKey: string }> {
  const keyPair = await generateAndEncryptKeyPair(passphrase);
  
  const profile: UserProfile = {
    displayName,
    email,
    theme,
    publicKey: keyPair.publicKey,
    encryptedPrivateKey: keyPair.encryptedPrivateKey
  };
  
  // Store in Firestore
  await createUserProfile(userId, profile);
  
  // Return profile and decrypted private key
  const privateKey = await decryptPrivateKey(keyPair.encryptedPrivateKey, passphrase);
  
  return { profile, privateKey };
}

/**
 * Regenerate keys for existing user
 */
export async function regenerateUserKeys(
  userId: string,
  displayName: string,
  email: string,
  passphrase: string,
  theme: 'light' | 'dark'
): Promise<{ profile: UserProfile; privateKey: string }> {
  // Same as create - just overwrites existing profile
  return await createUserWithKeys(userId, displayName, email, passphrase, theme);
}

/**
 * Unlock user's private key using passphrase
 */
export async function unlockPrivateKey(
  userId: string,
  passphrase: string
): Promise<{ privateKey: string; profile: UserProfile }> {
  console.log('🔓 Unlocking private key for user:', userId);
  
  const profile = await getUserProfile(userId);
  if (!profile) {
    throw new Error('User profile not found');
  }
  
  if (!profile.encryptedPrivateKey) {
    throw new Error('No encrypted private key found. Please regenerate your keys.');
  }
  
  console.log('🔓 Decrypting private key...');
  const privateKey = await decryptPrivateKey(profile.encryptedPrivateKey, passphrase);
  console.log('✅ Private key decrypted successfully, length:', privateKey.length);
  
  // Verify key pair integrity (non-blocking - just warn if there's an issue)
  try {
    const isValid = await verifyKeyPair(privateKey, profile.publicKey || '');
    if (!isValid) {
      console.warn('⚠️ WARNING: Private key verification failed, but continuing. You may encounter encryption issues.');
    } else {
      console.log('✅ Private key verification successful');
    }
  } catch (error) {
    console.warn('⚠️ WARNING: Could not verify key pair compatibility:', error);
  }
  
  return { privateKey, profile };
}

/**
 * Get public key for encryption (prefers Firestore but validates with private key if available)
 */
export async function getPublicKeyForEncryption(
  userId: string,
  privateKey?: string
): Promise<string> {
  // Get public key from Firestore
  const profile = await getUserProfile(userId);
  if (!profile?.publicKey) {
    throw new Error('Public key not found. Please regenerate your keys.');
  }
  
  // If we have the private key, verify it matches the public key (non-blocking)
  if (privateKey) {
    try {
      const isValid = await verifyKeyPair(privateKey, profile.publicKey);
      if (!isValid) {
        console.warn('⚠️ WARNING: Private key does not match stored public key. You may encounter issues.');
      } else {
        console.log('✅ Public key verification successful');
      }
    } catch (error) {
      console.warn('⚠️ WARNING: Could not verify key pair compatibility for encryption:', error);
    }
  }
  
  return profile.publicKey;
}