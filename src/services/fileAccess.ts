import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { decryptFileContent, decryptData, hexToBytes } from '../crypto/hpkeCrypto';
import { decryptFileMetadata } from '../crypto/migration';
import { isFormFile } from '../utils/formFiles';
import type { FileData } from '../files';

export interface FileAccessResult {
  file: FileData;
  decryptedContent?: ArrayBuffer;
}

export class FileAccessService {

  /**
   * Load complete file data by ID from Firestore
   */
  static async loadFileById(fileId: string, userId: string, privateKey: string): Promise<FileData> {
    const fileRef = doc(db, 'files', fileId);
    const fileSnap = await getDoc(fileRef);
    
    if (!fileSnap.exists()) {
      throw new Error('File not found');
    }
    
    const data = fileSnap.data();
    
    // Check if user has access
    if (!data.encryptedKeys || !data.encryptedKeys[userId]) {
      throw new Error('No access to this file');
    }

    try {
      // Check if this is a new HPKE-encrypted file or legacy ML-KEM768 file
      const userEncryptedKey = data.encryptedKeys[userId];
      
      // Try HPKE decryption first (new format)
      let decryptedName: string;
      let decryptedSize: string;
      
      try {
        const privateKeyBytes = hexToBytes(privateKey);
        
        // For HPKE, first decrypt the shared secret, then decrypt metadata
        const keyData = hexToBytes(userEncryptedKey);
        
        // HPKE encrypted keys contain: encapsulated_key (32 bytes) + ciphertext  
        const encapsulatedKey = keyData.slice(0, 32);
        const ciphertext = keyData.slice(32);
        
        const sharedSecret = await decryptData(
          { encapsulatedKey, ciphertext },
          privateKeyBytes
        );

        if (typeof data.name === 'object' && data.name.ciphertext) {
          // New HPKE encrypted metadata format - use migration function
          decryptedName = await decryptFileMetadata(data.name, sharedSecret);
          decryptedSize = await decryptFileMetadata(data.size, sharedSecret);
        } else {
          // Legacy format - already have sharedSecret from above
          decryptedName = await decryptFileMetadata(data.name, sharedSecret);
          decryptedSize = await decryptFileMetadata(data.size, sharedSecret);
        }
      } catch (error) {
        console.error('Error decrypting file metadata:', error);
        decryptedName = '[Decryption Failed]';
        decryptedSize = '';
      }
      
      return {
        ...data,
        id: fileSnap.id,
        name: decryptedName,
        size: decryptedSize,
      } as FileData;
    } catch (error) {
      console.error('Error decrypting file metadata:', error);
      throw new Error('Failed to decrypt file metadata');
    }
  }

  /**
   * Load file content for viewing/editing
   */
  static async loadFileContent(file: FileData, userId: string, privateKey: string): Promise<ArrayBuffer> {
    if (!file.encryptedKeys || !file.encryptedKeys[userId]) {
      throw new Error('No access key found for this file');
    }

    // Download encrypted file from storage
    const { getFile } = await import('../storage');
    const encryptedContent = await getFile(file.storagePath);
    
    // Try HPKE decryption first (new format)
    const userEncryptedKey = file.encryptedKeys[userId];
    const privateKeyBytes = hexToBytes(privateKey);
    
    try {
      // Try HPKE decryption
      const decryptedContent = await decryptFileContent(
        new Uint8Array(encryptedContent), 
        userEncryptedKey, 
        privateKeyBytes
      );
      return decryptedContent.buffer;
    } catch (hpkeError) {
      console.log('HPKE decryption failed, trying HPKE key decryption:', hpkeError);
      
      // Fall back to HPKE key decryption for files
      try {
        const keyData = hexToBytes(userEncryptedKey);
        
        // HPKE encrypted keys contain: encapsulated_key (32 bytes) + ciphertext  
        const encapsulatedKey = keyData.slice(0, 32);
        const ciphertext = keyData.slice(32);
        
        const sharedSecret = await decryptData(
          { encapsulatedKey, ciphertext },
          privateKeyBytes
        );
        
        // Files are encrypted with AES-GCM with IV prepended
        if (encryptedContent.byteLength > 12) {
          const iv = encryptedContent.slice(0, 12);
          const ciphertextData = encryptedContent.slice(12);
          
          const key = await crypto.subtle.importKey('raw', sharedSecret, { name: 'AES-GCM' }, false, ['decrypt']);
          const decryptedContent = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: iv }, 
            key, 
            ciphertextData
          );
          
          return decryptedContent;
        } else {
          throw new Error('Invalid encrypted content format');
        }
      } catch (legacyError) {
        console.warn('Both HPKE and ML-KEM768 decryption failed, returning as-is:', legacyError);
        return encryptedContent;
      }
    }
  }

  /**
   * Unified file opening handler - works with both complete FileData and minimal file info
   */
  static async openFile(
    fileInfo: { id: string; name?: string; parent?: string | null } | FileData,
    userId: string,
    privateKey: string,
    callbacks: {
      onFormOpen: (file: FileData, formData?: any) => void;
      onFileOpen: (file: FileData, content: ArrayBuffer) => void;
      onError: (error: string) => void;
    }
  ): Promise<void> {
    try {
      let file: FileData;

      // Always load from Firestore to ensure metadata is properly decrypted
      const fileId = 'id' in fileInfo ? fileInfo.id : (fileInfo as any).id;
      file = await this.loadFileById(fileId, userId, privateKey);

      const fileName = typeof file.name === 'string' ? file.name : '';
      
      if (isFormFile(fileName)) {
        // Handle form files
        try {
          const content = await this.loadFileContent(file, userId, privateKey);
          let jsonString: string;
          
          if (content instanceof ArrayBuffer) {
            jsonString = new TextDecoder().decode(content);
          } else {
            jsonString = String(content);
          }
          
          const formData = JSON.parse(jsonString);
          callbacks.onFormOpen(file, formData);
        } catch (error) {
          console.error('Error loading form data:', error);
          // Fallback: open form viewer without data
          callbacks.onFormOpen(file);
        }
      } else {
        // Handle regular files
        try {
          const content = await this.loadFileContent(file, userId, privateKey);
          callbacks.onFileOpen(file, content);
        } catch (error) {
          console.error('Error loading file content:', error);
          callbacks.onError('Failed to load file content');
        }
      }
    } catch (error) {
      console.error('Error opening file:', error);
      const message = error instanceof Error ? error.message : 'Failed to open file';
      callbacks.onError(message);
    }
  }
}