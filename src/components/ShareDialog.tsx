import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Box,
  Typography,
  Chip,
  Tabs,
  Tab,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Checkbox,
  IconButton,
} from '@mui/material';
import {
  Person,
  Group as GroupIcon,
  Settings,
  Email,
} from '@mui/icons-material';
import { useAuth } from '../auth/AuthContext';
import { type Group, type SharingHistory, getUserGroups, getSharingHistory, addSharingHistory } from '../firestore';
import GroupManagement from './GroupManagement';

interface ShareDialogProps {
  open: boolean;
  onClose: () => void;
  onShare: (recipients: string[]) => void;
  itemType?: 'file' | 'folder';
  itemName?: string;
}

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`share-tabpanel-${index}`}
      aria-labelledby={`share-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ pt: 2 }}>{children}</Box>}
    </div>
  );
}

const ShareDialog: React.FC<ShareDialogProps> = ({ open, onClose, onShare, itemType = 'file', itemName = 'item' }) => {
  const { user } = useAuth();
  const [tabValue, setTabValue] = useState(0);
  const [emailInput, setEmailInput] = useState('');
  const [selectedRecipients, setSelectedRecipients] = useState<string[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [sharingHistory, setSharingHistory] = useState<SharingHistory[]>([]);
  const [groupManagementOpen, setGroupManagementOpen] = useState(false);

  useEffect(() => {
    if (user && open) {
      loadData();
    }
  }, [user, open]);

  const loadData = async () => {
    if (!user) return;
    try {
      const [userGroups, history] = await Promise.all([
        getUserGroups(user.uid),
        getSharingHistory(user.uid),
      ]);
      setGroups(userGroups);
      setSharingHistory(history);
    } catch (error) {
      console.error('Error loading sharing data:', error);
    }
  };

  const handleAddEmail = () => {
    const email = emailInput.trim();
    if (email && !selectedRecipients.includes(email)) {
      setSelectedRecipients([...selectedRecipients, email]);
      setEmailInput('');
    }
  };

  const handleRemoveRecipient = (email: string) => {
    setSelectedRecipients(selectedRecipients.filter(r => r !== email));
  };

  const handleGroupToggle = (groupId: string) => {
    setSelectedGroups(prev => 
      prev.includes(groupId)
        ? prev.filter(id => id !== groupId)
        : [...prev, groupId]
    );
  };

  const handleHistorySelect = (email: string) => {
    if (!selectedRecipients.includes(email)) {
      setSelectedRecipients([...selectedRecipients, email]);
    }
  };

  const handleShare = async () => {
    if (!user) return;

    const allRecipients: string[] = [...selectedRecipients];
    
    // Add group members
    for (const groupId of selectedGroups) {
      const group = groups.find(g => g.id === groupId);
      if (group) {
        allRecipients.push(...group.members.filter(m => !allRecipients.includes(m)));
      }
    }

    if (allRecipients.length === 0) {
      alert('Please select at least one recipient or group.');
      return;
    }

    try {
      // Add to sharing history
      const historyPromises = [
        ...selectedRecipients.map(email => addSharingHistory(user.uid, email, 'user')),
        ...selectedGroups.map(groupId => addSharingHistory(user.uid, groupId, 'group')),
      ];
      await Promise.all(historyPromises);

      onShare(allRecipients);
      handleClose();
    } catch (error) {
      console.error('Error sharing:', error);
    }
  };

  const handleClose = () => {
    setSelectedRecipients([]);
    setSelectedGroups([]);
    setEmailInput('');
    setTabValue(0);
    onClose();
  };

  const handleKeyPress = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      handleAddEmail();
    }
  };

  // Get unique emails from sharing history
  const historyEmails = Array.from(new Set(
    sharingHistory
      .filter(h => h.type === 'user')
      .map(h => h.sharedWith)
  )).slice(0, 10); // Show last 10 unique emails

  const totalRecipients = selectedRecipients.length + 
    selectedGroups.reduce((acc, groupId) => {
      const group = groups.find(g => g.id === groupId);
      return acc + (group ? group.members.length : 0);
    }, 0);

  return (
    <>
      <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
        <DialogTitle>Share {itemType === 'file' ? 'File' : 'Folder'}{itemName && `: ${itemName}`}</DialogTitle>
        <DialogContent>
          <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
            <Tabs value={tabValue} onChange={(_, newValue) => setTabValue(newValue)}>
              <Tab label="People" icon={<Person />} />
              <Tab label="Groups" icon={<GroupIcon />} />
              <Tab label="Recent" icon={<Email />} />
            </Tabs>
          </Box>

          <TabPanel value={tabValue} index={0}>
            <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
              <TextField
                size="small"
                label="Email address"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                onKeyPress={handleKeyPress}
                variant="outlined"
                fullWidth
                placeholder="user@example.com"
              />
              <Button onClick={handleAddEmail} variant="outlined">
                Add
              </Button>
            </Box>

            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2 }}>
              {selectedRecipients.map((email) => (
                <Chip
                  key={email}
                  label={email}
                  onDelete={() => handleRemoveRecipient(email)}
                  size="small"
                  icon={<Person />}
                />
              ))}
            </Box>
          </TabPanel>

          <TabPanel value={tabValue} index={1}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="body2" color="text.secondary">
                Select groups to share with all members at once
              </Typography>
              <IconButton
                size="small"
                onClick={() => setGroupManagementOpen(true)}
                title="Manage Groups"
              >
                <Settings />
              </IconButton>
            </Box>

            {groups.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
                No groups created yet. Create groups to easily share with multiple people.
              </Typography>
            ) : (
              <List dense>
                {groups.map((group) => (
                  <ListItem key={group.id} dense>
                    <ListItemIcon>
                      <Checkbox
                        edge="start"
                        checked={selectedGroups.includes(group.id!)}
                        onChange={() => handleGroupToggle(group.id!)}
                      />
                    </ListItemIcon>
                    <ListItemText
                      primary={group.name}
                      secondary={`${group.members.length} member${group.members.length !== 1 ? 's' : ''}`}
                    />
                  </ListItem>
                ))}
              </List>
            )}
          </TabPanel>

          <TabPanel value={tabValue} index={2}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Recently shared with
            </Typography>
            
            {historyEmails.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
                No sharing history yet
              </Typography>
            ) : (
              <List dense>
                {historyEmails.map((email) => (
                  <ListItem 
                    key={email} 
                    dense 
 
                    sx={{
                      cursor: selectedRecipients.includes(email) ? 'default' : 'pointer',
                      opacity: selectedRecipients.includes(email) ? 0.5 : 1
                    }}
                    onClick={() => !selectedRecipients.includes(email) && handleHistorySelect(email)}
                  >
                    <ListItemIcon>
                      <Person />
                    </ListItemIcon>
                    <ListItemText primary={email} />
                  </ListItem>
                ))}
              </List>
            )}
          </TabPanel>

          {(selectedRecipients.length > 0 || selectedGroups.length > 0) && (
            <Box sx={{ mt: 2, p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
              <Typography variant="body2" color="text.secondary">
                Will share with {totalRecipients} recipient{totalRecipients !== 1 ? 's' : ''}
              </Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose}>Cancel</Button>
          <Button 
            onClick={handleShare} 
            variant="contained"
            disabled={selectedRecipients.length === 0 && selectedGroups.length === 0}
          >
            Share
          </Button>
        </DialogActions>
      </Dialog>
      
      <GroupManagement 
        open={groupManagementOpen} 
        onClose={() => {
          setGroupManagementOpen(false);
          loadData(); // Refresh groups after management
        }} 
      />
    </>
  );
};

export default ShareDialog;
