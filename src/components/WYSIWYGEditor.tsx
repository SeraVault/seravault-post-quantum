import React, { useEffect, useRef, useCallback, useState } from 'react';
import { Box, Typography, Paper, Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, ToggleButtonGroup, ToggleButton } from '@mui/material';
import { Edit, Visibility } from '@mui/icons-material';
import Quill from 'quill';
import 'quill/dist/quill.snow.css';

interface WYSIWYGEditorProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  sensitive?: boolean;
  disabled?: boolean;
}

const WYSIWYGEditor: React.FC<WYSIWYGEditorProps> = ({
  label,
  value,
  onChange,
  placeholder = '',
  required = false,
  sensitive = false,
  disabled = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const quillRef = useRef<Quill | null>(null);
  const onChangeRef = useRef(onChange);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkText, setLinkText] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [viewMode, setViewMode] = useState<'edit' | 'preview'>('edit');

  // Keep onChange ref up to date
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // Handle fullscreen toggle using browser API
  const toggleFullscreen = useCallback(() => {
    // Check actual fullscreen state instead of React state for more reliable toggle
    const isCurrentlyFullscreen = !!document.fullscreenElement;
    console.log('toggleFullscreen called, actualFullscreen:', isCurrentlyFullscreen, 'containerRef:', containerRef.current);
    
    if (!containerRef.current) {
      console.log('No containerRef available');
      return;
    }
    
    if (!isCurrentlyFullscreen) {
      // Enter fullscreen
      console.log('Entering fullscreen');
      const element = containerRef.current;
      element.requestFullscreen?.() || 
      (element as any).webkitRequestFullscreen?.() ||
      (element as any).mozRequestFullScreen?.() ||
      (element as any).msRequestFullscreen?.();
    } else {
      // Exit fullscreen
      console.log('Exiting fullscreen');
      document.exitFullscreen?.() ||
      (document as any).webkitExitFullscreen?.() ||
      (document as any).mozCancelFullScreen?.() ||
      (document as any).msExitFullscreen?.();
    }
  }, []);

  // Initialize Quill editor once
  useEffect(() => {
    if (!editorRef.current || quillRef.current) {
      return;
    }
    
    // Create custom toolbar
    const toolbarOptions = disabled ? false : [
      [{ 'header': [1, 2, 3, false] }],
      ['bold', 'italic', 'underline', 'strike'],
      [{ 'color': [] }, { 'background': [] }],
      [{ 'list': 'ordered'}, { 'list': 'bullet' }],
      [{ 'align': [] }],
      ['link', 'image'],
      ['clean'],
      ['fullscreen'] // Custom button
    ];

    const quill = new Quill(editorRef.current, {
      theme: 'snow',
      placeholder: placeholder || 'Enter some rich text...',
      readOnly: disabled,
      modules: {
        toolbar: toolbarOptions,
        clipboard: {
          matchVisual: false,
        }
      },
      formats: [
        'header', 'bold', 'italic', 'underline', 'strike',
        'color', 'background', 'list', 'align',
        'link', 'image'
      ]
    });

    quillRef.current = quill;
    
    // Add custom fullscreen handler after toolbar is created
    if (!disabled) {
      const toolbar = quill.getModule('toolbar') as any;
      if (toolbar && toolbar.container) {
        const fullscreenButton = toolbar.container.querySelector('.ql-fullscreen');
        if (fullscreenButton) {
          fullscreenButton.addEventListener('click', () => {
            toggleFullscreen();
          });
        }
      }
    }

    // Custom link handler
    (quill.getModule('toolbar') as any).addHandler('link', () => {
      const range = quill.getSelection();
      if (range) {
        const text = quill.getText(range.index, range.length);
        setLinkText(text || '');
        setLinkUrl('');
        setLinkDialogOpen(true);
      }
    });

    // Custom image handler
    (quill.getModule('toolbar') as any).addHandler('image', () => {
      const input = document.createElement('input');
      input.setAttribute('type', 'file');
      input.setAttribute('accept', 'image/*');
      input.click();

      input.onchange = () => {
        const file = input.files?.[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = () => {
            const result = reader.result as string;
            const range = quill.getSelection();
            quill.insertEmbed(range ? range.index : 0, 'image', result);
          };
          reader.readAsDataURL(file);
        }
      };
    });

    // Set initial content
    if (value) {
      quill.root.innerHTML = value;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

  // Register text-change listener (separate effect so it re-registers after cleanup)
  useEffect(() => {
    const quill = quillRef.current;
    if (!quill) {
      return;
    }

    const handleTextChange = () => {
      const html = quill.root.innerHTML;
      const cleanHtml = html === '<p><br></p>' ? '' : html;
      onChangeRef.current(cleanHtml);
    };

    quill.on('text-change', handleTextChange);

    return () => {
      quill.off('text-change', handleTextChange);
    };
  }); // No dependencies - runs on every render to ensure listener is always registered

  // Update disabled state
  useEffect(() => {
    if (quillRef.current) {
      quillRef.current.enable(!disabled);
    }
  }, [disabled]);

  // Handle link creation
  const handleInsertLink = () => {
    if (!quillRef.current || !linkUrl.trim()) return;

    const range = quillRef.current.getSelection();
    if (range) {
      if (linkText.trim()) {
        // Insert new link with text
        quillRef.current.insertText(range.index, linkText, 'link', linkUrl);
      } else {
        // Format existing selection as link
        quillRef.current.format('link', linkUrl);
      }
    }
    
    setLinkDialogOpen(false);
    setLinkText('');
    setLinkUrl('');
  };

  // Listen for fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isFs = !!document.fullscreenElement;
      console.log('Fullscreen change detected:', isFs);
      setIsFullscreen(isFs);
      
      // Update toolbar button active state
      if (quillRef.current) {
        const toolbar = quillRef.current.getModule('toolbar') as any;
        const fullscreenButton = toolbar?.container?.querySelector('.ql-fullscreen');
        if (fullscreenButton) {
          if (isFs) {
            fullscreenButton.classList.add('ql-active');
          } else {
            fullscreenButton.classList.remove('ql-active');
          }
        }
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
    };
  }, []);

  // Handle drag and drop for images
  const handleDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    if (disabled || !quillRef.current) return;

    const files = Array.from(event.dataTransfer.files);
    const imageFiles = files.filter(file => file.type.startsWith('image/'));
    
    imageFiles.forEach(file => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const range = quillRef.current!.getSelection() || { index: 0, length: 0 };
        quillRef.current!.insertEmbed(range.index, 'image', result);
      };
      reader.readAsDataURL(file);
    });
  }, [disabled]);

  // Handle paste for images
  const handlePaste = useCallback((event: React.ClipboardEvent) => {
    if (disabled || !quillRef.current) return;

    const items = Array.from(event.clipboardData.items);
    const imageItems = items.filter(item => item.type.startsWith('image/'));
    
    imageItems.forEach(item => {
      const file = item.getAsFile();
      if (file) {
        event.preventDefault();
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          const range = quillRef.current!.getSelection() || { index: 0, length: 0 };
          quillRef.current!.insertEmbed(range.index, 'image', result);
        };
        reader.readAsDataURL(file);
      }
    });
  }, [disabled]);

  return (
    <>
      <Box sx={{ mb: 2 }}>
        {/* Header with Label and Preview Toggle */}
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
            <ToggleButtonGroup
              value={viewMode}
              exclusive
              onChange={(_e, newMode) => newMode && setViewMode(newMode)}
              size="small"
              aria-label="view mode"
            >
              <ToggleButton value="edit" aria-label="edit mode">
                <Edit fontSize="small" sx={{ mr: 0.5 }} />
                Edit
              </ToggleButton>
              <ToggleButton value="preview" aria-label="preview mode">
                <Visibility fontSize="small" sx={{ mr: 0.5 }} />
                Preview
              </ToggleButton>
            </ToggleButtonGroup>
          )}
        </Box>
        
        {viewMode === 'preview' ? (
          // Preview Mode - Show rendered HTML
          <Paper 
            variant="outlined"
            sx={{ 
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: 1,
              p: 2,
              backgroundColor: 'background.paper',
              minHeight: 300,
              overflow: 'auto',
              '& p': {
                color: 'text.primary',
                margin: '0 0 1em 0',
              },
              '& h1, & h2, & h3, & h4, & h5, & h6': {
                color: 'text.primary',
                margin: '0.5em 0',
              },
              '& strong': {
                fontWeight: 600,
              },
              '& a': {
                color: 'primary.main',
                textDecoration: 'underline',
              },
              '& img': {
                maxWidth: '100%',
                height: 'auto',
                borderRadius: 1,
                boxShadow: 1,
              },
              '& ul, & ol': {
                paddingLeft: 3,
              },
            }}
          >
            {value ? (
              <div dangerouslySetInnerHTML={{ __html: value }} />
            ) : (
              <Typography color="text.disabled" fontStyle="italic">
                No content to preview
              </Typography>
            )}
          </Paper>
        ) : (
          // Edit Mode - Show Quill editor
          <Paper 
            ref={containerRef}
            variant="outlined"
            sx={{ 
            border: '1px solid',
            borderColor: disabled ? 'action.disabled' : 'divider',
            borderRadius: 1,
            overflow: 'hidden',
            backgroundColor: disabled ? 'action.disabledBackground' : 'background.paper',
            minHeight: 300,
            // Fullscreen styles
            ...(isFullscreen && {
              position: 'fixed',
              top: 0,
              left: 0,
              width: '100vw',
              height: '100vh',
              zIndex: 9999,
              borderRadius: 0,
              border: 'none',
              '& .ql-container': {
                height: 'calc(100vh - 42px) !important',
              },
              '& .ql-editor': {
                height: 'calc(100vh - 84px) !important',
                padding: 4,
              },
            }),
            '& .ql-container': {
              minHeight: 250,
              fontSize: '14px',
              fontFamily: 'inherit',
              backgroundColor: 'background.paper',
            },
            '& .ql-editor': {
              minHeight: 250,
              padding: 2,
              lineHeight: 1.6,
              backgroundColor: 'background.paper !important',
              color: 'text.primary !important',
            },
            '& .ql-toolbar': {
              borderBottom: '1px solid',
              borderBottomColor: 'divider',
              backgroundColor: 'background.default',
            },
            '& .ql-toolbar .ql-stroke': {
              stroke: 'text.primary',
            },
            '& .ql-toolbar .ql-fill': {
              fill: 'text.primary',
            },
            '& .ql-toolbar .ql-picker-label': {
              color: 'text.primary',
            },
            '& .ql-toolbar .ql-picker-options': {
              backgroundColor: 'background.paper',
              border: '1px solid',
              borderColor: 'divider',
            },
            '& .ql-toolbar .ql-picker-item': {
              color: 'text.primary',
            },
            // Custom fullscreen button styling to match native Quill buttons
            '& .ql-fullscreen': {
              width: '28px !important',
              height: '28px !important',
              padding: '5px',
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              borderRadius: '3px',
              display: 'inline-block',
              position: 'relative',
              '&:before': {
                content: '"⤢"',
                fontSize: '14px',
                lineHeight: '18px',
                display: 'block',
                textAlign: 'center',
                color: '#444',
                fontFamily: '"Helvetica Neue", "Helvetica", "Arial", sans-serif',
                fontWeight: 'normal',
              },
              '&:hover': {
                color: '#06c',
                '&:before': {
                  color: '#06c',
                },
              },
            },
            '& .ql-fullscreen.ql-active': {
              color: '#06c',
              '&:before': {
                content: '"⤡"',
                color: '#06c',
              },
            },
            '& .ql-editor.ql-blank::before': {
              color: 'text.disabled !important',
              fontStyle: 'normal',
            },
            '& .ql-snow': {
              border: 'none',
              backgroundColor: 'background.paper',
            },
            '& .ql-snow .ql-tooltip': {
              backgroundColor: 'background.paper',
              border: '1px solid',
              borderColor: 'divider',
              color: 'text.primary',
            },
            '& .ql-snow .ql-tooltip input[type=text]': {
              backgroundColor: 'background.default',
              border: '1px solid',
              borderColor: 'divider',
              color: 'text.primary',
            },
            // Ensure text content is visible
            '& .ql-editor p': {
              color: 'text.primary !important',
            },
            '& .ql-editor h1, & .ql-editor h2, & .ql-editor h3, & .ql-editor h4, & .ql-editor h5, & .ql-editor h6': {
              color: 'text.primary !important',
            },
            '& .ql-editor strong': {
              color: 'text.primary !important',
            },
            '& .ql-editor em': {
              color: 'text.primary !important',
            },
            '& .ql-editor u': {
              color: 'text.primary !important',
            },
            '& .ql-editor s': {
              color: 'text.primary !important',
            },
            '& .ql-editor a': {
              color: 'primary.main !important',
            },
            '& .ql-editor ol, & .ql-editor ul': {
              color: 'text.primary !important',
            },
            '& .ql-editor li': {
              color: 'text.primary !important',
            },
            // Image styling
            '& .ql-editor img': {
              maxWidth: '100%',
              height: 'auto',
              borderRadius: 1,
              boxShadow: 1,
            },
          }}
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          onPaste={handlePaste}
        >
          <div ref={editorRef} />
        </Paper>
        )}
        
        {placeholder && !value && viewMode === 'edit' && (
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1 }}>
            {placeholder}
          </Typography>
        )}
        
        {!disabled && (
          <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
            💡 WYSIWYG Editor: Rich text editing with full formatting toolbar. You can drag & drop or paste images directly. Use the fullscreen button (⛶) in the toolbar for distraction-free editing.
          </Typography>
        )}
      </Box>

      {/* Link Dialog */}
      <Dialog open={linkDialogOpen} onClose={() => setLinkDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Insert Link</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Link Text (optional)"
            fullWidth
            variant="outlined"
            value={linkText}
            onChange={(e) => setLinkText(e.target.value)}
            placeholder="Leave empty to use selected text"
            sx={{ mb: 2 }}
          />
          <TextField
            margin="dense"
            label="URL"
            fullWidth
            variant="outlined"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            placeholder="https://example.com"
            type="url"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLinkDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleInsertLink} variant="contained" disabled={!linkUrl.trim()}>
            Insert Link
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default WYSIWYGEditor;