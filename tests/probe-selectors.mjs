#!/usr/bin/env node
/**
 * Probes the actual DOM structure of each configured site to discover
 * which selectors match. Requires a saved auth profile (npm run test:auth).
 *
 * Usage: node tests/probe-selectors.mjs
 */
import { chromium } from "playwright";
import path from "path";
import { readFileSync, existsSync, cpSync, mkdtempSync } from "fs";
import os from "os";

const EXTENSION_PATH = path.resolve("dist", "chrome");
const AUTH_PROFILE = path.resolve("tests", ".auth-profile");
const sites = JSON.parse(readFileSync("sites.config.json", "utf8"));

if (!existsSync(AUTH_PROFILE)) {
    console.error("No auth profile found. Run: npm run test:auth");
    process.exit(1);
}

const userDataDir = mkdtempSync(path.join(os.tmpdir(), "acsb-probe-"));
cpSync(AUTH_PROFILE, userDataDir, { recursive: true });

const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
        "--headless=new",
        "--no-first-run",
        "--no-default-browser-check",
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
    ],
});

for (const site of sites) {
    const url = `https://${site.hostnames[0]}`;
    console.log(`\n${"=".repeat(60)}`);
    console.log(`Probing: ${site.name} (${url})`);
    console.log("=".repeat(60));

    const page = await context.newPage();
    try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
        await page.waitForTimeout(5000);

        const results = await page.evaluate((cfg) => {
            const results = {};

            // Test configured selectors
            results.configuredSelector = cfg.selectors.messageTurn;
            results.matchCount = document.querySelectorAll(cfg.selectors.messageTurn).length;
            results.scrollContainer = !!document.querySelector(cfg.selectors.scrollContainer);
            if (cfg.selectors.scrollContainerAlt) {
                results.scrollContainerAlt = !!document.querySelector(cfg.selectors.scrollContainerAlt);
            }

            // Discover data-testid values
            const testIds = new Set();
            document.querySelectorAll("[data-testid]").forEach((el) => {
                testIds.add(el.getAttribute("data-testid"));
            });
            results.dataTestIds = [...testIds].slice(0, 30);

            // Look for common message-related patterns
            const patterns = [
                "[data-testid]",
                "[class*='message']",
                "[class*='Message']",
                "[class*='msg']",
                "[class*='turn']",
                "[class*='Turn']",
                "[class*='chat']",
                "[class*='Chat']",
                "[class*='response']",
                "[class*='Response']",
                "[class*='conversation']",
                "[class*='Conversation']",
                "[role='presentation']",
                "[role='article']",
                "[role='row']",
                "[role='listitem']",
                "[data-message-id']",
                "[data-index]",
            ];

            results.selectorProbe = {};
            for (const sel of patterns) {
                try {
                    const count = document.querySelectorAll(sel).length;
                    if (count > 0) results.selectorProbe[sel] = count;
                } catch { /* invalid selector */ }
            }

            // Look for scroll containers
            const scrollPatterns = [
                "[class*='overflow-y-auto']",
                "[class*='overflow-auto']",
                "[class*='scroll']",
                "[class*='Scroll']",
                "main [class*='overflow']",
                "[style*='overflow: auto']",
                "[style*='overflow-y: auto']",
                "[style*='overflow-y: scroll']",
            ];

            results.scrollProbe = {};
            for (const sel of scrollPatterns) {
                try {
                    const count = document.querySelectorAll(sel).length;
                    if (count > 0) results.scrollProbe[sel] = count;
                } catch { /* invalid selector */ }
            }

            // Sample first few elements matching common message patterns (class + tag info)
            results.messageCandidates = [];
            for (const sel of ["[data-testid]", "[class*='message']", "[class*='Message']", "[class*='turn']", "[class*='Turn']", "[role='article']"]) {
                try {
                    const els = document.querySelectorAll(sel);
                    for (let i = 0; i < Math.min(els.length, 3); i++) {
                        const el = els[i];
                        results.messageCandidates.push({
                            selector: sel,
                            tag: el.tagName.toLowerCase(),
                            id: el.id || null,
                            class: el.className?.toString().slice(0, 100) || null,
                            dataTestId: el.getAttribute("data-testid") || null,
                            childCount: el.children.length,
                            textLength: (el.textContent || "").length,
                        });
                    }
                } catch { /* invalid selector */ }
            }

            return results;
        }, site);

        console.log(`\nConfigured selector: ${results.configuredSelector}`);
        console.log(`  Matches: ${results.matchCount}`);
        console.log(`  Scroll container: ${results.scrollContainer}`);
        if (results.scrollContainerAlt !== undefined) {
            console.log(`  Scroll container (alt): ${results.scrollContainerAlt}`);
        }

        if (results.dataTestIds.length > 0) {
            console.log(`\ndata-testid values found (first 30):`);
            for (const id of results.dataTestIds) {
                console.log(`  - ${id}`);
            }
        } else {
            console.log(`\nNo data-testid attributes found on page`);
        }

        console.log(`\nSelector probe:`);
        for (const [sel, count] of Object.entries(results.selectorProbe)) {
            console.log(`  ${sel} → ${count}`);
        }

        console.log(`\nScroll container probe:`);
        for (const [sel, count] of Object.entries(results.scrollProbe)) {
            console.log(`  ${sel} → ${count}`);
        }

        if (results.messageCandidates.length > 0) {
            console.log(`\nMessage candidates (sample):`);
            for (const c of results.messageCandidates) {
                console.log(`  ${c.selector} → <${c.tag}> class="${c.class}" data-testid="${c.dataTestId}" children=${c.childCount} textLen=${c.textLength}`);
            }
        }
    } catch (err) {
        console.error(`  Error probing ${site.name}: ${err.message}`);
    } finally {
        await page.close();
    }
}

await context.close();
console.log("\nDone.");
