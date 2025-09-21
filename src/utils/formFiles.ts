/**
 * Form utilities that treat forms as JSON files using existing file encryption/sharing
 */

import { createFileWithSharing, updateFile } from '../files';
import { uploadFileData } from '../storage';
import { getUserProfile } from '../firestore';
import { FileEncryptionService } from '../services/fileEncryption';
import { decryptData, hexToBytes } from '../crypto/quantumSafeCrypto';

export interface FormFieldDefinition {
  id: string;
  type: 'text' | 'password' | 'email' | 'number' | 'date' | 'select' | 'textarea' | 'richtext' | 'file';
  label: string;
  placeholder?: string;
  required?: boolean;
  sensitive?: boolean; // For fields like passwords, card numbers
  options?: string[]; // For select fields
  fileConfig?: { // Configuration for file fields
    maxFiles?: number; // Maximum number of files allowed (default: 5)
    maxFileSize?: number; // Maximum file size in bytes (default: 10MB)
    allowedTypes?: string[]; // Allowed MIME types (default: all)
    description?: string; // Help text for file upload
  };
  validation?: {
    minLength?: number;
    maxLength?: number;
    pattern?: string;
    customMessage?: string;
  };
}

export interface FormField extends FormFieldDefinition {
  value: string | string[]; // string for regular fields, string[] for file field (file IDs)
}

export interface AttachedFile {
  id: string; // File ID from the files collection
  originalName: string; // Original filename when uploaded
  size: number; // File size in bytes
  mimeType?: string; // MIME type
  uploadedAt: string; // ISO timestamp
}

export interface FormMetadata {
  name: string;
  description?: string;
  category?: string;
  icon?: string;
  color?: string;
  version: string;
  author?: string;
  created: string;
  modified: string;
  isFavorite?: boolean; // Add favorites support
}

export interface FormLocalization {
  [fieldId: string]: {
    label?: string;
    placeholder?: string;
    options?: string[];
    description?: string;
  };
}

export interface FormTemplate {
  // Template identification
  templateId?: string; // Optional template ID if created from a template
  name: string;
  description?: string;
  category?: string;
  icon?: string;
  color?: string;
  version: string;
  author?: string; // User ID of template creator
  isPublic?: boolean; // Whether this template can be shared publicly
  isOfficial?: boolean; // Whether this is an official template
  titleField?: string; // Field ID to use as document title/name
  
  // Template structure (same as schema)
  schema: {
    fields: FormFieldDefinition[];
    sections?: {
      id: string;
      title: string;
      fieldIds: string[];
      collapsible?: boolean;
    }[];
  };
  
  // Default data structure for new instances
  defaultData?: {
    [fieldId: string]: string | string[];
  };
  
  // Usage tracking (for templates)
  usageCount?: number;
  tags?: string[];
}

export interface SecureFormData {
  // Form metadata
  metadata: FormMetadata;
  
  // Embedded template information - this travels with the form
  template?: FormTemplate;
  
  // Form structure definition (can come from template or be custom)
  schema: {
    fields: FormFieldDefinition[];
    sections?: {
      id: string;
      title: string;
      fieldIds: string[];
      collapsible?: boolean;
    }[];
  };
  
  // User's data for this form instance
  data: {
    [fieldId: string]: string | string[]; // string for regular fields, string[] for file field IDs
  };
  
  // File attachments metadata (keyed by file ID)
  attachments?: {
    [fileId: string]: AttachedFile;
  };
  
  // User-defined localization
  localization?: {
    [locale: string]: {
      metadata?: Partial<FormMetadata>;
      fields?: FormLocalization;
      sections?: { [sectionId: string]: string };
    };
  };
  
  // Instance-specific metadata
  tags?: string[];
  favorite?: boolean;
  lastAccessed?: string;
}

/**
 * Create a new blank form
 */
export function createBlankForm(name: string, author?: string): SecureFormData {
  const now = new Date().toISOString();
  
  return {
    metadata: {
      name,
      version: '1.0.0',
      author,
      created: now,
      modified: now,
    },
    schema: {
      fields: [],
    },
    data: {},
    attachments: {},
    tags: [],
  };
}

// Helper functions removed - now using imports from crypto module

