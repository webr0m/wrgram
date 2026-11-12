let database: Promise<IDBDatabase> | undefined;

function openPreferences() {
  if (!database) {
    database = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('wrgram-preferences', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('settings');
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => { db.close(); database = undefined; };
        resolve(db);
      };
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('Preferences database is busy'));
    }).catch(error => { database = undefined; throw error; });
  }
  return database;
}

export async function readPreference<T>(key: string): Promise<T | undefined> {
  const db = await openPreferences();
  return new Promise((resolve, reject) => {
    const request = db.transaction('settings').objectStore('settings').get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function writePreference<T>(key: string, value?: T): Promise<void> {
  const db = await openPreferences();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction('settings', 'readwrite');
    const store = transaction.objectStore('settings');
    if (value === undefined) store.delete(key);
    else store.put(value, key);
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error);
  });
}
