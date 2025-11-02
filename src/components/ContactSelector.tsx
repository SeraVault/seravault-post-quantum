import React, { useState, useEffect } from 'react';
import {
  List,
  ListItem,
  ListItemButton,
  ListItemAvatar,
  ListItemText,
  Avatar,
  Checkbox,
  TextField,
  Box,
  Typography,
  CircularProgress,
} from '@mui/material';
import { Person as PersonIcon } from '@mui/icons-material';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';

interface Contact {
  id: string;
  displayName: string;
  email: string;
  publicKey?: string;
}

interface ContactSelectorProps {
  selectedContacts: string[];
  onSelectionChange: (contacts: string[]) => void;
  currentUserId: string;
}

const ContactSelector: React.FC<ContactSelectorProps> = ({
  selectedContacts,
  onSelectionChange,
  currentUserId,
}) => {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    loadContacts();
  }, [currentUserId]);
  
  const loadContacts = async () => {
    setLoading(true);
    try {
      // Query where user is either userId1 or userId2
      const q1 = query(
        collection(db, 'contacts'),
        where('userId1', '==', currentUserId),
        where('status', '==', 'accepted')
      );
      
      const q2 = query(
        collection(db, 'contacts'),
        where('userId2', '==', currentUserId),
        where('status', '==', 'accepted')
      );

      const [snapshot1, snapshot2] = await Promise.all([
        getDocs(q1),
        getDocs(q2)
      ]);

      const loadedContacts: Contact[] = [];
      
      // Process contacts where current user is userId1
      for (const doc of snapshot1.docs) {
        const data = doc.data();
        loadedContacts.push({
          id: data.userId2, // The other user
          displayName: data.user2DisplayName || 'Unknown',
          email: data.user2Email || '',
          publicKey: data.user2PublicKey,
        });
      }
      
      // Process contacts where current user is userId2
      for (const doc of snapshot2.docs) {
        const data = doc.data();
        loadedContacts.push({
          id: data.userId1, // The other user
          displayName: data.user1DisplayName || 'Unknown',
          email: data.user1Email || '',
          publicKey: data.user1PublicKey,
        });
      }
      
      setContacts(loadedContacts);
    } catch (error) {
      console.error('Failed to load contacts:', error);
    } finally {
      setLoading(false);
    }
  };
  
  const handleToggle = (contactId: string) => {
    const currentIndex = selectedContacts.indexOf(contactId);
    const newSelected = [...selectedContacts];
    
    if (currentIndex === -1) {
      newSelected.push(contactId);
    } else {
      newSelected.splice(currentIndex, 1);
    }
    
    onSelectionChange(newSelected);
  };
  
  const filteredContacts = contacts.filter(contact =>
    contact.displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    contact.email.toLowerCase().includes(searchTerm.toLowerCase())
  );
  
  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
        <CircularProgress />
      </Box>
    );
  }
  
  return (
    <Box>
      <TextField
        fullWidth
        size="small"
        placeholder="Search contacts..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        sx={{ mb: 2 }}
      />
      
      {filteredContacts.length === 0 ? (
        <Typography color="text.secondary" align="center" sx={{ py: 3 }}>
          No contacts found. Add contacts first to start chatting.
        </Typography>
      ) : (
        <List sx={{ maxHeight: 400, overflow: 'auto' }}>
          {filteredContacts.map((contact) => (
            <ListItem key={contact.id} disablePadding>
              <ListItemButton onClick={() => handleToggle(contact.id)} dense>
                <Checkbox
                  edge="start"
                  checked={selectedContacts.indexOf(contact.id) !== -1}
                  tabIndex={-1}
                  disableRipple
                />
                <ListItemAvatar>
                  <Avatar>
                    <PersonIcon />
                  </Avatar>
                </ListItemAvatar>
                <ListItemText
                  primary={contact.displayName}
                  secondary={contact.email}
                />
              </ListItemButton>
            </ListItem>
          ))}
        </List>
      )}
    </Box>
  );
};

export default ContactSelector;