/**
 * Generate document filename based on template's titleField
 */
function generateDocumentName(formData: SecureFormData): string {
  console.log('=== GENERATE DOCUMENT NAME DEBUG ===');
  console.log('Form has template:', !!formData.template);
  console.log('Template titleField:', formData.template?.titleField);
  console.log('Form data keys:', Object.keys(formData.data));
  
  // Check if form has an embedded template with titleField
  if (formData.template?.titleField) {
    const titleFieldId = formData.template.titleField;
    const titleValue = formData.data[titleFieldId];
    
    console.log('Title field ID:', titleFieldId);
    console.log('Title value:', titleValue);
    console.log('Title value type:', typeof titleValue);
    
    if (titleValue && typeof titleValue === 'string' && titleValue.trim()) {
      // Clean the title value for filename (remove invalid characters)
      const cleanTitle = titleValue.trim().replace(/[^\w\s\-\.]/g, '').substring(0, 50);
      const fileName = `${cleanTitle}.form`;
      console.log('Generated filename from title field:', fileName);
      return fileName;
    }
  }
  
  // Fallback to metadata name if no title field or value
  const fallbackName = formData.metadata.name || 'Untitled Form';
  const fileName = `${fallbackName}.form`;
  console.log('Using fallback filename:', fileName);
  console.log('=====================================');
  return fileName;
}

/**
 * Save form data as a JSON file using existing file encryption
 * @returns The file ID of the created form file
 */
export async function updateFormFile(
  fileId: string,
  formData: SecureFormData,
  userId: string,
  privateKey: string
): Promise<void> {

  try {
    // Get the existing file to preserve sharing and encryption keys
    const { getDoc, doc } = await import('firebase/firestore');
    const { db } = await import('../firebase');
    
    const docSnap = await getDoc(doc(db, 'files', fileId));
    if (!docSnap.exists()) {
      throw new Error('File not found');
    }
    
    const existingFile = { id: docSnap.id, ...docSnap.data() } as any;
    
    // Decrypt the existing file key using the user's private key
    const userEncryptedKey = existingFile.encryptedKeys[userId];
    if (!userEncryptedKey) {
      throw new Error('User does not have access to this file');
    }
    
    const privateKeyBytes = hexToBytes(privateKey);
    const keyData = hexToBytes(userEncryptedKey);
    
    // ML-KEM-768 encrypted keys contain: IV (12 bytes) + encapsulated_key (1088 bytes) + ciphertext  
    const iv = keyData.slice(0, 12);
    const encapsulatedKey = keyData.slice(12, 12 + 1088);
    const ciphertext = keyData.slice(12 + 1088);
    
    // Decrypt the file key using ML-KEM-768
    const fileKey = await decryptData(
      { iv, encapsulatedKey, ciphertext },
      privateKeyBytes
    );

    // Update timestamp
    const updatedFormData = {
      ...formData,
      metadata: {
        ...formData.metadata,
        modified: new Date().toISOString(),
      },
    };

    // Create JSON content
    const jsonString = JSON.stringify(updatedFormData, null, 2);
    
    // Use the existing file key for AES encryption
    const contentIv = crypto.getRandomValues(new Uint8Array(12));
    const encryptedContent = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: contentIv },
      await crypto.subtle.importKey('raw', fileKey, 'AES-GCM', false, ['encrypt']),
      new TextEncoder().encode(jsonString)
    );

    // Create filename - encryption handled by FileEncryptionService
    const fileName = generateDocumentName(updatedFormData);

    // Use the same storage path pattern as regular files
    const storagePath = `files/${userId}/${crypto.randomUUID()}`;
    
    // Combine IV and encrypted content (same format as regular files)
    const combinedData = new Uint8Array(contentIv.length + encryptedContent.byteLength);
    combinedData.set(contentIv, 0);
    combinedData.set(new Uint8Array(encryptedContent), contentIv.length);
    
    // Upload encrypted content to storage
    await uploadFileData(storagePath, combinedData);

    // Update the user's personalized file name based on the form title
    const { setUserFileName } = await import('../services/userNamesManagement');
    await setUserFileName(fileId, fileName.replace('.form', ''), userId, privateKey, existingFile);

    // Update file record with new content path
    // Keep the existing encryptedKeys to preserve sharing permissions
    const updateData = {
      storagePath,
      // Don't update encryptedKeys - preserve existing sharing
      // Metadata (name/size) remains encrypted with existing keys
    };

    await updateFile(fileId, updateData);
  } catch (error) {
    console.error('Error updating form file:', error);
    throw error;
  }
}

