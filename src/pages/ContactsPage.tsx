import React from 'react';
import ContactManager from '../components/ContactManager';
import { Container } from '@mui/material';

const ContactsPage: React.FC = () => {
  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <ContactManager />
    </Container>
  );
};

export default ContactsPage;