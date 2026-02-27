import { sendMessage } from "../shared/browser-api";
import { DEFAULT_CONFIG, CONFIG_LIMITS } from "../shared/constants";
import { MessageType, type ExtensionConfig, type ExtensionStatus } from "../shared/types";

const toggleEnabled = document.getElementById("toggle-enabled") as HTMLInputElement;
const visibleLimitInput = document.getElementById("visible-limit") as HTMLInputElement;
const batchSizeInput = document.getElementById("batch-size") as HTMLInputElement;
const saveBtn = document.getElementById("save-btn") as HTMLButtonElement;
const resetBtn = document.getElementById("reset-btn") as HTMLButtonElement;
const statusText = document.getElementById("status-text") as HTMLElement;
const settingsSection = document.querySelector(".popup-settings") as HTMLElement;

async function init(): Promise<void> {
    const config = await sendMessage<ExtensionConfig>({ type: MessageType.GET_CONFIG });
    renderConfig(config);
    await refreshStatus();
}

function renderConfig(config: ExtensionConfig): void {
    toggleEnabled.checked = config.enabled;
    visibleLimitInput.value = String(config.visibleMessageLimit);
    batchSizeInput.value = String(config.loadMoreBatchSize);
    settingsSection.setAttribute("aria-disabled", String(!config.enabled));
}

async function refreshStatus(): Promise<void> {
    try {
        const status = await sendMessage<ExtensionStatus | undefined>({ type: MessageType.GET_STATUS });
        if (status && typeof status.totalMessages === "number") {
            statusText.textContent =
                `${status.visibleMessages}/${status.totalMessages} messages visible` +
                (status.hiddenMessages > 0 ? ` · ${status.hiddenMessages} hidden` : "");
        } else {
            statusText.textContent = "Open a ChatGPT conversation to see status";
        }
    } catch {
        statusText.textContent = "Unable to fetch status";
    }
}

function clampInput(input: HTMLInputElement, min: number, max: number): number {
    let value = parseInt(input.value, 10);
    if (isNaN(value)) value = min;
    value = Math.max(min, Math.min(max, value));
    input.value = String(value);
    return value;
}

toggleEnabled.addEventListener("change", async () => {
    const config = await sendMessage<ExtensionConfig>({ type: MessageType.TOGGLE_ENABLED });
    renderConfig(config);
    await refreshStatus();
});

saveBtn.addEventListener("click", async () => {
    const visibleLimit = clampInput(visibleLimitInput, CONFIG_LIMITS.visibleMessageLimit.min, CONFIG_LIMITS.visibleMessageLimit.max);
    const batchSize = clampInput(batchSizeInput, CONFIG_LIMITS.loadMoreBatchSize.min, CONFIG_LIMITS.loadMoreBatchSize.max);

    const config = await sendMessage<ExtensionConfig>({
        type: MessageType.SET_CONFIG,
        payload: { visibleMessageLimit: visibleLimit, loadMoreBatchSize: batchSize },
    });

    renderConfig(config);

    const originalText = saveBtn.textContent;
    saveBtn.textContent = "Saved";
    saveBtn.disabled = true;
    setTimeout(() => {
        saveBtn.textContent = originalText;
        saveBtn.disabled = false;
    }, 1200);

    await refreshStatus();
});

resetBtn.addEventListener("click", async () => {
    const config = await sendMessage<ExtensionConfig>({
        type: MessageType.SET_CONFIG,
        payload: { ...DEFAULT_CONFIG },
    });
    renderConfig(config);
    await refreshStatus();
});

init();