export async function saveFormAsFile(
  formData: SecureFormData,
  userId: string,
  _privateKey: string,
  parentFolder: string | null = null
): Promise<string> {
  console.log('=== saveFormAsFile START ===');
  console.log('Parameters:', { userId, parentFolder, formName: formData?.metadata?.name });
  
  try {
    // Get user profile for public key  
    const userProfile = await getUserProfile(userId);
    if (!userProfile?.publicKey) {
      throw new Error('Public key not found for the user.');
    }
    
    // Debug the user's key information
    const publicKeyHex = userProfile.publicKey;
    const publicKeyBytes = hexToBytes(publicKeyHex);
    console.log('=== USER KEY DEBUG ===');
    console.log('Public key hex length:', publicKeyHex.length);
    console.log('Public key bytes length:', publicKeyBytes.length);
    console.log('Public key hex (first 64 chars):', publicKeyHex.substring(0, 64));
    console.log('Has encryptedPrivateKey:', !!userProfile.encryptedPrivateKey);
    console.log('Has legacyEncryptedPrivateKey:', !!userProfile.legacyEncryptedPrivateKey);
    console.log('========================');
    
    // ML-KEM-768 expects 1184-byte public keys
    if (publicKeyBytes.length !== 1184) {
      throw new Error(`Invalid ML-KEM-768 public key length: expected 1184 bytes, got ${publicKeyBytes.length} bytes. Please regenerate your keys from the Profile page.`);
    }

    // Update timestamp
    const updatedFormData = {
      ...formData,
      metadata: {
        ...formData.metadata,
        modified: new Date().toISOString(),
      },
    };

    // Create JSON content
    const jsonString = JSON.stringify(updatedFormData, null, 2);
    
    // Convert JSON to bytes for encryption
    const content = new TextEncoder().encode(jsonString);
    
    // Use titleField from template to generate document name
    const fileName = generateDocumentName(updatedFormData);
    
    // Use the centralized encryption service
    console.log('Encrypting form with FileEncryptionService...');
    const encryptionResult = await FileEncryptionService.encryptFileForUsers(
      content,
      fileName,
      jsonString.length,
      [userId], // Only current user initially
      userId,
      parentFolder
    );
    console.log('Form encrypted successfully');
    
    console.log('FileEncryptionService completed all encryption tasks');
    
    // Upload encrypted content to storage
    console.log('Uploading file data to storage...');
    await uploadFileData(encryptionResult.storagePath, encryptionResult.encryptedContent);
    console.log('File data uploaded successfully');

    // Create file record using existing file sharing system
    console.log('Creating file record in database...');
    const fileRecord = await FileEncryptionService.createFileRecord(
      userId,
      encryptionResult.encryptedMetadata,
      encryptionResult.storagePath,
      encryptionResult.encryptedKeys,
      [userId], // Only current user initially
      parentFolder
    );
    
    const fileId = await createFileWithSharing(fileRecord);
    console.log('File record created successfully, fileId:', fileId);

    return fileId;
  } catch (error) {
    console.error('=== ERROR in saveFormAsFile ===');
    console.error('Error details:', error);
    console.error('Error message:', error instanceof Error ? error.message : String(error));
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    console.error('Parameters were:', { userId, parentFolder, formName: formData?.metadata?.name });
    
    // Re-throw with more context
    const contextError = new Error(`Form save failed: ${error instanceof Error ? error.message : String(error)}`);
    contextError.cause = error;
    throw contextError;
  }
}

/**
 * Load form data from a JSON file
 */
