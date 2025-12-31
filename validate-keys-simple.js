// Simple key validation script
import { validateKeyPair } from './src/utils/keyValidation.js';

async function validateCurrentKeys() {
  console.log('🔍 Testing the key pair from the debug logs...\n');
  
  // Keys from the debug logs
  const publicKeyFromEncryption = "522bc5ac48cb8cc3824e64de8c2c9a1e7f0709cde82eae8d6852adde371d385f";
  const privateKeyFromDecryption = "e0c88d0cbf0702bd3249399c4587ed84387dc53a81bef1eb44bbc0cdf05c1f2b";
  
  console.log('Public key (used for encryption):', publicKeyFromEncryption);
  console.log('Private key (used for decryption):', privateKeyFromDecryption);
  
  // Test if they match
  const validation = await validateKeyPair(publicKeyFromEncryption, privateKeyFromDecryption);
  
  console.log('\n🧪 Key Compatibility Test Result:');
  console.log('Keys are compatible:', validation.isValid ? '✅ YES' : '❌ NO');
  
  if (!validation.isValid) {
    console.log('Error:', validation.error);
    console.log('\n💡 This confirms the root cause: The public key used for folder creation does NOT match the private key used for decryption.');
    console.log('🔧 The key regeneration process did not update both keys properly.');
  } else {
    console.log('✅ Keys match - the issue is elsewhere.');
  }
}

validateCurrentKeys();