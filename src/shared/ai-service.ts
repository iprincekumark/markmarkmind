import {
    AIPrompt,
    AIResponse,
    AIProvider,
    SummarizationRequest,
    SummaryStyle,
    ConceptExtractionRequest,
    ConceptLinkingRequest,
    InsightGenerationRequest,
    ExtractedConcept,
    ConceptCategory,
    AIInsight,
    InsightType,
    Highlight
} from '../types';
import { storage } from './storage';

/**
 * AIService - Main orchestrator for all AI operations
 * 
 * This service provides a unified interface for AI features while supporting
 * multiple backends (local processing, OpenAI, Anthropic, Gemini).
 * 
 * Key design principles:
 * - Privacy-first: Local processing by default
 * - Provider-agnostic: Easy to swap backends
 * - Graceful degradation: Works without AI enabled
 * - Efficient: Caches results to minimize API calls
 */
class AIService {
    private provider: AIProvider = AIProvider.None;
    private apiKey: string = '';
    private cache: Map<string, any> = new Map();
    private requestQueue: Array<() => Promise<any>> = [];
    private isProcessing: boolean = false;

    /**
     * Initialize the AI service with user settings
     */
    async initialize(): Promise<void> {
        try {
            const settings = await storage.getSettings();
            this.provider = settings.aiProvider;

            // Load API key from chrome.storage.local (never sync)
            const result = await chrome.storage.local.get(['apiKey']);
            this.apiKey = result.apiKey || '';

            console.log('AI Service initialized with provider:', this.provider);
        } catch (error) {
            console.error('Failed to initialize AI service:', error);
        }
    }

    /**
     * Update the active provider and API key
     */
    async setProvider(provider: AIProvider, apiKey?: string): Promise<void> {
        this.provider = provider;

        if (apiKey) {
            this.apiKey = apiKey;
            await chrome.storage.local.set({ apiKey });
        }

        // Clear cache when changing providers
        this.cache.clear();
    }

    /**
     * Check if AI features are available
     */
    isAvailable(): boolean {
        if (this.provider === AIProvider.None) return false;
        if (this.provider === AIProvider.Local) return true;
        return this.apiKey.length > 0;
    }

    // ========== SUMMARIZATION ==========

    /**
     * Generate a summary of highlights with intelligent prioritization
     * 
     * This is one of the most valuable features. Instead of generic summaries,
     * we create summaries that emphasize what the user found important by
     * using their highlights as priority signals.
     */
    async summarizeHighlights(request: SummarizationRequest): Promise<string> {
        if (!this.isAvailable()) {
            return this.generateLocalSummary(request);
        }

        const cacheKey = this.getCacheKey('summary', request);
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        try {
            const prompt = this.buildSummarizationPrompt(request);
            const response = await this.callAI(prompt);

            this.cache.set(cacheKey, response.content);
            return response.content;
        } catch (error) {
            console.error('Summarization failed, falling back to local:', error);
            return this.generateLocalSummary(request);
        }
    }

    /**
     * Build a sophisticated prompt for summarization
     */
    private buildSummarizationPrompt(request: SummarizationRequest): AIPrompt {
        const { highlights, style, maxLength, focusAreas } = request;

        // Sort highlights by length (longer = user spent more time selecting)
        const sortedHighlights = [...highlights].sort((a, b) =>
            b.text.length - a.text.length
        );

        // Build context from highlights
        const highlightContext = sortedHighlights
            .slice(0, 10) // Top 10 most substantial highlights
            .map((h, i) => `[${i + 1}] "${h.text}"${h.note ? `\nUser note: ${h.note}` : ''}`)
            .join('\n\n');

        // Build focus areas context
        const focusContext = focusAreas && focusAreas.length > 0
            ? `\n\nThe user is particularly interested in these areas: ${focusAreas.join(', ')}`
            : '';

        // Style-specific instructions
        const styleInstructions = this.getStyleInstructions(style, maxLength);

        const systemPrompt = `You are a knowledge synthesis assistant helping a user understand what they've learned from their reading. The user has highlighted passages from various articles and documents. Your job is to create a personalized summary that emphasizes what the user found important.

Key principles:
- Prioritize content from longer highlights (they spent more time selecting these)
- Incorporate user notes to understand their perspective
- Maintain accuracy - never invent information not present in the highlights
- Connect related ideas across different sources
- Use clear, accessible language${focusContext}`;

        const userPrompt = `Please create a ${style} summary based on these highlights from my reading:

${highlightContext}

${styleInstructions}

Remember to emphasize the passages I highlighted most substantially, and incorporate insights from my notes where relevant.`;

        return {
            systemPrompt,
            userPrompt,
            maxTokens: this.calculateMaxTokens(maxLength),
            temperature: 0.7 // Balanced creativity and accuracy
        };
    }

