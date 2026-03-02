import { sendMessage } from "../shared/browser-api";
import { CONFIG_LIMITS } from "../shared/constants";
import { MessageType, type ExtensionConfig, type ExtensionStatus, type StatusPosition } from "../shared/types";

const toggleEnabled = document.getElementById("toggle-enabled") as HTMLInputElement;
const toggleStatus = document.getElementById("toggle-status") as HTMLInputElement;
const visibleLimitInput = document.getElementById("visible-limit") as HTMLInputElement;
const batchSizeInput = document.getElementById("batch-size") as HTMLInputElement;
const statusText = document.getElementById("status-text") as HTMLElement;
const settingsSection = document.querySelector(".popup-settings") as HTMLElement;
const positionPicker = document.getElementById("position-picker") as HTMLElement;
const positionButtons = positionPicker.querySelectorAll<HTMLButtonElement>(".position-picker__btn");

let saveTimer: ReturnType<typeof setTimeout> | null = null;

async function init(): Promise<void> {
    const config = await sendMessage<ExtensionConfig>({ type: MessageType.GET_CONFIG });
    renderConfig(config);
    await refreshStatus();
}

function renderConfig(config: ExtensionConfig): void {
    toggleEnabled.checked = config.enabled;
    toggleStatus.checked = config.showStatus;
    visibleLimitInput.value = String(config.visibleMessageLimit);
    batchSizeInput.value = String(config.loadMoreBatchSize);
    settingsSection.setAttribute("aria-disabled", String(!config.enabled));

    // Highlight active position button
    positionButtons.forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.pos === config.statusPosition);
    });
}

async function refreshStatus(): Promise<void> {
    try {
        const status = await sendMessage<ExtensionStatus | undefined>({ type: MessageType.GET_STATUS });
        if (status && typeof status.totalMessages === "number") {
            statusText.textContent =
                `${status.visibleMessages / 2}/${status.totalMessages / 2} messages visible` +
                (status.hiddenMessages > 0 ? ` · ${status.hiddenMessages / 2} hidden` : "");
        } else {
            statusText.textContent = "Open a supported AI chat to see status";
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

/** Debounced auto-save for numeric inputs */
function scheduleAutoSave(): void {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
        saveTimer = null;
        const visibleLimit = clampInput(
            visibleLimitInput,
            CONFIG_LIMITS.visibleMessageLimit.min,
            CONFIG_LIMITS.visibleMessageLimit.max,
        );
        const batchSize = clampInput(
            batchSizeInput,
            CONFIG_LIMITS.loadMoreBatchSize.min,
            CONFIG_LIMITS.loadMoreBatchSize.max,
        );
        const config = await sendMessage<ExtensionConfig>({
            type: MessageType.SET_CONFIG,
            payload: { visibleMessageLimit: visibleLimit, loadMoreBatchSize: batchSize },
        });
        renderConfig(config);
        await refreshStatus();
    }, 600);
}

toggleEnabled.addEventListener("change", async () => {
    const config = await sendMessage<ExtensionConfig>({ type: MessageType.TOGGLE_ENABLED });
    renderConfig(config);
    await refreshStatus();
});

toggleStatus.addEventListener("change", async () => {
    const config = await sendMessage<ExtensionConfig>({ type: MessageType.TOGGLE_STATUS });
    renderConfig(config);
    await refreshStatus();
});

visibleLimitInput.addEventListener("input", scheduleAutoSave);
batchSizeInput.addEventListener("input", scheduleAutoSave);

positionPicker.addEventListener("click", async (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>(".position-picker__btn");
    if (!btn || !btn.dataset.pos) return;
    const config = await sendMessage<ExtensionConfig>({
        type: MessageType.SET_CONFIG,
        payload: { statusPosition: btn.dataset.pos as StatusPosition },
    });
    renderConfig(config);
    await refreshStatus();
});

init();
