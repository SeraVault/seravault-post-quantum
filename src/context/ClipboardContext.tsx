import React, { createContext, useContext, useState } from 'react';
import { type FileData } from '../files';
import { type Folder as FolderData } from '../firestore';

interface ClipboardItem {
  type: 'file' | 'folder';
  data: FileData | FolderData;
  operation: 'cut' | 'copy';
}

interface ClipboardContextType {
  clipboardItem: ClipboardItem | null;
  cutItem: (type: 'file' | 'folder', data: FileData | FolderData) => void;
  copyItem: (type: 'file' | 'folder', data: FileData | FolderData) => void;
  clearClipboard: () => void;
}

const ClipboardContext = createContext<ClipboardContextType | undefined>(undefined);

export const ClipboardProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [clipboardItem, setClipboardItem] = useState<ClipboardItem | null>(null);

  const cutItem = (type: 'file' | 'folder', data: FileData | FolderData) => {
    setClipboardItem({ type, data, operation: 'cut' });
  };

  const copyItem = (type: 'file' | 'folder', data: FileData | FolderData) => {
    setClipboardItem({ type, data, operation: 'copy' });
  };

  const clearClipboard = () => {
    setClipboardItem(null);
  };

  return (
    <ClipboardContext.Provider value={{ clipboardItem, cutItem, copyItem, clearClipboard }}>
      {children}
    </ClipboardContext.Provider>
  );
};

export const useClipboard = () => {
  const context = useContext(ClipboardContext);
  if (context === undefined) {
    throw new Error('useClipboard must be used within a ClipboardProvider');
  }
  return context;
};