import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  IconButton,
  Paper,
  Divider,
  Switch,
  FormControlLabel,
  Chip,
  Alert,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Checkbox,
  Tooltip,
  InputAdornment,
  Stack,
} from '@mui/material';
import {
  Close,
  Add,
  Delete,
  DragIndicator,
  ExpandMore,
  TextFields,
  Lock,
  Email,
  Numbers,
  CalendarMonth,
  ArrowDropDownCircle,
  Notes,
  Code,
  AttachFile,
  Palette,
  Category,
  Save,
  ArrowUpward,
  ArrowDownward,
  ContentCopy,
} from '@mui/icons-material';
import type { FormFieldDefinition, FormTemplate } from '../utils/formFiles';

interface FormTemplateEditorProps {
  open: boolean;
  onClose: () => void;
  onSave: (template: FormTemplate) => void;
  existingTemplate?: FormTemplate; // For editing existing templates
  userId: string;
}

const FIELD_TYPE_OPTIONS: Array<{ value: FormFieldDefinition['type']; label: string; icon: React.ReactNode }> = [
  { value: 'text', label: 'Text', icon: <TextFields /> },
  { value: 'password', label: 'Password', icon: <Lock /> },
  { value: 'email', label: 'Email', icon: <Email /> },
  { value: 'number', label: 'Number', icon: <Numbers /> },
  { value: 'date', label: 'Date', icon: <CalendarMonth /> },
  { value: 'select', label: 'Dropdown', icon: <ArrowDropDownCircle /> },
  { value: 'textarea', label: 'Text Area', icon: <Notes /> },
  { value: 'richtext', label: 'Rich Text', icon: <Code /> },
  { value: 'file', label: 'File Attachment', icon: <AttachFile /> },
];

const ICON_OPTIONS = [
  'credit_card', 'password', 'secure_note', 'bank_account', 'identity', 
  'wifi_network', 'crypto_wallet', 'medical_record', 'legal_document', 
  'software_license', 'insurance_policy', 'vehicle_info'
];

const CATEGORY_OPTIONS = [
  'Finance', 'Identity', 'Security', 'Medical', 'Legal', 'Technology', 'Personal', 'Other'
];

const COLOR_PRESETS = [
  '#1976d2', '#d32f2f', '#388e3c', '#f57c00', '#7b1fa2', 
  '#0288d1', '#c62828', '#00796b', '#455a64', '#5d4037'
];

