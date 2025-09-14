import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { decryptData, hexToBytes, decryptMetadata } from '../crypto/quantumSafeCrypto';
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
      // Decrypt file metadata using ML-KEM-768
      const userEncryptedKey = data.encryptedKeys[userId];
      
      let decryptedName: string;
      let decryptedSize: string;
      
      try {
        const privateKeyBytes = hexToBytes(privateKey);
        
        // Parse ML-KEM-768 encrypted key format
        const keyData = hexToBytes(userEncryptedKey);
        
        // ML-KEM-768: IV (12 bytes) + encapsulated key (1088 bytes) + ciphertext
        const iv = keyData.slice(0, 12);
        const encapsulatedKey = keyData.slice(12, 12 + 1088);
        const ciphertext = keyData.slice(12 + 1088);
        
        const fileKey = await decryptData(
          { iv, encapsulatedKey, ciphertext },
          privateKeyBytes
        );

        // Decrypt metadata using the file key
        decryptedName = await decryptMetadata(data.name as { ciphertext: string; nonce: string }, fileKey);
        decryptedSize = await decryptMetadata(data.size as { ciphertext: string; nonce: string }, fileKey);
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
    
    // Decrypt file content using ML-KEM-768
    const userEncryptedKey = file.encryptedKeys[userId];
    const privateKeyBytes = hexToBytes(privateKey);
    
    try {
      // Parse ML-KEM-768 encrypted key format
      const keyData = hexToBytes(userEncryptedKey);
      
      // ML-KEM-768: IV (12 bytes) + encapsulated key (1088 bytes) + ciphertext
      const keyIv = keyData.slice(0, 12);
      const encapsulatedKey = keyData.slice(12, 12 + 1088);
      const keyCiphertext = keyData.slice(12 + 1088);
      
      // Decrypt the file key using ML-KEM-768
      const fileKey = await decryptData(
        { iv: keyIv, encapsulatedKey, ciphertext: keyCiphertext },
        privateKeyBytes
      );
      
      // Files are encrypted with AES-GCM with IV prepended
      if (encryptedContent.byteLength > 12) {
        const contentIv = encryptedContent.slice(0, 12);
        const encryptedData = encryptedContent.slice(12);
        
        const aesKey = await crypto.subtle.importKey('raw', fileKey, { name: 'AES-GCM' }, false, ['decrypt']);
        const decryptedContent = await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv: contentIv }, 
          aesKey, 
          encryptedData
        );
        
        return decryptedContent;
      } else {
        throw new Error('Invalid encrypted content format');
      }
    } catch (error) {
      console.error('ML-KEM-768 file content decryption failed:', error);
      throw new Error(`Failed to decrypt file content: ${error instanceof Error ? error.message : String(error)}`);
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