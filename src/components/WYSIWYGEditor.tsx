import React, { useEffect, useRef, useCallback, useState } from 'react';
import { Box, Typography, Paper, Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField } from '@mui/material';
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
  const editorRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const quillRef = useRef<Quill | null>(null);
  const isUpdatingRef = useRef(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkText, setLinkText] = useState('');
  const [linkUrl, setLinkUrl] = useState('');

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

  // Initialize Quill editor
  useEffect(() => {
    if (!editorRef.current || quillRef.current) return;

    console.log('Initializing Quill editor');
    
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
            console.log('Fullscreen button clicked');
            toggleFullscreen();
          });
        }
      }
    }

    // Handle content changes
    const handleTextChange = () => {
      if (isUpdatingRef.current) return;
      
      const html = quill.root.innerHTML;
      const cleanHtml = html === '<p><br></p>' ? '' : html;
      onChange(cleanHtml);
    };

    quill.on('text-change', handleTextChange);

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
      isUpdatingRef.current = true;
      quill.root.innerHTML = value;
      isUpdatingRef.current = false;
    }

    return () => {
      if (quillRef.current) {
        quillRef.current.off('text-change', handleTextChange);
      }
    };
  }, [disabled, placeholder, onChange, toggleFullscreen]);

  // Update content when value prop changes
  useEffect(() => {
    if (!quillRef.current || isUpdatingRef.current) return;
    
    const currentHtml = quillRef.current.root.innerHTML;
    const cleanCurrentHtml = currentHtml === '<p><br></p>' ? '' : currentHtml;
    
    if (cleanCurrentHtml !== value) {
      isUpdatingRef.current = true;
      if (value) {
        quillRef.current.root.innerHTML = value;
      } else {
        quillRef.current.setText('');
      }
      isUpdatingRef.current = false;
    }
  }, [value]);

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
        
        {placeholder && !value && (
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