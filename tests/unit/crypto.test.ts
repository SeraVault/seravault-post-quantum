import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as hpkeCrypto from '@/crypto/hpkeCrypto'
import * as postQuantumCrypto from '@/crypto/postQuantumCrypto'

// Mock the actual crypto implementations for isolated testing
vi.mock('@hpke/core', () => ({
  Kem: { DhkemX25519HkdfSha256: 0 },
  Kdf: { HkdfSha256: 1 },
  Aead: { Chacha20Poly1305: 3 },
}))

vi.mock('@hpke/dhkem-x25519', () => ({
  DhkemX25519HkdfSha256: class {
    static async generateKeyPair() {
      return {
        privateKey: new Uint8Array(32).fill(1),
        publicKey: new Uint8Array(32).fill(2),
      }
    }
  }
}))

describe('HPKE Crypto Functions', () => {
  const mockData = new TextEncoder().encode('test data')
  const mockPublicKey = new Uint8Array(32).fill(2)
  const mockPrivateKey = new Uint8Array(32).fill(1)

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Key Generation', () => {
    it('should generate valid key pairs', async () => {
      const keyPair = await hpkeCrypto.generateKeyPair()
      
      expect(keyPair).toBeDefined()
      expect(keyPair.publicKey).toBeInstanceOf(Uint8Array)
      expect(keyPair.privateKey).toBeInstanceOf(Uint8Array)
      expect(keyPair.publicKey.length).toBe(32)
      expect(keyPair.privateKey.length).toBe(32)
    })

    it('should generate different keys each time', async () => {
      const keyPair1 = await hpkeCrypto.generateKeyPair()
      const keyPair2 = await hpkeCrypto.generateKeyPair()
      
      expect(keyPair1.publicKey).not.toEqual(keyPair2.publicKey)
      expect(keyPair1.privateKey).not.toEqual(keyPair2.privateKey)
    })
  })

  describe('Data Encryption/Decryption', () => {
    it('should encrypt and decrypt data correctly', async () => {
      const encrypted = await hpkeCrypto.encryptData(mockData, mockPublicKey)
      const decrypted = await hpkeCrypto.decryptData(encrypted, mockPrivateKey)
      
      expect(decrypted).toEqual(mockData)
    })

    it('should produce different ciphertext for same data', async () => {
      const encrypted1 = await hpkeCrypto.encryptData(mockData, mockPublicKey)
      const encrypted2 = await hpkeCrypto.encryptData(mockData, mockPublicKey)
      
      expect(encrypted1.ciphertext).not.toEqual(encrypted2.ciphertext)
      expect(encrypted1.encapsulatedKey).not.toEqual(encrypted2.encapsulatedKey)
    })

    it('should fail with wrong private key', async () => {
      const encrypted = await hpkeCrypto.encryptData(mockData, mockPublicKey)
      const wrongPrivateKey = new Uint8Array(32).fill(99)
      
      await expect(hpkeCrypto.decryptData(encrypted, wrongPrivateKey)).rejects.toThrow()
    })
  })

  describe('Multi-recipient Encryption', () => {
    it('should encrypt for multiple recipients', async () => {
      const recipients = [
        { userId: 'user1', publicKey: new Uint8Array(32).fill(1) },
        { userId: 'user2', publicKey: new Uint8Array(32).fill(2) },
      ]

      const result = await hpkeCrypto.encryptForMultipleRecipients(mockData, recipients)
      
      expect(result.encryptedContent).toBeInstanceOf(Uint8Array)
      expect(Object.keys(result.encryptedKeys)).toHaveLength(2)
      expect(result.encryptedKeys['user1']).toBeDefined()
      expect(result.encryptedKeys['user2']).toBeDefined()
    })

    it('should decrypt file content with proper key', async () => {
      const recipients = [{ userId: 'user1', publicKey: mockPublicKey }]
      const result = await hpkeCrypto.encryptForMultipleRecipients(mockData, recipients)
      
      const decrypted = await hpkeCrypto.decryptFileContent(
        result.encryptedContent,
        result.encryptedKeys['user1'],
        mockPrivateKey
      )
      
      expect(decrypted).toEqual(mockData)
    })
  })

  describe('Metadata Encryption', () => {
    it('should encrypt and decrypt metadata', async () => {
      const metadata = { name: 'test-file.txt', size: '1024' }
      const key = new Uint8Array(32).fill(3)
      
      const encrypted = await hpkeCrypto.encryptMetadata(metadata, key)
      const decrypted1 = await hpkeCrypto.decryptMetadata(encrypted.name, key)
      const decrypted2 = await hpkeCrypto.decryptMetadata(encrypted.size, key)
      
      expect(decrypted1).toBe(metadata.name)
      expect(decrypted2).toBe(metadata.size)
    })
  })

  describe('Utility Functions', () => {
    it('should convert between hex and bytes correctly', () => {
      const bytes = new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f]) // "Hello"
      const hex = hpkeCrypto.bytesToHex(bytes)
      const converted = hpkeCrypto.hexToBytes(hex)
      
      expect(hex).toBe('48656c6c6f')
      expect(converted).toEqual(bytes)
    })

    it('should handle empty arrays', () => {
      const empty = new Uint8Array(0)
      const hex = hpkeCrypto.bytesToHex(empty)
      const converted = hpkeCrypto.hexToBytes(hex)
      
      expect(hex).toBe('')
      expect(converted).toEqual(empty)
    })
  })
})

