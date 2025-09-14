import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { usePassphrase } from '../auth/PassphraseContext';
import AppLayout from '../components/AppLayout';
import MainContent from '../components/MainContent';

const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [currentFolder, setCurrentFolder] = useState<string | null>(null);
  const mainContentRef = useRef<{ openTemplateDesigner: () => void }>(null);
  
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

  // Initialize folder from URL parameters
  useEffect(() => {
    const folderParam = searchParams.get('folder');
    if (folderParam && folderParam !== '') {
      setCurrentFolder(folderParam);
    } else {
      setCurrentFolder(null);
    }
  }, [searchParams]);

  const handleOpenTemplateDesigner = () => {
    mainContentRef.current?.openTemplateDesigner();
  };

  return (
    <AppLayout 
      currentFolder={currentFolder} 
      setCurrentFolder={handleFolderNavigation}
      onOpenTemplateDesigner={handleOpenTemplateDesigner}
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
        ref={mainContentRef}
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