    /**
     * Get style-specific instructions for different summary formats
     */
    private getStyleInstructions(style: SummaryStyle, maxLength: number): string {
        switch (style) {
            case SummaryStyle.Concise:
                return `Create a brief summary in 2-3 paragraphs (approximately ${maxLength} words) that captures the key themes and insights.`;

            case SummaryStyle.Detailed:
                return `Create a comprehensive summary (approximately ${maxLength} words) that explores the main ideas in depth, showing connections between concepts and maintaining the nuance from my highlights.`;

            case SummaryStyle.Bullet:
                return `Create a bulleted summary with:
- Main themes (3-5 bullets)
- Key insights (5-7 bullets with brief explanations)
- Notable quotes or ideas (2-3 bullets)
Keep the total length around ${maxLength} words.`;

            case SummaryStyle.Narrative:
                return `Create a flowing narrative summary (approximately ${maxLength} words) that tells the story of what I learned, connecting ideas chronologically or thematically as appropriate.`;

            case SummaryStyle.Question:
                return `Create a Q&A format summary with ${Math.floor(maxLength / 80)} questions that capture the main topics, each followed by a detailed answer based on my highlights.`;

            default:
                return `Create a summary of approximately ${maxLength} words.`;
        }
    }

    /**
     * Calculate appropriate token limit based on desired word count
     */
    private calculateMaxTokens(wordCount: number): number {
        // Rough conversion: 1 token ≈ 0.75 words
        return Math.ceil(wordCount / 0.75);
    }

    /**
     * Generate a local summary without external AI
     */
    private generateLocalSummary(request: SummarizationRequest): string {
        const { highlights, style } = request;

        if (highlights.length === 0) {
            return "No highlights available to summarize.";
        }

        // Extract key information
        const sources = new Set(highlights.map(h => h.pageTitle));
        const totalWords = highlights.reduce((sum, h) =>
            sum + h.text.split(/\s+/).length, 0
        );
        const avgWordsPerHighlight = Math.round(totalWords / highlights.length);

        // Get most substantial highlights
        const topHighlights = [...highlights]
            .sort((a, b) => b.text.length - a.text.length)
            .slice(0, 5);

        // Build basic summary
        let summary = `Summary of ${highlights.length} highlights from ${sources.size} source${sources.size > 1 ? 's' : ''}:\n\n`;

        if (style === SummaryStyle.Bullet) {
            summary += "Key highlights:\n";
            topHighlights.forEach((h, i) => {
                const preview = h.text.substring(0, 150) + (h.text.length > 150 ? '...' : '');
                summary += `\n${i + 1}. ${preview}`;
                if (h.note) {
                    summary += `\n   Note: ${h.note}`;
                }
            });
        } else {
            summary += topHighlights.map((h, i) => {
                const preview = h.text.substring(0, 200) + (h.text.length > 200 ? '...' : '');
                return `${preview}${h.note ? `\n\nYour note: ${h.note}` : ''}`;
            }).join('\n\n---\n\n');
        }

        summary += `\n\nStatistics: ${totalWords} total words highlighted, averaging ${avgWordsPerHighlight} words per highlight.`;

        return summary;
    }

