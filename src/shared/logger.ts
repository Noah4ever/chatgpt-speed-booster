import { EXTENSION_NAME } from "./constants";

const enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARN = 2,
    ERROR = 3,
    SILENT = 4,
}

declare const __DEV__: boolean;

const ACTIVE_LEVEL: LogLevel = __DEV__ ? LogLevel.DEBUG : LogLevel.WARN;
const PREFIX = `[${EXTENSION_NAME}]`;

export const logger = {
    debug(...args: unknown[]): void {
        if (ACTIVE_LEVEL <= LogLevel.DEBUG) console.debug(PREFIX, ...args);
    },
    info(...args: unknown[]): void {
        if (ACTIVE_LEVEL <= LogLevel.INFO) console.info(PREFIX, ...args);
    },
    warn(...args: unknown[]): void {
        if (ACTIVE_LEVEL <= LogLevel.WARN) console.warn(PREFIX, ...args);
    },
    error(...args: unknown[]): void {
        if (ACTIVE_LEVEL <= LogLevel.ERROR) console.error(PREFIX, ...args);
    },
} as const;
