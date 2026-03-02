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

    loadMoreButton = new LoadMoreButton(handleLoadMore);
    statusIndicator = new StatusIndicator();

    if (!config.showStatus) statusIndicator.hide();

    domObserver = new DOMObserver(currentSite.selectors, {
        onMessagesAdded: handleMessagesAdded,
        onMessagesRemoved: handleMessagesRemoved,
        onConversationChanged: handleConversationChanged,
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
            `Scroll container: ${scrollEl ? "found" : "NOT found"}`,
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

function handleExtensionMessage(message: unknown): ExtensionStatus | undefined {
    const msg = message as { type?: string };
    if (msg.type === MessageType.GET_STATUS) return messageManager.getStatus();
    return undefined;
}

/**
 * Reveals older hidden turns and refreshes status positioning after layout settles.
 */
function handleLoadMore(): void {
    const revealed = messageManager.loadMore();
    if (revealed > 0) {
        refreshUI();
    }
}

/**
 * Central renderer for load-more and status-indicator visibility states.
 */
function refreshUI(): void {
    const status = messageManager.getStatus();

    if (status.hiddenMessages > 0 && config.enabled) {
        const firstVisible = findFirstVisibleMessage();
        const container = findMessageContainer();
        if (container && firstVisible) {
            loadMoreButton.show(container, firstVisible, status.hiddenMessages);
        } else if (container) {
            loadMoreButton.show(container, null, status.hiddenMessages);
        }
    } else {
        loadMoreButton.hide();
    }

    if (!config.enabled || !config.showStatus || status.totalMessages === 0) {
        statusIndicator.hide();
    } else {
        statusIndicator.update(status.hiddenMessages, status.totalMessages);
    }
}

function findFirstVisibleMessage(): HTMLElement | null {
    const all = document.querySelectorAll<HTMLElement>(currentSite.selectors.messageTurn);
    for (const el of all) {
        if (el.style.display !== "none") return el;
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
