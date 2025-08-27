import React, { useState, useMemo } from 'react';
import {
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import { 
  Folder, 
  InsertDriveFile, 
  MoreVert, 
  CreditCard, 
  Lock, 
  AccountBalance, 
  Person, 
  StickyNote2, 
  Wifi, 
  Extension,
  Assignment,
  ArrowUpward,
  ArrowDownward,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import type { FileData } from '../files';
import type { Folder as FolderData } from '../firestore';
import { isFormFile, getFormDisplayName } from '../utils/formFiles';

interface FileTableProps {
  folders: FolderData[];
  files: FileData[];
  onFolderClick: (folderId: string) => void;
  onFileClick?: (file: FileData) => void;
  onContextMenu?: (event: React.MouseEvent, item: FileData | FolderData, type: 'file' | 'folder') => void;
  onLongPressStart?: (item: FileData | FolderData, type: 'file' | 'folder') => void;
  onLongPressEnd?: () => void;
  onOpenMobileActionMenu?: (item: FileData | FolderData, type: 'file' | 'folder') => void;
}

type SortField = 'name' | 'type' | 'size';
type SortDirection = 'asc' | 'desc';

const FileTable: React.FC<FileTableProps> = ({
  folders,
  files,
  onFolderClick,
  onFileClick,
  onContextMenu,
  onLongPressStart,
  onLongPressEnd,
  onOpenMobileActionMenu,
}) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  // Function to detect form type from filename patterns
  const detectFormType = (fileName: string): string => {
    if (!isFormFile(fileName)) return t('common.file', 'file');
    
    // If filename is encrypted, we can't detect the type
    if (fileName === '[Encrypted]' || fileName.includes('[Encrypted]')) {
      return 'Form';
    }
    
    const formName = getFormDisplayName(fileName).toLowerCase();
    
    // Common form type patterns
    if (formName.includes('password') || formName.includes('login') || formName.includes('credential')) {
      return 'Password';
    }
    if (formName.includes('credit') || formName.includes('card') || formName.includes('visa') || formName.includes('mastercard')) {
      return 'Credit Card';
    }
    if (formName.includes('bank') || formName.includes('account') || formName.includes('checking') || formName.includes('saving')) {
      return 'Bank Account';
    }
    if (formName.includes('medical') || formName.includes('health') || formName.includes('doctor') || formName.includes('patient')) {
      return 'Medical Record';
    }
    if (formName.includes('identity') || formName.includes('passport') || formName.includes('license') || formName.includes('id')) {
      return 'Identity';
    }
    if (formName.includes('note') || formName.includes('memo') || formName.includes('text')) {
      return 'Secure Note';
    }
    if (formName.includes('wifi') || formName.includes('network') || formName.includes('router')) {
      return 'WiFi Network';
    }
    if (formName.includes('crypto') || formName.includes('wallet') || formName.includes('bitcoin') || formName.includes('ethereum')) {
      return 'Crypto Wallet';
    }
    if (formName.includes('insurance') || formName.includes('policy')) {
      return 'Insurance';
    }
    if (formName.includes('legal') || formName.includes('contract') || formName.includes('document')) {
      return 'Legal Document';
    }
    if (formName.includes('license') || formName.includes('software') || formName.includes('key')) {
      return 'Software License';
    }
    if (formName.includes('vehicle') || formName.includes('car') || formName.includes('auto')) {
      return 'Vehicle Info';
    }
    
    // Default to Form if no pattern matches
    return 'Form';
  };

  // Sorting state
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  // Format file size in human readable format
  const formatFileSize = (bytes: string | number): string => {
    const numBytes = typeof bytes === 'string' ? parseInt(bytes, 10) : bytes;
    
    if (isNaN(numBytes) || numBytes === 0) return '0 B';
    
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(numBytes) / Math.log(1024));
    const size = numBytes / Math.pow(1024, i);
    
    return `${size.toFixed(i === 0 ? 0 : 1)} ${sizes[i]}`;
  };

  // Sorting functions
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const sortItems = <T extends { name: string | { ciphertext: string; nonce: string }; size?: string | { ciphertext: string; nonce: string } }>(
    items: T[]
  ): T[] => {
    return [...items].sort((a, b) => {
      let aValue: string | number;
      let bValue: string | number;

      switch (sortField) {
        case 'name':
          aValue = typeof a.name === 'string' ? a.name.toLowerCase() : '[encrypted]';
          bValue = typeof b.name === 'string' ? b.name.toLowerCase() : '[encrypted]';
          break;
        case 'type':
          // Check if items are folders (don't have size property) or files
          const aIsFolder = !a.hasOwnProperty('size');
          const bIsFolder = !b.hasOwnProperty('size');
          
          if (aIsFolder && bIsFolder) {
            aValue = 'folder';
            bValue = 'folder';
          } else if (aIsFolder) {
            aValue = 'folder';
            bValue = 'file'; // This will sort folders before files
          } else if (bIsFolder) {
            aValue = 'file';
            bValue = 'folder'; // This will sort folders before files
          } else {
            // Both are files, determine type based on whether it's a form
            const aFileName = typeof a.name === 'string' ? a.name : '[encrypted]';
            const bFileName = typeof b.name === 'string' ? b.name : '[encrypted]';
            const aIsForm = isFormFile(aFileName);
            const bIsForm = isFormFile(bFileName);
            
            if (aIsForm && bIsForm) {
              // Both are forms, sort by form type first, then by name
              const aFormType = detectFormType(aFileName);
              const bFormType = detectFormType(bFileName);
              if (aFormType === bFormType) {
                aValue = aFileName;
                bValue = bFileName;
              } else {
                aValue = aFormType;
                bValue = bFormType;
              }
            } else {
              aValue = aIsForm ? detectFormType(aFileName) : 'file';
              bValue = bIsForm ? detectFormType(bFileName) : 'file';
            }
          }
          break;
        case 'size':
          // Folders don't have sizes, treat them as 0 for sorting purposes
          const aHasSize = a.hasOwnProperty('size') && a.size;
          const bHasSize = b.hasOwnProperty('size') && b.size;
          
          if (aHasSize && bHasSize) {
            aValue = typeof a.size === 'string' ? parseInt(a.size, 10) || 0 : 0;
            bValue = typeof b.size === 'string' ? parseInt(b.size, 10) || 0 : 0;
          } else {
            aValue = aHasSize ? (typeof a.size === 'string' ? parseInt(a.size, 10) || 0 : 0) : -1;
            bValue = bHasSize ? (typeof b.size === 'string' ? parseInt(b.size, 10) || 0 : 0) : -1;
          }
          break;
        default:
          aValue = '';
          bValue = '';
      }

      if (typeof aValue === 'string' && typeof bValue === 'string') {
        const comparison = aValue.localeCompare(bValue);
        return sortDirection === 'asc' ? comparison : -comparison;
      } else {
        const comparison = (aValue as number) - (bValue as number);
        return sortDirection === 'asc' ? comparison : -comparison;
      }
    });
  };

  // Memoized sorted items
  const sortedFolders = useMemo(() => sortItems(folders), [folders, sortField, sortDirection]);
  const sortedFiles = useMemo(() => sortItems(files), [files, sortField, sortDirection]);

  return (
    <TableContainer 
      component={Paper} 
      sx={{ 
        flexGrow: 1, 
        overflow: 'auto', 
        width: '100%',
        minHeight: 0,
      }}
    >
      <Table 
        stickyHeader 
        sx={{ 
          minWidth: isMobile ? 0 : 650, 
          width: '100%', 
          tableLayout: 'fixed'
        }}
      >
        <TableHead>
          <TableRow>
            <TableCell 
              sx={{ 
                width: isMobile ? '50%' : '60%', 
                cursor: 'pointer',
                '&:hover': { backgroundColor: 'rgba(0, 0, 0, 0.04)' }
              }}
              onClick={() => handleSort('name')}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                {t('common.name')}
                {sortField === 'name' && (
                  sortDirection === 'asc' ? <ArrowUpward fontSize="small" /> : <ArrowDownward fontSize="small" />
                )}
              </Box>
            </TableCell>
            <TableCell 
              sx={{ 
                width: '20%', 
                cursor: 'pointer',
                '&:hover': { backgroundColor: 'rgba(0, 0, 0, 0.04)' }
              }}
              onClick={() => handleSort('type')}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                {t('fileViewer.type')}
                {sortField === 'type' && (
                  sortDirection === 'asc' ? <ArrowUpward fontSize="small" /> : <ArrowDownward fontSize="small" />
                )}
              </Box>
            </TableCell>
            <TableCell 
              sx={{ 
                width: isMobile ? '30%' : '20%', 
                cursor: 'pointer',
                '&:hover': { backgroundColor: 'rgba(0, 0, 0, 0.04)' }
              }}
              onClick={() => handleSort('size')}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                {t('common.size')}
                {sortField === 'size' && (
                  sortDirection === 'asc' ? <ArrowUpward fontSize="small" /> : <ArrowDownward fontSize="small" />
                )}
              </Box>
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {sortedFolders.map((folder) => (
            <TableRow 
              key={folder.id} 
              hover 
              sx={{ cursor: 'pointer' }}
              onClick={() => onFolderClick(folder.id!)}
              onContextMenu={onContextMenu ? (e) => onContextMenu(e, folder, 'folder') : undefined}
              onTouchStart={onLongPressStart ? () => onLongPressStart(folder, 'folder') : undefined}
              onTouchEnd={onLongPressEnd}
              onTouchCancel={onLongPressEnd}
            >
              <TableCell>
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <Folder sx={{ mr: 1 }} />
                  <Typography variant="body1">
                    {typeof folder.name === 'string' ? folder.name : '[Encrypted]'}
                  </Typography>
                </Box>
              </TableCell>
              <TableCell>{t('common.folder', 'folder')}</TableCell>
              <TableCell>
                {onOpenMobileActionMenu && (
                  <IconButton
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenMobileActionMenu(folder, 'folder');
                    }}
                  >
                    <MoreVert />
                  </IconButton>
                )}
              </TableCell>
            </TableRow>
          ))}
          {sortedFiles.map((file) => {
            const fileName = typeof file.name === 'string' ? file.name : '[Encrypted]';
            const isForm = isFormFile(fileName);
            
            // Get form-specific display data if it's a form file
            let displayIcon = InsertDriveFile;
            let displayType = t('common.file', 'file');
            let displaySize = typeof file.size === 'string' ? formatFileSize(file.size) : '[Encrypted]';
            
            if (isForm) {
              // For the new form system, all forms use the same icon
              // Form type will be determined from the filename patterns
              displayIcon = Assignment;
              displayType = detectFormType(fileName);
              displaySize = typeof file.size === 'string' ? formatFileSize(file.size) : '[Encrypted]';
            }
            
            const Icon = displayIcon;
            
            return (
              <TableRow 
                key={file.id} 
                hover
                sx={{ cursor: 'pointer' }}
                onClick={onFileClick ? () => onFileClick(file) : undefined}
                onContextMenu={onContextMenu ? (e) => onContextMenu(e, file, 'file') : undefined}
                onTouchStart={onLongPressStart ? () => onLongPressStart(file, 'file') : undefined}
                onTouchEnd={onLongPressEnd}
                onTouchCancel={onLongPressEnd}
              >
                <TableCell>
                  <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    <Icon sx={{ mr: 1 }} />
                    <Typography variant="body1">
                      {isForm ? fileName.replace(/\.\w+\.form$/, '') : fileName}
                    </Typography>
                  </Box>
                </TableCell>
                <TableCell>{displayType}</TableCell>
                <TableCell>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="body2">
                      {displaySize}
                    </Typography>
                    {onOpenMobileActionMenu && (
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenMobileActionMenu(file, 'file');
                        }}
                      >
                        <MoreVert />
                      </IconButton>
                    )}
                  </Box>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
};

export default FileTable;