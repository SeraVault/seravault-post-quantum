import React, { useState } from 'react';
import {
  Box,
  Button,
  Typography,
  Alert,
  CircularProgress,
  Paper,
  List,
  ListItem,
  ListItemText,
} from '@mui/material';
import { Delete, Warning } from '@mui/icons-material';
import { useAuth } from '../auth/AuthContext';
import { cleanupInvalidFiles, getFilesWithInvalidMetadata, type FileToDelete } from '../utils/cleanupFiles';

const FileCleanup: React.FC = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [invalidFiles, setInvalidFiles] = useState<FileToDelete[]>([]);
  const [message, setMessage] = useState<string>('');
  const [error, setError] = useState<string>('');

  const scanForInvalidFiles = async () => {
    if (!user) return;
    
    setLoading(true);
    setError('');
    setMessage('');
    
    try {
      const files = await getFilesWithInvalidMetadata(user.uid);
      setInvalidFiles(files);
      
      if (files.length === 0) {
        setMessage('No files with invalid metadata found. All files are properly formatted!');
      } else {
        setMessage(`Found ${files.length} files with invalid metadata that need to be removed.`);
      }
    } catch (err) {
      setError(`Failed to scan files: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const cleanupFiles = async () => {
    if (!user) return;
    
    setLoading(true);
    setError('');
    setMessage('');
    
    try {
      await cleanupInvalidFiles(user.uid);
      setMessage(`Successfully removed ${invalidFiles.length} files with invalid metadata.`);
      setInvalidFiles([]);
    } catch (err) {
      setError(`Failed to cleanup files: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return (
      <Alert severity="warning">
        You must be logged in to use the file cleanup utility.
      </Alert>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <Paper elevation={2} sx={{ p: 3 }}>
        <Typography variant="h5" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Warning color="warning" />
          File Cleanup Utility
        </Typography>
        
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          This utility removes files that were uploaded with invalid metadata before the nonce fix.
          These files cannot be properly decrypted and cause errors in the application.
        </Typography>

        {message && (
          <Alert severity="info" sx={{ mb: 2 }}>
            {message}
          </Alert>
        )}

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
          <Button
            variant="outlined"
            onClick={scanForInvalidFiles}
            disabled={loading}
            startIcon={loading ? <CircularProgress size={16} /> : undefined}
          >
            {loading ? 'Scanning...' : 'Scan for Invalid Files'}
          </Button>

          {invalidFiles.length > 0 && (
            <Button
              variant="contained"
              color="error"
              onClick={cleanupFiles}
              disabled={loading}
              startIcon={<Delete />}
            >
              Remove Invalid Files ({invalidFiles.length})
            </Button>
          )}
        </Box>

        {invalidFiles.length > 0 && (
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              Files to be removed:
            </Typography>
            <List dense>
              {invalidFiles.map((file, index) => (
                <ListItem key={file.id}>
                  <ListItemText
                    primary={`File ${index + 1}`}
                    secondary={
                      <span>
                        ID: {file.id}<br />
                        Name type: {typeof file.name}{file.name && typeof file.name === 'object' ? ` (nonce: "${file.name.nonce || 'empty'}")` : ''}<br />
                        Size type: {typeof file.size}{file.size && typeof file.size === 'object' ? ` (nonce: "${file.size.nonce || 'empty'}")` : ''}
                      </span>
                    }
                  />
                </ListItem>
              ))}
            </List>
          </Paper>
        )}
      </Paper>
    </Box>
  );
};

export default FileCleanup;