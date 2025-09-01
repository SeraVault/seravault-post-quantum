import React, { useState, useRef } from 'react';
import AppLayout from '../components/AppLayout';
import MainContent from '../components/MainContent';

const HomePage: React.FC = () => {
  const [currentFolder, setCurrentFolder] = useState<string | null>(null);
  const mainContentRef = useRef<{ openTemplateDesigner: () => void }>(null);

  const handleOpenTemplateDesigner = () => {
    mainContentRef.current?.openTemplateDesigner();
  };

  return (
    <AppLayout 
      currentFolder={currentFolder} 
      setCurrentFolder={setCurrentFolder}
      onOpenTemplateDesigner={handleOpenTemplateDesigner}
    >
      <MainContent 
        ref={mainContentRef}
        currentFolder={currentFolder} 
        setCurrentFolder={setCurrentFolder} 
      />
    </AppLayout>
  );
};

export default HomePage;
