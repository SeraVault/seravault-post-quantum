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
 * Generate a new ML-KEM-768 (quantum-safe) key pair and encrypt the private key with Argon2id
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
  
  console.log('🔑 Encrypting private key with Argon2id...');
  const encryptedPrivateKey = encryptString(privateKeyHex, passphrase);
  
  return {
    publicKey: publicKeyHex,
    encryptedPrivateKey
  };
}

/**
 * Decrypt an Argon2id encrypted private key
 */
export async function decryptPrivateKey(
  encryptedPrivateKey: { ciphertext: string; salt: string; nonce: string },
  passphrase: string
): Promise<string> {
  console.log('🔓 Decrypting private key from Argon2id...');
  const decryptedHex = decryptString(encryptedPrivateKey, passphrase);
  console.log('🔓 Private key decrypted, length:', decryptedHex.length);
  console.log('🔓 Decrypted hex preview:', decryptedHex.substring(0, 20) + '...');

  // First check if it looks like valid hex at all
  const isHex = /^[a-fA-F0-9]+$/.test(decryptedHex);
  console.log('🔓 Is valid hex:', isHex, 'Length:', decryptedHex.length);

  if (!isHex) {
    console.error('🔓 Decryption failed: Result is not valid hexadecimal');
    console.error('🔓 First 100 chars of decrypted result:', decryptedHex.substring(0, 100));
    throw new Error('Incorrect passphrase. Please try again.');
  }

  // Check for expected ML-KEM-768 private key length (4800 hex chars = 2400 bytes)
  if (decryptedHex.length === 4800) {
    console.log('🔓 Detected ML-KEM-768 private key (4800 hex chars)');
    try {
      const privateKeyBytes = hexToBytes(decryptedHex);
      console.log('🔓 Converted to bytes, length:', privateKeyBytes.length);
      if (privateKeyBytes.length !== 2400) {
        console.error('🔓 Byte conversion mismatch for ML-KEM-768 key');
        throw new Error('Incorrect passphrase. Please try again.');
      }
    } catch (hexError) {
      console.error('🔓 Failed to convert ML-KEM-768 hex to bytes:', hexError);
      throw new Error('Incorrect passphrase. Please try again.');
    }
  }
  // Check for other possible key sizes (legacy RSA, other quantum-safe algorithms, etc.)
  else if (decryptedHex.length >= 64 && decryptedHex.length <= 8192 && decryptedHex.length % 2 === 0) {
    console.log('🔓 Detected private key with length:', decryptedHex.length, 'hex chars');
    try {
      const privateKeyBytes = hexToBytes(decryptedHex);
      console.log('🔓 Converted to bytes, length:', privateKeyBytes.length);
      // Allow various key sizes but validate hex conversion
    } catch (hexError) {
      console.error('🔓 Failed to convert hex to bytes:', hexError);
      throw new Error('Incorrect passphrase. Please try again.');
    }
  }
  // Invalid key size
  else {
    console.error('🔓 Decryption failed: Invalid private key length. Got:', decryptedHex.length, 'hex chars');
    console.error('🔓 Expected lengths: ML-KEM-768 (4800), or other valid key sizes (64-8192, even numbers)');
    console.error('🔓 First 100 chars of decrypted result:', decryptedHex.substring(0, 100));
    throw new Error('Incorrect passphrase. Please try again.');
  }

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
 * If passphrase is empty, keys are generated but encryptedPrivateKey is not stored (hardware-only mode)
 */
export async function createUserWithKeys(
  userId: string,
  displayName: string,
  email: string,
  passphrase: string,
  theme: 'light' | 'dark' = 'dark'
): Promise<{ profile: UserProfile; privateKey: string }> {
  // Always generate a key pair
  const { publicKey, privateKey } = await generateKeyPair();
  const publicKeyHex = bytesToHex(publicKey);
  const privateKeyHex = bytesToHex(privateKey);
  
  console.log('✅ Generated quantum-safe ML-KEM-768 key pair:', {
    publicKeyLength: publicKey.length,
    privateKeyLength: privateKey.length
  });
  
  // Test the generated key pair
  console.log('🔒 Testing quantum-safe ML-KEM-768 key pair...');
  try {
    const testData = new TextEncoder().encode('mlkem_test_data');
    const encrypted = await encryptData(testData, publicKey);
    const decrypted = await decryptData(encrypted, privateKey);
    const decryptedText = new TextDecoder().decode(decrypted);
    
    if (decryptedText !== 'mlkem_test_data') {
      throw new Error('Quantum-safe ML-KEM-768 key pair failed verification');
    }
    console.log('✅ Quantum-safe ML-KEM-768 key pair works correctly!');
  } catch (keyTestError) {
    console.error('❌ Quantum-safe ML-KEM-768 key pair test failed:', keyTestError);
    throw new Error(`Quantum-safe ML-KEM-768 key pair is invalid: ${keyTestError instanceof Error ? keyTestError.message : String(keyTestError)}`);
  }
  
  const profile: UserProfile = {
    displayName,
    email: email.toLowerCase(), // Normalize email for case-insensitive matching
    theme,
    publicKey: publicKeyHex,
  };
  
  // Only encrypt and store private key if passphrase is provided
  if (passphrase && passphrase.length >= 12) {
    console.log('🔑 Encrypting private key with Argon2id...');
    const encryptedPrivateKey = encryptString(privateKeyHex, passphrase);
    profile.encryptedPrivateKey = encryptedPrivateKey;
  } else {
    console.log('⚠️ Hardware-only mode: Private key will NOT be stored with passphrase');
  }
  
  // Store in Firestore
  await createUserProfile(userId, profile);
  
  // Fetch the complete profile from Firestore to ensure we have all fields
  // including termsAcceptedAt and other fields that were merged
  const completeProfile = await getUserProfile(userId);
  if (!completeProfile) {
    throw new Error('Failed to fetch complete user profile after creation');
  }
  
  return { profile: completeProfile, privateKey: privateKeyHex };
}

/**
 * Regenerate keys for existing user
 */
export async function regenerateUserKeys(
  userId: string,
  displayName: string,
  email: string,
  passphrase: string,
  theme: 'light' | 'dark' = 'dark'
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