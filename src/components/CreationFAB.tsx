import React, { useState } from 'react';
import {
  SpeedDial,
  SpeedDialAction,
  SpeedDialIcon,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import {
  Add,
  CreateNewFolder,
  Upload,
  Description,
  ContentPaste,
} from '@mui/icons-material';

interface CreationFABProps {
  onCreateFolder: () => void;
  onUploadFiles: () => void;
  onCreateForm: () => void;
  onPaste?: () => void;
  showPaste?: boolean;
}

const CreationFAB: React.FC<CreationFABProps> = ({
  onCreateFolder,
  onUploadFiles,
  onCreateForm,
  onPaste,
  showPaste = false,
}) => {
  const [open, setOpen] = useState(false);
  const { t } = useTranslation();

  const actions = [
    {
      icon: <CreateNewFolder />,
      name: t('fab.newFolder'),
      action: () => {
        setOpen(false);
        onCreateFolder();
      }
    },
    {
      icon: <Upload />,
      name: t('fab.uploadFiles'),
      action: () => {
        setOpen(false);
        onUploadFiles();
      }
    },
    {
      icon: <Description />,
      name: t('fab.newForm'),
      action: () => {
        setOpen(false);
        onCreateForm();
      }
    },
    ...(showPaste && onPaste ? [{
      icon: <ContentPaste />,
      name: t('fab.paste'),
      action: () => {
        setOpen(false);
        onPaste();
      }
    }] : []),
  ];

  return (
    <SpeedDial
      ariaLabel={t('fab.createNewItem')}
      sx={{ 
        position: 'fixed', 
        bottom: 32, 
        right: 32,
        zIndex: 1300, // Higher z-index for better prominence
        '& .MuiFab-root': {
          width: 64,
          height: 64,
          boxShadow: '0 8px 16px rgba(25, 118, 210, 0.3), 0 4px 8px rgba(0, 0, 0, 0.15)',
          backgroundColor: 'primary.main',
          '&:hover': {
            backgroundColor: 'primary.dark',
            transform: 'scale(1.05)',
            boxShadow: '0 12px 24px rgba(25, 118, 210, 0.4), 0 6px 12px rgba(0, 0, 0, 0.2)',
          },
          transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
        },
        '& .MuiSpeedDialIcon-root': {
          fontSize: '1.5rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        },
        '& .MuiSpeedDialIcon-icon': {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        },
      }}
      icon={<SpeedDialIcon icon={<Add />} />}
      open={open}
      onOpen={() => setOpen(true)}
      onClose={() => setOpen(false)}
    >
      {actions.map((action) => (
        <SpeedDialAction
          key={action.name}
          icon={action.icon}
          tooltipTitle={action.name}
          tooltipOpen
          onClick={action.action}
          sx={{
            '& .MuiFab-root': {
              boxShadow: '0 4px 8px rgba(0, 0, 0, 0.15)',
              '&:hover': {
                transform: 'scale(1.1)',
                boxShadow: '0 6px 12px rgba(0, 0, 0, 0.25)',
              },
              transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
            },
            '& .MuiSpeedDialAction-staticTooltipLabel': {
              backgroundColor: 'background.paper',
              color: 'text.primary',
              border: '1px solid',
              borderColor: 'divider',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
              fontSize: '0.875rem',
              fontWeight: 500,
              whiteSpace: 'nowrap',
              borderRadius: '8px',
              padding: '6px 12px',
              minWidth: 'auto',
            }
          }}
        />
      ))}
    </SpeedDial>
  );
};

export default CreationFAB;