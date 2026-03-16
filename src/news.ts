export class NewsManager {
    container: HTMLElement | null;

    constructor(containerId: string) {
        this.container = document.getElementById(containerId);
    }

    log(message: string, type: 'system' | 'alert' | 'finance' | 'normal' = 'normal', day: number) {
        if (!this.container) return;

        const bubble = document.createElement('div');
        bubble.className = `chat-bubble ${type}`;

        if (type !== 'system') {
            const time = document.createElement('span');
            time.className = 'chat-time';
            time.innerText = `DAY ${Math.floor(day)}`;
            bubble.appendChild(time);
        }

        const text = document.createElement('span');
        text.innerText = message;
        bubble.appendChild(text);

        this.container.prepend(bubble);

        // Auto-scroll to top
        this.container.scrollTop = 0;

        // Optional: limit log size
        if (this.container.children.length > 50) {
            this.container.lastChild?.remove();
        }
    }
}