    // ========== CHAT (CONVERSATIONAL) ==========

    async chat(text: string, context?: string): Promise<string> {
        if (!this.isAvailable()) {
            return "I'm sorry, but I need an API key to have a conversation. Please check your settings.";
        }

        const cacheKey = this.getCacheKey('chat', { text, context });
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        try {
            const systemPrompt = `You are MarkMind, an intelligent and friendly voice assistant who lives in the browser.
            
            Key Personality Traits:
            - Converational & Human-like: Use fillers ("Hmm," "I see," "Sure thing") naturally.
            - Concise: You speak your answers, so keep them brief and punchy.
            - Helpful: You are an expert researcher.
            - Context-Aware: You know about the current page.
            
            Current Page Context: ${context || 'General conversation'}
            
            Your goal is to answer the user's question clearly and naturally, as if you were talking on a phone call.`;

            const prompt: AIPrompt = {
                systemPrompt,
                userPrompt: text,
                maxTokens: 300,
                temperature: 0.8 // Higher for more natural variety
            };

            const response = await this.callAI(prompt);
            this.cache.set(cacheKey, response.content);
            return response.content;
        } catch (error) {
            console.error('Chat failed:', error);
            return "I'm having trouble connecting to my brain right now. Please try again.";
        }
    }

    // ========== CONCEPT EXTRACTION ==========

    /**
     * Extract key concepts from text using AI or local processing
     */
    async extractConcepts(request: ConceptExtractionRequest): Promise<ExtractedConcept[]> {
        if (!this.isAvailable()) {
            return this.extractConceptsLocally(request.text);
        }

        const cacheKey = this.getCacheKey('concepts', request);
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        try {
            const prompt = this.buildConceptExtractionPrompt(request);
            const response = await this.callAI(prompt);

            // Parse the response as JSON
            const concepts = this.parseConceptsFromResponse(response.content);

            this.cache.set(cacheKey, concepts);
            return concepts;
        } catch (error) {
            console.error('Concept extraction failed, falling back to local:', error);
            return this.extractConceptsLocally(request.text);
        }
    }

    private buildConceptExtractionPrompt(request: ConceptExtractionRequest): AIPrompt {
        const { text, existingConcepts, minConfidence } = request;

        const existingContext = existingConcepts && existingConcepts.length > 0
            ? `\n\nExisting concepts in the user's knowledge base: ${existingConcepts.map(c => c.name).join(', ')}`
            : '';

        const systemPrompt = `You are a concept extraction specialist. Analyze text and identify key concepts, entities, and ideas. For each concept, determine its category and confidence level.

Categories:
- person: Named individuals
- organization: Companies, institutions, groups
- technology: Technologies, tools, frameworks, programming languages
- theory: Theoretical concepts, principles, frameworks
- method: Techniques, methodologies, processes
- location: Geographic locations
- event: Historical or notable events
- unknown: Concepts that don't fit other categories

Return ONLY a JSON array of concepts with this structure:
[
  {
    "name": "concept name",
    "confidence": 0.95,
    "category": "technology",
    "relatedConcepts": ["related concept 1", "related concept 2"]
  }
]

Only include concepts with confidence >= ${minConfidence || 0.7}.${existingContext}`;

        const userPrompt = `Extract key concepts from this text:\n\n${text}`;

        return {
            systemPrompt,
            userPrompt,
            maxTokens: 1000,
            temperature: 0.3 // Lower temperature for more consistent extraction
        };
    }

