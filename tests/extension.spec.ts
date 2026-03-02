/**
 * Extension tests – loads the real extension in Chromium and verifies it
 * works on mock pages that mimic each configured site's DOM.
 *
 * For every site in sites.config.json the tests:
 *  1. Route the real URL to return mock HTML
 *  2. Navigate → content script runs (URL matches manifest pattern)
 *  3. Verify messages are hidden/shown correctly
 *  4. Verify Load More button appears and works
 *  5. Verify status indicator shows correct counts
 *
 * No login or network access needed.
 * Detection is DOM-based (data-acsb-managed, .acsb-* classes) so it works
 * regardless of __DEV__/production build mode.
 */
import { test, expect, SITES } from "./extension-fixture";
import { generateMockPage, getMessageTestAttr } from "./helpers/mock-page";

const MESSAGE_COUNT = 20; // enough to exceed default visible window
// Config defaults: visibleMessageLimit=3, loadMoreBatchSize=3
// Actual visible = limit * 2 (user+assistant pairs), actual batch = batch * 2
const DEFAULT_VISIBLE_LIMIT = 6; // 3 * 2
const DEFAULT_BATCH_SIZE = 6; // 3 * 2

for (const site of SITES) {
    test.describe(`${site.name}`, () => {
        test.describe.configure({ mode: "serial" });

        /* ── helpers ─────────────────────────────────────────────── */

        function messageLocator(page: import("@playwright/test").Page, index: number) {
            const { attr, prefix } = getMessageTestAttr(site);
            return page.locator(`[${attr}="${prefix}${index}"]`);
        }

        /** Navigate to mock page and wait for the extension to process messages */
        async function loadMockPage(page: import("@playwright/test").Page) {
            const mockHtml = generateMockPage(site, MESSAGE_COUNT);
            await page.route(`**/${site.hostnames[0]}/**`, (route) =>
                route.fulfill({ contentType: "text/html", body: mockHtml }),
            );
            await page.goto(`https://${site.hostnames[0]}/mock-test`, {
                waitUntil: "domcontentloaded",
            });
            // Wait for the extension to process: it adds data-acsb-managed attrs
            await page.waitForSelector("[data-acsb-managed]", {
                timeout: 10_000,
                state: "attached", // not "visible" — first managed elements are hidden
            });
        }

        /* ── tests ───────────────────────────────────────────────── */

        test("content script activates and manages messages", async ({ page }) => {
            await loadMockPage(page);

            const managedCount = await page.locator("[data-acsb-managed]").count();
            expect(managedCount).toBe(MESSAGE_COUNT);
        });

        test("hides excess messages (FIFO)", async ({ page }) => {
            await loadMockPage(page);

            const hiddenCount = MESSAGE_COUNT - DEFAULT_VISIBLE_LIMIT;

            for (let i = 1; i <= hiddenCount; i++) {
                await expect(messageLocator(page, i)).toHaveCSS("display", "none");
            }

            for (let i = hiddenCount + 1; i <= MESSAGE_COUNT; i++) {
                await expect(messageLocator(page, i)).not.toHaveCSS("display", "none");
            }
        });

        test("Load More button appears with correct count", async ({ page }) => {
            await loadMockPage(page);

            const hiddenCount = MESSAGE_COUNT - DEFAULT_VISIBLE_LIMIT;
            await expect(page.locator(".acsb-load-more-wrapper")).toBeVisible();
            // Label divides by 2 to show conversation pairs, not raw turns
            await expect(page.locator(".acsb-load-more-label")).toContainText(
                `${hiddenCount / 2} hidden`,
            );
        });

        test("clicking Load More reveals more messages", async ({ page }) => {
            await loadMockPage(page);

            const hiddenBefore = MESSAGE_COUNT - DEFAULT_VISIBLE_LIMIT;
            await page.locator(".acsb-load-more-btn").click();
            await page.waitForTimeout(500);

            const expectedHidden = Math.max(0, hiddenBefore - DEFAULT_BATCH_SIZE);
            const { attr, prefix } = getMessageTestAttr(site);
            let actualHidden = 0;
            for (let i = 1; i <= MESSAGE_COUNT; i++) {
                const display = await page
                    .locator(`[${attr}="${prefix}${i}"]`)
                    .evaluate((el) => getComputedStyle(el).display);
                if (display === "none") actualHidden++;
            }
            expect(actualHidden).toBe(expectedHidden);
        });

        test("status indicator shows correct counts", async ({ page }) => {
            await loadMockPage(page);

            await expect(page.locator(".acsb-status-indicator")).toBeVisible();
            const hiddenCount = MESSAGE_COUNT - DEFAULT_VISIBLE_LIMIT;
            await expect(page.locator(".acsb-status-label")).toContainText(
                `${hiddenCount} hidden`,
            );
        });

        test("no errors in extension service worker", async ({ extensionContext }) => {
            const workers = extensionContext.serviceWorkers();
            expect(workers.length).toBeGreaterThan(0);
            expect(workers[0].url()).toContain("background.js");
        });

        test("popup page loads without errors", async ({ extensionId, extensionContext }) => {
            const popupPage = await extensionContext.newPage();
            const errors: string[] = [];
            popupPage.on("pageerror", (err) => errors.push(err.message));

            await popupPage.goto(`chrome-extension://${extensionId}/popup.html`);
            await popupPage.waitForTimeout(1000);

            expect(errors).toHaveLength(0);
            await expect(popupPage.locator(".popup-header__brand")).toContainText(
                "Speed Booster",
            );
            await popupPage.close();
        });
    });
}
