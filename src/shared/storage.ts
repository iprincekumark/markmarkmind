import { Highlight, Collection, ExtensionSettings, Tag } from '../types';

export class StorageManager {
    private dbName = 'MarkMindDB';
    private version = 1;
    private db: IDBDatabase | null = null;
    private static instance: StorageManager;

    private constructor() { }

    public static getInstance(): StorageManager {
        if (!StorageManager.instance) {
            StorageManager.instance = new StorageManager();
        }
        return StorageManager.instance;
    }

    public async init(): Promise<void> {
        if (this.db) return;

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);

            request.onerror = (event) => {
                console.error('Database error:', (event.target as IDBOpenDBRequest).error);
                reject((event.target as IDBOpenDBRequest).error);
            };

            request.onsuccess = (event) => {
                this.db = (event.target as IDBOpenDBRequest).result;
                resolve();
            };

            request.onupgradeneeded = (event) => {
                const db = (event.target as IDBOpenDBRequest).result;

                // Highlights store
                if (!db.objectStoreNames.contains('highlights')) {
                    const highlightStore = db.createObjectStore('highlights', { keyPath: 'id' });
                    highlightStore.createIndex('url', 'url', { unique: false });
                    highlightStore.createIndex('createdAt', 'createdAt', { unique: false });
                    highlightStore.createIndex('tags', 'tags', { multiEntry: true });
                }

                // Collections store
                if (!db.objectStoreNames.contains('collections')) {
                    db.createObjectStore('collections', { keyPath: 'id' });
                }

                // Settings store
                if (!db.objectStoreNames.contains('settings')) {
                    db.createObjectStore('settings', { keyPath: 'id' });
                }
            };
        });
    }

    private async getDB(): Promise<IDBDatabase> {
        if (!this.db) {
            await this.init();
        }
        if (!this.db) throw new Error('Database not initialized');
        return this.db;
    }

    // --- Highlights ---

    public async saveHighlight(highlight: Highlight): Promise<string> {
        const db = await this.getDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['highlights'], 'readwrite');
            const store = transaction.objectStore('highlights');
            const request = store.put(highlight);

            request.onsuccess = () => resolve(highlight.id);
            request.onerror = () => reject(request.error);
        });
    }

    public async getHighlightsByUrl(url: string): Promise<Highlight[]> {
        const db = await this.getDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['highlights'], 'readonly');
            const store = transaction.objectStore('highlights');
            const index = store.index('url');
            const request = index.getAll(url);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    public async getAllHighlights(): Promise<Highlight[]> {
        const db = await this.getDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['highlights'], 'readonly');
            const store = transaction.objectStore('highlights');
            const index = store.index('createdAt');
            // Get all and sort by date descending manually or use cursor in reverse
            // Using simple getAll for now and sorting in memory if needed, or openCursor
            const request = store.getAll();

            request.onsuccess = () => {
                const results = request.result as Highlight[];
                // Sort explicitly by createdAt desc
                results.sort((a, b) => b.createdAt - a.createdAt);
                resolve(results);
            };
            request.onerror = () => reject(request.error);
        });
    }

    public async deleteHighlight(id: string): Promise<void> {
        const db = await this.getDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['highlights'], 'readwrite');
            const store = transaction.objectStore('highlights');
            const request = store.delete(id);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    public async searchHighlights(query: string): Promise<Highlight[]> {
        const allHighlights = await this.getAllHighlights();
        const lowerQuery = query.toLowerCase();

        // Simple full-text search on text and note
        return allHighlights.filter(h =>
            h.text.toLowerCase().includes(lowerQuery) ||
            (h.note && h.note.toLowerCase().includes(lowerQuery)) ||
            h.pageTitle.toLowerCase().includes(lowerQuery)
        );
    }

    // --- Collections ---

    public async saveCollection(collection: Collection): Promise<string> {
        const db = await this.getDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['collections'], 'readwrite');
            const store = transaction.objectStore('collections');
            const request = store.put(collection);

            request.onsuccess = () => resolve(collection.id);
            request.onerror = () => reject(request.error);
        });
    }

    public async getAllCollections(): Promise<Collection[]> {
        const db = await this.getDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['collections'], 'readonly');
            const store = transaction.objectStore('collections');
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    public async deleteCollection(id: string): Promise<void> {
        const db = await this.getDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['collections'], 'readwrite');
            const store = transaction.objectStore('collections');
            const request = store.delete(id);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    // --- Settings ---

    public async saveSettings(settings: ExtensionSettings): Promise<void> {
        const db = await this.getDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['settings'], 'readwrite');
            const store = transaction.objectStore('settings');
            // We store settings with a fixed ID 'user_settings'
            const request = store.put({ id: 'user_settings', ...settings });

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    public async getSettings(): Promise<ExtensionSettings> {
        const db = await this.getDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['settings'], 'readonly');
            const store = transaction.objectStore('settings');
            const request = store.get('user_settings');

            request.onsuccess = () => {
                if (request.result) {
                    const { id, ...settings } = request.result;
                    resolve(settings as ExtensionSettings);
                } else {
                    // Defaults
                    resolve({
                        defaultColor: 'yellow' as any,
                        showContextPanel: false,
                        keyboardShortcutsEnabled: true
                    });
                }
            };
            request.onerror = () => reject(request.error);
        });
    }

    // --- Tags ---

    public async getAllTags(): Promise<Tag[]> {
        // This is an aggregation based on highlights
        const highlights = await this.getAllHighlights();
        const tagMap = new Map<string, Tag>();

        highlights.forEach(h => {
            if (h.tags) {
                h.tags.forEach(t => {
                    const existing = tagMap.get(t) || { name: t, count: 0, lastUsed: 0 };
                    existing.count++;
                    existing.lastUsed = Math.max(existing.lastUsed, h.updatedAt);
                    tagMap.set(t, existing);
                });
            }
        });
        return Array.from(tagMap.values()).sort((a, b) => b.count - a.count);
    }

    public async exportAllData(): Promise<any> {
        const highlights = await this.getAllHighlights();
        const collections = await this.getAllCollections();
        const settings = await this.getSettings();

        return {
            version: 1,
            timestamp: Date.now(),
            highlights,
            collections,
            settings
        };
    }
}
