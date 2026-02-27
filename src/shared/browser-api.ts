export const api: typeof chrome = chrome;

export async function storageGet<T>(key: string): Promise<T | undefined> {
    const result = await api.storage.local.get(key);
    return result[key] as T | undefined;
}

export async function storageSet<T>(key: string, value: T): Promise<void> {
    await api.storage.local.set({ [key]: value });
}

export async function sendMessage<T>(message: unknown): Promise<T> {
    return api.runtime.sendMessage(message) as Promise<T>;
}

export function onMessage(
    callback: (
        message: unknown,
        sender: chrome.runtime.MessageSender,
    ) => Promise<unknown> | unknown,
): void {
    api.runtime.onMessage.addListener(
        (
            message: unknown,
            sender: chrome.runtime.MessageSender,
            sendResponse: (response?: unknown) => void,
        ) => {
            const result = callback(message, sender);

            if (result instanceof Promise) {
                result.then(sendResponse).catch((err: unknown) => {
                    console.error("[ChatGPT Speed Booster] message handler error:", err);
                    sendResponse(undefined);
                });
                return true;
            }

            if (result !== undefined) {
                sendResponse(result);
            }

            return false;
        },
    );
}

export function onStorageChanged(
    callback: (
        changes: Record<string, chrome.storage.StorageChange>,
        areaName: string,
    ) => void,
): void {
    api.storage.onChanged.addListener(callback);
}

export function getURL(path: string): string {
    return api.runtime.getURL(path);
}
