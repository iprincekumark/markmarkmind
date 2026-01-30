export enum HighlightColor {
    Yellow = 'yellow',
    Green = 'green',
    Blue = 'blue',
    Pink = 'pink'
}

export interface HighlightPosition {
    containerSelector: string;
    startOffset: number;
    length: number;
    contextBefore: string;
    contextAfter: string;
}

export interface Highlight {
    id: string;
    url: string;
    pageTitle: string;
    text: string;
    note: string;
    color: HighlightColor;
    createdAt: number;
    updatedAt: number;
    position: HighlightPosition;
    collections: string[]; // Collection IDs
    tags: string[];
}

export interface Collection {
    id: string;
    name: string;
    description: string;
    createdAt: number;
    defaultColor?: HighlightColor;
}

export interface Tag {
    name: string;
    count: number;
    lastUsed: number;
}

export interface ExtensionSettings {
    defaultColor: HighlightColor;
    showContextPanel: boolean;
    keyboardShortcutsEnabled: boolean;
}

export enum MessageType {
    SAVE_HIGHLIGHT = 'SAVE_HIGHLIGHT',
    DELETE_HIGHLIGHT = 'DELETE_HIGHLIGHT',
    GET_HIGHLIGHTS = 'GET_HIGHLIGHTS',
    UPDATE_HIGHLIGHT = 'UPDATE_HIGHLIGHT',
    SEARCH_HIGHLIGHTS = 'SEARCH_HIGHLIGHTS',
    GET_SETTINGS = 'GET_SETTINGS'
}

export interface Message {
    type: MessageType;
    payload?: any;
}

export interface SearchQuery {
    query: string;
    filters?: {
        color?: HighlightColor;
        collectionId?: string;
        tag?: string;
    };
}
