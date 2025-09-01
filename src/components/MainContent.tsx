import React, { useState, useEffect, useMemo, forwardRef, useImperativeHandle } from 'react';
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
} from '@mui/material';
import { 
  AccessTime,
  Clear,
  Delete,
  Star,
  Share,
} from '@mui/icons-material';
import { useAuth } from '../auth/AuthContext';
import { usePassphrase } from '../auth/PassphraseContext';
import { useClipboard } from '../context/ClipboardContext';
import { useGlobalLoading } from '../context/LoadingContext';
import { useRecents } from '../context/RecentsContext';
import { useFolders } from '../hooks/useFolders';
import { 
  createFolder, 
  getUserProfile, 
  getUserByEmail, 
  updateFolder, 
  deleteFolder, 
  addSharingHistory, 
  shareFolder,
  renameFolderWithEncryption,
  type Folder as FolderData 
} from '../firestore';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { encryptData, decryptData, hexToBytes as hpkeHexToBytes, bytesToHex as hpkeBytesToHex, encryptForMultipleRecipients } from '../crypto/hpkeCrypto';
import { encryptMetadata } from '../crypto/postQuantumCrypto';
import { decryptFileMetadata, encryptWithPostQuantum } from '../crypto/migration';
import { updateFile, deleteFile, type FileData } from '../files';
import { isFormFile, toggleFormFavorite, type SecureFormData } from '../utils/formFiles';
import { FileAccessService } from '../services/fileAccess';

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
import FormFileEditor from './FormFileEditor';
import FormInstanceFiller from './FormInstanceFiller';
import FormBuilder from './FormBuilder';
import FormTemplateDesigner from './FormTemplateDesigner';
import CreationFAB from './CreationFAB';
import FileViewer from './FileViewer';

interface MainContentProps {
  currentFolder: string | null;
  setCurrentFolder: (folderId: string | null) => void;
}

