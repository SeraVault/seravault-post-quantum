import React, { useState, useRef } from 'react';
import {
  Box,
  Typography,
  Button,
  Chip,
  IconButton,
  Alert,
  LinearProgress,
  Paper,
  Divider,
} from '@mui/material';
import {
  AttachFile,
  Delete,
  Upload,
  Description,
  CloudUpload,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { uploadFileData } from '../storage';
import { createFileWithSharing } from '../files';
import { getUserProfile } from '../firestore';
import { encryptData } from '../crypto/hpkeCrypto';
import { encryptMetadata, hexToBytes, bytesToHex } from '../crypto/hpkeCrypto';
import type { FormFieldDefinition, AttachedFile } from '../utils/formFiles';

interface FileAttachmentFieldProps {
  field: FormFieldDefinition;
  attachments: AttachedFile[];
  userId: string;
  privateKey: string;
  parentFolder: string | null;
  onFileAdded: (fileId: string, metadata: Omit<AttachedFile, 'id'>) => void;
  onFileRemoved: (fileId: string) => void;
  disabled?: boolean;
}

const FileAttachmentField: React.FC<FileAttachmentFieldProps> = ({
  field,
  attachments,
  userId,
  privateKey,
  parentFolder,
  onFileAdded,
  onFileRemoved,
  disabled = false,
}) => {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const maxFiles = field.fileConfig?.maxFiles || 5;
  const maxFileSize = field.fileConfig?.maxFileSize || 10 * 1024 * 1024; // 10MB
  const allowedTypes = field.fileConfig?.allowedTypes;

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const validateFile = (file: File): string | null => {
    if (file.size > maxFileSize) {
      return t('forms.fileField.errors.fileTooLarge', { 
        size: formatFileSize(maxFileSize) 
      }) || `File too large. Maximum size: ${formatFileSize(maxFileSize)}`;
    }

    if (allowedTypes && !allowedTypes.includes(file.type)) {
      return t('forms.fileField.errors.fileTypeNotAllowed', {
        types: allowedTypes.join(', ')
      }) || `File type not allowed. Allowed types: ${allowedTypes.join(', ')}`;
    }

    return null;
  };

  const handleFileSelect = () => {
    if (disabled || uploading) return;
    
    if (attachments.length >= maxFiles) {
      setError(t('forms.fileField.errors.maxFilesReached', { max: maxFiles }) || 
              `Maximum ${maxFiles} files allowed`);
      return;
    }

    fileInputRef.current?.click();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const file = files[0]; // Handle one file at a time for now
    setError(null);
    setUploadProgress(0);

    // Validate file
    const validationError = validateFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    // Check if adding this file would exceed the limit
    if (attachments.length >= maxFiles) {
      setError(t('forms.fileField.errors.maxFilesReached', { max: maxFiles }) || 
              `Maximum ${maxFiles} files allowed`);
      return;
    }

    setUploading(true);

    try {
      // Get user profile for public key
      const userProfile = await getUserProfile(userId);
      if (!userProfile?.publicKey) {
        throw new Error('Public key not found for the user.');
      }

      setUploadProgress(20);

      // Read file as ArrayBuffer
      const fileBuffer = await file.arrayBuffer();
      const fileData = new Uint8Array(fileBuffer);

      setUploadProgress(40);

      // Encrypt file using HPKE
      const publicKey = hexToBytes(userProfile.publicKey);
      
      // Generate a random file key for AES encryption
      const fileKey = crypto.getRandomValues(new Uint8Array(32));
      
      // Encrypt the file key using HPKE
      const encryptedFileKey = await encryptData(fileKey, publicKey);
      
      // Combine encapsulated key and ciphertext for storage
      const combinedKeyData = new Uint8Array(
        encryptedFileKey.encapsulatedKey.length + 
        encryptedFileKey.ciphertext.length
      );
      combinedKeyData.set(encryptedFileKey.encapsulatedKey, 0);
      combinedKeyData.set(
        encryptedFileKey.ciphertext, 
        encryptedFileKey.encapsulatedKey.length
      );
      
      const cipherText = combinedKeyData;
      const sharedSecret = fileKey;

      setUploadProgress(60);

      // Encrypt file content
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const key = await crypto.subtle.importKey('raw', sharedSecret, { name: 'AES-GCM' }, false, ['encrypt']);
      const encryptedContent = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv }, 
        key, 
        fileData
      );

      // Encrypt metadata
      const encryptedMetadata = await encryptMetadata(
        { name: file.name, size: file.size.toString() },
        sharedSecret
      );

      setUploadProgress(80);

      // Create storage path
      const storagePath = `files/${userId}/${crypto.randomUUID()}`;
      
      // Combine IV and encrypted content
      const combinedData = new Uint8Array(iv.length + encryptedContent.byteLength);
      combinedData.set(iv, 0);
      combinedData.set(new Uint8Array(encryptedContent), iv.length);
      
      // Upload encrypted content to storage
      await uploadFileData(storagePath, combinedData);

      setUploadProgress(90);

      // Create file record
      const fileId = await createFileWithSharing({
        owner: userId,
        name: encryptedMetadata.name,
        parent: parentFolder, // Files attached to forms go in same folder as form
        size: encryptedMetadata.size,
        storagePath,
        encryptedKeys: { [userId]: bytesToHex(cipherText) },
        sharedWith: [userId],
      });

      // Add to form
      onFileAdded(fileId, {
        originalName: file.name,
        size: file.size,
        mimeType: file.type,
        uploadedAt: new Date().toISOString(),
      });

      setUploadProgress(100);
      
      // Clear file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

    } catch (error) {
      console.error('Error uploading file:', error);
      setError(error instanceof Error ? error.message : 'Upload failed');
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const handleRemoveFile = (fileId: string) => {
    if (disabled || uploading) return;
    onFileRemoved(fileId);
  };

  return (
    <Box>
      <Typography variant="subtitle2" sx={{ mb: 1 }}>
        {field.label} {field.required && '*'}
      </Typography>

      {field.fileConfig?.description && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {field.fileConfig.description}
        </Typography>
      )}

      {/* File Upload Area */}
      <Paper
        variant="outlined"
        sx={{
          p: 2,
          textAlign: 'center',
          bgcolor: disabled ? 'action.disabledBackground' : 'background.default',
          cursor: disabled || uploading || attachments.length >= maxFiles ? 'default' : 'pointer',
          border: '2px dashed',
          borderColor: error ? 'error.main' : 'divider',
          '&:hover': {
            borderColor: disabled || uploading || attachments.length >= maxFiles ? undefined : 'primary.main',
            bgcolor: disabled || uploading || attachments.length >= maxFiles ? undefined : 'action.hover',
          },
        }}
        onClick={handleFileSelect}
      >
        <CloudUpload sx={{ fontSize: 48, color: 'text.secondary', mb: 1 }} />
        <Typography variant="h6" sx={{ mb: 1 }}>
          {uploading 
            ? t('forms.fileField.uploading', 'Uploading...') 
            : attachments.length >= maxFiles
            ? t('forms.fileField.maxFilesReached', 'Maximum files reached')
            : t('forms.fileField.dropOrClick', 'Drop files here or click to browse')
          }
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {t('forms.fileField.maxSize', { size: formatFileSize(maxFileSize) }) || 
           `Maximum file size: ${formatFileSize(maxFileSize)}`}
          {allowedTypes && (
            <>
              <br />
              {t('forms.fileField.allowedTypes', { types: allowedTypes.join(', ') }) || 
               `Allowed types: ${allowedTypes.join(', ')}`}
            </>
          )}
        </Typography>
      </Paper>

      <input
        ref={fileInputRef}
        type="file"
        style={{ display: 'none' }}
        onChange={handleFileChange}
        accept={allowedTypes?.join(',')}
        disabled={disabled || uploading || attachments.length >= maxFiles}
      />

      {/* Upload Progress */}
      {uploading && (
        <Box sx={{ mt: 2 }}>
          <LinearProgress variant="determinate" value={uploadProgress} />
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            {t('forms.fileField.uploadProgress', { progress: uploadProgress }) || 
             `Upload progress: ${uploadProgress}%`}
          </Typography>
        </Box>
      )}

      {/* Error Message */}
      {error && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {error}
        </Alert>
      )}

      {/* Attached Files List */}
      {attachments.length > 0 && (
        <Box sx={{ mt: 2 }}>
          <Divider sx={{ mb: 2 }} />
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            {t('forms.fileField.attachedFiles', 'Attached Files')} ({attachments.length}/{maxFiles})
          </Typography>
          
          {attachments.map((attachment) => (
            <Box
              key={attachment.id}
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                p: 1,
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 1,
                mb: 1,
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', flex: 1 }}>
                <Description sx={{ mr: 1, color: 'text.secondary' }} />
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    {attachment.originalName}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {formatFileSize(attachment.size)}
                    {attachment.mimeType && ` • ${attachment.mimeType}`}
                  </Typography>
                </Box>
              </Box>
              
              <IconButton
                size="small"
                onClick={() => handleRemoveFile(attachment.id)}
                disabled={disabled || uploading}
                color="error"
              >
                <Delete />
              </IconButton>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
};

export default FileAttachmentField;