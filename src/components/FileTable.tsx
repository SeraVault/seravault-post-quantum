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
  Checkbox,
} from '@mui/material';
import { 
  Folder, 
  InsertDriveFile, 
  MoreVert, 
  Assignment,
  ArrowUpward,
  ArrowDownward,
  Star,
  StarBorder,
  Share,
  People,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import type { FileData } from '../files';
import type { Folder as FolderData, UserProfile } from '../firestore';
import { isFormFile, getFormDisplayName } from '../utils/formFiles';
import { getUserFavoriteStatus } from '../services/userFavoritesManagement';
import { getUserProfile, updateUserColumnVisibility } from '../firestore';
import { ColumnSelector, type ColumnVisibility } from './ColumnSelector';

interface FileTableProps {
  folders: FolderData[];
  files: FileData[];
  onFolderClick?: (folderId: string) => void;
  onFileClick?: (file: FileData) => void;
  onContextMenu?: (event: React.MouseEvent, item: FileData | FolderData, type: 'file' | 'folder') => void;
  onLongPressStart?: (item: FileData | FolderData, type: 'file' | 'folder') => void;
  onLongPressEnd?: () => void;
  onOpenMobileActionMenu?: (item: FileData | FolderData, type: 'file' | 'folder') => void;
  showGoToFolder?: boolean; // Show "go to folder" button for files
  onGoToFolder?: (folderId: string | null) => void; // Navigate to file's parent folder
  loading?: boolean; // Show loading state
  onToggleFavorite?: (fileId: string) => void; // Toggle favorite status for files
  userId?: string; // Current user ID for per-user favorites
  
  // Bulk selection props
  selectedFolders?: Set<string>;
  selectedFiles?: Set<string>;
  onToggleFolderSelection?: (folderId: string) => void;
  onToggleFileSelection?: (fileId: string) => void;
  
  // Clipboard visual feedback
  clipboardItem?: { type: 'file' | 'folder'; item: FileData | FolderData; operation: 'cut' | 'copy' } | null;
  
  // Drag and drop
  onMoveItem?: (itemId: string, itemType: 'file' | 'folder', targetFolderId: string | null) => void;
  
  // Column visibility
  currentUserId?: string; // Current user ID for profile updates
}

type SortField = 'name' | 'type' | 'size' | 'shared' | 'created' | 'modified' | 'owner';
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
  // showGoToFolder = false,
  // onGoToFolder,
  // loading = false,
  onToggleFavorite,
  userId,
  selectedFolders = new Set(),
  selectedFiles = new Set(),
  onToggleFolderSelection,
  onToggleFileSelection,
  clipboardItem,
  // onMoveItem,
  currentUserId,
}) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [userProfiles, setUserProfiles] = React.useState<{ [userId: string]: UserProfile }>({});
  const [currentUserProfile, setCurrentUserProfile] = React.useState<UserProfile | null>(null);
  
  // Default column visibility (all visible by default)
  const defaultColumnVisibility: ColumnVisibility = {
    type: true,
    size: true,
    shared: true,
    created: true,
    modified: true,
    owner: true,
  };
  
  const [columnVisibility, setColumnVisibility] = React.useState<ColumnVisibility>(defaultColumnVisibility);

  // Load current user's profile for column preferences
  React.useEffect(() => {
    const loadCurrentUserProfile = async () => {
      if (currentUserId) {
        try {
          const profile = await getUserProfile(currentUserId);
          setCurrentUserProfile(profile);
          if (profile?.columnVisibility) {
            setColumnVisibility(profile.columnVisibility);
          }
        } catch (error) {
          console.warn('Failed to load current user profile:', error);
        }
      }
    };
    
    loadCurrentUserProfile();
  }, [currentUserId]);

  // Handle column visibility changes
  const handleColumnVisibilityChange = async (newVisibility: ColumnVisibility) => {
    setColumnVisibility(newVisibility);
    
    // Save to user profile
    if (currentUserId) {
      try {
        await updateUserColumnVisibility(currentUserId, newVisibility);
      } catch (error) {
        console.warn('Failed to save column visibility preferences:', error);
      }
    }
  };

  // Load user profiles for owners
  React.useEffect(() => {
    const loadUserProfiles = async () => {
      const uniqueOwners = new Set<string>();
      
      // Collect all unique owner IDs
      folders.forEach(folder => {
        if (folder.owner) uniqueOwners.add(folder.owner);
      });
      files.forEach(file => {
        if (file.owner) uniqueOwners.add(file.owner);
      });
      
      // Load profiles for owners we don't have yet
      const ownersToLoad = Array.from(uniqueOwners).filter(ownerId => !userProfiles[ownerId]);
      
      if (ownersToLoad.length > 0) {
        const profiles = await Promise.all(
          ownersToLoad.map(async (ownerId) => {
            try {
              const profile = await getUserProfile(ownerId);
              return { ownerId, profile };
            } catch (error) {
              console.warn(`Failed to load profile for owner ${ownerId}:`, error);
              return { ownerId, profile: null };
            }
          })
        );
        
        const newProfiles: { [userId: string]: UserProfile } = {};
        profiles.forEach(({ ownerId, profile }) => {
          if (profile) {
            newProfiles[ownerId] = profile;
          }
        });
        
        if (Object.keys(newProfiles).length > 0) {
          setUserProfiles(prev => ({ ...prev, ...newProfiles }));
        }
      }
    };
    
    loadUserProfiles();
  }, [folders, files]);

  // Helper function to get display name for owner
  const getOwnerDisplayName = (ownerId: string): string => {
    const profile = userProfiles[ownerId];
    return profile?.displayName || ownerId;
  };

  // Helper function to get file date (lastModified or createdAt)
  const getFileDate = (file: FileData): Date | null => {
    if (file.lastModified) {
      return typeof file.lastModified === 'string' 
        ? new Date(file.lastModified) 
        : file.lastModified instanceof Date 
          ? file.lastModified 
          : null;
    }
    
    // Fall back to createdAt if lastModified is not available
    if (file.createdAt) {
      // Firebase Timestamp handling
      if (typeof file.createdAt === 'object' && 'toDate' in file.createdAt) {
        return (file.createdAt as any).toDate();
      }
      // Date object or string
      if (file.createdAt instanceof Date) {
        return file.createdAt;
      }
      if (typeof file.createdAt === 'string') {
        return new Date(file.createdAt);
      }
    }
    
    return null;
  };

  // Helper function to get file created date (createdAt only)
  const getCreatedDate = (file: FileData): Date | null => {
    if (file.createdAt) {
      // Firebase Timestamp handling
      if (typeof file.createdAt === 'object' && 'toDate' in file.createdAt) {
        return (file.createdAt as any).toDate();
      }
      // Date object or string
      if (file.createdAt instanceof Date) {
        return file.createdAt;
      }
      if (typeof file.createdAt === 'string') {
        return new Date(file.createdAt);
      }
    }
    
    return null;
  };

  // Helper function to check if an item is in the clipboard
  const isItemInClipboard = (item: FileData | FolderData, type: 'file' | 'folder') => {
    return clipboardItem && 
           clipboardItem.type === type && 
           clipboardItem.item.id === item.id;
  };

  // Helper function to get clipboard visual styles
  const getClipboardStyles = (item: FileData | FolderData, type: 'file' | 'folder') => {
    if (isItemInClipboard(item, type)) {
      return {
        opacity: clipboardItem?.operation === 'cut' ? 0.5 : 1,
        backgroundColor: clipboardItem?.operation === 'copy' ? theme.palette.action.selected : 'transparent',
        transition: 'all 0.2s ease',
        border: clipboardItem?.operation === 'copy' ? `1px dashed ${theme.palette.primary.main}` : 'none',
      };
    }
    return {};
  };

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
        case 'size': {
          // Folders don't have sizes, treat them as 0 for sorting purposes
          const aHasSize = Object.prototype.hasOwnProperty.call(a, 'size') && a.size;
          const bHasSize = Object.prototype.hasOwnProperty.call(b, 'size') && b.size;
          
          if (aHasSize && bHasSize) {
            aValue = typeof a.size === 'string' ? parseInt(a.size, 10) || 0 : 0;
            bValue = typeof b.size === 'string' ? parseInt(b.size, 10) || 0 : 0;
          } else {
            aValue = aHasSize ? (typeof a.size === 'string' ? parseInt(a.size, 10) || 0 : 0) : -1;
            bValue = bHasSize ? (typeof b.size === 'string' ? parseInt(b.size, 10) || 0 : 0) : -1;
          }
          break;
        }
        case 'shared': {
          // Sort by shared status: shared files first, then non-shared
          const aIsShared = (a as any).sharedWith && (a as any).sharedWith.length > 1;
          const bIsShared = (b as any).sharedWith && (b as any).sharedWith.length > 1;
          
          aValue = aIsShared ? 1 : 0;
          bValue = bIsShared ? 1 : 0;
          break;
        }
        case 'created': {
          // Sort by createdAt date
          const aDate = Object.prototype.hasOwnProperty.call(a, 'createdAt') ? getCreatedDate(a as FileData) : null;
          const bDate = Object.prototype.hasOwnProperty.call(b, 'createdAt') ? getCreatedDate(b as FileData) : null;
          
          // Folders don't have dates, so put them last
          if (!aDate && !bDate) {
            aValue = 0;
            bValue = 0;
          } else if (!aDate) {
            aValue = -1; // Sort folders last
            bValue = bDate!.getTime();
          } else if (!bDate) {
            aValue = aDate.getTime();
            bValue = -1; // Sort folders last
          } else {
            aValue = aDate.getTime();
            bValue = bDate.getTime();
          }
          break;
        }
        case 'modified': {
          // Sort by lastModified date (or createdAt as fallback)
          const aDate = Object.prototype.hasOwnProperty.call(a, 'lastModified') ? getFileDate(a as FileData) : null;
          const bDate = Object.prototype.hasOwnProperty.call(b, 'lastModified') ? getFileDate(b as FileData) : null;
          
          // Folders don't have dates, so put them last
          if (!aDate && !bDate) {
            aValue = 0;
            bValue = 0;
          } else if (!aDate) {
            aValue = -1; // Sort folders last
            bValue = bDate!.getTime();
          } else if (!bDate) {
            aValue = aDate.getTime();
            bValue = -1; // Sort folders last
          } else {
            aValue = aDate.getTime();
            bValue = bDate.getTime();
          }
          break;
        }
        case 'owner': {
          // Sort by owner display name
          const aOwner = (a as any).owner || '';
          const bOwner = (b as any).owner || '';
          const aDisplayName = getOwnerDisplayName(aOwner);
          const bDisplayName = getOwnerDisplayName(bOwner);
          aValue = aDisplayName.toLowerCase();
          bValue = bDisplayName.toLowerCase();
          break;
        }
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
            <TableCell sx={{ width: '50px', padding: '8px' }}>
              <Checkbox
                indeterminate={
                  (selectedFolders.size > 0 && selectedFolders.size < folders.length) ||
                  (selectedFiles.size > 0 && selectedFiles.size < files.length) ||
                  (selectedFolders.size > 0 && selectedFiles.size > 0 && 
                   (selectedFolders.size < folders.length || selectedFiles.size < files.length))
                }
                checked={
                  folders.length > 0 && selectedFolders.size === folders.length &&
                  files.length > 0 && selectedFiles.size === files.length
                }
                onChange={(e) => {
                  if (e.target.checked) {
                    // Select all folders and files
                    folders.forEach(folder => folder.id && onToggleFolderSelection?.(folder.id));
                    files.forEach(file => file.id && onToggleFileSelection?.(file.id));
                  } else {
                    // Deselect all
                    selectedFolders.forEach(id => onToggleFolderSelection?.(id));
                    selectedFiles.forEach(id => onToggleFileSelection?.(id));
                  }
                }}
                size="small"
              />
            </TableCell>
            <TableCell 
              sx={{ 
                width: isMobile ? '45%' : '35%', 
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
            {columnVisibility.type && (
              <TableCell 
                sx={{ 
                  width: isMobile ? '25%' : '18%', 
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
            )}
            {columnVisibility.size && (
              <TableCell 
                sx={{ 
                  width: isMobile ? '20%' : '12%', 
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
            )}
            {columnVisibility.shared && (
              <TableCell 
                sx={{ 
                  width: isMobile ? '15%' : '8%', 
                  cursor: 'pointer',
                  '&:hover': { backgroundColor: 'rgba(0, 0, 0, 0.04)' }
                }}
                onClick={() => handleSort('shared')}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Share fontSize="small" />
                  {!isMobile && 'Shared'}
                  {sortField === 'shared' && (
                    sortDirection === 'asc' ? <ArrowUpward fontSize="small" /> : <ArrowDownward fontSize="small" />
                  )}
                </Box>
              </TableCell>
            )}
            {!isMobile && columnVisibility.created && (
              <TableCell 
                sx={{ 
                  width: '12%', 
                  cursor: 'pointer',
                  '&:hover': { backgroundColor: 'rgba(0, 0, 0, 0.04)' }
                }}
                onClick={() => handleSort('created')}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  Created
                  {sortField === 'created' && (
                    sortDirection === 'asc' ? <ArrowUpward fontSize="small" /> : <ArrowDownward fontSize="small" />
                  )}
                </Box>
              </TableCell>
            )}
            {!isMobile && columnVisibility.modified && (
              <TableCell 
                sx={{ 
                  width: '12%', 
                  cursor: 'pointer',
                  '&:hover': { backgroundColor: 'rgba(0, 0, 0, 0.04)' }
                }}
                onClick={() => handleSort('modified')}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  Modified
                  {sortField === 'modified' && (
                    sortDirection === 'asc' ? <ArrowUpward fontSize="small" /> : <ArrowDownward fontSize="small" />
                  )}
                </Box>
              </TableCell>
            )}
            {!isMobile && columnVisibility.owner && (
              <TableCell 
                sx={{ 
                  width: '15%', 
                  cursor: 'pointer',
                  '&:hover': { backgroundColor: 'rgba(0, 0, 0, 0.04)' }
                }}
                onClick={() => handleSort('owner')}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  Owner
                  {sortField === 'owner' && (
                    sortDirection === 'asc' ? <ArrowUpward fontSize="small" /> : <ArrowDownward fontSize="small" />
                  )}
                </Box>
              </TableCell>
            )}
            {/* Column selector and actions column */}
            <TableCell sx={{ width: '60px', textAlign: 'center' }}>
              <ColumnSelector 
                columnVisibility={columnVisibility}
                onColumnVisibilityChange={handleColumnVisibilityChange}
              />
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {sortedFolders.map((folder) => (
            <TableRow 
              key={folder.id} 
              hover
              draggable
              onDragStart={(e) => {
                const dragData = {
                  id: folder.id,
                  type: 'folder',
                  name: folder.name
                };
                e.dataTransfer.setData('application/json', JSON.stringify(dragData));
                e.dataTransfer.effectAllowed = 'move';
              }}
              sx={{ 
                cursor: 'pointer',
                backgroundColor: selectedFolders.has(folder.id!) ? 'rgba(25, 118, 210, 0.08)' : undefined,
                ...getClipboardStyles(folder, 'folder')
              }}
              onClick={(e) => {
                // Check if click is on checkbox area
                const target = e.target as HTMLElement;
                if (target.closest('input[type="checkbox"]')) {
                  return; // Let checkbox handle it
                }
                onFolderClick?.(folder.id!);
              }}
              onContextMenu={onContextMenu ? (e) => onContextMenu(e, folder, 'folder') : undefined}
              onTouchStart={onLongPressStart ? () => onLongPressStart(folder, 'folder') : undefined}
              onTouchEnd={onLongPressEnd}
              onTouchCancel={onLongPressEnd}
            >
              <TableCell sx={{ padding: '8px' }}>
                <Checkbox
                  checked={selectedFolders.has(folder.id!)}
                  onChange={(e) => {
                    e.stopPropagation();
                    onToggleFolderSelection?.(folder.id!);
                  }}
                  size="small"
                />
              </TableCell>
              <TableCell>
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <Folder sx={{ mr: 1 }} />
                  <Typography variant="body1">
                    {typeof folder.name === 'string' ? folder.name : '[Encrypted]'}
                  </Typography>
                </Box>
              </TableCell>
              {columnVisibility.type && (
                <TableCell>{t('common.folder', 'folder')}</TableCell>
              )}
              {columnVisibility.size && (
                <TableCell>
                  <Typography variant="body2" color="text.secondary">
                    —
                  </Typography>
                </TableCell>
              )}
              {columnVisibility.shared && (
                <TableCell>
                  <Typography variant="body2" color="text.secondary">
                    —
                  </Typography>
                </TableCell>
              )}
              {!isMobile && columnVisibility.created && (
                <TableCell>
                  <Typography variant="body2" color="text.secondary">
                    {(() => {
                      // Folders may have createdAt if we add it in the future
                      if ((folder as any).createdAt) {
                        const createdDate = (folder as any).createdAt;
                        if (typeof createdDate === 'object' && 'toDate' in createdDate) {
                          return createdDate.toDate().toLocaleDateString();
                        }
                        if (createdDate instanceof Date) {
                          return createdDate.toLocaleDateString();
                        }
                        if (typeof createdDate === 'string') {
                          return new Date(createdDate).toLocaleDateString();
                        }
                      }
                      return '—';
                    })()}
                  </Typography>
                </TableCell>
              )}
              {!isMobile && columnVisibility.modified && (
                <TableCell>
                  <Typography variant="body2" color="text.secondary">
                    —
                  </Typography>
                </TableCell>
              )}
              {!isMobile && columnVisibility.owner && (
                <TableCell>
                  <Typography variant="body2" color="text.secondary">
                    {folder.owner ? getOwnerDisplayName(folder.owner) : '—'}
                  </Typography>
                </TableCell>
              )}
              {/* Actions column - always shown, hamburger menu on the right */}
              <TableCell sx={{ textAlign: 'center' }}>
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
                draggable
                onDragStart={(e) => {
                  const dragData = {
                    id: file.id,
                    type: 'file',
                    name: file.name
                  };
                  e.dataTransfer.setData('application/json', JSON.stringify(dragData));
                  e.dataTransfer.effectAllowed = 'move';
                  // Add a visual ghost image
                  const dragImage = document.createElement('div');
                  dragImage.textContent = `📄 ${dragData.name}`;
                  dragImage.style.background = '#1976d2';
                  dragImage.style.color = 'white';
                  dragImage.style.padding = '8px 12px';
                  dragImage.style.borderRadius = '4px';
                  dragImage.style.position = 'absolute';
                  dragImage.style.top = '-1000px';
                  document.body.appendChild(dragImage);
                  e.dataTransfer.setDragImage(dragImage, 0, 0);
                  setTimeout(() => document.body.removeChild(dragImage), 0);
                }}
                sx={{ 
                  cursor: 'pointer',
                  backgroundColor: selectedFiles.has(file.id!) ? 'rgba(25, 118, 210, 0.08)' : undefined,
                  ...getClipboardStyles(file, 'file')
                }}
                onClick={(e) => {
                  // Check if click is on checkbox area
                  const target = e.target as HTMLElement;
                  if (target.closest('input[type="checkbox"]')) {
                    return; // Let checkbox handle it
                  }
                  onFileClick?.(file);
                }}
                onContextMenu={onContextMenu ? (e) => onContextMenu(e, file, 'file') : undefined}
                onTouchStart={onLongPressStart ? () => onLongPressStart(file, 'file') : undefined}
                onTouchEnd={onLongPressEnd}
                onTouchCancel={onLongPressEnd}
              >
                <TableCell sx={{ padding: '8px' }}>
                  <Checkbox
                    checked={selectedFiles.has(file.id!)}
                    onChange={(e) => {
                      e.stopPropagation();
                      onToggleFileSelection?.(file.id!);
                    }}
                    size="small"
                  />
                </TableCell>
                <TableCell>
                  <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    <Icon sx={{ mr: 1 }} />
                    <Typography variant="body1" sx={{ flexGrow: 1 }}>
                      {isForm ? fileName.replace(/\.\w+\.form$/, '') : fileName}
                    </Typography>
                    {onToggleFavorite && (
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleFavorite(file.id!);
                        }}
                        sx={{ ml: 1, color: 'warning.main' }}
                      >
                        {userId && getUserFavoriteStatus(file, userId) ? <Star fontSize="small" /> : <StarBorder fontSize="small" />}
                      </IconButton>
                    )}
                  </Box>
                </TableCell>
                {columnVisibility.type && (
                  <TableCell>{displayType}</TableCell>
                )}
                {columnVisibility.size && (
                  <TableCell>
                    <Typography variant="body2">
                      {displaySize}
                    </Typography>
                  </TableCell>
                )}
                {columnVisibility.shared && (
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      {file.sharedWith && file.sharedWith.length > 1 ? (
                        <>
                          <People fontSize="small" color="primary" />
                          {!isMobile && (
                            <Typography variant="body2" color="primary">
                              {file.sharedWith.length - 1}
                            </Typography>
                          )}
                        </>
                      ) : (
                        <Typography variant="body2" color="text.secondary">
                          —
                        </Typography>
                      )}
                    </Box>
                  </TableCell>
                )}
                {!isMobile && columnVisibility.created && (
                  <TableCell>
                    <Typography variant="body2" color="text.secondary">
                      {(() => {
                        const createdDate = getCreatedDate(file);
                        return createdDate ? createdDate.toLocaleDateString() : '—';
                      })()}
                    </Typography>
                  </TableCell>
                )}
                {!isMobile && columnVisibility.modified && (
                  <TableCell>
                    <Typography variant="body2" color="text.secondary">
                      {(() => {
                        const fileDate = getFileDate(file);
                        return fileDate ? fileDate.toLocaleDateString() : '—';
                      })()}
                    </Typography>
                  </TableCell>
                )}
                {!isMobile && columnVisibility.owner && (
                  <TableCell>
                    <Typography variant="body2" color="text.secondary">
                      {file.owner ? getOwnerDisplayName(file.owner) : '—'}
                    </Typography>
                  </TableCell>
                )}
                {/* Actions column - always shown, hamburger menu on the right */}
                <TableCell sx={{ textAlign: 'center' }}>
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