interface MainContentRef {
  openTemplateDesigner: () => void;
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

const MainContent = forwardRef<MainContentRef, MainContentProps>(function MainContentComponent({ currentFolder, setCurrentFolder }, ref) {
  const { user } = useAuth();
  const { privateKey } = usePassphrase();
  const { clipboardItem, cutItem, copyItem, clearClipboard } = useClipboard();
  const { setIsDataLoading } = useGlobalLoading();
  const { isRecentsView, setIsRecentsView, isFavoritesView, setIsFavoritesView, isSharedView, setIsSharedView, addRecentItem, recentItems, clearRecents } = useRecents();
  const { getFoldersByParent, buildFolderPath } = useFolders();
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
  const [itemToDelete, setItemToDelete] = useState<{ item: FileData | FolderData; type: 'file' | 'folder' } | null>(null);


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
      setTemplateDesignerOpen(false);
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
  const [templateDesignerOpen, setTemplateDesignerOpen] = useState(false);
  const [formEditorOpen, setFormEditorOpen] = useState(false);
  const [unsavedFormData, setUnsavedFormData] = useState<SecureFormData | null>(null);
  const [formViewerOpen, setFormViewerOpen] = useState(false);
  const [formFillerOpen, setFormFillerOpen] = useState(false);

  // Expose methods to parent component via ref
  useImperativeHandle(ref, () => ({
    openTemplateDesigner: () => {
      setTemplateDesignerOpen(true);
    }
  }));
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

  // Search functionality - simplified to current folder only
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
            const privateKeyBytes = hexToBytes(privateKey);
            const keyData = hexToBytes(userEncryptedKey);
            
            // HPKE encrypted keys contain: encapsulated_key (32 bytes) + ciphertext  
            const encapsulatedKey = keyData.slice(0, 32);
            const ciphertext = keyData.slice(32);
            
            const fileKey = await decryptData(
              { encapsulatedKey, ciphertext },
              privateKeyBytes
            );
            
            let iv, ciphertextData;
            if (encryptedContent.byteLength > 12) {
              iv = encryptedContent.slice(0, 12);
              ciphertextData = encryptedContent.slice(12);
            } else {
              continue;
            }
            
            const key = await crypto.subtle.importKey('raw', fileKey, { name: 'AES-GCM' }, false, ['decrypt']);
            const decryptedContentBuffer = await crypto.subtle.decrypt(
              { name: 'AES-GCM', iv: iv }, 
              key, 
              ciphertextData
            );
            
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

  // Filter files based on search
  const filteredFolders = useMemo(() => {
    if (!searchQuery.trim()) {
      return folders;
    }
    return folders.filter(folder => {
      const folderName = typeof folder.name === 'string' ? folder.name.toLowerCase() : '';
      return folderName.includes(searchQuery.toLowerCase());
    });
  }, [folders, searchQuery]);

  // Update filtered files when search query or files change
  useEffect(() => {
    let isMounted = true;
    
    const updateFilteredFiles = async () => {
      if (!searchQuery.trim()) {
        if (isMounted) {
          setFilteredFiles(files);
        }
        return;
      }

      try {
        const matchingFiles = await searchItems(files, searchQuery);
        if (isMounted) {
          setFilteredFiles(matchingFiles);
        }
      } catch (error) {
        console.error('Search error:', error);
        if (isMounted) {
          setFilteredFiles([]);
        }
      }
    };
    
    updateFilteredFiles();

    return () => {
      isMounted = false;
    };
  }, [files, searchQuery, user?.uid, privateKey]);

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

      // Delete files - need to also delete from storage
      if (selectedFiles.size > 0) {
        const { deleteDoc, doc } = await import('firebase/firestore');
        const { deleteObject, ref } = await import('firebase/storage');
        const { db } = await import('../firebase');
        const { storage } = await import('../firebase');
        
        // Get file documents first to get storage paths
        const fileDocs = await Promise.all(
          Array.from(selectedFiles).map(async (fileId) => {
            const { getDoc } = await import('firebase/firestore');
            const docSnap = await getDoc(doc(db, 'files', fileId));
            return { id: fileId, data: docSnap.data() };
          })
        );

        // Delete from storage and firestore
        const filePromises = fileDocs.map(async (fileDoc) => {
          const promises = [];
          
          // Delete from firestore
          promises.push(deleteDoc(doc(db, 'files', fileDoc.id)).then(() => {
          }));
          
          // Delete from storage if storagePath exists
          if (fileDoc.data?.storagePath) {
            promises.push(deleteObject(ref(storage, fileDoc.data.storagePath)).then(() => {
            }).catch((error) => {
              console.warn(`Failed to delete storage file ${fileDoc.data.storagePath}:`, error);
              // Don't fail the entire operation if storage deletion fails
            }));
          }
          
          return Promise.all(promises);
        });
        
        promises.push(...filePromises);
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
      alert('Some items could not be deleted. Please try again.');
    }
  };

  const showSingleDeleteConfirmation = (item: FileData | FolderData, type: 'file' | 'folder') => {
    setItemToDelete({ item, type });
    setSingleDeleteConfirmOpen(true);
  };

  const confirmSingleDelete = async () => {
    if (!itemToDelete) return;
    
    setSingleDeleteConfirmOpen(false);
    
    try {
      if (itemToDelete.type === 'file') {
        await deleteFile(itemToDelete.item.id!);
      } else {
        await deleteFolder(itemToDelete.item.id!);
      }
      
      // Clear any open menus
      setContextMenu(null);
      setMobileActionMenu({ open: false, item: null, type: 'file' });
      
    } catch (error) {
      console.error('Delete operation failed:', error);
      alert('Delete operation failed: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setItemToDelete(null);
    }
  };

  const bulkUnshare = async () => {
    const totalFiles = selectedFiles.size;
    if (!user || totalFiles === 0) return;

    const confirmUnshare = window.confirm(
      `Are you sure you want to unshare ${totalFiles} file${totalFiles !== 1 ? 's' : ''}? This will revoke access for all shared users.`
    );

    if (!confirmUnshare) return;

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
      alert('Some files could not be unshared. Please try again.');
    }
  };

  // Load files for current folder
  useEffect(() => {
    if (!user || isRecentsView || isFavoritesView || isSharedView) {
      setLoading(false);
      setIsDataLoading(false);
      return;
    }

    setLoading(true);
    setIsDataLoading(true);
    
    // Query for files owned by user
    const ownedFilesQuery = query(
      collection(db, 'files'),
      where('parent', '==', currentFolder),
      where('owner', '==', user.uid)
    );

    // Query for files shared with user (with error handling for missing sharedWith field)
    const sharedFilesQuery = query(
      collection(db, 'files'),
      where('parent', '==', currentFolder),
      where('sharedWith', 'array-contains', user.uid)
    );

    const filesMap = new Map<string, FileData>();
    let completedQueries = 0;
    let totalQueries = 2;
    let ownedQuerySuccess = false;
    let sharedQuerySuccess = false;
    
    // Skip shared files query if user is in root folder and has no shared files
    // This helps avoid permission errors when no shared files exist
    let skipSharedQuery = false;

    const processQueryResults = async (snapshot: any, queryName: string) => {
      for (const doc of snapshot.docs) {
        const data = doc.data();

        if (!data.encryptedKeys || !data.encryptedKeys[user.uid]) {
          filesMap.set(doc.id, { ...data, id: doc.id, name: '[No Access]', size: '' });
          continue;
        }

        try {
          const userEncryptedKey = data.encryptedKeys[user.uid];
          if (!userEncryptedKey || !privateKey) {
            filesMap.set(doc.id, { ...data, id: doc.id, name: '[No Access]', size: '' });
            continue;
          }
          const privateKeyBytes = hexToBytes(privateKey);
          const keyData = hexToBytes(userEncryptedKey);
          
          // HPKE encrypted keys contain: encapsulated_key (32 bytes) + ciphertext  
          const encapsulatedKey = keyData.slice(0, 32);
          const ciphertext = keyData.slice(32);
          
          const sharedSecret = await decryptData(
            { encapsulatedKey, ciphertext },
            privateKeyBytes
          );

          const decryptedName = await decryptFileMetadata(data.name, sharedSecret);
          const decryptedSize = await decryptFileMetadata(data.size, sharedSecret);
          filesMap.set(doc.id, { ...data, id: doc.id, name: decryptedName, size: decryptedSize });
        } catch (error) {
          console.error('Error decrypting file metadata:', error);
          filesMap.set(doc.id, { ...data, id: doc.id, name: '[Encrypted File]', size: '' });
        }
      }

      completedQueries++;
      
      // Update UI immediately with current files
      const finalFiles = Array.from(filesMap.values());
      setFiles(finalFiles);
      setFilteredFiles(finalFiles);
      
      if (completedQueries === totalQueries) {
        setLoading(false);
        setIsDataLoading(false);
      }
    };

    const handleError = (error: any, queryName: string) => {
      console.warn(`${queryName} query failed (this is normal if no shared files exist):`, error.message);
      
      // Mark this query as failed but continue
      if (queryName === 'SharedFiles') {
        sharedQuerySuccess = false;
      } else {
        ownedQuerySuccess = false;
      }
      
      completedQueries++;
      
      // Update UI immediately with current files
      const finalFiles = Array.from(filesMap.values());
      setFiles(finalFiles);
      setFilteredFiles(finalFiles);
      
      if (completedQueries === totalQueries) {
        setLoading(false);
        setIsDataLoading(false);
      }
    };

    // Start both queries
    const unsubscribe1 = onSnapshot(
      ownedFilesQuery,
      (snapshot) => {
        ownedQuerySuccess = true;
        processQueryResults(snapshot, 'OwnedFiles');
      },
      (error) => handleError(error, 'OwnedFiles')
    );

    // Skip SharedFiles query for now to avoid permission errors
    // This can be re-enabled later when sharing functionality is needed
    let unsubscribe2: (() => void) | null = null;
    
    // Manually handle the SharedFiles query completion
    totalQueries = 1; // Only count the owned files query
    sharedQuerySuccess = true; // Mark as "successful" (skipped)

    return () => {
      unsubscribe1();
      if (unsubscribe2) {
        unsubscribe2();
      }
    };
  }, [currentFolder, user, privateKey, isRecentsView, isFavoritesView, isSharedView]);

  // Load recent files when in recents view
  useEffect(() => {
    if (!isRecentsView || !user || !privateKey) {
      return;
    }

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
      return;
    }

    setLoading(true);
    setIsDataLoading(true);

    // Query for favorite files owned by user
    const ownedFavoritesQuery = query(
      collection(db, 'files'),
      where('owner', '==', user.uid),
      where('isFavorite', '==', true)
    );

    // Query for favorite files shared with user
    const sharedFavoritesQuery = query(
      collection(db, 'files'),
      where('sharedWith', 'array-contains', user.uid),
      where('isFavorite', '==', true)
    );

    const favoritesMap = new Map<string, FileData>();
    let completedQueries = 0;
    const totalQueries = 1; // Only count the owned files query

    const processFavoritesResults = async (snapshot: any, queryName: string) => {
      for (const doc of snapshot.docs) {
        const data = doc.data();

        if (!data.encryptedKeys || !data.encryptedKeys[user.uid]) {
          favoritesMap.set(doc.id, { ...data, id: doc.id, name: '[No Access]', size: '' });
          continue;
        }

        try {
          const userEncryptedKey = data.encryptedKeys[user.uid];
          if (!userEncryptedKey || !privateKey) {
            favoritesMap.set(doc.id, { ...data, id: doc.id, name: '[No Access]', size: '' });
            continue;
          }
          const privateKeyBytes = hexToBytes(privateKey);
          const keyData = hexToBytes(userEncryptedKey);
          
          // HPKE encrypted keys contain: encapsulated_key (32 bytes) + ciphertext  
          const encapsulatedKey = keyData.slice(0, 32);
          const ciphertext = keyData.slice(32);
          
          const sharedSecret = await decryptData(
            { encapsulatedKey, ciphertext },
            privateKeyBytes
          );

          const decryptedName = await decryptFileMetadata(data.name, sharedSecret);
          const decryptedSize = await decryptFileMetadata(data.size, sharedSecret);
          favoritesMap.set(doc.id, { ...data, id: doc.id, name: decryptedName, size: decryptedSize });
        } catch (error) {
          console.error('Error decrypting favorite file metadata:', error);
          favoritesMap.set(doc.id, { ...data, id: doc.id, name: '[Encrypted File]', size: '' });
        }
      }

      completedQueries++;
      
      // Update UI immediately with current files
      const finalFiles = Array.from(favoritesMap.values());
      setFiles(finalFiles);
      setFilteredFiles(finalFiles);
      
      if (completedQueries === totalQueries) {
        setLoading(false);
        setIsDataLoading(false);
      }
    };

    const handleFavoritesError = (error: any, queryName: string) => {
      console.warn(`${queryName} query failed:`, error.message);
      
      completedQueries++;
      
      // Update UI immediately with current files
      const finalFiles = Array.from(favoritesMap.values());
      setFiles(finalFiles);
      setFilteredFiles(finalFiles);
      
      if (completedQueries === totalQueries) {
        setLoading(false);
        setIsDataLoading(false);
      }
    };

    // Start both queries
    const unsubscribe1 = onSnapshot(
      ownedFavoritesQuery,
      (snapshot) => {
        processFavoritesResults(snapshot, 'OwnedFavorites');
      },
      (error) => handleFavoritesError(error, 'OwnedFavorites')
    );

    // Skip shared favorites query for now to avoid permission errors
    const unsubscribe2: (() => void) | null = null;

    return () => {
      unsubscribe1();
      if (unsubscribe2) {
        unsubscribe2();
      }
    };
  }, [isFavoritesView, user, privateKey]);

