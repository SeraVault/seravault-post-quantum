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
        bottom: 24, 
        right: 24,
        zIndex: 1000,
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
            '& .MuiSpeedDialAction-staticTooltipLabel': {
              backgroundColor: 'background.paper',
              color: 'text.primary',
              border: '1px solid',
              borderColor: 'divider',
              boxShadow: 2,
              fontSize: '0.875rem',
              fontWeight: 500,
              whiteSpace: 'nowrap',
            }
          }}
        />
      ))}
    </SpeedDial>
  );
};

export default CreationFAB;