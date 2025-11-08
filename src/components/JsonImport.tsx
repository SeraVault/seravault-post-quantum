import React, { useState, useEffect } from 'react';
import {
  Paper,
  Typography,
  Button,
  Box,
  Alert,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  List,
  ListItem,
  ListItemText,
  Chip,
  LinearProgress,
} from '@mui/material';
import { Upload, CheckCircle, Error as ErrorIcon } from '@mui/icons-material';
import { useImport } from '../context/ImportContext';

const JsonImport: React.FC = () => {
  const { importing, progress, results, error, startImport, clearResults } = useImport();
  const [showResults, setShowResults] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  // Prevent browser navigation/refresh during import
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (importing) {
        e.preventDefault();
        e.returnValue = 'Import in progress. Are you sure you want to leave?';
        return e.returnValue;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [importing]);

  // Show results dialog when import completes
  useEffect(() => {
    if (!importing && results.length > 0) {
      setShowResults(true);
    }
  }, [importing, results]);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setLocalError(null);
    
    try {
      await startImport(file);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Failed to start import');
    } finally {
      // Reset file input
      event.target.value = '';
    }
  };

  const handleCloseResults = () => {
    setShowResults(false);
    clearResults();
  };

  const successCount = results.filter(r => r.success).length;
  const failureCount = results.filter(r => !r.success).length;
  const displayError = error || localError;

  return (
    <>
      <Paper elevation={2} sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Import from JSON
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Import items from a JSON file. Supported types: "account" (passwords), "note" (secure notes), "credit_card" (credit cards), and "key" (crypto keys).
        </Typography>

        {displayError && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setLocalError(null)}>
            {displayError}
          </Alert>
        )}

        {importing && progress.total > 0 && (
          <Box sx={{ mb: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
              <Typography variant="body2" color="text.secondary" sx={{ flexGrow: 1 }}>
                Importing {progress.current} of {progress.total} items...
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {Math.round((progress.current / progress.total) * 100)}%
              </Typography>
            </Box>
            <LinearProgress 
              variant="determinate" 
              value={(progress.current / progress.total) * 100} 
            />
          </Box>
        )}

        <Box>
          <input
            accept=".json"
            style={{ display: 'none' }}
            id="json-file-input"
            type="file"
            onChange={handleFileSelect}
            disabled={importing}
          />
          <label htmlFor="json-file-input">
            <Button
              variant="contained"
              component="span"
              startIcon={importing ? <CircularProgress size={20} /> : <Upload />}
              disabled={importing}
            >
              {importing ? 'Importing...' : 'Select JSON File'}
            </Button>
          </label>
        </Box>

        <Box sx={{ mt: 2 }}>
          <Typography variant="caption" color="text.secondary">
            Expected JSON format:
          </Typography>
          <Box
            component="pre"
            sx={{
              mt: 1,
              p: 2,
              bgcolor: 'background.default',
              borderRadius: 1,
              fontSize: '0.75rem',
              overflow: 'auto',
            }}
          >
{`{
  "items": [
    {
      "type": "account",
      "title": "Example Account",
      "url": "https://example.com",
      "login": "username",
      "password": "password123",
      "tags": ["Work"]
    },
    {
      "type": "note",
      "title": "Example Note",
      "notes": "Note content here",
      "tags": ["Personal"]
    },
    {
      "type": "credit_card",
      "title": "Credit Card",
      "cardholder_name": "John Doe",
      "card_number": "0000-0000-0000-0000",
      "card_month": "12",
      "card_year": "2025",
      "security_code": "123",
      "tags": ["Finance"]
    },
    {
      "type": "key",
      "title": "Ethereum Key",
      "public_key": "0x1234567890abcdef",
      "private_key": "0xfedcba0987654321",
      "tags": ["Crypto"]
    }
  ]
}`}
          </Box>
        </Box>
      </Paper>

      {/* Results Dialog */}
      <Dialog
        open={showResults}
        onClose={handleCloseResults}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          Import Results
        </DialogTitle>
        <DialogContent>
          <Box sx={{ mb: 2 }}>
            <Chip
              label={`${successCount} successful`}
              color="success"
              icon={<CheckCircle />}
              sx={{ mr: 1 }}
            />
            {failureCount > 0 && (
              <Chip
                label={`${failureCount} failed`}
                color="error"
                icon={<ErrorIcon />}
              />
            )}
          </Box>

          <List>
            {results.map((result, index) => (
              <ListItem
                key={index}
                sx={{
                  bgcolor: result.success ? 'success.light' : 'error.light',
                  borderRadius: 1,
                  mb: 1,
                  opacity: 0.8,
                }}
              >
                <ListItemText
                  primary={result.title}
                  secondary={result.error}
                  primaryTypographyProps={{
                    color: result.success ? 'success.dark' : 'error.dark',
                  }}
                  secondaryTypographyProps={{
                    color: 'error.dark',
                  }}
                />
                {result.success ? (
                  <CheckCircle color="success" />
                ) : (
                  <ErrorIcon color="error" />
                )}
              </ListItem>
            ))}
          </List>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseResults} variant="contained">
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default JsonImport;
