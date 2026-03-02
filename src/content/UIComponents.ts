import { CSS_PREFIX } from "../shared/constants";
import { logger } from "../shared/logger";

export type LoadMoreHandler = () => void;

function createArrowUpIcon(): SVGElement {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("xmlns", ns);
    svg.setAttribute("width", "16");
    svg.setAttribute("height", "16");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");

    const vertical = document.createElementNS(ns, "path");
    vertical.setAttribute("d", "M12 19V5");

    const arrowHead = document.createElementNS(ns, "path");
    arrowHead.setAttribute("d", "m5 12 7-7 7 7");

    svg.append(vertical, arrowHead);
    return svg;
}

export class LoadMoreButton {
    private container: HTMLElement | null = null;
    private readonly onLoadMore: LoadMoreHandler;
    private hiddenCount = 0;

    constructor(onLoadMore: LoadMoreHandler) {
        this.onLoadMore = onLoadMore;
    }

    show(
        anchorParent: HTMLElement,
        firstVisibleElement: HTMLElement | null,
        hiddenCount: number,
    ): void {
        this.hiddenCount = hiddenCount;

        if (!this.container) {
            this.container = this.createElement();
        }

        this.updateLabel();

        if (
            firstVisibleElement &&
            firstVisibleElement.parentElement === anchorParent
        ) {
            anchorParent.insertBefore(this.container, firstVisibleElement);
        } else {
            anchorParent.prepend(this.container);
        }
    }

    update(hiddenCount: number): void {
        this.hiddenCount = hiddenCount;
        this.updateLabel();
    }

    hide(): void {
        this.container?.remove();
    }

    destroy(): void {
        this.hide();
        this.container = null;
    }

    private createElement(): HTMLElement {
        const wrapper = document.createElement("div");
        wrapper.className = `${CSS_PREFIX}-load-more-wrapper`;
        wrapper.setAttribute("role", "banner");
        Object.assign(wrapper.style, {
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            padding: "12px 16px",
            margin: "4px 15px 4px 0px", //ChatGPT's UI has a 15px gap on the left
            borderRadius: "8px",
            background: "#323232d9", //ChatGPT's --message-surface var
            backdropFilter: "blur(4px)",
            transition: "opacity 0.2s ease",
        } satisfies Partial<CSSStyleDeclaration>);

        const button = document.createElement("button");
        button.className = `${CSS_PREFIX}-load-more-btn`;
        button.type = "button";
        button.setAttribute("aria-label", "Load older messages");
        Object.assign(button.style, {
            all: "unset",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            padding: "8px 20px",
            borderRadius: "6px",
            fontSize: "13px",
            fontWeight: "500",
            fontFamily:
                '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
            color: "var(--text-muted, #d1d5db)",
            background: "var(--surface-tertiary, rgba(255,255,255,0.06))",
            border: "1px solid var(--border-medium, rgba(255,255,255,0.1))",
            transition:
                "background 0.15s ease, transform 0.1s ease, color 0.1s ease",
        } satisfies Partial<CSSStyleDeclaration>);

        button.addEventListener("mouseenter", () => {
            // button.style.background = "var(--surface-tertiary-hover, rgba(255,255,255,0.12))";
            button.style.color = "var(--text-foreground)";
        });
        button.addEventListener("mouseleave", () => {
            // button.style.background = "var(--surface-tertiary, rgba(255,255,255,0.06))";
            button.style.color = "var(--text-muted, #d1d5dba2)";
        });
        button.addEventListener("mousedown", () => {
            button.style.transform = "scale(0.97)";
        });
        button.addEventListener("mouseup", () => {
            button.style.transform = "scale(1)";
        });

        const icon = document.createElement("span");
        icon.setAttribute("aria-hidden", "true");
        Object.assign(icon.style, {
            display: "inline-flex",
            alignItems: "center",
        });
        icon.appendChild(createArrowUpIcon());

        const label = document.createElement("span");
        label.className = `${CSS_PREFIX}-load-more-label`;

        button.append(icon, label);
        button.addEventListener("click", this.handleClick);
        wrapper.appendChild(button);

        logger.debug("load more button created");
        return wrapper;
    }

    private updateLabel(): void {
        const label = this.container?.querySelector<HTMLElement>(
            `.${CSS_PREFIX}-load-more-label`,
        );
        if (label) {
            label.textContent = `Load more (${this.hiddenCount / 2} hidden)`;
        }
    }

    private readonly handleClick = (e: MouseEvent): void => {
        e.preventDefault();
        e.stopPropagation();
        this.onLoadMore();
    };
}

export class StatusIndicator {
    private container: HTMLElement | null = null;
    private label: HTMLElement | null = null;

    constructor() { }

    /**
     * Updates the displayed counts. Creates the indicator if needed.
     */
    update(hidden: number, total: number): void {
        if (!this.container) this.mount();
        if (this.label) {
            this.label.textContent = `${hidden} hidden · ${total} total`;
        }
    }

    hide(): void {
        this.container?.remove();
        this.container = null;
        this.label = null;
    }

    destroy(): void {
        this.hide();
    }

    private mount(): void {
        this.container = document.createElement("div");
        this.container.className = `${CSS_PREFIX}-status-indicator`;
        this.container.setAttribute("role", "status");
        this.container.setAttribute("aria-live", "polite");

        Object.assign(this.container.style, {
            position: "fixed",
            top: "8px",
            right: "16px",
            zIndex: "10000",
            padding: "4px 10px",
            borderRadius: "6px",
            fontSize: "11px",
            fontWeight: "500",
            fontFamily:
                '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
            color: "var(--text-secondary, #9ca3af)",
            background: "var(--surface-secondary, rgba(0,0,0,0.6))",
            backdropFilter: "blur(8px)",
            border: "1px solid var(--border-light, rgba(255,255,255,0.06))",
            pointerEvents: "none",
            userSelect: "none",
            opacity: "0.85",
        } satisfies Partial<CSSStyleDeclaration>);

        this.label = document.createElement("span");
        this.label.className = `${CSS_PREFIX}-status-label`;
        this.container.appendChild(this.label);

        document.body.appendChild(this.container);
        logger.debug("status indicator mounted");
    }
}
