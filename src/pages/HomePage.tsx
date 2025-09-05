import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import AppLayout from '../components/AppLayout';
import MainContent from '../components/MainContent';

const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [currentFolder, setCurrentFolder] = useState<string | null>(null);
  const mainContentRef = useRef<{ openTemplateDesigner: () => void }>(null);

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
    >
      <MainContent 
        ref={mainContentRef}
        currentFolder={currentFolder} 
        setCurrentFolder={handleFolderNavigation} 
      />
    </AppLayout>
  );
};

export default HomePage;
