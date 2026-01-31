import './popup.css';
import '../types/index';
import { Highlight, HighlightColor, AIInsight, InsightType } from '../types';
import { storage } from '../shared/storage';

document.addEventListener('DOMContentLoaded', async () => {
    // Initialize UI
    const tabs = document.querySelectorAll('.nav-tab');
    const tabContents = {
        'highlights': document.getElementById('tab-highlights'),
        'insights': document.getElementById('tab-insights'),
        'settings': document.getElementById('tab-settings')
    };

    // Tab Switching Logic
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            Object.values(tabContents).forEach(content => content?.classList.add('hidden'));

            const tabName = tab.getAttribute('data-tab');
            if (tabName && tabContents[tabName as keyof typeof tabContents]) {
                tabContents[tabName as keyof typeof tabContents]?.classList.remove('hidden');
            }
        });
    });

    // Settings Logic
    const aiProviderSelect = document.getElementById('setting-ai-provider') as HTMLSelectElement;
    const apiKeyContainer = document.getElementById('api-key-container');
    const saveKeyBtn = document.getElementById('btn-save-key');
    const apiKeyInput = document.getElementById('setting-api-key') as HTMLInputElement;
    const keyStatus = document.getElementById('key-status');

    // 1. Handle Provider Change
    if (aiProviderSelect && apiKeyContainer) {
        aiProviderSelect.addEventListener('change', async () => {
            const val = aiProviderSelect.value;
            // Save provider selection immediately
            const settings = await storage.getSettings();
            settings.aiProvider = val as any;
            await storage.saveSettings(settings);

            if (val === 'local') {
                apiKeyContainer.classList.add('hidden');
            } else {
                apiKeyContainer.classList.remove('hidden');
            }
        });
    }

    // 2. Handle API Key Save
    if (saveKeyBtn && apiKeyInput) {
        saveKeyBtn.addEventListener('click', () => {
            const key = apiKeyInput.value.trim();
            if (key) {
                chrome.storage.local.set({ apiKey: key }, () => {
                    if (keyStatus) {
                        keyStatus.classList.remove('hidden');
                        setTimeout(() => keyStatus.classList.add('hidden'), 2000);
                    }
                    // Visual feedback on button
                    const originalText = saveKeyBtn.textContent;
                    saveKeyBtn.textContent = 'SAVED';
                    saveKeyBtn.style.background = 'var(--neon-green, #00ff00)';
                    setTimeout(() => {
                        saveKeyBtn.textContent = originalText;
                        saveKeyBtn.style.background = ''; // Revert to CSS
                    }, 1500);
                });
            }
        });
    }

    // Load Data
    await loadHighlights();
    await loadSettings();

    // Search
    const searchInput = document.getElementById('searchInput') as HTMLInputElement;
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const query = (e.target as HTMLInputElement).value;
            filterHighlights(query);
        });
    }

    // Dashboard Button
    document.getElementById('btn-dashboard')?.addEventListener('click', () => {
        chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') }); // Planned feature
    });
});

async function loadHighlights() {
    const listContainer = document.getElementById('highlights-list');
    const emptyState = document.getElementById('highlights-empty');
    if (!listContainer) return;

    try {
        const highlights = await storage.getAllHighlights();

        if (highlights.length === 0) {
            emptyState?.classList.remove('hidden');
            return;
        }

        emptyState?.classList.add('hidden');
        listContainer.innerHTML = '';

        highlights
            .sort((a, b) => b.createdAt - a.createdAt)
            .forEach(highlight => {
                const element = createHighlightElement(highlight);
                listContainer.appendChild(element);
            });

    } catch (error) {
        console.error('Failed to load highlights:', error);
    }
}

function createHighlightElement(highlight: Highlight): HTMLElement {
    const div = document.createElement('div');
    // Using simple styling for logic, relying on CSS for visual flash
    div.className = `highlight-item p-3 mb-2 rounded bg-opacity-10 bg-white border-l-4`;

    // Map color enum to CSS variable approach or classes
    const colorMap: Record<string, string> = {
        'yellow': '#eab308',
        'green': '#22c55e',
        'blue': '#3b82f6',
        'pink': '#ec4899',
        'purple': '#a855f7',
        'orange': '#f97316'
    };
    const color = colorMap[highlight.color] || '#eab308';
    div.style.borderLeftColor = color;

    const date = new Date(highlight.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

    div.innerHTML = `
        <div class="flex justify-between items-start mb-1">
            <h4 class="text-xs font-bold text-slate-300 uppercase tracking-wide truncate max-w-[200px]">${highlight.pageTitle}</h4>
            <span class="text-xs text-slate-500">${date}</span>
        </div>
        <p class="text-sm text-slate-200 leading-relaxed line-clamp-2 font-light">${highlight.text}</p>
        ${highlight.note ? `<div class="mt-2 text-xs text-slate-400 italic bg-[rgba(255,255,255,0.05)] p-2 rounded">"${highlight.note}"</div>` : ''}
    `;

    div.addEventListener('click', () => {
        chrome.tabs.create({ url: highlight.url });
    });

    return div;
}

function filterHighlights(query: string) {
    const items = document.querySelectorAll('.highlight-item');
    const lowerQuery = query.toLowerCase();

    items.forEach(item => {
        const text = item.textContent?.toLowerCase() || '';
        if (text.includes(lowerQuery)) {
            (item as HTMLElement).style.display = 'block';
        } else {
            (item as HTMLElement).style.display = 'none';
        }
    });
}

async function loadSettings() {
    const providerSelect = document.getElementById('setting-ai-provider') as HTMLSelectElement;
    const aiEnabled = document.getElementById('setting-ai-enabled') as HTMLInputElement;
    const apiKeyInput = document.getElementById('setting-api-key') as HTMLInputElement;

    try {
        const settings = await storage.getSettings();
        if (providerSelect) providerSelect.value = settings.aiProvider;
        if (aiEnabled) aiEnabled.checked = settings.aiEnabled;

        // Load API Key specifically
        chrome.storage.local.get(['apiKey'], (result) => {
            if (apiKeyInput && result.apiKey) {
                apiKeyInput.value = result.apiKey;
            }
        });

        // Trigger change to update visibility of key input
        providerSelect?.dispatchEvent(new Event('change'));
    } catch (e) {
        console.error("Error loading settings", e);
    }
}
