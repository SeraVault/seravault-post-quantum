import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { usePassphrase } from '../auth/PassphraseContext';
import AppLayout from '../components/AppLayout';
import MainContent from '../components/MainContent';

const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [currentFolder, setCurrentFolder] = useState<string | null>(null);
  
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

  // Initialize folder and view from URL parameters
  useEffect(() => {
    const folderParam = searchParams.get('folder');
    const viewParam = searchParams.get('view');
    
    // Handle folder parameter
    if (folderParam && folderParam !== '') {
      setCurrentFolder(folderParam);
    } else {
      setCurrentFolder(null);
    }
    
    // Handle view parameter - this will be used by AppLayout/SideNav to set the appropriate view state
    // The view state is managed in the RecentsContext and will be handled by the SideNav component
  }, [searchParams]);


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
      />
    </AppLayout>
  );
};

export default HomePage;