    private parseConceptsFromResponse(response: string): ExtractedConcept[] {
        try {
            // Clean the response - remove markdown code blocks if present
            const cleaned = response
                .replace(/```json\n?/g, '')
                .replace(/```\n?/g, '')
                .trim();

            const concepts = JSON.parse(cleaned);

            // Validate structure
            if (!Array.isArray(concepts)) {
                throw new Error('Response is not an array');
            }

            return concepts.map(c => ({
                name: c.name || 'Unknown',
                confidence: c.confidence || 0.5,
                category: this.validateCategory(c.category),
                relatedConcepts: Array.isArray(c.relatedConcepts) ? c.relatedConcepts : []
            }));
        } catch (error) {
            console.error('Failed to parse concepts:', error);
            return [];
        }
    }

    private validateCategory(category: string): ConceptCategory {
        const validCategories = Object.values(ConceptCategory);
        return validCategories.includes(category as ConceptCategory)
            ? (category as ConceptCategory)
            : ConceptCategory.Unknown;
    }

    /**
     * Local concept extraction using pattern matching and NLP basics
     */
    private extractConceptsLocally(text: string): ExtractedConcept[] {
        const concepts: ExtractedConcept[] = [];

        // Extract capitalized phrases (potential proper nouns)
        const capitalizedPattern = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g;
        const capitalizedMatches = text.match(capitalizedPattern) || [];

        // Count occurrences
        const conceptCounts = new Map<string, number>();
        capitalizedMatches.forEach(match => {
            conceptCounts.set(match, (conceptCounts.get(match) || 0) + 1);
        });

        // Extract technical terms (words with specific patterns)
        const technicalPattern = /\b[a-z]+(?:[A-Z][a-z]*)+\b/g; // camelCase
        const technicalMatches = text.match(technicalPattern) || [];
        technicalMatches.forEach(match => {
            conceptCounts.set(match, (conceptCounts.get(match) || 0) + 2); // Higher weight
        });

        // Convert to concepts with basic categorization
        conceptCounts.forEach((count, name) => {
            if (name.length < 3) return; // Skip very short terms

            const confidence = Math.min(0.95, 0.5 + (count * 0.1));
            const category = this.guessCategory(name, text);

            concepts.push({
                name,
                confidence,
                category,
                relatedConcepts: []
            });
        });

        // Sort by confidence and return top 10
        return concepts
            .sort((a, b) => b.confidence - a.confidence)
            .slice(0, 10);
    }

    private guessCategory(term: string, context: string): ConceptCategory {
        // Simple heuristics for categorization
        const lowerTerm = term.toLowerCase();

        // Check for technology indicators
        if (/js|api|http|css|html|react|node|python|java|sql/i.test(term)) {
            return ConceptCategory.Technology;
        }

        // Check for theory indicators
        if (context.includes(term) && /theory|principle|concept|framework|model/.test(context)) {
            return ConceptCategory.Theory;
        }

        // Check for organization indicators
        if (/inc|corp|llc|ltd|company|university|institute/i.test(context.substring(
            Math.max(0, context.indexOf(term) - 50),
            context.indexOf(term) + term.length + 50
        ))) {
            return ConceptCategory.Organization;
        }

        return ConceptCategory.Unknown;
    }

    // ========== CONCEPT LINKING ==========

    async linkConcepts(request: ConceptLinkingRequest): Promise<string[]> {
        const { sourceHighlightId, allHighlights, maxLinks, minSimilarity } = request;

        const sourceHighlight = allHighlights.find(h => h.id === sourceHighlightId);
        if (!sourceHighlight) return [];

        if (this.isAvailable() && this.provider !== AIProvider.Local) {
            return this.linkConceptsWithAI(sourceHighlight, allHighlights, maxLinks || 5);
        } else {
            return this.linkConceptsLocally(sourceHighlight, allHighlights, maxLinks || 5, minSimilarity || 0.3);
        }
    }

