import React from 'react';
import { Menu, MenuItem, Divider } from '@mui/material';
import { Edit, ContentCut, ContentCopy, Delete, Share, LocalOffer } from '@mui/icons-material';

export interface ContextMenuProps {
  open: boolean;
  mouseX: number;
  mouseY: number;
  onClose: () => void;
  onRename: () => void;
  onCut: () => void;
  onCopy: () => void;
  onShare?: () => void;
  onManageTags?: () => void;
  onDelete: () => void;
  itemType: 'file' | 'folder';
  hideCopy?: boolean; // Hide copy option (e.g., for chat files)
}

const ContextMenu: React.FC<ContextMenuProps> = ({
  open,
  mouseX,
  mouseY,
  onClose,
  onRename,
  onCut,
  onCopy,
  onShare,
  onManageTags,
  onDelete,
  itemType,
  hideCopy = false,
}) => {
  return (
    <Menu
      open={open}
      onClose={onClose}
      anchorReference="anchorPosition"
      anchorPosition={open ? { top: mouseY, left: mouseX } : undefined}
    >
      <MenuItem onClick={onRename}>
        <Edit sx={{ mr: 1 }} />
        Rename
      </MenuItem>
      <Divider />
      <MenuItem onClick={onCut}>
        <ContentCut sx={{ mr: 1 }} />
        Cut
      </MenuItem>
      {!hideCopy && (
        <MenuItem onClick={onCopy}>
          <ContentCopy sx={{ mr: 1 }} />
          Copy
        </MenuItem>
      )}
      
      {onShare && itemType === 'file' && <Divider />}
      {onShare && itemType === 'file' && (
        <MenuItem onClick={onShare}>
          <Share sx={{ mr: 1 }} />
          Share
        </MenuItem>
      )}
      
      {onManageTags && itemType === 'file' && (
        <MenuItem onClick={onManageTags}>
          <LocalOffer sx={{ mr: 1 }} />
          Manage Tags
        </MenuItem>
      )}
      
      <Divider />
      <MenuItem onClick={onDelete} sx={{ color: 'error.main' }}>
        <Delete sx={{ mr: 1 }} />
        Delete
      </MenuItem>
    </Menu>
  );
};

export default ContextMenu;