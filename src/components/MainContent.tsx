import React, { useState, useEffect, useMemo } from 'react';
import {
  Box,
  Typography,
  Breadcrumbs,
  Link,
  useTheme,
  useMediaQuery,
  CircularProgress,
} from '@mui/material';
import { useAuth } from '../auth/AuthContext';
import { usePassphrase } from '../auth/PassphraseContext';
import { useClipboard } from '../context/ClipboardContext';
import { useGlobalLoading } from '../context/LoadingContext';
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
import { ml_kem768 } from '@noble/post-quantum/ml-kem';
import { encryptMetadata } from '../crypto/postQuantumCrypto';
import { decryptFileMetadata, encryptWithPostQuantum } from '../crypto/migration';
import { updateFile, deleteFile, type FileData } from '../files';
import { isFormFile } from '../utils/formFiles';

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
import CreationFAB from './CreationFAB';
import FileViewer from './FileViewer';

interface MainContentProps {
  currentFolder: string | null;
  setCurrentFolder: (folderId: string | null) => void;
}

const hexToBytes = (hex: string) => {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
};

const bytesToHex = (bytes: Uint8Array) =>
  bytes.reduce((str, byte) => str + byte.toString(16).padStart(2, '0'), '');

const MainContent: React.FC<MainContentProps> = ({ currentFolder, setCurrentFolder }) => {
  const { user } = useAuth();
  const { privateKey } = usePassphrase();
  const { clipboardItem, cutItem, copyItem, clearClipboard } = useClipboard();
  const { setIsDataLoading } = useGlobalLoading();
  const { getFoldersByParent, buildFolderPath } = useFolders();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  // State management
  const [files, setFiles] = useState<FileData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredFiles, setFilteredFiles] = useState<FileData[]>([]);

  // Dialog states
  const [newFolderDialogOpen, setNewFolderDialogOpen] = useState(false);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [fileToShare, setFileToShare] = useState<FileData | null>(null);
  const [folderToShare, setFolderToShare] = useState<FolderData | null>(null);
  const [shareItemType, setShareItemType] = useState<'file' | 'folder'>('file');


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
      console.log('MainContent: Session timeout detected, clearing decrypted data');
      
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
      setShareDialogOpen(false);
      setFileToShare(null);
      setFolderToShare(null);
      setRenameDialog({ open: false, item: null, type: 'file', currentName: '' });
      setMobileActionMenu({ open: false, item: null, type: 'file' });
      setContextMenu(null);
      
      // Clear search
      setSearchQuery('');
      
      console.log('MainContent: All decrypted data cleared due to session timeout');
    };

    // Listen for session timeout events
    window.addEventListener('sessionTimeout', handleSessionTimeout as EventListener);

    return () => {
      window.removeEventListener('sessionTimeout', handleSessionTimeout as EventListener);
    };
  }, []);

  // Form-related state
  const [formBuilderOpen, setFormBuilderOpen] = useState(false);
  const [formViewerOpen, setFormViewerOpen] = useState(false);
  const [formEditorOpen, setFormEditorOpen] = useState(false);
  const [formFillerOpen, setFormFillerOpen] = useState(false);
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
            const ciphertext = hexToBytes(userEncryptedKey);
            const sharedSecret = await ml_kem768.decapsulate(ciphertext, privateKeyBytes);
            
            let iv, ciphertextData;
            if (encryptedContent.byteLength > 12) {
              iv = encryptedContent.slice(0, 12);
              ciphertextData = encryptedContent.slice(12);
            } else {
              continue;
            }
            
            const key = await crypto.subtle.importKey('raw', sharedSecret, { name: 'AES-GCM' }, false, ['decrypt']);
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
          console.log('Search: Could not decrypt form file for search', error);
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

  // Load files for current folder
  useEffect(() => {
    if (!user) {
      setLoading(false);
      setIsDataLoading(false);
      return;
    }

    setLoading(true);
    setIsDataLoading(true);
    
    const filesQuery = query(
      collection(db, 'files'),
      where('parent', '==', currentFolder),
      where('sharedWith', 'array-contains', user.uid)
    );

    const unsubscribe = onSnapshot(filesQuery, async (snapshot) => {
      const filesMap = new Map<string, FileData>();

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
          const ciphertext = hexToBytes(userEncryptedKey);
          const sharedSecret = await ml_kem768.decapsulate(ciphertext, privateKeyBytes);

          const decryptedName = await decryptFileMetadata(data.name, sharedSecret);
          const decryptedSize = await decryptFileMetadata(data.size, sharedSecret);
          filesMap.set(doc.id, { ...data, id: doc.id, name: decryptedName, size: decryptedSize });
        } catch (error) {
          console.error('Error decrypting file metadata:', error);
          filesMap.set(doc.id, { ...data, id: doc.id, name: '[Encrypted File]', size: '' });
        }
      }

      setFiles(Array.from(filesMap.values()));
      setLoading(false);
      setIsDataLoading(false);
    });

    return unsubscribe;
  }, [currentFolder, user, privateKey]);

  // Event handlers
  const handleCreateFolder = async (name: string) => {
    if (!user) return;
    await createFolder(user.uid, name, currentFolder);
    setNewFolderDialogOpen(false);
  };

  const handleFormFileClick = async (file: FileData) => {
    // Don't allow file operations if private key isn't available
    if (!user || !privateKey) {
      console.warn('Cannot open file: User or private key not available');
      return;
    }

    // Check if it's a form file
    if (isFormFile(typeof file.name === 'string' ? file.name : '')) {
      setSelectedFormFile(file);
      
      try {
        // Load the form to check if it has data
        const content = await loadFileContent(file);
        
        // Convert ArrayBuffer to string if needed
        let jsonString: string;
        if (content instanceof ArrayBuffer) {
          jsonString = new TextDecoder().decode(content);
        } else if (typeof content === 'string') {
          jsonString = content;
        } else {
          jsonString = String(content);
        }
        
        const formData = JSON.parse(jsonString);
        
        console.log('Form data structure:', formData);
        console.log('Form data.data:', formData.data);
        console.log('Form data.data values:', formData.data ? Object.values(formData.data) : 'no data object');
        
        // Check if form has any data - if all fields are empty, open in edit mode
        const hasData = formData.data && Object.values(formData.data).some((value: any) => 
          value !== null && value !== undefined && value !== ''
        );
        
        console.log('Has data?', hasData);
        
        if (!hasData) {
          console.log('Opening form in edit mode (empty form)');
          // Form is empty, open directly in edit mode
          setSelectedFormData(formData);
          setIsEditingForm(true);
          setFormFillerOpen(true);
        } else {
          console.log('Opening form in view mode (has data)');
          // Form has data, open in view mode
          setFormViewerOpen(true);
        }
      } catch (error) {
        console.error('Error loading form for checking data:', error);
        // Fallback to view mode if loading fails
        setFormViewerOpen(true);
      }
      return;
    }

    // For regular files, open in file viewer
    setSelectedFile(file);
    setFileViewerOpen(true);
    
    // Load file content for viewing
    setFileContentLoading(true);
    try {
      const content = await loadFileContent(file);
      setFileContent(content);
    } catch (error) {
      console.error('Error loading file content:', error);
      setFileContent(null);
    } finally {
      setFileContentLoading(false);
    }
  };

  const loadFileContent = async (file: FileData): Promise<ArrayBuffer> => {
    if (!user || !privateKey) {
      throw new Error('User or private key not available');
    }

    // Download encrypted file
    const encryptedContent = await (await import('../storage')).getFile(file.storagePath);
    const userEncryptedKey = file.encryptedKeys[user.uid];
    
    if (!userEncryptedKey) {
      throw new Error('No access key found for this file');
    }

    // Decrypt the file
    const { ml_kem768 } = await import('@noble/post-quantum/ml-kem');
    
    const hexToBytes = (hex: string) => {
      const bytes = new Uint8Array(hex.length / 2);
      for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
      }
      return bytes;
    };
    
    const privateKeyBytes = hexToBytes(privateKey);
    const ciphertext = hexToBytes(userEncryptedKey);
    const sharedSecret = await ml_kem768.decapsulate(ciphertext, privateKeyBytes);
    
    // Files are encrypted with AES-GCM with IV prepended (same format as forms)
    let decryptedContent: ArrayBuffer;
    
    try {
      // Decrypt file content (AES-GCM with IV prepended)
      if (encryptedContent.byteLength > 12) {
        const iv = encryptedContent.slice(0, 12);
        const ciphertextData = encryptedContent.slice(12);
        
        const key = await crypto.subtle.importKey('raw', sharedSecret, { name: 'AES-GCM' }, false, ['decrypt']);
        decryptedContent = await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv: iv }, 
          key, 
          ciphertextData
        );
      } else {
        throw new Error('Invalid encrypted content format');
      }
    } catch (error) {
      // If new format fails, the file might be stored differently
      // For now, just return the encrypted content as-is for files that aren't encrypted
      // This is a fallback for files that were uploaded before encryption was implemented
      console.warn('Failed to decrypt file, returning as-is:', error);
      decryptedContent = encryptedContent;
    }
    
    return decryptedContent;
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
    if (!selectedFormFile) return;
    
    try {
      const content = await loadFileContent(selectedFormFile);
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
      
      const encryptedContent = await (await import('../storage')).getFile(selectedFormFile.storagePath);
      const userEncryptedKey = selectedFormFile.encryptedKeys[user.uid];
      
      if (!userEncryptedKey) {
        throw new Error('No access key found for this file');
      }
      
      const privateKeyBytes = hexToBytes(privateKey);
      const ciphertext = hexToBytes(userEncryptedKey);
      const sharedSecret = await ml_kem768.decapsulate(ciphertext, privateKeyBytes);
      
      let iv, ciphertextData;
      if (encryptedContent.byteLength > 12) {
        iv = encryptedContent.slice(0, 12);
        ciphertextData = encryptedContent.slice(12);
      } else {
        throw new Error('Invalid encrypted content format');
      }
      
      const key = await crypto.subtle.importKey('raw', sharedSecret, { name: 'AES-GCM' }, false, ['decrypt']);
      const decryptedContentBuffer = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: iv }, 
        key, 
        ciphertextData
      );
      
      const decryptedContent = new TextDecoder().decode(decryptedContentBuffer);
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

        {/* File Table */}
        <FileTable
          folders={filteredFolders}
          files={filteredFiles}
          onFolderClick={setCurrentFolder}
          onFileClick={handleFormFileClick}
          onContextMenu={handleRightClick}
          onLongPressStart={handleLongPressStart}
          onLongPressEnd={handleLongPressEnd}
          onOpenMobileActionMenu={handleOpenMobileActionMenu}
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
            onShare={() => {}}
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
          onDelete={async () => {
            if (contextMenu?.item && window.confirm(`Are you sure you want to delete this ${contextMenu.type}?`)) {
              try {
                if (contextMenu.type === 'file') {
                  await deleteFile(contextMenu.item.id!);
                } else {
                  await deleteFolder(contextMenu.item.id!);
                }
                setContextMenu(null);
              } catch (error) {
                console.error('Delete operation failed:', error);
                alert('Delete operation failed');
              }
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
          onDownload={mobileActionMenu.type === 'file' && mobileActionMenu.item ? async () => {
            const file = mobileActionMenu.item as FileData;
            try {
              const content = await loadFileContent(file);
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
          onDelete={async () => {
            if (mobileActionMenu.item && window.confirm(`Are you sure you want to delete this ${mobileActionMenu.type}?`)) {
              try {
                if (mobileActionMenu.type === 'file') {
                  await deleteFile(mobileActionMenu.item.id!);
                } else {
                  await deleteFolder(mobileActionMenu.item.id!);
                }
                setMobileActionMenu({ open: false, item: null, type: 'file' });
              } catch (error) {
                console.error('Delete operation failed:', error);
                alert('Delete operation failed');
                setMobileActionMenu({ open: false, item: null, type: 'file' });
              }
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
          onFormCreated={() => {
            // Form will be created and saved automatically by FormBuilder
            // Files will refresh automatically via the snapshot listener
            // Empty forms will automatically open in edit mode when clicked
          }}
        />

        <CreationFAB
          onCreateFolder={() => setNewFolderDialogOpen(true)}
          onUploadFiles={handleUploadClick}
          onCreateForm={() => {
            console.log('Create form button clicked - opening FormBuilder');
            setFormBuilderOpen(true);
          }}
          onPaste={handlePaste}
          showPaste={!!clipboardItem}
        />
      </Box>
    </FileUploadArea>
  );
};

export default MainContent;