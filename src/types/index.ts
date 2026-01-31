// Core highlight structure with AI enhancements
export interface Highlight {
    // Existing fields
    id: string;
    url: string;
    pageTitle: string;
    text: string;
    note: string;
    color: HighlightColor;
    createdAt: number;
    updatedAt: number;
    collectionIds: string[];
    tags: string[];
    position: HighlightPosition;

    // NEW AI-enhanced fields
    concepts: ExtractedConcept[];  // AI-identified key concepts
    sentiment: number;  // -1 to 1 sentiment score
    readingLevel: ReadingLevel;  // Estimated complexity
    relatedHighlightIds: string[];  // Automatically linked highlights
    aiSummary?: string;  // Optional AI-generated summary
    questions: string[];  // AI-generated discussion questions
    keyPhrases: string[];  // Extracted important phrases
    topics: string[];  // Broader topic categorization
    referenceCount: number;  // How many times user reviewed this
    lastReviewedAt?: number;  // Last time user opened this highlight
}

export interface ExtractedConcept {
    name: string;
    confidence: number;  // 0-1 confidence score
    category: ConceptCategory;
    relatedConcepts: string[];
}

export enum ConceptCategory {
    Person = 'person',
    Organization = 'organization',
    Technology = 'technology',
    Theory = 'theory',
    Method = 'method',
    Location = 'location',
    Event = 'event',
    Unknown = 'unknown'
}

export enum ReadingLevel {
    Elementary = 'elementary',
    HighSchool = 'highschool',
    College = 'college',
    Graduate = 'graduate',
    Expert = 'expert'
}

export interface HighlightPosition {
    containerSelector: string;
    startOffset: number;
    length: number;
    contextBefore: string;
    contextAfter: string;
    // NEW - Enhanced position tracking
    xpath: string;  // Alternative position finder
    textFingerprint: string;  // Hash for quick matching
}

export enum HighlightColor {
    Yellow = 'yellow',
    Green = 'green',
    Blue = 'blue',
    Pink = 'pink',
    Purple = 'purple',  // NEW
    Orange = 'orange'   // NEW
}

export interface Collection {
    id: string;
    name: string;
    description: string;
    createdAt: number;
    updatedAt: number;
    defaultColor?: HighlightColor;
    highlightCount: number;
    // NEW AI fields
    aiGeneratedSummary?: string;
    mainTopics: string[];
    knowledgeGaps: string[];  // Topics with few highlights
}

export interface Tag {
    name: string;
    count: number;
    lastUsed: number;
    color?: string;  // Optional custom color
    // NEW - AI enhancement
    relatedTags: string[];
    growthTrend: 'increasing' | 'stable' | 'decreasing';
}

// NEW - Reading session tracking
export interface ReadingSession {
    id: string;
    url: string;
    pageTitle: string;
    startTime: number;
    endTime?: number;
    highlightsCreated: number;
    totalTimeSpent: number;  // milliseconds
    scrollDepth: number;  // percentage of page scrolled
}

// NEW - AI-generated insights
export interface AIInsight {
    id: string;
    type: InsightType;
    title: string;
    description: string;
    relatedHighlightIds: string[];
    confidence: number;
    createdAt: number;
    dismissed: number; // 0 or 1 (boolean not indexable in strict IDB)
}

export enum InsightType {
    PatternDetected = 'pattern_detected',
    KnowledgeGap = 'knowledge_gap',
    TopicShift = 'topic_shift',
    ConceptConnection = 'concept_connection',
    DeepDive = 'deep_dive',
    SurfaceLevel = 'surface_level'
}

export interface ExtensionSettings {
    // Existing settings
    defaultColor: HighlightColor;
    showContextPanel: boolean;
    keyboardShortcutsEnabled: boolean;

    // NEW AI settings
    aiEnabled: boolean;
    aiProvider: AIProvider;
    autoSummarize: boolean;
    autoConceptExtraction: boolean;
    autoLinking: boolean;
    showInsights: boolean;
    privacyMode: PrivacyMode;

    // NEW UI settings
    theme: Theme;
    compactMode: boolean;
    animationsEnabled: boolean;
    sidebarPosition: 'left' | 'right';
}

export enum AIProvider {
    None = 'none',  // Completely offline
    Local = 'local',  // Local lightweight models
    OpenAI = 'openai',  // User provides API key
    Anthropic = 'anthropic',  // User provides API key
    Gemini = 'gemini'  // User provides API key
}

export enum PrivacyMode {
    FullyLocal = 'fully_local',  // Never send data anywhere
    OptionalCloud = 'optional_cloud',  // User chooses per-operation
    CloudEnabled = 'cloud_enabled'  // Always use cloud when available
}

export enum Theme {
    Light = 'light',
    Dark = 'dark',
    Auto = 'auto'
}

export enum MessageType {
    GET_HIGHLIGHTS = 'GET_HIGHLIGHTS',
    SAVE_HIGHLIGHT = 'SAVE_HIGHLIGHT',
    DELETE_HIGHLIGHT = 'DELETE_HIGHLIGHT',
    UPDATE_HIGHLIGHT = 'UPDATE_HIGHLIGHT',
    // AI Related
    SUMMARIZE_SELECTION = 'SUMMARIZE_SELECTION',
    EXPLAIN_SELECTION = 'EXPLAIN_SELECTION',
    GET_AI_INSIGHTS = 'GET_AI_INSIGHTS',
    // Search & Settings
    SEARCH_HIGHLIGHTS = 'SEARCH_HIGHLIGHTS',
    GET_SETTINGS = 'GET_SETTINGS',
    CHAT = 'CHAT'
}

export interface Message {
    type: MessageType;
    payload?: any;
}

export * from './ai';
