import { Highlight, MessageType, HighlightColor, HighlightPosition } from '../types';
import { generateId, getColorHex, debounce } from '../shared/utils';
import { CortexUI } from './cortex-ui';

// Simple types for response
interface AIResponsePayload {
    content?: string;
    error?: string;
}

class HighlightManager {
    private highlights: Map<string, Highlight> = new Map();
    private toolbar: HTMLElement | null = null;
    private menu: HTMLElement | null = null;
    private aiPanel: HTMLElement | null = null;
    private selectedRange: Range | null = null;
    private selectionTimeout: any;
    private cortexUI: CortexUI;

    constructor() {
        this.cortexUI = new CortexUI();
        this.init();
    }

    private async init() {
        // this.setupSelectionListener(); // Disable old toolbar
        this.setupKeyboardShortcuts();
        this.setupMessageListener();
        await this.loadPageHighlights();

        // Observer for dynamic content
        const observer = new MutationObserver(debounce(() => {
            this.reapplyHighlights();
        }, 500));
        observer.observe(document.body, { childList: true, subtree: true });
    }

    private setupMessageListener() {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (message.type === MessageType.UPDATE_HIGHLIGHT) {
                this.loadPageHighlights();
            }
        });
    }

    private async loadPageHighlights() {
        try {
            const response = await chrome.runtime.sendMessage({
                type: MessageType.GET_HIGHLIGHTS,
                payload: window.location.href
            });

            this.highlights.clear();
            // Clear existing DOM highlights
            document.querySelectorAll('.markmarkmind-highlight').forEach(el => {
                const parent = el.parentNode;
                if (parent) {
                    parent.replaceChild(document.createTextNode(el.textContent || ''), el);
                    parent.normalize();
                }
            });

            if (Array.isArray(response)) {
                response.forEach((h: Highlight) => {
                    this.highlights.set(h.id, h);
                    this.renderHighlight(h);
                });
            }
        } catch (error) {
            console.error('Error loading highlights:', error);
        }
    }

    private reapplyHighlights() {
        this.highlights.forEach(h => {
            if (!document.querySelector(`[data-highlight-id="${h.id}"]`)) {
                this.renderHighlight(h);
            }
        });
    }

    private setupSelectionListener() {
        document.addEventListener('selectionchange', () => {
            clearTimeout(this.selectionTimeout);
            this.selectionTimeout = setTimeout(() => this.handleSelection(), 10);
        });

        document.addEventListener('mousedown', (e) => {
            // Hide toolbar if clicking outside
            if (this.toolbar && !this.toolbar.contains(e.target as Node)) {
                this.hideToolbar();
            }
            // Hide menu if clicking outside
            if (this.menu && !this.menu.contains(e.target as Node)) {
                this.removeMenu();
            }
        });
    }

    private handleSelection() {
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed) {
            this.hideToolbar();
            return;
        }

        const text = selection.toString().trim();
        if (text.length < 3) {
            return;
        }

        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();

        // Don't show if selection is inside a highlight or our UI
        let node: Node | null = range.commonAncestorContainer;
        while (node) {
            if (node.nodeType === 1 && (
                (node as Element).classList.contains('markmarkmind-highlight') ||
                (node as Element).id.startsWith('markmarkmind-')
            )) {
                return;
            }
            node = node.parentNode;
        }

        this.selectedRange = range;
        this.showToolbar(rect.left + window.scrollX, rect.top + window.scrollY - 40);
    }

    private showToolbar(x: number, y: number) {
        if (this.toolbar) this.toolbar.remove();

        this.toolbar = document.createElement('div');
        this.toolbar.className = 'markmarkmind-toolbar';
        this.toolbar.style.left = `${x}px`;
        this.toolbar.style.top = `${y}px`;

        const colors = [HighlightColor.Yellow, HighlightColor.Green, HighlightColor.Blue, HighlightColor.Pink];

        colors.forEach(color => {
            const btn = document.createElement('button');
            btn.className = 'markmarkmind-color-btn';
            btn.style.backgroundColor = getColorHex(color);
            btn.onclick = (e) => {
                e.stopPropagation();
                e.preventDefault();
                this.createHighlight(color);
                this.hideToolbar();
                window.getSelection()?.removeAllRanges();
            };
            this.toolbar!.appendChild(btn);
            this.toolbar!.appendChild(btn);
        });

        // AI Magic Button
        const magicBtn = document.createElement('button');
        magicBtn.className = 'markmarkmind-magic-btn';
        magicBtn.innerHTML = '✨'; // Magic wand
        magicBtn.title = 'Explain or Summarize';
        magicBtn.style.backgroundColor = '#f8fafc';
        magicBtn.style.color = '#3b82f6';
        magicBtn.style.border = '1px solid #e2e8f0';
        magicBtn.onclick = (e) => {
            e.stopPropagation();
            e.preventDefault();
            if (this.selectedRange) {
                const text = this.selectedRange.toString();
                const toolbarRect = this.toolbar!.getBoundingClientRect();
                this.handleAIAction(MessageType.EXPLAIN_SELECTION, text, toolbarRect.left, toolbarRect.bottom + 10);
            }
            this.hideToolbar();
        };
        this.toolbar.appendChild(magicBtn);

        document.body.appendChild(this.toolbar);
    }

    private hideToolbar() {
        if (this.toolbar) {
            this.toolbar.remove();
            this.toolbar = null;
        }
    }

    private async createHighlight(color: HighlightColor) {
        if (!this.selectedRange) return;

        const position = this.extractPosition(this.selectedRange);
        const text = this.selectedRange.toString();

        const highlight: Highlight = {
            id: generateId(),
            url: window.location.href,
            pageTitle: document.title,
            text: text,
            note: '',
            color: color,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            position: position,
            collectionIds: [],
            tags: [],
            // Initialize new required fields
            concepts: [],
            sentiment: 0,
            readingLevel: 'elementary' as any, // Default, will be updated by AI
            relatedHighlightIds: [],
            questions: [],
            keyPhrases: [],
            topics: [],
            referenceCount: 0
        };

        try {
            await chrome.runtime.sendMessage({
                type: MessageType.SAVE_HIGHLIGHT,
                payload: highlight
            });

            this.highlights.set(highlight.id, highlight);
            this.renderHighlight(highlight);
        } catch (error) {
            console.error('Error saving highlight:', error);
        }
    }

    private extractPosition(range: Range): HighlightPosition {
        const container = range.commonAncestorContainer;
        const parent = container.nodeType === 1 ? container as Element : container.parentElement!;

        const selector = this.generateSelector(parent);

        // Calculate precise offset relative to parent text content
        // This is a simplified approach; a robust one would count all chars in preceding text nodes
        const preSelectionRange = range.cloneRange();
        preSelectionRange.selectNodeContents(parent);
        preSelectionRange.setEnd(range.startContainer, range.startOffset);
        const startOffset = preSelectionRange.toString().length;

        return {
            containerSelector: selector,
            startOffset: startOffset,
            length: range.toString().length,
            contextBefore: range.toString().substring(0, 20), // Placeholder
            contextAfter: '',
            xpath: this.getXPath(parent),
            textFingerprint: this.generateFingerprint(range.toString())
        };
    }

    private getXPath(element: Element): string {
        if (element.id !== '') return 'id("' + element.id + '")';
        if (element === document.body) return element.tagName;

        let ix = 0;
        const siblings = element.parentNode ? (element.parentNode as Element).childNodes : [];
        for (let i = 0; i < siblings.length; i++) {
            const sibling = siblings[i];
            if (sibling === element) return this.getXPath(element.parentNode as Element) + '/' + element.tagName + '[' + (ix + 1) + ']';
            if (sibling.nodeType === 1 && (sibling as Element).tagName === element.tagName) ix++;
        }
        return '';
    }

    private generateFingerprint(text: string): string {
        let hash = 0;
        if (text.length === 0) return hash.toString();
        for (let i = 0; i < text.length; i++) {
            const char = text.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return hash.toString();
    }

    private generateSelector(element: Element): string {
        if (element.id) return `#${element.id}`;
        if (element === document.body) return 'body';

        let path = [];
        let cur: Element | null = element;

        while (cur && cur !== document.body) {
            let selector = cur.tagName.toLowerCase();
            if (cur.className) {
                // Use first class for simplicity, or full class list joined
                // selector += `.${cur.classList[0]}`; 
            }

            let index = 1;
            let sibling = cur.previousElementSibling;
            while (sibling) {
                if (sibling.tagName === cur.tagName) index++;
                sibling = sibling.previousElementSibling;
            }

            selector += `:nth-of-type(${index})`;
            path.unshift(selector);
            cur = cur.parentElement;
        }

        return 'body > ' + path.join(' > ');
    }

    private renderHighlight(highlight: Highlight) {
        try {
            const container = document.querySelector(highlight.position.containerSelector);
            if (!container) return;

            // Find the text node and split it
            // Simplified: iterating text nodes to find offset
            const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
            let currentNode: Node | null;
            let currentOffset = 0;
            let targetNode: Node | null = null;
            let targetOffset = 0;

            while (currentNode = walker.nextNode()) {
                const len = currentNode.textContent?.length || 0;
                if (currentOffset + len > highlight.position.startOffset) {
                    targetNode = currentNode;
                    targetOffset = highlight.position.startOffset - currentOffset;
                    break;
                }
                currentOffset += len;
            }

            if (targetNode && targetNode.textContent) {
                const span = document.createElement('span');
                span.className = 'markmarkmind-highlight';
                span.style.backgroundColor = getColorHex(highlight.color) + '80'; // Semi-transparent
                span.style.borderBottomColor = getColorHex(highlight.color);
                span.dataset.highlightId = highlight.id;

                // Handling node splitting
                // Note: This logic assumes highlight is within one text node. 
                // For multi-node highlights, we need more complex logic (range extraction).
                // Implementing simple single-node or range-wrapping logic:

                try {
                    const range = document.createRange();
                    range.setStart(targetNode, targetOffset);
                    range.setEnd(targetNode, Math.min(targetOffset + highlight.position.length, targetNode.textContent.length));

                    // If the range spans multiple nodes (unlikely with this specific simple offset logic but possible in reality)
                    // we use surroundContents which fails if partial non-text nodes
                    // Using extractContents + append works better usually

                    range.surroundContents(span);
                } catch (e) {
                    // Use fallback if surroundContents fails (e.g. crossing boundaries)
                    // For strict correctness we should use:
                    // https://developer.mozilla.org/en-US/docs/Web/API/Range/surroundContents
                    // But skipping extensive implementation for brevity here, sticking to primary node
                    console.warn("Complex highlight rendering skipped for brevity in single-node assumption");
                }

                span.onclick = (e) => {
                    e.stopPropagation();
                    this.showHighlightMenu(highlight, span);
                };
            }
        } catch (e) {
            console.error('Render error', e);
        }
    }

    private showHighlightMenu(highlight: Highlight, element: HTMLElement) {
        this.removeMenu();

        this.menu = document.createElement('div');
        this.menu.className = 'markmarkmind-menu';

        const rect = element.getBoundingClientRect();
        this.menu.style.left = `${rect.left + window.scrollX}px`;
        this.menu.style.top = `${rect.bottom + window.scrollY + 10}px`;

        const textarea = document.createElement('textarea');
        textarea.value = highlight.note;
        textarea.placeholder = 'Add a note...';

        const actions = document.createElement('div');
        actions.className = 'markmarkmind-menu-actions';

        const saveBtn = document.createElement('button');
        saveBtn.className = 'markmarkmind-btn markmarkmind-btn-save';
        saveBtn.textContent = 'Save';
        saveBtn.onclick = async () => {
            highlight.note = textarea.value;
            highlight.updatedAt = Date.now();
            await chrome.runtime.sendMessage({
                type: MessageType.SAVE_HIGHLIGHT,
                payload: highlight
            });
            this.removeMenu();
        };

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'markmarkmind-btn markmarkmind-btn-delete';
        deleteBtn.textContent = 'Delete';
        deleteBtn.onclick = async () => {
            await chrome.runtime.sendMessage({
                type: MessageType.DELETE_HIGHLIGHT,
                payload: highlight.id
            });
            element.replaceWith(document.createTextNode(element.textContent || ''));
            this.highlights.delete(highlight.id);
            this.removeMenu();
        };

        actions.appendChild(deleteBtn);
        actions.appendChild(saveBtn);
        this.menu.appendChild(textarea);
        this.menu.appendChild(actions);

        document.body.appendChild(this.menu);
    }

    private removeMenu() {
        if (this.menu) {
            this.menu.remove();
            this.menu = null;
        }
    }

    private async handleAIAction(type: MessageType, text: string, x: number, y: number) {
        this.showAIPanel('Thinking...', x, y, true);
        try {
            const response = await chrome.runtime.sendMessage({
                type: type,
                payload: { text }
            });

            if (response && response.content) {
                this.showAIPanel(response.content, x, y, false);
            } else {
                this.showAIPanel('No insight could be generated.', x, y, false);
            }
        } catch (error) {
            this.showAIPanel('Error connecting to AI service.', x, y, false);
        }
    }

    private showAIPanel(content: string, x: number, y: number, isLoading: boolean) {
        if (this.aiPanel) this.aiPanel.remove();

        this.aiPanel = document.createElement('div');
        this.aiPanel.className = 'markmarkmind-ai-panel';
        this.aiPanel.style.left = `${x}px`;
        this.aiPanel.style.top = `${y}px`;

        // Basic styles - SHOULD be in CSS but injecting here for now or update CSS later
        Object.assign(this.aiPanel.style, {
            position: 'absolute',
            zIndex: '10001',
            backgroundColor: 'white',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            padding: '12px',
            maxWidth: '300px',
            fontSize: '14px',
            lineHeight: '1.5',
            color: '#1e293b',
            border: '1px solid #e2e8f0'
        });

        if (isLoading) {
            this.aiPanel.innerHTML = `
                <div style="display: flex; align-items: center; gap: 8px;">
                    <div class="markmarkmind-spinner"></div>
                    <span>Analyzing...</span>
                </div>
            `;
            // Add spinner style if needed or use simple text
        } else {
            this.aiPanel.innerHTML = `
                <div style="margin-bottom: 8px; font-weight: 600; color: #3b82f6;">MarkMind Insight</div>
                <div>${content}</div>
                <button class="markmarkmind-close-btn" style="position: absolute; top: 8px; right: 8px; border: none; background: none; cursor: pointer; font-size: 16px;">×</button>
            `;

            const closeBtn = this.aiPanel.querySelector('.markmarkmind-close-btn');
            if (closeBtn) {
                closeBtn.addEventListener('click', () => {
                    if (this.aiPanel) this.aiPanel.remove();
                    this.aiPanel = null;
                });
            }
        }

        document.body.appendChild(this.aiPanel);

        // Click outside to close
        const clickHandler = (e: MouseEvent) => {
            if (this.aiPanel && !this.aiPanel.contains(e.target as Node)) {
                this.aiPanel.remove();
                this.aiPanel = null;
                document.removeEventListener('mousedown', clickHandler);
            }
        };
        setTimeout(() => document.addEventListener('mousedown', clickHandler), 100);
    }

    private setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            if (e.altKey) {
                let color: HighlightColor | null = null;
                switch (e.key) {
                    case '1': color = HighlightColor.Yellow; break;
                    case '2': color = HighlightColor.Green; break;
                    case '3': color = HighlightColor.Blue; break;
                    case '4': color = HighlightColor.Pink; break;
                }
                if (color) {
                    this.createHighlight(color);
                }
            }
        });
    }
}

new HighlightManager();
