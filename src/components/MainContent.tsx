import React, { useState, useEffect, useMemo, forwardRef, useImperativeHandle } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { 
  Box,
  Typography,
  Breadcrumbs,
  Link,
  useTheme,
  useMediaQuery,
  CircularProgress,
  Chip,
  IconButton,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  FormControlLabel,
  Checkbox,
} from '@mui/material';
import { 
  AccessTime,
  Clear,
  ContentCopy,
  ContentCut,
  ContentPaste,
  Delete,
  Star,
  Share,
} from '@mui/icons-material';
import { useAuth } from '../auth/AuthContext';
import { usePassphrase } from '../auth/PassphraseContext';
import { useClipboard } from '../context/ClipboardContext';
import { useGlobalLoading } from '../context/LoadingContext';
import { metadataCache, getOrDecryptMetadata } from '../services/metadataCache';
import { backendService } from '../backend/BackendService';
import { useRecents } from '../context/RecentsContext';
import { useFolders } from '../hooks/useFolders';
import { 
  createFolder, 
  getUserProfile, 
  getUserPublicProfile,
  getUserByEmail, 
  updateFolder, 
  deleteFolder, 
  shareFolder,
  renameFolderWithEncryption,
  type Folder as FolderData 
} from '../firestore';
import { collection, query, where, onSnapshot, deleteField, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { encryptData, decryptData, hexToBytes as hpkeHexToBytes, bytesToHex as hpkeBytesToHex, encryptForMultipleRecipients, decryptMetadata, encryptMetadata } from '../crypto/quantumSafeCrypto';
import { FileOperationsService } from '../services/fileOperations';
import { updateFile, deleteFile, createFileWithSharing, type FileData } from '../files';
import { isFormFile, toggleFormFavorite, type SecureFormData } from '../utils/formFiles';
import { FileAccessService } from '../services/fileAccess';
import { getFile, uploadFileData } from '../storage';

// New components
import FileUploadArea from './FileUploadArea';
import SearchBar from './SearchBar';
import FileTable from './FileTable';

// Existing dialogs
import NewFolderDialog from './NewFolderDialog';
import ShareDialog from './ShareDialog';
import ContextMenu from './ContextMenu';
import RenameDialog from './RenameDialog';
import MobileActionMenu from './MobileActionMenu';
import FormFileViewer from './FormFileViewer';
import FormInstanceFiller from './FormInstanceFiller';
import FormBuilder from './FormBuilder';
import CreationFAB from './CreationFAB';
import FileViewer from './FileViewer';
import TagManagementDialog from './TagManagementDialog';

interface MainContentProps {
  currentFolder: string | null;
  setCurrentFolder: (folderId: string | null) => void;
  // Tag filtering props (received from HomePage, used for filtering)
  selectedTags?: string[];
  onTagSelectionChange?: (tags: string[]) => void;
  matchAllTags?: boolean;
  onMatchModeChange?: (matchAll: boolean) => void;
  onFilesChange?: (files: any[]) => void;
  // File opening from notification
  fileIdToOpen?: string | null;
  onFileOpened?: () => void;
}

interface MainContentRef {
}

// Legacy utility functions - prefer HPKE versions for new code
const hexToBytes = (hex: string) => {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
};

const bytesToHex = (bytes: Uint8Array) =>
  bytes.reduce((str, byte) => str + byte.toString(16).padStart(2, '0'), '');

const MainContentComponent = (props: MainContentProps, ref: React.Ref<MainContentRef>) => {
  const { 
    currentFolder, 
    setCurrentFolder, 
    selectedTags = [],
    onTagSelectionChange,
    matchAllTags = false,
    onMatchModeChange,
    onFilesChange,
    fileIdToOpen,
    onFileOpened
  } = props;
  const { user } = useAuth();
  const { privateKey } = usePassphrase();
  const navigate = useNavigate();
  const { 
    clipboardItem, 
    clipboardItems, 
    hasMultipleItems, 
    cutItem, 
    copyItem, 
    cutItems, 
    copyItems, 
    clearClipboard 
  } = useClipboard();
  const { setIsDataLoading } = useGlobalLoading();
  const { 
    isRecentsView, 
    setIsRecentsView, 
    isFavoritesView, 
    setIsFavoritesView, 
    isSharedView, 
    setIsSharedView, 
    addRecentItem, 
    recentItems, 
    clearRecents 
  } = useRecents();
  const { getFoldersByParent, buildFolderPath, allFolders } = useFolders();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  // State management
  const [files, setFiles] = useState<FileData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredFiles, setFilteredFiles] = useState<FileData[]>([]);
  
  // Bulk selection state
  const [selectedFolders, setSelectedFolders] = useState<Set<string>>(new Set());
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());

  // Dialog states
  const [newFolderDialogOpen, setNewFolderDialogOpen] = useState(false);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [fileToShare, setFileToShare] = useState<FileData | null>(null);
  const [folderToShare, setFolderToShare] = useState<FolderData | null>(null);
  const [shareItemType, setShareItemType] = useState<'file' | 'folder'>('file');
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [singleDeleteConfirmOpen, setSingleDeleteConfirmOpen] = useState(false);
  const [tagManagementOpen, setTagManagementOpen] = useState(false);
  const [fileToManageTags, setFileToManageTags] = useState<FileData | null>(null);
  const [itemToDelete, setItemToDelete] = useState<{ item: FileData | FolderData; type: 'file' | 'folder' } | null>(null);
  const [copyOptionsOpen, setCopyOptionsOpen] = useState(false);
  const [itemToCopy, setItemToCopy] = useState<{ item: FileData | FolderData; type: 'file' | 'folder' } | null>(null);
  const [preserveSharing, setPreserveSharing] = useState(false);


  // Context menu and mobile action menu
  const [contextMenu, setContextMenu] = useState<{ 
    mouseX: number; 
    mouseY: number; 
    item: FileData | FolderData; 
    type: 'file' | 'folder' 
  } | null>(null);
  const [mobileActionMenu, setMobileActionMenu] = useState<{ 
    open: boolean; 
    item: FileData | FolderData | null; 
    type: 'file' | 'folder' 
  }>({ open: false, item: null, type: 'file' });
  const [renameDialog, setRenameDialog] = useState<{ 
    open: boolean; 
    item: FileData | FolderData | null; 
    type: 'file' | 'folder';
    currentName: string;
  }>({ open: false, item: null, type: 'file', currentName: '' });
  const [longPressTimer, setLongPressTimer] = useState<NodeJS.Timeout | null>(null);

  // Session timeout cleanup
  useEffect(() => {
    const handleSessionTimeout = (event: CustomEvent) => {
      
      // Clear all decrypted file data
      setFiles([]);
      setFilteredFiles([]);

      // Clear metadata cache since user session is ending
      metadataCache.clear();

      // Close any open viewers/dialogs
      setFileViewerOpen(false);
      setSelectedFile(null);
      setFileContent(null);
      setFormViewerOpen(false);
      setSelectedFormFile(null);
      setFormEditorOpen(false);
      setFormFillerOpen(false);
      setSelectedFormData(null);
      setIsEditingForm(false);
      
      // Close any open dialogs
      setNewFolderDialogOpen(false);
      setFormBuilderOpen(false);
      setShareDialogOpen(false);
      setFileToShare(null);
      setFolderToShare(null);
      setRenameDialog({ open: false, item: null, type: 'file', currentName: '' });
      setMobileActionMenu({ open: false, item: null, type: 'file' });
      setContextMenu(null);
      
      // Clear search
      setSearchQuery('');
      
    };

    // Listen for session timeout events
    window.addEventListener('sessionTimeout', handleSessionTimeout as EventListener);

    return () => {
      window.removeEventListener('sessionTimeout', handleSessionTimeout as EventListener);
    };
  }, []);

  // Form-related state
  const [formBuilderOpen, setFormBuilderOpen] = useState(false);
  const [formEditorOpen, setFormEditorOpen] = useState(false);
  const [unsavedFormData, setUnsavedFormData] = useState<SecureFormData | null>(null);
  const [formViewerOpen, setFormViewerOpen] = useState(false);
  const [formFillerOpen, setFormFillerOpen] = useState(false);
  
  // Handle URL query params for creating forms from templates
  const [searchParams, setSearchParams] = useSearchParams();
  
  useEffect(() => {
    const createFormTemplate = searchParams.get('createForm');
    if (createFormTemplate) {
      // Open form builder with template pre-selected
      setFormBuilderOpen(true);
      // Remove the query param
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // Expose methods to parent component via ref
  useImperativeHandle(ref, () => ({}));
  const [selectedFormFile, setSelectedFormFile] = useState<FileData | null>(null);
  const [selectedFormData, setSelectedFormData] = useState<any>(null);
  const [isEditingForm, setIsEditingForm] = useState(false);

  // File viewer state
  const [fileViewerOpen, setFileViewerOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<FileData | null>(null);
  const [fileContent, setFileContent] = useState<ArrayBuffer | null>(null);
  const [fileContentLoading, setFileContentLoading] = useState(false);

  // Get folders for current directory from shared hook
  const folders = getFoldersByParent(currentFolder);
  const breadcrumbs = buildFolderPath(currentFolder);

  // Recursive search functionality - searches through all folders
  const searchItemsRecursively = async (query: string): Promise<FileData[]> => {
    if (!query.trim() || !user || !privateKey) {
      return [];
    }

    const searchTerm = query.toLowerCase();
    const matchingItems: FileData[] = [];

    try {
      // Get all files using backend service for consistent cache integration
      const [ownedFiles, sharedFiles] = await Promise.all([
        backendService.files.getUserFiles(user.uid),
        backendService.files.getSharedFiles(user.uid)
      ]);

      // Combine all files, avoiding duplicates
      const allFiles = new Map<string, any>();

      ownedFiles.forEach(file => {
        allFiles.set(file.id!, file);
      });

      sharedFiles.forEach(file => {
        if (!allFiles.has(file.id!)) {
          allFiles.set(file.id!, file);
        }
      });

      // Process each file for search
      for (const [fileId, data] of allFiles) {
        try {
          let matches = false;
          let decryptedName = '';
          
          // Decrypt the file name first
          if (!data.encryptedKeys || !data.encryptedKeys[user.uid]) {
            continue; // Skip files we can't decrypt
          }

          const userEncryptedKey = data.encryptedKeys[user.uid];
          const { FileEncryptionService } = await import('../services/fileEncryption');
          
          try {
            const { name: fileName } = await FileEncryptionService.decryptFileMetadata(
              data.name as { ciphertext: string; nonce: string },
              data.size as { ciphertext: string; nonce: string },
              userEncryptedKey,
              privateKey
            );
            decryptedName = fileName;
          } catch (error) {
            continue; // Skip files we can't decrypt
          }

          // Search in file name
          if (decryptedName.toLowerCase().includes(searchTerm)) {
            matches = true;
          }

          // For form files, also search in form content
          if (!matches && isFormFile(decryptedName)) {
            try {
              const decryptedContentBuffer = await FileAccessService.loadFileContent(data as FileData, user.uid, privateKey);
              const decryptedContent = new TextDecoder().decode(decryptedContentBuffer);
              const formData = JSON.parse(decryptedContent);
              
              const searchableText = [
                formData.name,
                formData.formType,
                ...(formData.tags || []),
                ...formData.fields.map((field: any) => `${field.label} ${field.value}`)
              ].join(' ').toLowerCase();
              
              if (searchableText.includes(searchTerm)) {
                matches = true;
              }
            } catch (error) {
              // Ignore errors in content search
            }
          }

          if (matches) {
            matchingItems.push({ ...data, name: decryptedName, size: '' }); // Add decrypted name
          }
        } catch (error) {
          // Skip files that cause errors
          continue;
        }
      }
    } catch (error) {
      console.error('Error in recursive search:', error);
    }

    return matchingItems;
  };

  // Legacy search function for current folder (kept for compatibility)
  const searchItems = async (items: FileData[], query: string): Promise<FileData[]> => {
    if (!query.trim()) {
      return items;
    }

    const searchTerm = query.toLowerCase();
    const matchingItems: FileData[] = [];

    for (const item of items) {
      let matches = false;

      // Search in file name
      const itemName = typeof item.name === 'string' ? item.name.toLowerCase() : '';
      if (itemName.includes(searchTerm)) {
        matches = true;
      }

      // For form files, also search in form content
      if (!matches && user && privateKey && isFormFile(itemName)) {
        try {
          const encryptedContent = await (await import('../storage')).getFile(item.storagePath);
          const userEncryptedKey = item.encryptedKeys[user.uid];
          
          if (userEncryptedKey) {
            const decryptedContentBuffer = await FileAccessService.loadFileContent(item, user.uid, privateKey);
            const decryptedContent = new TextDecoder().decode(decryptedContentBuffer);
            const formData = JSON.parse(decryptedContent);
            
            const searchableText = [
              formData.name,
              formData.formType,
              ...(formData.tags || []),
              ...formData.fields.map((field: any) => `${field.label} ${field.value}`)
            ].join(' ').toLowerCase();
            
            if (searchableText.includes(searchTerm)) {
              matches = true;
            }
          }
        } catch (error) {
        }
      }

      if (matches) {
        matchingItems.push(item);
      }
    }

    return matchingItems;
  };

  // Filter folders based on search (recursive)
  const filteredFolders = useMemo(() => {
    if (!searchQuery.trim()) {
      return folders;
    }
    // When searching, show all folders that match, not just current folder's subfolders
    return allFolders.filter(folder => {
      const folderName = typeof folder.name === 'string' ? folder.name.toLowerCase() : '';
      return folderName.includes(searchQuery.toLowerCase());
    });
  }, [folders, allFolders, searchQuery]);

  // Debounced search and filtering with cached metadata
  useEffect(() => {
    let isMounted = true;
    let timeoutId: NodeJS.Timeout;

    const updateFilteredFiles = async () => {
      try {
        let result = files;

        // Apply search filter first (using cached metadata)
        if (searchQuery.trim()) {
          console.log('🔍 Starting search with cache...');
          const startTime = Date.now();

          result = await searchItemsRecursively(searchQuery);

          const endTime = Date.now();
          console.log(`🔍 Search completed in ${endTime - startTime}ms`);
        }

        // Apply tag filter using pre-cached metadata for instant vault-wide performance
        if (selectedTags.length > 0 && user?.uid && privateKey) {
          console.log('🏷️ Starting instant vault-wide tag filter using cached metadata...');
          const startTime = Date.now();

          // Get ALL cached file metadata - truly instant performance!
          const allCachedMetadata = metadataCache.getAllCachedFileMetadata();
          console.log(`📊 Found ${allCachedMetadata.size} cached files for instant tag filtering`);

          // Build file list from cached metadata - no Firestore queries needed!
          const matchingFiles: FileData[] = [];
          const normalizedSelectedTags = selectedTags.map(tag => tag.toLowerCase());

          console.log(`🏷️ Tag filter debug: Looking for tags [${selectedTags.join(', ')}] in ${allCachedMetadata.size} cached files`);

          for (const [fileId, metadata] of allCachedMetadata) {
            const normalizedFileTags = metadata.tags.map(tag => tag.toLowerCase());

            let matches = false;
            if (matchAllTags) {
              // AND logic: file must have ALL selected tags
              matches = normalizedSelectedTags.every(tag => normalizedFileTags.includes(tag));
            } else {
              // OR logic: file must have ANY of the selected tags
              matches = normalizedSelectedTags.some(tag => normalizedFileTags.includes(tag));
            }

            if (matches) {
              console.log(`✅ Found matching file: ${metadata.decryptedName} with tags [${metadata.tags.join(', ')}]`);

              // Create minimal FileData object from cached metadata
              // The issue might be missing required fields - let me add minimal required fields
              matchingFiles.push({
                id: fileId,
                name: metadata.decryptedName,
                size: metadata.decryptedSize,
                owner: '', // Will be filled by processFiles if needed
                sharedWith: [],
                storagePath: '',
                encryptedKeys: {},
                createdAt: null,
                parent: null,
              } as FileData);
            }
          }

          console.log(`🏷️ Tag filter found ${matchingFiles.length} matching files`);

          result = matchingFiles;

          const endTime = Date.now();
          console.log(`🏷️ Instant tag filter completed in ${endTime - startTime}ms: ${matchingFiles.length} matches from ${allCachedMetadata.size} cached files`);
        }

        if (isMounted) {
          setFilteredFiles(result);
        }
      } catch (error) {
        console.error('Filtering error:', error);
        if (isMounted) {
          setFilteredFiles([]);
        }
      }
    };

    // Debounce search updates to avoid excessive filtering
    const debounceDelay = searchQuery.trim() ? 300 : 0; // 300ms for search, instant for no search
    timeoutId = setTimeout(updateFilteredFiles, debounceDelay);

    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
    };
  }, [files, searchQuery, selectedTags, matchAllTags, user?.uid, privateKey]);

  // Notify HomePage when files change (for sidebar tag filtering)
  useEffect(() => {
    if (onFilesChange) {
      onFilesChange(files);
    }
  }, [files, onFilesChange]);

  // Cleanup long press timer on unmount
  useEffect(() => {
    return () => {
      if (longPressTimer) {
        clearTimeout(longPressTimer);
      }
    };
  }, [longPressTimer]);

  // Bulk selection handlers
  const toggleFolderSelection = (folderId: string) => {
    setSelectedFolders(prev => {
      const newSet = new Set(prev);
      if (newSet.has(folderId)) {
        newSet.delete(folderId);
      } else {
        newSet.add(folderId);
      }
      return newSet;
    });
  };

  const toggleFileSelection = (fileId: string) => {
    setSelectedFiles(prev => {
      const newSet = new Set(prev);
      if (newSet.has(fileId)) {
        newSet.delete(fileId);
      } else {
        newSet.add(fileId);
      }
      return newSet;
    });
  };

  const selectAllFolders = () => {
    const currentFolders = getFoldersByParent(currentFolder);
    setSelectedFolders(new Set(currentFolders.map(f => f.id!)));
  };

  const clearAllSelections = () => {
    setSelectedFolders(new Set());
    setSelectedFiles(new Set());
  };

  const selectAll = () => {
    const currentFolders = getFoldersByParent(currentFolder);
    setSelectedFolders(new Set(currentFolders.map(f => f.id!)));
    setSelectedFiles(new Set(filteredFiles.map(f => f.id!)));
  };

  // Bulk operations
  const showDeleteConfirmation = () => {
    const totalItems = selectedFolders.size + selectedFiles.size;
    if (!user || totalItems === 0) return;
    setDeleteConfirmOpen(true);
  };

  const confirmBulkDelete = async () => {
    setDeleteConfirmOpen(false);
    const totalItems = selectedFolders.size + selectedFiles.size;

    try {
      const promises = [];
      
      // Delete folders
      if (selectedFolders.size > 0) {
        const { deleteFolder } = await import('../firestore');
        const folderPromises = Array.from(selectedFolders).map((folderId) => 
          deleteFolder(folderId)
        );
        promises.push(...folderPromises);
      }

      // Handle files - delete owned files, unshare shared files
      if (selectedFiles.size > 0) {
        const selectedFilesList = Array.from(selectedFiles).map(fileId =>
          files.find(f => f.id === fileId)
        ).filter(Boolean) as FileData[];

        // Separate owned files from shared files
        const ownedFiles = selectedFilesList.filter(file => file.owner === user.uid);
        const sharedFiles = selectedFilesList.filter(file => file.owner !== user.uid);

        console.log(`🗑️ Bulk operation: ${ownedFiles.length} owned files to delete, ${sharedFiles.length} shared files to unshare`);

        // Delete owned files completely
        if (ownedFiles.length > 0) {
          const deletePromises = ownedFiles.map(file => deleteFile(file.id!));
          promises.push(...deletePromises);
        }

        // Unshare shared files (remove user from sharedWith) - using backend service
        if (sharedFiles.length > 0) {
          const unsharePromises = sharedFiles.map(file =>
            backendService.files.update(file.id!, {
              sharedWith: file.sharedWith.filter(uid => uid !== user.uid)
            })
          );
          promises.push(...unsharePromises);
        }
      }

      await Promise.all(promises);
      
      // Immediately update local state to reflect the deletions
      if (selectedFiles.size > 0) {
        setFiles(prevFiles => prevFiles.filter(file => !selectedFiles.has(file.id!)));
        setFilteredFiles(prevFiles => prevFiles.filter(file => !selectedFiles.has(file.id!)));
      }
      
      // Clear selections after successful deletion
      clearAllSelections();
      
      
    } catch (error) {
      console.error('Error deleting items:', error);
    }
  };

  const showSingleDeleteConfirmation = (item: FileData | FolderData, type: 'file' | 'folder') => {
    setItemToDelete({ item, type });
    setSingleDeleteConfirmOpen(true);
  };

  const confirmSingleDelete = async () => {
    if (!itemToDelete || !user) return;

    setSingleDeleteConfirmOpen(false);

    try {
      if (itemToDelete.type === 'file') {
        const file = itemToDelete.item as FileData;

        if (file.owner === user.uid) {
          // User owns the file - delete completely
          console.log('🗑️ Deleting owned file:', file.id);
          await deleteFile(file.id!);
        } else {
          // User doesn't own the file - just remove from sharing using backend service
          console.log('📤 Removing self from shared file:', file.id);

          await backendService.files.update(file.id!, {
            sharedWith: file.sharedWith.filter(uid => uid !== user.uid)
          });
        }
      } else {
        // Folders are always owned by the user, so delete completely
        await deleteFolder(itemToDelete.item.id!);
      }

      // Clear any open menus
      setContextMenu(null);
      setMobileActionMenu({ open: false, item: null, type: 'file' });

    } catch (error) {
      console.error('Delete operation failed:', error);
    } finally {
      setItemToDelete(null);
    }
  };

  const bulkUnshare = async () => {
    const totalFiles = selectedFiles.size;
    if (!user || totalFiles === 0) return;

    // Unshare all selected files

    try {
      const { updateDoc, doc } = await import('firebase/firestore');
      const { db } = await import('../firebase');
      
      const unsharePromises = Array.from(selectedFiles).map((fileId) => 
        updateDoc(doc(db, 'files', fileId), {
          sharedWith: [user.uid] // Only keep owner access
        })
      );

      await Promise.all(unsharePromises);
      clearAllSelections();
    } catch (error) {
      console.error('Error unsharing files:', error);
    }
  };

  const bulkShare = async () => {
    const totalItems = selectedFiles.size + selectedFolders.size;
    if (totalItems === 0) return;

    // For now, open sharing dialog for the first selected file with a note about bulk sharing
    // TODO: Implement true bulk sharing that shares all selected files with the same recipients
    if (selectedFiles.size > 0) {
      const firstFile = files.find(f => selectedFiles.has(f.id));
      if (firstFile) {
        setFileToShare(firstFile);
        setFolderToShare(null);
        setShareItemType('file');
        setShareDialogOpen(true);
      }
    } else if (selectedFolders.size > 0) {
      const firstFolder = folders.find(f => selectedFolders.has(f.id));
      if (firstFolder) {
        setFolderToShare(firstFolder);
        setFileToShare(null);
        setShareItemType('folder');
        setShareDialogOpen(true);
      }
    }
  };

  // True bulk sharing function that shares all selected files with the same recipients
  const bulkShareFiles = async (recipients: string[]) => {
    if (!user || !privateKey || selectedFiles.size === 0 || recipients.length === 0) {
      console.error('Missing required parameters for bulk sharing:', { 
        user: !!user, 
        privateKey: !!privateKey, 
        selectedFiles: selectedFiles.size, 
        recipients 
      });
      return;
    }

    const selectedFilesList = Array.from(selectedFiles).map(fileId => 
      files.find(f => f.id === fileId)
    ).filter(Boolean) as FileData[];

    let successCount = 0;
    let errorCount = 0;

    try {
      // Process recipients to validate and convert email/userID to user IDs (same logic as handleShareFile)
      const recipientUserIds: string[] = [];

      for (const recipient of recipients) {
        try {
          let userProfile;
          let userId;
          
          // Check if recipient looks like a user ID (not an email)
          const isUserId = !recipient.includes('@');
          
          if (isUserId) {
            console.log(`🔍 Looking up user by ID: ${recipient}`);
            userProfile = await getUserPublicProfile(recipient);
            userId = recipient;
            
            if (!userProfile) {
              console.warn(`❌ User ${recipient} not found in database`);
              continue;
            }
            console.log(`✅ Found user ${recipient} with profile:`, userProfile.displayName);
          } else {
            console.log(`🔍 Looking up user by email: ${recipient}`);
            const userWithProfile = await getUserByEmail(recipient);
            
            if (!userWithProfile) {
              console.warn(`❌ User ${recipient} not found in database`);
              continue;
            }
            
            userProfile = userWithProfile.profile;
            userId = userWithProfile.id;
            console.log(`✅ Found user ${recipient} with ID: ${userId}`);
          }
          
          if (!userProfile.publicKey) {
            console.warn(`User ${recipient} does not have a public key`);
            continue;
          }

          recipientUserIds.push(userId);
        } catch (error) {
          console.error(`Error processing recipient ${recipient}:`, error);
        }
      }

      if (recipientUserIds.length === 0) {
        console.warn('No valid recipients found for bulk sharing');
        return;
      }

      console.log(`📤 Bulk sharing with ${selectedFilesList.length} files to user IDs:`, recipientUserIds);

      // Share each selected file with all recipients using the same service as individual sharing
      for (const file of selectedFilesList) {
        try {
          // Filter out recipients who already have access to this file
          const newRecipients = recipientUserIds.filter(userId => !file.sharedWith.includes(userId));
          
          if (newRecipients.length === 0) {
            console.log(`File ${file.name} already shared with all recipients, skipping`);
            continue;
          }

          // Use the centralized FileOperationsService to share the file (same as individual sharing)
          await FileOperationsService.shareFileWithUsers(
            file,
            user.uid,
            privateKey,
            newRecipients
          );
          
          successCount++;
          console.log(`✅ Successfully shared file: ${file.name}`);
        } catch (error) {
          console.error(`❌ Error sharing file ${file.name}:`, error);
          errorCount++;
        }
      }

      console.log(`🎉 Bulk sharing completed: ${successCount} files shared, ${errorCount} errors`);
      
      // Clear selections after successful bulk operation
      if (successCount > 0) {
        setSelectedFiles(new Set());
        setShareDialogOpen(false);
      }
      
    } catch (error) {
      console.error('Failed to bulk share files:', error);
    }
  };

  const bulkCopy = () => {
    const totalItems = selectedFiles.size + selectedFolders.size;
    if (totalItems === 0) return;

    // Collect all selected items for bulk copy
    const itemsToCopy: Array<{ type: 'file' | 'folder', item: FileData | FolderData }> = [];
    
    // Add selected files
    Array.from(selectedFiles).forEach(fileId => {
      const file = files.find(f => f.id === fileId);
      if (file) {
        itemsToCopy.push({ type: 'file', item: file });
      }
    });
    
    // Add selected folders
    Array.from(selectedFolders).forEach(folderId => {
      const folder = folders.find(f => f.id === folderId);
      if (folder) {
        itemsToCopy.push({ type: 'folder', item: folder });
      }
    });

    if (itemsToCopy.length > 0) {
      copyItems(itemsToCopy);
      clearAllSelections();
    }
  };

  const bulkCut = () => {
    const totalItems = selectedFiles.size + selectedFolders.size;
    if (totalItems === 0) return;

    // Collect all selected items for bulk cut
    const itemsToCut: Array<{ type: 'file' | 'folder', item: FileData | FolderData }> = [];

    // Add selected files
    Array.from(selectedFiles).forEach(fileId => {
      const file = files.find(f => f.id === fileId);
      if (file) {
        itemsToCut.push({ type: 'file', item: file });
      }
    });

    // Add selected folders
    Array.from(selectedFolders).forEach(folderId => {
      const folder = folders.find(f => f.id === folderId);
      if (folder) {
        itemsToCut.push({ type: 'folder', item: folder });
      }
    });

    if (itemsToCut.length > 0) {
      cutItems(itemsToCut);
      clearAllSelections();
    }
  };

  // Cached function to process and decrypt files
  const processFiles = async (rawFiles: any[]): Promise<FileData[]> => {
    if (!user || !privateKey) {
      return [];
    }

    const filesMap = new Map<string, FileData>();

    // Invalidate cache entries for files that have been modified
    for (const fileData of rawFiles) {
      if (fileData.modifiedAt) {
        const modifiedTime = fileData.modifiedAt.toDate ? fileData.modifiedAt.toDate().getTime() : Date.now();
        metadataCache.invalidateIfModified(fileData.id, modifiedTime);
      }
    }

    // Batch check cache for all files
    const fileIds = rawFiles.map(f => f.id);
    const cachedEntries = metadataCache.getBatch(fileIds);

    console.log(`📊 Cache stats: ${cachedEntries.size}/${rawFiles.length} files cached`);

    // Separate files into cached and uncached
    const uncachedFiles = [];

    for (const fileData of rawFiles) {
      if (!fileData.encryptedKeys || !fileData.encryptedKeys[user.uid]) {
        filesMap.set(fileData.id, { ...fileData, name: '[No Access]', size: '' });
        continue;
      }

      const cached = cachedEntries.get(fileData.id);
      if (cached) {
        // Use cached metadata - instant performance!
        filesMap.set(fileData.id, {
          ...fileData,
          name: cached.decryptedName,
          size: cached.decryptedSize,
        });
      } else {
        uncachedFiles.push(fileData);
      }
    }

    // Process uncached files in smaller batches to avoid blocking UI
    const batchSize = 5;
    for (let i = 0; i < uncachedFiles.length; i += batchSize) {
      const batch = uncachedFiles.slice(i, i + batchSize);

      if (batch.length > 0) {
        console.log(`🔓 Decrypting metadata for ${batch.length} files (batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(uncachedFiles.length/batchSize)})`);
      }

      await Promise.all(
        batch.map(async (fileData) => {
          try {
            const userEncryptedKey = fileData.encryptedKeys?.[user.uid];
            if (!userEncryptedKey || !privateKey || !fileData.encryptedKeys) {
              console.warn('Missing encrypted key for file:', {
                fileId: fileData.id,
                fileName: fileData.name,
                userId: user.uid,
                hasEncryptedKeys: !!fileData.encryptedKeys,
                encryptedKeysKeys: fileData.encryptedKeys ? Object.keys(fileData.encryptedKeys) : [],
                userHasKey: fileData.encryptedKeys ? user.uid in fileData.encryptedKeys : false
              });
              filesMap.set(fileData.id, { ...fileData, name: '[No Access]', size: '' });
              return;
            }

            // Use cached metadata service - this will decrypt and cache
            const metadata = await getOrDecryptMetadata(fileData, user.uid, privateKey);

            filesMap.set(fileData.id, {
              ...fileData,
              name: metadata.decryptedName,
              size: metadata.decryptedSize,
            });
          } catch (error) {
            console.error('Error decrypting file metadata:', error);
            filesMap.set(fileData.id, { ...fileData, name: '[Encrypted File]', size: '' });
          }
        })
      );
    }

    return Array.from(filesMap.values());
  };

  // Sync cache timeout with passphrase timeout preference
  useEffect(() => {
    // Check if user has "remember longer" preference by checking localStorage
    const hasLongerPreference = localStorage.getItem(`rememberChoice_${user?.uid}`) === 'true';
    metadataCache.setTimeoutPreference(hasLongerPreference);
  }, [user?.uid]);

  // Load files for current folder
  // Subscribe to files with real-time updates
  useEffect(() => {
    
    if (!user || !privateKey || isRecentsView || isFavoritesView || isSharedView) {
      console.log('🔧 MainContent early exit:', {
        noUser: !user,
        noPrivateKey: !privateKey,
        isRecentsView,
        isFavoritesView,
        isSharedView
      });
      setLoading(false);
      setIsDataLoading(false);
      return;
    }

    setLoading(true);
    setIsDataLoading(true);

    const handleFilesUpdate = async (rawFiles: any[]) => {
      try {
        const stack = new Error().stack;
        const chatCountInRaw = rawFiles.filter((f: any) => f.fileType === 'chat').length;
        console.log(`🔄 Loading ${rawFiles.length} files (${chatCountInRaw} chats)...`, stack?.split('\n')[2]);

        // Check if all files are cached for instant loading
        const fileIds = rawFiles.map(f => f.id);
        const cachedEntries = metadataCache.getBatch(fileIds);

        let processedFiles: FileData[];

        if (cachedEntries.size === rawFiles.length) {
          // All files are cached - instant loading!
          console.log(`⚡ All ${rawFiles.length} files cached - instant load!`);
          processedFiles = metadataCache.buildFileDataFromCache(fileIds, rawFiles);
        } else {
          // Some files need processing - this will also update the cache
          console.log(`🔓 ${rawFiles.length - cachedEntries.size}/${rawFiles.length} files need processing`);
          processedFiles = await processFiles(rawFiles);
          console.log(`📊 Cache now contains ${metadataCache.getStats().size} files after processing`);
        }

        console.log(`✅ Finished loading ${processedFiles.length} files`);
        const sortedFiles = processedFiles.sort((a, b) => {
          // Convert to Date objects for comparison
          const dateA = a.lastModified instanceof Date ? a.lastModified : new Date(a.lastModified);
          const dateB = b.lastModified instanceof Date ? b.lastModified : new Date(b.lastModified);
          return dateB.getTime() - dateA.getTime(); // Sort by most recent first
        });
        
        const chatCount = sortedFiles.filter((f: any) => f.fileType === 'chat').length;
        console.log(`📁 Setting files state: ${sortedFiles.length} total (${chatCount} chats)`);
        
        setFiles(sortedFiles);
        setFilteredFiles(sortedFiles);
        setLoading(false);
        setIsDataLoading(false);
      } catch (error) {
        console.error('Error processing files:', error);
        setFiles([]);
        setFilteredFiles([]);
        setLoading(false);
        setIsDataLoading(false);
      }
    };

    // Set up real-time subscription
    let unsubscribe: (() => void) | null = null;
    
    const setupSubscription = async () => {
      try {
        // Use backend service for reactive file subscriptions
        unsubscribe = backendService.files.subscribe(
          user.uid,
          currentFolder,
          handleFilesUpdate
        );
      } catch (error) {
        console.error('Error setting up files subscription:', error);
        setLoading(false);
        setIsDataLoading(false);
      }
    };

    setupSubscription();

    // Cleanup subscription on unmount or dependency change
    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [currentFolder, user, privateKey, isRecentsView, isFavoritesView, isSharedView]);

  // Handle opening a file from notification
  useEffect(() => {
    if (!fileIdToOpen || !user || !privateKey) {
      return;
    }

    console.log(`📂 Attempting to open file from notification: ${fileIdToOpen}`);
    
    // Don't wait for files to load - try to load directly
    const loadAndOpenFile = async () => {
      try {
        // First check if file is already in the current files list
        const fileInList = files.find(f => f.id === fileIdToOpen);
        
        if (fileInList) {
          console.log(`✅ Found file in current list, opening:`, fileInList);
          await handleFormFileClick(fileInList);
        } else {
          // File not in current folder - load it directly
          console.log(`⚠️ File not in current folder, loading directly...`);
          const file = await FileAccessService.loadFileById(fileIdToOpen, user.uid, privateKey);
          console.log(`✅ Loaded file directly:`, file);
          
          // Now open it using handleFormFileClick
          await handleFormFileClick(file);
        }
        
        // Notify that the file was opened
        if (onFileOpened) {
          onFileOpened();
        }
      } catch (error) {
        console.error(`❌ Error loading file ${fileIdToOpen}:`, error);
        if (onFileOpened) {
          onFileOpened(); // Clear the fileIdToOpen even on error
        }
      }
    };

    loadAndOpenFile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileIdToOpen]); // Only trigger when fileIdToOpen changes

  // Load recent files when in recents view
  useEffect(() => {
    if (!isRecentsView || !user || !privateKey) {
      console.log('⏭️ Skipping recents view effect:', { isRecentsView, hasUser: !!user, hasPrivateKey: !!privateKey });
      return;
    }

    console.log('📅 Loading recents view...');
    const loadRecentFiles = async () => {
      setLoading(true);
      setIsDataLoading(true);

      try {
        const recentFilePromises = recentItems.map(async (item) => {
          try {
            return await FileAccessService.loadFileById(item.id, user.uid, privateKey);
          } catch (error) {
            console.error(`Error loading recent file ${item.id}:`, error);
            return null;
          }
        });

        const recentFiles = await Promise.all(recentFilePromises);
        const validFiles = recentFiles.filter((file): file is FileData => file !== null);
        
        setFiles(validFiles);
      } catch (error) {
        console.error('Error loading recent files:', error);
        setFiles([]);
      } finally {
        setLoading(false);
        setIsDataLoading(false);
      }
    };

    loadRecentFiles();
  }, [isRecentsView, recentItems, user, privateKey]);

  // Load favorite files when in favorites view
  useEffect(() => {
    if (!isFavoritesView || !user || !privateKey) {
      console.log('⏭️ Skipping favorites view effect:', { isFavoritesView, hasUser: !!user, hasPrivateKey: !!privateKey });
      return;
    }

    console.log('⭐ Loading favorites view...');
    const loadFavoriteFiles = async () => {
      setLoading(true);
      setIsDataLoading(true);

      try {
        // Get all files the user has access to using backend service
        const [ownedFiles, sharedFiles] = await Promise.all([
          backendService.files.getUserFiles(user.uid),
          backendService.files.getSharedFiles(user.uid)
        ]);

        // Combine and deduplicate files
        const allUserFiles = new Map<string, any>();

        ownedFiles.forEach(file => {
          allUserFiles.set(file.id!, file);
        });

        sharedFiles.forEach(file => {
          if (!allUserFiles.has(file.id!)) {
            allUserFiles.set(file.id!, file);
          }
        });

        const allFiles = Array.from(allUserFiles.values());

        // Filter files that are favorites for this user
        const { getUserFavoriteStatus } = await import('../services/userFavoritesManagement');
        console.log(`⭐ Checking ${allFiles.length} files for favorite status...`);
        const favoriteFiles = allFiles.filter((file: any) => {
          const isFavorite = getUserFavoriteStatus(file, user.uid);
          if (isFavorite) {
            console.log(`⭐ Found favorite file: ${file.id}`);
          }
          return isFavorite;
        });
        console.log(`⭐ Found ${favoriteFiles.length} favorite files out of ${allFiles.length} total`);
        
        // Optimize favorite files loading with cache
        const fileIds = favoriteFiles.map(f => f.id);
        const cachedEntries = metadataCache.getBatch(fileIds);

        let processedFiles: FileData[];

        if (cachedEntries.size === favoriteFiles.length) {
          // All favorite files are cached - instant loading!
          console.log(`⚡ All ${favoriteFiles.length} favorite files cached - instant load!`);
          processedFiles = metadataCache.buildFileDataFromCache(fileIds, favoriteFiles);
        } else {
          // Some files need processing
          console.log(`🔓 ${favoriteFiles.length - cachedEntries.size}/${favoriteFiles.length} favorite files need processing`);
          processedFiles = await processFiles(favoriteFiles);
        }
        const sortedFiles = processedFiles.sort((a, b) => {
          // Convert to Date objects for comparison
          const dateA = a.lastModified instanceof Date ? a.lastModified : new Date(a.lastModified);
          const dateB = b.lastModified instanceof Date ? b.lastModified : new Date(b.lastModified);
          return dateB.getTime() - dateA.getTime(); // Sort by most recent first
        });
        
        setFiles(sortedFiles);
        setFilteredFiles(sortedFiles);
        setLoading(false);
        setIsDataLoading(false);
      } catch (error) {
        console.error('Error loading favorite files:', error);
        setFiles([]);
        setFilteredFiles([]);
        setLoading(false);
        setIsDataLoading(false);
      }
    };

    loadFavoriteFiles();
  }, [isFavoritesView, user, privateKey]);

  // Load shared files when in shared view
  useEffect(() => {
    if (!isSharedView || !user || !privateKey) {
      console.log('⏭️ Skipping shared view effect:', { isSharedView, hasUser: !!user, hasPrivateKey: !!privateKey });
      return;
    }

    console.log('🤝 Loading shared view...');
    const loadSharedFiles = async () => {
      setLoading(true);
      setIsDataLoading(true);

      try {
        // Get files shared with user using backend service
        const sharedFiles = await backendService.files.getSharedFiles(user.uid);

        // Filter out files owned by the user (only show files shared BY others)
        const actuallySharedFiles = sharedFiles.filter((file: any) => file.owner !== user.uid);

        // Process shared files with cache
        const processedFiles = await processFiles(actuallySharedFiles);

        setFiles(processedFiles);
        setFilteredFiles(processedFiles);
        setLoading(false);
        setIsDataLoading(false);
      } catch (error) {
        console.error('Error loading shared files:', error);
        setFiles([]);
        setFilteredFiles([]);
        setLoading(false);
        setIsDataLoading(false);
      }
    };

    loadSharedFiles();
  }, [isSharedView, user, privateKey]);

  // Event handlers
  const handleCreateFolder = async (name: string) => {
    if (!user || !privateKey) {
      console.error('Cannot create folder: user or privateKey not available');
      return;
    }
    await createFolder(user.uid, name, currentFolder, privateKey);
    setNewFolderDialogOpen(false);
  };

  const handleFormFileClick = async (fileInfo: FileData | { id: string; name?: string; parent?: string | null }) => {
    console.log('handleFormFileClick called with:', fileInfo);
    // Don't allow file operations if private key isn't available
    if (!user || !privateKey) {
      console.warn('Cannot open file: User or private key not available');
      return;
    }

    // Check if this is a chat file
    const isChat = 'fileType' in fileInfo && (fileInfo as any).fileType === 'chat';
    if (isChat) {
      // Navigate to chat page with the conversation selected
      navigate('/chat', { state: { selectedConversationId: fileInfo.id } });
      return;
    }

    // Track recent access (only store non-sensitive metadata)
    const fileName = 'name' in fileInfo && fileInfo.name 
      ? (typeof fileInfo.name === 'string' ? fileInfo.name : '')
      : '';
    
    addRecentItem({
      id: fileInfo.id,
      type: isFormFile(fileName) ? 'form' : 'file',
      parent: 'parent' in fileInfo ? fileInfo.parent : null,
    });

    // Set loading state for file content
    setFileContentLoading(true);
    
    // Use centralized file access service
    await FileAccessService.openFile(fileInfo, user.uid, privateKey, {
      onFormOpen: (file: FileData, formData?: any) => {
        setFileContentLoading(false); // Clear loading state for forms too
        setSelectedFormFile(file);
        
        if (formData) {
          // Check if form has any data - if all fields are empty, open in edit mode
          const hasData = formData.data && Object.values(formData.data).some((value: any) => 
            value !== null && value !== undefined && value !== ''
          );
          
          if (!hasData) {
            // Form is empty, open directly in edit mode
            setSelectedFormData(formData);
            setIsEditingForm(true);
            setFormFillerOpen(true);
          } else {
            // Form has data, open in view mode
            setFormViewerOpen(true);
          }
        } else {
          // Fallback to view mode if no form data
          setFormViewerOpen(true);
        }
      },
      onFileOpen: (file: FileData, content: ArrayBuffer) => {
        // For regular files, open in file viewer
        setSelectedFile(file);
        setFileContent(content);
        setFileContentLoading(false); // Ensure loading state is cleared
        setFileViewerOpen(true);
      },
      onError: (error: string) => {
        console.error('Error opening file:', error);
        setFileContentLoading(false); // Clear loading state on error
      }
    });
  };


  const handleDownloadFile = async () => {
    if (!selectedFile || !fileContent) return;
    
    try {
      const fileName = typeof selectedFile.name === 'string' ? selectedFile.name : `file_${selectedFile.id}`;
      const blob = new Blob([fileContent]);
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading file:', error);
    }
  };

  const handleDownloadFormFile = async () => {
    if (!selectedFormFile || !user || !privateKey) return;
    
    try {
      const content = await FileAccessService.loadFileContent(selectedFormFile, user.uid, privateKey);
      const fileName = typeof selectedFormFile.name === 'string' ? selectedFormFile.name : `form_${selectedFormFile.id}`;
      const blob = new Blob([content]);
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading form file:', error);
    }
  };

  const handleCloseFileViewer = () => {
    setFileViewerOpen(false);
    setSelectedFile(null);
    setFileContent(null);
  };

  const handleEditForm = async () => {
    if (!selectedFormFile || !user || !privateKey) return;
    
    try {
      setFormViewerOpen(false);
      
      const content = await FileAccessService.loadFileContent(selectedFormFile, user.uid, privateKey);
      const decryptedContent = new TextDecoder().decode(content);
      const formData = JSON.parse(decryptedContent);
      
      setSelectedFormData(formData);
      setIsEditingForm(true);
      setFormFillerOpen(true);
      
    } catch (error) {
      console.error('Error loading form for editing:', error);
    }
  };

  const handleFormSave = () => {
    setFormEditorOpen(false);
    setFormFillerOpen(false);
    setSelectedFormFile(null);
    setSelectedFormData(null);
    setIsEditingForm(false);
  };

  const handleFormCancel = () => {
    setFormEditorOpen(false);
    setFormViewerOpen(false);
    setFormFillerOpen(false);
    setSelectedFormFile(null);
    setSelectedFormData(null);
    setIsEditingForm(false);
    // Also close file viewer if open
    setFileViewerOpen(false);
    setSelectedFile(null);
    setFileContent(null);
  };

  const handleRightClick = (event: React.MouseEvent, item: FileData | FolderData, type: 'file' | 'folder') => {
    event.preventDefault();
    setContextMenu({ mouseX: event.clientX - 2, mouseY: event.clientY - 4, item, type });
  };

  const handleLongPressStart = (item: FileData | FolderData, type: 'file' | 'folder') => {
    const timer = setTimeout(() => {
      setMobileActionMenu({ open: true, item, type });
    }, 500);
    setLongPressTimer(timer);
  };

  const handleLongPressEnd = () => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      setLongPressTimer(null);
    }
  };

  const handleOpenMobileActionMenu = (item: FileData | FolderData, type: 'file' | 'folder') => {
    setMobileActionMenu({ open: true, item, type });
  };

  const copyFile = async (originalFile: FileData, preserveSharing: boolean = true) => {
    if (!user || !privateKey) return;

    try {
      await FileOperationsService.copyFile(
        originalFile,
        user.uid,
        privateKey,
        {
          preserveSharing,
          newParentFolder: currentFolder,
          allowContentDeduplication: true // Allow sharing same storage path for efficiency
        }
      );
      
      console.log('File copied successfully');
    } catch (error) {
      console.error('Failed to copy file:', error);
      throw error;
    }
  };

  const copyFolder = async (originalFolder: FolderData) => {
    if (!user || !privateKey) {
      console.error('Cannot copy folder: user or privateKey not available');
      return;
    }

    try {
      await FileOperationsService.copyFolder(
        originalFolder,
        user.uid,
        privateKey,
        {
          newParentFolder: currentFolder
        }
      );
      
      console.log('Folder copied successfully');
    } catch (error) {
      console.error('Failed to copy folder:', error);
      throw error;
    }
  };

  const handlePaste = async () => {
    if (clipboardItems.length === 0 || !user) return;

    try {
      // For multiple items, process each one
      for (const item of clipboardItems) {
        if (item.type === 'folder') {
          const folder = item.item as FolderData;
          
          if (item.operation === 'cut') {
            await updateFolder(folder.id!, { parent: currentFolder });
          } else if (item.operation === 'copy') {
            // For now, copy folder without dialog for bulk operations
            // TODO: Could be enhanced to show a single dialog for all items
            await copyFolder(folder);
          }
        } else if (item.type === 'file') {
          const file = item.item as FileData;
          
          if (item.operation === 'cut') {
            // Use the new per-user folder management system
            const { moveFileForUser } = await import('../services/userFolderManagement');
            await moveFileForUser(file.id!, user!.uid, currentFolder, file);
          } else if (item.operation === 'copy') {
            // For single items, show dialog; for multiple items, copy without dialog
            if (clipboardItems.length === 1) {
              setItemToCopy({ item: file, type: 'file' });
              setCopyOptionsOpen(true);
              return; // Exit early to show dialog
            } else {
              // Bulk copy without dialog - don't preserve sharing by default
              await copyFile(file, false);
            }
          }
        }
      }
      
      // Clear clipboard after successful paste
      clearClipboard();
    } catch (error) {
      console.error('Paste operation failed:', error);
    }
  };

  const handleUploadClick = () => {
    // This will be handled by FileUploadArea's internal file input
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    if (fileInput) {
      fileInput.click();
    }
  };

  const handleToggleFavorite = async (fileId: string) => {
    if (!user) return;
    
    try {
      // Find the file in the current files list
      const file = files.find(f => f.id === fileId);
      if (!file) {
        console.error('File not found for favorite toggle');
        return;
      }
      
      // Use the new per-user favorites system
      const { toggleUserFavorite } = await import('../services/userFavoritesManagement');
      const newStatus = await toggleUserFavorite(file, user.uid);
      
      // Update the local state immediately for better UX
      const updatedFiles = files.map(f => {
        if (f.id === fileId) {
          const updatedUserFavorites = { ...f.userFavorites };
          updatedUserFavorites[user.uid] = newStatus;
          return { ...f, userFavorites: updatedUserFavorites };
        }
        return f;
      });
      
      setFiles(updatedFiles);
      setFilteredFiles(filteredFiles.map(f => {
        if (f.id === fileId) {
          const updatedUserFavorites = { ...f.userFavorites };
          updatedUserFavorites[user.uid] = newStatus;
          return { ...f, userFavorites: updatedUserFavorites };
        }
        return f;
      }));
      
    } catch (error) {
      console.error('Error toggling favorite:', error);
    }
  };

  const handleUnshareFile = async (userIdsToUnshare: string[]) => {
    if (!user || !fileToShare || userIdsToUnshare.length === 0) {
      console.error('Missing required parameters for unsharing:', { user: !!user, fileToShare: !!fileToShare, userIdsToUnshare });
      return;
    }

    try {
      // Use the FileOperationsService for proper unsharing with notifications
      await FileOperationsService.removeFileSharing(
        fileToShare,
        userIdsToUnshare,
        user.uid // Pass current user ID for notifications
      );

      setShareDialogOpen(false);
      
    } catch (error) {
      console.error('Error unsharing file:', error);
    }
  };

  const handleShareFile = async (recipients: string[]) => {
    if (!user || !privateKey || !fileToShare || recipients.length === 0) {
      console.error('Missing required parameters for sharing:', { user: !!user, privateKey: !!privateKey, fileToShare: !!fileToShare, recipients });
      return;
    }

    try {
      const recipientUserIds: string[] = [];

      // Process each recipient to validate and convert email/userID to user ID
      for (const recipient of recipients) {
        try {
          let userProfile;
          let userId;
          
          // Check if recipient looks like a user ID (not an email)
          const isUserId = !recipient.includes('@');
          
          if (isUserId) {
            console.log(`🔍 Looking up user by ID: ${recipient}`);
            userProfile = await getUserPublicProfile(recipient);
            userId = recipient;
            
            if (!userProfile) {
              console.warn(`❌ User ${recipient} not found in database`);
              continue;
            }
            console.log(`✅ Found user ${recipient} with profile:`, userProfile.displayName);
          } else {
            console.log(`🔍 Looking up user by email: ${recipient}`);
            const userWithProfile = await getUserByEmail(recipient);
            
            if (!userWithProfile) {
              console.warn(`❌ User ${recipient} not found in database`);
              continue;
            }
            
            userProfile = userWithProfile.profile;
            userId = userWithProfile.id;
            console.log(`✅ Found user ${recipient} with ID: ${userId}`);
          }
          
          if (!userProfile.publicKey) {
            console.warn(`User ${recipient} does not have a public key`);
            continue;
          }

          // Skip if already shared with this user
          if (fileToShare.sharedWith.includes(userId)) {
            console.log(`File already shared with ${recipient}`);
            continue;
          }

          recipientUserIds.push(userId);

        } catch (error) {
          console.error(`Error processing recipient ${recipient}:`, error);
        }
      }

      if (recipientUserIds.length === 0) {
        return;
      }

      console.log(`📤 Sharing file with user IDs:`, recipientUserIds);
      console.log(`📄 File to share:`, { id: fileToShare.id, name: fileToShare.name, sharedWith: fileToShare.sharedWith });

      // Use the centralized FileOperationsService to share the file
      await FileOperationsService.shareFileWithUsers(
        fileToShare,
        user.uid,
        privateKey,
        recipientUserIds
      );

      // Update fileToShare state with new shared users so ShareDialog shows updated list when reopened
      setFileToShare(prevFile => prevFile ? {
        ...prevFile,
        sharedWith: [...prevFile.sharedWith, ...recipientUserIds]
      } : null);

      setShareDialogOpen(false);
      
    } catch (error) {
      console.error('Failed to share file:', error);
    }
  };


  // Handler for file sharing
  const handleShare = async (recipients: string[]) => {
    // Check if multiple files are selected for bulk sharing
    if (selectedFiles.size > 1) {
      console.log(`🔄 Bulk sharing ${selectedFiles.size} files`);
      await bulkShareFiles(recipients);
    } else {
      // Single file sharing (existing behavior)
      await handleShareFile(recipients);
    }
  };

  // Handler for moving items (files or folders) to different folders
  const handleMoveItem = async (itemId: string, itemType: 'file' | 'folder', targetFolderId: string | null) => {
    if (!user) return;
    
    try {
      if (itemType === 'folder') {
        await updateFolder(itemId, { parent: targetFolderId });
      } else if (itemType === 'file') {
        // Use the new per-user folder management system
        const { moveFileForUser } = await import('../services/userFolderManagement');
        await moveFileForUser(itemId, user.uid, targetFolderId);
      }
    } catch (error) {
      console.error('Error moving item:', error);
      // You could add a toast notification here
    }
  };

  return (
    <FileUploadArea
      currentFolder={currentFolder}
      privateKey={privateKey || ''}
      onUploadComplete={() => {
        // Files should refresh automatically via the snapshot listener
        // But add a small delay and manual refresh as fallback
        console.log('📁 Upload completed, triggering UI refresh...');
        setTimeout(() => {
          // Force refresh by toggling a state variable
          setIsDataLoading(true);
          setTimeout(() => setIsDataLoading(false), 100);
        }, 500);
      }}
    >

      <Box sx={{ 
        display: 'flex', 
        flexDirection: 'column', 
        height: '100%',
        width: '100%', 
        minWidth: 0,
        overflow: 'hidden'
      }}>
        {/* Header - different for recents vs folder view */}
        {isRecentsView && (
          <Box sx={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            mb: 2, 
            flexShrink: 0 
          }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <AccessTime color="primary" />
              <Typography variant="h6" component="h1">
                Recent Files
              </Typography>
              <Chip 
                label={files.length} 
                size="small" 
                variant="outlined" 
                sx={{ ml: 1 }}
              />
            </Box>
            
            {recentItems.length > 0 && (
              <IconButton
                onClick={() => {
                  clearRecents();
                  setFiles([]);
                }}
                size="small"
                title="Clear all recents"
                sx={{ color: 'text.secondary' }}
              >
                <Clear />
              </IconButton>
            )}
          </Box>
        )}

        {isFavoritesView && (
          <Box sx={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            mb: 2, 
            flexShrink: 0 
          }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Star color="primary" />
              <Typography variant="h6" component="h1">
                Favorite Files
              </Typography>
              <Chip 
                label={files.length} 
                size="small" 
                variant="outlined" 
                sx={{ ml: 1 }}
              />
            </Box>
          </Box>
        )}

        {isSharedView && (
          <Box sx={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            mb: 2, 
            flexShrink: 0 
          }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Share color="primary" />
              <Typography variant="h6" component="h1">
                Shared with Me
              </Typography>
              <Chip 
                label={files.length} 
                size="small" 
                variant="outlined" 
                sx={{ ml: 1 }}
              />
            </Box>
          </Box>
        )}
        
        {!isRecentsView && !isFavoritesView && !isSharedView && (
          <>
            {/* Header with Breadcrumbs, Search, and Action Buttons */}
            <Box sx={{ 
              display: 'flex', 
              flexDirection: isMobile ? 'column' : 'row',
              justifyContent: 'space-between', 
              alignItems: isMobile ? 'stretch' : 'center',
              mb: 2, 
              flexShrink: 0,
              gap: isMobile ? 1 : 0
            }}>
              <Breadcrumbs 
                aria-label="breadcrumb"
                sx={{ 
                  flexGrow: 1,
                  minWidth: 0,
                  '& .MuiBreadcrumbs-ol': {
                    flexWrap: isMobile ? 'wrap' : 'nowrap'
                  }
                }}
                maxItems={isMobile ? 2 : undefined}
                itemsAfterCollapse={isMobile ? 1 : undefined}
                itemsBeforeCollapse={isMobile ? 1 : undefined}
              >
                {breadcrumbs.map((crumb, index) => {
                  const isLast = index === breadcrumbs.length - 1;
                  return isLast ? (
                    <Typography key={crumb.id || 'home'} color="text.primary">
                      {crumb.name}
                    </Typography>
                  ) : (
                    <Link
                      key={crumb.id || 'home'}
                      underline="hover"
                      color="inherit"
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        setCurrentFolder(crumb.id);
                      }}
                    >
                      {crumb.name}
                    </Link>
                  );
                })}
              </Breadcrumbs>

              {/* Search Field and Action Buttons */}
              <Box sx={{ 
                display: 'flex', 
                flexDirection: 'column',
                gap: 1,
                width: isMobile ? '100%' : 'auto'
              }}>
                <Box sx={{
                  display: 'flex', 
                  flexDirection: isMobile ? 'column' : 'row',
                  alignItems: isMobile ? 'stretch' : 'center',
                  gap: 1,
                }}>
                  <SearchBar
                    searchQuery={searchQuery}
                    onSearchChange={setSearchQuery}
                  />
                </Box>
                
              </Box>
            </Box>
          </>
        )}

        {/* Paste Button - always visible when clipboard has items */}
        {clipboardItem && (selectedFolders.size === 0 && selectedFiles.size === 0) && (
          <Box sx={{ 
            display: 'flex', 
            justifyContent: 'flex-end',
            mb: 2
          }}>
            <Button
              variant="outlined"
              color="primary"
              size="small"
              onClick={handlePaste}
              startIcon={<ContentPaste />}
            >
              Paste {hasMultipleItems ? `${clipboardItems.length} items` : `${clipboardItem.type}`} ({clipboardItem.operation})
            </Button>
          </Box>
        )}

        {/* Bulk Operations Toolbar */}
        {(selectedFolders.size > 0 || selectedFiles.size > 0) && (
          <Box sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: 'primary.main',
            color: 'primary.contrastText',
            borderRadius: 1,
            p: 2,
            mb: 2,
            boxShadow: 1,
          }}>
            <Typography variant="body2" sx={{ fontWeight: 500, color: 'inherit' }}>
              {selectedFolders.size + selectedFiles.size} item{(selectedFolders.size + selectedFiles.size) !== 1 ? 's' : ''} selected
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              {selectedFiles.size > 0 &&
               Array.from(selectedFiles).some(fileId => {
                 const file = files.find(f => f.id === fileId);
                 return file && file.sharedWith && file.sharedWith.length > 1;
               }) && (
                <Button
                  variant="contained"
                  color="warning"
                  size="small"
                  onClick={bulkUnshare}
                  startIcon={<Clear />}
                  sx={{ color: 'warning.contrastText' }}
                >
                  Unshare
                </Button>
              )}
              {clipboardItem && (
                <Button
                  variant="contained"
                  size="small"
                  onClick={handlePaste}
                  startIcon={<ContentPaste />}
                  sx={{
                    backgroundColor: 'success.main',
                    color: 'success.contrastText',
                    '&:hover': { backgroundColor: 'success.dark' }
                  }}
                >
                  Paste
                </Button>
              )}
              <Button
                variant="contained"
                size="small"
                onClick={bulkShare}
                disabled={selectedFolders.size === 0 && selectedFiles.size === 0}
                startIcon={<Share />}
                sx={{
                  backgroundColor: 'info.main',
                  color: 'info.contrastText',
                  '&:hover': { backgroundColor: 'info.dark' }
                }}
              >
                Share
              </Button>
              <Button
                variant="contained"
                size="small"
                onClick={bulkCopy}
                disabled={selectedFolders.size === 0 && selectedFiles.size === 0}
                startIcon={<ContentCopy />}
                sx={{
                  backgroundColor: 'secondary.main',
                  color: 'secondary.contrastText',
                  '&:hover': { backgroundColor: 'secondary.dark' }
                }}
              >
                Copy
              </Button>
              <Button
                variant="contained"
                size="small"
                onClick={bulkCut}
                disabled={selectedFolders.size === 0 && selectedFiles.size === 0}
                startIcon={<ContentCut />}
                sx={{
                  backgroundColor: 'orange',
                  color: 'white',
                  '&:hover': { backgroundColor: 'darkorange' }
                }}
              >
                Cut
              </Button>
              <Button
                variant="contained"
                color="error"
                size="small"
                onClick={showDeleteConfirmation}
                disabled={selectedFolders.size === 0 && selectedFiles.size === 0}
                startIcon={<Delete />}
              >
                Delete
              </Button>
              <Button
                variant="outlined"
                size="small"
                onClick={clearAllSelections}
                sx={{
                  borderColor: 'rgba(255, 255, 255, 0.5)',
                  color: 'inherit',
                  '&:hover': {
                    borderColor: 'rgba(255, 255, 255, 0.8)',
                    backgroundColor: 'rgba(255, 255, 255, 0.1)'
                  }
                }}
              >
                Clear
              </Button>
            </Box>
          </Box>
        )}

        {/* File Table - shared between folder, recents, favorites, and shared view */}
        <FileTable
          folders={isRecentsView || isFavoritesView || isSharedView || (selectedTags && selectedTags.length > 0) ? [] : filteredFolders}
          files={filteredFiles}
          onFolderClick={setCurrentFolder}
          onFileClick={handleFormFileClick}
          onContextMenu={handleRightClick}
          onLongPressStart={handleLongPressStart}
          onLongPressEnd={handleLongPressEnd}
          onOpenMobileActionMenu={handleOpenMobileActionMenu}
          onToggleFavorite={handleToggleFavorite}
          userId={user?.uid}
          currentUserId={user?.uid}
          selectedFolders={selectedFolders}
          clipboardItem={clipboardItem}
          selectedFiles={selectedFiles}
          onToggleFolderSelection={toggleFolderSelection}
          onToggleFileSelection={toggleFileSelection}
          onMoveItem={handleMoveItem}
        />

        {/* Dialogs */}
        <NewFolderDialog
          open={newFolderDialogOpen}
          onClose={() => setNewFolderDialogOpen(false)}
          onCreate={handleCreateFolder}
        />

        {(fileToShare || folderToShare) && (
          <ShareDialog
            open={shareDialogOpen}
            onClose={() => setShareDialogOpen(false)}
            itemType={shareItemType}
            itemName={
              shareItemType === 'file' && fileToShare
                ? (typeof fileToShare.name === 'string' ? fileToShare.name : '[Encrypted]')
                : shareItemType === 'folder' && folderToShare
                ? (typeof folderToShare.name === 'string' ? folderToShare.name : '[Encrypted]')
                : ''
            }
            onShare={handleShare}
            onUnshare={handleUnshareFile}
            currentSharedWith={
              shareItemType === 'file' && fileToShare 
                ? (Array.isArray(fileToShare.sharedWith) ? fileToShare.sharedWith : [])
                : shareItemType === 'folder' && folderToShare
                ? (Array.isArray(folderToShare.sharedWith) ? folderToShare.sharedWith : [])
                : []
            }
          />
        )}

        {/* Tag Management Dialog */}
        <TagManagementDialog
          open={tagManagementOpen}
          onClose={() => setTagManagementOpen(false)}
          file={fileToManageTags}
          userId={user?.uid || ''}
          userPrivateKey={privateKey || ''}
          allFiles={files}
        />

        <ContextMenu
          open={!!contextMenu}
          mouseX={contextMenu?.mouseX ?? 0}
          mouseY={contextMenu?.mouseY ?? 0}
          itemType={contextMenu?.type ?? 'file'}
          onClose={() => setContextMenu(null)}
          onShare={() => {
            if (contextMenu?.item) {
              if (contextMenu.type === 'file') {
                setFileToShare(contextMenu.item as FileData);
                setFolderToShare(null);
              } else {
                setFolderToShare(contextMenu.item as FolderData);
                setFileToShare(null);
              }
              setShareItemType(contextMenu.type);
              setShareDialogOpen(true);
              setContextMenu(null);
            }
          }}
          onManageTags={() => {
            if (contextMenu?.item && contextMenu.type === 'file') {
              setFileToManageTags(contextMenu.item as FileData);
              setTagManagementOpen(true);
            }
            setContextMenu(null);
          }}
          onRename={() => {
            if (contextMenu?.item) {
              const name = typeof contextMenu.item.name === 'string' ? contextMenu.item.name : '';
              setRenameDialog({ open: true, item: contextMenu.item, type: contextMenu.type, currentName: name });
              setContextMenu(null);
            }
          }}
          onCut={() => {
            if (contextMenu?.item) {
              cutItem(contextMenu.type, contextMenu.item);
              setContextMenu(null);
            }
          }}
          onCopy={() => {
            if (contextMenu?.item) {
              copyItem(contextMenu.type, contextMenu.item);
              setContextMenu(null);
            }
          }}
          onDelete={() => {
            if (contextMenu?.item) {
              showSingleDeleteConfirmation(contextMenu.item, contextMenu.type);
            }
          }}
          onEditForm={contextMenu?.type === 'file' && isFormFile(typeof contextMenu.item.name === 'string' ? contextMenu.item.name : '') ? handleEditForm : undefined}
        />

        <MobileActionMenu
          open={mobileActionMenu.open}
          onClose={() => setMobileActionMenu({ open: false, item: null, type: 'file' })}
          itemName={
            mobileActionMenu.item && typeof mobileActionMenu.item.name === 'string' 
              ? mobileActionMenu.item.name 
              : '[Encrypted]'
          }
          itemType={mobileActionMenu.type}
          onOpen={mobileActionMenu.type === 'file' && mobileActionMenu.item ? () => {
            handleFormFileClick(mobileActionMenu.item as FileData);
            setMobileActionMenu({ open: false, item: null, type: 'file' });
          } : undefined}
          onDownload={mobileActionMenu.type === 'file' && mobileActionMenu.item && user && privateKey ? async () => {
            const file = mobileActionMenu.item as FileData;
            try {
              const content = await FileAccessService.loadFileContent(file, user.uid, privateKey);
              const fileName = typeof file.name === 'string' ? file.name : `file_${file.id}`;
              const blob = new Blob([content]);
              const url = URL.createObjectURL(blob);
              
              const link = document.createElement('a');
              link.href = url;
              link.download = fileName;
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
              
              URL.revokeObjectURL(url);
            } catch (error) {
              console.error('Error downloading file:', error);
                    }
            setMobileActionMenu({ open: false, item: null, type: 'file' });
          } : undefined}
          onShare={() => {
            if (mobileActionMenu.item) {
              if (mobileActionMenu.type === 'file') {
                setFileToShare(mobileActionMenu.item as FileData);
                setFolderToShare(null);
              } else {
                setFolderToShare(mobileActionMenu.item as FolderData);
                setFileToShare(null);
              }
              setShareItemType(mobileActionMenu.type);
              setShareDialogOpen(true);
              setMobileActionMenu({ open: false, item: null, type: 'file' });
            }
          }}
          onRename={() => {
            if (mobileActionMenu.item) {
              const name = typeof mobileActionMenu.item.name === 'string' ? mobileActionMenu.item.name : '';
              setRenameDialog({ open: true, item: mobileActionMenu.item, type: mobileActionMenu.type, currentName: name });
              setMobileActionMenu({ open: false, item: null, type: 'file' });
            }
          }}
          onCut={() => {
            if (mobileActionMenu.item) {
              cutItem(mobileActionMenu.type, mobileActionMenu.item);
              setMobileActionMenu({ open: false, item: null, type: 'file' });
            }
          }}
          onCopy={() => {
            if (mobileActionMenu.item) {
              copyItem(mobileActionMenu.type, mobileActionMenu.item);
              setMobileActionMenu({ open: false, item: null, type: 'file' });
            }
          }}
          onManageTags={mobileActionMenu.type === 'file' && mobileActionMenu.item ? () => {
            setFileToManageTags(mobileActionMenu.item as FileData);
            setTagManagementOpen(true);
            setMobileActionMenu({ open: false, item: null, type: 'file' });
          } : undefined}
          onDelete={() => {
            if (mobileActionMenu.item) {
              showSingleDeleteConfirmation(mobileActionMenu.item, mobileActionMenu.type);
            }
          }}
        />

        <RenameDialog
          open={renameDialog.open}
          onClose={() => setRenameDialog({ open: false, item: null, type: 'file', currentName: '' })}
          onRename={async (newName: string) => {
            if (renameDialog.item) {
              try {
                if (renameDialog.type === 'file') {
                  const fileData = renameDialog.item as FileData;

                  // Use the new per-user names service to set personalized name
                  const { setUserFileName } = await import('../services/userNamesManagement');
                  await setUserFileName(
                    renameDialog.item.id!,
                    newName,
                    user.uid,
                    privateKey,
                    fileData
                  );

                  // Invalidate cache since filename changed
                  metadataCache.invalidate(renameDialog.item.id!);
                } else {
                  await renameFolderWithEncryption(renameDialog.item.id!, newName, user?.uid || '');
                  // Invalidate cache since folder name changed
                  metadataCache.invalidate(renameDialog.item.id!);
                }
                setRenameDialog({ open: false, item: null, type: 'file', currentName: '' });
              } catch (error) {
                console.error('Rename operation failed:', error);
              }
            }
          }}
          currentName={renameDialog.currentName}
          itemType={renameDialog.type}
        />

        {selectedFormFile && formViewerOpen && (
          <>
            <FormFileViewer
              file={selectedFormFile}
              userId={user?.uid || ''}
              privateKey={privateKey || ''}
              onEdit={handleEditForm}
              onClose={handleFormCancel}
              onDownload={handleDownloadFormFile}
              onShare={() => {
                // Find the most up-to-date file data from the files array
                const currentFile = files.find(f => f.id === selectedFormFile?.id) || selectedFormFile;
                setFileToShare(currentFile);
                setFolderToShare(null);
                setShareItemType('file');
                setShareDialogOpen(true);
              }}
            />

            {formEditorOpen && selectedFormFileData && (
              <FormInstanceFiller
                userId={user?.uid || ''}
                privateKey={privateKey || ''}
                parentFolder={currentFolder}
                existingFormData={selectedFormFileData}
                existingFile={selectedFormFile}
                onSave={handleFormSave}
                onCancel={handleFormCancel}
              />
            )}

          </>
        )}

        {/* File Viewer for regular files */}
        <FileViewer
          open={fileViewerOpen}
          file={selectedFile}
          fileContent={fileContent}
          loading={fileContentLoading}
          onClose={handleCloseFileViewer}
          onDownload={handleDownloadFile}
          userId={user?.uid || ''}
          onShare={() => {
            if (selectedFile) {
              setShareDialogFile(selectedFile);
              setShareDialogOpen(true);
            }
          }}
        />

        {/* FormInstanceFiller for both new and existing forms */}
        {formFillerOpen && (
          <FormInstanceFiller
            userId={user?.uid || ''}
            privateKey={privateKey || ''}
            parentFolder={currentFolder}
            existingFormData={selectedFormData}
            existingFile={selectedFormFile}
            onSave={handleFormSave}
            onCancel={handleFormCancel}
          />
        )}

        <FormBuilder
          open={formBuilderOpen}
          onClose={() => setFormBuilderOpen(false)}
          userId={user?.uid || ''}
          privateKey={privateKey || ''}
          parentFolder={currentFolder}
          initialTemplateId={searchParams.get('createForm') || undefined}
          onFormCreated={async (fileId: string | null, formData?: SecureFormData) => {
            setFormBuilderOpen(false);
            
            if (formData && !fileId) {
              // New behavior: Open form editor with unsaved form data
              setUnsavedFormData(formData);
              setFormEditorOpen(true);
            } else if (fileId) {
              // Old behavior: Open existing saved form
              setTimeout(() => {
                handleFormFileClick({ id: fileId });
              }, 500);
            }
          }}
        />


        {formEditorOpen && unsavedFormData && (
          <FormInstanceFiller
            userId={user?.uid || ''}
            privateKey={privateKey || ''}
            parentFolder={currentFolder}
            existingFormData={unsavedFormData}
            onSave={() => {
              setFormEditorOpen(false);
              setUnsavedFormData(null);
              // Real-time listeners will automatically show the newly saved form
            }}
            onCancel={() => {
              setFormEditorOpen(false);
              setUnsavedFormData(null);
            }}
          />
        )}

        {!isRecentsView && !isFavoritesView && !isSharedView && (
          <CreationFAB
            onCreateFolder={() => setNewFolderDialogOpen(true)}
            onUploadFiles={handleUploadClick}
            onCreateForm={() => {
              setFormBuilderOpen(true);
            }}
            onCreateChat={() => {
              navigate('/chat', { state: { openNewChatDialog: true } });
            }}
            onPaste={handlePaste}
            showPaste={!!clipboardItem}
          />
        )}

        {/* Delete Confirmation Dialog */}
        <Dialog open={deleteConfirmOpen} onClose={() => setDeleteConfirmOpen(false)}>
          <DialogTitle>Confirm Delete</DialogTitle>
          <DialogContent>
            <DialogContentText>
              Are you sure you want to delete {selectedFolders.size} folder{selectedFolders.size !== 1 ? 's' : ''} and {selectedFiles.size} file{selectedFiles.size !== 1 ? 's' : ''}?
              <br /><br />
              This action cannot be undone.
            </DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDeleteConfirmOpen(false)}>
              Cancel
            </Button>
            <Button onClick={confirmBulkDelete} color="error" variant="contained">
              Delete
            </Button>
          </DialogActions>
        </Dialog>

        {/* Single Item Delete Confirmation Dialog */}
        <Dialog open={singleDeleteConfirmOpen} onClose={() => setSingleDeleteConfirmOpen(false)}>
          <DialogTitle>
            {itemToDelete?.type === 'file' && (itemToDelete.item as FileData).owner !== user?.uid
              ? 'Remove File Access'
              : 'Confirm Delete'}
          </DialogTitle>
          <DialogContent>
            <DialogContentText>
              {itemToDelete?.type === 'file' && (itemToDelete.item as FileData).owner !== user?.uid ? (
                <>
                  Remove your access to this shared file?
                  <br />
                  <strong>{itemToDelete && typeof itemToDelete.item.name === 'string' ? itemToDelete.item.name : '[Encrypted]'}</strong>
                  <br /><br />
                  The file will remain available to other users who have access.
                </>
              ) : (
                <>
                  Are you sure you want to delete this {itemToDelete?.type}?
                  <br />
                  <strong>{itemToDelete && typeof itemToDelete.item.name === 'string' ? itemToDelete.item.name : '[Encrypted]'}</strong>
                  <br /><br />
                  This action cannot be undone.
                </>
              )}
            </DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setSingleDeleteConfirmOpen(false)}>
              Cancel
            </Button>
            <Button onClick={confirmSingleDelete} color="error" variant="contained">
              {itemToDelete?.type === 'file' && (itemToDelete.item as FileData).owner !== user?.uid
                ? 'Remove Access'
                : 'Delete'}
            </Button>
          </DialogActions>
        </Dialog>

        {/* Copy Options Dialog */}
        <Dialog 
          open={copyOptionsOpen} 
          onClose={() => {
            setCopyOptionsOpen(false);
            setItemToCopy(null);
            setPreserveSharing(false);
          }}
        >
          <DialogTitle>Copy Options</DialogTitle>
          <DialogContent>
            <DialogContentText>
              How would you like to copy this {itemToCopy?.type}?
              <br />
              <strong>{itemToCopy && typeof itemToCopy.item.name === 'string' ? itemToCopy.item.name : '[Encrypted]'}</strong>
            </DialogContentText>
            <FormControlLabel
              control={
                <Checkbox
                  checked={preserveSharing}
                  onChange={(e) => setPreserveSharing(e.target.checked)}
                />
              }
              label="Preserve sharing permissions (copy will be shared with the same users)"
              sx={{ mt: 2 }}
            />
          </DialogContent>
          <DialogActions>
            <Button
              onClick={() => {
                setCopyOptionsOpen(false);
                setItemToCopy(null);
                setPreserveSharing(false);
                clearClipboard(); // Clear clipboard when user cancels
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={async () => {
                try {
                  if (itemToCopy) {
                    if (itemToCopy.type === 'file') {
                      await copyFile(itemToCopy.item as FileData, preserveSharing);
                    } else {
                      await copyFolder(itemToCopy.item as FolderData);
                    }
                  }
                  // Clear clipboard only after successful completion
                  clearClipboard();
                } catch (error) {
                  console.error('Copy operation failed:', error);
                  // Don't clear clipboard if copy failed
                } finally {
                  setCopyOptionsOpen(false);
                  setItemToCopy(null);
                  setPreserveSharing(false);
                }
              }}
              color="primary"
              variant="contained"
            >
              Copy
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    </FileUploadArea>
  );
};

const MainContent = forwardRef<MainContentRef, MainContentProps>(MainContentComponent);

MainContent.displayName = 'MainContent';

export default MainContent;