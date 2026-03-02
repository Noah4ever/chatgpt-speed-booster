import type {
    ExtensionConfig,
    TrackedMessage,
    ExtensionStatus,
    MessageMeta,
} from "../shared/types";
import type { SiteSelectors } from "../shared/sites";
import { DEFAULT_CONFIG, DATA_ATTR } from "../shared/constants";
import { logger } from "../shared/logger";

export class MessageManager {
    private messages: TrackedMessage[] = [];
    private config: ExtensionConfig = { ...DEFAULT_CONFIG };
    private messageIdAttribute = "data-testid";
    private messagePositions: MessageMeta[] = [];
    private positionTimer: ReturnType<typeof setTimeout> | null = null;
    private siteSelectors: SiteSelectors | null = null;

    private get visibleCount(): number {
        return this.messages.filter((m) => m.visible).length;
    }

    setMessageIdAttribute(attr: string): void {
        this.messageIdAttribute = attr;
    }

    setSiteSelectors(selectors: SiteSelectors): void {
        this.siteSelectors = selectors;
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
        const toReveal = hidden.slice(-this.config.loadMoreBatchSize * 2);
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
            showStatus: this.config.showStatus,
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

        const limit = this.config.visibleMessageLimit * 2;
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

    /**
     * Preserves the visible window size during incremental additions by hiding
     * oldest currently-visible turns first.
     */
    private enforceLimit(): void {
        if (!this.config.enabled) return;
        let excess = this.visibleCount - this.config.visibleMessageLimit * 2;
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
        if (this.messageIdAttribute) {
            const attrValue = el.getAttribute(this.messageIdAttribute);
            if (attrValue) return attrValue;
        }
        return `msg-${this.messages.length}-${Date.now()}`;
    }

    /**
     * Recomputes ordered message bounds in scroll-root coordinates.
     * Uses a tiny debounce so layout reads happen after DOM visibility updates settle.
     */
    recomputeMessagePositions(delay: number = 1): void {
        if (!this.config.showStatus) return;

        if (this.positionTimer) {
            clearTimeout(this.positionTimer);
        }

        this.positionTimer = setTimeout(() => {
            this.positionTimer = null;

            const scrollRoot = this.findScrollRoot();
            if (!scrollRoot) {
                this.messagePositions = [];
                return;
            }

            const rootRect = scrollRoot.getBoundingClientRect();
            const rootScrollTop = scrollRoot.scrollTop;
            const visibleMessages = this.messages.filter(
                (m) =>
                    m.visible &&
                    m.element.isConnected &&
                    m.element.style.display !== "none",
            );

            this.messagePositions = visibleMessages
                .map(({ element }) => {
                    const rect = element.getBoundingClientRect();
                    const top = rect.top - rootRect.top + rootScrollTop;
                    return { top, bottom: top + rect.height };
                })
                .sort((a, b) => a.top - b.top);
        }, delay);
    }

    private findScrollRoot(): HTMLElement | null {
        const dataRoot = document.querySelector<HTMLElement>("[data-scroll-root]");
        if (dataRoot) return dataRoot;

        if (this.siteSelectors) {
            const primary = document.querySelector<HTMLElement>(this.siteSelectors.scrollContainer);
            if (primary) return primary;
            if (this.siteSelectors.scrollContainerAlt) {
                return document.querySelector<HTMLElement>(this.siteSelectors.scrollContainerAlt);
            }
        }
        return null;
    }

    getMessagePositions(): MessageMeta[] {
        return this.messagePositions;
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
