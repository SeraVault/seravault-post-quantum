import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  TextField,
  IconButton,
  Chip,
  Divider,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  InputAdornment,
  Tooltip,
  CircularProgress,
} from '@mui/material';
import {
  Edit,
  Visibility,
  VisibilityOff,
  ContentCopy,
  Close,
  Download,
  Extension,
} from '@mui/icons-material';
import MDEditor from '@uiw/react-md-editor';
import type { SecureFormData } from '../utils/formFiles';
import type { FileData } from '../files';
import { getFile } from '../storage';
import { getFieldAttachments } from '../utils/formFiles';

interface FormFileViewerProps {
  file: FileData;
  privateKey: string;
  userId: string;
  onEdit: () => void;
  onClose: () => void;
  onDownload?: () => void;
}


const FormFileViewer: React.FC<FormFileViewerProps> = ({ file, privateKey, userId, onEdit, onClose, onDownload }) => {
  const [formData, setFormData] = useState<SecureFormData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [visibleFields, setVisibleFields] = useState<Set<string>>(new Set());
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [loadAttempts, setLoadAttempts] = useState(0);

  useEffect(() => {
    const loadFormData = async (retryCount = 0) => {
      try {
        setLoading(true);
        setError(null);
        setLoadAttempts(retryCount + 1);
        
        // Download and decrypt the file content (same process as regular files)
        const encryptedContent = await getFile(file.storagePath);
        
        // Get the user's encrypted key for this file
        const userEncryptedKey = file.encryptedKeys[userId];
        
        if (!userEncryptedKey) {
          throw new Error('No access key found for this file');
        }
        
        // Import crypto functions
        const { ml_kem768 } = await import('@noble/post-quantum/ml-kem');
        
        // Helper functions
        const hexToBytes = (hex: string) => {
          const bytes = new Uint8Array(hex.length / 2);
          for (let i = 0; i < hex.length; i += 2) {
            bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
          }
          return bytes;
        };
        
        // Decrypt the shared secret
        const privateKeyBytes = hexToBytes(privateKey);
        const ciphertext = hexToBytes(userEncryptedKey);
        const sharedSecret = await ml_kem768.decapsulate(ciphertext, privateKeyBytes);
        
        // Debug logging
        console.log('Encrypted content length:', encryptedContent.byteLength);
        console.log('Shared secret length:', sharedSecret.length);
        console.log('IV (first 12 bytes):', Array.from(encryptedContent.slice(0, 12)));
        
        // Check if this looks like it has IV prepended (new format)
        // or if it's just the encrypted content (old format)
        let iv, ciphertextData;
        
        if (encryptedContent.byteLength > 12) {
          // Assume new format with IV prepended
          iv = encryptedContent.slice(0, 12);
          ciphertextData = encryptedContent.slice(12);
          console.log('Using new format with IV prepended');
        } else {
          // Old format - try to handle gracefully or show error
          throw new Error('Invalid encrypted content format - file may be corrupted or from an incompatible version');
        }
        
        console.log('IV length:', iv.byteLength);
        console.log('Ciphertext length:', ciphertextData.byteLength);
        
        const key = await crypto.subtle.importKey('raw', sharedSecret, { name: 'AES-GCM' }, false, ['decrypt']);
        console.log('Key imported successfully');
        
        const decryptedContentBuffer = await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv: iv }, 
          key, 
          ciphertextData
        );
        
        const decryptedContent = new TextDecoder().decode(decryptedContentBuffer);
        console.log('Decryption successful, content length:', decryptedContent.length);
        console.log('Decrypted content preview:', decryptedContent.substring(0, 200) + '...');
        
        // Parse the JSON content
        let parsedFormData;
        try {
          parsedFormData = JSON.parse(decryptedContent) as SecureFormData;
          console.log('JSON parsing successful:', parsedFormData);
        } catch (jsonError) {
          console.error('JSON parsing failed:', jsonError);
          console.log('Raw content that failed to parse:', decryptedContent);
          throw new Error(`Failed to parse form data as JSON: ${jsonError instanceof Error ? jsonError.message : 'Unknown error'}`);
        }
        
        console.log('Setting form data:', parsedFormData);
        setFormData(parsedFormData);
        setError(null);
        setLoading(false); // Set loading to false on success
        console.log('Form data set successfully, loading state set to false');
      } catch (err) {
        console.error(`Error loading form data (attempt ${retryCount + 1}):`, err);
        
        // Retry logic for network/CORS errors with longer delays
        const isCORSError = err instanceof Error && (
          err.message.includes('CORS') || 
          err.message.includes('ERR_FAILED') || 
          err.message.includes('304') ||
          err.message.includes('network') ||
          err.message.includes('Access-Control-Allow-Origin')
        );
        
        if (retryCount < 3 && isCORSError) {
          // Use longer delays for CORS issues as they may need time to propagate
          const delay = retryCount === 0 ? 2000 : (retryCount + 1) * 3000; // 2s, 6s, 9s
          console.log(`CORS/Network error detected. Retrying form load in ${delay}ms...`);
          setTimeout(() => {
            loadFormData(retryCount + 1);
          }, delay);
          return;
        }
        
        setError(`Failed to load form data${retryCount > 0 ? ` after ${retryCount + 1} attempts` : ''}`);
        setLoading(false);
      }
    };

    loadFormData();
  }, [file, privateKey]);

  const handleManualRetry = () => {
    setError(null);
    setLoadAttempts(0);
    
    const loadFormData = async () => {
      try {
        setLoading(true);
        
        // Download and decrypt the file content (same process as regular files)
        const encryptedContent = await getFile(file.storagePath);
        
        // Get the user's encrypted key for this file
        const userEncryptedKey = file.encryptedKeys[userId];
        
        if (!userEncryptedKey) {
          throw new Error('No access key found for this file');
        }
        
        // Import crypto functions
        const { ml_kem768 } = await import('@noble/post-quantum/ml-kem');
        
        // Helper functions
        const hexToBytes = (hex: string) => {
          const bytes = new Uint8Array(hex.length / 2);
          for (let i = 0; i < hex.length; i += 2) {
            bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
          }
          return bytes;
        };
        
        // Decrypt the shared secret
        const privateKeyBytes = hexToBytes(privateKey);
        const ciphertext = hexToBytes(userEncryptedKey);
        const sharedSecret = await ml_kem768.decapsulate(ciphertext, privateKeyBytes);
        
        // Debug logging
        console.log('Encrypted content length:', encryptedContent.byteLength);
        console.log('Shared secret length:', sharedSecret.length);
        console.log('IV (first 12 bytes):', Array.from(encryptedContent.slice(0, 12)));
        
        // Check if this looks like it has IV prepended (new format)
        // or if it's just the encrypted content (old format)
        let iv, ciphertextData;
        
        if (encryptedContent.byteLength > 12) {
          // Assume new format with IV prepended
          iv = encryptedContent.slice(0, 12);
          ciphertextData = encryptedContent.slice(12);
          console.log('Using new format with IV prepended');
        } else {
          // Old format - try to handle gracefully or show error
          throw new Error('Invalid encrypted content format - file may be corrupted or from an incompatible version');
        }
        
        console.log('IV length:', iv.byteLength);
        console.log('Ciphertext length:', ciphertextData.byteLength);
        
        const key = await crypto.subtle.importKey('raw', sharedSecret, { name: 'AES-GCM' }, false, ['decrypt']);
        console.log('Key imported successfully');
        
        const decryptedContentBuffer = await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv: iv }, 
          key, 
          ciphertextData
        );
        
        const decryptedContent = new TextDecoder().decode(decryptedContentBuffer);
        console.log('Decryption successful, content length:', decryptedContent.length);
        console.log('Decrypted content preview:', decryptedContent.substring(0, 200) + '...');
        
        // Parse the JSON content
        let parsedFormData;
        try {
          parsedFormData = JSON.parse(decryptedContent) as SecureFormData;
          console.log('JSON parsing successful:', parsedFormData);
        } catch (jsonError) {
          console.error('JSON parsing failed:', jsonError);
          console.log('Raw content that failed to parse:', decryptedContent);
          throw new Error(`Failed to parse form data as JSON: ${jsonError instanceof Error ? jsonError.message : 'Unknown error'}`);
        }
        
        console.log('Setting form data:', parsedFormData);
        setFormData(parsedFormData);
        setError(null);
        setLoading(false); // Set loading to false on success
        console.log('Form data set successfully, loading state set to false');
      } catch (err) {
        console.error('Manual retry failed:', err);
        setError('Failed to load form data');
      } finally {
        setLoading(false);
      }
    };

    loadFormData();
  };

  const toggleFieldVisibility = (fieldId: string) => {
    const newVisible = new Set(visibleFields);
    if (newVisible.has(fieldId)) {
      newVisible.delete(fieldId);
    } else {
      newVisible.add(fieldId);
    }
    setVisibleFields(newVisible);
  };

  const copyToClipboard = async (text: string, fieldId: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(fieldId);
      setTimeout(() => setCopiedField(null), 2000);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const renderFormField = (field: any) => {
    const isSensitive = field.sensitive || field.type === 'password';
    const isVisible = visibleFields.has(field.id);
    
    let displayValue = formData!.data[field.id] || '';
    
    // Special formatting for sensitive fields when not visible
    const fieldValue = formData!.data[field.id] || '';
    if (isSensitive && !isVisible && fieldValue) {
      if (field.type === 'password') {
        displayValue = '••••••••';
      } else if (field.label.toLowerCase().includes('card number')) {
        displayValue = '**** **** **** ' + fieldValue.slice(-4);
      } else if (field.label.toLowerCase().includes('cvv')) {
        displayValue = '•••';
      } else {
        displayValue = '••••••••';
      }
    }

    // Handle rich text fields
    if (field.type === 'richtext') {
      return (
        <Box>
          <Typography variant="subtitle2" gutterBottom>
            {field.label} {field.required && '*'}
          </Typography>
          <Box sx={{ 
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 1,
            p: 1,
            backgroundColor: 'background.paper',
            minHeight: '60px',
            '& .w-md-editor-preview': {
              backgroundColor: 'transparent',
              padding: '8px',
            },
            '& .w-md-editor': {
              backgroundColor: 'transparent',
            }
          }}>
            {fieldValue ? (
              <MDEditor.Markdown source={fieldValue} />
            ) : (
              <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic', p: 1 }}>
                No value
              </Typography>
            )}
          </Box>
        </Box>
      );
    }

    // Handle textarea fields
    if (field.type === 'textarea') {
      return (
        <TextField
          label={`${field.label} ${field.required ? '*' : ''}`}
          value={displayValue}
          multiline
          rows={3}
          fullWidth
          variant="outlined"
          InputProps={{
            readOnly: true,
            endAdornment: (
              <InputAdornment position="end">
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  {isSensitive && (
                    <Tooltip title={isVisible ? 'Hide' : 'Show'}>
                      <IconButton
                        size="small"
                        onClick={() => toggleFieldVisibility(field.id)}
                      >
                        {isVisible ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                      </IconButton>
                    </Tooltip>
                  )}
                  <Tooltip title={copiedField === field.id ? 'Copied!' : 'Copy'}>
                    <IconButton
                      size="small"
                      onClick={() => copyToClipboard(fieldValue, field.id)}
                      sx={{ 
                        color: copiedField === field.id ? 'success.main' : 'text.secondary',
                      }}
                    >
                      <ContentCopy fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Box>
              </InputAdornment>
            ),
          }}
        />
      );
    }

    // Handle file attachment fields
    if (field.type === 'file') {
      const attachments = getFieldAttachments(formData!, field.id);
      
      return (
        <Box>
          <Typography variant="subtitle2" gutterBottom>
            {field.label} {field.required && '*'}
          </Typography>
          
          {field.fileConfig?.description && (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              {field.fileConfig.description}
            </Typography>
          )}

          {attachments.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic', p: 2, textAlign: 'center' }}>
              No files attached
            </Typography>
          ) : (
            <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 1 }}>
              <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                {attachments.length} file{attachments.length !== 1 ? 's' : ''} attached
              </Typography>
              
              {attachments.map((attachment, index) => (
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
                    mb: index < attachments.length - 1 ? 1 : 0,
                    bgcolor: 'background.paper',
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', flex: 1 }}>
                    <Extension sx={{ mr: 1, color: 'text.secondary' }} />
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>
                        {attachment.originalName}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {formatFileSize(attachment.size)}
                        {attachment.mimeType && ` • ${attachment.mimeType}`}
                        {attachment.uploadedAt && ` • ${new Date(attachment.uploadedAt).toLocaleDateString()}`}
                      </Typography>
                    </Box>
                  </Box>
                  
                  <Tooltip title="Download file">
                    <IconButton
                      size="small"
                      onClick={() => {
                        // TODO: Implement file download functionality
                        console.log('Download file:', attachment.id);
                      }}
                      color="primary"
                    >
                      <Download fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Box>
              ))}
            </Box>
          )}
        </Box>
      );
    }

    // Handle regular input fields
    return (
      <TextField
        label={`${field.label} ${field.required ? '*' : ''}`}
        value={displayValue}
        type={isSensitive && !isVisible ? 'password' : 'text'}
        fullWidth
        variant="outlined"
        InputProps={{
          readOnly: true,
          endAdornment: (
            <InputAdornment position="end">
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                {isSensitive && (
                  <Tooltip title={isVisible ? 'Hide' : 'Show'}>
                    <IconButton
                      size="small"
                      onClick={() => toggleFieldVisibility(field.id)}
                    >
                      {isVisible ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                    </IconButton>
                  </Tooltip>
                )}
                <Tooltip title={copiedField === field.id ? 'Copied!' : 'Copy'}>
                  <IconButton
                    size="small"
                    onClick={() => copyToClipboard(fieldValue, field.id)}
                    sx={{ 
                      color: copiedField === field.id ? 'success.main' : 'text.secondary',
                    }}
                  >
                    <ContentCopy fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Box>
            </InputAdornment>
          ),
        }}
      />
    );
  };

  if (loading) {
    return (
      <Dialog open onClose={onClose} maxWidth="md" fullWidth>
        <DialogContent sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 200 }}>
          <CircularProgress />
        </DialogContent>
      </Dialog>
    );
  }

  if (error || !formData) {
    return (
      <Dialog open onClose={onClose} maxWidth="md" fullWidth>
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          Error Loading Form
          <Box sx={{ display: 'flex', gap: 1 }}>
            {onDownload && (
              <IconButton onClick={onDownload} title="Download">
                <Download />
              </IconButton>
            )}
            <IconButton onClick={onClose} title="Close">
              <Close />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent>
          <Typography color="error" gutterBottom>
            {error || 'Failed to load form data'}
          </Typography>
          {loadAttempts > 1 && (
            <Typography variant="body2" color="text.secondary">
              Attempted {loadAttempts} times. This may be due to network connectivity or Firebase Storage CORS policy.
            </Typography>
          )}
        </DialogContent>
        <DialogActions sx={{ justifyContent: 'flex-end', gap: 1 }}>
          <Button onClick={handleManualRetry} variant="outlined">
            Retry
          </Button>
          {onDownload && (
            <Button 
              onClick={onDownload} 
              variant="outlined"
              startIcon={<Download />}
            >
              Download
            </Button>
          )}
          <Button onClick={onClose} variant="contained">
            Close
          </Button>
        </DialogActions>
      </Dialog>
    );
  }

  const FormIcon = Extension; // Default icon for new form system
  const formColor = formData.metadata.color || '#455a64';

  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {formData.metadata.name}
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <Button
              startIcon={<Edit />}
              onClick={onEdit}
              variant="outlined"
              size="small"
            >
              Edit
            </Button>
            {onDownload && (
              <IconButton onClick={onDownload} title="Download" size="small">
                <Download />
              </IconButton>
            )}
            <IconButton onClick={onClose} title="Close" size="small">
              <Close />
            </IconButton>
          </Box>
        </Box>
      </DialogTitle>

      <DialogContent sx={{ pt: 2 }}>
        <Box sx={{ pb: 2 }}>
          {/* Tags */}
          {formData.tags && formData.tags.length > 0 && (
            <Box sx={{ mb: 3 }}>
              <Typography variant="subtitle2" gutterBottom color="text.secondary">
                Tags
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                {formData.tags.map((tag, index) => (
                  <Chip key={index} label={tag} size="small" variant="outlined" />
                ))}
              </Box>
            </Box>
          )}

          <Divider sx={{ my: 2 }} />

          {/* Form Fields */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {formData.schema.fields.map((field) => (
              <Box key={field.id}>
                {renderFormField(field)}
              </Box>
            ))}
          </Box>

          {/* Metadata */}
          <Divider sx={{ my: 3 }} />
          
          <Box sx={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            <Box>
              <Typography variant="caption" color="text.secondary">
                Created
              </Typography>
              <Typography variant="body2">
                {new Date(formData.metadata.created).toLocaleDateString()}
              </Typography>
            </Box>
            
            <Box>
              <Typography variant="caption" color="text.secondary">
                Updated
              </Typography>
              <Typography variant="body2">
                {new Date(formData.metadata.modified).toLocaleDateString()}
              </Typography>
            </Box>
            
            {file.sharedWith.length > 0 && (
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Shared with
                </Typography>
                <Typography variant="body2">
                  {file.sharedWith.length} user{file.sharedWith.length !== 1 ? 's' : ''}
                </Typography>
              </Box>
            )}
          </Box>
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2, justifyContent: 'flex-end', gap: 1 }}>
        {onDownload && (
          <Button 
            onClick={onDownload} 
            variant="outlined"
            startIcon={<Download />}
          >
            Download
          </Button>
        )}
        <Button onClick={onClose} variant="contained">
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default FormFileViewer;