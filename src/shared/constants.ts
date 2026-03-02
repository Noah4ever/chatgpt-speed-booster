import type { ExtensionConfig } from "./types";

export const STORAGE_KEY = "ai_chat_speed_booster_config" as const;

export const DEFAULT_CONFIG: Readonly<ExtensionConfig> = Object.freeze({
    visibleMessageLimit: 3,
    loadMoreBatchSize: 3,
    enabled: true,
    showStatus: true,
    statusPosition: "top-right",
});

export const CONFIG_LIMITS = Object.freeze({
    visibleMessageLimit: { min: 1, max: 200 },
    loadMoreBatchSize: { min: 1, max: 50 },
});

export const EXTENSION_NAME = "AI Chat Speed Booster" as const;
export const CSS_PREFIX = "acsb" as const;
export const DATA_ATTR = "data-acsb-managed" as const;
export const MUTATION_DEBOUNCE_MS = 150 as const;
