import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import ContactManager from '../components/ContactManager';
import CreationFAB from '../components/CreationFAB';
import { Container } from '@mui/material';

const ContactsPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [initialTab, setInitialTab] = useState<number>(0);

  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam === 'requests') {
      setInitialTab(1); // Switch to requests tab
      // Remove the query parameter after processing
      searchParams.delete('tab');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  return (
    <>
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <ContactManager initialTab={initialTab} />
      </Container>

      <CreationFAB
        onCreateFolder={() => {}} // Not applicable on contacts page
        onUploadFiles={() => {}} // Not applicable on contacts page
        onCreateForm={() => {
          // Navigate to vault and open form builder
          window.location.href = '/#form';
        }}
        onCreateChat={() => {
          // Navigate to vault and open chat dialog
          window.location.href = '/#chat';
        }}
      />
    </>
  );
};

export default ContactsPage;