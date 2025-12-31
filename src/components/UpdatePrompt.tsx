import React, { useEffect, useState } from 'react';
import { Snackbar, Button, Alert } from '@mui/material';
import { useTranslation } from 'react-i18next';

const UPDATE_CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes

export const UpdatePrompt: React.FC = () => {
  const { t } = useTranslation();
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const [availableVersion, setAvailableVersion] = useState<string | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [offlineReady, setOfflineReady] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    let isMounted = true;
    let intervalId: number | undefined;

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'VERSION_CHECK') {
        setAvailableVersion(event.data.version ?? null);
      }
    };

    navigator.serviceWorker.addEventListener('message', handleMessage);

    navigator.serviceWorker.ready
      .then((registration) => {
        if (!isMounted) {
          return;
        }

        const hasShownOfflineReady = sessionStorage.getItem('sv_offline_ready');
        if (!hasShownOfflineReady) {
          setOfflineReady(true);
          sessionStorage.setItem('sv_offline_ready', 'true');
        }

        const checkForUpdates = async () => {
          try {
            await registration.update();
          } catch (error) {
            console.warn('[UpdatePrompt] Update check failed:', error);
          }

          if (registration.waiting) {
            setWaitingWorker(registration.waiting);
          }
        };

        const handleUpdateFound = () => {
          const newWorker = registration.installing;
          if (!newWorker) {
            return;
          }

          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              setWaitingWorker(newWorker);
            }
          });
        };

        registration.addEventListener('updatefound', handleUpdateFound);

        checkForUpdates();
        intervalId = window.setInterval(checkForUpdates, UPDATE_CHECK_INTERVAL);

        return () => {
          registration.removeEventListener('updatefound', handleUpdateFound);
        };
      })
      .catch((error) => {
        console.error('[UpdatePrompt] Failed to get service worker registration:', error);
      });

    return () => {
      isMounted = false;
      if (intervalId) {
        clearInterval(intervalId);
      }
      navigator.serviceWorker.removeEventListener('message', handleMessage);
    };
  }, []);

  useEffect(() => {
    if (waitingWorker) {
      setShowPrompt(true);
    }
  }, [waitingWorker]);

  const handleUpdate = () => {
    waitingWorker?.postMessage({ type: 'SKIP_WAITING' });
    setShowPrompt(false);
  };

  const handleClosePrompt = () => {
    setShowPrompt(false);
  };

  const handleOfflineReadyClose = () => {
    setOfflineReady(false);
  };

  return (
    <>
      <Snackbar
        open={offlineReady}
        autoHideDuration={4000}
        onClose={handleOfflineReadyClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="success" onClose={handleOfflineReadyClose}>
          {t('appUpdate.offlineReady', 'SeraVault is ready to work offline.')}
        </Alert>
      </Snackbar>

      <Snackbar
        open={showPrompt}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        sx={{ mb: 2 }}
      >
        <Alert
          severity="info"
          action={
            <>
              <Button color="inherit" size="small" onClick={handleUpdate}>
                {t('appUpdate.updateAction', 'Update')}
              </Button>
              <Button color="inherit" size="small" onClick={handleClosePrompt}>
                {t('appUpdate.laterAction', 'Later')}
              </Button>
            </>
          }
        >
          {availableVersion
            ? `${t('appUpdate.newVersion', 'A new version of SeraVault is available. Update now to get the latest improvements.')} (${availableVersion})`
            : t('appUpdate.newVersion', 'A new version of SeraVault is available. Update now to get the latest improvements.')}
        </Alert>
      </Snackbar>
    </>
  );
};
