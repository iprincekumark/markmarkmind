import { Highlight, ExtractedConcept, ConceptCategory } from '../types';
import { storage } from './storage';
import { aiService } from './ai-service';

/**
 * ConceptLinker - Automatically discovers connections between highlights
 * 
 * This class implements multiple algorithms for finding semantic relationships
 * between highlights. It uses a hybrid approach that combines local processing
 * with optional AI enhancement, ensuring the system provides value regardless
 * of whether AI features are enabled.
 * 
 * Key algorithms implemented:
 * - TF-IDF for term importance weighting
 * - Cosine similarity for document comparison
 * - Concept graph traversal for multi-hop connections
 * - Temporal decay for recency bias
 */
class ConceptLinker {
    private vocabularyIndex: Map<string, Set<string>> = new Map();
    private conceptGraph: Map<string, Set<string>> = new Map();
    private lastIndexUpdate: number = 0;
    private readonly INDEX_REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes

    /**
     * Initialize the concept linker and build initial indexes
     */
    async initialize(): Promise<void> {
        try {
            console.log('Initializing ConceptLinker...');
            await this.rebuildIndexes();
            console.log('ConceptLinker initialized successfully');
        } catch (error) {
            console.error('Failed to initialize ConceptLinker:', error);
        }
    }

    /**
     * Rebuild all indexes from current highlights
     */
    private async rebuildIndexes(): Promise<void> {
        const highlights = await storage.getAllHighlights();

        this.vocabularyIndex.clear();
        this.conceptGraph.clear();

        // Build vocabulary index for fast term lookup
        highlights.forEach(highlight => {
            const words = this.extractWords(highlight.text);

            words.forEach(word => {
                if (!this.vocabularyIndex.has(word)) {
                    this.vocabularyIndex.set(word, new Set());
                }
                this.vocabularyIndex.get(word)!.add(highlight.id);
            });
        });

        // Build concept graph from extracted concepts
        highlights.forEach(highlight => {
            if (highlight.concepts.length === 0) return;

            highlight.concepts.forEach(concept => {
                if (!this.conceptGraph.has(concept.name)) {
                    this.conceptGraph.set(concept.name, new Set());
                }

                // Link this concept to all other concepts in the same highlight
                highlight.concepts.forEach(otherConcept => {
                    if (concept.name !== otherConcept.name) {
                        this.conceptGraph.get(concept.name)!.add(otherConcept.name);
                    }
                });
            });
        });

        this.lastIndexUpdate = Date.now();
        console.log(`Indexes rebuilt: ${this.vocabularyIndex.size} unique terms, ${this.conceptGraph.size} concepts`);
    }

    /**
     * Find highlights related to a source highlight
     */
    async findRelatedHighlights(
        sourceHighlightId: string,
        options: LinkingOptions = {}
    ): Promise<RelatedHighlight[]> {
        const {
            maxResults = 5,
            minSimilarity = 0.3,
            useAI = false,
            excludeIds = []
        } = options;

        // Check if we need to refresh indexes
        if (Date.now() - this.lastIndexUpdate > this.INDEX_REFRESH_INTERVAL) {
            await this.rebuildIndexes();
        }

        const sourceHighlight = await storage.getHighlight(sourceHighlightId);
        if (!sourceHighlight) {
            throw new Error('Source highlight not found');
        }

        let relatedHighlights: RelatedHighlight[] = [];

        // Strategy 1: Use AI if available and requested
        if (useAI && await aiService.isAvailable()) {
            relatedHighlights = await this.findRelatedWithAI(
                sourceHighlight,
                maxResults,
                excludeIds
            );
        }

        // Strategy 2: Use concept-based similarity if we have extracted concepts
        if (relatedHighlights.length === 0 && sourceHighlight.concepts.length > 0) {
            relatedHighlights = await this.findRelatedByConcepts(
                sourceHighlight,
                maxResults,
                minSimilarity,
                excludeIds
            );
        }

        // Strategy 3: Fall back to TF-IDF and cosine similarity
        if (relatedHighlights.length === 0) {
            relatedHighlights = await this.findRelatedByTFIDF(
                sourceHighlight,
                maxResults,
                minSimilarity,
                excludeIds
            );
        }

        // Apply temporal decay to boost recent highlights slightly
        relatedHighlights = this.applyTemporalDecay(relatedHighlights);

        return relatedHighlights
            .sort((a, b) => b.similarity - a.similarity)
            .slice(0, maxResults);
    }

