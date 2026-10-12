/**
 * Persistent storage (IndexedDB + in-memory cache) for user-uploaded custom assets:
 * - custom_field: Data URL of uploaded field image
 * - custom_mate_glb: Blob/Object URL of uploaded .glb 3D pet model
 * - custom_mate_png: Data URL of uploaded .png pet image
 * - custom_protector: Data URL of uploaded card back protector image
 * - custom_wallpaper: Data URL of uploaded main menu wallpaper image
 * - custom_avatar: Data URL of uploaded profile avatar image
 */

const DB_NAME = 'mdpro_custom_assets_db';
const STORE_NAME = 'assets';

export type CustomAssetKey =
  | 'custom_field'
  | 'custom_mate_glb'
  | 'custom_mate_png'
  | 'custom_protector'
  | 'custom_wallpaper'
  | 'custom_wallpaper_bg'
  | 'custom_avatar';

class CustomAssetStore {
  private memCache = new Map<CustomAssetKey, string>();
  private dbPromise: Promise<IDBDatabase | null> | null = null;

  private getDb(): Promise<IDBDatabase | null> {
    if (this.dbPromise) return this.dbPromise;
    this.dbPromise = new Promise((resolve) => {
      try {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME);
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
    return this.dbPromise;
  }

  public async preloadAll(): Promise<void> {
    const keys: CustomAssetKey[] = [
      'custom_field',
      'custom_mate_glb',
      'custom_mate_png',
      'custom_protector',
      'custom_wallpaper',
      'custom_wallpaper_bg',
      'custom_avatar',
    ];
    const db = await this.getDb();
    if (!db) return;

    await Promise.all(
      keys.map(
        (key) =>
          new Promise<void>((resolve) => {
            try {
              const tx = db.transaction(STORE_NAME, 'readonly');
              const store = tx.objectStore(STORE_NAME);
              const getReq = store.get(key);
              getReq.onsuccess = () => {
                const val = getReq.result;
                if (val instanceof Blob) {
                  this.memCache.set(key, URL.createObjectURL(val));
                } else if (typeof val === 'string' && val.length > 0) {
                  this.memCache.set(key, val);
                }
                resolve();
              };
              getReq.onerror = () => resolve();
            } catch {
              resolve();
            }
          })
      )
    );
  }

  public getUrl(key: CustomAssetKey): string | undefined {
    return this.memCache.get(key);
  }

  public async saveFile(key: CustomAssetKey, file: File): Promise<string> {
    if (key === 'custom_mate_glb') {
      const prev = this.memCache.get(key);
      if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev);
      const blobUrl = URL.createObjectURL(file);
      this.memCache.set(key, blobUrl);
      const db = await this.getDb();
      if (db) {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(file, key);
      }
      return blobUrl;
    }

    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });

    this.memCache.set(key, dataUrl);
    const db = await this.getDb();
    if (db) {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(dataUrl, key);
    }
    return dataUrl;
  }
}

export const customAssets = new CustomAssetStore();
