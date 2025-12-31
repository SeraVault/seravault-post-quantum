import React, { useState, useEffect, lazy, Suspense } from 'react';
import {
  Box,
  Typography,
  TextField,
  IconButton,
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
  useMediaQuery,
  useTheme,
} from '@mui/material';
import {
  Edit,
  Visibility as VisibilityIcon,
  VisibilityOff,
  ContentCopy,
  Close,
  Download,
  Extension,
  Share,
  MoreVert,
  Print,
} from '@mui/icons-material';

// Lazy load markdown preview component to reduce initial bundle
const MarkdownPreview = lazy(() =>
  import('@uiw/react-md-editor').then(mod => ({
    default: mod.default.Markdown
  }))
);
import type { SecureFormData } from '../utils/formFiles';
import type { FileData } from '../files';
import { getFile } from '../storage';
import { getFieldAttachments } from '../utils/formFiles';
import { getUserProfile, updateUserProfile, type UserProfile } from '../firestore';
import PrintSecurityWarningDialog from './PrintSecurityWarningDialog';
import { useImageAttachments } from '../hooks/useImageAttachments';
import FileViewer from './FileViewer';
import { backendService } from '../backend/BackendService';

// Component to process and display HTML with decrypted images
const ProcessedHtmlContent: React.FC<{
  html: string;
  processHtmlContent: (html: string, attachments: any[]) => Promise<string>;
  formData: SecureFormData | null;
}> = ({ html, processHtmlContent, formData }) => {
  const [processedHtml, setProcessedHtml] = useState<string>(html);
  const [processing, setProcessing] = useState(true);

  useEffect(() => {
    const processImages = async () => {
      if (!formData) {
        setProcessedHtml(html);
        setProcessing(false);
        return;
      }

      try {
        // Get image attachments from form data
        const imageAttachments = formData.imageAttachments || [];
        
        console.log('🔍 Processing HTML content, found', imageAttachments.length, 'image attachments:', imageAttachments);
        
        if (imageAttachments.length > 0) {
          console.log('🔐 Decrypting images...');
          const processed = await processHtmlContent(html, imageAttachments);
          console.log('✅ Images decrypted successfully');
          setProcessedHtml(processed);
        } else {
          console.log('ℹ️ No image attachments to decrypt');
          setProcessedHtml(html);
        }
      } catch (error) {
        console.error('Failed to process images:', error);
        setProcessedHtml(html);
      } finally {
        setProcessing(false);
      }
    };

    processImages();
  }, [html, formData, processHtmlContent]);

  if (processing) {
    return <CircularProgress size={20} />;
  }

  return <div dangerouslySetInnerHTML={{ __html: processedHtml }} />;
};

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
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
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
  const [processedHtmlCache, setProcessedHtmlCache] = useState<Map<string, string>>(new Map());

  // File preview state
  const [filePreviewOpen, setFilePreviewOpen] = useState(false);
  const [previewFile, setPreviewFile] = useState<FileData | null>(null);
  const [previewFileContent, setPreviewFileContent] = useState<ArrayBuffer | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Image decryption hook
  const { processHtmlContent } = useImageAttachments({
    userId,
    privateKey,
  });

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
        
        // CRITICAL: Fetch fresh file data from backend to get the latest storagePath
        // This ensures we load the most recent version, not stale props
        console.log('🔄 Fetching fresh file data for viewing:', file.id);
        const freshFileData = await backendService.files.get(file.id);
        
        if (!freshFileData) {
          throw new Error('File not found');
        }
        
        console.log('✅ Fresh file data loaded, storagePath:', freshFileData.storagePath);
        
        // Clear any cached content for this file to ensure we get the latest version
        // This is important after form updates
        try {
          const { offlineFileCache } = await import('../services/offlineFileCache');
          await offlineFileCache.removeCachedFile(file.id);
          console.log('🗑️ Cleared offline cache for', file.id);
        } catch (cacheError) {
          console.warn('Could not clear offline cache:', cacheError);
        }
        
        // Download and decrypt the file content using centralized service with fresh data
        const encryptedContent = await getFile(freshFileData.storagePath);
        
        // Get the user's encrypted key for this file (from fresh data)
        const userEncryptedKey = freshFileData.encryptedKeys[userId];
        
        if (!userEncryptedKey) {
          throw new Error('No access key found for this file');
        }
        
        // Use centralized decryption service for security and consistency
        const { FileEncryptionService } = await import('../services/fileEncryption');
        const decryptedContentBuffer = await FileEncryptionService.decryptFile(
          new Uint8Array(encryptedContent),
          userEncryptedKey,
          privateKey
        );
        
        const decryptedContent = new TextDecoder().decode(decryptedContentBuffer);
        console.log('Decryption successful, content length:', decryptedContent.length);
        
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
  }, [file, privateKey, file.lastModified]);

  const handleManualRetry = () => {
    setError(null);
    setLoadAttempts(0);
    
    const loadFormData = async () => {
      try {
        setLoading(true);
        
        // Download and decrypt the file content using centralized service
        const encryptedContent = await getFile(file.storagePath);
        
        // Get the user's encrypted key for this file
        const userEncryptedKey = file.encryptedKeys[userId];
        
        if (!userEncryptedKey) {
          throw new Error('No access key found for this file');
        }
        
        // Use centralized decryption service for security and consistency
        const { FileEncryptionService } = await import('../services/fileEncryption');
        const decryptedContentBuffer = await FileEncryptionService.decryptFile(
          new Uint8Array(encryptedContent),
          userEncryptedKey,
          privateKey
        );
        
        const decryptedContent = new TextDecoder().decode(decryptedContentBuffer);
        console.log('Decryption successful, content length:', decryptedContent.length);
        
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

  const handlePreviewFile = async (fileId: string) => {
    try {
      setPreviewLoading(true);

      // Get file metadata from backend
      const fileData = await backendService.files.get(fileId);

      if (!fileData) {
        console.error('File not found:', fileId);
        return;
      }

      setPreviewFile(fileData);

      // Download and decrypt file content
      const encryptedContent = await getFile(fileData.storagePath);
      const userEncryptedKey = fileData.encryptedKeys[userId];

      if (!userEncryptedKey) {
        throw new Error('No access key found for this file');
      }

      const { FileEncryptionService } = await import('../services/fileEncryption');
      const decryptedContentBuffer = await FileEncryptionService.decryptFile(
        new Uint8Array(encryptedContent),
        userEncryptedKey,
        privateKey
      );

      setPreviewFileContent(decryptedContentBuffer.buffer);
      setFilePreviewOpen(true);
    } catch (error) {
      console.error('Error loading file preview:', error);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleDownloadAttachment = async (fileId: string, originalName: string) => {
    try {
      // Get file metadata
      const fileData = await backendService.files.get(fileId);

      if (!fileData) {
        console.error('File not found:', fileId);
        return;
      }

      // Download and decrypt file content
      const encryptedContent = await getFile(fileData.storagePath);
      const userEncryptedKey = fileData.encryptedKeys[userId];

      if (!userEncryptedKey) {
        throw new Error('No access key found for this file');
      }

      const { FileEncryptionService } = await import('../services/fileEncryption');
      const decryptedContentBuffer = await FileEncryptionService.decryptFile(
        new Uint8Array(encryptedContent),
        userEncryptedKey,
        privateKey
      );

      // Create download link
      const blob = new Blob([decryptedContentBuffer]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = originalName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading file:', error);
    }
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
            p: 2,
            backgroundColor: 'background.paper',
            minHeight: '60px',
            overflow: 'auto',
            '& p': {
              color: 'text.primary',
              margin: '0 0 1em 0',
            },
            '& h1, & h2, & h3, & h4, & h5, & h6': {
              color: 'text.primary',
              margin: '0.5em 0',
            },
            '& strong': {
              fontWeight: 600,
            },
            '& a': {
              color: 'primary.main',
              textDecoration: 'underline',
            },
            '& img': {
              maxWidth: '100%',
              height: 'auto',
              borderRadius: 1,
              boxShadow: 1,
            },
            '& ul, & ol': {
              paddingLeft: 3,
            },
            // Also support markdown rendering for legacy content
            '& .w-md-editor-preview': {
              backgroundColor: 'transparent',
              padding: '8px',
            },
            '& .w-md-editor': {
              backgroundColor: 'transparent',
            },
          }}>
            {fieldValue && (
              // Check if content looks like HTML (contains tags) or markdown
              fieldValue.includes('<') && fieldValue.includes('>') ? (
                <ProcessedHtmlContent 
                  html={Array.isArray(fieldValue) ? fieldValue.join(', ') : fieldValue}
                  processHtmlContent={processHtmlContent}
                  formData={formData}
                />
              ) : (
                <Suspense fallback={<CircularProgress size={24} />}>
                  <MarkdownPreview source={Array.isArray(fieldValue) ? fieldValue.join(', ') : fieldValue} />
                </Suspense>
              )
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
                        {isVisible ? <VisibilityOff fontSize="small" /> : <VisibilityIcon fontSize="small" />}
                      </IconButton>
                    </Tooltip>
                  )}
                  <Tooltip title={copiedField === field.id ? 'Copied!' : 'Copy'}>
                    <IconButton
                      size="small"
                      onClick={() => copyToClipboard(Array.isArray(fieldValue) ? fieldValue.join(', ') : fieldValue, field.id)}
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

                  <Box sx={{ display: 'flex', gap: 0.5 }}>
                    <Tooltip title="Preview file">
                      <IconButton
                        size="small"
                        onClick={() => handlePreviewFile(attachment.id)}
                        color="primary"
                        disabled={previewLoading}
                      >
                        {previewLoading ? <CircularProgress size={16} /> : <VisibilityIcon fontSize="small" />}
                      </IconButton>
                    </Tooltip>

                    <Tooltip title="Download file">
                      <IconButton
                        size="small"
                        onClick={() => handleDownloadAttachment(attachment.id, attachment.originalName)}
                        color="primary"
                      >
                        <Download fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Box>
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
                      {isVisible ? <VisibilityOff fontSize="small" /> : <VisibilityIcon fontSize="small" />}
                    </IconButton>
                  </Tooltip>
                )}
                <Tooltip title={copiedField === field.id ? 'Copied!' : 'Copy'}>
                  <IconButton
                    size="small"
                    onClick={() => copyToClipboard(Array.isArray(fieldValue) ? fieldValue.join(', ') : fieldValue, field.id)}
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
      <Dialog open onClose={onClose} maxWidth="md" fullWidth fullScreen={isMobile}>
        <DialogContent sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 200 }}>
          <CircularProgress />
        </DialogContent>
      </Dialog>
    );
  }

  if (error || !formData) {
    return (
      <Dialog open onClose={onClose} maxWidth="md" fullWidth fullScreen={isMobile}>
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
    <Dialog open onClose={onClose} maxWidth="md" fullWidth fullScreen={isMobile}>
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

      {/* File Preview Dialog */}
      {previewFile && (
        <FileViewer
          open={filePreviewOpen}
          file={previewFile}
          fileContent={previewFileContent}
          loading={previewLoading}
          onClose={() => {
            setFilePreviewOpen(false);
            setPreviewFile(null);
            setPreviewFileContent(null);
          }}
          onDownload={() => {
            if (previewFile && previewFile.name) {
              const fileName = typeof previewFile.name === 'string' ? previewFile.name : 'download';
              handleDownloadAttachment(previewFile.id, fileName);
            }
          }}
          userId={userId}
          onShare={onShare}
        />
      )}
    </Dialog>
  );
};

export default FormFileViewer;