    /**
     * Find related highlights using AI semantic understanding
     */
    private async findRelatedWithAI(
        source: Highlight,
        maxResults: number,
        excludeIds: string[]
    ): Promise<RelatedHighlight[]> {
        try {
            const allHighlights = await storage.getAllHighlights();
            const candidateHighlights = allHighlights.filter(h =>
                h.id !== source.id && !excludeIds.includes(h.id)
            );

            const relatedIds = await aiService.linkConcepts({
                sourceHighlightId: source.id,
                allHighlights: candidateHighlights,
                maxLinks: maxResults
            });

            return relatedIds.map((id, index) => ({
                highlight: candidateHighlights.find(h => h.id === id)!,
                similarity: 0.9 - (index * 0.1), // Descending scores
                matchType: 'ai_semantic',
                sharedConcepts: [],
                reason: 'AI identified semantic relationship'
            })).filter(r => r.highlight);
        } catch (error) {
            console.error('AI-based linking failed:', error);
            return [];
        }
    }

    /**
     * Find related highlights based on shared concepts
     */
    private async findRelatedByConcepts(
        source: Highlight,
        maxResults: number,
        minSimilarity: number,
        excludeIds: string[]
    ): Promise<RelatedHighlight[]> {
        const allHighlights = await storage.getAllHighlights();
        const candidateHighlights = allHighlights.filter(h =>
            h.id !== source.id && !excludeIds.includes(h.id)
        );

        const sourceConcepts = new Set(source.concepts.map(c => c.name.toLowerCase()));
        const sourceConceptsByCategory = this.groupConceptsByCategory(source.concepts);

        const related: RelatedHighlight[] = [];

        for (const candidate of candidateHighlights) {
            if (candidate.concepts.length === 0) continue;

            const candidateConcepts = new Set(candidate.concepts.map(c => c.name.toLowerCase()));
            const candidateConceptsByCategory = this.groupConceptsByCategory(candidate.concepts);

            // Calculate direct concept overlap
            const directOverlap = this.setIntersection(sourceConcepts, candidateConcepts);
            const directSimilarity = directOverlap.size /
                Math.sqrt(sourceConcepts.size * candidateConcepts.size);

            // Calculate graph-based similarity (concepts connected through the concept graph)
            const graphSimilarity = this.calculateGraphSimilarity(
                Array.from(sourceConcepts),
                Array.from(candidateConcepts)
            );

            // Calculate category-weighted similarity
            const categorySimilarity = this.calculateCategorySimilarity(
                sourceConceptsByCategory,
                candidateConceptsByCategory
            );

            // Combine the similarity scores with weights
            const totalSimilarity =
                (directSimilarity * 0.5) +
                (graphSimilarity * 0.3) +
                (categorySimilarity * 0.2);

            if (totalSimilarity >= minSimilarity) {
                const sharedConcepts = Array.from(directOverlap);
                const reason = this.generateConceptMatchReason(sharedConcepts, directOverlap.size);

                related.push({
                    highlight: candidate,
                    similarity: totalSimilarity,
                    matchType: 'concept_based',
                    sharedConcepts,
                    reason
                });
            }
        }

        return related;
    }

    /**
     * Calculate similarity using graph traversal
     */
    private calculateGraphSimilarity(
        sourceConcepts: string[],
        targetConcepts: string[]
    ): number {
        let connections = 0;
        let totalPaths = 0;

        sourceConcepts.forEach(sourceConcept => {
            targetConcepts.forEach(targetConcept => {
                totalPaths++;

                // Check for direct connection
                if (this.conceptGraph.get(sourceConcept)?.has(targetConcept)) {
                    connections += 1;
                }
                // Check for two-hop connection
                else {
                    const intermediates = this.conceptGraph.get(sourceConcept);
                    if (intermediates) {
                        for (const intermediate of intermediates) {
                            if (this.conceptGraph.get(intermediate)?.has(targetConcept)) {
                                connections += 0.5; // Two-hop connections worth less
                                break;
                            }
                        }
                    }
                }
            });
        });

        return totalPaths > 0 ? connections / totalPaths : 0;
    }

