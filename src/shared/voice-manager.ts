export class VoiceManager {
    private synthesis: SpeechSynthesis;
    private recognition: any; // webkitSpeechRecognition
    private preferredVoice: SpeechSynthesisVoice | null = null;
    private isListening: boolean = false;
    private onSpeechResult: ((text: string) => void) | null = null;
    private onStateChange: ((state: 'speaking' | 'listening' | 'idle') => void) | null = null;

    constructor() {
        this.synthesis = window.speechSynthesis;
        this.initRecognition();

        // Load voices immediately if possible, or wait for event
        if (this.synthesis.getVoices().length > 0) {
            this.selectPreferredVoice();
        } else {
            this.synthesis.onvoiceschanged = () => this.selectPreferredVoice();
        }
    }

    private initRecognition() {
        if ('webkitSpeechRecognition' in window) {
            // @ts-ignore
            const SpeechRecognition = (window as any).webkitSpeechRecognition;
            this.recognition = new SpeechRecognition();
            this.recognition.continuous = false;
            this.recognition.interimResults = false;
            this.recognition.lang = 'en-US';

            this.recognition.onstart = () => {
                this.isListening = true;
                this.onStateChange?.('listening');
            };

            this.recognition.onend = () => {
                this.isListening = false;
                this.onStateChange?.('idle');
            };

            this.recognition.onresult = (event: any) => {
                const transcript = event.results[0][0].transcript;
                this.onSpeechResult?.(transcript);
            };

            this.recognition.onerror = (event: any) => {
                console.error('Speech recognition error:', event.error);
                this.isListening = false;
                this.onStateChange?.('idle');
            };
        } else {
            console.warn('Speech recognition not supported in this browser.');
        }
    }

    private selectPreferredVoice() {
        const voices = this.synthesis.getVoices();

        // Priority: "Premium" or "Enhanced" Female voices (Mac/Windows have these)
        // Then: Google US English (standard high quality)
        // Then: Any Female voice

        const preferredNames = ['Samantha', 'Google US English', 'Microsoft Zira', 'Victoria'];

        this.preferredVoice =
            voices.find(v => (v.name.includes('Premium') || v.name.includes('Enhanced')) && v.name.includes('Female')) ||
            voices.find(v => preferredNames.some(name => v.name.includes(name))) ||
            voices.find(v => v.name.includes('Female')) ||
            voices.find(v => v.lang === 'en-US') ||
            voices[0]; // Fallback

        console.log('Selected Voice:', this.preferredVoice?.name);
    }

    public speak(text: string): Promise<void> {
        return new Promise((resolve, reject) => {
            if (this.synthesis.speaking) {
                this.synthesis.cancel();
            }

            const utterance = new SpeechSynthesisUtterance(text);
            if (this.preferredVoice) {
                utterance.voice = this.preferredVoice;
            }

            // Tuning for "Assistant" like personality
            // Slightly faster and higher pitch for female assistant tone
            utterance.rate = 1.25;
            utterance.pitch = 1.0;

            utterance.onstart = () => this.onStateChange?.('speaking');
            utterance.onend = () => {
                this.onStateChange?.('idle');
                resolve();
            };
            utterance.onerror = (e) => reject(e);

            this.synthesis.speak(utterance);
        });
    }

    public listen(callback: (text: string) => void) {
        if (!this.recognition) {
            alert('Voice input is not supported in this browser.');
            return;
        }

        // If already speaking, stop
        if (this.synthesis.speaking) {
            this.synthesis.cancel();
        }

        this.onSpeechResult = callback;
        try {
            this.recognition.start();
        } catch (e) {
            // Already started?
            this.recognition.stop();
            setTimeout(() => this.recognition.start(), 100);
        }
    }

    public stop() {
        this.synthesis.cancel();
        if (this.isListening) {
            this.recognition.stop();
        }
    }

    public setStateCallback(cb: (state: 'speaking' | 'listening' | 'idle') => void) {
        this.onStateChange = cb;
    }
}
