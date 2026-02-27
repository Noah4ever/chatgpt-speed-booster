import type { ExtensionConfig } from "./types";

export const STORAGE_KEY = "chatgpt_speed_booster_config" as const;

export const DEFAULT_CONFIG: Readonly<ExtensionConfig> = Object.freeze({
    visibleMessageLimit: 10,
    loadMoreBatchSize: 5,
    enabled: true,
});

export const CONFIG_LIMITS = Object.freeze({
    visibleMessageLimit: { min: 1, max: 200 },
    loadMoreBatchSize: { min: 1, max: 50 },
});

export const EXTENSION_NAME = "ChatGPT Speed Booster" as const;
export const CSS_PREFIX = "cgsb" as const;
export const DATA_ATTR = "data-cgsb-managed" as const;
export const MUTATION_DEBOUNCE_MS = 150 as const;