    /**
     * Calculate similarity based on concept categories
     */
    private calculateCategorySimilarity(
        sourceByCategory: Map<ConceptCategory, Set<string>>,
        targetByCategory: Map<ConceptCategory, Set<string>>
    ): number {
        const categoryWeights = {
            [ConceptCategory.Technology]: 1.0,
            [ConceptCategory.Theory]: 0.9,
            [ConceptCategory.Method]: 0.8,
            [ConceptCategory.Person]: 0.6,
            [ConceptCategory.Organization]: 0.5,
            [ConceptCategory.Location]: 0.3,
            [ConceptCategory.Event]: 0.7,
            [ConceptCategory.Unknown]: 0.4
        };

        let weightedSimilarity = 0;
        let totalWeight = 0;

        Object.values(ConceptCategory).forEach(category => {
            const sourceConcepts = sourceByCategory.get(category) || new Set();
            const targetConcepts = targetByCategory.get(category) || new Set();

            if (sourceConcepts.size === 0 && targetConcepts.size === 0) return;

            const overlap = this.setIntersection(sourceConcepts, targetConcepts);
            const similarity = overlap.size /
                Math.sqrt(sourceConcepts.size * targetConcepts.size);

            const weight = categoryWeights[category];
            weightedSimilarity += similarity * weight;
            totalWeight += weight;
        });

        return totalWeight > 0 ? weightedSimilarity / totalWeight : 0;
    }

    /**
     * Find related highlights using TF-IDF and cosine similarity
     */
    private async findRelatedByTFIDF(
        source: Highlight,
        maxResults: number,
        minSimilarity: number,
        excludeIds: string[]
    ): Promise<RelatedHighlight[]> {
        const allHighlights = await storage.getAllHighlights();
        const candidateHighlights = allHighlights.filter(h =>
            h.id !== source.id && !excludeIds.includes(h.id)
        );

        // Calculate IDF values for all terms in the corpus
        const idfValues = this.calculateIDF(allHighlights);

        // Calculate TF-IDF vector for source highlight
        const sourceTFIDF = this.calculateTFIDFVector(source.text, idfValues);

        const related: RelatedHighlight[] = [];

        for (const candidate of candidateHighlights) {
            const candidateTFIDF = this.calculateTFIDFVector(candidate.text, idfValues);

            // Calculate cosine similarity
            const similarity = this.cosineSimilarity(sourceTFIDF, candidateTFIDF);

            if (similarity >= minSimilarity) {
                // Find the top shared terms for the reason
                const sharedTerms = this.getTopSharedTerms(sourceTFIDF, candidateTFIDF, 3);
                const reason = `Shared themes: ${sharedTerms.join(', ')}`;

                related.push({
                    highlight: candidate,
                    similarity,
                    matchType: 'text_similarity',
                    sharedConcepts: sharedTerms,
                    reason
                });
            }
        }

        return related;
    }

    /**
     * Calculate IDF (Inverse Document Frequency) values
     */
    private calculateIDF(highlights: Highlight[]): Map<string, number> {
        const documentFrequency = new Map<string, number>();
        const totalDocuments = highlights.length;

        // Count how many documents contain each term
        highlights.forEach(highlight => {
            const words = new Set(this.extractWords(highlight.text));
            words.forEach(word => {
                documentFrequency.set(word, (documentFrequency.get(word) || 0) + 1);
            });
        });

        // Calculate IDF: log(total documents / documents containing term)
        const idf = new Map<string, number>();
        documentFrequency.forEach((df, term) => {
            idf.set(term, Math.log(totalDocuments / df));
        });

        return idf;
    }