export async function loadFormFromFile(fileContent: string): Promise<SecureFormData> {
  try {
    const formData = JSON.parse(fileContent) as SecureFormData;
    
    // Validate the form data structure
    if (!formData.metadata?.name || !formData.schema?.fields || !formData.data) {
      throw new Error('Invalid form data structure');
    }
    
    // Update last accessed timestamp
    if (formData.lastAccessed) {
      formData.lastAccessed = new Date().toISOString();
    }
    
    return formData;
  } catch (error) {
    console.error('Error parsing form data:', error);
    throw new Error('Failed to load form data');
  }
}

/**
 * Check if a file is a form file based on extension
 */
export function isFormFile(fileName: string): boolean {
  return fileName.endsWith('.form');
}

/**
 * Get display name from form filename
 */
export function getFormDisplayName(fileName: string): string {
  // Remove the .form extension
  return fileName.replace(/\.form$/, '');
}

/**
 * Add a custom field to a form schema
 */
export function addFormField(
  formData: SecureFormData,
  fieldDefinition: Omit<FormFieldDefinition, 'id'>
): SecureFormData {
  const fieldId = `field_${Date.now()}`;
  const newField: FormFieldDefinition = {
    id: fieldId,
    ...fieldDefinition,
  };

  return {
    ...formData,
    schema: {
      ...formData.schema,
      fields: [...formData.schema.fields, newField],
    },
    data: {
      ...formData.data,
      [fieldId]: fieldDefinition.type === 'file' ? [] : '', // Initialize array for file fields, string for others
    },
    metadata: {
      ...formData.metadata,
      modified: new Date().toISOString(),
    },
  };
}

/**
 * Remove a field from a form schema
 */
export function removeFormField(formData: SecureFormData, fieldId: string): SecureFormData {
  const updatedData = { ...formData.data };
  delete updatedData[fieldId];

  return {
    ...formData,
    schema: {
      ...formData.schema,
      fields: formData.schema.fields.filter(field => field.id !== fieldId),
    },
    data: updatedData,
    metadata: {
      ...formData.metadata,
      modified: new Date().toISOString(),
    },
  };
}

/**
 * Update a field definition in a form schema
 */
export function updateFormField(
  formData: SecureFormData,
  fieldId: string,
  updates: Partial<FormFieldDefinition>
): SecureFormData {
  return {
    ...formData,
    schema: {
      ...formData.schema,
      fields: formData.schema.fields.map(field =>
        field.id === fieldId ? { ...field, ...updates } : field
      ),
    },
    metadata: {
      ...formData.metadata,
      modified: new Date().toISOString(),
    },
  };
}

/**
 * Update field data (user's input)
 */
export function updateFormData(
  formData: SecureFormData,
  fieldId: string,
  value: string | string[]
): SecureFormData {

  const result = {
    ...formData,
    data: {
      ...formData.data,
      [fieldId]: value,
    },
    metadata: {
      ...formData.metadata,
      modified: new Date().toISOString(),
    },
  };

  return result;
}

/**
 * Add a file attachment to a form
 */
export function addFileAttachment(
  formData: SecureFormData,
  fieldId: string,
  fileId: string,
  fileMetadata: Omit<AttachedFile, 'id'>
): SecureFormData {
  const field = formData.schema.fields.find(f => f.id === fieldId);
  if (!field || field.type !== 'file') {
    throw new Error('Field is not a file field');
  }

  const currentFiles = (formData.data[fieldId] as string[]) || [];
  const maxFiles = field.fileConfig?.maxFiles || 5;
  
  if (currentFiles.length >= maxFiles) {
    throw new Error(`Maximum ${maxFiles} files allowed`);
  }

  const attachment: AttachedFile = {
    id: fileId,
    ...fileMetadata,
  };

  return {
    ...formData,
    data: {
      ...formData.data,
      [fieldId]: [...currentFiles, fileId],
    },
    attachments: {
      ...formData.attachments,
      [fileId]: attachment,
    },
    metadata: {
      ...formData.metadata,
      modified: new Date().toISOString(),
    },
  };
}

/**
 * Remove a file attachment from a form
 */
export function removeFileAttachment(
  formData: SecureFormData,
  fieldId: string,
  fileId: string
): SecureFormData {
  const currentFiles = (formData.data[fieldId] as string[]) || [];
  const updatedFiles = currentFiles.filter(id => id !== fileId);
  
  const updatedAttachments = { ...formData.attachments };
  delete updatedAttachments[fileId];

  return {
    ...formData,
    data: {
      ...formData.data,
      [fieldId]: updatedFiles,
    },
    attachments: updatedAttachments,
    metadata: {
      ...formData.metadata,
      modified: new Date().toISOString(),
    },
  };
}

