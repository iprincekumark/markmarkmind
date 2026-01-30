import { StorageManager } from '../shared/storage';
import { Highlight, ExtensionSettings } from '../types';
import { formatDate, debounce, getColorHex } from '../shared/utils';

class PopupManager {
    private storage: StorageManager;
    private searchInput: HTMLInputElement;
    private highlightsList: HTMLElement;
    private collectionsList: HTMLElement;

    constructor() {
        this.storage = StorageManager.getInstance();
        this.searchInput = document.getElementById('searchInput') as HTMLInputElement;
        this.highlightsList = document.getElementById('highlightsList') as HTMLElement;
        this.collectionsList = document.getElementById('collectionsList') as HTMLElement;

        this.init();
    }

    private async init() {
        await this.storage.init();
        this.setupTabs();
        this.setupSearch();
        this.setupSettings();
        this.loadRecentHighlights();
    }

    private setupTabs() {
        const tabs = document.querySelectorAll('.tab');
        tabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                const target = e.target as HTMLElement;
                const tabName = target.dataset.tab;

                // Update tabs UI
                document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                target.classList.add('active');

                // Update content UI
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                document.getElementById(`${tabName}View`)?.classList.add('active');

                if (tabName === 'recent') this.loadRecentHighlights();
                if (tabName === 'collections') this.loadCollections();
            });
        });
    }

    private setupSearch() {
        this.searchInput.addEventListener('input', debounce(async (e: Event) => {
            const query = (e.target as HTMLInputElement).value;
            if (!query) {
                this.loadRecentHighlights();
                return;
            }

            const results = await this.storage.searchHighlights(query);
            this.displayHighlights(results);
        }, 300));
    }

    private async loadRecentHighlights() {
        const highlights = await this.storage.getAllHighlights();
        this.displayHighlights(highlights.slice(0, 20));
    }

    private displayHighlights(highlights: Highlight[]) {
        this.highlightsList.innerHTML = '';
        const emptyState = document.getElementById('emptyState');

        if (highlights.length === 0) {
            emptyState?.classList.remove('hidden');
            return;
        }
        emptyState?.classList.add('hidden');

        highlights.forEach(highlight => {
            const card = this.createHighlightCard(highlight);
            this.highlightsList.appendChild(card);
        });
    }

    private createHighlightCard(highlight: Highlight): HTMLElement {
        const div = document.createElement('div');
        div.className = `highlight-card color-${highlight.color}`;

        div.innerHTML = `
      <div class="highlight-text">${highlight.text}</div>
      <div class="highlight-meta">
        <span>${highlight.pageTitle.substring(0, 30)}...</span>
        <span>${formatDate(highlight.createdAt)}</span>
      </div>
    `;

        div.addEventListener('click', () => {
            chrome.tabs.create({ url: highlight.url });
        });

        return div;
    }

    private loadCollections() {
        // Placeholder for collections logic
        this.collectionsList.innerHTML = '<div style="text-align:center;color:#999;margin-top:20px">Feature coming soon</div>';
    }

    private async setupSettings() {
        const defaultColorSelect = document.getElementById('defaultColor') as HTMLSelectElement;
        const shortcutsCheckbox = document.getElementById('keyboardShortcuts') as HTMLInputElement;
        const exportBtn = document.getElementById('exportBtn');

        const settings = await this.storage.getSettings();
        defaultColorSelect.value = settings.defaultColor;
        shortcutsCheckbox.checked = settings.keyboardShortcutsEnabled;

        defaultColorSelect.addEventListener('change', async () => {
            settings.defaultColor = defaultColorSelect.value as any;
            await this.storage.saveSettings(settings);
        });

        shortcutsCheckbox.addEventListener('change', async () => {
            settings.keyboardShortcutsEnabled = shortcutsCheckbox.checked;
            await this.storage.saveSettings(settings);
        });

        exportBtn?.addEventListener('click', () => this.exportData());
    }

    private async exportData() {
        const data = await this.storage.exportAllData();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `markmind-export-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}

new PopupManager();
