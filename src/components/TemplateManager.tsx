import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Chip,
  Divider,
} from '@mui/material';
import {
  Edit as EditIcon,
  Delete as DeleteIcon,
  Public as PublicIcon,
  Lock as PrivateIcon,
  Star as StarIcon,
} from '@mui/icons-material';
import { useFormTemplates } from '../context/FormTemplatesContext';
import { useAuth } from '../auth/AuthContext';

interface TemplateManagerProps {
  open: boolean;
  onClose: () => void;
}

const TemplateManager: React.FC<TemplateManagerProps> = ({ open, onClose }) => {
  const { user } = useAuth();
  const { userTemplates, popularTemplates, isAdmin, refreshTemplates, refreshPopularTemplates, deleteTemplate } = useFormTemplates();

  const handleDeleteTemplate = async (templateId: string, templateName: string) => {
    if (!window.confirm(`Are you sure you want to delete the template "${templateName}"?`)) {
      return;
    }

    try {
      await deleteTemplate(templateId);
      // Real-time listeners will automatically update the UI
    } catch (error) {
      console.error('Delete failed:', error);
      alert('Delete failed: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  };

  return (
    <Dialog 
      open={open} 
      onClose={onClose} 
      maxWidth="md" 
      fullWidth
      PaperProps={{ sx: { minHeight: '70vh' } }}
    >
      <DialogTitle>
        Template Manager
        {isAdmin && (
          <Chip 
            label="Admin" 
            color="primary" 
            size="small" 
            sx={{ ml: 2 }} 
          />
        )}
      </DialogTitle>
      
      <DialogContent dividers>

        {/* Public Templates */}
        <Typography variant="h6" sx={{ mb: 2 }}>
          Public Templates ({popularTemplates.length})
        </Typography>
        {popularTemplates.length === 0 ? (
          <Typography color="text.secondary" sx={{ mb: 3 }}>
            No public templates available.
          </Typography>
        ) : (
          <List sx={{ mb: 3 }}>
            {popularTemplates.map((template) => (
              <ListItem key={template.id} divider>
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography>{template.name}</Typography>
                      <PublicIcon sx={{ fontSize: 16, color: 'primary.main' }} />
                      {template.isOfficial && (
                        <StarIcon sx={{ fontSize: 16, color: 'warning.main' }} />
                      )}
                    </Box>
                  }
                  secondary={
                    <Box sx={{ mt: 1 }}>
                      <Typography variant="body2" color="text.secondary">
                        {template.description}
                      </Typography>
                      <Box sx={{ mt: 1, display: 'flex', gap: 1 }}>
                        {template.category && (
                          <Chip label={template.category} size="small" />
                        )}
                        <Chip label={`${template.schema.fields.length} fields`} size="small" variant="outlined" />
                        <Chip label={`${template.usageCount} uses`} size="small" color="primary" />
                      </Box>
                    </Box>
                  }
                />
                <ListItemSecondaryAction>
                  {(isAdmin || template.author === user?.uid) && (
                    <>
                      <IconButton 
                        edge="end" 
                        aria-label="edit"
                        sx={{ mr: 1 }}
                        onClick={() => {/* TODO: Implement edit */}}
                      >
                        <EditIcon />
                      </IconButton>
                      <IconButton 
                        edge="end" 
                        aria-label="delete"
                        onClick={() => handleDeleteTemplate(template.id!, template.name)}
                      >
                        <DeleteIcon />
                      </IconButton>
                    </>
                  )}
                </ListItemSecondaryAction>
              </ListItem>
            ))}
          </List>
        )}

        {/* User's Private Templates */}
        <Typography variant="h6" sx={{ mb: 2 }}>
          My Private Templates ({userTemplates.filter(t => t.author === user?.uid && !t.isPublic).length})
        </Typography>
        {userTemplates.filter(t => t.author === user?.uid && !t.isPublic).length === 0 ? (
          <Typography color="text.secondary" sx={{ mb: 3 }}>
            You haven't created any private templates yet.
          </Typography>
        ) : (
          <List>
            {userTemplates
              .filter(t => t.author === user?.uid && !t.isPublic)
              .map((template) => (
                <ListItem key={template.id} divider>
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography>{template.name}</Typography>
                        <PrivateIcon sx={{ fontSize: 16, color: 'grey.600' }} />
                      </Box>
                    }
                    secondary={
                      <Box sx={{ mt: 1 }}>
                        <Typography variant="body2" color="text.secondary">
                          {template.description}
                        </Typography>
                        <Box sx={{ mt: 1, display: 'flex', gap: 1 }}>
                          {template.category && (
                            <Chip label={template.category} size="small" />
                          )}
                          <Chip label={`${template.schema.fields.length} fields`} size="small" variant="outlined" />
                          <Chip label={`${template.usageCount} uses`} size="small" color="default" />
                        </Box>
                      </Box>
                    }
                  />
                  <ListItemSecondaryAction>
                    <IconButton 
                      edge="end" 
                      aria-label="edit"
                      sx={{ mr: 1 }}
                      onClick={() => {/* TODO: Implement edit */}}
                    >
                      <EditIcon />
                    </IconButton>
                    <IconButton 
                      edge="end" 
                      aria-label="delete"
                      onClick={() => handleDeleteTemplate(template.id!, template.name)}
                    >
                      <DeleteIcon />
                    </IconButton>
                  </ListItemSecondaryAction>
                </ListItem>
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

export default TemplateManager;