    /**
     * Calculate TF-IDF vector for a text
     */
    private calculateTFIDFVector(text: string, idfValues: Map<string, number>): Map<string, number> {
        const words = this.extractWords(text);
        const termFrequency = new Map<string, number>();

        // Count term occurrences
        words.forEach(word => {
            termFrequency.set(word, (termFrequency.get(word) || 0) + 1);
        });

        // Calculate TF-IDF scores
        const tfidf = new Map<string, number>();
        termFrequency.forEach((tf, term) => {
            const idf = idfValues.get(term) || 0;
            tfidf.set(term, tf * idf);
        });

        return tfidf;
    }

    /**
     * Calculate cosine similarity between two TF-IDF vectors
     */
    private cosineSimilarity(
        vectorA: Map<string, number>,
        vectorB: Map<string, number>
    ): number {
        let dotProduct = 0;
        let magnitudeA = 0;
        let magnitudeB = 0;

        // Calculate dot product and magnitude of A
        vectorA.forEach((value, term) => {
            magnitudeA += value * value;
            const bValue = vectorB.get(term) || 0;
            dotProduct += value * bValue;
        });

        // Calculate magnitude of B
        vectorB.forEach((value) => {
            magnitudeB += value * value;
        });

        magnitudeA = Math.sqrt(magnitudeA);
        magnitudeB = Math.sqrt(magnitudeB);

        if (magnitudeA === 0 || magnitudeB === 0) return 0;

        return dotProduct / (magnitudeA * magnitudeB);
    }

    /**
     * Get the top shared terms between two TF-IDF vectors
     */
    private getTopSharedTerms(
        vectorA: Map<string, number>,
        vectorB: Map<string, number>,
        count: number
    ): string[] {
        const sharedScores: Array<{ term: string; score: number }> = [];

        vectorA.forEach((scoreA, term) => {
            const scoreB = vectorB.get(term);
            if (scoreB) {
                sharedScores.push({
                    term,
                    score: Math.min(scoreA, scoreB) // Use minimum to represent true shared importance
                });
            }
        });

        return sharedScores
            .sort((a, b) => b.score - a.score)
            .slice(0, count)
            .map(item => item.term);
    }

    /**
     * Apply temporal decay to boost recent highlights
     */
    private applyTemporalDecay(related: RelatedHighlight[]): RelatedHighlight[] {
        const now = Date.now();
        const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000);

