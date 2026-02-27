import type { ExtensionConfig, TrackedMessage, ExtensionStatus } from "../shared/types";
import { DEFAULT_CONFIG, DATA_ATTR } from "../shared/constants";
import { logger } from "../shared/logger";

export class MessageManager {
    private messages: TrackedMessage[] = [];
    private config: ExtensionConfig = { ...DEFAULT_CONFIG };

    private get visibleCount(): number {
        return this.messages.filter((m) => m.visible).length;
    }

    updateConfig(config: ExtensionConfig): void {
        this.config = { ...config };
        this.recalculateVisibility();
    }

    initialise(elements: HTMLElement[]): void {
        this.messages = [];
        for (const el of elements) this.trackElement(el);
        this.recalculateVisibility();
        logger.debug(`initialised with ${this.messages.length} messages`);
    }

    addMessages(elements: HTMLElement[]): void {
        for (const el of elements) {
            if (this.findByElement(el)) continue;
            this.trackElement(el);
        }
        this.enforceLimit();
    }

    removeMessages(elements: HTMLElement[]): void {
        const removed = new Set(elements);
        this.messages = this.messages.filter((m) => !removed.has(m.element));
    }

    loadMore(): number {
        if (!this.config.enabled) return 0;
        const hidden = this.messages.filter((m) => !m.visible);
        const toReveal = hidden.slice(-this.config.loadMoreBatchSize);
        for (const msg of toReveal) this.showMessage(msg);
        logger.debug(`revealed ${toReveal.length} additional messages`);
        return toReveal.length;
    }

    hasHiddenMessages(): boolean {
        return this.messages.some((m) => !m.visible);
    }

    getStatus(): ExtensionStatus {
        const total = this.messages.length;
        const visible = this.visibleCount;
        return {
            enabled: this.config.enabled,
            totalMessages: total,
            visibleMessages: visible,
            hiddenMessages: total - visible,
        };
    }

    destroy(): void {
        for (const msg of this.messages) {
            this.showMessage(msg);
            msg.element.removeAttribute(DATA_ATTR);
        }
        this.messages = [];
        logger.debug("MessageManager destroyed");
    }

    private trackElement(el: HTMLElement): void {
        const id = this.deriveId(el);
        this.messages.push({ id, element: el, visible: true });
        el.setAttribute(DATA_ATTR, id);
    }

    private recalculateVisibility(): void {
        if (!this.config.enabled) {
            for (const msg of this.messages) this.showMessage(msg);
            return;
        }

        const limit = this.config.visibleMessageLimit;
        const total = this.messages.length;

        for (let i = 0; i < total; i++) {
            const msg = this.messages[i];
            if (i < total - limit) {
                this.hideMessage(msg);
            } else {
                this.showMessage(msg);
            }
        }
    }

    private enforceLimit(): void {
        if (!this.config.enabled) return;
        let excess = this.visibleCount - this.config.visibleMessageLimit;
        for (const msg of this.messages) {
            if (excess <= 0) break;
            if (msg.visible) {
                this.hideMessage(msg);
                excess--;
            }
        }
    }

    private hideMessage(msg: TrackedMessage): void {
        if (!msg.visible) return;
        msg.visible = false;
        msg.element.style.display = "none";
        msg.element.setAttribute("aria-hidden", "true");
    }

    private showMessage(msg: TrackedMessage): void {
        if (msg.visible) return;
        msg.visible = true;
        msg.element.style.display = "";
        msg.element.removeAttribute("aria-hidden");
    }

    private findByElement(el: HTMLElement): TrackedMessage | undefined {
        return this.messages.find((m) => m.element === el);
    }

    private deriveId(el: HTMLElement): string {
        const testId = el.getAttribute("data-testid");
        if (testId) return testId;
        return `msg-${this.messages.length}-${Date.now()}`;
    }
}
