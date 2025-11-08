import React, { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  IconButton,
  CircularProgress,
  Alert,
  Toolbar,
  Slider,
  Tooltip,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import {
  Close,
  Download,
  ZoomIn,
  ZoomOut,
  RotateLeft,
  RotateRight,
  Fullscreen,
  FullscreenExit,
  PlayArrow,
  Pause,
  VolumeUp,
  VolumeOff,
  MoreVert,
  Print,
} from '@mui/icons-material';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/TextLayer.css';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import { useTranslation } from 'react-i18next';
import type { FileData } from '../files';
import { getUserProfile, updateUserProfile, type UserProfile } from '../firestore';
import PrintSecurityWarningDialog from './PrintSecurityWarningDialog';
import { detectFileType, type FileTypeInfo } from '../utils/fileTypeDetection';

// Set up PDF.js worker
if (typeof window !== 'undefined') {
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
}

interface FileViewerProps {
  open: boolean;
  file: FileData | null;
  fileContent: ArrayBuffer | null;
  loading?: boolean;
  onClose: () => void;
  onDownload?: () => void;
  userId?: string;
  onShare?: () => void;
}

interface ViewerState {
  zoom: number;
  rotation: number;
  currentPage: number;
  totalPages: number;
  isFullscreen: boolean;
  isPlaying: boolean;
  volume: number;
  isMuted: boolean;
}

const FileViewer: React.FC<FileViewerProps> = ({ 
  open, 
  file, 
  fileContent, 
  loading = false,
  onClose, 
  onDownload,
  userId,
  onShare
}) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [ownerDisplayName, setOwnerDisplayName] = useState<string | null>(null);
  const [viewerState, setViewerState] = useState<ViewerState>({
    zoom: 1,
    rotation: 0,
    currentPage: 1,
    totalPages: 1,
    isFullscreen: false,
    isPlaying: false,
    volume: 1,
    isMuted: false,
  });
  const [menuAnchorEl, setMenuAnchorEl] = useState<null | HTMLElement>(null);
  const [printWarningOpen, setPrintWarningOpen] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [detectedFileType, setDetectedFileType] = useState<FileTypeInfo | null>(null);

  const dialogRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Get file info - use detected type if available, fall back to extension
  const fileName = typeof file?.name === 'string' ? file.name : '';
  const fileExtension = fileName.split('.').pop()?.toLowerCase() || '';
  const mimeType = detectedFileType?.mimeType || getMimeType(fileExtension);
  const fileType = detectedFileType?.type || getFileType(fileExtension);
  const fileDescription = detectedFileType?.description || `${fileExtension.toUpperCase()} File`;

  // Detect file type from content when available
  useEffect(() => {
    if (fileContent && file) {
      try {
        const detectedType = detectFileType(fileContent, fileName);
        setDetectedFileType(detectedType);
        console.log('🔍 Detected file type:', detectedType);
      } catch (error) {
        console.error('Error detecting file type:', error);
        setDetectedFileType(null);
      }
    }
  }, [fileContent, file, fileName]);

  // Load user profile for print warning preference
  useEffect(() => {
    const loadUserProfile = async () => {
      if (userId) {
        try {
          const profile = await getUserProfile(userId);
          setUserProfile(profile);
        } catch (error) {
          console.error('Failed to load user profile:', error);
        }
      }
    };
    loadUserProfile();
  }, [userId]);

  // Load owner display name
  useEffect(() => {
    const loadOwnerDisplayName = async () => {
      if (file?.owner) {
        try {
          const ownerProfile = await getUserProfile(file.owner);
          setOwnerDisplayName(ownerProfile?.displayName || file.owner);
        } catch (error) {
          console.error('Failed to load owner profile:', error);
          setOwnerDisplayName(file.owner);
        }
      }
    };

    loadOwnerDisplayName();
  }, [file?.owner]);

  // Create object URL when content is available
  useEffect(() => {
    if (fileContent && file) {
      try {
        const blob = new Blob([fileContent], { type: mimeType });
        const url = URL.createObjectURL(blob);
        setObjectUrl(url);
        setError(null);
      } catch (err) {
        setError('Failed to process file content');
        console.error('Error creating object URL:', err);
      }
    }

    return () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [fileContent, file, mimeType]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, []);

  function getMimeType(extension: string): string {
    const mimeTypes: Record<string, string> = {
      // Images
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      webp: 'image/webp',
      svg: 'image/svg+xml',
      bmp: 'image/bmp',
      ico: 'image/x-icon',
      
      // Documents
      pdf: 'application/pdf',
      txt: 'text/plain',
      md: 'text/markdown',
      json: 'application/json',
      xml: 'application/xml',
      html: 'text/html',
      css: 'text/css',
      js: 'text/javascript',
      ts: 'text/typescript',
      
      // Audio
      mp3: 'audio/mpeg',
      wav: 'audio/wav',
      oga: 'audio/ogg',
      m4a: 'audio/mp4',
      flac: 'audio/flac',
      
      // Video
      mp4: 'video/mp4',
      webm: 'video/webm',
      ogv: 'video/ogg',
      mov: 'video/quicktime',
      avi: 'video/x-msvideo',
    };
    
    return mimeTypes[extension] || 'application/octet-stream';
  }

  function getFileType(extension: string): 'image' | 'pdf' | 'text' | 'audio' | 'video' | 'unknown' {
    const imageTypes = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico'];
    const textTypes = ['txt', 'md', 'json', 'xml', 'html', 'css', 'js', 'ts'];
    const audioTypes = ['mp3', 'wav', 'oga', 'm4a', 'flac'];
    const videoTypes = ['mp4', 'webm', 'ogv', 'mov', 'avi'];
    
    if (extension === 'pdf') return 'pdf';
    if (imageTypes.includes(extension)) return 'image';
    if (textTypes.includes(extension)) return 'text';
    if (audioTypes.includes(extension)) return 'audio';
    if (videoTypes.includes(extension)) return 'video';
    return 'unknown';
  }

  const handleZoom = (delta: number) => {
    setViewerState(prev => ({
      ...prev,
      zoom: Math.min(Math.max(prev.zoom + delta, 0.25), 5)
    }));
  };

  const handleRotation = (delta: number) => {
    setViewerState(prev => ({
      ...prev,
      rotation: (prev.rotation + delta) % 360
    }));
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement && dialogRef.current) {
      dialogRef.current.requestFullscreen();
      setViewerState(prev => ({ ...prev, isFullscreen: true }));
    } else if (document.fullscreenElement) {
      document.exitFullscreen();
      setViewerState(prev => ({ ...prev, isFullscreen: false }));
    }
  };

  const handlePlayPause = () => {
    const media = audioRef.current || videoRef.current;
    if (media) {
      if (viewerState.isPlaying) {
        media.pause();
      } else {
        media.play();
      }
      setViewerState(prev => ({ ...prev, isPlaying: !prev.isPlaying }));
    }
  };

  const handleVolumeChange = (value: number) => {
    const media = audioRef.current || videoRef.current;
    if (media) {
      media.volume = value;
      setViewerState(prev => ({ ...prev, volume: value, isMuted: value === 0 }));
    }
  };

  const toggleMute = () => {
    const media = audioRef.current || videoRef.current;
    if (media) {
      media.muted = !viewerState.isMuted;
      setViewerState(prev => ({ ...prev, isMuted: !prev.isMuted }));
    }
  };

  const handlePrint = () => {
    // Check if user wants to see warning (default: true)
    const shouldShowWarning = userProfile?.showPrintWarning !== false;

    if (shouldShowWarning) {
      setPrintWarningOpen(true);
    } else {
      performPrint();
    }
  };

  const performPrint = () => {
    if (objectUrl) {
      const printWindow = window.open(objectUrl, '_blank');
      if (printWindow) {
        printWindow.onload = () => {
          printWindow.print();
        };
      }
    }
  };

  const handleNeverShowPrintWarning = async () => {
    if (userId && userProfile) {
      try {
        await updateUserProfile(userId, { showPrintWarning: false });
        setUserProfile({ ...userProfile, showPrintWarning: false });
      } catch (error) {
        console.error('Failed to update print warning preference:', error);
      }
    }
  };

  const renderViewer = () => {
    if (loading || !objectUrl || !file) {
      return (
        <Box display="flex" flexDirection="column" justifyContent="center" alignItems="center" flex={1}>
          <CircularProgress size={50} />
          <Typography variant="body1" sx={{ mt: 2 }}>
            {loading ? t('common.loading') : 'Processing file...'}
          </Typography>
        </Box>
      );
    }

    switch (fileType) {
      case 'image':
        return (
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              flex: 1,
              minHeight: 0, // Important: allows flex shrinking
              overflow: 'auto',
              backgroundColor: '#f5f5f5',
              borderRadius: 1,
              position: 'relative',
            }}
          >
            <img
              src={objectUrl}
              alt={fileName}
              style={{
                maxWidth: '100%',
                maxHeight: '100%',
                width: 'auto',
                height: 'auto',
                objectFit: 'contain',
                transform: `scale(${viewerState.zoom}) rotate(${viewerState.rotation}deg)`,
                transition: 'transform 0.3s ease',
              }}
            />
          </Box>
        );

      case 'pdf':
        return (
          <Box sx={{
            flex: 1,
            minHeight: 0,
            overflow: 'auto',
            width: '100%',
            height: '100%',
            p: 1,
            '& .react-pdf__Document': {
              width: 'fit-content',
              minWidth: '100%',
              margin: '0 auto',
            },
            '& .react-pdf__Page': {
              margin: 0,
              boxShadow: 1,
              display: 'block',
            },
            '& .react-pdf__Page__canvas': {
              display: 'block',
              margin: '0 auto',
            }
          }}>
            <Document
              file={objectUrl}
              onLoadSuccess={({ numPages }) =>
                setViewerState(prev => ({ ...prev, totalPages: numPages }))
              }
              loading={<CircularProgress />}
              error={
                <Alert severity="error" sx={{ m: 2 }}>
                  Failed to load PDF. Please try downloading the file instead.
                </Alert>
              }
            >
              <Page
                pageNumber={viewerState.currentPage}
                scale={viewerState.zoom}
                width={isMobile && viewerState.zoom === 1 ? window.innerWidth - 64 : undefined}
                height={undefined}
                renderTextLayer={!isMobile}
                renderAnnotationLayer={!isMobile}
              />
            </Document>
          </Box>
        );

      case 'audio':
        return (
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: 200,
              gap: 3,
              p: 4,
            }}
          >
            <Typography variant="h5" gutterBottom>
              🎵 {fileName}
            </Typography>
            <audio
              ref={audioRef}
              src={objectUrl}
              onPlay={() => setViewerState(prev => ({ ...prev, isPlaying: true }))}
              onPause={() => setViewerState(prev => ({ ...prev, isPlaying: false }))}
              style={{ width: '100%', maxWidth: 400 }}
              controls
            />
          </Box>
        );

      case 'video':
        return (
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              flex: 1,
              minHeight: 0,
            }}
          >
            <video
              ref={videoRef}
              src={objectUrl}
              onPlay={() => setViewerState(prev => ({ ...prev, isPlaying: true }))}
              onPause={() => setViewerState(prev => ({ ...prev, isPlaying: false }))}
              style={{
                maxWidth: '100%',
                maxHeight: '100%',
                width: 'auto',
                height: 'auto',
                transform: `scale(${viewerState.zoom})`,
              }}
              controls
            />
          </Box>
        );

      case 'text':
        return <TextViewer objectUrl={objectUrl} fileName={fileName} />;

      default:
        return (
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              flex: 1,
              gap: 2,
              p: 4,
            }}
          >
            <Typography variant="h6" color="text.secondary">
              {t('fileViewer.previewNotAvailable')}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {t('fileViewer.file')}: {fileName}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {t('fileViewer.type')}: {detectedFileType?.description || fileExtension.toUpperCase()}
            </Typography>
            {detectedFileType && detectedFileType.extension !== `.${fileExtension}` && (
              <Typography variant="caption" color="warning.main">
                ⚠️ File extension (.{fileExtension}) doesn't match actual content ({detectedFileType.description})
              </Typography>
            )}
            {onDownload && (
              <Button
                variant="contained"
                startIcon={<Download />}
                onClick={onDownload}
                sx={{ mt: 2 }}
              >
                {t('common.download')}
              </Button>
            )}
          </Box>
        );
    }
  };

  const renderToolbar = () => {
    const showImageControls = fileType === 'image' || fileType === 'pdf';
    const showPageControls = fileType === 'pdf' && viewerState.totalPages > 1;

    if (!showImageControls && !showPageControls) return null;

    return (
      <Toolbar variant="dense" sx={{ 
        gap: 1, 
        justifyContent: 'center', 
        flexWrap: 'wrap',
        flexShrink: 0, // Prevent toolbar from shrinking
      }}>
        {showImageControls && (
          <>
            <Tooltip title={t('fileViewer.zoomOut')}>
              <IconButton 
                size="small" 
                onClick={() => handleZoom(-0.25)}
                disabled={viewerState.zoom <= 0.25}
              >
                <ZoomOut />
              </IconButton>
            </Tooltip>
            
            <Typography variant="body2" sx={{ mx: 1 }}>
              {Math.round(viewerState.zoom * 100)}%
            </Typography>
            
            <Tooltip title={t('fileViewer.zoomIn')}>
              <IconButton 
                size="small" 
                onClick={() => handleZoom(0.25)}
                disabled={viewerState.zoom >= 5}
              >
                <ZoomIn />
              </IconButton>
            </Tooltip>
            
            <Tooltip title={t('fileViewer.rotateLeft')}>
              <IconButton size="small" onClick={() => handleRotation(-90)}>
                <RotateLeft />
              </IconButton>
            </Tooltip>
            
            <Tooltip title={t('fileViewer.rotateRight')}>
              <IconButton size="small" onClick={() => handleRotation(90)}>
                <RotateRight />
              </IconButton>
            </Tooltip>
          </>
        )}

        {showPageControls && (
          <>
            <Button 
              size="small"
              onClick={() => setViewerState(prev => ({ 
                ...prev, 
                currentPage: Math.max(1, prev.currentPage - 1) 
              }))}
              disabled={viewerState.currentPage <= 1}
            >
              {t('fileViewer.previous')}
            </Button>
            
            <Typography variant="body2" sx={{ mx: 2 }}>
              {viewerState.currentPage} {t('fileViewer.of')} {viewerState.totalPages}
            </Typography>
            
            <Button 
              size="small"
              onClick={() => setViewerState(prev => ({ 
                ...prev, 
                currentPage: Math.min(prev.totalPages, prev.currentPage + 1) 
              }))}
              disabled={viewerState.currentPage >= viewerState.totalPages}
            >
              {t('fileViewer.next')}
            </Button>
          </>
        )}

        <Tooltip title={viewerState.isFullscreen ? t('fileViewer.exitFullscreen') : t('fileViewer.fullscreen')}>
          <IconButton size="small" onClick={toggleFullscreen}>
            {viewerState.isFullscreen ? <FullscreenExit /> : <Fullscreen />}
          </IconButton>
        </Tooltip>
      </Toolbar>
    );
  };

  if (!open) return null;

  return (
    <Dialog
      ref={dialogRef}
      open={open}
      onClose={onClose}
      maxWidth={viewerState.isFullscreen ? false : "xl"}
      fullWidth
      fullScreen={isMobile || viewerState.isFullscreen}
      PaperProps={{
        sx: {
          height: viewerState.isFullscreen ? '100vh' : '95vh',
          maxHeight: '100vh',
          width: viewerState.isFullscreen ? '100vw' : undefined,
          maxWidth: viewerState.isFullscreen ? 'none' : undefined,
          display: 'flex',
          flexDirection: 'column',
          margin: viewerState.isFullscreen ? 0 : undefined,
        }
      }}
    >
      <DialogTitle sx={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        flexShrink: 0, // Prevent header from shrinking
      }}>
        <Box sx={{
          fontSize: '1.25rem',
          fontWeight: 500,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          pr: 1,
          minWidth: 0,
          lineHeight: 1.3,
          wordBreak: 'break-word'
        }}>
          {fileName}
        </Box>
        <Box sx={{ display: 'flex', gap: 1, flexShrink: 0 }}>
          <IconButton
            onClick={(e) => setMenuAnchorEl(e.currentTarget)}
            title="Actions"
          >
            <MoreVert />
          </IconButton>
          <IconButton onClick={onClose} title={t('common.close')}>
            <Close />
          </IconButton>
        </Box>
        <Menu
          anchorEl={menuAnchorEl}
          open={Boolean(menuAnchorEl)}
          onClose={() => setMenuAnchorEl(null)}
          transformOrigin={{ horizontal: 'right', vertical: 'top' }}
          anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
        >
          {onDownload && (
            <MenuItem onClick={() => { onDownload(); setMenuAnchorEl(null); }}>
              <ListItemIcon>
                <Download fontSize="small" />
              </ListItemIcon>
              <ListItemText>{t('common.download')}</ListItemText>
            </MenuItem>
          )}
          <MenuItem onClick={() => { handlePrint(); setMenuAnchorEl(null); }}>
            <ListItemIcon>
              <Print fontSize="small" />
            </ListItemIcon>
            <ListItemText>Print</ListItemText>
          </MenuItem>
        </Menu>
      </DialogTitle>

      {renderToolbar()}

      <DialogContent sx={{ 
        p: 0, 
        overflow: 'hidden',
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0, // Important: allows flex child to shrink below content size
      }}>
        {error ? (
          <Alert severity="error" sx={{ m: 2 }}>
            {error}
          </Alert>
        ) : (
          renderViewer()
        )}
      </DialogContent>

      <DialogActions sx={{ 
        justifyContent: 'space-between', 
        gap: 1, 
        px: 3, 
        py: 2,
        flexShrink: 0, // Prevent footer from shrinking
      }}>
        {file && (
          <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap', alignItems: 'center' }}>
            {detectedFileType && (
              <Box>
                <Typography variant="caption" color="text.secondary" display="block">
                  File Type
                </Typography>
                <Typography variant="body2">
                  {detectedFileType.description}
                  {detectedFileType.extension !== `.${fileExtension}` && (
                    <Typography component="span" variant="caption" color="warning.main" sx={{ ml: 1 }}>
                      ⚠️ Mismatch
                    </Typography>
                  )}
                </Typography>
              </Box>
            )}
            
            {file.createdAt && (
              <Box>
                <Typography variant="caption" color="text.secondary" display="block">
                  Created
                </Typography>
                <Typography variant="body2">
                  {typeof file.createdAt === 'object' && 'toDate' in file.createdAt
                    ? (file.createdAt as any).toDate().toLocaleDateString()
                    : new Date(file.createdAt).toLocaleDateString()}
                </Typography>
              </Box>
            )}
            
            {file.modifiedAt && (
              <Box>
                <Typography variant="caption" color="text.secondary" display="block">
                  Modified
                </Typography>
                <Typography variant="body2">
                  {typeof file.modifiedAt === 'object' && 'toDate' in file.modifiedAt
                    ? (file.modifiedAt as any).toDate().toLocaleDateString()
                    : new Date(file.modifiedAt).toLocaleDateString()}
                </Typography>
              </Box>
            )}
            
            {file.owner && (
              <Box>
                <Typography variant="caption" color="text.secondary" display="block">
                  Owner
                </Typography>
                <Typography variant="body2">
                  {userId && file.owner === userId ? 'You' : (ownerDisplayName || file.owner)}
                </Typography>
              </Box>
            )}
            
            {Array.isArray(file.sharedWith) && userId && file.sharedWith.filter((id: string) => id !== userId).length > 0 && (
              <Box>
                <Typography variant="caption" color="text.secondary" display="block">
                  Shared with
                </Typography>
                <Typography 
                  variant="body2" 
                  sx={{ 
                    cursor: onShare ? 'pointer' : 'default',
                    color: onShare ? 'primary.main' : 'text.primary',
                    textDecoration: onShare ? 'underline' : 'none',
                    '&:hover': onShare ? { textDecoration: 'underline' } : {}
                  }}
                  onClick={onShare}
                >
                  {file.sharedWith.filter((id: string) => id !== userId).length} user{file.sharedWith.filter((id: string) => id !== userId).length !== 1 ? 's' : ''}
                  {onShare && ' (click to manage)'}
                </Typography>
              </Box>
            )}
          </Box>
        )}

      </DialogActions>

      <PrintSecurityWarningDialog
        open={printWarningOpen}
        onClose={() => setPrintWarningOpen(false)}
        onConfirm={() => {
          setPrintWarningOpen(false);
          performPrint();
        }}
        onNeverShowAgain={() => {
          setPrintWarningOpen(false);
          handleNeverShowPrintWarning();
          performPrint();
        }}
        fileName={fileName}
        isForm={false}
      />
    </Dialog>
  );
};

// Text file viewer component
const TextViewer: React.FC<{ objectUrl: string; fileName: string }> = ({ objectUrl, fileName }) => {
  const [content, setContent] = useState<string>('');
  const [textLoading, setTextLoading] = useState(true);

  useEffect(() => {
    const fetchContent = async () => {
      try {
        const response = await fetch(objectUrl);
        const text = await response.text();
        setContent(text);
      } catch (error) {
        console.error('Error loading text file:', error);
        setContent('Error loading file content');
      } finally {
        setTextLoading(false);
      }
    };

    fetchContent();
  }, [objectUrl]);

  if (textLoading) {
    return (
      <Box display="flex" justifyContent="center" p={3}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box
      sx={{
        p: 2,
        flex: 1,
        overflow: 'auto',
        backgroundColor: '#f8f9fa',
        borderRadius: 1,
        fontFamily: 'monospace',
      }}
    >
      <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>
        {content}
      </pre>
    </Box>
  );
};

export default FileViewer;