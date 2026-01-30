import { VoiceManager } from '../shared/voice-manager';
import { PageAnalyzer, PageType, PageMetadata } from '../shared/page-analyzer';
import { MessageType } from '../types';

export class AssistantUI {
    private shadowRoot: ShadowRoot | null = null;
    private container: HTMLElement | null = null;
    private voiceManager: VoiceManager;
    private pageAnalyzer: PageAnalyzer;
    private state: 'minimized' | 'active' | 'listening' | 'speaking' = 'minimized';

    constructor() {
        this.voiceManager = new VoiceManager();
        this.pageAnalyzer = new PageAnalyzer();
        this.initializeURLListener();
    }

    private initializeURLListener() {
        // Listen for URL changes in SPAs
        let lastUrl = location.href;
        new MutationObserver(() => {
            const url = location.href;
            if (url !== lastUrl) {
                lastUrl = url;
                this.analyzeAndGreet();
            }
        }).observe(document, { subtree: true, childList: true });
    }

    public async mount() {
        if (document.getElementById('markmind-nexus')) return;

        const host = document.createElement('div');
        host.id = 'markmind-nexus';
        // Position fixed at bottom right
        Object.assign(host.style, {
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            zIndex: '2147483647',
            fontFamily: 'system-ui, -apple-system, sans-serif'
        });

        this.shadowRoot = host.attachShadow({ mode: 'open' });

        // Add Styles
        const style = document.createElement('style');
        style.textContent = this.getStyles();
        this.shadowRoot.appendChild(style);

        // Add Container
        this.container = document.createElement('div');
        this.container.className = 'nexus-orb minimized';
        this.container.onclick = () => this.toggleState();

        // Add Visuals
        this.container.innerHTML = `
            <div class="orb-core"></div>
            <div class="orb-ring"></div>
            <div class="content-area">
                <div class="status-text"></div>
                <div class="wave-visualizer">
                    <span></span><span></span><span></span><span></span>
                </div>
            </div>
        `;

        this.shadowRoot.appendChild(this.container);
        document.body.appendChild(host);

        // Sync Voice State
        this.voiceManager.setStateCallback((state) => this.updateVisualState(state));

        // Initial Analysis
        setTimeout(() => this.analyzeAndGreet(), 1000);
    }

    private async analyzeAndGreet() {
        const metadata = this.pageAnalyzer.analyze();
        const greeting = this.getGreeting(metadata);

        // Auto-expand/notify for relevant content
        if (metadata.type === PageType.ResearchPaper || metadata.type === PageType.Article) {
            this.setTip(`Found: ${metadata.type.replace('_', ' ')}`);
            this.pulse();

            // In a real user flow, we might wait for a click or keypress before speaking
            // to avoid being annoying. For V3 demo, we can just pulse.
        }

        console.log('MarkMind Analysis:', metadata);
    }

    public activateVoiceInteraction() {
        if (this.state === 'speaking') {
            this.voiceManager.stop();
            return;
        }

        const metadata = this.pageAnalyzer.analyze();
        const greeting = this.getGreeting(metadata);

        this.state = 'active';
        this.updateUI();

        this.voiceManager.speak(greeting).then(() => {
            // Auto-listen after greeting
            this.voiceManager.listen((text) => this.handleUserQuery(text));
        });
    }

    private async handleUserQuery(text: string) {
        this.setTip(`You: "${text}"`);

        // Simple logic for V3 demo
        if (text.toLowerCase().includes('summary') || text.toLowerCase().includes('summarize')) {
            const summaryResponse = "This is a detailed summary of the content... (Mock AI Response)";
            // In real app, call background service -> AI

            // Quick demo response
            await this.voiceManager.speak("I'm generating a summary for you. Please wait a moment.");
            // Call actual AI service here
            this.handleAIAction(MessageType.SUMMARIZE_SELECTION, document.body.innerText.substring(0, 5000));
        } else {
            await this.voiceManager.speak(`I heard you say ${text}. How can I help with that?`);
        }
    }

    private async handleAIAction(type: MessageType, text: string) {
        try {
            const response = await chrome.runtime.sendMessage({
                type: type,
                payload: { text }
            });

            if (response && response.content) {
                // Read out the first sentence or short summary
                const speechContent = response.content.substring(0, 200) + "...";
                this.setTip("AI: Explaining...");
                await this.voiceManager.speak("Here is what found. " + speechContent);
            }
        } catch (e) {
            this.voiceManager.speak("I'm sorry, I couldn't connect to my brain.");
        }
    }