    /**
     * AI-powered concept linking using embeddings or semantic analysis
     */
    private async linkConceptsWithAI(
        source: Highlight,
        allHighlights: Highlight[],
        maxLinks: number
    ): Promise<string[]> {
        try {
            const prompt: AIPrompt = {
                systemPrompt: `You are a knowledge connection specialist. Given a source highlight and a list of other highlights, identify which highlights are most semantically related to the source. Consider:
- Shared concepts and entities
- Similar themes or topics
- Complementary or contrasting ideas
- Cause-effect relationships
- Examples and generalizations

Return ONLY a JSON array of highlight IDs, ordered by relevance (most relevant first). Limit to the top ${maxLinks} most related highlights.`,
                userPrompt: `Source highlight: "${source.text}"
${source.note ? `User's note: ${source.note}` : ''}
Source concepts: ${source.concepts.map(c => c.name).join(', ')}
Source topics: ${source.topics.join(', ')}

Other highlights to compare:
${allHighlights
                        .filter(h => h.id !== source.id)
                        .map((h, i) => `[${i}] ID: ${h.id}
Text: "${h.text.substring(0, 200)}${h.text.length > 200 ? '...' : ''}"
Concepts: ${h.concepts.map(c => c.name).join(', ')}
Topics: ${h.topics.join(', ')}`)
                        .join('\n\n')}

Return the IDs of the most related highlights as a JSON array.`,
                maxTokens: 500,
                temperature: 0.2
            };

            const response = await this.callAI(prompt);
            const cleaned = response.content
                .replace(/```json\n?/g, '')
                .replace(/```\n?/g, '')
                .trim();

            const linkedIds = JSON.parse(cleaned);
            return Array.isArray(linkedIds) ? linkedIds.slice(0, maxLinks) : [];
        } catch (error) {
            console.error('AI concept linking failed, falling back to local:', error);
            return this.linkConceptsLocally(source, allHighlights, maxLinks, 0.3);
        }
    }

    /**
     * Local concept linking using Jaccard similarity
     */
    private linkConceptsLocally(
        source: Highlight,
        allHighlights: Highlight[],
        maxLinks: number,
        minSimilarity: number
    ): string[] {
        const sourceConcepts = new Set(source.concepts.map(c => c.name.toLowerCase()));
        const sourceTopics = new Set(source.topics.map(t => t.toLowerCase()));
        const sourceTags = new Set(source.tags.map(t => t.toLowerCase()));
        const sourceWords = new Set(
            source.text.toLowerCase().split(/\s+/).filter(w => w.length > 4)
        );

        const similarities = allHighlights
            .filter(h => h.id !== source.id)
            .map(highlight => {
                const targetConcepts = new Set(highlight.concepts.map(c => c.name.toLowerCase()));
                const targetTopics = new Set(highlight.topics.map(t => t.toLowerCase()));
                const targetTags = new Set(highlight.tags.map(t => t.toLowerCase()));
                const targetWords = new Set(
                    highlight.text.toLowerCase().split(/\s+/).filter(w => w.length > 4)
                );

                // Calculate Jaccard similarity for each dimension
                const conceptSimilarity = this.jaccardSimilarity(sourceConcepts, targetConcepts);
                const topicSimilarity = this.jaccardSimilarity(sourceTopics, targetTopics);
                const tagSimilarity = this.jaccardSimilarity(sourceTags, targetTags);
                const wordSimilarity = this.jaccardSimilarity(sourceWords, targetWords);

                // Weighted combination (concepts and topics weighted more heavily)
                const totalSimilarity =
                    (conceptSimilarity * 0.4) +
                    (topicSimilarity * 0.3) +
                    (tagSimilarity * 0.15) +
                    (wordSimilarity * 0.15);

                return {
                    id: highlight.id,
                    similarity: totalSimilarity
                };
            })
            .filter(item => item.similarity >= minSimilarity)
            .sort((a, b) => b.similarity - a.similarity)
            .slice(0, maxLinks);

        return similarities.map(item => item.id);
    }

    /**
     * Calculate Jaccard similarity between two sets
     */
    private jaccardSimilarity<T>(setA: Set<T>, setB: Set<T>): number {
        if (setA.size === 0 && setB.size === 0) return 0;

        const intersection = new Set([...setA].filter(x => setB.has(x)));
        const union = new Set([...setA, ...setB]);

        return intersection.size / union.size;
    }

    // ========== INSIGHT GENERATION ==========

    /**
     * Generate AI insights about the user's learning patterns
     */
    async generateInsights(request: InsightGenerationRequest): Promise<AIInsight[]> {
        if (!this.isAvailable()) {
            return this.generateLocalInsights(request);
        }

        try {
            const { highlights, timeRange, insightTypes } = request;

            // Filter highlights by time range if specified
            const relevantHighlights = timeRange
                ? highlights.filter(h =>
                    h.createdAt >= timeRange.start && h.createdAt <= timeRange.end
                )
                : highlights;

            if (relevantHighlights.length < 10) {
                return []; // Need sufficient data for meaningful insights
            }

            const prompt = this.buildInsightGenerationPrompt(relevantHighlights, insightTypes);
            const response = await this.callAI(prompt);

            return this.parseInsightsFromResponse(response.content);
        } catch (error) {
            console.error('Insight generation failed:', error);
            return this.generateLocalInsights(request);
        }
    }

    private buildInsightGenerationPrompt(
        highlights: Highlight[],
        insightTypes?: InsightType[]
    ): AIPrompt {
        // Aggregate data for analysis
        const topicFrequency = new Map<string, number>();
        const conceptFrequency = new Map<string, number>();
        const sourceFrequency = new Map<string, number>();

        highlights.forEach(h => {
            h.topics.forEach(t => topicFrequency.set(t, (topicFrequency.get(t) || 0) + 1));
            h.concepts.forEach(c => conceptFrequency.set(c.name, (conceptFrequency.get(c.name) || 0) + 1));
            sourceFrequency.set(h.pageTitle, (sourceFrequency.get(h.pageTitle) || 0) + 1);
        });

        const topTopics = Array.from(topicFrequency.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10);

        const topConcepts = Array.from(conceptFrequency.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 15);

        // Calculate temporal patterns
        const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
        const recentHighlights = highlights.filter(h => h.createdAt > thirtyDaysAgo);

        const recentTopics = new Set(recentHighlights.flatMap(h => h.topics));
        const olderTopics = new Set(
            highlights
                .filter(h => h.createdAt <= thirtyDaysAgo)
                .flatMap(h => h.topics)
        );

        const emergingTopics = [...recentTopics].filter(t => !olderTopics.has(t));

        const systemPrompt = `You are a learning pattern analyst. Analyze a user's highlighting behavior to generate actionable insights about their learning journey.

Generate insights in these categories:
- pattern_detected: Identify consistent patterns in what they highlight
- knowledge_gap: Suggest related topics they haven't explored
- topic_shift: Note significant changes in focus areas
- concept_connection: Point out interesting connections between concepts
- deep_dive: Recognize intensive exploration of specific topics
- surface_level: Gently note topics they've touched but not explored deeply

Return ONLY a JSON array of insights with this structure:
[
  {
    "type": "pattern_detected",
    "title": "Short, catchy title",
    "description": "2-3 sentence explanation with specific examples",
    "relatedHighlightIds": ["id1", "id2"],
    "confidence": 0.85
  }
]

Make insights:
- Specific and actionable
- Encouraging rather than critical
- Based on actual data, not speculation
- Helpful for understanding learning patterns`;

        const userPrompt = `Analyze these highlights and generate 3-5 insights:

Total highlights: ${highlights.length}
Recent highlights (last 30 days): ${recentHighlights.length}

Top topics:
${topTopics.map(([topic, count]) => `- ${topic}: ${count} highlights`).join('\n')}

Top concepts:
${topConcepts.map(([concept, count]) => `- ${concept}: ${count} occurrences`).join('\n')}

Emerging topics (new in last 30 days):
${emergingTopics.length > 0 ? emergingTopics.join(', ') : 'None'}

Sample highlights:
${highlights.slice(0, 5).map((h, i) => `[${i + 1}] "${h.text.substring(0, 150)}..."
Topics: ${h.topics.join(', ')}
Concepts: ${h.concepts.map(c => c.name).join(', ')}`).join('\n\n')}`;

        return {
            systemPrompt,
            userPrompt,
            maxTokens: 1500,
            temperature: 0.7
        };
    }

    private parseInsightsFromResponse(response: string): AIInsight[] {
        try {
            const cleaned = response
                .replace(/```json\n?/g, '')
                .replace(/```\n?/g, '')
                .trim();

            const insights = JSON.parse(cleaned);

            if (!Array.isArray(insights)) {
                throw new Error('Response is not an array');
            }

            return insights.map(insight => ({
                id: this.generateId(),
                type: this.validateInsightType(insight.type),
                title: insight.title || 'Insight',
                description: insight.description || '',
                relatedHighlightIds: Array.isArray(insight.relatedHighlightIds)
                    ? insight.relatedHighlightIds
                    : [],
                confidence: insight.confidence || 0.5,
                createdAt: Date.now(),
                dismissed: 0
            }));
        } catch (error) {
            console.error('Failed to parse insights:', error);
            return [];
        }
    }

    private validateInsightType(type: string): InsightType {
        const validTypes = Object.values(InsightType);
        return validTypes.includes(type as InsightType)
            ? (type as InsightType)
            : InsightType.PatternDetected;
    }

    /**
     * Generate basic insights using local analysis
     */
    private generateLocalInsights(request: InsightGenerationRequest): AIInsight[] {
        const { highlights } = request;
        const insights: AIInsight[] = [];

        if (highlights.length < 5) return insights;

        // Detect topic concentration
        const topicCounts = new Map<string, number>();
        highlights.forEach(h => {
            h.topics.forEach(t => topicCounts.set(t, (topicCounts.get(t) || 0) + 1));
        });

        const sortedTopics = Array.from(topicCounts.entries())
            .sort((a, b) => b[1] - a[1]);

        if (sortedTopics.length > 0 && sortedTopics[0][1] >= 5) {
            const [topic, count] = sortedTopics[0];
            const percentage = Math.round((count / highlights.length) * 100);

            insights.push({
                id: this.generateId(),
                type: InsightType.DeepDive,
                title: `Deep dive into ${topic}`,
                description: `You've been focusing heavily on ${topic}, with ${count} highlights (${percentage}% of your recent reading). This suggests genuine interest in this area.`,
                relatedHighlightIds: highlights
                    .filter(h => h.topics.includes(topic))
                    .slice(0, 5)
                    .map(h => h.id),
                confidence: 0.9,
                createdAt: Date.now(),
                dismissed: 0
            });
        }