/**
 * Get file attachments for a specific field
 */
export function getFieldAttachments(
  formData: SecureFormData,
  fieldId: string
): AttachedFile[] {
  const fileIds = (formData.data[fieldId] as string[]) || [];
  return fileIds
    .map(fileId => formData.attachments?.[fileId])
    .filter((attachment): attachment is AttachedFile => attachment !== undefined);
}

/**
 * Validate form data
 */
export function validateForm(formData: SecureFormData): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!formData.metadata.name.trim()) {
    errors.push('Form title is required');
  }

  formData.schema.fields.forEach((field) => {
    const value = formData.data[field.id];
    
    // Handle file fields separately
    if (field.type === 'file') {
      const fileIds = (value as string[]) || [];
      if (field.required && fileIds.length === 0) {
        errors.push(`${field.label} is required`);
      }
      return;
    }
    
    // Handle regular text fields
    const textValue = value as string || '';
    if (field.required && !textValue.trim()) {
      errors.push(`${field.label} is required`);
    }

    if (textValue) {
      // Validate email fields
      if (field.type === 'email' && !/\S+@\S+\.\S+/.test(textValue)) {
        errors.push(`${field.label} must be a valid email address`);
      }

      // Validate date fields
      if (field.type === 'date' && isNaN(Date.parse(textValue))) {
        errors.push(`${field.label} must be a valid date`);
      }

      // Validate number fields
      if (field.type === 'number' && isNaN(Number(textValue))) {
        errors.push(`${field.label} must be a valid number`);
      }

      // Validate custom validation rules
      if (field.validation) {
        const validation = field.validation;
        
        if (validation.minLength && textValue.length < validation.minLength) {
          errors.push(validation.customMessage || `${field.label} must be at least ${validation.minLength} characters long`);
        }
        
        if (validation.maxLength && textValue.length > validation.maxLength) {
          errors.push(validation.customMessage || `${field.label} must be no more than ${validation.maxLength} characters long`);
        }
        
        if (validation.pattern && !new RegExp(validation.pattern).test(textValue)) {
          errors.push(validation.customMessage || `${field.label} has an invalid format`);
        }
      }
    }
  });

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Get localized field definition
 */
export function getLocalizedField(
  formData: SecureFormData,
  fieldId: string,
  locale: string = 'en'
): FormFieldDefinition {
  const field = formData.schema.fields.find(f => f.id === fieldId);
  if (!field) {
    throw new Error(`Field ${fieldId} not found`);
  }

  const localization = formData.localization?.[locale]?.fields?.[fieldId];
  if (!localization) {
    return field;
  }

  return {
    ...field,
    label: localization.label || field.label,
    placeholder: localization.placeholder || field.placeholder,
    options: localization.options || field.options,
  };
}

/**
 * Toggle favorite status of a form file
 */
export async function toggleFormFavorite(
  fileId: string,
  _privateKey: string,
  userId: string
): Promise<void> {
  const { doc, updateDoc, getDoc } = await import('firebase/firestore');
  const { db } = await import('../firebase');
  
  try {
    // Get the current file document
    const fileRef = doc(db, 'files', fileId);
    const fileSnap = await getDoc(fileRef);
    
    if (!fileSnap.exists()) {
      throw new Error('File not found');
    }
    
    const fileData = fileSnap.data();
    
    // Check if user has access to this file
    if (fileData.owner !== userId && !fileData.sharedWith?.includes(userId)) {
      throw new Error('Access denied');
    }
    
    // Toggle the favorite status directly in the file document
    const currentFavorite = fileData.isFavorite || false;
    
    await updateDoc(fileRef, {
      isFavorite: !currentFavorite,
      lastModified: new Date().toISOString(),
    });
    
    console.log(`✅ Toggled favorite status for file: ${fileData.name || '[Encrypted]'} -> ${!currentFavorite}`);
    
  } catch (error) {
    console.error('Error toggling favorite status:', error);
    throw error;
  }
}