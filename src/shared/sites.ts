import sitesConfig from "../../sites.config.json";

export interface SiteSelectors {
    readonly messageTurn: string;
    readonly scrollContainer: string;
    readonly scrollContainerAlt?: string;
}

export interface SiteConfig {
    readonly id: string;
    readonly name: string;
    readonly hostnames: readonly string[];
    readonly urlPatterns: readonly string[];
    readonly selectors: SiteSelectors;
    readonly messageIdAttribute?: string;
}

export const SITES: readonly SiteConfig[] = sitesConfig as SiteConfig[];

/**
 * Detect which supported AI chat site the content script is running on.
 * Returns null if the current page is not a supported site.
 */
export function detectCurrentSite(): SiteConfig | null {
    const hostname = window.location.hostname;
    return (
        SITES.find((site) =>
            site.hostnames.some((h) => hostname === h || hostname.endsWith(`.${h}`)),
        ) ?? null
    );
}

/** Collect every URL pattern across all configured sites. */
export function getAllUrlPatterns(): string[] {
    return SITES.flatMap((site) => [...site.urlPatterns]);
}
