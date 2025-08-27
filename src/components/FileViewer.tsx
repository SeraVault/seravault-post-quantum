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
} from '@mui/icons-material';
import { Document, Page, pdfjs } from 'react-pdf';
import { useTranslation } from 'react-i18next';
import type { FileData } from '../files';

// Set up PDF.js worker - ensure version matches react-pdf's pdfjs-dist version
if (typeof window !== 'undefined') {
  // Use the exact version that react-pdf is using (5.3.93)
  pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@5.3.93/build/pdf.worker.min.js`;
}

interface FileViewerProps {
  open: boolean;
  file: FileData | null;
  fileContent: ArrayBuffer | null;
  loading?: boolean;
  onClose: () => void;
  onDownload?: () => void;
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
  onDownload 
}) => {
  const { t } = useTranslation();
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
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

  const dialogRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Get file info
  const fileName = typeof file?.name === 'string' ? file.name : '';
  const fileExtension = fileName.split('.').pop()?.toLowerCase() || '';
  const mimeType = getMimeType(fileExtension);
  const fileType = getFileType(fileExtension);

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

  const renderViewer = () => {
    if (loading || !objectUrl || !file) {
      return (
        <Box display="flex" flexDirection="column" justifyContent="center" alignItems="center" minHeight={400}>
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
              minHeight: 400,
              maxHeight: '70vh',
              overflow: 'auto',
              backgroundColor: '#f5f5f5',
              borderRadius: 1,
            }}
          >
            <img
              src={objectUrl}
              alt={fileName}
              style={{
                maxWidth: '100%',
                maxHeight: '100%',
                transform: `scale(${viewerState.zoom}) rotate(${viewerState.rotation}deg)`,
                transition: 'transform 0.3s ease',
              }}
            />
          </Box>
        );

      case 'pdf':
        return (
          <Box sx={{ minHeight: 400, maxHeight: '70vh', overflow: 'auto' }}>
            <Document
              file={objectUrl}
              onLoadSuccess={({ numPages }) => 
                setViewerState(prev => ({ ...prev, totalPages: numPages }))
              }
              loading={<CircularProgress />}
            >
              <Page 
                pageNumber={viewerState.currentPage}
                scale={viewerState.zoom}
                rotate={viewerState.rotation}
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
              minHeight: 400,
              maxHeight: '70vh',
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
              minHeight: 200,
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
              {t('fileViewer.type')}: {fileExtension.toUpperCase()}
            </Typography>
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
      <Toolbar variant="dense" sx={{ gap: 1, justifyContent: 'center', flexWrap: 'wrap' }}>
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
      maxWidth="lg"
      fullWidth
      fullScreen={viewerState.isFullscreen}
      PaperProps={{
        sx: {
          height: viewerState.isFullscreen ? '100vh' : '90vh',
        }
      }}
    >
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box component="span" sx={{ fontSize: '1.25rem', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {fileName}
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          {onDownload && (
            <IconButton onClick={onDownload} title={t('common.download')}>
              <Download />
            </IconButton>
          )}
          <IconButton onClick={onClose} title={t('common.close')}>
            <Close />
          </IconButton>
        </Box>
      </DialogTitle>

      {renderToolbar()}

      <DialogContent sx={{ p: 0, overflow: 'hidden' }}>
        {error ? (
          <Alert severity="error" sx={{ m: 2 }}>
            {error}
          </Alert>
        ) : (
          renderViewer()
        )}
      </DialogContent>

      <DialogActions sx={{ justifyContent: 'flex-end', gap: 1, px: 3, py: 2 }}>
        {onDownload && (
          <Button 
            variant="outlined" 
            startIcon={<Download />} 
            onClick={onDownload}
            sx={{ minWidth: 120 }}
          >
            {t('common.download')}
          </Button>
        )}
        <Button 
          variant="contained" 
          onClick={onClose}
          sx={{ minWidth: 100 }}
        >
          {t('common.close')}
        </Button>
      </DialogActions>
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
        maxHeight: '60vh',
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