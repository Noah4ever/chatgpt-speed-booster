/**
 * Generates mock HTML pages for each site based on sites.config.json.
 *
 * The HTML matches the selectors defined in the config so the extension's
 * content script can find and manage the mock messages exactly like it
 * would on the real site.
 */
import type { SiteConfig } from "../extension-fixture";

/*  selector parsing helpers  */

interface ParsedAttr {
    tag: string;
    attrName: string;
    prefix: string;
}

/**
 * Parses selectors like  [data-testid^="conversation-turn-"]
 * into { tag: "div", attrName: "data-testid", prefix: "conversation-turn-" }
 */
function parseMessageSelector(selector: string): ParsedAttr {
    // Use the first part before any comma (comma-separated compound selectors)
    const firstPart = selector.split(",")[0].trim();
    // Match hyphenated custom element names (e.g. user-query, infinite-scroller)
    const tagMatch = firstPart.match(/^([a-z][a-z0-9-]*)/i);
    const tag = tagMatch ? tagMatch[1] : "div";

    const attrMatch = selector.match(/\[([a-z-]+)\^="([^"]+)"\]/i);
    if (attrMatch) {
        return { tag, attrName: attrMatch[1], prefix: attrMatch[2] };
    }

    // Fallback: use the whole selector as a class
    return { tag, attrName: "data-mock-id", prefix: "msg-" };
}

/**
 * Returns the attribute name and value prefix used to address individual
 * mock messages in tests.  Must stay in sync with generateMessageHtml().
 */
export function getMessageTestAttr(site: SiteConfig): { attr: string; prefix: string } {
    switch (site.id) {
        case "chatgpt":
            return { attr: "data-turn-id", prefix: "msg-" };
        case "claude":
            return { attr: "data-test-render-count", prefix: "" };
        case "gemini":
            return { attr: "data-mock-id", prefix: "msg-" };
        default: {
            const parsed = parseMessageSelector(site.selectors.messageTurn);
            return { attr: parsed.attrName, prefix: parsed.prefix };
        }
    }
}

/**
 * Turns a simple CSS selector part into an opening HTML tag.
 * Handles: tag, [attr*="val"], [attr^="val"], .class
 */
function selectorToOpenTag(selector: string): string {
    // Match hyphenated custom element names (e.g. infinite-scroller)
    const tagMatch = selector.match(/^([a-z][a-z0-9-]*)/i);
    const tag = tagMatch ? tagMatch[1] : "div";
    const attrs: string[] = [];

    // [class*="value"] or [attr*="value"]
    const attrRegex = /\[([a-z-]+)[*^~]?="([^"]+)"\]/gi;
    let m: RegExpExecArray | null;
    while ((m = attrRegex.exec(selector)) !== null) {
        const [, name, value] = m;
        attrs.push(`${name}="${value}-mock"`);
    }

    // .classname
    const classMatches = selector.match(/\.([a-zA-Z0-9_-]+)/g);
    if (classMatches && !attrs.some((a) => a.startsWith("class="))) {
        attrs.push(`class="${classMatches.map((c) => c.slice(1)).join(" ")}"`);
    }

    return `<${tag}${attrs.length ? " " + attrs.join(" ") : ""}>`;
}

/*  site-specific message HTML generators  */

function generateMessageHtml(site: SiteConfig, idx: number): string {
    switch (site.id) {
        case "chatgpt":
            // <section data-testid="conversation-turn-N"> with data-turn-id for
            // unique identification — matches section[data-testid^="conversation-turn-"]
            return [
                `        <section data-testid="conversation-turn-${idx}" data-turn-id="msg-${idx}" data-turn="${idx % 2 ? "user" : "assistant"}">`,
                `            <div data-message-author-role="${idx % 2 ? "user" : "assistant"}" data-message-id="msg-${idx}">`,
                `                <p>Mock message ${idx} on ${site.name}</p>`,
                `            </div>`,
                `        </section>`,
            ].join("\n");

        case "claude":
            // <div data-test-render-count> — matches [data-test-render-count]
            return [
                `        <div data-test-render-count="${idx}">`,
                `            <p>Mock message ${idx} on ${site.name}</p>`,
                `        </div>`,
            ].join("\n");

        case "gemini": {
            // Alternating <user-query> / <model-response> — matches "user-query, model-response"
            const tag = idx % 2 === 0 ? "user-query" : "model-response";
            return [
                `        <${tag} data-mock-id="msg-${idx}">`,
                `            <p>Mock message ${idx} on ${site.name}</p>`,
                `        </${tag}>`,
            ].join("\n");
        }

        default: {
            // Generic fallback using selector parsing
            const parsed = parseMessageSelector(site.selectors.messageTurn);
            return [
                `        <${parsed.tag} ${parsed.attrName}="${parsed.prefix}${idx}">`,
                `            <p>Mock message ${idx} on ${site.name}</p>`,
                `        </${parsed.tag}>`,
            ].join("\n");
        }
    }
}

/*  mock page generator  */

export function generateMockPage(site: SiteConfig, messageCount: number): string {
    // Build message elements using site-specific templates
    const messages = Array.from({ length: messageCount }, (_, i) =>
        generateMessageHtml(site, i + 1),
    ).join("\n");

    // Build scroll container wrapping
    const containerParts = site.selectors.scrollContainer.split(">").map((s) => s.trim());
    let wrapped = messages;
    for (let i = containerParts.length - 1; i >= 0; i--) {
        const part = containerParts[i];
        let open = selectorToOpenTag(part);
        // Add data-scroll-root to the innermost scroll container for StatusIndicator
        if (i === containerParts.length - 1) {
            const tag = open.match(/^<([a-z][a-z0-9-]*)/i)?.[1] ?? "div";
            open = open.replace(`<${tag}`, `<${tag} data-scroll-root`);
        }
        const tag = open.match(/^<([a-z][a-z0-9-]*)/i)?.[1] ?? "div";
        wrapped = `    ${open}\n${wrapped}\n    </${tag}>`;
    }

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>${site.name} – Mock Page</title>
    <style>
        body { font-family: sans-serif; margin: 0; padding: 20px; }
        [style*="display: none"] { /* hidden by extension */ }
    </style>
</head>
<body>
<main>
${wrapped}
</main>
</body>
</html>`;
}
