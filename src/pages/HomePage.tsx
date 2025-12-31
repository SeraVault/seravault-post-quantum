import React, { useState, useEffect } from 'react';
import { useSearchParams, useOutletContext } from 'react-router-dom';
import MainContent from '../components/MainContent';
import type { FileData } from '../files';
import type { FileTypeFilterValue } from '../utils/fileTypeFilters';

interface HomePageContext {
  currentFolder: string | null;
  setCurrentFolder: (folderId: string | null) => void;
  selectedTags: string[];
  setSelectedTags: (tags: string[]) => void;
  matchAllTags: boolean;
  setMatchAllTags: (match: boolean) => void;
  files: FileData[];
  setFiles: (files: FileData[]) => void;
  fileTypeFilter: FileTypeFilterValue;
  setFileTypeFilter: (value: FileTypeFilterValue) => void;
}

const HomePage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [fileIdToOpen, setFileIdToOpen] = useState<string | null>(null);
  
  // Get shared state from PersistentLayout via Outlet context
  const {
    currentFolder,
    setCurrentFolder,
    selectedTags,
    setSelectedTags,
    matchAllTags,
    setMatchAllTags,
    setFiles,
    fileTypeFilter,
  } = useOutletContext<HomePageContext>();

  // Handle file parameter (from notification)
  useEffect(() => {
    const fileParam = searchParams.get('file');
    if (fileParam) {
      console.log(`📂 File ID from URL:`, fileParam);
      setFileIdToOpen(fileParam);
    }
  }, [searchParams]);

  // Clear file parameter after it's been processed
  const handleFileOpened = () => {
    setFileIdToOpen(null);
    // Remove the file parameter from URL
    const newSearchParams = new URLSearchParams(searchParams);
    newSearchParams.delete('file');
    setSearchParams(newSearchParams, { replace: true });
  };

  return (
    <MainContent 
      currentFolder={currentFolder} 
      setCurrentFolder={setCurrentFolder}
      // Tag filtering props for MainContent
      selectedTags={selectedTags}
      onTagSelectionChange={setSelectedTags}
      matchAllTags={matchAllTags}
      onMatchModeChange={setMatchAllTags}
      onFilesChange={setFiles}
      fileTypeFilter={fileTypeFilter}
      // File opening from notifications
      fileIdToOpen={fileIdToOpen}
      onFileOpened={handleFileOpened}
    />
  );
};

export default HomePage;
