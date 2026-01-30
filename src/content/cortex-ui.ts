import { VoiceManager } from '../shared/voice-manager';
import { PageAnalyzer, PageType } from '../shared/page-analyzer';
import { MessageType } from '../types';
import { storage } from '../shared/storage';

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
            width: '0', // Starts closed
            zIndex: '2147483647',
            pointerEvents: 'none', // Allow clicks through when closed
        });

        this.shadowRoot = this.host.attachShadow({ mode: 'open' });

        // Inject Styles & HTML
        const style = document.createElement('style');
        style.textContent = this.getStyles();
        this.shadowRoot.appendChild(style);

        const container = document.createElement('div');
        container.className = 'cortex-container';
        container.innerHTML = `
            <!-- Trigger Handle -->
            <div class="cortex-handle" id="handle">
                <div class="handle-icon">🧠</div>
            </div>

            <!-- Sidebar -->
            <div class="cortex-sidebar">
                <div class="cortex-header">
                    <div class="brand">
                        <span class="brand-name">MarkMind</span>
                        <span class="brand-ver">v4.0</span>
                    </div>
                    <button class="close-btn">×</button>
                </div>
                
                <div class="cortex-content" id="chat-history">
                    <div class="system-message">
                        Initializing Cortex OS...
                    </div>
                </div>

                <div class="cortex-footer">
                    <div class="input-area">
                        <button class="voice-btn" id="voice-btn">
                            <span class="mic-icon">🎙️</span>
                            <div class="mic-wave"></div>
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

        // Auto-Greet on first load
        setTimeout(() => {
            const meta = this.pageAnalyzer.analyze();
            if (meta.type === PageType.ResearchPaper) {
                this.addMessage('system', `Research Paper Detected: ${meta.title}`);
                this.toggleSidebar(true);
                this.voiceManager.speak("I've detected a research paper. Would you like a breakdown?");
            }
        }, 1500);
    }

    private toggleSidebar(forceOpen?: boolean) {
        if (!this.host) return;
        this.isOpen = forceOpen ?? !this.isOpen;

        const container = this.shadowRoot?.querySelector('.cortex-container');
        if (this.isOpen) {
            this.host.style.width = '400px';
            this.host.style.pointerEvents = 'auto';
            container?.classList.add('open');
        } else {
            this.host.style.width = '0'; // Keep handle visible logic? 
            // Actually, to keep handle visible, host width needs to be small, not 0.
            // Let's adjust: host always has width, but pointer-events control passthrough.
            this.host.style.width = '100%';
            this.host.style.pointerEvents = 'none'; // Pass through clicks
            container?.classList.remove('open');

            // Re-enable pointer events ONLY for the handle
            const handle = this.shadowRoot?.getElementById('handle');
            if (handle) handle.style.pointerEvents = 'auto';
        }
    }

    private toggleVoice() {
        // State management happens in VoiceManager, just toggle here
        this.voiceManager.listen((text) => this.handleUserMessage(text));
    }

    private async handleUserMessage(text: string) {
        this.addMessage('user', text);

        // Mock Response for V4 Demo
        this.addMessage('system', 'Thinking...');

        if (text.toLowerCase().includes('key') || text.toLowerCase().includes('api')) {
            this.addMessage('ai', 'To set your API key, please open the dashboard settings.');
            this.voiceManager.speak("Please open the dashboard settings to configure your API key.");
            return;
        }

        setTimeout(() => {
            const response = "Here is the information you requested based on the page context.";
            this.addMessage('ai', response);
            this.voiceManager.speak(response);
        }, 1000);
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

            .cortex-container {
                position: fixed;
                top: 0;
                right: 0;
                height: 100vh;
                width: 400px;
                background: rgba(10, 10, 10, 0.85);
                backdrop-filter: blur(25px) saturate(180%);
                border-left: 1px solid rgba(255, 255, 255, 0.1);
                box-shadow: -10px 0 40px rgba(0, 0, 0, 0.5);
                display: flex;
                flex-direction: column;
                transform: translateX(110%);
                transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1);
                font-family: 'Inter', sans-serif;
                color: white;
            }

            .cortex-container.open {
                transform: translateX(0);
            }

            .cortex-handle {
                position: absolute;
                left: -50px;
                top: 50%;
                width: 50px;
                height: 50px;
                background: rgba(10, 10, 10, 0.6);
                backdrop-filter: blur(10px);
                border-radius: 12px 0 0 12px;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-right: none;
                pointer-events: auto; /* Always clickable */
                transition: left 0.3s;
            }
            
            .cortex-container.open .cortex-handle {
                left: 400px; /* Hide or move? Let's hide */
                opacity: 0; 
                pointer-events: none;
            }

            .handle-icon {
                font-size: 24px;
                animation: pulse 3s infinite;
            }

            .cortex-header {
                padding: 20px;
                border-bottom: 1px solid rgba(255, 255, 255, 0.1);
                display: flex;
                justify-content: space-between;
                align-items: center;
                background: rgba(255, 255, 255, 0.03);
            }

            .brand-name { font-weight: 700; font-size: 18px; letter-spacing: -0.5px; }
            .brand-ver { font-size: 12px; color: #888; background: rgba(255,255,255,0.1); padding: 2px 6px; rounded: 4px; margin-left: 8px; border-radius: 4px;}

            .close-btn {
                background: none;
                border: none;
                color: #888;
                font-size: 24px;
                cursor: pointer;
                padding: 0;
            }
            .close-btn:hover { color: white; }

            .cortex-content {
                flex: 1;
                padding: 20px;
                overflow-y: auto;
                display: flex;
                flex-direction: column;
                gap: 15px;
            }

            .message {
                padding: 12px 16px;
                border-radius: 12px;
                font-size: 14px;
                line-height: 1.5;
                max-width: 85%;
                animation: slideIn 0.3s ease-out;
            }

            .message.ai {
                background: rgba(255, 255, 255, 0.1);
                align-self: flex-start;
                border-bottom-left-radius: 2px;
            }

            .message.user {
                background: #2563eb; /* Blue */
                align-self: flex-end;
                border-bottom-right-radius: 2px;
            }
            
            .message.system {
                background: transparent;
                color: #888;
                font-size: 12px;
                text-align: center;
                align-self: center;
                border: 1px solid rgba(255,255,255,0.05);
            }

            .cortex-footer {
                padding: 20px;
                background: rgba(0, 0, 0, 0.2);
                border-top: 1px solid rgba(255, 255, 255, 0.1);
            }

            .input-area {
                display: flex;
                gap: 10px;
            }

            .text-input {
                flex: 1;
                background: rgba(255, 255, 255, 0.05);
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 8px;
                padding: 10px 14px;
                color: white;
                outline: none;
                transition: border-color 0.2s;
            }
            .text-input:focus { border-color: #3b82f6; }

            .voice-btn {
                width: 44px;
                height: 44px;
                border-radius: 50%;
                background: rgba(255, 255, 255, 0.1);
                border: none;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 20px;
                transition: all 0.2s;
                position: relative;
            }

            .voice-btn:hover { background: rgba(255, 255, 255, 0.2); }
            
            .voice-btn.listening {
                background: #ef4444; /* Red */
                animation: pulse-red 1.5s infinite;
            }
            
            .voice-btn.speaking {
                 background: #3b82f6;
                 animation: pulse-blue 1.5s infinite;
            }

            @keyframes pulse { 0% { opacity: 0.5; } 50% { opacity: 1; } 100% { opacity: 0.5; } }
            @keyframes pulse-red { 0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4); } 70% { box-shadow: 0 0 0 10px rgba(239, 68, 68, 0); } 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); } }
            @keyframes slideIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        `;
    }
}