        return related.map(item => {
            const age = now - item.highlight.createdAt;

            // Apply a small boost to recent highlights (max 10% boost)
            let temporalBoost = 0;
            if (age < thirtyDaysAgo) {
                const recencyScore = 1 - (age / thirtyDaysAgo);
                temporalBoost = recencyScore * 0.1;
            }

            return {
                ...item,
                similarity: Math.min(1, item.similarity + temporalBoost)
            };
        });
    }

    /**
     * Generate a human-readable reason for the concept match
     */
    private generateConceptMatchReason(concepts: string[], count: number): string {
        if (count === 0) return 'Related content';
        if (count === 1) return `Shares concept: ${concepts[0]}`;
        if (count === 2) return `Shares concepts: ${concepts[0]} and ${concepts[1]}`;
        return `Shares ${count} concepts including ${concepts.slice(0, 2).join(', ')}`;
    }

    /**
     * Extract and normalize words from text
     */
    private extractWords(text: string): string[] {
        const stopWords = new Set([
            'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
            'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
            'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
            'could', 'should', 'may', 'might', 'must', 'can', 'this', 'that',
            'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they',
            'what', 'which', 'who', 'when', 'where', 'why', 'how'
        ]);

        return text
            .toLowerCase()
            .replace(/[^\w\s]/g, ' ')
            .split(/\s+/)
            .filter(word =>
                word.length > 2 &&
                !stopWords.has(word) &&
                !/^\d+$/.test(word)
            )
            .map(word => this.simpleStem(word));
    }

    /**
     * Simple stemming algorithm (Porter Stemmer simplified)
     */
    private simpleStem(word: string): string {
        const suffixes = ['ing', 'ed', 'es', 's', 'ly', 'er', 'est', 'tion', 'ation'];

        for (const suffix of suffixes) {
            if (word.endsWith(suffix) && word.length > suffix.length + 2) {
                return word.substring(0, word.length - suffix.length);
            }
        }

        return word;
    }

    /**
     * Helper: Calculate set intersection
     */
    private setIntersection<T>(setA: Set<T>, setB: Set<T>): Set<T> {
        return new Set([...setA].filter(x => setB.has(x)));
    }

    /**
     * Helper: Group concepts by category
     */
    private groupConceptsByCategory(
        concepts: ExtractedConcept[]
    ): Map<ConceptCategory, Set<string>> {
        const grouped = new Map<ConceptCategory, Set<string>>();

        concepts.forEach(concept => {
            if (!grouped.has(concept.category)) {
                grouped.set(concept.category, new Set());
            }
            grouped.get(concept.category)!.add(concept.name.toLowerCase());
        });

        return grouped;
    }

    async findUnlinkedHighlights(minContentLength: number = 50): Promise<Highlight[]> {
        const allHighlights = await storage.getAllHighlights();

        return allHighlights.filter(h =>
            h.relatedHighlightIds.length === 0 &&
            h.text.length >= minContentLength
        );
    }

    async batchBuildLinks(
        batchSize: number = 10,
        onProgress?: (processed: number, total: number) => void
    ): Promise<void> {
        const unlinked = await this.findUnlinkedHighlights();
        console.log(`Building links for ${unlinked.length} highlights...`);

        for (let i = 0; i < unlinked.length; i += batchSize) {
            const batch = unlinked.slice(i, i + batchSize);

            await Promise.all(batch.map(async (highlight) => {
                try {
                    const related = await this.findRelatedHighlights(highlight.id, {
                        maxResults: 5,
                        minSimilarity: 0.4,
                        useAI: false
                    });

                    highlight.relatedHighlightIds = related.map(r => r.highlight.id);
                    await storage.saveHighlight(highlight);
                } catch (error) {
                    console.error(`Failed to build links for highlight ${highlight.id}:`, error);
                }
            }));

            if (onProgress) {
                onProgress(Math.min(i + batchSize, unlinked.length), unlinked.length);
            }

            await new Promise(resolve => setTimeout(resolve, 100));
        }

        console.log('Batch link building complete');
    }

    async getGraphStatistics(): Promise<GraphStatistics> {
        const highlights = await storage.getAllHighlights();

        const totalHighlights = highlights.length;
        const linkedHighlights = highlights.filter(h => h.relatedHighlightIds.length > 0).length;
        const totalLinks = highlights.reduce((sum, h) => sum + h.relatedHighlightIds.length, 0);
        const avgLinksPerHighlight = totalHighlights > 0 ? totalLinks / totalHighlights : 0;

        const conceptCounts = new Map<string, number>();
        highlights.forEach(h => {
            h.concepts.forEach(c => {
                conceptCounts.set(c.name, (conceptCounts.get(c.name) || 0) + 1);
            });
        });

        const topConcepts = Array.from(conceptCounts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([name, count]) => ({ name, count }));

        return {
            totalHighlights,
            linkedHighlights,
            linkagePercentage: totalHighlights > 0 ? (linkedHighlights / totalHighlights) * 100 : 0,
            totalLinks,
            avgLinksPerHighlight: Math.round(avgLinksPerHighlight * 10) / 10,
            totalConcepts: conceptCounts.size,
            topConcepts
        };
    }
}

export const conceptLinker = new ConceptLinker();

interface LinkingOptions {
    maxResults?: number;
    minSimilarity?: number;
    useAI?: boolean;
    excludeIds?: string[];
}

interface RelatedHighlight {
    highlight: Highlight;
    similarity: number;
    matchType: 'ai_semantic' | 'concept_based' | 'text_similarity';
    sharedConcepts: string[];
    reason: string;
}

interface GraphStatistics {
    totalHighlights: number;
    linkedHighlights: number;
    linkagePercentage: number;
    totalLinks: number;
    avgLinksPerHighlight: number;
    totalConcepts: number;
    topConcepts: Array<{ name: string; count: number }>;
}
