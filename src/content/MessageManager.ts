import type {
    ExtensionConfig,
    TrackedMessage,
    ExtensionStatus,
} from "../shared/types";
import { DEFAULT_CONFIG, DATA_ATTR } from "../shared/constants";
import { logger } from "../shared/logger";

/** Injected once into <head> — all hiding is done via this class. */
const HIDE_CLASS = "acsb-hidden";
let styleInjected = false;
function injectHideStyle(): void {
    if (styleInjected) return;
    styleInjected = true;
    const style = document.createElement("style");
    style.textContent = `.${HIDE_CLASS}{display:none!important}`;
    (document.head ?? document.documentElement).appendChild(style);
}

export class MessageManager {
    private messages: TrackedMessage[] = [];
    private config: ExtensionConfig = { ...DEFAULT_CONFIG };
    private messageIdAttribute = "data-testid";
    private cachedVisibleCount: number = 0;
    /** O(1) element → TrackedMessage lookup (avoids .find() scans). */
    private elementMap = new Map<HTMLElement, TrackedMessage>();
    private visibleCounter = 0;

    private get visibleCount(): number {
        return this.visibleCounter;
    }

    setMessageIdAttribute(attr: string): void {
        this.messageIdAttribute = attr;
    }

    updateConfig(config: ExtensionConfig): void {
        this.config = { ...config };
        this.recalculateVisibility();
    }

    initialise(elements: HTMLElement[]): void {
        injectHideStyle();
        this.messages = [];
        this.elementMap.clear();
        this.visibleCounter = 0;
        for (const el of elements) this.trackElement(el);
        this.recalculateVisibility();
        logger.debug(`initialised with ${this.messages.length} messages`);
    }

    addMessages(elements: HTMLElement[]): void {
        for (const el of elements) {
            if (this.elementMap.has(el)) continue;
            this.trackElement(el);
        }
        this.recalculateVisibility();
    }

    removeMessages(elements: HTMLElement[]): void {
        const removed = new Set(elements);
        this.messages = this.messages.filter((m) => {
            if (removed.has(m.element)) {
                this.elementMap.delete(m.element);
                if (m.visible) this.visibleCounter--;
                return false;
            }
            return true;
        });
    }

    loadMore(): number {
        if (!this.config.enabled) return 0;
        const hidden = this.messages.filter((m) => !m.visible);
        const toReveal = hidden.slice(-this.config.loadMoreBatchSize * 2);
        for (const msg of toReveal) this.showMessage(msg);
        this.cachedVisibleCount = this.visibleCount; // Preserve currently visible messages when user sends new prompt
        logger.debug(`revealed ${toReveal.length} additional messages`);
        return toReveal.length;
    }

    hasHiddenMessages(): boolean {
        return this.visibleCounter < this.messages.length;
    }

    getStatus(): ExtensionStatus {
        const total = this.messages.length;
        const visible = this.visibleCount;
        return {
            enabled: this.config.enabled,
            totalMessages: total,
            visibleMessages: visible,
            hiddenMessages: total - visible,
            showStatus: this.config.showStatus,
            statusPosition: this.config.statusPosition,
        };
    }

    destroy(): void {
        for (const msg of this.messages) {
            this.showMessage(msg);
            msg.element.removeAttribute(DATA_ATTR);
        }
        this.messages = [];
        this.elementMap.clear();
        this.visibleCounter = 0;
        this.cachedVisibleCount = 0;
        logger.debug("MessageManager destroyed");
    }

    private trackElement(el: HTMLElement): void {
        const id = this.deriveId(el);
        const msg: TrackedMessage = { id, element: el, visible: true };
        this.messages.push(msg);
        this.elementMap.set(el, msg);
        this.visibleCounter++;
        el.setAttribute(DATA_ATTR, id);
    }

    private recalculateVisibility(): void {
        if (!this.config.enabled) {
            for (const msg of this.messages) this.showMessage(msg);
            return;
        }
        // If "load more" is ever clicked, cachedVisibleCount will store the new limit for the current session and will be used
        const limit = Math.max(this.cachedVisibleCount, this.config.visibleMessageLimit * 2);
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

    private hideMessage(msg: TrackedMessage): void {
        if (!msg.visible) return; // already hidden — skip DOM write
        msg.visible = false;
        this.visibleCounter--;
        msg.element.classList.add(HIDE_CLASS);
        msg.element.setAttribute("aria-hidden", "true");
    }

    private showMessage(msg: TrackedMessage): void {
        if (msg.visible) return; // already visible — skip DOM write
        msg.visible = true;
        this.visibleCounter++;
        msg.element.classList.remove(HIDE_CLASS);
        msg.element.removeAttribute("aria-hidden");
    }

    private deriveId(el: HTMLElement): string {
        if (this.messageIdAttribute) {
            const attrValue = el.getAttribute(this.messageIdAttribute);
            if (attrValue) return attrValue;
        }
        return `msg-${this.messages.length}-${Date.now()}`;
    }

    /**
     * Anchor id for incremental DOMObserver turn resolution.
     */
    getLastTrackedMessageId(): string | null {
        const last = this.messages[this.messages.length - 1];
        return last?.id ?? null;
    }

    /**
     * Used by DOMObserver to prevent re-adding already tracked turns.
     */
    hasTrackedMessageId(id: string): boolean {
        return this.messages.some((m) => m.id === id);
    }
}
