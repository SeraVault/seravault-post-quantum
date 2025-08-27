import React, { useCallback } from 'react';
import { Box, Typography } from '@mui/material';
import MDEditor from '@uiw/react-md-editor';
import '@uiw/react-md-editor/markdown-editor.css';

interface RichTextEditorProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  sensitive?: boolean;
  disabled?: boolean;
}

const RichTextEditor: React.FC<RichTextEditorProps> = ({
  label,
  value,
  onChange,
  placeholder = '',
  required = false,
  sensitive = false,
  disabled = false,
}) => {
  const handleChange = (val: string | undefined) => {
    onChange(val || '');
  };

  // Handle image paste/drop functionality
  const handleImageUpload = useCallback(async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        // Convert to base64 data URL
        const result = reader.result as string;
        resolve(result);
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }, []);

  // Handle drag and drop for images
  const handleDrop = useCallback(async (event: React.DragEvent) => {
    event.preventDefault();
    if (disabled) return;

    const files = Array.from(event.dataTransfer.files);
    const imageFiles = files.filter(file => file.type.startsWith('image/'));
    
    for (const file of imageFiles) {
      try {
        const dataUrl = await handleImageUpload(file);
        const imageMarkdown = `![${file.name}](${dataUrl})`;
        
        // Insert the image markdown at cursor position
        const newValue = value + '\n\n' + imageMarkdown + '\n\n';
        onChange(newValue);
      } catch (error) {
        console.error('Error handling image drop:', error);
      }
    }
  }, [disabled, value, onChange, handleImageUpload]);

  // Handle paste for images
  const handlePaste = useCallback(async (event: React.ClipboardEvent) => {
    if (disabled) return;

    const items = Array.from(event.clipboardData.items);
    const imageItems = items.filter(item => item.type.startsWith('image/'));
    
    for (const item of imageItems) {
      const file = item.getAsFile();
      if (file) {
        event.preventDefault();
        try {
          const dataUrl = await handleImageUpload(file);
          const imageMarkdown = `![Pasted Image](${dataUrl})`;
          
          // Insert the image markdown at cursor position  
          const newValue = value + '\n\n' + imageMarkdown + '\n\n';
          onChange(newValue);
        } catch (error) {
          console.error('Error handling image paste:', error);
        }
      }
    }
  }, [disabled, value, onChange, handleImageUpload]);

  return (
    <Box sx={{ mb: 2 }}>
      <Typography 
        variant="subtitle2" 
        gutterBottom
        sx={{ 
          mb: 1,
          color: sensitive ? 'error.main' : 'text.primary',
          fontWeight: required ? 600 : 400,
        }}
      >
        {label} {required && '*'} {sensitive && '🔒'}
      </Typography>
      
      <Box 
        sx={{ 
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 1,
          overflow: 'hidden',
          backgroundColor: disabled ? 'action.disabledBackground' : 'background.paper',
          minHeight: 200,
          '& .w-md-editor': {
            backgroundColor: 'transparent',
          },
          '& .w-md-editor-text-pre, & .w-md-editor-text-input, & .w-md-editor-text': {
            fontSize: '14px !important',
            fontFamily: 'inherit !important',
          },
          '& .w-md-editor-preview': {
            backgroundColor: 'background.paper',
          },
          // Ensure fullscreen editor body is visible
          '& .w-md-editor-fullscreen': {
            zIndex: theme => theme.zIndex.modal + 1,
            '& .w-md-editor-text, & .w-md-editor-preview': {
              backgroundColor: 'background.paper',
            },
          },
          // Style the drag bar
          '& .w-md-editor-bar': {
            backgroundColor: 'divider',
          },
          // Image styling in preview
          '& .w-md-editor-preview img': {
            maxWidth: '100%',
            height: 'auto',
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 1,
          },
        }}
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        onPaste={handlePaste}
      >
        <MDEditor
          value={value}
          onChange={handleChange}
          preview="edit"
          hideToolbar={disabled}
          textareaProps={{
            placeholder,
            disabled,
            style: {
              fontSize: '14px',
              fontFamily: 'inherit',
              minHeight: '150px',
            },
          }}
          height={300}
          data-color-mode="auto"
        />
      </Box>
      
      {placeholder && !value && (
        <Typography variant="caption" color="text.secondary" sx={{ mt: 1 }}>
          {placeholder}
        </Typography>
      )}
      
      {!disabled && (
        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
          💡 Tip: You can drag & drop or paste images directly into the editor. Use the drag bar at the bottom to resize.
        </Typography>
      )}
    </Box>
  );
};

export default RichTextEditor;