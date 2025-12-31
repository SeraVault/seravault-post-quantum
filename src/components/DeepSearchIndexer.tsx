import React from 'react';
import { 
  Box, 
  Button, 
  LinearProgress, 
  Typography, 
  Chip,
  Tooltip
} from '@mui/material';
import { Search, CheckCircle } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import type { DeepIndexProgress } from '../hooks/useGlobalFileIndex';

interface DeepSearchIndexerProps {
  progress: DeepIndexProgress;
  onStartIndexing: () => void;
  hasDeepIndex: boolean;
}

const DeepSearchIndexer: React.FC<DeepSearchIndexerProps> = ({
  progress,
  onStartIndexing,
  hasDeepIndex,
}) => {
  const { t } = useTranslation();

  const { isIndexing, total, processed, currentFile } = progress;

  if (!isIndexing && hasDeepIndex) {
    return (
      <Tooltip title={t('search.deepIndexComplete', 'Form contents indexed for searching')}>
        <Chip
          icon={<CheckCircle />}
          label={t('search.deepSearchEnabled', 'Deep Search')}
          color="success"
          size="small"
          sx={{ ml: { xs: 0, sm: 1 }, flexShrink: 0 }}
        />
      </Tooltip>
    );
  }

  if (!isIndexing) {
    return (
      <Tooltip title={t('search.deepIndexTooltip', 'Index form contents to search within fields (slow)')}>
        <Button
          size="small"
          startIcon={<Search />}
          onClick={onStartIndexing}
          sx={{ 
            ml: { xs: 0, sm: 1 }, 
            textTransform: 'none',
            flexShrink: 0,
            whiteSpace: 'nowrap',
          }}
        >
          {t('search.enableDeepSearch', 'Enable Deep Search')}
        </Button>
      </Tooltip>
    );
  }

  const percentage = total > 0 ? (processed / total) * 100 : 0;

  return (
    <Box sx={{ 
      minWidth: { xs: '100%', sm: 250 },
      maxWidth: { xs: '100%', sm: 250 },
      ml: { xs: 0, sm: 2 },
      flexShrink: 0, // Prevent shrinking
    }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
        <Typography variant="caption" sx={{ mr: 1, whiteSpace: 'nowrap' }}>
          {t('search.indexing', 'Indexing forms...')}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
          {processed}/{total}
        </Typography>
      </Box>
      <LinearProgress 
        variant="determinate" 
        value={percentage} 
        sx={{ height: 6, borderRadius: 1 }}
      />
      {currentFile && (
        <Typography 
          variant="caption" 
          color="text.secondary" 
          sx={{ 
            display: 'block', 
            mt: 0.5,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: '100%',
          }}
        >
          {currentFile}
        </Typography>
      )}
    </Box>
  );
};

export default DeepSearchIndexer;
