/**
 * Cache Cleanup Utilities
 * 
 * Removes obsolete cache databases from previous versions
 */

/**
 * Delete the old FileCacheService IndexedDB database
 * This was replaced by the in-memory cache
 */
export async function cleanupObsoleteCaches(): Promise<void> {
  try {
    const databases = await indexedDB.databases();
    const obsoleteDbs = ['SeraVaultFileCache']; // Old database name
    
    for (const db of databases) {
      if (db.name && obsoleteDbs.includes(db.name)) {
        console.log(`🗑️ Removing obsolete database: ${db.name}`);
        await new Promise<void>((resolve, reject) => {
          const request = indexedDB.deleteDatabase(db.name!);
          request.onsuccess = () => {
            console.log(`✅ Deleted obsolete database: ${db.name}`);
            resolve();
          };
          request.onerror = () => reject(request.error);
        });
      }
    }
  } catch (error) {
    console.warn('Failed to cleanup obsolete caches:', error);
  }
}
