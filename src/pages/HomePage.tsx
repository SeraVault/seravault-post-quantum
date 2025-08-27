import React, { useState } from 'react';
import AppLayout from '../components/AppLayout';
import MainContent from '../components/MainContent';

const HomePage: React.FC = () => {
  const [currentFolder, setCurrentFolder] = useState<string | null>(null);

  return (
    <AppLayout currentFolder={currentFolder} setCurrentFolder={setCurrentFolder}>
      <MainContent currentFolder={currentFolder} setCurrentFolder={setCurrentFolder} />
    </AppLayout>
  );
};

export default HomePage;