    private getGreeting(metadata: PageMetadata): string {
        switch (metadata.type) {
            case PageType.ResearchPaper:
                return `I see you are reading a research paper titled ${metadata.title}. Would you like a summary of the methodology?`;
            case PageType.Repository:
                return `This looks like a code repository. Shall I explain the project structure?`;
            case PageType.Article:
                return `I've analyzed this article. It takes about ${metadata.readingTime} minutes to read. Brief summary?`;
            default:
                return `Hi there. How can I help you with this page?`;
        }
    }

    private toggleState() {
        if (this.state === 'minimized') {
            this.state = 'active';
            this.activateVoiceInteraction();
        } else {
            this.state = 'minimized';
            this.voiceManager.stop();
        }
        this.updateUI();
    }

    private updateVisualState(voiceState: 'speaking' | 'listening' | 'idle') {
        const visualizer = this.shadowRoot?.querySelector('.wave-visualizer') as HTMLElement;
        const orb = this.container as HTMLElement;
        if (!visualizer || !orb) return;

        orb.classList.remove('state-speaking', 'state-listening');

        if (voiceState === 'speaking') {
            orb.classList.add('state-speaking');
            visualizer.style.opacity = '1';
        } else if (voiceState === 'listening') {
            orb.classList.add('state-listening');
            visualizer.style.opacity = '0.5';
        } else {
            visualizer.style.opacity = '0';
        }
    }

    private updateUI() {
        if (!this.container) return;

        if (this.state === 'minimized') {
            this.container.classList.add('minimized');
            this.container.classList.remove('expanded');
        } else {
            this.container.classList.remove('minimized');
            this.container.classList.add('expanded');
        }
    }

    private setTip(text: string) {
        const el = this.shadowRoot?.querySelector('.status-text');
        if (el) el.textContent = text;
    }

    private pulse() {
        this.container?.classList.add('pulse');
        setTimeout(() => this.container?.classList.remove('pulse'), 2000);
    }

    private getStyles(): string {
        return `
            .nexus-orb {
                width: 60px;
                height: 60px;
                border-radius: 30px;
                background: rgba(15, 23, 42, 0.8);
                backdrop-filter: blur(20px);
                border: 1px solid rgba(255, 255, 255, 0.1);
                box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
                transition: all 0.5s cubic-bezier(0.16, 1, 0.3, 1);
                overflow: hidden;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                position: relative;
            }

            .nexus-orb.minimized:hover {
                transform: scale(1.1);
            }

            .nexus-orb.expanded {
                width: 300px;
                height: 100px; /* Chat bubble size */
                border-radius: 20px;
                justify-content: flex-start;
                padding: 0 20px;
            }

            .orb-core {
                position: absolute;
                width: 40px;
                height: 40px;
                background: linear-gradient(135deg, #3b82f6, #8b5cf6);
                border-radius: 50%;
                filter: blur(10px);
                opacity: 0.8;
                transition: all 0.5s;
                top: 10px;
                left: 10px;
            }

            .nexus-orb.expanded .orb-core {
                top: 50%;
                left: 20px;
                transform: translateY(-50%) scale(0.5);
            }

            .state-reading .orb-core { background: linear-gradient(135deg, #10b981, #3b82f6); }
            .state-speaking .orb-core { animation: pulse-core 1s infinite alternate; background: linear-gradient(135deg, #f59e0b, #ef4444); }
            .state-listening .orb-core { background: linear-gradient(135deg, #ec4899, #8b5cf6); transform: scale(1.2); }

            .content-area {
                margin-left: 50px;
                opacity: 0;
                transition: opacity 0.3s 0.2s;
                font-size: 14px;
                color: white;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                max-width: 200px;
            }

            .nexus-orb.expanded .content-area {
                opacity: 1;
            }

            .wave-visualizer {
                display: flex;
                gap: 3px;
                height: 15px;
                align-items: center;
                margin-top: 5px;
                opacity: 0;
            }

            .wave-visualizer span {
                width: 3px;
                height: 100%;
                background: white;
                border-radius: 2px;
                animation: wave 1s infinite ease-in-out;
            }

            .wave-visualizer span:nth-child(2) { animation-delay: 0.1s; }
            .wave-visualizer span:nth-child(3) { animation-delay: 0.2s; }
            .wave-visualizer span:nth-child(4) { animation-delay: 0.3s; }

            @keyframes wave {
                0%, 100% { height: 20%; opacity: 0.5; }
                50% { height: 100%; opacity: 1; }
            }

            @keyframes pulse-core {
                from { opacity: 0.6; transform: scale(0.9); }
                to { opacity: 1; transform: scale(1.1); }
            }
            
            .status-text {
                font-weight: 500;
                letter-spacing: 0.5px;
            }
        `;
    }
}
