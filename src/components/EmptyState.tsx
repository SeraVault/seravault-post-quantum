import { Box, Typography, Paper, Button } from '@mui/material';
import { 
  CloudUpload, 
  CreateNewFolder, 
  NoteAdd, 
  Add
} from '@mui/icons-material';

interface EmptyStateProps {
  onUploadClick?: () => void;
  onNewFolderClick?: () => void;
  onNewFormClick?: () => void;
  view?: 'home' | 'recents' | 'favorites' | 'shared';
}

export const EmptyState = ({ 
  onUploadClick, 
  onNewFolderClick, 
  onNewFormClick,
  view = 'home'
}: EmptyStateProps) => {
  const getEmptyStateContent = () => {
    switch (view) {
      case 'recents':
        return {
          title: 'No Recent Files',
          subtitle: 'Files you open will appear here for quick access',
          icon: null
        };
      case 'favorites':
        return {
          title: 'No Favorite Files',
          subtitle: 'Star files to add them to your favorites',
          icon: null
        };
      case 'shared':
        return {
          title: 'No Shared Files',
          subtitle: 'Files shared with you by others will appear here',
          icon: null
        };
      default:
        return {
          title: 'Welcome to SeraVault!',
          subtitle: 'Get started by adding your first content',
          icon: <Add sx={{ fontSize: 80, color: 'primary.main', mb: 2 }} />
        };
    }
  };

  const { title, subtitle, icon } = getEmptyStateContent();
  const isHome = view === 'home';

  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '400px',
        width: '100%',
        p: 3
      }}
    >
      <Paper
        elevation={0}
        sx={{
          p: 4,
          maxWidth: '600px',
          textAlign: 'center',
          backgroundColor: 'background.default',
          border: '2px dashed',
          borderColor: 'divider',
          borderRadius: 2
        }}
      >
        {icon}
        <Typography variant="h5" gutterBottom color="text.primary" sx={{ fontWeight: 500 }}>
          {title}
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
          {subtitle}
        </Typography>

        {isHome && (
          <>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 3 }}>
              <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', justifyContent: 'center' }}>
                {onUploadClick && (
                  <Button
                    variant="contained"
                    startIcon={<CloudUpload />}
                    onClick={onUploadClick}
                    size="large"
                  >
                    Upload File
                  </Button>
                )}
                {onNewFolderClick && (
                  <Button
                    variant="outlined"
                    startIcon={<CreateNewFolder />}
                    onClick={onNewFolderClick}
                    size="large"
                  >
                    New Folder
                  </Button>
                )}
                {onNewFormClick && (
                  <Button
                    variant="outlined"
                    startIcon={<NoteAdd />}
                    onClick={onNewFormClick}
                    size="large"
                  >
                    Create Form
                  </Button>
                )}
              </Box>
            </Box>

            <Box
              sx={{
                mt: 4,
                pt: 3,
                borderTop: '1px solid',
                borderColor: 'divider'
              }}
            >
              <Typography variant="body2" color="text.secondary" gutterBottom sx={{ fontWeight: 500 }}>
                💡 Pro Tips:
              </Typography>
              <Box sx={{ textAlign: 'left', mt: 2, mx: 'auto', maxWidth: '500px' }}>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  <strong>• Use the FAB button:</strong> Click the floating action button (➕) in the bottom-right corner to quickly create new content
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  <strong>• Add contacts:</strong> Go to Profile → Contacts to add people you want to share files with
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  <strong>• Share files:</strong> Right-click any file and select "Share" to collaborate with your contacts
                </Typography>
              </Box>
            </Box>
          </>
        )}
      </Paper>
    </Box>
  );
};
