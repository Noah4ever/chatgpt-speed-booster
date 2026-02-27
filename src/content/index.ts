import { DOMObserver } from "./DOMObserver";
import { MessageManager } from "./MessageManager";
import { LoadMoreButton, StatusIndicator } from "./UIComponents";
import { Selectors } from "./selectors";
import { loadConfig, onConfigChanged } from "../shared/storage";
import { onMessage } from "../shared/browser-api";
import { MessageType, type ExtensionConfig, type ExtensionStatus } from "../shared/types";
import { logger } from "../shared/logger";

let config: ExtensionConfig;
const messageManager = new MessageManager();
let loadMoreButton: LoadMoreButton;
let statusIndicator: StatusIndicator;
let domObserver: DOMObserver;

async function bootstrap(): Promise<void> {
    logger.info("bootstrapping content script");

    config = await loadConfig();
    messageManager.updateConfig(config);

    loadMoreButton = new LoadMoreButton(handleLoadMore);
    statusIndicator = new StatusIndicator();

    domObserver = new DOMObserver({
        onMessagesAdded: handleMessagesAdded,
        onMessagesRemoved: handleMessagesRemoved,
        onConversationChanged: handleConversationChanged,
    });

    domObserver.start();
    scheduleInitialScan();
    onConfigChanged(handleConfigUpdated);
    onMessage(handleExtensionMessage);
}

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

function handleMessagesAdded(elements: HTMLElement[]): void {
    messageManager.addMessages(elements);
    refreshUI();
}

function handleMessagesRemoved(elements: HTMLElement[]): void {
    messageManager.removeMessages(elements);
    refreshUI();
}

function handleConversationChanged(): void {
    logger.debug("conversation changed, re-initialising");
    loadMoreButton.hide();
    statusIndicator.hide();
    setTimeout(() => {
        const messages = domObserver.queryAllMessages();
        messageManager.initialise(messages);
        refreshUI();
    }, 300);
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

function handleLoadMore(): void {
    const revealed = messageManager.loadMore();
    if (revealed > 0) refreshUI();
}

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

    if (config.enabled && status.totalMessages > 0) {
        statusIndicator.show(status.visibleMessages, status.totalMessages);
    } else {
        statusIndicator.hide();
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
    domObserver.stop();
    messageManager.destroy();
    loadMoreButton.destroy();
    statusIndicator.destroy();
});

bootstrap().catch((err) => {
    logger.error("failed to bootstrap content script", err);
});
