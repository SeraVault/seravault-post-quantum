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
  RemoveCircleOutline,
} from '@mui/icons-material';
import { useAuth } from '../auth/AuthContext';
import { type Group, getUserGroups, getUserProfile } from '../firestore';
import GroupManagement from './GroupManagement';

interface ShareDialogProps {
  open: boolean;
  onClose: () => void;
  onShare: (recipients: string[]) => void;
  onUnshare?: (recipients: string[]) => void;
  itemType?: 'file' | 'folder';
  itemName?: string;
  currentSharedWith?: string[]; // User IDs currently shared with
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

const ShareDialog: React.FC<ShareDialogProps> = ({ 
  open, 
  onClose, 
  onShare, 
  onUnshare,
  itemType = 'file', 
  itemName = 'item',
  currentSharedWith = []
}) => {
  const { user } = useAuth();
  const [tabValue, setTabValue] = useState(0);
  const [emailInput, setEmailInput] = useState('');
  const [selectedRecipients, setSelectedRecipients] = useState<string[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [groupManagementOpen, setGroupManagementOpen] = useState(false);
  const [currentShares, setCurrentShares] = useState<{id: string, email: string, displayName: string}[]>([]);
  const [selectedToUnshare, setSelectedToUnshare] = useState<string[]>([]);

  useEffect(() => {
    if (user && open) {
      loadData();
    }
  }, [user, open, currentSharedWith]);

  const loadData = async () => {
    if (!user) return;
    try {
      const userGroups = await getUserGroups(user.uid);
      setGroups(userGroups);
      
      // Load current share information
      if (currentSharedWith.length > 0) {
        const sharePromises = currentSharedWith
          .filter(userId => userId !== user.uid) // Exclude owner
          .map(async (userId) => {
            try {
              const profile = await getUserProfile(userId);
              return {
                id: userId,
                email: profile?.email || 'Unknown',
                displayName: profile?.displayName || 'Unknown User'
              };
            } catch (error) {
              console.warn(`Failed to load profile for ${userId}:`, error);
              return {
                id: userId,
                email: 'Unknown',
                displayName: 'Unknown User'
              };
            }
          });
        
        const shares = await Promise.all(sharePromises);
        setCurrentShares(shares);
      } else {
        setCurrentShares([]);
      }
    } catch (error) {
      console.error('Error loading sharing data:', error);
    }
  };

  const handleAddEmail = () => {
    const email = emailInput.trim();
    
    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    
    if (!email) {
      return; // Empty input
    }
    
    if (!emailRegex.test(email)) {
      alert('Please enter a valid email address');
      return;
    }
    
    if (selectedRecipients.includes(email)) {
      alert('This email is already added');
      return;
    }
    
    setSelectedRecipients([...selectedRecipients, email]);
    setEmailInput('');
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

  const handleUnshareToggle = (userId: string) => {
    setSelectedToUnshare(prev => 
      prev.includes(userId)
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  const handleUnshare = async () => {
    if (!onUnshare || selectedToUnshare.length === 0) {
      alert('Please select at least one person to unshare with.');
      return;
    }

    try {
      onUnshare(selectedToUnshare);
      handleClose();
    } catch (error) {
      console.error('Error unsharing:', error);
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
      onShare(allRecipients);
      handleClose();
    } catch (error) {
      console.error('Error sharing:', error);
    }
  };

  const handleClose = () => {
    setSelectedRecipients([]);
    setSelectedGroups([]);
    setSelectedToUnshare([]);
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


  const totalRecipients = selectedRecipients.length + 
    selectedGroups.reduce((acc, groupId) => {
      const group = groups.find(g => g.id === groupId);
      return acc + (group ? group.members.length : 0);
    }, 0);

  return (
    <>
      <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
        <DialogTitle>Share {itemType === 'file' ? 'File' : 'Folder'}{itemName && `: ${itemName}`}</DialogTitle>
        <DialogContent sx={{ pb: 1 }}>
          <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
            <Tabs value={tabValue} onChange={(_, newValue) => setTabValue(newValue)} aria-label="share options">
              <Tab label="People" icon={<Person />} id="share-tab-0" aria-controls="share-tabpanel-0" />
              <Tab label="Groups" icon={<GroupIcon />} id="share-tab-1" aria-controls="share-tabpanel-1" />
              <Tab 
                label={`Current (${currentShares.length})`} 
                icon={<RemoveCircleOutline />} 
                id="share-tab-2" 
                aria-controls="share-tabpanel-2"
              />
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

            {selectedRecipients.length > 0 && (
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
            )}
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
              <List dense sx={{ maxHeight: 300, overflow: 'auto' }}>
                {groups.map((group) => (
                  <ListItem 
                    key={group.id} 
                    dense 
                    onClick={() => handleGroupToggle(group.id!)}
                    sx={{ cursor: 'pointer', '&:hover': { backgroundColor: 'action.hover' } }}
                  >
                    <ListItemIcon>
                      <Checkbox
                        edge="start"
                        checked={selectedGroups.includes(group.id!)}
                        onChange={() => handleGroupToggle(group.id!)}
                        tabIndex={-1}
                        disableRipple
                      />
                    </ListItemIcon>
                    <ListItemText
                      primary={group.name}
                      secondary={`${group.members.length} member${group.members.length !== 1 ? 's' : ''}: ${group.members.join(', ')}`}
                    />
                  </ListItem>
                ))}
              </List>
            )}
          </TabPanel>

          <TabPanel value={tabValue} index={2}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="body2" color="text.secondary">
                Currently shared with {currentShares.length} {currentShares.length === 1 ? 'person' : 'people'}
              </Typography>
            </Box>

            {currentShares.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
                This {itemType} is not shared with anyone yet.
              </Typography>
            ) : (
              <List dense sx={{ maxHeight: 300, overflow: 'auto' }}>
                {currentShares.map((share) => (
                  <ListItem 
                    key={share.id} 
                    dense 
                    onClick={() => handleUnshareToggle(share.id)}
                    sx={{ cursor: 'pointer', '&:hover': { backgroundColor: 'action.hover' } }}
                  >
                    <ListItemIcon>
                      <Checkbox
                        edge="start"
                        checked={selectedToUnshare.includes(share.id)}
                        onChange={() => handleUnshareToggle(share.id)}
                        tabIndex={-1}
                        disableRipple
                      />
                    </ListItemIcon>
                    <ListItemText
                      primary={share.displayName}
                      secondary={share.email}
                    />
                  </ListItem>
                ))}
              </List>
            )}

            {selectedToUnshare.length > 0 && (
              <Box sx={{ mt: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="body2" color="text.secondary">
                  {selectedToUnshare.length} selected to unshare
                </Typography>
                <Button 
                  variant="outlined" 
                  color="error" 
                  size="small"
                  onClick={handleUnshare}
                  startIcon={<RemoveCircleOutline />}
                >
                  Unshare
                </Button>
              </Box>
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
