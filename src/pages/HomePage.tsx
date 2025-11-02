import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { usePassphrase } from '../auth/PassphraseContext';
import AppLayout from '../components/AppLayout';
import MainContent from '../components/MainContent';

const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [currentFolder, setCurrentFolder] = useState<string | null>(null);
  const [fileIdToOpen, setFileIdToOpen] = useState<string | null>(null);
  
  // Get user context for tag filtering
  const { user } = useAuth();
  const { privateKey } = usePassphrase();
  
  // Tag filtering state
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [matchAllTags, setMatchAllTags] = useState(false);
  const [files, setFiles] = useState<any[]>([]); // This will be populated by MainContent

  // Handle folder navigation by updating the URL
  const handleFolderNavigation = (folderId: string | null) => {
    setCurrentFolder(folderId);
    navigate(`/?folder=${folderId || ''}`, { replace: true });
  };

  // Initialize folder, view, and file from URL parameters
  useEffect(() => {
    const folderParam = searchParams.get('folder');
    const viewParam = searchParams.get('view');
    const fileParam = searchParams.get('file');
    
    // Handle folder parameter
    if (folderParam && folderParam !== '') {
      setCurrentFolder(folderParam);
    } else {
      setCurrentFolder(null);
    }
    
    // Handle file parameter (from notification)
    if (fileParam) {
      console.log(`📂 File ID from URL:`, fileParam);
      setFileIdToOpen(fileParam);
    }
    
    // Handle view parameter - this will be used by AppLayout/SideNav to set the appropriate view state
    // The view state is managed in the RecentsContext and will be handled by the SideNav component
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
    <AppLayout 
      currentFolder={currentFolder} 
      setCurrentFolder={handleFolderNavigation}
      // Tag filtering props for SideNav
      files={files}
      userId={user?.uid}
      userPrivateKey={privateKey}
      selectedTags={selectedTags}
      onTagSelectionChange={setSelectedTags}
      matchAllTags={matchAllTags}
      onMatchModeChange={setMatchAllTags}
    >
      <MainContent 
        currentFolder={currentFolder} 
        setCurrentFolder={handleFolderNavigation}
        // Tag filtering props for MainContent
        selectedTags={selectedTags}
        onTagSelectionChange={setSelectedTags}
        matchAllTags={matchAllTags}
        onMatchModeChange={setMatchAllTags}
        onFilesChange={setFiles}
        // File opening from notifications
        fileIdToOpen={fileIdToOpen}
        onFileOpened={handleFileOpened}
      />
    </AppLayout>
  );
};

export default HomePage;