const FormTemplateEditor: React.FC<FormTemplateEditorProps> = ({
  open,
  onClose,
  onSave,
  existingTemplate,
  userId,
}) => {

  // Template metadata state
  const [templateName, setTemplateName] = useState(existingTemplate?.name || '');
  const [description, setDescription] = useState(existingTemplate?.description || '');
  const [category, setCategory] = useState(existingTemplate?.category || '');
  const [icon, setIcon] = useState(existingTemplate?.icon || 'extension');
  const [color, setColor] = useState(existingTemplate?.color || '#1976d2');
  const [isPublic, setIsPublic] = useState(existingTemplate?.isPublic || false);
  const [titleField, setTitleField] = useState(existingTemplate?.titleField || '');
  
  // Fields state
  const [fields, setFields] = useState<FormFieldDefinition[]>(
    existingTemplate?.schema.fields || []
  );
  
  // Sections state
  const [sections, setSections] = useState(existingTemplate?.schema.sections || []);
  const [useSections, setUseSections] = useState((existingTemplate?.schema.sections?.length || 0) > 0);
  
  // UI state
  const [errors, setErrors] = useState<string[]>([]);
  const [expandedFieldId, setExpandedFieldId] = useState<string | null>(null);

  // Reset form when dialog opens/closes
  React.useEffect(() => {
    if (open) {
      if (existingTemplate) {
        setTemplateName(existingTemplate.name);
        setDescription(existingTemplate.description || '');
        setCategory(existingTemplate.category || '');
        setIcon(existingTemplate.icon || 'extension');
        setColor(existingTemplate.color || '#1976d2');
        setIsPublic(existingTemplate.isPublic || false);
        setTitleField(existingTemplate.titleField || '');
        setFields(existingTemplate.schema.fields);
        setSections(existingTemplate.schema.sections || []);
        setUseSections((existingTemplate.schema.sections?.length || 0) > 0);
      } else {
        // Reset to defaults
        setTemplateName('');
        setDescription('');
        setCategory('');
        setIcon('extension');
        setColor('#1976d2');
        setIsPublic(false);
        setTitleField('');
        setFields([]);
        setSections([]);
        setUseSections(false);
      }
      setErrors([]);
      setExpandedFieldId(null);
    }
  }, [open, existingTemplate]);

  const addField = () => {
    const newField: FormFieldDefinition = {
      id: `field_${Date.now()}`,
      type: 'text',
      label: 'New Field',
      placeholder: '',
      required: false,
      sensitive: false,
    };
    setFields([...fields, newField]);
    setExpandedFieldId(newField.id);
  };

  const duplicateField = (fieldId: string) => {
    const fieldIndex = fields.findIndex(f => f.id === fieldId);
    if (fieldIndex === -1) return;
    
    const originalField = fields[fieldIndex];
    const newField: FormFieldDefinition = {
      ...originalField,
      id: `field_${Date.now()}`,
      label: `${originalField.label} (Copy)`,
    };
    
    const newFields = [...fields];
    newFields.splice(fieldIndex + 1, 0, newField);
    setFields(newFields);
    setExpandedFieldId(newField.id);
  };

  const deleteField = (fieldId: string) => {
    setFields(fields.filter(f => f.id !== fieldId));
    if (expandedFieldId === fieldId) {
      setExpandedFieldId(null);
    }
  };

  const updateField = (fieldId: string, updates: Partial<FormFieldDefinition>) => {
    setFields(fields.map(f => f.id === fieldId ? { ...f, ...updates } : f));
  };

  const moveFieldUp = (index: number) => {
    if (index === 0) return;
    const newFields = [...fields];
    [newFields[index - 1], newFields[index]] = [newFields[index], newFields[index - 1]];
    setFields(newFields);
  };

  const moveFieldDown = (index: number) => {
    if (index === fields.length - 1) return;
    const newFields = [...fields];
    [newFields[index], newFields[index + 1]] = [newFields[index + 1], newFields[index]];
    setFields(newFields);
  };

  const addSelectOption = (fieldId: string) => {
    const field = fields.find(f => f.id === fieldId);
    if (!field) return;
    
    const options = field.options || [];
    updateField(fieldId, { options: [...options, 'New Option'] });
  };

  const updateSelectOption = (fieldId: string, optionIndex: number, value: string) => {
    const field = fields.find(f => f.id === fieldId);
    if (!field || !field.options) return;
    
    const newOptions = [...field.options];
    newOptions[optionIndex] = value;
    updateField(fieldId, { options: newOptions });
  };

  const deleteSelectOption = (fieldId: string, optionIndex: number) => {
    const field = fields.find(f => f.id === fieldId);
    if (!field || !field.options) return;
    
    const newOptions = field.options.filter((_, i) => i !== optionIndex);
    updateField(fieldId, { options: newOptions });
  };

  const validateTemplate = (): boolean => {
    const newErrors: string[] = [];

    if (!templateName.trim()) {
      newErrors.push('Template name is required');
    }

    if (fields.length === 0) {
      newErrors.push('At least one field is required');
    }

    fields.forEach((field, index) => {
      if (!field.label.trim()) {
        newErrors.push(`Field ${index + 1} must have a label`);
      }
      
      if (field.type === 'select' && (!field.options || field.options.length === 0)) {
        newErrors.push(`Field "${field.label}" (dropdown) must have at least one option`);
      }
    });

    setErrors(newErrors);
    return newErrors.length === 0;
  };

  const handleSave = () => {
    if (!validateTemplate()) return;

    // Build schema object, only include sections if they exist
    const schema: FormTemplate['schema'] = {
      fields,
    };
    
    if (useSections && sections.length > 0) {
      schema.sections = sections;
    }

    const template: Partial<FormTemplate> = {
      templateId: existingTemplate?.templateId || `template_${Date.now()}`,
      name: templateName,
      description,
      category,
      icon,
      color,
      version: existingTemplate?.version || '1.0.0',
      author: userId,
      isPublic,
      isOfficial: false,
      schema,
      defaultData: fields.reduce((acc, field) => {
        acc[field.id] = field.type === 'file' ? [] : '';
        return acc;
      }, {} as { [key: string]: string | string[] }),
      tags: category ? [category] : [],
      usageCount: existingTemplate?.usageCount || 0,
    };
    
    // Only include titleField if it has a value
    if (titleField) {
      template.titleField = titleField;
    }

    onSave(template as FormTemplate);
  };

  const renderFieldEditor = (field: FormFieldDefinition, index: number) => {
    const isExpanded = expandedFieldId === field.id;
    const fieldTypeOption = FIELD_TYPE_OPTIONS.find(opt => opt.value === field.type);

    return (
      <Paper
        key={field.id}
        elevation={1}
        sx={{
          mb: 2,
          border: isExpanded ? 2 : 1,
          borderColor: isExpanded ? 'primary.main' : 'divider',
          transition: 'all 0.2s ease',
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            p: 2,
            bgcolor: isExpanded ? 'action.selected' : 'background.paper',
            cursor: 'pointer',
          }}
          onClick={() => setExpandedFieldId(isExpanded ? null : field.id)}
        >
          <Box sx={{ mr: 1, display: 'flex', color: 'text.secondary' }}>
            <DragIndicator />
          </Box>
              
              <Box sx={{ mr: 2, display: 'flex', color: 'text.secondary' }}>
                {fieldTypeOption?.icon}
              </Box>

              <Box sx={{ flex: 1 }}>
                <Typography variant="subtitle1" fontWeight={500}>
                  {field.label || 'Untitled Field'}
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, mt: 0.5 }}>
                  <Chip label={fieldTypeOption?.label} size="small" variant="outlined" />
                  {field.required && <Chip label="Required" size="small" color="error" />}
                  {field.sensitive && <Chip label="Sensitive" size="small" color="warning" />}
                </Box>
              </Box>

              <Box sx={{ display: 'flex', gap: 0.5 }}>
                <Tooltip title="Move Up">
                  <span>
                    <IconButton
                      size="small"
                      onClick={(e) => { e.stopPropagation(); moveFieldUp(index); }}
                      disabled={index === 0}
                    >
                      <ArrowUpward fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
                <Tooltip title="Move Down">
                  <span>
                    <IconButton
                      size="small"
                      onClick={(e) => { e.stopPropagation(); moveFieldDown(index); }}
                      disabled={index === fields.length - 1}
                    >
                      <ArrowDownward fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
                <Tooltip title="Duplicate">
                  <IconButton
                    size="small"
                    onClick={(e) => { e.stopPropagation(); duplicateField(field.id); }}
                  >
                    <ContentCopy fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Delete">
                  <IconButton
                    size="small"
                    color="error"
                    onClick={(e) => { e.stopPropagation(); deleteField(field.id); }}
                  >
                    <Delete fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Box>
            </Box>

            {isExpanded && (
              <Box sx={{ p: 2, pt: 0, borderTop: 1, borderColor: 'divider' }}>
                <Stack spacing={2} sx={{ mt: 1 }}>
                  {/* Label and Type */}
                  <Box sx={{ display: 'flex', gap: 2, flexDirection: { xs: 'column', md: 'row' } }}>
                    <TextField
                      fullWidth
                      label="Field Label"
                      value={field.label}
                      onChange={(e) => updateField(field.id, { label: e.target.value })}
                      required
                      size="small"
                    />

                    <FormControl fullWidth size="small">
                      <InputLabel>Field Type</InputLabel>
                      <Select
                        value={field.type}
                        onChange={(e) => updateField(field.id, { type: e.target.value as FormFieldDefinition['type'] })}
                        label="Field Type"
                      >
                        {FIELD_TYPE_OPTIONS.map(option => (
                          <MenuItem key={option.value} value={option.value}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              {option.icon}
                              {option.label}
                            </Box>
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Box>

                  {/* Placeholder */}
                  <TextField
                    fullWidth
                    label="Placeholder Text (Optional)"
                    value={field.placeholder || ''}
                    onChange={(e) => updateField(field.id, { placeholder: e.target.value })}
                    size="small"
                  />

                  {/* Options for Select fields */}
                  {field.type === 'select' && (
                    <Box>
                      <Typography variant="subtitle2" sx={{ mb: 1 }}>
                        Dropdown Options
                      </Typography>
                      {(field.options || []).map((option, optionIndex) => (
                        <Box key={optionIndex} sx={{ display: 'flex', gap: 1, mb: 1 }}>
                          <TextField
                            fullWidth
                            value={option}
                            onChange={(e) => updateSelectOption(field.id, optionIndex, e.target.value)}
                            size="small"
                            placeholder={`Option ${optionIndex + 1}`}
                          />
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => deleteSelectOption(field.id, optionIndex)}
                          >
                            <Delete />
                          </IconButton>
                        </Box>
                      ))}
                      <Button
                        startIcon={<Add />}
                        onClick={() => addSelectOption(field.id)}
                        size="small"
                        variant="outlined"
                      >
                        Add Option
                      </Button>
                    </Box>
                  )}

                  {/* File Configuration */}
                  {field.type === 'file' && (
                    <Box>
                      <Typography variant="subtitle2" sx={{ mb: 1 }}>
                        File Upload Settings
                      </Typography>
                      <Stack spacing={2}>
                        <Box sx={{ display: 'flex', gap: 2, flexDirection: { xs: 'column', sm: 'row' } }}>
                          <TextField
                            fullWidth
                            type="number"
                            label="Max Files"
                            value={field.fileConfig?.maxFiles || 5}
                            onChange={(e) => updateField(field.id, {
                              fileConfig: { ...field.fileConfig, maxFiles: parseInt(e.target.value) }
                            })}
                            size="small"
                            InputProps={{ inputProps: { min: 1, max: 20 } }}
                          />
                          <TextField
                            fullWidth
                            type="number"
                            label="Max File Size (MB)"
                            value={(field.fileConfig?.maxFileSize || 10485760) / 1048576}
                            onChange={(e) => updateField(field.id, {
                              fileConfig: { ...field.fileConfig, maxFileSize: parseInt(e.target.value) * 1048576 }
                            })}
                            size="small"
                            InputProps={{ inputProps: { min: 1, max: 100 } }}
                          />
                        </Box>
                        <TextField
                          fullWidth
                          label="Description/Help Text"
                          value={field.fileConfig?.description || ''}
                          onChange={(e) => updateField(field.id, {
                            fileConfig: { ...field.fileConfig, description: e.target.value }
                          })}
                          size="small"
                          multiline
                          rows={2}
                        />
                      </Stack>
                    </Box>
                  )}

                  {/* Validation */}
                  <Box>
                    <Divider sx={{ my: 1 }} />
                    <Typography variant="subtitle2" sx={{ mb: 1 }}>
                      Validation & Security
                    </Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                      <FormControlLabel
                        control={
                          <Checkbox
                            checked={field.required || false}
                            onChange={(e) => updateField(field.id, { required: e.target.checked })}
                          />
                        }
                        label="Required Field"
                      />
                      <FormControlLabel
                        control={
                          <Checkbox
                            checked={field.sensitive || false}
                            onChange={(e) => updateField(field.id, { sensitive: e.target.checked })}
                          />
                        }
                        label="Sensitive (Hidden)"
                      />
                    </Box>
                  </Box>

                  {/* Advanced Validation */}
                  {['text', 'textarea', 'password'].includes(field.type) && (
                    <Box>
                      <Accordion>
                        <AccordionSummary expandIcon={<ExpandMore />}>
                          <Typography variant="body2">Advanced Validation (Optional)</Typography>
                        </AccordionSummary>
                        <AccordionDetails>
                          <Stack spacing={2}>
                            <Box sx={{ display: 'flex', gap: 2 }}>
                              <TextField
                                fullWidth
                                type="number"
                                label="Min Length"
                                value={field.validation?.minLength || ''}
                                onChange={(e) => updateField(field.id, {
                                  validation: { ...field.validation, minLength: e.target.value ? parseInt(e.target.value) : undefined }
                                })}
                                size="small"
                              />
                              <TextField
                                fullWidth
                                type="number"
                                label="Max Length"
                                value={field.validation?.maxLength || ''}
                                onChange={(e) => updateField(field.id, {
                                  validation: { ...field.validation, maxLength: e.target.value ? parseInt(e.target.value) : undefined }
                                })}
                                size="small"
                              />
                            </Box>
                            <TextField
                              fullWidth
                              label="Pattern (Regex)"
                              value={field.validation?.pattern || ''}
                              onChange={(e) => updateField(field.id, {
                                validation: { ...field.validation, pattern: e.target.value }
                              })}
                              size="small"
                              placeholder="e.g., ^[A-Z0-9]+$"
                            />
                            <TextField
                              fullWidth
                              label="Custom Error Message"
                              value={field.validation?.customMessage || ''}
                              onChange={(e) => updateField(field.id, {
                                validation: { ...field.validation, customMessage: e.target.value }
                              })}
                              size="small"
                            />
                          </Stack>
                        </AccordionDetails>
                      </Accordion>
                    </Box>
                  )}
                </Stack>
              </Box>
            )}
          </Paper>
    );
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{ sx: { height: '90vh' } }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        {existingTemplate ? 'Edit Form Template' : 'Create Form Template'}
        <IconButton onClick={onClose} size="small">
          <Close />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers sx={{ p: 3 }}>
        {errors.length > 0 && (
          <Alert severity="error" sx={{ mb: 3 }} onClose={() => setErrors([])}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>Please fix the following errors:</Typography>
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {errors.map((error, index) => (
                <li key={index}>{error}</li>
              ))}
            </ul>
          </Alert>
        )}

        {/* Template Metadata */}
        <Paper elevation={0} sx={{ p: 3, mb: 3, bgcolor: 'background.default' }}>
          <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
            <Category /> Template Information
          </Typography>
          
          <Stack spacing={2}>
            <Box sx={{ display: 'flex', gap: 2, flexDirection: { xs: 'column', md: 'row' } }}>
              <TextField
                fullWidth
                label="Template Name"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                required
                placeholder="e.g., Employee Information Form"
                sx={{ flex: 2 }}
              />
            
              <FormControl fullWidth sx={{ flex: 1 }}>
                <InputLabel>Category</InputLabel>
                <Select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  label="Category"
                >
                  {CATEGORY_OPTIONS.map(cat => (
                    <MenuItem key={cat} value={cat}>{cat}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>

            <TextField
              fullWidth
              label="Description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              multiline
              rows={2}
              placeholder="Describe what this template is for..."
            />

            <Box sx={{ display: 'flex', gap: 2, flexDirection: { xs: 'column', md: 'row' } }}>
              <FormControl fullWidth>
                <InputLabel>Icon</InputLabel>
                <Select
                  value={icon}
                  onChange={(e) => setIcon(e.target.value)}
                  label="Icon"
                >
                  {ICON_OPTIONS.map(iconOption => (
                    <MenuItem key={iconOption} value={iconOption}>
                      {iconOption.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <Box sx={{ width: '100%' }}>
                <TextField
                  fullWidth
                  label="Color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <Palette sx={{ color }} />
                      </InputAdornment>
                    ),
                  }}
                />
                <Box sx={{ display: 'flex', gap: 1, mt: 1, flexWrap: 'wrap' }}>
                  {COLOR_PRESETS.map(presetColor => (
                    <Box
                      key={presetColor}
                      onClick={() => setColor(presetColor)}
                      sx={{
                        width: 24,
                        height: 24,
                        bgcolor: presetColor,
                        borderRadius: '50%',
                        cursor: 'pointer',
                        border: color === presetColor ? '3px solid' : '2px solid',
                        borderColor: color === presetColor ? 'primary.main' : 'divider',
                        '&:hover': { transform: 'scale(1.1)' },
                      }}
                    />
                  ))}
                </Box>
              </Box>
            </Box>

            <Box sx={{ display: 'flex', gap: 2, flexDirection: { xs: 'column', md: 'row' } }}>
              <FormControl fullWidth>
                <InputLabel>Title Field (Optional)</InputLabel>
                <Select
                  value={titleField}
                  onChange={(e) => setTitleField(e.target.value)}
                  label="Title Field (Optional)"
                >
                  <MenuItem value="">None</MenuItem>
                  {fields.map(field => (
                    <MenuItem key={field.id} value={field.id}>
                      {field.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <FormControlLabel
                control={
                  <Switch
                    checked={isPublic}
                    onChange={(e) => setIsPublic(e.target.checked)}
                  />
                }
                label="Make this template public (shareable)"
                sx={{ alignSelf: 'center', minWidth: '300px' }}
              />
            </Box>
          </Stack>
        </Paper>

        {/* Fields Section */}
        <Paper elevation={0} sx={{ p: 3, bgcolor: 'background.default' }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <TextFields /> Form Fields ({fields.length})
            </Typography>
            <Button
              variant="contained"
              startIcon={<Add />}
              onClick={addField}
              size="small"
            >
              Add Field
            </Button>
          </Box>

          {fields.length === 0 ? (
            <Box
              sx={{
                p: 4,
                textAlign: 'center',
                border: 2,
                borderStyle: 'dashed',
                borderColor: 'divider',
                borderRadius: 1,
              }}
            >
              <Typography color="text.secondary">
                No fields yet. Click "Add Field" to get started.
              </Typography>
            </Box>
          ) : (
            <Box>
              {fields.map((field, index) => renderFieldEditor(field, index))}
            </Box>
          )}
        </Paper>
      </DialogContent>

      <DialogActions sx={{ p: 2, gap: 1 }}>
        <Button onClick={onClose} variant="outlined">
          Cancel
        </Button>
        <Button
          onClick={handleSave}
          variant="contained"
          startIcon={<Save />}
          disabled={!templateName.trim() || fields.length === 0}
        >
          Save Template
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default FormTemplateEditor;
