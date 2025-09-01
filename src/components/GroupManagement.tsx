import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  TextField,
  Box,
  Typography,
  Chip,
  Divider,
} from '@mui/material';
import {
  Add,
  Edit,
  Delete,
  Group as GroupIcon,
  Person,
} from '@mui/icons-material';
import { useAuth } from '../auth/AuthContext';
import { usePassphrase } from '../auth/PassphraseContext';
import { type Group, createGroup, updateGroup, deleteGroup, getUserGroups } from '../firestore';
import { hexToBytes } from '../crypto/hpkeCrypto';

interface GroupManagementProps {
  open: boolean;
  onClose: () => void;
}

interface GroupFormData {
  name: string;
  description: string;
  members: string[];
}

const GroupManagement: React.FC<GroupManagementProps> = ({ open, onClose }) => {
  const { user } = useAuth();
  const { privateKey } = usePassphrase();
  const [groups, setGroups] = useState<Group[]>([]);
  const [editingGroup, setEditingGroup] = useState<Group | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState<GroupFormData>({
    name: '',
    description: '',
    members: [],
  });
  const [memberInput, setMemberInput] = useState('');

  useEffect(() => {
    if (user && open) {
      loadGroups();
    }
  }, [user, open, privateKey]);

  const loadGroups = async () => {
    if (!user) return;
    try {
      // Convert private key string to Uint8Array if available
      const privateKeyBytes = privateKey ? hexToBytes(privateKey) : undefined;
      const userGroups = await getUserGroups(user.uid, privateKeyBytes);
      setGroups(userGroups);
    } catch (error) {
      console.error('Error loading groups:', error);
    }
  };

  const handleCreateGroup = () => {
    setEditingGroup(null);
    setFormData({ name: '', description: '', members: [] });
    setShowForm(true);
  };

  const handleEditGroup = (group: Group) => {
    setEditingGroup(group);
    setFormData({
      name: typeof group.name === 'string' ? group.name : '[Encrypted]',
      description: typeof group.description === 'string' ? (group.description || '') : '[Encrypted]',
      members: Array.isArray(group.members) ? group.members : [],
    });
    setShowForm(true);
  };

  const handleDeleteGroup = async (groupId: string) => {
    if (window.confirm('Are you sure you want to delete this group?')) {
      try {
        await deleteGroup(groupId);
        await loadGroups();
      } catch (error) {
        console.error('Error deleting group:', error);
        alert('Failed to delete group.');
      }
    }
  };

  const handleSaveGroup = async () => {
    if (!user || !formData.name.trim()) return;

    try {
      if (editingGroup) {
        await updateGroup(editingGroup.id!, {
          name: formData.name,
          description: formData.description,
          members: formData.members,
        });
      } else {
        await createGroup(
          user.uid,
          formData.name,
          formData.description,
          formData.members
        );
      }
      await loadGroups();
      setShowForm(false);
      setFormData({ name: '', description: '', members: [] });
    } catch (error) {
      console.error('Error saving group:', error);
      alert('Failed to save group.');
    }
  };

  const handleAddMember = () => {
    if (memberInput.trim() && !formData.members.includes(memberInput.trim())) {
      setFormData({
        ...formData,
        members: [...formData.members, memberInput.trim()],
      });
      setMemberInput('');
    }
  };

  const handleRemoveMember = (member: string) => {
    setFormData({
      ...formData,
      members: formData.members.filter(m => m !== member),
    });
  };

  const handleKeyPress = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      handleAddMember();
    }
  };

  if (showForm) {
    return (
      <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
        <DialogTitle>
          {editingGroup ? 'Edit Group' : 'Create New Group'}
        </DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Group Name"
            fullWidth
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            variant="outlined"
            sx={{ mb: 2 }}
          />
          
          <TextField
            margin="dense"
            label="Description (optional)"
            fullWidth
            multiline
            rows={2}
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            variant="outlined"
            sx={{ mb: 2 }}
          />
          
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            Members
          </Typography>
          
          <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
            <TextField
              size="small"
              label="Email address"
              value={memberInput}
              onChange={(e) => setMemberInput(e.target.value)}
              onKeyPress={handleKeyPress}
              variant="outlined"
              fullWidth
              placeholder="user@example.com"
            />
            <Button onClick={handleAddMember} variant="outlined">
              Add
            </Button>
          </Box>
          
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2 }}>
            {formData.members.map((member) => (
              <Chip
                key={member}
                label={member}
                onDelete={() => handleRemoveMember(member)}
                size="small"
                icon={<Person />}
              />
            ))}
          </Box>
          
          {formData.members.length === 0 && (
            <Typography variant="body2" color="text.secondary">
              No members added yet. Add email addresses to include users in this group.
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowForm(false)}>Cancel</Button>
          <Button 
            onClick={handleSaveGroup} 
            variant="contained"
            disabled={!formData.name.trim()}
          >
            {editingGroup ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant="h6">Manage Groups</Typography>
          <Button
            startIcon={<Add />}
            variant="contained"
            onClick={handleCreateGroup}
          >
            New Group
          </Button>
        </Box>
      </DialogTitle>
      <DialogContent>
        {groups.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <GroupIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
            <Typography variant="h6" color="text.secondary" gutterBottom>
              No groups yet
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Create groups to easily share files with multiple people at once.
            </Typography>
          </Box>
        ) : (
          <List>
            {groups.map((group, index) => (
              <React.Fragment key={group.id}>
                <ListItem>
                  <ListItemText
                    primary={typeof group.name === 'string' ? group.name : '[Encrypted]'}
                    secondary={
                      <Box>
                        {group.description && typeof group.description === 'string' && (
                          <Typography variant="body2" color="text.secondary">
                            {group.description}
                          </Typography>
                        )}
                        {typeof group.description === 'object' && (
                          <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                            [Encrypted Description]
                          </Typography>
                        )}
                        <Typography variant="caption" color="text.secondary">
                          {Array.isArray(group.members) ? (
                            <>
                              {(group.members as string[]).length} member{(group.members as string[]).length !== 1 ? 's' : ''}
                              {(group.members as string[]).length > 0 && ': '}
                              {(group.members as string[]).slice(0, 3).join(', ')}
                              {(group.members as string[]).length > 3 && ` and ${(group.members as string[]).length - 3} more`}
                            </>
                          ) : (
                            '[Encrypted Members]'
                          )}
                        </Typography>
                      </Box>
                    }
                  />
                  <ListItemSecondaryAction>
                    <IconButton
                      edge="end"
                      onClick={() => handleEditGroup(group)}
                      sx={{ mr: 1 }}
                    >
                      <Edit />
                    </IconButton>
                    <IconButton
                      edge="end"
                      onClick={() => handleDeleteGroup(group.id!)}
                      color="error"
                    >
                      <Delete />
                    </IconButton>
                  </ListItemSecondaryAction>
                </ListItem>
                {index < groups.length - 1 && <Divider />}
              </React.Fragment>
            ))}
          </List>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};

export default GroupManagement;