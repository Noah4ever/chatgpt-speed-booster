import { storageGet, storageSet, onStorageChanged } from "./browser-api";
import { STORAGE_KEY, DEFAULT_CONFIG, CONFIG_LIMITS } from "./constants";
import type { ExtensionConfig } from "./types";
import { logger } from "./logger";

function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(Math.round(value), min), max);
}

function sanitiseConfig(raw: Partial<ExtensionConfig> | undefined): ExtensionConfig {
    const base = { ...DEFAULT_CONFIG, ...raw };
    return {
        visibleMessageLimit: clamp(
            base.visibleMessageLimit,
            CONFIG_LIMITS.visibleMessageLimit.min,
            CONFIG_LIMITS.visibleMessageLimit.max,
        ),
        loadMoreBatchSize: clamp(
            base.loadMoreBatchSize,
            CONFIG_LIMITS.loadMoreBatchSize.min,
            CONFIG_LIMITS.loadMoreBatchSize.max,
        ),
        enabled: typeof base.enabled === "boolean" ? base.enabled : DEFAULT_CONFIG.enabled,
    };
}

export async function loadConfig(): Promise<ExtensionConfig> {
    try {
        const raw = await storageGet<Partial<ExtensionConfig>>(STORAGE_KEY);
        return sanitiseConfig(raw);
    } catch (error) {
        logger.error("failed to load config, using defaults", error);
        return { ...DEFAULT_CONFIG };
    }
}

export async function saveConfig(partial: Partial<ExtensionConfig>): Promise<ExtensionConfig> {
    const current = await loadConfig();
    const merged = sanitiseConfig({ ...current, ...partial });
    await storageSet(STORAGE_KEY, merged);
    logger.debug("config saved", merged);
    return merged;
}

export function onConfigChanged(callback: (config: ExtensionConfig) => void): void {
    onStorageChanged((changes, area) => {
        if (area !== "local" || !(STORAGE_KEY in changes)) return;
        const newValue = changes[STORAGE_KEY].newValue as Partial<ExtensionConfig> | undefined;
        callback(sanitiseConfig(newValue));
    });
}
