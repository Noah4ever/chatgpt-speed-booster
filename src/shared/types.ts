export type TargetBrowser = "chrome" | "firefox" | "edge" | "safari";

export interface ExtensionConfig {
    readonly visibleMessageLimit: number;
    readonly loadMoreBatchSize: number;
    readonly enabled: boolean;
}

export interface TrackedMessage {
    readonly id: string;
    readonly element: HTMLElement;
    visible: boolean;
}

export enum MessageType {
    GET_CONFIG = "GET_CONFIG",
    SET_CONFIG = "SET_CONFIG",
    CONFIG_UPDATED = "CONFIG_UPDATED",
    GET_STATUS = "GET_STATUS",
    STATUS_RESPONSE = "STATUS_RESPONSE",
    TOGGLE_ENABLED = "TOGGLE_ENABLED",
}

export interface ExtensionMessage {
    readonly type: MessageType;
    readonly payload?: unknown;
}

export interface GetConfigMessage extends ExtensionMessage {
    readonly type: MessageType.GET_CONFIG;
}

export interface SetConfigMessage extends ExtensionMessage {
    readonly type: MessageType.SET_CONFIG;
    readonly payload: Partial<ExtensionConfig>;
}

export interface ConfigUpdatedMessage extends ExtensionMessage {
    readonly type: MessageType.CONFIG_UPDATED;
    readonly payload: ExtensionConfig;
}

export type ExtensionMessageUnion =
    | GetConfigMessage
    | SetConfigMessage
    | ConfigUpdatedMessage
    | ExtensionMessage;

export interface ExtensionStatus {
    readonly enabled: boolean;
    readonly totalMessages: number;
    readonly visibleMessages: number;
    readonly hiddenMessages: number;
}
