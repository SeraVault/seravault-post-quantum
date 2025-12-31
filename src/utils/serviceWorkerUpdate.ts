/**
 * Service Worker Update Handler
 * Detects when a new version is available and prompts user to reload
 */

let currentVersion: string | null = null;

export function registerServiceWorkerUpdateHandler() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready.then((registration) => {
      // Check for updates every 5 minutes
      setInterval(() => {
        registration.update();
      }, 300000);

      // Listen for new service worker waiting to activate
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;

        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // New service worker is ready, show update prompt
              showUpdatePrompt(newWorker);
            }
          });
        }
      });
      
      // Get initial version from service worker
      getServiceWorkerVersion();
    });

    // Handle controller change (when new SW takes over)
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      // Reload the page to use the new service worker
      window.location.reload();
    });
    
    // Listen for version check messages from service worker
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'VERSION_CHECK') {
        handleVersionCheck(event.data.version);
      }
      
      if (event.data && event.data.type === 'VERSION_INFO') {
        currentVersion = event.data.version;
        console.log('[SW] Current version:', currentVersion);
      }
    });
    
    // Notify service worker that client is ready
    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'CLIENT_READY' });
    }
  }
}

async function getServiceWorkerVersion() {
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    const messageChannel = new MessageChannel();
    
    messageChannel.port1.onmessage = (event) => {
      if (event.data && event.data.type === 'VERSION_RESPONSE') {
        currentVersion = event.data.version;
        console.log('[SW] Service Worker version:', currentVersion);
      }
    };
    
    navigator.serviceWorker.controller.postMessage(
      { type: 'GET_VERSION' },
      [messageChannel.port2]
    );
  }
}

function handleVersionCheck(newVersion: string) {
  if (currentVersion && currentVersion !== newVersion) {
    console.log('[SW] New version detected:', newVersion, '(current:', currentVersion + ')');
    showAutoUpdateNotification(newVersion);
  }
}

function showAutoUpdateNotification(newVersion: string) {
  // Show a notification banner
  const banner = document.createElement('div');
  banner.id = 'sw-update-banner';
  banner.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    background: #1976d2;
    color: white;
    padding: 16px;
    text-align: center;
    z-index: 10000;
    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  `;
  
  banner.innerHTML = `
    <div style="max-width: 800px; margin: 0 auto; display: flex; align-items: center; justify-content: center; gap: 16px;">
      <span>🚀 A new version (${newVersion}) is available!</span>
      <button id="sw-update-btn" style="
        background: white;
        color: #1976d2;
        border: none;
        padding: 8px 16px;
        border-radius: 4px;
        cursor: pointer;
        font-weight: 600;
      ">Update Now</button>
      <button id="sw-dismiss-btn" style="
        background: transparent;
        color: white;
        border: 1px solid white;
        padding: 8px 16px;
        border-radius: 4px;
        cursor: pointer;
      ">Later</button>
    </div>
  `;
  
  // Remove existing banner if present
  const existingBanner = document.getElementById('sw-update-banner');
  if (existingBanner) {
    existingBanner.remove();
  }
  
  document.body.appendChild(banner);
  
  // Add event listeners
  document.getElementById('sw-update-btn')?.addEventListener('click', () => {
    banner.remove();
    window.location.reload();
  });
  
  document.getElementById('sw-dismiss-btn')?.addEventListener('click', () => {
    banner.remove();
  });
  
  // Auto-reload after 30 seconds if user doesn't dismiss
  setTimeout(() => {
    if (document.getElementById('sw-update-banner')) {
      console.log('[SW] Auto-reloading to apply update...');
      window.location.reload();
    }
  }, 30000);
}

function showUpdatePrompt(newWorker: ServiceWorker) {
  // Show a simple browser notification
  const shouldUpdate = confirm(
    'A new version of SeraVault is available! Click OK to update now.'
  );

  if (shouldUpdate) {
    // Tell the new service worker to skip waiting
    newWorker.postMessage({ type: 'SKIP_WAITING' });
  }
}

/**
 * Force immediate service worker update check
 */
export async function checkForUpdates(): Promise<boolean> {
  if ('serviceWorker' in navigator) {
    const registration = await navigator.serviceWorker.ready;
    await registration.update();
    return true;
  }
  return false;
}
