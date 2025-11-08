import React from 'react';
import {
  Drawer,
  List,
  ListItemIcon,
  ListItemText,
  ListItemButton,
  Typography,
  Divider,
  Box,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import {
  Edit,
  ContentCut,
  ContentCopy,
  Delete,
  Share,
  Folder,
  InsertDriveFile,
  Visibility,
  Download,
} from '@mui/icons-material';

interface MobileActionMenuProps {
  open: boolean;
  onClose: () => void;
  itemName: string;
  itemType: 'file' | 'folder';
  hideCopy?: boolean; // Hide copy option (e.g., for chat files)
  onOpen?: () => void;
  onDownload?: () => void;
  onRename: () => void;
  onCut: () => void;
  onCopy: () => void;
  onShare?: () => void;
  onDelete: () => void;
}

const MobileActionMenu: React.FC<MobileActionMenuProps> = ({
  open,
  onClose,
  itemName,
  itemType,
  hideCopy = false,
  onOpen,
  onDownload,
  onRename,
  onCut,
  onCopy,
  onShare,
  onDelete,
}) => {
  const { t } = useTranslation();
  return (
    <Drawer
      anchor="bottom"
      open={open}
      onClose={onClose}
      PaperProps={{
        sx: {
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
          maxHeight: '60vh',
        },
      }}
    >
      <Box sx={{ p: 2, pb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          {itemType === 'folder' ? (
            <Folder sx={{ mr: 1, color: 'text.secondary' }} />
          ) : (
            <InsertDriveFile sx={{ mr: 1, color: 'text.secondary' }} />
          )}
          <Typography variant="subtitle1" noWrap>
            {itemName}
          </Typography>
        </Box>
        <List disablePadding>
          {itemType === 'file' && onOpen && (
            <ListItemButton onClick={onOpen} sx={{ borderRadius: 1, mb: 1 }}>
              <ListItemIcon>
                <Visibility />
              </ListItemIcon>
              <ListItemText primary={t('contextMenu.open')} />
            </ListItemButton>
          )}
          
          {itemType === 'file' && onDownload && (
            <ListItemButton onClick={onDownload} sx={{ borderRadius: 1, mb: 1 }}>
              <ListItemIcon>
                <Download />
              </ListItemIcon>
              <ListItemText primary={t('contextMenu.download')} />
            </ListItemButton>
          )}
          
          {(onOpen || onDownload) && <Divider sx={{ my: 1 }} />}
          
          <ListItemButton onClick={onRename} sx={{ borderRadius: 1, mb: 1 }}>
            <ListItemIcon>
              <Edit />
            </ListItemIcon>
            <ListItemText primary={t('contextMenu.rename')} />
          </ListItemButton>

          <Divider sx={{ my: 1 }} />
          
          <ListItemButton onClick={onCut} sx={{ borderRadius: 1, mb: 1 }}>
            <ListItemIcon>
              <ContentCut />
            </ListItemIcon>
            <ListItemText primary={t('contextMenu.cut')} />
          </ListItemButton>
          
          {!hideCopy && (
            <ListItemButton onClick={onCopy} sx={{ borderRadius: 1, mb: 1 }}>
              <ListItemIcon>
                <ContentCopy />
              </ListItemIcon>
              <ListItemText primary={t('contextMenu.copy')} />
            </ListItemButton>
          )}
          
          {onShare && itemType === 'file' && (
            <ListItemButton onClick={onShare} sx={{ borderRadius: 1, mb: 1 }}>
              <ListItemIcon>
                <Share />
              </ListItemIcon>
              <ListItemText primary={t('contextMenu.share')} />
            </ListItemButton>
          )}
          
          <Divider sx={{ my: 1 }} />
          
          <ListItemButton 
            onClick={onDelete} 
            sx={{ borderRadius: 1, mb: 1, color: 'error.main' }}
          >
            <ListItemIcon>
              <Delete sx={{ color: 'error.main' }} />
            </ListItemIcon>
            <ListItemText primary={t('contextMenu.delete')} />
          </ListItemButton>
        </List>
      </Box>
    </Drawer>
  );
};

export default MobileActionMenu;