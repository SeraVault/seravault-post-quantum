import React, { useEffect, useState } from 'react';
import { Snackbar, Button, Alert } from '@mui/material';
import { useRegisterSW } from 'virtual:pwa-register/react';

export const UpdatePrompt: React.FC = () => {
  const [showPrompt, setShowPrompt] = useState(false);

  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      console.log('✅ Service Worker registered');
      // Check for updates every hour
      if (r) {
        setInterval(() => {
          console.log('🔍 Checking for updates...');
          r.update();
        }, 60 * 60 * 1000); // 1 hour
      }
    },
    onRegisterError(error) {
      console.error('❌ Service Worker registration error:', error);
    },
  });

  useEffect(() => {
    if (needRefresh) {
      setShowPrompt(true);
    }
  }, [needRefresh]);

  const handleUpdate = () => {
    updateServiceWorker(true);
    setShowPrompt(false);
  };

  const handleClose = () => {
    setShowPrompt(false);
    setOfflineReady(false);
    setNeedRefresh(false);
  };

  return (
    <>
      {offlineReady && !needRefresh && (
        <Snackbar
          open={true}
          autoHideDuration={3000}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        >
          <Alert severity="success" onClose={handleClose}>
            App ready to work offline
          </Alert>
        </Snackbar>
      )}

      {showPrompt && (
        <Snackbar
          open={true}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
          sx={{ mb: 2 }}
        >
          <Alert
            severity="info"
            action={
              <>
                <Button color="inherit" size="small" onClick={handleUpdate}>
                  Update
                </Button>
                <Button color="inherit" size="small" onClick={handleClose}>
                  Later
                </Button>
              </>
            }
          >
            New version available! Click Update to refresh.
          </Alert>
        </Snackbar>
      )}
    </>
  );
};
