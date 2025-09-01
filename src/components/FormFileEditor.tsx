import React, { useState } from 'react';
import {
  Box,
  Typography,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Paper,
} from '@mui/material';
import type { SecureFormData } from '../utils/formFiles';
import type { FileData } from '../files';
import { saveFormAsFile, updateFormFile } from '../utils/formFiles';

interface FormFileEditorProps {
  file?: FileData; // undefined for new forms
  formData?: SecureFormData; // For new unsaved forms
  userId: string;
  privateKey: string;
  parentFolder: string | null;
  isNew?: boolean;
  onSave: () => void;
  onCancel: () => void;
}

const FormFileEditor: React.FC<FormFileEditorProps> = ({ 
  file, 
  formData,
  userId, 
  privateKey, 
  parentFolder, 
  isNew = false, 
  onSave, 
  onCancel 
}) => {
  const [currentFormData, setCurrentFormData] = useState<SecureFormData | null>(formData || null);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    console.log('=== FormFileEditor handleSave START ===');
    console.log('Parameters:', { 
      hasCurrentFormData: !!currentFormData, 
      userId, 
      hasPrivateKey: !!privateKey, 
      parentFolder,
      isNew 
    });
    
    if (!currentFormData) {
      console.error('No currentFormData available');
      return;
    }

    if (!userId) {
      console.error('No userId provided');
      alert('Error: User ID is required');
      return;
    }

    if (!privateKey) {
      console.error('No privateKey provided');
      alert('Error: Private key is required');
      return;
    }

    setSaving(true);
    try {
      if (isNew) {
        console.log('Creating new form file...');
        // Create new form file
        await saveFormAsFile(currentFormData, userId, privateKey, parentFolder);
        console.log('Form file created successfully');
      } else if (file?.id) {
        // Update existing form file
        await updateFormFile(file.id, currentFormData, userId, privateKey);
      } else {
        throw new Error('Cannot save: missing file ID for existing form');
      }
      console.log('Form save operation completed successfully');
      onSave();
    } catch (error) {
      console.error('=== ERROR in FormFileEditor handleSave ===');
      console.error('Error details:', error);
      console.error('Error type:', typeof error);
      
      let errorMessage = 'Unknown error occurred';
      if (error instanceof Error) {
        errorMessage = error.message;
        console.error('Error stack:', error.stack);
        console.error('Error cause:', error.cause);
      } else {
        errorMessage = String(error);
      }
      
      console.error('Final error message:', errorMessage);
      alert('Error saving form: ' + errorMessage);
    } finally {
      console.log('Setting saving to false');
      setSaving(false);
    }
  };

  const handleFieldChange = (fieldId: string, value: string) => {
    if (!currentFormData) return;

    const updatedFormData = {
      ...currentFormData,
      data: {
        ...currentFormData.data,
        [fieldId]: value
      }
    };

    // If the field is the template's title field, update the form name as well
    if (fieldId === updatedFormData.template?.titleField && value.trim()) {
      updatedFormData.metadata = {
        ...updatedFormData.metadata,
        name: value.trim()
      };
    }

    setCurrentFormData(updatedFormData);
  };

  if (!currentFormData) {
    return (
      <Dialog open onClose={onCancel} maxWidth="sm" fullWidth>
        <DialogTitle>Error</DialogTitle>
        <DialogContent>
          <Typography>No form data available to edit.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={onCancel}>Close</Button>
        </DialogActions>
      </Dialog>
    );
  }

  return (
    <Dialog open onClose={onCancel} maxWidth="md" fullWidth>
      <DialogTitle>{currentFormData.metadata.name}</DialogTitle>
      <DialogContent>
        <Box sx={{ py: 2 }}>
          <Typography variant="h6" gutterBottom>
            {currentFormData.metadata.description}
          </Typography>
          
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {currentFormData.schema.fields.map((field) => (
              <Paper key={field.id} sx={{ p: 2 }}>
                <TextField
                  fullWidth
                  label={field.label}
                  placeholder={field.placeholder}
                  multiline={field.type === 'textarea'}
                  rows={field.type === 'textarea' ? 4 : 1}
                  type={field.type === 'password' ? 'password' : 'text'}
                  value={currentFormData.data[field.id] || ''}
                  onChange={(e) => handleFieldChange(field.id, e.target.value)}
                  required={field.required}
                />
                {field.sensitive && (
                  <Typography variant="caption" color="warning.main" sx={{ mt: 1, display: 'block' }}>
                    🔒 This field contains sensitive information
                  </Typography>
                )}
              </Paper>
            ))}
          </Box>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button 
          onClick={handleSave} 
          variant="contained" 
          disabled={saving}
        >
          {saving ? 'Saving...' : 'Save Form'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default FormFileEditor;