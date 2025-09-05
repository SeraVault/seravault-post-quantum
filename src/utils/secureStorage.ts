/**
 * Secure in-memory storage for sensitive data with automatic timeout
 * 
 * This provides temporary secure storage for decrypted private keys with:
 * - Automatic memory clearing after timeout
 * - Secure wipe on page unload
 * - Session-only persistence (no disk storage)
 */

import { secureWipe } from '../crypto/hpkeCrypto';

interface SecureStorageItem {
  data: Uint8Array;
  timestamp: number;
  lastActivity: number;
  timeoutId: NodeJS.Timeout;
  activityTimeout: number; // minutes
}

class SecureMemoryStorage {
  private storage = new Map<string, SecureStorageItem>();
  private activityListeners: (() => void)[] = [];
  private timeoutCallbacks = new Map<string, (() => void)[]>();

  constructor() {
    // Secure wipe on page unload
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => {
        this.clearAll();
      });
      
      // Also clear on visibility change (tab switching)
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          // User switched tabs - start shorter timeout
          this.reduceTimeouts();
        } else {
          // User returned - refresh activity
          this.updateActivity();
        }
      });
      
      // Track user activity
      const activityEvents = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
      const activityHandler = () => this.updateActivity();
      
      activityEvents.forEach(event => {
        document.addEventListener(event, activityHandler, { passive: true });
      });
    }
  }

  /**
   * Store sensitive data with automatic timeout that extends with user activity
   */
  store(key: string, data: string, timeoutMinutes = 30): void {
    // Clear existing item if it exists
    this.remove(key);

    const dataBytes = new TextEncoder().encode(data);
    const now = Date.now();
    const timeout = setTimeout(() => {
      this.remove(key, true); // Mark as timeout removal
    }, timeoutMinutes * 60 * 1000);

    this.storage.set(key, {
      data: dataBytes,
      timestamp: now,
      lastActivity: now,
      timeoutId: timeout,
      activityTimeout: timeoutMinutes,
    });
    
    // Register for activity updates
    if (!this.activityListeners.some(listener => listener.name === `update_${key}`)) {
      const activityListener = () => this.refreshTimeout(key);
      Object.defineProperty(activityListener, 'name', { value: `update_${key}` });
      this.activityListeners.push(activityListener);
    }
  }

  /**
   * Retrieve stored data (automatically extends timeout on access)
   */
  retrieve(key: string, refreshTimeout = true): string | null {
    const item = this.storage.get(key);
    if (!item) return null;

    const data = new TextDecoder().decode(item.data);
    
    if (refreshTimeout) {
      this.refreshTimeout(key);
    }

    return data;
  }

  /**
   * Check if key exists without refreshing timeout
   */
  has(key: string): boolean {
    return this.storage.has(key);
  }

  /**
   * Securely remove and wipe data
   */
  remove(key: string, isTimeout = false): void {
    const item = this.storage.get(key);
    if (item) {
      clearTimeout(item.timeoutId);
      secureWipe(item.data);
      this.storage.delete(key);
      
      // Remove activity listener
      this.activityListeners = this.activityListeners.filter(
        listener => listener.name !== `update_${key}`
      );
      
      // Trigger timeout callbacks if this was a timeout removal
      if (isTimeout) {
        const callbacks = this.timeoutCallbacks.get(key) || [];
        callbacks.forEach(callback => {
          try {
            callback();
          } catch (error) {
            console.error('Error in timeout callback:', error);
          }
        });
        this.timeoutCallbacks.delete(key);
      }
    }
  }

  /**
   * Register a callback to be called when a key times out
   */
  onTimeout(key: string, callback: () => void): void {
    const callbacks = this.timeoutCallbacks.get(key) || [];
    callbacks.push(callback);
    this.timeoutCallbacks.set(key, callbacks);
  }

  /**
   * Remove a timeout callback
   */
  removeTimeoutCallback(key: string, callback: () => void): void {
    const callbacks = this.timeoutCallbacks.get(key) || [];
    const filtered = callbacks.filter(cb => cb !== callback);
    if (filtered.length > 0) {
      this.timeoutCallbacks.set(key, filtered);
    } else {
      this.timeoutCallbacks.delete(key);
    }
  }

  /**
   * Clear all stored data
   */
  clearAll(): void {
    for (const [key] of this.storage) {
      this.remove(key);
    }
  }

  /**
   * Reduce all timeouts (called when user switches tabs)
   */
  private reduceTimeouts(): void {
    const shortTimeout = 5 * 60 * 1000; // 5 minutes when tab is hidden
    
    for (const [key, item] of this.storage) {
      clearTimeout(item.timeoutId);
      const newTimeout = setTimeout(() => {
        this.remove(key, true); // Mark as timeout removal
      }, shortTimeout);
      
      item.timeoutId = newTimeout;
    }
  }

  /**
   * Get time until expiration for a key (based on last activity)
   */
  getTimeUntilExpiration(key: string): number {
    const item = this.storage.get(key);
    if (!item) return 0;
    
    const elapsed = Date.now() - item.lastActivity;
    const timeoutMs = item.activityTimeout * 60 * 1000;
    return Math.max(0, timeoutMs - elapsed);
  }
  
  /**
   * Update activity timestamp and refresh timeout
   */
  private updateActivity(): void {
    for (const [key] of this.storage) {
      this.refreshTimeout(key);
    }
  }
  
  /**
   * Refresh timeout for a specific key based on activity
   */
  private refreshTimeout(key: string): void {
    const item = this.storage.get(key);
    if (!item) return;
    
    const now = Date.now();
    item.lastActivity = now;
    
    // Reset the timeout
    clearTimeout(item.timeoutId);
    const timeoutMs = item.activityTimeout * 60 * 1000;
    item.timeoutId = setTimeout(() => {
      this.remove(key, true); // Mark as timeout removal
    }, timeoutMs);
  }
}

// Singleton instance
export const secureStorage = new SecureMemoryStorage();

/**
 * Hook for managing private key storage with user preference
 */
export const usePrivateKeyStorage = () => {
  const storePrivateKey = (privateKey: string, rememberChoice: boolean) => {
    if (rememberChoice) {
      // Store with longer timeout if user chooses to remember
      secureStorage.store('privateKey', privateKey, 60); // 1 hour
      
      // Store the preference in localStorage (non-sensitive)
      localStorage.setItem('rememberPrivateKey', 'true');
    } else {
      // Store with shorter timeout
      secureStorage.store('privateKey', privateKey, 15); // 15 minutes
      localStorage.removeItem('rememberPrivateKey');
    }
  };

  const getStoredPrivateKey = (): string | null => {
    return secureStorage.retrieve('privateKey');
  };

  const clearStoredPrivateKey = () => {
    secureStorage.remove('privateKey');
    localStorage.removeItem('rememberPrivateKey');
  };

  const shouldRememberPrivateKey = (): boolean => {
    return localStorage.getItem('rememberPrivateKey') === 'true';
  };

  const hasStoredPrivateKey = (): boolean => {
    return secureStorage.has('privateKey');
  };

  const onPrivateKeyTimeout = (callback: () => void): void => {
    secureStorage.onTimeout('privateKey', callback);
  };

  const removePrivateKeyTimeoutCallback = (callback: () => void): void => {
    secureStorage.removeTimeoutCallback('privateKey', callback);
  };

  return {
    storePrivateKey,
    getStoredPrivateKey,
    clearStoredPrivateKey,
    shouldRememberPrivateKey,
    hasStoredPrivateKey,
    onPrivateKeyTimeout,
    removePrivateKeyTimeoutCallback,
  };
};