describe('Post-Quantum Crypto Functions', () => {
  const testData = 'sensitive information'
  const testPassword = 'strong-password-123'
  
  describe('String Encryption', () => {
    it('should encrypt and decrypt strings', () => {
      const encrypted = postQuantumCrypto.encryptString(testData, testPassword)
      const decrypted = postQuantumCrypto.decryptString(encrypted, testPassword)
      
      expect(decrypted).toBe(testData)
      expect(encrypted.ciphertext).toBeDefined()
      expect(encrypted.salt).toBeDefined()
      expect(encrypted.nonce).toBeDefined()
    })

    it('should fail with wrong password', () => {
      const encrypted = postQuantumCrypto.encryptString(testData, testPassword)
      
      expect(() => {
        postQuantumCrypto.decryptString(encrypted, 'wrong-password')
      }).toThrow()
    })
  })

  describe('Metadata Encryption', () => {
    it('should encrypt file metadata', () => {
      const metadata = { name: 'document.pdf', size: '2048' }
      const key = new Uint8Array(32).fill(5)
      
      const encrypted = postQuantumCrypto.encryptMetadata(metadata, key)
      const decrypted = postQuantumCrypto.decryptMetadata(encrypted, key)
      
      expect(decrypted.name).toBe(metadata.name)
      expect(decrypted.size).toBe(metadata.size)
    })
  })

  describe('Key Generation', () => {
    it('should generate ML-KEM768 key pairs', () => {
      const keyPair = postQuantumCrypto.generateKeyPair()
      
      expect(keyPair.publicKey).toBeInstanceOf(Uint8Array)
      expect(keyPair.privateKey).toBeInstanceOf(Uint8Array)
      expect(keyPair.publicKey.length).toBeGreaterThan(0)
      expect(keyPair.privateKey.length).toBeGreaterThan(0)
    })
  })

  describe('Symmetric Encryption', () => {
    it('should encrypt and decrypt with symmetric key', () => {
      const data = new TextEncoder().encode('symmetric test data')
      const key = new Uint8Array(32).fill(7)
      
      const encrypted = postQuantumCrypto.encryptSymmetric(data, key)
      const decrypted = postQuantumCrypto.decryptSymmetric(encrypted.ciphertext, key, encrypted.nonce)
      
      expect(decrypted).toEqual(data)
    })
  })

  describe('Hashing', () => {
    it('should create consistent hashes', () => {
      const data = new TextEncoder().encode('hash this data')
      
      const hash1 = postQuantumCrypto.hash(data)
      const hash2 = postQuantumCrypto.hash(data)
      
      expect(hash1).toEqual(hash2)
      expect(hash1.length).toBeGreaterThan(0)
    })

    it('should create different hashes for different data', () => {
      const data1 = new TextEncoder().encode('data one')
      const data2 = new TextEncoder().encode('data two')
      
      const hash1 = postQuantumCrypto.hash(data1)
      const hash2 = postQuantumCrypto.hash(data2)
      
      expect(hash1).not.toEqual(hash2)
    })

    it('should hash strings correctly', () => {
      const text = 'test string to hash'
      
      const hash = postQuantumCrypto.hashString(text)
      
      expect(typeof hash).toBe('string')
      expect(hash.length).toBeGreaterThan(0)
      expect(/^[a-f0-9]+$/i.test(hash)).toBe(true) // Should be hex
    })
  })
})