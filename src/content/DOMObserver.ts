import { Selectors } from "./selectors";
import { MUTATION_DEBOUNCE_MS } from "../shared/constants";
import { logger } from "../shared/logger";

export interface DOMObserverCallbacks {
    onMessagesAdded(elements: HTMLElement[]): void;
    onMessagesRemoved(elements: HTMLElement[]): void;
    onConversationChanged(): void;
}

export class DOMObserver {
    private observer: MutationObserver | null = null;
    private debounceTimer: ReturnType<typeof setTimeout> | null = null;
    private readonly callbacks: DOMObserverCallbacks;

    constructor(callbacks: DOMObserverCallbacks) {
        this.callbacks = callbacks;
    }

    start(): void {
        if (this.observer) {
            logger.warn("DOMObserver already running");
            return;
        }
        this.observer = new MutationObserver(this.handleMutations);
        this.observer.observe(document.body, { childList: true, subtree: true });
        logger.debug("DOMObserver started");
    }

    stop(): void {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = null;
        }
        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }
        logger.debug("DOMObserver stopped");
    }

    queryAllMessages(): HTMLElement[] {
        return Array.from(document.querySelectorAll<HTMLElement>(Selectors.messageTurn));
    }

    findScrollContainer(): HTMLElement | null {
        return (
            document.querySelector<HTMLElement>(Selectors.scrollContainer) ??
            document.querySelector<HTMLElement>(Selectors.scrollContainerAlt)
        );
    }

    private readonly handleMutations = (mutations: MutationRecord[]): void => {
        if (this.debounceTimer) clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => {
            this.processMutations(mutations);
        }, MUTATION_DEBOUNCE_MS);
    };

    private processMutations(mutations: MutationRecord[]): void {
        const addedMessages: HTMLElement[] = [];
        const removedMessages: HTMLElement[] = [];
        let conversationChanged = false;

        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (!(node instanceof HTMLElement)) continue;
                if (this.isMessageTurn(node)) {
                    addedMessages.push(node);
                } else {
                    const nested = node.querySelectorAll<HTMLElement>(Selectors.messageTurn);
                    addedMessages.push(...nested);
                }
                if (this.isConversationContainer(node)) conversationChanged = true;
            }

            for (const node of mutation.removedNodes) {
                if (!(node instanceof HTMLElement)) continue;
                if (this.isMessageTurn(node)) {
                    removedMessages.push(node);
                } else {
                    const nested = node.querySelectorAll<HTMLElement>(Selectors.messageTurn);
                    removedMessages.push(...nested);
                }
                if (this.isConversationContainer(node)) conversationChanged = true;
            }
        }

        if (conversationChanged) {
            logger.debug("conversation container changed");
            this.callbacks.onConversationChanged();
            return;
        }

        if (addedMessages.length > 0) {
            logger.debug(`${addedMessages.length} message turn(s) added`);
            this.callbacks.onMessagesAdded(addedMessages);
        }

        if (removedMessages.length > 0) {
            logger.debug(`${removedMessages.length} message turn(s) removed`);
            this.callbacks.onMessagesRemoved(removedMessages);
        }
    }

    private isMessageTurn(el: HTMLElement): boolean {
        return el.matches?.(Selectors.messageTurn) ?? false;
    }

    private isConversationContainer(el: HTMLElement): boolean {
        return el.querySelectorAll?.(Selectors.messageTurn).length > 1;
    }
}
