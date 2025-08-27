import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppLayout from '../components/AppLayout';
import FileCleanup from '../components/FileCleanup';

const CleanupPage: React.FC = () => {
  const navigate = useNavigate();
  const [currentFolder, setCurrentFolder] = useState<string | null>(null);

  // Handle folder navigation by redirecting to main documents page
  const handleFolderNavigation = (folderId: string | null) => {
    navigate(`/?folder=${folderId || ''}`);
  };

  return (
    <AppLayout currentFolder={currentFolder} setCurrentFolder={handleFolderNavigation}>
      <FileCleanup />
    </AppLayout>
  );
};

export default CleanupPage;