import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  CircularProgress,
} from '@mui/material';
import { LocalOffer, Close } from '@mui/icons-material';
import TagInput from './TagInput';
import { getUserTags } from '../services/userTagsManagement';
import { type FileData } from '../files';

interface TagManagementDialogProps {
  open: boolean;
  onClose: () => void;
  file: FileData | null;
  userId: string;
  userPrivateKey: string;
  allFiles?: FileData[];
}

const TagManagementDialog: React.FC<TagManagementDialogProps> = ({
  open,
  onClose,
  file,
  userId,
  userPrivateKey,
  allFiles = []
}) => {
  const [loading, setLoading] = useState(false);
  const [currentTags, setCurrentTags] = useState<string[]>([]);

  // Load current tags when dialog opens
  useEffect(() => {
    const loadTags = async () => {
      if (!file || !userId || !userPrivateKey) return;
      
      try {
        setLoading(true);
        const tags = await getUserTags(file, userId, userPrivateKey);
        setCurrentTags(tags);
      } catch (error) {
        console.error('Error loading tags:', error);
      } finally {
        setLoading(false);
      }
    };

    if (open) {
      loadTags();
    }
  }, [open, file, userId, userPrivateKey]);

  const handleTagsChange = (newTags: string[]) => {
    setCurrentTags(newTags);
  };

  const handleClose = () => {
    onClose();
    // Reset state when closing
    setTimeout(() => {
      setCurrentTags([]);
      setLoading(false);
    }, 300);
  };

  if (!file) return null;

  const fileName = typeof file.name === 'string' ? file.name : '[Encrypted File]';

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: { borderRadius: 2 }
      }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <LocalOffer color="primary" />
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="h6">Manage Tags</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {fileName}
          </Typography>
        </Box>
      </DialogTitle>

      <DialogContent>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        ) : (
          <Box sx={{ py: 2 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Add or remove tags to organize your files. Tags are private and encrypted.
            </Typography>
            
            <TagInput
              file={file}
              userId={userId}
              userPrivateKey={userPrivateKey}
              onTagsChange={handleTagsChange}
              allFiles={allFiles}
              size="medium"
            />
            
            {currentTags.length > 0 && (
              <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: 'block' }}>
                Current tags: {currentTags.join(', ')}
              </Typography>
            )}
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ p: 3, pt: 1 }}>
        <Button
          onClick={handleClose}
          variant="contained"
          color="primary"
          startIcon={<Close />}
        >
          Done
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default TagManagementDialog;