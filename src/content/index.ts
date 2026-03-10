import { DOMObserver } from "./DOMObserver";
import { MessageManager } from "./MessageManager";
import { LoadMoreButton, StatusIndicator } from "./UIComponents";
import { detectCurrentSite, type SiteConfig } from "../shared/sites";
import { loadConfig, onConfigChanged } from "../shared/storage";
import { onMessage } from "../shared/browser-api";
import {
    MessageType,
    type ExtensionConfig,
    type ExtensionStatus,
} from "../shared/types";
import { logger } from "../shared/logger";

let config: ExtensionConfig;
let currentSite: SiteConfig;
const messageManager = new MessageManager();
let loadMoreButton: LoadMoreButton;
let statusIndicator: StatusIndicator;
let domObserver: DOMObserver;
let conversationRetryTimer: ReturnType<typeof setTimeout> | null = null;
let previousMessageElements: Set<HTMLElement> = new Set();
/**
 * Internal flag tracking whether the fetch interceptor trimmed the current
 * conversation's API response.  Set by consuming the DOM attribute
 * (data-acsb-trimmed) written by the MAIN-world interceptor, and reset
 * on conversation change so it doesn't carry over across SPA navigations.
 */
let currentConversationTrimmed = false;

async function bootstrap(): Promise<void> {
    const site = detectCurrentSite();
    if (!site) {
        logger.info("no supported site detected, content script inactive");
        return;
    }
    currentSite = site;
    logger.info(`bootstrapping content script for ${currentSite.name}`);

    config = await loadConfig();
    messageManager.updateConfig(config);
    if (currentSite.messageIdAttribute) {
        messageManager.setMessageIdAttribute(currentSite.messageIdAttribute);
    }

    loadMoreButton = new LoadMoreButton(handleLoadMore, currentSite);
    statusIndicator = new StatusIndicator(currentSite);

    if (!config.showStatus) statusIndicator.hide();

    domObserver = new DOMObserver(currentSite.selectors, {
        onMessagesAdded: handleMessagesAdded,
        onMessagesRemoved: handleMessagesRemoved,
        onConversationChanged: handleConversationChanged,
        onMessagesReset: handleMessagesReset,
        getLastTrackedMessageId: () => messageManager.getLastTrackedMessageId(),
        hasTrackedMessageId: (id: string) =>
            messageManager.hasTrackedMessageId(id),
    });

    domObserver.start();
    scheduleInitialScan();
    onConfigChanged(handleConfigUpdated);
    onMessage(handleExtensionMessage);

    // Diagnostic: log selector match info to help debug site configs
    setTimeout(() => {
        const msgs = domObserver.queryAllMessages();
        const scrollEl = domObserver.findScrollContainer();
        console.log(
            `[AI Chat Speed Booster] Site: ${currentSite.name} | ` +
            `Selector: "${currentSite.selectors.messageTurn}" → ${msgs.length} match(es) | ` +
            `Scroll container: ${scrollEl ? "found" : "NOT found"}` +
            `| Is Dynamic: ${currentSite.isDynamic ? "Yes" : "No"}`,
        );
    }, 3000);
}

/**
 * Waits for the first conversation turns to appear before initialising manager/UI.
 */
function scheduleInitialScan(): void {
    const attempt = (): void => {
        const existing = domObserver.queryAllMessages();
        if (existing.length > 0) {
            messageManager.initialise(existing);
            refreshUI();
            logger.info(`initial scan: ${existing.length} messages`);
            return;
        }
        setTimeout(attempt, 500);
    };
    attempt();
}

/**
 * Incremental path for newly appended turns detected by DOMObserver.
 */
function handleMessagesAdded(elements: HTMLElement[]): void {
    messageManager.addMessages(elements);
    refreshUI();
}

/**
 * Cleans up removed turn references to keep manager state aligned with DOM.
 */
function handleMessagesRemoved(elements: HTMLElement[]): void {
    messageManager.removeMessages(elements);
    refreshUI();
}

/**
 * Handles in-DOM conversation navigation by rebuilding observer + state against
 * the newly rendered thread without requiring a full page refresh.
 */
function handleConversationChanged(): void {
    logger.debug("conversation changed, re-initialising");

    // Reset the trimmed flag for the new conversation.  The fetch
    // interceptor will set the DOM attribute again if it trims.
    currentConversationTrimmed = false;

    // Cancel any in-flight retry loop from a previous navigation
    if (conversationRetryTimer) {
        clearTimeout(conversationRetryTimer);
        conversationRetryTimer = null;
    }

    // Remember current DOM elements so we can tell when genuinely new
    // messages appear (old ones may linger until React unmounts them)
    previousMessageElements = new Set(domObserver.queryAllMessages());

    messageManager.destroy();
    loadMoreButton.hide();
    statusIndicator.hide();

    // Wait for new messages to render, retry a few times for SPA navigations
    let retries = 0;
    const maxRetries = 20;
    const attempt = (): void => {
        const messages = domObserver.queryAllMessages();
        const hasNewMessages = messages.some((m) => !previousMessageElements.has(m));

        if (hasNewMessages || retries >= maxRetries) {
            // If we found genuinely new messages, use all current messages.
            // If we hit maxRetries with only old messages, initialise with
            // whatever is there (could be the same chat reloaded).
            messageManager.initialise(messages);
            previousMessageElements = new Set();
            refreshUI();
            conversationRetryTimer = null;
            if (messages.length > 0) {
                logger.debug(`re-initialised with ${messages.length} messages after ${retries} retries`);
            }
            return;
        }
        retries++;
        conversationRetryTimer = setTimeout(attempt, 300);
    };
    conversationRetryTimer = setTimeout(attempt, 200);
}