        // Detect emerging patterns
        const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
        const recentHighlights = highlights.filter(h => h.createdAt > thirtyDaysAgo);

        if (recentHighlights.length >= highlights.length * 0.3) {
            insights.push({
                id: this.generateId(),
                type: InsightType.PatternDetected,
                title: 'Active learning phase',
                description: `You've created ${recentHighlights.length} highlights in the last 30 days, showing consistent engagement with your reading. Keep up the momentum!`,
                relatedHighlightIds: recentHighlights.slice(0, 5).map(h => h.id),
                confidence: 0.8,
                createdAt: Date.now(),
                dismissed: 0
            });
        }

        return insights;
    }

    // ========== AI PROVIDER INTEGRATION ==========

    private async callAI(prompt: AIPrompt): Promise<AIResponse> {
        switch (this.provider) {
            case AIProvider.OpenAI:
                return this.callOpenAI(prompt);
            case AIProvider.Anthropic:
                return this.callAnthropic(prompt);
            case AIProvider.Gemini:
                return this.callGemini(prompt);
            case AIProvider.Local:
                throw new Error('Local models not yet implemented');
            default:
                throw new Error('No AI provider configured');
        }
    }

    private async callOpenAI(prompt: AIPrompt): Promise<AIResponse> {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`
            },
            body: JSON.stringify({
                model: 'gpt-4-turbo-preview',
                messages: [
                    { role: 'system', content: prompt.systemPrompt },
                    { role: 'user', content: prompt.userPrompt }
                ],
                max_tokens: prompt.maxTokens || 1000,
                temperature: prompt.temperature || 0.7
            })
        });

        if (!response.ok) {
            throw new Error(`OpenAI API error: ${response.status}`);
        }

        const data = await response.json();

        return {
            content: data.choices[0].message.content,
            usage: {
                promptTokens: data.usage.prompt_tokens,
                completionTokens: data.usage.completion_tokens,
                totalTokens: data.usage.total_tokens
            },
            model: data.model,
            finishReason: data.choices[0].finish_reason
        };
    }

    private async callAnthropic(prompt: AIPrompt): Promise<AIResponse> {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': this.apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: 'claude-3-5-sonnet-20241022',
                max_tokens: prompt.maxTokens || 1000,
                system: prompt.systemPrompt,
                messages: [
                    { role: 'user', content: prompt.userPrompt }
                ],
                temperature: prompt.temperature || 0.7
            })
        });

        if (!response.ok) {
            throw new Error(`Anthropic API error: ${response.status}`);
        }

        const data = await response.json();

        return {
            content: data.content[0].text,
            usage: {
                promptTokens: data.usage.input_tokens,
                completionTokens: data.usage.output_tokens,
                totalTokens: data.usage.input_tokens + data.usage.output_tokens
            },
            model: data.model,
            finishReason: data.stop_reason
        };
    }

    private async callGemini(prompt: AIPrompt): Promise<AIResponse> {
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${this.apiKey}`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [{
                            text: `${prompt.systemPrompt}\n\n${prompt.userPrompt}`
                        }]
                    }],
                    generationConfig: {
                        temperature: prompt.temperature || 0.7,
                        maxOutputTokens: prompt.maxTokens || 1000
                    }
                })
            }
        );

        if (!response.ok) {
            throw new Error(`Gemini API error: ${response.status}`);
        }

        const data = await response.json();

        return {
            content: data.candidates[0].content.parts[0].text,
            usage: {
                promptTokens: data.usageMetadata?.promptTokenCount || 0,
                completionTokens: data.usageMetadata?.candidatesTokenCount || 0,
                totalTokens: data.usageMetadata?.totalTokenCount || 0
            },
            model: 'gemini-pro',
            finishReason: data.candidates[0].finishReason
        };
    }

    /**
   * Explain complex text or concepts
   */
    async explainText(text: string): Promise<string> {
        if (!this.isAvailable()) {
            return "AI explanation is not available in local mode without an API key. Please check your settings.";
        }

        const cacheKey = this.getCacheKey('explain', { text });
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        try {
            const prompt: AIPrompt = {
                systemPrompt: "You are a helpful tutor. Explain the following text clearly and concisely, defining any complex terms.",
                userPrompt: `Please explain this text:\n\n"${text}"`,
                maxTokens: 300,
                temperature: 0.5
            };

            const response = await this.callAI(prompt);
            this.cache.set(cacheKey, response.content);
            return response.content;
        } catch (error) {
            console.error('Explanation failed:', error);
            return "Failed to generate explanation.";
        }
    }

    // ========== UTILITY METHODS ==========

    private getCacheKey(operation: string, request: any): string {
        const requestString = JSON.stringify(request);
        return `${operation}:${this.simpleHash(requestString)}`;
    }

    private simpleHash(str: string): string {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return hash.toString(36);
    }

    private generateId(): string {
        return `${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    }

    clearCache(): void {
        this.cache.clear();
    }

    getCacheStats(): { size: number; keys: string[] } {
        return {
            size: this.cache.size,
            keys: Array.from(this.cache.keys())
        };
    }
}

export const aiService = new AIService();
