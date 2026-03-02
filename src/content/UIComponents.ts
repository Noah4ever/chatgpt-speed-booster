import { CSS_PREFIX } from "../shared/constants";
import { logger } from "../shared/logger";
import { MessageMeta } from "../shared/types";

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
    private ticking = false;
    private el: HTMLElement;
    private scrollRoot: HTMLElement | null = null;
    private label: HTMLElement | null = null;
    private suffix = "th";
    private labelUpdateTimer: ReturnType<typeof setTimeout> | null = null;
    private prev: number = 0; // To store the previous index for edge-cases
    private prev2: number = 0;
    private indicatorHalfHeight = 0;
    private thumbMonitorTimer: ReturnType<typeof setInterval> | null = null;
    private lastScrollTop = -1;
    private lastScrollHeight = -1;
    private lastClientHeight = -1;
    private readonly getMessagePositions: () => MessageMeta[];
    private readonly scrollContainerSelector: string;

    constructor(scrollContainerSelector: string, getMessagePositions: () => MessageMeta[]) {
        this.scrollContainerSelector = scrollContainerSelector;
        this.getMessagePositions = getMessagePositions;
        this.el = document.createElement("div");
        this.onScroll = this.onScroll.bind(this);
    }

    show(visible: number, current: number): void {
        if (!this.container) {
            this.initStatus();
        }

        this.suffix = this.getOrdinalSuffix(current);

        if (this.label) {
            this.label.textContent = `${current}${this.suffix} of ${visible} msgs`;
        }
    }

    getOrdinalSuffix(n: number): string {
        const lastTwo = n % 100;
        if (lastTwo >= 11 && lastTwo <= 13) return "th";

        switch (n % 10) {
            case 1:
                return "st";
            case 2:
                return "nd";
            case 3:
                return "rd";
            default:
                return "th";
        }
    }

    hide(): void {
        this.scrollRoot?.removeEventListener("scroll", this.onScroll);
        this.stopThumbMonitor();
        if (this.labelUpdateTimer) {
            clearTimeout(this.labelUpdateTimer);
            this.labelUpdateTimer = null;
        }
        this.container?.remove();
        this.container = null;
    }

    destroy(): void {
        this.hide();
    }

    // Lazily creates and mounts the status indicator, then wires scroll tracking once.
    initStatus(): void {
        if (!this.container) {
            this.container = this.createElement();
            document.body.appendChild(this.container);

            this.initScrollRoot();
            this.scrollRoot?.addEventListener("scroll", this.onScroll);
            this.startThumbMonitor();
            this.label = this.container.querySelector<HTMLElement>(
                `.${CSS_PREFIX}-status-label`,
            );
            this.scheduleLabelUpdate(); // initial position
        }
    }

    private createElement(): HTMLElement {
        this.el.className = `${CSS_PREFIX}-status-indicator`;
        this.el.setAttribute("role", "status");
        this.el.setAttribute("aria-live", "polite");

        Object.assign(this.el.style, {
            position: "fixed",
            right: "15px",
            zIndex: "10000",
            padding: "6px 12px",
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

        const label = document.createElement("span");
        label.className = `${CSS_PREFIX}-status-label`;
        this.el.appendChild(label);

        return this.el;
    }

    private initScrollRoot() {
        const candidate =
            document.querySelector<HTMLElement>(this.scrollContainerSelector) ??
            document.querySelector<HTMLElement>("[data-scroll-root]");
        if (!candidate) return;

        // The configured selector may point to a wrapper that doesn't scroll
        // itself (e.g. ChatGPT's <main>). Walk descendants to find the element
        // that actually overflows vertically.
        this.scrollRoot = this.findActualScroller(candidate) ?? candidate;
    }

    /**
     * Walks the candidate and its descendants (BFS, max 2 levels) to find an
     * element whose scrollHeight exceeds clientHeight — the actual scroller.
     */
    private findActualScroller(root: HTMLElement): HTMLElement | null {
        if (root.scrollHeight > root.clientHeight + 1) return root;
        const queue: HTMLElement[] = Array.from(root.children).filter(
            (c): c is HTMLElement => c instanceof HTMLElement,
        );
        for (const child of queue) {
            if (child.scrollHeight > child.clientHeight + 1) return child;
            for (const grandchild of child.children) {
                if (
                    grandchild instanceof HTMLElement &&
                    grandchild.scrollHeight > grandchild.clientHeight + 1
                ) {
                    return grandchild;
                }
            }
        }
        return null;
    }

    private onScroll() {
        this.scheduleLabelUpdate();
        if (!this.ticking) {
            requestAnimationFrame(() => this.updatePosition());
            this.ticking = true;
        }
    }

    /**
     * Starts a lightweight polling fallback so indicator state also updates when
     * content growth moves the scrollbar thumb without emitting a scroll event.
     */
    private startThumbMonitor(): void {
        if (this.thumbMonitorTimer || !this.scrollRoot) return;
        this.cacheThumbMetrics();
        this.thumbMonitorTimer = setInterval(() => {
            if (!this.scrollRoot) return;
            if (!this.didThumbMetricsChange()) return;
            this.cacheThumbMetrics();
            this.updatePosition();
            this.scheduleLabelUpdate();
        }, 120);
    }

    private stopThumbMonitor(): void {
        if (this.thumbMonitorTimer) {
            clearInterval(this.thumbMonitorTimer);
            this.thumbMonitorTimer = null;
        }
    }

    /**
     * Detects thumb movement from either user scroll or passive layout/content changes.
     */
    private didThumbMetricsChange(): boolean {
        if (!this.scrollRoot) return false;
        return (
            this.scrollRoot.scrollTop !== this.lastScrollTop ||
            this.scrollRoot.scrollHeight !== this.lastScrollHeight ||
            this.scrollRoot.clientHeight !== this.lastClientHeight
        );
    }

    private cacheThumbMetrics(): void {
        if (!this.scrollRoot) return;
        this.lastScrollTop = this.scrollRoot.scrollTop;
        this.lastScrollHeight = this.scrollRoot.scrollHeight;
        this.lastClientHeight = this.scrollRoot.clientHeight;
    }

    // Repositions the floating status indicator to track the scrollbar thumb center.
    updatePosition() {
        try {
            if (!this.scrollRoot) return;

            const scrollTop = this.scrollRoot.scrollTop;
            const viewport = this.scrollRoot.clientHeight;
            const content = this.scrollRoot.scrollHeight;

            if (content <= 0) return;
            if (!this.indicatorHalfHeight) {
                this.indicatorHalfHeight = this.el.offsetHeight / 2;
            }

            // Equivalent thumb center
            const thumbCenter =
                (viewport * (scrollTop + viewport / 2)) / content;
            const y = thumbCenter - this.indicatorHalfHeight;
            this.el.style.top = `${y}px`;
        } finally {
            this.ticking = false;
        }
    }

    /**
     * Defers expensive index text recomputation until scroll/geometry activity settles.
     */
    scheduleLabelUpdate(): void {
        if (this.labelUpdateTimer) {
            clearTimeout(this.labelUpdateTimer);
        }
        this.labelUpdateTimer = setTimeout(() => {
            this.labelUpdateTimer = null;
            this.updateCurrentLabel();
        }, 100);
    }

    /**
     * Derives and renders the textual status from cached assistant-message bounds.
     */
    private updateCurrentLabel(): void {
        if (!this.scrollRoot || !this.label) return;
        const messagePositions = this.getMessagePositions();
        const visible = messagePositions.length;
        const current = this.getCurrentVisibleIndex(messagePositions);
        if (current == 0 || visible == 0)
            setTimeout(() => {
                this.updateCurrentLabel(); // Loop until none of them are 0
            }, 100);
        this.suffix = this.getOrdinalSuffix(current);
        this.label.textContent = `${current}${this.suffix} of ${visible} msgs`;
    }

    /**
     * Binary-searches visible message bounds to find the last message intersecting
     * the viewport. Returns a 1-based index for user-facing display.
     */
    getCurrentVisibleIndex(messagePositions: MessageMeta[]): number {
        if (!this.scrollRoot) return 0;

        const scrollTop = this.scrollRoot.scrollTop;
        const viewportBottom = scrollTop + this.scrollRoot.clientHeight;

        let left = 0;
        let right = messagePositions.length - 1;
        let result = 0;

        while (left <= right) {
            const mid = (left + right) >> 1;
            const { top, bottom } = messagePositions[mid];

            if (bottom > scrollTop && top < viewportBottom) {
                result = mid + 1;
                left = mid + 1;
            } else if (top >= viewportBottom) {
                right = mid - 1;
            } else {
                left = mid + 1;
            }
        }

        //Edge-case correction; for when the visible message is the user prompt only.
        if (result === 0 && this.prev !== 0) {
            const direction =
                this.prev > this.prev2 ? 1 : this.prev < this.prev2 ? -1 : 0;
            result = this.prev + direction;
            if (result < 1) result = 1;
            else if (result > messagePositions.length)
                result = messagePositions.length;
        }

        if (result !== 0) {
            this.prev2 = this.prev;
            this.prev = result;
        }

        return result;
    }
}
