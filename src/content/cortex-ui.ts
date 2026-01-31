import { VoiceManager } from '../shared/voice-manager';
import { PageAnalyzer, PageType } from '../shared/page-analyzer';
import { MessageType } from '../types';

export class CortexUI {
    private shadowRoot: ShadowRoot | null = null;
    private host: HTMLElement | null = null;
    private voiceManager: VoiceManager;
    private pageAnalyzer: PageAnalyzer;
    private isOpen: boolean = false;

    constructor() {
        this.voiceManager = new VoiceManager();
        this.pageAnalyzer = new PageAnalyzer();
        this.initialize();
    }

    private initialize() {
        console.log("MarkMind Cortex UI Initializing...");

        // Remove existing if any
        const existing = document.getElementById('markmind-cortex-host');
        if (existing) existing.remove();

        // Create Host
        this.host = document.createElement('div');
        this.host.id = 'markmind-cortex-host';
        Object.assign(this.host.style, {
            position: 'fixed',
            top: '0',
            right: '0',
            height: '100vh',
            width: '100%',
            zIndex: '2147483647',
            pointerEvents: 'none', // Allow clicks through
        });

        this.shadowRoot = this.host.attachShadow({ mode: 'open' });

        // Inject Styles & HTML
        const style = document.createElement('style');
        style.textContent = this.getStyles();
        this.shadowRoot.appendChild(style);

        const container = document.createElement('div');
        container.className = 'cortex-wrapper';
        container.innerHTML = `
            <!-- Trigger Handle (Always Visible) -->
            <div class="cortex-handle" id="handle">
                <div class="handle-icon">🧠</div>
            </div>

            <!-- Sidebar -->
            <div class="cortex-sidebar">
                <div class="cortex-header">
                    <div class="brand">
                        <span class="brand-name">MarkMind</span>
                        <span class="brand-ver">v4.1</span>
                    </div>
                    <button class="close-btn">×</button>
                </div>
                
                <div class="cortex-content" id="chat-history">
                    <div class="system-message">
                        Cortex OS v4.1 Online
                    </div>
                </div>

                <div class="cortex-footer">
                    <div class="input-area">
                        <button class="voice-btn" id="voice-btn">
                            <span class="mic-icon">🎙️</span>
                        </button>
                        <input type="text" placeholder="Ask anything..." class="text-input" id="text-input">
                    </div>
                </div>
            </div>
        `;

        this.shadowRoot.appendChild(container);
        document.body.appendChild(this.host);

        // Event Listeners
        this.shadowRoot.getElementById('handle')?.addEventListener('click', () => this.toggleSidebar());
        this.shadowRoot.querySelector('.close-btn')?.addEventListener('click', () => this.toggleSidebar());
        this.shadowRoot.getElementById('voice-btn')?.addEventListener('click', () => this.toggleVoice());

        const input = this.shadowRoot.getElementById('text-input') as HTMLInputElement;
        input?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.handleUserMessage(input.value);
                input.value = '';
            }
        });

        // Voice Callbacks
        this.voiceManager.setStateCallback((state) => {
            const btn = this.shadowRoot?.getElementById('voice-btn');
            if (state === 'listening') btn?.classList.add('listening');
            else btn?.classList.remove('listening');

            if (state === 'speaking') btn?.classList.add('speaking');
            else btn?.classList.remove('speaking');
        });

        // Auto-Greet
        setTimeout(() => {
            const meta = this.pageAnalyzer.analyze();
            if (meta.type === PageType.ResearchPaper) {
                this.addMessage('system', `Research Paper Detected: ${meta.title}`);
                this.toggleSidebar(true);
                this.voiceManager.speak("I've detected a research paper. Would you like a breakdown?");
            }
        }, 1500);

        console.log("MarkMind Cortex UI Mounted Successfully");
    }

    private toggleSidebar(forceOpen?: boolean) {
        if (!this.host) return;
        this.isOpen = forceOpen ?? !this.isOpen;

        const sidebar = this.shadowRoot?.querySelector('.cortex-sidebar');
        const handle = this.shadowRoot?.querySelector('.cortex-handle');

        if (this.isOpen) {
            this.host.style.pointerEvents = 'auto'; // Capture clicks
            sidebar?.classList.add('open');
            handle?.classList.add('hidden');
        } else {
            this.host.style.pointerEvents = 'none'; // Pass through
            sidebar?.classList.remove('open');
            handle?.classList.remove('hidden');

            // Enable pointer events on handle specifically
            if (handle) (handle as HTMLElement).style.pointerEvents = 'auto';
        }
    }

    private toggleVoice() {
        this.voiceManager.listen((text) => this.handleUserMessage(text));
    }

    private async handleUserMessage(text: string) {
        this.addMessage('user', text);
        this.addMessage('system', 'Thinking...');

        if (text.toLowerCase().includes('key') || text.toLowerCase().includes('api')) {
            this.addMessage('ai', 'To set your API key, please open the dashboard settings.');
            this.voiceManager.speak("Please open the dashboard settings to configure your API key.");
            return;
        }

        try {
            const pageContext = `${document.title}\n${document.body.innerText.substring(0, 1000)}...`;

            const response = await chrome.runtime.sendMessage({
                type: MessageType.CHAT,
                payload: {
                    text: text,
                    context: pageContext
                }
            });

            if (response && response.content) {
                this.addMessage('ai', response.content);
                this.voiceManager.speak(response.content);
            } else {
                const errorMsg = "I couldn't reach the AI service. Please check your API key.";
                this.addMessage('system', errorMsg);
                this.voiceManager.speak(errorMsg);
            }
        } catch (error) {
            console.error('Cortex Error:', error);
            this.addMessage('system', 'Connection error.');
        }
    }

    private addMessage(type: 'user' | 'ai' | 'system', text: string) {
        const chat = this.shadowRoot?.getElementById('chat-history');
        if (!chat) return;

        const msg = document.createElement('div');
        msg.className = `message ${type}`;
        msg.textContent = text;
        chat.appendChild(msg);
        chat.scrollTop = chat.scrollHeight;
    }

    private getStyles(): string {
        return `
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');

            :host {
                font-family: 'Inter', sans-serif;
            }

            .cortex-wrapper {
                position: relative;
                width: 100%;
                height: 100%;
            }

            .cortex-handle {
                position: fixed;
                right: 0;
                top: 50%;
                transform: translateY(-50%);
                width: 48px;
                height: 48px;
                background: rgba(15, 23, 42, 0.9);
                backdrop-filter: blur(10px);
                border-radius: 12px 0 0 12px;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                border: 1px solid rgba(255, 255, 255, 0.2);
                border-right: none;
                z-index: 2147483647;
                box-shadow: -4px 0 20px rgba(0,0,0,0.3);
                transition: transform 0.3s ease, opacity 0.3s;
                pointer-events: auto !important;
            }
            
            .cortex-handle:hover {
                width: 56px;
                background: #2563eb;
            }

            .cortex-handle.hidden {
                transform: translate(100%, -50%);
                opacity: 0;
                pointer-events: none !important;
            }

            .handle-icon {
                font-size: 24px;
                animation: pulse 3s infinite;
            }

            .cortex-sidebar {
                position: fixed;
                top: 0;
                right: 0;
                height: 100vh;
                width: 400px;
                background: rgba(15, 23, 42, 0.95);
                backdrop-filter: blur(40px);
                border-left: 1px solid rgba(255, 255, 255, 0.1);
                box-shadow: -20px 0 50px rgba(0, 0, 0, 0.5);
                display: flex;
                flex-direction: column;
                transform: translateX(100%);
                transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1);
                z-index: 2147483646;
                color: white;
            }

            .cortex-sidebar.open {
                transform: translateX(0);
            }

            .cortex-header { padding: 20px; border-bottom: 1px solid rgba(255,255,255,0.1); display: flex; justify-content: space-between; align-items: center; }
            .brand-name { font-weight: 700; font-size: 18px; }
            .brand-ver { font-size: 11px; background: #2563eb; padding: 2px 6px; border-radius: 4px; margin-left: 8px; }
            .close-btn { background: none; border: none; color: #94a3b8; font-size: 24px; cursor: pointer; }
            .close-btn:hover { color: white; }
            
            .cortex-content { flex: 1; padding: 20px; overflow-y: auto; display: flex; flex-direction: column; gap: 15px; }
            
            .message { padding: 12px 16px; border-radius: 12px; font-size: 14px; line-height: 1.5; max-width: 85%; animation: slideIn 0.3s; }
            .message.ai { background: rgba(255,255,255,0.1); align-self: flex-start; border-bottom-left-radius: 2px; }
            .message.user { background: #2563eb; align-self: flex-end; border-bottom-right-radius: 2px; }
            .message.system { color: #94a3b8; font-size: 12px; text-align: center; align-self: center; margin-top: 10px; }

            .cortex-footer { padding: 20px; border-top: 1px solid rgba(255,255,255,0.1); background: rgba(0,0,0,0.2); }
            .input-area { display: flex; gap: 10px; }
            
            .text-input { flex: 1; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; padding: 10px; color: white; outline: none; }
            .text-input:focus { border-color: #3b82f6; background: rgba(255,255,255,0.1); }
            
            .voice-btn { width: 42px; height: 42px; border-radius: 50%; border: none; background: rgba(255,255,255,0.1); cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 18px; transition: all 0.2s; }
            .voice-btn:hover { background: rgba(255,255,255,0.2); }
            .voice-btn.listening { background: #ef4444; animation: pulse-red 1.5s infinite; }
            .voice-btn.speaking { background: #3b82f6; animation: pulse-blue 1.5s infinite; }

            @keyframes pulse { 0% { opacity: 0.7; transform: scale(0.95); } 50% { opacity: 1; transform: scale(1.05); } 100% { opacity: 0.7; transform: scale(0.95); } }
            @keyframes pulse-red { 0% { box-shadow: 0 0 0 5px rgba(239, 68, 68, 0); } 50% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4); } 0% { box-shadow: 0 0 0 5px rgba(239, 68, 68, 0); } }
            @keyframes slideIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
        `;
    }
}
