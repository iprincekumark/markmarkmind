import '../types/index';
import { Highlight, HighlightColor, AIInsight, InsightType } from '../types';
import { storage } from '../shared/storage';
// In a real implementation, we might communicate with background script, 
// but for MVP popup can access storage directly.

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
            // Remove active class from all tabs
            tabs.forEach(t => t.classList.remove('active', 'text-blue-600', 'border-blue-600'));
            tabs.forEach(t => t.classList.add('border-transparent'));

            // Add active class to clicked tab
            tab.classList.add('active', 'text-blue-600', 'border-blue-600');
            tab.classList.remove('border-transparent');

            // Hide all contents
            Object.values(tabContents).forEach(content => content?.classList.add('hidden'));

            // Show selected content
            const tabName = tab.getAttribute('data-tab');
            if (tabName && tabContents[tabName as keyof typeof tabContents]) {
                tabContents[tabName as keyof typeof tabContents]?.classList.remove('hidden');
            }
        });
    });

    // Settings Logic
    const aiProviderSelect = document.getElementById('setting-ai-provider') as HTMLSelectElement;
    const apiKeyContainer = document.getElementById('api-key-container');

    if (aiProviderSelect && apiKeyContainer) {
        aiProviderSelect.addEventListener('change', () => {
            if (aiProviderSelect.value === 'local') {
                apiKeyContainer.classList.add('hidden');
            } else {
                apiKeyContainer.classList.remove('hidden');
            }
        });
    }

    // Load Highlights
    await loadHighlights();

    // Event Listeners for Search
    const searchInput = document.getElementById('searchInput') as HTMLInputElement;
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const query = (e.target as HTMLInputElement).value;
            filterHighlights(query);
        });
    }

    // Load User Settings
    await loadSettings();
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
    div.className = `highlight-item border-${highlight.color}-500 bg-white hover:bg-slate-50 border-l-4 pl-3 py-3 rounded-r-md transition-all shadow-sm mb-3`;

    // Map color enum to Tailwind class (simplified)
    const colorMap: Record<string, string> = {
        'yellow': 'yellow',
        'green': 'green',
        'blue': 'blue',
        'pink': 'pink',
        'purple': 'purple',
        'orange': 'orange'
    };
    const colorName = colorMap[highlight.color] || 'yellow';
    div.style.borderLeftColor = `var(--color-${colorName}-500, #eab308)`; // Fallback style if class mapping fails or add style directly

    // Actually, Tailwind classes for dynamic colors need to be safelisted or present in source.
    // For safer implementation, let's use inline style for the border or specific classes if we fix the classes.
    // Let's replace the className above with specific color classes logic
    div.classList.remove(`border-${highlight.color}-500`);
    div.classList.add(`border-${colorName}-500`);

    const date = new Date(highlight.createdAt).toLocaleDateString(undefined, {
        month: 'short', day: 'numeric'
    });

    const topicsHtml = highlight.topics && highlight.topics.length > 0
        ? `<div class="mt-2 flex flex-wrap gap-1">
            ${highlight.topics.slice(0, 2).map(t =>
            `<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600">#${t}</span>`
        ).join('')}
           </div>`
        : '';

    div.innerHTML = `
        <div class="flex justify-between items-start mb-1">
            <h4 class="text-xs font-semibold text-slate-500 uppercase tracking-wide truncate max-w-[200px]" title="${highlight.pageTitle}">${highlight.pageTitle}</h4>
            <span class="text-xs text-slate-400 whitespace-nowrap">${date}</span>
        </div>
        <p class="text-sm text-slate-800 leading-relaxed line-clamp-3">${highlight.text}</p>
        ${highlight.note ? `<div class="mt-2 text-xs text-slate-500 italic bg-yellow-50 p-2 rounded border border-yellow-100">"${highlight.note}"</div>` : ''}
        ${topicsHtml}
    `;

    div.addEventListener('click', () => {
        // Find the tab text
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

    try {
        const settings = await storage.getSettings();
        if (providerSelect) providerSelect.value = settings.aiProvider;
        if (aiEnabled) aiEnabled.checked = settings.aiEnabled;

        // Trigger change event to update UI
        providerSelect?.dispatchEvent(new Event('change'));
    } catch (e) {
        console.error("Error loading settings", e);
    }
}