  // Load shared files when in shared view
  useEffect(() => {
    if (!isSharedView || !user || !privateKey) {
      return;
    }

    setLoading(true);
    setIsDataLoading(true);

    // Query for files shared with user (but not owned by them)
    const sharedFilesQuery = query(
      collection(db, 'files'),
      where('sharedWith', 'array-contains', user.uid)
    );

    const sharedFilesMap = new Map<string, FileData>();

    const processSharedResults = async (snapshot: any) => {
      for (const doc of snapshot.docs) {
        const data = doc.data();

        // Skip files owned by this user (they'll see those in regular folder view)
        if (data.owner === user.uid) {
          continue;
        }

        if (!data.encryptedKeys || !data.encryptedKeys[user.uid]) {
          sharedFilesMap.set(doc.id, { ...data, id: doc.id, name: '[No Access]', size: '' });
          continue;
        }

        try {
          const userEncryptedKey = data.encryptedKeys[user.uid];
          if (!userEncryptedKey || !privateKey) {
            sharedFilesMap.set(doc.id, { ...data, id: doc.id, name: '[No Access]', size: '' });
            continue;
          }
          const privateKeyBytes = hexToBytes(privateKey);
          const keyData = hexToBytes(userEncryptedKey);
          
          // HPKE encrypted keys contain: encapsulated_key (32 bytes) + ciphertext  
          const encapsulatedKey = keyData.slice(0, 32);
          const ciphertext = keyData.slice(32);
          
          const sharedSecret = await decryptData(
            { encapsulatedKey, ciphertext },
            privateKeyBytes
          );

          const decryptedName = await decryptFileMetadata(data.name, sharedSecret);
          const decryptedSize = await decryptFileMetadata(data.size, sharedSecret);
          sharedFilesMap.set(doc.id, { ...data, id: doc.id, name: decryptedName, size: decryptedSize });
        } catch (error) {
          console.error('Error decrypting shared file metadata:', error);
          sharedFilesMap.set(doc.id, { ...data, id: doc.id, name: '[Encrypted File]', size: '' });
        }
      }

      // Update UI with shared files
      const finalFiles = Array.from(sharedFilesMap.values());
      setFiles(finalFiles);
      setFilteredFiles(finalFiles);
      setLoading(false);
      setIsDataLoading(false);
    };

    const handleSharedError = (error: any) => {
      console.warn('Shared files query failed:', error.message);
      setFiles([]);
      setFilteredFiles([]);
      setLoading(false);
      setIsDataLoading(false);
    };

    const unsubscribe = onSnapshot(
      sharedFilesQuery,
      processSharedResults,
      handleSharedError
    );

    return () => {
      unsubscribe();
    };
  }, [isSharedView, user, privateKey]);

