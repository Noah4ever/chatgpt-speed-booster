import { DOMObserver } from "./DOMObserver";
import { LoadMoreButton, StatusIndicator } from "./UIComponents";
import { Selectors } from "./selectors";
import { messageManager } from "./Singletons";
import { loadConfig, onConfigChanged } from "../shared/storage";
import { onMessage } from "../shared/browser-api";
import {
    MessageType,
    type ExtensionConfig,
    type ExtensionStatus,
} from "../shared/types";
import { logger } from "../shared/logger";

let config: ExtensionConfig;
let loadMoreButton: LoadMoreButton;
let statusIndicator: StatusIndicator;
let domObserver: DOMObserver;
let recomputeRafId: number | null = null;

async function bootstrap(): Promise<void> {
    logger.info("bootstrapping content script");

    config = await loadConfig();
    messageManager.updateConfig(config);

    loadMoreButton = new LoadMoreButton(handleLoadMore);
    statusIndicator = new StatusIndicator();

    if (!config.showStatus) statusIndicator.hide();

    domObserver = new DOMObserver({
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
            scheduleRecomputePositions();
            logger.info(`initial scan: ${existing.length} messages`);
            return;
        }
        setTimeout(attempt, 500);
    };
    attempt();
    statusIndicator.initStatus();
}

/**
 * Incremental path for newly appended turns detected by DOMObserver.
 */
function handleMessagesAdded(elements: HTMLElement[]): void {
    messageManager.addMessages(elements);
    refreshUI();
    scheduleRecomputePositions();
}

/**
 * Cleans up removed turn references to keep manager state aligned with DOM.
 */
function handleMessagesRemoved(elements: HTMLElement[]): void {
    messageManager.removeMessages(elements);
    refreshUI();
    scheduleRecomputePositions();
}

/**
 * Handles in-DOM conversation navigation by rebuilding observer + state against
 * the newly rendered thread without requiring a full page refresh.
 */
function handleConversationChanged(): void {
    logger.debug("conversation changed, re-initialising");
    // Destroy old instances
    loadMoreButton.hide();
    statusIndicator.hide();
    domObserver.stop();

    // Re-initialize since new conv = new page
    bootstrap();

    setTimeout(() => {
        const messages = domObserver.queryAllMessages();
        messageManager.initialise(messages);
        refreshUI();
        scheduleRecomputePositions();
    }, 10);
}

function handleConfigUpdated(newConfig: ExtensionConfig): void {
    config = newConfig;
    messageManager.updateConfig(config);
    refreshUI();
    scheduleRecomputePositions();
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
        scheduleRecomputePositions(0);

        // 1ms delay
        setTimeout(() => {
            statusIndicator.updatePosition();
            statusIndicator.scheduleLabelUpdate();
        }, 1);
    }
}

/* Coalesces multiple update triggers into one layout pass so positions are computed
 * only after DOM visibility changes have been applied.
 */
function scheduleRecomputePositions(delay?: number): void {
    if (recomputeRafId != null) return;
    recomputeRafId = requestAnimationFrame(() => {
        messageManager.recomputeMessagePositions(delay);
        recomputeRafId = null;
    });
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

    if (!config.enabled || !config.showStatus || status.totalMessages == 0) {
        statusIndicator.hide();
    } else {
        statusIndicator.initStatus();
    }
}

function findFirstVisibleMessage(): HTMLElement | null {
    const all = document.querySelectorAll<HTMLElement>(Selectors.messageTurn);
    for (const el of all) {
        if (el.style.display !== "none") return el;
    }
    return null;
}

function findMessageContainer(): HTMLElement | null {
    const firstMsg = document.querySelector<HTMLElement>(Selectors.messageTurn);
    return firstMsg?.parentElement ?? null;
}

window.addEventListener("beforeunload", () => {
    if (recomputeRafId != null) {
        cancelAnimationFrame(recomputeRafId);
        recomputeRafId = null;
    }
    domObserver.stop();
    messageManager.destroy();
    loadMoreButton.destroy();
    statusIndicator.destroy();
});

bootstrap().catch((err) => {
    logger.error("failed to bootstrap content script", err);
});
