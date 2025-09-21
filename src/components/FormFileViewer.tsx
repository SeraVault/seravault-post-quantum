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
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
} from '@mui/material';
import {
  Edit,
  Visibility,
  VisibilityOff,
  ContentCopy,
  Close,
  Download,
  Extension,
  Share,
  MoreVert,
  Print,
} from '@mui/icons-material';
import MDEditor from '@uiw/react-md-editor';
import type { SecureFormData } from '../utils/formFiles';
import type { FileData } from '../files';
import { getFile } from '../storage';
import { getFieldAttachments } from '../utils/formFiles';
import { getUserProfile, updateUserProfile, type UserProfile } from '../firestore';
import PrintSecurityWarningDialog from './PrintSecurityWarningDialog';

interface FormFileViewerProps {
  file: FileData;
  privateKey: string;
  userId: string;
  onEdit: () => void;
  onClose: () => void;
  onDownload?: () => void;
  onShare?: () => void;
}


const FormFileViewer: React.FC<FormFileViewerProps> = ({ file, privateKey, userId, onEdit, onClose, onDownload, onShare }) => {
  const [formData, setFormData] = useState<SecureFormData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ownerDisplayName, setOwnerDisplayName] = useState<string | null>(null);
  const [visibleFields, setVisibleFields] = useState<Set<string>>(new Set());
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [loadAttempts, setLoadAttempts] = useState(0);
  const [menuAnchorEl, setMenuAnchorEl] = useState<null | HTMLElement>(null);
  const [printWarningOpen, setPrintWarningOpen] = useState(false);
  const [currentUserProfile, setCurrentUserProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    const loadProfiles = async () => {
      // Load current user profile for print warning preference
      try {
        const currentProfile = await getUserProfile(userId);
        setCurrentUserProfile(currentProfile);
      } catch (error) {
        console.error('Failed to load current user profile:', error);
      }

      // Load owner display name
      if (file?.owner) {
        try {
          const ownerProfile = await getUserProfile(file.owner);
          setOwnerDisplayName(ownerProfile?.displayName || file.owner);
        } catch (error) {
          console.error('Failed to load owner profile:', error);
          setOwnerDisplayName(file.owner);
        }
      }
    };

    loadProfiles();
  }, [file?.owner, userId]);

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
        const { decryptData } = await import('../crypto/quantumSafeCrypto');
        
        // Helper functions
        const hexToBytes = (hex: string) => {
          const bytes = new Uint8Array(hex.length / 2);
          for (let i = 0; i < hex.length; i += 2) {
            bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
          }
          return bytes;
        };
        
        // Decrypt the shared secret using ML-KEM-768
        const privateKeyBytes = hexToBytes(privateKey);
        const keyData = hexToBytes(userEncryptedKey);
        
        // ML-KEM-768 encrypted keys contain: IV (12 bytes) + encapsulated_key (1088 bytes) + ciphertext  
        const iv = keyData.slice(0, 12);
        const encapsulatedKey = keyData.slice(12, 12 + 1088);
        const ciphertext = keyData.slice(12 + 1088);
        
        const sharedSecret = await decryptData(
          { iv, encapsulatedKey, ciphertext },
          privateKeyBytes
        );
        
        // Debug logging
        console.log('Encrypted content length:', encryptedContent.byteLength);
        console.log('Shared secret length:', sharedSecret.length);
        console.log('IV (first 12 bytes):', Array.from(encryptedContent.slice(0, 12)));
        
        // Check if this looks like it has IV prepended (new format)
        // or if it's just the encrypted content (old format)
        let contentIv, ciphertextData;
        
        if (encryptedContent.byteLength > 12) {
          // Assume new format with IV prepended
          contentIv = encryptedContent.slice(0, 12);
          ciphertextData = encryptedContent.slice(12);
          console.log('Using new format with IV prepended');
        } else {
          // Old format - try to handle gracefully or show error
          throw new Error('Invalid encrypted content format - file may be corrupted or from an incompatible version');
        }
        
        console.log('IV length:', contentIv.byteLength);
        console.log('Ciphertext length:', ciphertextData.byteLength);
        
        const key = await crypto.subtle.importKey('raw', sharedSecret, { name: 'AES-GCM' }, false, ['decrypt']);
        console.log('Key imported successfully');
        
        const decryptedContentBuffer = await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv: contentIv }, 
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
        const { decryptData } = await import('../crypto/quantumSafeCrypto');
        
        // Helper functions
        const hexToBytes = (hex: string) => {
          const bytes = new Uint8Array(hex.length / 2);
          for (let i = 0; i < hex.length; i += 2) {
            bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
          }
          return bytes;
        };
        
        // Decrypt the shared secret using ML-KEM-768
        const privateKeyBytes = hexToBytes(privateKey);
        const keyData = hexToBytes(userEncryptedKey);
        
        // ML-KEM-768 encrypted keys contain: IV (12 bytes) + encapsulated_key (1088 bytes) + ciphertext  
        const iv = keyData.slice(0, 12);
        const encapsulatedKey = keyData.slice(12, 12 + 1088);
        const ciphertext = keyData.slice(12 + 1088);
        
        const sharedSecret = await decryptData(
          { iv, encapsulatedKey, ciphertext },
          privateKeyBytes
        );
        
        // Debug logging
        console.log('Encrypted content length:', encryptedContent.byteLength);
        console.log('Shared secret length:', sharedSecret.length);
        console.log('IV (first 12 bytes):', Array.from(encryptedContent.slice(0, 12)));
        
        // Check if this looks like it has IV prepended (new format)
        // or if it's just the encrypted content (old format)
        let contentIv, ciphertextData;
        
        if (encryptedContent.byteLength > 12) {
          // Assume new format with IV prepended
          contentIv = encryptedContent.slice(0, 12);
          ciphertextData = encryptedContent.slice(12);
          console.log('Using new format with IV prepended');
        } else {
          // Old format - try to handle gracefully or show error
          throw new Error('Invalid encrypted content format - file may be corrupted or from an incompatible version');
        }
        
        console.log('IV length:', contentIv.byteLength);
        console.log('Ciphertext length:', ciphertextData.byteLength);
        
        const key = await crypto.subtle.importKey('raw', sharedSecret, { name: 'AES-GCM' }, false, ['decrypt']);
        console.log('Key imported successfully');
        
        const decryptedContentBuffer = await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv: contentIv }, 
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

  const handlePrint = () => {
    // Check if user wants to see warning (default: true)
    const shouldShowWarning = currentUserProfile?.showPrintWarning !== false;

    if (shouldShowWarning) {
      setPrintWarningOpen(true);
    } else {
      performPrint();
    }
  };

  const performPrint = () => {
    // Create a print-friendly version of the form
    const printWindow = window.open('', '_blank');
    if (printWindow && formData) {
      const printContent = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>${formData.metadata.name}</title>
            <style>
              body { font-family: Arial, sans-serif; margin: 20px; }
              .form-title { font-size: 24px; font-weight: bold; margin-bottom: 20px; }
              .field { margin-bottom: 15px; }
              .field-label { font-weight: bold; color: #333; }
              .field-value { margin-top: 5px; padding: 8px; background: #f5f5f5; border-radius: 4px; }
              .sensitive { background: #ffe6e6; border: 1px solid #ffcccc; }
              @media print { body { margin: 10px; } }
            </style>
          </head>
          <body>
            <div class="form-title">${formData.metadata.name}</div>
            ${formData.schema.fields.map(field => {
              const value = formData.data[field.id] || '';
              const displayValue = field.sensitive ? '••••••••' : value;
              return `
                <div class="field">
                  <div class="field-label">${field.label}${field.required ? ' *' : ''}</div>
                  <div class="field-value ${field.sensitive ? 'sensitive' : ''}">${displayValue}</div>
                </div>
              `;
            }).join('')}
          </body>
        </html>
      `;

      printWindow.document.write(printContent);
      printWindow.document.close();
      printWindow.print();
    }
  };

  const handleNeverShowPrintWarning = async () => {
    if (userId && currentUserProfile) {
      try {
        await updateUserProfile(userId, { showPrintWarning: false });
        setCurrentUserProfile({ ...currentUserProfile, showPrintWarning: false });
      } catch (error) {
        console.error('Failed to update print warning preference:', error);
      }
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
            {fieldValue && (
              <MDEditor.Markdown source={fieldValue} />
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
          <Box sx={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            pr: 1,
            minWidth: 0,
            fontSize: '1.25rem',
            fontWeight: 500,
            lineHeight: 1.3,
            wordBreak: 'break-word'
          }}>
            Error Loading Form
          </Box>
          <Box sx={{ display: 'flex', gap: 1, flexShrink: 0 }}>
            <IconButton
              onClick={(e) => setMenuAnchorEl(e.currentTarget)}
              title="Actions"
            >
              <MoreVert />
            </IconButton>
            <IconButton onClick={onClose} title="Close">
              <Close />
            </IconButton>
          </Box>
          <Menu
            anchorEl={menuAnchorEl}
            open={Boolean(menuAnchorEl)}
            onClose={() => setMenuAnchorEl(null)}
            transformOrigin={{ horizontal: 'right', vertical: 'top' }}
            anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
          >
            {onDownload && (
              <MenuItem onClick={() => { onDownload(); setMenuAnchorEl(null); }}>
                <ListItemIcon>
                  <Download fontSize="small" />
                </ListItemIcon>
                <ListItemText>Download</ListItemText>
              </MenuItem>
            )}
            <MenuItem
              onClick={() => { handlePrint(); setMenuAnchorEl(null); }}
              disabled={!formData}
            >
              <ListItemIcon>
                <Print fontSize="small" />
              </ListItemIcon>
              <ListItemText>Print</ListItemText>
            </MenuItem>
          </Menu>
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
        <DialogActions sx={{ justifyContent: 'center', gap: 1 }}>
          <Button onClick={handleManualRetry} variant="outlined">
            Retry
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
          <Box sx={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            pr: 1,
            minWidth: 0,
            fontSize: '1.25rem',
            fontWeight: 500,
            lineHeight: 1.3,
            wordBreak: 'break-word'
          }}>
            {formData.metadata.name}
          </Box>
          <Box sx={{ display: 'flex', gap: 1, flexShrink: 0 }}>
            <IconButton
              onClick={(e) => setMenuAnchorEl(e.currentTarget)}
              title="Actions"
            >
              <MoreVert />
            </IconButton>
            <IconButton onClick={onClose} title="Close">
              <Close />
            </IconButton>
          </Box>
          <Menu
            anchorEl={menuAnchorEl}
            open={Boolean(menuAnchorEl)}
            onClose={() => setMenuAnchorEl(null)}
            transformOrigin={{ horizontal: 'right', vertical: 'top' }}
            anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
          >
            <MenuItem onClick={() => { onEdit(); setMenuAnchorEl(null); }}>
              <ListItemIcon>
                <Edit fontSize="small" />
              </ListItemIcon>
              <ListItemText>Edit</ListItemText>
            </MenuItem>
            {onShare && (
              <MenuItem onClick={() => { onShare(); setMenuAnchorEl(null); }}>
                <ListItemIcon>
                  <Share fontSize="small" />
                </ListItemIcon>
                <ListItemText>Share</ListItemText>
              </MenuItem>
            )}
            {onDownload && (
              <MenuItem onClick={() => { onDownload(); setMenuAnchorEl(null); }}>
                <ListItemIcon>
                  <Download fontSize="small" />
                </ListItemIcon>
                <ListItemText>Download</ListItemText>
              </MenuItem>
            )}
            <MenuItem onClick={() => { handlePrint(); setMenuAnchorEl(null); }}>
              <ListItemIcon>
                <Print fontSize="small" />
              </ListItemIcon>
              <ListItemText>Print</ListItemText>
            </MenuItem>
          </Menu>
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
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2, justifyContent: 'space-between', gap: 1 }}>
        <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap', alignItems: 'center' }}>
          <Box>
            <Typography variant="caption" color="text.secondary" display="block">
              Created
            </Typography>
            <Typography variant="body2">
              {new Date(formData.metadata.created).toLocaleDateString()}
            </Typography>
          </Box>
          
          <Box>
            <Typography variant="caption" color="text.secondary" display="block">
              Updated
            </Typography>
            <Typography variant="body2">
              {new Date(formData.metadata.modified).toLocaleDateString()}
            </Typography>
          </Box>
          
          <Box>
            <Typography variant="caption" color="text.secondary" display="block">
              Owner
            </Typography>
            <Typography variant="body2">
              {file.owner === userId ? 'You' : (ownerDisplayName || file.owner)}
            </Typography>
          </Box>
          
          {Array.isArray(file.sharedWith) && file.sharedWith.filter((id: string) => id !== userId).length > 0 && (
            <Box>
              <Typography variant="caption" color="text.secondary" display="block">
                Shared with
              </Typography>
              <Typography 
                variant="body2" 
                sx={{ 
                  cursor: onShare ? 'pointer' : 'default',
                  color: onShare ? 'primary.main' : 'text.primary',
                  textDecoration: onShare ? 'underline' : 'none',
                  '&:hover': onShare ? { textDecoration: 'underline' } : {}
                }}
                onClick={onShare}
              >
                {file.sharedWith.filter((id: string) => id !== userId).length} user{file.sharedWith.filter((id: string) => id !== userId).length !== 1 ? 's' : ''}
                {onShare && ' (click to manage)'}
              </Typography>
            </Box>
          )}
        </Box>

      </DialogActions>

      <PrintSecurityWarningDialog
        open={printWarningOpen}
        onClose={() => setPrintWarningOpen(false)}
        onConfirm={() => {
          setPrintWarningOpen(false);
          performPrint();
        }}
        onNeverShowAgain={() => {
          setPrintWarningOpen(false);
          handleNeverShowPrintWarning();
          performPrint();
        }}
        fileName={formData?.metadata.name || 'form'}
        isForm={true}
      />
    </Dialog>
  );
};

export default FormFileViewer;