function handleConfigUpdated(newConfig: ExtensionConfig): void {
    config = newConfig;
    messageManager.updateConfig(config);
    refreshUI();
    logger.debug("config updated from external source");
}

/**
 * Resets message manager and UI state when a large batch of messages is added at once, which is a strong signal
 * that the conversation thread was re-rendered from scratch (e.g. due to a significant navigation or dynamic loading event)
 * and incremental mutation handling can't keep up with the changes.
 */
function handleMessagesReset(): void {
    if(!currentSite.isDynamic) return; // Only apply this heuristic for sites known to have dynamic loading (e.g. Gemini),
    // to avoid unnecessary resets on more static sites where the existing mutation handling is sufficient
    logger.debug("large batch detected, re-initialising message manager");
    messageManager.destroy();
    loadMoreButton.hide();
    const messages = domObserver.queryAllMessages();
    messageManager.initialise(messages);
    refreshUI();
    const scrollEl = domObserver.findScrollContainer();
    if (scrollEl) {
        scrollEl.scrollTo({ top: 0, behavior: "instant" });
    } else {
        window.scrollTo({ top: 0, behavior: "instant" });
    }
}

function handleExtensionMessage(message: unknown): ExtensionStatus | undefined {
    const msg = message as { type?: string };
    if (msg.type === MessageType.GET_STATUS) return messageManager.getStatus();
    return undefined;
}

/**
 * Reveals older hidden turns and refreshes status positioning after layout settles.
 * When all hidden DOM messages are exhausted but the fetch interceptor trimmed
 * messages, shows a "Load full conversation" button that reloads without trimming.
 */
function handleLoadMore(): void {
    const revealed = messageManager.loadMore();
    if (revealed > 0) {
        refreshUI();
    } else {
        // Nothing left to reveal from DOM — check if fetch interceptor trimmed
        refreshUI();
    }
}

/**
 * One-shot full reload: sets a localStorage flag so the fetch interceptor
 * skips trimming on the next page load, then reloads.
 */
function handleFullLoad(): void {
    try {
        localStorage.setItem("acsb_skip_trim_once", "true");
    } catch { /* storage unavailable */ }
    window.location.reload();
}

/**
 * Central renderer for load-more and status-indicator visibility states.
 */
let rafPending = false;
function refreshUI(): void {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => {
        rafPending = false;
        const status = messageManager.getStatus();

        // Consume the DOM attribute written by the MAIN-world fetch
        // interceptor.  Once consumed we store the flag internally so
        // subsequent non-conversation fetch responses can't erase it.
        if (document.documentElement.hasAttribute("data-acsb-trimmed")) {
            currentConversationTrimmed = true;
            document.documentElement.removeAttribute("data-acsb-trimmed");
        }

        if (status.hiddenMessages > 0 && config.enabled) {
            // Normal Load More mode — there are still hidden DOM elements
            const firstVisible = findFirstVisibleMessage();
            const container = findMessageContainer();
            if (container && firstVisible) {
                loadMoreButton.show(container, firstVisible, status.hiddenMessages, config.loadMoreBatchSize);
            } else if (container) {
                loadMoreButton.show(container, null, status.hiddenMessages, config.loadMoreBatchSize);
            }
        } else if (currentConversationTrimmed && config.enabled && config.fetchInterceptEnabled) {
            // All DOM messages visible, but fetch interceptor trimmed more.
            // Show "Load full conversation" button.
            const firstVisible = findFirstVisibleMessage();
            const container = findMessageContainer();
            if (container) {
                loadMoreButton.showFullLoad(container, firstVisible, handleFullLoad);
            }
        } else {
            loadMoreButton.hide();
        }

        if (!config.enabled || !config.showStatus || status.totalMessages === 0) {
            statusIndicator.hide();
        } else {
            statusIndicator.update(status.hiddenMessages, status.totalMessages, config.statusPosition, config.fetchInterceptEnabled, config.theme === "light");
        }
    });
}

function findFirstVisibleMessage(): HTMLElement | null {
    const all = document.querySelectorAll<HTMLElement>(currentSite.selectors.messageTurn);
    for (const el of all) {
        if (!el.classList.contains("acsb-hidden")) return el;
    }
    return null;
}

function findMessageContainer(): HTMLElement | null {
    const firstMsg = document.querySelector<HTMLElement>(currentSite.selectors.messageTurn);
    return firstMsg?.parentElement ?? null;
}

window.addEventListener("beforeunload", () => {
    if (conversationRetryTimer) {
        clearTimeout(conversationRetryTimer);
        conversationRetryTimer = null;
    }
    domObserver.stop();
    messageManager.destroy();
    loadMoreButton.destroy();
    statusIndicator.destroy();
});

bootstrap().catch((err) => {
    logger.error("failed to bootstrap content script", err);
});
