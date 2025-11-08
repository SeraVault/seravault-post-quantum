import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import ContactManager from '../components/ContactManager';
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
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <ContactManager initialTab={initialTab} />
    </Container>
  );
};

export default ContactsPage;