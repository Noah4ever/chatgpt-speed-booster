import { Selectors } from "./selectors";
import { MUTATION_DEBOUNCE_MS } from "../shared/constants";
import { logger } from "../shared/logger";

export interface DOMObserverCallbacks {
    onMessagesAdded(elements: HTMLElement[]): void;
    onMessagesRemoved(elements: HTMLElement[]): void;
    onConversationChanged(): void;
    getLastTrackedMessageId(): string | null;
    hasTrackedMessageId(id: string): boolean;
}

export class DOMObserver {
    private observer: MutationObserver | null = null;
    private debounceTimer: ReturnType<typeof setTimeout> | null = null;
    private readonly callbacks: DOMObserverCallbacks;
    private currentUrl = window.location.href;
    private historyPatched = false;
    private readonly onPopState = (): void => {
        this.checkUrlChange();
    };
    private readonly onHashChange = (): void => {
        this.checkUrlChange();
    };
    private originalPushState: History["pushState"] | null = null;
    private originalReplaceState: History["replaceState"] | null = null;

    constructor(callbacks: DOMObserverCallbacks) {
        this.callbacks = callbacks;
    }

    start(): void {
        if (this.observer) {
            logger.warn("DOMObserver already running");
            return;
        }
        this.observer = new MutationObserver(this.handleMutations);
        this.observer.observe(document.body, {
            childList: true,
            subtree: true,
        });
        this.installUrlListeners();
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
        this.removeUrlListeners();
        logger.debug("DOMObserver stopped");
    }

