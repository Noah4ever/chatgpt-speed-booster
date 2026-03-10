import { type SiteSelectors } from "../shared/sites";
import { MUTATION_DEBOUNCE_MS } from "../shared/constants";
import { logger } from "../shared/logger";

export interface DOMObserverCallbacks {
    onMessagesAdded(elements: HTMLElement[]): void;
    onMessagesRemoved(elements: HTMLElement[]): void;
    onConversationChanged(): void;
    onMessagesReset(): void;
    getLastTrackedMessageId(): string | null;
    hasTrackedMessageId(id: string): boolean;
}

export class DOMObserver {
    private observer: MutationObserver | null = null;
    private debounceTimer: ReturnType<typeof setTimeout> | null = null;
    private pendingMutations: MutationRecord[] = [];
    private readonly selectors: SiteSelectors;
    private readonly callbacks: DOMObserverCallbacks;
    private lastUrl = "";
    private urlPollTimer: ReturnType<typeof setInterval> | null = null;

    constructor(selectors: SiteSelectors, callbacks: DOMObserverCallbacks) {
        this.selectors = selectors;
        this.callbacks = callbacks;
    }

    start(): void {
        if (this.observer) {
            logger.warn("DOMObserver already running");
            return;
        }
        this.lastUrl = location.href;
        this.observer = new MutationObserver(this.handleMutations);
        this.observer.observe(document.body, { childList: true, subtree: true });

        // Detect SPA navigations (pushState / replaceState / popstate)
        window.addEventListener("popstate", this.handleNavigation);
        this.patchHistoryMethod("pushState");
        this.patchHistoryMethod("replaceState");

        // Fallback: poll for URL changes every 500ms in case patches miss something
        this.urlPollTimer = setInterval(() => this.checkUrlChange(), 500);

        logger.debug("DOMObserver started");
    }

    stop(): void {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = null;
        }
        this.pendingMutations = [];
        if (this.urlPollTimer) {
            clearInterval(this.urlPollTimer);
            this.urlPollTimer = null;
        }
        window.removeEventListener("popstate", this.handleNavigation);
        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }
        logger.debug("DOMObserver stopped");
    }

    queryAllMessages(): HTMLElement[] {
        return Array.from(document.querySelectorAll<HTMLElement>(this.selectors.messageTurn));
    }

    findScrollContainer(): HTMLElement | null {
        const primary = document.querySelector<HTMLElement>(this.selectors.scrollContainer);
        if (primary) return primary;
        if (this.selectors.scrollContainerAlt) {
            return document.querySelector<HTMLElement>(this.selectors.scrollContainerAlt);
        }
        return null;
    }

    private patchHistoryMethod(method: "pushState" | "replaceState"): void {
        const original = history[method].bind(history);
        history[method] = (...args: Parameters<typeof history.pushState>) => {
            original(...args);
            this.checkUrlChange();
        };
    }

    private checkUrlChange(): void {
        const current = location.href;
        if (current !== this.lastUrl) {
            logger.debug(`URL changed: ${this.lastUrl} -> ${current}`);
            this.lastUrl = current;
            this.callbacks.onConversationChanged();
        }
    }

    private readonly handleNavigation = (): void => {
        this.checkUrlChange();
    };

    private readonly handleMutations = (mutations: MutationRecord[]): void => {
        this.pendingMutations.push(...mutations);
        if (this.debounceTimer) clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => {
            const batch = this.pendingMutations;
            this.pendingMutations = [];
            this.processMutations(batch);
        }, MUTATION_DEBOUNCE_MS);
    };

    private processMutations(mutations: MutationRecord[]): void {
        const addedMessages: HTMLElement[] = [];
        const removedMessages: HTMLElement[] = [];

        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (!(node instanceof HTMLElement)) continue;
                if (this.isMessageTurn(node)) {
                    addedMessages.push(node);
                } else {
                    const nested = node.querySelectorAll<HTMLElement>(this.selectors.messageTurn);
                    addedMessages.push(...nested);
                }
            }

            for (const node of mutation.removedNodes) {
                if (!(node instanceof HTMLElement)) continue;
                if (this.isMessageTurn(node)) {
                    removedMessages.push(node);
                } else {
                    const nested = node.querySelectorAll<HTMLElement>(this.selectors.messageTurn);
                    removedMessages.push(...nested);
                }
            }
        }

        // Conversation changes are detected via URL monitoring (pushState,
        // replaceState, popstate, polling).  The previous DOM-based
        // "isConversationContainer" heuristic (checking if any added/removed
        // node contained 2+ message turns) caused duplicate change events
        // and race conditions during SPA navigations.

        if (addedMessages.length > 2) { // If a large batch of messages is added at once, it's likely a dynamic
        // loading scenario (e.g. Gemini) where the existing message tracking can get out of sync, so we trigger a full reset to be safe
            logger.debug(`Detected ${addedMessages.length} new messages, triggering full reset`);
            this.callbacks.onMessagesReset();
        } else if (addedMessages.length > 0) {
            logger.debug(`${addedMessages.length} message turn(s) added`);
            this.callbacks.onMessagesAdded(addedMessages);
        }

        if (removedMessages.length > 0) {
            logger.debug(`${removedMessages.length} message turn(s) removed`);
            this.callbacks.onMessagesRemoved(removedMessages);
        }
    }

    private isMessageTurn(el: HTMLElement): boolean {
        return el.matches?.(this.selectors.messageTurn) ?? false;
    }
}
