import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Container,
  Typography,
  Button,
  Paper,
  Card,
  CardContent,
  CardActions,
  IconButton,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  Tabs,
  Tab,
  TextField,
  InputAdornment,
} from '@mui/material';
import {
  Add,
  Edit,
  Delete,
  Star,
  Search,
  FilterList,
} from '@mui/icons-material';
import { useAuth } from '../auth/AuthContext';
import FormTemplateEditor from '../components/FormTemplateEditor';
import type { FormTemplate } from '../utils/formFiles';
import { collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

const FormTemplatesPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<FormTemplate[]>([]);
  const [filteredTemplates, setFilteredTemplates] = useState<FormTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<FormTemplate | undefined>();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [templateToDelete, setTemplateToDelete] = useState<FormTemplate | null>(null);
  
  // Filter state
  const [currentTab, setCurrentTab] = useState(0); // 0: My Templates, 1: Public Templates
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');

  const loadTemplates = React.useCallback(async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      // Load user's custom templates
      const templatesRef = collection(db, 'formTemplates');
      const q = query(templatesRef, where('author', '==', user.uid));
      const snapshot = await getDocs(q);
      
      const customTemplates: FormTemplate[] = snapshot.docs.map(doc => ({
        ...doc.data(),
        templateId: doc.id,
      } as FormTemplate));

      // TODO: Also load public templates from other users
      // const publicQuery = query(templatesRef, where('isPublic', '==', true));
      // const publicSnapshot = await getDocs(publicQuery);
      
      setTemplates(customTemplates);
    } catch (error) {
      console.error('Error loading templates:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  const applyFilters = React.useCallback(() => {
    let filtered = [...templates];

    // Tab filter (my templates vs public)
    if (currentTab === 0) {
      filtered = filtered.filter(t => t.author === user?.uid);
    } else {
      filtered = filtered.filter(t => t.isPublic);
    }

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(t =>
        t.name.toLowerCase().includes(query) ||
        t.description?.toLowerCase().includes(query) ||
        t.category?.toLowerCase().includes(query)
      );
    }

    // Category filter
    if (categoryFilter) {
      filtered = filtered.filter(t => t.category === categoryFilter);
    }

    setFilteredTemplates(filtered);
  }, [templates, searchQuery, categoryFilter, currentTab, user]);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  useEffect(() => {
    applyFilters();
  }, [applyFilters]);

  const handleCreateNew = () => {
    setSelectedTemplate(undefined);
    setEditorOpen(true);
  };

  const handleEdit = (template: FormTemplate) => {
    setSelectedTemplate(template);
    setEditorOpen(true);
  };

  const handleSaveTemplate = async (template: FormTemplate) => {
    try {
      const templatesRef = collection(db, 'formTemplates');
      
      if (selectedTemplate?.templateId) {
        // Update existing template
        const templateDoc = doc(db, 'formTemplates', selectedTemplate.templateId);
        await updateDoc(templateDoc, {
          ...template,
          updatedAt: serverTimestamp(),
        });
      } else {
        // Create new template
        await addDoc(templatesRef, {
          ...template,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      setEditorOpen(false);
      loadTemplates();
    } catch (error) {
      console.error('Error saving template:', error);
      alert('Failed to save template. Please try again.');
    }
  };

  const handleDeleteClick = (template: FormTemplate) => {
    setTemplateToDelete(template);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!templateToDelete?.templateId) return;

    try {
      await deleteDoc(doc(db, 'formTemplates', templateToDelete.templateId));
      setDeleteDialogOpen(false);
      setTemplateToDelete(null);
      loadTemplates();
    } catch (error) {
      console.error('Error deleting template:', error);
      alert('Failed to delete template. Please try again.');
    }
  };

  const getCategories = () => {
    const categories = new Set(templates.map(t => t.category).filter(Boolean));
    return Array.from(categories) as string[];
  };

  const renderTemplateCard = (template: FormTemplate) => {
    const isOwner = template.author === user?.uid;

    return (
      <Box key={template.templateId} sx={{ width: { xs: '100%', sm: '50%', md: '33.333%' }, p: 1.5 }}>
        <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
          <CardContent sx={{ flexGrow: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 1 }}>
              <Typography variant="h6" component="div" sx={{ fontWeight: 600 }}>
                {template.name}
              </Typography>
              {template.isOfficial && (
                <Star sx={{ color: 'warning.main', fontSize: 20 }} />
              )}
            </Box>

            <Typography variant="body2" color="text.secondary" sx={{ mb: 2, minHeight: 40 }}>
              {template.description || 'No description'}
            </Typography>

            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2 }}>
              {template.category && (
                <Chip
                  label={template.category}
                  size="small"
                  sx={{
                    bgcolor: template.color + '15',
                    color: template.color,
                    fontWeight: 500,
                  }}
                />
              )}
              <Chip
                label={`${template.schema.fields.length} fields`}
                size="small"
                variant="outlined"
              />
              {template.isPublic && (
                <Chip label="Public" size="small" color="primary" variant="outlined" />
              )}
            </Box>

            <Typography variant="caption" color="text.secondary">
              Used {template.usageCount || 0} times
            </Typography>
          </CardContent>

          <CardActions sx={{ justifyContent: 'space-between', px: 2, pb: 2 }}>
            <Box>
              {isOwner && (
                <>
                  <IconButton
                    size="small"
                    onClick={() => handleEdit(template)}
                    color="primary"
                  >
                    <Edit fontSize="small" />
                  </IconButton>
                  <IconButton
                    size="small"
                    onClick={() => handleDeleteClick(template)}
                    color="error"
                  >
                    <Delete fontSize="small" />
                  </IconButton>
                </>
              )}
            </Box>
            <Button
              size="small"
              variant="contained"
              onClick={() => {
                // Navigate to home page and trigger form creation with this template
                navigate('/?createForm=' + template.templateId);
              }}
            >
              Use Template
            </Button>
          </CardActions>
        </Card>
      </Box>
    );
  };

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      {/* Header */}
      <Box sx={{ mb: 4 }}>
          <Typography variant="h4" component="h1" gutterBottom fontWeight={600}>
            Form Templates
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Create and manage reusable form templates for your organization
          </Typography>
        </Box>

      {/* Toolbar */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
          <TextField
            placeholder="Search templates..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            size="small"
            sx={{ minWidth: 250 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Search />
                </InputAdornment>
              ),
            }}
          />

          <Button
            variant={categoryFilter ? 'contained' : 'outlined'}
            startIcon={<FilterList />}
            size="small"
            onClick={() => {
              // Simple category toggle - in real app, could be a menu
              const categories = getCategories();
              const currentIndex = categories.indexOf(categoryFilter);
              const nextIndex = (currentIndex + 1) % (categories.length + 1);
              setCategoryFilter(nextIndex === categories.length ? '' : categories[nextIndex]);
            }}
          >
            {categoryFilter || 'All Categories'}
          </Button>

          <Box sx={{ flexGrow: 1 }} />

          <Button
            variant="contained"
            startIcon={<Add />}
            onClick={handleCreateNew}
          >
            Create Template
          </Button>
        </Box>

        <Tabs
          value={currentTab}
          onChange={(_, newValue) => setCurrentTab(newValue)}
          sx={{ mt: 2 }}
        >
          <Tab label="My Templates" />
          <Tab label="Public Templates" />
        </Tabs>
      </Paper>

      {/* Templates Grid */}
      {loading ? (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <Typography color="text.secondary">Loading templates...</Typography>
        </Box>
      ) : filteredTemplates.length === 0 ? (
        <Paper sx={{ p: 8, textAlign: 'center' }}>
          <Typography variant="h6" color="text.secondary" gutterBottom>
            No templates found
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 3 }}>
            {currentTab === 0
              ? "You haven't created any templates yet. Click 'Create Template' to get started."
              : 'No public templates available at this time.'}
          </Typography>
          {currentTab === 0 && (
            <Button variant="contained" startIcon={<Add />} onClick={handleCreateNew}>
              Create Your First Template
            </Button>
          )}
        </Paper>
      ) : (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', margin: -1.5 }}>
          {filteredTemplates.map(renderTemplateCard)}
        </Box>
      )}

      {/* Template Editor Dialog */}
      <FormTemplateEditor
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        onSave={handleSaveTemplate}
        existingTemplate={selectedTemplate}
        userId={user?.uid || ''}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Delete Template?</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            This action cannot be undone. The template will be permanently deleted.
          </Alert>
          <Typography>
            Are you sure you want to delete the template "{templateToDelete?.name}"?
          </Typography>
          {templateToDelete && templateToDelete.usageCount && templateToDelete.usageCount > 0 && (
            <Typography color="error" sx={{ mt: 2 }}>
              This template has been used {templateToDelete.usageCount} times.
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleDeleteConfirm} color="error" variant="contained">
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default FormTemplatesPage;