  // Event handlers
  const handleCreateFolder = async (name: string) => {
    if (!user) return;
    await createFolder(user.uid, name, currentFolder);
    setNewFolderDialogOpen(false);
  };

  const handleFormFileClick = async (fileInfo: FileData | { id: string; name?: string; parent?: string | null }) => {
    // Don't allow file operations if private key isn't available
    if (!user || !privateKey) {
      console.warn('Cannot open file: User or private key not available');
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
        alert(`Failed to open file: ${error}`);
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
      alert('Failed to download file');
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
      alert('Failed to download form file');
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
      alert('Failed to load form for editing');
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

  const handlePaste = async () => {
    if (!clipboardItem || !user) return;

    try {
      if (clipboardItem.type === 'folder') {
        const folder = clipboardItem.item as FolderData;
        
        if (cutItem) {
          await updateFolder(folder.id!, { parent: currentFolder });
          clearClipboard();
        } else if (copyItem) {
          // Copy folder logic would go here
          alert('Folder copy not yet implemented');
        }
      } else if (clipboardItem.type === 'file') {
        const file = clipboardItem.item as FileData;
        
        if (cutItem) {
          await updateFile(file.id!, { parent: currentFolder });
          clearClipboard();
        } else if (copyItem) {
          alert('File copy not yet implemented');
        }
      }
    } catch (error) {
      console.error('Paste operation failed:', error);
      alert('Paste operation failed');
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
    if (!user || !privateKey) return;
    
    try {
      await toggleFormFavorite(fileId, privateKey, user.uid);
      // The UI will update automatically through the real-time listeners
    } catch (error) {
      console.error('Error toggling favorite:', error);
      alert('Failed to toggle favorite status');
    }
  };

  const handleShareFile = async (recipients: string[]) => {
    if (!user || !privateKey || !fileToShare || recipients.length === 0) {
      console.error('Missing required parameters for sharing:', { user: !!user, privateKey: !!privateKey, fileToShare: !!fileToShare, recipients });
      return;
    }

    try {
      const recipientData: { id: string; encryptedKey: string }[] = [];

      // Process each recipient by creating their key exchange
      for (const email of recipients) {
        try {
          const recipient = await getUserByEmail(email);
          if (!recipient || !recipient.profile.publicKey) {
            console.warn(`User ${email} not found or does not have a public key`);
            alert(`User ${email} not found or does not have encryption keys set up.`);
            continue;
          }

          // Skip if already shared with this user
          if (fileToShare.sharedWith.includes(recipient.id)) {
            console.log(`File already shared with ${email}`);
            continue;
          }

          // For now, only support sharing legacy ML-KEM768 files
          // TODO: Implement proper HPKE file sharing architecture
          const ownerEncryptedKey = fileToShare.encryptedKeys[user.uid];
          if (!ownerEncryptedKey) {
            throw new Error('Owner encrypted key not found');
          }

          // HPKE file sharing - decrypt the file key and re-encrypt for recipient
          const ownerPrivateKey = hexToBytes(privateKey);
          const keyData = hexToBytes(ownerEncryptedKey);
          
          // HPKE encrypted keys contain: encapsulated_key (32 bytes) + ciphertext  
          const encapsulatedKey = keyData.slice(0, 32);
          const ciphertext = keyData.slice(32);
          
          // Decrypt the file key using owner's private key
          const fileKey = await decryptData(
            { encapsulatedKey, ciphertext },
            ownerPrivateKey
          );

          // Encrypt the file key for the recipient using HPKE
          const recipientPublicKey = hexToBytes(recipient.profile.publicKey);
          const encryptedKeyForRecipient = await encryptData(fileKey, recipientPublicKey);
          
          // Combine encapsulated key and ciphertext for storage
          const recipientKeyData = new Uint8Array(
            encryptedKeyForRecipient.encapsulatedKey.length + 
            encryptedKeyForRecipient.ciphertext.length
          );
          recipientKeyData.set(encryptedKeyForRecipient.encapsulatedKey, 0);
          recipientKeyData.set(
            encryptedKeyForRecipient.ciphertext, 
            encryptedKeyForRecipient.encapsulatedKey.length
          );

          recipientData.push({
            id: recipient.id,
            encryptedKey: bytesToHex(recipientKeyData)
          });

        } catch (error) {
          console.error(`Error processing recipient ${email}:`, error);
          alert(`Failed to process recipient ${email}. ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      if (recipientData.length === 0) {
        alert('No valid recipients found');
        return;
      }

      // Update the file document
      const updates: any = {
        sharedWith: [...new Set([...fileToShare.sharedWith, ...recipientData.map(r => r.id)])],
        lastModified: new Date().toISOString(),
      };

      // Add encrypted keys for each recipient
      recipientData.forEach(({ id, encryptedKey }) => {
        updates[`encryptedKeys.${id}`] = encryptedKey;
      });

      await updateFile(fileToShare.id!, updates);

      // Add to sharing history
      const historyPromises = recipients.map(email => 
        addSharingHistory(user.uid, email, 'user')
      );
      await Promise.all(historyPromises);

      alert(`File shared with ${recipientData.length} recipient${recipientData.length !== 1 ? 's' : ''}`);
      setShareDialogOpen(false);
      
    } catch (error) {
      console.error('Failed to share file:', error);
      alert(`Failed to share file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  return (
    <FileUploadArea
      currentFolder={currentFolder}
      privateKey={privateKey || ''}
      onUploadComplete={() => {
        // Files will refresh automatically via the snapshot listener
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
                flexDirection: isMobile ? 'column' : 'row',
                alignItems: isMobile ? 'stretch' : 'center',
                gap: 1,
                width: isMobile ? '100%' : 'auto'
              }}>
                <SearchBar
                  searchQuery={searchQuery}
                  onSearchChange={setSearchQuery}
                />
              </Box>
            </Box>
          </>
        )}

        {/* Bulk Operations Toolbar */}
        {(selectedFolders.size > 0 || selectedFiles.size > 0) && (
          <Box sx={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'space-between',
            backgroundColor: 'rgba(25, 118, 210, 0.08)',
            border: '1px solid rgba(25, 118, 210, 0.2)',
            borderRadius: 1,
            p: 2,
            mb: 2
          }}>
            <Typography variant="body2" color="primary">
              {selectedFolders.size} folder{selectedFolders.size !== 1 ? 's' : ''} and {selectedFiles.size} file{selectedFiles.size !== 1 ? 's' : ''} selected
            </Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                variant="outlined"
                size="small"
                onClick={selectAll}
              >
                Select All
              </Button>
              {selectedFiles.size > 0 && (
                <Button
                  variant="outlined"
                  color="warning"
                  size="small"
                  onClick={bulkUnshare}
                  startIcon={<Clear />}
                >
                  Unshare
                </Button>
              )}
              <Button
                variant="outlined"
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
              >
                Clear
              </Button>
            </Box>
          </Box>
        )}

        {/* File Table - shared between folder, recents, favorites, and shared view */}
        <FileTable
          folders={isRecentsView || isFavoritesView || isSharedView ? [] : filteredFolders}
          files={filteredFiles}
          onFolderClick={setCurrentFolder}
          onFileClick={handleFormFileClick}
          onContextMenu={handleRightClick}
          onLongPressStart={handleLongPressStart}
          onLongPressEnd={handleLongPressEnd}
          onOpenMobileActionMenu={handleOpenMobileActionMenu}
          onToggleFavorite={handleToggleFavorite}
          selectedFolders={selectedFolders}
          selectedFiles={selectedFiles}
          onToggleFolderSelection={toggleFolderSelection}
          onToggleFileSelection={toggleFileSelection}
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
            onShare={handleShareFile}
          />
        )}

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
              alert('Failed to download file');
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
                  await updateFile(renameDialog.item.id!, { name: newName });
                } else {
                  await renameFolderWithEncryption(renameDialog.item.id!, newName, user?.uid || '');
                }
                setRenameDialog({ open: false, item: null, type: 'file', currentName: '' });
              } catch (error) {
                console.error('Rename operation failed:', error);
                alert('Rename operation failed');
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
            />

            {formEditorOpen && (
              <FormFileEditor
                file={selectedFormFile}
                userId={user?.uid || ''}
                privateKey={privateKey || ''}
                parentFolder={currentFolder}
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

        <FormTemplateDesigner
          open={templateDesignerOpen}
          onClose={() => setTemplateDesignerOpen(false)}
          onSave={(templateId) => {
            // Template is now saved to Firestore and can be used in the FormBuilder
            setTemplateDesignerOpen(false);
          }}
        />

        {formEditorOpen && unsavedFormData && (
          <FormFileEditor
            formData={unsavedFormData}
            userId={user?.uid || ''}
            privateKey={privateKey || ''}
            parentFolder={currentFolder}
            isNew={true}
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
          <DialogTitle>Confirm Delete</DialogTitle>
          <DialogContent>
            <DialogContentText>
              Are you sure you want to delete this {itemToDelete?.type}?
              <br />
              <strong>{itemToDelete && typeof itemToDelete.item.name === 'string' ? itemToDelete.item.name : '[Encrypted]'}</strong>
              <br /><br />
              This action cannot be undone.
            </DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setSingleDeleteConfirmOpen(false)}>
              Cancel
            </Button>
            <Button onClick={confirmSingleDelete} color="error" variant="contained">
              Delete
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    </FileUploadArea>
  );
});

MainContent.displayName = 'MainContent';

export default MainContent;