import { Highlight, ExtractedConcept, AIInsight, InsightType } from './index';

export interface AIPrompt {
    systemPrompt: string;
    userPrompt: string;
    context?: AIContext;
    maxTokens?: number;
    temperature?: number;
}

export interface AIContext {
    highlights: Highlight[];
    currentPage?: {
        url: string;
        title: string;
        content: string;
    };
    userPreferences: {
        focusAreas: string[];
        avoidTopics: string[];
        learningGoals: string[];
    };
}

export interface AIResponse {
    content: string;
    usage?: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
    model: string;
    finishReason: string;
}

export interface SummarizationRequest {
    highlights: Highlight[];
    style: SummaryStyle;
    maxLength: number;
    focusAreas?: string[];
}

export enum SummaryStyle {
    Concise = 'concise',
    Detailed = 'detailed',
    Bullet = 'bullet',
    Narrative = 'narrative',
    Question = 'question'  // Format as Q&A
}

export interface ConceptExtractionRequest {
    text: string;
    existingConcepts?: ExtractedConcept[];
    minConfidence?: number;
}

export interface ConceptLinkingRequest {
    sourceHighlightId: string;
    allHighlights: Highlight[];
    maxLinks?: number;
    minSimilarity?: number;
}

export interface InsightGenerationRequest {
    highlights: Highlight[];
    timeRange?: {
        start: number;
        end: number;
    };
    insightTypes?: InsightType[];
}
