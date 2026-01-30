import {
    Highlight,
    Collection,
    Tag,
    ExtensionSettings,
    HighlightColor,
    ReadingSession,
    AIInsight,
    ExtractedConcept,
    AIProvider,
    PrivacyMode,
    Theme,
    InsightType
} from '../types';

const DB_NAME = 'MarkMindDB';
const DB_VERSION = 2;  // Incremented for schema changes

const STORES = {
    HIGHLIGHTS: 'highlights',
    COLLECTIONS: 'collections',
    SETTINGS: 'settings',
    SESSIONS: 'reading_sessions',  // NEW
    INSIGHTS: 'ai_insights',  // NEW
    CONCEPTS: 'concepts'  // NEW - Global concept registry
};

class StorageManager {
    private db: IDBDatabase | null = null;
    private initPromise: Promise<void> | null = null;

    async init(): Promise<void> {
        if (this.initPromise) return this.initPromise;

        this.initPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = () => {
                console.error('Database initialization failed:', request.error);
                reject(request.error);
            };

            request.onsuccess = () => {
                this.db = request.result;
                console.log('Database initialized successfully');
                resolve();
            };

            request.onupgradeneeded = (event) => {
                const db = (event.target as IDBOpenDBRequest).result;
                // const oldVersion = event.oldVersion;

                // Create highlights store with comprehensive indexes
                if (!db.objectStoreNames.contains(STORES.HIGHLIGHTS)) {
                    const highlightStore = db.createObjectStore(STORES.HIGHLIGHTS, {
                        keyPath: 'id'
                    });

                    // Essential indexes for quick queries
                    highlightStore.createIndex('url', 'url', { unique: false });
                    highlightStore.createIndex('createdAt', 'createdAt', { unique: false });
                    highlightStore.createIndex('updatedAt', 'updatedAt', { unique: false });
                    highlightStore.createIndex('tags', 'tags', {
                        unique: false,
                        multiEntry: true
                    });
                    highlightStore.createIndex('collectionIds', 'collectionIds', {
                        unique: false,
                        multiEntry: true
                    });

                    // NEW - AI-specific indexes
                    highlightStore.createIndex('topics', 'topics', {
                        unique: false,
                        multiEntry: true
                    });
                    highlightStore.createIndex('concepts', 'concepts.name', {
                        unique: false,
                        multiEntry: true
                    });
                    highlightStore.createIndex('sentiment', 'sentiment', { unique: false });
                    highlightStore.createIndex('readingLevel', 'readingLevel', {
                        unique: false
                    });
                }

                // Collections store
                if (!db.objectStoreNames.contains(STORES.COLLECTIONS)) {
                    const collectionStore = db.createObjectStore(STORES.COLLECTIONS, {
                        keyPath: 'id'
                    });
                    collectionStore.createIndex('createdAt', 'createdAt', {
                        unique: false
                    });
                }

                // Settings store
                if (!db.objectStoreNames.contains(STORES.SETTINGS)) {
                    db.createObjectStore(STORES.SETTINGS);
                }

                // NEW - Reading sessions store
                if (!db.objectStoreNames.contains(STORES.SESSIONS)) {
                    const sessionStore = db.createObjectStore(STORES.SESSIONS, {
                        keyPath: 'id'
                    });
                    sessionStore.createIndex('url', 'url', { unique: false });
                    sessionStore.createIndex('startTime', 'startTime', { unique: false });
                }

                // NEW - AI insights store
                if (!db.objectStoreNames.contains(STORES.INSIGHTS)) {
                    const insightStore = db.createObjectStore(STORES.INSIGHTS, {
                        keyPath: 'id'
                    });
                    insightStore.createIndex('type', 'type', { unique: false });
                    insightStore.createIndex('createdAt', 'createdAt', { unique: false });
                    insightStore.createIndex('dismissed', 'dismissed', { unique: false });
                }

                // NEW - Global concepts store for concept registry
                if (!db.objectStoreNames.contains(STORES.CONCEPTS)) {
                    const conceptStore = db.createObjectStore(STORES.CONCEPTS, {
                        keyPath: 'name'
                    });
                    conceptStore.createIndex('category', 'category', { unique: false });
                    conceptStore.createIndex('frequency', 'frequency', { unique: false });
                }
            };
        });

        return this.initPromise;
    }

    // ========== HIGHLIGHT OPERATIONS ==========

    async saveHighlight(highlight: Highlight): Promise<void> {
        await this.ensureInitialized();

        return new Promise((resolve, reject) => {
            try {
                const transaction = this.db!.transaction([STORES.HIGHLIGHTS], 'readwrite');
                const store = transaction.objectStore(STORES.HIGHLIGHTS);

                // Update timestamp
                highlight.updatedAt = Date.now();

                const request = store.put(highlight);

                request.onsuccess = () => {
                    // Update concept registry
                    this.updateConceptRegistry(highlight.concepts);
                    resolve();
                };

                request.onerror = () => {
                    console.error('Failed to save highlight:', request.error);
                    reject(request.error);
                };
            } catch (error) {
                reject(error);
            }
        });
    }

    async getHighlightsByUrl(url: string): Promise<Highlight[]> {
        await this.ensureInitialized();

        return new Promise((resolve, reject) => {
            try {
                const transaction = this.db!.transaction([STORES.HIGHLIGHTS], 'readonly');
                const store = transaction.objectStore(STORES.HIGHLIGHTS);
                const index = store.index('url');
                const request = index.getAll(url);

                request.onsuccess = () => {
                    const highlights = request.result;
                    // Sort by position on page (using startOffset as proxy)
                    highlights.sort((a, b) =>
                        a.position.startOffset - b.position.startOffset
                    );
                    resolve(highlights);
                };

                request.onerror = () => reject(request.error);
            } catch (error) {
                reject(error);
            }
        });
    }

    // NEW - Advanced search with AI-powered relevance ranking
    async searchHighlights(query: string, filters?: SearchFilters): Promise<Highlight[]> {
        await this.ensureInitialized();

        return new Promise(async (resolve, reject) => {
            try {
                const allHighlights = await this.getAllHighlights();
                const searchTerms = query.toLowerCase().split(/\s+/);

                // Score each highlight for relevance
                const scoredHighlights = allHighlights
                    .map(highlight => ({
                        highlight,
                        score: this.calculateRelevanceScore(highlight, searchTerms, filters)
                    }))
                    .filter(item => item.score > 0)
                    .sort((a, b) => b.score - a.score)
                    .map(item => item.highlight);

                // Apply additional filters
                let filtered = scoredHighlights;

                if (filters) {
                    if (filters.collections?.length) {
                        filtered = filtered.filter(h =>
                            h.collectionIds.some(id => filters.collections!.includes(id))
                        );
                    }

                    if (filters.tags?.length) {
                        filtered = filtered.filter(h =>
                            h.tags.some(tag => filters.tags!.includes(tag))
                        );
                    }

                    if (filters.colors?.length) {
                        filtered = filtered.filter(h =>
                            filters.colors!.includes(h.color)
                        );
                    }

                    if (filters.dateRange) {
                        filtered = filtered.filter(h =>
                            h.createdAt >= filters.dateRange!.start &&
                            h.createdAt <= filters.dateRange!.end
                        );
                    }

                    if (filters.topics?.length) {
                        filtered = filtered.filter(h =>
                            h.topics.some(topic => filters.topics!.includes(topic))
                        );
                    }
                }

                resolve(filtered);
            } catch (error) {
                reject(error);
            }
        });
    }

    private calculateRelevanceScore(
        highlight: Highlight,
        searchTerms: string[],
        filters?: SearchFilters
    ): number {
        let score = 0;
        const text = highlight.text.toLowerCase();
        const note = highlight.note.toLowerCase();
        const title = highlight.pageTitle.toLowerCase();

        // Exact phrase match (highest score)
        const fullQuery = searchTerms.join(' ');
        if (text.includes(fullQuery)) score += 10;
        if (note.includes(fullQuery)) score += 8;
        if (title.includes(fullQuery)) score += 5;

        // Individual term matches
        searchTerms.forEach(term => {
            if (text.includes(term)) score += 3;
            if (note.includes(term)) score += 2;
            if (title.includes(term)) score += 1;

            // Concept matches
            if (highlight.concepts.some(c => c.name.toLowerCase().includes(term))) {
                score += 4;
            }

            // Topic matches
            if (highlight.topics.some(t => t.toLowerCase().includes(term))) {
                score += 3;
            }

            // Tag matches
            if (highlight.tags.some(tag => tag.toLowerCase().includes(term))) {
                score += 2;
            }
        });

        // Boost recent highlights slightly
        const daysSinceCreation = (Date.now() - highlight.createdAt) / (1000 * 60 * 60 * 24);
        if (daysSinceCreation < 7) score += 1;
        if (daysSinceCreation < 1) score += 2;

        // Boost frequently referenced highlights
        score += highlight.referenceCount * 0.5;

        return score;
    }

    async deleteHighlight(id: string): Promise<void> {
        await this.ensureInitialized();

        return new Promise((resolve, reject) => {
            try {
                const transaction = this.db!.transaction([STORES.HIGHLIGHTS], 'readwrite');
                const store = transaction.objectStore(STORES.HIGHLIGHTS);
                const request = store.delete(id);

                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            } catch (error) {
                reject(error);
            }
        });
    }

    async getAllHighlights(): Promise<Highlight[]> {
        await this.ensureInitialized();

        return new Promise((resolve, reject) => {
            try {
                const transaction = this.db!.transaction([STORES.HIGHLIGHTS], 'readonly');
                const store = transaction.objectStore(STORES.HIGHLIGHTS);
                const request = store.getAll();

                request.onsuccess = () => {
                    const sorted = request.result.sort((a, b) =>
                        b.createdAt - a.createdAt
                    );
                    resolve(sorted);
                };

                request.onerror = () => reject(request.error);
            } catch (error) {
                reject(error);
            }
        });
    }

    // NEW - Get highlights by topic for knowledge graph
    async getHighlightsByTopic(topic: string): Promise<Highlight[]> {
        await this.ensureInitialized();

        return new Promise((resolve, reject) => {
            try {
                const transaction = this.db!.transaction([STORES.HIGHLIGHTS], 'readonly');
                const store = transaction.objectStore(STORES.HIGHLIGHTS);
                const index = store.index('topics');
                const request = index.getAll(topic);

                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            } catch (error) {
                reject(error);
            }
        });
    }

    // NEW - Get related highlights using AI-generated links
    async getRelatedHighlights(highlightId: string): Promise<Highlight[]> {
        await this.ensureInitialized();

        try {
            const highlight = await this.getHighlight(highlightId);
            if (!highlight || !highlight.relatedHighlightIds.length) {
                return [];
            }

            const related = await Promise.all(
                highlight.relatedHighlightIds.map(id => this.getHighlight(id))
            );

            return related.filter(h => h !== null) as Highlight[];
        } catch (error) {
            console.error('Failed to get related highlights:', error);
            return [];
        }
    }

    async getHighlight(id: string): Promise<Highlight | null> {
        await this.ensureInitialized();

        return new Promise((resolve, reject) => {
            try {
                const transaction = this.db!.transaction([STORES.HIGHLIGHTS], 'readonly');
                const store = transaction.objectStore(STORES.HIGHLIGHTS);
                const request = store.get(id);

                request.onsuccess = () => resolve(request.result || null);
                request.onerror = () => reject(request.error);
            } catch (error) {
                reject(error);
            }
        });
    }

    // ========== COLLECTION OPERATIONS ==========

    async saveCollection(collection: Collection): Promise<void> {
        await this.ensureInitialized();

        return new Promise((resolve, reject) => {
            try {
                const transaction = this.db!.transaction([STORES.COLLECTIONS], 'readwrite');
                const store = transaction.objectStore(STORES.COLLECTIONS);

                collection.updatedAt = Date.now();

                const request = store.put(collection);

                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            } catch (error) {
                reject(error);
            }
        });
    }

    async getAllCollections(): Promise<Collection[]> {
        await this.ensureInitialized();

        return new Promise((resolve, reject) => {
            try {
                const transaction = this.db!.transaction([STORES.COLLECTIONS], 'readonly');
                const store = transaction.objectStore(STORES.COLLECTIONS);
                const request = store.getAll();

                request.onsuccess = () => {
                    const collections = request.result.sort((a, b) =>
                        b.createdAt - a.createdAt
                    );
                    resolve(collections);
                };

                request.onerror = () => reject(request.error);
            } catch (error) {
                reject(error);
            }
        });
    }

    async deleteCollection(id: string): Promise<void> {
        await this.ensureInitialized();

        return new Promise(async (resolve, reject) => {
            try {
                // Remove collection ID from all highlights
                const highlights = await this.getAllHighlights();
                const updatePromises = highlights
                    .filter(h => h.collectionIds.includes(id))
                    .map(h => {
                        h.collectionIds = h.collectionIds.filter(cid => cid !== id);
                        return this.saveHighlight(h);
                    });

                await Promise.all(updatePromises);

                // Delete the collection
                const transaction = this.db!.transaction([STORES.COLLECTIONS], 'readwrite');
                const store = transaction.objectStore(STORES.COLLECTIONS);
                const request = store.delete(id);

                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            } catch (error) {
                reject(error);
            }
        });
    }

    // ========== SETTINGS OPERATIONS ==========

    async getSettings(): Promise<ExtensionSettings> {
        await this.ensureInitialized();

        return new Promise((resolve, reject) => {
            try {
                const transaction = this.db!.transaction([STORES.SETTINGS], 'readonly');
                const store = transaction.objectStore(STORES.SETTINGS);
                const request = store.get('userSettings');

                request.onsuccess = () => {
                    // Return saved settings or defaults
                    const settings = request.result || this.getDefaultSettings();
                    resolve(settings);
                };

                request.onerror = () => reject(request.error);
            } catch (error) {
                reject(error);
            }
        });
    }

    private getDefaultSettings(): ExtensionSettings {
        return {
            defaultColor: HighlightColor.Yellow,
            showContextPanel: true,
            keyboardShortcutsEnabled: true,
            aiEnabled: false,
            aiProvider: AIProvider.None,
            autoSummarize: false,
            autoConceptExtraction: false,
            autoLinking: false,
            showInsights: true,
            privacyMode: PrivacyMode.FullyLocal,
            theme: Theme.Auto,
            compactMode: false,
            animationsEnabled: true,
            sidebarPosition: 'right'
        };
    }

    async saveSettings(settings: ExtensionSettings): Promise<void> {
        await this.ensureInitialized();

        return new Promise((resolve, reject) => {
            try {
                const transaction = this.db!.transaction([STORES.SETTINGS], 'readwrite');
                const store = transaction.objectStore(STORES.SETTINGS);
                const request = store.put(settings, 'userSettings');

                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            } catch (error) {
                reject(error);
            }
        });
    }

    // ========== TAG OPERATIONS ==========

    async getAllTags(): Promise<Tag[]> {
        await this.ensureInitialized();

        return new Promise(async (resolve, reject) => {
            try {
                const highlights = await this.getAllHighlights();
                const tagMap = new Map<string, Tag>();

                // Aggregate tag statistics
                highlights.forEach(highlight => {
                    highlight.tags.forEach(tagName => {
                        if (tagMap.has(tagName)) {
                            const tag = tagMap.get(tagName)!;
                            tag.count++;
                            tag.lastUsed = Math.max(tag.lastUsed, highlight.updatedAt);
                        } else {
                            tagMap.set(tagName, {
                                name: tagName,
                                count: 1,
                                lastUsed: highlight.updatedAt,
                                relatedTags: [],
                                growthTrend: 'stable'
                            });
                        }
                    });
                });

                // Calculate growth trends
                const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
                const sixtyDaysAgo = Date.now() - (60 * 24 * 60 * 60 * 1000);

                tagMap.forEach(tag => {
                    const recentCount = highlights.filter(h =>
                        h.createdAt > thirtyDaysAgo && h.tags.includes(tag.name)
                    ).length;
                    const olderCount = highlights.filter(h =>
                        h.createdAt > sixtyDaysAgo &&
                        h.createdAt <= thirtyDaysAgo &&
                        h.tags.includes(tag.name)
                    ).length;

                    if (recentCount > olderCount * 1.5) {
                        tag.growthTrend = 'increasing';
                    } else if (recentCount < olderCount * 0.5) {
                        tag.growthTrend = 'decreasing';
                    }
                });

                const tags = Array.from(tagMap.values()).sort((a, b) =>
                    b.count - a.count
                );

                resolve(tags);
            } catch (error) {
                reject(error);
            }
        });
    }

    // ========== AI INSIGHTS OPERATIONS ==========

    async saveInsight(insight: AIInsight): Promise<void> {
        await this.ensureInitialized();

        return new Promise((resolve, reject) => {
            try {
                const transaction = this.db!.transaction([STORES.INSIGHTS], 'readwrite');
                const store = transaction.objectStore(STORES.INSIGHTS);
                const request = store.put(insight);

                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            } catch (error) {
                reject(error);
            }
        });
    }

    async getActiveInsights(): Promise<AIInsight[]> {
        await this.ensureInitialized();

        return new Promise((resolve, reject) => {
            try {
                const transaction = this.db!.transaction([STORES.INSIGHTS], 'readonly');
                const store = transaction.objectStore(STORES.INSIGHTS);
                const index = store.index('dismissed');
                const request = index.getAll(0); // 0 = active, 1 = dismissed

                request.onsuccess = () => {
                    const insights = request.result.sort((a, b) =>
                        b.createdAt - a.createdAt
                    );
                    resolve(insights.slice(0, 10)); // Return top 10
                };

                request.onerror = () => reject(request.error);
            } catch (error) {
                reject(error);
            }
        });
    }

    async dismissInsight(id: string): Promise<void> {
        await this.ensureInitialized();

        return new Promise(async (resolve, reject) => {
            try {
                const transaction = this.db!.transaction([STORES.INSIGHTS], 'readwrite');
                const store = transaction.objectStore(STORES.INSIGHTS);
                const getRequest = store.get(id);

                getRequest.onsuccess = () => {
                    const insight = getRequest.result;
                    if (insight) {
                        insight.dismissed = 1;
                        const putRequest = store.put(insight);
                        putRequest.onsuccess = () => resolve();
                        putRequest.onerror = () => reject(putRequest.error);
                    } else {
                        resolve();
                    }
                };

                getRequest.onerror = () => reject(getRequest.error);
            } catch (error) {
                reject(error);
            }
        });
    }

    // ========== CONCEPT REGISTRY OPERATIONS ==========

    private async updateConceptRegistry(concepts: ExtractedConcept[]): Promise<void> {
        if (!concepts || concepts.length === 0) return;

        try {
            const transaction = this.db!.transaction([STORES.CONCEPTS], 'readwrite');
            const store = transaction.objectStore(STORES.CONCEPTS);

            concepts.forEach(concept => {
                const request = store.get(concept.name);

                request.onsuccess = () => {
                    const existing = request.result;
                    if (existing) {
                        existing.frequency++;
                        existing.lastSeen = Date.now();
                        store.put(existing);
                    } else {
                        store.put({
                            name: concept.name,
                            category: concept.category,
                            frequency: 1,
                            lastSeen: Date.now(),
                            relatedConcepts: concept.relatedConcepts
                        });
                    }
                };
            });
        } catch (error) {
            console.error('Failed to update concept registry:', error);
        }
    }

    async getTopConcepts(limit: number = 20): Promise<any[]> {
        await this.ensureInitialized();

        return new Promise((resolve, reject) => {
            try {
                const transaction = this.db!.transaction([STORES.CONCEPTS], 'readonly');
                const store = transaction.objectStore(STORES.CONCEPTS);
                const index = store.index('frequency');
                const request = index.getAll();

                request.onsuccess = () => {
                    const concepts = request.result
                        .sort((a, b) => b.frequency - a.frequency)
                        .slice(0, limit);
                    resolve(concepts);
                };

                request.onerror = () => reject(request.error);
            } catch (error) {
                reject(error);
            }
        });
    }

    // ========== READING SESSION OPERATIONS ==========

    async startReadingSession(url: string, pageTitle: string): Promise<string> {
        await this.ensureInitialized();

        const session: ReadingSession = {
            id: this.generateId(),
            url,
            pageTitle,
            startTime: Date.now(),
            highlightsCreated: 0,
            totalTimeSpent: 0,
            scrollDepth: 0
        };

        return new Promise((resolve, reject) => {
            try {
                const transaction = this.db!.transaction([STORES.SESSIONS], 'readwrite');
                const store = transaction.objectStore(STORES.SESSIONS);
                const request = store.put(session);

                request.onsuccess = () => resolve(session.id);
                request.onerror = () => reject(request.error);
            } catch (error) {
                reject(error);
            }
        });
    }

    async endReadingSession(
        sessionId: string,
        highlightsCreated: number,
        scrollDepth: number
    ): Promise<void> {
        await this.ensureInitialized();

        return new Promise(async (resolve, reject) => {
            try {
                const transaction = this.db!.transaction([STORES.SESSIONS], 'readwrite');
                const store = transaction.objectStore(STORES.SESSIONS);
                const getRequest = store.get(sessionId);

                getRequest.onsuccess = () => {
                    const session = getRequest.result;
                    if (session) {
                        session.endTime = Date.now();
                        session.totalTimeSpent = session.endTime - session.startTime;
                        session.highlightsCreated = highlightsCreated;
                        session.scrollDepth = scrollDepth;

                        const putRequest = store.put(session);
                        putRequest.onsuccess = () => resolve();
                        putRequest.onerror = () => reject(putRequest.error);
                    } else {
                        resolve();
                    }
                };

                getRequest.onerror = () => reject(getRequest.error);
            } catch (error) {
                reject(error);
            }
        });
    }

    // ========== EXPORT AND BACKUP ==========

    async exportAllData(): Promise<ExportData> {
        await this.ensureInitialized();

        try {
            const [highlights, collections, settings, insights, sessions] = await Promise.all([
                this.getAllHighlights(),
                this.getAllCollections(),
                this.getSettings(),
                this.getActiveInsights(),
                this.getRecentSessions(100)
            ]);

            return {
                version: '2.0.0',
                exportedAt: Date.now(),
                highlights,
                collections,
                settings,
                insights,
                sessions,
                metadata: {
                    totalHighlights: highlights.length,
                    totalCollections: collections.length,
                    oldestHighlight: highlights.length > 0
                        ? Math.min(...highlights.map(h => h.createdAt))
                        : Date.now(),
                    newestHighlight: highlights.length > 0
                        ? Math.max(...highlights.map(h => h.createdAt))
                        : Date.now()
                }
            };
        } catch (error) {
            console.error('Export failed:', error);
            throw error;
        }
    }

    async importData(data: ExportData): Promise<ImportResult> {
        await this.ensureInitialized();

        const result: ImportResult = {
            success: false,
            highlightsImported: 0,
            collectionsImported: 0,
            errors: []
        };

        try {
            // Import highlights
            for (const highlight of data.highlights) {
                try {
                    await this.saveHighlight(highlight);
                    result.highlightsImported++;
                } catch (error) {
                    result.errors.push(`Failed to import highlight ${highlight.id}`);
                }
            }

            // Import collections
            for (const collection of data.collections) {
                try {
                    await this.saveCollection(collection);
                    result.collectionsImported++;
                } catch (error) {
                    result.errors.push(`Failed to import collection ${collection.id}`);
                }
            }

            result.success = result.errors.length === 0;
            return result;
        } catch (error) {
            result.errors.push('Import process failed: ' + error);
            return result;
        }
    }

    private async getRecentSessions(limit: number): Promise<ReadingSession[]> {
        return new Promise((resolve, reject) => {
            try {
                const transaction = this.db!.transaction([STORES.SESSIONS], 'readonly');
                const store = transaction.objectStore(STORES.SESSIONS);
                const index = store.index('startTime');
                const request = index.getAll();

                request.onsuccess = () => {
                    const sessions = request.result
                        .sort((a, b) => b.startTime - a.startTime)
                        .slice(0, limit);
                    resolve(sessions);
                };

                request.onerror = () => reject(request.error);
            } catch (error) {
                reject(error);
            }
        });
    }

    // ========== UTILITY METHODS ==========

    private async ensureInitialized(): Promise<void> {
        if (!this.db) {
            await this.init();
        }
    }

    private generateId(): string {
        return `${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    }

    async getStats(): Promise<StorageStats> {
        await this.ensureInitialized();

        try {
            const [highlights, collections, tags, concepts] = await Promise.all([
                this.getAllHighlights(),
                this.getAllCollections(),
                this.getAllTags(),
                this.getTopConcepts(100)
            ]);

            const totalWords = highlights.reduce((sum, h) =>
                sum + h.text.split(/\s+/).length, 0
            );

            const avgWordsPerHighlight = highlights.length > 0
                ? totalWords / highlights.length
                : 0;

            const uniqueUrls = new Set(highlights.map(h => h.url)).size;

            return {
                totalHighlights: highlights.length,
                totalCollections: collections.length,
                totalTags: tags.length,
                totalConcepts: concepts.length,
                totalWords,
                avgWordsPerHighlight: Math.round(avgWordsPerHighlight),
                uniqueUrls,
                oldestHighlight: highlights.length > 0
                    ? Math.min(...highlights.map(h => h.createdAt))
                    : null,
                newestHighlight: highlights.length > 0
                    ? Math.max(...highlights.map(h => h.createdAt))
                    : null
            };
        } catch (error) {
            console.error('Failed to get stats:', error);
            throw error;
        }
    }
}

// Export singleton instance
export const storage = new StorageManager();

// Supporting interfaces
interface SearchFilters {
    collections?: string[];
    tags?: string[];
    colors?: HighlightColor[];
    dateRange?: {
        start: number;
        end: number;
    };
    topics?: string[];
    minSentiment?: number;
    maxSentiment?: number;
}

interface ExportData {
    version: string;
    exportedAt: number;
    highlights: Highlight[];
    collections: Collection[];
    settings: ExtensionSettings;
    insights: AIInsight[];
    sessions: ReadingSession[];
    metadata: {
        totalHighlights: number;
        totalCollections: number;
        oldestHighlight: number;
        newestHighlight: number;
    };
}

interface ImportResult {
    success: boolean;
    highlightsImported: number;
    collectionsImported: number;
    errors: string[];
}

interface StorageStats {
    totalHighlights: number;
    totalCollections: number;
    totalTags: number;
    totalConcepts: number;
    totalWords: number;
    avgWordsPerHighlight: number;
    uniqueUrls: number;
    oldestHighlight: number | null;
    newestHighlight: number | null;
}
