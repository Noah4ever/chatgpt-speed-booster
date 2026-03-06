/**
 * Fetch Interceptor — runs in the MAIN world (same JS context as the page).
 *
 * It monkey-patches window.fetch so that conversation-loading API responses are
 * trimmed *before* the application's framework (React / Svelte / etc.) ever
 * sees them.  This is fundamentally faster than render-then-hide because the
 * framework never creates DOM for the removed messages.
 *
 * Settings are read from localStorage (written by the isolated-world
 * settingsBridge content script).  Site-specific interception rules are
 * embedded at build time from sites.config.json.
 */

import sitesConfig from "../../sites.config.json";

declare const __DEV__: boolean;

// ---------------------------------------------------------------------------
// Types (declared inline — this file must not import chrome-referencing modules)
// ---------------------------------------------------------------------------

interface BridgeSettings {
    enabled: boolean;
    fetchInterceptEnabled: boolean;
    visibleMessageLimit: number;
    loadMoreBatchSize: number;
}

interface TreeWalkConfig {
    nodesKey: string;
    currentNodeKey: string;
    rootKey: string;
    parentPointer: string;
    childrenKey: string;
    messageKey: string;
    roleAccessor: string;
    visibleRoles: string[];
}

interface ArraySliceConfig {
    messagesKey: string;
    roleKey: string;
    visibleRoles: string[];
    keepInitial?: number;
}

interface SiteFetchIntercept {
    urlMatch: string;
    urlExclude: string[];
    method: string;
    strategy: "tree-walk" | "array-slice";
    treeWalk?: TreeWalkConfig;
    arraySlice?: ArraySliceConfig;
}

