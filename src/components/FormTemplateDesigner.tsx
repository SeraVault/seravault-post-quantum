import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Typography,
  Card,
  CardContent,
  IconButton,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Switch,
  FormControlLabel,
  Chip,
  Divider,
  Alert,
  Snackbar,
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  DragHandle as DragIcon,
  Save as SaveIcon,
  Preview as PreviewIcon,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthContext';
import type { FormTemplate, FormFieldDefinition } from '../utils/formFiles';
import { saveCustomTemplate, updateCustomTemplate, type CustomTemplate } from '../services/customTemplates';

interface FormTemplateDesignerProps {
  open: boolean;
  onClose: () => void;
  template?: FormTemplate | null;
  customTemplate?: CustomTemplate | null;
  onSave?: (templateId: string) => void;
}

const FIELD_TYPES = [
  { value: 'text', label: 'Text' },
  { value: 'password', label: 'Password' },
  { value: 'email', label: 'Email' },
  { value: 'textarea', label: 'Textarea' },
  { value: 'richtext', label: 'Rich Text' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'select', label: 'Select' },
  { value: 'file', label: 'File Upload' },
];

const CATEGORIES = [
  'Finance',
  'Security', 
  'Personal',
  'Health',
  'Legal',
  'Tech',
  'Business',
  'Education',
  'Other'
];

