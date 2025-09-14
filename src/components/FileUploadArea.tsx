import React, { useState, useRef } from 'react';
import { Box, Typography, LinearProgress, Fade, useTheme, Card, CardContent } from '@mui/material';
import { useAuth } from '../auth/AuthContext';
import { FileEncryptionService } from '../services/fileEncryption';
import { uploadFileData } from '../storage';
import { createFileWithSharing } from '../files';

interface FileUploadAreaProps {
  currentFolder: string | null;
  privateKey: string;
  onUploadComplete?: () => void;
  children: React.ReactNode;
}

const FileUploadArea: React.FC<FileUploadAreaProps> = ({
  currentFolder,
  privateKey,
  onUploadComplete,
  children,
}) => {
  const { user } = useAuth();
  const theme = useTheme();
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [currentFileName, setCurrentFileName] = useState('');
  const [currentFileSize, setCurrentFileSize] = useState('');
  const [uploadStage, setUploadStage] = useState('');
  const [uploadStats, setUploadStats] = useState({ current: 0, total: 0, successCount: 0, failCount: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const hexToBytes = (hex: string) => {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
      bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
    }
    return bytes;
  };


  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    const size = bytes / Math.pow(1024, i);
    return `${size.toFixed(i === 0 ? 0 : 1)} ${sizes[i]}`;
  };

  const handleFileUpload = async (file: File) => {
    if (!user || !privateKey) return;

    try {
      setUploadStage('Preparing encryption...');
      const fileBuffer = await file.arrayBuffer();
      const fileData = new Uint8Array(fileBuffer);
      
      setUploadStage('Encrypting file and metadata...');
      // Use the centralized encryption service
      const encryptionResult = await FileEncryptionService.encryptFileForUsers(
        fileData,
        file.name,
        file.size,
        [user.uid], // Only current user initially
        user.uid,
        currentFolder
      );

      setUploadStage('Uploading to secure storage...');
      await uploadFileData(encryptionResult.storagePath, encryptionResult.encryptedContent);

      setUploadStage('Creating file record...');
      const fileRecord = await FileEncryptionService.createFileRecord(
        user.uid,
        encryptionResult.encryptedMetadata,
        encryptionResult.storagePath,
        encryptionResult.encryptedKeys,
        [user.uid], // Only current user initially
        currentFolder
      );

      await createFileWithSharing(fileRecord);

      setUploadStage('Upload complete!');
    } catch (error) {
      setUploadStage('Upload failed');
      console.error('File upload failed:', error);
      throw error; // Re-throw to be handled by the multiple upload handler
    }
  };

  const handleMultipleFileUploads = async (files: File[]) => {
    if (files.length === 0) return;
    
    const totalFiles = files.length;
    let successCount = 0;
    let failCount = 0;
    
    setUploading(true);
    setUploadStats({ current: 0, total: totalFiles, successCount: 0, failCount: 0 });
    setUploadProgress(0);
    setUploadStage('Preparing files for upload...');
    
    console.log(`Starting upload of ${totalFiles} files...`);
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      
      // Update UI state for current file
      setCurrentFileName(file.name);
      setCurrentFileSize(formatFileSize(file.size));
      setUploadStats({ current: i + 1, total: totalFiles, successCount, failCount });
      setUploadStage('Starting upload...');
      
      console.log(`Uploading file ${i + 1}/${totalFiles}: ${file.name}`);
      
      try {
        await handleFileUpload(file);
        successCount++;
        console.log(`✓ Upload ${i + 1}/${totalFiles} completed: ${file.name}`);
      } catch (error) {
        failCount++;
        console.error(`✗ Upload ${i + 1}/${totalFiles} failed: ${file.name}`, error);
      }
      
      // Update progress and stats
      const progress = ((i + 1) / totalFiles) * 100;
      setUploadProgress(progress);
      setUploadStats({ current: i + 1, total: totalFiles, successCount, failCount });
    }
    
    // Show final status
    if (failCount === 0) {
      setUploadStage(`Successfully uploaded ${successCount} file${successCount === 1 ? '' : 's'}!`);
    } else {
      setUploadStage(`Upload completed with ${failCount} error${failCount === 1 ? '' : 's'}`);
    }
    
    // Short delay to show completion status
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // Reset upload state
    setUploading(false);
    setUploadProgress(0);
    setCurrentFileName('');
    setCurrentFileSize('');
    setUploadStage('');
    setUploadStats({ current: 0, total: 0, successCount: 0, failCount: 0 });
    
    // Show summary only if there were failures
    if (failCount > 0) {
      alert(`Upload completed: ${successCount} successful, ${failCount} failed. Check console for details.`);
    }
    
    // Notify parent of upload completion
    if (onUploadComplete) {
      onUploadComplete();
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      handleMultipleFileUploads(Array.from(files));
    }
    // Reset the input value to allow uploading the same file again
    event.target.value = '';
  };

  // Drag and drop handlers
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setDragActive(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files);
      handleMultipleFileUploads(files);
    }
  };

  return (
    <Box
      sx={{ 
        position: 'relative',
        height: '100%',
        width: '100%',
        backgroundColor: dragActive ? 'rgba(25, 118, 210, 0.08)' : 'transparent',
        border: dragActive ? '2px dashed #1976d2' : 'none',
        transition: 'all 0.2s ease-in-out',
      }}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <input 
        type="file" 
        ref={fileInputRef} 
        style={{ display: 'none' }} 
        onChange={handleFileChange} 
        multiple 
      />
      
      {/* Drag and Drop Overlay */}
      {dragActive && (
        <Box
          sx={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(25, 118, 210, 0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            pointerEvents: 'none',
          }}
        >
          <Box
            sx={{
              backgroundColor: 'white',
              padding: 4,
              borderRadius: 2,
              boxShadow: 3,
              textAlign: 'center',
              border: '3px dashed #1976d2',
            }}
          >
            <Typography variant="h5" color="primary" gutterBottom>
              Drop files here to upload
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Multiple files supported
            </Typography>
          </Box>
        </Box>
      )}
      
      {/* Upload Progress Indicator */}
      <Fade in={uploading}>
        <Box
          sx={{
            position: 'fixed',
            top: 20,
            right: 20,
            zIndex: 2000,
            minWidth: 300,
          }}
        >
          <Card
            elevation={8}
            sx={{
              minWidth: 380,
              maxWidth: 480,
              backgroundColor: theme.palette.background.paper,
            }}
          >
            <CardContent sx={{ pb: 2 }}>
              <Typography 
                variant="h6" 
                component="h2"
                gutterBottom 
                sx={{ 
                  display: 'flex', 
                  justifyContent: 'space-between',
                  color: theme.palette.text.primary,
                  fontWeight: theme.typography.fontWeightMedium
                }}
              >
                <span>Uploading Files</span>
                <span>({uploadStats.current} of {uploadStats.total})</span>
              </Typography>
              
              {/* Current File Section */}
              <Card 
                variant="outlined" 
                sx={{ 
                  mb: 3, 
                  backgroundColor: theme.palette.action.hover,
                  borderColor: theme.palette.divider
                }}
              >
                <CardContent sx={{ py: 2, px: 2, '&:last-child': { pb: 2 } }}>
                  <Typography 
                    variant="overline" 
                    sx={{ 
                      display: 'block', 
                      mb: 1,
                      color: theme.palette.text.secondary,
                      fontWeight: theme.typography.fontWeightMedium
                    }}
                  >
                    Currently Processing:
                  </Typography>
                  
                  <Typography 
                    variant="body1" 
                    sx={{ 
                      fontWeight: theme.typography.fontWeightBold,
                      color: theme.palette.text.primary,
                      mb: 0.5,
                      wordBreak: 'break-all'
                    }}
                    title={currentFileName}
                  >
                    {currentFileName || 'Initializing upload...'}
                  </Typography>
                  
                  <Typography 
                    variant="body2" 
                    sx={{ color: theme.palette.text.secondary }}
                  >
                    {currentFileSize && `${currentFileSize} • `}{uploadStage}
                  </Typography>
                </CardContent>
              </Card>
              
              {/* Progress Bar */}
              <LinearProgress
                variant="determinate"
                value={uploadProgress}
                sx={{
                  height: 10,
                  borderRadius: 5,
                  mb: 2,
                  backgroundColor: theme.palette.action.disabled,
                  '& .MuiLinearProgress-bar': {
                    borderRadius: 5,
                    backgroundColor: theme.palette.primary.main,
                  }
                }}
              />
              
              {/* Status Row */}
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography 
                  variant="body2" 
                  sx={{ color: theme.palette.text.secondary, fontWeight: theme.typography.fontWeightMedium }}
                >
                  {Math.round(uploadProgress)}% Complete
                </Typography>
                
                {(uploadStats.successCount > 0 || uploadStats.failCount > 0) && (
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    {uploadStats.successCount > 0 && (
                      <Typography 
                        variant="caption" 
                        sx={{ color: theme.palette.success.main, fontWeight: theme.typography.fontWeightMedium }}
                      >
                        ✓ {uploadStats.successCount}
                      </Typography>
                    )}
                    {uploadStats.failCount > 0 && (
                      <Typography 
                        variant="caption" 
                        sx={{ color: theme.palette.error.main, fontWeight: theme.typography.fontWeightMedium }}
                      >
                        ✗ {uploadStats.failCount}
                      </Typography>
                    )}
                  </Box>
                )}
              </Box>
            </CardContent>
          </Card>
        </Box>
      </Fade>

      {/* Render children normally */}
      {children}
    </Box>
  );
};

export default FileUploadArea;