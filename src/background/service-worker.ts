import { storage } from '../shared/storage';
import { MessageType, Message, SummaryStyle, HighlightColor } from '../types';
import { aiService } from '../shared/ai-service';

chrome.runtime.onInstalled.addListener(async () => {
    await storage.init();
    console.log('MarkMind installed');
});

chrome.runtime.onMessage.addListener((message: Message, sender, sendResponse) => {
    handleMessage(message, sendResponse);
    return true; // Keep channel open for async response
});

async function handleMessage(message: Message, sendResponse: (response?: any) => void) {
    try {
        await storage.init(); // Ensure DB is open

        switch (message.type) {
            case MessageType.GET_HIGHLIGHTS:
                const highlights = await storage.getHighlightsByUrl(message.payload);
                sendResponse(highlights);
                break;

            case MessageType.SAVE_HIGHLIGHT:
                if (message.payload.id) {
                    await storage.saveHighlight(message.payload);
                    sendResponse({ success: true, id: message.payload.id });
                }
                break;

            case MessageType.DELETE_HIGHLIGHT:
                await storage.deleteHighlight(message.payload);
                sendResponse({ success: true });
                break;

            case MessageType.SEARCH_HIGHLIGHTS:
                const results = await storage.searchHighlights(message.payload);
                sendResponse(results);
                break;

            case MessageType.GET_SETTINGS:
                const settings = await storage.getSettings();
                sendResponse(settings);
                break;

            // AI Features
            case MessageType.EXPLAIN_SELECTION:
                await aiService.initialize();
                const explanation = await aiService.explainText(message.payload.text);
                sendResponse({ content: explanation });
                break;

            case MessageType.SUMMARIZE_SELECTION:
                await aiService.initialize();
                // Create a temporary highlight object for the service
                const tempHighlight = {
                    text: message.payload.text,
                    id: 'temp',
                    url: '',
                    pageTitle: '',
                    note: '',
                    color: HighlightColor.Yellow,
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                    collectionIds: [],
                    tags: [],
                    position: {} as any,
                    concepts: [],
                    sentiment: 0,
                    readingLevel: 'elementary' as any,
                    relatedHighlightIds: [],
                    questions: [],
                    keyPhrases: [],
                    topics: [],
                    referenceCount: 0
                };

                const summary = await aiService.summarizeHighlights({
                    highlights: [tempHighlight],
                    style: SummaryStyle.Concise,
                    maxLength: 150
                });
                sendResponse({ content: summary });
                break;

            case MessageType.CHAT:
                await aiService.initialize();
                const chatResponse = await aiService.chat(message.payload.text, message.payload.context);
                sendResponse({ content: chatResponse });
                break;

            default:
                console.warn('Unknown message type:', message.type);
                sendResponse({ error: 'Unknown message type' });
        }
    } catch (error) {
        console.error('Message handling error:', error);
        sendResponse({ error: (error as Error).message });
    }
}
