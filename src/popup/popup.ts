import { sendMessage } from "../shared/browser-api";
import { CONFIG_LIMITS, DEFAULT_CONFIG } from "../shared/constants";
import { MessageType, Theme, type ExtensionConfig, type ExtensionStatus, type StatusPosition } from "../shared/types";

const toggleEnabled = document.getElementById("toggle-enabled") as HTMLInputElement;
const toggleStatus = document.getElementById("toggle-status") as HTMLInputElement;
const toggleFetchIntercept = document.getElementById("toggle-fetch-intercept") as HTMLInputElement;
const visibleLimitInput = document.getElementById("visible-limit") as HTMLInputElement;
const batchSizeInput = document.getElementById("batch-size") as HTMLInputElement;
const statusText = document.getElementById("status-text") as HTMLElement;
const settingsSection = document.querySelector(".popup-settings") as HTMLElement;
const positionPicker = document.getElementById("position-picker") as HTMLElement;
const positionButtons = positionPicker.querySelectorAll<HTMLButtonElement>(".position-picker__btn");
const lightIcon = document.querySelector(".theme-toggle__icon.lucide-sun") as HTMLElement;
const darkIcon = document.querySelector(".theme-toggle__icon.lucide-moon") as HTMLElement;
const themeToggle = document.getElementById("theme-toggle") as HTMLElement;

let saveTimer: ReturnType<typeof setTimeout> | null = null;

/** Apply the selected theme to the popup UI. */
function applyTheme(theme: Theme): void {
    document.documentElement.setAttribute("data-theme", theme);
    if (theme === "light") {
        lightIcon.classList.add("hidden");
        darkIcon.classList.remove("hidden");
    } else {
        lightIcon.classList.remove("hidden");
        darkIcon.classList.add("hidden");
    }
}

/** Attempt to send a message to the background script; return null on failure. */
async function safeSendMessage<T>(message: unknown): Promise<T | null> {
    try {
        return (await sendMessage<T>(message)) ?? null;
    } catch {
        return null;
    }
}

async function init(): Promise<void> {
    const config = await safeSendMessage<ExtensionConfig>({ type: MessageType.GET_CONFIG });
    const finalConfig = config ?? DEFAULT_CONFIG; // Fallback to defaults if background script is unreachable
    applyTheme(finalConfig.theme);
    renderConfig(finalConfig);
    await refreshStatus();
}

function renderConfig(config: ExtensionConfig): void {
    toggleEnabled.checked = config.enabled;
    toggleStatus.checked = config.showStatus;
    toggleFetchIntercept.checked = config.fetchInterceptEnabled;
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
        const status = await safeSendMessage<ExtensionStatus | undefined>({ type: MessageType.GET_STATUS });
        if (status && typeof status.totalMessages === "number") {
            statusText.textContent =
                `${Math.floor(status.visibleMessages / 2)}/${Math.floor(status.totalMessages / 2)} messages visible` +
                (status.hiddenMessages > 0 ? ` · ${Math.floor(status.hiddenMessages / 2)} hidden` : "");
            settingsSection.style.display = ""; // Show if the site is a valid site
        } else {
            settingsSection.style.display = "none"; // Hide if the site is not a valid site
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
        const config = await safeSendMessage<ExtensionConfig>({
            type: MessageType.SET_CONFIG,
            payload: { visibleMessageLimit: visibleLimit, loadMoreBatchSize: batchSize },
        });
        if (config) renderConfig(config);
        await refreshStatus();
    }, 600);
}

toggleEnabled.addEventListener("change", async () => {
    const config = await safeSendMessage<ExtensionConfig>({ type: MessageType.TOGGLE_ENABLED });
    if (config) renderConfig(config);
    await refreshStatus();
});

toggleStatus.addEventListener("change", async () => {
    const config = await safeSendMessage<ExtensionConfig>({ type: MessageType.TOGGLE_STATUS });
    if (config) renderConfig(config);
    await refreshStatus();
});

toggleFetchIntercept.addEventListener("change", async () => {
    const config = await safeSendMessage<ExtensionConfig>({ type: MessageType.TOGGLE_FETCH_INTERCEPT });
    if (config) renderConfig(config);
    await refreshStatus();
});

visibleLimitInput.addEventListener("input", scheduleAutoSave);
batchSizeInput.addEventListener("input", scheduleAutoSave);

positionPicker.addEventListener("click", async (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>(".position-picker__btn");
    if (!btn || !btn.dataset.pos) return;
    const config = await safeSendMessage<ExtensionConfig>({
        type: MessageType.SET_CONFIG,
        payload: { statusPosition: btn.dataset.pos as StatusPosition },
    });
    if (config) renderConfig(config);
    await refreshStatus();
});


/** Theme toggle button listener */
themeToggle.addEventListener("click", async () => {
    const currentTheme = document.documentElement.getAttribute("data-theme") as "light" | "dark" || "dark";
    const newTheme = currentTheme === "dark" ? "light" : "dark";
    const config = await safeSendMessage<ExtensionConfig>({
        type: MessageType.SET_CONFIG,
        payload: { theme: newTheme },
    });
    if (config) {
        applyTheme(config.theme);
        renderConfig(config);
    }
});

init();