const FormTemplateDesigner: React.FC<FormTemplateDesignerProps> = ({
  open,
  onClose,
  template,
  customTemplate,
  onSave
}) => {
  const { t } = useTranslation();
  const { user } = useAuth();

  // Determine initial values from template or customTemplate
  const initialTemplate = customTemplate || template;
  
  // Template metadata
  const [templateName, setTemplateName] = useState(initialTemplate?.name || '');
  const [templateDescription, setTemplateDescription] = useState(initialTemplate?.description || '');
  const [templateCategory, setTemplateCategory] = useState(initialTemplate?.category || '');
  const [templateColor, setTemplateColor] = useState(initialTemplate?.color || '#1976d2');
  const [templateIcon, setTemplateIcon] = useState(initialTemplate?.icon || 'Extension');
  const [isPublicTemplate, setIsPublicTemplate] = useState(initialTemplate?.isPublic || false);

  // Template fields
  const [fields, setFields] = useState<FormFieldDefinition[]>(
    initialTemplate?.schema?.fields || [
      {
        id: 'field_1',
        type: 'text',
        label: 'Field 1',
        required: false,
        sensitive: false,
      }
    ]
  );

  const [previewMode, setPreviewMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  
  // Track if we're editing an existing template
  const isEditing = !!customTemplate;

  const handleClose = () => {
    if (!saving) {
      setPreviewMode(false);
      setSaveError(null);
      setSaveSuccess(null);
      onClose();
    }
  };

  const addField = () => {
    const newField: FormFieldDefinition = {
      id: `field_${Date.now()}`,
      type: 'text',
      label: `New Field ${fields.length + 1}`,
      required: false,
      sensitive: false,
    };
    setFields([...fields, newField]);
  };

  const updateField = (index: number, updates: Partial<FormFieldDefinition>) => {
    const updatedFields = fields.map((field, i) => 
      i === index ? { ...field, ...updates } : field
    );
    setFields(updatedFields);
  };

  const deleteField = (index: number) => {
    setFields(fields.filter((_, i) => i !== index));
  };

  const moveField = (fromIndex: number, toIndex: number) => {
    const updatedFields = [...fields];
    const [movedField] = updatedFields.splice(fromIndex, 1);
    updatedFields.splice(toIndex, 0, movedField);
    setFields(updatedFields);
  };

  const handleSave = async () => {
    if (!user) {
      setSaveError('You must be logged in to save templates');
      return;
    }

    if (!templateName.trim()) {
      setSaveError('Please enter a template name');
      return;
    }

    if (fields.length === 0) {
      setSaveError('Please add at least one field');
      return;
    }

    setSaving(true);
    setSaveError(null);
    setSaveSuccess(null);

    try {
      const templateData: FormTemplate = {
        templateId: customTemplate?.templateId || `custom_${Date.now()}_${user.uid}`,
        name: templateName,
        description: templateDescription,
        category: templateCategory,
        icon: templateIcon,
        color: templateColor,
        version: '1.0.0',
        isPublic: isPublicTemplate,
        isOfficial: false,
        schema: {
          fields: fields
        },
        defaultData: {},
        tags: []
      };

      let savedTemplateId: string;

      if (isEditing && customTemplate) {
        // Update existing template
        await updateCustomTemplate(user.uid, customTemplate.templateId, templateData);
        savedTemplateId = customTemplate.templateId;
        setSaveSuccess('Template updated successfully!');
      } else {
        // Create new template
        savedTemplateId = await saveCustomTemplate(user.uid, templateData);
        setSaveSuccess('Template saved successfully!');
      }

      onSave?.(savedTemplateId);
      
      // Close dialog after short delay to show success message
      setTimeout(() => {
        handleClose();
      }, 1500);

    } catch (error) {
      console.error('Error saving template:', error);
      setSaveError(error instanceof Error ? error.message : 'Failed to save template');
    } finally {
      setSaving(false);
    }
  };

  const renderFieldEditor = (field: FormFieldDefinition, index: number) => (
    <Card key={field.id} sx={{ mb: 2 }}>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <IconButton size="small" sx={{ mr: 1, cursor: 'grab' }}>
            <DragIcon />
          </IconButton>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            Field {index + 1}
          </Typography>
          <IconButton 
            color="error" 
            size="small" 
            onClick={() => deleteField(index)}
            disabled={fields.length <= 1}
          >
            <DeleteIcon />
          </IconButton>
        </Box>

        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 2 }}>
          <TextField
            label="Field Label"
            value={field.label}
            onChange={(e) => updateField(index, { label: e.target.value })}
            size="small"
            fullWidth
          />

          <FormControl size="small" fullWidth>
            <InputLabel>Field Type</InputLabel>
            <Select
              value={field.type}
              label="Field Type"
              onChange={(e) => updateField(index, { type: e.target.value as any })}
            >
              {FIELD_TYPES.map(type => (
                <MenuItem key={type.value} value={type.value}>
                  {type.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <TextField
            label="Placeholder"
            value={field.placeholder || ''}
            onChange={(e) => updateField(index, { placeholder: e.target.value })}
            size="small"
            fullWidth
          />
        </Box>

        <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
          <FormControlLabel
            control={
              <Switch
                checked={field.required || false}
                onChange={(e) => updateField(index, { required: e.target.checked })}
              />
            }
            label="Required"
          />

          <FormControlLabel
            control={
              <Switch
                checked={field.sensitive || false}
                onChange={(e) => updateField(index, { sensitive: e.target.checked })}
              />
            }
            label="Sensitive"
          />
        </Box>

        {field.type === 'select' && (
          <TextField
            label="Options (comma separated)"
            value={field.options?.join(', ') || ''}
            onChange={(e) => updateField(index, { 
              options: e.target.value.split(',').map(opt => opt.trim()).filter(Boolean)
            })}
            size="small"
            fullWidth
            sx={{ mt: 2 }}
            placeholder="Option 1, Option 2, Option 3"
          />
        )}
      </CardContent>
    </Card>
  );

  const renderPreview = () => (
    <Box>
      <Typography variant="h5" gutterBottom>
        {templateName || 'Untitled Template'}
      </Typography>
      <Typography variant="body2" color="text.secondary" gutterBottom>
        {templateDescription || 'No description'}
      </Typography>
      
      {templateCategory && (
        <Chip 
          label={templateCategory} 
          size="small" 
          sx={{ mb: 2, bgcolor: templateColor + '20', color: templateColor }}
        />
      )}

      <Divider sx={{ my: 2 }} />

      <Typography variant="h6" gutterBottom>Form Fields Preview</Typography>
      
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {fields.map((field, index) => (
          <Box key={field.id}>
            <Typography variant="body2" sx={{ mb: 0.5 }}>
              {field.label}
              {field.required && <span style={{ color: 'red' }}> *</span>}
              {field.sensitive && (
                <Chip label="Sensitive" size="small" color="warning" sx={{ ml: 1 }} />
              )}
            </Typography>
            
            {field.type === 'textarea' ? (
              <TextField
                multiline
                rows={3}
                placeholder={field.placeholder}
                disabled
                fullWidth
                size="small"
              />
            ) : field.type === 'select' ? (
              <FormControl fullWidth size="small">
                <Select disabled displayEmpty>
                  <MenuItem value="">
                    <em>{field.placeholder || 'Select an option'}</em>
                  </MenuItem>
                  {field.options?.map((option, i) => (
                    <MenuItem key={i} value={option}>{option}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            ) : field.type === 'checkbox' ? (
              <FormControlLabel
                control={<Switch disabled />}
                label={field.placeholder || 'Checkbox option'}
              />
            ) : (
              <TextField
                type={field.type === 'password' ? 'password' : field.type}
                placeholder={field.placeholder}
                disabled
                fullWidth
                size="small"
              />
            )}
          </Box>
        ))}
      </Box>
    </Box>
  );

  return (
    <Dialog 
      open={open} 
      onClose={handleClose}
      maxWidth="lg"
      fullWidth
      PaperProps={{ sx: { minHeight: '80vh' } }}
    >
      <DialogTitle sx={{ pb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant="h5">
            {isEditing ? 'Edit Template' : 'Create Form Template'}
          </Typography>
          <Button
            startIcon={<PreviewIcon />}
            onClick={() => setPreviewMode(!previewMode)}
            variant={previewMode ? 'contained' : 'outlined'}
            disabled={saving}
          >
            {previewMode ? 'Edit' : 'Preview'}
          </Button>
        </Box>
      </DialogTitle>

      <DialogContent>
        {!previewMode ? (
          <Box>
            <Alert severity="info" sx={{ mb: 3 }}>
              Design custom form templates for your team. Templates can be reused to create forms with consistent structure.
            </Alert>

            {/* Template Metadata */}
            <Typography variant="h6" gutterBottom>Template Information</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 2, mb: 3 }}>
              <TextField
                label="Template Name"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                required
                fullWidth
              />

              <TextField
                label="Description"
                value={templateDescription}
                onChange={(e) => setTemplateDescription(e.target.value)}
                fullWidth
              />

              <FormControl fullWidth>
                <InputLabel>Category</InputLabel>
                <Select
                  value={templateCategory}
                  label="Category"
                  onChange={(e) => setTemplateCategory(e.target.value)}
                >
                  {CATEGORIES.map(cat => (
                    <MenuItem key={cat} value={cat}>{cat}</MenuItem>
                  ))}
                </Select>
              </FormControl>

              <TextField
                label="Color"
                type="color"
                value={templateColor}
                onChange={(e) => setTemplateColor(e.target.value)}
                fullWidth
              />
            </Box>

            <Box sx={{ mt: 2 }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={isPublicTemplate}
                    onChange={(e) => setIsPublicTemplate(e.target.checked)}
                  />
                }
                label="Make template public (others can use this template)"
              />
            </Box>

            <Divider sx={{ my: 3 }} />

            {/* Fields Editor */}
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
              <Typography variant="h6">Form Fields</Typography>
              <Button startIcon={<AddIcon />} onClick={addField} variant="outlined">
                Add Field
              </Button>
            </Box>

            <Box sx={{ maxHeight: '400px', overflow: 'auto' }}>
              {fields.map((field, index) => renderFieldEditor(field, index))}
            </Box>
          </Box>
        ) : (
          renderPreview()
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={handleClose} disabled={saving}>
          Cancel
        </Button>
        <Button
          onClick={handleSave}
          variant="contained"
          startIcon={<SaveIcon />}
          disabled={!templateName.trim() || fields.length === 0 || saving}
        >
          {saving ? 'Saving...' : isEditing ? 'Update Template' : 'Save Template'}
        </Button>
      </DialogActions>

      {/* Error and Success Notifications */}
      <Snackbar
        open={!!saveError}
        autoHideDuration={6000}
        onClose={() => setSaveError(null)}
        message={saveError}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        sx={{ '& .MuiSnackbarContent-root': { backgroundColor: 'error.main' } }}
      />
      
      <Snackbar
        open={!!saveSuccess}
        autoHideDuration={3000}
        onClose={() => setSaveSuccess(null)}
        message={saveSuccess}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        sx={{ '& .MuiSnackbarContent-root': { backgroundColor: 'success.main' } }}
      />
    </Dialog>
  );
};

export default FormTemplateDesigner;