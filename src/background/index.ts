import { loadConfig, saveConfig } from "../shared/storage";
import { onMessage, api } from "../shared/browser-api";
import { MessageType } from "../shared/types";
import type { ExtensionConfig, ExtensionMessageUnion, ExtensionStatus } from "../shared/types";
import { logger } from "../shared/logger";

api.runtime.onInstalled.addListener(async (details: chrome.runtime.InstalledDetails) => {
    if (details.reason === "install") {
        const config = await loadConfig();
        logger.info("extension installed, config initialised", config);
    }
    if (details.reason === "update") {
        await loadConfig();
        logger.info("extension updated");
    }
});

onMessage(async (message): Promise<unknown> => {
    const msg = message as ExtensionMessageUnion;

    switch (msg.type) {
        case MessageType.GET_CONFIG:
            return await loadConfig();

        case MessageType.SET_CONFIG: {
            const partial = msg.payload as Partial<ExtensionConfig>;
            const updated = await saveConfig(partial);
            await broadcastToContentScripts({ type: MessageType.CONFIG_UPDATED, payload: updated });
            return updated;
        }

        case MessageType.GET_STATUS:
            return await forwardToActiveTab(msg);

        case MessageType.TOGGLE_ENABLED: {
            const current = await loadConfig();
            const updated = await saveConfig({ enabled: !current.enabled });
            await broadcastToContentScripts({ type: MessageType.CONFIG_UPDATED, payload: updated });
            return updated;
        }

        default:
            return undefined;
    }
});

async function broadcastToContentScripts(message: ExtensionMessageUnion): Promise<void> {
    try {
        const tabs = await api.tabs.query({ url: "*://chatgpt.com/*" });
        for (const tab of tabs) {
            if (tab.id == null) continue;
            try { await api.tabs.sendMessage(tab.id, message); } catch { /* not injected */ }
        }
    } catch (error) {
        logger.error("failed to broadcast to content scripts", error);
    }
}

async function forwardToActiveTab(message: ExtensionMessageUnion): Promise<ExtensionStatus | undefined> {
    try {
        const [tab] = await api.tabs.query({ active: true, currentWindow: true, url: "*://chatgpt.com/*" });
        if (!tab?.id) return undefined;
        return (await api.tabs.sendMessage(tab.id, message)) as ExtensionStatus | undefined;
    } catch {
        return undefined;
    }
}
