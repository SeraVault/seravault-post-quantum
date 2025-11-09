import React, { useState, useCallback } from 'react';
import { Box, Typography, ToggleButtonGroup, ToggleButton, Chip } from '@mui/material';
import { Code, Edit } from '@mui/icons-material';
import RichTextEditor from './RichTextEditor';
import WYSIWYGEditor from './WYSIWYGEditor';

interface DualEditorProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  sensitive?: boolean;
  disabled?: boolean;
  defaultMode?: 'markdown' | 'wysiwyg';
}

const DualEditor: React.FC<DualEditorProps> = ({
  label,
  value,
  onChange,
  required = false,
  sensitive = false,
  disabled = false,
  defaultMode = 'wysiwyg',
}) => {
  const [editorMode, setEditorMode] = useState<'markdown' | 'wysiwyg'>(defaultMode);

  const handleModeChange = useCallback((
    event: React.MouseEvent<HTMLElement>,
    newMode: 'markdown' | 'wysiwyg' | null,
  ) => {
    if (newMode !== null && !disabled) {
      setEditorMode(newMode);
    }
  }, [disabled]);

  // Convert between formats when switching modes
  const handleContentChange = useCallback((newValue: string) => {
    onChange(newValue);
  }, [onChange]);

  const getContentForMode = useCallback(() => {
    // For now, we'll keep the raw content as-is
    // In the future, you could add conversion between HTML and Markdown
    return value;
  }, [value]);

  return (
    <Box sx={{ mb: 2 }}>
      {/* Header with Label and Mode Toggle */}
      <Box sx={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        mb: 1 
      }}>
        <Typography 
          variant="subtitle2" 
          sx={{ 
            color: sensitive ? 'error.main' : 'text.primary',
            fontWeight: required ? 600 : 400,
          }}
        >
          {label} {required && '*'} {sensitive && '🔒'}
        </Typography>
        
        {!disabled && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Chip 
              label={editorMode === 'markdown' ? 'Markdown' : 'WYSIWYG'} 
              size="small" 
              color="primary" 
              variant="outlined"
            />
            <ToggleButtonGroup
              value={editorMode}
              exclusive
              onChange={handleModeChange}
              size="small"
              aria-label="editor mode"
            >
              <ToggleButton value="markdown" aria-label="markdown mode">
                <Code fontSize="small" />
              </ToggleButton>
              <ToggleButton value="wysiwyg" aria-label="wysiwyg mode">
                <Edit fontSize="small" />
              </ToggleButton>
            </ToggleButtonGroup>
          </Box>
        )}
      </Box>

      {/* Editor Content */}
      {editorMode === 'markdown' ? (
        <RichTextEditor
          label="" // Don't show label since we have it above
          value={getContentForMode()}
          onChange={handleContentChange}
          required={false} // Don't show required indicator since we have it above
          sensitive={false} // Don't show sensitive indicator since we have it above
          disabled={disabled}
        />
      ) : (
        <WYSIWYGEditor
          label="" // Don't show label since we have it above
          value={getContentForMode()}
          onChange={handleContentChange}
          required={false} // Don't show required indicator since we have it above
          sensitive={false} // Don't show sensitive indicator since we have it above
          disabled={disabled}
        />
      )}

      {/* Mode Description */}
      {!disabled && (
        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
          {editorMode === 'markdown' 
            ? '📝 Markdown mode: Write with markdown syntax. Great for technical content and quick formatting.'
            : '🎨 WYSIWYG mode: What you see is what you get. Click buttons to format text visually.'
          }
        </Typography>
      )}
    </Box>
  );
};

export default DualEditor;