    queryAllMessages(): HTMLElement[] {
        return Array.from(
            document.querySelectorAll<HTMLElement>(Selectors.messageTurn),
        );
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

    /**
     * Handles mutation batches by:
     * 1) short-circuiting on URL conversation changes,
     * 2) resolving newly appended turns from the tracked anchor,
     * 3) forwarding removed turn nodes for cleanup.
     */
    private processMutations(mutations: MutationRecord[]): void {
        if (this.checkUrlChange()) return;

        const removedMessages: HTMLElement[] = [];
        let hasNewLastNodeMarker = false;

        for (const mutation of mutations) {
            if (!hasNewLastNodeMarker && this.mutationAddsLastNodeMarker(mutation)) {
                hasNewLastNodeMarker = true;
            }
        }

        if (hasNewLastNodeMarker) {
            const addedMessages = this.resolveNextTurnsFromAnchor(2);
            if (addedMessages.length > 0) {
                logger.debug(`${addedMessages.length} message turn(s) added`);
                this.callbacks.onMessagesAdded(addedMessages);
            }
        }

        for (const mutation of mutations) {
            for (const node of mutation.removedNodes) {
                if (!(node instanceof HTMLElement)) continue;
                if (this.isMessageTurn(node)) {
                    removedMessages.push(node);
                } else {
                    const nested = node.querySelectorAll<HTMLElement>(
                        Selectors.messageTurn,
                    );
                    removedMessages.push(...nested);
                }
            }
        }

        if (removedMessages.length > 0) {
            logger.debug(`${removedMessages.length} message turn(s) removed`);
            this.callbacks.onMessagesRemoved(removedMessages);
        }
    }

    private isMessageTurn(el: HTMLElement): boolean {
        return el.matches?.(Selectors.messageTurn) ?? false;
    }

    /**
     * Resolves the next `count` turn containers after the last tracked turn id.
     * Falls back to currently visible turns when the anchor cannot be found.
     */
    private resolveNextTurnsFromAnchor(count: number): HTMLElement[] {
        if (count <= 0) return [];
        const lastTrackedId = this.callbacks.getLastTrackedMessageId();
        if (!lastTrackedId) return [];

        const anchor = this.findTrackedTurnElement(lastTrackedId);
        if (!anchor)
            return this.filterUntrackedTurns(this.getVisibleMessageTurns());
        return this.filterUntrackedTurns(
            this.collectNextMessageTurns(anchor, count),
        );
    }

    private filterUntrackedTurns(turns: HTMLElement[]): HTMLElement[] {
        return this.dedupeByElement(turns).filter((el) => {
            const id = this.getTurnId(el);
            return !id || !this.callbacks.hasTrackedMessageId(id);
        });
    }

    /**
     * Bounded fallback used when anchor lookup fails: scans only currently visible
     * turn containers so we avoid a full historical resync.
     */
    private getVisibleMessageTurns(): HTMLElement[] {
        const allTurns = document.querySelectorAll<HTMLElement>(
            Selectors.messageTurn,
        );
        const visible: HTMLElement[] = [];
        for (const el of allTurns) {
            if (el.style.display === "none") continue;
            if (!el.isConnected) continue;
            if (el.getClientRects().length === 0) continue;
            visible.push(el);
        }
        return visible;
    }

    private dedupeByElement(elements: HTMLElement[]): HTMLElement[] {
        const seen = new Set<HTMLElement>();
        const deduped: HTMLElement[] = [];
        for (const el of elements) {
            if (seen.has(el)) continue;
            seen.add(el);
            deduped.push(el);
        }
        return deduped;
    }

    private getTurnId(el: HTMLElement): string | null {
        const managed = el.getAttribute("data-cgsb-managed");
        if (managed) return managed;
        const testId = el.getAttribute("data-testid");
        return testId || null;
    }

    /**
     * Resolves the anchor element for incremental turn lookup using tracked id first,
     * then the original `data-testid` as backup.
     */
    private findTrackedTurnElement(id: string): HTMLElement | null {
        // Prefer managed-id lookup, then fall back to testid lookup.
        return (
            document.querySelector<HTMLElement>(
                `[data-cgsb-managed="${id}"]`,
            ) ?? document.querySelector<HTMLElement>(`[data-testid="${id}"]`)
        );
    }

    private collectNextMessageTurns(
        anchor: HTMLElement,
        limit: number,
    ): HTMLElement[] {
        const result: HTMLElement[] = [];
        let node: Node | null = anchor;

        while (result.length < limit) {
            node = this.nextNode(node);
            if (!node) break;
            if (!(node instanceof HTMLElement)) continue;
            if (node.matches?.(Selectors.messageTurn)) {
                result.push(node);
            }
        }

        return result;
    }

    /**
     * Document-order traversal helper used to find the next N turn containers
     * without querying every turn globally on each mutation batch.
     */
    private nextNode(current: Node): Node | null {
        if (current.firstChild) return current.firstChild;

        let node: Node | null = current;
        while (node) {
            if (node.nextSibling) return node.nextSibling;
            node = node.parentNode;
        }
        return null;
    }

    /**
     * Returns true only when the current mutation batch added a fresh
     * streaming tail marker. This is used as the gate for "new turn" resolution.
     */
    private mutationAddsLastNodeMarker(mutation: MutationRecord): boolean {
        for (const node of mutation.addedNodes) {
            if (!(node instanceof HTMLElement)) continue;
            if (node.hasAttribute("data-is-last-node")) return true;
            if (node.querySelector?.("[data-is-last-node]")) return true;
        }
        return false;
    }

    /**
     * Detects SPA route changes and converts them into a conversation-changed signal.
     */
    private checkUrlChange(): boolean {
        const nextUrl = window.location.href;
        if (nextUrl === this.currentUrl) return false;
        this.currentUrl = nextUrl;
        logger.debug(`URL changed, conversation changed: ${nextUrl}`);
        this.callbacks.onConversationChanged();
        return true;
    }

    /**
     * Hooks history/popstate/hashchange so in-DOM conversation navigation is observed
     * even when no full page reload occurs.
     */
    private installUrlListeners(): void {
        if (this.historyPatched) return;
        this.historyPatched = true;

        this.originalPushState = history.pushState.bind(history);
        this.originalReplaceState = history.replaceState.bind(history);

        history.pushState = ((...args: Parameters<History["pushState"]>) => {
            this.originalPushState?.(...args);
            this.checkUrlChange();
        }) as History["pushState"];

        history.replaceState = ((
            ...args: Parameters<History["replaceState"]>
        ) => {
            this.originalReplaceState?.(...args);
            this.checkUrlChange();
        }) as History["replaceState"];

        window.addEventListener("popstate", this.onPopState);
        window.addEventListener("hashchange", this.onHashChange);
    }

    /**
     * Restores patched history methods and removes navigation listeners.
     */
    private removeUrlListeners(): void {
        if (!this.historyPatched) return;
        this.historyPatched = false;

        window.removeEventListener("popstate", this.onPopState);
        window.removeEventListener("hashchange", this.onHashChange);

        if (this.originalPushState) history.pushState = this.originalPushState;
        if (this.originalReplaceState)
            history.replaceState = this.originalReplaceState;
        this.originalPushState = null;
        this.originalReplaceState = null;
    }
}
