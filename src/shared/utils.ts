import { HighlightColor } from '../types';

export function generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

export function getColorHex(color: HighlightColor): string {
    switch (color) {
        case HighlightColor.Yellow:
            return '#FFD700';
        case HighlightColor.Green:
            return '#90EE90';
        case HighlightColor.Blue:
            return '#87CEEB';
        case HighlightColor.Pink:
            return '#FFB6C1';
        default:
            return '#FFD700';
    }
}

export function sanitizeText(text: string): string {
    return text.trim().replace(/\s+/g, ' ');
}

export function formatDate(timestamp: number): string {
    return new Intl.DateTimeFormat('en-US', {
        dateStyle: 'medium',
        timeStyle: 'short'
    }).format(new Date(timestamp));
}

export function debounce(func: Function, wait: number): (...args: any[]) => void {
    let timeout: any;
    return function (this: any, ...args: any[]) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), wait);
    };
}

export function escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
