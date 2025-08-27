import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
} from '@mui/material';

interface RenameDialogProps {
  open: boolean;
  onClose: () => void;
  onRename: (newName: string) => void;
  currentName: string;
  itemType: 'file' | 'folder';
}

const RenameDialog: React.FC<RenameDialogProps> = ({
  open,
  onClose,
  onRename,
  currentName,
  itemType,
}) => {
  const [newName, setNewName] = useState(currentName);

  useEffect(() => {
    setNewName(currentName);
  }, [currentName, open]);

  const handleSubmit = () => {
    if (newName.trim() && newName !== currentName) {
      onRename(newName.trim());
    }
    onClose();
  };

  const handleKeyPress = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter') {
      handleSubmit();
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Rename {itemType}</DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          margin="dense"
          label={`${itemType} name`}
          fullWidth
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyPress={handleKeyPress}
          variant="outlined"
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button 
          onClick={handleSubmit} 
          variant="contained"
          disabled={!newName.trim() || newName === currentName}
        >
          Rename
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default RenameDialog;