interface SiteEntry {
    id: string;
    name: string;
    hostnames: string[];
    fetchIntercept?: SiteFetchIntercept;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BRIDGE_KEY = "acsb_bridge_config";
const PREFIX = "[ACSB Fetch]";
/**
 * DOM attribute on <html> set by the interceptor when it trims a response.
 * Read by the content script (ISOLATED world).  Using a DOM attribute instead
 * of localStorage because the DOM is shared instantly between MAIN and ISOLATED
 * worlds, whereas localStorage writes from MAIN are not always visible in
 * ISOLATED world synchronously.
 */
const TRIMMED_ATTR = "data-acsb-trimmed";
/** One-shot: content script sets this before reload to skip trimming once. */
const BYPASS_KEY = "acsb_skip_trim_once";

/**
 * How many "Load More" clicks worth of extra messages to keep in the response.
 * 10 rounds × batch-size 3 × 2 (×2 turn convention) = 66 API msgs = 33 turns.
 * Aggressively trims large chats while keeping ~33 turns for scrolling.
 * When the user exhausts these, a "Load full conversation" button reloads
 * with trimming bypassed.
 */
const BUFFER_ROUNDS = 10;

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

(function initFetchInterceptor(): void {
    // Guard against double-patching (script may be injected multiple times)
    if ((window as unknown as Record<string, unknown>).__ACSB_FETCH_PATCHED__) return;
    (window as unknown as Record<string, unknown>).__ACSB_FETCH_PATCHED__ = true;

    // Detect current site from embedded config
    const hostname = window.location.hostname;
    const site = (sitesConfig as unknown as SiteEntry[]).find((s) =>
        s.hostnames?.some(
            (h: string) => hostname === h || hostname.endsWith(`.${h}`),
        ),
    );

    if (!site?.fetchIntercept) {
        if (__DEV__) console.debug(PREFIX, "no fetch intercept config for", hostname);
        return;
    }

    const ic = site.fetchIntercept;
    const originalFetch = window.fetch;

    if (__DEV__) console.debug(PREFIX, "patching window.fetch for", site.name);

    window.fetch = async function patchedFetch(
        input: RequestInfo | URL,
        init?: RequestInit,
    ): Promise<Response> {
        // Resolve URL string
        const url =
            typeof input === "string"
                ? input
                : input instanceof URL
                    ? input.toString()
                    : input.url;

        const method = (
            init?.method ??
            (input instanceof Request ? input.method : "GET")
        ).toUpperCase();

        // ── Fast-path: not a conversation-loading request ──────────────
        if (
            method !== ic.method.toUpperCase() ||
            !url.includes(ic.urlMatch)
        ) {
            return originalFetch.call(this, input, init);
        }

        if (ic.urlExclude?.some((ex) => url.includes(ex))) {
            return originalFetch.call(this, input, init);
        }

        // ── Check user settings ────────────────────────────────────────
        const settings = readSettings();
        if (!settings.enabled || !settings.fetchInterceptEnabled) {
            return originalFetch.call(this, input, init);
        }

        // One-shot bypass: content script requested a full reload
        if (localStorage.getItem(BYPASS_KEY) === "true") {
            localStorage.removeItem(BYPASS_KEY);
            document.documentElement.removeAttribute(TRIMMED_ATTR);
            if (__DEV__) console.debug(PREFIX, "one-shot bypass active, skipping trim");
            return originalFetch.call(this, input, init);
        }

        // The fetch limit keeps extra messages beyond the visible limit
        // so the content script can reveal them with "Load More".
        // Multiply by 2 because the content script's MessageManager treats
        // each conversation "turn" as 2 DOM elements (user + assistant),
        // using visibleMessageLimit * 2 for its internal limit.  Keeping
        // an even number of API messages prevents fractional display counts.
        const fetchLimit = (settings.visibleMessageLimit
            + (settings.loadMoreBatchSize * BUFFER_ROUNDS)) * 2;

        if (__DEV__) console.debug(PREFIX, "intercepting", method, url,
            `(fetchLimit=${fetchLimit})`);

        // ── Fetch & intercept ──────────────────────────────────────────
        const response = await originalFetch.call(this, input, init);
        if (!response.ok) return response;

        try {
            // Clone so we can still return the original on failure
            const clone = response.clone();
            let text = await clone.text();

            // Strip BOM if present
            if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

            const data = JSON.parse(text);
            const trimmed = applyStrategy(
                data,
                ic,
                fetchLimit,
            );

            if (!trimmed) {
                if (__DEV__) console.debug(PREFIX, "no trimming needed");
                document.documentElement.removeAttribute(TRIMMED_ATTR);
                return response;
            }

            // Signal to the content script that messages were removed.
            // Uses a DOM attribute on <html> because it's shared instantly
            // between MAIN and ISOLATED worlds (localStorage is not reliable
            // for MAIN→ISOLATED communication).
            document.documentElement.setAttribute(TRIMMED_ATTR, "true");

            if (__DEV__) console.debug(PREFIX, "response trimmed successfully");
            return buildResponse(response, JSON.stringify(trimmed));
        } catch (err) {
            if (__DEV__) console.warn(PREFIX, "intercept failed, returning original", err);
            return response;
        }
    };

    // -------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------

    function readSettings(): BridgeSettings {
        try {
            const raw = localStorage.getItem(BRIDGE_KEY);
            if (raw) return JSON.parse(raw) as BridgeSettings;
        } catch {
            /* corrupted / unavailable — use defaults */
        }
        return {
            enabled: true,
            fetchInterceptEnabled: true,
            visibleMessageLimit: 3,
            loadMoreBatchSize: 3,
        };
    }

    function buildResponse(original: Response, body: string): Response {
        const headers = new Headers(original.headers);
        headers.set("content-type", "application/json; charset=utf-8");
        headers.delete("content-length"); // size changed
        headers.delete("content-encoding"); // no longer compressed

        const res = new Response(body, {
            status: original.status,
            statusText: original.statusText,
            headers,
        });
        Object.defineProperty(res, "url", { value: original.url });
        return res;
    }

    // -------------------------------------------------------------------
    // Strategy dispatcher
    // -------------------------------------------------------------------

    function applyStrategy(
        data: Record<string, unknown>,
        config: SiteFetchIntercept,
        limit: number,
    ): Record<string, unknown> | null {
        if (config.strategy === "tree-walk" && config.treeWalk) {
            return trimTreeWalk(data, config.treeWalk, limit);
        }
        if (config.strategy === "array-slice" && config.arraySlice) {
            return trimArraySlice(data, config.arraySlice, limit);
        }
        return null;
    }

    // -------------------------------------------------------------------
    // Utility: access nested property by dot-path ("author.role")
    // -------------------------------------------------------------------

    function getNestedValue(obj: unknown, path: string): unknown {
        const parts = path.split(".");
        let current: unknown = obj;
        for (const part of parts) {
            if (current == null || typeof current !== "object") return undefined;
            current = (current as Record<string, unknown>)[part];
        }
        return current;
    }

    // -------------------------------------------------------------------
    // Tree-walk strategy (ChatGPT-style mapping tree)
    // -------------------------------------------------------------------

    function isVisibleNode(
        node: Record<string, unknown>,
        tc: TreeWalkConfig,
    ): boolean {
        const msg = node[tc.messageKey];
        if (!msg) return false;
        const role = getNestedValue(msg, tc.roleAccessor);
        return typeof role === "string" && tc.visibleRoles.includes(role);
    }

    function trimTreeWalk(
        data: Record<string, unknown>,
        tc: TreeWalkConfig,
        limit: number,
    ): Record<string, unknown> | null {
        const mapping = data[tc.nodesKey] as
            | Record<string, Record<string, unknown>>
            | undefined;
        const currentNodeId = data[tc.currentNodeKey] as string | undefined;

        if (!mapping || !currentNodeId || !mapping[currentNodeId]) return null;

        // Build the linear chain from current_node → root via parent pointers
        const chain: string[] = [];
        let nid: string | null = currentNodeId;
        const visited = new Set<string>();

        while (nid && mapping[nid] && !visited.has(nid)) {
            visited.add(nid);
            chain.push(nid);
            nid = (mapping[nid][tc.parentPointer] as string | null) ?? null;
        }

        chain.reverse(); // chain[0] = root ancestor, chain[last] = current_node

        // Count visible messages in the chain
        let totalVisible = 0;
        for (const id of chain) {
            if (isVisibleNode(mapping[id], tc)) totalVisible++;
        }

        if (totalVisible <= limit) return null; // nothing to trim

        if (__DEV__)
            console.debug(
                PREFIX,
                `tree-walk: ${totalVisible} visible → keeping last ${limit}`,
            );

        // Walk from end, count visible messages, find the cutoff index
        let count = 0;
        let cutoff = 0;
        for (let i = chain.length - 1; i >= 0; i--) {
            if (isVisibleNode(mapping[chain[i]], tc)) {
                count++;
                if (count >= limit) {
                    cutoff = i;
                    break;
                }
            }
        }

        // Kept set: system/metadata nodes before cutoff + everything from cutoff on
        const kept = new Set<string>();
        for (let i = 0; i < cutoff; i++) {
            if (!isVisibleNode(mapping[chain[i]], tc)) kept.add(chain[i]);
        }
        for (let i = cutoff; i < chain.length; i++) {
            kept.add(chain[i]);
        }

        // Ordered kept chain (preserves root → current direction)
        const keptChain = chain.filter((id) => kept.has(id));

        // Build trimmed mapping with reconnected parent/children pointers
        const newMapping: Record<string, Record<string, unknown>> = {};
        for (let i = 0; i < keptChain.length; i++) {
            const id = keptChain[i];
            // Deep-clone the node to avoid mutating the original response data
            const node = JSON.parse(
                JSON.stringify(mapping[id]),
            ) as Record<string, unknown>;
            node[tc.parentPointer] = i > 0 ? keptChain[i - 1] : null;
            node[tc.childrenKey] =
                i < keptChain.length - 1 ? [keptChain[i + 1]] : [];
            newMapping[id] = node;
        }

        const result = { ...data };
        result[tc.nodesKey] = newMapping;
        if (tc.rootKey)
            result[tc.rootKey] = keptChain[0] ?? currentNodeId;

        return result;
    }

    // -------------------------------------------------------------------
    // Array-slice strategy (Claude-style flat message array)
    // -------------------------------------------------------------------

    function trimArraySlice(
        data: Record<string, unknown>,
        ac: ArraySliceConfig,
        limit: number,
    ): Record<string, unknown> | null {
        const messages = data[ac.messagesKey] as
            | Record<string, unknown>[]
            | undefined;
        if (!Array.isArray(messages)) return null;

        // Find indices of visible messages
        const visibleIndices: number[] = [];
        for (let i = 0; i < messages.length; i++) {
            const role = getNestedValue(messages[i], ac.roleKey);
            if (typeof role === "string" && ac.visibleRoles.includes(role))
                visibleIndices.push(i);
        }

        if (visibleIndices.length <= limit) return null;

        if (__DEV__)
            console.debug(
                PREFIX,
                `array-slice: ${visibleIndices.length} visible → keeping last ${limit}`,
            );

        const keepFromIdx =
            visibleIndices[visibleIndices.length - limit];
        const keepInitial = ac.keepInitial ?? 0;

        const newMessages: Record<string, unknown>[] = [];
        const added = new Set<number>();

        // Preserve initial messages (system prompts, etc.)
        for (let i = 0; i < Math.min(keepInitial, messages.length); i++) {
            if (i < keepFromIdx) {
                newMessages.push(messages[i]);
                added.add(i);
            }
        }

        // Keep messages from the cutoff onwards
        for (let i = keepFromIdx; i < messages.length; i++) {
            if (!added.has(i)) {
                newMessages.push(messages[i]);
            }
        }

        const result = { ...data };
        result[ac.messagesKey] = newMessages;
        return result;
    }
})();
